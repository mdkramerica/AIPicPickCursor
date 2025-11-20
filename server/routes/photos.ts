import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { photoSessions, photos } from "@shared/schema";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { apiLimiter } from "../middleware/rateLimiter";
import { validateUUID } from "../middleware/security";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.get("/album", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
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

router.patch("/photos/:photoId/mark-best", apiLimiter, isAuthenticated, validateUUID("photoId"), asyncHandler(async (req: any, res) => {
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

router.delete("/photos/:photoId", apiLimiter, isAuthenticated, validateUUID("photoId"), asyncHandler(async (req: any, res) => {
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

export default router;

