CREATE TABLE "shift_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shift_id" text,
	"name" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_published" boolean DEFAULT true NOT NULL,
	"standard_daily_minutes" integer,
	"standard_weekly_minutes" integer,
	"work_days" jsonb,
	"overtime_threshold_daily_minutes" integer,
	"overtime_threshold_weekly_minutes" integer,
	"grace_minutes_late" integer,
	"grace_minutes_early_out" integer,
	"auto_deduct_break" boolean DEFAULT false NOT NULL,
	"break_minutes" integer,
	"min_break_deduction_minutes" integer,
	"is_split_shift" boolean DEFAULT false NOT NULL,
	"split_break_start_minutes" integer,
	"split_break_end_minutes" integer,
	"has_night_differential" boolean DEFAULT false NOT NULL,
	"night_diff_start_minutes" integer,
	"night_diff_end_minutes" integer,
	"night_diff_multiplier" numeric(4, 2),
	"weekday_overtime_multiplier" numeric(4, 2),
	"saturday_multiplier" numeric(4, 2),
	"sunday_multiplier" numeric(4, 2),
	"public_holiday_multiplier" numeric(4, 2),
	"saturday_shift_start_minutes" integer,
	"saturday_shift_end_minutes" integer,
	"is_flexi_time" boolean DEFAULT false NOT NULL,
	"cap_daily_paid_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_rule" ADD CONSTRAINT "shift_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_rule" ADD CONSTRAINT "shift_rule_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_rule_org_idx" ON "shift_rule" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shift_rule_resolve_idx" ON "shift_rule" USING btree ("organization_id","shift_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_rule_shift_from_uidx" ON "shift_rule" USING btree ("organization_id","shift_id","effective_from") WHERE "shift_rule"."shift_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_rule_org_default_from_uidx" ON "shift_rule" USING btree ("organization_id","effective_from") WHERE "shift_rule"."shift_id" IS NULL;