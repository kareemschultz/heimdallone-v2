CREATE TYPE "public"."finance_budget_category" AS ENUM('labour', 'total');--> statement-breakpoint
CREATE TYPE "public"."finance_budget_scope" AS ENUM('organization', 'department', 'project');--> statement-breakpoint
CREATE TABLE "finance_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"scope" "finance_budget_scope" NOT NULL,
	"scope_id" text,
	"label" text NOT NULL,
	"category" "finance_budget_category" DEFAULT 'labour' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"currency" text NOT NULL,
	"budgeted_amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_budget_scope_period_uq" UNIQUE("organization_id","scope","scope_id","category","period_start","period_end")
);
--> statement-breakpoint
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_budget_org_scope_idx" ON "finance_budget" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE INDEX "finance_budget_org_period_idx" ON "finance_budget" USING btree ("organization_id","period_start");