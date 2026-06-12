// biome-ignore-all lint: one-shot attendance reconciliation audit (Phase 21C).
//
// Attendance is a coverage/mapping audit (not a recompute): it confirms punches
// carry the fields v2 needs (timestamp / logical shift date / source / device /
// GPS) and quantifies the roster/work-schedule gap that blocks full payroll
// reconstruction. No v2 recompute here — earnings reconstruction is 21D work.

import type { Client } from "pg";
import { v1Rows } from "./v1-readonly";

export type AttendanceAudit = {
	totalPunches: number;
	byTenant: { tenantId: string; punches: number }[];
	fieldCoverage: {
		field: string;
		present: number;
		total: number;
		note?: string;
	}[];
	rosterGap: {
		rosterEntries: number;
		workSchedules: number;
		blocksPayrollReconstruction: boolean;
		note: string;
	};
	unmappedFields: string[];
};

export async function reconcileAttendance(
	v1: Client
): Promise<AttendanceAudit> {
	const one = async (sql: string, params: any[] = []) =>
		(await v1Rows<{ n: number }>(v1, sql, params))[0]?.n ?? 0;

	const totalPunches = await one(
		"SELECT count(*)::int n FROM attendance_punches"
	);

	const byTenantRows = await v1Rows<{ tenant_id: string; n: number }>(
		v1,
		"SELECT tenant_id, count(*)::int n FROM attendance_punches GROUP BY tenant_id"
	);
	const byTenant = byTenantRows.map((r) => ({
		tenantId: r.tenant_id,
		punches: r.n,
	}));

	// Field presence — does each punch carry what v2 needs?
	const fields: { field: string; col: string; note?: string }[] = [
		{ field: "employee", col: "employee_id" },
		{ field: "timestamp", col: "punch_at" },
		{ field: "punch_type", col: "punch_type" },
		{ field: "source", col: "source" },
		{ field: "device", col: "device_id", note: "device binding" },
		{
			field: "logical_shift_date",
			col: "logical_shift_date",
			note: "v1 derives this; confirm v2 derivation",
		},
		{ field: "device_timestamp", col: "device_timestamp" },
		{
			field: "gps_latitude",
			col: "latitude",
			note: "geo — confirm v2 punch geo home",
		},
	];
	const fieldCoverage: AttendanceAudit["fieldCoverage"] = [];
	for (const f of fields) {
		const present = await one(
			`SELECT count(${f.col})::int n FROM attendance_punches`
		);
		fieldCoverage.push({
			field: f.field,
			present,
			total: totalPunches,
			note: f.note,
		});
	}

	const rosterEntries = await one(
		"SELECT count(*)::int n FROM shift_roster_entries"
	);
	const workSchedules = await one("SELECT count(*)::int n FROM work_schedules");

	return {
		totalPunches,
		byTenant,
		fieldCoverage,
		rosterGap: {
			rosterEntries,
			workSchedules,
			blocksPayrollReconstruction: rosterEntries > 0,
			note:
				"Per-date roster + rich work-schedule rules (night diff / split shift / Saturday / OT thresholds) " +
				"are required to reconstruct earnings (gross/overtime/Saturday/Sunday pay) from punches. " +
				"v2 has no home for these yet — blocks EARNINGS reconstruction until 21D. The STATUTORY layer " +
				"(NIS/PAYE/allowances/net) reconciles independently because v1 stored the gross.",
		},
		unmappedFields: [
			"break_minutes_deducted (confirm v2 break model)",
			"accuracy_meters / is_gps_mocked / verified_work_location_id (geo)",
		],
	};
}
