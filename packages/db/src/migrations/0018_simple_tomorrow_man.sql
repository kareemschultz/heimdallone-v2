CREATE TYPE "public"."key_result_progress_type" AS ENUM('percentage', 'number', 'currency', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."key_result_status" AS ENUM('not_started', 'on_track', 'at_risk', 'done');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('draft', 'active', 'on_track', 'at_risk', 'behind', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."one_on_one_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('text', 'rating', 'boolean', 'multi_choice', 'likert');--> statement-breakpoint
CREATE TYPE "public"."recognition_source" AS ENUM('manual', 'objective_completed');--> statement-breakpoint
CREATE TYPE "public"."review_cycle_status" AS ENUM('draft', 'active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_cycle_type" AS ENUM('self', 'manager', 'three_sixty', 'upward');--> statement-breakpoint
CREATE TYPE "public"."review_relationship" AS ENUM('self', 'manager', 'peer', 'report');--> statement-breakpoint
CREATE TYPE "public"."review_request_status" AS ENUM('pending', 'in_progress', 'submitted', 'declined');--> statement-breakpoint
CREATE TABLE "one_on_one" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"manager_employee_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"scheduled_at" timestamp,
	"status" "one_on_one_status" DEFAULT 'scheduled' NOT NULL,
	"shared_notes" text,
	"private_manager_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "performance_key_result" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"title" text NOT NULL,
	"progress_type" "key_result_progress_type" DEFAULT 'percentage' NOT NULL,
	"start_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"current_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"target_value" numeric(14, 2) DEFAULT '100' NOT NULL,
	"status" "key_result_status" DEFAULT 'not_started' NOT NULL,
	"linked_project_task_id" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_objective" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"employee_id" text NOT NULL,
	"owner_user_id" text,
	"title" text NOT NULL,
	"description" text,
	"cycle_id" text,
	"status" "objective_status" DEFAULT 'draft' NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"internal_note" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "question_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recognition_point" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text,
	"source" "recognition_source" DEFAULT 'manual' NOT NULL,
	"awarded_by_user_id" text,
	"objective_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "review_cycle_type" DEFAULT 'manager' NOT NULL,
	"status" "review_cycle_status" DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"end_date" date,
	"anonymity_threshold" integer DEFAULT 3 NOT NULL,
	"is_anonymous_peers" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_question" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"text" text NOT NULL,
	"type" "question_type" DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"subject_employee_id" text NOT NULL,
	"reviewer_employee_id" text NOT NULL,
	"relationship" "review_relationship" NOT NULL,
	"status" "review_request_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"request_id" text NOT NULL,
	"question_id" text,
	"answer_text" text,
	"answer_rating" integer,
	"answer_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_manager_employee_id_employee_profile_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_key_result" ADD CONSTRAINT "performance_key_result_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_key_result" ADD CONSTRAINT "performance_key_result_objective_id_performance_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."performance_objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_key_result" ADD CONSTRAINT "performance_key_result_linked_project_task_id_project_task_id_fk" FOREIGN KEY ("linked_project_task_id") REFERENCES "public"."project_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_objective" ADD CONSTRAINT "performance_objective_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_objective" ADD CONSTRAINT "performance_objective_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_objective" ADD CONSTRAINT "performance_objective_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_objective" ADD CONSTRAINT "performance_objective_cycle_id_review_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_template" ADD CONSTRAINT "question_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_point" ADD CONSTRAINT "recognition_point_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_point" ADD CONSTRAINT "recognition_point_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_point" ADD CONSTRAINT "recognition_point_awarded_by_user_id_user_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_point" ADD CONSTRAINT "recognition_point_objective_id_performance_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."performance_objective"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycle" ADD CONSTRAINT "review_cycle_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_question" ADD CONSTRAINT "review_question_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_question" ADD CONSTRAINT "review_question_template_id_question_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."question_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_cycle_id_review_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_subject_employee_id_employee_profile_id_fk" FOREIGN KEY ("subject_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_reviewer_employee_id_employee_profile_id_fk" FOREIGN KEY ("reviewer_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_request_id_review_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."review_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_question_id_review_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."review_question"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_on_one_org_idx" ON "one_on_one" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "one_on_one_org_employee_idx" ON "one_on_one" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "one_on_one_org_manager_idx" ON "one_on_one" USING btree ("organization_id","manager_employee_id");--> statement-breakpoint
CREATE INDEX "performance_key_result_objective_idx" ON "performance_key_result" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "performance_key_result_org_idx" ON "performance_key_result" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "performance_key_result_linked_task_idx" ON "performance_key_result" USING btree ("linked_project_task_id");--> statement-breakpoint
CREATE INDEX "performance_objective_org_idx" ON "performance_objective" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "performance_objective_org_employee_idx" ON "performance_objective" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "performance_objective_org_status_idx" ON "performance_objective" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "performance_objective_cycle_idx" ON "performance_objective" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_objective_org_reference_uq" ON "performance_objective" USING btree ("organization_id","reference") WHERE "performance_objective"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "question_template_org_idx" ON "question_template" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_template_org_name_uq" ON "question_template" USING btree ("organization_id","name") WHERE "question_template"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recognition_point_org_idx" ON "recognition_point" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "recognition_point_org_employee_idx" ON "recognition_point" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "recognition_point_objective_idx" ON "recognition_point" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "review_cycle_org_idx" ON "review_cycle" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "review_cycle_org_status_idx" ON "review_cycle" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_cycle_org_reference_uq" ON "review_cycle" USING btree ("organization_id","reference") WHERE "review_cycle"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "review_question_template_idx" ON "review_question" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "review_question_org_idx" ON "review_question" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "review_request_cycle_idx" ON "review_request" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "review_request_org_subject_idx" ON "review_request" USING btree ("organization_id","subject_employee_id");--> statement-breakpoint
CREATE INDEX "review_request_org_reviewer_idx" ON "review_request" USING btree ("organization_id","reviewer_employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_request_cycle_subject_reviewer_uq" ON "review_request" USING btree ("cycle_id","subject_employee_id","reviewer_employee_id");--> statement-breakpoint
CREATE INDEX "review_response_request_idx" ON "review_response" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "review_response_org_idx" ON "review_response" USING btree ("organization_id");