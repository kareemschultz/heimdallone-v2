CREATE TYPE "public"."inventory_image_match" AS ENUM('matched', 'none', 'multiple', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."inventory_location_kind" AS ENUM('office', 'bond');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('in', 'out', 'transfer', 'adjustment', 'count_adjustment', 'reserve', 'release', 'damaged', 'returned', 'issued', 'sold');--> statement-breakpoint
CREATE TABLE "inventory_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_location" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "inventory_location_kind" NOT NULL,
	"code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"old_price_cents" bigint,
	"new_price_cents" bigint NOT NULL,
	"currency_code" text DEFAULT 'GYD' NOT NULL,
	"effective_date" timestamp NOT NULL,
	"reason" text,
	"source" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_product" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"sku" text,
	"model_name" text,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"type_id" text NOT NULL,
	"brand" text,
	"description" text,
	"features" text,
	"unit_price_cents" bigint,
	"currency_code" text DEFAULT 'GYD' NOT NULL,
	"aliases" jsonb,
	"attributes_json" jsonb,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_product_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_product_attribute" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_product_image" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"match_confidence" "inventory_image_match",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_product_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"location_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"qty" integer NOT NULL,
	"source_location_id" text,
	"destination_location_id" text,
	"reason" text,
	"reference" text,
	"notes" text,
	"status" "inventory_movement_status" DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "inventory_category" ADD CONSTRAINT "inventory_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_price_history" ADD CONSTRAINT "inventory_price_history_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_price_history" ADD CONSTRAINT "inventory_price_history_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product" ADD CONSTRAINT "inventory_product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product" ADD CONSTRAINT "inventory_product_category_id_inventory_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product" ADD CONSTRAINT "inventory_product_type_id_inventory_product_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."inventory_product_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product_alias" ADD CONSTRAINT "inventory_product_alias_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product_attribute" ADD CONSTRAINT "inventory_product_attribute_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product_image" ADD CONSTRAINT "inventory_product_image_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product_type" ADD CONSTRAINT "inventory_product_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_product_type" ADD CONSTRAINT "inventory_product_type_category_id_inventory_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balance" ADD CONSTRAINT "inventory_stock_balance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balance" ADD CONSTRAINT "inventory_stock_balance_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balance" ADD CONSTRAINT "inventory_stock_balance_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_product_id_inventory_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_source_location_id_inventory_location_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_destination_location_id_inventory_location_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_category_org_idx" ON "inventory_category" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_category_org_slug_uq" ON "inventory_category" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "inventory_location_org_idx" ON "inventory_location" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_location_kind_idx" ON "inventory_location" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_location_org_slug_uq" ON "inventory_location" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "inventory_price_history_product_effective_idx" ON "inventory_price_history" USING btree ("product_id","effective_date");--> statement-breakpoint
CREATE INDEX "inventory_product_org_idx" ON "inventory_product" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_product_category_type_idx" ON "inventory_product" USING btree ("category_id","type_id");--> statement-breakpoint
CREATE INDEX "inventory_product_model_name_idx" ON "inventory_product" USING btree ("model_name");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_product_org_sku_uq" ON "inventory_product" USING btree ("organization_id","sku") WHERE "inventory_product"."sku" is not null;--> statement-breakpoint
CREATE INDEX "inventory_product_alias_normalized_idx" ON "inventory_product_alias" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "inventory_product_alias_product_idx" ON "inventory_product_alias" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_product_attribute_product_idx" ON "inventory_product_attribute" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_product_image_product_idx" ON "inventory_product_image" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_product_type_org_idx" ON "inventory_product_type" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_product_type_category_idx" ON "inventory_product_type" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_balance_org_idx" ON "inventory_stock_balance" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stock_balance_product_location_uq" ON "inventory_stock_balance" USING btree ("product_id","location_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_balance_location_idx" ON "inventory_stock_balance" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_movement_org_idx" ON "inventory_stock_movement" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_movement_product_idx" ON "inventory_stock_movement" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_movement_status_idx" ON "inventory_stock_movement" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_stock_movement_created_at_idx" ON "inventory_stock_movement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_stock_movement_reference_idx" ON "inventory_stock_movement" USING btree ("reference");