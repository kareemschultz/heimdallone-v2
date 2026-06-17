CREATE TYPE "public"."disciplinary_outcome" AS ENUM('none', 'verbal_warning', 'written_warning', 'final_warning', 'suspension', 'dismissal', 'other');--> statement-breakpoint
CREATE TYPE "public"."disciplinary_record_status" AS ENUM('draft', 'explanation_requested', 'explained', 'action_taken', 'appealed', 'closed', 'overturned', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."resignation_reason" AS ENUM('resignation', 'retirement', 'end_of_contract', 'mutual', 'other');--> statement-breakpoint
CREATE TYPE "public"."resignation_status" AS ENUM('draft', 'submitted', 'manager_approved', 'hr_approved', 'handed_off', 'withdrawn', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'scheduled', 'effective', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_type" AS ENUM('department', 'position', 'role', 'location', 'manager', 'combined');--> statement-breakpoint
CREATE TABLE "disciplinary_action" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"severity_level" integer DEFAULT 1 NOT NULL,
	"outcome" "disciplinary_outcome" DEFAULT 'other' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "disciplinary_category" (
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
CREATE TABLE "disciplinary_record" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"employee_id" text NOT NULL,
	"category_id" text,
	"incident_date" date NOT NULL,
	"description" text NOT NULL,
	"status" "disciplinary_record_status" DEFAULT 'draft' NOT NULL,
	"employee_explanation" text,
	"employee_explanation_submitted_at" timestamp,
	"final_action_id" text,
	"final_action_notes" text,
	"final_action_taken_at" timestamp,
	"final_action_by_user_id" text,
	"appeal_text" text,
	"appeal_submitted_at" timestamp,
	"appeal_outcome" text,
	"appeal_resolved_at" timestamp,
	"appeal_resolved_by_user_id" text,
	"internal_note" text,
	"reported_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"employee_id" text NOT NULL,
	"transfer_type" "transfer_type" NOT NULL,
	"status" "transfer_status" DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"to_department_id" text,
	"to_job_position_id" text,
	"to_job_role_id" text,
	"to_reporting_manager_id" text,
	"to_work_location" text,
	"from_department_id" text,
	"from_job_position_id" text,
	"from_job_role_id" text,
	"from_reporting_manager_id" text,
	"from_work_location" text,
	"snapshot_json" jsonb,
	"reason" text,
	"submitted_by_user_id" text,
	"submitted_at" timestamp,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"executed_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_work_info_history" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"department_id" text,
	"job_position_id" text,
	"job_role_id" text,
	"reporting_manager_id" text,
	"work_location" text,
	"source_transfer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resignation_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"employee_id" text NOT NULL,
	"status" "resignation_status" DEFAULT 'draft' NOT NULL,
	"reason_category" "resignation_reason" NOT NULL,
	"reason_notes" text,
	"requested_last_working_date" date NOT NULL,
	"notice_start_date" date,
	"submitted_at" timestamp,
	"manager_approved_by_user_id" text,
	"manager_approved_at" timestamp,
	"hr_approved_by_user_id" text,
	"hr_approved_at" timestamp,
	"withdrawn_at" timestamp,
	"rejection_reason" text,
	"offboarding_case_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "disciplinary_action" ADD CONSTRAINT "disciplinary_action_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_category" ADD CONSTRAINT "disciplinary_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_category_id_disciplinary_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."disciplinary_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_final_action_id_disciplinary_action_id_fk" FOREIGN KEY ("final_action_id") REFERENCES "public"."disciplinary_action"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_final_action_by_user_id_user_id_fk" FOREIGN KEY ("final_action_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_appeal_resolved_by_user_id_user_id_fk" FOREIGN KEY ("appeal_resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_record" ADD CONSTRAINT "disciplinary_record_reported_by_user_id_user_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_to_department_id_department_id_fk" FOREIGN KEY ("to_department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_to_job_position_id_job_position_id_fk" FOREIGN KEY ("to_job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_to_job_role_id_job_role_id_fk" FOREIGN KEY ("to_job_role_id") REFERENCES "public"."job_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_to_reporting_manager_id_employee_profile_id_fk" FOREIGN KEY ("to_reporting_manager_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfer" ADD CONSTRAINT "employee_transfer_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_job_role_id_job_role_id_fk" FOREIGN KEY ("job_role_id") REFERENCES "public"."job_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_info_history" ADD CONSTRAINT "employee_work_info_history_reporting_manager_id_employee_profile_id_fk" FOREIGN KEY ("reporting_manager_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_manager_approved_by_user_id_user_id_fk" FOREIGN KEY ("manager_approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_hr_approved_by_user_id_user_id_fk" FOREIGN KEY ("hr_approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_offboarding_case_id_offboarding_case_id_fk" FOREIGN KEY ("offboarding_case_id") REFERENCES "public"."offboarding_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resignation_request" ADD CONSTRAINT "resignation_request_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disciplinary_action_org_severity_idx" ON "disciplinary_action" USING btree ("organization_id","severity_level");--> statement-breakpoint
CREATE UNIQUE INDEX "disciplinary_action_org_name_uq" ON "disciplinary_action" USING btree ("organization_id","name") WHERE "disciplinary_action"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "disciplinary_category_org_idx" ON "disciplinary_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disciplinary_category_org_name_uq" ON "disciplinary_category" USING btree ("organization_id","name") WHERE "disciplinary_category"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "disciplinary_record_org_idx" ON "disciplinary_record" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "disciplinary_record_org_employee_idx" ON "disciplinary_record" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "disciplinary_record_org_status_idx" ON "disciplinary_record" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "disciplinary_record_org_reference_uq" ON "disciplinary_record" USING btree ("organization_id","reference") WHERE "disciplinary_record"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "employee_transfer_org_status_idx" ON "employee_transfer" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employee_transfer_org_emp_eff_idx" ON "employee_transfer" USING btree ("organization_id","employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_transfer_org_reference_uq" ON "employee_transfer" USING btree ("organization_id","reference") WHERE "employee_transfer"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "emp_work_info_history_org_emp_eff_idx" ON "employee_work_info_history" USING btree ("organization_id","employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "resignation_request_org_status_idx" ON "resignation_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "resignation_request_org_employee_idx" ON "resignation_request" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resignation_request_org_reference_uq" ON "resignation_request" USING btree ("organization_id","reference") WHERE "resignation_request"."deleted_at" is null;