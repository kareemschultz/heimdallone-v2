/**
 * Payroll seed — creates country profile, payroll settings, pay periods,
 * pay items, loans, installments, and reimbursements for Atlas Shipping.
 * Requires seed-hr-core.ts + seed-contracts.ts to have run first.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-payroll.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import {
	contract,
	countryPayrollProfile,
	employeeProfile,
	loan,
	loanInstallment,
	organization,
	payItem,
	payItemAssignment,
	payPeriod,
	payrollSetting,
	reimbursement,
	user,
} from "../packages/db/src/schema";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();

function toDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`);
}

interface OrgData {
	adminUserId: string;
	contracts: Array<{
		id: string;
		employeeId: string;
	}>;
	employees: Array<{
		id: string;
		firstName: string;
		lastName: string;
	}>;
	orgId: string;
}

async function loadOrgData(): Promise<OrgData> {
	const orgs = await db
		.select()
		.from(organization)
		.where(eq(organization.slug, "atlas-shipping"))
		.limit(1);

	const org = orgs.at(0);
	if (!org) {
		console.error("Atlas Shipping org not found. Run seed-dev.ts first.");
		process.exit(1);
	}

	const orgId = org.id;
	console.log(`Org: Atlas Shipping (${orgId})`);

	const emps = await db
		.select({
			id: employeeProfile.id,
			firstName: employeeProfile.firstName,
			lastName: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(eq(employeeProfile.organizationId, orgId));

	const activeContracts = await db
		.select({ id: contract.id, employeeId: contract.employeeId })
		.from(contract)
		.where(eq(contract.organizationId, orgId));

	const users = await db.select({ id: user.id }).from(user).limit(1);

	return {
		orgId,
		employees: emps,
		contracts: activeContracts,
		adminUserId: users.at(0)?.id ?? "",
	};
}

function buildGuyanProfile(orgId: string) {
	return {
		id: createId(),
		organizationId: orgId,
		countryCode: "GY",
		countryName: "Guyana",
		currency: "GYD",
		effectiveYear: 2026,
		taxBrackets: [
			{ min: 0, max: 280_000, rate: 0.25, fixedAmount: 0 },
			{ min: 280_000, max: null, rate: 0.35, fixedAmount: 0 },
		],
		personalAllowanceFormula: "standard",
		personalAllowanceThreshold: "140000.00",
		childAllowancePerChild: "10000.00",
		overtimeAllowanceCap: "50000.00",
		insurancePremiumCapFormula: "min(premium, 10% gross, $50,000)",
		insurancePremiumCapAmount: "50000.00",
		employeeNISRate: "5.60",
		employerNISRate: "8.40",
		nisMaxEarnings: "280000.00",
		otherStatutoryRules: {
			weekdayOT: 1.5,
			sundayOT: 2.0,
			publicHolidayOT: 2.0,
			annualLeaveMinDays: 12,
			maternityWeeks: 13,
		},
		isActive: true,
	};
}

function buildPayrollSetting(orgId: string) {
	return {
		id: createId(),
		organizationId: orgId,
		defaultCurrency: "GYD",
		defaultPayFrequency: "monthly",
		weekdayOvertimeMultiplier: "1.50",
		saturdayMultiplier: "1.50",
		sundayMultiplier: "2.00",
		publicHolidayMultiplier: "2.00",
		nightShiftMultiplier: "1.00",
		workDays: [1, 2, 3, 4, 5],
		standardHoursPerDay: "8.00",
		lunchDeductionMinutes: 60,
		paidHolidaysForHourly: true,
		autoGenerateEnabled: false,
		setupChecklistCompleted: {
			countryProfile: true,
			payrollSettings: true,
			payItems: false,
			contracts: true,
			preferences: false,
			testRun: false,
		},
	};
}

function buildPayPeriods(orgId: string) {
	return [
		{
			id: createId(),
			organizationId: orgId,
			name: "April 2026 Payroll",
			startDate: toDate("2026-04-01"),
			endDate: toDate("2026-04-30"),
			payDate: toDate("2026-04-30"),
			frequency: "monthly",
			workingDays: 22,
			expectedHours: "176.00",
			status: "closed" as const,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "May 2026 Payroll",
			startDate: toDate("2026-05-01"),
			endDate: toDate("2026-05-31"),
			payDate: toDate("2026-05-31"),
			frequency: "monthly",
			workingDays: 21,
			expectedHours: "168.00",
			status: "open" as const,
		},
	];
}

function buildPayItems(orgId: string) {
	const items = [
		{
			id: createId(),
			organizationId: orgId,
			type: "deduction" as const,
			category: "statutory",
			title: "PAYE Income Tax",
			description: "Pay As You Earn — Guyana income tax",
			isFixed: false,
			basedOn: "taxable_gross",
			isTaxable: false,
			isPreTax: false,
			isTax: true,
			isStatutory: true,
			includeAllActive: true,
			sortOrder: 100,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "deduction" as const,
			category: "statutory",
			title: "NIS Employee Contribution",
			description: "National Insurance Scheme — 5.6% of gross (capped)",
			isFixed: false,
			basedOn: "gross_pay",
			rate: "5.60",
			isTaxable: false,
			isPreTax: true,
			isTax: false,
			isStatutory: true,
			hasMaxLimit: true,
			maxAmount: "15680.00",
			includeAllActive: true,
			sortOrder: 90,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "deduction" as const,
			category: "statutory",
			title: "NIS Employer Contribution",
			description: "Employer NIS — 8.4% of gross (capped)",
			isFixed: false,
			basedOn: "gross_pay",
			rate: "8.40",
			employerRate: "8.40",
			isTaxable: false,
			isPreTax: false,
			isTax: false,
			isStatutory: true,
			hasMaxLimit: true,
			maxAmount: "23520.00",
			includeAllActive: true,
			sortOrder: 91,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "allowance" as const,
			category: "standard",
			title: "Transport Allowance",
			description: "Monthly transport subsidy — non-taxable",
			isFixed: true,
			fixedAmount: "15000.00",
			isTaxable: false,
			isPreTax: false,
			isTax: false,
			includeAllActive: true,
			sortOrder: 10,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "allowance" as const,
			category: "standard",
			title: "Meal Allowance",
			description: "Monthly meal subsidy — taxable",
			isFixed: true,
			fixedAmount: "10000.00",
			isTaxable: true,
			isPreTax: false,
			isTax: false,
			includeAllActive: true,
			sortOrder: 11,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "allowance" as const,
			category: "standard",
			title: "Overtime Pay",
			description: "Calculated from approved attendance OT hours × rate",
			isFixed: false,
			basedOn: "overtime",
			isTaxable: true,
			isPreTax: false,
			isTax: false,
			includeAllActive: true,
			sortOrder: 20,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "deduction" as const,
			category: "standard",
			title: "Health Insurance",
			description: "Group health insurance premium — pre-tax, capped",
			isFixed: true,
			fixedAmount: "12000.00",
			isTaxable: false,
			isPreTax: true,
			isTax: false,
			hasMaxLimit: true,
			maxAmount: "50000.00",
			includeAllActive: false,
			sortOrder: 50,
			isActive: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			type: "deduction" as const,
			category: "custom",
			title: "Credit Union Savings",
			description: "Voluntary credit union deduction — post-tax",
			isFixed: true,
			fixedAmount: "5000.00",
			isTaxable: false,
			isPreTax: false,
			isTax: false,
			includeAllActive: false,
			sortOrder: 60,
			isActive: true,
		},
	];
	return items;
}

function buildLoanWithInstallments(
	orgId: string,
	employeeId: string,
	adminUserId: string
) {
	const loanId = createId();
	const loanRecord = {
		id: loanId,
		organizationId: orgId,
		employeeId,
		type: "loan" as const,
		title: "Emergency Home Repair Loan",
		amount: "100000.00",
		currency: "GYD",
		providedDate: toDate("2026-03-01"),
		totalInstallments: 12,
		installmentAmount: "8334.00",
		installmentStartDate: toDate("2026-04-01"),
		paidInstallments: 1,
		remainingBalance: "91666.00",
		status: "active" as const,
		description: "Loan for emergency home repairs after flooding",
		approvedBy: adminUserId,
	};

	const installments: Array<{
		id: string;
		loanId: string;
		sequenceNumber: number;
		dueDate: Date;
		amount: string;
		status: "pending" | "deducted" | "skipped";
		paidAt?: Date | null;
	}> = [];
	for (let i = 1; i <= 12; i++) {
		const month = 3 + i;
		const year = month > 12 ? 2027 : 2026;
		const m = month > 12 ? month - 12 : month;
		installments.push({
			id: createId(),
			loanId,
			sequenceNumber: i,
			dueDate: toDate(`${year}-${String(m).padStart(2, "0")}-01`),
			amount: i === 12 ? "8338.00" : "8334.00",
			status: i === 1 ? ("deducted" as const) : ("pending" as const),
			paidAt: i === 1 ? new Date("2026-04-30T00:00:00") : null,
		});
	}

	return { loanRecord, installments };
}

function buildSalaryAdvance(
	orgId: string,
	employeeId: string,
	adminUserId: string
) {
	const advanceId = createId();
	const advanceRecord = {
		id: advanceId,
		organizationId: orgId,
		employeeId,
		type: "advance" as const,
		title: "Salary Advance — May 2026",
		amount: "50000.00",
		currency: "GYD",
		providedDate: toDate("2026-05-10"),
		totalInstallments: 1,
		installmentAmount: "50000.00",
		installmentStartDate: toDate("2026-06-01"),
		paidInstallments: 0,
		remainingBalance: "50000.00",
		status: "active" as const,
		description: "Salary advance for personal emergency",
		approvedBy: adminUserId,
	};

	const installment = {
		id: createId(),
		loanId: advanceId,
		sequenceNumber: 1,
		dueDate: toDate("2026-06-01"),
		amount: "50000.00",
		status: "pending" as const,
	};

	return { advanceRecord, installment };
}

function buildReimbursements(
	orgId: string,
	employees: OrgData["employees"],
	adminUserId: string
) {
	const items: Array<{
		id: string;
		organizationId: string;
		employeeId: string;
		type: "expense" | "leave_encash" | "bonus_encash";
		title: string;
		amount: string;
		currency: string;
		reimbursementDate: Date;
		status: "requested" | "approved" | "rejected" | "paid";
		approvedBy?: string;
		approvedAt?: Date;
		description: string;
	}> = [];

	if (employees[0]) {
		items.push({
			id: createId(),
			organizationId: orgId,
			employeeId: employees[0].id,
			type: "expense" as const,
			title: "Office Supplies Purchase",
			amount: "8500.00",
			currency: "GYD",
			reimbursementDate: toDate("2026-05-15"),
			status: "approved" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-05-16T10:00:00"),
			description: "Printer paper and toner for Georgetown office",
		});
	}

	if (employees[1]) {
		items.push({
			id: createId(),
			organizationId: orgId,
			employeeId: employees[1].id,
			type: "expense" as const,
			title: "Client Meeting Transport",
			amount: "3200.00",
			currency: "GYD",
			reimbursementDate: toDate("2026-05-20"),
			status: "requested" as const,
			description: "Taxi fare for client visit at Berbice branch",
		});
	}

	if (employees[2]) {
		items.push({
			id: createId(),
			organizationId: orgId,
			employeeId: employees[2].id,
			type: "expense" as const,
			title: "Training Registration Fee",
			amount: "25000.00",
			currency: "GYD",
			reimbursementDate: toDate("2026-04-20"),
			status: "paid" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-04-21T09:00:00"),
			description: "Safety certification training course",
		});
	}

	return items;
}

async function seed() {
	const data = await loadOrgData();
	const { orgId, employees, contracts, adminUserId } = data;

	console.log(
		`Loaded ${employees.length} employees, ${contracts.length} contracts`
	);

	// 1. Country payroll profile
	const gyProfile = buildGuyanProfile(orgId);
	await db.insert(countryPayrollProfile).values(gyProfile);
	console.log("✅ Guyana 2026 country payroll profile seeded");

	// 2. Payroll setting
	const settings = buildPayrollSetting(orgId);
	await db.insert(payrollSetting).values(settings);
	console.log("✅ Payroll settings seeded");

	// 3. Pay periods
	const periods = buildPayPeriods(orgId);
	await db.insert(payPeriod).values(periods);
	console.log(`✅ ${periods.length} pay periods seeded`);

	// 4. Pay items
	const items = buildPayItems(orgId);
	await db.insert(payItem).values(items);
	console.log(`✅ ${items.length} pay items seeded`);

	// 5. Pay item assignments — health insurance + credit union for specific employees
	const healthInsurance = items.find((i) => i.title === "Health Insurance");
	const creditUnion = items.find((i) => i.title === "Credit Union Savings");
	const assignments: Array<{
		id: string;
		payItemId: string;
		employeeId: string;
		isExcluded: boolean;
	}> = [];

	if (healthInsurance && employees.length >= 4) {
		for (const emp of employees.slice(0, 4)) {
			assignments.push({
				id: createId(),
				payItemId: healthInsurance.id,
				employeeId: emp.id,
				isExcluded: false,
			});
		}
	}

	if (creditUnion && employees.length >= 2) {
		for (const emp of employees.slice(0, 2)) {
			assignments.push({
				id: createId(),
				payItemId: creditUnion.id,
				employeeId: emp.id,
				isExcluded: false,
			});
		}
	}

	if (assignments.length > 0) {
		await db.insert(payItemAssignment).values(assignments);
	}
	console.log(`✅ ${assignments.length} pay item assignments seeded`);

	// 6. Loan with installments
	if (employees[0]) {
		const { loanRecord, installments } = buildLoanWithInstallments(
			orgId,
			employees[0].id,
			adminUserId
		);
		await db.insert(loan).values(loanRecord);
		await db.insert(loanInstallment).values(installments);
		console.log(
			`✅ Loan seeded (${installments.length} installments) for ${employees[0].firstName} ${employees[0].lastName}`
		);
	}

	// 7. Salary advance
	if (employees[1]) {
		const { advanceRecord, installment } = buildSalaryAdvance(
			orgId,
			employees[1].id,
			adminUserId
		);
		await db.insert(loan).values(advanceRecord);
		await db.insert(loanInstallment).values(installment);
		console.log(
			`✅ Salary advance seeded for ${employees[1].firstName} ${employees[1].lastName}`
		);
	}

	// 8. Reimbursements
	const reimbursements = buildReimbursements(orgId, employees, adminUserId);
	if (reimbursements.length > 0) {
		await db.insert(reimbursement).values(reimbursements);
	}
	console.log(`✅ ${reimbursements.length} reimbursements seeded`);

	console.log("\n✅ Payroll seed complete.");
	process.exit(0);
}

seed().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
