// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar lifecycle-stage handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Lifecycle oRPC router — disciplinary cases, employee transfers, resignations.
 *
 * Scope (per docs/architecture/lifecycle-implementation-plan.md §5):
 *   disciplinary  categories.{list,create,archive} · actions.{list,create,archive} ·
 *                 records.{list,getById,create,requestExplanation,submitExplanation,
 *                          takeAction,appeal,resolveAppeal,close,update}
 *   transfers     list / getById / create / submit / approve / reject / cancel / execute
 *   resignations  list / getById / create / submit / approveManager / approveHr /
 *                 handoffToOffboarding / withdraw / reject
 *
 * AC consumed: the EXISTING `transfer` + `resignation` resources (lifecycle is
 * their first consumer) + the NEW `disciplinary` resource.
 *
 * CENTRAL GUARDRAIL (mirrors Helpdesk/Projects/Performance/CRM): every
 * db.insert/update/delete in this file targets a `disciplinary_*` /
 * `employee_transfer` / `employee_work_info_history` / `resignation_request`
 * table, the audit_event log, and EXACTLY ONE sanctioned `offboardingCase`
 * CREATION in handoffToOffboarding. There is NO write to payslip / payroll /
 * attendance / contract / leave / employeeWorkInfo, and NO mutation of existing
 * offboarding clearance rows. Cross-module link ids (offboardingCaseId, the
 * department/position/role/manager destinations) are tenant-verified on write
 * and read-only thereafter.
 *
 * THREE design rules from the spec:
 *   1. A transfer EXECUTES by writing an effective-dated history window into
 *      employee_work_info_history (resolved by resolveAsOf) and closing the prior
 *      window's effectiveTo — it NEVER overwrites employeeWorkInfo (the v1 bug).
 *   2. Resignation is the intent-to-leave REQUEST; on HR handoff it CREATES (or
 *      links) an offboardingCase and stamps offboardingCaseId — it never models
 *      clearance/settlement (Offboarding owns the exit execution).
 *   3. disciplinary_record.internalNote is HR-only — redacted server-side from the
 *      subject employee (returns a canViewInternalNote flag).
 */

import { db } from "@Heimdallone/db";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import {
	disciplinaryAction,
	disciplinaryCategory,
	disciplinaryRecord,
	employeeTransfer,
	employeeWorkInfoHistory,
	resignationRequest,
} from "@Heimdallone/db/schema/lifecycle";
import { offboardingCase } from "@Heimdallone/db/schema/offboarding";
import { resolveAsOf } from "@Heimdallone/payroll-engine/effective-dating";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import {
	canManageDisciplinary,
	canManageResignations,
	canManageTransfers,
	canProposeTransfer,
	seesAllDisciplinary,
	seesAllResignations,
	seesAllTransfers,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MAX_REFERENCE_ATTEMPTS = 6;
const LIST_LIMIT = 200;
const MIN_SEVERITY = 1;
const MAX_SEVERITY = 5;

// ─── Zod enums matching schema ───────────────────────────────────────────────

const DISCIPLINARY_OUTCOME = z.enum([
	"none",
	"verbal_warning",
	"written_warning",
	"final_warning",
	"suspension",
	"dismissal",
	"other",
]);
const TRANSFER_TYPE = z.enum([
	"department",
	"position",
	"role",
	"location",
	"manager",
	"combined",
]);
const RESIGNATION_REASON = z.enum([
	"resignation",
	"retirement",
	"end_of_contract",
	"mutual",
	"other",
]);

// ────────────────────────────────────────────────────────────────────
// Reference helper (MAX+1 with retry — mirrors helpdesk/performance)
// ────────────────────────────────────────────────────────────────────

function formatReference(prefix: string, n: number): string {
	return `${prefix}-${String(n).padStart(6, "0")}`;
}

type ReferencedTable =
	| typeof disciplinaryRecord
	| typeof employeeTransfer
	| typeof resignationRequest;

async function nextReferenceNumber(
	oid: string,
	table: ReferencedTable,
	prefix: string
): Promise<number> {
	const [row] = await db
		.select({ ref: max(table.reference) })
		.from(table)
		.where(eq(table.organizationId, oid));
	const current = row?.ref ?? null;
	if (!current) {
		return 1;
	}
	const parsed = Number.parseInt(current.replace(`${prefix}-`, ""), 10);
	return Number.isNaN(parsed) ? 1 : parsed + 1;
}

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

/**
 * Employee ids a non-seesAll caller covers: themselves + (manager) direct
 * reports. Null if the caller has no employee profile (deny-by-default).
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
	const ids = new Set<string>([me.id]);
	if (callerRole === "manager") {
		const reports = await getDirectReportIds(me.id, oid);
		for (const id of reports) {
			ids.add(id);
		}
	}
	return [...ids];
}

/** Tenant-verify an employee belongs to the caller's org. */
async function assertEmployeeInOrg(oid: string, employeeId: string) {
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
		throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
	}
}

// ════════════════════════════════════════════════════════════════════
// DISCIPLINARY — categories
// ════════════════════════════════════════════════════════════════════

const categoriesList = authorizedProcedure("disciplinary", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		return await db
			.select({
				id: disciplinaryCategory.id,
				name: disciplinaryCategory.name,
				description: disciplinaryCategory.description,
				isArchived: disciplinaryCategory.isArchived,
			})
			.from(disciplinaryCategory)
			.where(
				and(
					eq(disciplinaryCategory.organizationId, oid),
					eq(disciplinaryCategory.isArchived, false),
					isNull(disciplinaryCategory.deletedAt)
				)
			)
			.orderBy(asc(disciplinaryCategory.name));
	}
);

const categoriesCreate = authorizedProcedure("disciplinary", "create")
	.input(
		z.object({
			name: z.string().min(1).max(200),
			description: z.string().max(1000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [created] = await db
			.insert(disciplinaryCategory)
			.values({
				organizationId: oid,
				name: input.name.trim(),
				description: input.description ?? null,
			})
			.returning({ id: disciplinaryCategory.id });
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_category",
			entityId: created.id,
			action: "create",
			actorId: actorId(context),
		});
		return { id: created.id };
	});

const categoriesArchive = authorizedProcedure("disciplinary", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.select({ id: disciplinaryCategory.id })
			.from(disciplinaryCategory)
			.where(
				and(
					eq(disciplinaryCategory.id, input.id),
					eq(disciplinaryCategory.organizationId, oid)
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Category not found." });
		}
		await db
			.update(disciplinaryCategory)
			.set({ isArchived: true })
			.where(
				and(
					eq(disciplinaryCategory.id, input.id),
					eq(disciplinaryCategory.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_category",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// DISCIPLINARY — actions (severity-ranked catalogue)
// ════════════════════════════════════════════════════════════════════

const actionsList = authorizedProcedure("disciplinary", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		return await db
			.select({
				id: disciplinaryAction.id,
				name: disciplinaryAction.name,
				description: disciplinaryAction.description,
				severityLevel: disciplinaryAction.severityLevel,
				outcome: disciplinaryAction.outcome,
				isArchived: disciplinaryAction.isArchived,
			})
			.from(disciplinaryAction)
			.where(
				and(
					eq(disciplinaryAction.organizationId, oid),
					eq(disciplinaryAction.isArchived, false),
					isNull(disciplinaryAction.deletedAt)
				)
			)
			.orderBy(
				asc(disciplinaryAction.severityLevel),
				asc(disciplinaryAction.name)
			);
	}
);

const actionsCreate = authorizedProcedure("disciplinary", "create")
	.input(
		z.object({
			name: z.string().min(1).max(200),
			description: z.string().max(1000).nullable().optional(),
			severityLevel: z.number().int().min(MIN_SEVERITY).max(MAX_SEVERITY),
			outcome: DISCIPLINARY_OUTCOME.default("other"),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [created] = await db
			.insert(disciplinaryAction)
			.values({
				organizationId: oid,
				name: input.name.trim(),
				description: input.description ?? null,
				severityLevel: input.severityLevel,
				outcome: input.outcome,
			})
			.returning({ id: disciplinaryAction.id });
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_action",
			entityId: created.id,
			action: "create",
			actorId: actorId(context),
		});
		return { id: created.id };
	});

const actionsArchive = authorizedProcedure("disciplinary", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.select({ id: disciplinaryAction.id })
			.from(disciplinaryAction)
			.where(
				and(
					eq(disciplinaryAction.id, input.id),
					eq(disciplinaryAction.organizationId, oid)
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Action not found." });
		}
		await db
			.update(disciplinaryAction)
			.set({ isArchived: true })
			.where(
				and(
					eq(disciplinaryAction.id, input.id),
					eq(disciplinaryAction.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_action",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// DISCIPLINARY — records (the case lifecycle)
// ════════════════════════════════════════════════════════════════════

const DISCIPLINARY_STATUS = z.enum([
	"draft",
	"explanation_requested",
	"explained",
	"action_taken",
	"appealed",
	"closed",
	"overturned",
	"withdrawn",
]);

/**
 * Load + scope-check a record. Returns the row plus whether the caller may see
 * the HR-only internalNote (HR/auditor; the subject employee never can).
 */
async function loadScopedRecord(
	oid: string,
	callerRole: string,
	userId: string,
	id: string
) {
	const [row] = await db
		.select()
		.from(disciplinaryRecord)
		.where(
			and(
				eq(disciplinaryRecord.id, id),
				eq(disciplinaryRecord.organizationId, oid),
				isNull(disciplinaryRecord.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Record not found." });
	}
	if (!seesAllDisciplinary(callerRole)) {
		const covered = await coveredEmployeeIds(oid, callerRole, userId);
		if (!covered?.includes(row.employeeId)) {
			throw new ORPCError("FORBIDDEN", { message: "Not permitted." });
		}
	}
	// internalNote is HR-only (the catalogue managers). Auditor reads it too;
	// the subject employee + a plain manager never do.
	const canViewInternalNote =
		canManageDisciplinary(callerRole) || callerRole === "auditor";
	return { row, canViewInternalNote };
}

const recordsList = authorizedProcedure("disciplinary", "read")
	.input(
		z
			.object({
				employeeId: z.string().optional(),
				status: DISCIPLINARY_STATUS.optional(),
				categoryId: z.string().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).default(LIST_LIMIT),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const conditions = [
			eq(disciplinaryRecord.organizationId, oid),
			isNull(disciplinaryRecord.deletedAt),
		];
		if (!seesAllDisciplinary(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered || covered.length === 0) {
				return [];
			}
			conditions.push(inArray(disciplinaryRecord.employeeId, covered));
		}
		if (input?.employeeId) {
			conditions.push(eq(disciplinaryRecord.employeeId, input.employeeId));
		}
		if (input?.status) {
			conditions.push(eq(disciplinaryRecord.status, input.status));
		}
		if (input?.categoryId) {
			conditions.push(eq(disciplinaryRecord.categoryId, input.categoryId));
		}
		const rows = await db
			.select({
				id: disciplinaryRecord.id,
				reference: disciplinaryRecord.reference,
				employeeId: disciplinaryRecord.employeeId,
				categoryId: disciplinaryRecord.categoryId,
				incidentDate: disciplinaryRecord.incidentDate,
				status: disciplinaryRecord.status,
				createdAt: disciplinaryRecord.createdAt,
			})
			.from(disciplinaryRecord)
			.where(and(...conditions))
			.orderBy(desc(disciplinaryRecord.createdAt))
			.limit(input?.limit ?? LIST_LIMIT);
		const names = await employeeNameMap(rows.map((r) => r.employeeId));
		return rows.map((r) => ({
			...r,
			employeeName: names.get(r.employeeId) ?? r.employeeId,
		}));
	});

const recordsGetById = authorizedProcedure("disciplinary", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const { row, canViewInternalNote } = await loadScopedRecord(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		const names = await employeeNameMap([row.employeeId]);
		// SERVER-SIDE redaction: strip the HR-only note for non-privileged callers.
		const { internalNote, ...rest } = row;
		return {
			...rest,
			employeeName: names.get(row.employeeId) ?? row.employeeId,
			internalNote: canViewInternalNote ? internalNote : null,
			canViewInternalNote,
		};
	});

const recordsCreate = authorizedProcedure("disciplinary", "create")
	.input(
		z.object({
			employeeId: z.string(),
			categoryId: z.string().nullable().optional(),
			incidentDate: z.string(),
			description: z.string().min(1).max(5000),
			internalNote: z.string().max(5000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await assertEmployeeInOrg(oid, input.employeeId);
		let lastError: unknown;
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const n = await nextReferenceNumber(oid, disciplinaryRecord, "DISC");
			try {
				const [created] = await db
					.insert(disciplinaryRecord)
					.values({
						organizationId: oid,
						reference: formatReference("DISC", n),
						employeeId: input.employeeId,
						categoryId: input.categoryId ?? null,
						incidentDate: new Date(input.incidentDate),
						description: input.description,
						internalNote: input.internalNote ?? null,
						reportedByUserId: actorId(context),
						status: "draft",
					})
					.returning({ id: disciplinaryRecord.id });
				await createAuditEvent(db, {
					organizationId: oid,
					entityType: "disciplinary_record",
					entityId: created.id,
					action: "create",
					actorId: actorId(context),
				});
				return { id: created.id };
			} catch (err) {
				lastError = err;
			}
		}
		throw new ORPCError("CONFLICT", {
			message: "Could not allocate a reference. Try again.",
			cause: lastError,
		});
	});

async function loadRecordForWrite(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(disciplinaryRecord)
		.where(
			and(
				eq(disciplinaryRecord.id, id),
				eq(disciplinaryRecord.organizationId, oid),
				isNull(disciplinaryRecord.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Record not found." });
	}
	return row;
}

const recordsRequestExplanation = authorizedProcedure("disciplinary", "act")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadRecordForWrite(oid, input.id);
		if (row.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a draft record can request an explanation.",
			});
		}
		await db
			.update(disciplinaryRecord)
			.set({ status: "explanation_requested" })
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "explanation_requested" },
		});
		return { id: input.id };
	});

const recordsSubmitExplanation = authorizedProcedure("disciplinary", "explain")
	.input(z.object({ id: z.string(), explanation: z.string().min(1).max(5000) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const row = await loadRecordForWrite(oid, input.id);
		// Employee may submit only for their OWN record; HR may submit on behalf.
		if (!canManageDisciplinary(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me || me.id !== row.employeeId) {
				throw new ORPCError("FORBIDDEN", { message: "Not your record." });
			}
		}
		if (row.status !== "draft" && row.status !== "explanation_requested") {
			throw new ORPCError("BAD_REQUEST", {
				message: "An explanation cannot be submitted at this stage.",
			});
		}
		await db
			.update(disciplinaryRecord)
			.set({
				employeeExplanation: input.explanation,
				employeeExplanationSubmittedAt: new Date(),
				status: "explained",
			})
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "explained" },
		});
		return { id: input.id };
	});

const recordsTakeAction = authorizedProcedure("disciplinary", "act")
	.input(
		z.object({
			id: z.string(),
			finalActionId: z.string().nullable().optional(),
			finalActionNotes: z.string().max(5000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadRecordForWrite(oid, input.id);
		if (row.status !== "explained" && row.status !== "explanation_requested") {
			throw new ORPCError("BAD_REQUEST", {
				message: "An action can only be recorded after the explanation stage.",
			});
		}
		if (input.finalActionId) {
			const [action] = await db
				.select({ id: disciplinaryAction.id })
				.from(disciplinaryAction)
				.where(
					and(
						eq(disciplinaryAction.id, input.finalActionId),
						eq(disciplinaryAction.organizationId, oid)
					)
				)
				.limit(1);
			if (!action) {
				throw new ORPCError("NOT_FOUND", { message: "Action not found." });
			}
		}
		await db
			.update(disciplinaryRecord)
			.set({
				finalActionId: input.finalActionId ?? null,
				finalActionNotes: input.finalActionNotes ?? null,
				finalActionTakenAt: new Date(),
				finalActionByUserId: actorId(context),
				status: "action_taken",
			})
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "action_taken" },
		});
		return { id: input.id };
	});

const recordsAppeal = authorizedProcedure("disciplinary", "appeal")
	.input(z.object({ id: z.string(), appealText: z.string().min(1).max(5000) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const row = await loadRecordForWrite(oid, input.id);
		// Appeal is a self-service action — only the subject employee (or HR).
		if (!canManageDisciplinary(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me || me.id !== row.employeeId) {
				throw new ORPCError("FORBIDDEN", { message: "Not your record." });
			}
		}
		if (row.status !== "action_taken") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a record with an action taken can be appealed.",
			});
		}
		await db
			.update(disciplinaryRecord)
			.set({
				appealText: input.appealText,
				appealSubmittedAt: new Date(),
				status: "appealed",
			})
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "appealed" },
		});
		return { id: input.id };
	});

const recordsResolveAppeal = authorizedProcedure("disciplinary", "close")
	.input(
		z.object({
			id: z.string(),
			uphold: z.boolean(),
			appealOutcome: z.string().max(2000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadRecordForWrite(oid, input.id);
		if (row.status !== "appealed") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only an appealed record can be resolved.",
			});
		}
		// uphold = the original action stands (closed); !uphold = overturned.
		const nextStatus = input.uphold ? "closed" : "overturned";
		await db
			.update(disciplinaryRecord)
			.set({
				status: nextStatus,
				appealOutcome: input.appealOutcome ?? null,
				appealResolvedAt: new Date(),
				appealResolvedByUserId: actorId(context),
			})
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: nextStatus },
		});
		return { id: input.id, status: nextStatus };
	});

const recordsClose = authorizedProcedure("disciplinary", "close")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadRecordForWrite(oid, input.id);
		if (row.status !== "action_taken") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a record with an action taken can be closed directly.",
			});
		}
		await db
			.update(disciplinaryRecord)
			.set({ status: "closed" })
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "closed" },
		});
		return { id: input.id };
	});

const DISCIPLINARY_TERMINAL = new Set(["closed", "overturned", "withdrawn"]);

const recordsUpdate = authorizedProcedure("disciplinary", "create")
	.input(
		z.object({
			id: z.string(),
			description: z.string().min(1).max(5000).optional(),
			categoryId: z.string().nullable().optional(),
			internalNote: z.string().max(5000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadRecordForWrite(oid, input.id);
		if (DISCIPLINARY_TERMINAL.has(row.status)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A resolved record cannot be edited.",
			});
		}
		await db
			.update(disciplinaryRecord)
			.set({
				description: input.description,
				categoryId:
					input.categoryId === undefined ? undefined : input.categoryId,
				internalNote:
					input.internalNote === undefined ? undefined : input.internalNote,
			})
			.where(eq(disciplinaryRecord.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "disciplinary_record",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// TRANSFERS — effective-dated move requests
// ════════════════════════════════════════════════════════════════════

const TRANSFER_STATUS = z.enum([
	"draft",
	"submitted",
	"approved",
	"rejected",
	"scheduled",
	"effective",
	"cancelled",
]);

const transfersList = authorizedProcedure("transfer", "read")
	.input(
		z
			.object({
				employeeId: z.string().optional(),
				status: TRANSFER_STATUS.optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).default(LIST_LIMIT),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const conditions = [
			eq(employeeTransfer.organizationId, oid),
			isNull(employeeTransfer.deletedAt),
		];
		if (!seesAllTransfers(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered || covered.length === 0) {
				return [];
			}
			conditions.push(inArray(employeeTransfer.employeeId, covered));
		}
		if (input?.employeeId) {
			conditions.push(eq(employeeTransfer.employeeId, input.employeeId));
		}
		if (input?.status) {
			conditions.push(eq(employeeTransfer.status, input.status));
		}
		const rows = await db
			.select({
				id: employeeTransfer.id,
				reference: employeeTransfer.reference,
				employeeId: employeeTransfer.employeeId,
				transferType: employeeTransfer.transferType,
				status: employeeTransfer.status,
				effectiveFrom: employeeTransfer.effectiveFrom,
				createdAt: employeeTransfer.createdAt,
			})
			.from(employeeTransfer)
			.where(and(...conditions))
			.orderBy(desc(employeeTransfer.createdAt))
			.limit(input?.limit ?? LIST_LIMIT);
		const names = await employeeNameMap(rows.map((r) => r.employeeId));
		return rows.map((r) => ({
			...r,
			employeeName: names.get(r.employeeId) ?? r.employeeId,
		}));
	});

async function loadScopedTransfer(
	oid: string,
	callerRole: string,
	userId: string,
	id: string
) {
	const [row] = await db
		.select()
		.from(employeeTransfer)
		.where(
			and(
				eq(employeeTransfer.id, id),
				eq(employeeTransfer.organizationId, oid),
				isNull(employeeTransfer.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Transfer not found." });
	}
	if (!seesAllTransfers(callerRole)) {
		const covered = await coveredEmployeeIds(oid, callerRole, userId);
		if (!covered?.includes(row.employeeId)) {
			throw new ORPCError("FORBIDDEN", { message: "Not permitted." });
		}
	}
	return row;
}

const transfersGetById = authorizedProcedure("transfer", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedTransfer(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		const names = await employeeNameMap([
			row.employeeId,
			row.toReportingManagerId,
			row.fromReportingManagerId,
		]);
		return {
			...row,
			employeeName: names.get(row.employeeId) ?? row.employeeId,
		};
	});

// Tenant-verify a destination id (department/position/role/manager) belongs to
// the caller's org. SELECT-only — these are read-only links, never mutated.
async function assertDestinationsInOrg(
	oid: string,
	input: {
		toReportingManagerId?: string | null;
	}
) {
	if (input.toReportingManagerId) {
		await assertEmployeeInOrg(oid, input.toReportingManagerId);
	}
}

const transferDestination = z.object({
	toDepartmentId: z.string().nullable().optional(),
	toJobPositionId: z.string().nullable().optional(),
	toJobRoleId: z.string().nullable().optional(),
	toReportingManagerId: z.string().nullable().optional(),
	toWorkLocation: z.string().max(300).nullable().optional(),
});

function hasAnyDestination(d: z.infer<typeof transferDestination>): boolean {
	return Boolean(
		d.toDepartmentId ||
			d.toJobPositionId ||
			d.toJobRoleId ||
			d.toReportingManagerId ||
			d.toWorkLocation
	);
}

const transfersCreate = authorizedProcedure("transfer", "create")
	.input(
		transferDestination.extend({
			employeeId: z.string(),
			transferType: TRANSFER_TYPE,
			effectiveFrom: z.string(),
			reason: z.string().max(2000).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		await assertEmployeeInOrg(oid, input.employeeId);
		// Managers may propose ONLY for their direct reports.
		if (!canManageTransfers(callerRole) && canProposeTransfer(callerRole)) {
			const covered = await coveredEmployeeIds(
				oid,
				callerRole,
				actorId(context)
			);
			if (!covered?.includes(input.employeeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only propose transfers for your direct reports.",
				});
			}
		}
		if (!hasAnyDestination(input)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A transfer must change at least one field.",
			});
		}
		await assertDestinationsInOrg(oid, input);
		let lastError: unknown;
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const n = await nextReferenceNumber(oid, employeeTransfer, "TRF");
			try {
				const [created] = await db
					.insert(employeeTransfer)
					.values({
						organizationId: oid,
						reference: formatReference("TRF", n),
						employeeId: input.employeeId,
						transferType: input.transferType,
						status: "draft",
						effectiveFrom: new Date(input.effectiveFrom),
						toDepartmentId: input.toDepartmentId ?? null,
						toJobPositionId: input.toJobPositionId ?? null,
						toJobRoleId: input.toJobRoleId ?? null,
						toReportingManagerId: input.toReportingManagerId ?? null,
						toWorkLocation: input.toWorkLocation ?? null,
						reason: input.reason ?? null,
					})
					.returning({ id: employeeTransfer.id });
				await createAuditEvent(db, {
					organizationId: oid,
					entityType: "employee_transfer",
					entityId: created.id,
					action: "create",
					actorId: actorId(context),
				});
				return { id: created.id };
			} catch (err) {
				lastError = err;
			}
		}
		throw new ORPCError("CONFLICT", {
			message: "Could not allocate a reference. Try again.",
			cause: lastError,
		});
	});

const transfersSubmit = authorizedProcedure("transfer", "submit")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedTransfer(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (row.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a draft transfer can be submitted.",
			});
		}
		await db
			.update(employeeTransfer)
			.set({
				status: "submitted",
				submittedByUserId: actorId(context),
				submittedAt: new Date(),
			})
			.where(eq(employeeTransfer.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_transfer",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "submitted" },
		});
		return { id: input.id };
	});

const isPastOrToday = (d: Date): boolean => {
	const today = new Date();
	const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	const b = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate()
	);
	return a <= b;
};

/**
 * Execute a transfer: write an effective-dated history WINDOW for the employee
 * and close the prior open window's effectiveTo. This is the v1-bug avoidance —
 * the current position resolves by date via resolveAsOf, NOT a destructive
 * UPDATE of employeeWorkInfo. Runs inside the caller's transaction.
 */
async function writeHistoryWindow(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	oid: string,
	transfer: typeof employeeTransfer.$inferSelect
) {
	const effFrom = transfer.effectiveFrom;
	// Close the latest open window that starts before this one.
	const prior = await tx
		.select({
			id: employeeWorkInfoHistory.id,
			effectiveFrom: employeeWorkInfoHistory.effectiveFrom,
			effectiveTo: employeeWorkInfoHistory.effectiveTo,
		})
		.from(employeeWorkInfoHistory)
		.where(
			and(
				eq(employeeWorkInfoHistory.organizationId, oid),
				eq(employeeWorkInfoHistory.employeeId, transfer.employeeId),
				isNull(employeeWorkInfoHistory.effectiveTo)
			)
		);
	const openToClose = resolveAsOf(
		prior.map((p) => ({
			...p,
			effectiveFrom: p.effectiveFrom,
			effectiveTo: p.effectiveTo,
		})),
		effFrom
	);
	if (openToClose) {
		await tx
			.update(employeeWorkInfoHistory)
			.set({ effectiveTo: effFrom })
			.where(eq(employeeWorkInfoHistory.id, openToClose.id));
	}
	await tx.insert(employeeWorkInfoHistory).values({
		organizationId: oid,
		employeeId: transfer.employeeId,
		effectiveFrom: effFrom,
		departmentId: transfer.toDepartmentId ?? null,
		jobPositionId: transfer.toJobPositionId ?? null,
		jobRoleId: transfer.toJobRoleId ?? null,
		reportingManagerId: transfer.toReportingManagerId ?? null,
		workLocation: transfer.toWorkLocation ?? null,
		sourceTransferId: transfer.id,
	});
}

const transfersApprove = authorizedProcedure("transfer", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedTransfer(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (row.status !== "submitted") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a submitted transfer can be approved.",
			});
		}
		const executeNow = isPastOrToday(row.effectiveFrom);
		await db.transaction(async (tx) => {
			await tx
				.update(employeeTransfer)
				.set({
					status: executeNow ? "effective" : "scheduled",
					approvedByUserId: actorId(context),
					approvedAt: new Date(),
					executedAt: executeNow ? new Date() : null,
				})
				.where(eq(employeeTransfer.id, input.id));
			if (executeNow) {
				await writeHistoryWindow(tx, oid, row);
			}
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_transfer",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: executeNow ? "effective" : "scheduled" },
		});
		return { id: input.id, executed: executeNow };
	});

const transfersReject = authorizedProcedure("transfer", "approve")
	.input(z.object({ id: z.string(), rejectionReason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedTransfer(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (row.status !== "submitted" && row.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a draft or submitted transfer can be rejected.",
			});
		}
		await db
			.update(employeeTransfer)
			.set({ status: "rejected", rejectionReason: input.rejectionReason })
			.where(eq(employeeTransfer.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_transfer",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "rejected" },
		});
		return { id: input.id };
	});

const TRANSFER_CANCELLABLE = new Set([
	"draft",
	"submitted",
	"approved",
	"scheduled",
]);

const transfersCancel = authorizedProcedure("transfer", "cancel")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedTransfer(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (!TRANSFER_CANCELLABLE.has(row.status)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "An effective or already-closed transfer cannot be cancelled.",
			});
		}
		await db
			.update(employeeTransfer)
			.set({ status: "cancelled", cancelledAt: new Date() })
			.where(eq(employeeTransfer.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_transfer",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "cancelled" },
		});
		return { id: input.id };
	});

// Activate scheduled transfers whose effectiveFrom <= today. Optional id =
// single activation; omitted = idempotent sweep. The dated window is the source
// of truth; this only flips the cosmetic status + writes the window + audit.
const transfersExecute = authorizedProcedure("transfer", "execute")
	.input(z.object({ id: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [
			eq(employeeTransfer.organizationId, oid),
			eq(employeeTransfer.status, "scheduled"),
			isNull(employeeTransfer.deletedAt),
		];
		if (input?.id) {
			conditions.push(eq(employeeTransfer.id, input.id));
		}
		const due = await db
			.select()
			.from(employeeTransfer)
			.where(and(...conditions));
		const activated: string[] = [];
		for (const row of due) {
			if (!isPastOrToday(row.effectiveFrom)) {
				continue;
			}
			await db.transaction(async (tx) => {
				await tx
					.update(employeeTransfer)
					.set({ status: "effective", executedAt: new Date() })
					.where(eq(employeeTransfer.id, row.id));
				await writeHistoryWindow(tx, oid, row);
			});
			await createAuditEvent(db, {
				organizationId: oid,
				entityType: "employee_transfer",
				entityId: row.id,
				action: "update",
				actorId: actorId(context),
				metadata: { transition: "effective" },
			});
			activated.push(row.id);
		}
		return { activated };
	});

// ════════════════════════════════════════════════════════════════════
// RESIGNATIONS — employee-initiated intent to leave
// ════════════════════════════════════════════════════════════════════

const RESIGNATION_STATUS = z.enum([
	"draft",
	"submitted",
	"manager_approved",
	"hr_approved",
	"handed_off",
	"withdrawn",
	"rejected",
]);

const resignationsList = authorizedProcedure("resignation", "read")
	.input(
		z
			.object({
				status: RESIGNATION_STATUS.optional(),
				mine: z.boolean().optional(),
				limit: z.number().int().min(1).max(LIST_LIMIT).default(LIST_LIMIT),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const conditions = [
			eq(resignationRequest.organizationId, oid),
			isNull(resignationRequest.deletedAt),
		];
		// mine:true forces self-scope for ANY role (the "My resignation" surface).
		const forceSelf = input?.mine === true;
		if (forceSelf || !seesAllResignations(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				return [];
			}
			if (forceSelf) {
				conditions.push(eq(resignationRequest.employeeId, me.id));
			} else {
				const covered = await coveredEmployeeIds(
					oid,
					callerRole,
					actorId(context)
				);
				if (!covered || covered.length === 0) {
					return [];
				}
				conditions.push(inArray(resignationRequest.employeeId, covered));
			}
		}
		if (input?.status) {
			conditions.push(eq(resignationRequest.status, input.status));
		}
		const rows = await db
			.select({
				id: resignationRequest.id,
				reference: resignationRequest.reference,
				employeeId: resignationRequest.employeeId,
				status: resignationRequest.status,
				reasonCategory: resignationRequest.reasonCategory,
				requestedLastWorkingDate: resignationRequest.requestedLastWorkingDate,
				offboardingCaseId: resignationRequest.offboardingCaseId,
				createdAt: resignationRequest.createdAt,
			})
			.from(resignationRequest)
			.where(and(...conditions))
			.orderBy(desc(resignationRequest.createdAt))
			.limit(input?.limit ?? LIST_LIMIT);
		const names = await employeeNameMap(rows.map((r) => r.employeeId));
		return rows.map((r) => ({
			...r,
			employeeName: names.get(r.employeeId) ?? r.employeeId,
		}));
	});

async function loadScopedResignation(
	oid: string,
	callerRole: string,
	userId: string,
	id: string
) {
	const [row] = await db
		.select()
		.from(resignationRequest)
		.where(
			and(
				eq(resignationRequest.id, id),
				eq(resignationRequest.organizationId, oid),
				isNull(resignationRequest.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Resignation not found." });
	}
	if (!seesAllResignations(callerRole)) {
		const covered = await coveredEmployeeIds(oid, callerRole, userId);
		if (!covered?.includes(row.employeeId)) {
			throw new ORPCError("FORBIDDEN", { message: "Not permitted." });
		}
	}
	return row;
}

const resignationsGetById = authorizedProcedure("resignation", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedResignation(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		const names = await employeeNameMap([row.employeeId]);
		// Resolve the linked offboarding case into a READ-ONLY summary — never the
		// checklist. Offboarding owns the exit execution.
		let offboardingSummary: {
			id: string;
			status: string;
			lastWorkingDay: Date | null;
		} | null = null;
		if (row.offboardingCaseId) {
			const [c] = await db
				.select({
					id: offboardingCase.id,
					status: offboardingCase.status,
					lastWorkingDay: offboardingCase.lastWorkingDay,
				})
				.from(offboardingCase)
				.where(
					and(
						eq(offboardingCase.id, row.offboardingCaseId),
						eq(offboardingCase.organizationId, oid)
					)
				)
				.limit(1);
			offboardingSummary = c ?? null;
		}
		return {
			...row,
			employeeName: names.get(row.employeeId) ?? row.employeeId,
			offboardingSummary,
		};
	});

const resignationsCreate = authorizedProcedure("resignation", "create")
	.input(
		z.object({
			employeeId: z.string().optional(),
			reasonCategory: RESIGNATION_REASON,
			reasonNotes: z.string().max(2000).nullable().optional(),
			requestedLastWorkingDate: z.string(),
			noticeStartDate: z.string().nullable().optional(),
			submit: z.boolean().optional().default(true),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		// Self-service: an employee resigns for THEMSELVES; HR may create for any.
		let targetEmployeeId = input.employeeId ?? null;
		if (!canManageResignations(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me) {
				throw new ORPCError("FORBIDDEN", {
					message: "No employee profile for the caller.",
				});
			}
			// Non-HR can only file their own resignation.
			if (targetEmployeeId && targetEmployeeId !== me.id) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only file your own resignation.",
				});
			}
			targetEmployeeId = me.id;
		}
		if (!targetEmployeeId) {
			throw new ORPCError("BAD_REQUEST", { message: "employeeId required." });
		}
		await assertEmployeeInOrg(oid, targetEmployeeId);
		let lastError: unknown;
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const n = await nextReferenceNumber(oid, resignationRequest, "RES");
			try {
				const [created] = await db
					.insert(resignationRequest)
					.values({
						organizationId: oid,
						reference: formatReference("RES", n),
						employeeId: targetEmployeeId,
						status: input.submit ? "submitted" : "draft",
						reasonCategory: input.reasonCategory,
						reasonNotes: input.reasonNotes ?? null,
						requestedLastWorkingDate: new Date(input.requestedLastWorkingDate),
						noticeStartDate: input.noticeStartDate
							? new Date(input.noticeStartDate)
							: null,
						submittedAt: input.submit ? new Date() : null,
						createdByUserId: actorId(context),
					})
					.returning({ id: resignationRequest.id });
				await createAuditEvent(db, {
					organizationId: oid,
					entityType: "resignation_request",
					entityId: created.id,
					action: "create",
					actorId: actorId(context),
					metadata: { submitted: input.submit },
				});
				return { id: created.id };
			} catch (err) {
				lastError = err;
			}
		}
		throw new ORPCError("CONFLICT", {
			message: "Could not allocate a reference. Try again.",
			cause: lastError,
		});
	});

const resignationsSubmit = authorizedProcedure("resignation", "create")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const row = await loadScopedResignation(
			oid,
			callerRole,
			actorId(context),
			input.id
		);
		// Only the owner (or HR) submits a draft.
		if (!canManageResignations(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me || me.id !== row.employeeId) {
				throw new ORPCError("FORBIDDEN", { message: "Not your request." });
			}
		}
		if (row.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a draft resignation can be submitted.",
			});
		}
		await db
			.update(resignationRequest)
			.set({ status: "submitted", submittedAt: new Date() })
			.where(eq(resignationRequest.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "submitted" },
		});
		return { id: input.id };
	});

const resignationsApproveManager = authorizedProcedure("resignation", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		// loadScopedResignation enforces manager→report scope.
		const row = await loadScopedResignation(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (row.status !== "submitted") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a submitted resignation can be approved by a manager.",
			});
		}
		await db
			.update(resignationRequest)
			.set({
				status: "manager_approved",
				managerApprovedByUserId: actorId(context),
				managerApprovedAt: new Date(),
			})
			.where(eq(resignationRequest.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "manager_approved" },
		});
		return { id: input.id };
	});

const resignationsApproveHr = authorizedProcedure("resignation", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		if (!canManageResignations(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "HR approval only." });
		}
		const row = await loadScopedResignation(
			oid,
			callerRole,
			actorId(context),
			input.id
		);
		if (row.status !== "submitted" && row.status !== "manager_approved") {
			throw new ORPCError("BAD_REQUEST", {
				message: "This resignation is not awaiting HR approval.",
			});
		}
		await db
			.update(resignationRequest)
			.set({
				status: "hr_approved",
				hrApprovedByUserId: actorId(context),
				hrApprovedAt: new Date(),
			})
			.where(eq(resignationRequest.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "hr_approved" },
		});
		return { id: input.id };
	});

// The ONLY write that touches Offboarding — it CREATES (or links) a case and
// stamps offboardingCaseId. It NEVER mutates offboarding clearance state.
const resignationsHandoff = authorizedProcedure("resignation", "complete")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		if (!canManageResignations(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "HR handoff only." });
		}
		const row = await loadScopedResignation(
			oid,
			callerRole,
			actorId(context),
			input.id
		);
		if (row.status !== "hr_approved") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only an HR-approved resignation can be handed off.",
			});
		}
		if (row.offboardingCaseId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This resignation is already handed off.",
			});
		}
		const caseId = createId();
		await db.transaction(async (tx) => {
			await tx.insert(offboardingCase).values({
				id: caseId,
				organizationId: oid,
				employeeId: row.employeeId,
				exitType: "resignation",
				lastWorkingDay: row.requestedLastWorkingDate,
				status: "active",
				initiatedByUserId: actorId(context),
			});
			await tx
				.update(resignationRequest)
				.set({ status: "handed_off", offboardingCaseId: caseId })
				.where(eq(resignationRequest.id, input.id));
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "handed_off", offboardingCaseId: caseId },
		});
		return { id: input.id, offboardingCaseId: caseId };
	});

const RESIGNATION_WITHDRAWABLE = new Set([
	"draft",
	"submitted",
	"manager_approved",
	"hr_approved",
]);

const resignationsWithdraw = authorizedProcedure("resignation", "withdraw")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const callerRole = role(context);
		const row = await loadScopedResignation(
			oid,
			callerRole,
			actorId(context),
			input.id
		);
		// The subject employee (or HR) withdraws — and only before handoff.
		if (!canManageResignations(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me || me.id !== row.employeeId) {
				throw new ORPCError("FORBIDDEN", { message: "Not your request." });
			}
		}
		if (!RESIGNATION_WITHDRAWABLE.has(row.status)) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Once handed off to Offboarding, reverse the exit there — not here.",
			});
		}
		await db
			.update(resignationRequest)
			.set({ status: "withdrawn", withdrawnAt: new Date() })
			.where(eq(resignationRequest.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "withdrawn" },
		});
		return { id: input.id };
	});

const resignationsReject = authorizedProcedure("resignation", "approve")
	.input(z.object({ id: z.string(), rejectionReason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadScopedResignation(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (row.status !== "submitted" && row.status !== "manager_approved") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a pending resignation can be rejected.",
			});
		}
		await db
			.update(resignationRequest)
			.set({ status: "rejected", rejectionReason: input.rejectionReason })
			.where(eq(resignationRequest.id, input.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "resignation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "rejected" },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════

export const lifecycleRouter = {
	disciplinary: {
		categories: {
			list: categoriesList,
			create: categoriesCreate,
			archive: categoriesArchive,
		},
		actions: {
			list: actionsList,
			create: actionsCreate,
			archive: actionsArchive,
		},
		records: {
			list: recordsList,
			getById: recordsGetById,
			create: recordsCreate,
			requestExplanation: recordsRequestExplanation,
			submitExplanation: recordsSubmitExplanation,
			takeAction: recordsTakeAction,
			appeal: recordsAppeal,
			resolveAppeal: recordsResolveAppeal,
			close: recordsClose,
			update: recordsUpdate,
		},
	},
	transfers: {
		list: transfersList,
		getById: transfersGetById,
		create: transfersCreate,
		submit: transfersSubmit,
		approve: transfersApprove,
		reject: transfersReject,
		cancel: transfersCancel,
		execute: transfersExecute,
	},
	resignations: {
		list: resignationsList,
		getById: resignationsGetById,
		create: resignationsCreate,
		submit: resignationsSubmit,
		approveManager: resignationsApproveManager,
		approveHr: resignationsApproveHr,
		handoffToOffboarding: resignationsHandoff,
		withdraw: resignationsWithdraw,
		reject: resignationsReject,
	},
};
