// Canonical pay-frequency definition — the SINGLE source of truth for the set of
// supported pay frequencies, their human labels, and their periods-per-year.
//
// Every layer derives from this list so they cannot drift apart (the divergence
// that let the DB enum reject "fortnightly" while the engine already computed it):
//   - DB enum         packages/db/src/schema/hr-core.ts  (contractPayFrequencyEnum)
//   - API validation  packages/api/src/routers/contracts.ts  (z.enum(PAY_FREQUENCIES))
//   - UI labels/opts  apps/web/src/lib/pay-frequency.ts  (re-exports these)
//   - Engine math     ./proration.ts  (re-exports periodsPerYear)
//
// SaaS rule: pay frequency is a first-class, country-agnostic concept. Statutory
// constants are stored at MONTHLY magnitude and prorated by periodsPerYear, so a
// new frequency is one row here — never a special case scattered across modules.

export const PAY_FREQUENCIES = [
	"weekly",
	"fortnightly",
	"semi_monthly",
	"monthly",
] as const;

export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export interface PayFrequencyMeta {
	description: string;
	label: string;
	periodsPerYear: number;
	value: PayFrequency;
}

export const PAY_FREQUENCY_META: Record<PayFrequency, PayFrequencyMeta> = {
	weekly: {
		value: "weekly",
		label: "Weekly",
		periodsPerYear: 52,
		description: "Paid every week (52 pay periods per year)",
	},
	fortnightly: {
		value: "fortnightly",
		label: "Fortnightly",
		periodsPerYear: 26,
		description: "Paid every two weeks (26 pay periods per year)",
	},
	semi_monthly: {
		value: "semi_monthly",
		label: "Semi-monthly",
		periodsPerYear: 24,
		description: "Paid twice a month (24 pay periods per year)",
	},
	monthly: {
		value: "monthly",
		label: "Monthly",
		periodsPerYear: 12,
		description: "Paid once a month (12 pay periods per year)",
	},
};

/** Ordered metadata list — drives UI dropdowns without re-listing values. */
export const PAY_FREQUENCY_OPTIONS: PayFrequencyMeta[] = PAY_FREQUENCIES.map(
	(value) => PAY_FREQUENCY_META[value]
);

const MONTHS_PER_YEAR = 12;

// Common external spellings (v1 data, other locales/products) → canonical value.
// Migration normalizer and the engine both route through this so an inbound
// "bi-weekly" / "fortnight" never falls through to the monthly default.
const ALIASES: Record<string, PayFrequency> = {
	bi_weekly: "fortnightly",
	biweekly: "fortnightly",
	fortnight: "fortnightly",
	semimonthly: "semi_monthly",
	twice_monthly: "semi_monthly",
};

/** Lowercase, trim, collapse spaces/hyphens to underscore → canonical key shape. */
export function normalizePayFrequency(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[\s-]+/g, "_");
}

/** Resolve any reasonable spelling to a canonical PayFrequency, or null if unknown. */
export function resolvePayFrequency(input: string): PayFrequency | null {
	const normalized = normalizePayFrequency(input);
	if ((PAY_FREQUENCIES as readonly string[]).includes(normalized)) {
		return normalized as PayFrequency;
	}
	return ALIASES[normalized] ?? null;
}

/** True when `input` maps to a supported pay frequency. */
export function isKnownPayFrequency(input: string): boolean {
	return resolvePayFrequency(input) !== null;
}

/**
 * Pay periods per year for the given frequency. Unknown values default to
 * monthly (12) so projected-pay/preview paths never throw; the contract
 * pay_frequency enum constrains stored values, and isKnownPayFrequency() is
 * available where a hard reject is wanted.
 */
export function periodsPerYear(input: string): number {
	const resolved = resolvePayFrequency(input);
	return resolved
		? PAY_FREQUENCY_META[resolved].periodsPerYear
		: MONTHS_PER_YEAR;
}
