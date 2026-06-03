// Seed system (global) leave policy templates — Phase 7I.
//
// Idempotent: deletes existing SYSTEM templates (organization_id IS NULL) for the
// seeded countries (rules cascade) then re-inserts. Adopted org policies are
// unaffected — organization_leave_policy.source_template_id is ON DELETE SET NULL,
// so re-seeding never mutates a tenant's snapshotted policy (the snapshot rule).
//
// Statutory values are source-cited per rule. NIS maternity/sickness are
// `verified` from the official regulator; Guyana annual leave is `needs_review`
// (the primary Act PDF was not directly retrievable — see
// docs/architecture/leave-policy-engine-plan.md §2). Barbados/Trinidad/Jamaica are
// structure-only `draft` until researched against official sources.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-leave-policy.ts

import { createId } from "@paralleldrive/cuid2";
import { and, inArray, isNull } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import {
	leavePolicyRule,
	leavePolicyTemplate,
} from "../packages/db/src/schema/leave-policy";

const db = createDb();

const RETRIEVED = new Date("2026-06-03");
const COUNTRIES = ["GY", "BB", "TT", "JM"] as const;

// Official sources (Guyana).
const SRC_LEAVE_ACT = {
	name: "Leave with Pay Act, Cap. 99:02 (Ministry of Labour, Guyana)",
	url: "https://labour.gov.gy/wp-content/uploads/2022/12/Cap-9902-Holidays-with-Pay-Act.pdf",
};
const SRC_NIS_SICK = {
	name: "National Insurance Scheme (Guyana) — Sickness Benefit",
	url: "https://www.nis.org.gy/sickness_benefit",
};
const SRC_NIS_MAT = {
	name: "National Insurance Scheme (Guyana) — Maternity Benefit",
	url: "https://www.nis.org.gy/maternity_benefit",
};

interface RuleSeed {
	accrualFrequency?: string;
	accrualMethod:
		| "upfront"
		| "monthly"
		| "yearly"
		| "per_days_worked"
		| "manual";
	carryForwardAllowed?: boolean;
	encashmentAllowed?: boolean;
	entitlementAmount: string | null;
	entitlementUnit: "days" | "hours" | "weeks";
	genderApplicability?: string;
	isPaid: boolean;
	leaveCategory:
		| "annual"
		| "sick"
		| "maternity"
		| "paternity"
		| "compassionate"
		| "study"
		| "unpaid"
		| "special"
		| "custom";
	leaveTypeName: string;
	notes?: string;
	payrollTreatment:
		| "paid_preserve"
		| "unpaid_deduct"
		| "nis_funded"
		| "partial";
	probationEligible?: boolean;
	requiresDocument?: boolean;
	sourceUrl?: string;
	taxTreatmentNote?: string;
	tenureMinMonths?: number;
	verificationStatus: "verified" | "needs_review" | "draft" | "deprecated";
}

const GUYANA_RULES: RuleSeed[] = [
	{
		leaveTypeName: "Annual Leave",
		leaveCategory: "annual",
		isPaid: true,
		entitlementAmount: "12.00",
		entitlementUnit: "days",
		accrualMethod: "per_days_worked",
		accrualFrequency:
			"1 day per completed month (daily-paid: 1 per 20 days; hourly: 1 per 160 hrs)",
		tenureMinMonths: 6,
		probationEligible: false,
		carryForwardAllowed: true,
		encashmentAllowed: true,
		payrollTreatment: "paid_preserve",
		taxTreatmentNote:
			"Leave pay is normal taxable employment income (PAYE/NIS apply).",
		verificationStatus: "needs_review",
		sourceUrl: SRC_LEAVE_ACT.url,
		notes:
			"Base ~1 day per completed month (≈12/yr). Long service reportedly escalates toward ~24 days/yr after 10 years — CONFIRM tenure bands against the Act text. Statutory leave cannot be forfeited; carried over by agreement or paid on termination.",
	},
	{
		leaveTypeName: "Sick Leave (NIS Sickness Benefit)",
		leaveCategory: "sick",
		isPaid: true,
		entitlementAmount: "26.00",
		entitlementUnit: "weeks",
		accrualMethod: "manual",
		accrualFrequency: "per continuous incapacity",
		requiresDocument: true,
		payrollTreatment: "nis_funded",
		taxTreatmentNote:
			"Income replacement runs through NIS, not employer payroll. Employers often top up by collective agreement.",
		verificationStatus: "verified",
		sourceUrl: SRC_NIS_SICK.url,
		notes:
			"NIS pays from the 4th day of incapacity (first 3 days not paid by NIS), up to 26 weeks per continuous incapacity, at 70% of average weekly insurable earnings ÷ 6 per day. Eligibility: ≥50 contributions + ≥8 of preceding 13 contribution weeks. Statutory paid sick leave is not separately mandated by the Labour Act.",
	},
	{
		leaveTypeName: "Maternity Leave (NIS Maternity Allowance)",
		leaveCategory: "maternity",
		isPaid: true,
		entitlementAmount: "13.00",
		entitlementUnit: "weeks",
		accrualMethod: "upfront",
		genderApplicability: "female",
		requiresDocument: true,
		payrollTreatment: "nis_funded",
		taxTreatmentNote: "NIS-funded allowance; not employer payroll income.",
		verificationStatus: "verified",
		sourceUrl: SRC_NIS_MAT.url,
		notes:
			"NIS Maternity Allowance: 13 weeks (extendable +13 on complications) at 70% of average weekly insurable earnings; payable from up to 6 weeks before confinement. Maternity Grant $2,000. Eligibility: ≥15 contributions since entry + ≥7 of preceding 26 contribution weeks.",
	},
	{
		leaveTypeName: "Paternity Leave (company policy)",
		leaveCategory: "paternity",
		isPaid: true,
		entitlementAmount: null,
		entitlementUnit: "days",
		accrualMethod: "upfront",
		genderApplicability: "male",
		payrollTreatment: "paid_preserve",
		verificationStatus: "draft",
		notes:
			"No statutory paternity leave in Guyana. Company-policy suggestion only — set days per your policy. Not a legal entitlement.",
	},
	{
		leaveTypeName: "Compassionate / Bereavement (company policy)",
		leaveCategory: "compassionate",
		isPaid: true,
		entitlementAmount: "3.00",
		entitlementUnit: "days",
		accrualMethod: "upfront",
		payrollTreatment: "paid_preserve",
		verificationStatus: "draft",
		notes:
			"No specific statutory entitlement; common company practice (e.g. 3 days). Adjust per policy. Not a legal entitlement.",
	},
	{
		leaveTypeName: "Unpaid Leave",
		leaveCategory: "unpaid",
		isPaid: false,
		entitlementAmount: null,
		entitlementUnit: "days",
		accrualMethod: "manual",
		payrollTreatment: "unpaid_deduct",
		taxTreatmentNote: "Reduces pay per contract (deductLeaveFromBasicPay).",
		verificationStatus: "draft",
		notes:
			"Company-discretion unpaid leave. Reduces pay per existing payroll settings.",
	},
];

// Structure-only placeholders for other Caribbean baselines — NO source-backed
// values (the user's rule: seed official defaults only if source-backed).
function placeholderAnnualRule(country: string): RuleSeed {
	return {
		leaveTypeName: "Annual Leave",
		leaveCategory: "annual",
		isPaid: true,
		entitlementAmount: null,
		entitlementUnit: "days",
		accrualMethod: "yearly",
		payrollTreatment: "paid_preserve",
		verificationStatus: "draft",
		notes: `Structure only — research the official ${country} Holidays-with-Pay / Labour statute and NIS rules before seeding entitlement values. Not a legal entitlement.`,
	};
}

async function insertTemplate(args: {
	countryCode: string;
	jurisdictionName: string;
	name: string;
	description: string;
	verificationStatus: "verified" | "needs_review" | "draft" | "deprecated";
	sourceName?: string;
	sourceUrl?: string;
	rules: RuleSeed[];
}) {
	const templateId = createId();
	await db.insert(leavePolicyTemplate).values({
		id: templateId,
		organizationId: null,
		countryCode: args.countryCode,
		jurisdictionName: args.jurisdictionName,
		name: args.name,
		description: args.description,
		effectiveFrom: new Date("2026-01-01"),
		verificationStatus: args.verificationStatus,
		sourceName: args.sourceName ?? null,
		sourceUrl: args.sourceUrl ?? null,
		sourceRetrievedAt: args.sourceName ? RETRIEVED : null,
		lastReviewedAt: args.sourceName ? RETRIEVED : null,
		isSystemTemplate: true,
		isActive: true,
	});
	for (const r of args.rules) {
		await db.insert(leavePolicyRule).values({
			id: createId(),
			policyTemplateId: templateId,
			leaveTypeName: r.leaveTypeName,
			leaveCategory: r.leaveCategory,
			isPaid: r.isPaid,
			entitlementAmount: r.entitlementAmount,
			entitlementUnit: r.entitlementUnit,
			accrualMethod: r.accrualMethod,
			accrualFrequency: r.accrualFrequency ?? null,
			tenureMinMonths: r.tenureMinMonths ?? null,
			probationEligible: r.probationEligible ?? false,
			genderApplicability: r.genderApplicability ?? null,
			requiresDocument: r.requiresDocument ?? false,
			carryForwardAllowed: r.carryForwardAllowed ?? false,
			encashmentAllowed: r.encashmentAllowed ?? false,
			payrollTreatment: r.payrollTreatment,
			taxTreatmentNote: r.taxTreatmentNote ?? null,
			verificationStatus: r.verificationStatus,
			sourceUrl: r.sourceUrl ?? null,
			notes: r.notes ?? null,
		});
	}
	return templateId;
}

async function main() {
	// Idempotent reset: drop existing SYSTEM templates for these countries.
	// Rules cascade; adopted org policies keep their snapshot (source set null).
	await db
		.delete(leavePolicyTemplate)
		.where(
			and(
				isNull(leavePolicyTemplate.organizationId),
				inArray(leavePolicyTemplate.countryCode, [...COUNTRIES])
			)
		);

	await insertTemplate({
		countryCode: "GY",
		jurisdictionName: "Guyana",
		name: "Guyana statutory leave (2026)",
		description:
			"Statutory baseline for Guyana: Leave with Pay Act annual leave + NIS sickness/maternity income replacement, plus common company-policy suggestions. Verify with official guidance / a legal advisor before production use.",
		verificationStatus: "needs_review",
		sourceName: `${SRC_LEAVE_ACT.name}; ${SRC_NIS_SICK.name}; ${SRC_NIS_MAT.name}`,
		sourceUrl: SRC_LEAVE_ACT.url,
		rules: GUYANA_RULES,
	});

	await insertTemplate({
		countryCode: "BB",
		jurisdictionName: "Barbados",
		name: "Barbados statutory leave (draft)",
		description:
			"Structure-only placeholder. Research the Barbados Holidays with Pay Act / NIS before seeding values. Not legally verified.",
		verificationStatus: "draft",
		rules: [placeholderAnnualRule("Barbados")],
	});
	await insertTemplate({
		countryCode: "TT",
		jurisdictionName: "Trinidad & Tobago",
		name: "Trinidad & Tobago statutory leave (draft)",
		description:
			"Structure-only placeholder. Research the Minimum Wages Order / Maternity Protection Act / NIS before seeding values. Not legally verified.",
		verificationStatus: "draft",
		rules: [placeholderAnnualRule("Trinidad & Tobago")],
	});
	await insertTemplate({
		countryCode: "JM",
		jurisdictionName: "Jamaica",
		name: "Jamaica statutory leave (draft)",
		description:
			"Structure-only placeholder. Research the Holidays with Pay Act / NIS before seeding values. Not legally verified.",
		verificationStatus: "draft",
		rules: [placeholderAnnualRule("Jamaica")],
	});

	const tCount = await db.$count(
		leavePolicyTemplate,
		isNull(leavePolicyTemplate.organizationId)
	);
	const rCount = await db.$count(leavePolicyRule);
	console.log(
		`Leave policy seed complete: ${tCount} system templates (GY verified/needs_review, BB/TT/JM draft), ${rCount} rules total.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("seed failed:", err);
	process.exit(1);
});
