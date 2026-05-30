import { db } from "@Heimdallone/db";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import {
	employeeOnboarding,
	onboardingAcknowledgement,
	onboardingActivity,
	onboardingDocumentRequest,
	onboardingTask,
	onboardingTemplate,
	onboardingTemplateTask,
} from "@Heimdallone/db/schema/onboarding";
import { candidateApplication } from "@Heimdallone/db/schema/recruitment";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
import { canManageOnboarding, canViewOnboarding } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (base: Date, days: number) =>
	new Date(base.getTime() + days * DAY_MS);

const CATEGORY = [
	"document",
	"equipment",
	"policy",
	"training",
	"introduction",
	"other",
] as const;

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every FK input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyTemplate(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(onboardingTemplate)
		.where(
			and(
				eq(onboardingTemplate.id, id),
				eq(onboardingTemplate.organizationId, orgIdValue),
				isNull(onboardingTemplate.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Template not found." });
	}
	return row;
}

async function verifyTemplateTask(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(onboardingTemplateTask)
		.where(
			and(
				eq(onboardingTemplateTask.id, id),
				eq(onboardingTemplateTask.organizationId, orgIdValue),
				isNull(onboardingTemplateTask.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Template task not found." });
	}
	return row;
}

async function verifyOnboarding(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(employeeOnboarding)
		.where(
			and(
				eq(employeeOnboarding.id, id),
				eq(employeeOnboarding.organizationId, orgIdValue),
				isNull(employeeOnboarding.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Onboarding not found." });
	}
	return row;
}

async function verifyOnboardingTask(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(onboardingTask)
		.where(
			and(
				eq(onboardingTask.id, id),
				eq(onboardingTask.organizationId, orgIdValue),
				isNull(onboardingTask.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Task not found." });
	}
	return row;
}

async function verifyDocumentRequest(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(onboardingDocumentRequest)
		.where(
			and(
				eq(onboardingDocumentRequest.id, id),
				eq(onboardingDocumentRequest.organizationId, orgIdValue),
				isNull(onboardingDocumentRequest.deletedAt)
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

async function verifyAcknowledgement(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(onboardingAcknowledgement)
		.where(
			and(
				eq(onboardingAcknowledgement.id, id),
				eq(onboardingAcknowledgement.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Acknowledgement not found." });
	}
	return row;
}

async function verifyEmployee(orgIdValue: string, id: string) {
	const [row] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.id, id),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
	}
	return row;
}

async function verifyApplication(orgIdValue: string, id: string) {
	const [row] = await db
		.select({ id: candidateApplication.id })
		.from(candidateApplication)
		.where(
			and(
				eq(candidateApplication.id, id),
				eq(candidateApplication.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Application not found." });
	}
	return row;
}

// Self-scope: managers/HR/admin/auditor/recruiter can view any onboarding in
// the org; an employee may only access their own.
async function assertCanViewOnboarding(
	context: { organizationId: string; session: { user: { id: string } } },
	onboarding: { employeeId: string }
) {
	if (canViewOnboarding(role(context))) {
		return;
	}
	const me = await resolveCurrentEmployee(orgId(context), actorId(context));
	if (me && me.id === onboarding.employeeId) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You do not have access to this onboarding.",
	});
}

async function logActivity(opts: {
	organizationId: string;
	onboardingId: string;
	kind: string;
	summary: string;
	actorUserId: string;
}) {
	await db.insert(onboardingActivity).values({
		id: createId(),
		organizationId: opts.organizationId,
		onboardingId: opts.onboardingId,
		kind: opts.kind,
		actorUserId: opts.actorUserId,
		summary: opts.summary,
		metadata: null,
	});
}

function isUniqueNameViolation(err: unknown): boolean {
	const cause = (err as { cause?: unknown })?.cause;
	const causeCode = (cause as { code?: string } | undefined)?.code;
	const causeMessage =
		cause instanceof Error ? cause.message : String(cause ?? "");
	const directMessage = err instanceof Error ? err.message : "";
	return (
		causeCode === "23505" ||
		directMessage.includes("onboarding_template_org_name_uq") ||
		causeMessage.includes("onboarding_template_org_name_uq")
	);
}

// ════════════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════════════

const templatesList = authorizedProcedure("onboarding", "read")
	.input(
		z.object({
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(onboardingTemplate.organizationId, orgId(context)),
			isNull(onboardingTemplate.deletedAt),
		];
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(onboardingTemplate)
			.where(and(...filters))
			.orderBy(asc(onboardingTemplate.name))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(onboardingTemplate)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const templatesGetById = authorizedProcedure("onboarding", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		return await verifyTemplate(orgId(context), input.id);
	});

const templatesCreate = authorizedProcedure("onboarding", "create")
	.input(
		z.object({
			name: z.string().min(1).max(255),
			description: z.string().optional(),
			isDefault: z.boolean().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const id = createId();
		try {
			await db.insert(onboardingTemplate).values({
				id,
				organizationId: orgId(context),
				name: input.name.trim(),
				description: input.description ?? null,
				isDefault: input.isDefault,
			});
		} catch (err) {
			if (isUniqueNameViolation(err)) {
				throw new ORPCError("CONFLICT", {
					message: "A template with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const templatesUpdate = authorizedProcedure("onboarding", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(255).optional(),
			description: z.string().nullable().optional(),
			isDefault: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplate(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) {
			patch.name = input.name.trim();
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.isDefault !== undefined) {
			patch.isDefault = input.isDefault;
		}
		try {
			await db
				.update(onboardingTemplate)
				.set(patch)
				.where(
					and(
						eq(onboardingTemplate.id, input.id),
						eq(onboardingTemplate.organizationId, orgId(context))
					)
				);
		} catch (err) {
			if (isUniqueNameViolation(err)) {
				throw new ORPCError("CONFLICT", {
					message: "A template with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const templatesArchive = authorizedProcedure("onboarding", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplate(orgId(context), input.id);
		// Soft-delete only. In-flight onboardings keep their snapshot tasks.
		await db
			.update(onboardingTemplate)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(onboardingTemplate.id, input.id),
					eq(onboardingTemplate.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// TEMPLATE TASKS
// ════════════════════════════════════════════════════════════════════

const templateTasksListByTemplate = authorizedProcedure("onboarding", "read")
	.input(z.object({ templateId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplate(orgId(context), input.templateId);
		return await db
			.select()
			.from(onboardingTemplateTask)
			.where(
				and(
					eq(onboardingTemplateTask.templateId, input.templateId),
					eq(onboardingTemplateTask.organizationId, orgId(context)),
					isNull(onboardingTemplateTask.deletedAt)
				)
			)
			.orderBy(asc(onboardingTemplateTask.sortOrder));
	});

const templateTasksCreate = authorizedProcedure("onboarding", "create")
	.input(
		z.object({
			templateId: z.string(),
			title: z.string().min(1).max(255),
			description: z.string().optional(),
			category: z.enum(CATEGORY),
			defaultAssigneeRole: z.string().optional(),
			dueOffsetDays: z.number().int().min(0).max(365).default(0),
			isRequired: z.boolean().default(true),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplate(orgId(context), input.templateId);
		const existing = (await db
			.select({ value: count() })
			.from(onboardingTemplateTask)
			.where(
				and(
					eq(onboardingTemplateTask.templateId, input.templateId),
					isNull(onboardingTemplateTask.deletedAt)
				)
			)) as { value: number }[];
		const id = createId();
		await db.insert(onboardingTemplateTask).values({
			id,
			organizationId: orgId(context),
			templateId: input.templateId,
			title: input.title.trim(),
			description: input.description ?? null,
			category: input.category,
			defaultAssigneeRole: input.defaultAssigneeRole ?? null,
			dueOffsetDays: input.dueOffsetDays,
			sortOrder: Number(existing[0]?.value ?? 0),
			isRequired: input.isRequired,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template_task",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const templateTasksUpdate = authorizedProcedure("onboarding", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).max(255).optional(),
			description: z.string().nullable().optional(),
			category: z.enum(CATEGORY).optional(),
			defaultAssigneeRole: z.string().nullable().optional(),
			dueOffsetDays: z.number().int().min(0).max(365).optional(),
			isRequired: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplateTask(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		for (const k of [
			"title",
			"description",
			"category",
			"defaultAssigneeRole",
			"dueOffsetDays",
			"isRequired",
		] as const) {
			if (input[k] !== undefined) {
				patch[k] = input[k];
			}
		}
		await db
			.update(onboardingTemplateTask)
			.set(patch)
			.where(
				and(
					eq(onboardingTemplateTask.id, input.id),
					eq(onboardingTemplateTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const templateTasksDelete = authorizedProcedure("onboarding", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplateTask(orgId(context), input.id);
		// Soft-delete. Already-snapshotted onboarding tasks are untouched.
		await db
			.update(onboardingTemplateTask)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(onboardingTemplateTask.id, input.id),
					eq(onboardingTemplateTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template_task",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const templateTasksReorder = authorizedProcedure("onboarding", "update")
	.input(z.object({ templateId: z.string(), orderedIds: z.array(z.string()) }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyTemplate(orgId(context), input.templateId);
		await db.transaction(async (tx) => {
			for (let i = 0; i < input.orderedIds.length; i++) {
				await tx
					.update(onboardingTemplateTask)
					.set({ sortOrder: i, updatedAt: new Date() })
					.where(
						and(
							eq(onboardingTemplateTask.id, input.orderedIds[i] as string),
							eq(onboardingTemplateTask.templateId, input.templateId),
							eq(onboardingTemplateTask.organizationId, orgId(context))
						)
					);
			}
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_template",
			entityId: input.templateId,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "reorder_tasks" },
		});
		return { id: input.templateId };
	});

// ════════════════════════════════════════════════════════════════════
// EMPLOYEE ONBOARDING
// ════════════════════════════════════════════════════════════════════

const employeeOnboardingList = authorizedProcedure("onboarding", "read")
	.input(
		z.object({
			status: z
				.enum([
					"not_started",
					"in_progress",
					"blocked",
					"completed",
					"cancelled",
				])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canViewOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const filters = [
			eq(employeeOnboarding.organizationId, orgId(context)),
			isNull(employeeOnboarding.deletedAt),
		];
		if (input.status) {
			filters.push(eq(employeeOnboarding.status, input.status));
		}
		const offset = (input.page - 1) * input.pageSize;
		const rows = await db
			.select()
			.from(employeeOnboarding)
			.where(and(...filters))
			.orderBy(desc(employeeOnboarding.startedAt))
			.limit(input.pageSize)
			.offset(offset);
		const totalRow = (await db
			.select({ value: count() })
			.from(employeeOnboarding)
			.where(and(...filters))) as { value: number }[];
		return {
			data: rows,
			total: Number(totalRow[0]?.value ?? 0),
			page: input.page,
		};
	});

const employeeOnboardingGetById = authorizedProcedure("onboarding", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await verifyOnboarding(orgId(context), input.id);
		await assertCanViewOnboarding(context, row);
		return row;
	});

const employeeOnboardingGetByEmployeeId = authorizedProcedure(
	"onboarding",
	"read"
)
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewOnboarding(role(context))) {
			const me = await resolveCurrentEmployee(orgId(context), actorId(context));
			if (!me || me.id !== input.employeeId) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have access to this onboarding.",
				});
			}
		}
		return await db
			.select()
			.from(employeeOnboarding)
			.where(
				and(
					eq(employeeOnboarding.employeeId, input.employeeId),
					eq(employeeOnboarding.organizationId, orgId(context)),
					isNull(employeeOnboarding.deletedAt)
				)
			)
			.orderBy(desc(employeeOnboarding.startedAt));
	});

// Self-service: the signed-in employee's own onboardings, resolved from the
// session — no employeeId input, so an employee never needs (or can guess)
// another person's id. Returns an empty list when the user has no employee
// profile or no onboarding, which the UI renders as a friendly empty state.
const employeeOnboardingMine = authorizedProcedure("onboarding", "read")
	.input(z.object({}))
	.handler(async ({ context }) => {
		const me = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!me) {
			return [];
		}
		return await db
			.select()
			.from(employeeOnboarding)
			.where(
				and(
					eq(employeeOnboarding.employeeId, me.id),
					eq(employeeOnboarding.organizationId, orgId(context)),
					isNull(employeeOnboarding.deletedAt)
				)
			)
			.orderBy(desc(employeeOnboarding.startedAt));
	});

const employeeOnboardingStart = authorizedProcedure("onboarding", "start")
	.input(
		z.object({
			employeeId: z.string(),
			templateId: z.string(),
			applicationId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyEmployee(oid, input.employeeId);
		const template = await verifyTemplate(oid, input.templateId);
		if (input.applicationId) {
			await verifyApplication(oid, input.applicationId);
		}
		const templateTasks = await db
			.select()
			.from(onboardingTemplateTask)
			.where(
				and(
					eq(onboardingTemplateTask.templateId, input.templateId),
					eq(onboardingTemplateTask.organizationId, oid),
					isNull(onboardingTemplateTask.deletedAt)
				)
			)
			.orderBy(asc(onboardingTemplateTask.sortOrder));

		const onboardingId = createId();
		const startedAt = new Date();
		const maxOffset = templateTasks.reduce(
			(max, t) => Math.max(max, t.dueOffsetDays),
			0
		);

		// Transactional: the onboarding row + all snapshot tasks + the start
		// activity commit together. A failure mid-snapshot rolls everything
		// back — never a half-started onboarding.
		await db.transaction(async (tx) => {
			await tx.insert(employeeOnboarding).values({
				id: onboardingId,
				organizationId: oid,
				employeeId: input.employeeId,
				applicationId: input.applicationId ?? null,
				templateId: input.templateId,
				startedAt,
				targetCompletionAt: addDays(startedAt, maxOffset),
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
						tt.defaultAssigneeRole === "new_hire" ? input.employeeId : null,
					assigneeUserId: null,
					dueAt: addDays(startedAt, tt.dueOffsetDays),
					status: "todo",
				});
			}
			await tx.insert(onboardingActivity).values({
				id: createId(),
				organizationId: oid,
				onboardingId,
				kind: "onboarding_started",
				actorUserId: actorId(context),
				summary: `Onboarding started from template "${template.name}".`,
				metadata: null,
			});
		});

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "employee_onboarding",
			entityId: onboardingId,
			action: "create",
			actorId: actorId(context),
			metadata: {
				templateId: input.templateId,
				taskCount: templateTasks.length,
			},
		});
		return { id: onboardingId, taskCount: templateTasks.length };
	});

const employeeOnboardingCancel = authorizedProcedure("onboarding", "update")
	.input(z.object({ id: z.string(), reason: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyOnboarding(orgId(context), input.id);
		if (existing.status === "completed" || existing.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This onboarding is already finished.",
			});
		}
		await db
			.update(employeeOnboarding)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(
				and(
					eq(employeeOnboarding.id, input.id),
					eq(employeeOnboarding.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: input.id,
			kind: "comment",
			summary: input.reason
				? `Onboarding cancelled: ${input.reason}`
				: "Onboarding cancelled.",
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_onboarding",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "cancelled" },
			],
		});
		return { id: input.id };
	});

const employeeOnboardingComplete = authorizedProcedure("onboarding", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const existing = await verifyOnboarding(orgId(context), input.id);
		if (existing.status === "completed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This onboarding has already been completed.",
			});
		}
		if (existing.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This onboarding was cancelled and cannot be completed.",
			});
		}
		const completedAt = new Date();
		await db
			.update(employeeOnboarding)
			.set({ status: "completed", completedAt, updatedAt: completedAt })
			.where(
				and(
					eq(employeeOnboarding.id, input.id),
					eq(employeeOnboarding.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: input.id,
			kind: "onboarding_completed",
			summary: "Onboarding completed.",
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_onboarding",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "completed" },
			],
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ONBOARDING TASKS
// ════════════════════════════════════════════════════════════════════

const tasksList = authorizedProcedure("onboarding", "read")
	.input(z.object({ onboardingId: z.string() }))
	.handler(async ({ context, input }) => {
		const onboarding = await verifyOnboarding(
			orgId(context),
			input.onboardingId
		);
		await assertCanViewOnboarding(context, onboarding);
		return await db
			.select()
			.from(onboardingTask)
			.where(
				and(
					eq(onboardingTask.onboardingId, input.onboardingId),
					eq(onboardingTask.organizationId, orgId(context)),
					isNull(onboardingTask.deletedAt)
				)
			)
			.orderBy(asc(onboardingTask.dueAt));
	});

const tasksGetById = authorizedProcedure("onboarding", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const task = await verifyOnboardingTask(orgId(context), input.id);
		const onboarding = await verifyOnboarding(
			orgId(context),
			task.onboardingId
		);
		await assertCanViewOnboarding(context, onboarding);
		return task;
	});

const tasksUpdate = authorizedProcedure("onboarding", "update")
	.input(
		z.object({
			id: z.string(),
			notes: z.string().nullable().optional(),
			dueAt: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOnboardingTask(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.notes !== undefined) {
			patch.notes = input.notes;
		}
		if (input.dueAt !== undefined) {
			patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
		}
		await db
			.update(onboardingTask)
			.set(patch)
			.where(
				and(
					eq(onboardingTask.id, input.id),
					eq(onboardingTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// Employee self-service / manager-assignee allowed for completion.
async function assertCanActOnTask(
	context: { organizationId: string; session: { user: { id: string } } },
	task: { assigneeEmployeeId: string | null; onboardingId: string }
) {
	if (canManageOnboarding(role(context))) {
		return;
	}
	const onboarding = await verifyOnboarding(orgId(context), task.onboardingId);
	const me = await resolveCurrentEmployee(orgId(context), actorId(context));
	if (
		me &&
		(me.id === task.assigneeEmployeeId || me.id === onboarding.employeeId)
	) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "You do not have access to this task.",
	});
}

const TERMINAL_TASK_STATUSES = new Set(["completed", "skipped"]);

const tasksComplete = authorizedProcedure("onboarding", "complete")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const task = await verifyOnboardingTask(orgId(context), input.id);
		await assertCanActOnTask(context, task);
		if (TERMINAL_TASK_STATUSES.has(task.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This task is already complete.",
			});
		}
		const completedAt = new Date();
		await db
			.update(onboardingTask)
			.set({
				status: "completed",
				completedAt,
				completedByUserId: actorId(context),
				updatedAt: completedAt,
			})
			.where(
				and(
					eq(onboardingTask.id, input.id),
					eq(onboardingTask.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: task.onboardingId,
			kind: "task_completed",
			summary: `Task completed: ${task.titleSnapshot}`,
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: task.status, newValue: "completed" },
			],
		});
		return { id: input.id };
	});

const tasksSkip = authorizedProcedure("onboarding", "skip")
	.input(z.object({ id: z.string(), note: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const task = await verifyOnboardingTask(orgId(context), input.id);
		if (TERMINAL_TASK_STATUSES.has(task.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This task is already complete.",
			});
		}
		await db
			.update(onboardingTask)
			.set({ status: "skipped", notes: input.note, updatedAt: new Date() })
			.where(
				and(
					eq(onboardingTask.id, input.id),
					eq(onboardingTask.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: task.onboardingId,
			kind: "comment",
			summary: `Task skipped: ${task.titleSnapshot} (${input.note})`,
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: task.status, newValue: "skipped" },
			],
		});
		return { id: input.id };
	});

const tasksReassign = authorizedProcedure("onboarding", "assign")
	.input(z.object({ id: z.string(), assigneeEmployeeId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context)) && role(context) !== "manager") {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const task = await verifyOnboardingTask(orgId(context), input.id);
		await verifyEmployee(orgId(context), input.assigneeEmployeeId);
		await db
			.update(onboardingTask)
			.set({
				assigneeEmployeeId: input.assigneeEmployeeId,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(onboardingTask.id, input.id),
					eq(onboardingTask.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_task",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "assigneeEmployeeId",
					oldValue: task.assigneeEmployeeId,
					newValue: input.assigneeEmployeeId,
				},
			],
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// DOCUMENT REQUESTS
// ════════════════════════════════════════════════════════════════════

const documentRequestsList = authorizedProcedure("onboarding", "read")
	.input(z.object({ onboardingId: z.string() }))
	.handler(async ({ context, input }) => {
		const onboarding = await verifyOnboarding(
			orgId(context),
			input.onboardingId
		);
		await assertCanViewOnboarding(context, onboarding);
		return await db
			.select()
			.from(onboardingDocumentRequest)
			.where(
				and(
					eq(onboardingDocumentRequest.onboardingId, input.onboardingId),
					eq(onboardingDocumentRequest.organizationId, orgId(context)),
					isNull(onboardingDocumentRequest.deletedAt)
				)
			)
			.orderBy(desc(onboardingDocumentRequest.createdAt));
	});

const documentRequestsCreate = authorizedProcedure("onboarding", "create")
	.input(
		z.object({
			onboardingId: z.string(),
			onboardingTaskId: z.string().optional(),
			documentType: z.string().min(1),
			requiredFileTypes: z.array(z.string()).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOnboarding(orgId(context), input.onboardingId);
		if (input.onboardingTaskId) {
			await verifyOnboardingTask(orgId(context), input.onboardingTaskId);
		}
		const id = createId();
		await db.insert(onboardingDocumentRequest).values({
			id,
			organizationId: orgId(context),
			onboardingId: input.onboardingId,
			onboardingTaskId: input.onboardingTaskId ?? null,
			documentType: input.documentType,
			requiredFileTypes: input.requiredFileTypes ?? null,
			status: "requested",
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_document_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const documentRequestsMarkUploaded = authorizedProcedure("onboarding", "update")
	.input(z.object({ id: z.string(), fileUrl: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const docRequest = await verifyDocumentRequest(orgId(context), input.id);
		const onboarding = await verifyOnboarding(
			orgId(context),
			docRequest.onboardingId
		);
		// HR/admin or the new hire themselves may mark a document uploaded.
		await assertCanViewOnboarding(context, onboarding);
		const uploadedAt = new Date();
		await db
			.update(onboardingDocumentRequest)
			.set({
				status: "uploaded",
				uploadedFileUrl:
					input.fileUrl ??
					"placeholder://uploaded-document (no file storage yet)",
				uploadedAt,
				updatedAt: uploadedAt,
			})
			.where(
				and(
					eq(onboardingDocumentRequest.id, input.id),
					eq(onboardingDocumentRequest.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: docRequest.onboardingId,
			kind: "document_uploaded",
			summary: `Document uploaded: ${docRequest.documentType}`,
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_document_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: docRequest.status, newValue: "uploaded" },
			],
		});
		return { id: input.id };
	});

const documentRequestsApprove = authorizedProcedure(
	"onboarding",
	"approve_document"
)
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const docRequest = await verifyDocumentRequest(orgId(context), input.id);
		const reviewedAt = new Date();
		await db
			.update(onboardingDocumentRequest)
			.set({
				status: "approved",
				reviewedByUserId: actorId(context),
				reviewedAt,
				updatedAt: reviewedAt,
			})
			.where(
				and(
					eq(onboardingDocumentRequest.id, input.id),
					eq(onboardingDocumentRequest.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_document_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: docRequest.status, newValue: "approved" },
			],
		});
		return { id: input.id };
	});

const documentRequestsReject = authorizedProcedure(
	"onboarding",
	"approve_document"
)
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const docRequest = await verifyDocumentRequest(orgId(context), input.id);
		const reviewedAt = new Date();
		await db
			.update(onboardingDocumentRequest)
			.set({
				status: "rejected",
				rejectionReason: input.reason,
				reviewedByUserId: actorId(context),
				reviewedAt,
				updatedAt: reviewedAt,
			})
			.where(
				and(
					eq(onboardingDocumentRequest.id, input.id),
					eq(onboardingDocumentRequest.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_document_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: docRequest.status, newValue: "rejected" },
			],
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ACKNOWLEDGEMENTS
// ════════════════════════════════════════════════════════════════════

const acknowledgementsList = authorizedProcedure("onboarding", "read")
	.input(z.object({ onboardingId: z.string() }))
	.handler(async ({ context, input }) => {
		const onboarding = await verifyOnboarding(
			orgId(context),
			input.onboardingId
		);
		await assertCanViewOnboarding(context, onboarding);
		return await db
			.select()
			.from(onboardingAcknowledgement)
			.where(
				and(
					eq(onboardingAcknowledgement.onboardingId, input.onboardingId),
					eq(onboardingAcknowledgement.organizationId, orgId(context))
				)
			)
			.orderBy(desc(onboardingAcknowledgement.createdAt));
	});

const acknowledgementsCreate = authorizedProcedure("onboarding", "create")
	.input(
		z.object({
			onboardingId: z.string(),
			policyName: z.string().min(1),
			policyVersion: z.string().optional(),
			policyUrl: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageOnboarding(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyOnboarding(orgId(context), input.onboardingId);
		const id = createId();
		await db.insert(onboardingAcknowledgement).values({
			id,
			organizationId: orgId(context),
			onboardingId: input.onboardingId,
			policyName: input.policyName,
			policyVersion: input.policyVersion ?? null,
			policyUrl: input.policyUrl ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_acknowledgement",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const acknowledgementsSign = authorizedProcedure(
	"onboarding",
	"sign_acknowledgement"
)
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const ack = await verifyAcknowledgement(orgId(context), input.id);
		const onboarding = await verifyOnboarding(orgId(context), ack.onboardingId);
		// The new hire signs their own; HR/admin may sign on record.
		await assertCanViewOnboarding(context, onboarding);
		if (ack.acknowledgedAt) {
			throw new ORPCError("CONFLICT", {
				message: "This policy has already been acknowledged.",
			});
		}
		await db
			.update(onboardingAcknowledgement)
			.set({
				acknowledgedAt: new Date(),
				acknowledgedByUserId: actorId(context),
			})
			.where(
				and(
					eq(onboardingAcknowledgement.id, input.id),
					eq(onboardingAcknowledgement.organizationId, orgId(context))
				)
			);
		await logActivity({
			organizationId: orgId(context),
			onboardingId: ack.onboardingId,
			kind: "comment",
			summary: `Policy acknowledged: ${ack.policyName}`,
			actorUserId: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "onboarding_acknowledgement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { signed: true },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ACTIVITY
// ════════════════════════════════════════════════════════════════════

const activityList = authorizedProcedure("onboarding", "read")
	.input(z.object({ onboardingId: z.string() }))
	.handler(async ({ context, input }) => {
		const onboarding = await verifyOnboarding(
			orgId(context),
			input.onboardingId
		);
		await assertCanViewOnboarding(context, onboarding);
		return await db
			.select()
			.from(onboardingActivity)
			.where(
				and(
					eq(onboardingActivity.onboardingId, input.onboardingId),
					eq(onboardingActivity.organizationId, orgId(context))
				)
			)
			.orderBy(desc(onboardingActivity.createdAt));
	});

// ════════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════════

export const onboardingRouter = {
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
	employeeOnboarding: {
		list: employeeOnboardingList,
		getById: employeeOnboardingGetById,
		getByEmployeeId: employeeOnboardingGetByEmployeeId,
		mine: employeeOnboardingMine,
		start: employeeOnboardingStart,
		cancel: employeeOnboardingCancel,
		complete: employeeOnboardingComplete,
	},
	tasks: {
		list: tasksList,
		getById: tasksGetById,
		update: tasksUpdate,
		complete: tasksComplete,
		skip: tasksSkip,
		reassign: tasksReassign,
	},
	documentRequests: {
		list: documentRequestsList,
		create: documentRequestsCreate,
		markUploaded: documentRequestsMarkUploaded,
		approve: documentRequestsApprove,
		reject: documentRequestsReject,
	},
	acknowledgements: {
		list: acknowledgementsList,
		create: acknowledgementsCreate,
		sign: acknowledgementsSign,
	},
	activity: {
		list: activityList,
	},
};
