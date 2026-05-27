/**
 * Holiday provider abstraction.
 *
 * Primary: Nager.Date (open-source, no API key, 100+ countries)
 * Fallback: Local Caribbean overrides for missing Islamic/lunar holidays
 *
 * Future providers: Calendarific (230+ countries, API key required),
 * Abstract Holidays API (190+ countries, API key required)
 */

export interface HolidaySuggestion {
	date: string;
	endDate?: string;
	isRecurring: boolean;
	name: string;
	source: "nager" | "local";
	type: string;
}

export interface CountryInfo {
	code: string;
	flag: string;
	name: string;
}

// ─── Nager.Date Provider ──────────────────────────────────

interface NagerHoliday {
	countryCode: string;
	date: string;
	global: boolean;
	localName: string;
	name: string;
	types: string[];
}

async function fetchNagerHolidays(
	countryCode: string,
	year: number
): Promise<HolidaySuggestion[]> {
	const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
	const res = await fetch(url);
	if (!res.ok) {
		return [];
	}
	const data: NagerHoliday[] = await res.json();
	return data.map((h) => ({
		name: h.localName === h.name ? h.name : `${h.name} (${h.localName})`,
		date: h.date,
		isRecurring: false,
		type: h.types[0] ?? "Public",
		source: "nager" as const,
	}));
}

// ─── Local Override Provider ──────────────────────────────
// Covers Caribbean-specific holidays that Nager.Date may miss
// (Islamic/lunar dates, country-specific observances)

const LOCAL_OVERRIDES: Record<string, Record<number, HolidaySuggestion[]>> = {
	GY: {
		2025: [
			{
				name: "Phagwah (Holi)",
				date: "2025-03-14",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
			{
				name: "Youman Nabi",
				date: "2025-09-05",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
			{
				name: "Deepavali",
				date: "2025-10-20",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
		],
		2026: [
			{
				name: "Phagwah (Holi)",
				date: "2026-03-10",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
			{
				name: "Youman Nabi",
				date: "2026-08-28",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
			{
				name: "Deepavali",
				date: "2026-10-20",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
		],
	},
	TT: {
		2026: [
			{
				name: "Divali",
				date: "2026-10-20",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
			{
				name: "Eid-ul-Fitr",
				date: "2026-03-20",
				isRecurring: false,
				type: "Public",
				source: "local",
			},
		],
	},
};

function getLocalOverrides(
	countryCode: string,
	year: number
): HolidaySuggestion[] {
	return LOCAL_OVERRIDES[countryCode]?.[year] ?? [];
}

// ─── Combined Fetch ───────────────────────────────────────

export async function fetchHolidays(
	countryCode: string,
	year: number
): Promise<{ holidays: HolidaySuggestion[]; nagerFailed: boolean }> {
	let nagerHolidays: HolidaySuggestion[] = [];
	let nagerFailed = false;

	try {
		nagerHolidays = await fetchNagerHolidays(countryCode, year);
	} catch {
		nagerFailed = true;
	}

	const localOverrides = getLocalOverrides(countryCode, year);

	const nagerDates = new Set(nagerHolidays.map((h) => h.date));
	const merged = [
		...nagerHolidays,
		...localOverrides.filter((o) => !nagerDates.has(o.date)),
	];

	merged.sort((a, b) => a.date.localeCompare(b.date));

	return { holidays: merged, nagerFailed };
}

// ─── Supported Countries ──────────────────────────────────
// Nager.Date supports 100+ countries. We list Caribbean-priority
// countries first. The full Nager list can be fetched from:
// GET https://date.nager.at/api/v3/AvailableCountries

export const SUPPORTED_COUNTRIES: CountryInfo[] = [
	{ code: "GY", name: "Guyana", flag: "🇬🇾" },
	{ code: "TT", name: "Trinidad and Tobago", flag: "🇹🇹" },
	{ code: "JM", name: "Jamaica", flag: "🇯🇲" },
	{ code: "BB", name: "Barbados", flag: "🇧🇧" },
	{ code: "SR", name: "Suriname", flag: "🇸🇷" },
	{ code: "BS", name: "Bahamas", flag: "🇧🇸" },
	{ code: "BZ", name: "Belize", flag: "🇧🇿" },
	{ code: "US", name: "United States", flag: "🇺🇸" },
	{ code: "CA", name: "Canada", flag: "🇨🇦" },
	{ code: "GB", name: "United Kingdom", flag: "🇬🇧" },
];

export const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028];
