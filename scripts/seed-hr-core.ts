/**
 * HR Core seed script — creates departments, positions, roles, shifts,
 * work types, employee types, holidays, employee profiles, work info,
 * bank details, and documents for the Atlas Shipping demo org.
 *
 * Requires the base seed (seed-dev.ts) to have run first.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-hr-core.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import * as schema from "../packages/db/src/schema";

const db = createDb();

async function main() {
	console.log("\nHeimdallone HR Core Seed");
	console.log("---");

	const orgs = await db
		.select()
		.from(schema.organization)
		.where(eq(schema.organization.slug, "atlas-shipping"))
		.limit(1);

	if (orgs.length === 0) {
		console.error("Atlas Shipping org not found. Run seed-dev.ts first.");
		process.exit(1);
	}

	const orgId = orgs[0]!.id;
	console.log(`Org: Atlas Shipping (${orgId})`);

	const users = await db.select().from(schema.user);
	const userByEmail = new Map(users.map((u) => [u.email, u]));

	// --- Departments ---
	console.log("\n1. Departments");
	const deptIds = {
		operations: createId(),
		engineering: createId(),
		finance: createId(),
		hr: createId(),
	};

	await db.insert(schema.department).values([
		{
			id: deptIds.operations,
			organizationId: orgId,
			name: "Operations",
			description: "Port operations, logistics, and yard management",
		},
		{
			id: deptIds.engineering,
			organizationId: orgId,
			name: "Engineering",
			description: "Software development and IT infrastructure",
		},
		{
			id: deptIds.finance,
			organizationId: orgId,
			name: "Finance",
			description: "Accounting, payroll, and financial reporting",
		},
		{
			id: deptIds.hr,
			organizationId: orgId,
			name: "Human Resources",
			description: "People management, recruitment, and compliance",
		},
	]);
	console.log("   4 departments created");

	// --- Job Positions ---
	console.log("\n2. Job Positions");
	const posIds = {
		opsLead: createId(),
		yardOperator: createId(),
		seniorEngineer: createId(),
		juniorEngineer: createId(),
		financeManager: createId(),
		accountant: createId(),
		hrGeneralist: createId(),
		hrDirector: createId(),
	};

	await db.insert(schema.jobPosition).values([
		{
			id: posIds.opsLead,
			organizationId: orgId,
			departmentId: deptIds.operations,
			name: "Operations Lead",
		},
		{
			id: posIds.yardOperator,
			organizationId: orgId,
			departmentId: deptIds.operations,
			name: "Yard Operator",
		},
		{
			id: posIds.seniorEngineer,
			organizationId: orgId,
			departmentId: deptIds.engineering,
			name: "Senior Engineer",
		},
		{
			id: posIds.juniorEngineer,
			organizationId: orgId,
			departmentId: deptIds.engineering,
			name: "Junior Engineer",
		},
		{
			id: posIds.financeManager,
			organizationId: orgId,
			departmentId: deptIds.finance,
			name: "Finance Manager",
		},
		{
			id: posIds.accountant,
			organizationId: orgId,
			departmentId: deptIds.finance,
			name: "Accountant",
		},
		{
			id: posIds.hrGeneralist,
			organizationId: orgId,
			departmentId: deptIds.hr,
			name: "HR Generalist",
		},
		{
			id: posIds.hrDirector,
			organizationId: orgId,
			departmentId: deptIds.hr,
			name: "HR Director",
		},
	]);
	console.log("   8 job positions created");

	// --- Job Roles ---
	console.log("\n3. Job Roles");
	const roleIds = {
		backendEng: createId(),
		frontendEng: createId(),
		seniorAccountant: createId(),
	};

	await db.insert(schema.jobRole).values([
		{
			id: roleIds.backendEng,
			organizationId: orgId,
			jobPositionId: posIds.seniorEngineer,
			name: "Backend",
		},
		{
			id: roleIds.frontendEng,
			organizationId: orgId,
			jobPositionId: posIds.seniorEngineer,
			name: "Frontend",
		},
		{
			id: roleIds.seniorAccountant,
			organizationId: orgId,
			jobPositionId: posIds.accountant,
			name: "Senior Accountant",
		},
	]);
	console.log("   3 job roles created");

	// --- Work Types ---
	console.log("\n4. Work Types");
	const wtIds = { onsite: createId(), remote: createId(), hybrid: createId() };

	await db.insert(schema.workType).values([
		{ id: wtIds.onsite, organizationId: orgId, name: "On-site" },
		{ id: wtIds.remote, organizationId: orgId, name: "Remote" },
		{ id: wtIds.hybrid, organizationId: orgId, name: "Hybrid" },
	]);
	console.log("   3 work types created");

	// --- Employee Types ---
	console.log("\n5. Employee Types");
	const etIds = {
		fullTime: createId(),
		partTime: createId(),
		contractor: createId(),
	};

	await db.insert(schema.employeeType).values([
		{ id: etIds.fullTime, organizationId: orgId, name: "Full-time" },
		{ id: etIds.partTime, organizationId: orgId, name: "Part-time" },
		{ id: etIds.contractor, organizationId: orgId, name: "Contractor" },
	]);
	console.log("   3 employee types created");

	// --- Shifts ---
	console.log("\n6. Shifts");
	const shiftIds = { day: createId(), night: createId() };

	await db.insert(schema.shift).values([
		{
			id: shiftIds.day,
			organizationId: orgId,
			name: "Day Shift",
			weeklyFullTimeMinutes: 2400,
			monthlyFullTimeMinutes: 12_000,
		},
		{
			id: shiftIds.night,
			organizationId: orgId,
			name: "Night Shift",
			weeklyFullTimeMinutes: 2400,
			monthlyFullTimeMinutes: 12_000,
		},
	]);
	console.log("   2 shifts created");

	// --- Shift Schedules (Mon-Fri for day shift, Mon-Fri for night) ---
	console.log("\n7. Shift Schedules");
	const daySchedules = [0, 1, 2, 3, 4].map((day) => ({
		id: createId(),
		shiftId: shiftIds.day,
		dayOfWeek: day,
		startTime: "08:00",
		endTime: "17:00",
		minimumWorkMinutes: 495,
		isNightShift: false,
	}));

	const nightSchedules = [0, 1, 2, 3, 4].map((day) => ({
		id: createId(),
		shiftId: shiftIds.night,
		dayOfWeek: day,
		startTime: "22:00",
		endTime: "06:00",
		minimumWorkMinutes: 480,
		isNightShift: true,
	}));

	await db
		.insert(schema.shiftSchedule)
		.values([...daySchedules, ...nightSchedules]);
	console.log("   10 shift schedules created (5 per shift, Mon-Fri)");

	// --- Holidays ---
	console.log("\n8. Holidays (Guyana 2026)");
	await db.insert(schema.holiday).values([
		{
			id: createId(),
			organizationId: orgId,
			name: "New Year's Day",
			startDate: new Date("2026-01-01"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Republic Day",
			startDate: new Date("2026-02-23"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Mashramani",
			startDate: new Date("2026-02-23"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Labour Day",
			startDate: new Date("2026-05-01"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Independence Day",
			startDate: new Date("2026-05-26"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Emancipation Day",
			startDate: new Date("2026-08-01"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Christmas Day",
			startDate: new Date("2026-12-25"),
			isRecurring: true,
		},
		{
			id: createId(),
			organizationId: orgId,
			name: "Boxing Day",
			startDate: new Date("2026-12-26"),
			isRecurring: true,
		},
	]);
	console.log("   8 holidays created");

	// --- Employee Profiles ---
	console.log("\n9. Employee Profiles");

	interface EmpSeed {
		badgeId: string;
		city: string;
		country: string;
		deptId: string;
		email: string;
		empTypeId: string;
		firstName: string;
		gender: "male" | "female" | "other";
		lastName: string;
		managerId?: string;
		phone: string;
		posId: string;
		roleId?: string;
		salary: string;
		shiftId: string;
		userEmail?: string;
		workTypeId: string;
	}

	const mayaId = createId();
	const rohanId = createId();
	const shaniceId = createId();
	const devonId = createId();
	const kareenId = createId();
	const andreId = createId();
	const priyaId = createId();
	const noLoginId1 = createId();
	const noLoginId2 = createId();

	const employees: (EmpSeed & { id: string })[] = [
		{
			id: mayaId,
			badgeId: "EMP-00128",
			firstName: "Maya",
			lastName: "Persaud",
			email: "maya.persaud@atlas-shipping.com",
			phone: "+592-600-1001",
			gender: "female",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.operations,
			posId: posIds.opsLead,
			shiftId: shiftIds.day,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "450000.00",
			userEmail: "owner@atlas-shipping.com",
		},
		{
			id: rohanId,
			badgeId: "EMP-00214",
			firstName: "Rohan",
			lastName: "Gopaul",
			email: "rohan.gopaul@atlas-shipping.com",
			phone: "+592-600-1002",
			gender: "male",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.engineering,
			posId: posIds.seniorEngineer,
			roleId: roleIds.backendEng,
			shiftId: shiftIds.day,
			workTypeId: wtIds.hybrid,
			empTypeId: etIds.fullTime,
			salary: "380000.00",
			managerId: mayaId,
			userEmail: "employee@atlas-shipping.com",
		},
		{
			id: shaniceId,
			badgeId: "EMP-00302",
			firstName: "Shanice",
			lastName: "Powell",
			email: "shanice.powell@atlas-shipping.com",
			phone: "+246-800-2003",
			gender: "female",
			country: "BB",
			city: "Bridgetown",
			deptId: deptIds.finance,
			posId: posIds.financeManager,
			shiftId: shiftIds.day,
			workTypeId: wtIds.remote,
			empTypeId: etIds.fullTime,
			salary: "420000.00",
			managerId: mayaId,
		},
		{
			id: devonId,
			badgeId: "EMP-00417",
			firstName: "Devon",
			lastName: "Ali",
			email: "devon.ali@atlas-shipping.com",
			phone: "+592-600-1004",
			gender: "male",
			country: "GY",
			city: "Mahaica",
			deptId: deptIds.operations,
			posId: posIds.yardOperator,
			shiftId: shiftIds.night,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "180000.00",
			managerId: mayaId,
		},
		{
			id: kareenId,
			badgeId: "EMP-00504",
			firstName: "Kareena",
			lastName: "Ramnath",
			email: "kareena.ramnath@atlas-shipping.com",
			phone: "+592-600-1005",
			gender: "female",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.hr,
			posId: posIds.hrGeneralist,
			shiftId: shiftIds.day,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "280000.00",
			userEmail: "hr@atlas-shipping.com",
		},
		{
			id: andreId,
			badgeId: "EMP-00615",
			firstName: "Andre",
			lastName: "Sealey",
			email: "andre.sealey@atlas-shipping.com",
			phone: "+592-600-1006",
			gender: "male",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.operations,
			posId: posIds.opsLead,
			shiftId: shiftIds.day,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "350000.00",
			managerId: mayaId,
			userEmail: "manager@atlas-shipping.com",
		},
		{
			id: priyaId,
			badgeId: "EMP-00721",
			firstName: "Priya",
			lastName: "Singh",
			email: "priya.singh@atlas-shipping.com",
			phone: "+592-600-1007",
			gender: "female",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.finance,
			posId: posIds.accountant,
			roleId: roleIds.seniorAccountant,
			shiftId: shiftIds.day,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "300000.00",
			managerId: shaniceId,
			userEmail: "auditor@atlas-shipping.com",
		},
		{
			id: noLoginId1,
			badgeId: "EMP-00830",
			firstName: "Dwayne",
			lastName: "Wilson",
			email: "dwayne.wilson@atlas-shipping.com",
			phone: "+592-600-1008",
			gender: "male",
			country: "GY",
			city: "Linden",
			deptId: deptIds.operations,
			posId: posIds.yardOperator,
			shiftId: shiftIds.night,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "170000.00",
			managerId: andreId,
		},
		{
			id: noLoginId2,
			badgeId: "EMP-00945",
			firstName: "Camille",
			lastName: "Ramjattan",
			email: "camille.ramjattan@atlas-shipping.com",
			phone: "+592-600-1009",
			gender: "female",
			country: "GY",
			city: "Georgetown",
			deptId: deptIds.hr,
			posId: posIds.hrDirector,
			shiftId: shiftIds.day,
			workTypeId: wtIds.onsite,
			empTypeId: etIds.fullTime,
			salary: "520000.00",
		},
	];

	for (const emp of employees) {
		const matchedUser = emp.userEmail
			? userByEmail.get(emp.userEmail)
			: undefined;

		await db.insert(schema.employeeProfile).values({
			id: emp.id,
			organizationId: orgId,
			userId: matchedUser?.id ?? null,
			badgeId: emp.badgeId,
			firstName: emp.firstName,
			lastName: emp.lastName,
			email: emp.email,
			phone: emp.phone,
			gender: emp.gender,
			country: emp.country,
			city: emp.city,
			isActive: true,
		});

		await db.insert(schema.employeeWorkInfo).values({
			id: createId(),
			employeeId: emp.id,
			departmentId: emp.deptId,
			jobPositionId: emp.posId,
			jobRoleId: emp.roleId ?? null,
			shiftId: emp.shiftId,
			workTypeId: emp.workTypeId,
			employeeTypeId: emp.empTypeId,
			reportingManagerId: emp.managerId ?? null,
			workLocation: emp.city,
			workEmail: emp.email,
			joiningDate: new Date("2024-03-18"),
			basicSalary: emp.salary,
			salaryCurrency: "GYD",
		});
	}

	console.log(
		`   ${employees.length} employees created (${employees.filter((e) => e.userEmail).length} with app login, ${employees.filter((e) => !e.userEmail).length} without)`
	);

	// --- Bank Details (fake test data) ---
	console.log("\n10. Bank Details (fake)");
	const bankEmployees = [mayaId, rohanId, shaniceId, devonId, kareenId];
	for (const [i, empId] of bankEmployees.entries()) {
		await db.insert(schema.employeeBankDetails).values({
			id: createId(),
			employeeId: empId,
			bankName: "Demerara Bank",
			accountNumber: `991000${(i + 1).toString().padStart(4, "0")}`,
			branch: "Main Branch",
			bankCode1: "DMBKGYGG",
			country: "GY",
		});
	}
	console.log(`   ${bankEmployees.length} bank detail records created`);

	// --- Documents ---
	console.log("\n11. Documents");
	await db.insert(schema.employeeDocument).values([
		{
			id: createId(),
			organizationId: orgId,
			employeeId: mayaId,
			title: "National ID",
			status: "approved",
			format: "pdf",
			issueDate: new Date("2020-01-15"),
			expiryDate: new Date("2030-01-15"),
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: mayaId,
			title: "Employment Contract",
			status: "approved",
			format: "pdf",
			issueDate: new Date("2024-03-18"),
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: rohanId,
			title: "Passport",
			status: "uploaded",
			format: "pdf",
			issueDate: new Date("2022-06-10"),
			expiryDate: new Date("2027-06-10"),
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: devonId,
			title: "Driver's License",
			status: "requested",
			format: "jpg",
		},
	]);
	console.log("   4 documents created");

	// --- Audit Events ---
	console.log("\n12. Audit Events");
	const ownerUser = userByEmail.get("owner@atlas-shipping.com");
	if (ownerUser) {
		await db.insert(schema.auditEvent).values([
			{
				id: createId(),
				organizationId: orgId,
				entityType: "department",
				entityId: deptIds.operations,
				action: "create",
				actorId: ownerUser.id,
				changes: null,
				metadata: { source: "seed" },
			},
			{
				id: createId(),
				organizationId: orgId,
				entityType: "employee_profile",
				entityId: mayaId,
				action: "create",
				actorId: ownerUser.id,
				changes: null,
				metadata: { source: "seed" },
			},
		]);
		console.log("   2 audit events created");
	}

	console.log("\n---");
	console.log("HR Core seed complete!");
	console.log(
		`  ${Object.keys(deptIds).length} departments, ${Object.keys(posIds).length} positions, ${Object.keys(roleIds).length} roles`
	);
	console.log(
		`  ${Object.keys(wtIds).length} work types, ${Object.keys(etIds).length} employee types, ${Object.keys(shiftIds).length} shifts`
	);
	console.log(`  ${employees.length} employees, 8 holidays`);

	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
