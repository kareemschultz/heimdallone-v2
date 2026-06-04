CREATE TYPE "public"."project_linked_entity_type" AS ENUM('document', 'expense', 'crm_deal', 'crm_customer', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_member_role" AS ENUM('lead', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."project_milestone_status" AS ENUM('planned', 'in_progress', 'at_risk', 'completed', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_task_status" AS ENUM('todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_time_entry_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"priority" "project_priority",
	"project_manager_employee_id" text,
	"department_id" text,
	"start_date" date,
	"target_end_date" date,
	"completed_at" timestamp,
	"budget" numeric(14, 2),
	"linked_customer_id" text,
	"linked_deal_id" text,
	"internal_note" text,
	"created_by_user_id" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"role" "project_member_role" DEFAULT 'member' NOT NULL,
	"allocation_percent" integer,
	"start_date" date,
	"end_date" date,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_milestone_status" DEFAULT 'planned' NOT NULL,
	"due_date" date,
	"completed_at" timestamp,
	"owner_employee_id" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"reference" text NOT NULL,
	"milestone_id" text,
	"title" text NOT NULL,
	"description" text,
	"status" "project_task_status" DEFAULT 'todo' NOT NULL,
	"priority" "project_priority" DEFAULT 'normal' NOT NULL,
	"assignee_employee_id" text,
	"created_by_user_id" text,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp,
	"estimate_minutes" integer,
	"linked_asset_id" text,
	"linked_helpdesk_request_id" text,
	"linked_entity_type" "project_linked_entity_type",
	"linked_entity_id" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_task_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"task_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"employee_id" text NOT NULL,
	"entry_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"description" text,
	"status" "project_time_entry_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"approved_by_user_id" text,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_project_manager_employee_id_employee_profile_id_fk" FOREIGN KEY ("project_manager_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_owner_employee_id_employee_profile_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_milestone_id_project_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_assignee_employee_id_employee_profile_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_linked_asset_id_asset_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_linked_helpdesk_request_id_helpdesk_request_id_fk" FOREIGN KEY ("linked_helpdesk_request_id") REFERENCES "public"."helpdesk_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_comment" ADD CONSTRAINT "project_task_comment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_comment" ADD CONSTRAINT "project_task_comment_task_id_project_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_comment" ADD CONSTRAINT "project_task_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entry" ADD CONSTRAINT "project_time_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entry" ADD CONSTRAINT "project_time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entry" ADD CONSTRAINT "project_time_entry_task_id_project_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entry" ADD CONSTRAINT "project_time_entry_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entry" ADD CONSTRAINT "project_time_entry_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_org_idx" ON "project" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_org_status_idx" ON "project" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "project_org_manager_idx" ON "project" USING btree ("organization_id","project_manager_employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_org_reference_uq" ON "project" USING btree ("organization_id","reference") WHERE "project"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_org_name_uq" ON "project" USING btree ("organization_id","name") WHERE "project"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "project_member_org_project_idx" ON "project_member" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "project_member_org_employee_idx" ON "project_member" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_active_uq" ON "project_member" USING btree ("project_id","employee_id") WHERE "project_member"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_milestone_org_idx" ON "project_milestone" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_milestone_project_idx" ON "project_milestone" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_milestone_org_status_idx" ON "project_milestone" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "project_milestone_project_due_idx" ON "project_milestone" USING btree ("project_id","due_date");--> statement-breakpoint
CREATE INDEX "project_task_org_idx" ON "project_task" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_task_project_idx" ON "project_task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_task_org_status_idx" ON "project_task" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "project_task_org_assignee_idx" ON "project_task" USING btree ("organization_id","assignee_employee_id","status");--> statement-breakpoint
CREATE INDEX "project_task_org_due_idx" ON "project_task" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "project_task_milestone_idx" ON "project_task" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "project_task_linked_asset_idx" ON "project_task" USING btree ("linked_asset_id");--> statement-breakpoint
CREATE INDEX "project_task_linked_ticket_idx" ON "project_task" USING btree ("linked_helpdesk_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_task_org_reference_uq" ON "project_task" USING btree ("organization_id","reference") WHERE "project_task"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "project_task_comment_task_idx" ON "project_task_comment" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "project_task_comment_org_idx" ON "project_task_comment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_time_entry_org_employee_date_idx" ON "project_time_entry" USING btree ("organization_id","employee_id","entry_date");--> statement-breakpoint
CREATE INDEX "project_time_entry_org_project_date_idx" ON "project_time_entry" USING btree ("organization_id","project_id","entry_date");--> statement-breakpoint
CREATE INDEX "project_time_entry_org_status_idx" ON "project_time_entry" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "project_time_entry_task_idx" ON "project_time_entry" USING btree ("task_id");