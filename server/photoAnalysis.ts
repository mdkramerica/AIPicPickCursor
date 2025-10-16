// Real photo analysis service using TensorFlow.js and face-api
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import type { FaceAnalysis, PhotoAnalysisResult } from "@shared/schema";
import { loadImageFromUrl } from './imageLoader.js';
import path from 'path';

export class PhotoAnalysisService {
  private modelsLoaded = false;
  
  /**
   * Load ML models once at startup
   */
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) return;
    
    try {
      const modelPath = path.join(process.cwd(), 'models');
      
      await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
      await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);
      
      this.modelsLoaded = true;
      console.log('✅ Face-API models loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Face-API models:', error);
      throw error;
    }
  }

  /**
   * Analyze a single photo using real computer vision
   */
  async analyzePhoto(photoUrl: string, photoId: string): Promise<PhotoAnalysisResult> {
    await this.loadModels();
    
    try {
      // Load image from object storage
      const image = await loadImageFromUrl(photoUrl);
      
      // Detect all faces with landmarks and expressions
      const detections = await faceapi
        .detectAllFaces(image as any, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length === 0) {
        // No faces detected - return low quality
        return {
          photoId,
          faces: [],
          overallQualityScore: 0,
          issues: {
            closedEyes: 0,
            poorExpressions: 0,
            blurryFaces: 0,
          },
          recommendation: 'poor',
        };
      }

      // Process each detected face
      const faces: FaceAnalysis[] = detections.map((detection, index) => {
        const landmarks = detection.landmarks;
        const expressions = detection.expressions;
        const box = detection.detection.box;
        
        // Extract eye landmarks
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const mouth = landmarks.getMouth();
        
        // Calculate if eyes are open based on eye aspect ratio (EAR)
        const leftEyeOpen = this.calculateEyeOpenness(leftEye);
        const rightEyeOpen = this.calculateEyeOpenness(rightEye);
        const eyesOpen = leftEyeOpen && rightEyeOpen;
        
        // Detect smile from expressions (happy emotion)
        const smileDetected = expressions.happy > 0.5;
        const smileIntensity = expressions.happy;
        
        // Determine dominant expression
        const expressionEntries = Object.entries(expressions) as [string, number][];
        const dominantExpression = expressionEntries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        // Calculate face quality score
        const eyeScore = eyesOpen ? 40 : 0;
        const smileScore = smileDetected ? 30 : 0;
        const expressionScore = (expressions.happy + expressions.neutral) * 15;
        const detectionScore = detection.detection.score * 15;
        const qualityScore = Math.min(100, eyeScore + smileScore + expressionScore + detectionScore);
        
        // Normalize bounding box to 0-1 range
        const imgWidth = (image as any).width;
        const imgHeight = (image as any).height;
        
        return {
          faceId: `face-${photoId}-${index}`,
          personIndex: index,
          boundingBox: {
            x: box.x / imgWidth,
            y: box.y / imgHeight,
            width: box.width / imgWidth,
            height: box.height / imgHeight,
          },
          landmarks: {
            leftEye: { x: leftEye[0].x / imgWidth, y: leftEye[0].y / imgHeight },
            rightEye: { x: rightEye[0].x / imgWidth, y: rightEye[0].y / imgHeight },
            nose: { x: landmarks.getNose()[0].x / imgWidth, y: landmarks.getNose()[0].y / imgHeight },
            mouthLeft: { x: mouth[0].x / imgWidth, y: mouth[0].y / imgHeight },
            mouthRight: { x: mouth[mouth.length - 1].x / imgWidth, y: mouth[mouth.length - 1].y / imgHeight },
          },
          attributes: {
            eyesOpen: {
              detected: eyesOpen,
              confidence: (leftEyeOpen && rightEyeOpen) ? 0.9 : (leftEyeOpen || rightEyeOpen) ? 0.5 : 0.9,
            },
            smile: {
              detected: smileDetected,
              confidence: expressions.happy,
              intensity: smileIntensity,
            },
            expression: this.mapExpression(dominantExpression),
            headPose: {
              pitch: 0, // Not supported by face-api, would need separate model
              yaw: 0,
              roll: 0,
            },
          },
          qualityScore,
        };
      });

      // Calculate overall photo quality
      const eyesOpenCount = faces.filter(f => f.attributes.eyesOpen.detected).length;
      const smilingCount = faces.filter(f => f.attributes.smile.detected).length;
      const avgFaceQuality = faces.reduce((sum, f) => sum + f.qualityScore, 0) / faces.length;
      
      const eyesOpenScore = (eyesOpenCount / faces.length) * 40;
      const smilingScore = (smilingCount / faces.length) * 40;
      const faceQualityScore = (avgFaceQuality / 100) * 20;
      
      const overallQualityScore = eyesOpenScore + smilingScore + faceQualityScore;

      const closedEyes = faces.length - eyesOpenCount;
      const poorExpressions = faces.filter(f => 
        f.attributes.expression === 'sad' || f.attributes.expression === 'angry'
      ).length;

      let recommendation: 'best' | 'good' | 'acceptable' | 'poor';
      if (overallQualityScore >= 85) recommendation = 'best';
      else if (overallQualityScore >= 70) recommendation = 'good';
      else if (overallQualityScore >= 50) recommendation = 'acceptable';
      else recommendation = 'poor';

      return {
        photoId,
        faces,
        overallQualityScore,
        issues: {
          closedEyes,
          poorExpressions,
          blurryFaces: 0,
        },
        recommendation,
      };
    } catch (error) {
      console.error('Error analyzing photo:', error);
      throw error;
    }
  }

  /**
   * Calculate eye openness using Eye Aspect Ratio (EAR)
   */
  private calculateEyeOpenness(eyePoints: faceapi.Point[]): boolean {
    if (eyePoints.length < 6) return true; // Default to open if not enough points
    
    // Calculate vertical distances
    const vertical1 = this.distance(eyePoints[1], eyePoints[5]);
    const vertical2 = this.distance(eyePoints[2], eyePoints[4]);
    
    // Calculate horizontal distance
    const horizontal = this.distance(eyePoints[0], eyePoints[3]);
    
    // Eye Aspect Ratio (EAR)
    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    
    // Threshold: eyes are open if EAR > 0.2
    return ear > 0.2;
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private distance(p1: faceapi.Point, p2: faceapi.Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Map face-api expression to our schema
   */
  private mapExpression(expression: string): 'happy' | 'neutral' | 'sad' | 'surprised' | 'angry' {
    const mapped: Record<string, 'happy' | 'neutral' | 'sad' | 'surprised' | 'angry'> = {
      happy: 'happy',
      neutral: 'neutral',
      sad: 'sad',
      surprised: 'surprised',
      angry: 'angry',
      fearful: 'surprised',
      disgusted: 'angry',
    };
    return mapped[expression] || 'neutral';
  }

  /**
   * Analyze all photos in a session
   */
  async analyzeSession(photos: { id: string; fileUrl: string }[]): Promise<{
    analyses: PhotoAnalysisResult[];
    bestPhotoId: string | null;
  }> {
    // Analyze all photos with error handling
    const analyses: PhotoAnalysisResult[] = [];
    
    for (const photo of photos) {
      try {
        const analysis = await this.analyzePhoto(photo.fileUrl, photo.id);
        analyses.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze photo ${photo.id}:`, error);
        // Add failed analysis result
        analyses.push({
          photoId: photo.id,
          faces: [],
          overallQualityScore: 0,
          issues: {
            closedEyes: 0,
            poorExpressions: 0,
            blurryFaces: 0,
          },
          recommendation: 'poor',
        });
      }
    }

    // Find best photo (highest quality score)
    let bestPhotoId: string | null = null;
    let bestScore = 0;

    for (const analysis of analyses) {
      if (analysis.overallQualityScore > bestScore) {
        bestScore = analysis.overallQualityScore;
        bestPhotoId = analysis.photoId;
      }
    }

    return {
      analyses,
      bestPhotoId,
    };
  }
}

export const photoAnalysisService = new PhotoAnalysisService();
