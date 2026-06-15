ALTER TABLE "user" ADD COLUMN "migrated_from_v1" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "first_login_after_migration_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "migration_notice_acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_review_completed_at" timestamp;