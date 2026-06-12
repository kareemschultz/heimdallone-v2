// biome-ignore-all lint: source-staging loader (Phase 21C, WRITE to scratch only).
//
// Reads v1 READ-ONLY and parks the minimum domains as source rows in the scratch
// DB's migration_source_* tables. This proves the read→stage path without
// touching v1 or any production v2. Idempotent: each table is truncated then
// reloaded. Roster + work_schedule are staged source-only (no final v2 home yet).

import type { Client } from "pg";
import { ensureScratchDb, openScratchWritable } from "./create-scratch-db";
import { openV1ReadOnly, v1Rows } from "./v1-readonly";

type StageSpec = {
	table: string;
	v1Sql: string;
	idCol: string;
	tenantCol: string | null;
};

const STAGES: StageSpec[] = [
	{
		table: "migration_source_organization",
		v1Sql: 'SELECT * FROM "organization"',
		idCol: "id",
		tenantCol: "id",
	},
	{
		table: "migration_source_employee",
		v1Sql: 'SELECT * FROM "employees"',
		idCol: "id",
		tenantCol: "tenant_id",
	},
	{
		table: "migration_source_payslip",
		v1Sql: 'SELECT * FROM "payslips"',
		idCol: "id",
		tenantCol: "tenant_id",
	},
	{
		table: "migration_source_attendance_punch",
		v1Sql: 'SELECT * FROM "attendance_punches"',
		idCol: "id",
		tenantCol: "tenant_id",
	},
	{
		table: "migration_source_roster",
		v1Sql: 'SELECT * FROM "shift_roster_entries"',
		idCol: "id",
		tenantCol: "tenant_id",
	},
	{
		table: "migration_source_work_schedule",
		v1Sql: 'SELECT * FROM "work_schedules"',
		idCol: "id",
		tenantCol: "tenant_id",
	},
];

async function stageOne(
	v1: Client,
	scratch: Client,
	spec: StageSpec
): Promise<number> {
	const rows = await v1Rows<any>(v1, spec.v1Sql);
	await scratch.query(`TRUNCATE TABLE "${spec.table}"`);
	for (const r of rows) {
		const id = r[spec.idCol];
		const tenant = spec.tenantCol ? (r[spec.tenantCol] ?? null) : null;
		await scratch.query(
			`INSERT INTO "${spec.table}" (id, tenant_id, payload) VALUES ($1, $2, $3)
			 ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, loaded_at = now()`,
			[id, tenant, JSON.stringify(r)]
		);
	}
	return rows.length;
}

export async function loadScratch(): Promise<Record<string, number>> {
	await ensureScratchDb();
	const v1 = await openV1ReadOnly();
	const scratch = await openScratchWritable();
	const counts: Record<string, number> = {};
	try {
		for (const spec of STAGES) {
			counts[spec.table] = await stageOne(v1, scratch, spec);
			console.log(`[load] ${spec.table}: ${counts[spec.table]} rows`);
		}
	} finally {
		await v1.end();
		await scratch.end();
	}
	return counts;
}

if (import.meta.main) {
	loadScratch()
		.then((c) => console.log("[load] done:", JSON.stringify(c)))
		.catch((e) => {
			console.error("[load] FAILED:", e.message);
			process.exit(1);
		});
}
