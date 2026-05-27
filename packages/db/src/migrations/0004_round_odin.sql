CREATE TYPE "public"."leave_accrual_period" AS ENUM('day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."leave_breakdown" AS ENUM('full_day', 'first_half', 'second_half');--> statement-breakpoint
CREATE TYPE "public"."leave_carry_forward_type" AS ENUM('none', 'carry', 'carry_expire');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_reset_basis" AS ENUM('yearly', 'monthly', 'weekly');--> statement-breakpoint
CREATE TABLE "company_leave_day" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"week_of_month" integer,
	"day_of_week" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_leave_day_uq" UNIQUE("organization_id","week_of_month","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "leave_allocation_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"requested_days" numeric(6, 2) NOT NULL,
	"description" text,
	"status" "leave_request_status" DEFAULT 'requested' NOT NULL,
	"reject_reason" text,
	"reviewed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"available_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"used_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"carry_forward_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"assigned_date" date NOT NULL,
	"reset_date" date,
	"expiry_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_balance_emp_type_uq" UNIQUE("employee_id","leave_type_id")
);
--> statement-breakpoint
CREATE TABLE "leave_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_breakdown" "leave_breakdown" DEFAULT 'full_day' NOT NULL,
	"end_breakdown" "leave_breakdown" DEFAULT 'full_day' NOT NULL,
	"requested_days" numeric(6, 2) NOT NULL,
	"description" text,
	"attachment_url" text,
	"status" "leave_request_status" DEFAULT 'requested' NOT NULL,
	"reject_reason" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_request_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"leave_request_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_restriction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"department_id" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"accrual_amount" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"accrual_period" "leave_accrual_period" DEFAULT 'month' NOT NULL,
	"limit_days" numeric(6, 2),
	"reset_enabled" boolean DEFAULT true NOT NULL,
	"reset_basis" "leave_reset_basis" DEFAULT 'yearly' NOT NULL,
	"reset_month" integer,
	"reset_day" integer,
	"carry_forward_type" "leave_carry_forward_type" DEFAULT 'none' NOT NULL,
	"carry_forward_max" numeric(6, 2),
	"carry_forward_expiry_days" integer,
	"require_approval" boolean DEFAULT true NOT NULL,
	"require_attachment" boolean DEFAULT false NOT NULL,
	"exclude_holidays" boolean DEFAULT true NOT NULL,
	"exclude_company_leaves" boolean DEFAULT true NOT NULL,
	"is_compensatory" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_type_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "company_leave_day" ADD CONSTRAINT "company_leave_day_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_allocation_request" ADD CONSTRAINT "leave_allocation_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_allocation_request" ADD CONSTRAINT "leave_allocation_request_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_allocation_request" ADD CONSTRAINT "leave_allocation_request_leave_type_id_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_allocation_request" ADD CONSTRAINT "leave_allocation_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_leave_type_id_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leave_type_id_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_approval" ADD CONSTRAINT "leave_request_approval_leave_request_id_leave_request_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_approval" ADD CONSTRAINT "leave_request_approval_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_restriction" ADD CONSTRAINT "leave_restriction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_restriction" ADD CONSTRAINT "leave_restriction_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_type" ADD CONSTRAINT "leave_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_alloc_org_idx" ON "leave_allocation_request" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leave_balance_emp_idx" ON "leave_balance" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leave_request_org_idx" ON "leave_request" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leave_request_emp_status_idx" ON "leave_request" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "leave_request_dates_idx" ON "leave_request" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "leave_approval_request_idx" ON "leave_request_approval" USING btree ("leave_request_id");--> statement-breakpoint
CREATE INDEX "leave_restriction_org_idx" ON "leave_restriction" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leave_type_org_idx" ON "leave_type" USING btree ("organization_id");