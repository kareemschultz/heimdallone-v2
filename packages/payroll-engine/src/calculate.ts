import {
	detectBlockers,
	detectPostCalcBlockers,
	detectPostCalcWarnings,
	detectWarnings,
} from "./blockers";
import { deriveConfidence } from "./confidence";
import { resolveCountryRules } from "./countries/registry";
import { divideCents, toCents } from "./money";
import { prorateProfile } from "./proration";
import type {
	CalculationExplanation,
	CountryPayrollProfileInput,
	CountryRules,
	PayItemInput,
	PayrollInput,
	PayrollPreviewResult,
	PayslipLineItemResult,
} from "./types";

interface CalcContext {
	explanations: CalculationExplanation[];
	input: PayrollInput;
	lineItems: PayslipLineItemResult[];
	// The country profile with period-based statutory amounts (allowance, NIS
	// ceiling, child/OT/insurance caps, tax bands) prorated to the contract's
	// pay frequency. Rates are unchanged. Use this for ALL statutory math.
	periodProfile: CountryPayrollProfileInput;
	rules: CountryRules;
	sortOrder: number;
}

const addLine = (
	ctx: CalcContext,
	line: Omit<PayslipLineItemResult, "sortOrder">
): void => {
	ctx.sortOrder += 10;
	ctx.lineItems.push({ ...line, sortOrder: ctx.sortOrder });
};

const addExplanation = (
	ctx: CalcContext,
	step: number,
	label: string,
	formula: string,
	result: number
): void => {
	ctx.explanations.push({ step, label, formula, result });
};

const resolvePayItemAmount = (
	item: PayItemInput,
	referenceAmounts: { basic: number; gross: number }
): number => {
	if (item.overrideAmount !== null) {
		return toCents(item.overrideAmount);
	}
	if (item.isFixed && item.fixedAmount !== null) {
		return toCents(item.fixedAmount);
	}
	if (item.rate !== null && item.basedOn !== null) {
		const base =
			item.basedOn === "gross"
				? referenceAmounts.gross
				: referenceAmounts.basic;
		let amount = Math.round(base * item.rate);
		if (item.maxAmount !== null) {
			amount = Math.min(amount, toCents(item.maxAmount));
		}
		return amount;
	}
	return 0;
};

const computeBasePay = (ctx: CalcContext): number => {
	const { contract, attendance, period, settings } = ctx.input;
	const baseSalary = toCents(contract.baseSalary);

	if (contract.wageType === "monthly") {
		addExplanation(
			ctx,
			4,
			"Base pay (monthly)",
			"contract.baseSalary",
			baseSalary
		);
		return baseSalary;
	}
	if (contract.wageType === "daily") {
		const daysWorked = attendance.daysPresent + attendance.daysHalfDay * 0.5;
		const dailyRate = divideCents(baseSalary, period.workingDays);
		const pay = Math.round(dailyRate * daysWorked);
		addExplanation(
			ctx,
			4,
			"Base pay (daily)",
			`${dailyRate} × ${daysWorked} days`,
			pay
		);
		return pay;
	}
	const hourlyRate = divideCents(
		baseSalary,
		Math.round(period.workingDays * settings.standardHoursPerDay * 100) / 100
	);
	const workedHours = attendance.totalWorkedMinutes / 60;
	const pay = Math.round(hourlyRate * workedHours);
	addExplanation(
		ctx,
		4,
		"Base pay (hourly)",
		`${hourlyRate} × ${workedHours.toFixed(2)}h`,
		pay
	);
	return pay;
};

const computeUnpaidLeave = (
	ctx: CalcContext,
	basePay: number
): { adjustedBasePay: number; deduction: number } => {
	const { contract, leave, period } = ctx.input;
	const baseSalary = toCents(contract.baseSalary);

	if (leave.unpaidLeaveDays <= 0 || !contract.deductLeaveFromBasicPay) {
		return { adjustedBasePay: basePay, deduction: 0 };
	}

	const dailyRate = divideCents(baseSalary, period.workingDays);
	const deduction = Math.round(dailyRate * leave.unpaidLeaveDays);
	addExplanation(
		ctx,
		5,
		"Unpaid leave deduction",
		`${dailyRate} × ${leave.unpaidLeaveDays} days`,
		deduction
	);
	addLine(ctx, {
		payItemId: null,
		code: "UNPAID_LEAVE",
		type: "deduction",
		category: "Leave Deduction",
		title: "Unpaid Leave Deduction",
		amount: -deduction,
		isTaxable: false,
		isEmployerContribution: false,
		explanation: `${leave.unpaidLeaveDays} unpaid leave day(s)`,
	});
	return { adjustedBasePay: basePay - deduction, deduction };
};

const computeOvertime = (
	ctx: CalcContext
): { total: number; taxable: number; nonTaxable: number } => {
	const { attendance, settings, period, contract } = ctx.input;
	const baseSalary = toCents(contract.baseSalary);
	const hourlyRateForOT = divideCents(
		baseSalary,
		Math.round(period.workingDays * settings.standardHoursPerDay)
	);
	const mults = settings.overtimeMultipliers;
	const ot = attendance.overtimeByDayType;

	const weekdayOT = Math.round(
		(ot.weekday / 60) * hourlyRateForOT * mults.weekday
	);
	const saturdayOT = Math.round(
		(ot.saturday / 60) * hourlyRateForOT * mults.saturday
	);
	const sundayOT = Math.round(
		(ot.sunday / 60) * hourlyRateForOT * mults.sunday
	);
	const holidayOT = Math.round(
		(ot.holiday / 60) * hourlyRateForOT * mults.publicHoliday
	);
	const total = weekdayOT + saturdayOT + sundayOT + holidayOT;

	const split = ctx.rules.splitOvertimeTaxability(total, ctx.periodProfile);
	addExplanation(
		ctx,
		6,
		"Overtime pay",
		`weekday=${weekdayOT} sat=${saturdayOT} sun=${sundayOT} hol=${holidayOT}`,
		total
	);

	if (split.nonTaxable > 0) {
		addLine(ctx, {
			payItemId: null,
			code: "OT_NON_TAXABLE",
			type: "earning",
			category: "Overtime",
			title: "Overtime (Non-Taxable)",
			amount: split.nonTaxable,
			isTaxable: false,
			isEmployerContribution: false,
			explanation: "OT up to statutory cap",
		});
	}
	if (split.taxable > 0) {
		addLine(ctx, {
			payItemId: null,
			code: "OT_TAXABLE",
			type: "earning",
			category: "Overtime",
			title: "Overtime (Taxable)",
			amount: split.taxable,
			isTaxable: true,
			isEmployerContribution: false,
			explanation: "OT exceeding statutory cap",
		});
	}
	return { total, taxable: split.taxable, nonTaxable: split.nonTaxable };
};

const computeAllowances = (
	ctx: CalcContext,
	basePay: number
): { taxable: number; nonTaxable: number } => {
	let taxable = 0;
	let nonTaxable = 0;
	const refAmounts = { basic: basePay, gross: 0 };

	for (const item of ctx.input.payItems.allowances) {
		const amount = resolvePayItemAmount(item, refAmounts);
		if (amount <= 0) {
			continue;
		}
		if (item.isTaxable) {
			taxable += amount;
		} else {
			nonTaxable += amount;
		}
		addLine(ctx, {
			payItemId: item.payItemId,
			code: `ALLOWANCE_${item.payItemId}`,
			type: "earning",
			category: "Allowance",
			title: item.title,
			amount,
			isTaxable: item.isTaxable,
			isEmployerContribution: false,
			explanation: item.isFixed
				? `Fixed: ${amount}`
				: `${(item.rate ?? 0) * 100}% of ${item.basedOn ?? "basic"}`,
		});
	}
	addExplanation(
		ctx,
		7,
		"Taxable allowances",
		"sum of taxable pay items",
		taxable
	);
	addExplanation(
		ctx,
		8,
		"Non-taxable allowances",
		"sum of non-taxable pay items",
		nonTaxable
	);
	return { taxable, nonTaxable };
};

const computePreTaxDeductions = (
	ctx: CalcContext,
	grossPay: number,
	basePay: number
): { preTax: number; employerContrib: number } => {
	const { input, rules } = ctx;
	const refAmounts = { basic: basePay, gross: grossPay };
	let preTax = 0;
	let employerContrib = 0;

	const nis = rules.computeNIS(grossPay, ctx.periodProfile);
	preTax += nis.employee;
	employerContrib += nis.employer;

	addLine(ctx, {
		payItemId: null,
		code: "NIS_EMPLOYEE",
		type: "deduction",
		category: "Statutory",
		title: "NIS (Employee)",
		amount: -nis.employee,
		isTaxable: false,
		isEmployerContribution: false,
		explanation: `${input.countryProfile.employeeNISRate * 100}% of gross (capped at ceiling)`,
	});
	addLine(ctx, {
		payItemId: null,
		code: "NIS_EMPLOYER",
		type: "employer_contribution",
		category: "Statutory",
		title: "NIS (Employer)",
		amount: nis.employer,
		isTaxable: false,
		isEmployerContribution: true,
		explanation: `${input.countryProfile.employerNISRate * 100}% of gross (capped at ceiling)`,
	});

	for (const item of input.payItems.deductions) {
		if (!item.isPreTax || item.isTax) {
			continue;
		}
		let amount = resolvePayItemAmount(item, refAmounts);
		if (amount <= 0) {
			continue;
		}

		if (item.title.toLowerCase().includes("insurance")) {
			amount = rules.computeInsuranceCap(amount, grossPay, ctx.periodProfile);
		}
		preTax += amount;
		addLine(ctx, {
			payItemId: item.payItemId,
			code: `DEDUCTION_${item.payItemId}`,
			type: "deduction",
			category: "Pre-Tax Deduction",
			title: item.title,
			amount: -amount,
			isTaxable: false,
			isEmployerContribution: false,
			explanation: item.isFixed
				? `Fixed: ${amount}`
				: `${(item.rate ?? 0) * 100}% of ${item.basedOn ?? "basic"}`,
		});

		if (item.employerRate !== null) {
			const employerAmount = Math.round(
				resolvePayItemAmount(
					{ ...item, rate: item.employerRate, overrideAmount: null },
					refAmounts
				)
			);
			if (employerAmount > 0) {
				employerContrib += employerAmount;
				addLine(ctx, {
					payItemId: item.payItemId,
					code: `EMPLOYER_${item.payItemId}`,
					type: "employer_contribution",
					category: "Employer Contribution",
					title: `${item.title} (Employer)`,
					amount: employerAmount,
					isTaxable: false,
					isEmployerContribution: true,
					explanation: `Employer rate: ${item.employerRate * 100}%`,
				});
			}
		}
	}

	addExplanation(
		ctx,
		10,
		"Pre-tax deductions (incl. NIS)",
		"NIS + pre-tax items",
		preTax
	);
	return { preTax, employerContrib };
};

const computeTaxAndPostTax = (
	ctx: CalcContext,
	grossPay: number,
	preTaxDeductions: number,
	nonTaxableAllowances: number,
	nonTaxableOT: number,
	basePay: number
): {
	paye: number;
	taxableGross: number;
	postTaxDeductions: number;
	loanDeductions: number;
	reimbursementTotal: number;
} => {
	const { input, rules } = ctx;
	const refAmounts = { basic: basePay, gross: grossPay };

	const personalAllowance = rules.computePersonalAllowance(
		grossPay,
		ctx.periodProfile
	);
	const childAllowance = rules.computeChildAllowance(
		input.employee.dependentChildren,
		ctx.periodProfile
	);
	addExplanation(
		ctx,
		11,
		"Personal allowance",
		"max(threshold, gross/3)",
		personalAllowance
	);
	addExplanation(
		ctx,
		12,
		"Child allowance",
		`${ctx.periodProfile.childAllowancePerChild} × ${input.employee.dependentChildren} children`,
		childAllowance
	);

	const taxableGross = Math.max(
		0,
		grossPay -
			preTaxDeductions -
			personalAllowance -
			childAllowance -
			nonTaxableAllowances -
			nonTaxableOT
	);
	addExplanation(
		ctx,
		13,
		"Taxable gross",
		"gross - preTax - personalAllow - childAllow - nonTaxable",
		taxableGross
	);

	const paye = rules.computePAYE(taxableGross, ctx.periodProfile);
	addExplanation(
		ctx,
		14,
		"PAYE",
		"tax brackets applied to taxable gross",
		paye
	);
	addLine(ctx, {
		payItemId: null,
		code: "PAYE",
		type: "tax",
		category: "Tax",
		title: "PAYE Income Tax",
		amount: -paye,
		isTaxable: false,
		isEmployerContribution: false,
		explanation: `Computed from taxable gross of ${taxableGross}`,
	});

	let postTaxDeductions = 0;
	for (const item of input.payItems.deductions) {
		if (item.isPreTax || item.isTax) {
			continue;
		}
		const amount = resolvePayItemAmount(item, refAmounts);
		if (amount <= 0) {
			continue;
		}
		postTaxDeductions += amount;
		addLine(ctx, {
			payItemId: item.payItemId,
			code: `DEDUCTION_${item.payItemId}`,
			type: "deduction",
			category: "Post-Tax Deduction",
			title: item.title,
			amount: -amount,
			isTaxable: false,
			isEmployerContribution: false,
			explanation: item.isFixed
				? `Fixed: ${amount}`
				: `${(item.rate ?? 0) * 100}% of ${item.basedOn ?? "basic"}`,
		});
	}
	addExplanation(
		ctx,
		15,
		"Post-tax deductions",
		"union dues, savings, etc.",
		postTaxDeductions
	);

	let loanDeductions = 0;
	for (const inst of input.loans.dueInstallments) {
		const amount = toCents(inst.amount);
		loanDeductions += amount;
		addLine(ctx, {
			payItemId: null,
			code: `LOAN_${inst.loanId}`,
			type: "deduction",
			category: "Loan",
			title: `${inst.loanTitle} (${inst.sequenceNumber}/${inst.totalInstallments})`,
			amount: -amount,
			isTaxable: false,
			isEmployerContribution: false,
			explanation: `Installment ${inst.sequenceNumber} of ${inst.totalInstallments}`,
		});
	}
	addExplanation(
		ctx,
		16,
		"Loan installments",
		"sum of due installments",
		loanDeductions
	);

	let reimbursementTotal = 0;
	for (const r of input.reimbursements.approved) {
		const amount = toCents(r.amount);
		reimbursementTotal += amount;
		addLine(ctx, {
			payItemId: null,
			code: `REIMBURSE_${r.id}`,
			type: "earning",
			category: "Reimbursement",
			title: r.title,
			amount,
			isTaxable: false,
			isEmployerContribution: false,
			explanation: "Approved reimbursement",
		});
	}
	addExplanation(
		ctx,
		17,
		"Reimbursements",
		"sum of approved claims",
		reimbursementTotal
	);

	return {
		paye,
		taxableGross,
		postTaxDeductions,
		loanDeductions,
		reimbursementTotal,
	};
};

export const calculatePayroll = (input: PayrollInput): PayrollPreviewResult => {
	const preBlockers = detectBlockers(input);
	const preWarnings = detectWarnings(input);

	const { countryCode, effectiveYear } = input.countryProfile;
	const rules = resolveCountryRules(countryCode, effectiveYear);
	if (!rules) {
		preBlockers.push({
			code: "MISSING_COUNTRY_PROFILE",
			severity: "blocker",
			message: `Payroll rules for ${countryCode} ${effectiveYear} are not implemented yet.`,
			resolution: "Contact support or select a supported country/year.",
			resolutionLink: "/app/payroll/settings",
		});
	}

	const hasCriticalBlocker = preBlockers.some(
		(b) =>
			b.code === "NO_CONTRACT" ||
			b.code === "MISSING_SALARY" ||
			b.code === "MISSING_COUNTRY_PROFILE"
	);
	if (hasCriticalBlocker) {
		return emptyResult(input, preBlockers, preWarnings);
	}

	const ctx: CalcContext = {
		input,
		rules: rules as CountryRules,
		lineItems: [],
		explanations: [],
		sortOrder: 0,
		periodProfile: prorateProfile(
			input.countryProfile,
			input.contract?.payFrequency ?? "monthly"
		),
	};

	const rawBasePay = computeBasePay(ctx);
	addLine(ctx, {
		payItemId: null,
		code: "BASE_PAY",
		type: "earning",
		category: "Base Pay",
		title: "Base Pay",
		amount: rawBasePay,
		isTaxable: true,
		isEmployerContribution: false,
		explanation: "Base salary for the period",
	});

	// Phase 8J.3 fix #3: unpaid leave was being subtracted TWICE — once by
	// reducing basePay before grossPay, and again as a line item in
	// totalDeductions. Fix: gross uses the FULL rawBasePay; the unpaid-leave
	// deduction appears once in totalDeductions and as a visible payslip line.
	// Allowances that scale on base (e.g. % of basic) still scale against
	// the adjusted basePay so they aren't paid for unworked days.
	const { adjustedBasePay: basePay, deduction: unpaidLeaveDeduction } =
		computeUnpaidLeave(ctx, rawBasePay);
	const ot = computeOvertime(ctx);
	const allowances = computeAllowances(ctx, basePay);

	const grossPay =
		rawBasePay + ot.total + allowances.taxable + allowances.nonTaxable;
	addExplanation(ctx, 9, "Gross pay", "rawBasePay + OT + allowances", grossPay);

	const { preTax, employerContrib } = computePreTaxDeductions(
		ctx,
		grossPay,
		basePay
	);
	const {
		paye,
		taxableGross,
		postTaxDeductions,
		loanDeductions,
		reimbursementTotal,
	} = computeTaxAndPostTax(
		ctx,
		grossPay,
		preTax,
		allowances.nonTaxable,
		ot.nonTaxable,
		basePay
	);

	const totalDeductions =
		preTax + paye + postTaxDeductions + loanDeductions + unpaidLeaveDeduction;
	const netPay = grossPay - totalDeductions + reimbursementTotal;
	addExplanation(
		ctx,
		18,
		"Net pay",
		"gross - deductions + reimbursements",
		netPay
	);

	const postBlockers = detectPostCalcBlockers(
		netPay,
		input,
		grossPay,
		totalDeductions
	);
	const postWarnings = detectPostCalcWarnings(netPay, input, loanDeductions);
	const allBlockers = [...preBlockers, ...postBlockers];
	const allWarnings = [...preWarnings, ...postWarnings];
	const nis = ctx.rules.computeNIS(grossPay, ctx.periodProfile);

	return {
		employeeId: input.employee.id,
		employeeName: `${input.employee.firstName} ${input.employee.lastName}`,
		isPayrollReady: allBlockers.length === 0,
		basePay,
		overtimePay: ot.total,
		taxableAllowances: allowances.taxable,
		nonTaxableAllowances: allowances.nonTaxable,
		grossPay,
		taxableGross,
		employeeNis: nis.employee,
		employerNis: nis.employer,
		paye,
		totalDeductions,
		reimbursements: reimbursementTotal,
		netPay,
		totalEmployerContributions: employerContrib,
		lineItems: ctx.lineItems,
		blockers: allBlockers,
		warnings: allWarnings,
		explanation: ctx.explanations,
		confidence: deriveConfidence(input, allBlockers.length),
		isEstimate: true,
		currency: input.contract.salaryCurrency,
		period: {
			startDate: input.period.startDate,
			endDate: input.period.endDate,
		},
	};
};

const emptyResult = (
	input: PayrollInput,
	blockers: PayrollPreviewResult["blockers"],
	warnings: PayrollPreviewResult["warnings"]
): PayrollPreviewResult => ({
	employeeId: input.employee.id,
	employeeName: `${input.employee.firstName} ${input.employee.lastName}`,
	isPayrollReady: false,
	basePay: 0,
	overtimePay: 0,
	taxableAllowances: 0,
	nonTaxableAllowances: 0,
	grossPay: 0,
	taxableGross: 0,
	employeeNis: 0,
	employerNis: 0,
	paye: 0,
	totalDeductions: 0,
	reimbursements: 0,
	netPay: 0,
	totalEmployerContributions: 0,
	lineItems: [],
	blockers,
	warnings,
	explanation: [],
	confidence: "cannot_estimate",
	isEstimate: true,
	currency: input.contract.salaryCurrency,
	period: { startDate: input.period.startDate, endDate: input.period.endDate },
});
