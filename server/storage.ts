// Reference: blueprint:javascript_log_in_with_replit, blueprint:javascript_database
import {
  users,
  photoSessions,
  photos,
  faces,
  convertKitSettings,
  emailCampaigns,
  photoGroups,
  photoGroupMemberships,
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
  type PhotoGroup,
  type InsertPhotoGroup,
  type PhotoGroupMembership,
  type InsertPhotoGroupMembership,
  type BulkSessionOptions,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, isNull, count } from "drizzle-orm";

export interface IStorage {
  // User operations (Required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Photo Session operations
  getSessionsByUser(userId: string): Promise<PhotoSession[]>;
  getSessionsByUserPaginated(userId: string, options?: { limit?: number; offset?: number }): Promise<PhotoSession[]>;
  countSessionsByUser(userId: string): Promise<number>;
  getSession(id: string): Promise<PhotoSession | undefined>;
  createSession(session: InsertPhotoSession): Promise<PhotoSession>;
  updateSession(id: string, data: Partial<PhotoSession>): Promise<PhotoSession | undefined>;
  updateSessionBulkMode(sessionId: string, bulkMode: boolean, options?: BulkSessionOptions): Promise<PhotoSession | undefined>;
  
  // Photo operations
  getPhotosBySession(sessionId: string): Promise<Photo[]>;
  getPhotosBySessionPaginated(sessionId: string, options?: { limit?: number; offset?: number }): Promise<Photo[]>;
  countPhotosBySession(sessionId: string): Promise<number>;
  getPhoto(id: string): Promise<Photo | undefined>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  updatePhoto(id: string, data: Partial<Photo>): Promise<Photo | undefined>;
  deletePhoto(id: string): Promise<void>;
  
  // Face operations
  createFace(face: InsertFace): Promise<Face>;
  getFacesByPhoto(photoId: string): Promise<Face[]>;
  
  // Photo Group operations
  getGroupsBySession(sessionId: string): Promise<PhotoGroup[]>;
  getGroup(id: string): Promise<PhotoGroup | undefined>;
  createGroup(group: InsertPhotoGroup): Promise<PhotoGroup>;
  updateGroup(id: string, data: Partial<PhotoGroup>): Promise<PhotoGroup | undefined>;
  deleteGroup(id: string): Promise<void>;
  
  // Photo Group Membership operations
  getMembershipsByGroup(groupId: string): Promise<PhotoGroupMembership[]>;
  getMembershipsByPhoto(photoId: string): Promise<PhotoGroupMembership[]>;
  addPhotoToGroup(groupId: string, photoId: string, data?: Partial<InsertPhotoGroupMembership>): Promise<PhotoGroupMembership>;
  removePhotoFromGroup(groupId: string, photoId: string): Promise<void>;
  updateMembership(membershipId: string, data: Partial<PhotoGroupMembership>): Promise<PhotoGroupMembership | undefined>;
  
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

  async getSessionsByUserPaginated(userId: string, options?: { limit?: number; offset?: number }): Promise<PhotoSession[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    
    return await db
      .select()
      .from(photoSessions)
      .where(eq(photoSessions.userId, userId))
      .orderBy(desc(photoSessions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countSessionsByUser(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(photoSessions)
      .where(eq(photoSessions.userId, userId));
    
    return result?.count ?? 0;
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

  // Photo Group operations
  async getGroupsBySession(sessionId: string): Promise<PhotoGroup[]> {
    return await db
      .select()
      .from(photoGroups)
      .where(eq(photoGroups.sessionId, sessionId))
      .orderBy(desc(photoGroups.createdAt));
  }

  async getGroup(id: string): Promise<PhotoGroup | undefined> {
    const [group] = await db
      .select()
      .from(photoGroups)
      .where(eq(photoGroups.id, id));
    return group;
  }

  async createGroup(groupData: InsertPhotoGroup): Promise<PhotoGroup> {
    const [group] = await db
      .insert(photoGroups)
      .values(groupData)
      .returning();
    return group;
  }

  async updateGroup(id: string, data: Partial<PhotoGroup>): Promise<PhotoGroup | undefined> {
    const [group] = await db
      .update(photoGroups)
      .set(data)
      .where(eq(photoGroups.id, id))
      .returning();
    return group;
  }

  async deleteGroup(id: string): Promise<void> {
    await db
      .delete(photoGroups)
      .where(eq(photoGroups.id, id));
  }

  // Photo Group Membership operations
  async getMembershipsByGroup(groupId: string): Promise<PhotoGroupMembership[]> {
    return await db
      .select()
      .from(photoGroupMemberships)
      .where(eq(photoGroupMemberships.groupId, groupId));
  }

  async getMembershipsByPhoto(photoId: string): Promise<PhotoGroupMembership[]> {
    return await db
      .select()
      .from(photoGroupMemberships)
      .where(eq(photoGroupMemberships.photoId, photoId));
  }

  async addPhotoToGroup(groupId: string, photoId: string, data?: Partial<InsertPhotoGroupMembership>): Promise<PhotoGroupMembership> {
    const [membership] = await db
      .insert(photoGroupMemberships)
      .values({
        groupId,
        photoId,
        ...data,
      })
      .returning();
    return membership;
  }

  async removePhotoFromGroup(groupId: string, photoId: string): Promise<void> {
    await db
      .delete(photoGroupMemberships)
      .where(and(
        eq(photoGroupMemberships.groupId, groupId),
        eq(photoGroupMemberships.photoId, photoId)
      ));
  }

  async updateMembership(membershipId: string, data: Partial<PhotoGroupMembership>): Promise<PhotoGroupMembership | undefined> {
    const [membership] = await db
      .update(photoGroupMemberships)
      .set(data)
      .where(eq(photoGroupMemberships.id, membershipId))
      .returning();
    return membership;
  }

  // Bulk Session Operations
  async updateSessionBulkMode(sessionId: string, bulkMode: boolean, options?: BulkSessionOptions): Promise<PhotoSession | undefined> {
    const updateData: Partial<PhotoSession> = {
      bulkMode,
      updatedAt: new Date(),
    };

    if (options) {
      if (options.targetGroupSize !== undefined) {
        updateData.targetGroupSize = options.targetGroupSize;
      }
      if (options.groupingAlgorithm !== undefined) {
        updateData.groupingAlgorithm = options.groupingAlgorithm;
      }
    }

    const [session] = await db
      .update(photoSessions)
      .set(updateData)
      .where(eq(photoSessions.id, sessionId))
      .returning();
    return session;
  }
}

export const storage = new DatabaseStorage();
