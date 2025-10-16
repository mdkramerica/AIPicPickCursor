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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(photoSessions),
}));

export const photoSessionsRelations = relations(photoSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [photoSessions.userId],
    references: [users.id],
  }),
  photos: many(photos),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  session: one(photoSessions, {
    fields: [photos.sessionId],
    references: [photoSessions.id],
  }),
  faces: many(faces),
}));

export const facesRelations = relations(faces, ({ one }) => ({
  photo: one(photos, {
    fields: [faces.photoId],
    references: [photos.id],
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

// TypeScript types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export type PhotoSession = typeof photoSessions.$inferSelect;
export type InsertPhotoSession = z.infer<typeof insertPhotoSessionSchema>;

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;

export type Face = typeof faces.$inferSelect;
export type InsertFace = z.infer<typeof insertFaceSchema>;

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
