import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { validateUUID } from "../middleware/security";
import { logger } from "../middleware/logger";
import { photoAnalysisService } from "../services/photoAnalysis";

const router = Router();

router.post("/groups", isAuthenticated, asyncHandler(async (req: any, res) => {
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

router.patch("/groups/:groupId", isAuthenticated, validateUUID("groupId"), asyncHandler(async (req: any, res) => {
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

router.post("/groups/:groupId/analyze", isAuthenticated, validateUUID("groupId"), asyncHandler(async (req: any, res) => {
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

export default router;

