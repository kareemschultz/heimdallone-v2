// Read-only production data audit (Phase 21X). Reports per-tenant row counts for
// the tables that make a tenant "set up" (departments, payroll country profile,
// statutory, contracts, payslips, etc.). NO writes. Refuses the v1 DB.
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//        && bun run scripts/prod-data-audit.ts

import { sql } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";

if ((process.env.DATABASE_URL ?? "").includes("karetech_erp")) {
	throw new Error("Refusing to audit the v1 database.");
}

const db = createDb();

const TABLES = [
	"department",
	"position",
	"job_position",
	"work_location",
	"shift",
	"country_payroll_profile",
	"payroll_setting",
	"employee_profile",
	"employee_statutory",
	"contract",
	"payroll_run",
	"payslip",
	"leave_policy",
	"roster_entry",
	"shift_rule",
];

async function tableExists(name: string): Promise<boolean> {
	const r = await db.execute(
		sql`select to_regclass(${`public.${name}`}) is not null as ok`
	);
	// drizzle execute returns rows array-like
	const row = (r as unknown as { rows?: Array<{ ok: boolean }> }).rows ?? [];
	return row[0]?.ok ?? false;
}

async function main() {
	const orgs = await db.execute(
		sql`select id, name, slug from organization order by name`
	);
	const orgRows =
		(orgs as unknown as { rows: Array<{ id: string; name: string }> }).rows ??
		[];
	process.stdout.write(`Organizations: ${orgRows.length}\n`);

	for (const t of TABLES) {
		if (!(await tableExists(t))) {
			process.stdout.write(`  ${t}: (table missing)\n`);
			continue;
		}
		// org-scoped count where the table has organization_id
		const hasOrg = await db.execute(
			sql`select 1 from information_schema.columns where table_name=${t} and column_name='organization_id' limit 1`
		);
		const hasOrgCol =
			((hasOrg as unknown as { rows: unknown[] }).rows ?? []).length > 0;
		if (hasOrgCol) {
			const counts = await db.execute(
				sql.raw(
					`select o.name, count(x.*)::int as n from organization o left join "${t}" x on x.organization_id=o.id group by o.name order by o.name`
				)
			);
			const cr =
				(counts as unknown as { rows: Array<{ name: string; n: number }> })
					.rows ?? [];
			process.stdout.write(
				`  ${t}: ${cr.map((c) => `${c.name}=${c.n}`).join("  ")}\n`
			);
		} else {
			const total = await db.execute(
				sql.raw(`select count(*)::int as n from "${t}"`)
			);
			const n =
				(total as unknown as { rows: Array<{ n: number }> }).rows?.[0]?.n ?? 0;
			process.stdout.write(`  ${t}: (no org col) total=${n}\n`);
		}
	}
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`audit failed: ${e}\n`);
	process.exit(1);
});
