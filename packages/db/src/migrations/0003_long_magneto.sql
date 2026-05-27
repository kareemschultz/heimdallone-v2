CREATE TYPE "public"."attendance_correction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."attendance_day_type" AS ENUM('weekday', 'saturday', 'sunday', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."attendance_payroll_status" AS ENUM('pending', 'approved', 'payroll_locked');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('manual', 'biometric', 'mobile', 'import', 'admin');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'half_day', 'absent', 'holiday', 'conflict');--> statement-breakpoint
CREATE TABLE "attendance_correction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"attendance_record_id" text,
	"employee_id" text NOT NULL,
	"category" text NOT NULL,
	"requested_changes" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" "attendance_correction_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"event_date" date NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"duration_minutes" integer,
	"source" "attendance_source" DEFAULT 'manual' NOT NULL,
	"device_id" text,
	"location_lat" text,
	"location_lon" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_record" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"shift_id" text,
	"first_clock_in" text,
	"last_clock_out" text,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"minimum_minutes" integer DEFAULT 0 NOT NULL,
	"payable_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"approved_overtime_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_leave_minutes" integer DEFAULT 0 NOT NULL,
	"break_deducted_minutes" integer DEFAULT 0 NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"day_type" "attendance_day_type" DEFAULT 'weekday' NOT NULL,
	"is_validated" boolean DEFAULT false NOT NULL,
	"validated_by" text,
	"validated_at" timestamp with time zone,
	"is_overtime_approved" boolean DEFAULT false NOT NULL,
	"overtime_approved_by" text,
	"is_holiday" boolean DEFAULT false NOT NULL,
	"payroll_status" "attendance_payroll_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "att_record_emp_date_uq" UNIQUE("employee_id","date")
);
--> statement-breakpoint
CREATE TABLE "attendance_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enable_check_in" boolean DEFAULT true NOT NULL,
	"grace_time_minutes" integer DEFAULT 15 NOT NULL,
	"overtime_cutoff_minutes" integer,
	"auto_approve_overtime_threshold_minutes" integer,
	"break_deduction_minutes" integer DEFAULT 60 NOT NULL,
	"break_deduction_threshold_minutes" integer DEFAULT 360 NOT NULL,
	"enable_auto_checkout" boolean DEFAULT false NOT NULL,
	"auto_checkout_after_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_attendance_record_id_attendance_record_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_validated_by_user_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_overtime_approved_by_user_id_fk" FOREIGN KEY ("overtime_approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD CONSTRAINT "attendance_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "att_correction_emp_idx" ON "attendance_correction" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "att_correction_status_idx" ON "attendance_correction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "att_correction_org_idx" ON "attendance_correction" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "att_event_org_idx" ON "attendance_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "att_event_emp_date_idx" ON "attendance_event" USING btree ("employee_id","event_date");--> statement-breakpoint
CREATE INDEX "att_event_date_idx" ON "attendance_event" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "att_record_org_date_idx" ON "attendance_record" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "att_record_emp_idx" ON "attendance_record" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "att_record_payroll_idx" ON "attendance_record" USING btree ("payroll_status");