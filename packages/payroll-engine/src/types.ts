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
	// Phase 21J: the effective work-schedule rule resolved for this employee's
	// shift + pay date (split shift / night-diff / OT thresholds / per-shift
	// multipliers). OPTIONAL and carried as the clean READ seam — schedule rules
	// already influence pay via the attendance record's worked/payable/overtime
	// minutes; this surfaces the pay-policy itself for engine consumption without
	// changing any current calculation (absent = today's behaviour).
	scheduleRule?: ScheduleRuleInput;
	settings: PayrollSettingInput;
}

/** Effective work-schedule pay policy for a (shift, pay date). All optional. */
export interface ScheduleRuleInput {
	capDailyPaidMinutes: number | null;
	hasNightDifferential: boolean;
	isSplitShift: boolean;
	nightDiffMultiplier: number;
	overtimeThresholdDailyMinutes: number | null;
	overtimeThresholdWeeklyMinutes: number | null;
	publicHolidayMultiplier: number;
	ruleId: string | null;
	saturdayMultiplier: number;
	source: string;
	standardDailyMinutes: number | null;
	standardWeeklyMinutes: number | null;
	sundayMultiplier: number;
	weekdayOvertimeMultiplier: number;
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
	// Biometric/geofence/attendance review state for the period (Phase 11G CP2).
	// Optional so existing callers/tests are unaffected; absent = none.
	exceptionSummary?: string;
	isComplete: boolean;
	openExceptionBlockers?: number;
	openExceptionWarnings?: number;
	overtimeByDayType: OvertimeByDayType;
	pendingItems: number;
	totalApprovedOvertimeMinutes: number;
	// Sum of per-day payable (scheduled-capped) minutes. Used as the hourly base
	// when overtimeHandling = "none" (cap at shift). Optional so existing
	// callers/fixtures are unaffected; falls back to totalWorkedMinutes.
	totalPayableMinutes?: number;
	totalWorkedMinutes: number;
	unprocessedPunches?: number;
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
	countryCode: string;
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

// Tenant overtime/hours policy (default "premium" = unchanged behavior).
export type OvertimeHandling = "premium" | "straight_time" | "none";

export interface PayrollSettingInput {
	lunchDeductionMinutes: number;
	minimumNetPayThreshold: number | null;
	// Tenant overtime/hours policy. Defaults to "premium" when omitted so
	// existing callers and fixtures are byte-identical.
	overtimeHandling?: OvertimeHandling;
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
	// When true, open blocker-severity attendance exceptions block the run;
	// when false they downgrade to a prominent warning (Phase 11G CP2).
	blockPayrollOnOpenExceptions?: boolean;
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
	| "LOAN_EXCEEDS_THRESHOLD"
	| "ATTENDANCE_EXCEPTION_REVIEW"
	| "UNPROCESSED_PUNCHES_FOR_PERIOD";

export interface CalculationExplanation {
	formula: string;
	label: string;
	result: number;
	step: number;
}

export type Confidence = "high" | "medium" | "low" | "cannot_estimate";

// Plain-language confidence labels surfaced to employees + payroll admins
// (Phase 11G CP3). Maps from the 4-value internal Confidence enum.
export type ConfidenceLabel =
	| "High confidence"
	| "Needs review"
	| "Cannot finalize yet";

// ── Projected pay ───────────────────────────────────────────

export interface ProjectedPayResult {
	attendanceComplete: boolean;
	blockers: PayrollBlocker[];
	breakdown: {
		basePay: number;
		overtimePay: number;
		allowances: number;
		deductions: number;
		tax: number;
		loanDeductions: number;
	};
	confidence: Confidence;
	confidenceLabel: ConfidenceLabel;
	// Single combined reason string (back-compat); confidenceReasons is the
	// structured list the UI renders.
	confidenceReason: string;
	confidenceReasons: string[];
	days: {
		workedDays: number;
		absentDays: number;
		approvedLeaveDays: number;
		unpaidLeaveDays: number;
	};

	disclaimers: string[];
	employeeId: string;
	estimatedDeductions: number;

	estimatedGross: number;
	estimatedNet: number;

	// Hours/days summary the estimate was derived from. Hours are decimal hours.
	hours: {
		regularHours: number;
		overtimeHours: number;
	};
	isEstimate: true;
	payFrequency: string;

	// Pay-type context (Phase 11G CP3).
	payType: WageType;
	periodEnd: string;
	periodStart: string;

	// Issue summary propagated from the calculation so callers don't recompute.
	warnings: PayrollWarning[];
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
