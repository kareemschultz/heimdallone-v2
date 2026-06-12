// biome-ignore-all lint: one-shot reconciliation orchestrator (Phase 21C).
//
// Reconciles v1 payslips against v2's statutory rules (READ-ONLY on v1), audits
// attendance + statutory fields, optionally stages source data into a guarded
// scratch DB, and writes the reconciliation report.
//
// Run (reconciliation only — no DB writes):
//   export V1_DATABASE_URL="postgres://heimdallone:****@172.19.0.2:5432/karetech_erp"
//   bun run migration:reconcile
//
// Run (also stage into a disposable scratch DB):
//   export V2_STAGING_DATABASE_URL="postgres://.../heimdallone_v2_migration_scratch"
//   export CONFIRM_SCRATCH_WRITE=1
//   bun run migration:reconcile

import { mkdirSync, writeFileSync } from "node:fs";
import { dbNameOf } from "./create-scratch-db";
import { loadScratch } from "./load-scratch-v2";
import { reconcileAttendance } from "./reconcile-attendance";
import {
	type PayslipReconResult,
	reconcilePayslips,
} from "./reconcile-payslips";
import {
	emptyCounts,
	type ReconciliationResult,
	type StatutoryFieldStatus,
	type TenantReconSummary,
	toJson,
	toMarkdown,
} from "./reconciliation-report";
import { openV1ReadOnly, redact, v1Rows } from "./v1-readonly";

const OUT_DIR = "docs/migration";

const STATUTORY_FIELDS: {
	field: string;
	col: string;
	status: "mapped" | "manual_review";
	note?: string;
}[] = [
	{
		field: "tin_number",
		col: "tin_number",
		status: "manual_review",
		note: "PAYE filing — confirm v2 column",
	},
	{
		field: "nis_number",
		col: "nis_number",
		status: "manual_review",
		note: "NIS — confirm v2 column",
	},
	{
		field: "qualifying_children",
		col: "qualifying_children",
		status: "manual_review",
		note: "child allowance — drives PAYE",
	},
	{
		field: "has_second_job",
		col: "has_second_job",
		status: "manual_review",
		note: "second-job tax treatment",
	},
	{
		field: "second_job_pay_cents",
		col: "second_job_pay_cents",
		status: "manual_review",
		note: "second-job income",
	},
	{
		field: "medical_payroll_deduct_cents",
		col: "medical_payroll_deduct_cents",
		status: "manual_review",
		note: "medical deduction",
	},
	{
		field: "other_deductions_cents",
		col: "other_deductions_cents",
		status: "manual_review",
		note: "misc deduction",
	},
	{
		field: "kiosk_pin_hash",
		col: "kiosk_pin_hash",
		status: "manual_review",
		note: "kiosk/biometric PIN",
	},
	{
		field: "company_id",
		col: "company_id",
		status: "manual_review",
		note: "no v2 company sub-entity",
	},
];

async function auditStatutory(v1: any): Promise<StatutoryFieldStatus[]> {
	const total =
		(
			await v1Rows<{ n: number }>(v1, "SELECT count(*)::int n FROM employees")
		)[0]?.n ?? 0;
	const out: StatutoryFieldStatus[] = [];
	for (const f of STATUTORY_FIELDS) {
		const present =
			(
				await v1Rows<{ n: number }>(
					v1,
					`SELECT count(${f.col})::int n FROM employees`
				)
			)[0]?.n ?? 0;
		out.push({
			field: f.field,
			present,
			total,
			status: f.status,
			note: f.note,
		});
	}
	return out;
}

function summarizeTenants(
	payslips: PayslipReconResult[],
	names: Map<string, string>
): TenantReconSummary[] {
	const byTenant = new Map<string, TenantReconSummary>();
	for (const p of payslips) {
		let t = byTenant.get(p.tenantId);
		if (!t) {
			t = {
				tenantId: p.tenantId,
				name: names.get(p.tenantId) ?? p.tenantId,
				payslips: 0,
				exact: 0,
				rounding: 0,
				review: 0,
				blocked: 0,
				v1Bug: 0,
			};
			byTenant.set(p.tenantId, t);
		}
		t.payslips++;
		if (p.overall === "exact") t.exact++;
		else if (p.overall === "rounding") t.rounding++;
		else if (p.overall === "review") t.review++;
		else if (p.overall === "blocked") t.blocked++;
		else if (p.overall === "v1_bug") t.v1Bug++;
	}
	return [...byTenant.values()].sort((a, b) => b.payslips - a.payslips);
}

function summarizeComponents(payslips: PayslipReconResult[]) {
	const byComp = new Map<string, ReturnType<typeof emptyCounts>>();
	for (const p of payslips) {
		for (const c of p.checks) {
			if (!byComp.has(c.component)) {
				byComp.set(c.component, emptyCounts());
			}
			byComp.get(c.component)![c.classification]++;
		}
	}
	return [...byComp.entries()].map(([component, counts]) => ({
		component,
		counts,
	}));
}

async function main() {
	const v1 = await openV1ReadOnly();
	let scratchCounts: Record<string, number> | null = null;
	let scratchDb: string | null = null;

	try {
		const orgRows = await v1Rows<{ id: string; name: string }>(
			v1,
			"SELECT id, name FROM organization"
		);
		const names = new Map(orgRows.map((o) => [o.id, o.name]));

		const payslips = await reconcilePayslips(v1);
		const attendance = await reconcileAttendance(v1);
		const statutory = await auditStatutory(v1);
		const tenants = summarizeTenants(payslips, names);
		const componentSummary = summarizeComponents(payslips);

		// readiness: statutory layer
		const anyReview = payslips.some((p) => p.overall === "review");
		const anyBlocked = payslips.some((p) => p.overall === "blocked");
		const readiness = anyBlocked
			? "blocked"
			: anyReview
				? "ready_with_manual_review"
				: "ready";

		const blockers: string[] = [];
		blockers.push(
			"EARNINGS reconstruction (gross/overtime/Saturday/Sunday pay) blocked on the 21D per-date roster + scheduling-rules build (v1 stored gross, so statutory layer reconciles independently)."
		);
		if (attendance.rosterGap.rosterEntries > 0) {
			blockers.push(
				`${attendance.rosterGap.rosterEntries} per-date roster entries have no v2 home (21D).`
			);
		}
		blockers.push(
			"GL + notifications feature builds required before those rows migrate (21D)."
		);
		blockers.push(
			`${statutory.filter((s) => s.status === "manual_review").length} employee statutory fields need a confirmed v2 column (payroll-correctness).`
		);

		const next21D = [
			"Per-date roster table (+ rich work-schedule rules: night differential, split shift, Saturday rates, OT thresholds) — unblocks earnings reconstruction.",
			"Minimal v2 payroll-GL (accounts + journal entries/lines) — port chart + clean balances, not v1 bug-reversal churn.",
			"In-app notification subsystem.",
			"Confirm v2 columns for all employee statutory fields (TIN/NIS/qualifying_children/second_job/medical/other_deductions/company).",
			"Confirm production country_payroll_profile equals the GY-2026 constants used here.",
		];

		// optional scratch staging proof
		if (
			process.env.CONFIRM_SCRATCH_WRITE === "1" &&
			process.env.V2_STAGING_DATABASE_URL
		) {
			console.log("[recon] scratch staging requested — loading source data...");
			scratchCounts = await loadScratch();
			scratchDb = dbNameOf(process.env.V2_STAGING_DATABASE_URL);
		}

		const result: ReconciliationResult = {
			generatedAt: new Date().toISOString(),
			v1Url: redact(process.env.V1_DATABASE_URL ?? ""),
			scratchDb,
			scratchCounts,
			tenants,
			payslips,
			componentSummary,
			attendance,
			statutory,
			readiness,
			blockers,
			next21D,
		};

		mkdirSync(OUT_DIR, { recursive: true });
		writeFileSync(`${OUT_DIR}/reconciliation-report.md`, toMarkdown(result));
		writeFileSync(`${OUT_DIR}/reconciliation-report.json`, toJson(result));

		printSummary(result);
	} finally {
		await v1.end();
	}
}

function printSummary(r: ReconciliationResult) {
	console.log("\n=== v1 → v2 PAYROLL RECONCILIATION (no v1/prod writes) ===");
	console.log(`v1: ${r.v1Url}`);
	console.log(`scratch: ${r.scratchDb ?? "(not run)"}`);
	console.log(`readiness: ${r.readiness.toUpperCase()}`);
	console.log("\nPer-tenant payslip parity:");
	for (const t of r.tenants) {
		console.log(
			`  ${t.name}: ${t.payslips} payslips → exact ${t.exact}, rounding ${t.rounding}, review ${t.review}, blocked ${t.blocked}, v1-bug ${t.v1Bug}`
		);
	}
	console.log("\nStatutory component parity:");
	for (const c of r.componentSummary) {
		console.log(
			`  ${c.component}: exact ${c.counts.exact_match}, rounding ${c.counts.acceptable_rounding}, review ${c.counts.requires_manual_review}, v2-engine-gap ${c.counts.v2_engine_gap}, mapping-gap ${c.counts.mapping_gap}`
		);
	}
	if (r.scratchCounts) {
		console.log("\nScratch staging loaded:", JSON.stringify(r.scratchCounts));
	}
	console.log(`\nReport: ${OUT_DIR}/reconciliation-report.md (+ .json)`);
}

main().catch((e) => {
	console.error("RECONCILIATION FAILED:", e);
	process.exit(1);
});
