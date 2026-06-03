import { calculatePayroll } from "./calculate";
import {
	buildConfidenceReasons,
	confidenceLabel,
	deriveConfidence,
} from "./confidence";
import type { Confidence, PayrollInput, ProjectedPayResult } from "./types";

export const calculateProjectedPay = (
	input: PayrollInput
): ProjectedPayResult => {
	const result = calculatePayroll(input);

	const confidence = deriveConfidence(input, result.blockers.length);
	const reasons = buildConfidenceReasons(input, result.blockers.length);
	const confidenceReason = buildCombinedReason(confidence, reasons);

	const loanDeductions = input.loans.dueInstallments.reduce(
		(sum, inst) => sum + Math.round(inst.amount * 100),
		0
	);

	const a = input.attendance;

	return {
		employeeId: input.employee.id,
		periodStart: input.period.startDate,
		periodEnd: input.period.endDate,
		isEstimate: true,
		confidence,
		confidenceLabel: confidenceLabel(confidence),
		confidenceReason,
		confidenceReasons: reasons,

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

		payType: input.contract.wageType,
		payFrequency: input.contract.payFrequency,

		hours: {
			regularHours: round2(a.totalWorkedMinutes / 60),
			overtimeHours: round2(a.totalApprovedOvertimeMinutes / 60),
		},
		days: {
			workedDays: round2(a.daysPresent + a.daysHalfDay * 0.5),
			absentDays: a.daysAbsent,
			approvedLeaveDays: input.leave.paidLeaveDays,
			unpaidLeaveDays: input.leave.unpaidLeaveDays,
		},
		attendanceComplete: a.isComplete,

		warnings: result.warnings,
		blockers: result.blockers,

		disclaimers: buildDisclaimers(input, confidence),
	};
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const buildCombinedReason = (
	confidence: Confidence,
	reasons: string[]
): string => {
	if (confidence === "high") {
		return "Based on approved and validated records.";
	}
	const prefix =
		confidence === "cannot_estimate" ? "Cannot finalize yet" : "Needs review";
	if (reasons.length === 0) {
		return `${prefix}.`;
	}
	return `${prefix} — ${reasons.join(", ")}.`;
};

const buildDisclaimers = (
	input: PayrollInput,
	confidence: Confidence
): string[] => {
	const disclaimers = [
		"This is an estimate, not your final pay. Amounts may change after HR/payroll review and confirmation.",
	];

	if (confidence !== "high") {
		disclaimers.push(
			"Based on approved hours only — final amounts may differ."
		);
	}
	if ((input.attendance.unprocessedPunches ?? 0) > 0) {
		disclaimers.push(
			"Some device punches are not yet processed and are excluded from this estimate."
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
