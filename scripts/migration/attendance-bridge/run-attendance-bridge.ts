// biome-ignore-all lint: attendance-bridge runner (Phase 21O, scratch ONLY).
//
// Backfills v1 time-attendance into v2's EXISTING Phase 11 biometric pipeline on a
// DISPOSABLE scratch DB, then runs the real v2 processor so punches become
// attendance events/records via the same code production uses.
//
// SAFETY:
//   - v1 is opened strictly READ-ONLY (openV1ReadOnly).
//   - the v2 target is the global `db` (DATABASE_URL) — this script REFUSES to run
//     unless that db name looks like a scratch DB (and is not the prod/v1 name).
//   - inserts are idempotent (onConflictDoNothing on the punch idempotency key).
//   - it NEVER writes payroll; it stages raw punches, then the processor derives
//     attendance, exactly as the live pipeline does.
//
// Run (orgs+employees must already be loaded by the main write-ETL):
//   DATABASE_URL="postgres://…/heimdallone_v2_migration_scratch" \
//   V1_DATABASE_URL="postgres://…/karetech_erp" \
//   bun run scripts/migration/attendance-bridge/run-attendance-bridge.ts

import { and, eq, sql } from "drizzle-orm";
import { processPendingPunches } from "../../../packages/api/src/utils/biometric-processor";
import { db } from "../../../packages/db/src/index";
// Relative imports (not the @Heimdallone/db alias): a loose script under scripts/
// can't resolve the workspace alias. This points at the same files; inserts are
// auto-committed to the same scratch DB the processor reads.
import {
	attendanceEvent,
	attendanceRecord,
} from "../../../packages/db/src/schema/attendance";
import { organization } from "../../../packages/db/src/schema/auth";
import {
	attendanceDevice,
	attendanceDeviceEmployeeMap,
	attendancePunch,
} from "../../../packages/db/src/schema/biometric";
import { employeeProfile } from "../../../packages/db/src/schema/hr-core";
import { openV1ReadOnly, v1Rows } from "../v1-readonly";
import {
	mapAttendanceDevice,
	mapAttendancePunch,
	mapDeviceEmployeeMap,
	type V1AttDevice,
	type V1AttDeviceUser,
	type V1AttPunch,
} from "./transformers-attendance";

function assertScratchTarget(): string {
	const url = process.env.DATABASE_URL ?? "";
	if (!url) {
		throw new Error(
			"DATABASE_URL not set (must be the disposable scratch DB)."
		);
	}
	const name = new URL(url).pathname.replace(/^\//, "");
	// v1 is NEVER a write target.
	if (name === "karetech_erp") {
		throw new Error(`Refusing: '${name}' is the v1 database.`);
	}
	// Explicit, named production-write opt-in (Phase 21R cutover) bypasses the
	// scratch-only check — requires CONFIRM_PRODUCTION_WRITE=1 + an exact
	// PRODUCTION_WRITE_TARGET match.
	if (process.env.CONFIRM_PRODUCTION_WRITE === "1") {
		const declared = process.env.PRODUCTION_WRITE_TARGET ?? "";
		if (declared !== name) {
			throw new Error(
				`Refusing: DATABASE_URL db '${name}' does not match PRODUCTION_WRITE_TARGET '${declared}'.`
			);
		}
		process.stdout.write(`⚠️  PRODUCTION WRITE ENABLED — target: ${name}\n`);
		return name;
	}
	if (!/scratch|staging|migrat|test/i.test(name)) {
		throw new Error(
			`Refusing: DATABASE_URL db '${name}' is not a scratch DB (need scratch/staging/migrat/test). ` +
				"For a real cutover set CONFIRM_PRODUCTION_WRITE=1 + PRODUCTION_WRITE_TARGET=<db>."
		);
	}
	if (name === "Heimdallone") {
		throw new Error(`Refusing: '${name}' is the dev v2 database.`);
	}
	return name;
}

async function loadV1AttendanceForOrg(c: import("pg").Client, oid: string) {
	const devices = await v1Rows<any>(
		c,
		`SELECT id, device_id, device_type, location_name, ip_address, port, is_active
		 FROM attendance_devices WHERE tenant_id = $1`,
		[oid]
	);
	// The slot→employee link lives on employees.attendance_device_id (the device
	// user-id v1 enrolled), NOT attendance_device_users (which v1 left unlinked).
	const employeeSlots = await v1Rows<any>(
		c,
		`SELECT id AS employee_id, attendance_device_id AS slot
		 FROM employees
		 WHERE tenant_id = $1 AND deleted_at IS NULL AND attendance_device_id IS NOT NULL`,
		[oid]
	);
	const punches = await v1Rows<any>(
		c,
		`SELECT id, employee_id, punch_at, punch_type, source, device_id, device_timestamp
		 FROM attendance_punches WHERE tenant_id = $1`,
		[oid]
	);
	return { devices, employeeSlots, punches };
}

function iso(v: unknown): string {
	if (v instanceof Date) {
		return v.toISOString();
	}
	return new Date(String(v)).toISOString();
}

type OrgResult = {
	slug: string;
	devices: number;
	mappings: number;
	punchesStaged: number;
	punchesDuplicateOnRerun: number;
	punchesUnmatchedEmployee: number;
	processed: number;
	unmapped: number;
	events: number;
	records: number;
	recordsWithDayType: number;
};

async function bridgeOrg(
	c: import("pg").Client,
	org: { id: string; slug: string }
): Promise<OrgResult> {
	const oid = org.id;
	const { devices, employeeSlots, punches } = await loadV1AttendanceForOrg(
		c,
		oid
	);

	// Employees that actually exist in scratch (FK-safe; no dangling refs).
	const empRows = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(eq(employeeProfile.organizationId, oid));
	const empIds = new Set(empRows.map((e) => e.id));

	// 1. devices
	const deviceIds: string[] = [];
	for (const d of devices as V1AttDevice[]) {
		await db
			.insert(attendanceDevice)
			.values(mapAttendanceDevice(d, oid))
			.onConflictDoNothing();
		deviceIds.push(d.id);
	}

	// 2. device→employee map from employees.attendance_device_id, seeded for each
	// device in the org. Builds the employee→slot lookup so backfilled punches
	// carry the SAME deviceUserId the live agent sends (matching idempotency keys).
	const slotByEmployee = new Map<string, string>();
	let mappings = 0;
	for (const row of employeeSlots as { employee_id: string; slot: string }[]) {
		if (!empIds.has(row.employee_id)) {
			continue;
		}
		const slot = String(row.slot);
		slotByEmployee.set(row.employee_id, slot);
		for (const deviceId of deviceIds) {
			const mapRow = mapDeviceEmployeeMap(
				{
					id: `${deviceId}:${slot}`,
					deviceId,
					slotIndex: Number(slot),
					name: null,
					employeeId: row.employee_id,
				},
				oid
			);
			if (mapRow) {
				await db
					.insert(attendanceDeviceEmployeeMap)
					.values(mapRow)
					.onConflictDoNothing();
				mappings += 1;
			}
		}
	}

	// 3. punches → raw staging (idempotent). employeeId only if it exists in
	// scratch; otherwise null → the processor routes it to the unmapped queue.
	let staged = 0;
	let unmatchedEmployee = 0;
	for (const p of punches as any[]) {
		const employeeId =
			p.employee_id && empIds.has(p.employee_id) ? p.employee_id : null;
		if (!employeeId) {
			unmatchedEmployee += 1;
		}
		const src: V1AttPunch = {
			id: p.id,
			employeeId,
			punchAt: iso(p.punch_at),
			punchType: String(p.punch_type),
			source: String(p.source ?? "device"),
			deviceId: (p.device_id as string) ?? null,
			deviceTimestamp: p.device_timestamp ? iso(p.device_timestamp) : null,
		};
		const deviceUserId = employeeId
			? (slotByEmployee.get(employeeId) ?? null)
			: null;
		const inserted = await db
			.insert(attendancePunch)
			.values(mapAttendancePunch(src, oid, deviceUserId))
			.onConflictDoNothing()
			.returning({ id: attendancePunch.id });
		if (inserted.length > 0) {
			staged += 1;
		}
	}

	// 3b. idempotency proof: re-insert the SAME punches → expect zero new rows.
	let dupOnRerun = 0;
	for (const p of punches as any[]) {
		const employeeId =
			p.employee_id && empIds.has(p.employee_id) ? p.employee_id : null;
		const src: V1AttPunch = {
			id: p.id,
			employeeId,
			punchAt: iso(p.punch_at),
			punchType: String(p.punch_type),
			source: String(p.source ?? "device"),
			deviceId: (p.device_id as string) ?? null,
			deviceTimestamp: p.device_timestamp ? iso(p.device_timestamp) : null,
		};
		const deviceUserId = employeeId
			? (slotByEmployee.get(employeeId) ?? null)
			: null;
		const again = await db
			.insert(attendancePunch)
			.values(mapAttendancePunch(src, oid, deviceUserId))
			.onConflictDoNothing()
			.returning({ id: attendancePunch.id });
		dupOnRerun += again.length;
	}

	// 4. run the REAL v2 processor → events + records (+ recalc/day-type).
	const summary = await processPendingPunches(oid);

	const [{ events }] = await db
		.select({ events: sql<number>`count(*)::int` })
		.from(attendanceEvent)
		.where(eq(attendanceEvent.organizationId, oid));
	const [{ records }] = await db
		.select({ records: sql<number>`count(*)::int` })
		.from(attendanceRecord)
		.where(eq(attendanceRecord.organizationId, oid));
	const [{ withDayType }] = await db
		.select({ withDayType: sql<number>`count(*)::int` })
		.from(attendanceRecord)
		.where(
			and(
				eq(attendanceRecord.organizationId, oid),
				sql`${attendanceRecord.dayType} is not null`
			)
		);

	return {
		slug: org.slug,
		devices: devices.length,
		mappings,
		punchesStaged: staged,
		punchesDuplicateOnRerun: dupOnRerun,
		punchesUnmatchedEmployee: unmatchedEmployee,
		processed: summary.processed,
		unmapped: summary.unmapped,
		events,
		records,
		recordsWithDayType: withDayType,
	};
}

async function main() {
	const target = assertScratchTarget();
	process.stdout.write(`[attendance-bridge] scratch target: ${target}\n`);
	const c = await openV1ReadOnly();
	try {
		const orgs = await db
			.select({ id: organization.id, slug: organization.slug })
			.from(organization);
		const results: OrgResult[] = [];
		for (const org of orgs) {
			const r = await bridgeOrg(c, org);
			results.push(r);
			process.stdout.write(
				`[attendance-bridge] ${r.slug}: devices ${r.devices}, mappings ${r.mappings}, ` +
					`punches staged ${r.punchesStaged} (dup-on-rerun ${r.punchesDuplicateOnRerun}, ` +
					`unmatched-emp ${r.punchesUnmatchedEmployee}), processed ${r.processed}/unmapped ${r.unmapped}, ` +
					`events ${r.events}, records ${r.records} (dayType ${r.recordsWithDayType})\n`
			);
		}
		const idempotent = results.every((r) => r.punchesDuplicateOnRerun === 0);
		const allRecordsClassified = results.every(
			(r) => r.records === r.recordsWithDayType
		);
		process.stdout.write(
			`\n[attendance-bridge] DONE — idempotent=${idempotent}, all records day-typed=${allRecordsClassified}\n`
		);
		if (!idempotent) {
			process.exitCode = 1;
		}
	} finally {
		await c.end();
	}
}

if (import.meta.main) {
	main().catch((e) => {
		process.stderr.write(`[attendance-bridge] FAILED: ${e.message}\n`);
		process.exit(1);
	});
}
