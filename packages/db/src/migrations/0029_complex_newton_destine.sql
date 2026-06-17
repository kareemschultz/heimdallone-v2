CREATE TYPE "public"."certification_status" AS ENUM('active', 'revoked', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('enrolled', 'in_progress', 'completed', 'failed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."skill_assessment_source" AS ENUM('self', 'manager', 'hr', 'import');--> statement-breakpoint
CREATE TYPE "public"."training_delivery" AS ENUM('internal', 'external', 'online', 'in_person', 'blended');--> statement-breakpoint
CREATE TYPE "public"."training_program_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "certification_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"issuing_body" text,
	"requires_renewal" boolean DEFAULT true NOT NULL,
	"default_validity_months" integer,
	"reminder_threshold_days" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_certification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"certification_type_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"credential_id" text,
	"issue_date" date,
	"expiry_date" date,
	"document_id" text,
	"status" "certification_status" DEFAULT 'active' NOT NULL,
	"recorded_by_user_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_type_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"proficiency_level" text NOT NULL,
	"proficiency_ordinal" integer NOT NULL,
	"source" "skill_assessment_source" DEFAULT 'self' NOT NULL,
	"assessed_by_user_id" text,
	"assessed_at" timestamp,
	"note" text,
	"linked_candidate_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "skill_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"proficiency_levels" jsonb NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "training_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "training_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"program_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"status" "enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"enrolled_by_user_id" text,
	"score_percent" integer,
	"attempts_used" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_module" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"program_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_program" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" text,
	"delivery" "training_delivery" DEFAULT 'internal' NOT NULL,
	"provider" text,
	"duration_hours" numeric(7, 2),
	"passing_score_percent" integer,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"allow_self_enroll" boolean DEFAULT true NOT NULL,
	"status" "training_program_status" DEFAULT 'draft' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "certification_type" ADD CONSTRAINT "certification_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certification" ADD CONSTRAINT "employee_certification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certification" ADD CONSTRAINT "employee_certification_certification_type_id_certification_type_id_fk" FOREIGN KEY ("certification_type_id") REFERENCES "public"."certification_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certification" ADD CONSTRAINT "employee_certification_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certification" ADD CONSTRAINT "employee_certification_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill" ADD CONSTRAINT "employee_skill_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill" ADD CONSTRAINT "employee_skill_skill_type_id_skill_type_id_fk" FOREIGN KEY ("skill_type_id") REFERENCES "public"."skill_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill" ADD CONSTRAINT "employee_skill_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill" ADD CONSTRAINT "employee_skill_assessed_by_user_id_user_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill" ADD CONSTRAINT "employee_skill_linked_candidate_id_candidate_id_fk" FOREIGN KEY ("linked_candidate_id") REFERENCES "public"."candidate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category" ADD CONSTRAINT "skill_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_type" ADD CONSTRAINT "skill_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_type" ADD CONSTRAINT "skill_type_category_id_skill_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_category" ADD CONSTRAINT "training_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollment" ADD CONSTRAINT "training_enrollment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollment" ADD CONSTRAINT "training_enrollment_program_id_training_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_program"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollment" ADD CONSTRAINT "training_enrollment_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollment" ADD CONSTRAINT "training_enrollment_enrolled_by_user_id_user_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_module" ADD CONSTRAINT "training_module_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_module" ADD CONSTRAINT "training_module_program_id_training_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program" ADD CONSTRAINT "training_program_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program" ADD CONSTRAINT "training_program_category_id_training_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."training_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certification_type_org_idx" ON "certification_type" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_type_org_name_uq" ON "certification_type" USING btree ("organization_id","name") WHERE "certification_type"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "employee_certification_org_idx" ON "employee_certification" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employee_certification_org_employee_idx" ON "employee_certification" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_certification_org_expiry_idx" ON "employee_certification" USING btree ("organization_id","expiry_date");--> statement-breakpoint
CREATE INDEX "employee_certification_type_idx" ON "employee_certification" USING btree ("certification_type_id");--> statement-breakpoint
CREATE INDEX "employee_skill_org_idx" ON "employee_skill" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employee_skill_org_employee_idx" ON "employee_skill" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_skill_type_ordinal_idx" ON "employee_skill" USING btree ("skill_type_id","proficiency_ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_skill_employee_type_uq" ON "employee_skill" USING btree ("employee_id","skill_type_id");--> statement-breakpoint
CREATE INDEX "skill_category_org_idx" ON "skill_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_category_org_name_uq" ON "skill_category" USING btree ("organization_id","name") WHERE "skill_category"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "skill_type_org_idx" ON "skill_type" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_type_org_name_uq" ON "skill_type" USING btree ("organization_id","name") WHERE "skill_type"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "training_category_org_idx" ON "training_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_category_org_name_uq" ON "training_category" USING btree ("organization_id","name") WHERE "training_category"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "training_enrollment_org_idx" ON "training_enrollment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_enrollment_org_employee_idx" ON "training_enrollment" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "training_enrollment_org_program_idx" ON "training_enrollment" USING btree ("organization_id","program_id");--> statement-breakpoint
CREATE INDEX "training_enrollment_program_idx" ON "training_enrollment" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "training_module_program_idx" ON "training_module" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "training_program_org_idx" ON "training_program" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_program_org_status_idx" ON "training_program" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_program_org_reference_uq" ON "training_program" USING btree ("organization_id","reference") WHERE "training_program"."deleted_at" is null;