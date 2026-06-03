CREATE TYPE "public"."asset_request_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_return_condition" AS ENUM('healthy', 'minor_damage', 'major_damage');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('available', 'in_use', 'retired');--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"tracking_id" text NOT NULL,
	"description" text,
	"purchase_date" date,
	"purchase_cost" numeric(12, 2),
	"status" "asset_status" DEFAULT 'available' NOT NULL,
	"current_assignee_id" text,
	"expiry_date" date,
	"notify_before_days" integer,
	"lot_number" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "asset_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"assigned_to_id" text NOT NULL,
	"assigned_by_user_id" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"return_due_date" date,
	"returned_at" timestamp,
	"return_condition" "asset_return_condition",
	"return_received_by_user_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "asset_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "asset_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"requested_by_user_id" text,
	"category_id" text,
	"description" text,
	"status" "asset_request_status" DEFAULT 'requested' NOT NULL,
	"resolved_by_user_id" text,
	"resolved_at" timestamp,
	"resolution_note" text,
	"fulfilled_asset_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_category_id_asset_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_current_assignee_id_employee_profile_id_fk" FOREIGN KEY ("current_assignee_id") REFERENCES "public"."employee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_assigned_to_id_employee_profile_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_return_received_by_user_id_user_id_fk" FOREIGN KEY ("return_received_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_category_id_asset_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_fulfilled_asset_id_asset_id_fk" FOREIGN KEY ("fulfilled_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_org_tracking_uq" ON "asset" USING btree ("organization_id","tracking_id") WHERE "asset"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_org_status_idx" ON "asset" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "asset_org_assignee_idx" ON "asset" USING btree ("organization_id","current_assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_assignment_open_uq" ON "asset_assignment" USING btree ("asset_id") WHERE "asset_assignment"."returned_at" is null and "asset_assignment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_assignment_org_assignee_idx" ON "asset_assignment" USING btree ("organization_id","assigned_to_id");--> statement-breakpoint
CREATE INDEX "asset_assignment_asset_idx" ON "asset_assignment" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_category_org_idx" ON "asset_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_category_org_name_uq" ON "asset_category" USING btree ("organization_id","name") WHERE "asset_category"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_request_org_employee_idx" ON "asset_request" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "asset_request_org_status_idx" ON "asset_request" USING btree ("organization_id","status");