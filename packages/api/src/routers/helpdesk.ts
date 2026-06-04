// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Helpdesk / Requests oRPC router — Phase 13C.
 *
 * Scope (per docs/architecture/helpdesk-requests-implementation-plan.md):
 *
 *   categories   list / create / update / archive request categories
 *   requests     list / getById / createSelf / createForEmployee / update /
 *                assign / changeStatus / resolve / close / cancel / reopen /
 *                approve / rejectApproval
 *   comments     list / create / createInternal
 *
 * Hard guardrails enforced in this file:
 *   - THE central guardrail: Helpdesk LINKS to Assets / Payroll / Leave /
 *     Attendance / Offboarding via read-only link columns. Link ids are
 *     tenant-VERIFIED (no IDOR) but the linked rows are NEVER mutated — there is
 *     no write to asset / payslip / payroll_run / leave_request /
 *     attendance_record / offboarding_case anywhere in this router.
 *   - Internal-note redaction is SERVER-SIDE: a comment with isInternal = true is
 *     filtered out of every read for any caller who is not an agent/HR/auditor
 *     (canViewHelpdeskInternalNotes). UI hiding alone is not sufficient.
 *   - SLA state is DERIVED at read time (computeSlaState) from the due dates +
 *     status + clock — it is never stored (a persisted value would be stale).
 *   - The human reference (HD-000042) is allocated as MAX+1 per org with a
 *     retry loop; the (org, reference) partial-unique index is the race backstop.
 *   - Two-layer authz: the AC gate (authorizedProcedure on a real `ticket` action)
 *     PLUS a handler re-check and lateral scope — employees see only their own
 *     requests, managers their own + direct reports, agents/HR/auditor/payroll all.
 *   - Reuses the existing `ticket` AC. Approvals gate on the dedicated
 *     `ticket:approve` action (approval is not update). Categories have no
 *     `ticket:manage` action, so they gate on `ticket:update`.
 */

import { db } from "@Heimdallone/db";
import { asset } from "@Heimdallone/db/schema/assets";
import { attendanceRecord } from "@Heimdallone/db/schema/attendance";
import { member, user } from "@Heimdallone/db/schema/auth";
import {
	type HelpdeskSlaState,
	helpdeskCategory,
	helpdeskRequest,
	helpdeskRequestComment,
} from "@Heimdallone/db/schema/helpdesk";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { leaveRequest } from "@Heimdallone/db/schema/leave";
import { offboardingCase } from "@Heimdallone/db/schema/offboarding";
import { payrollRun, payslip } from "@Heimdallone/db/schema/payroll";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	asc,
	count,
	desc,
	eq,
	getTableColumns,
	ilike,
	inArray,
	isNull,
	max,
	or,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import {
	canApproveHelpdeskRequest,
	canAssignHelpdesk,
	canManageHelpdesk,
	canResolveHelpdesk,
	canViewHelpdeskInternalNotes,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const HOUR_MS = 60 * 60 * 1000;
// Fraction of the resolution window remaining at which a ticket is "due soon".
const SLA_DUE_SOON_FRACTION = 0.25;
const MAX_REFERENCE_ATTEMPTS = 6;

// ─── Zod enums matching schema ───────────────────────────────────────────────

const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);
// changeStatus only moves between the non-terminal "working" states; the
// resolve / close / cancel / reopen transitions have dedicated procedures so
// their side effects (resolutionNote, resolvedAt, closedAt) stay in one place.
const WORKING_STATUS = z.enum([
	"open",
	"in_progress",
	"waiting_on_employee",
	"waiting_on_approval",
]);
const LINKED_ENTITY_TYPE = z.enum([
	"document",
	"project_task",
	"expense",
	"crm_case",
	"other",
]);

// Per-priority default SLA (hours). The category's defaultSlaHours, when set,
// overrides the resolution hours. Illustrative — confirm with the org before
// production (see implementation plan §4).
const SLA_HOURS: Record<
	z.infer<typeof PRIORITY>,
	{ firstResponse: number; resolution: number }
> = {
	urgent: { firstResponse: 4, resolution: 24 },
	high: { firstResponse: 8, resolution: 48 },
	normal: { firstResponse: 24, resolution: 120 },
	low: { firstResponse: 48, resolution: 240 },
};

// Shared input shape for the read-only cross-module link fields (the guardrail).
const LINK_INPUT = {
	linkedAssetId: z.string().optional(),
	linkedPayslipId: z.string().optional(),
	linkedPayrollRunId: z.string().optional(),
	linkedLeaveRequestId: z.string().optional(),
	linkedAttendanceRecordId: z.string().optional(),
	linkedOffboardingCaseId: z.string().optional(),
	linkedEntityType: LINKED_ENTITY_TYPE.optional(),
	linkedEntityId: z.string().optional(),
};

// ────────────────────────────────────────────────────────────────────
// Display, SLA, and redaction helpers
// ────────────────────────────────────────────────────────────────────

function formatName(first: string | null, last: string | null): string | null {
	const parts = [first, last].filter((p): p is string => Boolean(p));
	return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Derived SLA badge state — computed, NEVER stored. Resolved/closed/cancelled or
 * a request with no resolution due date is not_applicable; a request resolved
 * past its due date is breached; an unresolved request past due is overdue; one
 * with ≤25% of its window left is due_soon; otherwise on_track. (MVP does not
 * subtract time spent in waiting states — documented limitation, plan §4.)
 */
function computeSlaState(r: {
	status: string;
	resolutionDueAt: Date | null;
	resolvedAt: Date | null;
	createdAt: Date | null;
}): HelpdeskSlaState {
	if (r.status === "closed" || r.status === "cancelled") {
		return "not_applicable";
	}
	if (r.status === "resolved") {
		if (
			r.resolutionDueAt &&
			r.resolvedAt &&
			r.resolvedAt.getTime() > r.resolutionDueAt.getTime()
		) {
			return "breached";
		}
		return "not_applicable";
	}
	if (!r.resolutionDueAt) {
		return "not_applicable";
	}
	const now = Date.now();
	const due = r.resolutionDueAt.getTime();
	if (now > due) {
		return "overdue";
	}
	const start = r.createdAt ? r.createdAt.getTime() : due;
	const windowMs = due - start;
	const leftMs = due - now;
	if (windowMs > 0 && leftMs <= windowMs * SLA_DUE_SOON_FRACTION) {
		return "due_soon";
	}
	return "on_track";
}

function computeDueDates(
	priority: z.infer<typeof PRIORITY>,
	categorySlaHours: number | null,
	base: Date
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
	const def = SLA_HOURS[priority];
	const resolutionHours = categorySlaHours ?? def.resolution;
	return {
		firstResponseDueAt: new Date(base.getTime() + def.firstResponse * HOUR_MS),
		resolutionDueAt: new Date(base.getTime() + resolutionHours * HOUR_MS),
	};
}

/** True for roles that see EVERY request in the org (no requester scoping). */
function seesAllRequests(callerRole: string): boolean {
	return (
		canManageHelpdesk(callerRole) ||
		callerRole === "auditor" ||
		callerRole === "payroll_admin"
	);
}

// Member roles that actually work the desk — the assignable agent pool for the
// teammate picker (mirrors canManageHelpdesk; Better Auth's owner/admin aliases
// are included alongside our tenant_* names).
const HELPDESK_AGENT_ROLES = [
	"owner",
	"tenant_owner",
	"admin",
	"tenant_admin",
	"hr_admin",
	"helpdesk_agent",
] as const;

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every FK input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyCategory(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(helpdeskCategory)
		.where(
			and(
				eq(helpdeskCategory.id, id),
				eq(helpdeskCategory.organizationId, oid),
				isNull(helpdeskCategory.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Category not found." });
	}
	return row;
}

async function verifyRequest(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(helpdeskRequest)
		.where(
			and(
				eq(helpdeskRequest.id, id),
				eq(helpdeskRequest.organizationId, oid),
				isNull(helpdeskRequest.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Request not found." });
	}
	return row;
}

async function verifyEmployeeInOrg(oid: string, employeeId: string) {
	const [emp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.id, employeeId),
				eq(employeeProfile.organizationId, oid)
			)
		)
		.limit(1);
	if (!emp) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Employee is not in this organization.",
		});
	}
}

async function verifyOrgMember(oid: string, userId: string) {
	const [m] = await db
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, oid)))
		.limit(1);
	if (!m) {
		throw new ORPCError("BAD_REQUEST", {
			message: "That user is not a member of this organization.",
		});
	}
}

// ── Cross-module link verification (the guardrail). These prove the linked row
//    belongs to the org so we never store a dangling/cross-tenant link — but they
//    are SELECT-only. Nothing in this router ever writes to these tables. ──────

async function verifyLinkedAsset(oid: string, id: string) {
	const [row] = await db
		.select({ id: asset.id })
		.from(asset)
		.where(and(eq(asset.id, id), eq(asset.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked asset is not in this organization.",
		});
	}
}

async function verifyLinkedPayslip(oid: string, id: string) {
	const [row] = await db
		.select({ id: payslip.id })
		.from(payslip)
		.where(and(eq(payslip.id, id), eq(payslip.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked payslip is not in this organization.",
		});
	}
}

async function verifyLinkedPayrollRun(oid: string, id: string) {
	const [row] = await db
		.select({ id: payrollRun.id })
		.from(payrollRun)
		.where(and(eq(payrollRun.id, id), eq(payrollRun.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked payroll run is not in this organization.",
		});
	}
}

async function verifyLinkedLeaveRequest(oid: string, id: string) {
	const [row] = await db
		.select({ id: leaveRequest.id })
		.from(leaveRequest)
		.where(and(eq(leaveRequest.id, id), eq(leaveRequest.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked leave request is not in this organization.",
		});
	}
}

async function verifyLinkedAttendanceRecord(oid: string, id: string) {
	const [row] = await db
		.select({ id: attendanceRecord.id })
		.from(attendanceRecord)
		.where(
			and(eq(attendanceRecord.id, id), eq(attendanceRecord.organizationId, oid))
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked attendance record is not in this organization.",
		});
	}
}

async function verifyLinkedOffboardingCase(oid: string, id: string) {
	const [row] = await db
		.select({ id: offboardingCase.id })
		.from(offboardingCase)
		.where(
			and(eq(offboardingCase.id, id), eq(offboardingCase.organizationId, oid))
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked offboarding case is not in this organization.",
		});
	}
}

interface LinkInput {
	linkedAssetId?: string;
	linkedAttendanceRecordId?: string;
	linkedLeaveRequestId?: string;
	linkedOffboardingCaseId?: string;
	linkedPayrollRunId?: string;
	linkedPayslipId?: string;
}

/** Tenant-verify every provided link id. SELECT-only — never mutates the target. */
async function verifyProvidedLinks(oid: string, input: LinkInput) {
	if (input.linkedAssetId) {
		await verifyLinkedAsset(oid, input.linkedAssetId);
	}
	if (input.linkedPayslipId) {
		await verifyLinkedPayslip(oid, input.linkedPayslipId);
	}
	if (input.linkedPayrollRunId) {
		await verifyLinkedPayrollRun(oid, input.linkedPayrollRunId);
	}
	if (input.linkedLeaveRequestId) {
		await verifyLinkedLeaveRequest(oid, input.linkedLeaveRequestId);
	}
	if (input.linkedAttendanceRecordId) {
		await verifyLinkedAttendanceRecord(oid, input.linkedAttendanceRecordId);
	}
	if (input.linkedOffboardingCaseId) {
		await verifyLinkedOffboardingCase(oid, input.linkedOffboardingCaseId);
	}
}

// ── Scope ────────────────────────────────────────────────────────────────────

type RequestRow = typeof helpdeskRequest.$inferSelect;

/**
 * Throw FORBIDDEN unless the caller may see this request. Agents/HR/auditor/
 * payroll see all; the subject (requester/target) sees their own; a manager sees
 * a request whose requester is one of their direct reports.
 */
async function assertRequestVisible(
	oid: string,
	userId: string,
	callerRole: string,
	req: RequestRow
): Promise<void> {
	if (seesAllRequests(callerRole)) {
		return;
	}
	const me = await resolveCurrentEmployee(oid, userId);
	if (
		me &&
		(me.id === req.requesterEmployeeId || me.id === req.targetEmployeeId)
	) {
		return;
	}
	if (callerRole === "manager" && me) {
		const reportIds = await getDirectReportIds(me.id, oid);
		if (reportIds.includes(req.requesterEmployeeId)) {
			return;
		}
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You do not have access to this request.",
	});
}

// ── Reference allocation (MAX+1 per org with a retry loop) ────────────────────

async function nextReference(oid: string): Promise<string> {
	const [row] = await db
		.select({ value: max(helpdeskRequest.reference) })
		.from(helpdeskRequest)
		.where(eq(helpdeskRequest.organizationId, oid));
	const current = row?.value
		? Number.parseInt(String(row.value).replace(/\D/g, ""), 10)
		: 0;
	const next = Number.isNaN(current) ? 1 : current + 1;
	return `HD-${String(next).padStart(6, "0")}`;
}

type NewRequestValues = Omit<
	typeof helpdeskRequest.$inferInsert,
	"id" | "reference"
>;

/**
 * Insert a request, allocating its reference as MAX+1. Retries on the
 * (org, reference) unique violation so two concurrent creates can't collide.
 */
async function createRequestRow(
	values: NewRequestValues
): Promise<{ id: string; reference: string }> {
	for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
		const reference = await nextReference(values.organizationId);
		const id = createId();
		try {
			await db.insert(helpdeskRequest).values({ ...values, id, reference });
			return { id, reference };
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505" && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
				continue;
			}
			throw err;
		}
	}
	throw new ORPCError("INTERNAL_SERVER_ERROR", {
		message: "Could not allocate a request reference. Please retry.",
	});
}

/** Resolve display names for the user ids on a request. */
async function userNameMap(
	ids: (string | null)[]
): Promise<Map<string, string>> {
	const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
	if (unique.length === 0) {
		return new Map();
	}
	const rows = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, unique));
	return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Read-only linked-entity context for the detail view. Only the asset NAME is
 * resolved (a column we own); the rest are returned as typed deep-link refs for
 * the UI to resolve in its own panel. SELECT-only — nothing here mutates a
 * linked module (the guardrail).
 */
async function resolveLinkedEntities(
	oid: string,
	r: RequestRow
): Promise<{ kind: string; id: string; label: string | null }[]> {
	const out: { kind: string; id: string; label: string | null }[] = [];
	if (r.linkedAssetId) {
		const [a] = await db
			.select({ name: asset.name })
			.from(asset)
			.where(and(eq(asset.id, r.linkedAssetId), eq(asset.organizationId, oid)))
			.limit(1);
		out.push({ kind: "asset", id: r.linkedAssetId, label: a?.name ?? null });
	}
	if (r.linkedPayslipId) {
		out.push({ kind: "payslip", id: r.linkedPayslipId, label: null });
	}
	if (r.linkedPayrollRunId) {
		out.push({ kind: "payroll_run", id: r.linkedPayrollRunId, label: null });
	}
	if (r.linkedLeaveRequestId) {
		out.push({
			kind: "leave_request",
			id: r.linkedLeaveRequestId,
			label: null,
		});
	}
	if (r.linkedAttendanceRecordId) {
		out.push({
			kind: "attendance_record",
			id: r.linkedAttendanceRecordId,
			label: null,
		});
	}
	if (r.linkedOffboardingCaseId) {
		out.push({
			kind: "offboarding_case",
			id: r.linkedOffboardingCaseId,
			label: null,
		});
	}
	if (r.linkedEntityType && r.linkedEntityId) {
		out.push({ kind: r.linkedEntityType, id: r.linkedEntityId, label: null });
	}
	return out;
}

// ════════════════════════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════════════════════════

const categoriesList = authorizedProcedure("ticket", "read")
	.input(z.object({ includeInactive: z.boolean().optional() }).optional())
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const filters = [
			eq(helpdeskCategory.organizationId, oid),
			isNull(helpdeskCategory.deletedAt),
		];
		if (!input?.includeInactive) {
			filters.push(eq(helpdeskCategory.isActive, true));
		}
		const cats = await db
			.select()
			.from(helpdeskCategory)
			.where(and(...filters))
			.orderBy(asc(helpdeskCategory.name));
		const counts = await db
			.select({ categoryId: helpdeskRequest.categoryId, value: count() })
			.from(helpdeskRequest)
			.where(
				and(
					eq(helpdeskRequest.organizationId, oid),
					isNull(helpdeskRequest.deletedAt)
				)
			)
			.groupBy(helpdeskRequest.categoryId);
		const countMap = new Map(
			counts.map((c) => [c.categoryId, Number(c.value)])
		);
		return cats.map((c) => ({ ...c, requestCount: countMap.get(c.id) ?? 0 }));
	});

const categoriesCreate = authorizedProcedure("ticket", "update")
	.input(
		z.object({
			key: z
				.enum([
					"hr",
					"payroll",
					"attendance",
					"leave",
					"documents",
					"assets",
					"it",
					"facilities",
					"finance",
					"general",
					"custom",
				])
				.optional(),
			name: z.string().min(1).max(120),
			description: z.string().optional(),
			defaultPriority: PRIORITY.optional(),
			defaultSlaHours: z.number().int().min(1).max(8760).optional(),
			requiresApproval: z.boolean().optional(),
			defaultAssigneeUserId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		if (input.defaultAssigneeUserId) {
			await verifyOrgMember(oid, input.defaultAssigneeUserId);
		}
		const id = createId();
		try {
			await db.insert(helpdeskCategory).values({
				id,
				organizationId: oid,
				key: input.key ?? "custom",
				name: input.name,
				description: input.description ?? null,
				defaultPriority: input.defaultPriority ?? "normal",
				defaultSlaHours: input.defaultSlaHours ?? null,
				requiresApproval: input.requiresApproval ?? false,
				defaultAssigneeUserId: input.defaultAssigneeUserId ?? null,
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: `A category named "${input.name}" already exists.`,
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_category",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const categoriesUpdate = authorizedProcedure("ticket", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(120).optional(),
			description: z.string().nullable().optional(),
			defaultPriority: PRIORITY.optional(),
			defaultSlaHours: z.number().int().min(1).max(8760).nullable().optional(),
			requiresApproval: z.boolean().optional(),
			defaultAssigneeUserId: z.string().nullable().optional(),
			isActive: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyCategory(oid, input.id);
		if (input.defaultAssigneeUserId) {
			await verifyOrgMember(oid, input.defaultAssigneeUserId);
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.defaultPriority !== undefined) {
			patch.defaultPriority = input.defaultPriority;
		}
		if (input.defaultSlaHours !== undefined) {
			patch.defaultSlaHours = input.defaultSlaHours;
		}
		if (input.requiresApproval !== undefined) {
			patch.requiresApproval = input.requiresApproval;
		}
		if (input.defaultAssigneeUserId !== undefined) {
			patch.defaultAssigneeUserId = input.defaultAssigneeUserId;
		}
		if (input.isActive !== undefined) {
			patch.isActive = input.isActive;
		}
		try {
			await db
				.update(helpdeskCategory)
				.set(patch)
				.where(
					and(
						eq(helpdeskCategory.id, input.id),
						eq(helpdeskCategory.organizationId, oid)
					)
				);
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "A category with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_category",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

/**
 * Archive a category. Soft-delete only — existing requests keep their categoryId
 * and are never deleted (the FK is set-null only on a hard delete). Archived
 * categories simply drop out of the active pickers.
 */
const categoriesArchive = authorizedProcedure("ticket", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyCategory(oid, input.id);
		const now = new Date();
		await db
			.update(helpdeskCategory)
			.set({ deletedAt: now, isActive: false, updatedAt: now })
			.where(
				and(
					eq(helpdeskCategory.id, input.id),
					eq(helpdeskCategory.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_category",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// REQUESTS
// ════════════════════════════════════════════════════════════════════

const requestsList = authorizedProcedure("ticket", "read")
	.input(
		z.object({
			status: z
				.enum([
					"new",
					"open",
					"in_progress",
					"waiting_on_employee",
					"waiting_on_approval",
					"resolved",
					"closed",
					"cancelled",
				])
				.optional(),
			categoryId: z.string().optional(),
			assignedToUserId: z.string().optional(),
			priority: PRIORITY.optional(),
			search: z.string().optional(),
			// Opt-in self-scope for the employee "My requests" surface. When set,
			// the list is forced to the caller's OWN requests regardless of role —
			// so a manager/HR/agent who otherwise sees a wider scope still gets a
			// truthful "mine only" list here. Defaults off; existing callers are
			// unaffected (the role-based scope below still applies).
			mine: z.boolean().optional(),
			// Workflow queue filters (13G). assignedToMe resolves the assignee to the
			// caller server-side (no client userId needed); unassigned matches NULL
			// assignee. Both layer on top of the role scope below.
			assignedToMe: z.boolean().optional(),
			unassigned: z.boolean().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const filters = [
			eq(helpdeskRequest.organizationId, oid),
			isNull(helpdeskRequest.deletedAt),
		];
		if (input.status) {
			filters.push(eq(helpdeskRequest.status, input.status));
		}
		if (input.categoryId) {
			filters.push(eq(helpdeskRequest.categoryId, input.categoryId));
		}
		if (input.assignedToUserId) {
			filters.push(
				eq(helpdeskRequest.assignedToUserId, input.assignedToUserId)
			);
		}
		if (input.assignedToMe) {
			filters.push(eq(helpdeskRequest.assignedToUserId, actorId(context)));
		}
		if (input.unassigned) {
			filters.push(isNull(helpdeskRequest.assignedToUserId));
		}
		if (input.priority) {
			filters.push(eq(helpdeskRequest.priority, input.priority));
		}
		if (input.search) {
			const term = `%${input.search}%`;
			const searchClause = or(
				ilike(helpdeskRequest.title, term),
				ilike(helpdeskRequest.reference, term)
			);
			if (searchClause) {
				filters.push(searchClause);
			}
		}

		// Self-scope (My requests): strictest filter, applied for ANY role. This is
		// the only path that narrows an HR/agent/manager down to their own rows, so
		// the "My requests" surface never shows the team queue.
		if (input.mine) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return { data: [], total: 0, page: input.page };
			}
			filters.push(eq(helpdeskRequest.requesterEmployeeId, me.id));
		} else if (!seesAllRequests(callerRole)) {
			// Lateral scope: agents/HR/auditor/payroll see all; managers see own +
			// direct reports; everyone else (employee) sees only their own.
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return { data: [], total: 0, page: input.page };
			}
			if (callerRole === "manager") {
				const reportIds = await getDirectReportIds(me.id, oid);
				filters.push(
					inArray(helpdeskRequest.requesterEmployeeId, [me.id, ...reportIds])
				);
			} else {
				filters.push(eq(helpdeskRequest.requesterEmployeeId, me.id));
			}
		}

		const offset = (input.page - 1) * input.pageSize;
		const [rows, totalRows] = await Promise.all([
			db
				.select({
					...getTableColumns(helpdeskRequest),
					requesterFirstName: employeeProfile.firstName,
					requesterLastName: employeeProfile.lastName,
					assigneeName: user.name,
					categoryName: helpdeskCategory.name,
				})
				.from(helpdeskRequest)
				.leftJoin(
					employeeProfile,
					eq(helpdeskRequest.requesterEmployeeId, employeeProfile.id)
				)
				.leftJoin(user, eq(helpdeskRequest.assignedToUserId, user.id))
				.leftJoin(
					helpdeskCategory,
					eq(helpdeskRequest.categoryId, helpdeskCategory.id)
				)
				.where(and(...filters))
				.orderBy(desc(helpdeskRequest.createdAt))
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ value: count() })
				.from(helpdeskRequest)
				.where(and(...filters)),
		]);

		const data = rows.map((row) => {
			const { requesterFirstName, requesterLastName, ...rest } = row;
			return {
				...rest,
				requesterName: formatName(requesterFirstName, requesterLastName),
				slaState: computeSlaState(rest),
			};
		});
		return { data, total: Number(totalRows[0]?.value ?? 0), page: input.page };
	});

const requestsGetById = authorizedProcedure("ticket", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		await assertRequestVisible(oid, actorId(context), callerRole, req);

		const [
			names,
			requesterEmp,
			targetEmp,
			category,
			rawComments,
			linkedEntities,
		] = await Promise.all([
			userNameMap([
				req.assignedToUserId,
				req.createdByUserId,
				req.approvedByUserId,
			]),
			db
				.select({
					firstName: employeeProfile.firstName,
					lastName: employeeProfile.lastName,
				})
				.from(employeeProfile)
				.where(eq(employeeProfile.id, req.requesterEmployeeId))
				.limit(1),
			req.targetEmployeeId
				? db
						.select({
							firstName: employeeProfile.firstName,
							lastName: employeeProfile.lastName,
						})
						.from(employeeProfile)
						.where(eq(employeeProfile.id, req.targetEmployeeId))
						.limit(1)
				: Promise.resolve([]),
			req.categoryId
				? db
						.select({ name: helpdeskCategory.name })
						.from(helpdeskCategory)
						.where(eq(helpdeskCategory.id, req.categoryId))
						.limit(1)
				: Promise.resolve([]),
			db
				.select({
					...getTableColumns(helpdeskRequestComment),
					authorName: user.name,
				})
				.from(helpdeskRequestComment)
				.leftJoin(user, eq(helpdeskRequestComment.authorUserId, user.id))
				.where(eq(helpdeskRequestComment.requestId, req.id))
				.orderBy(asc(helpdeskRequestComment.createdAt)),
			resolveLinkedEntities(oid, req),
		]);

		// SERVER-SIDE internal-note redaction — never trust the client to hide.
		const canSeeInternal = canViewHelpdeskInternalNotes(callerRole);
		const comments = rawComments.filter((c) => canSeeInternal || !c.isInternal);

		return {
			...req,
			slaState: computeSlaState(req),
			requesterName: formatName(
				requesterEmp[0]?.firstName ?? null,
				requesterEmp[0]?.lastName ?? null
			),
			targetName: formatName(
				targetEmp[0]?.firstName ?? null,
				targetEmp[0]?.lastName ?? null
			),
			assigneeName: req.assignedToUserId
				? (names.get(req.assignedToUserId) ?? null)
				: null,
			createdByName: req.createdByUserId
				? (names.get(req.createdByUserId) ?? null)
				: null,
			approvedByName: req.approvedByUserId
				? (names.get(req.approvedByUserId) ?? null)
				: null,
			categoryName: category[0]?.name ?? null,
			canViewInternalNotes: canSeeInternal,
			comments,
			linkedEntities,
		};
	});

/**
 * Employee self-service: log a request for myself. Gated by ticket:create (the
 * action the employee role holds). The requester is always the caller's own
 * employee record — never a supplied id — so this cannot be used on behalf of
 * anyone else.
 */
const requestsCreateSelf = authorizedProcedure("ticket", "create")
	.input(
		z.object({
			categoryId: z.string().optional(),
			title: z.string().min(1).max(200),
			description: z.string().optional(),
			priority: PRIORITY.optional(),
			...LINK_INPUT,
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must have an employee profile to log a request.",
			});
		}
		const category = input.categoryId
			? await verifyCategory(oid, input.categoryId)
			: null;
		await verifyProvidedLinks(oid, input);
		const priority = input.priority ?? category?.defaultPriority ?? "normal";
		const now = new Date();
		const due = computeDueDates(
			priority,
			category?.defaultSlaHours ?? null,
			now
		);
		const approvalRequired = category?.requiresApproval ?? false;

		const { id, reference } = await createRequestRow({
			organizationId: oid,
			categoryId: input.categoryId ?? null,
			requesterEmployeeId: me.id,
			createdByUserId: actorId(context),
			title: input.title,
			description: input.description ?? null,
			priority,
			status: "new",
			firstResponseDueAt: due.firstResponseDueAt,
			resolutionDueAt: due.resolutionDueAt,
			approvalRequired,
			approvalStatus: approvalRequired ? "pending" : "none",
			linkedAssetId: input.linkedAssetId ?? null,
			linkedPayslipId: input.linkedPayslipId ?? null,
			linkedPayrollRunId: input.linkedPayrollRunId ?? null,
			linkedLeaveRequestId: input.linkedLeaveRequestId ?? null,
			linkedAttendanceRecordId: input.linkedAttendanceRecordId ?? null,
			linkedOffboardingCaseId: input.linkedOffboardingCaseId ?? null,
			linkedEntityType: input.linkedEntityType ?? null,
			linkedEntityId: input.linkedEntityId ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { reference, self: true },
		});
		return { id, reference };
	});

/**
 * Manager/HR logs a request on behalf of an employee. Gated by ticket:create,
 * but the handler restricts WHO may target WHOM: HR/admin/agent for anyone,
 * managers only for their direct reports. Employees cannot reach this branch.
 */
const requestsCreateForEmployee = authorizedProcedure("ticket", "create")
	.input(
		z.object({
			employeeId: z.string(),
			categoryId: z.string().optional(),
			title: z.string().min(1).max(200),
			description: z.string().optional(),
			priority: PRIORITY.optional(),
			...LINK_INPUT,
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		if (!canManageHelpdesk(callerRole)) {
			if (callerRole === "manager") {
				const me = await resolveCurrentEmployee(oid, actorId(context));
				const reportIds = me ? await getDirectReportIds(me.id, oid) : [];
				if (!reportIds.includes(input.employeeId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You can only log requests for your direct reports.",
					});
				}
			} else {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only log a request for yourself.",
				});
			}
		}
		await verifyEmployeeInOrg(oid, input.employeeId);
		const category = input.categoryId
			? await verifyCategory(oid, input.categoryId)
			: null;
		await verifyProvidedLinks(oid, input);
		const priority = input.priority ?? category?.defaultPriority ?? "normal";
		const now = new Date();
		const due = computeDueDates(
			priority,
			category?.defaultSlaHours ?? null,
			now
		);
		const approvalRequired = category?.requiresApproval ?? false;

		const { id, reference } = await createRequestRow({
			organizationId: oid,
			categoryId: input.categoryId ?? null,
			requesterEmployeeId: input.employeeId,
			createdByUserId: actorId(context),
			title: input.title,
			description: input.description ?? null,
			priority,
			status: "new",
			firstResponseDueAt: due.firstResponseDueAt,
			resolutionDueAt: due.resolutionDueAt,
			approvalRequired,
			approvalStatus: approvalRequired ? "pending" : "none",
			linkedAssetId: input.linkedAssetId ?? null,
			linkedPayslipId: input.linkedPayslipId ?? null,
			linkedPayrollRunId: input.linkedPayrollRunId ?? null,
			linkedLeaveRequestId: input.linkedLeaveRequestId ?? null,
			linkedAttendanceRecordId: input.linkedAttendanceRecordId ?? null,
			linkedOffboardingCaseId: input.linkedOffboardingCaseId ?? null,
			linkedEntityType: input.linkedEntityType ?? null,
			linkedEntityId: input.linkedEntityId ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { reference, self: false, employeeId: input.employeeId },
		});
		return { id, reference };
	});

const requestsUpdate = authorizedProcedure("ticket", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).max(200).optional(),
			description: z.string().nullable().optional(),
			categoryId: z.string().nullable().optional(),
			priority: PRIORITY.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "A closed or cancelled request can no longer be edited.",
			});
		}
		if (input.categoryId) {
			await verifyCategory(oid, input.categoryId);
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.title !== undefined) {
			patch.title = input.title;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.categoryId !== undefined) {
			patch.categoryId = input.categoryId;
		}
		if (input.priority !== undefined) {
			patch.priority = input.priority;
		}
		await db
			.update(helpdeskRequest)
			.set(patch)
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const requestsAssign = authorizedProcedure("ticket", "assign")
	.input(z.object({ id: z.string(), assignedToUserId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canAssignHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "A closed or cancelled request cannot be reassigned.",
			});
		}
		await verifyOrgMember(oid, input.assignedToUserId);
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				assignedToUserId: input.assignedToUserId,
				status: req.status === "new" ? "open" : req.status,
				firstRespondedAt: req.firstRespondedAt ?? now,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: {
				transition: "assign",
				assignedToUserId: input.assignedToUserId,
			},
		});
		return { id: input.id };
	});

/** Self-assign the current request to the caller. Reuses the `ticket:assign` AC. */
const requestsAssignToMe = authorizedProcedure("ticket", "assign")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canAssignHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const me = actorId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "A closed or cancelled request cannot be assigned.",
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				assignedToUserId: me,
				status: req.status === "new" ? "open" : req.status,
				firstRespondedAt: req.firstRespondedAt ?? now,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: me,
			metadata: { transition: "assign", assignedToUserId: me, self: true },
		});
		return { id: input.id };
	});

/** Clear the assignee (return to the unassigned pool). Reuses `ticket:assign`. */
const requestsUnassign = authorizedProcedure("ticket", "assign")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canAssignHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "A closed or cancelled request cannot be reassigned.",
			});
		}
		await db
			.update(helpdeskRequest)
			.set({ assignedToUserId: null, updatedAt: new Date() })
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "unassign" },
		});
		return { id: input.id };
	});

/**
 * Assignable agents for the teammate picker — org members who actually work the
 * desk (the canManageHelpdesk roles). Returns user id + display name + role label
 * only; no private fields. Gated by `ticket:assign` (only assigners need it).
 */
const requestsAssignableAgents = authorizedProcedure(
	"ticket",
	"assign"
).handler(async ({ context }) => {
	if (!canAssignHelpdesk(role(context))) {
		throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
	}
	const oid = orgId(context);
	const rows = await db
		.select({ userId: member.userId, name: user.name, role: member.role })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(
				eq(member.organizationId, oid),
				inArray(member.role, HELPDESK_AGENT_ROLES)
			)
		)
		.orderBy(asc(user.name));
	return rows;
});

const requestsChangeStatus = authorizedProcedure("ticket", "update")
	.input(z.object({ id: z.string(), status: WORKING_STATUS }))
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (
			req.status === "closed" ||
			req.status === "cancelled" ||
			req.status === "resolved"
		) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `A ${req.status} request cannot change status here. Reopen it first.`,
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				status: input.status,
				firstRespondedAt: req.firstRespondedAt ?? now,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "status", status: input.status },
		});
		return { id: input.id, status: input.status };
	});

const requestsResolve = authorizedProcedure("ticket", "resolve")
	.input(z.object({ id: z.string(), resolutionNote: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canResolveHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (
			req.status === "closed" ||
			req.status === "cancelled" ||
			req.status === "resolved"
		) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `A ${req.status} request cannot be resolved.`,
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				status: "resolved",
				resolvedAt: now,
				resolutionNote: input.resolutionNote,
				firstRespondedAt: req.firstRespondedAt ?? now,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "resolve" },
		});
		return { id: input.id };
	});

const requestsClose = authorizedProcedure("ticket", "close")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Request is already terminal.",
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({ status: "closed", closedAt: now, updatedAt: now })
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "close" },
		});
		return { id: input.id };
	});

/**
 * Cancel a request. The requester may cancel their own; an agent/HR may cancel
 * any. Gated by ticket:create (the action the requester holds — auditor, who is
 * read-only, has no ticket:create and is correctly blocked at the AC gate).
 */
const requestsCancel = authorizedProcedure("ticket", "create")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const isRequester =
			(me && me.id === req.requesterEmployeeId) ||
			req.createdByUserId === actorId(context);
		if (!(isRequester || canManageHelpdesk(callerRole))) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only cancel your own request.",
			});
		}
		if (
			req.status === "closed" ||
			req.status === "cancelled" ||
			req.status === "resolved"
		) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only an active request can be cancelled.",
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({ status: "cancelled", updatedAt: now })
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "cancel" },
		});
		return { id: input.id };
	});

const requestsReopen = authorizedProcedure("ticket", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageHelpdesk(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status !== "resolved" && req.status !== "closed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only a resolved or closed request can be reopened.",
			});
		}
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({ status: "open", resolvedAt: null, closedAt: null, updatedAt: now })
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reopen" },
		});
		return { id: input.id };
	});

/**
 * Manager scope for an approval: a manager may only approve/reject a request
 * that is assigned to them OR whose requester is one of their direct reports.
 * HR/admin/agent/payroll may approve any. ticket:approve is the AC gate.
 */
async function assertCanDecideApproval(
	oid: string,
	userId: string,
	callerRole: string,
	req: RequestRow
): Promise<void> {
	if (canManageHelpdesk(callerRole) || callerRole === "payroll_admin") {
		return;
	}
	// Only a manager reaches here today (canApproveHelpdeskRequest = manage ∪
	// manager ∪ payroll_admin). Gate the manager scope EXPLICITLY so a future role
	// added to the approve gate can't silently inherit manager-style scoping.
	if (callerRole !== "manager") {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to decide this approval.",
		});
	}
	const assignedToMe = req.assignedToUserId === userId;
	let isReport = false;
	const me = await resolveCurrentEmployee(oid, userId);
	if (me) {
		const reportIds = await getDirectReportIds(me.id, oid);
		isReport = reportIds.includes(req.requesterEmployeeId);
	}
	if (!(assignedToMe || isReport)) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"You can only approve requests assigned to you or for your reports.",
		});
	}
}

const requestsApprove = authorizedProcedure("ticket", "approve")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canApproveHelpdeskRequest(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (!(req.approvalRequired && req.approvalStatus === "pending")) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This request is not awaiting approval.",
			});
		}
		await assertCanDecideApproval(oid, actorId(context), callerRole, req);
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				approvalStatus: "approved",
				approvedByUserId: actorId(context),
				approvalNote: input.note ?? null,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "approve" },
		});
		return { id: input.id };
	});

const requestsRejectApproval = authorizedProcedure("ticket", "approve")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canApproveHelpdeskRequest(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (!(req.approvalRequired && req.approvalStatus === "pending")) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This request is not awaiting approval.",
			});
		}
		await assertCanDecideApproval(oid, actorId(context), callerRole, req);
		const now = new Date();
		await db
			.update(helpdeskRequest)
			.set({
				approvalStatus: "rejected",
				approvedByUserId: actorId(context),
				approvalNote: input.reason,
				updatedAt: now,
			})
			.where(
				and(
					eq(helpdeskRequest.id, input.id),
					eq(helpdeskRequest.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reject_approval", reason: input.reason },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════════════════════

const commentsList = authorizedProcedure("ticket", "read")
	.input(z.object({ requestId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.requestId);
		await assertRequestVisible(oid, actorId(context), callerRole, req);
		const rows = await db
			.select({
				...getTableColumns(helpdeskRequestComment),
				authorName: user.name,
			})
			.from(helpdeskRequestComment)
			.leftJoin(user, eq(helpdeskRequestComment.authorUserId, user.id))
			.where(eq(helpdeskRequestComment.requestId, req.id))
			.orderBy(asc(helpdeskRequestComment.createdAt));
		// SERVER-SIDE internal-note redaction.
		const canSeeInternal = canViewHelpdeskInternalNotes(callerRole);
		return rows.filter((c) => canSeeInternal || !c.isInternal);
	});

/** Add a public comment. Any participant (requester / manager-scope / agent). */
const commentsCreate = authorizedProcedure("ticket", "create")
	.input(z.object({ requestId: z.string(), body: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.requestId);
		await assertRequestVisible(oid, actorId(context), callerRole, req);
		if (req.status === "closed" || req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You cannot comment on a closed or cancelled request.",
			});
		}
		const id = createId();
		await db.insert(helpdeskRequestComment).values({
			id,
			organizationId: oid,
			requestId: req.id,
			authorUserId: actorId(context),
			body: input.body,
			isInternal: false,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request_comment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { requestId: req.id, internal: false },
		});
		return { id };
	});

/**
 * Add an INTERNAL note. Gated by ticket:update AND canViewHelpdeskInternalNotes
 * (agents/HR). The note is redacted from the requesting employee in every read.
 */
const commentsCreateInternal = authorizedProcedure("ticket", "update")
	.input(z.object({ requestId: z.string(), body: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewHelpdeskInternalNotes(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.requestId);
		// Intentional asymmetry vs. public comments: an internal note IS allowed on
		// a resolved/closed request (post-mortem / audit trail), but NOT on a
		// cancelled one. Public comments are blocked on both terminal states.
		if (req.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You cannot annotate a cancelled request.",
			});
		}
		const now = new Date();
		const id = createId();
		await db.insert(helpdeskRequestComment).values({
			id,
			organizationId: oid,
			requestId: req.id,
			authorUserId: actorId(context),
			body: input.body,
			isInternal: true,
		});
		// An internal note is a form of agent first-response.
		if (!req.firstRespondedAt) {
			await db
				.update(helpdeskRequest)
				.set({ firstRespondedAt: now, updatedAt: now })
				.where(
					and(
						eq(helpdeskRequest.id, req.id),
						eq(helpdeskRequest.organizationId, oid)
					)
				);
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "helpdesk_request_comment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { requestId: req.id, internal: true },
		});
		return { id };
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const helpdeskRouter = {
	categories: {
		list: categoriesList,
		create: categoriesCreate,
		update: categoriesUpdate,
		archive: categoriesArchive,
	},
	requests: {
		list: requestsList,
		getById: requestsGetById,
		createSelf: requestsCreateSelf,
		createForEmployee: requestsCreateForEmployee,
		update: requestsUpdate,
		assign: requestsAssign,
		assignToMe: requestsAssignToMe,
		unassign: requestsUnassign,
		assignableAgents: requestsAssignableAgents,
		changeStatus: requestsChangeStatus,
		resolve: requestsResolve,
		close: requestsClose,
		cancel: requestsCancel,
		reopen: requestsReopen,
		approve: requestsApprove,
		rejectApproval: requestsRejectApproval,
	},
	comments: {
		list: commentsList,
		create: commentsCreate,
		createInternal: commentsCreateInternal,
	},
};
