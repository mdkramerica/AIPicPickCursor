// Reference: blueprint:javascript_log_in_with_replit, blueprint:javascript_object_storage
import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import heicConvert from 'heic-convert';
import { storage } from "./storage";
import { db } from "./db";
import { photoSessions, photos } from "@shared/schema";
import { setupAuth, isAuthenticated, syncUserToDatabase } from "./kindeAuth";
import {
  R2StorageService,
  ObjectNotFoundError,
} from "./r2Storage";
import { ObjectPermission } from "./objectAcl";
import { photoAnalysisService } from "./photoAnalysis";
import { convertKitService } from "./convertKitService";
import { convertKitWebhookHandler, parseWebhookBody, isValidWebhookEvent } from "./convertKitWebhooks";
import { photoGroupingService } from "./photoGroupingService";
import { insertPhotoSessionSchema, insertPhotoSchema, insertConvertKitSettingsSchema, insertPhotoGroupSchema, insertPhotoGroupMembershipSchema } from "@shared/schema";
import { z } from "zod";
import { asyncHandler, AppError } from "./middleware/errorHandler";
import { logger } from "./middleware/logger";
import { authLimiter, analysisLimiter, uploadLimiter, apiLimiter } from "./middleware/rateLimiter";
import { validateUUID } from "./middleware/security";
import { eq, and, desc, sql } from "drizzle-orm";

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Kinde authentication middleware
  setupAuth(app);

  // Health check endpoint (no auth required, for monitoring)
  app.get("/health", asyncHandler(async (req, res) => {
    const checks: Record<string, any> = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };

    // Check database connectivity
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch (error) {
      checks.database = "error";
      checks.databaseError = error instanceof Error ? error.message : "Unknown error";
    }

    // Check R2 storage connectivity (just verify config exists)
    try {
      if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET_NAME) {
        checks.storage = "ok";
      } else {
        checks.storage = "error";
        checks.storageError = "R2 configuration missing";
      }
    } catch (error) {
      checks.storage = "error";
      checks.storageError = error instanceof Error ? error.message : "Unknown error";
    }

    const healthy = checks.database === "ok" && checks.storage === "ok";
    res.status(healthy ? 200 : 503).json(checks);
  }));

  // Auth routes
  app.get('/api/auth/user', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    // Get user from database (already synced by isAuthenticated middleware)
    const user = await storage.getUser(userId);

    if (!user) {
      throw new AppError(404, "User not found");
    }

    res.json(user);
  }));

  // ConvertKit webhook endpoint
  app.post('/api/webhooks/convertkit', asyncHandler(async (req, res) => {
    try {
      const signature = req.headers['x-convertkit-signature'] as string;
      const body = req.body;

      // Verify webhook signature
      if (!convertKitWebhookHandler.verifySignature(JSON.stringify(body), signature)) {
        throw new AppError(401, "Invalid webhook signature");
      }

      // Parse and validate webhook event
      const event = parseWebhookBody(JSON.stringify(body));
      if (!event || !isValidWebhookEvent(event)) {
        throw new AppError(400, "Invalid webhook event");
      }

      // Handle the webhook event
      await convertKitWebhookHandler.handleWebhook(event);

      res.json({ success: true });
    } catch (error) {
      logger.error('ConvertKit webhook error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        body: req.body,
      });
      throw error;
    }
  }));

  // ConvertKit API routes
  app.post('/api/convertkit/subscribe', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const { email, firstName, consent } = req.body;

    if (!email) {
      throw new AppError(400, "Email is required");
    }

    if (!consent) {
      throw new AppError(400, "Email consent is required");
    }

    try {
      // Log the subscription attempt with sanitized data
      logger.info('ConvertKit subscription attempt', { 
        userId,
        email,
        firstName,
        hasConsent: !!consent,
        hasMarketingConsent: consent.marketing || false,
        tagIds: [
          parseInt(process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '0'),
          parseInt(process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '0'),
        ].filter(id => id > 0),
      });

      // Subscribe to ConvertKit
      const response = await convertKitService.subscribeUser({
        email,
        first_name: firstName,
        tags: [
          parseInt(process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '0'),
          parseInt(process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '0'),
        ].filter(id => id > 0),
      });

      logger.info('ConvertKit subscription response', {
        userId,
        email,
        success: response.success,
        subscriberId: response.data?.id,
      });

      if (response.success) {
        // Store user's ConvertKit settings
        await storage.createConvertKitSettings({
          userId,
          subscriberId: response.data?.id.toString() || '',
          emailConsent: true,
          marketingConsent: consent.marketing || false,
          autoSubscribed: false, // Manual subscription, not auto-subscribed
          tags: [
            process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS,
            process.env.CONVERTKIT_TAG_ID_NEWSLETTER,
          ].filter((tag): tag is string => Boolean(tag)),
        });

        logger.info('ConvertKit settings saved to database', { userId });

        // Send welcome email
        try {
          await convertKitService.sendPhotoAnalysisEmail({
            sessionId: 'welcome',
            campaignType: 'welcome',
            userEmail: email,
            userName: firstName,
          });
          logger.info('Welcome email sent', { userId, email });
        } catch (emailError) {
          // Don't fail the subscription if the welcome email fails
          logger.error('Failed to send welcome email (non-fatal)', {
            userId,
            email,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
            stack: emailError instanceof Error ? emailError.stack : undefined,
          });
        }
      }

      res.json(response);
    } catch (error) {
      logger.error('ConvertKit subscription failed', { 
        userId,
        email,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorDetails: error && typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
      });
      
      // Provide more specific error message to the client
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new AppError(500, `Failed to subscribe to email list: ${errorMessage}`);
    }
  }));

  app.get('/api/convertkit/settings', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const settings = await storage.getConvertKitSettings(userId);
    res.json(settings || null);
  }));

  app.patch('/api/convertkit/settings', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const { emailConsent, marketingConsent } = req.body;

    const settings = await storage.updateConvertKitSettings(userId, {
      emailConsent,
      marketingConsent,
    });

    // If user unsubscribes, update ConvertKit
    if (!emailConsent && settings?.subscriberId) {
      try {
        await convertKitService.unsubscribeSubscriber(settings.subscriberId);
      } catch (error) {
        logger.error('Failed to unsubscribe from ConvertKit', { 
          userId,
          subscriberId: settings.subscriberId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json(settings);
  }));

  app.post('/api/convertkit/send-analysis-email', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const { sessionId, campaignType } = req.body;

    if (!sessionId) {
      throw new AppError(400, "Session ID is required");
    }

    // Get session and user info
    const session = await storage.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, "Session not found");
    }

    const user = await storage.getUser(userId);
    const settings = await storage.getConvertKitSettings(userId);

    if (!settings?.emailConsent) {
      throw new AppError(400, "User has not consented to emails");
    }

    try {
      // Get analysis results
      const photos = await storage.getPhotosBySession(sessionId);
      const bestPhoto = photos.find(p => p.isSelectedBest);

      const response = await convertKitService.sendPhotoAnalysisEmail({
        sessionId,
        campaignType: campaignType || 'analysis_complete',
        userEmail: user?.email || '',
        userName: user?.firstName || '',
        analysisResults: {
          photoCount: photos.length,
          bestPhotoUrl: bestPhoto?.fileUrl,
          qualityScore: bestPhoto?.qualityScore ? parseFloat(bestPhoto.qualityScore) : undefined,
          facesDetected: photos.reduce((total, photo) => {
            const analysis = photo.analysisData as any;
            return total + (analysis?.faces?.length || 0);
          }, 0),
        },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to send analysis email', { 
        sessionId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError(500, "Failed to send analysis email");
    }
  }));

  // Object Storage routes
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.userId;
    const r2Storage = new R2StorageService();
    try {
      console.log(`📥 Object download request: ${req.path} from user ${userId}`);
      const normalizedPath = r2Storage.normalizeObjectPath(req.path);
      console.log(`🔄 Normalized path: ${normalizedPath}`);
      const objectKey = r2Storage.getObjectKeyFromPath(normalizedPath);
      console.log(`🔑 Object key: ${objectKey}`);

      const canAccess = await r2Storage.canAccessObject({
        userId: userId,
        objectKey: objectKey,
        requestedPermission: ObjectPermission.READ,
      });

      if (!canAccess) {
        console.error(`❌ Access denied for user ${userId} to object ${objectKey}`);
        return res.sendStatus(403);
      }

      console.log(`✅ Access granted, downloading object ${objectKey}`);
      await r2Storage.downloadObject(objectKey, res);
    } catch (error) {
      console.error("❌ Error in object download route:", error);
      if (error instanceof ObjectNotFoundError) {
        console.error(`❌ Object not found: ${req.path}`);
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Helper function to check if buffer is HEIC/HEIF format
  function isHEICFormat(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    const ftypSignature = buffer.toString('ascii', 4, 8);
    if (ftypSignature === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12);
      return brand.startsWith('heic') || brand.startsWith('heix') ||
             brand.startsWith('hevc') || brand.startsWith('hevx') ||
             brand.startsWith('mif1') || brand.startsWith('msf1');
    }
    return false;
  }

  // Direct file upload to R2 (no CORS issues)
  app.post("/api/objects/upload", uploadLimiter, isAuthenticated, upload.single('file'), asyncHandler(async (req: any, res) => {
    if (!req.file) {
      throw new AppError(400, "No file uploaded");
    }

    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;

    // Convert HEIC/HEIF to JPEG for browser compatibility
    const isHeic = fileMimetype.includes('heic') || fileMimetype.includes('heif') || isHEICFormat(fileBuffer);

    if (isHeic) {
      console.log(`🔄 Converting HEIC/HEIF image to JPEG for browser compatibility`);
      try {
        const outputBuffer = await heicConvert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.92
        });
        fileBuffer = Buffer.from(outputBuffer);
        fileMimetype = 'image/jpeg';
        console.log(`✅ HEIC conversion successful, new size: ${fileBuffer.length} bytes`);
      } catch (conversionError) {
        console.error(`❌ HEIC conversion failed:`, conversionError);
        throw new AppError(500, `Failed to convert HEIC image: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
      }
    }

    const r2Storage = new R2StorageService();
    const { objectKey } = await r2Storage.uploadFile(fileBuffer, fileMimetype);

    // Return the object path that can be used to access the file
    res.json({
      objectKey,
      fileUrl: `/objects/${objectKey}`
    });
  }));

  // Photo Session routes
  app.get("/api/sessions", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
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

  app.post("/api/sessions", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const validatedData = insertPhotoSessionSchema.parse({
      ...req.body,
      userId,
    });
    
    const session = await storage.createSession(validatedData);
    res.json(session);
  }));

  app.get("/api/sessions/:sessionId", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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
  app.get("/api/sessions/:sessionId/photos", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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
  app.get("/api/sessions/:sessionId/photos/presigned-urls", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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

  app.post("/api/sessions/:sessionId/photos", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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
  app.get("/api/sessions/:sessionId/progress", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const sessionId = req.params.sessionId;

    // Verify user owns this session
    const session = await storage.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }

    // Get current progress from in-memory store
    const progress = photoAnalysisService.getProgress(sessionId);

    if (!progress) {
      // No progress yet - return null
      res.json({ progress: null });
      return;
    }

    res.json({ progress });
  }));

  // SSE endpoint for grouping progress updates
  app.get("/api/sessions/:sessionId/group-progress", isAuthenticated, validateUUID("sessionId"), async (req: any, res) => {
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
  app.post("/api/sessions/:sessionId/preview", apiLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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

  app.post("/api/sessions/:sessionId/analyze", analysisLimiter, isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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
      const { analyses, bestPhotoId } = await photoAnalysisService.analyzeSession(
        req.params.sessionId,
        photos.map(p => ({ id: p.id, fileUrl: p.fileUrl })),
        faceSelections
      );

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

  // Album routes
  app.get("/api/album", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    
    // Single query with JOIN - eliminates N+1 query problem
    // Gets all sessions with their best photos in one query instead of 1 + N queries
    const albumData = await db
      .select({
        session: photoSessions,
        photo: photos,
      })
      .from(photoSessions)
      .leftJoin(photos, and(
        eq(photos.sessionId, photoSessions.id),
        eq(photos.isSelectedBest, true)
      ))
      .where(eq(photoSessions.userId, userId))
      .orderBy(desc(photoSessions.createdAt));
    
    // Group results by session (JOIN returns multiple rows per session if multiple best photos exist)
    const grouped = albumData.reduce((acc, row) => {
      if (!acc[row.session.id]) {
        acc[row.session.id] = {
          session: row.session,
          bestPhoto: null,
        };
      }
      // Take the first best photo if multiple exist (shouldn't happen, but handle gracefully)
      if (row.photo && !acc[row.session.id].bestPhoto) {
        acc[row.session.id].bestPhoto = row.photo;
      }
      return acc;
    }, {} as Record<string, { session: typeof photoSessions.$inferSelect; bestPhoto: typeof photos.$inferSelect | null }>);
    
    // Filter out sessions without best photos and convert to array
    const filteredAlbum = Object.values(grouped)
      .filter(item => item.bestPhoto !== null);
    
    res.json(filteredAlbum);
  }));

  app.patch("/api/photos/:photoId/mark-best", apiLimiter, isAuthenticated, validateUUID("photoId"), asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const photo = await storage.getPhoto(req.params.photoId);
    
    if (!photo) {
      throw new AppError(404, "Photo not found");
    }
    
    const session = await storage.getSession(photo.sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }
    
    // Unmark all other photos in the session
    const sessionPhotos = await storage.getPhotosBySession(photo.sessionId);
    await Promise.all(
      sessionPhotos.map(p => 
        storage.updatePhoto(p.id, { isSelectedBest: false })
      )
    );
    
    // Mark this photo as best
    await storage.updatePhoto(req.params.photoId, { isSelectedBest: true });
    
    // Update session's best photo ID
    await storage.updateSession(photo.sessionId, {
      bestPhotoId: req.params.photoId,
    });
    
    res.json({ success: true });
  }));

  app.delete("/api/photos/:photoId", apiLimiter, isAuthenticated, validateUUID("photoId"), asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const photo = await storage.getPhoto(req.params.photoId);
    
    if (!photo) {
      throw new AppError(404, "Photo not found");
    }
    
    const session = await storage.getSession(photo.sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }
    
    const wasBest = photo.isSelectedBest;
    
    // Delete the photo
    await storage.deletePhoto(req.params.photoId);
    
    // Update session photo count
    const remainingPhotos = await storage.getPhotosBySession(photo.sessionId);
    await storage.updateSession(photo.sessionId, {
      photoCount: remainingPhotos.length,
    });
    
    // If this was the best photo, clear the best photo ID
    if (wasBest) {
      await storage.updateSession(photo.sessionId, {
        bestPhotoId: null,
      });
    }
    
    res.json({ success: true });
  }));

  // Photo Grouping API Routes

  // Run automatic grouping analysis on all photos in a session
  app.post("/api/sessions/:sessionId/group-analyze", isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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
    
      // Perform grouping analysis with error handling
      logger.info(`Starting photo grouping service`, { sessionId, userId, photoCount: photos.length });
      
      try {
        const clusters = await photoGroupingService.groupSessionPhotos(sessionId, groupingOptions);
        
        logger.info(`Grouping analysis completed successfully`, {
          sessionId,
          userId,
          clustersFound: clusters.length,
          photosProcessed: photos.length
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
          // Create the group
          const group = await storage.createGroup({
            sessionId,
            name: `Group ${createdGroups.length + 1}`,
            groupType: 'auto',
            confidenceScore: cluster.confidence.toString(),
            similarityScore: cluster.avgSimilarity.toString(),
            timeWindowStart: cluster.timeWindow.start,
            timeWindowEnd: cluster.timeWindow.end,
          });
          
          // Add photos to the group
          for (const photoId of cluster.photoIds) {
            await storage.addPhotoToGroup(group.id, photoId, {
              confidenceScore: cluster.confidence.toString(),
            });
          }
          
          createdGroups.push({
            ...group,
            photoCount: cluster.photoIds.length,
            photoIds: cluster.photoIds,
          });
        }
        
        logger.info(`Successfully created groups`, {
          sessionId,
          userId,
          groupsCreated: createdGroups.length,
          totalPhotos: createdGroups.reduce((sum, g) => sum + g.photoCount, 0)
        });
        
        res.json({
          sessionId,
          groups: createdGroups,
          totalGroups: createdGroups.length,
          options: groupingOptions,
        });
        
      } catch (groupingError) {
        logger.error(`Grouping service failed`, {
          sessionId,
          userId,
          error: groupingError instanceof Error ? groupingError.message : 'Unknown error',
          stack: groupingError instanceof Error ? groupingError.stack : undefined
        });
        
        // Check if it's a TensorFlow.js or canvas dependency issue
        const errorMessage = groupingError instanceof Error ? groupingError.message.toLowerCase() : '';
        const isDependencyError = errorMessage.includes('tensorflow') || 
                                errorMessage.includes('canvas') || 
                                errorMessage.includes('module') ||
                                errorMessage.includes('import');
        
        if (isDependencyError) {
          throw new AppError(500, "AI grouping service unavailable due to missing dependencies. Please contact support.");
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
  app.get("/api/sessions/:sessionId/groups", isAuthenticated, validateUUID("sessionId"), asyncHandler(async (req: any, res) => {
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

  // Create manual group
  app.post("/api/groups", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const { sessionId, name, photoIds } = req.body;
    
    if (!sessionId || !name || !photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      throw new AppError(400, "sessionId, name, and photoIds are required");
    }
    
    // Verify user owns the session
    const session = await storage.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }
    
    // Verify all photos belong to the session
    const photos = await Promise.all(
      photoIds.map(async (photoId: string) => {
        const photo = await storage.getPhoto(photoId);
        if (!photo || photo.sessionId !== sessionId) {
          throw new AppError(400, `Photo ${photoId} not found in session`);
        }
        return photo;
      })
    );
    
    try {
      // Create the group
      const group = await storage.createGroup({
        sessionId,
        name,
        groupType: 'manual',
        confidenceScore: '1.0', // Manual groups have full confidence
        similarityScore: '1.0',
      });
      
      // Add photos to the group
      for (const photoId of photoIds) {
        await storage.addPhotoToGroup(group.id, photoId, {
          confidenceScore: '1.0',
        });
      }
      
      // Get the created group with photos
      const memberships = await storage.getMembershipsByGroup(group.id);
      const groupPhotos = await Promise.all(
        memberships.map(async (membership) => {
          const photo = await storage.getPhoto(membership.photoId);
          return photo ? {
            ...photo,
            confidenceScore: parseFloat(membership.confidenceScore || '1.0'),
            isExcluded: membership.isExcluded,
            userNotes: membership.userNotes,
          } : null;
        })
      );
      
      const validPhotos = groupPhotos.filter(Boolean).sort((a, b) => (a?.uploadOrder || 0) - (b?.uploadOrder || 0));
      
      res.status(201).json({
        ...group,
        photoCount: validPhotos.length,
        photos: validPhotos,
        confidenceScore: 1.0,
        similarityScore: 1.0,
      });
      
    } catch (error) {
      logger.error('Failed to create manual group', {
        sessionId,
        userId,
        name,
        photoIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError(500, "Failed to create group");
    }
  }));

  // Update group settings or merge/split groups
  app.patch("/api/groups/:groupId", isAuthenticated, validateUUID("groupId"), asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const groupId = req.params.groupId;
    const { name, bestPhotoId, action } = req.body;
    
    // Get the group
    const group = await storage.getGroup(groupId);
    if (!group) {
      throw new AppError(404, "Group not found");
    }
    
    // Verify user owns the session
    const session = await storage.getSession(group.sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }
    
    try {
      if (action === 'merge') {
        // Merge functionality would require additional group IDs to merge with
        throw new AppError(501, "Merge functionality not yet implemented");
      } else if (action === 'split') {
        // Split functionality would create multiple groups from current group
        throw new AppError(501, "Split functionality not yet implemented");
      } else {
        // Update group properties
        const updateData: any = {};
        if (name) updateData.name = name;
        if (bestPhotoId) updateData.bestPhotoId = bestPhotoId;
        
        const updatedGroup = await storage.updateGroup(groupId, updateData);
        if (!updatedGroup) {
          throw new AppError(404, "Group not found");
        }
        
        res.json(updatedGroup);
      }
    } catch (error) {
      logger.error('Failed to update group', {
        groupId,
        userId,
        updateData: { name, bestPhotoId, action },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError(500, "Failed to update group");
    }
  }));

  // Run best photo analysis on a specific group
  app.post("/api/groups/:groupId/analyze", isAuthenticated, validateUUID("groupId"), asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const groupId = req.params.groupId;
    
    // Get the group
    const group = await storage.getGroup(groupId);
    if (!group) {
      throw new AppError(404, "Group not found");
    }
    
    // Verify user owns the session
    const session = await storage.getSession(group.sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(403, "Forbidden");
    }
    
    // Get photos in the group
    const memberships = await storage.getMembershipsByGroup(groupId);
    if (memberships.length === 0) {
      throw new AppError(400, "No photos found in group");
    }
    
    const photos = await Promise.all(
      memberships.map(async (membership) => {
        const photo = await storage.getPhoto(membership.photoId);
        return photo;
      })
    );
    
    const validPhotos = photos.filter(Boolean);
    if (validPhotos.length < 2) {
      throw new AppError(400, "Need at least 2 photos to analyze best photo");
    }
    
    try {
      // Use the existing photo analysis service to find the best photo in this group
      const { analyses, bestPhotoId } = await photoAnalysisService.analyzeSession(
        `${group.sessionId}-${groupId}`, // Unique session ID for group analysis
        validPhotos.map(p => ({ id: p!.id, fileUrl: p!.fileUrl }))
      );
      
      // Update the group with the best photo
      await storage.updateGroup(groupId, {
        bestPhotoId,
      });
      
      // Update all photos with analysis data
      for (const analysis of analyses) {
        await storage.updatePhoto(analysis.photoId, {
          qualityScore: analysis.overallQualityScore.toString(),
          analysisData: analysis,
        });
      }
      
      res.json({
        groupId,
        bestPhotoId,
        analyses,
        photoCount: validPhotos.length,
      });
      
    } catch (error) {
      logger.error('Group best photo analysis failed', {
        groupId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError(500, `Group analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }));

  const httpServer = createServer(app);

  return httpServer;
}
