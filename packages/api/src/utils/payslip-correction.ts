/**
 * Historical payslip correction helpers (Phase 21G-G).
 *
 * Pure per-component diff between an originally issued payslip and the figures
 * recomputed under the correct effective-dated rule. Kept pure so it is unit-
 * verifiable; the router does the I/O (resolve rule, recompute, persist).
 *
 * The original issued payslip is NEVER mutated (Migration Rule) — a correction
 * records the corrected truth + lineage in payslip_correction; the only touch to
 * the original is its schema-sanctioned supersededByCorrectionId back-pointer.
 */

export const CORRECTION_COMPONENTS = [
	"grossPay",
	"taxableGross",
	"totalDeductions",
	"netPay",
	"employerContributions",
] as const;

export type CorrectionComponent = (typeof CORRECTION_COMPONENTS)[number];

export interface ComponentDelta {
	corrected: number;
	delta: number;
	original: number;
}

export type ComponentDeltaMap = Record<CorrectionComponent, ComponentDelta>;

/** Round to 2dp to keep money comparisons free of binary-float noise. */
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Build the per-component original → corrected → delta map plus the headline net
 * delta (corrected net − original net) that drives the GL adjustment. `hasChanges`
 * is true when any component moved — a correction with no changes is a no-op.
 */
export function buildComponentDeltas(
	original: Record<CorrectionComponent, number>,
	corrected: Record<CorrectionComponent, number>
): { deltas: ComponentDeltaMap; netDelta: number; hasChanges: boolean } {
	const deltas = {} as ComponentDeltaMap;
	let hasChanges = false;
	for (const key of CORRECTION_COMPONENTS) {
		const o = round2(original[key]);
		const c = round2(corrected[key]);
		const delta = round2(c - o);
		deltas[key] = { original: o, corrected: c, delta };
		if (delta !== 0) {
			hasChanges = true;
		}
	}
	return { deltas, netDelta: deltas.netPay.delta, hasChanges };
}
