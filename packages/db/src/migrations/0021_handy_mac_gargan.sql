CREATE TYPE "public"."gl_account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."gl_journal_source" AS ENUM('payroll', 'manual', 'opening_balance', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."gl_journal_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."roster_override_type" AS ENUM('none', 'custom_hours', 'day_off', 'swap');--> statement-breakpoint
CREATE TABLE "gl_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "gl_account_type" NOT NULL,
	"sub_type" text,
	"is_postable" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"parent_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gl_account_org_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "gl_journal_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"description" text,
	"entry_date" date NOT NULL,
	"currency" text NOT NULL,
	"source" "gl_journal_source" DEFAULT 'manual' NOT NULL,
	"status" "gl_journal_status" DEFAULT 'draft' NOT NULL,
	"reverses_entry_id" text,
	"reversed_by_entry_id" text,
	"posted_at" timestamp,
	"posted_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gl_journal_entry_org_ref_uq" UNIQUE("organization_id","reference")
);
--> statement-breakpoint
CREATE TABLE "gl_journal_line" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"journal_entry_id" text NOT NULL,
	"account_id" text NOT NULL,
	"debit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"linked_payslip_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"shift_id" text,
	"override_type" "roster_override_type" DEFAULT 'none' NOT NULL,
	"custom_start_minutes" integer,
	"custom_end_minutes" integer,
	"note" text,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roster_entry_employee_date_uq" UNIQUE("employee_id","date")
);
--> statement-breakpoint
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_parent_account_id_gl_account_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."gl_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_journal_entry" ADD CONSTRAINT "gl_journal_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_journal_entry" ADD CONSTRAINT "gl_journal_entry_posted_by_user_id_user_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_journal_entry_id_gl_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."gl_journal_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_account_id_gl_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gl_account_org_type_idx" ON "gl_account" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "gl_journal_entry_org_date_idx" ON "gl_journal_entry" USING btree ("organization_id","entry_date");--> statement-breakpoint
CREATE INDEX "gl_journal_entry_org_status_idx" ON "gl_journal_entry" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "gl_journal_line_entry_idx" ON "gl_journal_line" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "gl_journal_line_account_idx" ON "gl_journal_line" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notification_org_idx" ON "notification" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "roster_entry_org_date_idx" ON "roster_entry" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "roster_entry_employee_idx" ON "roster_entry" USING btree ("employee_id");