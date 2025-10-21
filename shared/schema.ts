import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  decimal,
  boolean,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (Required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (Required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Photo Sessions Table
export const photoSessions = pgTable("photo_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("uploading").notNull(), // uploading, analyzing, completed, failed
  photoCount: integer("photo_count").default(0).notNull(),
  bestPhotoId: varchar("best_photo_id"),
  bulkMode: boolean("bulk_mode").default(false).notNull(),
  targetGroupSize: integer("target_group_size").default(5).notNull(),
  groupingAlgorithm: varchar("grouping_algorithm", { length: 50 }).default("temporal_similarity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_photo_sessions_user_id").on(table.userId),
  index("idx_photo_sessions_created_at").on(table.createdAt),
  index("idx_photo_sessions_status").on(table.status),
  index("idx_photo_sessions_bulk_mode").on(table.bulkMode),
]);

// Photos Table
export const photos = pgTable("photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => photoSessions.id, { onDelete: "cascade" }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
  originalFilename: varchar("original_filename", { length: 255 }),
  fileSize: integer("file_size"),
  width: integer("width"),
  height: integer("height"),
  uploadOrder: integer("upload_order"),
  isSelectedBest: boolean("is_selected_best").default(false).notNull(),
  qualityScore: decimal("quality_score", { precision: 5, scale: 2 }), // 0-100 score
  analysisData: jsonb("analysis_data"), // Store complete analysis results
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_photos_session_id").on(table.sessionId),
  index("idx_photos_upload_order").on(table.uploadOrder),
  index("idx_photos_is_selected_best").on(table.isSelectedBest),
]);

// Faces Table (detected faces in each photo)
export const faces = pgTable("faces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  photoId: varchar("photo_id").references(() => photos.id, { onDelete: "cascade" }).notNull(),
  personIndex: integer("person_index"), // for grouping same person across photos
  boundingBox: jsonb("bounding_box"), // {x, y, width, height}
  landmarks: jsonb("landmarks"), // facial landmarks coordinates
  eyesOpen: boolean("eyes_open"),
  eyesConfidence: decimal("eyes_confidence", { precision: 5, scale: 2 }),
  smileDetected: boolean("smile_detected"),
  smileConfidence: decimal("smile_confidence", { precision: 5, scale: 2 }),
  expression: varchar("expression", { length: 50 }), // happy, neutral, sad, surprised
  headAngle: jsonb("head_angle"), // {pitch, yaw, roll}
  qualityScore: decimal("quality_score", { precision: 5, scale: 2 }),
  excluded: boolean("excluded").default(false).notNull(), // user can exclude faces from analysis
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_faces_photo_id").on(table.photoId),
  index("idx_faces_person_index").on(table.personIndex),
]);

// ConvertKit integration settings
export const convertKitSettings = pgTable("convertkit_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  subscriberId: varchar("subscriber_id"), // ConvertKit subscriber ID
  emailConsent: boolean("email_consent").default(false),
  marketingConsent: boolean("marketing_consent").default(false),
  autoSubscribed: boolean("auto_subscribed").default(false), // Track if user was auto-subscribed
  tags: text("tags").array(), // Array of ConvertKit tag IDs
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_convertkit_settings_user_id").on(table.userId),
  index("idx_convertkit_settings_subscriber_id").on(table.subscriberId),
]);

// Photo Groups Table
export const photoGroups = pgTable("photo_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => photoSessions.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }),
  groupType: varchar("group_type", { length: 50 }).default("auto").notNull(), // auto, manual, merged
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 2 }),
  timeWindowStart: timestamp("time_window_start"),
  timeWindowEnd: timestamp("time_window_end"),
  bestPhotoId: varchar("best_photo_id").references(() => photos.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_photo_groups_session_id").on(table.sessionId),
  index("idx_photo_groups_type").on(table.groupType),
  index("idx_photo_groups_created_at").on(table.createdAt),
]);

// Photo Group Memberships Table (Many-to-Many relationship between photos and groups)
export const photoGroupMemberships = pgTable("photo_group_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => photoGroups.id, { onDelete: "cascade" }).notNull(),
  photoId: varchar("photo_id").references(() => photos.id, { onDelete: "cascade" }).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  isExcluded: boolean("is_excluded").default(false).notNull(),
  userNotes: text("user_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_photo_group_memberships_group_id").on(table.groupId),
  index("idx_photo_group_memberships_photo_id").on(table.photoId),
  index("idx_photo_group_memberships_is_excluded").on(table.isExcluded),
  { name: "idx_photo_group_memberships_unique", columns: [table.groupId, table.photoId], unique: true },
]);

// Email campaigns for photo analysis results
export const emailCampaigns = pgTable("email_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => photoSessions.id, { onDelete: "cascade" }).notNull(),
  campaignType: varchar("campaign_type", { length: 50 }), // 'analysis_complete', 'tips', 'follow_up', 'newsletter'
  convertKitBroadcastId: varchar("convertkit_broadcast_id"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, sent, failed
  sentAt: timestamp("sent_at"),
  error: text("error"), // Store error message if failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_email_campaigns_session_id").on(table.sessionId),
  index("idx_email_campaigns_status").on(table.status),
  index("idx_email_campaigns_type").on(table.campaignType),
]);

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(photoSessions),
  convertKitSettings: many(convertKitSettings),
}));

export const photoSessionsRelations = relations(photoSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [photoSessions.userId],
    references: [users.id],
  }),
  photos: many(photos),
  emailCampaigns: many(emailCampaigns),
  photoGroups: many(photoGroups),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  session: one(photoSessions, {
    fields: [photos.sessionId],
    references: [photoSessions.id],
  }),
  faces: many(faces),
  groupMemberships: many(photoGroupMemberships),
}));

export const facesRelations = relations(faces, ({ one }) => ({
  photo: one(photos, {
    fields: [faces.photoId],
    references: [photos.id],
  }),
}));

export const convertKitSettingsRelations = relations(convertKitSettings, ({ one }) => ({
  user: one(users, {
    fields: [convertKitSettings.userId],
    references: [users.id],
  }),
}));

export const photoGroupsRelations = relations(photoGroups, ({ one, many }) => ({
  session: one(photoSessions, {
    fields: [photoGroups.sessionId],
    references: [photoSessions.id],
  }),
  bestPhoto: one(photos, {
    fields: [photoGroups.bestPhotoId],
    references: [photos.id],
  }),
  memberships: many(photoGroupMemberships),
}));

export const photoGroupMembershipsRelations = relations(photoGroupMemberships, ({ one }) => ({
  group: one(photoGroups, {
    fields: [photoGroupMemberships.groupId],
    references: [photoGroups.id],
  }),
  photo: one(photos, {
    fields: [photoGroupMemberships.photoId],
    references: [photos.id],
  }),
}));

export const emailCampaignsRelations = relations(emailCampaigns, ({ one }) => ({
  session: one(photoSessions, {
    fields: [emailCampaigns.sessionId],
    references: [photoSessions.id],
  }),
}));

// Zod schemas for validation
export const insertPhotoSessionSchema = createInsertSchema(photoSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPhotoSchema = createInsertSchema(photos).omit({
  id: true,
  createdAt: true,
});

export const insertFaceSchema = createInsertSchema(faces).omit({
  id: true,
  createdAt: true,
});

export const insertConvertKitSettingsSchema = z.object({
  userId: z.string(),
  subscriberId: z.string().optional(),
  emailConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  autoSubscribed: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
  unsubscribedAt: z.date().optional(),
});

export const insertEmailCampaignSchema = z.object({
  sessionId: z.string(),
  campaignType: z.string().optional(),
  convertKitBroadcastId: z.string().optional(),
  status: z.string().default('pending'),
  error: z.string().optional(),
});

export const insertPhotoGroupSchema = createInsertSchema(photoGroups).omit({
  id: true,
  createdAt: true,
});

export const insertPhotoGroupMembershipSchema = createInsertSchema(photoGroupMemberships).omit({
  id: true,
  createdAt: true,
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export type PhotoSession = typeof photoSessions.$inferSelect;
export type InsertPhotoSession = z.infer<typeof insertPhotoSessionSchema>;

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;

export type Face = typeof faces.$inferSelect;
export type InsertFace = z.infer<typeof insertFaceSchema>;

export type ConvertKitSettings = typeof convertKitSettings.$inferSelect;
export type InsertConvertKitSettings = z.infer<typeof insertConvertKitSettingsSchema>;

export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;

export type PhotoGroup = typeof photoGroups.$inferSelect;
export type InsertPhotoGroup = z.infer<typeof insertPhotoGroupSchema>;

export type PhotoGroupMembership = typeof photoGroupMemberships.$inferSelect;
export type InsertPhotoGroupMembership = z.infer<typeof insertPhotoGroupMembershipSchema>;

// Additional types for bulk operations
export interface BulkSessionOptions {
  targetGroupSize?: number;
  groupingAlgorithm?: string;
  [key: string]: any;
}

// Analysis result types (not stored in DB, used for API responses)
export interface FaceAnalysis {
  faceId: string;
  personIndex: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    mouthLeft: { x: number; y: number };
    mouthRight: { x: number; y: number };
  };
  attributes: {
    eyesOpen: {
      detected: boolean;
      confidence: number; // 0-1
    };
    smile: {
      detected: boolean;
      confidence: number; // 0-1
      intensity: number; // 0-1
    };
    expression: 'happy' | 'neutral' | 'sad' | 'surprised' | 'angry';
    headPose: {
      pitch: number; // -90 to 90
      yaw: number; // -90 to 90
      roll: number; // -180 to 180
    };
  };
  qualityScore: number; // 0-100
}

export interface PhotoAnalysisResult {
  photoId: string;
  faces: FaceAnalysis[];
  overallQualityScore: number;
  issues: {
    closedEyes: number;
    poorExpressions: number;
    blurryFaces: number;
  };
  recommendation: 'best' | 'good' | 'acceptable' | 'poor';
}

export interface SessionAnalysisResult {
  sessionId: string;
  photos: PhotoAnalysisResult[];
  bestPhotoId: string | null;
  requiresComposite: boolean;
}
