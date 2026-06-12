import { describe, expect, test } from "bun:test";
// NOTE: ./proration does not exist yet — this is the RED test (Phase 21D-B).
import { periodsPerYear } from "./pay-frequency";
import { prorateProfile } from "./proration";
import type { CountryPayrollProfileInput } from "./types";

// GY 2026 statutory profile at MONTHLY magnitude (cents), mirroring the engine's
// stored country_payroll_profile / fixture. GRA publishes these as monthly
// figures that prorate per pay frequency.
const monthlyProfile: CountryPayrollProfileInput = {
	countryCode: "GY",
	effectiveYear: 2026,
	taxBrackets: [
		{ min: 0, max: 28_000_000, rate: 0.25, fixedAmount: 0 },
		{ min: 28_000_000, max: null, rate: 0.35, fixedAmount: 0 },
	],
	personalAllowanceFormula: "max(threshold, gross/3)",
	personalAllowanceThreshold: 14_000_000, // $140,000/mo
	childAllowancePerChild: 1_000_000, // $10,000/mo
	overtimeAllowanceCap: 5_000_000, // $50,000/mo
	insurancePremiumCapAmount: 5_000_000, // $50,000/mo
	employeeNISRate: 0.056,
	employerNISRate: 0.084,
	nisMaxEarnings: 28_000_000, // $280,000/mo ceiling
};

describe("periodsPerYear", () => {
	test("maps each pay frequency to its periods-per-year", () => {
		expect(periodsPerYear("weekly")).toBe(52);
		expect(periodsPerYear("fortnightly")).toBe(26);
		expect(periodsPerYear("semi-monthly")).toBe(24);
		expect(periodsPerYear("monthly")).toBe(12);
	});

	test("handles the literal DB enum spelling 'semi_monthly' (underscore)", () => {
		// The contract pay_frequency pg enum stores "semi_monthly" (underscore).
		// Proration MUST recognise it or semi-monthly employees keep the bug.
		expect(periodsPerYear("semi_monthly")).toBe(24);
		expect(periodsPerYear("semi-monthly")).toBe(24);
		expect(periodsPerYear("bi-weekly")).toBe(26);
	});

	test("defaults unknown frequencies to monthly (12)", () => {
		expect(periodsPerYear("annually")).toBe(12);
		expect(periodsPerYear("")).toBe(12);
	});
});

describe("prorateProfile", () => {
	test("monthly is the identity (no proration)", () => {
		expect(prorateProfile(monthlyProfile, "monthly")).toEqual(monthlyProfile);
	});

	test("fortnightly prorates period constants to GRA's per-period values (×12/26)", () => {
		const p = prorateProfile(monthlyProfile, "fortnightly");
		// GRA 2026 fortnightly personal allowance = $64,615.38 = 1,680,000/26
		expect(p.personalAllowanceThreshold).toBe(6_461_538);
		// NIS ceiling $280,000/mo → $129,230.77 fortnightly
		expect(p.nisMaxEarnings).toBe(12_923_077);
		// child allowance $10,000/mo → $4,615.38 fortnightly
		expect(p.childAllowancePerChild).toBe(461_538);
		// caps prorate too
		expect(p.overtimeAllowanceCap).toBe(2_307_692);
		expect(p.insurancePremiumCapAmount).toBe(2_307_692);
		// tax band ceiling $280,000/mo → $129,230.77 fortnightly
		const [b1, b2] = p.taxBrackets;
		expect(b1?.max).toBe(12_923_077);
		expect(b2?.min).toBe(12_923_077);
		expect(b2?.max).toBeNull();
	});

	test("rates are NOT prorated (only amounts)", () => {
		const p = prorateProfile(monthlyProfile, "fortnightly");
		const [b1, b2] = p.taxBrackets;
		expect(p.employeeNISRate).toBe(0.056);
		expect(p.employerNISRate).toBe(0.084);
		expect(b1?.rate).toBe(0.25);
		expect(b2?.rate).toBe(0.35);
	});

	test("weekly prorates by ×12/52", () => {
		const p = prorateProfile(monthlyProfile, "weekly");
		// $140,000/mo → $32,307.69 weekly = 1,680,000/52
		expect(p.personalAllowanceThreshold).toBe(3_230_769);
	});
});
