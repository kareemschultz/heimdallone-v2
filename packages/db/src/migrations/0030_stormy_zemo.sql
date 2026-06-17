CREATE TYPE "public"."work_location_type" AS ENUM('office', 'site', 'remote', 'warehouse', 'other');--> statement-breakpoint
CREATE TYPE "public"."payslip_template" AS ENUM('classic', 'modern', 'compact');--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text,
	"address_line_1" text,
	"address_line_2" text,
	"address_line_3" text,
	"phone" text,
	"email" text,
	"footer_note" text,
	"logo_url" text,
	"logo_data_uri" text,
	"brand_color_hex" text,
	"payslip_template" "payslip_template" DEFAULT 'classic' NOT NULL,
	"payslip_show_attendance" boolean DEFAULT true NOT NULL,
	"payslip_show_hours" boolean DEFAULT false NOT NULL,
	"payslip_show_nis" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geofence_location" ADD COLUMN "location_type" "work_location_type" DEFAULT 'office' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_branding_org_uq" ON "tenant_branding" USING btree ("organization_id");