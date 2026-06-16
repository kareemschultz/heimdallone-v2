// Phase 21X — production delta load: payroll country profile + payroll settings.
//
// The original production load brought employees/contracts/statutory/shifts/
// roster but NOT the Guyana payroll country profile or the per-tenant payroll
// settings, so payroll couldn't run and tenants looked "unset". This idempotent
// script creates, for EVERY org that lacks them, the GRA Guyana 2026 country
// payroll profile (effective-dated, published) and the per-tenant payroll
// settings (fortnightly default — both live tenants run fortnightly). GRA is the
// source of truth (not v1); values mirror scripts/seed-payroll.ts.
//
// SAFETY: writes ONLY country_payroll_profile + payroll_setting; skips orgs that
// already have them; refuses the v1 DB; requires the reviewed production-write
// opt-in. NO payslip/employee/contract writes here.
//
// Run (prod): export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/complete-prod-delta.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../packages/db/src/index";
import {
	countryPayrollProfile,
	payrollSetting,
} from "../../packages/db/src/schema";
import { organization } from "../../packages/db/src/schema/auth";
import { assertProductionTarget } from "./create-scratch-db";

const LEADING_SLASH = /^\//;

function dbName(): string {
	const url = process.env.DATABASE_URL ?? "";
	if (url.includes("karetech_erp")) {
		throw new Error("Refusing: target is the v1 database (karetech_erp).");
	}
	try {
		return new URL(url).pathname.replace(LEADING_SLASH, "");
	} catch {
		throw new Error("DATABASE_URL is not a valid URL.");
	}
}

function buildGuyanaProfile(orgId: string) {
	return {
		id: createId(),
		organizationId: orgId,
		countryCode: "GY",
		countryName: "Guyana",
		currency: "GYD",
		effectiveYear: 2026,
		effectiveFrom: new Date("2026-01-01"),
		effectiveTo: null,
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
		isPublished: true,
	};
}

function buildPayrollSetting(orgId: string) {
	return {
		id: createId(),
		organizationId: orgId,
		defaultCurrency: "GYD",
		defaultPayFrequency: "fortnightly",
		weekdayOvertimeMultiplier: "1.50",
		saturdayMultiplier: "1.50",
		sundayMultiplier: "2.00",
		publicHolidayMultiplier: "2.00",
		nightShiftMultiplier: "1.00",
		workDays: [1, 2, 3, 4, 5],
		weekendDays: [6, 7],
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

async function main() {
	const name = dbName();
	assertProductionTarget(name); // CONFIRM_PRODUCTION_WRITE + matching target
	const db = createDb();

	const orgs = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization);

	for (const org of orgs) {
		const [profile] = await db
			.select({ id: countryPayrollProfile.id })
			.from(countryPayrollProfile)
			.where(
				and(
					eq(countryPayrollProfile.organizationId, org.id),
					eq(countryPayrollProfile.countryCode, "GY")
				)
			)
			.limit(1);
		if (profile) {
			process.stdout.write(`  ${org.name}: GY profile already present\n`);
		} else {
			await db.insert(countryPayrollProfile).values(buildGuyanaProfile(org.id));
			process.stdout.write(`  ${org.name}: GY 2026 profile CREATED\n`);
		}

		const [setting] = await db
			.select({ id: payrollSetting.id })
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, org.id))
			.limit(1);
		if (setting) {
			process.stdout.write(`  ${org.name}: payroll settings already present\n`);
		} else {
			await db.insert(payrollSetting).values(buildPayrollSetting(org.id));
			process.stdout.write(
				`  ${org.name}: payroll settings CREATED (fortnightly)\n`
			);
		}
	}
	process.stdout.write("Delta (profile + settings) complete.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`complete-prod-delta failed: ${err}\n`);
	process.exit(1);
});
