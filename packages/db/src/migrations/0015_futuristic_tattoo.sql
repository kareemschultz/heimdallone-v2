CREATE TYPE "public"."leave_company_override_mode" AS ENUM('statutory_only', 'statutory_plus_company', 'custom');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_accrual_method" AS ENUM('upfront', 'monthly', 'yearly', 'per_days_worked', 'manual');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_category" AS ENUM('annual', 'sick', 'maternity', 'paternity', 'compassionate', 'study', 'unpaid', 'special', 'custom');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_entitlement_unit" AS ENUM('days', 'hours', 'weeks');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_payroll_treatment" AS ENUM('paid_preserve', 'unpaid_deduct', 'nis_funded', 'partial');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."leave_policy_verification_status" AS ENUM('verified', 'needs_review', 'draft', 'deprecated');--> statement-breakpoint
CREATE TABLE "leave_policy_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_template_id" text NOT NULL,
	"leave_type_name" text NOT NULL,
	"leave_category" "leave_policy_category" DEFAULT 'custom' NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"entitlement_amount" numeric(6, 2),
	"entitlement_unit" "leave_policy_entitlement_unit" DEFAULT 'days' NOT NULL,
	"accrual_method" "leave_policy_accrual_method" DEFAULT 'yearly' NOT NULL,
	"accrual_frequency" text,
	"tenure_min_months" integer,
	"tenure_max_months" integer,
	"probation_eligible" boolean DEFAULT false NOT NULL,
	"gender_applicability" text,
	"requires_document" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"carry_forward_allowed" boolean DEFAULT false NOT NULL,
	"carry_forward_limit" numeric(6, 2),
	"carry_forward_expiry_days" integer,
	"encashment_allowed" boolean DEFAULT false NOT NULL,
	"payroll_treatment" "leave_policy_payroll_treatment" DEFAULT 'paid_preserve' NOT NULL,
	"tax_treatment_note" text,
	"verification_status" "leave_policy_verification_status" DEFAULT 'draft' NOT NULL,
	"source_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_policy_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"country_code" text NOT NULL,
	"jurisdiction_name" text,
	"name" text NOT NULL,
	"description" text,
	"effective_from" date,
	"effective_to" date,
	"verification_status" "leave_policy_verification_status" DEFAULT 'draft' NOT NULL,
	"source_name" text,
	"source_url" text,
	"source_retrieved_at" timestamp,
	"last_reviewed_at" timestamp,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_leave_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_template_id" text,
	"country_code" text NOT NULL,
	"name" text NOT NULL,
	"effective_from" date,
	"status" "leave_policy_status" DEFAULT 'draft' NOT NULL,
	"company_override_mode" "leave_company_override_mode" DEFAULT 'statutory_only' NOT NULL,
	"activated_by_user_id" text,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_leave_policy_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_leave_policy_id" text NOT NULL,
	"source_rule_id" text,
	"linked_leave_type_id" text,
	"leave_type_name" text NOT NULL,
	"leave_category" "leave_policy_category" DEFAULT 'custom' NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"entitlement_amount" numeric(6, 2),
	"entitlement_unit" "leave_policy_entitlement_unit" DEFAULT 'days' NOT NULL,
	"accrual_method" "leave_policy_accrual_method" DEFAULT 'yearly' NOT NULL,
	"accrual_frequency" text,
	"tenure_min_months" integer,
	"tenure_max_months" integer,
	"probation_eligible" boolean DEFAULT false NOT NULL,
	"gender_applicability" text,
	"requires_document" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"carry_forward_allowed" boolean DEFAULT false NOT NULL,
	"carry_forward_limit" numeric(6, 2),
	"carry_forward_expiry_days" integer,
	"encashment_allowed" boolean DEFAULT false NOT NULL,
	"payroll_treatment" "leave_policy_payroll_treatment" DEFAULT 'paid_preserve' NOT NULL,
	"tax_treatment_note" text,
	"verification_status" "leave_policy_verification_status" DEFAULT 'draft' NOT NULL,
	"source_url" text,
	"is_customized" boolean DEFAULT false NOT NULL,
	"custom_override_note" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_policy_rule" ADD CONSTRAINT "leave_policy_rule_policy_template_id_leave_policy_template_id_fk" FOREIGN KEY ("policy_template_id") REFERENCES "public"."leave_policy_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policy_template" ADD CONSTRAINT "leave_policy_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy" ADD CONSTRAINT "organization_leave_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy" ADD CONSTRAINT "organization_leave_policy_source_template_id_leave_policy_template_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."leave_policy_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy" ADD CONSTRAINT "organization_leave_policy_activated_by_user_id_user_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy_rule" ADD CONSTRAINT "organization_leave_policy_rule_organization_leave_policy_id_organization_leave_policy_id_fk" FOREIGN KEY ("organization_leave_policy_id") REFERENCES "public"."organization_leave_policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy_rule" ADD CONSTRAINT "organization_leave_policy_rule_source_rule_id_leave_policy_rule_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."leave_policy_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_leave_policy_rule" ADD CONSTRAINT "organization_leave_policy_rule_linked_leave_type_id_leave_type_id_fk" FOREIGN KEY ("linked_leave_type_id") REFERENCES "public"."leave_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_policy_rule_template_idx" ON "leave_policy_rule" USING btree ("policy_template_id");--> statement-breakpoint
CREATE INDEX "leave_policy_rule_category_idx" ON "leave_policy_rule" USING btree ("leave_category");--> statement-breakpoint
CREATE INDEX "leave_policy_template_country_idx" ON "leave_policy_template" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "leave_policy_template_org_idx" ON "leave_policy_template" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_leave_policy_org_idx" ON "organization_leave_policy" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_leave_policy_org_status_idx" ON "organization_leave_policy" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_leave_policy_active_country_uq" ON "organization_leave_policy" USING btree ("organization_id","country_code") WHERE "organization_leave_policy"."status" = 'active' and "organization_leave_policy"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "org_leave_policy_rule_policy_idx" ON "organization_leave_policy_rule" USING btree ("organization_leave_policy_id");--> statement-breakpoint
CREATE INDEX "org_leave_policy_rule_category_idx" ON "organization_leave_policy_rule" USING btree ("leave_category");