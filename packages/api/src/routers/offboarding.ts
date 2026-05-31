// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Offboarding oRPC router — Phase 10C.
 *
 * Scope (per docs/architecture/offboarding-implementation-plan.md):
 *
 *   templates           create / update / archive reusable clearance checklists
 *   templateTasks       CRUD + reorder within a template
 *   cases               full lifecycle: submit/create → approve → active →
 *                       in_clearance → pending_settlement → close
 *   tasks               complete / skip / block / reassign snapshotted tasks
 *   assets              mark returned / waive free-text asset records
 *   access              mark revoked / waive system-access records
 *   documents           upload / approve / waive clearance document requests
 *   interviews          upsert exit interview (HR-only; private by default)
 *   activity            read-only timeline per case
 *   settlement          readiness indicators (no settlement calculation)
 *
 * Hard guardrails enforced in this file:
 *   - cases.close is the ONLY procedure that sets employeeProfile.isActive=false
 *   - cases.create and cases.submitResignation are transactional (no half-created cases)
 *   - internalNote is NEVER returned when the caller is an employee
 *   - Private exit interview content is NEVER returned to non-HR callers
 *   - involuntary exitReason is NEVER returned to the employee themselves
 *   - Every FK input is tenant-verified before use
 *   - Manager scope: managers see only their direct reports' cases
 */

import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	offboardingAccessRevocation,
	offboardingActivity,
	offboardingAssetReturn,
	offboardingCase,
	offboardingDocumentRequest,
	offboardingExitInterview,
	offboardingTask,
	offboardingTemplate,
	offboardingTemplateTask,
} from "@Heimdallone/db/schema/offboarding";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
import {
	canManageOffboarding,
	canReadOffboardingSettlement,
	canViewOffboarding,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (base: Date, days: number) =>
	new Date(base.getTime() + days * DAY_MS);

// Terminal case statuses — no transitions out
const TERMINAL_CASE_STATUSES = new Set([
	"closed",
	"cancelled",
	"rejected",
	"withdrawn",
]);

// ─── Zod enums matching schema ───────────────────────────────────────────────

const EXIT_TYPE = z.enum([
	"resignation",
	"termination",
	"retirement",
	"contract_end",
	"involuntary",
]);

const CATEGORY = z.enum([
	"clearance",
	"asset_return",
	"access_revocation",
	"document",
	"handoff",
	"exit_interview",
	"other",
]);

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every FK input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyOBTemplate(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingTemplate)
		.where(
			and(
				eq(offboardingTemplate.id, id),
				eq(offboardingTemplate.organizationId, orgIdValue),
				isNull(offboardingTemplate.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Offboarding template not found.",
		});
	}
	return row;
}

async function verifyOBTemplateTask(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingTemplateTask)
		.where(
			and(
				eq(offboardingTemplateTask.id, id),
				eq(offboardingTemplateTask.organizationId, orgIdValue),
				isNull(offboardingTemplateTask.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Template task not found.",
		});
	}
	return row;
}

async function verifyOBCase(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingCase)
		.where(
			and(
				eq(offboardingCase.id, id),
				eq(offboardingCase.organizationId, orgIdValue),
				isNull(offboardingCase.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Offboarding case not found.",
		});
	}
	return row;
}

async function verifyOBTask(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingTask)
		.where(
			and(
				eq(offboardingTask.id, id),
				eq(offboardingTask.organizationId, orgIdValue),
				isNull(offboardingTask.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Task not found." });
	}
	return row;
}

async function verifyAssetReturn(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingAssetReturn)
		.where(
			and(
				eq(offboardingAssetReturn.id, id),
				eq(offboardingAssetReturn.organizationId, orgIdValue),
				isNull(offboardingAssetReturn.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Asset return record not found.",
		});
	}
	return row;
}

async function verifyAccessRevocation(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingAccessRevocation)
		.where(
			and(
				eq(offboardingAccessRevocation.id, id),
				eq(offboardingAccessRevocation.organizationId, orgIdValue),
				isNull(offboardingAccessRevocation.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Access revocation record not found.",
		});
	}
	return row;
}

async function verifyDocumentRequest(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(offboardingDocumentRequest)
		.where(
			and(
				eq(offboardingDocumentRequest.id, id),
				eq(offboardingDocumentRequest.organizationId, orgIdValue),
				isNull(offboardingDocumentRequest.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Document request not found.",
		});
	}
	return row;
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
			message: "Employee not found in this organization.",
		});
	}
}

/** Returns the employee IDs that report to the current user's employee record. */
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

/**
 * Strip fields the caller is not allowed to see.
 * - internalNote: HR/auditor only
 * - exitReason for involuntary exits: hidden from the employee themselves
 */
function redactCase<T extends Record<string, unknown>>(
	c: T,
	callerRole: string,
	callerEmployeeId: string | null
): T {
	const isHrOrAuditor =
		canManageOffboarding(callerRole) || callerRole === "auditor";
	const result = { ...c };
	if (!isHrOrAuditor) {
		(result as Record<string, unknown>).internalNote = null;
	}
	// Hide involuntary exit reason from the employee whose case it is
	if (
		!isHrOrAuditor &&
		(result as Record<string, unknown>).exitType === "involuntary" &&
		callerEmployeeId !== null &&
		(result as Record<string, unknown>).employeeId === callerEmployeeId
	) {
		(result as Record<string, unknown>).exitReason = null;
	}
	return result;
}

// ════════════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════════════

const templatesList = authorizedProcedure("offboarding", "read")
	.input(
		z.object({
			includeInactive: z.boolean().default(false),
			exitType: EXIT_TYPE.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(offboardingTemplate.organizationId, orgId(context)),
			isNull(offboardingTemplate.deletedAt),
		];
		if (!input.includeInactive) {
			filters.push(eq(offboardingTemplate.isActive, true));
		}
		if (input.exitType) {
			filters.push(eq(offboardingTemplate.exitType, input.exitType));
		}
		return await db
			.select()
			.from(offboardingTemplate)
			.where(and(...filters))
			.orderBy(asc(offboardingTemplate.name));
	});

const templatesGetById = authorizedProcedure("offboarding", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		return await verifyOBTemplate(orgId(context), input.id);
	});

const templatesCreate = authorizedProcedure("offboarding", "create")
	.input(
		z.object({
			name: z.string().min(1).max(120),
			description: z.string().optional(),
			exitType: EXIT_TYPE.nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const id = createId();
		try {
			await db.insert(offboardingTemplate).values({
				id,
				organizationId: orgId(context),
				name: input.name,
				description: input.description ?? null,
				exitType: input.exitType ?? null,
				isActive: true,
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: `A template named "${input.name}" already exists.`,
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const templatesUpdate = authorizedProcedure("offboarding", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(120).optional(),
			description: z.string().nullable().optional(),
			exitType: EXIT_TYPE.nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBTemplate(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.exitType !== undefined) {
			patch.exitType = input.exitType;
		}
		try {
			await db
				.update(offboardingTemplate)
				.set(patch)
				.where(
					and(
						eq(offboardingTemplate.id, input.id),
						eq(offboardingTemplate.organizationId, orgId(context))
					)
				);
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "A template with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const templatesArchive = authorizedProcedure("offboarding", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBTemplate(orgId(context), input.id);
		await db
			.update(offboardingTemplate)
			.set({ isActive: false, updatedAt: new Date() })
			.where(
				and(
					eq(offboardingTemplate.id, input.id),
					eq(offboardingTemplate.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// TEMPLATE TASKS
// ════════════════════════════════════════════════════════════════════

const templateTasksListByTemplate = authorizedProcedure("offboarding", "read")
	.input(z.object({ templateId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBTemplate(orgId(context), input.templateId);
		return await db
			.select()
			.from(offboardingTemplateTask)
			.where(
				and(
					eq(offboardingTemplateTask.templateId, input.templateId),
					eq(offboardingTemplateTask.organizationId, orgId(context)),
					isNull(offboardingTemplateTask.deletedAt)
				)
			)
			.orderBy(asc(offboardingTemplateTask.sortOrder));
	});

const templateTasksCreate = authorizedProcedure("offboarding", "create")
	.input(
		z.object({
			templateId: z.string(),
			title: z.string().min(1).max(200),
			description: z.string().optional(),
			category: CATEGORY,
			defaultAssigneeRole: z.string().optional(),
			dueOffsetDays: z.number().int().default(0),
			isRequired: z.boolean().default(false),
			sortOrder: z.number().int().default(0),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBTemplate(orgId(context), input.templateId);
		const id = createId();
		await db.insert(offboardingTemplateTask).values({
			id,
			organizationId: orgId(context),
			templateId: input.templateId,
			title: input.title,
			description: input.description ?? null,
			category: input.category,
			defaultAssigneeRole: input.defaultAssigneeRole ?? null,
			dueOffsetDays: input.dueOffsetDays,
			isRequired: input.isRequired,
			sortOrder: input.sortOrder,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: input.templateId,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "add_task", taskId: id },
		});
		return { id };
	});

const templateTasksUpdate = authorizedProcedure("offboarding", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).max(200).optional(),
			description: z.string().nullable().optional(),
			category: CATEGORY.optional(),
			defaultAssigneeRole: z.string().nullable().optional(),
			dueOffsetDays: z.number().int().optional(),
			isRequired: z.boolean().optional(),
			sortOrder: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const task = await verifyOBTemplateTask(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		for (const k of [
			"title",
			"description",
			"category",
			"defaultAssigneeRole",
			"dueOffsetDays",
			"isRequired",
			"sortOrder",
		] as const) {
			if (input[k] !== undefined) {
				patch[k] = input[k];
			}
		}
		await db
			.update(offboardingTemplateTask)
			.set(patch)
			.where(
				and(
					eq(offboardingTemplateTask.id, input.id),
					eq(offboardingTemplateTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: task.templateId,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "update_task", taskId: input.id },
		});
		return { id: input.id };
	});

const templateTasksDelete = authorizedProcedure("offboarding", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const task = await verifyOBTemplateTask(orgId(context), input.id);
		// Soft-delete. Already-snapshotted case tasks are unaffected (nullable FK).
		await db
			.update(offboardingTemplateTask)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(offboardingTemplateTask.id, input.id),
					eq(offboardingTemplateTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: task.templateId,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "delete_task", taskId: input.id },
		});
		return { id: input.id };
	});

const templateTasksReorder = authorizedProcedure("offboarding", "update")
	.input(z.object({ templateId: z.string(), orderedIds: z.array(z.string()) }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBTemplate(orgId(context), input.templateId);
		await db.transaction(async (tx) => {
			for (let i = 0; i < input.orderedIds.length; i++) {
				await tx
					.update(offboardingTemplateTask)
					.set({ sortOrder: i, updatedAt: new Date() })
					.where(
						and(
							eq(offboardingTemplateTask.id, input.orderedIds[i] as string),
							eq(offboardingTemplateTask.templateId, input.templateId),
							eq(offboardingTemplateTask.organizationId, orgId(context))
						)
					);
			}
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_template",
			entityId: input.templateId,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "reorder_tasks" },
		});
		return { id: input.templateId };
	});

// ════════════════════════════════════════════════════════════════════
// CASES
// ════════════════════════════════════════════════════════════════════

/** Snapshot template tasks into offboarding_task rows. Call inside a transaction. */
async function snapshotTemplateTasks(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	orgIdValue: string,
	caseId: string,
	templateId: string,
	lastWorkingDay: Date | null
): Promise<number> {
	const tasks = await db
		.select()
		.from(offboardingTemplateTask)
		.where(
			and(
				eq(offboardingTemplateTask.templateId, templateId),
				eq(offboardingTemplateTask.organizationId, orgIdValue),
				isNull(offboardingTemplateTask.deletedAt)
			)
		)
		.orderBy(asc(offboardingTemplateTask.sortOrder));
	for (const tt of tasks) {
		const dueAt =
			lastWorkingDay === null
				? null
				: addDays(lastWorkingDay, tt.dueOffsetDays);
		await tx.insert(offboardingTask).values({
			id: createId(),
			organizationId: orgIdValue,
			caseId,
			templateTaskId: tt.id,
			titleSnapshot: tt.title,
			descriptionSnapshot: tt.description,
			category: tt.category,
			dueAt: dueAt ? dueAt : null,
			status: "todo",
		});
	}
	return tasks.length;
}

const casesList = authorizedProcedure("offboarding", "read")
	.input(
		z.object({
			status: z
				.enum([
					"pending_approval",
					"approved",
					"active",
					"in_clearance",
					"pending_settlement",
					"closed",
					"rejected",
					"withdrawn",
					"cancelled",
				])
				.optional(),
			exitType: EXIT_TYPE.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewOffboarding(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}

		const filters = [
			eq(offboardingCase.organizationId, orgId(context)),
			isNull(offboardingCase.deletedAt),
		];
		if (input.status) {
			filters.push(eq(offboardingCase.status, input.status));
		}
		if (input.exitType) {
			filters.push(eq(offboardingCase.exitType, input.exitType));
		}

		// Manager scope: only see direct reports
		if (callerRole === "manager") {
			const reportIds = await getManagerDirectReportIds(
				orgId(context),
				actorId(context)
			);
			if (reportIds.length === 0) {
				return { data: [], total: 0, page: input.page };
			}
			filters.push(inArray(offboardingCase.employeeId, reportIds));
		}

		const offset = (input.page - 1) * input.pageSize;
		const [data, totalRows] = await Promise.all([
			db
				.select()
				.from(offboardingCase)
				.where(and(...filters))
				.orderBy(desc(offboardingCase.createdAt))
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ value: count() })
				.from(offboardingCase)
				.where(and(...filters)),
		]);

		const me = await resolveCurrentEmployee(orgId(context), actorId(context));
		return {
			data: data.map((c) =>
				redactCase(c as Record<string, unknown>, callerRole, me?.id ?? null)
			),
			total: Number(totalRows[0]?.value ?? 0),
			page: input.page,
		};
	});

const casesGetById = authorizedProcedure("offboarding", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewOffboarding(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);

		// Manager scope check
		if (callerRole === "manager") {
			const reportIds = await getManagerDirectReportIds(
				orgId(context),
				actorId(context)
			);
			if (!reportIds.includes(c.employeeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have access to this offboarding case.",
				});
			}
		}

		const me = await resolveCurrentEmployee(orgId(context), actorId(context));
		return redactCase(c as Record<string, unknown>, callerRole, me?.id ?? null);
	});

/**
 * HR-initiated case creation (termination / retirement / contract_end /
 * involuntary). Starts at `active` — no approval step.
 * Transactional: case + task snapshot + activity or full rollback.
 */
const casesCreate = authorizedProcedure("offboarding", "create")
	.input(
		z.object({
			employeeId: z.string(),
			exitType: z.enum([
				"termination",
				"retirement",
				"contract_end",
				"involuntary",
			]),
			exitReason: z.string().optional(),
			noticePeriodDays: z.number().int().min(0).optional(),
			noticePeriodStartDate: z.string().optional(),
			lastWorkingDay: z.string().optional(),
			internalNote: z.string().optional(),
			templateId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyEmployeeInOrg(oid, input.employeeId);
		if (input.templateId) {
			await verifyOBTemplate(oid, input.templateId);
		}

		const caseId = createId();
		const lwd = input.lastWorkingDay ? new Date(input.lastWorkingDay) : null;
		const noticeStart = input.noticePeriodStartDate
			? new Date(input.noticePeriodStartDate)
			: null;

		try {
			await db.transaction(async (tx) => {
				await tx.insert(offboardingCase).values({
					id: caseId,
					organizationId: oid,
					employeeId: input.employeeId,
					exitType: input.exitType,
					exitReason: input.exitReason ?? null,
					noticePeriodDays: input.noticePeriodDays ?? null,
					noticePeriodStartDate: noticeStart,
					lastWorkingDay: lwd,
					status: "active",
					initiatedByUserId: actorId(context),
					internalNote: input.internalNote ?? null,
					templateId: input.templateId ?? null,
				});

				if (input.templateId) {
					await snapshotTemplateTasks(tx, oid, caseId, input.templateId, lwd);
				}

				await tx.insert(offboardingActivity).values({
					id: createId(),
					organizationId: oid,
					caseId,
					kind: "case_created",
					actorUserId: actorId(context),
					summary: `Offboarding case opened (${input.exitType}).`,
					metadata: { exitType: input.exitType },
					createdAt: new Date(),
				});
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "This employee already has an active offboarding case.",
				});
			}
			throw err;
		}

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "offboarding_case",
			entityId: caseId,
			action: "create",
			actorId: actorId(context),
			metadata: { exitType: input.exitType },
		});
		return { id: caseId };
	});

/**
 * Employee self-service resignation. Starts at `pending_approval`.
 * Transactional: case + activity or full rollback.
 */
const casesSubmitResignation = authorizedProcedure("resignation", "create")
	.input(
		z.object({
			exitReason: z.string().optional(),
			lastWorkingDay: z.string().optional(),
			noticePeriodDays: z.number().int().min(0).optional(),
			templateId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must have an employee profile to submit a resignation.",
			});
		}
		if (input.templateId) {
			await verifyOBTemplate(oid, input.templateId);
		}

		const caseId = createId();
		const lwd = input.lastWorkingDay ? new Date(input.lastWorkingDay) : null;
		const now = new Date();

		try {
			await db.transaction(async (tx) => {
				await tx.insert(offboardingCase).values({
					id: caseId,
					organizationId: oid,
					employeeId: me.id,
					exitType: "resignation",
					exitReason: input.exitReason ?? null,
					noticePeriodDays: input.noticePeriodDays ?? null,
					noticePeriodStartDate: now,
					lastWorkingDay: lwd,
					status: "pending_approval",
					initiatedByUserId: actorId(context),
					templateId: input.templateId ?? null,
				});

				await tx.insert(offboardingActivity).values({
					id: createId(),
					organizationId: oid,
					caseId,
					kind: "case_created",
					actorUserId: actorId(context),
					summary: "Resignation submitted. Awaiting HR approval.",
					metadata: { exitType: "resignation" },
					createdAt: now,
				});
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "You already have an active offboarding case.",
				});
			}
			throw err;
		}

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "offboarding_case",
			entityId: caseId,
			action: "create",
			actorId: actorId(context),
			metadata: { exitType: "resignation", submittedBy: me.id },
		});
		return { id: caseId };
	});

/**
 * Employee views their own offboarding case. Uses resignation:read so an
 * employee passes the AC gate. internalNote and involuntary exitReason are
 * redacted before returning.
 */
const casesGetMyCase = authorizedProcedure("resignation", "read")
	.input(z.object({}))
	.handler(async ({ context }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return null;
		}

		const [c] = await db
			.select()
			.from(offboardingCase)
			.where(
				and(
					eq(offboardingCase.employeeId, me.id),
					eq(offboardingCase.organizationId, oid),
					isNull(offboardingCase.deletedAt)
				)
			)
			.orderBy(desc(offboardingCase.createdAt))
			.limit(1);

		if (!c) {
			return null;
		}
		return redactCase(c as Record<string, unknown>, role(context), me.id);
	});

/** Approve a pending_approval resignation. Moves to `active`. */
const casesApprove = authorizedProcedure("offboarding", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		// Manager can approve (resignation:approve AC action), HR/admin can too
		const callerRole = role(context);
		const canApprove =
			canManageOffboarding(callerRole) || callerRole === "manager";
		if (!canApprove) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (c.status !== "pending_approval") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only pending-approval cases can be approved. Current status: ${c.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({
				status: "active",
				approvedByUserId: actorId(context),
				approvedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);

		// Snapshot template tasks now that we have an active case
		if (c.templateId && c.lastWorkingDay) {
			const lwd = new Date(c.lastWorkingDay);
			await db.transaction(async (tx) => {
				await snapshotTemplateTasks(
					tx,
					orgId(context),
					input.id,
					c.templateId!,
					lwd
				);
			});
		}

		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.id,
			kind: "status_changed",
			actorUserId: actorId(context),
			summary: "Resignation approved. Offboarding is now active.",
			metadata: { from: "pending_approval", to: "active" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "approve" },
		});
		return { id: input.id };
	});

/** Reject a pending_approval resignation. */
const casesReject = authorizedProcedure("offboarding", "reject")
	.input(
		z.object({
			id: z.string(),
			reason: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (c.status !== "pending_approval") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only pending-approval cases can be rejected. Current status: ${c.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({
				status: "rejected",
				rejectedByUserId: actorId(context),
				rejectedReason: input.reason ?? null,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.id,
			kind: "status_changed",
			actorUserId: actorId(context),
			summary: input.reason
				? `Resignation rejected: ${input.reason}`
				: "Resignation rejected.",
			metadata: { from: "pending_approval", to: "rejected" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reject", reason: input.reason },
		});
		return { id: input.id };
	});

/** Employee withdraws their own pending resignation. */
const casesWithdraw = authorizedProcedure("resignation", "withdraw")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must have an employee profile to withdraw a resignation.",
			});
		}
		const c = await verifyOBCase(oid, input.id);
		if (c.employeeId !== me.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only withdraw your own resignation.",
			});
		}
		if (c.status !== "pending_approval") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only pending-approval resignations can be withdrawn.",
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({ status: "withdrawn", updatedAt: now })
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, oid)
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: oid,
			caseId: input.id,
			kind: "status_changed",
			actorUserId: actorId(context),
			summary: "Resignation withdrawn by employee.",
			metadata: { from: "pending_approval", to: "withdrawn" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "withdraw" },
		});
		return { id: input.id };
	});

/** HR cancels any non-terminal case. */
const casesCancel = authorizedProcedure("offboarding", "cancel")
	.input(z.object({ id: z.string(), reason: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (TERMINAL_CASE_STATUSES.has(c.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `This case is already ${c.status} and cannot be cancelled.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({ status: "cancelled", updatedAt: now })
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.id,
			kind: "case_cancelled",
			actorUserId: actorId(context),
			summary: input.reason
				? `Case cancelled: ${input.reason}`
				: "Case cancelled by HR.",
			metadata: { from: c.status, to: "cancelled" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "cancel", reason: input.reason },
		});
		return { id: input.id };
	});

const casesMoveToClearance = authorizedProcedure("offboarding", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (c.status !== "active") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only active cases can move to in_clearance. Current status: ${c.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({ status: "in_clearance", updatedAt: now })
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.id,
			kind: "status_changed",
			actorUserId: actorId(context),
			summary: "Case moved to clearance phase.",
			metadata: { from: "active", to: "in_clearance" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "move_to_clearance" },
		});
		return { id: input.id };
	});

const casesMarkPendingSettlement = authorizedProcedure("offboarding", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (c.status !== "in_clearance") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only in_clearance cases can move to pending_settlement. Current status: ${c.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingCase)
			.set({ status: "pending_settlement", updatedAt: now })
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.id,
			kind: "status_changed",
			actorUserId: actorId(context),
			summary: "Clearance complete. Awaiting final settlement confirmation.",
			metadata: { from: "in_clearance", to: "pending_settlement" },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "mark_pending_settlement" },
		});
		return { id: input.id };
	});

/**
 * Close an offboarding case.
 * THIS IS THE ONLY PROCEDURE THAT MAY SET employeeProfile.isActive = false.
 * Both the case status update and the isActive flip are inside one transaction.
 */
const casesClose = authorizedProcedure("offboarding", "close")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (c.status !== "pending_settlement" && c.status !== "in_clearance") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only in_clearance or pending_settlement cases can be closed. Current status: ${c.status}.`,
			});
		}
		const now = new Date();

		await db.transaction(async (tx) => {
			// 1. Close the case
			await tx
				.update(offboardingCase)
				.set({
					status: "closed",
					closedByUserId: actorId(context),
					closedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(offboardingCase.id, input.id),
						eq(offboardingCase.organizationId, orgId(context))
					)
				);

			// 2. THE ONLY PLACE isActive=false is set on employeeProfile
			await tx
				.update(employeeProfile)
				.set({ isActive: false, updatedAt: now })
				.where(
					and(
						eq(employeeProfile.id, c.employeeId),
						eq(employeeProfile.organizationId, orgId(context))
					)
				);

			// 3. Activity row
			await tx.insert(offboardingActivity).values({
				id: createId(),
				organizationId: orgId(context),
				caseId: input.id,
				kind: "case_closed",
				actorUserId: actorId(context),
				summary: input.note
					? `Case closed: ${input.note}`
					: "Offboarding closed. Employee deactivated.",
				metadata: { from: c.status, to: "closed" },
				createdAt: now,
			});
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "close", employeeDeactivated: c.employeeId },
		});
		return { id: input.id };
	});

const casesUpdate = authorizedProcedure("offboarding", "update")
	.input(
		z.object({
			id: z.string(),
			exitReason: z.string().nullable().optional(),
			noticePeriodDays: z.number().int().min(0).nullable().optional(),
			noticePeriodStartDate: z.string().nullable().optional(),
			lastWorkingDay: z.string().nullable().optional(),
			internalNote: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.id);
		if (TERMINAL_CASE_STATUSES.has(c.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This case is already closed and cannot be edited.",
			});
		}
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.exitReason !== undefined) {
			patch.exitReason = input.exitReason;
		}
		if (input.noticePeriodDays !== undefined) {
			patch.noticePeriodDays = input.noticePeriodDays;
		}
		if (input.noticePeriodStartDate !== undefined) {
			patch.noticePeriodStartDate = input.noticePeriodStartDate
				? new Date(input.noticePeriodStartDate)
				: null;
		}
		if (input.lastWorkingDay !== undefined) {
			patch.lastWorkingDay = input.lastWorkingDay
				? new Date(input.lastWorkingDay)
				: null;
		}
		if (input.internalNote !== undefined) {
			patch.internalNote = input.internalNote;
		}

		await db
			.update(offboardingCase)
			.set(patch)
			.where(
				and(
					eq(offboardingCase.id, input.id),
					eq(offboardingCase.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_case",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// TASKS
// ════════════════════════════════════════════════════════════════════

const tasksList = authorizedProcedure("offboarding", "read")
	.input(
		z.object({
			caseId: z.string(),
			status: z
				.enum(["todo", "in_progress", "done", "skipped", "blocked"])
				.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.caseId);
		// Manager scope
		if (role(context) === "manager") {
			const reportIds = await getManagerDirectReportIds(
				orgId(context),
				actorId(context)
			);
			if (!reportIds.includes(c.employeeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have access to this case.",
				});
			}
		}
		const filters = [
			eq(offboardingTask.caseId, input.caseId),
			eq(offboardingTask.organizationId, orgId(context)),
			isNull(offboardingTask.deletedAt),
		];
		if (input.status) {
			filters.push(eq(offboardingTask.status, input.status));
		}
		return await db
			.select()
			.from(offboardingTask)
			.where(and(...filters))
			.orderBy(asc(offboardingTask.dueAt));
	});

const tasksComplete = authorizedProcedure("offboarding", "complete_task")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const task = await verifyOBTask(oid, input.id);
		const callerRole = role(context);

		// Manager/employee can complete only if they are assigned to the task
		if (!canManageOffboarding(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			const isAssigned = me && task.assigneeEmployeeId === me.id;
			if (!isAssigned) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only complete tasks that are assigned to you.",
				});
			}
		}

		if (task.status === "done") {
			throw new ORPCError("CONFLICT", {
				message: "Task is already completed.",
			});
		}
		const now = new Date();
		await db
			.update(offboardingTask)
			.set({
				status: "done",
				completedAt: now,
				completedByUserId: actorId(context),
				note: input.note ?? task.note,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingTask.id, input.id),
					eq(offboardingTask.organizationId, oid)
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: oid,
			caseId: task.caseId,
			kind: "task_completed",
			actorUserId: actorId(context),
			summary: `Task completed: "${task.titleSnapshot}"`,
			metadata: { taskId: input.id },
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "offboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "complete" },
		});
		return { id: input.id };
	});

const tasksSkip = authorizedProcedure("offboarding", "complete_task")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const task = await verifyOBTask(oid, input.id);
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR can skip offboarding tasks.",
			});
		}
		if (task.status === "done" || task.status === "skipped") {
			throw new ORPCError("CONFLICT", {
				message: "Task is already complete or skipped.",
			});
		}
		const now = new Date();
		await db
			.update(offboardingTask)
			.set({
				status: "skipped",
				note: input.note ?? task.note,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingTask.id, input.id),
					eq(offboardingTask.organizationId, oid)
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: oid,
			caseId: task.caseId,
			kind: "task_skipped",
			actorUserId: actorId(context),
			summary: `Task skipped: "${task.titleSnapshot}"`,
			metadata: { taskId: input.id, note: input.note },
			createdAt: now,
		});
		return { id: input.id };
	});

const tasksBlock = authorizedProcedure("offboarding", "complete_task")
	.input(z.object({ id: z.string(), note: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const task = await verifyOBTask(oid, input.id);
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const now = new Date();
		await db
			.update(offboardingTask)
			.set({ status: "blocked", note: input.note, updatedAt: now })
			.where(
				and(
					eq(offboardingTask.id, input.id),
					eq(offboardingTask.organizationId, oid)
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: oid,
			caseId: task.caseId,
			kind: "task_blocked",
			actorUserId: actorId(context),
			summary: `Task blocked: "${task.titleSnapshot}" — ${input.note}`,
			metadata: { taskId: input.id, note: input.note },
			createdAt: now,
		});
		return { id: input.id };
	});

const tasksReassign = authorizedProcedure("offboarding", "update")
	.input(
		z.object({
			id: z.string(),
			assigneeEmployeeId: z.string().nullable().optional(),
			assigneeUserId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const task = await verifyOBTask(orgId(context), input.id);
		if (input.assigneeEmployeeId) {
			await verifyEmployeeInOrg(orgId(context), input.assigneeEmployeeId);
		}
		const now = new Date();
		await db
			.update(offboardingTask)
			.set({
				assigneeEmployeeId:
					input.assigneeEmployeeId === undefined
						? task.assigneeEmployeeId
						: input.assigneeEmployeeId,
				assigneeUserId:
					input.assigneeUserId === undefined
						? task.assigneeUserId
						: input.assigneeUserId,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingTask.id, input.id),
					eq(offboardingTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reassign" },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ASSET RETURNS
// ════════════════════════════════════════════════════════════════════

const assetsList = authorizedProcedure("offboarding", "read")
	.input(z.object({ caseId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		return await db
			.select()
			.from(offboardingAssetReturn)
			.where(
				and(
					eq(offboardingAssetReturn.caseId, input.caseId),
					eq(offboardingAssetReturn.organizationId, orgId(context)),
					isNull(offboardingAssetReturn.deletedAt)
				)
			)
			.orderBy(asc(offboardingAssetReturn.assetDescription));
	});

const assetsCreate = authorizedProcedure("offboarding", "manage_assets")
	.input(
		z.object({
			caseId: z.string(),
			assetDescription: z.string().min(1).max(300),
			assetTag: z.string().optional(),
			expectedReturnDate: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		const id = createId();
		await db.insert(offboardingAssetReturn).values({
			id,
			organizationId: orgId(context),
			caseId: input.caseId,
			assetDescription: input.assetDescription,
			assetTag: input.assetTag ?? null,
			expectedReturnDate: input.expectedReturnDate
				? new Date(input.expectedReturnDate)
				: null,
			status: "pending",
		});
		return { id };
	});

const assetsMarkReturned = authorizedProcedure("offboarding", "manage_assets")
	.input(
		z.object({
			id: z.string(),
			condition: z.string().optional(),
			note: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const asset = await verifyAssetReturn(orgId(context), input.id);
		if (asset.status !== "pending") {
			throw new ORPCError("CONFLICT", {
				message: `Asset is already ${asset.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingAssetReturn)
			.set({
				status: "returned",
				returnedAt: now,
				receivedByUserId: actorId(context),
				condition: input.condition ?? null,
				note: input.note ?? null,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingAssetReturn.id, input.id),
					eq(offboardingAssetReturn.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: asset.caseId,
			kind: "asset_returned",
			actorUserId: actorId(context),
			summary: `Asset returned: "${asset.assetDescription}".`,
			metadata: { assetId: input.id, condition: input.condition },
			createdAt: now,
		});
		return { id: input.id };
	});

const assetsWaive = authorizedProcedure("offboarding", "manage_assets")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const asset = await verifyAssetReturn(orgId(context), input.id);
		if (asset.status !== "pending") {
			throw new ORPCError("CONFLICT", {
				message: `Asset is already ${asset.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingAssetReturn)
			.set({ status: "waived", note: input.note ?? null, updatedAt: now })
			.where(
				and(
					eq(offboardingAssetReturn.id, input.id),
					eq(offboardingAssetReturn.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: asset.caseId,
			kind: "asset_waived",
			actorUserId: actorId(context),
			summary: `Asset return waived: "${asset.assetDescription}".`,
			metadata: { assetId: input.id },
			createdAt: now,
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ACCESS REVOCATIONS
// ════════════════════════════════════════════════════════════════════

const accessList = authorizedProcedure("offboarding", "read")
	.input(z.object({ caseId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		return await db
			.select()
			.from(offboardingAccessRevocation)
			.where(
				and(
					eq(offboardingAccessRevocation.caseId, input.caseId),
					eq(offboardingAccessRevocation.organizationId, orgId(context)),
					isNull(offboardingAccessRevocation.deletedAt)
				)
			)
			.orderBy(asc(offboardingAccessRevocation.system));
	});

const accessCreate = authorizedProcedure("offboarding", "manage_access")
	.input(
		z.object({
			caseId: z.string(),
			system: z.string().min(1).max(100),
			description: z.string().optional(),
			scheduledRevokeAt: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		const id = createId();
		await db.insert(offboardingAccessRevocation).values({
			id,
			organizationId: orgId(context),
			caseId: input.caseId,
			system: input.system,
			description: input.description ?? null,
			scheduledRevokeAt: input.scheduledRevokeAt
				? new Date(input.scheduledRevokeAt)
				: null,
			status: "pending",
		});
		return { id };
	});

const accessMarkRevoked = authorizedProcedure("offboarding", "manage_access")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const acc = await verifyAccessRevocation(orgId(context), input.id);
		if (acc.status !== "pending") {
			throw new ORPCError("CONFLICT", {
				message: `Access record is already ${acc.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingAccessRevocation)
			.set({
				status: "revoked",
				revokedAt: now,
				revokedByUserId: actorId(context),
				note: input.note ?? null,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingAccessRevocation.id, input.id),
					eq(offboardingAccessRevocation.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: acc.caseId,
			kind: "access_revoked",
			actorUserId: actorId(context),
			summary: `Access revoked: "${acc.system}". Mark access as revoked only after the account has been disabled outside Heimdallone.`,
			metadata: { accessId: input.id, system: acc.system },
			createdAt: now,
		});
		return { id: input.id };
	});

const accessWaive = authorizedProcedure("offboarding", "manage_access")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const acc = await verifyAccessRevocation(orgId(context), input.id);
		if (acc.status !== "pending") {
			throw new ORPCError("CONFLICT", {
				message: `Access record is already ${acc.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingAccessRevocation)
			.set({ status: "waived", note: input.note ?? null, updatedAt: now })
			.where(
				and(
					eq(offboardingAccessRevocation.id, input.id),
					eq(offboardingAccessRevocation.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: acc.caseId,
			kind: "access_waived",
			actorUserId: actorId(context),
			summary: `Access revocation waived: "${acc.system}".`,
			metadata: { accessId: input.id },
			createdAt: now,
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// DOCUMENT REQUESTS
// ════════════════════════════════════════════════════════════════════

const documentsList = authorizedProcedure("offboarding", "read")
	.input(z.object({ caseId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		return await db
			.select()
			.from(offboardingDocumentRequest)
			.where(
				and(
					eq(offboardingDocumentRequest.caseId, input.caseId),
					eq(offboardingDocumentRequest.organizationId, orgId(context)),
					isNull(offboardingDocumentRequest.deletedAt)
				)
			)
			.orderBy(asc(offboardingDocumentRequest.title));
	});

const documentsCreate = authorizedProcedure("offboarding", "manage_documents")
	.input(
		z.object({
			caseId: z.string(),
			documentType: z.string().min(1).max(100),
			title: z.string().min(1).max(200),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		const id = createId();
		await db.insert(offboardingDocumentRequest).values({
			id,
			organizationId: orgId(context),
			caseId: input.caseId,
			documentType: input.documentType,
			title: input.title,
			requestedByUserId: actorId(context),
			status: "requested",
		});
		return { id };
	});

const documentsMarkUploaded = authorizedProcedure(
	"offboarding",
	"manage_documents"
)
	.input(z.object({ id: z.string(), fileUrl: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const doc = await verifyDocumentRequest(oid, input.id);
		if (!canManageOffboarding(role(context))) {
			// Employee self-scope: only if the doc is on their own case
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				throw new ORPCError("FORBIDDEN", {
					message: "Insufficient permission.",
				});
			}
			const c = await verifyOBCase(oid, doc.caseId);
			if (c.employeeId !== me.id) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only upload documents for your own offboarding.",
				});
			}
		}
		if (doc.status !== "requested") {
			throw new ORPCError("CONFLICT", {
				message: `Document is already ${doc.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(offboardingDocumentRequest)
			.set({
				status: "uploaded",
				fileUrl: input.fileUrl ?? null,
				uploadedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingDocumentRequest.id, input.id),
					eq(offboardingDocumentRequest.organizationId, oid)
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: oid,
			caseId: doc.caseId,
			kind: "document_uploaded",
			actorUserId: actorId(context),
			summary: `Document uploaded: "${doc.title}".`,
			metadata: { docId: input.id },
			createdAt: now,
		});
		return { id: input.id };
	});

const documentsApprove = authorizedProcedure("offboarding", "manage_documents")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const doc = await verifyDocumentRequest(orgId(context), input.id);
		if (doc.status !== "uploaded") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only uploaded documents can be approved.",
			});
		}
		const now = new Date();
		await db
			.update(offboardingDocumentRequest)
			.set({
				status: "approved",
				approvedByUserId: actorId(context),
				updatedAt: now,
			})
			.where(
				and(
					eq(offboardingDocumentRequest.id, input.id),
					eq(offboardingDocumentRequest.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: doc.caseId,
			kind: "document_approved",
			actorUserId: actorId(context),
			summary: `Document approved: "${doc.title}".`,
			metadata: { docId: input.id },
			createdAt: now,
		});
		return { id: input.id };
	});

const documentsWaive = authorizedProcedure("offboarding", "manage_documents")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const doc = await verifyDocumentRequest(orgId(context), input.id);
		if (doc.status === "approved") {
			throw new ORPCError("CONFLICT", { message: "Already approved." });
		}
		const now = new Date();
		await db
			.update(offboardingDocumentRequest)
			.set({ status: "waived", updatedAt: now })
			.where(
				and(
					eq(offboardingDocumentRequest.id, input.id),
					eq(offboardingDocumentRequest.organizationId, orgId(context))
				)
			);
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: doc.caseId,
			kind: "document_waived",
			actorUserId: actorId(context),
			summary: `Document request waived: "${doc.title}".`,
			metadata: { docId: input.id },
			createdAt: now,
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// EXIT INTERVIEW
// ════════════════════════════════════════════════════════════════════

const interviewGetByCaseId = authorizedProcedure("offboarding", "read")
	.input(z.object({ caseId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewOffboarding(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.caseId);

		const [interview] = await db
			.select()
			.from(offboardingExitInterview)
			.where(
				and(
					eq(offboardingExitInterview.caseId, input.caseId),
					eq(offboardingExitInterview.organizationId, orgId(context)),
					isNull(offboardingExitInterview.deletedAt)
				)
			)
			.limit(1);

		if (!interview) {
			return null;
		}

		// Private interviews: non-HR callers see null unless they own the case
		const isHrOrAuditor =
			canManageOffboarding(callerRole) || callerRole === "auditor";
		if (interview.isPrivate && !isHrOrAuditor) {
			// Check if caller is the employee whose interview this is
			const me = await resolveCurrentEmployee(orgId(context), actorId(context));
			if (!me || c.employeeId !== me.id) {
				return null;
			}
		}

		// Always strip HR-only fields for non-HR callers
		if (!isHrOrAuditor) {
			return {
				...interview,
				internalNotes: null,
				wouldRehire: null,
			};
		}
		return interview;
	});

const interviewUpsert = authorizedProcedure("offboarding", "manage_interview")
	.input(
		z.object({
			caseId: z.string(),
			conductedAt: z.string().optional(),
			isPrivate: z.boolean().optional(),
			overallRating: z.number().int().min(1).max(5).nullable().optional(),
			reasonForLeaving: z.string().nullable().optional(),
			whatWentWell: z.string().nullable().optional(),
			whatCouldImprove: z.string().nullable().optional(),
			wouldRehire: z.boolean().nullable().optional(),
			internalNotes: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		const now = new Date();

		const [existing] = await db
			.select()
			.from(offboardingExitInterview)
			.where(
				and(
					eq(offboardingExitInterview.caseId, input.caseId),
					eq(offboardingExitInterview.organizationId, orgId(context)),
					isNull(offboardingExitInterview.deletedAt)
				)
			)
			.limit(1);

		if (existing) {
			const patch: Record<string, unknown> = { updatedAt: now };
			if (input.conductedAt !== undefined) {
				patch.conductedAt = input.conductedAt
					? new Date(input.conductedAt)
					: null;
			}
			if (input.isPrivate !== undefined) {
				patch.isPrivate = input.isPrivate;
			}
			if (input.overallRating !== undefined) {
				patch.overallRating = input.overallRating;
			}
			if (input.reasonForLeaving !== undefined) {
				patch.reasonForLeaving = input.reasonForLeaving;
			}
			if (input.whatWentWell !== undefined) {
				patch.whatWentWell = input.whatWentWell;
			}
			if (input.whatCouldImprove !== undefined) {
				patch.whatCouldImprove = input.whatCouldImprove;
			}
			if (input.wouldRehire !== undefined) {
				patch.wouldRehire = input.wouldRehire;
			}
			if (input.internalNotes !== undefined) {
				patch.internalNotes = input.internalNotes;
			}
			await db
				.update(offboardingExitInterview)
				.set(patch)
				.where(
					and(
						eq(offboardingExitInterview.id, existing.id),
						eq(offboardingExitInterview.organizationId, orgId(context))
					)
				);
			await db.insert(offboardingActivity).values({
				id: createId(),
				organizationId: orgId(context),
				caseId: input.caseId,
				kind: "interview_updated",
				actorUserId: actorId(context),
				summary: "Exit interview updated.",
				createdAt: now,
			});
			return { id: existing.id };
		}

		const id = createId();
		await db.insert(offboardingExitInterview).values({
			id,
			organizationId: orgId(context),
			caseId: input.caseId,
			conductedByUserId: actorId(context),
			conductedAt: input.conductedAt ? new Date(input.conductedAt) : null,
			isPrivate: input.isPrivate ?? true,
			overallRating: input.overallRating ?? null,
			reasonForLeaving: input.reasonForLeaving ?? null,
			whatWentWell: input.whatWentWell ?? null,
			whatCouldImprove: input.whatCouldImprove ?? null,
			wouldRehire: input.wouldRehire ?? null,
			internalNotes: input.internalNotes ?? null,
		});
		await db.insert(offboardingActivity).values({
			id: createId(),
			organizationId: orgId(context),
			caseId: input.caseId,
			kind: "interview_recorded",
			actorUserId: actorId(context),
			summary: "Exit interview recorded.",
			createdAt: now,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "offboarding_exit_interview",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

// ════════════════════════════════════════════════════════════════════
// ACTIVITY
// ════════════════════════════════════════════════════════════════════

const activityList = authorizedProcedure("offboarding", "read")
	.input(
		z.object({
			caseId: z.string(),
			limit: z.number().int().min(1).max(200).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewOffboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOBCase(orgId(context), input.caseId);
		return await db
			.select()
			.from(offboardingActivity)
			.where(
				and(
					eq(offboardingActivity.caseId, input.caseId),
					eq(offboardingActivity.organizationId, orgId(context))
				)
			)
			.orderBy(desc(offboardingActivity.createdAt))
			.limit(input.limit);
	});

// ════════════════════════════════════════════════════════════════════
// SETTLEMENT READINESS (read-only indicators, no calculation)
// ════════════════════════════════════════════════════════════════════

const settlementGetReadiness = authorizedProcedure(
	"offboarding",
	"read_settlement"
)
	.input(z.object({ caseId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canReadOffboardingSettlement(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const c = await verifyOBCase(orgId(context), input.caseId);

		const oid = orgId(context);

		// Pending task counts
		const [
			pendingTaskRows,
			pendingAssetRows,
			pendingAccessRows,
			pendingDocRows,
		] = await Promise.all([
			db
				.select({ value: count() })
				.from(offboardingTask)
				.where(
					and(
						eq(offboardingTask.caseId, input.caseId),
						eq(offboardingTask.organizationId, oid),
						ne(offboardingTask.status, "done"),
						ne(offboardingTask.status, "skipped"),
						isNull(offboardingTask.deletedAt)
					)
				),
			db
				.select({ value: count() })
				.from(offboardingAssetReturn)
				.where(
					and(
						eq(offboardingAssetReturn.caseId, input.caseId),
						eq(offboardingAssetReturn.organizationId, oid),
						eq(offboardingAssetReturn.status, "pending"),
						isNull(offboardingAssetReturn.deletedAt)
					)
				),
			db
				.select({ value: count() })
				.from(offboardingAccessRevocation)
				.where(
					and(
						eq(offboardingAccessRevocation.caseId, input.caseId),
						eq(offboardingAccessRevocation.organizationId, oid),
						eq(offboardingAccessRevocation.status, "pending"),
						isNull(offboardingAccessRevocation.deletedAt)
					)
				),
			db
				.select({ value: count() })
				.from(offboardingDocumentRequest)
				.where(
					and(
						eq(offboardingDocumentRequest.caseId, input.caseId),
						eq(offboardingDocumentRequest.organizationId, oid),
						ne(offboardingDocumentRequest.status, "approved"),
						ne(offboardingDocumentRequest.status, "waived"),
						isNull(offboardingDocumentRequest.deletedAt)
					)
				),
		]);

		return {
			caseId: input.caseId,
			status: c.status,
			lastWorkingDay: c.lastWorkingDay,
			pendingTasks: Number(pendingTaskRows[0]?.value ?? 0),
			pendingAssetReturns: Number(pendingAssetRows[0]?.value ?? 0),
			pendingAccessRevocations: Number(pendingAccessRows[0]?.value ?? 0),
			pendingDocuments: Number(pendingDocRows[0]?.value ?? 0),
			// Payroll/leave/loan placeholders — full integration in Phase 10G
			leaveBalancePlaceholder: null,
			loanBalancePlaceholder: null,
			advanceBalancePlaceholder: null,
			contractActivePrompt: c.contractId !== null,
		};
	});

// ════════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════════

export const offboardingRouter = {
	templates: {
		list: templatesList,
		getById: templatesGetById,
		create: templatesCreate,
		update: templatesUpdate,
		archive: templatesArchive,
	},
	templateTasks: {
		listByTemplate: templateTasksListByTemplate,
		create: templateTasksCreate,
		update: templateTasksUpdate,
		delete: templateTasksDelete,
		reorder: templateTasksReorder,
	},
	cases: {
		list: casesList,
		getById: casesGetById,
		create: casesCreate,
		submitResignation: casesSubmitResignation,
		getMyCase: casesGetMyCase,
		approve: casesApprove,
		reject: casesReject,
		withdraw: casesWithdraw,
		cancel: casesCancel,
		update: casesUpdate,
		moveToClearance: casesMoveToClearance,
		markPendingSettlement: casesMarkPendingSettlement,
		close: casesClose,
	},
	tasks: {
		list: tasksList,
		complete: tasksComplete,
		skip: tasksSkip,
		block: tasksBlock,
		reassign: tasksReassign,
	},
	assets: {
		list: assetsList,
		create: assetsCreate,
		markReturned: assetsMarkReturned,
		waive: assetsWaive,
	},
	access: {
		list: accessList,
		create: accessCreate,
		markRevoked: accessMarkRevoked,
		waive: accessWaive,
	},
	documents: {
		list: documentsList,
		create: documentsCreate,
		markUploaded: documentsMarkUploaded,
		approve: documentsApprove,
		waive: documentsWaive,
	},
	interviews: {
		getByCaseId: interviewGetByCaseId,
		upsert: interviewUpsert,
	},
	activity: {
		list: activityList,
	},
	settlement: {
		getReadiness: settlementGetReadiness,
	},
};
