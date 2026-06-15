// biome-ignore-all lint: one-shot roster/schedule mappers (Phase 21B).
//
// Both former gaps now have v2 homes (re-synced Phase 21M):
//  1. shift_roster_entries (175 rows) — PER-DATE roster with override + approval.
//     -> transform_map -> roster_entry (21D-D per-date roster API).
//  2. work_schedules — richer than v2 `shift` (night differential, split shift,
//     Saturday rates, OT thresholds, grace minutes, day overrides). -> shift_rule
//     pay-policy satellite (21J); residual fields preserved in source JSON.

import { coverFields, type Mapper } from "./types-v1";

const m = (v2: string | null, status: any, note?: string) => ({
	v2,
	status,
	note,
});

const workScheduleMapper: Mapper = {
	v1Table: "work_schedules",
	v2Target: "shift / shift_schedule (partial)",
	classification: "transform_map",
	reason:
		"v1 schedule is far richer than v2 shift; many fields feed payroll with no v2 home",
	selectSql: 'SELECT * FROM "work_schedules"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("shift.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			name: m("shift.name", "mapped"),
			code: m("shift.code", "mapped"),
			shift_start_minutes: m("shift_schedule.start_time", "mapped"),
			shift_end_minutes: m("shift_schedule.end_time", "mapped"),
			standard_daily_minutes: m(
				"shift_schedule.minimum_work_minutes",
				"manual_review"
			),
			standard_weekly_minutes: m("shift.weekly_full_time_minutes", "mapped"),
			work_days: m(
				"shift_schedule (per day_of_week)",
				"manual_review",
				"expand into v2 day rows"
			),
			is_archived: m("shift.is_active (inverse)", "mapped"),
			// --- features with NO v2 home (feed payroll) ---
			overtime_threshold_daily_minutes: m(
				null,
				"unmapped",
				"OT threshold — no v2 home; affects pay"
			),
			overtime_threshold_weekly_minutes: m(
				null,
				"unmapped",
				"OT threshold — no v2 home; affects pay"
			),
			grace_minutes_late: m(null, "unmapped", "lateness grace — no v2 home"),
			grace_minutes_early_out: m(
				null,
				"unmapped",
				"early-out grace — no v2 home"
			),
			is_flexi_time: m(null, "unmapped", "flexi-time — no v2 home"),
			is_split_shift: m(null, "unmapped", "split shift — no v2 home"),
			split_break_start_minutes: m(
				null,
				"unmapped",
				"split shift — no v2 home"
			),
			split_break_end_minutes: m(null, "unmapped", "split shift — no v2 home"),
			auto_deduct_break: m(null, "unmapped", "break rule — no v2 home"),
			break_minutes: m("shift_schedule (break)", "manual_review"),
			minimum_minutes_for_break_deduction: m(
				null,
				"unmapped",
				"break rule — no v2 home"
			),
			has_night_differential: m(
				null,
				"unmapped",
				"night differential — no v2 home; affects pay"
			),
			night_diff_start_minutes: m(
				null,
				"unmapped",
				"night differential — no v2 home"
			),
			night_diff_end_minutes: m(
				null,
				"unmapped",
				"night differential — no v2 home"
			),
			night_diff_multiplier_num: m(
				null,
				"unmapped",
				"night differential — no v2 home; affects pay"
			),
			night_diff_multiplier_den: m(
				null,
				"unmapped",
				"night differential — no v2 home; affects pay"
			),
			saturday_shift_start_minutes: m(
				null,
				"unmapped",
				"Saturday shift — no v2 home"
			),
			saturday_shift_end_minutes: m(
				null,
				"unmapped",
				"Saturday shift — no v2 home"
			),
			day_overrides: m(
				null,
				"unmapped",
				"per-day overrides (jsonb) — no v2 home"
			),
			cap_daily_paid_minutes: m(null, "unmapped", "daily pay cap — no v2 home"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} work schedules`,
				"v1 scheduling is much richer than v2 `shift` — night differential, split shift, Saturday rates, OT thresholds, grace, daily caps have NO v2 home and FEED PAYROLL",
				"DECISION NEEDED: extend v2 shift model or accept simplified scheduling (impacts overtime/night/Saturday pay)",
			],
		};
	},
};

const shiftAssignmentMapper: Mapper = {
	v1Table: "employee_shift_assignments",
	v2Target: "shift_schedule (employee link)",
	classification: "transform_map",
	reason: "employee -> work schedule binding (date-ranged)",
	selectSql: 'SELECT * FROM "employee_shift_assignments"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("(assignment ref)", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("employee link", "mapped"),
			work_schedule_id: m("shift.id", "mapped"),
			from_date: m("effective_from", "mapped"),
			to_date: m("effective_to", "mapped"),
			status: m("status", "mapped"),
			note: m("note", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} shift assignments`],
		};
	},
};

const rosterMapper: Mapper = {
	v1Table: "shift_roster_entries",
	v2Target: "roster_entry",
	classification: "transform_map",
	reason:
		"PER-DATE roster with override + custom times + approval -> roster_entry (21D-D)",
	selectSql: 'SELECT * FROM "shift_roster_entries"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m(
				"roster_entry.id (NEW)",
				"manual_review",
				"needs new v2 roster_entry table (21D)"
			),
			tenant_id: m("organization_id", "manual_review"),
			employee_id: m("roster_entry.employee_id (NEW)", "manual_review"),
			date: m("roster_entry.date (NEW)", "manual_review", "per-date — the gap"),
			work_schedule_id: m("roster_entry.shift_id (NEW)", "manual_review"),
			override_type: m("roster_entry.override_type (NEW)", "manual_review"),
			custom_shift_start_minutes: m(
				"roster_entry.custom_start (NEW)",
				"manual_review"
			),
			custom_shift_end_minutes: m(
				"roster_entry.custom_end (NEW)",
				"manual_review"
			),
			note: m("roster_entry.note (NEW)", "manual_review"),
			is_approved: m("roster_entry.is_approved (NEW)", "manual_review"),
			approved_by_user_id: m("roster_entry.approved_by (NEW)", "manual_review"),
			approved_at: m("roster_entry.approved_at (NEW)", "manual_review"),
		};
		const overrides = rows.filter((r) => r.override_type).length;
		const approved = rows.filter((r) => r.is_approved).length;
		return {
			fields: coverFields(rows, known),
			unmappable: rows.map((r) => ({
				id: r.id,
				reason: "no v2 roster table yet (blocked on 21D)",
			})),
			notes: [
				`${rows.length} per-date roster entries (${overrides} overrides, ${approved} approved)`,
				"BLOCKER: requires a v2 roster_entry table (21D) before this data can land",
				"This data feeds attendance/overtime/pay — highest-impact structural gap for the operational tenant",
			],
		};
	},
};

export const rosterMappers: Mapper[] = [
	workScheduleMapper,
	shiftAssignmentMapper,
	rosterMapper,
];
