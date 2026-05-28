CREATE TYPE "public"."application_stage" AS ENUM('new', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."candidate_source" AS ENUM('direct', 'referral', 'job_board', 'agency', 'linkedin', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('active', 'inactive_pool', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."feedback_recommend" AS ENUM('strong_hire', 'hire', 'no_hire', 'strong_no_hire');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."job_opening_status" AS ENUM('draft', 'open', 'paused', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('not_qualified', 'position_filled', 'failed_interview', 'failed_background_check', 'salary_mismatch', 'candidate_unresponsive', 'other');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "application_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"from_stage" "application_stage",
	"to_stage" "application_stage" NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text NOT NULL,
	"phone" text,
	"country" text,
	"source" "candidate_source" DEFAULT 'direct' NOT NULL,
	"referrer_employee_id" text,
	"resume_url" text,
	"portfolio_url" text,
	"date_of_birth" date,
	"gender" text,
	"address" text,
	"linkedin_url" text,
	"status" "candidate_status" DEFAULT 'active' NOT NULL,
	"converted_employee_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "candidate_org_email_uq" UNIQUE("organization_id","email"),
	CONSTRAINT "candidate_converted_employee_uq" UNIQUE("converted_employee_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_application" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"job_opening_id" text NOT NULL,
	"stage" "application_stage" DEFAULT 'new' NOT NULL,
	"stage_entered_at" timestamp DEFAULT now() NOT NULL,
	"rating_average" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"outcome_at" timestamp,
	"rejected_reason" "rejection_reason",
	"rejected_feedback" text,
	"withdrawn_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "application_candidate_opening_uq" UNIQUE("candidate_id","job_opening_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_document" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"application_id" text,
	"document_type" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" integer,
	"mime_type" text,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interview" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp,
	"location" text,
	"interview_type" text,
	"interviewer_employee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interview_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"interviewer_employee_id" text NOT NULL,
	"rating" integer NOT NULL,
	"recommend" "feedback_recommend" NOT NULL,
	"strengths" text,
	"concerns" text,
	"notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_interview_interviewer_uq" UNIQUE("interview_id","interviewer_employee_id")
);
--> statement-breakpoint
CREATE TABLE "job_opening" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requisition_id" text,
	"title" text NOT NULL,
	"description" text,
	"job_position_id" text,
	"department_id" text,
	"work_location" text,
	"employment_type" text,
	"vacancy_count" integer DEFAULT 1 NOT NULL,
	"hiring_manager_employee_id" text,
	"recruiter_user_id" text,
	"pipeline_config" jsonb,
	"status" "job_opening_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"closed_at" timestamp,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"base_amount" numeric(12, 2) NOT NULL,
	"base_amount_frequency" text DEFAULT 'monthly' NOT NULL,
	"variable_amount" numeric(12, 2),
	"start_date" date,
	"expires_at" timestamp,
	"letter_url" text,
	"approval_required" boolean DEFAULT true NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"responded_at" timestamp,
	"withdrawn_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offer_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"approver_user_id" text NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offer_approval_offer_sequence_uq" UNIQUE("offer_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "recruitment_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"application_id" text,
	"stage" "application_stage",
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recruitment_requisition" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"job_position_id" text,
	"department_id" text,
	"headcount" integer DEFAULT 1 NOT NULL,
	"requested_by_employee_id" text NOT NULL,
	"status" "requisition_status" DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"rejected_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_referrer_employee_id_employee_profile_id_fk" FOREIGN KEY ("referrer_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_converted_employee_id_employee_profile_id_fk" FOREIGN KEY ("converted_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_application" ADD CONSTRAINT "candidate_application_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_application" ADD CONSTRAINT "candidate_application_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_application" ADD CONSTRAINT "candidate_application_job_opening_id_job_opening_id_fk" FOREIGN KEY ("job_opening_id") REFERENCES "public"."job_opening"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "candidate_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "candidate_document_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "candidate_document_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "candidate_document_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interviewer_employee_id_employee_profile_id_fk" FOREIGN KEY ("interviewer_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_requisition_id_recruitment_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."recruitment_requisition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_hiring_manager_employee_id_employee_profile_id_fk" FOREIGN KEY ("hiring_manager_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_recruiter_user_id_user_id_fk" FOREIGN KEY ("recruiter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_approval" ADD CONSTRAINT "offer_approval_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_approval" ADD CONSTRAINT "offer_approval_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_approval" ADD CONSTRAINT "offer_approval_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_note" ADD CONSTRAINT "recruitment_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_note" ADD CONSTRAINT "recruitment_note_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_note" ADD CONSTRAINT "recruitment_note_application_id_candidate_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_note" ADD CONSTRAINT "recruitment_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_requisition" ADD CONSTRAINT "recruitment_requisition_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_requisition" ADD CONSTRAINT "recruitment_requisition_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_requisition" ADD CONSTRAINT "recruitment_requisition_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_requisition" ADD CONSTRAINT "recruitment_requisition_requested_by_employee_id_employee_profile_id_fk" FOREIGN KEY ("requested_by_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_requisition" ADD CONSTRAINT "recruitment_requisition_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_history_app_idx" ON "application_stage_history" USING btree ("application_id","changed_at");--> statement-breakpoint
CREATE INDEX "stage_history_org_to_idx" ON "application_stage_history" USING btree ("organization_id","to_stage");--> statement-breakpoint
CREATE INDEX "candidate_org_status_idx" ON "candidate" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "application_org_stage_idx" ON "candidate_application" USING btree ("organization_id","stage");--> statement-breakpoint
CREATE INDEX "application_opening_stage_idx" ON "candidate_application" USING btree ("job_opening_id","stage");--> statement-breakpoint
CREATE INDEX "application_candidate_idx" ON "candidate_application" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_doc_candidate_idx" ON "candidate_document" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_doc_application_idx" ON "candidate_document" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "interview_org_start_idx" ON "interview" USING btree ("organization_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "interview_application_idx" ON "interview" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "interview_org_status_idx" ON "interview" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "feedback_interview_idx" ON "interview_feedback" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "opening_org_status_idx" ON "job_opening" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "opening_hiring_manager_idx" ON "job_opening" USING btree ("organization_id","hiring_manager_employee_id");--> statement-breakpoint
CREATE INDEX "opening_requisition_idx" ON "job_opening" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "offer_org_status_idx" ON "offer" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "offer_application_idx" ON "offer" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "offer_approval_offer_idx" ON "offer_approval" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "recruitment_note_candidate_idx" ON "recruitment_note" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "recruitment_note_application_idx" ON "recruitment_note" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "requisition_org_idx" ON "recruitment_requisition" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "requisition_org_status_idx" ON "recruitment_requisition" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "requisition_department_idx" ON "recruitment_requisition" USING btree ("department_id");