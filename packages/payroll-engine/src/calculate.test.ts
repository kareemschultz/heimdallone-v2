import { describe, expect, test } from "bun:test";
import { calculatePayroll } from "./calculate";
import {
	atNISCeiling,
	fortnightlySalaried,
	highSalaryPAYE,
	hourlyWithOvertime,
	missingContract,
	monthlySalariedNormal,
	negativeNetPay,
	pendingOvertimeWarning,
	unsupportedCountry,
	withChildAllowance,
	withInsuranceCap,
	withLoanDeduction,
	withNonTaxableAllowance,
	withReimbursement,
	withTaxableAllowance,
	withUnpaidLeave,
} from "./fixtures/guyana-2026";
import type { PayrollInput } from "./types";

describe("calculatePayroll", () => {
	test("monthly salaried employee — normal period", () => {
		const result = calculatePayroll(monthlySalariedNormal);

		expect(result.isPayrollReady).toBe(true);
		expect(result.blockers).toHaveLength(0);
		expect(result.basePay).toBe(35_000_000);
		expect(result.overtimePay).toBe(0);
		expect(result.grossPay).toBe(35_000_000);

		expect(result.employeeNis).toBeGreaterThan(0);
		expect(result.employerNis).toBeGreaterThan(0);
		expect(result.paye).toBeGreaterThan(0);
		expect(result.netPay).toBeGreaterThan(0);
		expect(result.netPay).toBeLessThan(result.grossPay);
		expect(result.confidence).toBe("high");
		expect(result.isEstimate).toBe(true);
		expect(result.currency).toBe("GYD");
		expect(result.lineItems.length).toBeGreaterThan(0);
		expect(result.explanation.length).toBeGreaterThan(0);
	});

	test("fortnightly employee gets the GRA-prorated personal allowance, not the flat monthly amount", () => {
		const result = calculatePayroll(fortnightlySalaried);

		// GRA 2026 fortnightly personal allowance = $64,615.38 = 1,680,000/26
		// (NOT the full monthly $140,000). Values are in cents.
		const paStep = result.explanation.find(
			(e) => e.label === "Personal allowance"
		);
		expect(paStep?.result).toBe(6_461_538);

		// Gross ($100,000) exceeds the prorated allowance, so PAYE is owed.
		// Under the flat-$140,000 bug the allowance swallowed the gross → PAYE 0.
		expect(result.grossPay).toBe(10_000_000);
		expect(result.paye).toBeGreaterThan(0);
	});

	test("monthly employee's personal allowance is unchanged (proration identity)", () => {
		const result = calculatePayroll(monthlySalariedNormal);
		const paStep = result.explanation.find(
			(e) => e.label === "Personal allowance"
		);
		// $350,000 gross → gross/3 = 11,666,667 < $140,000/mo threshold ($14M cents),
		// so the threshold applies and monthly proration is the identity (×1).
		expect(paStep?.result).toBe(14_000_000);
	});

	test("hourly employee with approved overtime", () => {
		const result = calculatePayroll(hourlyWithOvertime);

		expect(result.isPayrollReady).toBe(true);
		expect(result.basePay).toBeGreaterThan(0);
		expect(result.overtimePay).toBeGreaterThan(0);
		expect(result.grossPay).toBe(result.basePay + result.overtimePay);

		const otLines = result.lineItems.filter(
			(l) => l.code === "OT_NON_TAXABLE" || l.code === "OT_TAXABLE"
		);
		expect(otLines.length).toBeGreaterThan(0);
	});

	test("employee with unpaid leave", () => {
		const result = calculatePayroll(withUnpaidLeave);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.isPayrollReady).toBe(true);

		// Phase 8J.3 fix #3 — gross is now FULL base + OT + allowances
		// (unpaid leave only appears as a deduction line). Without the fix,
		// gross was reduced AND the deduction line was also subtracted —
		// i.e. unpaid leave hit net pay twice.
		expect(result.grossPay).toBe(normalResult.grossPay);

		const unpaidLine = result.lineItems.find((l) => l.code === "UNPAID_LEAVE");
		expect(unpaidLine).toBeDefined();
		expect(unpaidLine?.amount).toBeLessThan(0);

		// Net = normal net minus exactly one unpaid-leave deduction.
		const unpaidAmount = Math.abs(unpaidLine?.amount ?? 0);
		expect(result.netPay).toBe(normalResult.netPay - unpaidAmount);

		// basePay return value is the post-unpaid-leave figure (preserved
		// for backwards compatibility with payslip rendering).
		expect(result.basePay).toBeLessThan(normalResult.basePay);
	});

	test("employee with taxable allowance", () => {
		const result = calculatePayroll(withTaxableAllowance);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.taxableAllowances).toBe(1_500_000);
		expect(result.grossPay).toBe(normalResult.grossPay + 1_500_000);
		expect(result.taxableGross).toBeGreaterThan(normalResult.taxableGross);
	});

	test("per-employee override allowance (isFixed=false, overrideAmount) is applied taxable", () => {
		// Shape produced by the v1 recurring-allowance migration: an org pay item
		// with isFixed=false + the amount carried per-employee on the assignment's
		// overrideAmount. overrideAmount must take precedence and count as taxable.
		const withOverride: PayrollInput = {
			...withTaxableAllowance,
			payItems: {
				allowances: [
					{
						payItemId: "pi-transport",
						title: "Transport Allowance",
						isFixed: false,
						fixedAmount: null,
						basedOn: null,
						rate: null,
						isTaxable: true,
						isPreTax: false,
						isTax: false,
						isStatutory: false,
						employerRate: null,
						maxAmount: null,
						overrideAmount: 9000,
					},
				],
				deductions: [],
			},
		};
		const result = calculatePayroll(withOverride);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.taxableAllowances).toBe(900_000);
		expect(result.grossPay).toBe(normalResult.grossPay + 900_000);
		expect(result.taxableGross).toBeGreaterThan(normalResult.taxableGross);
	});

	test("employee with non-taxable allowance", () => {
		const result = calculatePayroll(withNonTaxableAllowance);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.nonTaxableAllowances).toBe(1_000_000);
		expect(result.grossPay).toBe(normalResult.grossPay + 1_000_000);
		expect(result.taxableGross).toBeLessThanOrEqual(
			normalResult.taxableGross + 1
		);
	});

	test("employee with insurance deduction cap", () => {
		const result = calculatePayroll(withInsuranceCap);

		const insuranceLine = result.lineItems.find(
			(l) => l.title === "Health Insurance"
		);
		expect(insuranceLine).toBeDefined();

		const cappedAmount = Math.abs(insuranceLine?.amount ?? 0);
		expect(cappedAmount).toBeLessThanOrEqual(5_000_000);

		const tenPercentGross = Math.round(result.grossPay * 0.1);
		expect(cappedAmount).toBeLessThanOrEqual(tenPercentGross + 1);
	});

	test("employee with child allowance", () => {
		const result = calculatePayroll(withChildAllowance);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.taxableGross).toBeLessThan(normalResult.taxableGross);

		const childExplanation = result.explanation.find((e) => e.step === 12);
		expect(childExplanation).toBeDefined();
		expect(childExplanation?.result).toBe(2_000_000);
	});

	test("employee with loan deduction", () => {
		const result = calculatePayroll(withLoanDeduction);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.netPay).toBeLessThan(normalResult.netPay);

		const loanLine = result.lineItems.find((l) => l.code.startsWith("LOAN_"));
		expect(loanLine).toBeDefined();
		expect(loanLine?.amount).toBeLessThan(0);
		expect(loanLine?.title).toContain("2/12");
	});

	test("employee with reimbursement", () => {
		const result = calculatePayroll(withReimbursement);
		const normalResult = calculatePayroll(monthlySalariedNormal);

		expect(result.reimbursements).toBe(500_000);
		expect(result.netPay).toBe(normalResult.netPay + 500_000);

		const reimbLine = result.lineItems.find((l) =>
			l.code.startsWith("REIMBURSE_")
		);
		expect(reimbLine).toBeDefined();
		expect(reimbLine?.amount).toBe(500_000);
	});

	test("missing contract — blocker", () => {
		const result = calculatePayroll(missingContract);

		expect(result.isPayrollReady).toBe(false);
		expect(result.blockers.length).toBeGreaterThan(0);
		expect(result.blockers.some((b) => b.code === "NO_CONTRACT")).toBe(true);
		expect(result.confidence).toBe("cannot_estimate");
		expect(result.grossPay).toBe(0);
		expect(result.netPay).toBe(0);
	});

	test("pending attendance — warning", () => {
		const result = calculatePayroll(pendingOvertimeWarning);

		expect(result.isPayrollReady).toBe(true);
		expect(
			result.warnings.some((w) => w.code === "UNVALIDATED_ATTENDANCE")
		).toBe(true);
	});

	test("negative net pay — blocker", () => {
		const result = calculatePayroll(negativeNetPay);

		expect(result.blockers.some((b) => b.code === "NEGATIVE_NET_PAY")).toBe(
			true
		);
		expect(result.isPayrollReady).toBe(false);
		expect(result.netPay).toBeLessThan(0);
	});

	test("Guyana PAYE threshold — below bracket", () => {
		const result = calculatePayroll(monthlySalariedNormal);
		expect(result.taxableGross).toBeLessThanOrEqual(28_000_000);

		const payeExplanation = result.explanation.find((e) => e.step === 14);
		expect(payeExplanation).toBeDefined();
	});

	test("Guyana PAYE threshold — above bracket (35% kicks in)", () => {
		const result = calculatePayroll(highSalaryPAYE);

		expect(result.grossPay).toBe(50_000_000);

		expect(result.taxableGross).toBeGreaterThan(0);
		expect(result.paye).toBeGreaterThan(0);

		if (result.taxableGross > 28_000_000) {
			const firstBracketTax = Math.round(28_000_000 * 0.25);
			const secondBracketTax = Math.round(
				(result.taxableGross - 28_000_000) * 0.35
			);
			expect(result.paye).toBe(firstBracketTax + secondBracketTax);
		}
	});

	test("NIS ceiling — capped at max earnings", () => {
		const result = calculatePayroll(atNISCeiling);

		const maxNisEmployee = Math.round(28_000_000 * 0.056);
		const maxNisEmployer = Math.round(28_000_000 * 0.084);

		expect(result.employeeNis).toBe(maxNisEmployee);
		expect(result.employerNis).toBe(maxNisEmployer);
	});

	test("unsupported country — blocker", () => {
		const result = calculatePayroll(unsupportedCountry);

		expect(result.isPayrollReady).toBe(false);
		expect(
			result.blockers.some((b) => b.code === "MISSING_COUNTRY_PROFILE")
		).toBe(true);
		expect(
			result.blockers.find((b) => b.code === "MISSING_COUNTRY_PROFILE")?.message
		).toContain("BB");
		expect(result.confidence).toBe("cannot_estimate");
		expect(result.grossPay).toBe(0);
	});

	test("NIS rate unit — decimal in, percent of base out (Phase 8J.3 fix #2)", () => {
		// The DB stores NIS rates as percent strings ("5.60" for 5.6%) but
		// the engine treats `employeeNISRate` as a decimal multiplier (0.056).
		// The input-builder divides DB values by 100 before passing here.
		// This test pins the engine's contract so the boundary can't drift.
		const result = calculatePayroll(monthlySalariedNormal);
		const grossPay = result.grossPay;
		const ceiling = 28_000_000;
		const nisBase = Math.min(grossPay, ceiling);

		// Profile fixture uses 0.056 (decimal) — see fixtures/guyana-2026.ts.
		const expectedEmployeeNis = Math.round(nisBase * 0.056);
		const expectedEmployerNis = Math.round(nisBase * 0.084);

		expect(result.employeeNis).toBe(expectedEmployeeNis);
		expect(result.employerNis).toBe(expectedEmployerNis);

		// Sanity: if someone passed 5.6 (percent units) instead of 0.056,
		// NIS would be 100x larger than gross. Confirm we're nowhere near that.
		expect(result.employeeNis).toBeLessThan(grossPay);
	});

	test("deterministic rounding — same input always same output", () => {
		const result1 = calculatePayroll(monthlySalariedNormal);
		const result2 = calculatePayroll(monthlySalariedNormal);

		expect(result1.basePay).toBe(result2.basePay);
		expect(result1.grossPay).toBe(result2.grossPay);
		expect(result1.employeeNis).toBe(result2.employeeNis);
		expect(result1.paye).toBe(result2.paye);
		expect(result1.netPay).toBe(result2.netPay);
		expect(result1.totalDeductions).toBe(result2.totalDeductions);
		expect(result1.lineItems.length).toBe(result2.lineItems.length);
	});
});
