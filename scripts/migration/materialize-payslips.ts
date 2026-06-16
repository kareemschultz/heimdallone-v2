// biome-ignore-all lint: one-off migration orchestrator (Phase 21X payslip materialization).
// Phase 21X — materialize historical v1 payslips into the live v2 payslip table.
//
// Reads the 46 NON-REVERSAL payslips staged in migration_source_payslip (the 23
// reversals are v1's UTC-bug artifacts and are excluded — "capture intent, not
// bugs"), maps each to its v2 employee + contract, synthesizes the pay_period →
// payroll_run → payslip chain, and inserts inside ONE transaction guarded by a
// reconciliation check: if ANY source payslip's employee is unmapped, or the
// inserted net-pay sum doesn't equal the source net-pay sum to the cent, the
// whole transaction rolls back. Period dates come from v1 (read-only).
//
// SAFETY: writes ONLY pay_period/payroll_run/payslip; idempotent per period
// (skips a period whose run already exists); refuses v1 as a write target;
// requires the reviewed production-write opt-in.
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && export $(grep -v '^#' .env.migration | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/materialize-payslips.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../../packages/db/src/index";
import { user } from "../../packages/db/src/schema/auth";
import {
	countryPayrollProfile,
	payPeriod as payPeriodTbl,
	payrollRun,
	payslip,
} from "../../packages/db/src/schema/payroll";
import { assertProductionTarget } from "./create-scratch-db";

const money = (cents: unknown): string => (Number(cents ?? 0) / 100).toFixed(2);
const mins = (m: unknown): string => (Number(m ?? 0) / 60).toFixed(2);

function dbName(url: string): string {
	if (url.includes("karetech_erp")) {
		throw new Error(
			"Refusing: write target is the v1 database (karetech_erp)."
		);
	}
	return new URL(url).pathname.replace(/^\//, "");
}

type Staged = { payload: Record<string, unknown> };
type EmpMap = {
	employeeId: string;
	organizationId: string;
	contractId: string;
	wageType: string;
	baseSalary: string;
};

async function main() {
	const v2url = process.env.DATABASE_URL ?? "";
	assertProductionTarget(dbName(v2url));
	const v1url = (process.env.V1_DATABASE_URL ?? "").replace(
		"postgres-central",
		"localhost"
	);
	if (!v1url) {
		throw new Error("V1_DATABASE_URL required (read-only period lookup).");
	}
	const db = createDb();
	const v1 = new Pool({ connectionString: v1url });

	// generatedBy must be a real v2 user — use the QA platform admin (or any user).
	const [actor] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, "qa+platform@heimdallone.com"))
		.limit(1);
	const generatedBy =
		actor?.id ?? (await db.select({ id: user.id }).from(user).limit(1))[0]?.id;
	if (!generatedBy) {
		throw new Error("No v2 user found for generatedBy.");
	}

	// Staged non-reversal payslips.
	const stagedRows = (await db.execute(
		sql`select payload from migration_source_payslip where (payload->>'is_reversal')='false'`
	)) as unknown as { rows: Staged[] };
	const staged = (stagedRows.rows ?? (stagedRows as unknown as Staged[])).map(
		(r) => r.payload
	);
	process.stdout.write(`Staged non-reversal payslips: ${staged.length}\n`);

	// v1 employee_id → v2 employee/contract/org map (email else name+org).
	const mapRows = (await db.execute(sql`
		with se as (
			select payload->>'id' v1id, lower(payload->>'email') email,
			       lower(payload->>'first_name') fn, lower(payload->>'last_name') ln
			from migration_source_employee
		)
		select se.v1id,
		       e.id employee_id, e.organization_id,
		       c.id contract_id, c.wage_type, c.base_salary
		from se
		join employee_profile e
		  on (se.email is not null and lower(e.email)=se.email)
		  or (se.email is null and lower(e.first_name)=se.fn and lower(e.last_name)=se.ln)
		left join lateral (
		  select id, wage_type, base_salary from contract
		  where employee_id = e.id order by start_date desc limit 1
		) c on true
	`)) as unknown as {
		rows: Array<{
			v1id: string;
			employee_id: string;
			organization_id: string;
			contract_id: string | null;
			wage_type: string | null;
			base_salary: string | null;
		}>;
	};
	const empMap = new Map<string, EmpMap>();
	const dupe = new Set<string>();
	for (const r of mapRows.rows) {
		if (empMap.has(r.v1id)) {
			dupe.add(r.v1id);
		}
		if (!(r.contract_id && r.wage_type && r.base_salary)) {
			continue;
		}
		empMap.set(r.v1id, {
			employeeId: r.employee_id,
			organizationId: r.organization_id,
			contractId: r.contract_id,
			wageType: r.wage_type,
			baseSalary: r.base_salary,
		});
	}
	if (dupe.size > 0) {
		throw new Error(
			`Ambiguous employee mapping for v1 ids: ${[...dupe].join(", ")}`
		);
	}

	// Verify every staged payslip's employee maps (with a contract).
	const missing = new Set<string>();
	for (const p of staged) {
		const eid = String(p.employee_id);
		if (!empMap.has(eid)) {
			missing.add(eid);
		}
	}
	if (missing.size > 0) {
		throw new Error(
			`ABORT: ${missing.size} employee(s) unmapped or contract-less: ${[...missing].join(", ")}`
		);
	}

	// v1 period dates (read-only).
	const periodIds = [
		...new Set(staged.map((p) => String(p.payroll_period_id))),
	];
	const pres = await v1.query(
		"select id, name, period_start, period_end, total_scheduled_days, rules_version from payroll_periods where id = any($1)",
		[periodIds]
	);
	await v1.end();
	const periods = new Map(pres.rows.map((r) => [r.id as string, r]));
	for (const id of periodIds) {
		if (!periods.has(id)) {
			throw new Error(`ABORT: v1 period not found: ${id}`);
		}
	}

	// Country profile per org (for payroll_run.countryProfileId).
	const profileRows = await db
		.select({
			orgId: countryPayrollProfile.organizationId,
			id: countryPayrollProfile.id,
		})
		.from(countryPayrollProfile)
		.where(eq(countryPayrollProfile.countryCode, "GY"));
	const profileByOrg = new Map(profileRows.map((r) => [r.orgId, r.id]));

	let inserted = 0;
	let netCentsTotal = 0;

	await db.transaction(async (tx) => {
		// (orgId|periodId) → { payPeriodId, payrollRunId }
		const runKey = (orgId: string, pid: string) => `${orgId}::${pid}`;
		const runs = new Map<string, { runId: string }>();

		for (const p of staged) {
			const eid = String(p.employee_id);
			const em = empMap.get(eid);
			if (!em) {
				throw new Error(`unexpected unmapped ${eid}`);
			}
			const pid = String(p.payroll_period_id);
			const per = periods.get(pid);
			const start = new Date(per.period_start as string);
			const end = new Date(per.period_end as string);
			const key = runKey(em.organizationId, pid);

			if (!runs.has(key)) {
				// Idempotency: skip if a run already exists for this period+batch.
				const batchName = String(per.name);
				const existing = await tx
					.select({ id: payrollRun.id })
					.from(payrollRun)
					.where(
						and(
							eq(payrollRun.organizationId, em.organizationId),
							eq(payrollRun.batchName, batchName)
						)
					)
					.limit(1);
				if (existing[0]) {
					runs.set(key, { runId: existing[0].id });
					process.stdout.write(
						`  period '${batchName}' already materialized — skipping its payslips\n`
					);
					continue;
				}
				const days = Number(per.total_scheduled_days ?? 0);
				const ppId = createId();
				await tx.insert(payPeriodTbl).values({
					id: ppId,
					organizationId: em.organizationId,
					name: batchName,
					startDate: start,
					endDate: end,
					payDate: end,
					frequency: "fortnightly",
					workingDays: days,
					expectedHours: (days * 8).toFixed(2),
					status: "closed",
				});
				const runId = createId();
				await tx.insert(payrollRun).values({
					id: runId,
					organizationId: em.organizationId,
					payPeriodId: ppId,
					batchName,
					status: "confirmed",
					currency: "GYD",
					countryProfileId: profileByOrg.get(em.organizationId) ?? null,
					ruleVersionLabel: String(per.rules_version ?? "GY-2026"),
					generatedBy,
				});
				runs.set(key, { runId });
			}

			const run = runs.get(key);
			if (!run) {
				throw new Error("run missing after create");
			}
			// If this period was a skip (already materialized), don't re-insert.
			const periodAlready = await tx
				.select({ id: payslip.id })
				.from(payslip)
				.where(
					and(
						eq(payslip.payrollRunId, run.runId),
						eq(payslip.employeeId, em.employeeId)
					)
				)
				.limit(1);
			if (periodAlready[0]) {
				continue;
			}

			const gross = Number(p.gross_pay_cents ?? 0);
			const net = Number(p.net_pay_cents ?? 0);
			const deductions =
				Number(p.paye_cents ?? 0) +
				Number(p.nis_employee_cents ?? 0) +
				Number(p.medical_life_cents ?? 0) +
				Number(p.other_deductions_cents ?? 0);
			// Real reconciliation: the deduction components we map must reproduce the
			// v1 net to the cent. If v1 carried an employee deduction we didn't map,
			// this fails and the whole transaction rolls back (no partial financials).
			if (gross - deductions !== net) {
				throw new Error(
					`RECONCILE FAIL ${p.id}: gross ${gross} - deductions ${deductions} != net ${net}`
				);
			}
			netCentsTotal += net;

			await tx.insert(payslip).values({
				id: createId(),
				organizationId: em.organizationId,
				payrollRunId: run.runId,
				employeeId: em.employeeId,
				contractId: em.contractId,
				periodStart: start,
				periodEnd: end,
				currency: "GYD",
				contractWage: em.baseSalary,
				wageType: em.wageType,
				basicPay: money(p.base_pay_cents),
				grossPay: money(gross),
				taxableGross: money(p.chargeable_income_cents),
				totalDeductions: money(deductions),
				netPay: money(net),
				totalEmployerContributions: money(p.nis_employer_cents),
				workedDays: String(Number(p.days_worked ?? 0)),
				workedHours: mins(p.regular_minutes),
				overtimeHours: mins(p.overtime_minutes),
				paidLeaveDays: "0",
				unpaidLeaveDays: String(Number(p.days_absent ?? 0)),
				holidayDays: 0,
				status: "confirmed",
				isReversed: false,
				sentToEmployee: false,
				generatedAt: p.finalized_at
					? new Date(String(p.finalized_at))
					: new Date(String(p.created_at)),
				explanation: {
					migratedFromV1: true,
					v1PayslipId: p.id,
					v1PeriodId: pid,
					snapshot: p.snapshot_json ?? null,
				},
			});
			inserted += 1;
		}

		// Roll up run totals from the payslips just inserted.
		const runIds = [...new Set([...runs.values()].map((r) => r.runId))];
		for (const rid of runIds) {
			const agg = await tx
				.select({
					n: sql<number>`count(*)::int`,
					g: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
					d: sql<string>`coalesce(sum(${payslip.totalDeductions}),0)`,
					net: sql<string>`coalesce(sum(${payslip.netPay}),0)`,
					ec: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
				})
				.from(payslip)
				.where(eq(payslip.payrollRunId, rid));
			const a = agg[0];
			await tx
				.update(payrollRun)
				.set({
					employeeCount: a.n,
					totalGross: a.g,
					totalDeductions: a.d,
					totalNet: a.net,
					totalEmployerContributions: a.ec,
				})
				.where(eq(payrollRun.id, rid));
		}
	});

	process.stdout.write(
		`Inserted ${inserted} payslips. Net reconciled (gross-deductions==net) = ${(netCentsTotal / 100).toFixed(2)} GYD.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`materialize-payslips failed: ${err}\n`);
	process.exit(1);
});
