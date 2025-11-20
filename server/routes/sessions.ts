import { Router } from "express";
import { storage } from "../storage";
import { insertPhotoSessionSchema, insertPhotoSchema } from "@shared/schema";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { apiLimiter, uploadLimiter, analysisLimiter } from "../middleware/rateLimiter";
import { validateUUID } from "../middleware/security";
import { logger } from "../middleware/logger";
import { R2StorageService } from "../services/r2Storage";
import { photoAnalysisService } from "../services/photoAnalysis";
import { photoGroupingService } from "../services/photoGroupingService";
import { convertKitService } from "../services/convertKitService";

const router = Router();

router.get("/", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  
  // Parse pagination parameters
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  
  // Get paginated sessions and total count
  const [sessions, total] = await Promise.all([
    storage.getSessionsByUserPaginated(userId, { limit, offset }),
    storage.countSessionsByUser(userId),
  ]);
  
  res.json({
    data: sessions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}));

router.post("/", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  
  // Enhanced logging for debugging session creation
  logger.info('Session creation attempt', {
    userId,
    requestBody: req.body,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  try {
    // Validate session data
    const validatedData = insertPhotoSessionSchema.parse({
      ...req.body,
      userId,
    });
    
    logger.info('Session data validated successfully', {
      sessionId: 'pending',
      userId: validatedData.userId,
      name: validatedData.name
    });
    
    // Create session with detailed error handling
    const session = await storage.createSession(validatedData);
    
    logger.info('Session created successfully', {
      sessionId: session.id,
      userId: session.userId,
      name: session.name,
      status: session.status,
      createdAt: session.createdAt
    });
    
    res.json(session);
  } catch (error) {
    logger.error('Session creation failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: req.body,
      timestamp: new Date().toISOString()
    });
    
    // Re-throw with enhanced error context
    if (error instanceof Error) {
      if (error.message.includes('database') || error.message.includes('connection')) {
        throw new AppError(500, 'Database connection failed. Please try again later.');
      } else if (error.message.includes('validation') || error.message.includes('schema')) {
        throw new AppError(400, 'Invalid session data provided. Please check your input.');
      } else if (error.message.includes('duplicate') || error.message.includes('unique')) {
        throw new AppError(409, 'Session with this name already exists. Please use a different name.');
      } else {
        throw new AppError(500, `Failed to create session: ${error.message}`);
      }
    }
    throw new AppError(500, 'An unexpected error occurred while creating the session');
  }
}));

router.get("/:sessionId", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const session = await storage.getSession(req.params.sessionId);
  
  if (!session) {
    throw new AppError(404, "Session not found");
  }
  
  if (session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }
  
  res.json(session);
}));

// Photo routes
router.get("/:sessionId/photos", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const session = await storage.getSession(req.params.sessionId);

  if (!session) {
    throw new AppError(404, "Session not found");
  }

  if (session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }

  // Parse pagination parameters
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  
  // Get paginated photos and total count
  const [photos, total] = await Promise.all([
    storage.getPhotosBySessionPaginated(req.params.sessionId, { limit, offset }),
    storage.countPhotosBySession(req.params.sessionId),
  ]);
  
  res.json({
    data: photos,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}));

// Get presigned URLs for session photos (for displaying images without auth)
router.get("/:sessionId/photos/presigned-urls", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const sessionId = req.params.sessionId;

  console.log(`🔍 Presigned URL request for session: ${sessionId} by user: ${userId}`);

  // Verify user owns this session
  const session = await storage.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }

  // Get photos
  const photos = await storage.getPhotosBySession(sessionId);
  console.log(`📸 Found ${photos.length} photos in session ${sessionId}`);

  // Generate presigned URLs for each photo
  const r2Storage = new R2StorageService();
  const photosWithPresignedUrls = await Promise.all(
    photos.map(async (photo) => {
      try {
        console.log(`🔑 Processing photo ${photo.id}, fileUrl: ${photo.fileUrl}`);
        // Extract object key from fileUrl
        const objectKey = r2Storage.getObjectKeyFromPath(photo.fileUrl);
        console.log(`📦 Object key: ${objectKey}`);

        // Generate presigned URL (valid for 1 hour)
        const presignedUrl = await r2Storage.getDownloadURL(objectKey, 3600);
        console.log(`✅ Generated presigned URL for ${photo.id}: ${presignedUrl.substring(0, 100)}...`);

        return {
          photoId: photo.id,
          presignedUrl,
        };
      } catch (error) {
        console.error(`❌ Error generating presigned URL for photo ${photo.id}:`, error);
        console.error(`❌ Error details:`, {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack',
        });
        return {
          photoId: photo.id,
          presignedUrl: null,
          error: error instanceof Error ? error.message : 'Failed to generate URL',
        };
      }
    })
  );

  const successCount = photosWithPresignedUrls.filter(p => p.presignedUrl).length;
  const failCount = photosWithPresignedUrls.filter(p => !p.presignedUrl).length;
  console.log(`📊 Presigned URL generation complete: ${successCount} success, ${failCount} failed`);

  res.json({ photos: photosWithPresignedUrls });
}));

router.post("/:sessionId/photos", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const session = await storage.getSession(req.params.sessionId);
  
  if (!session) {
    throw new AppError(404, "Session not found");
  }
  
  if (session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }

  // Normalize the object path and set ACL policy
  const r2Storage = new R2StorageService();
  const normalizedPath = r2Storage.normalizeObjectPath(req.body.fileUrl);

  // For R2, we'll use the object key directly as the permanent path
  // The object is already in R2, we just normalize the path
  const permanentPath = normalizedPath.startsWith("/objects/")
    ? normalizedPath
    : `/objects/${req.body.fileUrl}`;

  const photos = await storage.getPhotosBySession(req.params.sessionId);
  
  const validatedData = insertPhotoSchema.parse({
    sessionId: req.params.sessionId,
    fileUrl: permanentPath, // Store permanent /objects/... path, not temporary signed URL
    originalFilename: req.body.originalFilename,
    uploadOrder: photos.length,
  });
  
  const photo = await storage.createPhoto(validatedData);
  
  // Update session photo count
  await storage.updateSession(req.params.sessionId, {
    photoCount: photos.length + 1,
  });
  
  res.json(photo);
}));

// Photo Analysis routes

// Polling endpoint for analysis progress (replaces SSE due to auth issues)
router.get("/:sessionId/progress", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const sessionId = req.params.sessionId;

  try {
    // Verify user owns this session
    const session = await storage.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }

    // Get current progress from in-memory store
    let progress = photoAnalysisService.getProgress(sessionId);

    // Get photos once for all checks
    const photos = await storage.getPhotosBySession(sessionId);

    if (!progress) {
      // No progress yet - check session status as fallback
      // If session is analyzing but no progress, analysis might have failed or completed
      if (session.status === "analyzing") {
        // Check if photos have analysis data - if so, analysis completed, now grouping
        const analyzedCount = photos.filter(p => p.qualityScore && p.analysisData).length;
        
        if (analyzedCount > 0 && analyzedCount === photos.length) {
          // Analysis completed, now grouping - show progress at 90% (grouping is final 10%)
          res.json({ 
            progress: {
              sessionId,
              currentPhoto: photos.length,
              totalPhotos: photos.length,
              percentage: 90, // Analysis done, grouping in progress
              status: 'selecting_best' as const,
              message: `Analysis complete (${analyzedCount}/${photos.length} photos). Grouping photos by scene...`,
            }
          });
          return;
        } else if (analyzedCount > 0 && analyzedCount < photos.length) {
          // Partial analysis - show actual progress
          const analysisProgress = (analyzedCount / photos.length) * 90; // Reserve 10% for grouping
          res.json({ 
            progress: {
              sessionId,
              currentPhoto: analyzedCount,
              totalPhotos: photos.length,
              percentage: Math.round(analysisProgress),
              status: 'analyzing' as const,
              message: `Analyzing photos... (${analyzedCount}/${photos.length} complete)`,
            }
          });
          return;
        }
        
        // Return minimal progress indicating analysis is running but no detailed progress yet
        res.json({ 
          progress: {
            sessionId,
            currentPhoto: 0,
            totalPhotos: 0,
            percentage: 0,
            status: 'analyzing' as const,
            message: 'Analysis starting...',
          }
        });
        return;
      }
      
      // If session is completed or failed but photos have analysis data, return completed progress
      if (session.status === "completed" || session.status === "failed") {
        const analyzedCount = photos.filter(p => p.qualityScore && p.analysisData).length;
        
        if (analyzedCount > 0) {
          res.json({ 
            progress: {
              sessionId,
              currentPhoto: analyzedCount,
              totalPhotos: photos.length,
              percentage: 100,
              status: 'complete' as const,
              message: 'Analysis complete',
            }
          });
          return;
        }
      }
      
      // No progress and not analyzing - return null
      res.json({ progress: null });
      return;
    }

    res.json({ progress });
  } catch (error) {
    // Don't let progress endpoint errors crash the app or return 502
    logger.error('Progress endpoint error', {
      sessionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Return error progress state instead of throwing (prevents 502)
    res.json({ 
      progress: {
        sessionId,
        currentPhoto: 0,
        totalPhotos: 0,
        percentage: 0,
        status: 'error' as const,
        message: 'Failed to get progress',
      }
    });
  }
}));

// SSE endpoint for grouping progress updates
router.get("/:sessionId/group-progress", isAuthenticated, validateUUID("sessionId"), async (req: any, res) => {
  const userId = req.userId;
  const sessionId = req.params.sessionId;

  // Verify user owns this session
  const session = await storage.getSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.sendStatus(403);
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Subscribe to progress updates
  const unsubscribe = photoGroupingService.onProgress(sessionId, (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    // Close connection when complete or error
    if (progress.status === 'complete' || progress.status === 'error') {
      res.end();
    }
  });

  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
  });
});

// Preview face detection (quick detection before full analysis)
router.post("/:sessionId/preview", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const session = await storage.getSession(req.params.sessionId);
  
  if (!session) {
    throw new AppError(404, "Session not found");
  }
  
  if (session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }

  const photos = await storage.getPhotosBySession(req.params.sessionId);
  
  if (photos.length === 0) {
    throw new AppError(400, "No photos to preview");
  }

  // Quick face detection on all photos
  const detectionResults = await Promise.all(
    photos.map(photo => photoAnalysisService.detectFaces(photo.fileUrl, photo.id))
  );

  res.json({
    sessionId: req.params.sessionId,
    detections: detectionResults,
  });
}));

router.post("/:sessionId/analyze", analysisLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const session = await storage.getSession(req.params.sessionId);
  
  if (!session) {
    throw new AppError(404, "Session not found");
  }
  
  if (session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }

  const photos = await storage.getPhotosBySession(req.params.sessionId);
  
  if (photos.length < 2) {
    throw new AppError(400, "Need at least 2 photos to analyze");
  }

  // Get face selections from request body (optional)
  const faceSelections = req.body.faceSelections as Record<string, Record<number, boolean>> | undefined;

  try {
    // Update session status to analyzing
    await storage.updateSession(req.params.sessionId, {
      status: "analyzing",
    });

    // Analyze all photos with face selections (pass sessionId for progress tracking)
    // Wrap in try-catch to ensure progress is updated on error
    let analyses: any[] = [];
    let bestPhotoId: string | null = null;
    
    try {
      const result = await photoAnalysisService.analyzeSession(
        req.params.sessionId,
        photos.map(p => ({ id: p.id, fileUrl: p.fileUrl })),
        faceSelections
      );
      analyses = result.analyses;
      bestPhotoId = result.bestPhotoId;
    } catch (analysisError) {
      // Analysis failed - progress should already be updated by analyzeSession
      logger.error('Analysis failed', {
        sessionId: req.params.sessionId,
        userId,
        error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        stack: analysisError instanceof Error ? analysisError.stack : undefined,
      });
      
      // Update session status to failed
      await storage.updateSession(req.params.sessionId, {
        status: "failed",
      }).catch(() => {
        // Ignore errors updating status
      });
      
      // Re-throw to be handled by outer catch
      throw analysisError;
    }

    // Update photos with analysis results
    for (const analysis of analyses) {
      await storage.updatePhoto(analysis.photoId, {
        qualityScore: analysis.overallQualityScore.toString(),
        isSelectedBest: analysis.photoId === bestPhotoId,
        analysisData: analysis,
      });
    }

    // Update session with best photo and status
    await storage.updateSession(req.params.sessionId, {
      status: "completed",
      bestPhotoId,
    });

    // Send analysis completion email if user has consented
    try {
      const settings = await storage.getConvertKitSettings(userId);
      if (settings?.emailConsent) {
        const user = await storage.getUser(userId);
        const bestPhoto = photos.find(p => p.id === bestPhotoId);

        await convertKitService.sendPhotoAnalysisEmail({
          sessionId: req.params.sessionId,
          campaignType: 'analysis_complete',
          userEmail: user?.email || '',
          userName: user?.firstName || '',
          analysisResults: {
            photoCount: photos.length,
            bestPhotoUrl: bestPhoto?.fileUrl,
            qualityScore: bestPhoto?.qualityScore ? parseFloat(bestPhoto.qualityScore) : undefined,
            facesDetected: analyses.reduce((total, analysis) => total + analysis.faces.length, 0),
          },
        });
      }
    } catch (emailError) {
      logger.error('Failed to send analysis completion email', {
        sessionId: req.params.sessionId,
        userId,
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
      });
      // Don't fail the request if email fails
    }

    res.json({
      sessionId: req.params.sessionId,
      bestPhotoId,
      analyses,
    });
  } catch (error) {
    logger.error('Analysis endpoint error', {
      sessionId: req.params.sessionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Ensure progress is updated to error state if not already done
    try {
      const progress = photoAnalysisService.getProgress(req.params.sessionId);
      if (!progress || progress.status !== 'error') {
        // Set error progress if not already set
        photoAnalysisService.clearProgress(req.params.sessionId);
        // Also try to emit error progress directly
        try {
          photoAnalysisService.onProgress(req.params.sessionId, () => {})(); // Subscribe and immediately unsubscribe to trigger error state
        } catch {
          // Ignore
        }
      }
    } catch (progressError) {
      // Ignore errors checking/clearing progress
      logger.warn('Failed to update progress on error', { progressError });
    }
    
    // Update session status to failed on error
    await storage.updateSession(req.params.sessionId, {
      status: "failed",
    }).catch(() => {
      // Ignore errors updating status
    });
    
    // Re-throw to be handled by asyncHandler
    throw error;
  }
}));

// Photo Grouping API Routes

// Run automatic grouping analysis on all photos in a session
router.post("/:sessionId/group-analyze", isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const sessionId = req.params.sessionId;
  
  try {
    logger.info(`Starting grouping analysis for session ${sessionId}`, { userId });
    
    // Verify user owns this session
    const session = await storage.getSession(sessionId);
    if (!session) {
      logger.error(`Session not found: ${sessionId}`, { userId });
      throw new AppError(404, "Session not found");
    }
    
    if (session.userId !== userId) {
      logger.error(`Access denied for session ${sessionId}`, { userId, sessionUserId: session.userId });
      throw new AppError(403, "Forbidden");
    }
    
    // Check if session supports bulk mode
    if (!session.bulkMode) {
      logger.warn(`Session ${sessionId} not in bulk mode`, { userId });
      await storage.updateSession(sessionId, { bulkMode: true });
    }
    
    // Get photos in the session
    const photos = await storage.getPhotosBySession(sessionId);
    logger.info(`Photo count check for grouping`, {
      sessionId,
      userId,
      photoCount: photos.length,
      photoIds: photos.map(p => p.id).slice(0, 5) // Log first 5 photo IDs for debugging
    });

    if (photos.length < 2) {
      logger.warn(`Insufficient photos for grouping: ${photos.length} < 2`, { sessionId, userId });
      throw new AppError(400, `Need at least 2 photos to perform grouping. Currently found ${photos.length} photo(s). Please ensure uploads have completed before starting grouping.`);
    }
    
    // Get grouping options from request body
    const { similarityThreshold, targetGroupSize, minGroupSize, maxGroupSize } = req.body;
    
    // Validate grouping parameters
    const groupingOptions = {
      similarityThreshold: similarityThreshold ? parseFloat(similarityThreshold) : undefined,
      maxGroupSize: maxGroupSize ? parseInt(maxGroupSize) : undefined,
      minGroupSize: minGroupSize ? parseInt(minGroupSize) : undefined,
    };
    
    logger.info(`Grouping options configured`, {
      sessionId,
      userId,
      photoCount: photos.length,
      options: groupingOptions
    });
    
    // Validate photoGroupingService is available
    if (!photoGroupingService) {
      logger.error(`photoGroupingService not available`, { sessionId, userId });
      throw new AppError(500, "Grouping service not initialized");
    }
    
    // Check dependencies before starting grouping
    const dependencyCheck = photoGroupingService.checkDependencies();
    if (!dependencyCheck.available) {
      logger.error(`Grouping dependencies missing`, {
        sessionId,
        userId,
        missingDependencies: dependencyCheck.missingDependencies
      });
      throw new AppError(500, `AI grouping service unavailable. Missing dependencies: ${dependencyCheck.missingDependencies.join(', ')}. Please ensure all required packages are installed.`);
    }
  
    // CRITICAL: Check if photos have been analyzed (have quality scores)
    // For bulk uploads, photos need to be analyzed BEFORE grouping to select best photo from each scene
    // Check for both qualityScore and analysisData to ensure complete analysis
    const photosNeedingAnalysis = photos.filter(p => {
      const hasQualityScore = p.qualityScore && parseFloat(p.qualityScore) > 0;
      const hasAnalysisData = p.analysisData && (
        typeof p.analysisData === 'object' || 
        (typeof p.analysisData === 'string' && p.analysisData.length > 0)
      );
      return !hasQualityScore || !hasAnalysisData;
    });
    let needsAnalysis = photosNeedingAnalysis.length > 0; // Use let so it's accessible after the if block
    
    if (needsAnalysis) {
      logger.info(`Photos need analysis before grouping`, {
        sessionId,
        userId,
        totalPhotos: photos.length,
        needsAnalysis: photosNeedingAnalysis.length,
        alreadyAnalyzed: photos.length - photosNeedingAnalysis.length,
        photosNeedingAnalysis: photosNeedingAnalysis.map(p => ({ id: p.id, hasQualityScore: !!p.qualityScore, hasAnalysisData: !!p.analysisData }))
      });
      
      // Update session status to analyzing
      await storage.updateSession(sessionId, {
        status: "analyzing",
      });
      
      try {
        // Analyze all photos first (not just the ones needing analysis, to ensure consistency)
        logger.info(`Starting photo analysis before grouping`, {
          sessionId,
          userId,
          photoCount: photos.length,
          analyzingAll: true // Analyze all to ensure consistency
        });
        
        const analysisResult = await photoAnalysisService.analyzeSession(
          sessionId,
          photos.map(p => ({ id: p.id, fileUrl: p.fileUrl }))
        );
        
        logger.info(`Photo analysis completed`, {
          sessionId,
          userId,
          analyzedCount: analysisResult.analyses.length,
          bestPhotoId: analysisResult.bestPhotoId,
          expectedCount: photos.length
        });
        
        // Verify all photos were analyzed
        if (analysisResult.analyses.length !== photos.length) {
          logger.warn(`Analysis count mismatch`, {
            sessionId,
            userId,
            analyzedCount: analysisResult.analyses.length,
            expectedCount: photos.length,
            missingPhotos: photos.length - analysisResult.analyses.length
          });
        }
        
        // Update photos with analysis results
        let updateCount = 0;
        for (const analysis of analysisResult.analyses) {
          try {
            await storage.updatePhoto(analysis.photoId, {
              qualityScore: analysis.overallQualityScore.toString(),
              analysisData: analysis,
            });
            updateCount++;
          } catch (updateError) {
            logger.error(`Failed to update photo ${analysis.photoId} with analysis data`, {
              sessionId,
              userId,
              photoId: analysis.photoId,
              error: updateError instanceof Error ? updateError.message : 'Unknown error'
            });
            // Continue with other photos even if one fails
          }
        }
        
        logger.info(`Photos updated with analysis data`, {
          sessionId,
          userId,
          updateCount,
          expectedCount: analysisResult.analyses.length
        });
        
        // Reload photos to get updated quality scores and verify analysis succeeded
        const updatedPhotos = await storage.getPhotosBySession(sessionId);
        photos.length = 0; // Clear array
        photos.push(...updatedPhotos); // Replace with updated photos
        
        // Verify all photos now have analysis data
        const stillMissingAnalysis = photos.filter(p => {
          const hasQualityScore = p.qualityScore && parseFloat(p.qualityScore) > 0;
          const hasAnalysisData = p.analysisData && (
            typeof p.analysisData === 'object' || 
            (typeof p.analysisData === 'string' && p.analysisData.length > 0)
          );
          return !hasQualityScore || !hasAnalysisData;
        });
        
        if (stillMissingAnalysis.length > 0) {
          logger.error(`Some photos still missing analysis after update`, {
            sessionId,
            userId,
            missingCount: stillMissingAnalysis.length,
            photoIds: stillMissingAnalysis.map(p => p.id)
          });
          throw new AppError(500, `Failed to analyze ${stillMissingAnalysis.length} photo(s). Analysis may have partially failed.`);
        }
        
        logger.info(`All photos successfully analyzed and verified`, {
          sessionId,
          userId,
          totalPhotos: photos.length,
          allHaveQualityScores: photos.every(p => p.qualityScore && parseFloat(p.qualityScore) > 0),
          allHaveAnalysisData: photos.every(p => p.analysisData)
        });
        
      } catch (analysisError) {
        logger.error(`Photo analysis failed before grouping`, {
          sessionId,
          userId,
          error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
          stack: analysisError instanceof Error ? analysisError.stack : undefined,
        });
        
        // Update session status to failed
        await storage.updateSession(sessionId, {
          status: "failed",
        }).catch(() => {
          // Ignore errors updating status
        });
        
        // Re-throw AppError instances as-is, wrap others
        if (analysisError instanceof AppError) {
          throw analysisError;
        }
        throw new AppError(500, `Photo analysis failed before grouping: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
      }
    } else {
      logger.info(`All photos already analyzed, proceeding directly to grouping`, {
        sessionId,
        userId,
        photoCount: photos.length,
        allHaveQualityScores: photos.every(p => p.qualityScore && parseFloat(p.qualityScore) > 0),
        allHaveAnalysisData: photos.every(p => p.analysisData)
      });
    }
  
    // Perform grouping analysis with error handling
    logger.info(`Starting photo grouping service`, { sessionId, userId, photoCount: photos.length });
    
    try {
      const clusters = await photoGroupingService.groupSessionPhotos(sessionId, groupingOptions);
      
      logger.info(`Grouping analysis completed successfully`, {
        sessionId,
        userId,
        clustersFound: clusters.length,
        photosProcessed: photos.length,
        // Add detailed cluster info
        clusterSizes: clusters.map(c => c.photoIds.length),
        clusterConfidences: clusters.map(c => c.confidence.toFixed(3)),
        options: groupingOptions
      });
      
      // Update session with grouping metadata
      await storage.updateSession(sessionId, {
        bulkMode: true,
        targetGroupSize: targetGroupSize ? parseInt(targetGroupSize) : 5,
      });
      
      // Delete existing groups for this session
      const existingGroups = await storage.getGroupsBySession(sessionId);
      await Promise.all(existingGroups.map(group => storage.deleteGroup(group.id)));
      
      logger.info(`Cleared existing groups`, { sessionId, deletedGroups: existingGroups.length });
      
      // Create new groups from clusters
      const createdGroups = [];
      
      for (const cluster of clusters) {
        // Get photo details for quality scoring
        const clusterPhotos = photos.filter(p => cluster.photoIds.includes(p.id));
        
        // Find the best photo in this cluster (highest quality score)
        // This is the key step: select the best photo from each scene/group
        let bestPhotoId: string | null = null;
        let bestQualityScore = -1;
        
        for (const photo of clusterPhotos) {
          // Parse quality score - if analysis was done, this should be populated
          const qualityScore = photo.qualityScore ? parseFloat(photo.qualityScore) : 0;
          
          // Also check analysisData for quality score if qualityScore field is missing
          let effectiveQualityScore = qualityScore;
          if (effectiveQualityScore === 0 && photo.analysisData) {
            try {
              const analysisData = typeof photo.analysisData === 'string' 
                ? JSON.parse(photo.analysisData) 
                : photo.analysisData;
              if (analysisData?.overallQualityScore) {
                effectiveQualityScore = typeof analysisData.overallQualityScore === 'number' 
                  ? analysisData.overallQualityScore 
                  : parseFloat(analysisData.overallQualityScore);
              }
            } catch (e) {
              logger.warn(`Failed to parse analysisData for photo ${photo.id}`, { error: e });
            }
          }
          
          if (effectiveQualityScore > bestQualityScore) {
            bestQualityScore = effectiveQualityScore;
            bestPhotoId = photo.id;
          }
        }
        
        // If no quality scores available (shouldn't happen if analysis ran), use first photo as fallback
        if (!bestPhotoId && clusterPhotos.length > 0) {
          bestPhotoId = clusterPhotos[0].id;
          logger.warn(`No quality scores found for cluster, using first photo as best (analysis may have failed)`, {
            sessionId,
            clusterId: cluster.id,
            photoId: bestPhotoId,
            photoCount: clusterPhotos.length
          });
        }
        
        if (bestPhotoId) {
          logger.info(`Selected best photo for scene/group`, {
            sessionId,
            clusterId: cluster.id,
            bestPhotoId,
            qualityScore: bestQualityScore,
            totalPhotosInScene: clusterPhotos.length
          });
        }
        
        // Create the group with best photo ID
        const group = await storage.createGroup({
          sessionId,
          name: `Group ${createdGroups.length + 1}`,
          groupType: 'auto',
          confidenceScore: cluster.confidence.toString(),
          similarityScore: cluster.avgSimilarity.toString(),
          timeWindowStart: cluster.timeWindow.start,
          timeWindowEnd: cluster.timeWindow.end,
          bestPhotoId: bestPhotoId || undefined,
        });
        
        // Add photos to the group
        for (const photoId of cluster.photoIds) {
          await storage.addPhotoToGroup(group.id, photoId, {
            confidenceScore: cluster.confidence.toString(),
          });
        }
        
        // Mark the best photo in the group (ONLY if group has 2+ photos)
        // Don't mark singletons as "best" - that's meaningless
        if (bestPhotoId && cluster.photoIds.length >= 2) {
          await storage.updatePhoto(bestPhotoId, { isSelectedBest: true });
          logger.info(`Set best photo for group`, {
            sessionId,
            groupId: group.id,
            bestPhotoId,
            qualityScore: bestQualityScore,
            totalPhotosInGroup: cluster.photoIds.length
          });
        } else if (cluster.photoIds.length === 1) {
          logger.info(`Skipping best photo mark for singleton group`, {
            sessionId,
            groupId: group.id,
            photoId: cluster.photoIds[0]
          });
        }
        
        createdGroups.push({
          ...group,
          photoCount: cluster.photoIds.length,
          photoIds: cluster.photoIds,
          bestPhotoId,
        });
      }
      
      // Verify all groups have best photos selected
      const groupsWithoutBestPhoto = createdGroups.filter(g => !g.bestPhotoId);
      if (groupsWithoutBestPhoto.length > 0) {
        logger.warn(`Some groups missing best photo selection`, {
          sessionId,
          userId,
          groupsWithoutBestPhoto: groupsWithoutBestPhoto.length,
          totalGroups: createdGroups.length
        });
      }
      
      // Verify all best photos have quality scores (they should, since we analyzed before grouping)
      const bestPhotoIds = createdGroups.filter(g => g.bestPhotoId).map(g => g.bestPhotoId!);
      const bestPhotos = photos.filter(p => bestPhotoIds.includes(p.id));
      const bestPhotosWithoutQuality = bestPhotos.filter(p => !p.qualityScore || parseFloat(p.qualityScore) === 0);
      if (bestPhotosWithoutQuality.length > 0) {
        logger.error(`Best photos selected but missing quality scores - this should not happen`, {
          sessionId,
          userId,
          missingQualityCount: bestPhotosWithoutQuality.length,
          photoIds: bestPhotosWithoutQuality.map(p => p.id)
        });
      }
      
      logger.info(`Successfully created groups`, {
        sessionId,
        userId,
        groupsCreated: createdGroups.length,
        totalPhotos: createdGroups.reduce((sum, g) => sum + g.photoCount, 0),
        groupsWithBestPhoto: createdGroups.filter(g => g.bestPhotoId).length,
        groupsWithoutBestPhoto: groupsWithoutBestPhoto.length,
        allBestPhotosHaveQualityScores: bestPhotosWithoutQuality.length === 0,
        groupDetails: createdGroups.map(g => ({
          id: g.id,
          photoCount: g.photoCount,
          bestPhotoId: g.bestPhotoId,
          confidenceScore: g.confidenceScore
        }))
      });
      
      // Update session status to completed after successful grouping
      await storage.updateSession(sessionId, {
        status: "completed",
      });
      
      res.json({
        sessionId,
        groups: createdGroups,
        totalGroups: createdGroups.length,
        options: groupingOptions,
        analysisCompleted: needsAnalysis, // Indicate if analysis was run as part of this request
      });
      
    } catch (groupingError) {
      logger.error(`Grouping service failed`, {
        sessionId,
        userId,
        error: groupingError instanceof Error ? groupingError.message : 'Unknown error',
        stack: groupingError instanceof Error ? groupingError.stack : undefined,
        isDependencyError: (groupingError as any).isDependencyError,
        missingDependencies: (groupingError as any).missingDependencies
      });
      
      // IMPORTANT: If analysis succeeded but grouping failed, still mark as completed
      // Analysis is what enables comparison view, so users should still be able to compare photos
      const allPhotosAnalyzed = photos.every(p => 
        p.qualityScore && parseFloat(p.qualityScore) > 0 && p.analysisData
      );
      
      if (allPhotosAnalyzed) {
        logger.warn(`Grouping failed but analysis succeeded - marking session as completed anyway`, {
          sessionId,
          userId,
          photoCount: photos.length,
          groupingError: groupingError instanceof Error ? groupingError.message : 'Unknown error'
        });
        
        // Mark session as completed even though grouping failed
        await storage.updateSession(sessionId, {
          status: "completed",
        });
        
        // Return partial success - analysis worked, grouping didn't
        res.json({
          sessionId,
          groups: [],
          totalGroups: 0,
          options: groupingOptions,
          analysisCompleted: true,
          groupingFailed: true,
          message: `Photos analyzed successfully, but grouping failed: ${groupingError instanceof Error ? groupingError.message : 'Unknown error'}. You can still view and compare your photos.`,
        });
        return;
      }
      
      // If analysis also failed, throw error as before
      // Check if it's a dependency error (either from string match or explicit flag)
      const errorMessage = groupingError instanceof Error ? groupingError.message.toLowerCase() : '';
      const isDependencyError = (groupingError as any).isDependencyError || 
                              errorMessage.includes('tensorflow') || 
                              errorMessage.includes('canvas') || 
                              errorMessage.includes('module') ||
                              errorMessage.includes('import') ||
                              errorMessage.includes('missing dependencies');
      
      if (isDependencyError) {
        const missingDeps = (groupingError as any).missingDependencies || ['Unknown'];
        throw new AppError(500, `AI grouping service unavailable. Missing dependencies: ${Array.isArray(missingDeps) ? missingDeps.join(', ') : missingDeps}. Please ensure all required packages are installed: @tensorflow/tfjs-node, @vladmandic/face-api, canvas`);
      } else {
        throw new AppError(500, `Grouping analysis failed: ${groupingError instanceof Error ? groupingError.message : 'Unknown error'}`);
      }
    }
    
  } catch (error) {
    logger.error('Grouping analysis failed', {
      sessionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Don't re-throw AppError instances
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(500, `Grouping analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}));

// Get all groups with their photos and analysis data
router.get("/:sessionId/groups", isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const sessionId = req.params.sessionId;
  
  // Verify user owns this session
  const session = await storage.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new AppError(403, "Forbidden");
  }
  
  // Get groups for this session
  const groups = await storage.getGroupsBySession(sessionId);
  
  // Enrich groups with photo data
  const enrichedGroups = await Promise.all(
    groups.map(async (group) => {
      // Get memberships for this group
      const memberships = await storage.getMembershipsByGroup(group.id);
      
      // Get photos for this group
      const photos = await Promise.all(
        memberships.map(async (membership) => {
          const photo = await storage.getPhoto(membership.photoId);
          return photo ? {
            ...photo,
            confidenceScore: membership.confidenceScore ? parseFloat(membership.confidenceScore) : undefined,
            isExcluded: membership.isExcluded,
            userNotes: membership.userNotes,
          } : null;
        })
      );
      
      // Filter out null photos and sort by upload order
      const validPhotos = photos.filter(Boolean).sort((a, b) => (a?.uploadOrder || 0) - (b?.uploadOrder || 0));
      
      // Get best photo if set
      const bestPhoto = validPhotos.find(p => p?.id === group.bestPhotoId);
      
      return {
        ...group,
        photoCount: validPhotos.length,
        photos: validPhotos,
        bestPhoto,
        confidenceScore: group.confidenceScore ? parseFloat(group.confidenceScore) : undefined,
        similarityScore: group.similarityScore ? parseFloat(group.similarityScore) : undefined,
      };
    })
  );
  
  res.json({
    sessionId,
    groups: enrichedGroups,
    totalGroups: enrichedGroups.length,
    bulkMode: session.bulkMode,
    targetGroupSize: session.targetGroupSize,
  });
}));

export default router;

