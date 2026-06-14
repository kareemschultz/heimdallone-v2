/**
 * Leave effective-dating verification — Phase 21G-D.
 *
 *   §1  Pure server-side day counting (countLeaveDays): workweek + half-days +
 *       holiday exclusion + recurring holidays + custom workweek. DB-free.
 *   §2  resolveLeavePolicyAsOf selects the policy in force on a date from REAL
 *       rows — archived (historical) included, draft/deleted excluded, tenant
 *       scoped.
 *
 * §2 writes only ephemeral rows under a throwaway country code ("ZZ") for an
 * EXISTING org and deletes them in a finally — safe on the dev DB. Never touches
 * v1 or production.
 *
 * Usage: bun scripts/verify-leave-resolver.ts
 */

import { and, eq } from "drizzle-orm";
import { countLeaveDays } from "../packages/api/src/utils/leave-days";
import { resolveLeavePolicyAsOf } from "../packages/api/src/utils/leave-policy-resolver";
import { db } from "../packages/db/src";
import { organizationLeavePolicy } from "../packages/db/src/schema/leave-policy";
import { payrollSetting } from "../packages/db/src/schema/payroll";

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
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const TEMP_CC = "ZZ";

function pureDayCountChecks() {
	process.stdout.write("\n§1 Server-side day counting (pure)\n");

	// 2026-06-15 is a Monday → Mon–Fri is 5 working days.
	ok(
		"Mon–Fri full week = 5 working days",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-19"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: [],
			excludeHolidays: true,
		}) === 5
	);

	// Mon–Sun spans a weekend (Sat/Sun) → still 5 working days.
	ok(
		"range spanning a weekend excludes Sat/Sun",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-21"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: [],
			excludeHolidays: true,
		}) === 5
	);

	ok(
		"half-day start = 4.5",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-19"),
			startBreakdown: "second_half",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: [],
			excludeHolidays: true,
		}) === 4.5
	);

	ok(
		"single half-day = 0.5",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-15"),
			startBreakdown: "first_half",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: [],
			excludeHolidays: true,
		}) === 0.5
	);

	const midWeekHoliday = [
		{ startDate: d("2026-06-17"), endDate: null, isRecurring: false },
	];
	ok(
		"holiday in range excluded when excludeHolidays",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-19"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: midWeekHoliday,
			excludeHolidays: true,
		}) === 4
	);

	ok(
		"holiday NOT excluded when type allows holidays",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-19"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: midWeekHoliday,
			excludeHolidays: false,
		}) === 5
	);

	// Recurring holiday seeded in 2020 must still match in 2026 (same month/day).
	ok(
		"recurring holiday matches across years",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-19"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: WEEKDAYS,
			holidays: [
				{ startDate: d("2020-06-17"), endDate: null, isRecurring: true },
			],
			excludeHolidays: true,
		}) === 4
	);

	// Tenant whose workweek includes Saturday → Mon–Sat = 6.
	ok(
		"custom workweek (incl. Saturday) counts Saturday",
		countLeaveDays({
			startDate: d("2026-06-15"),
			endDate: d("2026-06-21"),
			startBreakdown: "full_day",
			endBreakdown: "full_day",
			workDays: [1, 2, 3, 4, 5, 6],
			holidays: [],
			excludeHolidays: true,
		}) === 6
	);
}

function insertTempPolicy(opts: {
	organizationId: string;
	name: string;
	status: "draft" | "active" | "archived";
	effectiveFrom: Date;
}) {
	return db
		.insert(organizationLeavePolicy)
		.values({
			organizationId: opts.organizationId,
			countryCode: TEMP_CC,
			name: opts.name,
			status: opts.status,
			effectiveFrom: opts.effectiveFrom,
		})
		.returning({ id: organizationLeavePolicy.id })
		.then((r) => r[0]?.id ?? "");
}

async function policyResolverChecks() {
	const [anySetting] = await db
		.select({ organizationId: payrollSetting.organizationId })
		.from(payrollSetting)
		.limit(1);
	if (!anySetting) {
		throw new Error("No org with payroll settings in dev DB — seed first.");
	}
	const orgId = anySetting.organizationId;

	try {
		const oldId = await insertTempPolicy({
			organizationId: orgId,
			name: "ZZ Old",
			status: "archived",
			effectiveFrom: d("2024-01-01"),
		});
		const draftId = await insertTempPolicy({
			organizationId: orgId,
			name: "ZZ Draft (unpublished)",
			status: "draft",
			effectiveFrom: d("2025-01-01"),
		});
		const newId = await insertTempPolicy({
			organizationId: orgId,
			name: "ZZ New",
			status: "active",
			effectiveFrom: d("2026-01-01"),
		});

		process.stdout.write("\n§2 resolveLeavePolicyAsOf (DB)\n");

		const oldPick = await resolveLeavePolicyAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2024-06-15"),
		});
		ok(
			"older request date resolves the archived policy",
			oldPick?.id === oldId
		);

		const newPick = await resolveLeavePolicyAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2026-06-15"),
		});
		ok("newer request date resolves the active policy", newPick?.id === newId);

		// 2025-06 falls after the draft's effectiveFrom, but draft is unpublished:
		// resolution must skip it and return the archived 2024 policy.
		const midPick = await resolveLeavePolicyAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2025-06-15"),
		});
		ok(
			"draft (unpublished) is skipped — resolves the published predecessor",
			midPick?.id === oldId && midPick?.id !== draftId
		);

		const beforeAll = await resolveLeavePolicyAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2020-01-01"),
		});
		ok("a date before every window resolves nothing", beforeAll === null);

		const foreign = await resolveLeavePolicyAsOf({
			organizationId: "org-does-not-exist",
			countryCode: TEMP_CC,
			asOf: d("2026-06-15"),
		});
		ok("tenant scope enforced (foreign org → null)", foreign === null);
	} finally {
		await db
			.delete(organizationLeavePolicy)
			.where(
				and(
					eq(organizationLeavePolicy.organizationId, orgId),
					eq(organizationLeavePolicy.countryCode, TEMP_CC)
				)
			);
	}
}

async function main() {
	pureDayCountChecks();
	await policyResolverChecks();
}

main()
	.then(() => {
		process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
		process.exit(fail > 0 ? 1 : 0);
	})
	.catch((err) => {
		process.stderr.write(`\nverify-leave-resolver crashed: ${err}\n`);
		process.exit(1);
	});
