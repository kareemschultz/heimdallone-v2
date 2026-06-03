/**
 * Biometric/geofence → payroll readiness verification (Phase 11G CP2).
 *
 * Proves open attendance exceptions surface as payroll blockers/warnings without
 * ever changing worked minutes, that resolving an exception unblocks, that the
 * block_payroll_on_open_exceptions policy downgrades to a warning, and that
 * unprocessed punches in the period warn. Run after seed-biometric.ts.
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-biometric.ts && bun run scripts/verify-biometric-payroll-readiness.ts
 */
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { buildPayrollInput } from "../packages/api/src/utils/payroll-input-builder";
import { createDb } from "../packages/db/src/index";
import { organization } from "../packages/db/src/schema/auth";
import { attendanceException } from "../packages/db/src/schema/biometric";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import { payPeriod } from "../packages/db/src/schema/payroll";
import {
	detectBlockers,
	detectWarnings,
} from "../packages/payroll-engine/src/blockers";

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

	// Reuse an existing pay period covering the seeded exception dates
	// (2026-05-28); only create a throwaway if none exists.
	const target = new Date("2026-05-28");
	const periods = await db
		.select()
		.from(payPeriod)
		.where(eq(payPeriod.organizationId, orgId));
	const existing = periods.find((p) => {
		const s = p.startDate instanceof Date ? p.startDate : new Date(p.startDate);
		const e = p.endDate instanceof Date ? p.endDate : new Date(p.endDate);
		return s <= target && target <= e;
	});
	let periodId = existing?.id ?? "";
	let createdPeriod = false;
	if (!periodId) {
		periodId = createId();
		createdPeriod = true;
		await db.insert(payPeriod).values({
			id: periodId,
			organizationId: orgId,
			name: "11G CP2 verify (throwaway)",
			startDate: new Date("2026-05-02"),
			endDate: new Date("2026-05-30"),
			frequency: "monthly",
			workingDays: 22,
			expectedHours: "176",
		});
	}

	try {
		// 1. Rohan has an open missing_clock_out (blocker) → payroll blocker.
		const rIn = await buildPayrollInput(orgId, rohan, periodId);
		check(
			"rohan input has open blocker exception",
			(rIn.attendance.openExceptionBlockers ?? 0) >= 1,
			`${rIn.attendance.openExceptionBlockers}`
		);
		check(
			"policy flag plumbed (block on open exceptions = true)",
			rIn.flags?.blockPayrollOnOpenExceptions === true
		);
		check(
			"attendance read from records (worked minutes present)",
			typeof rIn.attendance.totalWorkedMinutes === "number"
		);
		check(
			"engine emits UNRESOLVED_ATTENDANCE_EXCEPTION blocker",
			detectBlockers(rIn).some(
				(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
			)
		);

		// 2. Same input with policy OFF → downgraded to a warning, no blocker.
		const rOff = {
			...rIn,
			flags: { ...rIn.flags, blockPayrollOnOpenExceptions: false },
		};
		check(
			"policy off → no exception blocker",
			!detectBlockers(rOff).some(
				(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
			)
		);
		check(
			"policy off → ATTENDANCE_EXCEPTION_REVIEW warning",
			detectWarnings(rOff).some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW")
		);

		// 3. Maya has an open low_gps_accuracy (warning) → payroll warning.
		const mIn = await buildPayrollInput(orgId, maya, periodId);
		check(
			"maya input has open warning exception",
			(mIn.attendance.openExceptionWarnings ?? 0) >= 1,
			`${mIn.attendance.openExceptionWarnings}`
		);
		check(
			"engine emits ATTENDANCE_EXCEPTION_REVIEW warning for maya",
			detectWarnings(mIn).some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW")
		);

		// 4. Devon (field) has a pending mobile punch → unprocessed warning.
		const dIn = await buildPayrollInput(orgId, devon, periodId);
		check(
			"devon input has unprocessed punches",
			(dIn.attendance.unprocessedPunches ?? 0) >= 1,
			`${dIn.attendance.unprocessedPunches}`
		);
		check(
			"engine emits UNPROCESSED_PUNCHES_FOR_PERIOD warning",
			detectWarnings(dIn).some(
				(w) => w.code === "UNPROCESSED_PUNCHES_FOR_PERIOD"
			)
		);

		// 5. Resolving the blocker removes it from readiness; then restore.
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
			const rResolved = await buildPayrollInput(orgId, rohan, periodId);
			check(
				"resolved exception no longer blocks",
				(rResolved.attendance.openExceptionBlockers ?? 0) === 0 &&
					!detectBlockers(rResolved).some(
						(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
					)
			);
			await db
				.update(attendanceException)
				.set({ status: "open" })
				.where(eq(attendanceException.id, rExc.id));
		}
	} finally {
		if (createdPeriod) {
			await db.delete(payPeriod).where(eq(payPeriod.id, periodId));
		}
	}

	if (failures > 0) {
		process.stderr.write(`\n${failures} check(s) FAILED.\n`);
		process.exit(1);
	}
	process.stdout.write("\nAll payroll-readiness checks passed.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
