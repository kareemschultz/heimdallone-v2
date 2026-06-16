// biome-ignore-all lint: one-off migration orchestrator (Phase 21X payslip line backfill).
// Phase 21X — backfill payslip_line_item rows for the materialized historical
// payslips so the payslip DETAIL view shows the full earnings/tax/deduction/
// employer breakdown (the list already shows correct totals).
//
// For each materialized payslip (explanation.migratedFromV1) we find its source
// row in migration_source_payslip and itemise the v1 components. Earnings get a
// balancing "Other earnings" line for any residual so they sum exactly to gross;
// deductions/tax/employer come straight from the reconciled v1 figures. A
// per-payslip guard asserts earnings==gross and (PAYE+NIS_emp+medical+other)==
// (gross-net) and employer==NIS_employer, or the whole transaction rolls back.
//
// SAFETY: writes ONLY payslip_line_item; idempotent (skips payslips that already
// have lines); refuses v1; requires the production-write opt-in.
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/backfill-payslip-lines.ts

import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../../packages/db/src/index";
import { payslip, payslipLineItem } from "../../packages/db/src/schema/payroll";
import { assertProductionTarget } from "./create-scratch-db";

const dollars = (cents: number): string => (cents / 100).toFixed(2);

function dbName(url: string): string {
	if (url.includes("karetech_erp")) {
		throw new Error(
			"Refusing: write target is the v1 database (karetech_erp)."
		);
	}
	return new URL(url).pathname.replace(/^\//, "");
}

type Line = {
	type: "earning" | "tax" | "deduction" | "employer_contribution";
	category: string;
	title: string;
	cents: number;
	isEmployerContribution?: boolean;
	isTaxable?: boolean;
	sortOrder: number;
};

function buildLines(p: Record<string, unknown>): Line[] {
	const c = (k: string) => Number(p[k] ?? 0);
	const gross = c("gross_pay_cents");
	const net = c("net_pay_cents");
	const earnings: Array<[string, string, number, boolean]> = [
		["basic", "Basic pay", c("base_pay_cents"), true],
		["overtime", "Overtime", c("overtime_pay_cents"), true],
		["saturday", "Saturday pay", c("saturday_pay_cents"), true],
		["sunday", "Sunday pay", c("sunday_pay_cents"), true],
		[
			"public_holiday",
			"Public holiday pay",
			c("public_holiday_pay_cents"),
			true,
		],
		["transport", "Transport allowance", c("transport_allowance_cents"), true],
		[
			"taxable_allowance",
			"Taxable allowances",
			c("taxable_allowances_in_kind_cents"),
			true,
		],
		[
			"non_taxable_allowance",
			"Non-taxable allowances",
			c("non_taxable_allowances_in_kind_cents"),
			false,
		],
		[
			"quarters",
			"Quarters / board & lodging",
			c("quarters_board_lodging_cents"),
			true,
		],
	];
	const lines: Line[] = [];
	let order = 0;
	let earnSum = 0;
	for (const [category, title, cents, taxable] of earnings) {
		if (cents !== 0) {
			lines.push({
				type: "earning",
				category,
				title,
				cents,
				isTaxable: taxable,
				sortOrder: order++,
			});
			earnSum += cents;
		}
	}
	const residual = gross - earnSum;
	if (residual !== 0) {
		lines.push({
			type: "earning",
			category: "other",
			title: "Other earnings",
			cents: residual,
			isTaxable: true,
			sortOrder: order++,
		});
	}

	const paye = c("paye_cents");
	if (paye !== 0) {
		lines.push({
			type: "tax",
			category: "paye",
			title: "PAYE (income tax)",
			cents: paye,
			sortOrder: order++,
		});
	}
	const deductions: Array<[string, string, number]> = [
		["nis", "NIS (employee 5.6%)", c("nis_employee_cents")],
		["medical", "Medical / life", c("medical_life_cents")],
		["other", "Other deductions", c("other_deductions_cents")],
	];
	for (const [category, title, cents] of deductions) {
		if (cents !== 0) {
			lines.push({
				type: "deduction",
				category,
				title,
				cents,
				sortOrder: order++,
			});
		}
	}
	const nisEr = c("nis_employer_cents");
	if (nisEr !== 0) {
		lines.push({
			type: "employer_contribution",
			category: "nis",
			title: "NIS (employer 8.4%)",
			cents: nisEr,
			isEmployerContribution: true,
			sortOrder: order++,
		});
	}

	// Reconciliation per payslip — abort (rollback) on any mismatch.
	const earnTotal = lines
		.filter((l) => l.type === "earning")
		.reduce((s, l) => s + l.cents, 0);
	if (earnTotal !== gross) {
		throw new Error(`earnings ${earnTotal} != gross ${gross}`);
	}
	const dedTotal = lines
		.filter((l) => l.type === "tax" || l.type === "deduction")
		.reduce((s, l) => s + l.cents, 0);
	if (dedTotal !== gross - net) {
		throw new Error(`deductions ${dedTotal} != gross-net ${gross - net}`);
	}
	return lines;
}

async function main() {
	const url = process.env.DATABASE_URL ?? "";
	assertProductionTarget(dbName(url));
	const db = createDb();

	const slips = await db
		.select({ id: payslip.id, explanation: payslip.explanation })
		.from(payslip);
	const migrated = slips.filter(
		(s) => (s.explanation as { migratedFromV1?: boolean })?.migratedFromV1
	);
	process.stdout.write(`Materialized payslips: ${migrated.length}\n`);

	let done = 0;
	let lineCount = 0;
	await db.transaction(async (tx) => {
		for (const s of migrated) {
			const existing = await tx
				.select({ id: payslipLineItem.id })
				.from(payslipLineItem)
				.where(eq(payslipLineItem.payslipId, s.id))
				.limit(1);
			if (existing[0]) {
				continue;
			}
			const v1Id = (s.explanation as { v1PayslipId?: string }).v1PayslipId;
			const src = (await tx.execute(
				sql`select payload from migration_source_payslip where payload->>'id' = ${v1Id} limit 1`
			)) as unknown as { rows: Array<{ payload: Record<string, unknown> }> };
			const payload = src.rows?.[0]?.payload;
			if (!payload) {
				throw new Error(`source payload missing for v1 payslip ${v1Id}`);
			}
			const lines = buildLines(payload);
			for (const line of lines) {
				await tx.insert(payslipLineItem).values({
					id: createId(),
					payslipId: s.id,
					type: line.type,
					category: line.category,
					title: line.title,
					amount: dollars(line.cents),
					isEmployerContribution: line.isEmployerContribution ?? false,
					isTaxable: line.isTaxable ?? false,
					sortOrder: line.sortOrder,
				});
				lineCount += 1;
			}
			done += 1;
		}
	});

	process.stdout.write(
		`Backfilled lines for ${done} payslips (${lineCount} line items).\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`backfill-payslip-lines failed: ${err}\n`);
	process.exit(1);
});
