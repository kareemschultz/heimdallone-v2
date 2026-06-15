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

import { relations, sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
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
		// RESTRICT (not cascade) — matches every sibling per-employee history table
		// (attendance/leave/payroll). Roster is approved, payroll-feeding history;
		// a hard employee delete must not silently erase it.
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
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

/**
 * shift_rule — Phase 21J: the tenant-configurable, effective-dated home for
 * pay-affecting work-schedule richness (the v1 `work_schedules` intent).
 *
 * DESIGN (SaaS Architecture Rule — NOT a Netsurf clone):
 * - Scoped to `organizationId`; `shiftId` optional. A row with `shiftId = NULL`
 *   is the ORGANIZATION-DEFAULT rule; a row with a `shiftId` is shift-specific.
 * - Effective-dated (21G pattern): resolved by WORK DATE within
 *   `[effectiveFrom, effectiveTo)`; `isPublished` is the publish guard. Historical
 *   work dates keep resolving the window that was in force — old attendance/pay is
 *   never silently re-rated.
 * - Resolution precedence: shift-specific rule (by date) → org-default rule (by
 *   date) → the existing org settings (`payroll_setting`/`attendance_setting`) →
 *   built-in defaults. Most columns are NULLABLE: `null` means "inherit the
 *   fallback", so a tenant with NO shift_rule rows behaves byte-identically to
 *   today (the reconcile-46/46 + attendance guards depend on this).
 * - Multiplier columns are per-shift OVERRIDES of the org `payroll_setting`
 *   multipliers; the fields with no org-level equivalent (split shift, night-diff
 *   window, Saturday-specific window, daily cap, OT thresholds, standard minutes)
 *   live ONLY here.
 */
export const shiftRule = pgTable(
	"shift_rule",
	{
		id: cuid(),
		organizationId: orgRef(),
		// NULL = organization-default rule (fallback for shifts without a specific
		// rule). Cascade so deleting a shift removes its shift-specific rules; the
		// org-default rule (null shiftId) is unaffected.
		shiftId: text("shift_id").references(() => shift.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		// Effective-dating: resolve by work date (21G `resolveAsOf`).
		effectiveFrom: date("effective_from", { mode: "date" }).notNull(),
		effectiveTo: date("effective_to", { mode: "date" }),
		isPublished: boolean("is_published").default(true).notNull(),

		// Standard expected work (no org-level per-shift equivalent).
		standardDailyMinutes: integer("standard_daily_minutes"),
		standardWeeklyMinutes: integer("standard_weekly_minutes"),
		// Optional per-shift working-days override (ISO 1=Mon…7=Sun); null = org workDays.
		workDays: jsonb("work_days"),

		// Overtime thresholds (minutes beyond which OT accrues).
		overtimeThresholdDailyMinutes: integer("overtime_threshold_daily_minutes"),
		overtimeThresholdWeeklyMinutes: integer(
			"overtime_threshold_weekly_minutes"
		),

		// Grace windows.
		graceMinutesLate: integer("grace_minutes_late"),
		graceMinutesEarlyOut: integer("grace_minutes_early_out"),

		// Auto break deduction (per-shift override of attendance_setting).
		autoDeductBreak: boolean("auto_deduct_break").default(false).notNull(),
		breakMinutes: integer("break_minutes"),
		minBreakDeductionMinutes: integer("min_break_deduction_minutes"),

		// Split shift (unpaid mid-shift break window, in minutes-from-midnight).
		isSplitShift: boolean("is_split_shift").default(false).notNull(),
		splitBreakStartMinutes: integer("split_break_start_minutes"),
		splitBreakEndMinutes: integer("split_break_end_minutes"),

		// Night differential: window (minutes-from-midnight) + per-shift multiplier.
		hasNightDifferential: boolean("has_night_differential")
			.default(false)
			.notNull(),
		nightDiffStartMinutes: integer("night_diff_start_minutes"),
		nightDiffEndMinutes: integer("night_diff_end_minutes"),
		nightDiffMultiplier: numeric("night_diff_multiplier", {
			precision: 4,
			scale: 2,
		}),

		// Per-shift multiplier overrides (null = inherit payroll_setting).
		weekdayOvertimeMultiplier: numeric("weekday_overtime_multiplier", {
			precision: 4,
			scale: 2,
		}),
		saturdayMultiplier: numeric("saturday_multiplier", {
			precision: 4,
			scale: 2,
		}),
		sundayMultiplier: numeric("sunday_multiplier", { precision: 4, scale: 2 }),
		publicHolidayMultiplier: numeric("public_holiday_multiplier", {
			precision: 4,
			scale: 2,
		}),

		// Saturday-specific shift window (no org-level equivalent).
		saturdayShiftStartMinutes: integer("saturday_shift_start_minutes"),
		saturdayShiftEndMinutes: integer("saturday_shift_end_minutes"),

		// Flexi-time + a hard cap on paid minutes/day.
		isFlexiTime: boolean("is_flexi_time").default(false).notNull(),
		capDailyPaidMinutes: integer("cap_daily_paid_minutes"),

		...timestamps,
	},
	(t) => [
		index("shift_rule_org_idx").on(t.organizationId),
		// Resolution index (resolve-by-date lookups for a shift or the org default).
		index("shift_rule_resolve_idx").on(
			t.organizationId,
			t.shiftId,
			t.effectiveFrom
		),
		// No two windows for the SAME shift may start on the same day.
		uniqueIndex("shift_rule_shift_from_uidx")
			.on(t.organizationId, t.shiftId, t.effectiveFrom)
			.where(sql`${t.shiftId} IS NOT NULL`),
		// No two ORG-DEFAULT windows (null shiftId) may start on the same day.
		uniqueIndex("shift_rule_org_default_from_uidx")
			.on(t.organizationId, t.effectiveFrom)
			.where(sql`${t.shiftId} IS NULL`),
	]
);

export const shiftRuleRelations = relations(shiftRule, ({ one }) => ({
	shift: one(shift, {
		fields: [shiftRule.shiftId],
		references: [shift.id],
	}),
}));

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
