CREATE TABLE "attendance_break" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"attendance_event_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"break_in" timestamp with time zone NOT NULL,
	"break_out" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_break" ADD CONSTRAINT "attendance_break_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_break" ADD CONSTRAINT "attendance_break_attendance_event_id_attendance_event_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_break" ADD CONSTRAINT "attendance_break_employee_id_employee_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "att_break_event_idx" ON "attendance_break" USING btree ("attendance_event_id");--> statement-breakpoint
CREATE INDEX "att_break_emp_idx" ON "attendance_break" USING btree ("employee_id");