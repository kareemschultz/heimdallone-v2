/**
 * Leave seed — creates leave types, balances, requests, restrictions, and
 * company leave days for Atlas Shipping demo org.
 * Requires seed-hr-core.ts to have run first.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-leave.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import {
	companyLeaveDay,
	employeeProfile,
	employeeWorkInfo,
	leaveAllocationRequest,
	leaveBalance,
	leaveRequest,
	leaveRequestApproval,
	leaveRestriction,
	leaveType,
	organization,
	user,
} from "../packages/db/src/schema";

const db = createDb();

function toDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`);
}

async function loadOrgData() {
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

	const employees = await db
		.select({
			id: employeeProfile.id,
			email: employeeProfile.email,
			firstName: employeeProfile.firstName,
			lastName: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.leftJoin(
			employeeWorkInfo,
			eq(employeeProfile.id, employeeWorkInfo.employeeId)
		)
		.where(eq(employeeProfile.organizationId, orgId));

	if (employees.length === 0) {
		console.error("No employees found. Run seed-hr-core.ts first.");
		process.exit(1);
	}

	const empByEmail = new Map(employees.map((e) => [e.email, e]));
	console.log(`Found ${employees.length} employees`);

	const users = await db.select().from(user).limit(5);
	const adminUserId = users.at(0)?.id ?? null;

	return { orgId, empByEmail, adminUserId };
}

async function seedLeaveTypes(orgId: string) {
	console.log("\n1. Leave Types");

	const annualId = createId();
	const sickId = createId();
	const casualId = createId();
	const unpaidId = createId();
	const compassionateId = createId();

	await db.insert(leaveType).values([
		{
			id: annualId,
			organizationId: orgId,
			name: "Annual Leave",
			color: "#22c55e",
			isPaid: true,
			accrualAmount: "1.50",
			accrualPeriod: "month",
			limitDays: "18.00",
			resetEnabled: true,
			resetBasis: "yearly",
			resetMonth: 1,
			resetDay: 1,
			carryForwardType: "carry_expire",
			carryForwardMax: "5.00",
			carryForwardExpiryDays: 90,
			requireApproval: true,
			requireAttachment: false,
			excludeHolidays: true,
			excludeCompanyLeaves: true,
		},
		{
			id: sickId,
			organizationId: orgId,
			name: "Sick Leave",
			color: "#ef4444",
			isPaid: true,
			accrualAmount: "1.00",
			accrualPeriod: "month",
			limitDays: "12.00",
			resetEnabled: true,
			resetBasis: "yearly",
			resetMonth: 1,
			resetDay: 1,
			carryForwardType: "none",
			requireApproval: true,
			requireAttachment: true,
			excludeHolidays: true,
			excludeCompanyLeaves: true,
		},
		{
			id: casualId,
			organizationId: orgId,
			name: "Casual Leave",
			color: "#3b82f6",
			isPaid: true,
			accrualAmount: "0.50",
			accrualPeriod: "month",
			limitDays: "6.00",
			resetEnabled: true,
			resetBasis: "yearly",
			resetMonth: 1,
			resetDay: 1,
			carryForwardType: "none",
			requireApproval: true,
			requireAttachment: false,
			excludeHolidays: true,
			excludeCompanyLeaves: true,
		},
		{
			id: unpaidId,
			organizationId: orgId,
			name: "Unpaid Leave",
			color: "#a3a3a3",
			isPaid: false,
			accrualAmount: "0",
			accrualPeriod: "year",
			limitDays: null,
			resetEnabled: false,
			carryForwardType: "none",
			requireApproval: true,
			requireAttachment: false,
			excludeHolidays: true,
			excludeCompanyLeaves: true,
		},
		{
			id: compassionateId,
			organizationId: orgId,
			name: "Compassionate Leave",
			color: "#8b5cf6",
			isPaid: true,
			accrualAmount: "0",
			accrualPeriod: "year",
			limitDays: "5.00",
			resetEnabled: true,
			resetBasis: "yearly",
			resetMonth: 1,
			resetDay: 1,
			carryForwardType: "none",
			requireApproval: true,
			requireAttachment: false,
			excludeHolidays: true,
			excludeCompanyLeaves: true,
		},
	]);

	console.log("  Created 5 leave types");
	return { annualId, sickId, casualId, unpaidId, compassionateId };
}

async function seedBalances(
	empByEmail: Map<string, { id: string }>,
	typeIds: {
		annualId: string;
		sickId: string;
		casualId: string;
		compassionateId: string;
	}
) {
	console.log("\n2. Leave Balances");

	const today = toDate("2026-01-01");
	const balanceRows: Array<{
		id: string;
		employeeId: string;
		leaveTypeId: string;
		availableDays: string;
		usedDays: string;
		carryForwardDays: string;
		assignedDate: Date;
		resetDate: Date | null;
	}> = [];

	const targetEmails = [
		"maya.persaud@atlas-shipping.com",
		"rohan.gopaul@atlas-shipping.com",
		"shanice.powell@atlas-shipping.com",
		"devon.ali@atlas-shipping.com",
		"kareena.ramnath@atlas-shipping.com",
		"andre.sealey@atlas-shipping.com",
	];

	const balanceConfigs = [
		{
			typeId: typeIds.annualId,
			available: "14.00",
			used: "4.00",
			carry: "2.00",
		},
		{ typeId: typeIds.sickId, available: "10.00", used: "2.00", carry: "0" },
		{ typeId: typeIds.casualId, available: "4.50", used: "1.50", carry: "0" },
		{
			typeId: typeIds.compassionateId,
			available: "5.00",
			used: "0",
			carry: "0",
		},
	];

	for (const email of targetEmails) {
		const emp = empByEmail.get(email);
		if (!emp) {
			continue;
		}

		for (const cfg of balanceConfigs) {
			const avail =
				email === "maya.persaud@atlas-shipping.com"
					? cfg.available
					: String(
							Math.max(0, Number(cfg.available) - Math.random() * 3).toFixed(2)
						);

			balanceRows.push({
				id: createId(),
				employeeId: emp.id,
				leaveTypeId: cfg.typeId,
				availableDays: avail,
				usedDays: cfg.used,
				carryForwardDays: cfg.carry,
				assignedDate: today,
				resetDate: toDate("2027-01-01"),
			});
		}
	}

	await db.insert(leaveBalance).values(balanceRows);
	console.log(
		`  Created ${balanceRows.length} leave balances (${targetEmails.length} employees × 4 types)`
	);
}

async function seedRequests(
	orgId: string,
	empByEmail: Map<string, { id: string }>,
	typeIds: {
		annualId: string;
		sickId: string;
		casualId: string;
		unpaidId: string;
	},
	adminUserId: string | null
) {
	console.log("\n3. Leave Requests");

	const maya = empByEmail.get("maya.persaud@atlas-shipping.com");
	const rohan = empByEmail.get("rohan.gopaul@atlas-shipping.com");
	const shanice = empByEmail.get("shanice.powell@atlas-shipping.com");
	const devon = empByEmail.get("devon.ali@atlas-shipping.com");
	const kareena = empByEmail.get("kareena.ramnath@atlas-shipping.com");

	if (!(maya && rohan && shanice && devon && kareena)) {
		console.error("Missing expected employees for leave requests.");
		return 0;
	}

	const requests = [
		{
			id: createId(),
			organizationId: orgId,
			employeeId: maya.id,
			leaveTypeId: typeIds.annualId,
			startDate: toDate("2026-06-02"),
			endDate: toDate("2026-06-06"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "5.00",
			description: "Family vacation",
			status: "approved" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-05-20T10:00:00"),
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: rohan.id,
			leaveTypeId: typeIds.annualId,
			startDate: toDate("2026-06-16"),
			endDate: toDate("2026-06-18"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "3.00",
			description: "Personal travel",
			status: "requested" as const,
			approvedBy: null,
			approvedAt: null,
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: shanice.id,
			leaveTypeId: typeIds.sickId,
			startDate: toDate("2026-05-22"),
			endDate: toDate("2026-05-22"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "1.00",
			description: "Not feeling well",
			status: "approved" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-05-22T08:30:00"),
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: devon.id,
			leaveTypeId: typeIds.annualId,
			startDate: toDate("2026-07-01"),
			endDate: toDate("2026-07-10"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "8.00",
			description: "Extended holiday",
			status: "rejected" as const,
			rejectReason: "Team coverage required during this period",
			approvedBy: null,
			approvedAt: null,
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: kareena.id,
			leaveTypeId: typeIds.casualId,
			startDate: toDate("2026-05-28"),
			endDate: toDate("2026-05-28"),
			startBreakdown: "first_half" as const,
			endBreakdown: "first_half" as const,
			requestedDays: "0.50",
			description: "Morning appointment",
			status: "approved" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-05-27T14:00:00"),
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: maya.id,
			leaveTypeId: typeIds.unpaidId,
			startDate: toDate("2026-08-01"),
			endDate: toDate("2026-08-05"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "3.00",
			description: "Personal matter — unpaid",
			status: "approved" as const,
			approvedBy: adminUserId,
			approvedAt: new Date("2026-07-15T09:00:00"),
			createdBy: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: rohan.id,
			leaveTypeId: typeIds.sickId,
			startDate: toDate("2026-04-10"),
			endDate: toDate("2026-04-11"),
			startBreakdown: "full_day" as const,
			endBreakdown: "full_day" as const,
			requestedDays: "2.00",
			description: "Flu recovery",
			status: "cancelled" as const,
			approvedBy: null,
			approvedAt: null,
			createdBy: null,
		},
	];

	await db.insert(leaveRequest).values(requests);
	console.log(`  Created ${requests.length} leave requests`);

	const approvedRequests = requests.filter((r) => r.status === "approved");
	if (approvedRequests.length > 0 && adminUserId) {
		const approvalRows = approvedRequests.map((r) => ({
			id: createId(),
			leaveRequestId: r.id,
			managerId: adminUserId,
			sequence: 1,
			isApproved: true,
			isRejected: false,
			approvedAt: r.approvedAt,
		}));

		await db.insert(leaveRequestApproval).values(approvalRows);
		console.log(`  Created ${approvalRows.length} leave request approvals`);
	}

	return requests.length;
}

async function seedAllocationRequest(
	orgId: string,
	empByEmail: Map<string, { id: string }>,
	annualId: string
) {
	console.log("\n4. Leave Allocation Request");

	const devon = empByEmail.get("devon.ali@atlas-shipping.com");
	if (!devon) {
		return;
	}

	await db.insert(leaveAllocationRequest).values({
		id: createId(),
		organizationId: orgId,
		employeeId: devon.id,
		leaveTypeId: annualId,
		requestedDays: "3.00",
		description: "Requesting 3 extra annual leave days for family event",
		status: "requested",
	});

	console.log("  Created 1 allocation request (pending)");
}

async function seedRestrictions(orgId: string) {
	console.log("\n5. Leave Restrictions");

	await db.insert(leaveRestriction).values({
		id: createId(),
		organizationId: orgId,
		title: "Year-End Inventory Close",
		startDate: toDate("2026-12-28"),
		endDate: toDate("2026-12-31"),
		description:
			"Leave requests are blocked during year-end inventory. Contact HR for exceptions.",
	});

	console.log("  Created 1 leave restriction (Year-End Inventory Close)");
}

async function seedCompanyLeaveDays(orgId: string) {
	console.log("\n6. Company Leave Days");

	await db.insert(companyLeaveDay).values([
		{
			id: createId(),
			organizationId: orgId,
			weekOfMonth: null,
			dayOfWeek: 0,
		},
		{
			id: createId(),
			organizationId: orgId,
			weekOfMonth: null,
			dayOfWeek: 6,
		},
	]);

	console.log("  Created 2 company leave days (every Sunday, every Saturday)");
}

async function main() {
	console.log("\nHeimdallone Leave Seed");
	console.log("---");

	const { orgId, empByEmail, adminUserId } = await loadOrgData();

	const typeIds = await seedLeaveTypes(orgId);
	await seedBalances(empByEmail, typeIds);
	const reqCount = await seedRequests(orgId, empByEmail, typeIds, adminUserId);
	await seedAllocationRequest(orgId, empByEmail, typeIds.annualId);
	await seedRestrictions(orgId);
	await seedCompanyLeaveDays(orgId);

	console.log("\n---");
	console.log("Leave seed complete!");
	console.log("  Leave types: 5");
	console.log("  Balances: 24");
	console.log(`  Requests: ${reqCount}`);
	console.log("  Allocation requests: 1");
	console.log("  Restrictions: 1");
	console.log("  Company leave days: 2");
	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
