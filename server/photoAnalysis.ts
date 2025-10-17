// Real photo analysis service using TensorFlow.js and face-api
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import type { FaceAnalysis, PhotoAnalysisResult } from "@shared/schema";
import { loadImageFromUrl } from './imageLoader.js';
import { createCanvas } from 'canvas';
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
      
      // Use SSD MobileNet for better face detection in group photos
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
      await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);
      
      this.modelsLoaded = true;
      console.log('✅ Face-API models loaded successfully (SSD MobileNet)');
    } catch (error) {
      console.error('❌ Failed to load Face-API models:', error);
      throw error;
    }
  }

  /**
   * Calculate Intersection over Union (IoU) between two bounding boxes
   */
  private calculateIoU(box1: faceapi.Box, box2: faceapi.Box): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = box1.width * box1.height + box2.width * box2.height - intersection;
    
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Remove duplicate face detections based on IoU threshold
   */
  private removeDuplicateFaces(detections: faceapi.WithFaceDetection<{}>[]): faceapi.WithFaceDetection<{}>[] {
    const uniqueDetections: faceapi.WithFaceDetection<{}>[] = [];
    const IoU_THRESHOLD = 0.5; // Faces with >50% overlap are considered duplicates
    
    for (const detection of detections) {
      let isDuplicate = false;
      
      for (const uniqueDetection of uniqueDetections) {
        const iou = this.calculateIoU(detection.detection.box, uniqueDetection.detection.box);
        if (iou > IoU_THRESHOLD) {
          isDuplicate = true;
          // Keep the detection with higher confidence
          if (detection.detection.score > uniqueDetection.detection.score) {
            const index = uniqueDetections.indexOf(uniqueDetection);
            uniqueDetections[index] = detection;
          }
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueDetections.push(detection);
      }
    }
    
    return uniqueDetections;
  }

  /**
   * Multi-scale face detection for better coverage
   * Detects faces at multiple image scales to catch faces of all sizes
   */
  private async multiScaleDetection(
    canvas: any,
    withLandmarksAndExpressions: boolean = false
  ): Promise<any[]> {
    const scales = [1.0, 0.75, 0.5]; // 100%, 75%, 50%
    const allDetections: any[] = [];
    
    for (const scale of scales) {
      const scaledWidth = Math.floor(canvas.width * scale);
      const scaledHeight = Math.floor(canvas.height * scale);
      
      // Create scaled canvas
      const scaledCanvas = createCanvas(scaledWidth, scaledHeight);
      const scaledCtx = scaledCanvas.getContext('2d');
      scaledCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
      
      // Convert to tensor
      const tensor = tf.node.decodeImage(scaledCanvas.toBuffer('image/png'), 3);
      
      try {
        let detections;
        
        if (withLandmarksAndExpressions) {
          detections = await faceapi
            .detectAllFaces(tensor as any, new faceapi.SsdMobilenetv1Options({
              minConfidence: 0.5
            }))
            .withFaceLandmarks()
            .withFaceExpressions();
        } else {
          detections = await faceapi.detectAllFaces(
            tensor as any,
            new faceapi.SsdMobilenetv1Options({
              minConfidence: 0.5
            })
          );
        }
        
        // Scale bounding boxes back to original size
        const scaledDetections = detections.map((detection: any) => {
          const scaledBox = new faceapi.Box({
            x: detection.detection.box.x / scale,
            y: detection.detection.box.y / scale,
            width: detection.detection.box.width / scale,
            height: detection.detection.box.height / scale,
          });
          
          // Create new detection with scaled box
          const scaledDetection = {
            ...detection,
            detection: {
              ...detection.detection,
              box: scaledBox,
            }
          };
          
          // Scale landmarks if present - properly scale each point back to original size
          if (detection.landmarks) {
            const scaledPoints = detection.landmarks.positions.map((point: faceapi.Point) => ({
              x: point.x / scale,
              y: point.y / scale,
            }));
            scaledDetection.landmarks = new faceapi.FaceLandmarks68(scaledPoints, {
              width: canvas.width,
              height: canvas.height,
            });
          }
          
          return scaledDetection;
        });
        
        allDetections.push(...scaledDetections);
      } finally {
        tensor.dispose();
      }
    }
    
    // Remove duplicate detections
    return this.removeDuplicateFaces(allDetections);
  }

  /**
   * Quick face detection only (no full analysis) - for preview before analysis
   */
  async detectFaces(photoUrl: string, photoId: string): Promise<{
    photoId: string;
    faces: Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      confidence: number;
    }>;
  }> {
    await this.loadModels();
    
    try {
      const image = await loadImageFromUrl(photoUrl);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      
      // Use multi-scale detection for comprehensive face coverage
      const detections = await this.multiScaleDetection(canvas, false);
      
      const faces = detections.map((detection) => ({
        boundingBox: {
          x: detection.detection.box.x / canvas.width,
          y: detection.detection.box.y / canvas.height,
          width: detection.detection.box.width / canvas.width,
          height: detection.detection.box.height / canvas.height,
        },
        confidence: detection.detection.score,
      }));
      
      return { photoId, faces };
    } catch (error) {
      console.error(`Error detecting faces in ${photoId}:`, error);
      return { photoId, faces: [] };
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
      
      // Convert Image to Canvas for face-api compatibility
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      
      // Use multi-scale detection with landmarks and expressions for comprehensive analysis
      // Detects faces at 100%, 75%, and 50% scales to catch faces of all sizes
      const detections = await this.multiScaleDetection(canvas, true);

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
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
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
    
    // Threshold: eyes are open if EAR > 0.22 (balanced to reduce both false positives and negatives)
    return ear > 0.22;
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
   * @param faceSelections - Optional face selections per photo: { photoId: { faceIdx: true/false } }
   */
  async analyzeSession(
    photos: { id: string; fileUrl: string }[], 
    faceSelections?: Record<string, Record<number, boolean>>
  ): Promise<{
    analyses: PhotoAnalysisResult[];
    bestPhotoId: string | null;
  }> {
    // Analyze all photos with error handling
    const analyses: PhotoAnalysisResult[] = [];
    
    for (const photo of photos) {
      try {
        const analysis = await this.analyzePhoto(photo.fileUrl, photo.id);
        
        // Apply face exclusions if provided
        if (faceSelections && faceSelections[photo.id]) {
          const photoSelections = faceSelections[photo.id];
          
          // Filter out excluded faces and recalculate quality score
          const includedFaces = analysis.faces.filter((_, idx) => photoSelections[idx] !== false);
          
          if (includedFaces.length > 0) {
            // Recalculate overall quality based on included faces only
            const eyesOpenCount = includedFaces.filter(f => f.attributes.eyesOpen.detected).length;
            const smilingCount = includedFaces.filter(f => f.attributes.smile.detected).length;
            const avgFaceQuality = includedFaces.reduce((sum, f) => sum + f.qualityScore, 0) / includedFaces.length;
            
            const eyesOpenScore = (eyesOpenCount / includedFaces.length) * 40;
            const smilingScore = (smilingCount / includedFaces.length) * 40;
            const faceQualityScore = (avgFaceQuality / 100) * 20;
            
            const overallQualityScore = eyesOpenScore + smilingScore + faceQualityScore;
            
            const closedEyes = includedFaces.length - eyesOpenCount;
            const poorExpressions = includedFaces.filter(f => 
              f.attributes.expression === 'sad' || f.attributes.expression === 'angry'
            ).length;

            let recommendation: 'best' | 'good' | 'acceptable' | 'poor';
            if (overallQualityScore >= 85) recommendation = 'best';
            else if (overallQualityScore >= 70) recommendation = 'good';
            else if (overallQualityScore >= 50) recommendation = 'acceptable';
            else recommendation = 'poor';

            // Update analysis with filtered results
            analysis.faces = includedFaces;
            analysis.overallQualityScore = overallQualityScore;
            analysis.issues = {
              closedEyes,
              poorExpressions,
              blurryFaces: 0,
            };
            analysis.recommendation = recommendation;
          } else {
            // All faces excluded - mark as poor quality with reset issues
            analysis.faces = [];
            analysis.overallQualityScore = 0;
            analysis.issues = {
              closedEyes: 0,
              poorExpressions: 0,
              blurryFaces: 0,
            };
            analysis.recommendation = 'poor';
          }
        }
        
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

    // Find best photo - prioritize eyes open first, then smiles + face quality
    let bestPhotoId: string | null = null;
    let bestEyesOpenCount = -1;
    let bestTiebreakerScore = 0;

    for (const analysis of analyses) {
      const eyesOpenCount = analysis.faces.filter(f => f.attributes.eyesOpen.detected).length;
      
      // Calculate tiebreaker score (smiles + face quality only, excludes eyes open)
      const smilingCount = analysis.faces.filter(f => f.attributes.smile.detected).length;
      const avgFaceQuality = analysis.faces.length > 0
        ? analysis.faces.reduce((sum, f) => sum + f.qualityScore, 0) / analysis.faces.length
        : 0;
      
      const smilingScore = analysis.faces.length > 0 
        ? (smilingCount / analysis.faces.length) * 40 
        : 0;
      const faceQualityScore = (avgFaceQuality / 100) * 20;
      const tiebreakerScore = smilingScore + faceQualityScore;
      
      // Priority 1: Maximum eyes open count
      if (eyesOpenCount > bestEyesOpenCount) {
        bestEyesOpenCount = eyesOpenCount;
        bestTiebreakerScore = tiebreakerScore;
        bestPhotoId = analysis.photoId;
      } 
      // Priority 2: If same eyes open count, use smiles + face quality as tiebreaker
      else if (eyesOpenCount === bestEyesOpenCount && tiebreakerScore > bestTiebreakerScore) {
        bestTiebreakerScore = tiebreakerScore;
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
