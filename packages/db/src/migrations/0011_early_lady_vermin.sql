CREATE TYPE "public"."attendance_device_direction" AS ENUM('in', 'out', 'alternate', 'system');--> statement-breakpoint
CREATE TYPE "public"."attendance_device_mode" AS ENUM('csv_import', 'api_ingest', 'zkteco_tcp_planned', 'adms_push_planned', 'manual');--> statement-breakpoint
CREATE TYPE "public"."attendance_device_status" AS ENUM('active', 'inactive', 'error');--> statement-breakpoint
CREATE TYPE "public"."attendance_device_type" AS ENUM('zkteco', 'anviz', 'cosec', 'dahua', 'generic', 'virtual_kiosk');--> statement-breakpoint
CREATE TYPE "public"."attendance_exception_severity" AS ENUM('info', 'warning', 'blocker');--> statement-breakpoint
CREATE TYPE "public"."attendance_exception_status" AS ENUM('open', 'in_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."attendance_exception_type" AS ENUM('unmapped_punch', 'duplicate_punch', 'missing_clock_out', 'outside_geofence', 'low_gps_accuracy', 'clock_drift', 'spoofing_suspected', 'device_error', 'out_of_window');--> statement-breakpoint
CREATE TYPE "public"."attendance_punch_direction" AS ENUM('in', 'out', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."attendance_punch_status" AS ENUM('pending', 'processed', 'unmapped', 'duplicate', 'error');--> statement-breakpoint
CREATE TYPE "public"."attendance_sync_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attendance_verify_mode" AS ENUM('fingerprint', 'face', 'card', 'password', 'mobile_gps', 'manual', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."geofence_assignment_scope" AS ENUM('organization', 'department', 'employee');--> statement-breakpoint
CREATE TYPE "public"."geofence_check_status" AS ENUM('inside', 'outside', 'low_accuracy', 'unverified');--> statement-breakpoint
CREATE TABLE "attendance_device" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"device_type" "attendance_device_type" DEFAULT 'generic' NOT NULL,
	"vendor" text,
	"model" text,
	"serial_number" text,
	"mode" "attendance_device_mode" DEFAULT 'csv_import' NOT NULL,
	"host" text,
	"port" integer,
	"time_zone" text DEFAULT 'America/Guyana' NOT NULL,
	"work_site_id" text,
	"direction" "attendance_device_direction" DEFAULT 'alternate' NOT NULL,
	"api_key_hash" text,
	"credential_ref" text,
	"is_scheduled" boolean DEFAULT false NOT NULL,
	"schedule_interval_minutes" integer,
	"last_sync_cursor" timestamp with time zone,
	"last_sync_status" "attendance_sync_status",
	"clock_offset_seconds" integer DEFAULT 0 NOT NULL,
	"status" "attendance_device_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "attendance_device_employee_map" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_user_id" text NOT NULL,
	"device_user_serial" integer,
	"employee_id" text NOT NULL,
	"enrollment_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "attendance_device_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_id" text,
	"mode" "attendance_device_mode" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cursor_from" timestamp with time zone,
	"cursor_to" timestamp with time zone,
	"punches_fetched" integer DEFAULT 0 NOT NULL,
	"punches_created" integer DEFAULT 0 NOT NULL,
	"punches_duplicate" integer DEFAULT 0 NOT NULL,
	"punches_unmapped" integer DEFAULT 0 NOT NULL,
	"punches_error" integer DEFAULT 0 NOT NULL,
	"status" "attendance_sync_status" DEFAULT 'running' NOT NULL,
	"error_summary" text,
	"triggered_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text,
	"attendance_punch_id" text,
	"attendance_event_id" text,
	"attendance_record_id" text,
	"geofence_check_in_id" text,
	"device_id" text,
	"type" "attendance_exception_type" NOT NULL,
	"severity" "attendance_exception_severity" DEFAULT 'warning' NOT NULL,
	"status" "attendance_exception_status" DEFAULT 'open' NOT NULL,
	"detail" text NOT NULL,
	"resolution_action" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"correction_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_punch" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_id" text,
	"sync_run_id" text,
	"device_user_id" text,
	"employee_id" text,
	"punch_time" timestamp with time zone NOT NULL,
	"raw_punch_time" text,
	"direction" "attendance_punch_direction" DEFAULT 'unknown' NOT NULL,
	"verify_mode" "attendance_verify_mode" DEFAULT 'unknown' NOT NULL,
	"source" "attendance_source" DEFAULT 'import' NOT NULL,
	"processing_status" "attendance_punch_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_attendance_event_id" text,
	"error_reason" text,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "geofence_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"work_site_id" text NOT NULL,
	"scope" "geofence_assignment_scope" NOT NULL,
	"employee_id" text,
	"department_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "geofence_check_in" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"attendance_punch_id" text,
	"attendance_event_id" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy_meters" integer,
	"matched_work_site_id" text,
	"distance_meters" integer,
	"status" "geofence_check_status" NOT NULL,
	"mock_location_flag" boolean DEFAULT false NOT NULL,
	"impossible_travel_flag" boolean DEFAULT false NOT NULL,
	"reason" text,
	"user_agent" text,
	"platform" text,
	"selfie_url" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"coords_purged_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geofence_location" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"radius_meters" integer DEFAULT 150 NOT NULL,
	"accuracy_threshold_meters" integer DEFAULT 100 NOT NULL,
	"allow_outside_with_reason" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "enable_geofenced_check_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "default_geofence_radius_meters" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "default_geofence_accuracy_meters" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "clock_drift_threshold_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "gps_retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_setting" ADD COLUMN "block_payroll_on_open_exceptions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD CONSTRAINT "attendance_device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD CONSTRAINT "attendance_device_work_site_id_geofence_location_id_fk" FOREIGN KEY ("work_site_id") REFERENCES "public"."geofence_location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_employee_map" ADD CONSTRAINT "attendance_device_employee_map_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_employee_map" ADD CONSTRAINT "attendance_device_employee_map_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_employee_map" ADD CONSTRAINT "attendance_device_employee_map_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_sync_run" ADD CONSTRAINT "attendance_device_sync_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_sync_run" ADD CONSTRAINT "attendance_device_sync_run_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_sync_run" ADD CONSTRAINT "attendance_device_sync_run_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_attendance_punch_id_attendance_punch_id_fk" FOREIGN KEY ("attendance_punch_id") REFERENCES "public"."attendance_punch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_attendance_event_id_attendance_event_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_attendance_record_id_attendance_record_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_geofence_check_in_id_geofence_check_in_id_fk" FOREIGN KEY ("geofence_check_in_id") REFERENCES "public"."geofence_check_in"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exception" ADD CONSTRAINT "attendance_exception_correction_id_attendance_correction_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."attendance_correction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punch" ADD CONSTRAINT "attendance_punch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punch" ADD CONSTRAINT "attendance_punch_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punch" ADD CONSTRAINT "attendance_punch_sync_run_id_attendance_device_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."attendance_device_sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punch" ADD CONSTRAINT "attendance_punch_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punch" ADD CONSTRAINT "attendance_punch_created_attendance_event_id_attendance_event_id_fk" FOREIGN KEY ("created_attendance_event_id") REFERENCES "public"."attendance_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_assignment" ADD CONSTRAINT "geofence_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_assignment" ADD CONSTRAINT "geofence_assignment_work_site_id_geofence_location_id_fk" FOREIGN KEY ("work_site_id") REFERENCES "public"."geofence_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_assignment" ADD CONSTRAINT "geofence_assignment_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_assignment" ADD CONSTRAINT "geofence_assignment_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_check_in" ADD CONSTRAINT "geofence_check_in_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_check_in" ADD CONSTRAINT "geofence_check_in_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_check_in" ADD CONSTRAINT "geofence_check_in_attendance_punch_id_attendance_punch_id_fk" FOREIGN KEY ("attendance_punch_id") REFERENCES "public"."attendance_punch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_check_in" ADD CONSTRAINT "geofence_check_in_attendance_event_id_attendance_event_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_check_in" ADD CONSTRAINT "geofence_check_in_matched_work_site_id_geofence_location_id_fk" FOREIGN KEY ("matched_work_site_id") REFERENCES "public"."geofence_location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_location" ADD CONSTRAINT "geofence_location_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_device_org_idx" ON "attendance_device" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attendance_device_site_idx" ON "attendance_device" USING btree ("work_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_device_org_serial_uq" ON "attendance_device" USING btree ("organization_id","serial_number") WHERE "attendance_device"."serial_number" is not null and "attendance_device"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "att_dev_map_org_idx" ON "attendance_device_employee_map" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "att_dev_map_emp_idx" ON "attendance_device_employee_map" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "att_dev_map_device_user_uq" ON "attendance_device_employee_map" USING btree ("device_id","device_user_id") WHERE "attendance_device_employee_map"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "att_sync_run_org_idx" ON "attendance_device_sync_run" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "att_sync_run_device_idx" ON "attendance_device_sync_run" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "att_sync_run_status_idx" ON "attendance_device_sync_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "att_exception_org_status_idx" ON "attendance_exception" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "att_exception_emp_idx" ON "attendance_exception" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "att_exception_type_idx" ON "attendance_exception" USING btree ("type");--> statement-breakpoint
CREATE INDEX "att_exception_severity_idx" ON "attendance_exception" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "att_punch_org_status_idx" ON "attendance_punch" USING btree ("organization_id","processing_status");--> statement-breakpoint
CREATE INDEX "att_punch_emp_idx" ON "attendance_punch" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "att_punch_device_idx" ON "attendance_punch" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "att_punch_time_idx" ON "attendance_punch" USING btree ("punch_time");--> statement-breakpoint
CREATE UNIQUE INDEX "att_punch_idem_uq" ON "attendance_punch" USING btree ("organization_id","idempotency_key") WHERE "attendance_punch"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "geofence_assign_org_idx" ON "geofence_assignment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "geofence_assign_site_idx" ON "geofence_assignment" USING btree ("work_site_id");--> statement-breakpoint
CREATE INDEX "geofence_assign_emp_idx" ON "geofence_assignment" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "geofence_assign_dept_idx" ON "geofence_assignment" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "geofence_checkin_org_idx" ON "geofence_check_in" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "geofence_checkin_emp_idx" ON "geofence_check_in" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "geofence_checkin_status_idx" ON "geofence_check_in" USING btree ("status");--> statement-breakpoint
CREATE INDEX "geofence_checkin_punch_idx" ON "geofence_check_in" USING btree ("attendance_punch_id");--> statement-breakpoint
CREATE INDEX "geofence_location_org_idx" ON "geofence_location" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geofence_location_org_name_uq" ON "geofence_location" USING btree ("organization_id","name") WHERE "geofence_location"."deleted_at" is null;