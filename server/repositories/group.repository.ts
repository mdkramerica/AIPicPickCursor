import { db } from "../db";
import { photoGroups, photoGroupMemberships, type PhotoGroup, type InsertPhotoGroup, type PhotoGroupMembership, type InsertPhotoGroupMembership } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export class GroupRepository {
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
}

export const groupRepository = new GroupRepository();

