// Reference: blueprint:javascript_log_in_with_replit, blueprint:javascript_database
import {
  users,
  photoSessions,
  photos,
  faces,
  convertKitSettings,
  emailCampaigns,
  type User,
  type UpsertUser,
  type PhotoSession,
  type InsertPhotoSession,
  type Photo,
  type InsertPhoto,
  type Face,
  type InsertFace,
  type ConvertKitSettings,
  type InsertConvertKitSettings,
  type EmailCampaign,
  type InsertEmailCampaign,
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
  
  // ConvertKit operations
  getConvertKitSettings(userId: string): Promise<ConvertKitSettings | undefined>;
  createConvertKitSettings(settings: InsertConvertKitSettings): Promise<ConvertKitSettings>;
  updateConvertKitSettings(userId: string, data: Partial<ConvertKitSettings>): Promise<ConvertKitSettings | undefined>;
  
  // Email Campaign operations
  getEmailCampaignsBySession(sessionId: string): Promise<EmailCampaign[]>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, data: Partial<EmailCampaign>): Promise<EmailCampaign | undefined>;
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

  // ConvertKit operations
  async getConvertKitSettings(userId: string): Promise<ConvertKitSettings | undefined> {
    const [settings] = await db
      .select()
      .from(convertKitSettings)
      .where(eq(convertKitSettings.userId, userId));
    return settings;
  }

  async createConvertKitSettings(settingsData: InsertConvertKitSettings): Promise<ConvertKitSettings> {
    const [settings] = await db
      .insert(convertKitSettings)
      .values(settingsData)
      .returning();
    return settings;
  }

  async updateConvertKitSettings(userId: string, data: Partial<ConvertKitSettings>): Promise<ConvertKitSettings | undefined> {
    const [settings] = await db
      .update(convertKitSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(convertKitSettings.userId, userId))
      .returning();
    return settings;
  }

  // Email Campaign operations
  async getEmailCampaignsBySession(sessionId: string): Promise<EmailCampaign[]> {
    return await db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.sessionId, sessionId))
      .orderBy(desc(emailCampaigns.createdAt));
  }

  async createEmailCampaign(campaignData: InsertEmailCampaign): Promise<EmailCampaign> {
    const [campaign] = await db
      .insert(emailCampaigns)
      .values(campaignData)
      .returning();
    return campaign;
  }

  async updateEmailCampaign(id: string, data: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
    const [campaign] = await db
      .update(emailCampaigns)
      .set(data)
      .where(eq(emailCampaigns.id, id))
      .returning();
    return campaign;
  }
}

export const storage = new DatabaseStorage();
