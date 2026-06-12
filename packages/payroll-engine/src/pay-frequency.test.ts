import { describe, expect, test } from "bun:test";
import {
	isKnownPayFrequency,
	normalizePayFrequency,
	PAY_FREQUENCIES,
	PAY_FREQUENCY_META,
	PAY_FREQUENCY_OPTIONS,
	periodsPerYear,
	resolvePayFrequency,
} from "./pay-frequency";

describe("PAY_FREQUENCIES canonical list", () => {
	test("includes the four supported frequencies", () => {
		expect([...PAY_FREQUENCIES]).toEqual([
			"weekly",
			"fortnightly",
			"semi_monthly",
			"monthly",
		]);
	});

	test("every frequency has metadata with matching value + periods", () => {
		for (const f of PAY_FREQUENCIES) {
			const meta = PAY_FREQUENCY_META[f];
			expect(meta.value).toBe(f);
			expect(meta.periodsPerYear).toBeGreaterThan(0);
			expect(meta.label.length).toBeGreaterThan(0);
		}
	});

	test("options list mirrors the canonical order", () => {
		expect(PAY_FREQUENCY_OPTIONS.map((o) => o.value)).toEqual([
			...PAY_FREQUENCIES,
		]);
	});

	test("periods-per-year are the expected statutory divisors", () => {
		expect(PAY_FREQUENCY_META.weekly.periodsPerYear).toBe(52);
		expect(PAY_FREQUENCY_META.fortnightly.periodsPerYear).toBe(26);
		expect(PAY_FREQUENCY_META.semi_monthly.periodsPerYear).toBe(24);
		expect(PAY_FREQUENCY_META.monthly.periodsPerYear).toBe(12);
	});
});

describe("normalizePayFrequency", () => {
	test("collapses spaces/hyphens/case to canonical key shape", () => {
		expect(normalizePayFrequency("Semi-Monthly")).toBe("semi_monthly");
		expect(normalizePayFrequency("  Bi Weekly ")).toBe("bi_weekly");
		expect(normalizePayFrequency("FORTNIGHTLY")).toBe("fortnightly");
	});
});

describe("resolvePayFrequency", () => {
	test("resolves canonical spellings", () => {
		expect(resolvePayFrequency("weekly")).toBe("weekly");
		expect(resolvePayFrequency("semi_monthly")).toBe("semi_monthly");
	});

	test("resolves common aliases (v1 / other products)", () => {
		expect(resolvePayFrequency("bi-weekly")).toBe("fortnightly");
		expect(resolvePayFrequency("biweekly")).toBe("fortnightly");
		expect(resolvePayFrequency("fortnight")).toBe("fortnightly");
		expect(resolvePayFrequency("Semi Monthly")).toBe("semi_monthly");
		expect(resolvePayFrequency("twice monthly")).toBe("semi_monthly");
	});

	test("returns null for unknown frequencies", () => {
		expect(resolvePayFrequency("annually")).toBeNull();
		expect(resolvePayFrequency("")).toBeNull();
	});
});

describe("isKnownPayFrequency", () => {
	test("true for supported + aliased, false for unknown", () => {
		expect(isKnownPayFrequency("fortnightly")).toBe(true);
		expect(isKnownPayFrequency("bi-weekly")).toBe(true);
		expect(isKnownPayFrequency("annually")).toBe(false);
	});
});

describe("periodsPerYear (canonical)", () => {
	test("maps supported + aliased spellings", () => {
		expect(periodsPerYear("weekly")).toBe(52);
		expect(periodsPerYear("fortnightly")).toBe(26);
		expect(periodsPerYear("bi-weekly")).toBe(26);
		expect(periodsPerYear("semi_monthly")).toBe(24);
		expect(periodsPerYear("semi-monthly")).toBe(24);
		expect(periodsPerYear("monthly")).toBe(12);
	});

	test("unknown defaults to monthly (12)", () => {
		expect(periodsPerYear("annually")).toBe(12);
		expect(periodsPerYear("")).toBe(12);
	});
});
