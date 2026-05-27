// ── Input types ─────────────────────────────────────────────

export interface PayrollInput {
	attendance: AttendanceInput;
	contract: ContractInput;
	countryProfile: CountryPayrollProfileInput;
	employee: EmployeeInput;
	flags?: PayrollFlags;
	holidays: HolidayInput;
	leave: LeaveInput;
	loans: LoansInput;
	payItems: PayItemsInput;
	period: PeriodInput;
	reimbursements: ReimbursementsInput;
	settings: PayrollSettingInput;
}

export interface EmployeeInput {
	departmentId: string | null;
	departmentName: string | null;
	dependentChildren: number;
	employeeCode: string;
	firstName: string;
	id: string;
	lastName: string;
	organizationId: string;
}

export interface ContractInput {
	baseSalary: number;
	deductLeaveFromBasicPay: boolean;
	filingStatusId: string | null;
	id: string;
	payFrequency: string;
	salaryCurrency: string;
	wageType: WageType;
}

export type WageType = "hourly" | "daily" | "monthly";

export interface PeriodInput {
	endDate: string;
	expectedHours: number;
	startDate: string;
	workingDays: number;
}

export interface AttendanceInput {
	daysAbsent: number;
	daysHalfDay: number;
	daysHoliday: number;
	daysPresent: number;
	isComplete: boolean;
	overtimeByDayType: OvertimeByDayType;
	pendingItems: number;
	totalApprovedOvertimeMinutes: number;
	totalWorkedMinutes: number;
}

export interface OvertimeByDayType {
	holiday: number;
	saturday: number;
	sunday: number;
	weekday: number;
}

export interface LeaveInput {
	paidLeaveDays: number;
	pendingLeaveDays: number;
	unpaidLeaveDays: number;
}

export interface HolidayInput {
	count: number;
	dates: string[];
}

export interface PayItemsInput {
	allowances: PayItemInput[];
	deductions: PayItemInput[];
}

export interface PayItemInput {
	basedOn: string | null;
	employerRate: number | null;
	fixedAmount: number | null;
	isFixed: boolean;
	isPreTax: boolean;
	isStatutory: boolean;
	isTax: boolean;
	isTaxable: boolean;
	maxAmount: number | null;
	overrideAmount: number | null;
	payItemId: string;
	rate: number | null;
	title: string;
}

export interface LoanInstallmentInput {
	amount: number;
	installmentId: string;
	loanId: string;
	loanTitle: string;
	sequenceNumber: number;
	totalInstallments: number;
}

export interface LoansInput {
	dueInstallments: LoanInstallmentInput[];
}

export interface ReimbursementInput {
	amount: number;
	id: string;
	title: string;
}

export interface ReimbursementsInput {
	approved: ReimbursementInput[];
}

export interface TaxBracket {
	fixedAmount: number;
	max: number | null;
	min: number;
	rate: number;
}

export interface CountryPayrollProfileInput {
	childAllowancePerChild: number;
	effectiveYear: number;
	employeeNISRate: number;
	employerNISRate: number;
	insurancePremiumCapAmount: number;
	nisMaxEarnings: number;
	overtimeAllowanceCap: number;
	personalAllowanceFormula: string;
	personalAllowanceThreshold: number;
	taxBrackets: TaxBracket[];
}

export interface PayrollSettingInput {
	lunchDeductionMinutes: number;
	minimumNetPayThreshold: number | null;
	overtimeMultipliers: OvertimeMultipliers;
	standardHoursPerDay: number;
}

export interface OvertimeMultipliers {
	nightShift: number;
	publicHoliday: number;
	saturday: number;
	sunday: number;
	weekday: number;
}

export interface PayrollFlags {
	duplicatePayslipExists?: boolean;
	includePendingLeave?: boolean;
	includeUnvalidatedAttendance?: boolean;
}

// ── Output types ────────────────────────────────────────────

export interface PayrollPreviewResult {
	basePay: number;
	blockers: PayrollBlocker[];

	confidence: Confidence;
	currency: string;
	employeeId: string;
	employeeName: string;
	employeeNis: number;
	employerNis: number;
	explanation: CalculationExplanation[];
	grossPay: number;
	isEstimate: boolean;
	isPayrollReady: boolean;

	lineItems: PayslipLineItemResult[];
	netPay: number;
	nonTaxableAllowances: number;
	overtimePay: number;
	paye: number;
	period: { startDate: string; endDate: string };
	reimbursements: number;
	taxableAllowances: number;
	taxableGross: number;
	totalDeductions: number;
	totalEmployerContributions: number;
	warnings: PayrollWarning[];
}

export interface PayslipLineItemResult {
	amount: number;
	category: string;
	code: string;
	explanation: string;
	isEmployerContribution: boolean;
	isTaxable: boolean;
	payItemId: string | null;
	sortOrder: number;
	title: string;
	type: LineItemType;
}

export type LineItemType =
	| "earning"
	| "deduction"
	| "tax"
	| "employer_contribution";

export interface PayrollBlocker {
	code: BlockerCode;
	message: string;
	resolution: string;
	resolutionLink: string;
	severity: "blocker";
}

export type BlockerCode =
	| "NO_CONTRACT"
	| "MISSING_SALARY"
	| "MISSING_COUNTRY_PROFILE"
	| "MISSING_FILING_STATUS"
	| "NEGATIVE_NET_PAY"
	| "DUPLICATE_PAYSLIP"
	| "UNRESOLVED_ATTENDANCE_EXCEPTION"
	| "MISSING_CLOCK_OUT"
	| "ABSENT_WITHOUT_LEAVE";

export interface PayrollWarning {
	code: WarningCode;
	message: string;
	severity: "warning";
	suggestedAction: string;
}

export type WarningCode =
	| "PENDING_LEAVE"
	| "PENDING_OVERTIME"
	| "UNVALIDATED_ATTENDANCE"
	| "UNUSUAL_VARIANCE"
	| "MISSING_BANK_DETAILS"
	| "NEW_EMPLOYEE_MID_PERIOD"
	| "CONTRACT_CHANGED"
	| "LOW_CONFIDENCE"
	| "LOAN_EXCEEDS_THRESHOLD";

export interface CalculationExplanation {
	formula: string;
	label: string;
	result: number;
	step: number;
}

export type Confidence = "high" | "medium" | "low" | "cannot_estimate";

// ── Projected pay ───────────────────────────────────────────

export interface ProjectedPayResult {
	breakdown: {
		basePay: number;
		overtimePay: number;
		allowances: number;
		deductions: number;
		tax: number;
		loanDeductions: number;
	};
	confidence: Confidence;
	confidenceReason: string;

	disclaimers: string[];
	employeeId: string;
	estimatedDeductions: number;

	estimatedGross: number;
	estimatedNet: number;
	isEstimate: true;
	periodEnd: string;
	periodStart: string;
}

// ── Country rules interface ─────────────────────────────────

export interface CountryRules {
	computeChildAllowance(
		dependentChildren: number,
		profile: CountryPayrollProfileInput
	): number;
	computeInsuranceCap(
		premium: number,
		grossPay: number,
		profile: CountryPayrollProfileInput
	): number;
	computeNIS(
		grossPay: number,
		profile: CountryPayrollProfileInput
	): {
		employee: number;
		employer: number;
	};
	computePAYE(
		taxableGross: number,
		profile: CountryPayrollProfileInput
	): number;
	computePersonalAllowance(
		grossPay: number,
		profile: CountryPayrollProfileInput
	): number;
	countryCode: string;
	effectiveYear: number;
	splitOvertimeTaxability(
		totalOTPay: number,
		profile: CountryPayrollProfileInput
	): { taxable: number; nonTaxable: number };
}
