CREATE TYPE "public"."loan_installment_status" AS ENUM('pending', 'deducted', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('active', 'settled', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('loan', 'advance', 'fine');--> statement-breakpoint
CREATE TYPE "public"."pay_item_type" AS ENUM('allowance', 'deduction');--> statement-breakpoint
CREATE TYPE "public"."pay_period_status" AS ENUM('open', 'processing', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payroll_issue_status" AS ENUM('open', 'acknowledged', 'resolved', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."payroll_issue_type" AS ENUM('blocker', 'warning');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'preview', 'confirmed', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."payslip_line_type" AS ENUM('earning', 'deduction', 'tax', 'employer_contribution');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('draft', 'confirmed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('requested', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_type" AS ENUM('expense', 'leave_encash', 'bonus_encash');--> statement-breakpoint
CREATE TABLE "country_payroll_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"currency" text NOT NULL,
	"effective_year" integer NOT NULL,
	"tax_brackets" jsonb NOT NULL,
	"personal_allowance_formula" text DEFAULT 'standard' NOT NULL,
	"personal_allowance_threshold" numeric(12, 2),
	"child_allowance_per_child" numeric(12, 2),
	"overtime_allowance_cap" numeric(12, 2),
	"insurance_premium_cap_formula" text,
	"insurance_premium_cap_amount" numeric(12, 2),
	"employee_nis_rate" numeric(5, 2) NOT NULL,
	"employer_nis_rate" numeric(5, 2) NOT NULL,
	"nis_max_earnings" numeric(12, 2),
	"other_statutory_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cpp_org_country_year_uq" UNIQUE("organization_id","country_code","effective_year")
);
--> statement-breakpoint
CREATE TABLE "loan" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" "loan_type" NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"provided_date" date NOT NULL,
	"total_installments" integer NOT NULL,
	"installment_amount" numeric(12, 2) NOT NULL,
	"installment_start_date" date NOT NULL,
	"paid_installments" integer DEFAULT 0 NOT NULL,
	"remaining_balance" numeric(12, 2) NOT NULL,
	"status" "loan_status" DEFAULT 'active' NOT NULL,
	"settled_at" timestamp,
	"description" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_installment" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "loan_installment_status" DEFAULT 'pending' NOT NULL,
	"payslip_id" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loan_installment_seq_uq" UNIQUE("loan_id","sequence_number")
);
--> statement-breakpoint
CREATE TABLE "pay_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "pay_item_type" NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_fixed" boolean DEFAULT true NOT NULL,
	"fixed_amount" numeric(12, 2),
	"based_on" text,
	"rate" numeric(5, 2),
	"is_taxable" boolean DEFAULT true NOT NULL,
	"is_pre_tax" boolean DEFAULT false NOT NULL,
	"is_tax" boolean DEFAULT false NOT NULL,
	"is_statutory" boolean DEFAULT false NOT NULL,
	"employer_rate" numeric(5, 2),
	"include_all_active" boolean DEFAULT true NOT NULL,
	"is_condition_based" boolean DEFAULT false NOT NULL,
	"conditions" jsonb,
	"one_time_date" date,
	"has_max_limit" boolean DEFAULT false NOT NULL,
	"max_amount" numeric(12, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_item_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"pay_item_id" text NOT NULL,
	"employee_id" text,
	"department_id" text,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"override_amount" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_period" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"pay_date" date,
	"frequency" text NOT NULL,
	"working_days" integer NOT NULL,
	"expected_hours" numeric(8, 2) NOT NULL,
	"status" "pay_period_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pay_period_org_dates_uq" UNIQUE("organization_id","start_date","end_date")
);
--> statement-breakpoint
CREATE TABLE "payroll_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payroll_run_id" text,
	"employee_id" text NOT NULL,
	"issue_type" "payroll_issue_type" NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"resolution" text,
	"status" "payroll_issue_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb,
	"resolved_at" timestamp,
	"resolved_by" text,
	"overridden_by" text,
	"override_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pay_period_id" text NOT NULL,
	"batch_name" text NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_employer_contributions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"blocker_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"overrides" jsonb,
	"confirmed_at" timestamp,
	"confirmed_by" text,
	"paid_at" timestamp,
	"paid_by" text,
	"reversed_at" timestamp,
	"reversed_by" text,
	"reversal_reason" text,
	"country_profile_id" text,
	"generated_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_run_org_period_batch_uq" UNIQUE("organization_id","pay_period_id","batch_name")
);
--> statement-breakpoint
CREATE TABLE "payroll_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"default_currency" text DEFAULT 'GYD' NOT NULL,
	"default_pay_frequency" text DEFAULT 'monthly' NOT NULL,
	"weekday_overtime_multiplier" numeric(3, 2) DEFAULT '1.50' NOT NULL,
	"saturday_multiplier" numeric(3, 2) DEFAULT '1.50' NOT NULL,
	"sunday_multiplier" numeric(3, 2) DEFAULT '2.00' NOT NULL,
	"public_holiday_multiplier" numeric(3, 2) DEFAULT '2.00' NOT NULL,
	"night_shift_multiplier" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"work_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"standard_hours_per_day" numeric(4, 2) DEFAULT '8.00' NOT NULL,
	"lunch_deduction_minutes" integer DEFAULT 0 NOT NULL,
	"minimum_net_pay_threshold" numeric(12, 2),
	"paid_holidays_for_hourly" boolean DEFAULT true NOT NULL,
	"auto_generate_enabled" boolean DEFAULT false NOT NULL,
	"auto_generate_day" integer,
	"setup_checklist_completed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslip" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payroll_run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"currency" text NOT NULL,
	"contract_wage" numeric(12, 2) NOT NULL,
	"wage_type" text NOT NULL,
	"basic_pay" numeric(12, 2) NOT NULL,
	"gross_pay" numeric(12, 2) NOT NULL,
	"taxable_gross" numeric(12, 2) NOT NULL,
	"total_deductions" numeric(12, 2) NOT NULL,
	"net_pay" numeric(12, 2) NOT NULL,
	"total_employer_contributions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"worked_days" numeric(6, 2) NOT NULL,
	"worked_hours" numeric(8, 2) NOT NULL,
	"overtime_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"paid_leave_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"unpaid_leave_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"holiday_days" integer DEFAULT 0 NOT NULL,
	"status" "payslip_status" DEFAULT 'draft' NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversal_of_id" text,
	"explanation" jsonb,
	"blockers" jsonb,
	"warnings" jsonb,
	"sent_to_employee" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payslip_emp_period_run_uq" UNIQUE("employee_id","period_start","period_end","payroll_run_id")
);
--> statement-breakpoint
CREATE TABLE "payslip_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"payslip_id" text NOT NULL,
	"pay_item_id" text,
	"type" "payslip_line_type" NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"is_employer_contribution" boolean DEFAULT false NOT NULL,
	"is_taxable" boolean DEFAULT false NOT NULL,
	"explanation" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" "reimbursement_type" NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"reimbursement_date" date NOT NULL,
	"attachment_url" text,
	"status" "reimbursement_status" DEFAULT 'requested' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"payslip_id" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_payroll_profile" ADD CONSTRAINT "country_payroll_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installment" ADD CONSTRAINT "loan_installment_loan_id_loan_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installment" ADD CONSTRAINT "loan_installment_payslip_id_payslip_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_assignment" ADD CONSTRAINT "pay_item_assignment_pay_item_id_pay_item_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_assignment" ADD CONSTRAINT "pay_item_assignment_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_assignment" ADD CONSTRAINT "pay_item_assignment_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period" ADD CONSTRAINT "pay_period_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_issue" ADD CONSTRAINT "payroll_issue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_issue" ADD CONSTRAINT "payroll_issue_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_issue" ADD CONSTRAINT "payroll_issue_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_issue" ADD CONSTRAINT "payroll_issue_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_issue" ADD CONSTRAINT "payroll_issue_overridden_by_user_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_pay_period_id_pay_period_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_country_profile_id_country_payroll_profile_id_fk" FOREIGN KEY ("country_profile_id") REFERENCES "public"."country_payroll_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD CONSTRAINT "payroll_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_line_item" ADD CONSTRAINT "payslip_line_item_payslip_id_payslip_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_line_item" ADD CONSTRAINT "payslip_line_item_pay_item_id_pay_item_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_payslip_id_payslip_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cpp_org_idx" ON "country_payroll_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cpp_country_year_idx" ON "country_payroll_profile" USING btree ("country_code","effective_year");--> statement-breakpoint
CREATE INDEX "loan_org_idx" ON "loan" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "loan_emp_status_idx" ON "loan" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "loan_installment_loan_idx" ON "loan_installment" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_installment_payslip_idx" ON "loan_installment" USING btree ("payslip_id");--> statement-breakpoint
CREATE INDEX "pay_item_org_type_idx" ON "pay_item" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "pay_item_org_active_idx" ON "pay_item" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "pay_item_assignment_item_idx" ON "pay_item_assignment" USING btree ("pay_item_id");--> statement-breakpoint
CREATE INDEX "pay_item_assignment_emp_idx" ON "pay_item_assignment" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "pay_item_assignment_dept_idx" ON "pay_item_assignment" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "pay_period_org_status_idx" ON "pay_period" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "pay_period_org_start_idx" ON "pay_period" USING btree ("organization_id","start_date");--> statement-breakpoint
CREATE INDEX "payroll_issue_run_idx" ON "payroll_issue" USING btree ("payroll_run_id","issue_type");--> statement-breakpoint
CREATE INDEX "payroll_issue_emp_idx" ON "payroll_issue" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_issue_status_idx" ON "payroll_issue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_run_org_status_idx" ON "payroll_run" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payroll_run_period_idx" ON "payroll_run" USING btree ("pay_period_id");--> statement-breakpoint
CREATE INDEX "payslip_org_status_idx" ON "payslip" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payslip_employee_idx" ON "payslip" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payslip_run_idx" ON "payslip" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payslip_period_idx" ON "payslip" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "payslip_li_payslip_idx" ON "payslip_line_item" USING btree ("payslip_id");--> statement-breakpoint
CREATE INDEX "payslip_li_payitem_idx" ON "payslip_line_item" USING btree ("pay_item_id");--> statement-breakpoint
CREATE INDEX "payslip_li_type_idx" ON "payslip_line_item" USING btree ("type");--> statement-breakpoint
CREATE INDEX "reimbursement_org_status_idx" ON "reimbursement" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "reimbursement_emp_idx" ON "reimbursement" USING btree ("employee_id");