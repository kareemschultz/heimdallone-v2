// biome-ignore-all lint: one-shot payroll-input mapper for reconciliation (Phase 21C).
//
// Maps a v1 payslip `snapshot_json` into the values needed to re-run v2's
// statutory payroll rules, and resolves the v2 country rules + profile.
//
// Why this works: v1 stored, per payslip, BOTH the `inputs` it fed its
// calculator AND the `computed` results. Feeding v1's own inputs into v2's
// engine isolates ENGINE/RULE differences from input differences — a clean
// parity test that does NOT depend on the unbuilt roster/attendance gap
// (gross/overtime are already given in the snapshot inputs).

import { resolveCountryRules } from "../../packages/payroll-engine/src/countries/registry";
import type {
	CountryPayrollProfileInput,
	CountryRules,
} from "../../packages/payroll-engine/src/types";

/**
 * Canonical Guyana 2026 statutory profile — mirrors
 * packages/payroll-engine/src/fixtures/guyana-2026.ts (GY_PROFILE is not
 * exported, so it is re-declared here). All amounts are in CENTS, matching the
 * engine's money model. 21D should confirm these equal the production-seeded
 * country_payroll_profile row.
 */
export const GY_2026_PROFILE: CountryPayrollProfileInput = {
	countryCode: "GY",
	effectiveYear: 2026,
	taxBrackets: [
		{ min: 0, max: 28_000_000, rate: 0.25, fixedAmount: 0 },
		{ min: 28_000_000, max: null, rate: 0.35, fixedAmount: 0 },
	],
	personalAllowanceFormula: "max(threshold, gross/3)",
	personalAllowanceThreshold: 14_000_000,
	childAllowancePerChild: 1_000_000,
	overtimeAllowanceCap: 5_000_000,
	insurancePremiumCapAmount: 5_000_000,
	employeeNISRate: 0.056,
	employerNISRate: 0.084,
	nisMaxEarnings: 28_000_000,
};

export type V1SnapshotInputs = {
	basePayCents: number;
	grossPayCents: number;
	overtimePayCents: number;
	secondJobPayCents: number;
	otherEarningsCents: number;
	qualifyingChildren: number;
	otherDeductionsCents: number;
	medicalPayrollDeductCents: number;
	customPreTaxDeductionsCents: number;
	medicalExternalPremiumCents: number;
	customPostTaxDeductionsCents: number;
	customTaxableAllowancesCents: number;
	customNonTaxableAllowancesCents: number;
};

export type V1SnapshotComputed = {
	payeCents: number;
	netPayCents: number;
	grossPayCents: number;
	medicalLifeCents: number;
	nisEmployeeCents: number;
	nisEmployerCents: number;
	childAllowanceCents: number;
	otherDeductionsCents: number;
	chargeableIncomeCents: number;
	personalAllowanceCents: number;
};

export type V1Snapshot = {
	inputs: Partial<V1SnapshotInputs>;
	computed: Partial<V1SnapshotComputed>;
	country?: string;
	payFrequency?: string;
	rulesVersion?: string;
};

export function parseSnapshot(raw: unknown): V1Snapshot | null {
	if (!raw) {
		return null;
	}
	const o = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
	if (!(o && typeof o === "object" && o.inputs && o.computed)) {
		return null;
	}
	return o as V1Snapshot;
}

const n = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

export type ReconInputs = {
	grossCents: number;
	overtimeCents: number;
	qualifyingChildren: number;
	medicalPremiumCents: number;
	medicalDeductCents: number;
	otherDeductionsCents: number;
	preTaxDeductionsCents: number;
	postTaxDeductionsCents: number;
	nonTaxableAllowancesCents: number;
	taxableAllowancesCents: number;
};

export function reconInputsFromSnapshot(s: V1Snapshot): ReconInputs {
	const i = s.inputs;
	return {
		grossCents: n(i.grossPayCents),
		overtimeCents: n(i.overtimePayCents),
		qualifyingChildren: n(i.qualifyingChildren),
		medicalPremiumCents: n(i.medicalExternalPremiumCents),
		medicalDeductCents: n(i.medicalPayrollDeductCents),
		otherDeductionsCents: n(i.otherDeductionsCents),
		preTaxDeductionsCents: n(i.customPreTaxDeductionsCents),
		postTaxDeductionsCents: n(i.customPostTaxDeductionsCents),
		nonTaxableAllowancesCents: n(i.customNonTaxableAllowancesCents),
		taxableAllowancesCents: n(i.customTaxableAllowancesCents),
	};
}

/** Resolve v2 rules for a v1 country string (v1 stored "GY"/"GY-2026"/etc.). */
export function resolveRulesForSnapshot(
	s: V1Snapshot
): { rules: CountryRules; profile: CountryPayrollProfileInput } | null {
	const code = (s.country ?? "GY").slice(0, 2).toUpperCase();
	const rules = resolveCountryRules(code, GY_2026_PROFILE.effectiveYear);
	if (!rules) {
		return null;
	}
	return { rules, profile: GY_2026_PROFILE };
}
