import type { PayrollBlocker, PayrollInput, PayrollWarning } from "./types";

const fullName = (input: PayrollInput): string =>
	`${input.employee.firstName} ${input.employee.lastName}`;

export const detectBlockers = (input: PayrollInput): PayrollBlocker[] => {
	const blockers: PayrollBlocker[] = [];
	const name = fullName(input);
	const eid = input.employee.id;

	if (!input.contract.id) {
		blockers.push({
			code: "NO_CONTRACT",
			severity: "blocker",
			message: `No active contract found for ${name}.`,
			resolution: "Create a contract to include them in payroll.",
			resolutionLink: `/app/employees/${eid}`,
		});
	}

	if (
		input.contract.id &&
		(!input.contract.baseSalary || input.contract.baseSalary <= 0)
	) {
		blockers.push({
			code: "MISSING_SALARY",
			severity: "blocker",
			message: `${name}'s contract has no salary set.`,
			resolution: "Update the contract with a base salary.",
			resolutionLink: `/app/employees/${eid}`,
		});
	}

	if (!input.countryProfile.taxBrackets.length) {
		blockers.push({
			code: "MISSING_COUNTRY_PROFILE",
			severity: "blocker",
			message: "No country payroll profile configured.",
			resolution: "Set up the country profile in payroll settings.",
			resolutionLink: "/app/payroll/settings",
		});
	}

	if (!input.contract.filingStatusId) {
		blockers.push({
			code: "MISSING_FILING_STATUS",
			severity: "blocker",
			message: `${name}'s contract has no filing status.`,
			resolution: "Assign a filing status to the contract.",
			resolutionLink: `/app/employees/${eid}`,
		});
	}

	if (input.flags?.duplicatePayslipExists) {
		blockers.push({
			code: "DUPLICATE_PAYSLIP",
			severity: "blocker",
			message: `A payslip already exists for ${name} for this period.`,
			resolution: "Edit the existing payslip or delete the draft.",
			resolutionLink: "/app/payroll/payslips",
		});
	}

	if (
		input.attendance.pendingItems > 0 &&
		!input.flags?.includeUnvalidatedAttendance
	) {
		const hasMissingClockOut =
			input.attendance.daysAbsent > 0 && !input.attendance.isComplete;
		if (hasMissingClockOut) {
			blockers.push({
				code: "MISSING_CLOCK_OUT",
				severity: "blocker",
				message: `${name} has incomplete attendance records.`,
				resolution: "Add a manual clock-out or submit a correction.",
				resolutionLink: "/app/attendance",
			});
		}
	}

	return blockers;
};

export const detectWarnings = (input: PayrollInput): PayrollWarning[] => {
	const warnings: PayrollWarning[] = [];
	const name = fullName(input);

	if (input.leave.pendingLeaveDays > 0) {
		warnings.push({
			code: "PENDING_LEAVE",
			severity: "warning",
			message: `${input.leave.pendingLeaveDays} leave day(s) pending for ${name}.`,
			suggestedAction: "Approve or reject before finalizing.",
		});
	}

	if (input.attendance.pendingItems > 0) {
		warnings.push({
			code: "UNVALIDATED_ATTENDANCE",
			severity: "warning",
			message: `${input.attendance.pendingItems} attendance day(s) not validated for ${name}.`,
			suggestedAction: "Hours may change after validation.",
		});
	}

	if (!input.attendance.isComplete && input.contract.wageType !== "monthly") {
		warnings.push({
			code: "LOW_CONFIDENCE",
			severity: "warning",
			message: "Estimate confidence is low — attendance is incomplete.",
			suggestedAction: "Validate attendance and approve leave first.",
		});
	}

	return warnings;
};

export const detectPostCalcBlockers = (
	netPay: number,
	input: PayrollInput,
	grossPay: number,
	totalDeductions: number
): PayrollBlocker[] => {
	const blockers: PayrollBlocker[] = [];
	const name = fullName(input);

	if (netPay < 0) {
		blockers.push({
			code: "NEGATIVE_NET_PAY",
			severity: "blocker",
			message: `${name}'s deductions ($${totalDeductions.toLocaleString()}) exceed gross pay ($${grossPay.toLocaleString()}).`,
			resolution: "Review deductions and loan installments.",
			resolutionLink: "/app/payroll/payslips",
		});
	}

	return blockers;
};

export const detectPostCalcWarnings = (
	netPay: number,
	input: PayrollInput,
	loanDeductions: number
): PayrollWarning[] => {
	const warnings: PayrollWarning[] = [];
	const name = fullName(input);

	const threshold = input.settings.minimumNetPayThreshold;
	if (
		threshold !== null &&
		netPay < threshold &&
		netPay >= 0 &&
		loanDeductions > 0
	) {
		warnings.push({
			code: "LOAN_EXCEEDS_THRESHOLD",
			severity: "warning",
			message: `Loan installments ($${loanDeductions.toLocaleString()}) bring ${name}'s net pay below $${threshold.toLocaleString()}.`,
			suggestedAction: "Review loan terms or adjust threshold.",
		});
	}

	return warnings;
};
