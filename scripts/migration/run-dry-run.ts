// biome-ignore-all lint: one-shot dry-run orchestrator (Phase 21B).
//
// Reads the live v1 database READ-ONLY, runs the typed mappers over real rows,
// classifies every v1 table, and writes a migration dry-run report. It NEVER
// writes to v1 or to any v2 database.
//
// Run:
//   export V1_DATABASE_URL="postgres://heimdallone:****@172.19.0.2:5432/karetech_erp"
//   # optional: export V2_STAGING_DATABASE_URL="postgres://.../heimdallone_staging"
//   bun run scripts/migration/run-dry-run.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { attendanceMappers } from "./map-attendance";
import { employeeMapper } from "./map-employees";
import { payrollMappers } from "./map-payroll";
import { rosterMappers } from "./map-rosters";
import { tenantMapper } from "./map-tenants";
import {
	type DryRunResult,
	type TenantReadiness,
	toJson,
	toMarkdown,
} from "./migration-report";
import {
	IGNORE_TABLES,
	type Mapper,
	type TableInspection,
	V1_TABLE_PLAN,
} from "./types-v1";
import {
	listV1Tables,
	openV1ReadOnly,
	redact,
	v1Count,
	v1Rows,
} from "./v1-readonly";
import { getStagingUrl, openV2StagingReadOnly } from "./v2-staging";

const OUT_DIR = "docs/migration";

const MAPPERS: Mapper[] = [
	tenantMapper,
	employeeMapper,
	...payrollMappers,
	...attendanceMappers,
	...rosterMappers,
];
const MAPPER_BY_TABLE = new Map(MAPPERS.map((m) => [m.v1Table, m]));

async function main() {
	const v1 = await openV1ReadOnly();
	const v2Staging = await openV2StagingReadOnly(); // null when not configured
	const v2StagingUrl = getStagingUrl();

	try {
		const allTables = await listV1Tables(v1);
		const tables: TableInspection[] = [];

		for (const table of allTables) {
			if (IGNORE_TABLES.has(table)) {
				continue;
			}
			const rowCount = await v1Count(v1, table);
			const mapper = MAPPER_BY_TABLE.get(table);

			if (mapper) {
				const rows = rowCount > 0 ? await v1Rows(v1, mapper.selectSql) : [];
				const detail = mapper.inspect(rows);
				tables.push({
					v1Table: table,
					v2Target: mapper.v2Target,
					classification: mapper.classification,
					reason: mapper.reason,
					rowCount,
					fields: detail.fields,
					unmappable: detail.unmappable,
					notes: detail.notes,
				});
				continue;
			}

			const plan = V1_TABLE_PLAN[table];
			tables.push({
				v1Table: table,
				v2Target: plan?.v2Target ?? null,
				classification: plan?.classification ?? "ignore_defer",
				reason:
					plan?.reason ??
					(rowCount === 0
						? "empty scaffold — no data contract"
						: "UNCLASSIFIED non-empty table — needs review"),
				rowCount,
				fields: [],
				unmappable: [],
				notes:
					rowCount > 0 && !plan
						? [
								"⚠ non-empty table with no migration plan — classify before cutover",
							]
						: [],
			});
		}

		const totals = await computeTotals(v1);
		const tenants = await computeTenantReadiness(v1, tables);
		const featureGaps = computeFeatureGaps(tables);
		const statutoryReview = computeStatutoryReview(tables);

		const result: DryRunResult = {
			generatedAt: new Date().toISOString(),
			v1Url: redact(process.env.V1_DATABASE_URL ?? ""),
			v2Staging: v2StagingUrl ? redact(v2StagingUrl) : null,
			totals,
			tables,
			tenants,
			featureGaps,
			statutoryReview,
		};

		mkdirSync(OUT_DIR, { recursive: true });
		writeFileSync(`${OUT_DIR}/dry-run-report.md`, toMarkdown(result));
		writeFileSync(`${OUT_DIR}/dry-run-report.json`, toJson(result));

		printSummary(result);
	} finally {
		await v1.end();
		if (v2Staging) {
			await v2Staging.end();
		}
	}
}

async function computeTotals(v1: any): Promise<Record<string, number>> {
	const one = async (sql: string) =>
		(await v1Rows<{ n: number }>(v1, sql))[0]?.n ?? 0;
	return {
		tenants: await one("SELECT count(*)::int n FROM organization"),
		users: await one('SELECT count(*)::int n FROM "user"'),
		employees: await one("SELECT count(*)::int n FROM employees"),
		payslips: await one("SELECT count(*)::int n FROM payslips"),
		attendance_punches: await one(
			"SELECT count(*)::int n FROM attendance_punches"
		),
		roster_entries: await one(
			"SELECT count(*)::int n FROM shift_roster_entries"
		),
		gl_journal_entries: await one(
			"SELECT count(*)::int n FROM journal_entries"
		),
		notifications: await one("SELECT count(*)::int n FROM notifications"),
		leave_requests: await one("SELECT count(*)::int n FROM leave_requests"),
	};
}

async function computeTenantReadiness(
	v1: any,
	tables: TableInspection[]
): Promise<TenantReadiness[]> {
	const orgs = await v1Rows<{ id: string; name: string }>(
		v1,
		"SELECT id, name FROM organization ORDER BY name"
	);
	const perTenant = async (table: string, orgId: string) =>
		(
			await v1Rows<{ n: number }>(
				v1,
				`SELECT count(*)::int n FROM "${table}" WHERE tenant_id = $1`,
				[orgId]
			)
		)[0]?.n ?? 0;

	const out: TenantReadiness[] = [];
	for (const org of orgs) {
		const counts = {
			employees: await perTenant("employees", org.id),
			payslips: await perTenant("payslips", org.id),
			punches: await perTenant("attendance_punches", org.id),
			roster: await perTenant("shift_roster_entries", org.id),
			journals: await perTenant("journal_entries", org.id),
			notifications: await perTenant("notifications", org.id),
			leaveRequests: await perTenant("leave_requests", org.id),
		};
		const blockers: string[] = [];
		if (counts.roster > 0) {
			blockers.push(
				`${counts.roster} per-date roster entries need the v2 roster table (21D)`
			);
		}
		if (counts.journals > 0) {
			blockers.push(
				`${counts.journals} GL journals need the v2 GL decision/build (21D)`
			);
		}
		if (counts.payslips > 0) {
			blockers.push("payroll parity gate (21C) must pass before cutover");
		}
		out.push({
			tenantId: org.id,
			name: org.name,
			counts,
			blockers,
			// "ready" = the data has a destination once the queued feature builds land.
			ready: true,
		});
	}
	return out;
}

function computeFeatureGaps(tables: TableInspection[]): string[] {
	const gaps: string[] = [];
	for (const t of tables) {
		if (t.classification === "requires_new_v2_feature" && t.rowCount > 0) {
			gaps.push(`${t.v1Table} (${t.rowCount} rows) — ${t.reason}`);
		}
	}
	// Phase 21J CLOSED the work_schedules richness gap: v1 scheduling (night
	// differential / split shift / Saturday rates / OT thresholds / grace / daily
	// cap) now maps to the effective-dated `shift_rule` table via mapShiftRule.
	// No longer a feature gap.
	return gaps;
}

function computeStatutoryReview(tables: TableInspection[]): string[] {
	const out: string[] = [];
	const emp = tables.find((t) => t.v1Table === "employees");
	if (emp) {
		for (const f of emp.fields) {
			if (f.status === "manual_review") {
				out.push(`employees.${f.v1} — ${f.note ?? "confirm v2 home"}`);
			}
		}
	}
	return out;
}

function printSummary(r: DryRunResult) {
	console.log("\n=== v1 → v2 DRY RUN COMPLETE (no writes) ===");
	console.log(`v1: ${r.v1Url}`);
	console.log(`v2 staging: ${r.v2Staging ?? "(schema-from-code mode)"}`);
	console.log("\nTotals:");
	for (const [k, v] of Object.entries(r.totals)) {
		console.log(`  ${k}: ${v}`);
	}
	const byClass: Record<string, number> = {};
	for (const t of r.tables) {
		byClass[t.classification] = (byClass[t.classification] ?? 0) + 1;
	}
	console.log("\nTables by classification:");
	for (const [k, v] of Object.entries(byClass)) {
		console.log(`  ${k}: ${v}`);
	}
	console.log(
		`\nFeature gaps (block write-migration): ${r.featureGaps.length}`
	);
	for (const g of r.featureGaps) {
		console.log(`  - ${g}`);
	}
	console.log(`\nStatutory fields to review: ${r.statutoryReview.length}`);
	console.log(`\nReport written to ${OUT_DIR}/dry-run-report.md (+ .json)`);
}

main().catch((e) => {
	console.error("DRY RUN FAILED:", e);
	process.exit(1);
});
