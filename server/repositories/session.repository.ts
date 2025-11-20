import { db } from "../db";
import { photoSessions, type PhotoSession, type InsertPhotoSession, type BulkSessionOptions } from "@shared/schema";
import { eq, desc, count } from "drizzle-orm";

export class SessionRepository {
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

export const sessionRepository = new SessionRepository();

