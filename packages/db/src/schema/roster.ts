/**
 * Roster — Phase 21D-D schema.
 *
 * The v2 home for v1's per-date shift roster (`shift_roster_entries`, 175 live
 * rows on the operational tenant). v2's existing `shift` + `shift_schedule` model
 * a WEEKLY pattern only and structurally cannot hold a dated override/approval —
 * this table closes that gap (see docs/migration/v1-to-v2-gap-analysis.md §2.3).
 *
 * A roster_entry is the assignment of a shift to ONE employee on ONE date, with
 * optional per-day overrides (custom start/end minutes) and an approval step.
 * Attendance/overtime/payroll read the rostered shift per day; this table is the
 * source of that per-date truth.
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, employeeProfile, orgRef, shift, timestamps } from "./hr-core";

export const rosterOverrideTypeEnum = pgEnum("roster_override_type", [
	"none", // use the assigned shift's schedule as-is
	"custom_hours", // custom start/end minutes for this date
	"day_off", // explicitly off this date
	"swap", // swapped shift
]);

export const rosterEntry = pgTable(
	"roster_entry",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "cascade" }),
		// The date this roster entry applies to (the per-date key v2 lacked).
		date: date("date", { mode: "date" }).notNull(),
		// Assigned shift; SET NULL so archiving a shift doesn't delete history.
		shiftId: text("shift_id").references(() => shift.id, {
			onDelete: "set null",
		}),
		overrideType: rosterOverrideTypeEnum("override_type")
			.default("none")
			.notNull(),
		customStartMinutes: integer("custom_start_minutes"),
		customEndMinutes: integer("custom_end_minutes"),
		note: text("note"),
		// Approval workflow (v1 carried is_approved + approver + approved_at).
		isApproved: boolean("is_approved").default(false).notNull(),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at"),
		...timestamps,
	},
	(t) => [
		// One roster entry per employee per date.
		unique("roster_entry_employee_date_uq").on(t.employeeId, t.date),
		index("roster_entry_org_date_idx").on(t.organizationId, t.date),
		index("roster_entry_employee_idx").on(t.employeeId),
	]
);

export const rosterEntryRelations = relations(rosterEntry, ({ one }) => ({
	employee: one(employeeProfile, {
		fields: [rosterEntry.employeeId],
		references: [employeeProfile.id],
	}),
	shift: one(shift, {
		fields: [rosterEntry.shiftId],
		references: [shift.id],
	}),
	approvedBy: one(user, {
		fields: [rosterEntry.approvedByUserId],
		references: [user.id],
	}),
}));
