/**
 * Contracts seed — creates filing statuses and employment contracts for the
 * Atlas Shipping demo org. Requires seed-hr-core.ts to have run first.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-contracts.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import * as schema from "../packages/db/src/schema";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();

async function main() {
	console.log("\nHeimdallone Contracts Seed");
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

	const employees = await db
		.select({
			id: schema.employeeProfile.id,
			email: schema.employeeProfile.email,
			firstName: schema.employeeProfile.firstName,
			lastName: schema.employeeProfile.lastName,
			workInfo: {
				departmentId: schema.employeeWorkInfo.departmentId,
				jobPositionId: schema.employeeWorkInfo.jobPositionId,
				shiftId: schema.employeeWorkInfo.shiftId,
				workTypeId: schema.employeeWorkInfo.workTypeId,
				basicSalary: schema.employeeWorkInfo.basicSalary,
			},
		})
		.from(schema.employeeProfile)
		.leftJoin(
			schema.employeeWorkInfo,
			eq(schema.employeeProfile.id, schema.employeeWorkInfo.employeeId)
		)
		.where(eq(schema.employeeProfile.organizationId, orgId));

	if (employees.length === 0) {
		console.error("No employees found. Run seed-hr-core.ts first.");
		process.exit(1);
	}

	const empByEmail = new Map(employees.map((e) => [e.email, e]));
	console.log(`Found ${employees.length} employees`);

	// --- Filing Statuses ---
	console.log("\n1. Filing Statuses");
	const fsStandardId = createId();
	const fsExemptId = createId();

	await db.insert(schema.filingStatus).values([
		{
			id: fsStandardId,
			organizationId: orgId,
			name: "GY Standard PAYE",
			basedOn: "taxable_gross_pay",
			brackets: [
				{ min: 0, max: 130_000, rate: 0, fixedAmount: 0 },
				{ min: 130_001, max: 780_000, rate: 0.28, fixedAmount: 0 },
				{ min: 780_001, max: null, rate: 0.4, fixedAmount: 0 },
			],
			isActive: true,
		},
		{
			id: fsExemptId,
			organizationId: orgId,
			name: "GY PAYE — Exempt",
			basedOn: "taxable_gross_pay",
			brackets: [{ min: 0, max: null, rate: 0, fixedAmount: 0 }],
			isActive: true,
		},
	]);
	console.log("   2 filing statuses created");

	// --- Contracts ---
	console.log("\n2. Contracts");

	interface ContractSeed {
		baseSalary: string;
		employeeEmail: string;
		endDate?: Date;
		filingStatusId: string;
		notes?: string;
		payFrequency: "monthly" | "weekly" | "semi_monthly";
		startDate: Date;
		status: "active" | "draft" | "expired" | "terminated";
		wageType: "monthly" | "daily" | "hourly";
	}

	const contractSeeds: ContractSeed[] = [
		{
			employeeEmail: "maya.persaud@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "450000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "rohan.gopaul@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "380000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "shanice.powell@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "420000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "devon.ali@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "180000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "kareena.ramnath@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "280000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "andre.sealey@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "350000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		{
			employeeEmail: "priya.singh@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "300000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
		// Draft — no active contract yet
		{
			employeeEmail: "dwayne.wilson@atlas-shipping.com",
			status: "draft",
			startDate: new Date("2026-06-01"),
			baseSalary: "170000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
			notes: "Pending review by HR director before activation.",
		},
		// Terminated historical record + active replacement
		{
			employeeEmail: "camille.ramjattan@atlas-shipping.com",
			status: "terminated",
			startDate: new Date("2023-01-15"),
			endDate: new Date("2024-03-17"),
			baseSalary: "480000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
			notes: "Previous contract, terminated on role change.",
		},
		{
			employeeEmail: "camille.ramjattan@atlas-shipping.com",
			status: "active",
			startDate: new Date("2024-03-18"),
			baseSalary: "520000.00",
			wageType: "monthly",
			payFrequency: "monthly",
			filingStatusId: fsStandardId,
		},
	];

	let created = 0;
	for (const seed of contractSeeds) {
		const emp = empByEmail.get(seed.employeeEmail);
		if (!emp) {
			console.warn(`   Skipping ${seed.employeeEmail} — not found`);
			continue;
		}

		const name =
			`${emp.firstName} ${emp.lastName ?? ""} — ${seed.startDate.getFullYear()} Employment Agreement`.trim();

		await db.insert(schema.contract).values({
			id: createId(),
			organizationId: orgId,
			employeeId: emp.id,
			contractName: name,
			startDate: seed.startDate,
			endDate: seed.endDate ?? null,
			wageType: seed.wageType,
			payFrequency: seed.payFrequency,
			baseSalary: seed.baseSalary,
			salaryCurrency: "GYD",
			filingStatusId: seed.filingStatusId,
			status: seed.status,
			departmentId: emp.workInfo?.departmentId ?? null,
			jobPositionId: emp.workInfo?.jobPositionId ?? null,
			shiftId: emp.workInfo?.shiftId ?? null,
			workTypeId: emp.workInfo?.workTypeId ?? null,
			noticePeriodDays: 30,
			notes: seed.notes ?? null,
		});
		created++;
	}

	console.log(`   ${created} contracts created`);

	console.log("\n---");
	console.log("Contracts seed complete!");
	console.log(
		"  2 filing statuses, 10 contracts (7 active, 1 draft, 1 terminated + 1 active for Camille)"
	);

	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
