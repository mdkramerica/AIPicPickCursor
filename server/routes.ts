// Reference: blueprint:javascript_log_in_with_replit, blueprint:javascript_object_storage
import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, syncUserToDatabase } from "./kindeAuth";
import {
  R2StorageService,
  ObjectNotFoundError,
} from "./r2Storage";
import { ObjectPermission } from "./objectAcl";
import { photoAnalysisService } from "./photoAnalysis";
import { insertPhotoSessionSchema, insertPhotoSchema } from "@shared/schema";
import { asyncHandler, AppError } from "./middleware/errorHandler";
import { logger } from "./middleware/logger";
import { authLimiter, analysisLimiter, uploadLimiter, apiLimiter } from "./middleware/rateLimiter";
import { validateUUID } from "./middleware/security";

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

  // Object Storage routes
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.userId;
    const r2Storage = new R2StorageService();
    try {
      const normalizedPath = r2Storage.normalizeObjectPath(req.path);
      const objectKey = r2Storage.getObjectKeyFromPath(normalizedPath);

      const canAccess = await r2Storage.canAccessObject({
        userId: userId,
        objectKey: objectKey,
        requestedPermission: ObjectPermission.READ,
      });

      if (!canAccess) {
        return res.sendStatus(403);
      }

      await r2Storage.downloadObject(objectKey, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Direct file upload to R2 (no CORS issues)
  app.post("/api/objects/upload", uploadLimiter, isAuthenticated, upload.single('file'), asyncHandler(async (req: any, res) => {
    if (!req.file) {
      throw new AppError(400, "No file uploaded");
    }

    const r2Storage = new R2StorageService();
    const { objectKey } = await r2Storage.uploadFile(req.file.buffer, req.file.mimetype);

    // Return the object path that can be used to access the file
    res.json({
      objectKey,
      fileUrl: `/objects/${objectKey}`
    });
  }));

  // Photo Session routes
  app.get("/api/sessions", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const sessions = await storage.getSessionsByUser(userId);
    res.json(sessions);
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
  app.get("/api/sessions/:sessionId/photos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const photos = await storage.getPhotosBySession(req.params.sessionId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  app.post("/api/sessions/:sessionId/photos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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
    } catch (error) {
      console.error("Error creating photo:", error);
      res.status(500).json({ message: "Failed to create photo" });
    }
  });

  // Photo Analysis routes
  
  // Preview face detection (quick detection before full analysis)
  app.post("/api/sessions/:sessionId/preview", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const photos = await storage.getPhotosBySession(req.params.sessionId);
      
      if (photos.length === 0) {
        return res.status(400).json({ message: "No photos to preview" });
      }

      // Quick face detection on all photos
      const detectionResults = await Promise.all(
        photos.map(photo => photoAnalysisService.detectFaces(photo.fileUrl, photo.id))
      );

      res.json({
        sessionId: req.params.sessionId,
        detections: detectionResults,
      });
    } catch (error) {
      console.error("Error previewing faces:", error);
      res.status(500).json({ message: "Failed to detect faces" });
    }
  });

  app.post("/api/sessions/:sessionId/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const photos = await storage.getPhotosBySession(req.params.sessionId);
      
      if (photos.length < 2) {
        return res.status(400).json({ message: "Need at least 2 photos to analyze" });
      }

      // Get face selections from request body (optional)
      const faceSelections = req.body.faceSelections as Record<string, Record<number, boolean>> | undefined;

      // Update session status to analyzing
      await storage.updateSession(req.params.sessionId, {
        status: "analyzing",
      });

      // Analyze all photos with face selections
      const { analyses, bestPhotoId } = await photoAnalysisService.analyzeSession(
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

      res.json({
        sessionId: req.params.sessionId,
        bestPhotoId,
        analyses,
      });
    } catch (error) {
      console.error("Error analyzing session:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      console.error("Error details:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      
      await storage.updateSession(req.params.sessionId, {
        status: "failed",
      });
      
      // Return more specific error message for debugging
      const errorMessage = error instanceof Error ? error.message : "Failed to analyze photos";
      res.status(500).json({ 
        message: "Failed to analyze photos",
        error: errorMessage,
        details: "Check server logs for more information"
      });
    }
  });

  // Album routes
  app.get("/api/album", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const sessions = await storage.getSessionsByUser(userId);
      
      // Get best photos for each session
      const albumData = await Promise.all(
        sessions.map(async (session) => {
          const photos = await storage.getPhotosBySession(session.id);
          const bestPhoto = photos.find(p => p.isSelectedBest);
          return {
            session,
            bestPhoto: bestPhoto || null,
          };
        })
      );
      
      // Filter out sessions without best photos and sort by date (newest first)
      const filteredAlbum = albumData
        .filter(item => item.bestPhoto !== null)
        .sort((a, b) => new Date(b.session.createdAt).getTime() - new Date(a.session.createdAt).getTime());
      
      res.json(filteredAlbum);
    } catch (error) {
      console.error("Error fetching album:", error);
      res.status(500).json({ message: "Failed to fetch album" });
    }
  });

  app.patch("/api/photos/:photoId/mark-best", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const photo = await storage.getPhoto(req.params.photoId);
      
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      
      const session = await storage.getSession(photo.sessionId);
      if (!session || session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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
    } catch (error) {
      console.error("Error marking photo as best:", error);
      res.status(500).json({ message: "Failed to mark photo as best" });
    }
  });

  app.delete("/api/photos/:photoId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const photo = await storage.getPhoto(req.params.photoId);
      
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      
      const session = await storage.getSession(photo.sessionId);
      if (!session || session.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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
    } catch (error) {
      console.error("Error deleting photo:", error);
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
