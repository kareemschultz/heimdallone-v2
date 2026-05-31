CREATE TYPE "public"."offboarding_access_status" AS ENUM('pending', 'revoked', 'waived');--> statement-breakpoint
CREATE TYPE "public"."offboarding_asset_status" AS ENUM('pending', 'returned', 'waived');--> statement-breakpoint
CREATE TYPE "public"."offboarding_case_status" AS ENUM('pending_approval', 'approved', 'active', 'in_clearance', 'pending_settlement', 'closed', 'rejected', 'withdrawn', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."offboarding_category" AS ENUM('clearance', 'asset_return', 'access_revocation', 'document', 'handoff', 'exit_interview', 'other');--> statement-breakpoint
CREATE TYPE "public"."offboarding_document_status" AS ENUM('requested', 'uploaded', 'approved', 'waived');--> statement-breakpoint
CREATE TYPE "public"."offboarding_exit_type" AS ENUM('resignation', 'termination', 'retirement', 'contract_end', 'involuntary');--> statement-breakpoint
CREATE TYPE "public"."offboarding_task_status" AS ENUM('todo', 'in_progress', 'done', 'skipped', 'blocked');--> statement-breakpoint
CREATE TABLE "offboarding_access_revocation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"system" text NOT NULL,
	"description" text,
	"scheduled_revoke_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by_user_id" text,
	"status" "offboarding_access_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offboarding_asset_return" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"asset_description" text NOT NULL,
	"asset_tag" text,
	"asset_id" text,
	"expected_return_date" date,
	"returned_at" timestamp,
	"condition" text,
	"received_by_user_id" text,
	"status" "offboarding_asset_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_case" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"exit_type" "offboarding_exit_type" NOT NULL,
	"exit_reason" text,
	"notice_period_days" integer,
	"notice_period_start_date" date,
	"last_working_day" date,
	"status" "offboarding_case_status" DEFAULT 'pending_approval' NOT NULL,
	"initiated_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"rejected_by_user_id" text,
	"rejected_reason" text,
	"closed_by_user_id" text,
	"closed_at" timestamp,
	"internal_note" text,
	"template_id" text,
	"contract_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_document_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"document_type" text NOT NULL,
	"title" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"file_url" text,
	"uploaded_at" timestamp,
	"approved_by_user_id" text,
	"status" "offboarding_document_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_exit_interview" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"conducted_by_user_id" text,
	"conducted_at" timestamp,
	"is_private" boolean DEFAULT true NOT NULL,
	"overall_rating" integer,
	"reason_for_leaving" text,
	"what_went_well" text,
	"what_could_improve" text,
	"would_rehire" boolean,
	"internal_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"template_task_id" text,
	"title_snapshot" text NOT NULL,
	"description_snapshot" text,
	"category" "offboarding_category" NOT NULL,
	"assignee_employee_id" text,
	"assignee_user_id" text,
	"due_at" date,
	"status" "offboarding_task_status" DEFAULT 'todo' NOT NULL,
	"completed_at" timestamp,
	"completed_by_user_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"exit_type" "offboarding_exit_type",
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offboarding_template_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "offboarding_category" NOT NULL,
	"default_assignee_role" text,
	"due_offset_days" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "offboarding_access_revocation" ADD CONSTRAINT "offboarding_access_revocation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_access_revocation" ADD CONSTRAINT "offboarding_access_revocation_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_access_revocation" ADD CONSTRAINT "offboarding_access_revocation_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_activity" ADD CONSTRAINT "offboarding_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_activity" ADD CONSTRAINT "offboarding_activity_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_activity" ADD CONSTRAINT "offboarding_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_asset_return" ADD CONSTRAINT "offboarding_asset_return_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_asset_return" ADD CONSTRAINT "offboarding_asset_return_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_asset_return" ADD CONSTRAINT "offboarding_asset_return_received_by_user_id_user_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_rejected_by_user_id_user_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_case" ADD CONSTRAINT "offboarding_case_template_id_offboarding_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."offboarding_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_document_request" ADD CONSTRAINT "offboarding_document_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_document_request" ADD CONSTRAINT "offboarding_document_request_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_document_request" ADD CONSTRAINT "offboarding_document_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_document_request" ADD CONSTRAINT "offboarding_document_request_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_exit_interview" ADD CONSTRAINT "offboarding_exit_interview_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_exit_interview" ADD CONSTRAINT "offboarding_exit_interview_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_exit_interview" ADD CONSTRAINT "offboarding_exit_interview_conducted_by_user_id_user_id_fk" FOREIGN KEY ("conducted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_case_id_offboarding_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_template_task_id_offboarding_template_task_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."offboarding_template_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_assignee_employee_id_employee_profile_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_task" ADD CONSTRAINT "offboarding_task_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_template" ADD CONSTRAINT "offboarding_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_template_task" ADD CONSTRAINT "offboarding_template_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_template_task" ADD CONSTRAINT "offboarding_template_task_template_id_offboarding_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."offboarding_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ob_access_revoc_case_status_idx" ON "offboarding_access_revocation" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "ob_access_revoc_org_status_idx" ON "offboarding_access_revocation" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ob_activity_case_created_idx" ON "offboarding_activity" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "ob_activity_org_created_idx" ON "offboarding_activity" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ob_asset_return_case_status_idx" ON "offboarding_asset_return" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "ob_asset_return_org_status_idx" ON "offboarding_asset_return" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ob_case_org_status_idx" ON "offboarding_case" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ob_case_employee_idx" ON "offboarding_case" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "ob_case_lwd_idx" ON "offboarding_case" USING btree ("organization_id","last_working_day");--> statement-breakpoint
CREATE UNIQUE INDEX "ob_case_employee_active_uq" ON "offboarding_case" USING btree ("organization_id","employee_id") WHERE "offboarding_case"."status" NOT IN ('closed','cancelled','rejected','withdrawn') AND "offboarding_case"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ob_doc_request_case_status_idx" ON "offboarding_document_request" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "ob_doc_request_org_status_idx" ON "offboarding_document_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ob_exit_interview_case_idx" ON "offboarding_exit_interview" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ob_exit_interview_case_uq" ON "offboarding_exit_interview" USING btree ("case_id") WHERE "offboarding_exit_interview"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ob_task_case_status_idx" ON "offboarding_task" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "ob_task_assignee_status_idx" ON "offboarding_task" USING btree ("organization_id","assignee_employee_id","status");--> statement-breakpoint
CREATE INDEX "ob_task_org_due_idx" ON "offboarding_task" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "offboarding_template_org_idx" ON "offboarding_template" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offboarding_template_org_name_uq" ON "offboarding_template" USING btree ("organization_id","name") WHERE "offboarding_template"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ob_template_task_template_sort_idx" ON "offboarding_template_task" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "ob_template_task_org_idx" ON "offboarding_template_task" USING btree ("organization_id");