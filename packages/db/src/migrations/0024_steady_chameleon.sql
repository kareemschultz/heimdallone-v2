CREATE TABLE "employee_statutory" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"tax_identification_number" text,
	"social_security_number" text,
	"dependent_children" integer DEFAULT 0 NOT NULL,
	"has_second_job" boolean DEFAULT false NOT NULL,
	"second_job_pay_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_insurance_on_file" boolean DEFAULT false NOT NULL,
	"medical_payroll_deduction_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_external_premium_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_deductions_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_statutory_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "employee_profile" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statutory" ADD CONSTRAINT "employee_statutory_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE cascade ON UPDATE no action;