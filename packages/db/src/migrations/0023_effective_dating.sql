CREATE TYPE "public"."payslip_correction_gl_status" AS ENUM('not_required', 'pending', 'posted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payslip_correction_reason" AS ENUM('wrong_rule', 'missing_effective_rule', 'wrong_proration', 'engine_bug', 'data_fix', 'other');--> statement-breakpoint
CREATE TABLE "payslip_correction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"original_payslip_id" text NOT NULL,
	"corrected_payslip_id" text,
	"correction_run_id" text,
	"reason_code" "payslip_correction_reason" NOT NULL,
	"reason_note" text,
	"resolved_profile_id" text,
	"rule_version_label" text,
	"gl_adjustment_status" "payslip_correction_gl_status" DEFAULT 'not_required' NOT NULL,
	"gl_journal_id" text,
	"component_deltas" jsonb,
	"corrected_at" timestamp DEFAULT now() NOT NULL,
	"corrected_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_payroll_profile" DROP CONSTRAINT "cpp_org_country_year_uq";--> statement-breakpoint
-- 21G-B: safe backfill — add effective_from nullable, backfill from effective_year (Jan 1), then enforce NOT NULL.
ALTER TABLE "country_payroll_profile" ADD COLUMN "effective_from" date;--> statement-breakpoint
UPDATE "country_payroll_profile" SET "effective_from" = make_date("effective_year", 1, 1) WHERE "effective_from" IS NULL;--> statement-breakpoint
ALTER TABLE "country_payroll_profile" ALTER COLUMN "effective_from" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "country_payroll_profile" ADD COLUMN "effective_to" date;--> statement-breakpoint
-- 21G-B: data-preserving rename (NOT drop+add) — keeps existing values + default(true)/not-null.
ALTER TABLE "country_payroll_profile" RENAME COLUMN "is_active" TO "is_published";--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "rule_version_label" text;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "weekend_days" jsonb DEFAULT '[6,7]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payslip" ADD COLUMN "superseded_by_correction_id" text;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_original_payslip_id_payslip_id_fk" FOREIGN KEY ("original_payslip_id") REFERENCES "public"."payslip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_corrected_payslip_id_payslip_id_fk" FOREIGN KEY ("corrected_payslip_id") REFERENCES "public"."payslip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_correction_run_id_payroll_run_id_fk" FOREIGN KEY ("correction_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_resolved_profile_id_country_payroll_profile_id_fk" FOREIGN KEY ("resolved_profile_id") REFERENCES "public"."country_payroll_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_correction" ADD CONSTRAINT "payslip_correction_corrected_by_user_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payslip_correction_org_idx" ON "payslip_correction" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payslip_correction_original_idx" ON "payslip_correction" USING btree ("original_payslip_id");--> statement-breakpoint
CREATE INDEX "payslip_correction_gl_status_idx" ON "payslip_correction" USING btree ("organization_id","gl_adjustment_status");--> statement-breakpoint
CREATE INDEX "cpp_resolve_idx" ON "country_payroll_profile" USING btree ("organization_id","country_code","effective_from");--> statement-breakpoint
ALTER TABLE "country_payroll_profile" ADD CONSTRAINT "cpp_org_country_from_uq" UNIQUE("organization_id","country_code","effective_from");