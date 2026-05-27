CREATE TYPE "public"."contract_pay_frequency" AS ENUM('weekly', 'monthly', 'semi_monthly');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."contract_wage_type" AS ENUM('daily', 'monthly', 'hourly');--> statement-breakpoint
CREATE TABLE "contract" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"contract_name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"wage_type" "contract_wage_type" NOT NULL,
	"pay_frequency" "contract_pay_frequency" NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"salary_currency" text DEFAULT 'GYD' NOT NULL,
	"filing_status_id" text,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"department_id" text,
	"job_position_id" text,
	"shift_id" text,
	"work_type_id" text,
	"notice_period_days" integer DEFAULT 30 NOT NULL,
	"document_url" text,
	"deduct_leave_from_basic_pay" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contract_employee_period_uq" UNIQUE("employee_id","start_date","end_date")
);
--> statement-breakpoint
CREATE TABLE "filing_status" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"based_on" text DEFAULT 'taxable_gross_pay' NOT NULL,
	"brackets" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "filing_status_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_filing_status_id_filing_status_id_fk" FOREIGN KEY ("filing_status_id") REFERENCES "public"."filing_status"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_work_type_id_work_type_id_fk" FOREIGN KEY ("work_type_id") REFERENCES "public"."work_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filing_status" ADD CONSTRAINT "filing_status_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_org_idx" ON "contract" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contract_employee_idx" ON "contract" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "contract_employee_status_idx" ON "contract" USING btree ("employee_id","status");