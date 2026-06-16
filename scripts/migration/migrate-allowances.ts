// biome-ignore-all lint: one-off migration orchestrator (Phase 21X recurring allowances).
// Phase 21X — migrate v1 recurring allowance config (salary_structure_assignments
// → v2 pay_item + pay_item_assignment).
//
// v1 stored each employee's hourly rate (already migrated onto the contract) plus
// a recurring transport allowance. This preserves the transport allowance as a v2
// pay item (one org-level "Transport allowance" + a per-employee assignment with
// the amount), so the config is visible/editable and not lost.
//
// GRA: transport allowance was IN the taxable base in the reconciled history
// (chargeable ≈ gross − NIS − personal allowance), so isTaxable = true.
//
// IMPORTANT: the v2 payroll ENGINE does not yet consume pay_item assignments —
// this migrates the CONFIG only. Historical payslips already carry the allowance
// (as line items, reconciled vs GRA). Applying these to FUTURE runs is a separate
// GRA-vetted, TDD'd engine change (reconcile must stay 46/46). This script does
// NOT touch the engine or any historical payslip.
//
// SAFETY: writes ONLY pay_item / pay_item_assignment; refuses v1; prod-write-guarded;
// idempotent (one pay item per org by title; one assignment per employee).
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && export $(grep -v '^#' .env.migration | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/migrate-allowances.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../../packages/db/src/index";
import {
	payItem,
	payItemAssignment,
} from "../../packages/db/src/schema/payroll";
import { assertProductionTarget } from "./create-scratch-db";

function dbName(url: string): string {
	if (url.includes("karetech_erp")) {
		throw new Error(
			"Refusing: write target is the v1 database (karetech_erp)."
		);
	}
	return new URL(url).pathname.replace(/^\//, "");
}

async function main() {
	const v2url = process.env.DATABASE_URL ?? "";
	assertProductionTarget(dbName(v2url));
	const v1url = (process.env.V1_DATABASE_URL ?? "").replace(
		"postgres-central",
		"localhost"
	);
	if (!v1url) {
		throw new Error("V1_DATABASE_URL required.");
	}
	const db = createDb();
	const v1 = new Pool({ connectionString: v1url });

	// v1 employee id → { v2 employeeId, orgId }
	const mapRows = (await db.execute(sql`
		with se as (
			select payload->>'id' v1id, lower(payload->>'email') email,
			       lower(payload->>'first_name') fn, lower(payload->>'last_name') ln
			from migration_source_employee
		)
		select se.v1id, e.id employee_id, e.organization_id
		from se
		join employee_profile e
		  on (se.email is not null and lower(e.email)=se.email)
		  or (se.email is null and lower(e.first_name)=se.fn and lower(e.last_name)=se.ln)
	`)) as unknown as {
		rows: Array<{ v1id: string; employee_id: string; organization_id: string }>;
	};
	const empMap = new Map<string, { employeeId: string; orgId: string }>();
	for (const r of mapRows.rows) {
		empMap.set(r.v1id, { employeeId: r.employee_id, orgId: r.organization_id });
	}

	const assignments = (
		await v1.query(
			"select employee_id, transport_allowance_cents from salary_structure_assignments where status='active' and (transport_allowance_cents)::numeric > 0"
		)
	).rows;
	await v1.end();

	// org → transport pay_item id (created on demand)
	const orgPayItem = new Map<string, string>();
	let assignN = 0;
	const skipped: string[] = [];

	await db.transaction(async (tx) => {
		async function transportItem(orgId: string): Promise<string> {
			const cached = orgPayItem.get(orgId);
			if (cached) {
				return cached;
			}
			const existing = await tx
				.select({ id: payItem.id })
				.from(payItem)
				.where(
					and(
						eq(payItem.organizationId, orgId),
						eq(payItem.title, "Transport allowance")
					)
				)
				.limit(1);
			if (existing[0]) {
				orgPayItem.set(orgId, existing[0].id);
				return existing[0].id;
			}
			const id = createId();
			await tx.insert(payItem).values({
				id,
				organizationId: orgId,
				type: "allowance",
				category: "transport",
				title: "Transport allowance",
				description:
					"Migrated from v1 salary structure. Taxable (in chargeable income per GRA).",
				isFixed: false,
				isTaxable: true,
				includeAllActive: false,
				isActive: true,
			});
			orgPayItem.set(orgId, id);
			return id;
		}

		for (const a of assignments) {
			const em = empMap.get(a.employee_id as string);
			if (!em) {
				skipped.push(a.employee_id as string);
				continue;
			}
			const itemId = await transportItem(em.orgId);
			const existing = await tx
				.select({ id: payItemAssignment.id })
				.from(payItemAssignment)
				.where(
					and(
						eq(payItemAssignment.payItemId, itemId),
						eq(payItemAssignment.employeeId, em.employeeId)
					)
				)
				.limit(1);
			if (existing[0]) {
				continue;
			}
			await tx.insert(payItemAssignment).values({
				id: createId(),
				payItemId: itemId,
				employeeId: em.employeeId,
				overrideAmount: (Number(a.transport_allowance_cents) / 100).toFixed(2),
			});
			assignN += 1;
		}
	});

	process.stdout.write(
		`Allowance config migrated — pay items ${orgPayItem.size}, assignments ${assignN}.\n`
	);
	if (skipped.length > 0) {
		process.stdout.write(`Skipped (unmapped): ${skipped.length}\n`);
	}
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`migrate-allowances failed: ${err}\n`);
	process.exit(1);
});
