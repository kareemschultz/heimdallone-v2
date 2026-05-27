import type {
	CountryPayrollProfileInput,
	PayrollInput,
	PayrollSettingInput,
} from "../types";

const GY_PROFILE: CountryPayrollProfileInput = {
	countryCode: "GY",
	taxBrackets: [
		{ min: 0, max: 28_000_000, rate: 0.25, fixedAmount: 0 },
		{ min: 28_000_000, max: null, rate: 0.35, fixedAmount: 0 },
	],
	personalAllowanceFormula: "max(threshold, gross/3)",
	personalAllowanceThreshold: 14_000_000,
	childAllowancePerChild: 1_000_000,
	overtimeAllowanceCap: 5_000_000,
	insurancePremiumCapAmount: 5_000_000,
	employeeNISRate: 0.056,
	employerNISRate: 0.084,
	nisMaxEarnings: 28_000_000,
	effectiveYear: 2026,
};

const DEFAULT_SETTINGS: PayrollSettingInput = {
	overtimeMultipliers: {
		weekday: 1.5,
		saturday: 1.5,
		sunday: 2.0,
		publicHoliday: 2.0,
		nightShift: 1.0,
	},
	standardHoursPerDay: 8,
	lunchDeductionMinutes: 60,
	minimumNetPayThreshold: null,
};

const baseEmployee = {
	id: "emp-001",
	organizationId: "org-001",
	firstName: "Maya",
	lastName: "Persaud",
	employeeCode: "EMP001",
	departmentId: "dept-001",
	departmentName: "Operations",
	dependentChildren: 0,
};

const baseContract = {
	id: "contract-001",
	baseSalary: 350_000,
	wageType: "monthly" as const,
	payFrequency: "monthly",
	salaryCurrency: "GYD",
	filingStatusId: "fs-001",
	deductLeaveFromBasicPay: true,
};

const basePeriod = {
	startDate: "2026-05-01",
	endDate: "2026-05-31",
	workingDays: 22,
	expectedHours: 176,
};

const baseAttendance = {
	totalWorkedMinutes: 10_560,
	totalApprovedOvertimeMinutes: 0,
	overtimeByDayType: { weekday: 0, saturday: 0, sunday: 0, holiday: 0 },
	daysPresent: 22,
	daysHalfDay: 0,
	daysAbsent: 0,
	daysHoliday: 0,
	pendingItems: 0,
	isComplete: true,
};

const noLeave = { paidLeaveDays: 0, unpaidLeaveDays: 0, pendingLeaveDays: 0 };
const noHolidays = { count: 0, dates: [] as string[] };
const noPayItems = {
	allowances: [] as PayrollInput["payItems"]["allowances"],
	deductions: [] as PayrollInput["payItems"]["deductions"],
};
const noLoans = {
	dueInstallments: [] as PayrollInput["loans"]["dueInstallments"],
};
const noReimbursements = {
	approved: [] as PayrollInput["reimbursements"]["approved"],
};

export const monthlySalariedNormal: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const hourlyWithOvertime: PayrollInput = {
	employee: {
		...baseEmployee,
		id: "emp-002",
		firstName: "Raj",
		lastName: "Singh",
		employeeCode: "EMP002",
	},
	contract: {
		...baseContract,
		id: "contract-002",
		baseSalary: 2000,
		wageType: "hourly",
	},
	period: basePeriod,
	attendance: {
		...baseAttendance,
		totalWorkedMinutes: 10_560,
		totalApprovedOvertimeMinutes: 720,
		overtimeByDayType: { weekday: 480, saturday: 240, sunday: 0, holiday: 0 },
	},
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withUnpaidLeave: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: { ...baseAttendance, daysPresent: 19, daysAbsent: 3 },
	leave: { paidLeaveDays: 0, unpaidLeaveDays: 3, pendingLeaveDays: 0 },
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withTaxableAllowance: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: {
		allowances: [
			{
				payItemId: "pi-transport",
				title: "Transport Allowance",
				isFixed: true,
				fixedAmount: 15_000,
				basedOn: null,
				rate: null,
				isTaxable: true,
				isPreTax: false,
				isTax: false,
				isStatutory: false,
				employerRate: null,
				maxAmount: null,
				overrideAmount: null,
			},
		],
		deductions: [],
	},
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withNonTaxableAllowance: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: {
		allowances: [
			{
				payItemId: "pi-meal",
				title: "Meal Allowance",
				isFixed: true,
				fixedAmount: 10_000,
				basedOn: null,
				rate: null,
				isTaxable: false,
				isPreTax: false,
				isTax: false,
				isStatutory: false,
				employerRate: null,
				maxAmount: null,
				overrideAmount: null,
			},
		],
		deductions: [],
	},
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withInsuranceCap: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: {
		allowances: [],
		deductions: [
			{
				payItemId: "pi-insurance",
				title: "Health Insurance",
				isFixed: true,
				fixedAmount: 80_000,
				basedOn: null,
				rate: null,
				isTaxable: false,
				isPreTax: true,
				isTax: false,
				isStatutory: false,
				employerRate: null,
				maxAmount: null,
				overrideAmount: null,
			},
		],
	},
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withChildAllowance: PayrollInput = {
	employee: { ...baseEmployee, dependentChildren: 2 },
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withLoanDeduction: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: {
		dueInstallments: [
			{
				loanId: "loan-001",
				installmentId: "inst-001",
				loanTitle: "Emergency Loan",
				amount: 8334,
				sequenceNumber: 2,
				totalInstallments: 12,
			},
		],
	},
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const withReimbursement: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: {
		approved: [{ id: "reimb-001", title: "Office Supplies", amount: 5000 }],
	},
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const missingContract: PayrollInput = {
	employee: baseEmployee,
	contract: { ...baseContract, id: "" },
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const pendingOvertimeWarning: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: { ...baseAttendance, pendingItems: 3 },
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const negativeNetPay: PayrollInput = {
	employee: baseEmployee,
	contract: { ...baseContract, baseSalary: 50_000 },
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: {
		dueInstallments: [
			{
				loanId: "loan-big",
				installmentId: "inst-big",
				loanTitle: "Large Loan",
				amount: 100_000,
				sequenceNumber: 1,
				totalInstallments: 6,
			},
		],
	},
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const highSalaryPAYE: PayrollInput = {
	employee: {
		...baseEmployee,
		id: "emp-high",
		firstName: "Director",
		lastName: "Singh",
	},
	contract: { ...baseContract, baseSalary: 500_000 },
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const atNISCeiling: PayrollInput = {
	employee: {
		...baseEmployee,
		id: "emp-ceil",
		firstName: "Senior",
		lastName: "Manager",
	},
	contract: { ...baseContract, baseSalary: 400_000 },
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: GY_PROFILE,
	settings: DEFAULT_SETTINGS,
};

export const unsupportedCountry: PayrollInput = {
	employee: baseEmployee,
	contract: baseContract,
	period: basePeriod,
	attendance: baseAttendance,
	leave: noLeave,
	holidays: noHolidays,
	payItems: noPayItems,
	loans: noLoans,
	reimbursements: noReimbursements,
	countryProfile: { ...GY_PROFILE, countryCode: "BB", effectiveYear: 2026 },
	settings: DEFAULT_SETTINGS,
};
