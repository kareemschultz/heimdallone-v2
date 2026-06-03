import { relations, sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";
import { leaveType } from "./leave";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 7I Leave Policy Engine / Statutory Policy Library
// ───────────────────────────────────────────────────────────────────

// How confident we are that a rule reflects real statute. A template can mix
// these across its rules (e.g. NIS-verified maternity beside needs_review annual).
export const leavePolicyVerificationStatusEnum = pgEnum(
	"leave_policy_verification_status",
	["verified", "needs_review", "draft", "deprecated"]
);

export const leavePolicyCategoryEnum = pgEnum("leave_policy_category", [
	"annual",
	"sick",
	"maternity",
	"paternity",
	"compassionate",
	"study",
	"unpaid",
	"special",
	"custom",
]);

export const leavePolicyEntitlementUnitEnum = pgEnum(
	"leave_policy_entitlement_unit",
	["days", "hours", "weeks"]
);

export const leavePolicyAccrualMethodEnum = pgEnum(
	"leave_policy_accrual_method",
	["upfront", "monthly", "yearly", "per_days_worked", "manual"]
);

// payroll-relevant treatment (kept distinct from entitlement SOURCE — see the
// GRA-vs-Labour-Act correction in leave-policy-engine-plan.md §1).
export const leavePolicyPayrollTreatmentEnum = pgEnum(
	"leave_policy_payroll_treatment",
	["paid_preserve", "unpaid_deduct", "nis_funded", "partial"]
);

export const leavePolicyStatusEnum = pgEnum("leave_policy_status", [
	"draft",
	"active",
	"archived",
]);

export const leaveCompanyOverrideModeEnum = pgEnum(
	"leave_company_override_mode",
	["statutory_only", "statutory_plus_company", "custom"]
);

// ───────────────────────────────────────────────────────────────────
// 1. leave_policy_template — a system or org-authored statutory blueprint
//    organizationId is NULLABLE: null = global/system template (seeded);
//    non-null = an org's own authored template.
// ───────────────────────────────────────────────────────────────────

export const leavePolicyTemplate = pgTable(
	"leave_policy_template",
	{
		id: cuid(),
		// Nullable on purpose — NOT orgRef() (which is notNull). null = system.
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "cascade",
		}),
		countryCode: text("country_code").notNull(),
		jurisdictionName: text("jurisdiction_name"),
		name: text("name").notNull(),
		description: text("description"),
		effectiveFrom: date("effective_from", { mode: "date" }),
		effectiveTo: date("effective_to", { mode: "date" }),
		verificationStatus: leavePolicyVerificationStatusEnum("verification_status")
			.default("draft")
			.notNull(),
		// Official-source metadata — no statutory value ships without this.
		sourceName: text("source_name"),
		sourceUrl: text("source_url"),
		sourceRetrievedAt: timestamp("source_retrieved_at"),
		lastReviewedAt: timestamp("last_reviewed_at"),
		isSystemTemplate: boolean("is_system_template").default(false).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("leave_policy_template_country_idx").on(t.countryCode),
		index("leave_policy_template_org_idx").on(t.organizationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. leave_policy_rule — one per leave type within a template
//    verificationStatus is PER-RULE so a template can mix confidence levels.
// ───────────────────────────────────────────────────────────────────

export const leavePolicyRule = pgTable(
	"leave_policy_rule",
	{
		id: cuid(),
		policyTemplateId: text("policy_template_id")
			.notNull()
			.references(() => leavePolicyTemplate.id, { onDelete: "cascade" }),
		leaveTypeName: text("leave_type_name").notNull(),
		leaveCategory: leavePolicyCategoryEnum("leave_category")
			.default("custom")
			.notNull(),
		isPaid: boolean("is_paid").default(true).notNull(),
		entitlementAmount: numeric("entitlement_amount", {
			precision: 6,
			scale: 2,
		}),
		entitlementUnit: leavePolicyEntitlementUnitEnum("entitlement_unit")
			.default("days")
			.notNull(),
		accrualMethod: leavePolicyAccrualMethodEnum("accrual_method")
			.default("yearly")
			.notNull(),
		accrualFrequency: text("accrual_frequency"),
		tenureMinMonths: integer("tenure_min_months"),
		tenureMaxMonths: integer("tenure_max_months"),
		probationEligible: boolean("probation_eligible").default(false).notNull(),
		// Used ONLY where a benefit is biologically scoped (e.g. NIS maternity).
		// Never for discriminatory gating of general leave. any|female|male.
		genderApplicability: text("gender_applicability"),
		requiresDocument: boolean("requires_document").default(false).notNull(),
		requiresApproval: boolean("requires_approval").default(true).notNull(),
		carryForwardAllowed: boolean("carry_forward_allowed")
			.default(false)
			.notNull(),
		carryForwardLimit: numeric("carry_forward_limit", {
			precision: 6,
			scale: 2,
		}),
		carryForwardExpiryDays: integer("carry_forward_expiry_days"),
		encashmentAllowed: boolean("encashment_allowed").default(false).notNull(),
		payrollTreatment: leavePolicyPayrollTreatmentEnum("payroll_treatment")
			.default("paid_preserve")
			.notNull(),
		taxTreatmentNote: text("tax_treatment_note"),
		verificationStatus: leavePolicyVerificationStatusEnum("verification_status")
			.default("draft")
			.notNull(),
		sourceUrl: text("source_url"),
		notes: text("notes"),
		...timestamps,
	},
	(t) => [
		index("leave_policy_rule_template_idx").on(t.policyTemplateId),
		index("leave_policy_rule_category_idx").on(t.leaveCategory),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. organization_leave_policy — an org's adopted or authored policy.
//    A snapshot of a template at adoption time (provenance via sourceTemplateId).
// ───────────────────────────────────────────────────────────────────

export const organizationLeavePolicy = pgTable(
	"organization_leave_policy",
	{
		id: cuid(),
		organizationId: orgRef(),
		// Provenance — null if fully custom. set null so deleting a system
		// template never cascades into an org's adopted (snapshotted) policy.
		sourceTemplateId: text("source_template_id").references(
			() => leavePolicyTemplate.id,
			{ onDelete: "set null" }
		),
		countryCode: text("country_code").notNull(),
		name: text("name").notNull(),
		effectiveFrom: date("effective_from", { mode: "date" }),
		status: leavePolicyStatusEnum("status").default("draft").notNull(),
		companyOverrideMode: leaveCompanyOverrideModeEnum("company_override_mode")
			.default("statutory_only")
			.notNull(),
		activatedByUserId: text("activated_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		activatedAt: timestamp("activated_at"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("org_leave_policy_org_idx").on(t.organizationId),
		index("org_leave_policy_org_status_idx").on(t.organizationId, t.status),
		// At most one ACTIVE policy per (org, country) among non-deleted rows —
		// the active statutory policy for a country must be unambiguous.
		uniqueIndex("org_leave_policy_active_country_uq")
			.on(t.organizationId, t.countryCode)
			.where(sql`${t.status} = 'active' and ${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. organization_leave_policy_rule — snapshotted, org-editable rule.
//    Copied from a template rule at adoption; system edits never touch it.
// ───────────────────────────────────────────────────────────────────

export const organizationLeavePolicyRule = pgTable(
	"organization_leave_policy_rule",
	{
		id: cuid(),
		organizationLeavePolicyId: text("organization_leave_policy_id")
			.notNull()
			.references(() => organizationLeavePolicy.id, { onDelete: "cascade" }),
		// Provenance to the template rule it was snapshotted from (set null so a
		// system-template edit/delete can never mutate the adopted copy).
		sourceRuleId: text("source_rule_id").references(() => leavePolicyRule.id, {
			onDelete: "set null",
		}),
		// Optional tie to a live configurable leave_type the org actually runs.
		linkedLeaveTypeId: text("linked_leave_type_id").references(
			() => leaveType.id,
			{ onDelete: "set null" }
		),
		leaveTypeName: text("leave_type_name").notNull(),
		leaveCategory: leavePolicyCategoryEnum("leave_category")
			.default("custom")
			.notNull(),
		isPaid: boolean("is_paid").default(true).notNull(),
		entitlementAmount: numeric("entitlement_amount", {
			precision: 6,
			scale: 2,
		}),
		entitlementUnit: leavePolicyEntitlementUnitEnum("entitlement_unit")
			.default("days")
			.notNull(),
		accrualMethod: leavePolicyAccrualMethodEnum("accrual_method")
			.default("yearly")
			.notNull(),
		accrualFrequency: text("accrual_frequency"),
		tenureMinMonths: integer("tenure_min_months"),
		tenureMaxMonths: integer("tenure_max_months"),
		probationEligible: boolean("probation_eligible").default(false).notNull(),
		genderApplicability: text("gender_applicability"),
		requiresDocument: boolean("requires_document").default(false).notNull(),
		requiresApproval: boolean("requires_approval").default(true).notNull(),
		carryForwardAllowed: boolean("carry_forward_allowed")
			.default(false)
			.notNull(),
		carryForwardLimit: numeric("carry_forward_limit", {
			precision: 6,
			scale: 2,
		}),
		carryForwardExpiryDays: integer("carry_forward_expiry_days"),
		encashmentAllowed: boolean("encashment_allowed").default(false).notNull(),
		payrollTreatment: leavePolicyPayrollTreatmentEnum("payroll_treatment")
			.default("paid_preserve")
			.notNull(),
		taxTreatmentNote: text("tax_treatment_note"),
		verificationStatus: leavePolicyVerificationStatusEnum("verification_status")
			.default("draft")
			.notNull(),
		sourceUrl: text("source_url"),
		// True once HR edits the snapshotted value away from its source.
		isCustomized: boolean("is_customized").default(false).notNull(),
		customOverrideNote: text("custom_override_note"),
		notes: text("notes"),
		...timestamps,
	},
	(t) => [
		index("org_leave_policy_rule_policy_idx").on(t.organizationLeavePolicyId),
		index("org_leave_policy_rule_category_idx").on(t.leaveCategory),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const leavePolicyTemplateRelations = relations(
	leavePolicyTemplate,
	({ many }) => ({
		rules: many(leavePolicyRule),
	})
);

export const leavePolicyRuleRelations = relations(
	leavePolicyRule,
	({ one }) => ({
		template: one(leavePolicyTemplate, {
			fields: [leavePolicyRule.policyTemplateId],
			references: [leavePolicyTemplate.id],
		}),
	})
);

export const organizationLeavePolicyRelations = relations(
	organizationLeavePolicy,
	({ one, many }) => ({
		sourceTemplate: one(leavePolicyTemplate, {
			fields: [organizationLeavePolicy.sourceTemplateId],
			references: [leavePolicyTemplate.id],
		}),
		rules: many(organizationLeavePolicyRule),
	})
);

export const organizationLeavePolicyRuleRelations = relations(
	organizationLeavePolicyRule,
	({ one }) => ({
		policy: one(organizationLeavePolicy, {
			fields: [organizationLeavePolicyRule.organizationLeavePolicyId],
			references: [organizationLeavePolicy.id],
		}),
		sourceRule: one(leavePolicyRule, {
			fields: [organizationLeavePolicyRule.sourceRuleId],
			references: [leavePolicyRule.id],
		}),
		linkedLeaveType: one(leaveType, {
			fields: [organizationLeavePolicyRule.linkedLeaveTypeId],
			references: [leaveType.id],
		}),
	})
);
