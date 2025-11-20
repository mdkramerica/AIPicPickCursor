import { db } from "../db";
import { convertKitSettings, emailCampaigns, type ConvertKitSettings, type InsertConvertKitSettings, type EmailCampaign, type InsertEmailCampaign } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export class IntegrationRepository {
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

export const integrationRepository = new IntegrationRepository();

