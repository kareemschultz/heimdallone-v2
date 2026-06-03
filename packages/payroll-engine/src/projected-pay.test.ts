import { describe, expect, test } from "bun:test";
import {
	hourlyWithOvertime,
	missingContract,
	monthlySalariedNormal,
	withUnpaidLeave,
} from "./fixtures/guyana-2026";
import { calculateProjectedPay } from "./projected-pay";
import type { PayrollInput } from "./types";

const withAttendance = (
	base: PayrollInput,
	patch: Partial<PayrollInput["attendance"]>
): PayrollInput => ({
	...base,
	attendance: { ...base.attendance, ...patch },
});

describe("calculateProjectedPay", () => {
	test("monthly salaried, clean attendance → high confidence", () => {
		const result = calculateProjectedPay(monthlySalariedNormal);

		expect(result.isEstimate).toBe(true);
		expect(result.confidence).toBe("high");
		expect(result.confidenceLabel).toBe("High confidence");
		expect(result.payType).toBe("monthly");
		expect(result.estimatedGross).toBeGreaterThan(0);
		expect(result.blockers).toHaveLength(0);
		// Always carries the not-final disclaimer.
		expect(result.disclaimers[0]).toContain("estimate");
	});

	test("salaried with paid leave does NOT reduce projected gross", () => {
		const withPaidLeave: PayrollInput = {
			...monthlySalariedNormal,
			leave: { paidLeaveDays: 5, unpaidLeaveDays: 0, pendingLeaveDays: 0 },
		};
		const normal = calculateProjectedPay(monthlySalariedNormal);
		const paid = calculateProjectedPay(withPaidLeave);

		expect(paid.estimatedGross).toBe(normal.estimatedGross);
		expect(paid.days.approvedLeaveDays).toBe(5);
		expect(paid.confidence).toBe("high");
	});

	test("salaried with unpaid leave reduces projected net", () => {
		const normal = calculateProjectedPay(monthlySalariedNormal);
		const unpaid = calculateProjectedPay(withUnpaidLeave);

		expect(unpaid.estimatedNet).toBeLessThan(normal.estimatedNet);
		expect(unpaid.days.unpaidLeaveDays).toBe(3);
	});

	test("hourly employee → projected from worked + overtime hours", () => {
		const result = calculateProjectedPay(hourlyWithOvertime);

		expect(result.payType).toBe("hourly");
		expect(result.hours.regularHours).toBeGreaterThan(0);
		expect(result.hours.overtimeHours).toBeGreaterThan(0);
		expect(result.breakdown.overtimePay).toBeGreaterThan(0);
		expect(result.estimatedGross).toBeGreaterThan(0);
	});

	test("open warning exception → needs review, not high", () => {
		const input = withAttendance(monthlySalariedNormal, {
			openExceptionWarnings: 1,
			exceptionSummary: "GPS accuracy",
		});
		const result = calculateProjectedPay(input);

		expect(result.confidence).toBe("low");
		expect(result.confidenceLabel).toBe("Needs review");
		expect(
			result.confidenceReasons.some((r) => r.includes("need review"))
		).toBe(true);
		expect(
			result.warnings.some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW")
		).toBe(true);
	});

	test("unprocessed punches → needs review + reason + excluded disclaimer", () => {
		const input = withAttendance(monthlySalariedNormal, {
			unprocessedPunches: 2,
		});
		const result = calculateProjectedPay(input);

		expect(result.confidenceLabel).toBe("Needs review");
		expect(
			result.confidenceReasons.some((r) => r.includes("not yet processed"))
		).toBe(true);
		expect(
			result.warnings.some((w) => w.code === "UNPROCESSED_PUNCHES_FOR_PERIOD")
		).toBe(true);
		expect(
			result.disclaimers.some((d) => d.includes("not yet processed"))
		).toBe(true);
	});

	test("open blocker exception → cannot finalize yet", () => {
		const input = withAttendance(monthlySalariedNormal, {
			openExceptionBlockers: 1,
			exceptionSummary: "missing clock-out",
		});
		const result = calculateProjectedPay(input);

		expect(result.confidence).toBe("cannot_estimate");
		expect(result.confidenceLabel).toBe("Cannot finalize yet");
		expect(
			result.blockers.some((b) => b.code === "UNRESOLVED_ATTENDANCE_EXCEPTION")
		).toBe(true);
	});

	test("blocker policy OFF downgrades exception to review confidence", () => {
		const input: PayrollInput = {
			...withAttendance(monthlySalariedNormal, { openExceptionBlockers: 1 }),
			flags: { blockPayrollOnOpenExceptions: false },
		};
		const result = calculateProjectedPay(input);

		// No hard blocker → not cannot_estimate; downgraded to a review warning.
		expect(result.confidence).not.toBe("cannot_estimate");
		expect(
			result.warnings.some((w) => w.code === "ATTENDANCE_EXCEPTION_REVIEW")
		).toBe(true);
	});

	test("missing contract → cannot finalize yet", () => {
		const result = calculateProjectedPay(missingContract);

		expect(result.confidenceLabel).toBe("Cannot finalize yet");
		expect(result.blockers.some((b) => b.code === "NO_CONTRACT")).toBe(true);
	});
});
