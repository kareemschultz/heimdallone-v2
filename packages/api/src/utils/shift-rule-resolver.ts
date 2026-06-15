/**
 * Shift-rule resolver — Phase 21J.
 *
 * Resolves the work-schedule rule in force for an (organization, shift, work date)
 * and MERGES it over the organization-level fallbacks so callers always receive a
 * fully-populated `ResolvedScheduleRule`. Precedence:
 *
 *   shift-specific shift_rule (by work date)
 *     → organization-default shift_rule (shiftId = NULL, by work date)
 *       → existing org settings (payroll_setting / attendance_setting)
 *         → built-in defaults
 *
 * Most `shift_rule` columns are nullable: `null` means "inherit the fallback".
 * A tenant with NO shift_rule rows therefore resolves to exactly its current org
 * settings — so attendance/payroll behaviour is byte-identical until a tenant
 * opts in by configuring a rule. The pure functions are DB-agnostic and
 * unit-tested; `resolveScheduleConfig` is the DB-loading entry point.
 *
 * This module READS only. It never mutates roster, attendance, or payroll.
 */

import { db } from "@Heimdallone/db";
import {
	attendanceSetting,
	payrollSetting,
} from "@Heimdallone/db/schema/index";
import { shiftRule } from "@Heimdallone/db/schema/roster";
import { resolveAsOf } from "@Heimdallone/payroll-engine/effective-dating";
import { and, eq, isNull, or } from "drizzle-orm";

// Built-in defaults — mirror attendance-recalc.ts so a tenant with no settings at
// all resolves to the same numbers the recalc has always used.
const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

type ShiftRuleRow = typeof shiftRule.$inferSelect;

/**
 * The organization-level fallback values a shift rule layers on top of. These all
 * have a real org-level home (attendance_setting grace/break, payroll_setting
 * multipliers/workDays) so a null rule resolves to today's behaviour exactly.
 * Standard daily/weekly minutes are NOT here — they have no org-level equivalent
 * (attendance uses shift_schedule.minimumWorkMinutes), so they stay null unless a
 * rule sets them, keeping attendance byte-compatible.
 */
export interface OrgScheduleFallback {
	autoDeductBreak: boolean;
	breakMinutes: number;
	graceMinutesEarlyOut: number;
	graceMinutesLate: number;
	minBreakDeductionMinutes: number;
	nightDiffMultiplier: number;
	publicHolidayMultiplier: number;
	saturdayMultiplier: number;
	sundayMultiplier: number;
	weekdayOvertimeMultiplier: number;
	workDays: number[];
}

/** Fully-resolved schedule rule for one (shift, work date). */
export interface ResolvedScheduleRule extends OrgScheduleFallback {
	capDailyPaidMinutes: number | null;
	hasNightDifferential: boolean;
	isFlexiTime: boolean;
	isSplitShift: boolean;
	nightDiffEndMinutes: number | null;
	nightDiffStartMinutes: number | null;
	overtimeThresholdDailyMinutes: number | null;
	overtimeThresholdWeeklyMinutes: number | null;
	ruleId: string | null;
	ruleName: string | null;
	saturdayShiftEndMinutes: number | null;
	saturdayShiftStartMinutes: number | null;
	/** Where the resolved rule came from (for diagnostics / API `resolve`). */
	source: "shift" | "org_default" | "settings_fallback";
	splitBreakEndMinutes: number | null;
	splitBreakStartMinutes: number | null;
	// Rule-only (no org fallback) — null means "use the existing source".
	standardDailyMinutes: number | null;
	standardWeeklyMinutes: number | null;
}

function num(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * Pick the published rule in force on `asOf`: a shift-specific window wins over an
 * organization-default window; within each, the latest `effectiveFrom` covering
 * the date wins (via `resolveAsOf`). Returns null when neither covers the date.
 *
 * Pure: pass already-filtered (published) rows for ONE org. `targetShiftId` may be
 * null (resolving the org default directly).
 */
export function resolveShiftRuleRow(
	rows: readonly ShiftRuleRow[],
	targetShiftId: string | null,
	asOf: Date
): ShiftRuleRow | null {
	const published = rows.filter((r) => r.isPublished);
	if (targetShiftId !== null) {
		const shiftSpecific = published.filter((r) => r.shiftId === targetShiftId);
		const hit = resolveAsOf(shiftSpecific, asOf);
		if (hit) {
			return hit;
		}
	}
	const orgDefault = published.filter((r) => r.shiftId === null);
	return resolveAsOf(orgDefault, asOf);
}

/**
 * Merge a resolved rule row (or null) over the org fallback into a fully-populated
 * result. A null row → the fallback verbatim (`settings_fallback`). For a present
 * row, each nullable column overrides the fallback only when set.
 */
export function mergeScheduleRule(
	row: ShiftRuleRow | null,
	fallback: OrgScheduleFallback
): ResolvedScheduleRule {
	if (!row) {
		return {
			...fallback,
			source: "settings_fallback",
			ruleId: null,
			ruleName: null,
			standardDailyMinutes: null,
			standardWeeklyMinutes: null,
			overtimeThresholdDailyMinutes: null,
			overtimeThresholdWeeklyMinutes: null,
			isSplitShift: false,
			splitBreakStartMinutes: null,
			splitBreakEndMinutes: null,
			hasNightDifferential: false,
			nightDiffStartMinutes: null,
			nightDiffEndMinutes: null,
			saturdayShiftStartMinutes: null,
			saturdayShiftEndMinutes: null,
			isFlexiTime: false,
			capDailyPaidMinutes: null,
		};
	}
	return {
		source: row.shiftId === null ? "org_default" : "shift",
		ruleId: row.id,
		ruleName: row.name,
		graceMinutesLate: row.graceMinutesLate ?? fallback.graceMinutesLate,
		graceMinutesEarlyOut:
			row.graceMinutesEarlyOut ?? fallback.graceMinutesEarlyOut,
		// Rule-only (no org fallback): null unless the rule sets it.
		standardDailyMinutes: row.standardDailyMinutes,
		standardWeeklyMinutes: row.standardWeeklyMinutes,
		autoDeductBreak: row.autoDeductBreak || fallback.autoDeductBreak,
		breakMinutes: row.breakMinutes ?? fallback.breakMinutes,
		minBreakDeductionMinutes:
			row.minBreakDeductionMinutes ?? fallback.minBreakDeductionMinutes,
		weekdayOvertimeMultiplier:
			num(row.weekdayOvertimeMultiplier) ?? fallback.weekdayOvertimeMultiplier,
		saturdayMultiplier:
			num(row.saturdayMultiplier) ?? fallback.saturdayMultiplier,
		sundayMultiplier: num(row.sundayMultiplier) ?? fallback.sundayMultiplier,
		publicHolidayMultiplier:
			num(row.publicHolidayMultiplier) ?? fallback.publicHolidayMultiplier,
		nightDiffMultiplier:
			num(row.nightDiffMultiplier) ?? fallback.nightDiffMultiplier,
		workDays: (row.workDays as number[] | null) ?? fallback.workDays,
		overtimeThresholdDailyMinutes: row.overtimeThresholdDailyMinutes,
		overtimeThresholdWeeklyMinutes: row.overtimeThresholdWeeklyMinutes,
		isSplitShift: row.isSplitShift,
		splitBreakStartMinutes: row.splitBreakStartMinutes,
		splitBreakEndMinutes: row.splitBreakEndMinutes,
		hasNightDifferential: row.hasNightDifferential,
		nightDiffStartMinutes: row.nightDiffStartMinutes,
		nightDiffEndMinutes: row.nightDiffEndMinutes,
		saturdayShiftStartMinutes: row.saturdayShiftStartMinutes,
		saturdayShiftEndMinutes: row.saturdayShiftEndMinutes,
		isFlexiTime: row.isFlexiTime,
		capDailyPaidMinutes: row.capDailyPaidMinutes,
	};
}

/** Load the org-level fallback from payroll_setting + attendance_setting. */
export async function loadOrgScheduleFallback(
	organizationId: string
): Promise<OrgScheduleFallback> {
	const [pay] = await db
		.select({
			weekdayOvertimeMultiplier: payrollSetting.weekdayOvertimeMultiplier,
			saturdayMultiplier: payrollSetting.saturdayMultiplier,
			sundayMultiplier: payrollSetting.sundayMultiplier,
			publicHolidayMultiplier: payrollSetting.publicHolidayMultiplier,
			nightShiftMultiplier: payrollSetting.nightShiftMultiplier,
			workDays: payrollSetting.workDays,
		})
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	const [att] = await db
		.select({
			graceTimeMinutes: attendanceSetting.graceTimeMinutes,
			breakDeductionMinutes: attendanceSetting.breakDeductionMinutes,
			breakDeductionThresholdMinutes:
				attendanceSetting.breakDeductionThresholdMinutes,
		})
		.from(attendanceSetting)
		.where(eq(attendanceSetting.organizationId, organizationId))
		.limit(1);
	const grace = att?.graceTimeMinutes ?? DEFAULT_GRACE_MINUTES;
	return {
		graceMinutesLate: grace,
		graceMinutesEarlyOut: grace,
		autoDeductBreak: (att?.breakDeductionMinutes ?? 0) > 0,
		breakMinutes: att?.breakDeductionMinutes ?? 0,
		minBreakDeductionMinutes: att?.breakDeductionThresholdMinutes ?? 0,
		weekdayOvertimeMultiplier: num(pay?.weekdayOvertimeMultiplier) ?? 1.5,
		saturdayMultiplier: num(pay?.saturdayMultiplier) ?? 1.5,
		sundayMultiplier: num(pay?.sundayMultiplier) ?? 2,
		publicHolidayMultiplier: num(pay?.publicHolidayMultiplier) ?? 2,
		nightDiffMultiplier: num(pay?.nightShiftMultiplier) ?? 1,
		workDays: (pay?.workDays as number[] | null) ?? DEFAULT_WEEKDAYS,
	};
}

/**
 * Resolve the fully-merged schedule rule for (org, shift, work date). Loads only
 * the org's published shift_rule rows for the target shift OR the org default,
 * resolves by date, and merges over the org fallback. DB-reads only.
 */
export async function resolveScheduleConfig(
	organizationId: string,
	shiftId: string | null,
	asOf: Date
): Promise<ResolvedScheduleRule> {
	const fallback = await loadOrgScheduleFallback(organizationId);
	const shiftFilter =
		shiftId === null
			? isNull(shiftRule.shiftId)
			: or(eq(shiftRule.shiftId, shiftId), isNull(shiftRule.shiftId));
	const rows = await db
		.select()
		.from(shiftRule)
		.where(
			and(
				eq(shiftRule.organizationId, organizationId),
				eq(shiftRule.isPublished, true),
				shiftFilter
			)
		);
	const row = resolveShiftRuleRow(rows, shiftId, asOf);
	return mergeScheduleRule(row, fallback);
}
