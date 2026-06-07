CREATE TYPE "public"."crm_activity_type" AS ENUM('call', 'meeting', 'email', 'task', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."crm_customer_status" AS ENUM('prospect', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."crm_customer_type" AS ENUM('company', 'individual');--> statement-breakpoint
CREATE TYPE "public"."crm_deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."crm_handoff_status" AS ENUM('intended', 'linked', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_status" AS ENUM('new', 'contacted', 'qualified', 'unqualified', 'converted');--> statement-breakpoint
CREATE TYPE "public"."crm_note_visibility" AS ENUM('team', 'private');--> statement-breakpoint
CREATE TYPE "public"."crm_related_type" AS ENUM('lead', 'customer', 'contact', 'deal');--> statement-breakpoint
CREATE TYPE "public"."crm_source" AS ENUM('web_form', 'referral', 'campaign', 'manual', 'import', 'event', 'other');--> statement-breakpoint
CREATE TABLE "crm_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "crm_activity_type" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"due_at" timestamp,
	"completed_at" timestamp,
	"related_type" "crm_related_type" NOT NULL,
	"related_id" text NOT NULL,
	"assigned_to_employee_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"owner_employee_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "crm_customer_type" DEFAULT 'company' NOT NULL,
	"status" "crm_customer_status" DEFAULT 'prospect' NOT NULL,
	"website" text,
	"phone" text,
	"email" text,
	"industry" text,
	"owner_employee_id" text,
	"address_line" text,
	"city" text,
	"country" text,
	"source_key" "crm_source",
	"notes_summary" text,
	"open_deal_count" integer DEFAULT 0 NOT NULL,
	"open_deal_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_customer_project_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"deal_id" text,
	"project_id" text,
	"handoff_status" "crm_handoff_status" DEFAULT 'intended' NOT NULL,
	"handoff_note" text,
	"handed_off_by_user_id" text,
	"handed_off_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_deal" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"primary_contact_id" text,
	"title" text NOT NULL,
	"stage_id" text NOT NULL,
	"value" numeric(12, 2),
	"currency" text NOT NULL,
	"probability_pct" integer,
	"expected_close_date" date,
	"status" "crm_deal_status" DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"owner_employee_id" text,
	"last_activity_at" timestamp,
	"handed_off_project_link_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_lead" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"company_name" text,
	"status" "crm_lead_status" DEFAULT 'new' NOT NULL,
	"source_key" "crm_source",
	"owner_employee_id" text,
	"estimated_value" numeric(12, 2),
	"description" text,
	"converted_customer_id" text,
	"converted_contact_id" text,
	"converted_deal_id" text,
	"converted_at" timestamp,
	"converted_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"related_type" "crm_related_type" NOT NULL,
	"related_id" text NOT NULL,
	"body" text NOT NULL,
	"visibility" "crm_note_visibility" DEFAULT 'team' NOT NULL,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"default_probability_pct" integer,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_assigned_to_employee_id_employee_profile_id_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_customer_id_crm_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_owner_employee_id_employee_profile_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer" ADD CONSTRAINT "crm_customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer" ADD CONSTRAINT "crm_customer_owner_employee_id_employee_profile_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_project_link" ADD CONSTRAINT "crm_customer_project_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_project_link" ADD CONSTRAINT "crm_customer_project_link_customer_id_crm_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_project_link" ADD CONSTRAINT "crm_customer_project_link_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_project_link" ADD CONSTRAINT "crm_customer_project_link_handed_off_by_user_id_user_id_fk" FOREIGN KEY ("handed_off_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_customer_id_crm_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_primary_contact_id_crm_contact_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_stage_id_crm_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stage"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_owner_employee_id_employee_profile_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_owner_employee_id_employee_profile_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_converted_customer_id_crm_customer_id_fk" FOREIGN KEY ("converted_customer_id") REFERENCES "public"."crm_customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_converted_contact_id_crm_contact_id_fk" FOREIGN KEY ("converted_contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_converted_deal_id_crm_deal_id_fk" FOREIGN KEY ("converted_deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_converted_by_user_id_user_id_fk" FOREIGN KEY ("converted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_note" ADD CONSTRAINT "crm_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_note" ADD CONSTRAINT "crm_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage" ADD CONSTRAINT "crm_pipeline_stage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activity_related_idx" ON "crm_activity" USING btree ("organization_id","related_type","related_id");--> statement-breakpoint
CREATE INDEX "crm_activity_org_due_idx" ON "crm_activity" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "crm_activity_assignee_idx" ON "crm_activity" USING btree ("assigned_to_employee_id");--> statement-breakpoint
CREATE INDEX "crm_contact_org_idx" ON "crm_contact" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_contact_customer_idx" ON "crm_contact" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contact_org_email_uq" ON "crm_contact" USING btree ("organization_id","email") WHERE "crm_contact"."email" is not null and "crm_contact"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "crm_customer_org_idx" ON "crm_customer" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_customer_org_status_idx" ON "crm_customer" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "crm_customer_org_owner_idx" ON "crm_customer" USING btree ("organization_id","owner_employee_id");--> statement-breakpoint
CREATE INDEX "crm_cpl_org_idx" ON "crm_customer_project_link" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_cpl_customer_idx" ON "crm_customer_project_link" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_cpl_deal_idx" ON "crm_customer_project_link" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_deal_org_stage_idx" ON "crm_deal" USING btree ("organization_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_deal_org_owner_idx" ON "crm_deal" USING btree ("organization_id","owner_employee_id");--> statement-breakpoint
CREATE INDEX "crm_deal_org_status_idx" ON "crm_deal" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "crm_deal_customer_idx" ON "crm_deal" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_lead_org_status_idx" ON "crm_lead" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "crm_lead_org_owner_idx" ON "crm_lead" USING btree ("organization_id","owner_employee_id");--> statement-breakpoint
CREATE INDEX "crm_note_related_idx" ON "crm_note" USING btree ("organization_id","related_type","related_id");--> statement-breakpoint
CREATE INDEX "crm_stage_org_pos_idx" ON "crm_pipeline_stage" USING btree ("organization_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_stage_org_name_uq" ON "crm_pipeline_stage" USING btree ("organization_id","name") WHERE "crm_pipeline_stage"."deleted_at" is null;