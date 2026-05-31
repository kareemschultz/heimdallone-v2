// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check, but TS can't tell

/**
 * Recruitment oRPC router — Phase 9C.
 *
 * Scope (per docs/architecture/recruitment-onboarding-implementation-plan.md
 * sections 3 + 7):
 *
 *   - requisitions          create / approve lifecycle
 *   - jobs (openings)       open / pause / close lifecycle
 *   - candidates            person record + email normalization
 *   - applications          per-(candidate, opening) lifecycle with stage history
 *   - interviews            scheduling + lifecycle
 *   - interview feedback    one row per interviewer; rating 1–5
 *   - offers                draft → approved → sent → accepted/rejected/expired
 *   - offer approvals       single or multi-step (sequence column shipped)
 *   - candidate documents   file metadata (storage abstraction)
 *   - recruitment notes     internal-only
 *
 * Out of scope (deliberately deferred):
 *   - recruitment.candidates.convertToEmployee  → Phase 9H
 *   - public careers page                       → Phase 14+
 *   - email automation / e-sign                 → Phase 14+
 *
 * Privacy rules enforced in this file:
 *   - candidate.email is lowercased+trimmed on create/update
 *   - rows with deletedAt are excluded from default lists
 *   - offer.baseAmount / variableAmount are stripped from output when the
 *     caller does NOT pass canManagePayroll(role)
 *   - candidate.dateOfBirth / gender / address are stripped for callers
 *     who pass canViewRecruitment but NOT canManageRecruitment
 *
 * Tenant-FK invariants (Phase 8I lesson #46):
 *   - Every input ID is verified against organization_id before any
 *     subsequent mutation. The helpers below (verifyJobOpening,
 *     verifyApplication, verifyOffer, ...) are the SINGLE choke point.
 *   - UPDATE/DELETE statements keep org_id in the WHERE clause even after
 *     the verify, as defense in depth.
 *   - JSON arrays of FK IDs (interviewerEmployeeIds) are validated to
 *     belong to the same tenant before being stored.
 */

import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	employeeOnboarding,
	onboardingActivity,
	onboardingTask,
	onboardingTemplate,
	onboardingTemplateTask,
} from "@Heimdallone/db/schema/onboarding";
import {
	applicationStageHistory,
	candidate,
	candidateApplication,
	candidateDocument,
	interview,
	interviewFeedback,
	jobOpening,
	offer,
	offerApproval,
	recruitmentNote,
	recruitmentRequisition,
} from "@Heimdallone/db/schema/recruitment";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
import {
	canManagePayroll,
	canManageRecruitment,
	canViewRecruitment,
	isOwnerOrAdmin,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every FK input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyRequisition(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(recruitmentRequisition)
		.where(
			and(
				eq(recruitmentRequisition.id, id),
				eq(recruitmentRequisition.organizationId, orgIdValue),
				isNull(recruitmentRequisition.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Hiring request not found." });
	}
	return row;
}

async function verifyJobOpening(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(jobOpening)
		.where(
			and(
				eq(jobOpening.id, id),
				eq(jobOpening.organizationId, orgIdValue),
				isNull(jobOpening.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Job opening not found." });
	}
	return row;
}

async function verifyCandidate(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(candidate)
		.where(
			and(
				eq(candidate.id, id),
				eq(candidate.organizationId, orgIdValue),
				isNull(candidate.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Candidate not found." });
	}
	return row;
}

async function verifyApplication(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(candidateApplication)
		.where(
			and(
				eq(candidateApplication.id, id),
				eq(candidateApplication.organizationId, orgIdValue),
				isNull(candidateApplication.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Application not found." });
	}
	return row;
}

async function verifyInterview(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(interview)
		.where(
			and(
				eq(interview.id, id),
				eq(interview.organizationId, orgIdValue),
				isNull(interview.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Interview not found." });
	}
	return row;
}

async function verifyOffer(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offer)
		.where(
			and(
				eq(offer.id, id),
				eq(offer.organizationId, orgIdValue),
				isNull(offer.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Offer not found." });
	}
	return row;
}

// Manager scoping (Phase 9C security review):
// A user with role `manager` may only see opening-related data for openings
// they manage (`jobOpening.hiringManagerEmployeeId === resolveCurrentEmployee.id`).
// These two helpers narrow lists and individual reads accordingly. Recruiter /
// HR / admin / owner / auditor are unaffected — they see all org data.
async function getManagerOpeningIds(
	orgIdValue: string,
	actorIdValue: string
): Promise<string[]> {
	const me = await resolveCurrentEmployee(orgIdValue, actorIdValue);
	if (!me) {
		return [];
	}
	const rows = await db
		.select({ id: jobOpening.id })
		.from(jobOpening)
		.where(
			and(
				eq(jobOpening.organizationId, orgIdValue),
				eq(jobOpening.hiringManagerEmployeeId, me.id),
				isNull(jobOpening.deletedAt)
			)
		);
	return rows.map((r) => r.id);
}

async function ensureManagerCanAccessOpening(
	orgIdValue: string,
	actorIdValue: string,
	roleValue: string,
	jobOpeningId: string
): Promise<void> {
	if (roleValue !== "manager") {
		return;
	}
	const me = await resolveCurrentEmployee(orgIdValue, actorIdValue);
	if (!me) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only view openings you manage.",
		});
	}
	const [opening] = await db
		.select({ hiringManagerEmployeeId: jobOpening.hiringManagerEmployeeId })
		.from(jobOpening)
		.where(
			and(
				eq(jobOpening.id, jobOpeningId),
				eq(jobOpening.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!opening || opening.hiringManagerEmployeeId !== me.id) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only view openings you manage.",
		});
	}
}

async function verifyEmployeeInOrg(
	orgIdValue: string,
	employeeId: string
): Promise<void> {
	const [emp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.id, employeeId),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!emp) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Employee ${employeeId} is not part of this organization.`,
		});
	}
}

async function verifyEmployeesInOrg(
	orgIdValue: string,
	employeeIds: readonly string[]
): Promise<void> {
	if (employeeIds.length === 0) {
		return;
	}
	const found = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				inArray(employeeProfile.id, [...employeeIds]),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		);
	const foundIds = new Set(found.map((e) => e.id));
	const missing = employeeIds.filter((id) => !foundIds.has(id));
	if (missing.length > 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Some employees are not in this organization: ${missing.join(", ")}`,
		});
	}
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// Roles that may see full offer compensation. Mirrors the contracts-spec
// salary-visibility rule — only payroll-capable users see raw amounts.
function canSeeOfferCompensation(r: string): boolean {
	return canManagePayroll(r);
}

// Strip compensation fields from offers returned to non-payroll roles.
function redactOfferCompensation<T extends Record<string, unknown>>(
	row: T,
	r: string
): T {
	if (canSeeOfferCompensation(r)) {
		return row;
	}
	return {
		...row,
		baseAmount: null,
		variableAmount: null,
	};
}

// Stored-XSS hardening: offer letters, résumés, portfolios and document URLs
// are rendered as anchor hrefs in the UI. Reject anything that isn't an
// http(s) URL so a javascript:/data: scheme can never be persisted (the UI
// also re-checks at render time — see apps/web/src/lib/safe-url.ts).
function isHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}
const httpUrlString = z
	.string()
	.refine(isHttpUrl, { message: "Must be an http(s) URL." });

// Candidates carry sensitive PII (DOB, gender, address). Recruiters + HR see
// everything; everyone else (e.g. manager / auditor) only sees the
// non-sensitive subset.
function redactCandidateSensitive<T extends Record<string, unknown>>(
	row: T,
	r: string
): T {
	if (canManageRecruitment(r)) {
		return row;
	}
	return {
		...row,
		dateOfBirth: null,
		gender: null,
		address: null,
	};
}

// Terminal application states. Going backwards from these requires an
// owner/admin override AND writes an audit row with the override flag.
const TERMINAL_APPLICATION_STAGES = new Set(["hired", "rejected", "withdrawn"]);

// Terminal interview states.
const TERMINAL_INTERVIEW_STATUSES = new Set([
	"completed",
	"cancelled",
	"no_show",
]);

// Terminal offer states are enforced inline by the per-transition
// `allowedFrom` whitelists in `offerTransition`.

// ════════════════════════════════════════════════════════════════════
// REQUISITIONS — request to hire (approval gate)
// ════════════════════════════════════════════════════════════════════

const requisitionsList = authorizedProcedure("posting", "read")
	.input(
		z.object({
			status: z
				.enum([
					"draft",
					"pending_approval",
					"approved",
					"rejected",
					"cancelled",
				])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(recruitmentRequisition.organizationId, orgId(context)),
			isNull(recruitmentRequisition.deletedAt),
		];
		if (input.status) {
			filters.push(eq(recruitmentRequisition.status, input.status));
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(recruitmentRequisition)
			.where(and(...filters))
			.orderBy(desc(recruitmentRequisition.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(recruitmentRequisition)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const requisitionsGet = authorizedProcedure("posting", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		return await verifyRequisition(orgId(context), input.id);
	});

const requisitionsCreate = authorizedProcedure("posting", "create")
	.input(
		z.object({
			title: z.string().min(1).max(255),
			description: z.string().optional(),
			jobPositionId: z.string().nullable().optional(),
			departmentId: z.string().nullable().optional(),
			headcount: z.number().int().min(1).default(1),
			requestedByEmployeeId: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyEmployeeInOrg(orgId(context), input.requestedByEmployeeId);
		const id = createId();
		await db.insert(recruitmentRequisition).values({
			id,
			organizationId: orgId(context),
			title: input.title,
			description: input.description ?? null,
			jobPositionId: input.jobPositionId ?? null,
			departmentId: input.departmentId ?? null,
			headcount: input.headcount,
			requestedByEmployeeId: input.requestedByEmployeeId,
			status: "draft",
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const requisitionsUpdate = authorizedProcedure("posting", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).optional(),
			description: z.string().optional(),
			headcount: z.number().int().min(1).optional(),
			jobPositionId: z.string().nullable().optional(),
			departmentId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyRequisition(orgId(context), input.id);
		if (existing.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only draft hiring requests can be edited.",
			});
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.title !== undefined) {
			patch.title = input.title;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.headcount !== undefined) {
			patch.headcount = input.headcount;
		}
		if (input.jobPositionId !== undefined) {
			patch.jobPositionId = input.jobPositionId;
		}
		if (input.departmentId !== undefined) {
			patch.departmentId = input.departmentId;
		}
		await db
			.update(recruitmentRequisition)
			.set(patch)
			.where(
				and(
					eq(recruitmentRequisition.id, input.id),
					eq(recruitmentRequisition.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const requisitionsSubmit = authorizedProcedure("posting", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyRequisition(orgId(context), input.id);
		if (existing.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only draft hiring requests can be submitted.",
			});
		}
		await db
			.update(recruitmentRequisition)
			.set({ status: "pending_approval", updatedAt: new Date() })
			.where(eq(recruitmentRequisition.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "draft", newValue: "pending_approval" },
			],
		});
		return { id: input.id };
	});

const requisitionsApprove = authorizedProcedure("posting", "publish")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		// Owner / admin / HR only.
		if (!isOwnerOrAdmin(role(context)) && role(context) !== "hr_admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Only owner / admin / HR can approve hiring requests.",
			});
		}
		const existing = await verifyRequisition(orgId(context), input.id);
		if (existing.status !== "pending_approval") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only pending requests can be approved.",
			});
		}
		await db
			.update(recruitmentRequisition)
			.set({
				status: "approved",
				approvedByUserId: actorId(context),
				approvedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(recruitmentRequisition.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "status",
					oldValue: "pending_approval",
					newValue: "approved",
				},
			],
		});
		return { id: input.id };
	});

const requisitionsReject = authorizedProcedure("posting", "publish")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!isOwnerOrAdmin(role(context)) && role(context) !== "hr_admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Only owner / admin / HR can reject hiring requests.",
			});
		}
		const existing = await verifyRequisition(orgId(context), input.id);
		if (existing.status !== "pending_approval") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only pending requests can be rejected.",
			});
		}
		await db
			.update(recruitmentRequisition)
			.set({
				status: "rejected",
				rejectedReason: input.reason,
				updatedAt: new Date(),
			})
			.where(eq(recruitmentRequisition.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "status",
					oldValue: "pending_approval",
					newValue: "rejected",
				},
			],
			metadata: { rejectedReason: input.reason },
		});
		return { id: input.id };
	});

const requisitionsCancel = authorizedProcedure("posting", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyRequisition(orgId(context), input.id);
		if (existing.status === "cancelled" || existing.status === "rejected") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Hiring request is already terminal.",
			});
		}
		await db
			.update(recruitmentRequisition)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(eq(recruitmentRequisition.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "cancelled" },
			],
		});
		return { id: input.id };
	});

const requisitionsDelete = authorizedProcedure("posting", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyRequisition(orgId(context), input.id);
		await db
			.update(recruitmentRequisition)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(recruitmentRequisition.id, input.id),
					eq(recruitmentRequisition.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_requisition",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// JOB OPENINGS
// ════════════════════════════════════════════════════════════════════

const jobsList = authorizedProcedure("posting", "read")
	.input(
		z.object({
			status: z
				.enum(["draft", "open", "paused", "closed", "cancelled"])
				.optional(),
			myOpeningsOnly: z.boolean().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(jobOpening.organizationId, orgId(context)),
			isNull(jobOpening.deletedAt),
		];
		if (input.status) {
			filters.push(eq(jobOpening.status, input.status));
		}
		// If caller is a manager OR explicitly asked, scope to their openings.
		const isManagerOnly =
			role(context) === "manager" || input.myOpeningsOnly === true;
		if (isManagerOnly) {
			const me = await resolveCurrentEmployee(orgId(context), actorId(context));
			if (me) {
				filters.push(eq(jobOpening.hiringManagerEmployeeId, me.id));
			} else {
				// Manager without an employee profile sees nothing.
				return { data: [], total: 0, page: input.page };
			}
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(jobOpening)
			.where(and(...filters))
			.orderBy(desc(jobOpening.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(jobOpening)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const jobsGet = authorizedProcedure("posting", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const job = await verifyJobOpening(orgId(context), input.id);
		// Managers can only read openings they manage.
		if (role(context) === "manager") {
			const me = await resolveCurrentEmployee(orgId(context), actorId(context));
			if (!me || job.hiringManagerEmployeeId !== me.id) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only view openings you manage.",
				});
			}
		}
		return job;
	});

const jobsCreate = authorizedProcedure("posting", "create")
	.input(
		z.object({
			requisitionId: z.string().nullable().optional(),
			title: z.string().min(1).max(255),
			description: z.string().optional(),
			jobPositionId: z.string().nullable().optional(),
			departmentId: z.string().nullable().optional(),
			workLocation: z.string().optional(),
			employmentType: z.string().optional(),
			vacancyCount: z.number().int().min(1).default(1),
			hiringManagerEmployeeId: z.string().nullable().optional(),
			recruiterUserId: z.string().nullable().optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		if (input.requisitionId) {
			const req = await verifyRequisition(orgId(context), input.requisitionId);
			if (req.status !== "approved") {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						"Hiring request must be approved before creating a job opening.",
				});
			}
		}
		if (input.hiringManagerEmployeeId) {
			await verifyEmployeeInOrg(orgId(context), input.hiringManagerEmployeeId);
		}
		const id = createId();
		await db.insert(jobOpening).values({
			id,
			organizationId: orgId(context),
			requisitionId: input.requisitionId ?? null,
			title: input.title,
			description: input.description ?? null,
			jobPositionId: input.jobPositionId ?? null,
			departmentId: input.departmentId ?? null,
			workLocation: input.workLocation ?? null,
			employmentType: input.employmentType ?? null,
			vacancyCount: input.vacancyCount,
			hiringManagerEmployeeId: input.hiringManagerEmployeeId ?? null,
			recruiterUserId: input.recruiterUserId ?? null,
			status: "draft",
			startDate: input.startDate ?? null,
			endDate: input.endDate ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_opening",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const jobsUpdate = authorizedProcedure("posting", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).optional(),
			description: z.string().optional(),
			workLocation: z.string().optional(),
			employmentType: z.string().optional(),
			vacancyCount: z.number().int().min(1).optional(),
			hiringManagerEmployeeId: z.string().nullable().optional(),
			recruiterUserId: z.string().nullable().optional(),
			startDate: z.string().nullable().optional(),
			endDate: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyJobOpening(orgId(context), input.id);
		if (existing.status === "closed" || existing.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Closed openings cannot be edited.",
			});
		}
		if (
			input.hiringManagerEmployeeId !== undefined &&
			input.hiringManagerEmployeeId !== null
		) {
			await verifyEmployeeInOrg(orgId(context), input.hiringManagerEmployeeId);
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		for (const k of [
			"title",
			"description",
			"workLocation",
			"employmentType",
			"vacancyCount",
			"hiringManagerEmployeeId",
			"recruiterUserId",
			"startDate",
			"endDate",
		] as const) {
			if (input[k] !== undefined) {
				patch[k] = input[k];
			}
		}
		await db
			.update(jobOpening)
			.set(patch)
			.where(
				and(
					eq(jobOpening.id, input.id),
					eq(jobOpening.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_opening",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const jobsTransition = (
	allowedFrom: readonly string[],
	newStatus: "open" | "paused" | "closed" | "cancelled",
	auditField: "publishedAt" | "closedAt" | null
) =>
	authorizedProcedure("posting", "publish")
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			if (!canManageRecruitment(role(context))) {
				throw new ORPCError("FORBIDDEN", {
					message: "Insufficient permission.",
				});
			}
			const existing = await verifyJobOpening(orgId(context), input.id);
			if (!allowedFrom.includes(existing.status)) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: `Cannot transition from ${existing.status} to ${newStatus}.`,
				});
			}
			const patch: Record<string, unknown> = {
				status: newStatus,
				updatedAt: new Date(),
			};
			if (auditField === "publishedAt" && !existing.publishedAt) {
				patch.publishedAt = new Date();
			}
			if (auditField === "closedAt") {
				patch.closedAt = new Date();
			}
			await db
				.update(jobOpening)
				.set(patch)
				.where(
					and(
						eq(jobOpening.id, input.id),
						eq(jobOpening.organizationId, orgId(context))
					)
				);
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "job_opening",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{ field: "status", oldValue: existing.status, newValue: newStatus },
				],
			});
			return { id: input.id };
		});

const jobsPublish = jobsTransition(["draft", "paused"], "open", "publishedAt");
const jobsPause = jobsTransition(["open"], "paused", null);
const jobsClose = jobsTransition(
	["draft", "open", "paused"],
	"closed",
	"closedAt"
);
const jobsCancel = jobsTransition(
	["draft", "open", "paused"],
	"cancelled",
	null
);

const jobsDelete = authorizedProcedure("posting", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyJobOpening(orgId(context), input.id);
		await db
			.update(jobOpening)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(jobOpening.id, input.id),
					eq(jobOpening.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_opening",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// CANDIDATES
// ════════════════════════════════════════════════════════════════════

const candidatesList = authorizedProcedure("applicant", "read")
	.input(
		z.object({
			status: z.enum(["active", "inactive_pool", "blocked"]).optional(),
			search: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		// Phase 9C security review: candidate browsing is PII. Managers navigate
		// via applications to their managed openings; they do NOT directly list
		// candidates. Auditors retain read access (redactCandidateSensitive
		// strips DOB/gender/address for them).
		if (!canManageRecruitment(role(context)) && role(context) !== "auditor") {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(candidate.organizationId, orgId(context)),
			isNull(candidate.deletedAt),
		];
		if (input.status) {
			filters.push(eq(candidate.status, input.status));
		}
		if (input.search) {
			const term = `%${input.search.toLowerCase()}%`;
			filters.push(
				sql`(lower(${candidate.firstName}) like ${term} or lower(${candidate.lastName}) like ${term} or lower(${candidate.email}) like ${term})`
			);
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(candidate)
			.where(and(...filters))
			.orderBy(desc(candidate.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(candidate)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows.map((r) => redactCandidateSensitive(r, role(context))),
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const candidatesGet = authorizedProcedure("applicant", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		// Phase 9C security review: see candidatesList rationale. Managers do
		// NOT have a direct candidate-detail view — they navigate via applications
		// to their managed openings, which the applicationsGet path scopes.
		if (!canManageRecruitment(role(context)) && role(context) !== "auditor") {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyCandidate(orgId(context), input.id);
		return redactCandidateSensitive(c, role(context));
	});

const candidatesCreate = authorizedProcedure("applicant", "create")
	.input(
		z.object({
			firstName: z.string().min(1).max(100),
			lastName: z.string().max(100).optional(),
			email: z.string().email().max(255),
			phone: z.string().optional(),
			country: z.string().max(8).optional(),
			source: z
				.enum([
					"direct",
					"referral",
					"job_board",
					"agency",
					"linkedin",
					"other",
				])
				.default("direct"),
			referrerEmployeeId: z.string().nullable().optional(),
			resumeUrl: httpUrlString.optional(),
			portfolioUrl: httpUrlString.optional(),
			dateOfBirth: z.string().optional(),
			gender: z.string().optional(),
			address: z.string().optional(),
			linkedinUrl: httpUrlString.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		if (input.referrerEmployeeId) {
			await verifyEmployeeInOrg(orgId(context), input.referrerEmployeeId);
		}
		const id = createId();
		const normalizedEmail = normalizeEmail(input.email);
		try {
			await db.insert(candidate).values({
				id,
				organizationId: orgId(context),
				firstName: input.firstName.trim(),
				lastName: input.lastName?.trim() ?? null,
				email: normalizedEmail,
				phone: input.phone ?? null,
				country: input.country ?? null,
				source: input.source,
				referrerEmployeeId: input.referrerEmployeeId ?? null,
				resumeUrl: input.resumeUrl ?? null,
				portfolioUrl: input.portfolioUrl ?? null,
				dateOfBirth: input.dateOfBirth ?? null,
				gender: input.gender ?? null,
				address: input.address ?? null,
				linkedinUrl: input.linkedinUrl ?? null,
				status: "active",
			});
		} catch (err) {
			if (
				err instanceof Error &&
				err.message.includes("candidate_org_email_uq")
			) {
				throw new ORPCError("CONFLICT", {
					message:
						"A candidate with this email already exists in your organization.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const candidatesUpdate = authorizedProcedure("applicant", "update")
	.input(
		z.object({
			id: z.string(),
			firstName: z.string().min(1).optional(),
			lastName: z.string().optional(),
			email: z.string().email().optional(),
			phone: z.string().nullable().optional(),
			country: z.string().nullable().optional(),
			resumeUrl: httpUrlString.nullable().optional(),
			portfolioUrl: httpUrlString.nullable().optional(),
			dateOfBirth: z.string().nullable().optional(),
			gender: z.string().nullable().optional(),
			address: z.string().nullable().optional(),
			linkedinUrl: httpUrlString.nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCandidate(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.firstName !== undefined) {
			patch.firstName = input.firstName.trim();
		}
		if (input.lastName !== undefined) {
			patch.lastName = input.lastName?.trim() ?? null;
		}
		if (input.email !== undefined) {
			patch.email = normalizeEmail(input.email);
		}
		for (const k of [
			"phone",
			"country",
			"resumeUrl",
			"portfolioUrl",
			"dateOfBirth",
			"gender",
			"address",
			"linkedinUrl",
		] as const) {
			if (input[k] !== undefined) {
				patch[k] = input[k];
			}
		}
		await db
			.update(candidate)
			.set(patch)
			.where(
				and(
					eq(candidate.id, input.id),
					eq(candidate.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const candidatesArchive = authorizedProcedure("applicant", "update")
	.input(z.object({ id: z.string(), reason: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCandidate(orgId(context), input.id);
		await db
			.update(candidate)
			.set({ status: "blocked", updatedAt: new Date() })
			.where(
				and(
					eq(candidate.id, input.id),
					eq(candidate.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
			metadata: input.reason ? { reason: input.reason } : undefined,
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// CANDIDATE → EMPLOYEE CONVERSION (Phase 9H)
// ════════════════════════════════════════════════════════════════════

const DAY_MS_9H = 24 * 60 * 60 * 1000;
const addDays9H = (base: Date, days: number) =>
	new Date(base.getTime() + days * DAY_MS_9H);

const candidatesConvertToEmployee = authorizedProcedure("applicant", "convert")
	.input(
		z.object({
			candidateId: z.string(),
			applicationId: z.string(),
			onboardingTemplateId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}

		const oid = orgId(context);

		// Tenant-verify: candidate, application, cross-ownership
		const candidateRow = await verifyCandidate(oid, input.candidateId);
		const appRow = await verifyApplication(oid, input.applicationId);

		if (appRow.candidateId !== input.candidateId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Application does not belong to this candidate.",
			});
		}

		// Idempotency guard: candidate can only convert once
		if (candidateRow.convertedEmployeeId) {
			throw new ORPCError("CONFLICT", {
				message: `This candidate has already been converted to an employee (employee ID: ${candidateRow.convertedEmployeeId}).`,
			});
		}

		// Require an accepted offer on the application
		const [acceptedOffer] = await db
			.select()
			.from(offer)
			.where(
				and(
					eq(offer.applicationId, input.applicationId),
					eq(offer.organizationId, oid),
					eq(offer.status, "accepted"),
					isNull(offer.deletedAt)
				)
			)
			.limit(1);

		if (!acceptedOffer) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"An accepted offer is required before converting a candidate to an employee.",
			});
		}

		// Optionally verify and load onboarding template tasks
		let templateName: string | null = null;
		let templateTasks: (typeof onboardingTemplateTask.$inferSelect)[] = [];

		if (input.onboardingTemplateId) {
			const [tmpl] = await db
				.select()
				.from(onboardingTemplate)
				.where(
					and(
						eq(onboardingTemplate.id, input.onboardingTemplateId),
						eq(onboardingTemplate.organizationId, oid),
						isNull(onboardingTemplate.deletedAt)
					)
				)
				.limit(1);
			if (!tmpl) {
				throw new ORPCError("NOT_FOUND", {
					message: "Onboarding template not found.",
				});
			}
			templateName = tmpl.name;
			templateTasks = await db
				.select()
				.from(onboardingTemplateTask)
				.where(
					and(
						eq(onboardingTemplateTask.templateId, input.onboardingTemplateId),
						eq(onboardingTemplateTask.organizationId, oid),
						isNull(onboardingTemplateTask.deletedAt)
					)
				)
				.orderBy(asc(onboardingTemplateTask.sortOrder));
		}

		const empId = createId();
		const onboardingId = input.onboardingTemplateId ? createId() : null;
		const now = new Date();

		// Single transaction: employee + work info + optional onboarding snapshot
		// + candidate link + application stage advance. All-or-nothing.
		await db.transaction(async (tx) => {
			await tx.insert(employeeProfile).values({
				id: empId,
				organizationId: oid,
				firstName: candidateRow.firstName,
				lastName: candidateRow.lastName ?? null,
				email: candidateRow.email,
				phone: candidateRow.phone ?? null,
				address: candidateRow.address ?? null,
				country: candidateRow.country ?? null,
			});

			await tx.insert(employeeWorkInfo).values({
				id: createId(),
				employeeId: empId,
				joiningDate: acceptedOffer.startDate
					? new Date(acceptedOffer.startDate)
					: null,
				basicSalary: acceptedOffer.baseAmount ?? null,
				salaryCurrency: acceptedOffer.currency,
			});

			if (onboardingId && input.onboardingTemplateId && templateName !== null) {
				const maxOffset = templateTasks.reduce(
					(max, t) => Math.max(max, t.dueOffsetDays),
					0
				);
				await tx.insert(employeeOnboarding).values({
					id: onboardingId,
					organizationId: oid,
					employeeId: empId,
					applicationId: input.applicationId,
					templateId: input.onboardingTemplateId,
					startedAt: now,
					targetCompletionAt: addDays9H(now, maxOffset),
					status: "in_progress",
				});
				for (const tt of templateTasks) {
					await tx.insert(onboardingTask).values({
						id: createId(),
						organizationId: oid,
						onboardingId,
						templateTaskId: tt.id,
						titleSnapshot: tt.title,
						descriptionSnapshot: tt.description,
						category: tt.category,
						assigneeEmployeeId:
							tt.defaultAssigneeRole === "new_hire" ? empId : null,
						assigneeUserId: null,
						dueAt: addDays9H(now, tt.dueOffsetDays),
						status: "todo",
					});
				}
				await tx.insert(onboardingActivity).values({
					id: createId(),
					organizationId: oid,
					onboardingId,
					kind: "onboarding_started",
					actorUserId: actorId(context),
					summary: `Onboarding started from template "${templateName}" via candidate conversion.`,
					metadata: null,
				});
			}

			await tx
				.update(candidate)
				.set({ convertedEmployeeId: empId, updatedAt: new Date() })
				.where(
					and(
						eq(candidate.id, input.candidateId),
						eq(candidate.organizationId, oid)
					)
				);

			await tx
				.update(candidateApplication)
				.set({ stage: "hired", outcomeAt: now, updatedAt: new Date() })
				.where(
					and(
						eq(candidateApplication.id, input.applicationId),
						eq(candidateApplication.organizationId, oid)
					)
				);

			await tx.insert(applicationStageHistory).values({
				id: createId(),
				organizationId: oid,
				applicationId: input.applicationId,
				fromStage: appRow.stage,
				toStage: "hired",
				changedByUserId: actorId(context),
				changedAt: now,
				note: "Converted to employee.",
			});

			await tx.insert(recruitmentNote).values({
				id: createId(),
				organizationId: oid,
				candidateId: input.candidateId,
				applicationId: input.applicationId,
				stage: "hired",
				authorUserId: actorId(context),
				body: `Candidate converted to employee (employee ID: ${empId}).`,
			});
		});

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "employee_profile",
			entityId: empId,
			action: "create",
			actorId: actorId(context),
			metadata: {
				source: "candidate_conversion",
				candidateId: input.candidateId,
			},
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "candidate",
			entityId: input.candidateId,
			action: "update",
			actorId: actorId(context),
			metadata: { convertedEmployeeId: empId },
		});

		return {
			employeeId: empId,
			onboardingId: onboardingId ?? undefined,
		};
	});

// ════════════════════════════════════════════════════════════════════
// APPLICATIONS (candidate × opening)
// ════════════════════════════════════════════════════════════════════

const applicationsList = authorizedProcedure("applicant", "read")
	.input(
		z.object({
			jobOpeningId: z.string().optional(),
			candidateId: z.string().optional(),
			stage: z
				.enum([
					"new",
					"screening",
					"shortlisted",
					"interview",
					"offer",
					"hired",
					"rejected",
					"withdrawn",
				])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(candidateApplication.organizationId, orgId(context)),
			isNull(candidateApplication.deletedAt),
		];
		if (input.jobOpeningId) {
			await verifyJobOpening(orgId(context), input.jobOpeningId);
			filters.push(eq(candidateApplication.jobOpeningId, input.jobOpeningId));
		}
		if (input.candidateId) {
			await verifyCandidate(orgId(context), input.candidateId);
			filters.push(eq(candidateApplication.candidateId, input.candidateId));
		}
		if (input.stage) {
			filters.push(eq(candidateApplication.stage, input.stage));
		}
		// Phase 9C security review: manager scope. A manager-role user may only
		// see applications tied to openings they manage.
		if (role(context) === "manager") {
			const openingIds = await getManagerOpeningIds(
				orgId(context),
				actorId(context)
			);
			if (openingIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			filters.push(inArray(candidateApplication.jobOpeningId, openingIds));
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(candidateApplication)
			.where(and(...filters))
			.orderBy(desc(candidateApplication.appliedAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(candidateApplication)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const applicationsGet = authorizedProcedure("applicant", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const app = await verifyApplication(orgId(context), input.id);
		// Phase 9C security review: manager-scope.
		await ensureManagerCanAccessOpening(
			orgId(context),
			actorId(context),
			role(context),
			app.jobOpeningId
		);
		return app;
	});

const applicationsCreate = authorizedProcedure("applicant", "create")
	.input(
		z.object({
			candidateId: z.string(),
			jobOpeningId: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const candidateRow = await verifyCandidate(
			orgId(context),
			input.candidateId
		);
		if (candidateRow.status !== "active") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Candidate is not active.",
			});
		}
		const opening = await verifyJobOpening(orgId(context), input.jobOpeningId);
		if (opening.status !== "open" && opening.status !== "paused") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Job opening is not accepting applications.",
			});
		}
		const id = createId();
		try {
			await db.insert(candidateApplication).values({
				id,
				organizationId: orgId(context),
				candidateId: input.candidateId,
				jobOpeningId: input.jobOpeningId,
				stage: "new",
			});
		} catch (err) {
			if (
				err instanceof Error &&
				err.message.includes("application_candidate_opening_uq")
			) {
				throw new ORPCError("CONFLICT", {
					message: "This candidate has already applied to this opening.",
				});
			}
			throw err;
		}
		// First-stage history row.
		await db.insert(applicationStageHistory).values({
			id: createId(),
			organizationId: orgId(context),
			applicationId: id,
			fromStage: null,
			toStage: "new",
			changedByUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_application",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const applicationsMoveStage = authorizedProcedure("applicant", "update")
	.input(
		z.object({
			id: z.string(),
			toStage: z.enum([
				"new",
				"screening",
				"shortlisted",
				"interview",
				"offer",
				"hired",
				"rejected",
				"withdrawn",
			]),
			note: z.string().optional(),
			adminOverride: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const app = await verifyApplication(orgId(context), input.id);
		if (app.stage === input.toStage) {
			return { id: input.id, unchanged: true };
		}
		// Terminal stages can only be moved with admin override + audit reason.
		if (TERMINAL_APPLICATION_STAGES.has(app.stage)) {
			if (!input.adminOverride) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						"This application is in a final state. Pass adminOverride to move it (requires owner/admin).",
				});
			}
			if (!isOwnerOrAdmin(role(context))) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only owner/admin can move out of a terminal state.",
				});
			}
		}
		const isTerminal = TERMINAL_APPLICATION_STAGES.has(input.toStage);
		await db
			.update(candidateApplication)
			.set({
				stage: input.toStage,
				stageEnteredAt: new Date(),
				outcomeAt: isTerminal ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(candidateApplication.id, input.id),
					eq(candidateApplication.organizationId, orgId(context))
				)
			);
		await db.insert(applicationStageHistory).values({
			id: createId(),
			organizationId: orgId(context),
			applicationId: input.id,
			fromStage: app.stage,
			toStage: input.toStage,
			changedByUserId: actorId(context),
			note: input.note ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_application",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "stage", oldValue: app.stage, newValue: input.toStage },
			],
			metadata: {
				adminOverride: input.adminOverride ?? false,
				note: input.note ?? null,
			},
		});
		return { id: input.id };
	});

const applicationsReject = authorizedProcedure("applicant", "update")
	.input(
		z.object({
			id: z.string(),
			reason: z.enum([
				"not_qualified",
				"position_filled",
				"failed_interview",
				"failed_background_check",
				"salary_mismatch",
				"candidate_unresponsive",
				"other",
			]),
			feedback: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const app = await verifyApplication(orgId(context), input.id);
		if (TERMINAL_APPLICATION_STAGES.has(app.stage)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Application is already in a final state.",
			});
		}
		await db
			.update(candidateApplication)
			.set({
				stage: "rejected",
				rejectedReason: input.reason,
				rejectedFeedback: input.feedback ?? null,
				outcomeAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(candidateApplication.id, input.id),
					eq(candidateApplication.organizationId, orgId(context))
				)
			);
		await db.insert(applicationStageHistory).values({
			id: createId(),
			organizationId: orgId(context),
			applicationId: input.id,
			fromStage: app.stage,
			toStage: "rejected",
			changedByUserId: actorId(context),
			note: input.feedback ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_application",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "stage", oldValue: app.stage, newValue: "rejected" }],
			metadata: { rejectedReason: input.reason },
		});
		return { id: input.id };
	});

const applicationsWithdraw = authorizedProcedure("applicant", "update")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const app = await verifyApplication(orgId(context), input.id);
		if (TERMINAL_APPLICATION_STAGES.has(app.stage)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Application is already in a final state.",
			});
		}
		await db
			.update(candidateApplication)
			.set({
				stage: "withdrawn",
				withdrawnAt: new Date(),
				outcomeAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(candidateApplication.id, input.id),
					eq(candidateApplication.organizationId, orgId(context))
				)
			);
		await db.insert(applicationStageHistory).values({
			id: createId(),
			organizationId: orgId(context),
			applicationId: input.id,
			fromStage: app.stage,
			toStage: "withdrawn",
			changedByUserId: actorId(context),
			note: input.note ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_application",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "stage", oldValue: app.stage, newValue: "withdrawn" }],
		});
		return { id: input.id };
	});

const applicationsStageHistory = authorizedProcedure("applicant", "read")
	.input(z.object({ applicationId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const app = await verifyApplication(orgId(context), input.applicationId);
		// Phase 9C security review: manager-scope.
		await ensureManagerCanAccessOpening(
			orgId(context),
			actorId(context),
			role(context),
			app.jobOpeningId
		);
		const rows = await db
			.select()
			.from(applicationStageHistory)
			.where(
				and(
					eq(applicationStageHistory.applicationId, input.applicationId),
					eq(applicationStageHistory.organizationId, orgId(context))
				)
			)
			.orderBy(desc(applicationStageHistory.changedAt));
		return rows;
	});

// ════════════════════════════════════════════════════════════════════
// INTERVIEWS
// ════════════════════════════════════════════════════════════════════

const interviewsList = authorizedProcedure("interview", "read")
	.input(
		z.object({
			applicationId: z.string().optional(),
			status: z
				.enum(["scheduled", "completed", "cancelled", "no_show"])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(interview.organizationId, orgId(context)),
			isNull(interview.deletedAt),
		];
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
			filters.push(eq(interview.applicationId, input.applicationId));
		}
		if (input.status) {
			filters.push(eq(interview.status, input.status));
		}
		// Phase 9C security review: manager-scope. Restrict to interviews whose
		// application belongs to a job opening the manager owns.
		if (role(context) === "manager") {
			const openingIds = await getManagerOpeningIds(
				orgId(context),
				actorId(context)
			);
			if (openingIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			const managerAppIds = await db
				.select({ id: candidateApplication.id })
				.from(candidateApplication)
				.where(
					and(
						eq(candidateApplication.organizationId, orgId(context)),
						inArray(candidateApplication.jobOpeningId, openingIds)
					)
				);
			if (managerAppIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			filters.push(
				inArray(
					interview.applicationId,
					managerAppIds.map((r) => r.id)
				)
			);
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(interview)
			.where(and(...filters))
			.orderBy(desc(interview.scheduledStart))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(interview)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const interviewsGet = authorizedProcedure("interview", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const inter = await verifyInterview(orgId(context), input.id);
		// Phase 9C security review: manager-scope via interview → application → opening.
		if (role(context) === "manager") {
			const app = await verifyApplication(orgId(context), inter.applicationId);
			await ensureManagerCanAccessOpening(
				orgId(context),
				actorId(context),
				role(context),
				app.jobOpeningId
			);
		}
		return inter;
	});

const interviewsSchedule = authorizedProcedure("interview", "create")
	.input(
		z.object({
			applicationId: z.string(),
			scheduledStart: z.string(),
			scheduledEnd: z.string().nullable().optional(),
			location: z.string().optional(),
			interviewType: z.string().optional(),
			interviewerEmployeeIds: z.array(z.string()).min(1),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyApplication(orgId(context), input.applicationId);
		await verifyEmployeesInOrg(orgId(context), input.interviewerEmployeeIds);
		const id = createId();
		await db.insert(interview).values({
			id,
			organizationId: orgId(context),
			applicationId: input.applicationId,
			scheduledStart: new Date(input.scheduledStart),
			scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
			location: input.location ?? null,
			interviewType: input.interviewType ?? null,
			interviewerEmployeeIds: input.interviewerEmployeeIds,
			status: "scheduled",
			notes: input.notes ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "interview",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const interviewsReschedule = authorizedProcedure("interview", "update")
	.input(
		z.object({
			id: z.string(),
			scheduledStart: z.string(),
			scheduledEnd: z.string().nullable().optional(),
			location: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyInterview(orgId(context), input.id);
		if (TERMINAL_INTERVIEW_STATUSES.has(existing.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Cannot reschedule a completed/cancelled interview.",
			});
		}
		await db
			.update(interview)
			.set({
				scheduledStart: new Date(input.scheduledStart),
				scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
				location: input.location ?? existing.location,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(interview.id, input.id),
					eq(interview.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "interview",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "reschedule" },
		});
		return { id: input.id };
	});

const interviewsTransition = (
	newStatus: "completed" | "cancelled" | "no_show"
) =>
	authorizedProcedure("interview", "complete")
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			if (!canManageRecruitment(role(context))) {
				throw new ORPCError("FORBIDDEN", {
					message: "Insufficient permission.",
				});
			}
			const existing = await verifyInterview(orgId(context), input.id);
			if (existing.status !== "scheduled") {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: `Cannot transition interview from ${existing.status}.`,
				});
			}
			await db
				.update(interview)
				.set({ status: newStatus, updatedAt: new Date() })
				.where(
					and(
						eq(interview.id, input.id),
						eq(interview.organizationId, orgId(context))
					)
				);
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "interview",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{
						field: "status",
						oldValue: existing.status,
						newValue: newStatus,
					},
				],
			});
			return { id: input.id };
		});

const interviewsComplete = interviewsTransition("completed");
const interviewsCancel = interviewsTransition("cancelled");
const interviewsNoShow = interviewsTransition("no_show");

// ════════════════════════════════════════════════════════════════════
// INTERVIEW FEEDBACK
// ════════════════════════════════════════════════════════════════════

const feedbackList = authorizedProcedure("interview", "read")
	.input(z.object({ interviewId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const inter = await verifyInterview(orgId(context), input.interviewId);
		// Phase 9C security review: manager-scope.
		if (role(context) === "manager") {
			const app = await verifyApplication(orgId(context), inter.applicationId);
			await ensureManagerCanAccessOpening(
				orgId(context),
				actorId(context),
				role(context),
				app.jobOpeningId
			);
		}
		return await db
			.select()
			.from(interviewFeedback)
			.where(
				and(
					eq(interviewFeedback.interviewId, input.interviewId),
					eq(interviewFeedback.organizationId, orgId(context))
				)
			);
	});

const feedbackSubmit = authorizedProcedure("interview", "create")
	.input(
		z.object({
			interviewId: z.string(),
			interviewerEmployeeId: z.string(),
			// Phase 9C spec: ratings strictly 1–5.
			rating: z.number().int().min(1).max(5),
			recommend: z.enum(["strong_hire", "hire", "no_hire", "strong_no_hire"]),
			strengths: z.string().optional(),
			concerns: z.string().optional(),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		// Recruiter / HR / admin / OR the actual interviewer themselves.
		const isInterviewerSelfSubmit = await (async () => {
			if (role(context) !== "manager" && role(context) !== "employee") {
				return false;
			}
			const me = await resolveCurrentEmployee(orgId(context), actorId(context));
			return me ? me.id === input.interviewerEmployeeId : false;
		})();
		if (!(canManageRecruitment(role(context)) || isInterviewerSelfSubmit)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const inter = await verifyInterview(orgId(context), input.interviewId);
		await verifyEmployeeInOrg(orgId(context), input.interviewerEmployeeId);
		// Interviewer must be on the interview's interviewer list.
		const interviewerIds = (inter.interviewerEmployeeIds ?? []) as string[];
		if (!interviewerIds.includes(input.interviewerEmployeeId)) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This employee was not listed as an interviewer for this interview.",
			});
		}
		const id = createId();
		try {
			await db.insert(interviewFeedback).values({
				id,
				organizationId: orgId(context),
				interviewId: input.interviewId,
				interviewerEmployeeId: input.interviewerEmployeeId,
				rating: input.rating,
				recommend: input.recommend,
				strengths: input.strengths ?? null,
				concerns: input.concerns ?? null,
				notes: input.notes ?? null,
			});
		} catch (err) {
			// Drizzle wraps the pg error: the unique-constraint name and the
			// Postgres "23505" code live on the cause, not always on err.message.
			const directMessage = err instanceof Error ? err.message : "";
			const cause = (err as { cause?: unknown })?.cause;
			const causeMessage =
				cause instanceof Error ? cause.message : String(cause ?? "");
			const causeCode = (cause as { code?: string } | undefined)?.code;
			const isUniqueViolation =
				causeCode === "23505" ||
				directMessage.includes("feedback_interview_interviewer_uq") ||
				causeMessage.includes("feedback_interview_interviewer_uq");
			if (isUniqueViolation) {
				throw new ORPCError("CONFLICT", {
					message: "Feedback from this interviewer already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "interview_feedback",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { interviewId: input.interviewId, rating: input.rating },
		});
		return { id };
	});

// ════════════════════════════════════════════════════════════════════
// OFFERS
// ════════════════════════════════════════════════════════════════════

const offersList = authorizedProcedure("offer", "read")
	.input(
		z.object({
			applicationId: z.string().optional(),
			status: z
				.enum([
					"draft",
					"pending_approval",
					"approved",
					"sent",
					"accepted",
					"rejected",
					"expired",
					"withdrawn",
				])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(offer.organizationId, orgId(context)),
			isNull(offer.deletedAt),
		];
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
			filters.push(eq(offer.applicationId, input.applicationId));
		}
		if (input.status) {
			filters.push(eq(offer.status, input.status));
		}
		// Phase 9C security review: manager-scope via offer → application → opening.
		if (role(context) === "manager") {
			const openingIds = await getManagerOpeningIds(
				orgId(context),
				actorId(context)
			);
			if (openingIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			const managerAppIds = await db
				.select({ id: candidateApplication.id })
				.from(candidateApplication)
				.where(
					and(
						eq(candidateApplication.organizationId, orgId(context)),
						inArray(candidateApplication.jobOpeningId, openingIds)
					)
				);
			if (managerAppIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			filters.push(
				inArray(
					offer.applicationId,
					managerAppIds.map((r) => r.id)
				)
			);
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(offer)
			.where(and(...filters))
			.orderBy(desc(offer.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(offer)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows.map((r) => redactOfferCompensation(r, role(context))),
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const offersGet = authorizedProcedure("offer", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const o = await verifyOffer(orgId(context), input.id);
		// Phase 9C security review: manager-scope via offer → application → opening.
		if (role(context) === "manager") {
			const app = await verifyApplication(orgId(context), o.applicationId);
			await ensureManagerCanAccessOpening(
				orgId(context),
				actorId(context),
				role(context),
				app.jobOpeningId
			);
		}
		return redactOfferCompensation(o, role(context));
	});

const offersCreate = authorizedProcedure("offer", "create")
	.input(
		z.object({
			applicationId: z.string(),
			currency: z.string().min(3).max(3),
			baseAmount: z.string(),
			baseAmountFrequency: z.string().default("monthly"),
			variableAmount: z.string().nullable().optional(),
			startDate: z.string().nullable().optional(),
			expiresAt: z.string().nullable().optional(),
			letterUrl: httpUrlString.nullable().optional(),
			approvalRequired: z.boolean().default(true),
		})
	)
	.handler(async ({ context, input }) => {
		// Only payroll-capable roles can write compensation.
		if (!canSeeOfferCompensation(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll-capable roles can create offers.",
			});
		}
		await verifyApplication(orgId(context), input.applicationId);
		const id = createId();
		await db.insert(offer).values({
			id,
			organizationId: orgId(context),
			applicationId: input.applicationId,
			status: "draft",
			currency: input.currency,
			baseAmount: input.baseAmount,
			baseAmountFrequency: input.baseAmountFrequency,
			variableAmount: input.variableAmount ?? null,
			startDate: input.startDate ?? null,
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
			letterUrl: input.letterUrl ?? null,
			approvalRequired: input.approvalRequired,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offer",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const offersUpdate = authorizedProcedure("offer", "extend")
	.input(
		z.object({
			id: z.string(),
			baseAmount: z.string().optional(),
			variableAmount: z.string().nullable().optional(),
			baseAmountFrequency: z.string().optional(),
			startDate: z.string().nullable().optional(),
			expiresAt: z.string().nullable().optional(),
			letterUrl: httpUrlString.nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canSeeOfferCompensation(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll-capable roles can update offers.",
			});
		}
		const existing = await verifyOffer(orgId(context), input.id);
		if (existing.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Only draft offers can be edited. Withdraw and recreate to amend.",
			});
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		for (const k of [
			"baseAmount",
			"variableAmount",
			"baseAmountFrequency",
			"startDate",
			"letterUrl",
		] as const) {
			if (input[k] !== undefined) {
				patch[k] = input[k];
			}
		}
		if (input.expiresAt !== undefined) {
			patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
		}
		await db
			.update(offer)
			.set(patch)
			.where(
				and(eq(offer.id, input.id), eq(offer.organizationId, orgId(context)))
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offer",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const offerTransition = (
	allowedFrom: readonly string[],
	newStatus:
		| "pending_approval"
		| "approved"
		| "sent"
		| "accepted"
		| "rejected"
		| "expired"
		| "withdrawn",
	requireOwnerOrAdmin: boolean
) =>
	authorizedProcedure("offer", "extend")
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			if (requireOwnerOrAdmin) {
				if (
					!isOwnerOrAdmin(role(context)) &&
					role(context) !== "hr_admin" &&
					role(context) !== "payroll_admin"
				) {
					throw new ORPCError("FORBIDDEN", {
						message:
							"Only owner / admin / HR / payroll admin can take this action.",
					});
				}
			} else if (!canSeeOfferCompensation(role(context))) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only payroll-capable roles can take this action.",
				});
			}
			const existing = await verifyOffer(orgId(context), input.id);
			if (!allowedFrom.includes(existing.status)) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: `Cannot transition offer from ${existing.status} to ${newStatus}.`,
				});
			}
			const patch: Record<string, unknown> = {
				status: newStatus,
				updatedAt: new Date(),
			};
			if (newStatus === "approved") {
				patch.approvedByUserId = actorId(context);
				patch.approvedAt = new Date();
			}
			if (newStatus === "sent") {
				patch.sentAt = new Date();
			}
			if (newStatus === "accepted" || newStatus === "rejected") {
				patch.respondedAt = new Date();
			}
			if (newStatus === "withdrawn") {
				patch.withdrawnAt = new Date();
			}
			await db
				.update(offer)
				.set(patch)
				.where(
					and(eq(offer.id, input.id), eq(offer.organizationId, orgId(context)))
				);
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "offer",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{
						field: "status",
						oldValue: existing.status,
						newValue: newStatus,
					},
				],
			});
			return { id: input.id };
		});

const offersSubmitForApproval = offerTransition(
	["draft"],
	"pending_approval",
	false
);
const offersApprove = offerTransition(["pending_approval"], "approved", true);
const offersSend = offerTransition(["approved", "draft"], "sent", false);
const offersMarkAccepted = offerTransition(["sent"], "accepted", false);
const offersMarkRejected = offerTransition(["sent"], "rejected", false);
const offersMarkExpired = offerTransition(["sent"], "expired", false);
const offersWithdraw = offerTransition(
	["draft", "pending_approval", "approved", "sent"],
	"withdrawn",
	false
);

// ════════════════════════════════════════════════════════════════════
// OFFER APPROVALS (multi-step ready; MVP uses sequence=1)
// ════════════════════════════════════════════════════════════════════

const offerApprovalsList = authorizedProcedure("offer", "read")
	.input(z.object({ offerId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const o = await verifyOffer(orgId(context), input.offerId);
		// Phase 9C security review: manager-scope via offer → application → opening.
		if (role(context) === "manager") {
			const app = await verifyApplication(orgId(context), o.applicationId);
			await ensureManagerCanAccessOpening(
				orgId(context),
				actorId(context),
				role(context),
				app.jobOpeningId
			);
		}
		return await db
			.select()
			.from(offerApproval)
			.where(
				and(
					eq(offerApproval.offerId, input.offerId),
					eq(offerApproval.organizationId, orgId(context))
				)
			)
			.orderBy(offerApproval.sequence);
	});

const offerApprovalsDecide = authorizedProcedure("offer", "extend")
	.input(
		z.object({
			id: z.string(),
			status: z.enum(["approved", "rejected"]),
			comment: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!isOwnerOrAdmin(role(context)) && role(context) !== "hr_admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Only owner / admin / HR can decide on offer approvals.",
			});
		}
		const [row] = await db
			.select()
			.from(offerApproval)
			.where(
				and(
					eq(offerApproval.id, input.id),
					eq(offerApproval.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", {
				message: "Approval row not found.",
			});
		}
		if (row.status !== "pending") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This approval has already been decided.",
			});
		}
		await db
			.update(offerApproval)
			.set({
				status: input.status,
				decidedAt: new Date(),
				comment: input.comment ?? null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(offerApproval.id, input.id),
					eq(offerApproval.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offer_approval",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "pending", newValue: input.status },
			],
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// CANDIDATE DOCUMENTS
// ════════════════════════════════════════════════════════════════════

const documentsList = authorizedProcedure("document", "read")
	.input(
		z.object({
			candidateId: z.string().optional(),
			applicationId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		// Phase 9C security review: candidate documents (resumes, IDs, signed
		// offers) are PII. Restrict to canManageRecruitment. Managers route
		// through application-scoped detail views; auditors don't see PII files.
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		if (!(input.candidateId || input.applicationId)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Pass candidateId or applicationId.",
			});
		}
		const filters = [
			eq(candidateDocument.organizationId, orgId(context)),
			isNull(candidateDocument.deletedAt),
		];
		if (input.candidateId) {
			await verifyCandidate(orgId(context), input.candidateId);
			filters.push(eq(candidateDocument.candidateId, input.candidateId));
		}
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
			filters.push(eq(candidateDocument.applicationId, input.applicationId));
		}
		return await db
			.select()
			.from(candidateDocument)
			.where(and(...filters))
			.orderBy(desc(candidateDocument.createdAt));
	});

const documentsUpload = authorizedProcedure("document", "create")
	.input(
		z.object({
			candidateId: z.string(),
			applicationId: z.string().nullable().optional(),
			documentType: z.string().min(1),
			fileUrl: httpUrlString,
			fileName: z.string().min(1),
			fileSizeBytes: z.number().int().min(0).optional(),
			mimeType: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCandidate(orgId(context), input.candidateId);
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
		}
		const id = createId();
		await db.insert(candidateDocument).values({
			id,
			organizationId: orgId(context),
			candidateId: input.candidateId,
			applicationId: input.applicationId ?? null,
			documentType: input.documentType,
			fileUrl: input.fileUrl,
			fileName: input.fileName,
			fileSizeBytes: input.fileSizeBytes ?? null,
			mimeType: input.mimeType ?? null,
			uploadedByUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_document",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const documentsDelete = authorizedProcedure("document", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [doc] = await db
			.select()
			.from(candidateDocument)
			.where(
				and(
					eq(candidateDocument.id, input.id),
					eq(candidateDocument.organizationId, orgId(context)),
					isNull(candidateDocument.deletedAt)
				)
			)
			.limit(1);
		if (!doc) {
			throw new ORPCError("NOT_FOUND", { message: "Document not found." });
		}
		await db
			.update(candidateDocument)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(candidateDocument.id, input.id),
					eq(candidateDocument.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "candidate_document",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// RECRUITMENT NOTES
// ════════════════════════════════════════════════════════════════════

const notesList = authorizedProcedure("applicant", "read")
	.input(
		z.object({
			candidateId: z.string().optional(),
			applicationId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		// Recruiter / HR only — notes are sensitive.
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		if (!(input.candidateId || input.applicationId)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Pass candidateId or applicationId.",
			});
		}
		const filters = [
			eq(recruitmentNote.organizationId, orgId(context)),
			isNull(recruitmentNote.deletedAt),
		];
		if (input.candidateId) {
			await verifyCandidate(orgId(context), input.candidateId);
			filters.push(eq(recruitmentNote.candidateId, input.candidateId));
		}
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
			filters.push(eq(recruitmentNote.applicationId, input.applicationId));
		}
		return await db
			.select()
			.from(recruitmentNote)
			.where(and(...filters))
			.orderBy(desc(recruitmentNote.createdAt));
	});

const notesCreate = authorizedProcedure("applicant", "create")
	.input(
		z.object({
			candidateId: z.string(),
			applicationId: z.string().nullable().optional(),
			stage: z
				.enum([
					"new",
					"screening",
					"shortlisted",
					"interview",
					"offer",
					"hired",
					"rejected",
					"withdrawn",
				])
				.optional(),
			body: z.string().min(1).max(10_000),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCandidate(orgId(context), input.candidateId);
		if (input.applicationId) {
			await verifyApplication(orgId(context), input.applicationId);
		}
		const id = createId();
		await db.insert(recruitmentNote).values({
			id,
			organizationId: orgId(context),
			candidateId: input.candidateId,
			applicationId: input.applicationId ?? null,
			stage: input.stage ?? null,
			authorUserId: actorId(context),
			body: input.body,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_note",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const notesDelete = authorizedProcedure("applicant", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageRecruitment(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [note] = await db
			.select()
			.from(recruitmentNote)
			.where(
				and(
					eq(recruitmentNote.id, input.id),
					eq(recruitmentNote.organizationId, orgId(context)),
					isNull(recruitmentNote.deletedAt)
				)
			)
			.limit(1);
		if (!note) {
			throw new ORPCError("NOT_FOUND", { message: "Note not found." });
		}
		await db
			.update(recruitmentNote)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(recruitmentNote.id, input.id),
					eq(recruitmentNote.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "recruitment_note",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════════

export const recruitmentRouter = {
	requisitions: {
		list: requisitionsList,
		get: requisitionsGet,
		create: requisitionsCreate,
		update: requisitionsUpdate,
		submit: requisitionsSubmit,
		approve: requisitionsApprove,
		reject: requisitionsReject,
		cancel: requisitionsCancel,
		delete: requisitionsDelete,
	},
	jobs: {
		list: jobsList,
		get: jobsGet,
		create: jobsCreate,
		update: jobsUpdate,
		publish: jobsPublish,
		pause: jobsPause,
		close: jobsClose,
		cancel: jobsCancel,
		delete: jobsDelete,
	},
	candidates: {
		list: candidatesList,
		get: candidatesGet,
		create: candidatesCreate,
		update: candidatesUpdate,
		archive: candidatesArchive,
		convertToEmployee: candidatesConvertToEmployee,
	},
	applications: {
		list: applicationsList,
		get: applicationsGet,
		create: applicationsCreate,
		moveStage: applicationsMoveStage,
		reject: applicationsReject,
		withdraw: applicationsWithdraw,
		stageHistory: applicationsStageHistory,
	},
	interviews: {
		list: interviewsList,
		get: interviewsGet,
		schedule: interviewsSchedule,
		reschedule: interviewsReschedule,
		complete: interviewsComplete,
		cancel: interviewsCancel,
		noShow: interviewsNoShow,
	},
	feedback: {
		list: feedbackList,
		submit: feedbackSubmit,
	},
	offers: {
		list: offersList,
		get: offersGet,
		create: offersCreate,
		update: offersUpdate,
		submitForApproval: offersSubmitForApproval,
		approve: offersApprove,
		send: offersSend,
		markAccepted: offersMarkAccepted,
		markRejected: offersMarkRejected,
		markExpired: offersMarkExpired,
		withdraw: offersWithdraw,
	},
	offerApprovals: {
		list: offerApprovalsList,
		decide: offerApprovalsDecide,
	},
	documents: {
		list: documentsList,
		upload: documentsUpload,
		delete: documentsDelete,
	},
	notes: {
		list: notesList,
		create: notesCreate,
		delete: notesDelete,
	},
};
