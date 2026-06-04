// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Projects + Tasks / Timelines oRPC router — Phase 14C.
 *
 * Scope (per docs/architecture/projects-tasks-implementation-plan.md §7):
 *
 *   projects      list / getById / create / update / archive / unarchive
 *   members       list / add / remove
 *   milestones    list / create / update / complete
 *   tasks         list / getById / create / update / changeStatus / assign /
 *                 unassign / complete  (+ comments: list / create / createInternal)
 *   timeEntries   list / create / update / submit / approve / reject
 *
 * CENTRAL GUARDRAIL (mirrors Helpdesk 13C exactly): Projects is the COORDINATION
 * layer. It LINKS to Assets / Helpdesk / CRM / Payroll / Attendance for context
 * and NEVER owns or mutates their business rules.
 *   - Cross-module link ids (task.linkedAssetId → asset,
 *     task.linkedHelpdeskRequestId → helpdesk_request) are tenant-VERIFIED on
 *     write (SELECT-only) and resolved READ-ONLY on read. There is NO insert /
 *     update / delete to asset / helpdesk_request / payroll / attendance anywhere
 *     in this file.
 *   - CRM links (project.linkedCustomerId / linkedDealId) are SOFT text refs — no
 *     FK, no verification target table yet (Phase 17). Stored as given.
 *   - `budget` (and any future cost) is finance-redacted server-side: nulled for
 *     callers without canViewProjectCosts, with a canViewBudget flag on getById.
 *   - Task internal-note comments (isInternal) are redacted server-side in every
 *     read unless canViewProjectInternalNotes — UI hiding is not sufficient.
 *   - Project HEALTH is DERIVED at read time (computeProjectHealth) — never stored.
 *   - References (PRJ-000042 / TSK-000042) are MAX+1 per org with a retry loop;
 *     the (org, reference) partial-unique index is the race backstop.
 *   - Two-layer authz: the AC gate (authorizedProcedure on a real project / task /
 *     time_entry action) PLUS a handler re-check and lateral scope — employees see
 *     member projects / own tasks / own time; managers their own + direct reports;
 *     managing roles / auditor / payroll see all.
 */

import { db } from "@Heimdallone/db";
import { asset } from "@Heimdallone/db/schema/assets";
import { user } from "@Heimdallone/db/schema/auth";
import { helpdeskRequest } from "@Heimdallone/db/schema/helpdesk";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import {
	type ProjectHealth,
	project,
	projectMember,
	projectMilestone,
	projectTask,
	projectTaskComment,
	projectTimeEntry,
} from "@Heimdallone/db/schema/projects";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	asc,
	count,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNull,
	max,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import {
	canAssignProjectTasks,
	canManageProjects,
	canViewProjectCosts,
	canViewProjectInternalNotes,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MAX_REFERENCE_ATTEMPTS = 6;
const LIST_LIMIT = 200;
const AT_RISK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Zod enums matching schema ───────────────────────────────────────────────

const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);
const PROJECT_STATUS = z.enum([
	"planning",
	"active",
	"on_hold",
	"completed",
	"cancelled",
	"archived",
]);
const MILESTONE_STATUS = z.enum([
	"planned",
	"in_progress",
	"at_risk",
	"completed",
	"missed",
	"cancelled",
]);
// changeStatus moves between the working task states; `complete` has a dedicated
// proc so the completedAt side effect lives in one place.
const TASK_STATUS = z.enum([
	"todo",
	"in_progress",
	"blocked",
	"in_review",
	"done",
	"cancelled",
]);
const MEMBER_ROLE = z.enum(["lead", "member", "viewer"]);
const LINKED_ENTITY_TYPE = z.enum([
	"document",
	"expense",
	"crm_deal",
	"crm_customer",
	"other",
]);

const PROJECT_TERMINAL = new Set(["completed", "cancelled", "archived"]);
const TASK_TERMINAL = new Set(["done", "cancelled"]);

// ────────────────────────────────────────────────────────────────────
// Display + health helpers
// ────────────────────────────────────────────────────────────────────

function formatName(first: string | null, last: string | null): string | null {
	const parts = [first, last].filter((p): p is string => Boolean(p));
	return parts.length > 0 ? parts.join(" ") : null;
}

function todayString(): string {
	return new Date().toISOString().slice(0, 10);
}

interface ProjectTaskStats {
	openTasks: number;
	overdueMilestones: number;
	overdueTasks: number;
	totalTasks: number;
}

const EMPTY_STATS: ProjectTaskStats = {
	totalTasks: 0,
	openTasks: 0,
	overdueTasks: 0,
	overdueMilestones: 0,
};

/**
 * Derived project health — computed, NEVER stored (a persisted value goes stale,
 * like the helpdesk SLA state). Terminal projects are "completed"; a project with
 * no work and no target is "no_data"; overdue milestones / an overdue target with
 * open work is "off_track"; overdue tasks or a target inside the at-risk window
 * with open work is "at_risk"; otherwise "on_track".
 */
function computeProjectHealth(
	p: { status: string; targetEndDate: Date | null },
	stats: ProjectTaskStats,
	now: Date
): ProjectHealth {
	if (PROJECT_TERMINAL.has(p.status)) {
		return "completed";
	}
	if (stats.totalTasks === 0 && !p.targetEndDate) {
		return "no_data";
	}
	const targetPastWithWork =
		p.targetEndDate !== null &&
		p.targetEndDate.getTime() < now.getTime() &&
		stats.openTasks > 0;
	if (stats.overdueMilestones > 0 || targetPastWithWork) {
		return "off_track";
	}
	const targetSoonWithWork =
		p.targetEndDate !== null &&
		p.targetEndDate.getTime() - now.getTime() < AT_RISK_WINDOW_MS &&
		stats.openTasks > 0;
	if (stats.overdueTasks > 0 || targetSoonWithWork) {
		return "at_risk";
	}
	return "on_track";
}

/** Grouped task stats for a set of projects (avoids N+1 on list). */
async function taskStatsForProjects(
	oid: string,
	projectIds: string[]
): Promise<Map<string, ProjectTaskStats>> {
	const out = new Map<string, ProjectTaskStats>();
	if (projectIds.length === 0) {
		return out;
	}
	const today = todayString();
	const taskRows = await db
		.select({
			projectId: projectTask.projectId,
			total: count(),
			open: sql<number>`sum(case when ${projectTask.status} in ('done','cancelled') then 0 else 1 end)`,
			overdue: sql<number>`sum(case when ${projectTask.dueDate} < ${today} and ${projectTask.status} not in ('done','cancelled') then 1 else 0 end)`,
		})
		.from(projectTask)
		.where(
			and(
				eq(projectTask.organizationId, oid),
				isNull(projectTask.deletedAt),
				inArray(projectTask.projectId, projectIds)
			)
		)
		.groupBy(projectTask.projectId);
	const mileRows = await db
		.select({
			projectId: projectMilestone.projectId,
			overdue: sql<number>`sum(case when ${projectMilestone.dueDate} < ${today} and ${projectMilestone.status} not in ('completed','cancelled') then 1 else 0 end)`,
		})
		.from(projectMilestone)
		.where(
			and(
				eq(projectMilestone.organizationId, oid),
				isNull(projectMilestone.deletedAt),
				inArray(projectMilestone.projectId, projectIds)
			)
		)
		.groupBy(projectMilestone.projectId);
	const mileMap = new Map(
		mileRows.map((r) => [r.projectId, Number(r.overdue) || 0])
	);
	for (const r of taskRows) {
		out.set(r.projectId, {
			totalTasks: Number(r.total) || 0,
			openTasks: Number(r.open) || 0,
			overdueTasks: Number(r.overdue) || 0,
			overdueMilestones: mileMap.get(r.projectId) ?? 0,
		});
	}
	// Projects with milestones but no tasks still need their milestone overdue count.
	for (const [pid, overdue] of mileMap) {
		if (!out.has(pid)) {
			out.set(pid, { ...EMPTY_STATS, overdueMilestones: overdue });
		}
	}
	return out;
}

// ────────────────────────────────────────────────────────────────────
// Scope — the IDOR layer (mirrors helpdesk assertRequestVisible)
// ────────────────────────────────────────────────────────────────────

/** Roles that see every project in the org (no lateral scoping). */
function seesAllProjects(callerRole: string): boolean {
	return (
		canManageProjects(callerRole) ||
		callerRole === "auditor" ||
		callerRole === "payroll_admin"
	);
}

/**
 * The set of employee ids a non-seesAll caller "covers": always themselves, plus
 * (for a manager) their direct reports. Returns null if the caller has no
 * employee profile (e.g. a platform user with no employee row).
 */
async function coveredEmployeeIds(
	oid: string,
	callerRole: string,
	userId: string
): Promise<string[] | null> {
	const me = await resolveCurrentEmployee(oid, userId);
	if (!me) {
		return null;
	}
	const ids = [me.id];
	if (callerRole === "manager") {
		ids.push(...(await getDirectReportIds(me.id, oid)));
	}
	return ids;
}

/**
 * Project ids visible to a non-seesAll caller: projects they manage or are an
 * active member of, plus (for a manager) projects a direct report belongs to.
 */
async function visibleProjectIds(
	oid: string,
	covered: string[]
): Promise<string[]> {
	if (covered.length === 0) {
		return [];
	}
	const managed = await db
		.select({ id: project.id })
		.from(project)
		.where(
			and(
				eq(project.organizationId, oid),
				isNull(project.deletedAt),
				inArray(project.projectManagerEmployeeId, covered)
			)
		);
	const memberOf = await db
		.select({ id: projectMember.projectId })
		.from(projectMember)
		.where(
			and(
				eq(projectMember.organizationId, oid),
				isNull(projectMember.removedAt),
				inArray(projectMember.employeeId, covered)
			)
		);
	return [
		...new Set([...managed.map((r) => r.id), ...memberOf.map((r) => r.id)]),
	];
}

type ProjectRow = typeof project.$inferSelect;
type TaskRow = typeof projectTask.$inferSelect;

/** Throw FORBIDDEN unless the caller may see this project. */
async function assertProjectVisible(
	oid: string,
	userId: string,
	callerRole: string,
	p: ProjectRow
): Promise<void> {
	if (seesAllProjects(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (!covered) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to this project.",
		});
	}
	const ids = await visibleProjectIds(oid, covered);
	if (!ids.includes(p.id)) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to this project.",
		});
	}
}

/**
 * Throw FORBIDDEN unless the caller may see this task — either its project is
 * visible, or the task is assigned to the caller (or one of a manager's reports).
 */
async function assertTaskVisible(
	oid: string,
	userId: string,
	callerRole: string,
	task: TaskRow
): Promise<void> {
	if (seesAllProjects(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (!covered) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to this task.",
		});
	}
	if (task.assigneeEmployeeId && covered.includes(task.assigneeEmployeeId)) {
		return;
	}
	const ids = await visibleProjectIds(oid, covered);
	if (!ids.includes(task.projectId)) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to this task.",
		});
	}
}

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every id input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyProject(oid: string, id: string): Promise<ProjectRow> {
	const [row] = await db
		.select()
		.from(project)
		.where(
			and(
				eq(project.id, id),
				eq(project.organizationId, oid),
				isNull(project.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Project not found." });
	}
	return row;
}

async function verifyTask(oid: string, id: string): Promise<TaskRow> {
	const [row] = await db
		.select()
		.from(projectTask)
		.where(
			and(
				eq(projectTask.id, id),
				eq(projectTask.organizationId, oid),
				isNull(projectTask.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Task not found." });
	}
	return row;
}

async function verifyMilestone(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(projectMilestone)
		.where(
			and(
				eq(projectMilestone.id, id),
				eq(projectMilestone.organizationId, oid),
				isNull(projectMilestone.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Milestone not found." });
	}
	return row;
}

async function verifyTimeEntry(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(projectTimeEntry)
		.where(
			and(
				eq(projectTimeEntry.id, id),
				eq(projectTimeEntry.organizationId, oid),
				isNull(projectTimeEntry.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Time entry not found." });
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

// ── Cross-module link verification (the guardrail). SELECT-only — these prove the
//    linked row belongs to the org so we never store a dangling/cross-tenant link.
//    Nothing in this router ever WRITES to asset / helpdesk_request. ────────────

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

async function verifyLinkedHelpdeskRequest(oid: string, id: string) {
	const [row] = await db
		.select({ id: helpdeskRequest.id })
		.from(helpdeskRequest)
		.where(
			and(eq(helpdeskRequest.id, id), eq(helpdeskRequest.organizationId, oid))
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked helpdesk request is not in this organization.",
		});
	}
}

interface TaskLinkInput {
	linkedAssetId?: string | null;
	linkedHelpdeskRequestId?: string | null;
}

/** Tenant-verify every provided task link id. SELECT-only — never mutates target. */
async function verifyTaskLinks(oid: string, input: TaskLinkInput) {
	if (input.linkedAssetId) {
		await verifyLinkedAsset(oid, input.linkedAssetId);
	}
	if (input.linkedHelpdeskRequestId) {
		await verifyLinkedHelpdeskRequest(oid, input.linkedHelpdeskRequestId);
	}
}

// ── Reference allocation (MAX+1 per org with a retry loop) ────────────────────

async function nextReference(
	oid: string,
	prefix: "PRJ" | "TSK"
): Promise<string> {
	const table = prefix === "PRJ" ? project : projectTask;
	const [row] = await db
		.select({ value: max(table.reference) })
		.from(table)
		.where(eq(table.organizationId, oid));
	const current = row?.value
		? Number.parseInt(String(row.value).replace(/\D/g, ""), 10)
		: 0;
	const next = Number.isNaN(current) ? 1 : current + 1;
	return `${prefix}-${String(next).padStart(6, "0")}`;
}

function isUniqueViolation(err: unknown): boolean {
	return (err as { cause?: { code?: string } }).cause?.code === "23505";
}

// ── Display-name resolution ───────────────────────────────────────────────────

async function employeeNameMap(
	ids: (string | null)[]
): Promise<Map<string, string>> {
	const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
	if (unique.length === 0) {
		return new Map();
	}
	const rows = await db
		.select({
			id: employeeProfile.id,
			firstName: employeeProfile.firstName,
			lastName: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(inArray(employeeProfile.id, unique));
	return new Map(
		rows.map((r) => [r.id, formatName(r.firstName, r.lastName) ?? r.id])
	);
}

/** Null out budget for callers without canViewProjectCosts. */
function redactBudget<T extends { budget: string | null }>(
	row: T,
	callerRole: string
): T {
	if (canViewProjectCosts(callerRole)) {
		return row;
	}
	return { ...row, budget: null };
}

// ════════════════════════════════════════════════════════════════════
// PROJECTS
// ════════════════════════════════════════════════════════════════════

const projectsList = authorizedProcedure("project", "read")
	.input(
		z
			.object({
				status: PROJECT_STATUS.optional(),
				health: z.enum(["on_track", "at_risk", "off_track"]).optional(),
				search: z.string().optional(),
				includeArchived: z.boolean().optional(),
				mine: z.boolean().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const opts = input ?? {};

		// Determine the candidate project id set under lateral scope.
		let scopedIds: string[] | null = null; // null = all
		if (opts.mine || !seesAllProjects(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			scopedIds = covered ? await visibleProjectIds(oid, covered) : [];
			if (scopedIds.length === 0) {
				return [];
			}
		}

		const filters = [
			eq(project.organizationId, oid),
			isNull(project.deletedAt),
		];
		if (scopedIds) {
			filters.push(inArray(project.id, scopedIds));
		}
		if (opts.status) {
			filters.push(eq(project.status, opts.status));
		}
		if (!opts.includeArchived) {
			filters.push(eq(project.isArchived, false));
		}
		if (opts.search) {
			filters.push(
				or(
					sql`${project.name} ilike ${`%${opts.search}%`}`,
					sql`${project.reference} ilike ${`%${opts.search}%`}`
				)!
			);
		}

		const rows = await db
			.select()
			.from(project)
			.where(and(...filters))
			.orderBy(desc(project.createdAt))
			.limit(opts.limit ?? LIST_LIMIT);

		const stats = await taskStatsForProjects(
			oid,
			rows.map((r) => r.id)
		);
		const mgrNames = await employeeNameMap(
			rows.map((r) => r.projectManagerEmployeeId)
		);
		const now = new Date();
		const out = rows.map((r) => {
			const s = stats.get(r.id) ?? EMPTY_STATS;
			const health = computeProjectHealth(r, s, now);
			return {
				...redactBudget(r, callerRole),
				health,
				projectManagerName: r.projectManagerEmployeeId
					? (mgrNames.get(r.projectManagerEmployeeId) ?? null)
					: null,
				taskCount: s.totalTasks,
				openTaskCount: s.openTasks,
				overdueTaskCount: s.overdueTasks,
				hasCrossModuleLinks: Boolean(r.linkedCustomerId || r.linkedDealId),
			};
		});
		if (opts.health) {
			return out.filter((r) => r.health === opts.health);
		}
		return out;
	});

const projectsGetById = authorizedProcedure("project", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.id);
		await assertProjectVisible(oid, actorId(context), callerRole, p);

		const stats = await taskStatsForProjects(oid, [p.id]);
		const s = stats.get(p.id) ?? EMPTY_STATS;
		const health = computeProjectHealth(p, s, new Date());
		const [memberCountRow] = await db
			.select({ value: count() })
			.from(projectMember)
			.where(
				and(eq(projectMember.projectId, p.id), isNull(projectMember.removedAt))
			);
		const mgrNames = await employeeNameMap([p.projectManagerEmployeeId]);
		const canViewBudget = canViewProjectCosts(callerRole);
		return {
			...redactBudget(p, callerRole),
			health,
			canViewBudget,
			projectManagerName: p.projectManagerEmployeeId
				? (mgrNames.get(p.projectManagerEmployeeId) ?? null)
				: null,
			memberCount: Number(memberCountRow?.value) || 0,
			taskCount: s.totalTasks,
			openTaskCount: s.openTasks,
			overdueTaskCount: s.overdueTasks,
			overdueMilestoneCount: s.overdueMilestones,
		};
	});

const projectsCreate = authorizedProcedure("project", "create")
	.input(
		z.object({
			name: z.string().min(1),
			description: z.string().optional(),
			status: PROJECT_STATUS.optional(),
			priority: PRIORITY.optional(),
			projectManagerEmployeeId: z.string().optional(),
			departmentId: z.string().optional(),
			startDate: z.string().optional(),
			targetEndDate: z.string().optional(),
			budget: z.string().optional(),
			linkedCustomerId: z.string().optional(),
			linkedDealId: z.string().optional(),
			internalNote: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		if (input.projectManagerEmployeeId) {
			await verifyEmployeeInOrg(oid, input.projectManagerEmployeeId);
		}
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const reference = await nextReference(oid, "PRJ");
			const id = createId();
			try {
				await db.insert(project).values({
					id,
					organizationId: oid,
					reference,
					name: input.name,
					description: input.description ?? null,
					status: input.status ?? "planning",
					priority: input.priority ?? null,
					projectManagerEmployeeId: input.projectManagerEmployeeId ?? null,
					departmentId: input.departmentId ?? null,
					startDate: input.startDate ? new Date(input.startDate) : null,
					targetEndDate: input.targetEndDate
						? new Date(input.targetEndDate)
						: null,
					budget: input.budget ?? null,
					linkedCustomerId: input.linkedCustomerId ?? null,
					linkedDealId: input.linkedDealId ?? null,
					internalNote: input.internalNote ?? null,
					createdByUserId: actorId(context),
				});
				// If a PM was named, ensure they have a `lead` membership row too.
				if (input.projectManagerEmployeeId) {
					await db.insert(projectMember).values({
						id: createId(),
						organizationId: oid,
						projectId: id,
						employeeId: input.projectManagerEmployeeId,
						role: "lead",
					});
				}
				await createAuditEvent(db as never, {
					organizationId: oid,
					entityType: "project",
					entityId: id,
					action: "create",
					actorId: actorId(context),
					metadata: { reference, name: input.name },
				});
				return { id, reference };
			} catch (err: unknown) {
				if (isUniqueViolation(err) && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
					continue;
				}
				throw err;
			}
		}
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Could not allocate a project reference. Please retry.",
		});
	});

const projectsUpdate = authorizedProcedure("project", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			status: PROJECT_STATUS.optional(),
			priority: PRIORITY.nullable().optional(),
			projectManagerEmployeeId: z.string().nullable().optional(),
			departmentId: z.string().nullable().optional(),
			startDate: z.string().nullable().optional(),
			targetEndDate: z.string().nullable().optional(),
			budget: z.string().nullable().optional(),
			linkedCustomerId: z.string().nullable().optional(),
			linkedDealId: z.string().nullable().optional(),
			internalNote: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.id);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		// Archived projects are frozen — unarchive first.
		if (p.status === "archived" || p.isArchived) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Unarchive this project before editing it.",
			});
		}
		if (input.projectManagerEmployeeId) {
			await verifyEmployeeInOrg(oid, input.projectManagerEmployeeId);
		}
		// departmentId existence is enforced by the set-null FK on write.

		const patch: Partial<typeof project.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.priority !== undefined) {
			patch.priority = input.priority;
		}
		if (input.projectManagerEmployeeId !== undefined) {
			patch.projectManagerEmployeeId = input.projectManagerEmployeeId;
		}
		if (input.departmentId !== undefined) {
			patch.departmentId = input.departmentId;
		}
		if (input.startDate !== undefined) {
			patch.startDate = input.startDate ? new Date(input.startDate) : null;
		}
		if (input.targetEndDate !== undefined) {
			patch.targetEndDate = input.targetEndDate
				? new Date(input.targetEndDate)
				: null;
		}
		if (input.budget !== undefined) {
			patch.budget = input.budget;
		}
		if (input.linkedCustomerId !== undefined) {
			patch.linkedCustomerId = input.linkedCustomerId;
		}
		if (input.linkedDealId !== undefined) {
			patch.linkedDealId = input.linkedDealId;
		}
		if (input.internalNote !== undefined) {
			patch.internalNote = input.internalNote;
		}
		if (input.status !== undefined) {
			patch.status = input.status;
			patch.completedAt = input.status === "completed" ? new Date() : null;
		}

		await db
			.update(project)
			.set(patch)
			.where(and(eq(project.id, p.id), eq(project.organizationId, oid)));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project",
			entityId: p.id,
			action: "update",
			actorId: actorId(context),
			metadata: input.status ? { status: input.status } : {},
		});
		return { id: p.id };
	});

const projectsArchive = authorizedProcedure("project", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.id);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		await db
			.update(project)
			.set({ isArchived: true, status: "archived", updatedAt: new Date() })
			.where(and(eq(project.id, p.id), eq(project.organizationId, oid)));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project",
			entityId: p.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: p.id };
	});

const projectsUnarchive = authorizedProcedure("project", "archive")
	.input(z.object({ id: z.string(), status: PROJECT_STATUS.optional() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.id);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		await db
			.update(project)
			.set({
				isArchived: false,
				status: input.status ?? "active",
				updatedAt: new Date(),
			})
			.where(and(eq(project.id, p.id), eq(project.organizationId, oid)));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project",
			entityId: p.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "unarchive" },
		});
		return { id: p.id };
	});

// ════════════════════════════════════════════════════════════════════
// MEMBERS
// ════════════════════════════════════════════════════════════════════

const membersList = authorizedProcedure("project", "read")
	.input(z.object({ projectId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		const rows = await db
			.select({
				...getTableColumns(projectMember),
				firstName: employeeProfile.firstName,
				lastName: employeeProfile.lastName,
			})
			.from(projectMember)
			.innerJoin(
				employeeProfile,
				eq(projectMember.employeeId, employeeProfile.id)
			)
			.where(
				and(eq(projectMember.projectId, p.id), isNull(projectMember.removedAt))
			)
			.orderBy(asc(projectMember.createdAt));
		return rows.map((r) => ({
			...r,
			employeeName: formatName(r.firstName, r.lastName),
		}));
	});

const membersAdd = authorizedProcedure("project", "manage_members")
	.input(
		z.object({
			projectId: z.string(),
			employeeId: z.string(),
			role: MEMBER_ROLE.optional(),
			allocationPercent: z.number().int().min(0).max(100).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		await verifyEmployeeInOrg(oid, input.employeeId);
		// Reactivate a previously-removed membership rather than duplicate it.
		const [existing] = await db
			.select()
			.from(projectMember)
			.where(
				and(
					eq(projectMember.projectId, p.id),
					eq(projectMember.employeeId, input.employeeId),
					isNull(projectMember.removedAt)
				)
			)
			.limit(1);
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "That employee is already a member of this project.",
			});
		}
		const id = createId();
		await db.insert(projectMember).values({
			id,
			organizationId: oid,
			projectId: p.id,
			employeeId: input.employeeId,
			role: input.role ?? "member",
			allocationPercent: input.allocationPercent ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_member",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { projectId: p.id, employeeId: input.employeeId },
		});
		return { id };
	});

const membersRemove = authorizedProcedure("project", "manage_members")
	.input(z.object({ projectId: z.string(), memberId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		const [m] = await db
			.select()
			.from(projectMember)
			.where(
				and(
					eq(projectMember.id, input.memberId),
					eq(projectMember.projectId, p.id),
					eq(projectMember.organizationId, oid),
					isNull(projectMember.removedAt)
				)
			)
			.limit(1);
		if (!m) {
			throw new ORPCError("NOT_FOUND", { message: "Member not found." });
		}
		await db
			.update(projectMember)
			.set({ removedAt: new Date(), updatedAt: new Date() })
			.where(eq(projectMember.id, m.id));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_member",
			entityId: m.id,
			action: "delete",
			actorId: actorId(context),
			metadata: { projectId: p.id },
		});
		return { id: m.id };
	});

// ════════════════════════════════════════════════════════════════════
// MILESTONES
// ════════════════════════════════════════════════════════════════════

const milestonesList = authorizedProcedure("project", "read")
	.input(z.object({ projectId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		const rows = await db
			.select()
			.from(projectMilestone)
			.where(
				and(
					eq(projectMilestone.projectId, p.id),
					isNull(projectMilestone.deletedAt)
				)
			)
			.orderBy(
				asc(projectMilestone.displayOrder),
				asc(projectMilestone.dueDate)
			);
		return rows;
	});

const milestonesCreate = authorizedProcedure("project", "update")
	.input(
		z.object({
			projectId: z.string(),
			name: z.string().min(1),
			description: z.string().optional(),
			status: MILESTONE_STATUS.optional(),
			dueDate: z.string().optional(),
			ownerEmployeeId: z.string().optional(),
			displayOrder: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		if (input.ownerEmployeeId) {
			await verifyEmployeeInOrg(oid, input.ownerEmployeeId);
		}
		const id = createId();
		await db.insert(projectMilestone).values({
			id,
			organizationId: oid,
			projectId: p.id,
			name: input.name,
			description: input.description ?? null,
			status: input.status ?? "planned",
			dueDate: input.dueDate ? new Date(input.dueDate) : null,
			ownerEmployeeId: input.ownerEmployeeId ?? null,
			displayOrder: input.displayOrder ?? 0,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_milestone",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { projectId: p.id, name: input.name },
		});
		return { id };
	});

const milestonesUpdate = authorizedProcedure("project", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			status: MILESTONE_STATUS.optional(),
			dueDate: z.string().nullable().optional(),
			ownerEmployeeId: z.string().nullable().optional(),
			displayOrder: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const ms = await verifyMilestone(oid, input.id);
		const p = await verifyProject(oid, ms.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		if (input.ownerEmployeeId) {
			await verifyEmployeeInOrg(oid, input.ownerEmployeeId);
		}
		const patch: Partial<typeof projectMilestone.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.status !== undefined) {
			patch.status = input.status;
			patch.completedAt = input.status === "completed" ? new Date() : null;
		}
		if (input.dueDate !== undefined) {
			patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
		}
		if (input.ownerEmployeeId !== undefined) {
			patch.ownerEmployeeId = input.ownerEmployeeId;
		}
		if (input.displayOrder !== undefined) {
			patch.displayOrder = input.displayOrder;
		}
		await db
			.update(projectMilestone)
			.set(patch)
			.where(
				and(
					eq(projectMilestone.id, ms.id),
					eq(projectMilestone.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_milestone",
			entityId: ms.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: ms.id };
	});

const milestonesComplete = authorizedProcedure("project", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const ms = await verifyMilestone(oid, input.id);
		const p = await verifyProject(oid, ms.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		await db
			.update(projectMilestone)
			.set({
				status: "completed",
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(projectMilestone.id, ms.id),
					eq(projectMilestone.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_milestone",
			entityId: ms.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "complete" },
		});
		return { id: ms.id };
	});

// ════════════════════════════════════════════════════════════════════
// TASKS
// ════════════════════════════════════════════════════════════════════

const tasksList = authorizedProcedure("task", "read")
	.input(
		z
			.object({
				projectId: z.string().optional(),
				milestoneId: z.string().optional(),
				status: TASK_STATUS.optional(),
				priority: PRIORITY.optional(),
				assigneeEmployeeId: z.string().optional(),
				mine: z.boolean().optional(),
				search: z.string().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const opts = input ?? {};
		const filters = [
			eq(projectTask.organizationId, oid),
			isNull(projectTask.deletedAt),
		];

		// `mine` forces self-scope to the caller's own assigned tasks (any role).
		if (opts.mine) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return [];
			}
			filters.push(eq(projectTask.assigneeEmployeeId, me.id));
		} else if (opts.projectId) {
			const p = await verifyProject(oid, opts.projectId);
			await assertProjectVisible(oid, actorId(context), callerRole, p);
			filters.push(eq(projectTask.projectId, opts.projectId));
		} else if (!seesAllProjects(callerRole)) {
			// No project scope + not see-all → restrict to visible projects.
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			const ids = covered ? await visibleProjectIds(oid, covered) : [];
			if (ids.length === 0) {
				return [];
			}
			filters.push(inArray(projectTask.projectId, ids));
		}

		if (opts.milestoneId) {
			filters.push(eq(projectTask.milestoneId, opts.milestoneId));
		}
		if (opts.status) {
			filters.push(eq(projectTask.status, opts.status));
		}
		if (opts.priority) {
			filters.push(eq(projectTask.priority, opts.priority));
		}
		if (opts.assigneeEmployeeId && !opts.mine) {
			filters.push(eq(projectTask.assigneeEmployeeId, opts.assigneeEmployeeId));
		}
		if (opts.search) {
			filters.push(
				or(
					sql`${projectTask.title} ilike ${`%${opts.search}%`}`,
					sql`${projectTask.reference} ilike ${`%${opts.search}%`}`
				)!
			);
		}

		const rows = await db
			.select({
				...getTableColumns(projectTask),
				assigneeFirst: employeeProfile.firstName,
				assigneeLast: employeeProfile.lastName,
				projectName: project.name,
				projectReference: project.reference,
			})
			.from(projectTask)
			.leftJoin(
				employeeProfile,
				eq(projectTask.assigneeEmployeeId, employeeProfile.id)
			)
			.innerJoin(project, eq(projectTask.projectId, project.id))
			.where(and(...filters))
			.orderBy(asc(projectTask.displayOrder), desc(projectTask.createdAt))
			.limit(opts.limit ?? LIST_LIMIT);
		return rows.map((r) => ({
			...r,
			assigneeName: formatName(r.assigneeFirst, r.assigneeLast),
			hasCrossModuleLinks: Boolean(
				r.linkedAssetId || r.linkedHelpdeskRequestId || r.linkedEntityId
			),
		}));
	});

const tasksGetById = authorizedProcedure("task", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		const names = await employeeNameMap([task.assigneeEmployeeId]);
		// Read-only cross-module context refs (the guardrail). Only the asset NAME
		// is resolved (a column the asset module owns, read-only); the helpdesk ref
		// is a typed deep-link the UI resolves in its own panel.
		const linked: { kind: string; id: string; label: string | null }[] = [];
		if (task.linkedAssetId) {
			const [a] = await db
				.select({ name: asset.name })
				.from(asset)
				.where(
					and(eq(asset.id, task.linkedAssetId), eq(asset.organizationId, oid))
				)
				.limit(1);
			linked.push({
				kind: "asset",
				id: task.linkedAssetId,
				label: a?.name ?? null,
			});
		}
		if (task.linkedHelpdeskRequestId) {
			const [h] = await db
				.select({ reference: helpdeskRequest.reference })
				.from(helpdeskRequest)
				.where(
					and(
						eq(helpdeskRequest.id, task.linkedHelpdeskRequestId),
						eq(helpdeskRequest.organizationId, oid)
					)
				)
				.limit(1);
			linked.push({
				kind: "helpdesk_request",
				id: task.linkedHelpdeskRequestId,
				label: h?.reference ?? null,
			});
		}
		if (task.linkedEntityType && task.linkedEntityId) {
			linked.push({
				kind: task.linkedEntityType,
				id: task.linkedEntityId,
				label: null,
			});
		}
		return {
			...task,
			assigneeName: task.assigneeEmployeeId
				? (names.get(task.assigneeEmployeeId) ?? null)
				: null,
			linked,
		};
	});

const tasksCreate = authorizedProcedure("task", "create")
	.input(
		z.object({
			projectId: z.string(),
			title: z.string().min(1),
			description: z.string().optional(),
			status: TASK_STATUS.optional(),
			priority: PRIORITY.optional(),
			assigneeEmployeeId: z.string().optional(),
			milestoneId: z.string().optional(),
			startDate: z.string().optional(),
			dueDate: z.string().optional(),
			estimateMinutes: z.number().int().min(0).optional(),
			linkedAssetId: z.string().optional(),
			linkedHelpdeskRequestId: z.string().optional(),
			linkedEntityType: LINKED_ENTITY_TYPE.optional(),
			linkedEntityId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const p = await verifyProject(oid, input.projectId);
		await assertProjectVisible(oid, actorId(context), callerRole, p);
		if (input.assigneeEmployeeId) {
			await verifyEmployeeInOrg(oid, input.assigneeEmployeeId);
		}
		if (input.milestoneId) {
			await verifyMilestone(oid, input.milestoneId);
		}
		// Tenant-verify cross-module links (SELECT-only; never mutated).
		await verifyTaskLinks(oid, input);

		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const reference = await nextReference(oid, "TSK");
			const id = createId();
			try {
				await db.insert(projectTask).values({
					id,
					organizationId: oid,
					projectId: p.id,
					reference,
					title: input.title,
					description: input.description ?? null,
					status: input.status ?? "todo",
					priority: input.priority ?? "normal",
					assigneeEmployeeId: input.assigneeEmployeeId ?? null,
					milestoneId: input.milestoneId ?? null,
					createdByUserId: actorId(context),
					startDate: input.startDate ? new Date(input.startDate) : null,
					dueDate: input.dueDate ? new Date(input.dueDate) : null,
					estimateMinutes: input.estimateMinutes ?? null,
					linkedAssetId: input.linkedAssetId ?? null,
					linkedHelpdeskRequestId: input.linkedHelpdeskRequestId ?? null,
					linkedEntityType: input.linkedEntityType ?? null,
					linkedEntityId: input.linkedEntityId ?? null,
				});
				await createAuditEvent(db as never, {
					organizationId: oid,
					entityType: "project_task",
					entityId: id,
					action: "create",
					actorId: actorId(context),
					metadata: { projectId: p.id, reference, title: input.title },
				});
				return { id, reference };
			} catch (err: unknown) {
				if (isUniqueViolation(err) && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
					continue;
				}
				throw err;
			}
		}
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Could not allocate a task reference. Please retry.",
		});
	});

/**
 * Whether the caller may edit a task's structure / status. Managing roles and
 * managers (assign-capable) edit any task in a visible project; an employee may
 * only act on a task ASSIGNED to them. Returns false → caller is an employee who
 * is not the assignee (the IDOR boundary for self-service edits).
 */
async function canActOnTask(
	oid: string,
	userId: string,
	callerRole: string,
	task: TaskRow
): Promise<boolean> {
	if (canAssignProjectTasks(callerRole) || seesAllProjects(callerRole)) {
		return true;
	}
	const me = await resolveCurrentEmployee(oid, userId);
	return Boolean(me && task.assigneeEmployeeId === me.id);
}

const tasksUpdate = authorizedProcedure("task", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			priority: PRIORITY.optional(),
			milestoneId: z.string().nullable().optional(),
			startDate: z.string().nullable().optional(),
			dueDate: z.string().nullable().optional(),
			estimateMinutes: z.number().int().min(0).nullable().optional(),
			linkedAssetId: z.string().nullable().optional(),
			linkedHelpdeskRequestId: z.string().nullable().optional(),
			linkedEntityType: LINKED_ENTITY_TYPE.nullable().optional(),
			linkedEntityId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		if (!(await canActOnTask(oid, actorId(context), callerRole, task))) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only edit a task assigned to you.",
			});
		}
		if (TASK_TERMINAL.has(task.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This task is closed. Reopen it before editing.",
			});
		}
		const managing = canAssignProjectTasks(callerRole);
		// Structural changes (milestone reassign, cross-module links) are managing-
		// roles only; an assignee-employee may edit the basic fields of their task.
		if (
			!managing &&
			(input.milestoneId !== undefined ||
				input.linkedAssetId !== undefined ||
				input.linkedHelpdeskRequestId !== undefined ||
				input.linkedEntityType !== undefined ||
				input.linkedEntityId !== undefined)
		) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only a project manager can change a task's milestone or cross-module links.",
			});
		}
		if (managing && input.milestoneId) {
			await verifyMilestone(oid, input.milestoneId);
		}
		if (managing) {
			await verifyTaskLinks(oid, input);
		}

		const patch: Partial<typeof projectTask.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.title !== undefined) {
			patch.title = input.title;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.priority !== undefined) {
			patch.priority = input.priority;
		}
		if (input.startDate !== undefined) {
			patch.startDate = input.startDate ? new Date(input.startDate) : null;
		}
		if (input.dueDate !== undefined) {
			patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
		}
		if (input.estimateMinutes !== undefined) {
			patch.estimateMinutes = input.estimateMinutes;
		}
		if (managing) {
			if (input.milestoneId !== undefined) {
				patch.milestoneId = input.milestoneId;
			}
			if (input.linkedAssetId !== undefined) {
				patch.linkedAssetId = input.linkedAssetId;
			}
			if (input.linkedHelpdeskRequestId !== undefined) {
				patch.linkedHelpdeskRequestId = input.linkedHelpdeskRequestId;
			}
			if (input.linkedEntityType !== undefined) {
				patch.linkedEntityType = input.linkedEntityType;
			}
			if (input.linkedEntityId !== undefined) {
				patch.linkedEntityId = input.linkedEntityId;
			}
		}
		await db
			.update(projectTask)
			.set(patch)
			.where(
				and(eq(projectTask.id, task.id), eq(projectTask.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task",
			entityId: task.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: task.id };
	});

const tasksChangeStatus = authorizedProcedure("task", "change_status")
	.input(z.object({ id: z.string(), status: TASK_STATUS }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		if (!(await canActOnTask(oid, actorId(context), callerRole, task))) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only update the status of a task assigned to you.",
			});
		}
		const completing = input.status === "done";
		await db
			.update(projectTask)
			.set({
				status: input.status,
				completedAt: completing ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(
				and(eq(projectTask.id, task.id), eq(projectTask.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task",
			entityId: task.id,
			action: "update",
			actorId: actorId(context),
			metadata: { status: input.status },
		});
		return { id: task.id };
	});

const tasksComplete = authorizedProcedure("task", "change_status")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		if (!(await canActOnTask(oid, actorId(context), callerRole, task))) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only complete a task assigned to you.",
			});
		}
		await db
			.update(projectTask)
			.set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
			.where(
				and(eq(projectTask.id, task.id), eq(projectTask.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task",
			entityId: task.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "complete" },
		});
		return { id: task.id };
	});

const tasksAssign = authorizedProcedure("task", "assign")
	.input(z.object({ id: z.string(), assigneeEmployeeId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		await verifyEmployeeInOrg(oid, input.assigneeEmployeeId);
		await db
			.update(projectTask)
			.set({
				assigneeEmployeeId: input.assigneeEmployeeId,
				updatedAt: new Date(),
			})
			.where(
				and(eq(projectTask.id, task.id), eq(projectTask.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task",
			entityId: task.id,
			action: "update",
			actorId: actorId(context),
			metadata: {
				transition: "assign",
				assigneeEmployeeId: input.assigneeEmployeeId,
			},
		});
		return { id: task.id };
	});

const tasksUnassign = authorizedProcedure("task", "assign")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.id);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		await db
			.update(projectTask)
			.set({ assigneeEmployeeId: null, updatedAt: new Date() })
			.where(
				and(eq(projectTask.id, task.id), eq(projectTask.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task",
			entityId: task.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "unassign" },
		});
		return { id: task.id };
	});

// ── Task comments (public + internal, with server-side redaction) ─────────────

const commentsList = authorizedProcedure("task", "read")
	.input(z.object({ taskId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.taskId);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		const rows = await db
			.select({
				...getTableColumns(projectTaskComment),
				authorName: user.name,
			})
			.from(projectTaskComment)
			.leftJoin(user, eq(projectTaskComment.authorUserId, user.id))
			.where(eq(projectTaskComment.taskId, task.id))
			.orderBy(asc(projectTaskComment.createdAt));
		// SERVER-SIDE internal-note redaction.
		const canSeeInternal = canViewProjectInternalNotes(callerRole);
		return rows.filter((c) => canSeeInternal || !c.isInternal);
	});

const commentsCreate = authorizedProcedure("task", "comment")
	.input(z.object({ taskId: z.string(), body: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const task = await verifyTask(oid, input.taskId);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		if (TASK_TERMINAL.has(task.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You cannot comment on a closed task.",
			});
		}
		const id = createId();
		await db.insert(projectTaskComment).values({
			id,
			organizationId: oid,
			taskId: task.id,
			authorUserId: actorId(context),
			body: input.body,
			isInternal: false,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task_comment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { taskId: task.id, internal: false },
		});
		return { id };
	});

/**
 * Add an INTERNAL note. Gated by task:update AND canViewProjectInternalNotes
 * (managing roles + auditor). Redacted from everyone else in every read.
 */
const commentsCreateInternal = authorizedProcedure("task", "update")
	.input(z.object({ taskId: z.string(), body: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewProjectInternalNotes(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const task = await verifyTask(oid, input.taskId);
		await assertTaskVisible(oid, actorId(context), callerRole, task);
		const id = createId();
		await db.insert(projectTaskComment).values({
			id,
			organizationId: oid,
			taskId: task.id,
			authorUserId: actorId(context),
			body: input.body,
			isInternal: true,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_task_comment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { taskId: task.id, internal: true },
		});
		return { id };
	});

// ════════════════════════════════════════════════════════════════════
// TIME ENTRIES (reporting-only — never touches Attendance or Payroll)
// ════════════════════════════════════════════════════════════════════

const timeEntriesList = authorizedProcedure("time_entry", "read")
	.input(
		z
			.object({
				projectId: z.string().optional(),
				taskId: z.string().optional(),
				employeeId: z.string().optional(),
				status: z
					.enum(["draft", "submitted", "approved", "rejected"])
					.optional(),
				mine: z.boolean().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const opts = input ?? {};
		const filters = [
			eq(projectTimeEntry.organizationId, oid),
			isNull(projectTimeEntry.deletedAt),
		];

		if (opts.mine) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return [];
			}
			filters.push(eq(projectTimeEntry.employeeId, me.id));
		} else if (opts.projectId) {
			const p = await verifyProject(oid, opts.projectId);
			await assertProjectVisible(oid, actorId(context), callerRole, p);
			filters.push(eq(projectTimeEntry.projectId, opts.projectId));
		} else if (!seesAllProjects(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered) {
				return [];
			}
			// Own time + (manager) reports' time, scoped server-side.
			filters.push(inArray(projectTimeEntry.employeeId, covered));
		}

		if (opts.taskId) {
			filters.push(eq(projectTimeEntry.taskId, opts.taskId));
		}
		if (opts.employeeId && !opts.mine) {
			filters.push(eq(projectTimeEntry.employeeId, opts.employeeId));
		}
		if (opts.status) {
			filters.push(eq(projectTimeEntry.status, opts.status));
		}

		const rows = await db
			.select({
				...getTableColumns(projectTimeEntry),
				employeeFirst: employeeProfile.firstName,
				employeeLast: employeeProfile.lastName,
				projectName: project.name,
				taskTitle: projectTask.title,
			})
			.from(projectTimeEntry)
			.innerJoin(
				employeeProfile,
				eq(projectTimeEntry.employeeId, employeeProfile.id)
			)
			.innerJoin(project, eq(projectTimeEntry.projectId, project.id))
			.leftJoin(projectTask, eq(projectTimeEntry.taskId, projectTask.id))
			.where(and(...filters))
			.orderBy(desc(projectTimeEntry.entryDate))
			.limit(opts.limit ?? LIST_LIMIT);
		return rows.map((r) => ({
			...r,
			employeeName: formatName(r.employeeFirst, r.employeeLast),
		}));
	});

const timeEntriesCreate = authorizedProcedure("time_entry", "create")
	.input(
		z.object({
			projectId: z.string(),
			taskId: z.string().optional(),
			entryDate: z.string(),
			minutes: z
				.number()
				.int()
				.min(1)
				.max(24 * 60),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		// Self-scope: a time entry is always the caller's own (helpdesk createSelf
		// precedent). A user with no employee profile cannot log project time.
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only employees can log project time.",
			});
		}
		const p = await verifyProject(oid, input.projectId);
		if (input.taskId) {
			const task = await verifyTask(oid, input.taskId);
			if (task.projectId !== p.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That task does not belong to the given project.",
				});
			}
		}
		const id = createId();
		await db.insert(projectTimeEntry).values({
			id,
			organizationId: oid,
			projectId: p.id,
			taskId: input.taskId ?? null,
			employeeId: me.id,
			entryDate: new Date(input.entryDate),
			minutes: input.minutes,
			description: input.description ?? null,
			status: "draft",
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_time_entry",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { projectId: p.id, minutes: input.minutes },
		});
		return { id };
	});

const timeEntriesUpdate = authorizedProcedure("time_entry", "update")
	.input(
		z.object({
			id: z.string(),
			taskId: z.string().nullable().optional(),
			entryDate: z.string().optional(),
			minutes: z
				.number()
				.int()
				.min(1)
				.max(24 * 60)
				.optional(),
			description: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const entry = await verifyTimeEntry(oid, input.id);
		// Only the owner may edit, and only while it is still a draft.
		if (!me || entry.employeeId !== me.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only edit your own time entries.",
			});
		}
		if (entry.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only draft time entries can be edited.",
			});
		}
		const patch: Partial<typeof projectTimeEntry.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.taskId !== undefined) {
			if (input.taskId) {
				const task = await verifyTask(oid, input.taskId);
				if (task.projectId !== entry.projectId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "That task does not belong to this entry's project.",
					});
				}
			}
			patch.taskId = input.taskId;
		}
		if (input.entryDate !== undefined) {
			patch.entryDate = new Date(input.entryDate);
		}
		if (input.minutes !== undefined) {
			patch.minutes = input.minutes;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		await db
			.update(projectTimeEntry)
			.set(patch)
			.where(
				and(
					eq(projectTimeEntry.id, entry.id),
					eq(projectTimeEntry.organizationId, oid)
				)
			);
		return { id: entry.id };
	});

const timeEntriesSubmit = authorizedProcedure("time_entry", "submit")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const entry = await verifyTimeEntry(oid, input.id);
		if (!me || entry.employeeId !== me.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only submit your own time entries.",
			});
		}
		if (entry.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only draft time entries can be submitted.",
			});
		}
		await db
			.update(projectTimeEntry)
			.set({
				status: "submitted",
				submittedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(projectTimeEntry.id, entry.id),
					eq(projectTimeEntry.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_time_entry",
			entityId: entry.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "submit" },
		});
		return { id: entry.id };
	});

/**
 * Approve scope: an approver must be able to see the entry's project (managing
 * roles / payroll / auditor see all; a manager sees their reports' / own
 * projects). The AC gate already requires time_entry:approve.
 */
async function assertCanDecideTime(
	oid: string,
	userId: string,
	callerRole: string,
	projectId: string,
	employeeId: string
): Promise<void> {
	// Managing roles / payroll / auditor approve any project's time. (The AC gate
	// already required time_entry:approve; this is the lateral-scope re-check.)
	if (seesAllProjects(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (covered?.includes(employeeId)) {
		return;
	}
	const ids = covered ? await visibleProjectIds(oid, covered) : [];
	if (ids.includes(projectId)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You cannot approve time for this project.",
	});
}

const timeEntriesApprove = authorizedProcedure("time_entry", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const entry = await verifyTimeEntry(oid, input.id);
		if (entry.status !== "submitted") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only submitted time entries can be approved.",
			});
		}
		await assertCanDecideTime(
			oid,
			actorId(context),
			callerRole,
			entry.projectId,
			entry.employeeId
		);
		await db
			.update(projectTimeEntry)
			.set({
				status: "approved",
				approvedAt: new Date(),
				approvedByUserId: actorId(context),
				rejectedAt: null,
				rejectionReason: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(projectTimeEntry.id, entry.id),
					eq(projectTimeEntry.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_time_entry",
			entityId: entry.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "approve" },
		});
		return { id: entry.id };
	});

const timeEntriesReject = authorizedProcedure("time_entry", "approve")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const entry = await verifyTimeEntry(oid, input.id);
		if (entry.status !== "submitted") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only submitted time entries can be rejected.",
			});
		}
		await assertCanDecideTime(
			oid,
			actorId(context),
			callerRole,
			entry.projectId,
			entry.employeeId
		);
		await db
			.update(projectTimeEntry)
			.set({
				status: "rejected",
				rejectedAt: new Date(),
				rejectionReason: input.reason,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(projectTimeEntry.id, entry.id),
					eq(projectTimeEntry.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "project_time_entry",
			entityId: entry.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reject", reason: input.reason },
		});
		return { id: entry.id };
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const projectsRouter = {
	list: projectsList,
	getById: projectsGetById,
	create: projectsCreate,
	update: projectsUpdate,
	archive: projectsArchive,
	unarchive: projectsUnarchive,
	members: {
		list: membersList,
		add: membersAdd,
		remove: membersRemove,
	},
	milestones: {
		list: milestonesList,
		create: milestonesCreate,
		update: milestonesUpdate,
		complete: milestonesComplete,
	},
	tasks: {
		list: tasksList,
		getById: tasksGetById,
		create: tasksCreate,
		update: tasksUpdate,
		changeStatus: tasksChangeStatus,
		complete: tasksComplete,
		assign: tasksAssign,
		unassign: tasksUnassign,
		comments: {
			list: commentsList,
			create: commentsCreate,
			createInternal: commentsCreateInternal,
		},
	},
	timeEntries: {
		list: timeEntriesList,
		create: timeEntriesCreate,
		update: timeEntriesUpdate,
		submit: timeEntriesSubmit,
		approve: timeEntriesApprove,
		reject: timeEntriesReject,
	},
};
