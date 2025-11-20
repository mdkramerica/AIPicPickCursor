import {
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

import { userRepository } from "./repositories/user.repository";
import { sessionRepository } from "./repositories/session.repository";
import { photoRepository } from "./repositories/photo.repository";
import { groupRepository } from "./repositories/group.repository";
import { integrationRepository } from "./repositories/integration.repository";

export interface IStorage {
  // User operations
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
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return userRepository.getUser(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return userRepository.upsertUser(userData);
  }

  // Photo Session operations
  async getSessionsByUser(userId: string): Promise<PhotoSession[]> {
    return sessionRepository.getSessionsByUser(userId);
  }

  async getSessionsByUserPaginated(userId: string, options?: { limit?: number; offset?: number }): Promise<PhotoSession[]> {
    return sessionRepository.getSessionsByUserPaginated(userId, options);
  }

  async countSessionsByUser(userId: string): Promise<number> {
    return sessionRepository.countSessionsByUser(userId);
  }

  async getSession(id: string): Promise<PhotoSession | undefined> {
    return sessionRepository.getSession(id);
  }

  async createSession(sessionData: InsertPhotoSession): Promise<PhotoSession> {
    return sessionRepository.createSession(sessionData);
  }

  async updateSession(id: string, data: Partial<PhotoSession>): Promise<PhotoSession | undefined> {
    return sessionRepository.updateSession(id, data);
  }

  async updateSessionBulkMode(sessionId: string, bulkMode: boolean, options?: BulkSessionOptions): Promise<PhotoSession | undefined> {
    return sessionRepository.updateSessionBulkMode(sessionId, bulkMode, options);
  }

  // Photo operations
  async getPhotosBySession(sessionId: string): Promise<Photo[]> {
    return photoRepository.getPhotosBySession(sessionId);
  }

  async getPhotosBySessionPaginated(sessionId: string, options?: { limit?: number; offset?: number }): Promise<Photo[]> {
    return photoRepository.getPhotosBySessionPaginated(sessionId, options);
  }

  async countPhotosBySession(sessionId: string): Promise<number> {
    return photoRepository.countPhotosBySession(sessionId);
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    return photoRepository.getPhoto(id);
  }

  async createPhoto(photoData: InsertPhoto): Promise<Photo> {
    return photoRepository.createPhoto(photoData);
  }

  async updatePhoto(id: string, data: Partial<Photo>): Promise<Photo | undefined> {
    return photoRepository.updatePhoto(id, data);
  }

  async deletePhoto(id: string): Promise<void> {
    return photoRepository.deletePhoto(id);
  }

  // Face operations
  async createFace(faceData: InsertFace): Promise<Face> {
    return photoRepository.createFace(faceData);
  }

  async getFacesByPhoto(photoId: string): Promise<Face[]> {
    return photoRepository.getFacesByPhoto(photoId);
  }

  // Photo Group operations
  async getGroupsBySession(sessionId: string): Promise<PhotoGroup[]> {
    return groupRepository.getGroupsBySession(sessionId);
  }

  async getGroup(id: string): Promise<PhotoGroup | undefined> {
    return groupRepository.getGroup(id);
  }

  async createGroup(groupData: InsertPhotoGroup): Promise<PhotoGroup> {
    return groupRepository.createGroup(groupData);
  }

  async updateGroup(id: string, data: Partial<PhotoGroup>): Promise<PhotoGroup | undefined> {
    return groupRepository.updateGroup(id, data);
  }

  async deleteGroup(id: string): Promise<void> {
    return groupRepository.deleteGroup(id);
  }

  // Photo Group Membership operations
  async getMembershipsByGroup(groupId: string): Promise<PhotoGroupMembership[]> {
    return groupRepository.getMembershipsByGroup(groupId);
  }

  async getMembershipsByPhoto(photoId: string): Promise<PhotoGroupMembership[]> {
    return groupRepository.getMembershipsByPhoto(photoId);
  }

  async addPhotoToGroup(groupId: string, photoId: string, data?: Partial<InsertPhotoGroupMembership>): Promise<PhotoGroupMembership> {
    return groupRepository.addPhotoToGroup(groupId, photoId, data);
  }

  async removePhotoFromGroup(groupId: string, photoId: string): Promise<void> {
    return groupRepository.removePhotoFromGroup(groupId, photoId);
  }

  async updateMembership(membershipId: string, data: Partial<PhotoGroupMembership>): Promise<PhotoGroupMembership | undefined> {
    return groupRepository.updateMembership(membershipId, data);
  }

  // ConvertKit operations
  async getConvertKitSettings(userId: string): Promise<ConvertKitSettings | undefined> {
    return integrationRepository.getConvertKitSettings(userId);
  }

  async createConvertKitSettings(settingsData: InsertConvertKitSettings): Promise<ConvertKitSettings> {
    return integrationRepository.createConvertKitSettings(settingsData);
  }

  async updateConvertKitSettings(userId: string, data: Partial<ConvertKitSettings>): Promise<ConvertKitSettings | undefined> {
    return integrationRepository.updateConvertKitSettings(userId, data);
  }

  // Email Campaign operations
  async getEmailCampaignsBySession(sessionId: string): Promise<EmailCampaign[]> {
    return integrationRepository.getEmailCampaignsBySession(sessionId);
  }

  async createEmailCampaign(campaignData: InsertEmailCampaign): Promise<EmailCampaign> {
    return integrationRepository.createEmailCampaign(campaignData);
  }

  async updateEmailCampaign(id: string, data: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
    return integrationRepository.updateEmailCampaign(id, data);
  }
}

export const storage = new DatabaseStorage();
