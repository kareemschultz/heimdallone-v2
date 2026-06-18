CREATE TYPE "public"."survey_audience" AS ENUM('all_members', 'department', 'role');--> statement-breakpoint
CREATE TYPE "public"."survey_question_type" AS ENUM('text', 'single_choice', 'multi_choice', 'rating');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TABLE "survey" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"is_anonymous" boolean DEFAULT true NOT NULL,
	"audience_type" "survey_audience" DEFAULT 'all_members' NOT NULL,
	"audience_department_id" text,
	"audience_role" text,
	"opens_at" timestamp,
	"closes_at" timestamp,
	"published_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_question" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"question_type" "survey_question_type" NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"respondent_user_id" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_response_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"response_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer_text" text,
	"answer_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_question" ADD CONSTRAINT "survey_question_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_question" ADD CONSTRAINT "survey_question_survey_id_survey_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response" ADD CONSTRAINT "survey_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response" ADD CONSTRAINT "survey_response_survey_id_survey_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response" ADD CONSTRAINT "survey_response_respondent_user_id_user_id_fk" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response_answer" ADD CONSTRAINT "survey_response_answer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response_answer" ADD CONSTRAINT "survey_response_answer_response_id_survey_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."survey_response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_response_answer" ADD CONSTRAINT "survey_response_answer_question_id_survey_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "survey_org_status_idx" ON "survey" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "survey_question_survey_idx" ON "survey_question" USING btree ("survey_id","sort_order");--> statement-breakpoint
CREATE INDEX "survey_response_survey_idx" ON "survey_response" USING btree ("survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_response_user_uq" ON "survey_response" USING btree ("survey_id","respondent_user_id") WHERE "survey_response"."respondent_user_id" is not null;--> statement-breakpoint
CREATE INDEX "survey_answer_response_idx" ON "survey_response_answer" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "survey_answer_question_idx" ON "survey_response_answer" USING btree ("question_id");