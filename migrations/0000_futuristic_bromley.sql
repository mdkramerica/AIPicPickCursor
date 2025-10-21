CREATE TABLE "convertkit_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subscriber_id" varchar,
	"email_consent" boolean DEFAULT false,
	"marketing_consent" boolean DEFAULT false,
	"tags" text[],
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"campaign_type" varchar(50),
	"convertkit_broadcast_id" varchar,
	"status" varchar(50) DEFAULT 'pending',
	"sent_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" varchar NOT NULL,
	"person_index" integer,
	"bounding_box" jsonb,
	"landmarks" jsonb,
	"eyes_open" boolean,
	"eyes_confidence" numeric(5, 2),
	"smile_detected" boolean,
	"smile_confidence" numeric(5, 2),
	"expression" varchar(50),
	"head_angle" jsonb,
	"quality_score" numeric(5, 2),
	"excluded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255),
	"status" varchar(50) DEFAULT 'uploading' NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"best_photo_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"thumbnail_url" varchar(500),
	"original_filename" varchar(255),
	"file_size" integer,
	"width" integer,
	"height" integer,
	"upload_order" integer,
	"is_selected_best" boolean DEFAULT false NOT NULL,
	"quality_score" numeric(5, 2),
	"analysis_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "convertkit_settings" ADD CONSTRAINT "convertkit_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_session_id_photo_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."photo_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD CONSTRAINT "photo_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_session_id_photo_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."photo_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_convertkit_settings_user_id" ON "convertkit_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_convertkit_settings_subscriber_id" ON "convertkit_settings" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_session_id" ON "email_campaigns" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_status" ON "email_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_type" ON "email_campaigns" USING btree ("campaign_type");--> statement-breakpoint
CREATE INDEX "idx_faces_photo_id" ON "faces" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "idx_faces_person_index" ON "faces" USING btree ("person_index");--> statement-breakpoint
CREATE INDEX "idx_photo_sessions_user_id" ON "photo_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_photo_sessions_created_at" ON "photo_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_photo_sessions_status" ON "photo_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_photos_session_id" ON "photos" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_photos_upload_order" ON "photos" USING btree ("upload_order");--> statement-breakpoint
CREATE INDEX "idx_photos_is_selected_best" ON "photos" USING btree ("is_selected_best");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");