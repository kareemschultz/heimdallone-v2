/**
 * Payroll profile resolver verification — Phase 21G-C.
 *
 * Proves the resolve-by-date + honor-pin behaviour that check-types and the pure
 * unit tests (packages/payroll-engine/src/effective-dating.test.ts) can't:
 *
 *   §1  The DB resolvers (resolveCountryPayrollProfileAsOf / resolveProfileById)
 *       select the correct window from REAL rows and enforce tenant scope.
 *   §2  buildPayrollInput HONORS payroll_run.countryProfileId — a pinned run
 *       reproduces its ruleset and overrides resolve-by-date; with no pin it
 *       resolves the rule in force on the period's pay date.
 *
 * Writes only ephemeral rows scoped to a unique throwaway country code, under an
 * EXISTING org, and deletes them in a finally — safe on the dev DB. It NEVER
 * touches v1 or production data and creates no organizations.
 *
 * Usage: bun scripts/verify-payroll-resolver.ts
 */

import { and, eq } from "drizzle-orm";
import { buildPayrollInput } from "../packages/api/src/utils/payroll-input-builder";
import {
	resolveCountryPayrollProfileAsOf,
	resolveProfileById,
	resolvePublishedProfileForOrgAsOf,
} from "../packages/api/src/utils/payroll-profile-resolver";
import { db } from "../packages/db/src";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import {
	countryPayrollProfile,
	payPeriod,
} from "../packages/db/src/schema/payroll";

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

// Unique throwaway country code so org-scoped queries never collide with the
// real GY profile, and cleanup is a single targeted delete.
const TEMP_CC = "ZZ";

function insertTempProfile(opts: {
	organizationId: string;
	effectiveYear: number;
	effectiveFrom: Date;
	effectiveTo: Date | null;
}) {
	return db
		.insert(countryPayrollProfile)
		.values({
			organizationId: opts.organizationId,
			countryCode: TEMP_CC,
			countryName: "Test Window",
			currency: "GYD",
			effectiveYear: opts.effectiveYear,
			effectiveFrom: opts.effectiveFrom,
			effectiveTo: opts.effectiveTo,
			taxBrackets: [{ min: 0, max: null, rate: 0, fixedAmount: 0 }],
			personalAllowanceFormula: "standard",
			personalAllowanceThreshold: "0.00",
			childAllowancePerChild: "0.00",
			employeeNISRate: "5.60",
			employerNISRate: "8.40",
			nisMaxEarnings: "0.00",
			isPublished: true,
		})
		.returning({ id: countryPayrollProfile.id })
		.then((r) => r[0]?.id ?? "");
}

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

async function main() {
	// Find a real org that has both an active employee and a pay period (needed
	// for the end-to-end builder proof in §2).
	const [period] = await db.select().from(payPeriod).limit(1);
	if (!period) {
		throw new Error("No pay period in dev DB — seed payroll first.");
	}
	const orgId = period.organizationId;
	const [emp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.isActive, true)
			)
		)
		.limit(1);
	if (!emp) {
		throw new Error(`No active employee in org ${orgId} — seed HR first.`);
	}

	const asOf = period.payDate ?? period.endDate;

	// Baseline: the org's REAL rule in force on the period's pay date, captured
	// BEFORE inserting any temp rows so §2's no-pin assertion has a known target.
	const baseline = await resolvePublishedProfileForOrgAsOf({
		organizationId: orgId,
		asOf,
	});
	if (!baseline) {
		throw new Error(
			`Org ${orgId} has no published profile in force on ${asOf.toISOString().slice(0, 10)} — seed a country profile.`
		);
	}
	const baselineYear = baseline.effectiveYear;

	const tempIds: string[] = [];
	try {
		// Two non-overlapping ZZ windows: 2024 (closed) and 2026 (open). Distinct
		// from the period's pay date so §2's no-pin path still resolves the real
		// baseline, not these.
		const oldId = await insertTempProfile({
			organizationId: orgId,
			effectiveYear: 2024,
			effectiveFrom: d("2024-01-01"),
			effectiveTo: d("2025-01-01"),
		});
		const newId = await insertTempProfile({
			organizationId: orgId,
			effectiveYear: 2026,
			effectiveFrom: d("2026-01-01"),
			effectiveTo: null,
		});
		tempIds.push(oldId, newId);

		process.stdout.write("\n§1 DB resolve-by-date + tenant scope\n");

		const oldPick = await resolveCountryPayrollProfileAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2024-06-15"),
		});
		ok(
			"older pay date resolves the older window",
			oldPick.id === oldId && oldPick.effectiveYear === 2024,
			`got ${oldPick.effectiveYear}`
		);

		const newPick = await resolveCountryPayrollProfileAsOf({
			organizationId: orgId,
			countryCode: TEMP_CC,
			asOf: d("2026-06-15"),
		});
		ok(
			"newer pay date resolves the newer window",
			newPick.id === newId && newPick.effectiveYear === 2026,
			`got ${newPick.effectiveYear}`
		);

		let threw = false;
		try {
			await resolveCountryPayrollProfileAsOf({
				organizationId: orgId,
				countryCode: TEMP_CC,
				asOf: d("2020-01-01"),
			});
		} catch {
			threw = true;
		}
		ok("a date before every window throws a clear error", threw);

		const byId = await resolveProfileById(orgId, oldId);
		ok("resolveProfileById returns the row", byId?.id === oldId);

		const foreign = await resolveProfileById("org-does-not-exist", oldId);
		ok(
			"resolveProfileById enforces tenant scope (foreign org → null)",
			foreign === null
		);

		process.stdout.write("\n§2 buildPayrollInput honors the run pin\n");

		const noPin = await buildPayrollInput(orgId, emp.id, period.id);
		ok(
			"no pin → resolves the rule in force on the pay date (baseline)",
			noPin.countryProfile.effectiveYear === baselineYear,
			`got ${noPin.countryProfile.effectiveYear}, baseline ${baselineYear}`
		);

		const pinned = await buildPayrollInput(orgId, emp.id, period.id, {
			pinnedProfileId: oldId,
		});
		ok(
			"pin overrides resolve-by-date (uses the pinned profile)",
			pinned.countryProfile.effectiveYear === 2024,
			`got ${pinned.countryProfile.effectiveYear}`
		);

		const dangling = await buildPayrollInput(orgId, emp.id, period.id, {
			pinnedProfileId: "profile-deleted-id",
		});
		ok(
			"dangling pin falls back to resolve-by-date (no crash)",
			dangling.countryProfile.effectiveYear === baselineYear,
			`got ${dangling.countryProfile.effectiveYear}`
		);
	} finally {
		// Targeted cleanup — only the ephemeral ZZ rows for this org.
		await db
			.delete(countryPayrollProfile)
			.where(
				and(
					eq(countryPayrollProfile.organizationId, orgId),
					eq(countryPayrollProfile.countryCode, TEMP_CC)
				)
			);
	}
}

main()
	.then(() => {
		process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
		process.exit(fail > 0 ? 1 : 0);
	})
	.catch((err) => {
		process.stderr.write(`\nverify-payroll-resolver crashed: ${err}\n`);
		process.exit(1);
	});
