CREATE TABLE "photo_group_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"photo_id" varchar NOT NULL,
	"confidence_score" numeric(5, 2),
	"is_excluded" boolean DEFAULT false NOT NULL,
	"user_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"name" varchar(255),
	"group_type" varchar(50) DEFAULT 'auto' NOT NULL,
	"confidence_score" numeric(5, 2),
	"similarity_score" numeric(5, 2),
	"time_window_start" timestamp,
	"time_window_end" timestamp,
	"best_photo_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN "bulk_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN "target_group_size" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN "grouping_algorithm" varchar(50) DEFAULT 'temporal_similarity' NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_group_memberships" ADD CONSTRAINT "photo_group_memberships_group_id_photo_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."photo_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_group_memberships" ADD CONSTRAINT "photo_group_memberships_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_groups" ADD CONSTRAINT "photo_groups_session_id_photo_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."photo_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_groups" ADD CONSTRAINT "photo_groups_best_photo_id_photos_id_fk" FOREIGN KEY ("best_photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_photo_group_memberships_group_id" ON "photo_group_memberships" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_photo_group_memberships_photo_id" ON "photo_group_memberships" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "idx_photo_group_memberships_is_excluded" ON "photo_group_memberships" USING btree ("is_excluded");--> statement-breakpoint
CREATE INDEX "idx_photo_groups_session_id" ON "photo_groups" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_photo_groups_type" ON "photo_groups" USING btree ("group_type");--> statement-breakpoint
CREATE INDEX "idx_photo_groups_created_at" ON "photo_groups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_photo_sessions_bulk_mode" ON "photo_sessions" USING btree ("bulk_mode");