CREATE TYPE "public"."payment_batch_status" AS ENUM('draft', 'reviewed', 'exported', 'submitted', 'paid', 'partially_paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_item_status" AS ENUM('pending', 'exported', 'submitted', 'paid', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "payroll_payment_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payroll_run_id" text NOT NULL,
	"pay_period_id" text NOT NULL,
	"status" "payment_batch_status" DEFAULT 'draft' NOT NULL,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"export_format" text DEFAULT 'csv' NOT NULL,
	"created_by" text NOT NULL,
	"exported_by" text,
	"exported_at" timestamp,
	"submitted_by" text,
	"submitted_at" timestamp,
	"marked_paid_by" text,
	"marked_paid_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_payment_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payment_batch_id" text NOT NULL,
	"payslip_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"bank_name" text,
	"branch_code" text,
	"account_number_masked" text,
	"account_holder_name" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"payment_reference" text,
	"status" "payment_item_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_pay_period_id_pay_period_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_exported_by_user_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batch" ADD CONSTRAINT "payroll_payment_batch_marked_paid_by_user_id_fk" FOREIGN KEY ("marked_paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_item" ADD CONSTRAINT "payroll_payment_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_item" ADD CONSTRAINT "payroll_payment_item_payment_batch_id_payroll_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payroll_payment_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_item" ADD CONSTRAINT "payroll_payment_item_payslip_id_payslip_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_item" ADD CONSTRAINT "payroll_payment_item_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_batch_org_idx" ON "payroll_payment_batch" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_batch_run_idx" ON "payroll_payment_batch" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payment_batch_status_idx" ON "payroll_payment_batch" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payment_item_batch_idx" ON "payroll_payment_item" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "payment_item_emp_idx" ON "payroll_payment_item" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payment_item_status_idx" ON "payroll_payment_item" USING btree ("payment_batch_id","status");