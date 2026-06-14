/**
 * Historical payslip correction verification — Phase 21G-G.
 *
 *   §1  Pure per-component diff (buildComponentDeltas): no-op detection, net
 *       delta, rounding. DB-free.
 *   §2  Full correction lifecycle on an ISOLATED temp run + payslip given
 *       deliberately-wrong stored values: preview is read-only, apply is
 *       transactional, the ORIGINAL is immutable (only the back-pointer changes),
 *       the GL adjustment is recorded as an obligation (never posted by payroll),
 *       and double-correction is blocked.
 *
 * Writes only ephemeral rows (temp run/payslip/correction) for an EXISTING org,
 * cleaned up in a finally — safe on the dev DB. Never touches v1 or production.
 *
 * Usage: bun scripts/verify-payslip-correction.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import {
	applyPayslipCorrection,
	computeCorrection,
} from "../packages/api/src/routers/payroll";
import { buildComponentDeltas } from "../packages/api/src/utils/payslip-correction";
import { db } from "../packages/db/src";
import {
	payPeriod,
	payrollRun,
	payslip,
	payslipCorrection,
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

function pureChecks() {
	process.stdout.write("\n§1 buildComponentDeltas (pure)\n");

	const same = {
		grossPay: 100,
		taxableGross: 90,
		totalDeductions: 20,
		netPay: 80,
		employerContributions: 10,
	};
	const noChange = buildComponentDeltas(same, same);
	ok(
		"identical figures → no changes, netDelta 0",
		!noChange.hasChanges && noChange.netDelta === 0
	);

	const corrected = {
		grossPay: 120,
		taxableGross: 110,
		totalDeductions: 25,
		netPay: 95,
		employerContributions: 12,
	};
	const changed = buildComponentDeltas(same, corrected);
	ok(
		"net increase → hasChanges, netDelta = +15",
		changed.hasChanges && changed.netDelta === 15
	);
	ok(
		"per-component delta computed (gross +20)",
		changed.deltas.grossPay.delta === 20 &&
			changed.deltas.grossPay.original === 100 &&
			changed.deltas.grossPay.corrected === 120
	);

	const rounded = buildComponentDeltas(
		{ ...same, netPay: 80.005 },
		{ ...same, netPay: 80.015 }
	);
	ok("rounds to 2dp (0.01 delta)", rounded.deltas.netPay.delta === 0.01);
}

async function lifecycleChecks() {
	const [seed] = await db.select().from(payslip).limit(1);
	if (!seed) {
		throw new Error("No payslip in dev DB — seed payroll first.");
	}
	const orgId = seed.organizationId;
	const [period] = await db
		.select()
		.from(payPeriod)
		.where(eq(payPeriod.organizationId, orgId))
		.limit(1);
	if (!period) {
		throw new Error("No pay period for org.");
	}
	// Reuse a real user id (generatedBy FK) from the seed payslip's run.
	const [seedRun] = await db
		.select({ generatedBy: payrollRun.generatedBy })
		.from(payrollRun)
		.where(eq(payrollRun.id, seed.payrollRunId))
		.limit(1);
	const realUserId = seedRun?.generatedBy;
	if (!realUserId) {
		throw new Error("Could not resolve a real user id for generatedBy.");
	}

	const tempRunId = createId();
	const tempPayslipId = createId();
	try {
		await db.insert(payrollRun).values({
			id: tempRunId,
			organizationId: orgId,
			payPeriodId: period.id,
			batchName: `ZZ-correction-test-${tempRunId.slice(0, 6)}`,
			status: "draft",
			currency: seed.currency,
			generatedBy: realUserId,
		});

		// Deliberately-wrong stored figures so recompute differs.
		await db.insert(payslip).values({
			id: tempPayslipId,
			organizationId: orgId,
			payrollRunId: tempRunId,
			employeeId: seed.employeeId,
			contractId: seed.contractId,
			periodStart: period.startDate,
			periodEnd: period.endDate,
			currency: seed.currency,
			contractWage: seed.contractWage,
			wageType: seed.wageType,
			basicPay: "1.00",
			grossPay: "1.00",
			taxableGross: "1.00",
			totalDeductions: "0.00",
			netPay: "1.00",
			workedDays: seed.workedDays,
			workedHours: seed.workedHours,
		});

		process.stdout.write("\n§2 Correction lifecycle (DB)\n");

		const preview = await computeCorrection(orgId, tempPayslipId);
		ok("preview detects changes vs wrong original", preview.hasChanges);

		const [afterPreview] = await db
			.select()
			.from(payslip)
			.where(eq(payslip.id, tempPayslipId))
			.limit(1);
		ok(
			"preview is read-only (original untouched)",
			afterPreview?.grossPay === "1.00" &&
				afterPreview?.supersededByCorrectionId === null
		);

		const applied = await applyPayslipCorrection(orgId, realUserId, {
			payslipId: tempPayslipId,
			reasonCode: "missing_effective_rule",
			reasonNote: "verify-script",
		});
		ok("apply returns a correction id", Boolean(applied.id));
		ok(
			"GL adjustment recorded as obligation (pending, nonzero delta)",
			applied.glAdjustmentStatus === "pending" && applied.netDelta !== 0
		);

		const [correction] = await db
			.select()
			.from(payslipCorrection)
			.where(eq(payslipCorrection.id, applied.id))
			.limit(1);
		ok(
			"correction row links the original + records rule + deltas",
			correction?.originalPayslipId === tempPayslipId &&
				Boolean(correction?.ruleVersionLabel) &&
				correction?.componentDeltas !== null
		);

		const [afterApply] = await db
			.select()
			.from(payslip)
			.where(eq(payslip.id, tempPayslipId))
			.limit(1);
		ok(
			"ORIGINAL immutable — only back-pointer set, values unchanged",
			afterApply?.grossPay === "1.00" &&
				afterApply?.netPay === "1.00" &&
				afterApply?.supersededByCorrectionId === applied.id
		);

		let blocked = false;
		try {
			await applyPayslipCorrection(orgId, realUserId, {
				payslipId: tempPayslipId,
				reasonCode: "other",
			});
		} catch {
			blocked = true;
		}
		ok("double-correction is blocked", blocked);

		// cleanup correction before payslip (FK restrict on originalPayslipId)
		await db
			.delete(payslipCorrection)
			.where(eq(payslipCorrection.id, applied.id));
	} finally {
		await db
			.delete(payslipCorrection)
			.where(eq(payslipCorrection.originalPayslipId, tempPayslipId));
		await db.delete(payslip).where(eq(payslip.id, tempPayslipId));
		await db
			.delete(payrollRun)
			.where(
				and(eq(payrollRun.id, tempRunId), eq(payrollRun.organizationId, orgId))
			);
	}
}

async function main() {
	pureChecks();
	await lifecycleChecks();
}

main()
	.then(() => {
		process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
		process.exit(fail > 0 ? 1 : 0);
	})
	.catch((err) => {
		process.stderr.write(`\nverify-payslip-correction crashed: ${err}\n`);
		process.exit(1);
	});
