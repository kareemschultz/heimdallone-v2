// biome-ignore-all lint: one-shot payslip reconciliation (Phase 21C).
//
// For every v1 payslip, re-runs v2's statutory rules over v1's OWN inputs and
// compares against v1's computed results. This tests whether v2's tax engine
// reproduces v1's payslips — the cutover safety net for payroll correctness.
//
// Scope honesty: the EARNINGS layer (gross / overtime / Saturday / Sunday /
// holiday pay) is attendance+roster-derived and CANNOT be reconstructed until
// the 21D roster build — so it is reported as a blocker, NOT faked. This phase
// reconciles the STATUTORY layer (NIS, personal/child allowance, PAYE brackets,
// net identity), which is roster-independent because v1 stored the gross.

import type { Client } from "pg";
import {
	parseSnapshot,
	reconInputsFromSnapshot,
	resolveRulesForSnapshot,
} from "./map-payroll-inputs";
import { v1Rows } from "./v1-readonly";

export type ReconClassification =
	| "exact_match"
	| "acceptable_rounding"
	| "v1_bug_corrected"
	| "mapping_gap"
	| "v2_engine_gap"
	| "requires_manual_review";

export type CheckResult = {
	component: string;
	v1Cents: number | null;
	v2Cents: number | null;
	deltaCents: number | null;
	classification: ReconClassification;
	note?: string;
};

export type PayslipReconResult = {
	payslipId: string;
	tenantId: string;
	employeeId: string;
	periodId: string | null;
	isReversal: boolean;
	status: string | null;
	overall: "exact" | "rounding" | "review" | "v1_bug" | "blocked";
	checks: CheckResult[];
};

const ROUNDING_TOLERANCE_CENTS = 2;

function classifyDelta(delta: number): ReconClassification {
	if (delta === 0) {
		return "exact_match";
	}
	if (Math.abs(delta) <= ROUNDING_TOLERANCE_CENTS) {
		return "acceptable_rounding";
	}
	return "requires_manual_review";
}

function check(
	component: string,
	v1Cents: number | null,
	v2Cents: number | null,
	note?: string
): CheckResult {
	if (v1Cents === null || v2Cents === null) {
		return {
			component,
			v1Cents,
			v2Cents,
			deltaCents: null,
			classification: "mapping_gap",
			note: note ?? "missing value",
		};
	}
	const delta = v2Cents - v1Cents;
	return {
		component,
		v1Cents,
		v2Cents,
		deltaCents: delta,
		classification: classifyDelta(delta),
		note,
	};
}

function rollUp(checks: CheckResult[]): PayslipReconResult["overall"] {
	if (
		checks.some(
			(c) =>
				c.classification === "mapping_gap" ||
				c.classification === "v2_engine_gap"
		)
	) {
		return "blocked";
	}
	if (checks.some((c) => c.classification === "requires_manual_review")) {
		return "review";
	}
	if (checks.some((c) => c.classification === "acceptable_rounding")) {
		return "rounding";
	}
	return "exact";
}

function reconcileOne(row: any): PayslipReconResult {
	const base = {
		payslipId: row.id,
		tenantId: row.tenant_id,
		employeeId: row.employee_id,
		periodId: row.payroll_period_id ?? null,
		isReversal: Boolean(row.is_reversal),
		status: row.status ?? null,
	};

	// v1 UTC-bug reversal payslips: preserved as history, not reconciled.
	if (base.isReversal) {
		return {
			...base,
			overall: "v1_bug",
			checks: [
				{
					component: "(whole payslip)",
					v1Cents: null,
					v2Cents: null,
					deltaCents: null,
					classification: "v1_bug_corrected",
					note: "v1 reversal payslip (UTC-bug correction) — preserved as history, not replayed",
				},
			],
		};
	}

	const snap = parseSnapshot(row.snapshot_json);
	if (!snap) {
		return {
			...base,
			overall: "blocked",
			checks: [
				{
					component: "(snapshot)",
					v1Cents: null,
					v2Cents: null,
					deltaCents: null,
					classification: "mapping_gap",
					note: "no snapshot_json — cannot reconstruct v1 inputs",
				},
			],
		};
	}

	const resolved = resolveRulesForSnapshot(snap);
	if (!resolved) {
		return {
			...base,
			overall: "blocked",
			checks: [
				{
					component: "(country rules)",
					v1Cents: null,
					v2Cents: null,
					deltaCents: null,
					classification: "v2_engine_gap",
					note: `no v2 rules for country '${snap.country}'`,
				},
			],
		};
	}

	const { rules, profile } = resolved;
	const inp = reconInputsFromSnapshot(snap);
	const c = snap.computed;
	const num = (v: unknown): number | null => (v == null ? null : Number(v));

	const nis = rules.computeNIS(inp.grossCents, profile);
	const personal = rules.computePersonalAllowance(inp.grossCents, profile);
	const child = rules.computeChildAllowance(inp.qualifyingChildren, profile);

	// Personal allowance: a mismatch on a NON-monthly pay frequency is a real v2
	// engine gap — v2 applies the full monthly allowance every period, while v1
	// (correctly) prorates it (fortnightly = x12/26). Reclassify so the report
	// reads as "v2 engine needs frequency proration", not vague manual review.
	const freq = (snap.payFrequency ?? "monthly").toLowerCase();
	const personalCheck = check(
		"personal_allowance",
		num(c.personalAllowanceCents),
		personal
	);
	if (personalCheck.classification === "requires_manual_review") {
		if (freq !== "monthly") {
			personalCheck.classification = "v2_engine_gap";
			personalCheck.note = `v2 applies full monthly personal allowance; v1 prorates to ${freq} pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover`;
		} else {
			personalCheck.note =
				"personal allowance differs — confirm threshold value/derivation";
		}
	}

	const checks: CheckResult[] = [
		check("nis_employee", num(c.nisEmployeeCents), nis.employee),
		check("nis_employer", num(c.nisEmployerCents), nis.employer),
		personalCheck,
		check("child_allowance", num(c.childAllowanceCents), child),
	];

	// PAYE bracket math — isolated by feeding v1's OWN chargeable income.
	const v1Chargeable = num(c.chargeableIncomeCents);
	if (v1Chargeable !== null) {
		const v2Paye = rules.computePAYE(v1Chargeable, profile);
		checks.push(
			check(
				"paye_brackets",
				num(c.payeCents),
				v2Paye,
				"v2 brackets applied to v1's chargeable income"
			)
		);
	} else {
		checks.push({
			component: "paye_brackets",
			v1Cents: num(c.payeCents),
			v2Cents: null,
			deltaCents: null,
			classification: "mapping_gap",
			note: "v1 chargeable income missing",
		});
	}

	// Net identity (composition consistency): net == gross - NIS(emp) - PAYE - deductions.
	const v1Net = num(c.netPayCents);
	if (v1Net !== null && v1Chargeable !== null) {
		const reconNet =
			inp.grossCents -
			Number(c.nisEmployeeCents ?? 0) -
			Number(c.payeCents ?? 0) -
			inp.otherDeductionsCents -
			inp.medicalDeductCents -
			inp.postTaxDeductionsCents;
		const netCheck = check(
			"net_identity",
			v1Net,
			reconNet,
			"gross - NIS(emp) - PAYE - deductions"
		);
		// A net mismatch is a composition signal, not a statutory-rule failure.
		if (netCheck.classification === "requires_manual_review") {
			netCheck.note =
				"net composition differs — confirm v2 deduction ordering (manual review)";
		}
		checks.push(netCheck);
	}

	return { ...base, overall: rollUp(checks), checks };
}

export async function reconcilePayslips(
	v1: Client
): Promise<PayslipReconResult[]> {
	const rows = await v1Rows(
		v1,
		`SELECT id, tenant_id, employee_id, payroll_period_id, status, is_reversal,
		        snapshot_json
		 FROM payslips`
	);
	return rows.map(reconcileOne);
}
