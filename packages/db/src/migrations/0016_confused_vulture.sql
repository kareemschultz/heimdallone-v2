CREATE TYPE "public"."helpdesk_approval_status" AS ENUM('none', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."helpdesk_category_key" AS ENUM('hr', 'payroll', 'attendance', 'leave', 'documents', 'assets', 'it', 'facilities', 'finance', 'general', 'custom');--> statement-breakpoint
CREATE TYPE "public"."helpdesk_linked_entity_type" AS ENUM('document', 'project_task', 'expense', 'crm_case', 'other');--> statement-breakpoint
CREATE TYPE "public"."helpdesk_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."helpdesk_request_status" AS ENUM('new', 'open', 'in_progress', 'waiting_on_employee', 'waiting_on_approval', 'resolved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "helpdesk_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" "helpdesk_category_key" DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_assignee_user_id" text,
	"default_priority" "helpdesk_priority" DEFAULT 'normal' NOT NULL,
	"default_sla_hours" integer,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "helpdesk_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"category_id" text,
	"requester_employee_id" text NOT NULL,
	"target_employee_id" text,
	"created_by_user_id" text,
	"title" text NOT NULL,
	"description" text,
	"priority" "helpdesk_priority" DEFAULT 'normal' NOT NULL,
	"status" "helpdesk_request_status" DEFAULT 'new' NOT NULL,
	"assigned_to_user_id" text,
	"first_response_due_at" timestamp,
	"resolution_due_at" timestamp,
	"first_responded_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"resolution_note" text,
	"approval_required" boolean DEFAULT false NOT NULL,
	"approval_status" "helpdesk_approval_status" DEFAULT 'none' NOT NULL,
	"approved_by_user_id" text,
	"approval_note" text,
	"linked_asset_id" text,
	"linked_payslip_id" text,
	"linked_payroll_run_id" text,
	"linked_leave_request_id" text,
	"linked_attendance_record_id" text,
	"linked_offboarding_case_id" text,
	"linked_entity_type" "helpdesk_linked_entity_type",
	"linked_entity_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "helpdesk_request_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"request_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "helpdesk_category" ADD CONSTRAINT "helpdesk_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_category" ADD CONSTRAINT "helpdesk_category_default_assignee_user_id_user_id_fk" FOREIGN KEY ("default_assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_category_id_helpdesk_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."helpdesk_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_requester_employee_id_employee_profile_id_fk" FOREIGN KEY ("requester_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_target_employee_id_employee_profile_id_fk" FOREIGN KEY ("target_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_asset_id_asset_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_payslip_id_payslip_id_fk" FOREIGN KEY ("linked_payslip_id") REFERENCES "public"."payslip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("linked_payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_leave_request_id_leave_request_id_fk" FOREIGN KEY ("linked_leave_request_id") REFERENCES "public"."leave_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_attendance_record_id_attendance_record_id_fk" FOREIGN KEY ("linked_attendance_record_id") REFERENCES "public"."attendance_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request" ADD CONSTRAINT "helpdesk_request_linked_offboarding_case_id_offboarding_case_id_fk" FOREIGN KEY ("linked_offboarding_case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request_comment" ADD CONSTRAINT "helpdesk_request_comment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request_comment" ADD CONSTRAINT "helpdesk_request_comment_request_id_helpdesk_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."helpdesk_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_request_comment" ADD CONSTRAINT "helpdesk_request_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "helpdesk_category_org_idx" ON "helpdesk_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "helpdesk_category_org_name_uq" ON "helpdesk_category" USING btree ("organization_id","name") WHERE "helpdesk_category"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "helpdesk_request_org_reference_uq" ON "helpdesk_request" USING btree ("organization_id","reference") WHERE "helpdesk_request"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_status_idx" ON "helpdesk_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_priority_idx" ON "helpdesk_request" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_assignee_idx" ON "helpdesk_request" USING btree ("organization_id","assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_requester_idx" ON "helpdesk_request" USING btree ("organization_id","requester_employee_id");--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_target_idx" ON "helpdesk_request" USING btree ("organization_id","target_employee_id");--> statement-breakpoint
CREATE INDEX "helpdesk_request_org_category_idx" ON "helpdesk_request" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "helpdesk_request_comment_request_idx" ON "helpdesk_request_comment" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "helpdesk_request_comment_org_idx" ON "helpdesk_request_comment" USING btree ("organization_id");