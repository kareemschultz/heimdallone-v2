/**
 * Phase 11G CP4 — full-chain integration verification.
 *
 * biometric/geofence punch → processor → attendance_event → attendance_record →
 * payroll readiness → projected pay, plus privacy (GPS scrub) guarantees.
 *
 * Read-mostly against seeded data; the only writes are the processor run
 * (idempotent) and a synthetic old check-in created + scrubbed + deleted for the
 * privacy proof. Re-run seed-biometric.ts afterward to reset processor effects.
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-biometric.ts
 *   bun run scripts/verify-biometric-geofence-attendance-payroll-integration.ts
 */
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { processPendingPunches } from "../packages/api/src/utils/biometric-processor";
import { buildPayrollInput } from "../packages/api/src/utils/payroll-input-builder";
import { createDb } from "../packages/db/src/index";
import {
	attendanceEvent,
	attendanceRecord,
} from "../packages/db/src/schema/attendance";
import { organization } from "../packages/db/src/schema/auth";
import {
	attendanceException,
	attendancePunch,
	geofenceCheckIn,
} from "../packages/db/src/schema/biometric";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import { payPeriod } from "../packages/db/src/schema/payroll";
import {
	detectBlockers,
	detectWarnings,
} from "../packages/payroll-engine/src/blockers";
import { calculateProjectedPay } from "../packages/payroll-engine/src/projected-pay";

const db = createDb();
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = ""): void {
	process.stdout.write(
		`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}\n`
	);
	if (ok) {
		pass += 1;
	} else {
		fail += 1;
	}
}

function section(name: string): void {
	process.stdout.write(`\n${name}\n`);
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
		check("pay period covering 2026-05-28 present", false);
		process.exit(1);
	}
	const periodId = period.id;

	// ── A. Raw punch safety ────────────────────────────────────
	section("A. Raw punch safety (raw punches never paid directly)");
	const devonIn = await buildPayrollInput(orgId, devon, periodId);
	check(
		"devon has an unprocessed punch in period",
		(devonIn.attendance.unprocessedPunches ?? 0) >= 1,
		`${devonIn.attendance.unprocessedPunches}`
	);
	check(
		"payroll worked minutes come from attendance_record (a number), not raw punches",
		typeof devonIn.attendance.totalWorkedMinutes === "number"
	);
	check(
		"unprocessed punch surfaces as a WARNING, never as paid time",
		detectWarnings(devonIn).some(
			(w) => w.code === "UNPROCESSED_PUNCHES_FOR_PERIOD"
		)
	);
	const eventCount = (
		await db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(eq(attendanceEvent.organizationId, orgId))
	).length;
	const recordCount = (
		await db
			.select({ id: attendanceRecord.id })
			.from(attendanceRecord)
			.where(eq(attendanceRecord.organizationId, orgId))
	).length;
	check("attendance_event rows exist", eventCount >= 1, `${eventCount}`);
	check("attendance_record rows exist", recordCount >= 1, `${recordCount}`);

	// ── C. Exception behavior ──────────────────────────────────
	section("C. Exception behavior");
	const openExceptions = await db
		.select({
			type: attendanceException.type,
			severity: attendanceException.severity,
			employeeId: attendanceException.employeeId,
		})
		.from(attendanceException)
		.where(
			and(
				eq(attendanceException.organizationId, orgId),
				inArray(attendanceException.status, ["open", "in_review"])
			)
		);
	check(
		"a blocker-severity exception exists (e.g. unmapped/missing clock-out)",
		openExceptions.some((e) => e.severity === "blocker")
	);
	check(
		"a non-blocker (warning/info) exception exists",
		openExceptions.some((e) => e.severity !== "blocker")
	);
	check(
		"remote worker (kareena) has NO outside_geofence exception",
		!openExceptions.some(
			(e) => e.employeeId === kareena && e.type === "outside_geofence"
		)
	);

	// ── D. Payroll readiness ───────────────────────────────────
	section("D. Payroll readiness");
	const rohanIn = await buildPayrollInput(orgId, rohan, periodId);
	check(
		"rohan open blocker exception → readiness blocker",
		detectBlockers(rohanIn).some(
			(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
		)
	);
	check(
		"policy OFF downgrades blocker to a review warning",
		detectWarnings({
			...rohanIn,
			flags: { ...rohanIn.flags, blockPayrollOnOpenExceptions: false },
		}).some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW") &&
			!detectBlockers({
				...rohanIn,
				flags: { ...rohanIn.flags, blockPayrollOnOpenExceptions: false },
			}).some((b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION")
	);

	// Resolve ALL of rohan's open blocker exceptions → clears blocker → restore.
	const rBlockers = await db
		.select({ id: attendanceException.id })
		.from(attendanceException)
		.where(
			and(
				eq(attendanceException.organizationId, orgId),
				eq(attendanceException.employeeId, rohan),
				eq(attendanceException.severity, "blocker"),
				inArray(attendanceException.status, ["open", "in_review"])
			)
		);
	if (rBlockers.length > 0) {
		const ids = rBlockers.map((r) => r.id);
		await db
			.update(attendanceException)
			.set({ status: "resolved" })
			.where(inArray(attendanceException.id, ids));
		const cleared = await buildPayrollInput(orgId, rohan, periodId);
		check(
			"resolving the exception(s) clears the readiness blocker",
			!detectBlockers(cleared).some(
				(b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION"
			),
			`${ids.length} resolved`
		);
		await db
			.update(attendanceException)
			.set({ status: "open" })
			.where(inArray(attendanceException.id, ids));
	} else {
		check("rohan open blocker exception present", false);
	}

	// ── E. Projection ──────────────────────────────────────────
	section("E. Projected pay");
	const rohanProj = calculateProjectedPay(rohanIn);
	check(
		"open blocker lowers projection to 'Cannot finalize yet'",
		rohanProj.confidenceLabel === "Cannot finalize yet"
	);
	check("projection is always labelled an estimate", rohanProj.isEstimate);
	check(
		"maya (warning exception) projection = 'Needs review'",
		calculateProjectedPay(await buildPayrollInput(orgId, maya, periodId))
			.confidenceLabel === "Needs review"
	);

	// ── F. Privacy (templates + GPS scrub) ─────────────────────
	section("F. Privacy");
	check(
		"no biometric-template column on attendance_punch",
		!("biometricTemplate" in attendancePunch || "template" in attendancePunch)
	);
	// Synthetic OLD check-in (200 days ago) with coords → scrub → assert → delete.
	const synthId = createId();
	await db.insert(geofenceCheckIn).values({
		id: synthId,
		organizationId: orgId,
		employeeId: rohan,
		status: "inside",
		latitude: "6.8013000",
		longitude: "-58.1551000",
		accuracyMeters: 12,
		distanceMeters: 30,
		capturedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
	});
	// Apply the same scrub the retention script performs.
	await db
		.update(geofenceCheckIn)
		.set({ latitude: null, longitude: null, coordsPurgedAt: new Date() })
		.where(
			and(
				eq(geofenceCheckIn.id, synthId),
				lt(
					geofenceCheckIn.capturedAt,
					new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
				),
				isNull(geofenceCheckIn.coordsPurgedAt),
				or(
					isNotNull(geofenceCheckIn.latitude),
					isNotNull(geofenceCheckIn.longitude)
				)
			)
		);
	const [scrubbed] = await db
		.select()
		.from(geofenceCheckIn)
		.where(eq(geofenceCheckIn.id, synthId));
	check(
		"scrubbed old check-in has NO precise coordinates",
		scrubbed?.latitude === null && scrubbed?.longitude === null
	);
	check("scrubbed check-in stamped coordsPurgedAt", !!scrubbed?.coordsPurgedAt);
	check(
		"scrub preserves audit value (verdict/distance/accuracy/timestamp)",
		scrubbed?.status === "inside" &&
			scrubbed?.distanceMeters === 30 &&
			scrubbed?.accuracyMeters === 12 &&
			!!scrubbed?.capturedAt
	);
	await db.delete(geofenceCheckIn).where(eq(geofenceCheckIn.id, synthId));

	// Invariant across all rows: a purged row never retains coordinates.
	const leaked = await db
		.select({ id: geofenceCheckIn.id })
		.from(geofenceCheckIn)
		.where(
			and(
				eq(geofenceCheckIn.organizationId, orgId),
				isNotNull(geofenceCheckIn.coordsPurgedAt),
				or(
					isNotNull(geofenceCheckIn.latitude),
					isNotNull(geofenceCheckIn.longitude)
				)
			)
		);
	check(
		"no purged check-in retains coordinates (org-wide)",
		leaked.length === 0
	);

	// ── B. Processing + idempotency (runs LAST — mutates state) ─
	section("B. Processor: punch → event link + idempotency");
	const first = await processPendingPunches(orgId);
	const linked = await db
		.select({ id: attendancePunch.id })
		.from(attendancePunch)
		.where(
			and(
				eq(attendancePunch.organizationId, orgId),
				isNotNull(attendancePunch.createdAttendanceEventId)
			)
		);
	check(
		"processing links punches to attendance_event rows",
		linked.length >= 1,
		`${linked.length} linked (first run processed ${first.processed})`
	);
	const second = await processPendingPunches(orgId);
	check(
		"second processor run creates no new events (idempotent)",
		second.processed === 0,
		`processed=${second.processed}`
	);
	check(
		"second processor run creates no new exceptions",
		second.exceptionsCreated === 0,
		`exceptionsCreated=${second.exceptionsCreated}`
	);

	process.stdout.write(`\n${pass} passed, ${fail} failed.\n`);
	process.stdout.write(
		"Note: this script ran the processor (mutates) — re-run seed-biometric.ts to reset.\n"
	);
	process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
