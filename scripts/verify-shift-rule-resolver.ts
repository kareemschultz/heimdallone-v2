/**
 * Shift-rule resolver verification — Phase 21J.
 *
 *   §1  Pure resolveShiftRuleRow: shift-specific window beats org-default window;
 *       date windows; latest-effectiveFrom wins; unpublished excluded; no cover → null.
 *   §2  Pure mergeScheduleRule: null row → settings_fallback verbatim (byte-compatible);
 *       a present row overrides only the columns it sets and inherits the rest.
 *   §3  DB resolveScheduleConfig against the dev DB: with NO shift_rule rows the
 *       resolved config equals the org fallback; an inserted shift-specific rule
 *       beats an org-default rule; a future-dated window only applies on/after its
 *       effectiveFrom. §3 writes ephemeral rows for an EXISTING org+shift and
 *       deletes them in a finally — safe on dev. Never touches v1 or production.
 *
 * Usage: bun scripts/verify-shift-rule-resolver.ts
 */

import { and, eq } from "drizzle-orm";
import {
	mergeScheduleRule,
	type OrgScheduleFallback,
	resolveScheduleConfig,
	resolveShiftRuleRow,
} from "../packages/api/src/utils/shift-rule-resolver";
import { db } from "../packages/db/src";
import { organization } from "../packages/db/src/schema/auth";
import { shift } from "../packages/db/src/schema/hr-core";
import { shiftRule } from "../packages/db/src/schema/roster";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
	if (cond) {
		pass += 1;
		process.stdout.write(`  ✓ ${label}${extra ? ` — ${extra}` : ""}\n`);
	} else {
		fail += 1;
		process.stdout.write(`  ✗ ${label}${extra ? ` — ${extra}` : ""}\n`);
	}
}

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

// Minimal row factory — only the fields the resolver reads. The long list of flat
// `?? default` field initialisers trips the cognitive-complexity rule, but it is a
// pure test fixture builder with no real branching.
type Row = typeof shiftRule.$inferSelect;
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat test-fixture defaulter
function row(p: Partial<Row> & { id: string }): Row {
	return {
		id: p.id,
		organizationId: p.organizationId ?? "org",
		shiftId: p.shiftId ?? null,
		name: p.name ?? p.id,
		effectiveFrom: p.effectiveFrom ?? d("2024-01-01"),
		effectiveTo: p.effectiveTo ?? null,
		isPublished: p.isPublished ?? true,
		standardDailyMinutes: p.standardDailyMinutes ?? null,
		standardWeeklyMinutes: p.standardWeeklyMinutes ?? null,
		workDays: p.workDays ?? null,
		overtimeThresholdDailyMinutes: p.overtimeThresholdDailyMinutes ?? null,
		overtimeThresholdWeeklyMinutes: p.overtimeThresholdWeeklyMinutes ?? null,
		graceMinutesLate: p.graceMinutesLate ?? null,
		graceMinutesEarlyOut: p.graceMinutesEarlyOut ?? null,
		autoDeductBreak: p.autoDeductBreak ?? false,
		breakMinutes: p.breakMinutes ?? null,
		minBreakDeductionMinutes: p.minBreakDeductionMinutes ?? null,
		isSplitShift: p.isSplitShift ?? false,
		splitBreakStartMinutes: p.splitBreakStartMinutes ?? null,
		splitBreakEndMinutes: p.splitBreakEndMinutes ?? null,
		hasNightDifferential: p.hasNightDifferential ?? false,
		nightDiffStartMinutes: p.nightDiffStartMinutes ?? null,
		nightDiffEndMinutes: p.nightDiffEndMinutes ?? null,
		nightDiffMultiplier: p.nightDiffMultiplier ?? null,
		weekdayOvertimeMultiplier: p.weekdayOvertimeMultiplier ?? null,
		saturdayMultiplier: p.saturdayMultiplier ?? null,
		sundayMultiplier: p.sundayMultiplier ?? null,
		publicHolidayMultiplier: p.publicHolidayMultiplier ?? null,
		saturdayShiftStartMinutes: p.saturdayShiftStartMinutes ?? null,
		saturdayShiftEndMinutes: p.saturdayShiftEndMinutes ?? null,
		isFlexiTime: p.isFlexiTime ?? false,
		capDailyPaidMinutes: p.capDailyPaidMinutes ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as Row;
}

const FALLBACK: OrgScheduleFallback = {
	graceMinutesLate: 15,
	graceMinutesEarlyOut: 15,
	autoDeductBreak: false,
	breakMinutes: 0,
	minBreakDeductionMinutes: 0,
	weekdayOvertimeMultiplier: 1.5,
	saturdayMultiplier: 1.5,
	sundayMultiplier: 2,
	publicHolidayMultiplier: 2,
	nightDiffMultiplier: 1,
	workDays: [1, 2, 3, 4, 5],
};

function pureResolutionChecks() {
	process.stdout.write("\n§1 Pure resolveShiftRuleRow\n");
	const orgDefault = row({ id: "org-default", shiftId: null });
	const shiftSpecific = row({ id: "shift-A", shiftId: "shiftA" });

	ok(
		"shift-specific rule beats org-default",
		resolveShiftRuleRow([orgDefault, shiftSpecific], "shiftA", d("2026-06-01"))
			?.id === "shift-A"
	);
	ok(
		"falls back to org-default when no shift-specific rule",
		resolveShiftRuleRow([orgDefault, shiftSpecific], "shiftB", d("2026-06-01"))
			?.id === "org-default"
	);
	ok(
		"null target shift resolves the org default directly",
		resolveShiftRuleRow([orgDefault, shiftSpecific], null, d("2026-06-01"))
			?.id === "org-default"
	);

	// Date windows: an older window and a newer window for the same shift.
	const old = row({
		id: "shiftA-2024",
		shiftId: "shiftA",
		effectiveFrom: d("2024-01-01"),
		effectiveTo: d("2026-01-01"),
	});
	const recent = row({
		id: "shiftA-2026",
		shiftId: "shiftA",
		effectiveFrom: d("2026-01-01"),
	});
	ok(
		"work date in 2025 resolves the 2024 window",
		resolveShiftRuleRow([old, recent], "shiftA", d("2025-06-01"))?.id ===
			"shiftA-2024"
	);
	ok(
		"work date in 2026 resolves the 2026 window",
		resolveShiftRuleRow([old, recent], "shiftA", d("2026-06-01"))?.id ===
			"shiftA-2026"
	);
	ok(
		"work date before any window → null",
		resolveShiftRuleRow([old, recent], "shiftA", d("2023-06-01")) === null
	);
	ok(
		"unpublished rule is ignored",
		resolveShiftRuleRow(
			[row({ id: "draft", shiftId: "shiftA", isPublished: false })],
			"shiftA",
			d("2026-06-01")
		) === null
	);
	ok(
		"unpublished shift rule falls through to published org-default",
		resolveShiftRuleRow(
			[row({ id: "draft", shiftId: "shiftA", isPublished: false }), orgDefault],
			"shiftA",
			d("2026-06-01")
		)?.id === "org-default"
	);
}

function pureMergeChecks() {
	process.stdout.write("\n§2 Pure mergeScheduleRule\n");
	const fb = mergeScheduleRule(null, FALLBACK);
	ok("null row → settings_fallback source", fb.source === "settings_fallback");
	ok("null row inherits grace from fallback", fb.graceMinutesLate === 15);
	ok("null row → no split shift", fb.isSplitShift === false);
	ok("null row → null OT threshold", fb.overtimeThresholdDailyMinutes === null);
	ok(
		"null row → null standard daily minutes (attendance keeps its source)",
		fb.standardDailyMinutes === null
	);

	const partial = mergeScheduleRule(
		row({
			id: "r",
			shiftId: "shiftA",
			graceMinutesLate: 5,
			overtimeThresholdDailyMinutes: 480,
			hasNightDifferential: true,
			nightDiffStartMinutes: 1320,
			nightDiffEndMinutes: 360,
			nightDiffMultiplier: "1.25",
			saturdayMultiplier: "1.75",
		}),
		FALLBACK
	);
	ok("present shift row → source 'shift'", partial.source === "shift");
	ok("overrides set grace", partial.graceMinutesLate === 5);
	ok(
		"inherits unset grace-early-out from fallback",
		partial.graceMinutesEarlyOut === 15
	);
	ok(
		"carries OT daily threshold",
		partial.overtimeThresholdDailyMinutes === 480
	);
	ok(
		"night differential window carried",
		partial.hasNightDifferential === true
	);
	ok("night multiplier parsed to number", partial.nightDiffMultiplier === 1.25);
	ok("saturday multiplier overridden", partial.saturdayMultiplier === 1.75);
	ok(
		"unset sunday multiplier inherits fallback",
		partial.sundayMultiplier === 2
	);

	const orgRow = mergeScheduleRule(
		row({ id: "od", shiftId: null, standardDailyMinutes: 510 }),
		FALLBACK
	);
	ok("org-default row → source 'org_default'", orgRow.source === "org_default");
	ok(
		"org-default standard minutes carried",
		orgRow.standardDailyMinutes === 510
	);
}

async function dbChecks() {
	process.stdout.write("\n§3 DB resolveScheduleConfig (ephemeral, dev only)\n");
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.limit(1);
	if (!org) {
		ok("an organization exists to test against", false);
		return;
	}
	const [sh] = await db
		.select({ id: shift.id })
		.from(shift)
		.where(eq(shift.organizationId, org.id))
		.limit(1);

	const baseline = await resolveScheduleConfig(
		org.id,
		sh?.id ?? null,
		d("2026-06-01")
	);
	ok(
		"no shift_rule rows → settings_fallback (byte-compatible)",
		baseline.source === "settings_fallback"
	);

	if (!sh) {
		ok("a shift exists to test rule precedence (skipped)", true);
		return;
	}

	const ids = ["zz-shiftrule-default", "zz-shiftrule-shift"];
	try {
		await db.insert(shiftRule).values([
			{
				id: ids[0],
				organizationId: org.id,
				shiftId: null,
				name: "ZZ org default",
				effectiveFrom: d("2026-01-01"),
				graceMinutesLate: 9,
			},
			{
				id: ids[1],
				organizationId: org.id,
				shiftId: sh.id,
				name: "ZZ shift specific",
				effectiveFrom: d("2026-05-01"),
				graceMinutesLate: 3,
				overtimeThresholdDailyMinutes: 500,
			},
		]);
		const resolved = await resolveScheduleConfig(
			org.id,
			sh.id,
			d("2026-06-01")
		);
		ok(
			"shift-specific rule beats org default (DB)",
			resolved.source === "shift"
		);
		ok("shift-specific grace applied (DB)", resolved.graceMinutesLate === 3);
		ok(
			"shift OT threshold carried (DB)",
			resolved.overtimeThresholdDailyMinutes === 500
		);

		const beforeShiftWindow = await resolveScheduleConfig(
			org.id,
			sh.id,
			d("2026-03-01")
		);
		ok(
			"before shift window → org default rule (DB)",
			beforeShiftWindow.source === "org_default" &&
				beforeShiftWindow.graceMinutesLate === 9
		);
		const otherShift = await resolveScheduleConfig(
			org.id,
			"nonexistent-shift",
			d("2026-06-01")
		);
		ok(
			"unknown shift → org default rule (DB)",
			otherShift.source === "org_default"
		);
	} finally {
		await db
			.delete(shiftRule)
			.where(
				and(
					eq(shiftRule.organizationId, org.id),
					eq(shiftRule.name, "ZZ org default")
				)
			);
		await db
			.delete(shiftRule)
			.where(
				and(
					eq(shiftRule.organizationId, org.id),
					eq(shiftRule.name, "ZZ shift specific")
				)
			);
	}
}

async function main() {
	process.stdout.write("Shift-rule resolver verification (Phase 21J)\n");
	pureResolutionChecks();
	pureMergeChecks();
	await dbChecks();
	process.stdout.write(`\n${pass}/${pass + fail} checks passed\n`);
	if (fail > 0) {
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		process.stderr.write(`FAILED: ${e.message}\n`);
		process.exit(1);
	});
