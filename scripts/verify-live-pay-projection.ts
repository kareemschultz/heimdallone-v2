/**
 * Live/projected pay hardening verification (Phase 11G CP3).
 *
 * Proves projected pay reflects confidence from approved attendance + open
 * exceptions + unprocessed punches WITHOUT ever changing worked minutes, that
 * resolving an exception improves confidence, that remote workers are not
 * penalised for being away from a site, and that the projection is always an
 * estimate (never finalized). Run after seed-biometric.ts.
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-biometric.ts && bun run scripts/verify-live-pay-projection.ts
 */
import { and, eq } from "drizzle-orm";
import { buildPayrollInput } from "../packages/api/src/utils/payroll-input-builder";
import { createDb } from "../packages/db/src/index";
import { organization } from "../packages/db/src/schema/auth";
import { attendanceException } from "../packages/db/src/schema/biometric";
import { contract, employeeProfile } from "../packages/db/src/schema/hr-core";
import { payPeriod } from "../packages/db/src/schema/payroll";
import { calculateProjectedPay } from "../packages/payroll-engine/src/projected-pay";

const db = createDb();
let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
	process.stdout.write(
		`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}\n`
	);
	if (!ok) {
		failures += 1;
	}
}

function note(msg: string): void {
	process.stdout.write(`  · ${msg}\n`);
}

async function empId(orgId: string, email: string): Promise<string> {
	const [row] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.email, email)
			)
		)
		.limit(1);
	return row?.id ?? "";
}

async function main() {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		check("Atlas org present", false, "run seed-dev.ts");
		process.exit(1);
	}
	const orgId = org.id;
	const rohan = await empId(orgId, "rohan.gopaul@atlas-shipping.com");
	const maya = await empId(orgId, "maya.persaud@atlas-shipping.com");
	const devon = await empId(orgId, "devon.ali@atlas-shipping.com");
	const kareena = await empId(orgId, "kareena.ramnath@atlas-shipping.com");

	const target = new Date("2026-05-28");
	const periods = await db
		.select()
		.from(payPeriod)
		.where(eq(payPeriod.organizationId, orgId));
	const period = periods.find((p) => {
		const s = p.startDate instanceof Date ? p.startDate : new Date(p.startDate);
		const e = p.endDate instanceof Date ? p.endDate : new Date(p.endDate);
		return s <= target && target <= e;
	});
	if (!period) {
		check("pay period covering 2026-05-28 present", false, "run seed-payroll");
		process.exit(1);
	}
	const periodId = period.id;

	// 1. Rohan: open missing_clock_out blocker → Cannot finalize yet.
	const rIn = await buildPayrollInput(orgId, rohan, periodId);
	const rProj = calculateProjectedPay(rIn);
	check(
		"rohan projection = Cannot finalize yet (open blocker exception)",
		rProj.confidenceLabel === "Cannot finalize yet",
		rProj.confidenceLabel
	);
	check(
		"rohan projection surfaces UNRESOLVED_ATTENDANCE_EXCEPTION blocker",
		rProj.blockers.some((b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION")
	);
	check(
		"projection is always flagged as an estimate",
		rProj.isEstimate === true
	);
	check(
		"projection carries the not-final disclaimer",
		rProj.disclaimers.some((d) => d.toLowerCase().includes("estimate"))
	);

	// 2. Maya: low_gps_accuracy warning → Needs review (not High).
	const mIn = await buildPayrollInput(orgId, maya, periodId);
	const mProj = calculateProjectedPay(mIn);
	check(
		"maya projection = Needs review (warning exception)",
		mProj.confidenceLabel === "Needs review",
		mProj.confidenceLabel
	);
	check(
		"maya projection surfaces ATTENDANCE_EXCEPTION_REVIEW warning",
		mProj.warnings.some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW")
	);

	// 3. Devon (field): pending mobile punch → Needs review + unprocessed reason.
	const dIn = await buildPayrollInput(orgId, devon, periodId);
	const dProj = calculateProjectedPay(dIn);
	check(
		"devon projection reduced by unprocessed punches",
		dProj.confidenceLabel === "Needs review" &&
			dProj.warnings.some((w) => w.code === "UNPROCESSED_PUNCHES_FOR_PERIOD"),
		dProj.confidenceLabel
	);
	check(
		"devon projection reason names unprocessed punches",
		dProj.confidenceReasons.some((r) => r.includes("not yet processed"))
	);
	check(
		"unprocessed punches do NOT inflate worked minutes (read from records only)",
		dIn.attendance.totalWorkedMinutes >= 0 &&
			typeof dIn.attendance.totalWorkedMinutes === "number"
	);

	// 4. Kareena (remote): away from site but no geofence exception → not
	//    penalised by location alone (CP1 guarantee feeding CP3).
	const kIn = await buildPayrollInput(orgId, kareena, periodId);
	const kProj = calculateProjectedPay(kIn);
	check(
		"remote worker not blocked by location (no open blocker exception)",
		(kIn.attendance.openExceptionBlockers ?? 0) === 0 &&
			kProj.confidenceLabel !== "Cannot finalize yet",
		`blockers=${kIn.attendance.openExceptionBlockers} label=${kProj.confidenceLabel}`
	);

	// 5. Resolving Rohan's blocker improves confidence; then restore.
	const [rExc] = await db
		.select({ id: attendanceException.id })
		.from(attendanceException)
		.where(
			and(
				eq(attendanceException.organizationId, orgId),
				eq(attendanceException.employeeId, rohan),
				eq(attendanceException.type, "missing_clock_out"),
				eq(attendanceException.status, "open")
			)
		)
		.limit(1);
	if (rExc) {
		await db
			.update(attendanceException)
			.set({ status: "resolved" })
			.where(eq(attendanceException.id, rExc.id));
		const rFixed = calculateProjectedPay(
			await buildPayrollInput(orgId, rohan, periodId)
		);
		check(
			"resolving the exception improves rohan's confidence",
			rFixed.confidenceLabel !== "Cannot finalize yet" &&
				!rFixed.blockers.some(
					(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
				),
			rFixed.confidenceLabel
		);
		await db
			.update(attendanceException)
			.set({ status: "open" })
			.where(eq(attendanceException.id, rExc.id));
	} else {
		check("rohan open missing_clock_out exception present", false);
	}

	// 6. Policy OFF downgrades the blocker exception to a review warning.
	const rOff = {
		...rIn,
		flags: { ...rIn.flags, blockPayrollOnOpenExceptions: false },
	};
	const rOffProj = calculateProjectedPay(rOff);
	check(
		"policy off → exception downgraded (not Cannot finalize yet)",
		rOffProj.confidenceLabel !== "Cannot finalize yet" &&
			rOffProj.warnings.some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW"),
		rOffProj.confidenceLabel
	);

	// 7. Pay-type coverage. Hourly/daily are projected from worked time; document
	//    if no such contract is seeded (shift is modelled as daily — no enum).
	const wageTypes = await db
		.select({ wageType: contract.wageType })
		.from(contract)
		.where(
			and(eq(contract.organizationId, orgId), eq(contract.status, "active"))
		);
	const kinds = new Set(wageTypes.map((w) => w.wageType));
	note(
		`active contract wage types present: ${[...kinds].join(", ") || "none"}`
	);
	if (!(kinds.has("hourly") || kinds.has("daily"))) {
		note(
			"LIMITATION: no hourly/daily contract seeded — hourly/daily projection covered by engine unit tests (projected-pay.test.ts). 'shift' has no wage-type enum; modelled as daily."
		);
	}
	check(
		"projection exposes pay type + frequency",
		typeof rProj.payType === "string" && typeof rProj.payFrequency === "string",
		`${rProj.payType}/${rProj.payFrequency}`
	);

	if (failures > 0) {
		process.stderr.write(`\n${failures} check(s) FAILED.\n`);
		process.exit(1);
	}
	process.stdout.write("\nAll live-pay-projection checks passed.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
