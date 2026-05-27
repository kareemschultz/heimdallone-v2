import type { CountryRules } from "../types";
import { guyana2026 } from "./guyana-2026";

const rulesKey = (countryCode: string, year: number): string =>
	`${countryCode}-${year}`;

const registry = new Map<string, CountryRules>([
	[rulesKey("GY", 2026), guyana2026],
]);

export const resolveCountryRules = (
	countryCode: string,
	effectiveYear: number
): CountryRules | null =>
	registry.get(rulesKey(countryCode, effectiveYear)) ?? null;

export const getAvailableCountries = (): Array<{
	countryCode: string;
	effectiveYear: number;
}> =>
	[...registry.values()].map((r) => ({
		countryCode: r.countryCode,
		effectiveYear: r.effectiveYear,
	}));
