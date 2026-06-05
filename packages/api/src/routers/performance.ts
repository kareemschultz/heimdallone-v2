// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Performance / PMS oRPC router — Phase 15C.
 *
 * Scope (per docs/architecture/performance-pms-implementation-plan.md §7):
 *   objectives    list / getById / create / update / changeStatus / complete /
 *                 archive / mine  (+ keyResults add / update / updateProgress / remove)
 *   reviewCycles  list / getById / create / update / activate / close
 *                 (+ templates list / create / addQuestion; requests generate /
 *                  assignedToMe / decline; responses save / submit / results)
 *   oneOnOnes     list / getById / create / update / complete / cancel
 *   recognition   list / award / mine
 *   activity      list  (reads the shared audit_event — NO performance_activity table)
 *
 * CENTRAL GUARDRAIL (mirrors Projects/Helpdesk): Performance OWNS its data but
 * LINKS read-only and NEVER mutates neighbours.
 *   - key_result.linkedProjectTaskId is tenant-VERIFIED on write (SELECT-only) and
 *     resolved READ-ONLY on read (only the task title/status/completedAt). There
 *     is NO write to project_task anywhere in this file.
 *   - recognition_point is a NON-MONETARY ledger — no payroll write, no pay field.
 *
 * TWO HIGHEST-RISK redactions are enforced SERVER-SIDE here:
 *   - one_on_one.privateManagerNotes is stripped from every caller who is not HR
 *     or the OWNING manager (never the employee, never auditor).
 *   - peer review responses are anonymised for the subject/manager (only HR sees
 *     raw reviewer identity) and hidden below review_cycle.anonymityThreshold.
 */

import { db } from "@Heimdallone/db";
import { user } from "@Heimdallone/db/schema/auth";
import { auditEvent, employeeProfile } from "@Heimdallone/db/schema/hr-core";
import {
	oneOnOne,
	performanceKeyResult,
	performanceObjective,
	questionTemplate,
	recognitionPoint,
	reviewCycle,
	reviewQuestion,
	reviewRequest,
	reviewResponse,
} from "@Heimdallone/db/schema/performance";
import { projectTask } from "@Heimdallone/db/schema/projects";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
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
	canManageHR,
	canManagePerformance,
	isOwnerOrAdmin,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MAX_REFERENCE_ATTEMPTS = 6;
const LIST_LIMIT = 200;
// 15H: points auto-awarded (non-monetary) when a goal is completed on time.
const AUTO_AWARD_OBJECTIVE_POINTS = 10;

// ─── Zod enums matching schema ───────────────────────────────────────────────

const OBJECTIVE_STATUS = z.enum([
	"draft",
	"active",
	"on_track",
	"at_risk",
	"behind",
	"completed",
	"cancelled",
]);
const KR_TYPE = z.enum(["percentage", "number", "currency", "boolean"]);
const KR_STATUS = z.enum(["not_started", "on_track", "at_risk", "done"]);
const CYCLE_TYPE = z.enum(["self", "manager", "three_sixty", "upward"]);
const QUESTION_TYPE = z.enum([
	"text",
	"rating",
	"boolean",
	"multi_choice",
	"likert",
]);
const RELATIONSHIP = z.enum(["self", "manager", "peer", "report"]);
const RECOGNITION_SOURCE = z.enum(["manual", "objective_completed"]);

// ────────────────────────────────────────────────────────────────────
// Display helpers
// ────────────────────────────────────────────────────────────────────

function formatName(first: string | null, last: string | null): string | null {
	const parts = [first, last].filter((p): p is string => Boolean(p));
	return parts.length > 0 ? parts.join(" ") : null;
}

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

// ────────────────────────────────────────────────────────────────────
// Scope — the IDOR layer
// ────────────────────────────────────────────────────────────────────

/** Roles that see every employee's performance data (no lateral scoping). */
function seesAllPerformance(callerRole: string): boolean {
	return (
		canManagePerformance(callerRole) ||
		callerRole === "auditor" ||
		callerRole === "payroll_admin"
	);
}

/**
 * Employee ids a non-seesAll caller covers: themselves + (manager) direct reports.
 * Null if the caller has no employee profile.
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

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every id input is checked here
// ────────────────────────────────────────────────────────────────────

type ObjectiveRow = typeof performanceObjective.$inferSelect;
type OneOnOneRow = typeof oneOnOne.$inferSelect;

async function verifyObjective(oid: string, id: string): Promise<ObjectiveRow> {
	const [row] = await db
		.select()
		.from(performanceObjective)
		.where(
			and(
				eq(performanceObjective.id, id),
				eq(performanceObjective.organizationId, oid),
				isNull(performanceObjective.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Goal not found." });
	}
	return row;
}

async function verifyKeyResult(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(performanceKeyResult)
		.where(
			and(
				eq(performanceKeyResult.id, id),
				eq(performanceKeyResult.organizationId, oid)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Key result not found." });
	}
	return row;
}

async function verifyCycle(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(reviewCycle)
		.where(
			and(
				eq(reviewCycle.id, id),
				eq(reviewCycle.organizationId, oid),
				isNull(reviewCycle.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Review cycle not found." });
	}
	return row;
}

async function verifyTemplate(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(questionTemplate)
		.where(
			and(
				eq(questionTemplate.id, id),
				eq(questionTemplate.organizationId, oid),
				isNull(questionTemplate.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Template not found." });
	}
	return row;
}

async function verifyRequest(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(reviewRequest)
		.where(and(eq(reviewRequest.id, id), eq(reviewRequest.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Review request not found." });
	}
	return row;
}

async function verifyOneOnOne(oid: string, id: string): Promise<OneOnOneRow> {
	const [row] = await db
		.select()
		.from(oneOnOne)
		.where(
			and(
				eq(oneOnOne.id, id),
				eq(oneOnOne.organizationId, oid),
				isNull(oneOnOne.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Meeting not found." });
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

// ── Cross-module link verification (the guardrail). SELECT-only — proves the
//    linked task belongs to the org; nothing here ever WRITES project_task. ──────
async function verifyLinkedTask(oid: string, id: string) {
	const [row] = await db
		.select({ id: projectTask.id })
		.from(projectTask)
		.where(and(eq(projectTask.id, id), eq(projectTask.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked project task is not in this organization.",
		});
	}
}

/** Read-only context for a linked project task (title/status/completedAt only). */
async function resolveLinkedTask(
	oid: string,
	id: string | null
): Promise<{
	id: string;
	title: string;
	status: string;
	completedAt: Date | null;
} | null> {
	if (!id) {
		return null;
	}
	const [t] = await db
		.select({
			id: projectTask.id,
			title: projectTask.title,
			status: projectTask.status,
			completedAt: projectTask.completedAt,
		})
		.from(projectTask)
		.where(and(eq(projectTask.id, id), eq(projectTask.organizationId, oid)))
		.limit(1);
	return t ?? null;
}

// ── Reference allocation (MAX+1 per org with a retry loop) ────────────────────

async function nextReference(
	oid: string,
	prefix: "GOAL" | "REV"
): Promise<string> {
	const table = prefix === "GOAL" ? performanceObjective : reviewCycle;
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

// ── Redaction (HIGHEST RISK) ──────────────────────────────────────────────────

/**
 * Strip one_on_one.privateManagerNotes unless the caller is HR or the OWNING
 * manager of this meeting. The employee participant and the auditor NEVER receive
 * it. UI hiding is not sufficient — this runs before the row leaves the server.
 */
function redactOneOnOne(
	row: OneOnOneRow,
	callerRole: string,
	callerEmployeeId: string | null
): OneOnOneRow {
	const isOwningManager =
		callerRole === "manager" &&
		callerEmployeeId !== null &&
		row.managerEmployeeId === callerEmployeeId;
	if (canManageHR(callerRole) || isOwningManager) {
		return row;
	}
	return { ...row, privateManagerNotes: null };
}

// ── Objective progress recompute (derived from key results) ───────────────────

async function recomputeObjectiveProgress(
	objectiveId: string
): Promise<number> {
	const krs = await db
		.select({
			start: performanceKeyResult.startValue,
			current: performanceKeyResult.currentValue,
			target: performanceKeyResult.targetValue,
		})
		.from(performanceKeyResult)
		.where(eq(performanceKeyResult.objectiveId, objectiveId));
	if (krs.length === 0) {
		return 0;
	}
	let sum = 0;
	for (const kr of krs) {
		const start = Number(kr.start);
		const current = Number(kr.current);
		const target = Number(kr.target);
		const span = target - start;
		const pct = span === 0 ? 0 : ((current - start) / span) * 100;
		sum += Math.max(0, Math.min(100, pct));
	}
	return Math.round(sum / krs.length);
}

// ════════════════════════════════════════════════════════════════════
// OBJECTIVES (goals / OKRs)
// ════════════════════════════════════════════════════════════════════

const objectivesList = authorizedProcedure("goal", "read")
	.input(
		z
			.object({
				status: OBJECTIVE_STATUS.optional(),
				employeeId: z.string().optional(),
				cycleId: z.string().optional(),
				mine: z.boolean().optional(),
				includeArchived: z.boolean().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const opts = input ?? {};
		const filters = [
			eq(performanceObjective.organizationId, oid),
			isNull(performanceObjective.deletedAt),
		];

		if (opts.mine) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return [];
			}
			filters.push(eq(performanceObjective.employeeId, me.id));
		} else if (!seesAllPerformance(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered) {
				return [];
			}
			filters.push(inArray(performanceObjective.employeeId, covered));
		} else if (opts.employeeId) {
			filters.push(eq(performanceObjective.employeeId, opts.employeeId));
		}

		if (opts.status) {
			filters.push(eq(performanceObjective.status, opts.status));
		}
		if (opts.cycleId) {
			filters.push(eq(performanceObjective.cycleId, opts.cycleId));
		}
		if (!opts.includeArchived) {
			filters.push(eq(performanceObjective.isArchived, false));
		}

		const rows = await db
			.select({
				...getTableColumns(performanceObjective),
				employeeFirst: employeeProfile.firstName,
				employeeLast: employeeProfile.lastName,
			})
			.from(performanceObjective)
			.innerJoin(
				employeeProfile,
				eq(performanceObjective.employeeId, employeeProfile.id)
			)
			.where(and(...filters))
			.orderBy(desc(performanceObjective.createdAt))
			.limit(opts.limit ?? LIST_LIMIT);
		return rows.map((r) => ({
			...r,
			employeeName: formatName(r.employeeFirst, r.employeeLast),
		}));
	});

/** Throw FORBIDDEN unless the caller may see this objective. */
async function assertObjectiveVisible(
	oid: string,
	userId: string,
	callerRole: string,
	obj: ObjectiveRow
): Promise<void> {
	if (seesAllPerformance(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (covered?.includes(obj.employeeId)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You do not have access to this goal.",
	});
}

const objectivesGetById = authorizedProcedure("goal", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const obj = await verifyObjective(oid, input.id);
		await assertObjectiveVisible(oid, actorId(context), callerRole, obj);

		const krs = await db
			.select()
			.from(performanceKeyResult)
			.where(eq(performanceKeyResult.objectiveId, obj.id))
			.orderBy(asc(performanceKeyResult.displayOrder));
		// Read-only linked-task context per KR (the guardrail).
		const krOut = await Promise.all(
			krs.map(async (kr) => ({
				...kr,
				linkedTask: await resolveLinkedTask(oid, kr.linkedProjectTaskId),
			}))
		);
		const names = await employeeNameMap([obj.employeeId]);
		return {
			...obj,
			employeeName: obj.employeeId ? (names.get(obj.employeeId) ?? null) : null,
			keyResults: krOut,
		};
	});

/** Whether a non-managing caller may create/edit a goal for `employeeId`. */
async function assertCanActOnEmployeeGoal(
	oid: string,
	userId: string,
	callerRole: string,
	employeeId: string
): Promise<void> {
	if (seesAllPerformance(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (covered?.includes(employeeId)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You can only manage goals for yourself or your direct reports.",
	});
}

const objectivesCreate = authorizedProcedure("goal", "create")
	.input(
		z.object({
			employeeId: z.string().optional(),
			title: z.string().min(1),
			description: z.string().optional(),
			cycleId: z.string().optional(),
			status: OBJECTIVE_STATUS.optional(),
			weight: z.number().int().min(0).max(100).optional(),
			startDate: z.string().optional(),
			dueDate: z.string().optional(),
			internalNote: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		// Default to the caller's own employee when none is given (self goal).
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const employeeId = input.employeeId ?? me?.id;
		if (!employeeId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A target employee is required.",
			});
		}
		await verifyEmployeeInOrg(oid, employeeId);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			employeeId
		);
		if (input.cycleId) {
			await verifyCycle(oid, input.cycleId);
		}

		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const reference = await nextReference(oid, "GOAL");
			const id = createId();
			try {
				await db.insert(performanceObjective).values({
					id,
					organizationId: oid,
					reference,
					employeeId,
					ownerUserId: actorId(context),
					title: input.title,
					description: input.description ?? null,
					cycleId: input.cycleId ?? null,
					status: input.status ?? "draft",
					weight: input.weight ?? 0,
					startDate: input.startDate ? new Date(input.startDate) : null,
					dueDate: input.dueDate ? new Date(input.dueDate) : null,
					internalNote: input.internalNote ?? null,
				});
				await createAuditEvent(db as never, {
					organizationId: oid,
					entityType: "performance_objective",
					entityId: id,
					action: "create",
					actorId: actorId(context),
					metadata: { reference, employeeId },
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
			message: "Could not allocate a goal reference. Please retry.",
		});
	});

const objectivesUpdate = authorizedProcedure("goal", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			status: OBJECTIVE_STATUS.optional(),
			weight: z.number().int().min(0).max(100).optional(),
			startDate: z.string().nullable().optional(),
			dueDate: z.string().nullable().optional(),
			internalNote: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const obj = await verifyObjective(oid, input.id);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			obj.employeeId
		);

		const patch: Partial<typeof performanceObjective.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.title !== undefined) {
			patch.title = input.title;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.weight !== undefined) {
			patch.weight = input.weight;
		}
		if (input.startDate !== undefined) {
			patch.startDate = input.startDate ? new Date(input.startDate) : null;
		}
		if (input.dueDate !== undefined) {
			patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
		}
		if (input.internalNote !== undefined) {
			patch.internalNote = input.internalNote;
		}
		if (input.status !== undefined) {
			patch.status = input.status;
			patch.completedAt = input.status === "completed" ? new Date() : null;
		}
		await db
			.update(performanceObjective)
			.set(patch)
			.where(
				and(
					eq(performanceObjective.id, obj.id),
					eq(performanceObjective.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "performance_objective",
			entityId: obj.id,
			action: "update",
			actorId: actorId(context),
			metadata: input.status ? { status: input.status } : {},
		});
		return { id: obj.id };
	});

// goal:complete — owner/admin (any) + employee (own only). Managers/HR complete a
// report's goal via objectives.update(status="completed").
const objectivesComplete = authorizedProcedure("goal", "complete")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const obj = await verifyObjective(oid, input.id);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		// goal:complete is held only by owner/admin + employee; owner/admin complete
		// any goal, an employee only their own.
		if (!(isOwnerOrAdmin(callerRole) || (me && obj.employeeId === me.id))) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only complete your own goal.",
			});
		}
		await db
			.update(performanceObjective)
			.set({
				status: "completed",
				completedAt: new Date(),
				progressPercent: 100,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(performanceObjective.id, obj.id),
					eq(performanceObjective.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "performance_objective",
			entityId: obj.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "complete" },
		});
		// 15H: auto-award NON-MONETARY recognition for an on-time completion. This
		// writes ONLY a recognition_point (a points ledger — never payroll). It
		// fires once: only on the transition INTO completed (skips a re-complete)
		// and only when there was no due date or the goal finished on/before it.
		const wasAlreadyComplete = obj.status === "completed";
		const onTime = !obj.dueDate || new Date() <= new Date(obj.dueDate);
		if (!wasAlreadyComplete && onTime) {
			const recognitionId = createId();
			await db.insert(recognitionPoint).values({
				id: recognitionId,
				organizationId: oid,
				employeeId: obj.employeeId,
				points: AUTO_AWARD_OBJECTIVE_POINTS,
				reason: `Completed goal "${obj.title}" on time.`,
				source: "objective_completed",
				awardedByUserId: actorId(context),
				objectiveId: obj.id,
			});
			await createAuditEvent(db as never, {
				organizationId: oid,
				entityType: "recognition_point",
				entityId: recognitionId,
				action: "create",
				actorId: actorId(context),
				metadata: { source: "objective_completed", objectiveId: obj.id },
			});
		}
		return { id: obj.id };
	});

const objectivesArchive = authorizedProcedure("goal", "update")
	.input(z.object({ id: z.string(), archived: z.boolean().optional() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const obj = await verifyObjective(oid, input.id);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			obj.employeeId
		);
		await db
			.update(performanceObjective)
			.set({ isArchived: input.archived ?? true, updatedAt: new Date() })
			.where(
				and(
					eq(performanceObjective.id, obj.id),
					eq(performanceObjective.organizationId, oid)
				)
			);
		return { id: obj.id };
	});

// ── Key results ───────────────────────────────────────────────────────────────

const keyResultsAdd = authorizedProcedure("goal", "update")
	.input(
		z.object({
			objectiveId: z.string(),
			title: z.string().min(1),
			progressType: KR_TYPE.optional(),
			startValue: z.number().optional(),
			currentValue: z.number().optional(),
			targetValue: z.number().optional(),
			linkedProjectTaskId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const obj = await verifyObjective(oid, input.objectiveId);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			obj.employeeId
		);
		if (input.linkedProjectTaskId) {
			await verifyLinkedTask(oid, input.linkedProjectTaskId);
		}
		const id = createId();
		await db.insert(performanceKeyResult).values({
			id,
			organizationId: oid,
			objectiveId: obj.id,
			title: input.title,
			progressType: input.progressType ?? "percentage",
			startValue: String(input.startValue ?? 0),
			currentValue: String(input.currentValue ?? 0),
			targetValue: String(input.targetValue ?? 100),
			linkedProjectTaskId: input.linkedProjectTaskId ?? null,
		});
		const pct = await recomputeObjectiveProgress(obj.id);
		await db
			.update(performanceObjective)
			.set({ progressPercent: pct, updatedAt: new Date() })
			.where(eq(performanceObjective.id, obj.id));
		return { id };
	});

const keyResultsUpdateProgress = authorizedProcedure("goal", "update")
	.input(
		z.object({
			id: z.string(),
			currentValue: z.number(),
			status: KR_STATUS.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const kr = await verifyKeyResult(oid, input.id);
		const obj = await verifyObjective(oid, kr.objectiveId);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			obj.employeeId
		);
		await db
			.update(performanceKeyResult)
			.set({
				currentValue: String(input.currentValue),
				status: input.status ?? kr.status,
				updatedAt: new Date(),
			})
			.where(eq(performanceKeyResult.id, kr.id));
		const pct = await recomputeObjectiveProgress(obj.id);
		await db
			.update(performanceObjective)
			.set({ progressPercent: pct, updatedAt: new Date() })
			.where(eq(performanceObjective.id, obj.id));
		return { id: kr.id, objectiveProgress: pct };
	});

const keyResultsRemove = authorizedProcedure("goal", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const kr = await verifyKeyResult(oid, input.id);
		const obj = await verifyObjective(oid, kr.objectiveId);
		await assertCanActOnEmployeeGoal(
			oid,
			actorId(context),
			callerRole,
			obj.employeeId
		);
		await db
			.delete(performanceKeyResult)
			.where(eq(performanceKeyResult.id, kr.id));
		const pct = await recomputeObjectiveProgress(obj.id);
		await db
			.update(performanceObjective)
			.set({ progressPercent: pct, updatedAt: new Date() })
			.where(eq(performanceObjective.id, obj.id));
		return { id: kr.id };
	});

// ════════════════════════════════════════════════════════════════════
// REVIEW CYCLES / TEMPLATES / REQUESTS / RESPONSES
// ════════════════════════════════════════════════════════════════════

const cyclesList = authorizedProcedure("appraisal", "read")
	.input(z.object({ status: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		// HR/auditor/payroll see all cycles; others see cycles where they have a
		// request (subject or reviewer).
		if (seesAllPerformance(callerRole)) {
			const filters = [
				eq(reviewCycle.organizationId, oid),
				isNull(reviewCycle.deletedAt),
			];
			if (input?.status) {
				filters.push(eq(reviewCycle.status, input.status as never));
			}
			return await db
				.select()
				.from(reviewCycle)
				.where(and(...filters))
				.orderBy(desc(reviewCycle.createdAt));
		}
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return [];
		}
		const myCycleIds = await db
			.selectDistinct({ id: reviewRequest.cycleId })
			.from(reviewRequest)
			.where(
				and(
					eq(reviewRequest.organizationId, oid),
					or(
						eq(reviewRequest.subjectEmployeeId, me.id),
						eq(reviewRequest.reviewerEmployeeId, me.id)
					)
				)
			);
		const ids = myCycleIds.map((c) => c.id);
		if (ids.length === 0) {
			return [];
		}
		return await db
			.select()
			.from(reviewCycle)
			.where(
				and(
					eq(reviewCycle.organizationId, oid),
					isNull(reviewCycle.deletedAt),
					inArray(reviewCycle.id, ids)
				)
			)
			.orderBy(desc(reviewCycle.createdAt));
	});

const cyclesCreate = authorizedProcedure("appraisal", "create")
	.input(
		z.object({
			name: z.string().min(1),
			description: z.string().optional(),
			type: CYCLE_TYPE.optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			anonymityThreshold: z.number().int().min(1).max(20).optional(),
			isAnonymousPeers: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const reference = await nextReference(oid, "REV");
			const id = createId();
			try {
				await db.insert(reviewCycle).values({
					id,
					organizationId: oid,
					reference,
					name: input.name,
					description: input.description ?? null,
					type: input.type ?? "manager",
					status: "draft",
					startDate: input.startDate ? new Date(input.startDate) : null,
					endDate: input.endDate ? new Date(input.endDate) : null,
					anonymityThreshold: input.anonymityThreshold ?? 3,
					isAnonymousPeers: input.isAnonymousPeers ?? true,
				});
				await createAuditEvent(db as never, {
					organizationId: oid,
					entityType: "review_cycle",
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
			message: "Could not allocate a cycle reference. Please retry.",
		});
	});

const cyclesActivate = authorizedProcedure("appraisal", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const c = await verifyCycle(oid, input.id);
		await db
			.update(reviewCycle)
			.set({ status: "active", updatedAt: new Date() })
			.where(eq(reviewCycle.id, c.id));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "review_cycle",
			entityId: c.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "activate" },
		});
		return { id: c.id };
	});

const cyclesClose = authorizedProcedure("appraisal", "finalize")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const c = await verifyCycle(oid, input.id);
		await db
			.update(reviewCycle)
			.set({ status: "closed", updatedAt: new Date() })
			.where(eq(reviewCycle.id, c.id));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "review_cycle",
			entityId: c.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "close" },
		});
		return { id: c.id };
	});

// ── Templates + questions ─────────────────────────────────────────────────────

const templatesList = authorizedProcedure("appraisal", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const oid = orgId(context);
		return await db
			.select()
			.from(questionTemplate)
			.where(
				and(
					eq(questionTemplate.organizationId, oid),
					isNull(questionTemplate.deletedAt)
				)
			)
			.orderBy(desc(questionTemplate.createdAt));
	});

const templatesCreate = authorizedProcedure("appraisal", "manage")
	.input(
		z.object({ name: z.string().min(1), description: z.string().optional() })
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const id = createId();
		await db.insert(questionTemplate).values({
			id,
			organizationId: oid,
			name: input.name,
			description: input.description ?? null,
		});
		return { id };
	});

const templatesAddQuestion = authorizedProcedure("appraisal", "manage")
	.input(
		z.object({
			templateId: z.string(),
			text: z.string().min(1),
			type: QUESTION_TYPE.optional(),
			options: z.array(z.string()).optional(),
			displayOrder: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyTemplate(oid, input.templateId);
		const id = createId();
		await db.insert(reviewQuestion).values({
			id,
			organizationId: oid,
			templateId: input.templateId,
			text: input.text,
			type: input.type ?? "text",
			options: input.options ?? null,
			displayOrder: input.displayOrder ?? 0,
		});
		return { id };
	});

// ── Review requests (the 360 fan-out) ─────────────────────────────────────────

const requestsGenerate = authorizedProcedure("appraisal", "manage")
	.input(
		z.object({
			cycleId: z.string(),
			subjectEmployeeId: z.string(),
			reviewers: z.array(
				z.object({ employeeId: z.string(), relationship: RELATIONSHIP })
			),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyCycle(oid, input.cycleId);
		await verifyEmployeeInOrg(oid, input.subjectEmployeeId);
		const created: string[] = [];
		for (const r of input.reviewers) {
			await verifyEmployeeInOrg(oid, r.employeeId);
			const id = createId();
			try {
				await db.insert(reviewRequest).values({
					id,
					organizationId: oid,
					cycleId: input.cycleId,
					subjectEmployeeId: input.subjectEmployeeId,
					reviewerEmployeeId: r.employeeId,
					relationship: r.relationship,
					status: "pending",
				});
				created.push(id);
			} catch (err: unknown) {
				// Duplicate (cycle, subject, reviewer) — skip, idempotent fan-out.
				if (!isUniqueViolation(err)) {
					throw err;
				}
			}
		}
		return { created: created.length };
	});

const requestsAssignedToMe = authorizedProcedure("appraisal", "read")
	.input(z.object({ cycleId: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return [];
		}
		const filters = [
			eq(reviewRequest.organizationId, oid),
			eq(reviewRequest.reviewerEmployeeId, me.id),
		];
		if (input?.cycleId) {
			filters.push(eq(reviewRequest.cycleId, input.cycleId));
		}
		const rows = await db
			.select({
				...getTableColumns(reviewRequest),
				subjectFirst: employeeProfile.firstName,
				subjectLast: employeeProfile.lastName,
			})
			.from(reviewRequest)
			.innerJoin(
				employeeProfile,
				eq(reviewRequest.subjectEmployeeId, employeeProfile.id)
			)
			.where(and(...filters))
			.orderBy(desc(reviewRequest.createdAt));
		return rows.map((r) => ({
			...r,
			subjectName: formatName(r.subjectFirst, r.subjectLast),
		}));
	});

const requestsDecline = authorizedProcedure("appraisal", "review")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!(me && req.reviewerEmployeeId === me.id)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only decline a review request assigned to you.",
			});
		}
		await db
			.update(reviewRequest)
			.set({ status: "declined", updatedAt: new Date() })
			.where(eq(reviewRequest.id, req.id));
		return { id: req.id };
	});

// ── Review responses (reviewer-own) ───────────────────────────────────────────

async function assertOwnRequest(
	oid: string,
	userId: string,
	req: typeof reviewRequest.$inferSelect
): Promise<void> {
	const me = await resolveCurrentEmployee(oid, userId);
	if (!(me && req.reviewerEmployeeId === me.id)) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only answer a review request assigned to you.",
		});
	}
}

const responsesSave = authorizedProcedure("appraisal", "submit")
	.input(
		z.object({
			requestId: z.string(),
			// Optional: a per-question answer references a real review_question; an
			// overall free-text answer may omit it (questionId is a nullable FK).
			questionId: z.string().optional(),
			answerText: z.string().optional(),
			answerRating: z.number().int().optional(),
			answerJson: z.unknown().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.requestId);
		await assertOwnRequest(oid, actorId(context), req);
		if (req.status === "submitted" || req.status === "declined") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This review has already been submitted.",
			});
		}
		// Tenant-verify a provided question id (avoids a raw FK 500 on a bad id).
		if (input.questionId) {
			const [q] = await db
				.select({ id: reviewQuestion.id })
				.from(reviewQuestion)
				.where(
					and(
						eq(reviewQuestion.id, input.questionId),
						eq(reviewQuestion.organizationId, oid)
					)
				)
				.limit(1);
			if (!q) {
				throw new ORPCError("BAD_REQUEST", { message: "Unknown question." });
			}
		}
		const id = createId();
		await db.insert(reviewResponse).values({
			id,
			organizationId: oid,
			requestId: req.id,
			questionId: input.questionId ?? null,
			answerText: input.answerText ?? null,
			answerRating: input.answerRating ?? null,
			answerJson: (input.answerJson as never) ?? null,
		});
		if (req.status === "pending") {
			await db
				.update(reviewRequest)
				.set({ status: "in_progress", updatedAt: new Date() })
				.where(eq(reviewRequest.id, req.id));
		}
		return { id };
	});

const responsesSubmit = authorizedProcedure("appraisal", "submit")
	.input(z.object({ requestId: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.requestId);
		await assertOwnRequest(oid, actorId(context), req);
		await db
			.update(reviewRequest)
			.set({
				status: "submitted",
				submittedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(reviewRequest.id, req.id));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "review_request",
			entityId: req.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "submit" },
		});
		return { id: req.id };
	});

/**
 * Aggregated 360 results for a subject — the ANONYMITY-CRITICAL read.
 *
 * Authz: the subject sees their own; HR sees all; a manager sees a direct
 * report's. Peer responses are anonymised for everyone except HR (raw view) and
 * are HIDDEN below the cycle's anonymityThreshold. self / manager / report
 * responses are NOT anonymised (only peers are).
 */
const responsesResults = authorizedProcedure("appraisal", "read")
	.input(
		z.object({ cycleId: z.string(), subjectEmployeeId: z.string().optional() })
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const cycle = await verifyCycle(oid, input.cycleId);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const subjectId = input.subjectEmployeeId ?? me?.id;
		if (!subjectId) {
			throw new ORPCError("BAD_REQUEST", { message: "Subject is required." });
		}
		// Visibility: HR all; subject self; manager of the subject.
		const rawPeerView = canManageHR(callerRole);
		if (!rawPeerView) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered?.includes(subjectId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have access to these review results.",
				});
			}
		}

		const reqs = await db
			.select({
				...getTableColumns(reviewRequest),
				reviewerFirst: employeeProfile.firstName,
				reviewerLast: employeeProfile.lastName,
			})
			.from(reviewRequest)
			.innerJoin(
				employeeProfile,
				eq(reviewRequest.reviewerEmployeeId, employeeProfile.id)
			)
			.where(
				and(
					eq(reviewRequest.organizationId, oid),
					eq(reviewRequest.cycleId, cycle.id),
					eq(reviewRequest.subjectEmployeeId, subjectId)
				)
			);
		const reqIds = reqs.map((r) => r.id);
		const responses =
			reqIds.length > 0
				? await db
						.select()
						.from(reviewResponse)
						.where(inArray(reviewResponse.requestId, reqIds))
				: [];
		const byRequest = new Map<string, typeof responses>();
		for (const resp of responses) {
			const list = byRequest.get(resp.requestId) ?? [];
			list.push(resp);
			byRequest.set(resp.requestId, list);
		}

		// Non-peer relationships: identity shown.
		const named = reqs
			.filter((r) => r.relationship !== "peer")
			.map((r) => ({
				relationship: r.relationship,
				reviewerName: formatName(r.reviewerFirst, r.reviewerLast),
				status: r.status,
				responses: byRequest.get(r.id) ?? [],
			}));

		// Peers: anonymised + threshold-gated (unless HR raw view).
		const peerReqs = reqs.filter((r) => r.relationship === "peer");
		const submittedPeers = peerReqs.filter((r) => r.status === "submitted");
		let peers: Record<string, unknown>;
		if (rawPeerView) {
			peers = {
				mode: "raw",
				count: peerReqs.length,
				submitted: submittedPeers.length,
				items: peerReqs.map((r) => ({
					reviewerName: formatName(r.reviewerFirst, r.reviewerLast),
					status: r.status,
					responses: byRequest.get(r.id) ?? [],
				})),
			};
		} else if (
			cycle.isAnonymousPeers &&
			submittedPeers.length < cycle.anonymityThreshold
		) {
			peers = {
				mode: "hidden",
				submitted: submittedPeers.length,
				threshold: cycle.anonymityThreshold,
				message: "Not enough peer responses yet to show feedback anonymously.",
			};
		} else {
			// Aggregated — NO reviewer identity (anonymised), responses only.
			peers = {
				mode: "aggregated",
				submitted: submittedPeers.length,
				threshold: cycle.anonymityThreshold,
				items: submittedPeers.map((r) => ({
					responses: byRequest.get(r.id) ?? [],
				})),
			};
		}

		return { cycle, subjectId, named, peers };
	});

// ════════════════════════════════════════════════════════════════════
// ONE-ON-ONES (private-note redaction)
// ════════════════════════════════════════════════════════════════════

// HR + auditor read every 1-on-1 (auditor read-only, with the private note still
// stripped by redactOneOnOne); the manager + employee participants read their own.
function seesAllOneOnOnes(callerRole: string): boolean {
	return canManageHR(callerRole) || callerRole === "auditor";
}

async function assertOneOnOneVisible(
	oid: string,
	userId: string,
	callerRole: string,
	row: OneOnOneRow
): Promise<void> {
	if (seesAllOneOnOnes(callerRole)) {
		return;
	}
	const me = await resolveCurrentEmployee(oid, userId);
	if (me && (me.id === row.managerEmployeeId || me.id === row.employeeId)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You do not have access to this meeting.",
	});
}

const oneOnOnesList = authorizedProcedure("appraisal", "read")
	.input(z.object({ employeeId: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const filters = [
			eq(oneOnOne.organizationId, oid),
			isNull(oneOnOne.deletedAt),
		];
		if (seesAllOneOnOnes(callerRole)) {
			if (input?.employeeId) {
				filters.push(eq(oneOnOne.employeeId, input.employeeId));
			}
		} else {
			if (!me) {
				return [];
			}
			filters.push(
				or(
					eq(oneOnOne.managerEmployeeId, me.id),
					eq(oneOnOne.employeeId, me.id)
				)!
			);
		}
		const rows = await db
			.select()
			.from(oneOnOne)
			.where(and(...filters))
			.orderBy(desc(oneOnOne.scheduledAt));
		// Resolve participant names for the list display (no AC change — the
		// appraisal:read gate already applies).
		const ids = rows.flatMap((r) => [r.managerEmployeeId, r.employeeId]);
		const names = await employeeNameMap(ids);
		// SERVER-SIDE private-note redaction on every row.
		return rows.map((r) => ({
			...redactOneOnOne(r, callerRole, me?.id ?? null),
			managerName: names.get(r.managerEmployeeId) ?? null,
			employeeName: names.get(r.employeeId) ?? null,
		}));
	});

const oneOnOnesGetById = authorizedProcedure("appraisal", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const row = await verifyOneOnOne(oid, input.id);
		await assertOneOnOneVisible(oid, actorId(context), callerRole, row);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const names = await employeeNameMap([
			row.managerEmployeeId,
			row.employeeId,
		]);
		const redacted = redactOneOnOne(row, callerRole, me?.id ?? null);
		return {
			...redacted,
			managerName: names.get(row.managerEmployeeId) ?? null,
			employeeName: names.get(row.employeeId) ?? null,
			canViewPrivateNotes: redacted.privateManagerNotes !== null,
		};
	});

const oneOnOnesCreate = authorizedProcedure("appraisal", "review")
	.input(
		z.object({
			employeeId: z.string(),
			scheduledAt: z.string().optional(),
			sharedNotes: z.string().optional(),
			privateManagerNotes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a manager with an employee profile can record a 1-on-1.",
			});
		}
		await verifyEmployeeInOrg(oid, input.employeeId);
		// A manager may only record a 1-on-1 for a direct report (HR may for anyone).
		if (!canManageHR(callerRole)) {
			const reports = await getDirectReportIds(me.id, oid);
			if (!reports.includes(input.employeeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only record a 1-on-1 with a direct report.",
				});
			}
		}
		const id = createId();
		await db.insert(oneOnOne).values({
			id,
			organizationId: oid,
			managerEmployeeId: me.id,
			employeeId: input.employeeId,
			scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
			status: "scheduled",
			sharedNotes: input.sharedNotes ?? null,
			privateManagerNotes: input.privateManagerNotes ?? null,
		});
		return { id };
	});

const oneOnOnesUpdate = authorizedProcedure("appraisal", "review")
	.input(
		z.object({
			id: z.string(),
			status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
			sharedNotes: z.string().nullable().optional(),
			privateManagerNotes: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const row = await verifyOneOnOne(oid, input.id);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		// Only the owning manager or HR may edit (incl. the private note).
		const isOwningManager = me && row.managerEmployeeId === me.id;
		if (!(canManageHR(callerRole) || isOwningManager)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only the meeting's manager or HR can edit it.",
			});
		}
		const patch: Partial<typeof oneOnOne.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (input.status !== undefined) {
			patch.status = input.status;
		}
		if (input.sharedNotes !== undefined) {
			patch.sharedNotes = input.sharedNotes;
		}
		if (input.privateManagerNotes !== undefined) {
			patch.privateManagerNotes = input.privateManagerNotes;
		}
		await db
			.update(oneOnOne)
			.set(patch)
			.where(and(eq(oneOnOne.id, row.id), eq(oneOnOne.organizationId, oid)));
		return { id: row.id };
	});

// ════════════════════════════════════════════════════════════════════
// RECOGNITION (PMS-owned ledger — non-monetary, never pay)
// ════════════════════════════════════════════════════════════════════

const recognitionList = authorizedProcedure("recognition", "read")
	.input(
		z
			.object({
				employeeId: z.string().optional(),
				mine: z.boolean().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const opts = input ?? {};
		const filters = [eq(recognitionPoint.organizationId, oid)];

		if (opts.mine) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return [];
			}
			filters.push(eq(recognitionPoint.employeeId, me.id));
		} else if (!seesAllPerformance(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered) {
				return [];
			}
			filters.push(inArray(recognitionPoint.employeeId, covered));
		} else if (opts.employeeId) {
			filters.push(eq(recognitionPoint.employeeId, opts.employeeId));
		}

		const rows = await db
			.select({
				...getTableColumns(recognitionPoint),
				employeeFirst: employeeProfile.firstName,
				employeeLast: employeeProfile.lastName,
				awardedByName: user.name,
			})
			.from(recognitionPoint)
			.innerJoin(
				employeeProfile,
				eq(recognitionPoint.employeeId, employeeProfile.id)
			)
			.leftJoin(user, eq(recognitionPoint.awardedByUserId, user.id))
			.where(and(...filters))
			.orderBy(desc(recognitionPoint.createdAt))
			.limit(LIST_LIMIT);
		// Recognition points are NON-MONETARY — there is no pay/amount field to
		// redact; the row carries `points` (a count), `reason`, `source` only.
		return rows.map((r) => ({
			...r,
			employeeName: formatName(r.employeeFirst, r.employeeLast),
			isPay: false,
		}));
	});

const recognitionAward = authorizedProcedure("recognition", "award")
	.input(
		z.object({
			employeeId: z.string(),
			points: z.number().int().min(1).max(1000),
			reason: z.string().min(1),
			source: RECOGNITION_SOURCE.optional(),
			objectiveId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		await verifyEmployeeInOrg(oid, input.employeeId);
		// A manager may only award to a direct report; HR may award to anyone.
		if (!canManageHR(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			const reports = me ? await getDirectReportIds(me.id, oid) : [];
			if (!reports.includes(input.employeeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only recognise your direct reports.",
				});
			}
		}
		if (input.objectiveId) {
			await verifyObjective(oid, input.objectiveId);
		}
		const id = createId();
		// PMS-owned write ONLY. No payroll write, no pay amount — `points` is a
		// non-monetary recognition count.
		await db.insert(recognitionPoint).values({
			id,
			organizationId: oid,
			employeeId: input.employeeId,
			points: input.points,
			reason: input.reason,
			source: input.source ?? "manual",
			awardedByUserId: actorId(context),
			objectiveId: input.objectiveId ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "recognition_point",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { employeeId: input.employeeId, points: input.points },
		});
		return { id };
	});

// ════════════════════════════════════════════════════════════════════
// ACTIVITY (reads the shared audit_event log — NO performance_activity table)
// ════════════════════════════════════════════════════════════════════

const PERFORMANCE_AUDIT_TYPES = [
	"performance_objective",
	"review_cycle",
	"review_request",
	"recognition_point",
] as const;

const activityList = authorizedProcedure("goal", "read")
	.input(
		z.object({ limit: z.number().int().min(1).max(200).optional() }).optional()
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		// Activity is a management read — HR/auditor/payroll/manager only.
		if (!(seesAllPerformance(callerRole) || callerRole === "manager")) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const rows = await db
			.select({ ...getTableColumns(auditEvent), actorName: user.name })
			.from(auditEvent)
			.leftJoin(user, eq(auditEvent.actorId, user.id))
			.where(
				and(
					eq(auditEvent.organizationId, oid),
					inArray(auditEvent.entityType, [...PERFORMANCE_AUDIT_TYPES])
				)
			)
			.orderBy(desc(auditEvent.createdAt))
			.limit(input?.limit ?? 50);
		return rows;
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const performanceRouter = {
	objectives: {
		list: objectivesList,
		getById: objectivesGetById,
		create: objectivesCreate,
		update: objectivesUpdate,
		complete: objectivesComplete,
		archive: objectivesArchive,
		keyResults: {
			add: keyResultsAdd,
			updateProgress: keyResultsUpdateProgress,
			remove: keyResultsRemove,
		},
	},
	reviewCycles: {
		list: cyclesList,
		create: cyclesCreate,
		activate: cyclesActivate,
		close: cyclesClose,
		templates: {
			list: templatesList,
			create: templatesCreate,
			addQuestion: templatesAddQuestion,
		},
		requests: {
			generate: requestsGenerate,
			assignedToMe: requestsAssignedToMe,
			decline: requestsDecline,
		},
		responses: {
			save: responsesSave,
			submit: responsesSubmit,
			results: responsesResults,
		},
	},
	oneOnOnes: {
		list: oneOnOnesList,
		getById: oneOnOnesGetById,
		create: oneOnOnesCreate,
		update: oneOnOnesUpdate,
	},
	recognition: {
		list: recognitionList,
		award: recognitionAward,
	},
	activity: {
		list: activityList,
	},
};
