// One-off, owner-authorized recalc of attendance display values (#181 Slice A).
//
// After the tenant-timezone render fix deploys, existing attendance_record rows
// still hold firstClockIn/lastClockOut strings generated with the OLD server-UTC
// getters (e.g. "11:52" for an 07:52 Guyana clock-in). This re-runs the shared
// recalculateRecord over every existing record so those strings regenerate in the
// tenant timezone. It is NON-destructive: the underlying attendance_event instants
// are already true UTC and are NOT modified — only the derived record fields are
// recomputed (idempotent; re-running is safe).
//
// Safety: requires CONFIRM_RECALC=1 and refuses the v1 database (karetech_erp).
//
// Run (host, prod DB host rewritten to localhost):
//   set -a; . <(sed 's/postgres-central/localhost/g; /EMAIL_FROM/d' deploy/.env.v2); set +a
//   CONFIRM_RECALC=1 bun run scripts/ops/recalc-attendance.ts

import { recalculateRecord } from "../../packages/api/src/utils/attendance-recalc";
import { createDb } from "../../packages/db/src/index";
import { attendanceRecord } from "../../packages/db/src/schema/attendance";

function assertSafe(): void {
	const url = process.env.DATABASE_URL ?? "";
	if (url.includes("karetech_erp")) {
		throw new Error("Refusing to run against the v1 database (karetech_erp).");
	}
	if (!url) {
		throw new Error("DATABASE_URL is not set.");
	}
	if (process.env.CONFIRM_RECALC !== "1") {
		throw new Error("Set CONFIRM_RECALC=1 to confirm this recompute.");
	}
}

async function main(): Promise<void> {
	assertSafe();
	const db = createDb();
	const rows = await db
		.select({
			organizationId: attendanceRecord.organizationId,
			employeeId: attendanceRecord.employeeId,
			date: attendanceRecord.date,
		})
		.from(attendanceRecord);

	let done = 0;
	let failed = 0;
	for (const r of rows) {
		try {
			await recalculateRecord(r.employeeId, r.date, r.organizationId);
			done += 1;
		} catch (err) {
			failed += 1;
			process.stderr.write(
				`recalc failed for ${r.employeeId} ${r.date.toISOString().slice(0, 10)}: ${err}\n`
			);
		}
	}
	process.stdout.write(
		`Recalc complete: ${done} records regenerated, ${failed} failed (of ${rows.length}).\n`
	);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	process.stderr.write(`recalc-attendance failed: ${err}\n`);
	process.exit(1);
});
