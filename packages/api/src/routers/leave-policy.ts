// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Leave Policy Engine oRPC router — Phase 7I.
 *
 *   templates           read the statutory/company policy library (system + org)
 *   orgPolicies         adopt (snapshot) / create / copy / edit rule / activate /
 *                       archive / compare-to-baseline an org's leave policy
 *   balanceExplanation  the employee "why this balance?" surface (self-scoped)
 *
 * Hard guardrails:
 *   - adoptTemplate COPIES the template's rules into org-owned rows. Later edits
 *     to a system template never mutate an adopted org policy (sourceTemplateId /
 *     sourceRuleId are ON DELETE SET NULL; there is no live read-through).
 *   - Statutory entitlement source = labour law / NIS, never GRA. payrollTreatment
 *     / taxTreatmentNote carry the payroll-relevant slice separately.
 *   - No statutory value is presented as legal certainty: verificationStatus +
 *     source metadata travel with every rule; unverified policies raise a warning.
 *   - Two-layer authz: tenant FK verify + manager-direct-report / employee-self
 *     scope on the balance explainer (IDOR-class).
 */

import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	leaveBalance,
	leaveRequest,
	leaveType,
} from "@Heimdallone/db/schema/leave";
import {
	leavePolicyRule,
	leavePolicyTemplate,
	organizationLeavePolicy,
	organizationLeavePolicyRule,
} from "@Heimdallone/db/schema/leave-policy";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
import { resolveLeavePolicyAsOf } from "../utils/leave-policy-resolver";
import {
	canManageLeavePolicy,
	canViewLeavePayrollTreatment,
	canViewLeavePolicy,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Fields copied verbatim from a template rule into an org policy rule (snapshot).
const RULE_SNAPSHOT_FIELDS = [
	"leaveTypeName",
	"leaveCategory",
	"isPaid",
	"entitlementAmount",
	"entitlementUnit",
	"accrualMethod",
	"accrualFrequency",
	"tenureMinMonths",
	"tenureMaxMonths",
	"probationEligible",
	"genderApplicability",
	"requiresDocument",
	"requiresApproval",
	"carryForwardAllowed",
	"carryForwardLimit",
	"carryForwardExpiryDays",
	"encashmentAllowed",
	"payrollTreatment",
	"taxTreatmentNote",
	"verificationStatus",
	"sourceUrl",
] as const;

// Rule fields HR may override on a snapshotted org rule.
const RULE_EDITABLE = z.object({
	leaveTypeName: z.string().min(1).max(120).optional(),
	isPaid: z.boolean().optional(),
	entitlementAmount: z.string().nullable().optional(),
	entitlementUnit: z.enum(["days", "hours", "weeks"]).optional(),
	accrualMethod: z
		.enum(["upfront", "monthly", "yearly", "per_days_worked", "manual"])
		.optional(),
	accrualFrequency: z.string().nullable().optional(),
	tenureMinMonths: z.number().int().min(0).nullable().optional(),
	tenureMaxMonths: z.number().int().min(0).nullable().optional(),
	probationEligible: z.boolean().optional(),
	requiresDocument: z.boolean().optional(),
	requiresApproval: z.boolean().optional(),
	carryForwardAllowed: z.boolean().optional(),
	carryForwardLimit: z.string().nullable().optional(),
	carryForwardExpiryDays: z.number().int().min(0).nullable().optional(),
	encashmentAllowed: z.boolean().optional(),
	payrollTreatment: z
		.enum(["paid_preserve", "unpaid_deduct", "nis_funded", "partial"])
		.optional(),
	taxTreatmentNote: z.string().nullable().optional(),
	customOverrideNote: z.string().nullable().optional(),
});

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers
// ────────────────────────────────────────────────────────────────────

/** A template is usable by the caller if it is a system template (org null) or
 *  belongs to the caller's org. */
async function verifyAdoptableTemplate(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(leavePolicyTemplate)
		.where(
			and(
				eq(leavePolicyTemplate.id, id),
				isNull(leavePolicyTemplate.deletedAt),
				or(
					isNull(leavePolicyTemplate.organizationId),
					eq(leavePolicyTemplate.organizationId, orgIdValue)
				)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Leave policy template not found.",
		});
	}
	return row;
}

async function verifyOrgPolicy(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(organizationLeavePolicy)
		.where(
			and(
				eq(organizationLeavePolicy.id, id),
				eq(organizationLeavePolicy.organizationId, orgIdValue),
				isNull(organizationLeavePolicy.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Leave policy not found.",
		});
	}
	return row;
}

/** Verify a snapshotted rule belongs to a policy owned by the caller's org. */
async function verifyOrgPolicyRule(orgIdValue: string, ruleId: string) {
	const [row] = await db
		.select({
			rule: organizationLeavePolicyRule,
			policyOrgId: organizationLeavePolicy.organizationId,
		})
		.from(organizationLeavePolicyRule)
		.innerJoin(
			organizationLeavePolicy,
			eq(
				organizationLeavePolicyRule.organizationLeavePolicyId,
				organizationLeavePolicy.id
			)
		)
		.where(eq(organizationLeavePolicyRule.id, ruleId))
		.limit(1);
	if (!row || row.policyOrgId !== orgIdValue) {
		throw new ORPCError("NOT_FOUND", {
			message: "Leave policy rule not found.",
		});
	}
	return row.rule;
}

async function getManagerDirectReportIds(
	orgIdValue: string,
	userId: string
): Promise<string[]> {
	const me = await resolveCurrentEmployee(orgIdValue, userId);
	if (!me) {
		return [];
	}
	const reports = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.innerJoin(
			employeeWorkInfo,
			eq(employeeProfile.id, employeeWorkInfo.employeeId)
		)
		.where(
			and(
				eq(employeeWorkInfo.reportingManagerId, me.id),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		);
	return reports.map((r) => r.id);
}

/** Copy a template's rules into org-owned snapshot rows. Runs inside a txn. */
async function snapshotTemplateRules(
	tx: Tx,
	templateId: string,
	orgPolicyId: string
): Promise<number> {
	const rules = await db
		.select()
		.from(leavePolicyRule)
		.where(eq(leavePolicyRule.policyTemplateId, templateId));
	for (const r of rules) {
		const snapshot: Record<string, unknown> = {
			id: createId(),
			organizationLeavePolicyId: orgPolicyId,
			sourceRuleId: r.id,
			isCustomized: false,
		};
		for (const f of RULE_SNAPSHOT_FIELDS) {
			snapshot[f] = (r as Record<string, unknown>)[f];
		}
		await tx.insert(organizationLeavePolicyRule).values(snapshot as never);
	}
	return rules.length;
}

// ════════════════════════════════════════════════════════════════════
// TEMPLATES (library — read only via API; system templates are seeded)
// ════════════════════════════════════════════════════════════════════

const templatesList = authorizedProcedure("leave_policy", "read")
	.input(z.object({ countryCode: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		if (!canViewLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const filters = [
			isNull(leavePolicyTemplate.deletedAt),
			// system templates (org null) + this org's authored templates
			or(
				isNull(leavePolicyTemplate.organizationId),
				eq(leavePolicyTemplate.organizationId, oid)
			),
		];
		if (input?.countryCode) {
			filters.push(eq(leavePolicyTemplate.countryCode, input.countryCode));
		}
		const templates = await db
			.select()
			.from(leavePolicyTemplate)
			.where(and(...filters))
			.orderBy(
				desc(leavePolicyTemplate.isSystemTemplate),
				leavePolicyTemplate.countryCode
			);
		const counts = await db
			.select({
				templateId: leavePolicyRule.policyTemplateId,
				value: count(),
			})
			.from(leavePolicyRule)
			.groupBy(leavePolicyRule.policyTemplateId);
		const countMap = new Map(
			counts.map((c) => [c.templateId, Number(c.value)])
		);
		return templates.map((t) => ({
			...t,
			ruleCount: countMap.get(t.id) ?? 0,
		}));
	});

const templatesGetById = authorizedProcedure("leave_policy", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewLeavePolicy(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const template = await verifyAdoptableTemplate(orgId(context), input.id);
		const rules = await db
			.select()
			.from(leavePolicyRule)
			.where(eq(leavePolicyRule.policyTemplateId, template.id))
			.orderBy(leavePolicyRule.leaveCategory);
		const showTreatment = canViewLeavePayrollTreatment(callerRole);
		return {
			...template,
			rules: rules.map((r) =>
				showTreatment
					? r
					: { ...r, payrollTreatment: null, taxTreatmentNote: null }
			),
		};
	});

// ════════════════════════════════════════════════════════════════════
// ORG POLICIES
// ════════════════════════════════════════════════════════════════════

const orgPoliciesList = authorizedProcedure("leave_policy", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		if (!canViewLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		return await db
			.select()
			.from(organizationLeavePolicy)
			.where(
				and(
					eq(organizationLeavePolicy.organizationId, orgId(context)),
					isNull(organizationLeavePolicy.deletedAt)
				)
			)
			.orderBy(desc(organizationLeavePolicy.createdAt));
	});

const orgPoliciesGetById = authorizedProcedure("leave_policy", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewLeavePolicy(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const policy = await verifyOrgPolicy(orgId(context), input.id);
		const rules = await db
			.select()
			.from(organizationLeavePolicyRule)
			.where(
				eq(organizationLeavePolicyRule.organizationLeavePolicyId, policy.id)
			)
			.orderBy(organizationLeavePolicyRule.leaveCategory);
		const showTreatment = canViewLeavePayrollTreatment(callerRole);
		return {
			...policy,
			rules: rules.map((r) =>
				showTreatment
					? r
					: { ...r, payrollTreatment: null, taxTreatmentNote: null }
			),
		};
	});

const orgPoliciesAdoptTemplate = authorizedProcedure("leave_policy", "adopt")
	.input(
		z.object({ templateId: z.string(), name: z.string().max(160).optional() })
	)
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const template = await verifyAdoptableTemplate(oid, input.templateId);
		const policyId = createId();
		const ruleCount = await db.transaction(async (tx) => {
			await tx.insert(organizationLeavePolicy).values({
				id: policyId,
				organizationId: oid,
				sourceTemplateId: template.id,
				countryCode: template.countryCode,
				name: input.name ?? template.name,
				effectiveFrom: template.effectiveFrom,
				status: "draft",
				companyOverrideMode: "statutory_only",
			});
			return await snapshotTemplateRules(tx, template.id, policyId);
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy",
			entityId: policyId,
			action: "create",
			actorId: actorId(context),
			metadata: { adoptedTemplateId: template.id, ruleCount },
		});
		return { id: policyId, ruleCount };
	});

const orgPoliciesCreateCustom = authorizedProcedure("leave_policy", "create")
	.input(
		z.object({
			name: z.string().min(1).max(160),
			countryCode: z.string().min(2).max(3),
			effectiveFrom: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const id = createId();
		await db.insert(organizationLeavePolicy).values({
			id,
			organizationId: oid,
			sourceTemplateId: null,
			countryCode: input.countryCode,
			name: input.name,
			effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
			status: "draft",
			companyOverrideMode: "custom",
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { custom: true },
		});
		return { id };
	});

const orgPoliciesCopyFrom = authorizedProcedure("leave_policy", "create")
	.input(
		z.object({ sourcePolicyId: z.string(), name: z.string().min(1).max(160) })
	)
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const source = await verifyOrgPolicy(oid, input.sourcePolicyId);
		const sourceRules = await db
			.select()
			.from(organizationLeavePolicyRule)
			.where(
				eq(organizationLeavePolicyRule.organizationLeavePolicyId, source.id)
			);
		const newId = createId();
		await db.transaction(async (tx) => {
			await tx.insert(organizationLeavePolicy).values({
				id: newId,
				organizationId: oid,
				sourceTemplateId: source.sourceTemplateId,
				countryCode: source.countryCode,
				name: input.name,
				effectiveFrom: source.effectiveFrom,
				status: "draft",
				companyOverrideMode: source.companyOverrideMode,
			});
			for (const r of sourceRules) {
				const { id: _drop, organizationLeavePolicyId: _drop2, ...rest } = r;
				await tx.insert(organizationLeavePolicyRule).values({
					...rest,
					id: createId(),
					organizationLeavePolicyId: newId,
				} as never);
			}
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy",
			entityId: newId,
			action: "create",
			actorId: actorId(context),
			metadata: { copiedFrom: source.id },
		});
		return { id: newId };
	});

const orgPoliciesUpdateRule = authorizedProcedure("leave_policy", "update")
	.input(z.object({ ruleId: z.string(), patch: RULE_EDITABLE }))
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyOrgPolicyRule(oid, input.ruleId);
		const patch: Record<string, unknown> = {
			updatedAt: new Date(),
			isCustomized: true,
		};
		for (const [k, v] of Object.entries(input.patch)) {
			if (v !== undefined) {
				patch[k] = v;
			}
		}
		await db
			.update(organizationLeavePolicyRule)
			.set(patch)
			.where(eq(organizationLeavePolicyRule.id, input.ruleId));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy_rule",
			entityId: input.ruleId,
			action: "update",
			actorId: actorId(context),
			metadata: { customized: true },
		});
		return { id: input.ruleId };
	});

const orgPoliciesActivate = authorizedProcedure("leave_policy", "activate")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const policy = await verifyOrgPolicy(oid, input.id);
		if (policy.status === "active") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This policy is already active.",
			});
		}
		const now = new Date();
		try {
			await db
				.update(organizationLeavePolicy)
				.set({
					status: "active",
					activatedByUserId: actorId(context),
					activatedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(organizationLeavePolicy.id, input.id),
						eq(organizationLeavePolicy.organizationId, oid)
					)
				);
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: `Another ${policy.countryCode} leave policy is already active. Archive it first.`,
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "activate" },
		});
		return { id: input.id };
	});

const orgPoliciesArchive = authorizedProcedure("leave_policy", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyOrgPolicy(oid, input.id);
		await db
			.update(organizationLeavePolicy)
			.set({ status: "archived", updatedAt: new Date() })
			.where(
				and(
					eq(organizationLeavePolicy.id, input.id),
					eq(organizationLeavePolicy.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "organization_leave_policy",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const COMPARE_FIELDS = [
	"entitlementAmount",
	"entitlementUnit",
	"accrualMethod",
	"isPaid",
	"carryForwardAllowed",
	"carryForwardLimit",
	"encashmentAllowed",
	"payrollTreatment",
] as const;

const orgPoliciesCompareToBaseline = authorizedProcedure("leave_policy", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyOrgPolicy(oid, input.id);
		const rows = await db
			.select({
				orgRule: organizationLeavePolicyRule,
				baseline: leavePolicyRule,
			})
			.from(organizationLeavePolicyRule)
			.leftJoin(
				leavePolicyRule,
				eq(organizationLeavePolicyRule.sourceRuleId, leavePolicyRule.id)
			)
			.where(
				eq(organizationLeavePolicyRule.organizationLeavePolicyId, input.id)
			);

		return rows.map(({ orgRule, baseline }) => {
			const differences: {
				field: string;
				baseline: unknown;
				current: unknown;
			}[] = [];
			if (baseline) {
				for (const f of COMPARE_FIELDS) {
					const b = (baseline as Record<string, unknown>)[f];
					const c = (orgRule as Record<string, unknown>)[f];
					if (b !== c) {
						differences.push({ field: f, baseline: b, current: c });
					}
				}
			}
			return {
				ruleId: orgRule.id,
				leaveTypeName: orgRule.leaveTypeName,
				leaveCategory: orgRule.leaveCategory,
				isCustomized: orgRule.isCustomized,
				hasBaseline: baseline !== null,
				differences,
			};
		});
	});

// ════════════════════════════════════════════════════════════════════
// POLICY HEALTH (soft warnings — never blocks payroll, never changes pay)
// ════════════════════════════════════════════════════════════════════

const NEEDS_REVIEW_MESSAGE =
	"This policy needs official review before production use.";
const NO_POLICY_MESSAGE =
	"No active company leave policy is set. Balances reflect your configured leave types only.";

/**
 * Read-only health of the org's ACTIVE leave policy. Powers soft "needs official
 * review" warnings across the leave + payroll surfaces. Purely informational — it
 * never alters paid/unpaid calculations and never blocks payroll.
 */
async function getPolicyHealth(orgIdValue: string, asOf: Date = new Date()) {
	// Resolve the policy in force on `asOf` (default: today) by date — not by the
	// `status = 'active'` flag alone (21G-D). Default today returns the current
	// active policy in normal data; passing a historical date resolves the policy
	// that governed then, preserving historical behaviour.
	const active = await resolveLeavePolicyAsOf({
		organizationId: orgIdValue,
		asOf,
	});

	if (!active) {
		return {
			hasActivePolicy: false,
			activePolicy: null,
			activePolicyId: null,
			activePolicyName: null,
			totalRules: 0,
			needsReviewRules: 0,
			draftRules: 0,
			verifiedRules: 0,
			needsReview: false,
			message: NO_POLICY_MESSAGE,
		};
	}

	const rules = await db
		.select({ vs: organizationLeavePolicyRule.verificationStatus })
		.from(organizationLeavePolicyRule)
		.where(
			eq(organizationLeavePolicyRule.organizationLeavePolicyId, active.id)
		);
	const needsReviewRules = rules.filter((r) => r.vs === "needs_review").length;
	const draftRules = rules.filter((r) => r.vs === "draft").length;
	const verifiedRules = rules.filter((r) => r.vs === "verified").length;
	const needsReview = needsReviewRules + draftRules > 0;

	return {
		hasActivePolicy: true,
		activePolicy: active,
		activePolicyId: active.id,
		activePolicyName: active.name,
		totalRules: rules.length,
		needsReviewRules,
		draftRules,
		verifiedRules,
		needsReview,
		message: needsReview ? NEEDS_REVIEW_MESSAGE : null,
	};
}

const orgPoliciesHealth = authorizedProcedure("leave_policy", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		if (!canViewLeavePolicy(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const h = await getPolicyHealth(orgId(context));
		// Don't leak the full row — return the summary only.
		return {
			hasActivePolicy: h.hasActivePolicy,
			activePolicyId: h.activePolicyId,
			activePolicyName: h.activePolicyName,
			totalRules: h.totalRules,
			needsReviewRules: h.needsReviewRules,
			draftRules: h.draftRules,
			verifiedRules: h.verifiedRules,
			needsReview: h.needsReview,
			message: h.message,
		};
	});

// ════════════════════════════════════════════════════════════════════
// BALANCE EXPLANATION (employee "why this balance?")
// ════════════════════════════════════════════════════════════════════

async function buildBalanceExplanation(orgIdValue: string, employeeId: string) {
	const balances = await db
		.select({
			leaveTypeId: leaveBalance.leaveTypeId,
			leaveTypeName: leaveType.name,
			isPaid: leaveType.isPaid,
			available: leaveBalance.availableDays,
			used: leaveBalance.usedDays,
			carryForward: leaveBalance.carryForwardDays,
			expiryDate: leaveBalance.expiryDate,
			accrualAmount: leaveType.accrualAmount,
			accrualPeriod: leaveType.accrualPeriod,
		})
		.from(leaveBalance)
		.innerJoin(leaveType, eq(leaveBalance.leaveTypeId, leaveType.id))
		.where(
			and(
				eq(leaveBalance.employeeId, employeeId),
				eq(leaveType.organizationId, orgIdValue)
			)
		);

	// Pending days per leave type (requested, not yet approved).
	const pendingRows = await db
		.select({
			leaveTypeId: leaveRequest.leaveTypeId,
			pending: sql<string>`coalesce(sum(${leaveRequest.requestedDays}), 0)`,
		})
		.from(leaveRequest)
		.where(
			and(
				eq(leaveRequest.organizationId, orgIdValue),
				eq(leaveRequest.employeeId, employeeId),
				eq(leaveRequest.status, "requested")
			)
		)
		.groupBy(leaveRequest.leaveTypeId);
	const pendingMap = new Map(
		pendingRows.map((p) => [p.leaveTypeId, Number(p.pending)])
	);

	// Active org policy (informational context) — at most one active per country.
	const health = await getPolicyHealth(orgIdValue);
	const activePolicy = health.activePolicy;

	const balanceLines = balances.map((b) => {
		const pending = pendingMap.get(b.leaveTypeId) ?? 0;
		const carry = Number(b.carryForward);
		const explanation =
			`You have ${b.available} day(s) available` +
			(carry > 0 ? `, including ${carry} carried forward` : "") +
			`. You have used ${b.used} day(s)` +
			(pending > 0 ? ` and have ${pending} day(s) pending approval` : "") +
			`. Leave accrues ${b.accrualAmount} day(s) per ${b.accrualPeriod}` +
			(b.expiryDate ? `; carried-forward days expire on ${b.expiryDate}` : "") +
			".";
		return {
			leaveTypeName: b.leaveTypeName,
			isPaid: b.isPaid,
			available: b.available,
			used: b.used,
			carryForward: b.carryForward,
			pending,
			expiryDate: b.expiryDate,
			accrualAmount: b.accrualAmount,
			accrualPeriod: b.accrualPeriod,
			explanation,
		};
	});

	return {
		policy: activePolicy
			? {
					name: activePolicy.name,
					effectiveFrom: activePolicy.effectiveFrom,
					countryCode: activePolicy.countryCode,
				}
			: null,
		// Surfaced as soft notices in the UI; never block anything, never change pay.
		policyNotice: activePolicy ? null : NO_POLICY_MESSAGE,
		// Set when the active policy still has needs_review/draft rules.
		unverifiedNotice: health.needsReview ? NEEDS_REVIEW_MESSAGE : null,
		balances: balanceLines,
	};
}

const balanceExplanationForSelf = authorizedProcedure("leave_request", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return {
				policy: null,
				policyNotice: null,
				unverifiedNotice: null,
				balances: [],
			};
		}
		return await buildBalanceExplanation(oid, me.id);
	});

const balanceExplanationForEmployee = authorizedProcedure(
	"leave_request",
	"read"
)
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const isSelf = me?.id === input.employeeId;
		if (!isSelf) {
			if (canViewLeavePolicy(callerRole) && callerRole !== "manager") {
				// HR/admin/payroll/auditor — any employee in org
			} else if (callerRole === "manager") {
				const reportIds = await getManagerDirectReportIds(
					oid,
					actorId(context)
				);
				if (!reportIds.includes(input.employeeId)) {
					throw new ORPCError("FORBIDDEN", {
						message:
							"You can only view leave balances for your direct reports.",
					});
				}
			} else {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only view your own leave balance.",
				});
			}
		}
		// Confirm the employee is in this org before returning anything.
		const [emp] = await db
			.select({ id: employeeProfile.id })
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, oid)
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}
		return await buildBalanceExplanation(oid, input.employeeId);
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const leavePolicyRouter = {
	templates: {
		list: templatesList,
		getById: templatesGetById,
	},
	orgPolicies: {
		list: orgPoliciesList,
		getById: orgPoliciesGetById,
		adoptTemplate: orgPoliciesAdoptTemplate,
		createCustom: orgPoliciesCreateCustom,
		copyFrom: orgPoliciesCopyFrom,
		updateRule: orgPoliciesUpdateRule,
		activate: orgPoliciesActivate,
		archive: orgPoliciesArchive,
		compareToBaseline: orgPoliciesCompareToBaseline,
		health: orgPoliciesHealth,
	},
	balanceExplanation: {
		forSelf: balanceExplanationForSelf,
		forEmployee: balanceExplanationForEmployee,
	},
};
