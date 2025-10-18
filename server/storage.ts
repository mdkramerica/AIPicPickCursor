// Reference: blueprint:javascript_log_in_with_replit, blueprint:javascript_database
import {
  users,
  photoSessions,
  photos,
  faces,
  type User,
  type UpsertUser,
  type PhotoSession,
  type InsertPhotoSession,
  type Photo,
  type InsertPhoto,
  type Face,
  type InsertFace,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations (Required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Photo Session operations
  getSessionsByUser(userId: string): Promise<PhotoSession[]>;
  getSession(id: string): Promise<PhotoSession | undefined>;
  createSession(session: InsertPhotoSession): Promise<PhotoSession>;
  updateSession(id: string, data: Partial<PhotoSession>): Promise<PhotoSession | undefined>;
  
  // Photo operations
  getPhotosBySession(sessionId: string): Promise<Photo[]>;
  getPhoto(id: string): Promise<Photo | undefined>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  updatePhoto(id: string, data: Partial<Photo>): Promise<Photo | undefined>;
  deletePhoto(id: string): Promise<void>;
  
  // Face operations
  createFace(face: InsertFace): Promise<Face>;
  getFacesByPhoto(photoId: string): Promise<Face[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (Required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Photo Session operations
  async getSessionsByUser(userId: string): Promise<PhotoSession[]> {
    return await db
      .select()
      .from(photoSessions)
      .where(eq(photoSessions.userId, userId))
      .orderBy(desc(photoSessions.createdAt));
  }

  async getSession(id: string): Promise<PhotoSession | undefined> {
    const [session] = await db
      .select()
      .from(photoSessions)
      .where(eq(photoSessions.id, id));
    return session;
  }

  async createSession(sessionData: InsertPhotoSession): Promise<PhotoSession> {
    const [session] = await db
      .insert(photoSessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async updateSession(id: string, data: Partial<PhotoSession>): Promise<PhotoSession | undefined> {
    const [session] = await db
      .update(photoSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(photoSessions.id, id))
      .returning();
    return session;
  }

  // Photo operations
  async getPhotosBySession(sessionId: string): Promise<Photo[]> {
    return await db
      .select()
      .from(photos)
      .where(eq(photos.sessionId, sessionId))
      .orderBy(photos.uploadOrder);
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

export const storage = new DatabaseStorage();
