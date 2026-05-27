import { calculatePayroll } from "./calculate";
import type { Confidence, PayrollInput, ProjectedPayResult } from "./types";

export const calculateProjectedPay = (
	input: PayrollInput
): ProjectedPayResult => {
	const result = calculatePayroll(input);

	const confidence = deriveConfidence(input, result.blockers.length > 0);
	const confidenceReason = buildConfidenceReason(input, confidence);

	const loanDeductions = input.loans.dueInstallments.reduce(
		(sum, inst) => sum + Math.round(inst.amount * 100),
		0
	);

	return {
		employeeId: input.employee.id,
		periodStart: input.period.startDate,
		periodEnd: input.period.endDate,
		isEstimate: true,
		confidence,
		confidenceReason,

		estimatedGross: result.grossPay,
		estimatedDeductions: result.totalDeductions,
		estimatedNet: result.netPay,

		breakdown: {
			basePay: result.basePay,
			overtimePay: result.overtimePay,
			allowances: result.taxableAllowances + result.nonTaxableAllowances,
			deductions: result.totalDeductions - result.paye - loanDeductions,
			tax: result.paye,
			loanDeductions,
		},

		disclaimers: buildDisclaimers(input, confidence),
	};
};

const deriveConfidence = (
	input: PayrollInput,
	hasBlockers: boolean
): Confidence => {
	if (hasBlockers) {
		return "cannot_estimate";
	}
	if (input.attendance.pendingItems > 0 || input.leave.pendingLeaveDays > 0) {
		return "low";
	}
	if (!input.attendance.isComplete) {
		return "medium";
	}
	return "high";
};

const buildConfidenceReason = (
	input: PayrollInput,
	confidence: Confidence
): string => {
	if (confidence === "cannot_estimate") {
		return "Cannot estimate — critical data is missing.";
	}
	if (confidence === "low") {
		const reasons: string[] = [];
		if (input.attendance.pendingItems > 0) {
			reasons.push(
				`${input.attendance.pendingItems} unvalidated attendance record(s)`
			);
		}
		if (input.leave.pendingLeaveDays > 0) {
			reasons.push(`${input.leave.pendingLeaveDays} pending leave day(s)`);
		}
		return `Low confidence — ${reasons.join(", ")}.`;
	}
	if (confidence === "medium") {
		return "Based on approved hours only — attendance period incomplete.";
	}
	return "Based on approved and validated records.";
};

const buildDisclaimers = (
	input: PayrollInput,
	confidence: Confidence
): string[] => {
	const disclaimers = ["This is not your final payslip."];

	if (confidence !== "high") {
		disclaimers.push(
			"Based on approved hours only — final amounts may differ."
		);
	}
	if (input.attendance.pendingItems > 0) {
		disclaimers.push("Some attendance records are not yet validated.");
	}
	if (input.leave.pendingLeaveDays > 0) {
		disclaimers.push("Pending leave requests are excluded from this estimate.");
	}

	return disclaimers;
};
