CREATE TYPE "public"."attendance_vendor" AS ENUM('zkteco', 'ngteco', 'generic', 'other');--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "mode" SET DEFAULT 'csv_import'::text;--> statement-breakpoint
ALTER TABLE "attendance_device_sync_run" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."attendance_device_mode";--> statement-breakpoint
CREATE TYPE "public"."attendance_device_mode" AS ENUM('csv_import', 'excel_import', 'usb_export_import', 'api_ingest', 'zkteco_tcp_planned', 'zkteco_adms_push_planned', 'ngteco_cloud_export', 'ngteco_app_export', 'vendor_manual_upload', 'custom_adapter_planned');--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "mode" SET DEFAULT 'csv_import'::"public"."attendance_device_mode";--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "mode" SET DATA TYPE "public"."attendance_device_mode" USING "mode"::"public"."attendance_device_mode";--> statement-breakpoint
ALTER TABLE "attendance_device_sync_run" ALTER COLUMN "mode" SET DATA TYPE "public"."attendance_device_mode" USING "mode"::"public"."attendance_device_mode";--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "vendor" SET DEFAULT 'generic'::"public"."attendance_vendor";--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "vendor" SET DATA TYPE "public"."attendance_vendor" USING "vendor"::"public"."attendance_vendor";--> statement-breakpoint
ALTER TABLE "attendance_device" ALTER COLUMN "vendor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "model_family" text;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supported_punch_methods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "network_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "capacity_users" integer;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "capacity_logs" integer;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supports_offline_logs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supports_shift_rules" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supports_cloud_sync" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supports_mobile_app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "supports_gps_punch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD COLUMN "requires_subscription_for_advanced_features" boolean DEFAULT false NOT NULL;