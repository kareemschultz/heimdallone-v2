import { periodsPerYear } from "./pay-frequency";
import type { CountryPayrollProfileInput } from "./types";

// Pay-frequency proration. The canonical frequency set + periods-per-year live in
// ./pay-frequency (the single source of truth shared by the DB enum, API, UI and
// engine). This module applies that count to the statutory profile. Callers that
// need the frequency primitives import them directly from ./pay-frequency.

const MONTHS_PER_YEAR = 12;

/**
 * Convert a MONTHLY-magnitude statutory amount to the given pay period.
 * Stored constants are monthly (e.g. GY personal allowance $140,000/mo), so the
 * period value is `monthly × 12 / periodsPerYear` (monthly → ×1, fortnightly →
 * ×12/26, weekly → ×12/52). Rounded to the nearest cent, matching GRA's
 * published per-period figures.
 */
function toPeriod(monthlyCents: number, periods: number): number {
	return Math.round((monthlyCents * MONTHS_PER_YEAR) / periods);
}

/**
 * Return a profile whose period-based AMOUNTS (allowance, NIS ceiling, child
 * allowance, OT/insurance caps, tax band edges) are prorated to `payFrequency`.
 * RATES (NIS %, tax band %) are NOT prorated. Monthly is the identity.
 */
export function prorateProfile(
	profile: CountryPayrollProfileInput,
	payFrequency: string
): CountryPayrollProfileInput {
	const periods = periodsPerYear(payFrequency);
	if (periods === MONTHS_PER_YEAR) {
		return profile;
	}
	const p = (cents: number) => toPeriod(cents, periods);
	return {
		...profile,
		personalAllowanceThreshold: p(profile.personalAllowanceThreshold),
		childAllowancePerChild: p(profile.childAllowancePerChild),
		overtimeAllowanceCap: p(profile.overtimeAllowanceCap),
		insurancePremiumCapAmount: p(profile.insurancePremiumCapAmount),
		nisMaxEarnings: p(profile.nisMaxEarnings),
		taxBrackets: profile.taxBrackets.map((b) => ({
			...b,
			min: p(b.min),
			max: b.max === null ? null : p(b.max),
			fixedAmount: p(b.fixedAmount),
		})),
	};
}
