// Seed Finance data for Atlas Shipping — Phase 16B.
//
// Idempotent: deletes existing finance_budget rows for the org then re-inserts.
//
// COORDINATION-LAYER GUARDRAIL: this seed ONLY writes finance_budget. It READS
// real department + project ids (to populate the soft scopeId ref) but NEVER
// writes to HR Core / Projects / Payroll. Cost reports need no seed — they are
// pure read-time aggregation of existing payroll/project data.
//
// Run: export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-finance.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import { organization, user } from "../packages/db/src/schema/auth";
import { financeBudget } from "../packages/db/src/schema/finance";
import { department } from "../packages/db/src/schema/hr-core";
import { project } from "../packages/db/src/schema/projects";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DEFAULT_CURRENCY = "GYD";

function ymd(d: Date): string {
	return d.toISOString().slice(0, 10);
}

async function resolveOrgId(): Promise<string> {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		process.stderr.write("Atlas org not found — run seed-dev.ts first.\n");
		process.exit(1);
	}
	return org.id;
}

async function resolveAdminUid(): Promise<string | null> {
	const rows = await db
		.select({ id: user.id, email: user.email })
		.from(user)
		.limit(100);
	const admin = rows.find((r) => r.email === "admin@atlas-shipping.com");
	return admin?.id ?? null;
}

async function deptIdByName(
	orgId: string,
	name: string
): Promise<string | null> {
	const row = (
		await db
			.select({ id: department.id })
			.from(department)
			.where(
				and(eq(department.organizationId, orgId), eq(department.name, name))
			)
			.limit(1)
	).at(0);
	return row?.id ?? null;
}

async function projectIdByName(
	orgId: string,
	name: string
): Promise<string | null> {
	const row = (
		await db
			.select({ id: project.id })
			.from(project)
			.where(and(eq(project.organizationId, orgId), eq(project.name, name)))
			.limit(1)
	).at(0);
	return row?.id ?? null;
}

async function main() {
	const orgId = await resolveOrgId();
	const createdBy = await resolveAdminUid();

	// FY window: current calendar year.
	const year = new Date().getUTCFullYear();
	const periodStart = ymd(new Date(Date.UTC(year, 0, 1)));
	const periodEnd = ymd(new Date(Date.UTC(year, 11, 31)));

	const engId = await deptIdByName(orgId, "Engineering");
	const opsId = await deptIdByName(orgId, "Operations");
	const netProjId = await projectIdByName(orgId, "Main Office Network Upgrade");

	// Reset (idempotent).
	await db.delete(financeBudget).where(eq(financeBudget.organizationId, orgId));

	const rows = [
		{
			scope: "organization" as const,
			scopeId: null,
			label: `FY${year} total labour budget`,
			budgetedAmount: "48000000.00",
		},
		{
			scope: "department" as const,
			scopeId: engId,
			label: `FY${year} Engineering labour`,
			budgetedAmount: "14000000.00",
		},
		{
			scope: "department" as const,
			scopeId: opsId,
			label: `FY${year} Operations labour`,
			budgetedAmount: "9000000.00",
		},
		{
			scope: "project" as const,
			scopeId: netProjId,
			label: "Network Upgrade labour budget",
			budgetedAmount: "2500000.00",
		},
	].filter((r) => r.scope === "organization" || r.scopeId);

	for (const r of rows) {
		await db.insert(financeBudget).values({
			id: createId(),
			organizationId: orgId,
			scope: r.scope,
			scopeId: r.scopeId,
			label: r.label,
			category: "labour",
			periodStart: new Date(periodStart),
			periodEnd: new Date(periodEnd),
			currency: DEFAULT_CURRENCY,
			budgetedAmount: r.budgetedAmount,
			createdBy,
		});
	}

	process.stdout.write(
		`✓ Seeded ${rows.length} finance budgets for Atlas Shipping (FY${year}).\n`
	);
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
