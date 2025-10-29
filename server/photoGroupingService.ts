// Photo Grouping Service - AI-powered photo grouping algorithm
import type { Photo, PhotoAnalysisResult, FaceAnalysis } from "@shared/schema";
import { logger } from './middleware/logger';
import { EventEmitter } from 'events';

// Import dependencies using ES6 imports (matching photoAnalysis.ts pattern)
// Use createRequire to bridge CommonJS require() in ES modules for graceful error handling
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let tf: any = null;
let faceapi: any = null;
let createCanvas: any = null;
let loadImageFromUrl: any = null;
let storage: any = null;

// Load dependencies with error handling (using createRequire for ES module compatibility)
try {
  tf = require('@tensorflow/tfjs-node');
  logger.info('TensorFlow.js loaded successfully');
} catch (error) {
  logger.error('Failed to load TensorFlow.js', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

try {
  faceapi = require('@vladmandic/face-api');
  logger.info('Face-api.js loaded successfully');
} catch (error) {
  logger.error('Failed to load Face-api.js', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
  logger.info('Canvas loaded successfully');
} catch (error) {
  logger.error('Failed to load Canvas', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

try {
  loadImageFromUrl = require('./imageLoader.js').loadImageFromUrl;
  logger.info('Image loader loaded successfully');
} catch (error) {
  logger.error('Failed to load image loader', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

try {
  storage = require('./storage.js').storage;
  logger.info('Storage loaded successfully');
} catch (error) {
  logger.error('Failed to load storage', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

export interface GroupingFeatures {
  photoId: string;
  // Temporal features
  timestamp: Date;
  timeDelta?: number; // Time difference from previous photo
  
  // Visual features
  colorHistogram: number[]; // 64-bin RGB histogram
  compositionScore: number; // Rule of thirds, leading lines, etc.
  faceCount: number;
  facePositions: Array<{ x: number; y: number; size: number }>;
  sceneComplexity: number; // Edge density, texture complexity
  
  // Metadata features
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  
  // Existing analysis data
  qualityScore: number;
  faces: FaceAnalysis[];
}

export interface SimilarityMatrix {
  matrix: number[][];
  photoIds: string[];
}

export interface PhotoCluster {
  id: string;
  photoIds: string[];
  confidence: number;
  avgSimilarity: number;
  timeWindow: { start: Date; end: Date };
  dominantFeatures: {
    avgColorHistogram: number[];
    commonAspectRatios: number[];
    avgFaceCount: number;
  };
}

export interface GroupingProgress {
  sessionId: string;
  currentStep: string;
  currentPhoto: number;
  totalPhotos: number;
  percentage: number;
  status: 'extracting_features' | 'calculating_similarity' | 'clustering' | 'creating_groups' | 'complete' | 'error';
  message: string;
  currentPhotoId?: string;
}

export interface GroupingOptions {
  similarityThreshold?: number; // Default: 0.7
  maxGroupSize?: number; // Default: 10
  minGroupSize?: number; // Default: 2
  temporalWeight?: number; // Default: 0.4
  visualWeight?: number; // Default: 0.4
  metadataWeight?: number; // Default: 0.2
  batchSize?: number; // Default: 10
}

export class PhotoGroupingService {
  private progressEmitter = new EventEmitter();
  private readonly DEFAULT_OPTIONS: Required<GroupingOptions> = {
    similarityThreshold: 0.55,  // Lower from 0.7 to 0.55 (55%) for burst photos
    maxGroupSize: 15,           // Increase from 10 to 15 for larger burst sequences
    minGroupSize: 2,
    temporalWeight: 0.5,        // Increase from 0.4 to 0.5 (favor temporal clustering)
    visualWeight: 0.35,         // Decrease from 0.4 to 0.35
    metadataWeight: 0.15,       // Decrease from 0.2 to 0.15
    batchSize: 10,
  };

  /**
   * Check if all required dependencies are available
   */
  checkDependencies(): { available: boolean; missingDependencies: string[] } {
    const missingDependencies: string[] = [];
    
    if (!tf) missingDependencies.push('TensorFlow.js');
    if (!faceapi) missingDependencies.push('Face-api.js');
    if (!createCanvas) missingDependencies.push('Canvas');
    if (!loadImageFromUrl) missingDependencies.push('Image Loader');
    if (!storage) missingDependencies.push('Storage');
    
    return {
      available: missingDependencies.length === 0,
      missingDependencies
    };
  }

  /**
   * Subscribe to grouping progress updates
   */
  onProgress(sessionId: string, callback: (progress: GroupingProgress) => void): () => void {
    const eventName = `grouping_progress:${sessionId}`;
    this.progressEmitter.on(eventName, callback);

    return () => {
      this.progressEmitter.off(eventName, callback);
    };
  }

  /**
   * Emit progress update for a session
   */
  private emitProgress(progress: GroupingProgress): void {
    const eventName = `grouping_progress:${progress.sessionId}`;
    this.progressEmitter.emit(eventName, progress);
  }

  /**
   * Extract comprehensive features from a photo for grouping analysis
   */
  async extractFeatures(photo: Photo, analysisData?: PhotoAnalysisResult): Promise<GroupingFeatures> {
    try {
      // Check if required dependencies are available
      if (!loadImageFromUrl || !createCanvas) {
        logger.warn(`Dependencies not available, using fallback feature extraction for photo ${photo.id}`);
        return this.extractBasicFeatures(photo, analysisData);
      }

      logger.info(`Extracting features for photo ${photo.id}`);
      
      // Load image for visual analysis
      const image = await loadImageFromUrl(photo.fileUrl);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      
      // Extract color histogram (64 bins: 8x8x8 RGB)
      const colorHistogram = await this.extractColorHistogram(canvas);
      
      // Calculate composition score
      const compositionScore = await this.calculateCompositionScore(canvas);
      
      // Calculate scene complexity
      const sceneComplexity = await this.calculateSceneComplexity(canvas);
      
      // Extract face positions from analysis data
      const facePositions = analysisData?.faces.map(face => ({
        x: face.boundingBox.x + face.boundingBox.width / 2,
        y: face.boundingBox.y + face.boundingBox.height / 2,
        size: face.boundingBox.width * face.boundingBox.height,
      })) || [];
      
      const features: GroupingFeatures = {
        photoId: photo.id,
        timestamp: photo.createdAt || new Date(),
        
        // Visual features
        colorHistogram,
        compositionScore,
        faceCount: facePositions.length,
        facePositions,
        sceneComplexity,
        
        // Metadata features
        width: photo.width || image.width,
        height: photo.height || image.height,
        aspectRatio: (photo.width || image.width) / (photo.height || image.height),
        fileSize: photo.fileSize || 0,
        
        // Existing analysis data
        qualityScore: parseFloat(photo.qualityScore || '0'),
        faces: analysisData?.faces || [],
      };
      
      logger.debug(`Extracted features for ${photo.id}`, {
        faceCount: features.faceCount,
        compositionScore: features.compositionScore,
        sceneComplexity: features.sceneComplexity,
      });
      
      return features;
    } catch (error) {
      logger.error(`Failed to extract features for photo ${photo.id}`, error as Error);
      // Fallback to basic features if advanced extraction fails
      return this.extractBasicFeatures(photo, analysisData);
    }
  }

  /**
   * Extract basic features when advanced dependencies are not available
   */
  private extractBasicFeatures(photo: Photo, analysisData?: PhotoAnalysisResult): GroupingFeatures {
    logger.info(`Using basic feature extraction for photo ${photo.id}`);
    
    // Extract face positions from analysis data
    const facePositions = analysisData?.faces.map(face => ({
      x: face.boundingBox.x + face.boundingBox.width / 2,
      y: face.boundingBox.y + face.boundingBox.height / 2,
      size: face.boundingBox.width * face.boundingBox.height,
    })) || [];
    
    return {
      photoId: photo.id,
      timestamp: photo.createdAt || new Date(),
      
      // Visual features (fallback values)
      colorHistogram: new Array(64).fill(0),
      compositionScore: 0.5,
      faceCount: facePositions.length,
      facePositions,
      sceneComplexity: 0.5,
      
      // Metadata features
      width: photo.width || 1920,
      height: photo.height || 1080,
      aspectRatio: photo.width && photo.height ? photo.width / photo.height : 16/9,
      fileSize: photo.fileSize || 0,
      
      // Existing analysis data
      qualityScore: parseFloat(photo.qualityScore || '0'),
      faces: analysisData?.faces || [],
    };
  }

  /**
   * Extract 64-bin RGB color histogram from image
   */
  private async extractColorHistogram(canvas: any): Promise<number[]> {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 64 bins: 8x8x8 for R, G, B
    const histogram = new Array(64).fill(0);
    const binSize = 256 / 8; // 32
    
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.floor(data[i] / binSize);
      const g = Math.floor(data[i + 1] / binSize);
      const b = Math.floor(data[i + 2] / binSize);
      
      const binIndex = (r * 8 * 8) + (g * 8) + b;
      histogram[binIndex]++;
    }
    
    // Normalize histogram
    const totalPixels = canvas.width * canvas.height;
    return histogram.map(count => count / totalPixels);
  }

  /**
   * Calculate composition score based on rule of thirds and visual balance
   */
  private async calculateCompositionScore(canvas: any): Promise<number> {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale for edge detection
    const grayData = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayData[i / 4] = gray;
    }
    
    // Simple edge detection using Sobel operator
    const edges = this.detectEdges(grayData, canvas.width, canvas.height);
    
    // Calculate rule of thirds score
    const thirdX = canvas.width / 3;
    const thirdY = canvas.height / 3;
    
    let edgeScore = 0;
    const totalEdges = edges.reduce((sum, edge) => sum + edge, 0);
    
    // Reward edges near rule of thirds lines
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = y * canvas.width + x;
        const edgeStrength = edges[idx];
        
        if (edgeStrength > 0) {
          // Distance to nearest third line
          const distToXThird = Math.min(
            Math.abs(x - thirdX),
            Math.abs(x - 2 * thirdX)
          );
          const distToYThird = Math.min(
            Math.abs(y - thirdY),
            Math.abs(y - 2 * thirdY)
          );
          
          // Higher score for edges closer to third lines
          const thirdScore = Math.max(0, 1 - (distToXThird + distToYThird) / (thirdX + thirdY));
          edgeScore += edgeStrength * thirdScore;
        }
      }
    }
    
    return totalEdges > 0 ? edgeScore / totalEdges : 0;
  }

  /**
   * Simple edge detection using Sobel operator
   */
  private detectEdges(grayData: Float32Array, width: number, height: number): Float32Array {
    const edges = new Float32Array(width * height);
    
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let pixelX = 0;
        let pixelY = 0;
        
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const idx = (y + j) * width + (x + i);
            const kernelIdx = (j + 1) * 3 + (i + 1);
            
            pixelX += grayData[idx] * sobelX[kernelIdx];
            pixelY += grayData[idx] * sobelY[kernelIdx];
          }
        }
        
        edges[y * width + x] = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      }
    }
    
    return edges;
  }

  /**
   * Calculate scene complexity based on edge density and texture variation
   */
  private async calculateSceneComplexity(canvas: any): Promise<number> {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale
    const grayData = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      grayData[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    
    // Calculate texture variation using local standard deviation
    let totalVariation = 0;
    const sampleSize = 5; // Sample every 5th pixel for performance
    
    for (let y = sampleSize; y < canvas.height - sampleSize; y += sampleSize) {
      for (let x = sampleSize; x < canvas.width - sampleSize; x += sampleSize) {
        const centerIdx = y * canvas.width + x;
        const centerValue = grayData[centerIdx];
        
        // Calculate local standard deviation in 5x5 window
        let sum = 0;
        let sumSquares = 0;
        let count = 0;
        
        for (let dy = -sampleSize; dy <= sampleSize; dy++) {
          for (let dx = -sampleSize; dx <= sampleSize; dx++) {
            const idx = (y + dy) * canvas.width + (x + dx);
            const value = grayData[idx];
            sum += value;
            sumSquares += value * value;
            count++;
          }
        }
        
        const mean = sum / count;
        const variance = (sumSquares / count) - (mean * mean);
        totalVariation += Math.sqrt(variance);
      }
    }
    
    const samples = Math.floor(canvas.width / sampleSize) * Math.floor(canvas.height / sampleSize);
    return samples > 0 ? totalVariation / samples : 0;
  }

  /**
   * Calculate similarity score between two photos based on multiple features
   */
  calculateSimilarity(features1: GroupingFeatures, features2: GroupingFeatures, options: Required<GroupingOptions>): number {
    // Temporal similarity (photos taken close together are more similar)
    const timeDiff = Math.abs(features1.timestamp.getTime() - features2.timestamp.getTime());
    // Burst photo handling: photos within 60 seconds get high temporal similarity
    // 60 second decay (increased from 30) to better support burst sequences
    const temporalSimilarity = Math.exp(-timeDiff / (60 * 1000)); // 60 second decay
    
    // Burst photo boost: if photos taken within 10 seconds, boost similarity
    const isBurst = timeDiff < 10000; // 10 seconds
    const burstBoost = isBurst ? 0.15 : 0; // Add 15% similarity boost for burst photos
    
    // Visual similarity
    const colorSimilarity = this.calculateHistogramSimilarity(features1.colorHistogram, features2.colorHistogram);
    const compositionSimilarity = 1 - Math.abs(features1.compositionScore - features2.compositionScore);
    const sceneSimilarity = 1 - Math.abs(features1.sceneComplexity - features2.sceneComplexity);
    
    // Face similarity
    const faceCountSimilarity = 1 - Math.abs(features1.faceCount - features2.faceCount) / Math.max(features1.faceCount, features2.faceCount, 1);
    const facePositionSimilarity = this.calculateFacePositionSimilarity(features1.facePositions, features2.facePositions);
    
    const visualSimilarity = (
      colorSimilarity * 0.4 +
      compositionSimilarity * 0.2 +
      sceneSimilarity * 0.2 +
      faceCountSimilarity * 0.1 +
      facePositionSimilarity * 0.1
    );
    
    // Metadata similarity
    const aspectRatioSimilarity = 1 - Math.abs(features1.aspectRatio - features2.aspectRatio);
    const dimensionSimilarity = this.calculateDimensionSimilarity(
      features1.width, features1.height,
      features2.width, features2.height
    );
    
    const metadataSimilarity = (aspectRatioSimilarity + dimensionSimilarity) / 2;
    
    // Weighted combination with burst boost
    const overallSimilarity = (
      temporalSimilarity * options.temporalWeight +
      visualSimilarity * options.visualWeight +
      metadataSimilarity * options.metadataWeight +
      burstBoost  // Add burst boost to final score
    );
    
    return Math.max(0, Math.min(1, overallSimilarity));
  }

  /**
   * Calculate histogram similarity using correlation
   */
  private calculateHistogramSimilarity(histogram1: number[], histogram2: number[]): number {
    if (histogram1.length !== histogram2.length) return 0;
    
    // Calculate correlation coefficient
    const n = histogram1.length;
    const sum1 = histogram1.reduce((a, b) => a + b, 0);
    const sum2 = histogram2.reduce((a, b) => a + b, 0);
    
    const mean1 = sum1 / n;
    const mean2 = sum2 / n;
    
    let numerator = 0;
    let sum1Sq = 0;
    let sum2Sq = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = histogram1[i] - mean1;
      const diff2 = histogram2[i] - mean2;
      
      numerator += diff1 * diff2;
      sum1Sq += diff1 * diff1;
      sum2Sq += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(sum1Sq * sum2Sq);
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate face position similarity between two photos
   */
  private calculateFacePositionSimilarity(positions1: Array<{ x: number; y: number; size: number }>, positions2: Array<{ x: number; y: number; size: number }>): number {
    if (positions1.length === 0 && positions2.length === 0) return 1;
    if (positions1.length === 0 || positions2.length === 0) return 0;
    
    // Calculate minimum distance between face positions
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (const pos1 of positions1) {
      let maxSimilarity = 0;
      
      for (const pos2 of positions2) {
        const distance = Math.sqrt(
          Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
        );
        const sizeSimilarity = 1 - Math.abs(pos1.size - pos2.size) / Math.max(pos1.size, pos2.size);
        const positionSimilarity = Math.max(0, 1 - distance);
        
        const similarity = (positionSimilarity + sizeSimilarity) / 2;
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
      
      totalSimilarity += maxSimilarity;
      comparisons++;
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate dimension similarity between photos
   */
  private calculateDimensionSimilarity(width1: number, height1: number, width2: number, height2: number): number {
    const area1 = width1 * height1;
    const area2 = width2 * height2;
    
    const areaSimilarity = 1 - Math.abs(area1 - area2) / Math.max(area1, area2);
    
    return areaSimilarity;
  }

  /**
   * Build similarity matrix for all photos
   */
  async buildSimilarityMatrix(features: GroupingFeatures[], options: Required<GroupingOptions>): Promise<SimilarityMatrix> {
    const n = features.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    // Calculate pairwise similarities
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // Self-similarity
      
      for (let j = i + 1; j < n; j++) {
        const similarity = this.calculateSimilarity(features[i], features[j], options);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity; // Symmetric matrix
        
        // Log similarity scores for first few photo pairs to diagnose grouping
        if (i < 5 && j < 5) {
          logger.info(`Photo pair similarity`, {
            photo1: features[i].photoId,
            photo2: features[j].photoId,
            similarity: similarity.toFixed(3),
            timeDiff: Math.abs(features[i].timestamp.getTime() - features[j].timestamp.getTime()) / 1000,
            threshold: options.similarityThreshold
          });
        }
      }
    }
    
    return {
      matrix,
      photoIds: features.map(f => f.photoId),
    };
  }

  /**
   * Perform hierarchical agglomerative clustering
   */
  hierarchicalClustering(similarityMatrix: SimilarityMatrix, options: Required<GroupingOptions>): PhotoCluster[] {
    const n = similarityMatrix.photoIds.length;
    const matrix = similarityMatrix.matrix.map(row => [...row]); // Deep copy
    
    // Initialize each photo as its own cluster
    let clusters: number[][] = Array(n).fill(null).map((_, i) => [i]);
    
    while (clusters.length > 1) {
      // Find most similar cluster pair
      let maxSimilarity = -1;
      let bestPair: [number, number] = [0, 0];
      
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          // Calculate average linkage between clusters
          let totalSimilarity = 0;
          let comparisons = 0;
          
          for (const idx1 of clusters[i]) {
            for (const idx2 of clusters[j]) {
              totalSimilarity += matrix[idx1][idx2];
              comparisons++;
            }
          }
          
          const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
          
          if (avgSimilarity > maxSimilarity) {
            maxSimilarity = avgSimilarity;
            bestPair = [i, j];
          }
        }
      }
      
      // Stop if similarity below threshold
      if (maxSimilarity < options.similarityThreshold) break;
      
      // Merge the two most similar clusters
      const [i, j] = bestPair;
      const mergedCluster = [...clusters[i], ...clusters[j]];
      
      // Remove old clusters and add merged one
      clusters = clusters.filter((_, idx) => idx !== i && idx !== j);
      clusters.push(mergedCluster);
      
      // Stop if cluster would be too large
      if (mergedCluster.length > options.maxGroupSize) break;
    }
    
    // Convert to PhotoCluster objects
    const photoClusters: PhotoCluster[] = [];
    
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      
      // Skip clusters that are too small
      if (cluster.length < options.minGroupSize) continue;
      
      const photoIds = cluster.map(idx => similarityMatrix.photoIds[idx]);
      
      // Calculate cluster statistics
      let totalSimilarity = 0;
      let comparisons = 0;
      
      for (let j = 0; j < cluster.length; j++) {
        for (let k = j + 1; k < cluster.length; k++) {
          totalSimilarity += matrix[cluster[j]][cluster[k]];
          comparisons++;
        }
      }
      
      const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
      
      photoClusters.push({
        id: `cluster-${i}`,
        photoIds,
        confidence: avgSimilarity,
        avgSimilarity,
        timeWindow: { start: new Date(), end: new Date() }, // Will be filled later
        dominantFeatures: {
          avgColorHistogram: [],
          commonAspectRatios: [],
          avgFaceCount: 0,
        },
      });
    }
    
    return photoClusters;
  }

  /**
   * Group photos in a session using AI clustering
   */
  async groupSessionPhotos(
    sessionId: string,
    options: GroupingOptions = {},
    retryCount: number = 0
  ): Promise<PhotoCluster[]> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const MAX_RETRIES = 3;
    
    try {
      logger.info(`Starting photo grouping for session ${sessionId}`, { 
        options: opts, 
        retryCount,
        maxRetries: MAX_RETRIES 
      });
      
      // Check dependencies
      const dependencyCheck = this.checkDependencies();
      if (!dependencyCheck.available) {
        logger.error(`Missing dependencies for photo grouping`, {
          sessionId,
          missingDependencies: dependencyCheck.missingDependencies
        });
        // Throw a more specific error that will be caught by route handler
        const error = new Error(`Photo grouping service unavailable due to missing dependencies: ${dependencyCheck.missingDependencies.join(', ')}`);
        (error as any).isDependencyError = true;
        (error as any).missingDependencies = dependencyCheck.missingDependencies;
        throw error;
      }
      
      // Get all photos in the session
      if (!storage) {
        throw new Error('Storage service not available');
      }
      
      const photos = await storage.getPhotosBySession(sessionId);
      
      // Validate parameters
      this.validateGroupingParams(sessionId, photos, opts);
      
      if (photos.length < opts.minGroupSize) {
        logger.info(`Session ${sessionId} has insufficient photos for grouping (${photos.length} < ${opts.minGroupSize})`);
        return [];
      }
      
      // Emit initial progress
      this.emitProgress({
        sessionId,
        currentStep: 'extracting_features',
        currentPhoto: 0,
        totalPhotos: photos.length,
        percentage: 0,
        status: 'extracting_features',
        message: 'Extracting features from photos...',
      });
      
      // Extract features from all photos (batch processing)
      const features: GroupingFeatures[] = [];
      
      for (let i = 0; i < photos.length; i += opts.batchSize) {
        const batch = photos.slice(i, i + opts.batchSize);
        
        // Update progress
        this.emitProgress({
          sessionId,
          currentStep: 'extracting_features',
          currentPhoto: i,
          totalPhotos: photos.length,
          percentage: Math.round((i / photos.length) * 30),
          status: 'extracting_features',
          message: `Extracting features from photos ${i + 1}-${Math.min(i + opts.batchSize, photos.length)}...`,
        });
        
        // Process batch
        const batchPromises = batch.map(async (photo) => {
          let analysisData: PhotoAnalysisResult | undefined;
          
          try {
            // Try to parse existing analysis data
            if (photo.analysisData) {
              analysisData = typeof photo.analysisData === 'string' 
                ? JSON.parse(photo.analysisData) 
                : photo.analysisData as PhotoAnalysisResult;
            }
          } catch (error) {
            logger.warn(`Failed to parse analysis data for photo ${photo.id}`, error as Error);
          }
          
          return this.extractFeatures(photo, analysisData);
        });
        
        const batchFeatures = await Promise.all(batchPromises);
        features.push(...batchFeatures);
        
        // Monitor memory usage and cleanup if needed
        await this.monitorMemoryUsage();
        
        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Sort photos by timestamp for temporal analysis
      features.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Calculate time deltas
      for (let i = 1; i < features.length; i++) {
        features[i].timeDelta = features[i].timestamp.getTime() - features[i - 1].timestamp.getTime();
      }
      
      // Emit similarity calculation progress
      this.emitProgress({
        sessionId,
        currentStep: 'calculating_similarity',
        currentPhoto: features.length,
        totalPhotos: photos.length,
        percentage: 40,
        status: 'calculating_similarity',
        message: 'Calculating photo similarities...',
      });
      
      // Build similarity matrix
      const similarityMatrix = await this.buildSimilarityMatrix(features, opts);
      
      // Emit clustering progress
      this.emitProgress({
        sessionId,
        currentStep: 'clustering',
        currentPhoto: features.length,
        totalPhotos: photos.length,
        percentage: 60,
        status: 'clustering',
        message: 'Clustering similar photos...',
      });
      
      // Perform hierarchical clustering
      const clusters = this.hierarchicalClustering(similarityMatrix, opts);
      
      // Emit creating groups progress
      this.emitProgress({
        sessionId,
        currentStep: 'creating_groups',
        currentPhoto: features.length,
        totalPhotos: photos.length,
        percentage: 80,
        status: 'creating_groups',
        message: 'Creating photo groups...',
      });
      
      // Enhance clusters with additional information
      const enhancedClusters = await this.enhanceClusters(clusters, features);
      
      // Emit completion
      this.emitProgress({
        sessionId,
        currentStep: 'complete',
        currentPhoto: features.length,
        totalPhotos: photos.length,
        percentage: 100,
        status: 'complete',
        message: `Grouping complete! Found ${enhancedClusters.length} groups.`,
      });
      
      logger.info(`Photo grouping completed for session ${sessionId}`, {
        totalPhotos: photos.length,
        groupsFound: enhancedClusters.length,
        avgGroupSize: enhancedClusters.length > 0 
          ? enhancedClusters.reduce((sum, c) => sum + c.photoIds.length, 0) / enhancedClusters.length 
          : 0,
      });
      
      return enhancedClusters;
      
    } catch (error) {
      logger.error(`Photo grouping failed for session ${sessionId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryCount,
        maxRetries: MAX_RETRIES,
      });
      
      // Implement retry logic for transient errors
      if (retryCount < MAX_RETRIES && this.isRetryableError(error)) {
        logger.info(`Retrying photo grouping for session ${sessionId}, attempt ${retryCount + 1}/${MAX_RETRIES}`);
        
        // Wait before retry (exponential backoff)
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        // Retry with more conservative settings
        const retryOptions = {
          ...options,
          batchSize: Math.max((options.batchSize || opts.batchSize) / 2, 3),
          similarityThreshold: Math.max((options.similarityThreshold || opts.similarityThreshold) - 0.1, 0.5),
        };
        
        return this.groupSessionPhotos(sessionId, retryOptions, retryCount + 1);
      }
      
      // Emit error
      this.emitProgress({
        sessionId,
        currentStep: 'error',
        currentPhoto: 0,
        totalPhotos: 0,
        percentage: 0,
        status: 'error',
        message: `Grouping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      
      throw error;
    }
  }

  /**
   * Enhance clusters with additional information like time windows and dominant features
   */
  private async enhanceClusters(clusters: PhotoCluster[], features: GroupingFeatures[]): Promise<PhotoCluster[]> {
    const enhancedClusters: PhotoCluster[] = [];
    
    for (const cluster of clusters) {
      const clusterFeatures = features.filter(f => cluster.photoIds.includes(f.photoId));
      
      if (clusterFeatures.length === 0) continue;
      
      // Calculate time window
      const timestamps = clusterFeatures.map(f => f.timestamp);
      const timeWindow = {
        start: new Date(Math.min(...timestamps.map(t => t.getTime()))),
        end: new Date(Math.max(...timestamps.map(t => t.getTime()))),
      };
      
      // Calculate dominant features
      const avgColorHistogram = this.averageHistograms(clusterFeatures.map(f => f.colorHistogram));
      const aspectRatioSet = new Set(clusterFeatures.map(f => f.aspectRatio));
      const commonAspectRatios = Array.from(aspectRatioSet);
      const avgFaceCount = clusterFeatures.reduce((sum, f) => sum + f.faceCount, 0) / clusterFeatures.length;
      
      enhancedClusters.push({
        ...cluster,
        timeWindow,
        dominantFeatures: {
          avgColorHistogram,
          commonAspectRatios,
          avgFaceCount,
        },
      });
    }
    
    return enhancedClusters;
  }

  /**
   * Average multiple histograms
   */
  private averageHistograms(histograms: number[][]): number[] {
    if (histograms.length === 0) return [];
    
    const n = histograms[0].length;
    const avgHistogram = new Array(n).fill(0);
    
    for (const histogram of histograms) {
      for (let i = 0; i < n; i++) {
        avgHistogram[i] += histogram[i];
      }
    }
    
    return avgHistogram.map(sum => sum / histograms.length);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Network and timeout errors are retryable
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'econnreset',
      'enotfound',
      'econnrefused',
      'socket timeout',
      'fetch',
      'download',
      'buffer',
      'memory', // Memory issues might be resolved with smaller batches
    ];
    
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Validate grouping parameters
   */
  private validateGroupingParams(sessionId: string, photos: any[], options: Required<GroupingOptions>): void {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Valid sessionId is required');
    }
    
    if (!Array.isArray(photos) || photos.length === 0) {
      throw new Error('Photos array is required and cannot be empty');
    }
    
    if (options.similarityThreshold < 0 || options.similarityThreshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }
    
    if (options.minGroupSize < 2) {
      throw new Error('Minimum group size must be at least 2');
    }
    
    if (options.maxGroupSize < options.minGroupSize) {
      throw new Error('Maximum group size must be greater than or equal to minimum group size');
    }
    
    if (options.batchSize < 1 || options.batchSize > 50) {
      throw new Error('Batch size must be between 1 and 50');
    }
    
    const totalWeight = options.temporalWeight + options.visualWeight + options.metadataWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error('Sum of similarity weights must equal 1.0');
    }
  }

  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  private async monitorMemoryUsage(): Promise<void> {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const usedMemoryMB = memUsage.heapUsed / 1024 / 1024;
      const totalMemoryMB = memUsage.heapTotal / 1024 / 1024;
      
      logger.debug('Memory usage', {
        used: `${usedMemoryMB.toFixed(2)}MB`,
        total: `${totalMemoryMB.toFixed(2)}MB`,
        percentage: `${((usedMemoryMB / totalMemoryMB) * 100).toFixed(1)}%`,
      });
      
      // Force garbage collection if memory usage is high
      if (usedMemoryMB > 500 && global.gc) {
        logger.warn('High memory usage detected, triggering garbage collection');
        global.gc();
      }
    }
  }
}

// Initialize service with dependency logging
export const photoGroupingService = new PhotoGroupingService();

// Log service initialization status
const deps = photoGroupingService.checkDependencies();
if (deps.available) {
  logger.info('PhotoGroupingService initialized successfully with all dependencies');
} else {
  logger.warn('PhotoGroupingService initialized with missing dependencies', {
    missingDependencies: deps.missingDependencies
  });
}
