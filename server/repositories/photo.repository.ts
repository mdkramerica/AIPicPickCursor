import { db } from "../db";
import { photos, faces, type Photo, type InsertPhoto, type Face, type InsertFace } from "@shared/schema";
import { eq, count } from "drizzle-orm";

export class PhotoRepository {
  async getPhotosBySession(sessionId: string): Promise<Photo[]> {
    return await db
      .select()
      .from(photos)
      .where(eq(photos.sessionId, sessionId))
      .orderBy(photos.uploadOrder);
  }

  async getPhotosBySessionPaginated(sessionId: string, options?: { limit?: number; offset?: number }): Promise<Photo[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    
    return await db
      .select()
      .from(photos)
      .where(eq(photos.sessionId, sessionId))
      .orderBy(photos.uploadOrder)
      .limit(limit)
      .offset(offset);
  }

  async countPhotosBySession(sessionId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(photos)
      .where(eq(photos.sessionId, sessionId));
    
    return result?.count ?? 0;
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    const [photo] = await db
      .select()
      .from(photos)
      .where(eq(photos.id, id));
    return photo;
  }

  async createPhoto(photoData: InsertPhoto): Promise<Photo> {
    const [photo] = await db
      .insert(photos)
      .values(photoData)
      .returning();
    return photo;
  }

  async updatePhoto(id: string, data: Partial<Photo>): Promise<Photo | undefined> {
    const [photo] = await db
      .update(photos)
      .set(data)
      .where(eq(photos.id, id))
      .returning();
    return photo;
  }

  async deletePhoto(id: string): Promise<void> {
    await db
      .delete(photos)
      .where(eq(photos.id, id));
  }

  // Face operations
  async createFace(faceData: InsertFace): Promise<Face> {
    const [face] = await db
      .insert(faces)
      .values(faceData)
      .returning();
    return face;
  }

  async getFacesByPhoto(photoId: string): Promise<Face[]> {
    return await db
      .select()
      .from(faces)
      .where(eq(faces.photoId, photoId));
  }
}

export const photoRepository = new PhotoRepository();

