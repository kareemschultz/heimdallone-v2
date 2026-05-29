CREATE TYPE "public"."document_request_status" AS ENUM('requested', 'uploaded', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."onboarding_category" AS ENUM('document', 'equipment', 'policy', 'training', 'introduction', 'other');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('not_started', 'in_progress', 'blocked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."onboarding_task_status" AS ENUM('todo', 'in_progress', 'waiting', 'completed', 'skipped', 'blocked');--> statement-breakpoint
CREATE TABLE "employee_onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"application_id" text,
	"template_id" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"target_completion_at" timestamp,
	"completed_at" timestamp,
	"status" "onboarding_status" DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_acknowledgement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"onboarding_id" text NOT NULL,
	"policy_name" text NOT NULL,
	"policy_version" text,
	"policy_url" text,
	"acknowledged_at" timestamp,
	"acknowledged_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"onboarding_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_document_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"onboarding_id" text NOT NULL,
	"onboarding_task_id" text,
	"document_type" text NOT NULL,
	"required_file_types" jsonb,
	"status" "document_request_status" DEFAULT 'requested' NOT NULL,
	"uploaded_file_url" text,
	"uploaded_at" timestamp,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"onboarding_id" text NOT NULL,
	"template_task_id" text,
	"title_snapshot" text NOT NULL,
	"description_snapshot" text,
	"category" "onboarding_category" NOT NULL,
	"assignee_employee_id" text,
	"assignee_user_id" text,
	"due_at" timestamp,
	"status" "onboarding_task_status" DEFAULT 'todo' NOT NULL,
	"completed_at" timestamp,
	"completed_by_user_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_template_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "onboarding_category" NOT NULL,
	"default_assignee_role" text,
	"due_offset_days" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_template_id_onboarding_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_acknowledgement" ADD CONSTRAINT "onboarding_acknowledgement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_acknowledgement" ADD CONSTRAINT "onboarding_acknowledgement_onboarding_id_employee_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."employee_onboarding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_acknowledgement" ADD CONSTRAINT "onboarding_acknowledgement_acknowledged_by_user_id_user_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_activity" ADD CONSTRAINT "onboarding_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_activity" ADD CONSTRAINT "onboarding_activity_onboarding_id_employee_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."employee_onboarding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_activity" ADD CONSTRAINT "onboarding_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_document_request" ADD CONSTRAINT "onboarding_document_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_document_request" ADD CONSTRAINT "onboarding_document_request_onboarding_id_employee_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."employee_onboarding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_document_request" ADD CONSTRAINT "onboarding_document_request_onboarding_task_id_onboarding_task_id_fk" FOREIGN KEY ("onboarding_task_id") REFERENCES "public"."onboarding_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_document_request" ADD CONSTRAINT "onboarding_document_request_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_onboarding_id_employee_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."employee_onboarding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_template_task_id_onboarding_template_task_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."onboarding_template_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_assignee_employee_id_employee_profile_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_template" ADD CONSTRAINT "onboarding_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_template_task" ADD CONSTRAINT "onboarding_template_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_template_task" ADD CONSTRAINT "onboarding_template_task_template_id_onboarding_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_onboarding_org_status_idx" ON "employee_onboarding" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employee_onboarding_employee_idx" ON "employee_onboarding" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "onboarding_ack_onboarding_idx" ON "onboarding_acknowledgement" USING btree ("onboarding_id");--> statement-breakpoint
CREATE INDEX "onboarding_activity_onboarding_created_idx" ON "onboarding_activity" USING btree ("onboarding_id","created_at");--> statement-breakpoint
CREATE INDEX "onboarding_doc_request_onboarding_status_idx" ON "onboarding_document_request" USING btree ("onboarding_id","status");--> statement-breakpoint
CREATE INDEX "onboarding_task_onboarding_idx" ON "onboarding_task" USING btree ("onboarding_id");--> statement-breakpoint
CREATE INDEX "onboarding_task_assignee_status_idx" ON "onboarding_task" USING btree ("assignee_employee_id","status");--> statement-breakpoint
CREATE INDEX "onboarding_task_org_due_idx" ON "onboarding_task" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "onboarding_template_org_idx" ON "onboarding_template" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_template_org_name_uq" ON "onboarding_template" USING btree ("organization_id","name") WHERE "onboarding_template"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "onboarding_template_task_template_idx" ON "onboarding_template_task" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "onboarding_template_task_org_idx" ON "onboarding_template_task" USING btree ("organization_id");