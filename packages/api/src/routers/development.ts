// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar, independently-gated handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Development router — Training + Certifications + Skills matrix (Phase Dev).
 *
 * Surfaces (per docs/architecture/development-implementation-plan.md section 4):
 *   training       programs (list/getById/create/update/archive +
 *                  modules add/update/remove) + enrollments (list/listMine/
 *                  enroll/enrollSelf/updateProgress/complete/withdraw)
 *   certifications types (list/create/update/archive) + held creds (list/
 *                  listMine/record/recordSelf/update/revoke/scanExpiring)
 *   skills         categories + types (the proficiency ladders) + employee
 *                  levels (list/listMine/assess/assessSelf/remove/search)
 *
 * CENTRAL GUARDRAIL: every db write targets a development table + audit_event
 * ONLY — ZERO writes to employee, performance, recruitment, document or payroll
 * tables. `documentId` (Documents) and `linkedCandidateId` (Recruitment) are
 * tenant-verified SELECT-only and resolved read-only; never written back to the
 * foreign table. Certification expiry is DERIVED at read time
 * (utils/cert-expiry.ts), never stored.
 *
 * TWO-LAYER AUTHZ on every proc: the AC gate (development read/manage/
 * enroll_self/record_self) PLUS a handler-level scope/IDOR check. A manager's
 * `manage` writes are narrowed to their direct reports (option A). Self-service
 * procs FORCE employeeId = caller. The recruiter skills search returns AGGREGATE
 * counts only — no individual employee records.
 */

import { db } from "@Heimdallone/db";
import {
	certificationType,
	employeeCertification,
	employeeSkill,
	skillCategory,
	skillType,
	trainingCategory,
	trainingEnrollment,
	trainingModule,
	trainingProgram,
} from "@Heimdallone/db/schema/development";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { candidate } from "@Heimdallone/db/schema/recruitment";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	max,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	deriveCertExpiry,
	resolveReminderThresholds,
} from "../utils/cert-expiry";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { createNotifications } from "../utils/notifications";
import { canManageHR, seesAllDevelopment } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MAX_REFERENCE_ATTEMPTS = 6;
const LIST_LIMIT = 200;
const MONTHS_PER_YEAR = 12;

// Partial-update coercion helpers (avoid nested ternaries in `.set({...})`).
// undefined = "field omitted, leave column untouched"; null = "clear it".
function optionalNumericColumn(
	value: number | null | undefined
): string | null | undefined {
	if (value === undefined) {
		return;
	}
	return value === null ? null : String(value);
}

function optionalDateColumn(
	value: string | null | undefined
): Date | null | undefined {
	if (value === undefined) {
		return;
	}
	return value ? new Date(value) : null;
}

function certExpiryNotificationBody(
	daysUntilExpiry: number | null
): string | null {
	if (daysUntilExpiry == null) {
		return null;
	}
	return daysUntilExpiry < 0
		? `Expired ${Math.abs(daysUntilExpiry)} day(s) ago.`
		: `Expires in ${daysUntilExpiry} day(s).`;
}

// ─── Zod enums matching the schema ────────────────────────────────────────────

const PROGRAM_STATUS = z.enum(["draft", "active", "archived"]);
const DELIVERY = z.enum([
	"internal",
	"external",
	"online",
	"in_person",
	"blended",
]);
const ENROLLMENT_STATUS = z.enum([
	"enrolled",
	"in_progress",
	"completed",
	"failed",
	"withdrawn",
]);
const CERT_STATUS = z.enum(["active", "revoked", "superseded"]);

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
	const ids = [me.id];
	if (callerRole === "manager") {
		ids.push(...(await getDirectReportIds(me.id, oid)));
	}
	return ids;
}

/** Resolve the caller's own employee id, or throw if they have no profile. */
async function requireCurrentEmployeeId(
	oid: string,
	userId: string
): Promise<string> {
	const me = await resolveCurrentEmployee(oid, userId);
	if (!me) {
		throw new ORPCError("FORBIDDEN", {
			message: "No employee profile linked to your account.",
		});
	}
	return me.id;
}

/**
 * Assert a caller may act on `employeeId` for a manage/record write:
 *  - HR (canManageHR) may act on anyone in the tenant.
 *  - A manager may act only on themselves + direct reports.
 * Throws FORBIDDEN otherwise.
 */
async function assertManageScope(
	oid: string,
	callerRole: string,
	userId: string,
	employeeId: string
): Promise<void> {
	if (canManageHR(callerRole)) {
		return;
	}
	const covered = await coveredEmployeeIds(oid, callerRole, userId);
	if (!covered?.includes(employeeId)) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only manage your own direct reports.",
		});
	}
}

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every id input is checked here
// ────────────────────────────────────────────────────────────────────

type ProgramRow = typeof trainingProgram.$inferSelect;
type EnrollmentRow = typeof trainingEnrollment.$inferSelect;
type SkillTypeRow = typeof skillType.$inferSelect;
type EmployeeSkillRow = typeof employeeSkill.$inferSelect;
type EmployeeCertRow = typeof employeeCertification.$inferSelect;

async function verifyProgram(oid: string, id: string): Promise<ProgramRow> {
	const [row] = await db
		.select()
		.from(trainingProgram)
		.where(
			and(
				eq(trainingProgram.id, id),
				eq(trainingProgram.organizationId, oid),
				isNull(trainingProgram.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Training program not found.",
		});
	}
	return row;
}

async function verifyEnrollment(
	oid: string,
	id: string
): Promise<EnrollmentRow> {
	const [row] = await db
		.select()
		.from(trainingEnrollment)
		.where(
			and(
				eq(trainingEnrollment.id, id),
				eq(trainingEnrollment.organizationId, oid)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Enrollment not found." });
	}
	return row;
}

async function verifyCertType(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(certificationType)
		.where(
			and(
				eq(certificationType.id, id),
				eq(certificationType.organizationId, oid),
				isNull(certificationType.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Certification type not found.",
		});
	}
	return row;
}

async function verifyEmployeeCert(
	oid: string,
	id: string
): Promise<EmployeeCertRow> {
	const [row] = await db
		.select()
		.from(employeeCertification)
		.where(
			and(
				eq(employeeCertification.id, id),
				eq(employeeCertification.organizationId, oid),
				isNull(employeeCertification.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Certification not found." });
	}
	return row;
}

async function verifySkillCategory(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(skillCategory)
		.where(
			and(
				eq(skillCategory.id, id),
				eq(skillCategory.organizationId, oid),
				isNull(skillCategory.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Skill category not found." });
	}
	return row;
}

async function verifySkillType(oid: string, id: string): Promise<SkillTypeRow> {
	const [row] = await db
		.select()
		.from(skillType)
		.where(
			and(
				eq(skillType.id, id),
				eq(skillType.organizationId, oid),
				isNull(skillType.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Skill not found." });
	}
	return row;
}

async function verifyEmployeeSkill(
	oid: string,
	id: string
): Promise<EmployeeSkillRow> {
	const [row] = await db
		.select()
		.from(employeeSkill)
		.where(and(eq(employeeSkill.id, id), eq(employeeSkill.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Employee skill not found." });
	}
	return row;
}

/** Tenant-verify a soft `candidateId` ref (Recruitment) — SELECT only. */
async function verifyCandidateRef(
	oid: string,
	candidateId: string | null | undefined
): Promise<string | null> {
	if (!candidateId) {
		return null;
	}
	const [row] = await db
		.select({ id: candidate.id })
		.from(candidate)
		.where(
			and(eq(candidate.id, candidateId), eq(candidate.organizationId, oid))
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Linked candidate is not in this organization.",
		});
	}
	return row.id;
}

// ────────────────────────────────────────────────────────────────────
// Reference minting (TRN-000001) — max+1 with retry
// ────────────────────────────────────────────────────────────────────

const REFERENCE_PREFIX = "TRN-";
const REFERENCE_PAD = 6;

async function nextProgramReference(oid: string): Promise<string> {
	const [row] = await db
		.select({ maxRef: max(trainingProgram.reference) })
		.from(trainingProgram)
		.where(eq(trainingProgram.organizationId, oid));
	const current = row?.maxRef ?? null;
	const lastNumber = current
		? Number.parseInt(current.replace(REFERENCE_PREFIX, ""), 10) || 0
		: 0;
	return `${REFERENCE_PREFIX}${String(lastNumber + 1).padStart(REFERENCE_PAD, "0")}`;
}

// ────────────────────────────────────────────────────────────────────
// Skill proficiency resolution
// ────────────────────────────────────────────────────────────────────

/**
 * Resolve a proficiency label → ordinal against the skill type's ordered list.
 * Throws if the label isn't a valid level for the type.
 */
function resolveOrdinal(levels: string[], label: string): number {
	const ordinal = levels.indexOf(label);
	if (ordinal < 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `"${label}" is not a valid level for this skill.`,
		});
	}
	return ordinal;
}

// ════════════════════════════════════════════════════════════════════
// TRAINING — programs
// ════════════════════════════════════════════════════════════════════

const programsList = authorizedProcedure("development", "read")
	.input(
		z
			.object({
				status: PROGRAM_STATUS.optional(),
				categoryId: z.string().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [
			eq(trainingProgram.organizationId, oid),
			isNull(trainingProgram.deletedAt),
		];
		if (input?.status) {
			conditions.push(eq(trainingProgram.status, input.status));
		}
		if (input?.categoryId) {
			conditions.push(eq(trainingProgram.categoryId, input.categoryId));
		}
		return await db
			.select()
			.from(trainingProgram)
			.where(and(...conditions))
			.orderBy(desc(trainingProgram.createdAt))
			.limit(LIST_LIMIT);
	});

const programsGetById = authorizedProcedure("development", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const program = await verifyProgram(oid, input.id);
		const modules = await db
			.select()
			.from(trainingModule)
			.where(
				and(
					eq(trainingModule.programId, program.id),
					eq(trainingModule.organizationId, oid)
				)
			)
			.orderBy(asc(trainingModule.displayOrder));
		return { ...program, modules };
	});

const programWriteFields = z.object({
	name: z.string().min(1).max(300),
	description: z.string().nullable().optional(),
	categoryId: z.string().nullable().optional(),
	delivery: DELIVERY.optional(),
	provider: z.string().nullable().optional(),
	durationHours: z.number().nonnegative().nullable().optional(),
	passingScorePercent: z.number().int().min(0).max(100).nullable().optional(),
	maxAttempts: z.number().int().min(1).max(100).optional(),
	allowSelfEnroll: z.boolean().optional(),
	status: PROGRAM_STATUS.optional(),
});

const programsCreate = authorizedProcedure("development", "manage")
	.input(programWriteFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		if (input.categoryId) {
			// Tenant-verify the optional category FK.
			const [cat] = await db
				.select({ id: trainingCategory.id })
				.from(trainingCategory)
				.where(
					and(
						eq(trainingCategory.id, input.categoryId),
						eq(trainingCategory.organizationId, oid)
					)
				)
				.limit(1);
			if (!cat) {
				throw new ORPCError("BAD_REQUEST", { message: "Unknown category." });
			}
		}
		let lastError: unknown = null;
		for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
			const reference = await nextProgramReference(oid);
			const id = createId();
			try {
				await db.insert(trainingProgram).values({
					id,
					organizationId: oid,
					reference,
					name: input.name,
					description: input.description ?? null,
					categoryId: input.categoryId ?? null,
					delivery: input.delivery ?? "internal",
					provider: input.provider ?? null,
					durationHours:
						input.durationHours == null ? null : String(input.durationHours),
					passingScorePercent: input.passingScorePercent ?? null,
					maxAttempts: input.maxAttempts ?? 1,
					allowSelfEnroll: input.allowSelfEnroll ?? true,
					status: input.status ?? "draft",
				});
				await createAuditEvent(db, {
					organizationId: oid,
					entityType: "training_program",
					entityId: id,
					action: "create",
					actorId: actorId(context),
				});
				return { id, reference };
			} catch (err) {
				lastError = err;
			}
		}
		throw new ORPCError("CONFLICT", {
			message: "Could not allocate a program reference.",
			cause: lastError,
		});
	});

const programsUpdate = authorizedProcedure("development", "manage")
	.input(programWriteFields.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyProgram(oid, input.id);
		await db
			.update(trainingProgram)
			.set({
				name: input.name,
				description: input.description,
				categoryId: input.categoryId,
				delivery: input.delivery,
				provider: input.provider,
				durationHours: optionalNumericColumn(input.durationHours),
				passingScorePercent: input.passingScorePercent,
				maxAttempts: input.maxAttempts,
				allowSelfEnroll: input.allowSelfEnroll,
				status: input.status,
			})
			.where(
				and(
					eq(trainingProgram.id, input.id),
					eq(trainingProgram.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_program",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const programsArchive = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyProgram(oid, input.id);
		await db
			.update(trainingProgram)
			.set({ status: "archived", isArchived: true })
			.where(
				and(
					eq(trainingProgram.id, input.id),
					eq(trainingProgram.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_program",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ── training modules (optional, minimal) ──
const modulesAdd = authorizedProcedure("development", "manage")
	.input(
		z.object({
			programId: z.string(),
			title: z.string().min(1).max(300),
			content: z.string().nullable().optional(),
			displayOrder: z.number().int().min(0).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyProgram(oid, input.programId);
		const id = createId();
		await db.insert(trainingModule).values({
			id,
			organizationId: oid,
			programId: input.programId,
			title: input.title,
			content: input.content ?? null,
			displayOrder: input.displayOrder ?? 0,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_module",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const modulesUpdate = authorizedProcedure("development", "manage")
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).max(300).optional(),
			content: z.string().nullable().optional(),
			displayOrder: z.number().int().min(0).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [existing] = await db
			.select({ id: trainingModule.id })
			.from(trainingModule)
			.where(
				and(
					eq(trainingModule.id, input.id),
					eq(trainingModule.organizationId, oid)
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Module not found." });
		}
		await db
			.update(trainingModule)
			.set({
				title: input.title,
				content: input.content,
				displayOrder: input.displayOrder,
			})
			.where(
				and(
					eq(trainingModule.id, input.id),
					eq(trainingModule.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_module",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const modulesRemove = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [existing] = await db
			.select({ id: trainingModule.id })
			.from(trainingModule)
			.where(
				and(
					eq(trainingModule.id, input.id),
					eq(trainingModule.organizationId, oid)
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Module not found." });
		}
		await db
			.delete(trainingModule)
			.where(
				and(
					eq(trainingModule.id, input.id),
					eq(trainingModule.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_module",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// TRAINING — enrollments
// ════════════════════════════════════════════════════════════════════

async function listEnrollmentsFor(
	oid: string,
	employeeIds: string[] | "all",
	extra?: { programId?: string; status?: string }
) {
	const conditions = [eq(trainingEnrollment.organizationId, oid)];
	if (employeeIds !== "all") {
		if (employeeIds.length === 0) {
			return [];
		}
		conditions.push(inArray(trainingEnrollment.employeeId, employeeIds));
	}
	if (extra?.programId) {
		conditions.push(eq(trainingEnrollment.programId, extra.programId));
	}
	if (extra?.status) {
		conditions.push(
			eq(trainingEnrollment.status, extra.status as EnrollmentRow["status"])
		);
	}
	const rows = await db
		.select()
		.from(trainingEnrollment)
		.where(and(...conditions))
		.orderBy(desc(trainingEnrollment.createdAt))
		.limit(LIST_LIMIT);
	const names = await employeeNameMap(rows.map((r) => r.employeeId));
	return rows.map((r) => ({
		...r,
		employeeName: names.get(r.employeeId) ?? r.employeeId,
	}));
}

const enrollmentsList = authorizedProcedure("development", "read")
	.input(
		z
			.object({
				programId: z.string().optional(),
				status: ENROLLMENT_STATUS.optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const r = role(context);
		const extra = { programId: input?.programId, status: input?.status };
		if (seesAllDevelopment(r)) {
			return await listEnrollmentsFor(oid, "all", extra);
		}
		const covered = await coveredEmployeeIds(oid, r, actorId(context));
		if (!covered) {
			return [];
		}
		return await listEnrollmentsFor(oid, covered, extra);
	});

const enrollmentsListMine = authorizedProcedure("development", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return [];
		}
		return await listEnrollmentsFor(oid, [me.id]);
	}
);

/** Block a SECOND active (enrolled/in_progress) enrollment for (program, emp). */
async function assertNoActiveEnrollment(
	oid: string,
	programId: string,
	employeeId: string
): Promise<void> {
	const [existing] = await db
		.select({ id: trainingEnrollment.id })
		.from(trainingEnrollment)
		.where(
			and(
				eq(trainingEnrollment.organizationId, oid),
				eq(trainingEnrollment.programId, programId),
				eq(trainingEnrollment.employeeId, employeeId),
				inArray(trainingEnrollment.status, ["enrolled", "in_progress"])
			)
		)
		.limit(1);
	if (existing) {
		throw new ORPCError("CONFLICT", {
			message: "There is already an active enrollment in this program.",
		});
	}
}

async function insertEnrollment(
	oid: string,
	actor: string,
	programId: string,
	employeeId: string,
	note: string | null
) {
	const id = createId();
	await db.insert(trainingEnrollment).values({
		id,
		organizationId: oid,
		programId,
		employeeId,
		status: "enrolled",
		enrolledByUserId: actor,
		note,
	});
	await createAuditEvent(db, {
		organizationId: oid,
		entityType: "training_enrollment",
		entityId: id,
		action: "create",
		actorId: actor,
	});
	return { id };
}

const enrollmentsEnroll = authorizedProcedure("development", "manage")
	.input(
		z.object({
			programId: z.string(),
			employeeId: z.string(),
			note: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const program = await verifyProgram(oid, input.programId);
		if (program.status !== "active") {
			throw new ORPCError("CONFLICT", {
				message: "Only active programs can be enrolled into.",
			});
		}
		// Verify the employee is in the tenant, then scope to the caller.
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
		await assertManageScope(oid, role(context), actorId(context), emp.id);
		await assertNoActiveEnrollment(oid, program.id, emp.id);
		return await insertEnrollment(
			oid,
			actorId(context),
			program.id,
			emp.id,
			input.note ?? null
		);
	});

const enrollmentsEnrollSelf = authorizedProcedure("development", "enroll_self")
	.input(
		z.object({
			programId: z.string(),
			note: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const program = await verifyProgram(oid, input.programId);
		if (program.status !== "active") {
			throw new ORPCError("CONFLICT", {
				message: "This program is not open for enrollment.",
			});
		}
		if (!program.allowSelfEnroll) {
			throw new ORPCError("FORBIDDEN", {
				message: "Self-enrollment is not allowed for this program.",
			});
		}
		const me = await requireCurrentEmployeeId(oid, actorId(context));
		await assertNoActiveEnrollment(oid, program.id, me);
		return await insertEnrollment(oid, actorId(context), program.id, me, null);
	});

/**
 * Shared authorization for enrollment lifecycle (update/complete/withdraw):
 * HR/manager (scoped) may act on anyone in scope; an employee may act on their
 * OWN enrollment only. Returns the verified enrollment.
 */
async function authorizeEnrollmentAction(
	oid: string,
	callerRole: string,
	userId: string,
	enrollmentId: string
): Promise<EnrollmentRow> {
	const enrollment = await verifyEnrollment(oid, enrollmentId);
	if (canManageHR(callerRole) || callerRole === "manager") {
		await assertManageScope(oid, callerRole, userId, enrollment.employeeId);
		return enrollment;
	}
	// Self-service: must be the caller's own enrollment.
	const me = await resolveCurrentEmployee(oid, userId);
	if (!me || me.id !== enrollment.employeeId) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only change your own enrollment.",
		});
	}
	return enrollment;
}

const enrollmentsUpdateProgress = authorizedProcedure(
	"development",
	"enroll_self"
)
	.input(
		z.object({
			id: z.string(),
			scorePercent: z.number().int().min(0).max(100).nullable().optional(),
			incrementAttempt: z.boolean().optional(),
			note: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const enrollment = await authorizeEnrollmentAction(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (
			enrollment.status === "completed" ||
			enrollment.status === "withdrawn"
		) {
			throw new ORPCError("CONFLICT", {
				message: "This enrollment is closed.",
			});
		}
		let attemptsUsed = enrollment.attemptsUsed;
		if (input.incrementAttempt) {
			const program = await verifyProgram(oid, enrollment.programId);
			attemptsUsed += 1;
			if (attemptsUsed > program.maxAttempts) {
				throw new ORPCError("CONFLICT", {
					message: `No attempts left (max ${program.maxAttempts}).`,
				});
			}
		}
		await db
			.update(trainingEnrollment)
			.set({
				status: "in_progress",
				scorePercent:
					input.scorePercent === undefined ? undefined : input.scorePercent,
				attemptsUsed,
				startedAt: enrollment.startedAt ?? new Date(),
				note: input.note,
			})
			.where(
				and(
					eq(trainingEnrollment.id, enrollment.id),
					eq(trainingEnrollment.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_enrollment",
			entityId: enrollment.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: enrollment.id };
	});

const enrollmentsComplete = authorizedProcedure("development", "enroll_self")
	.input(
		z.object({
			id: z.string(),
			scorePercent: z.number().int().min(0).max(100).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const enrollment = await authorizeEnrollmentAction(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (
			enrollment.status === "completed" ||
			enrollment.status === "withdrawn"
		) {
			throw new ORPCError("CONFLICT", {
				message: "This enrollment is already closed.",
			});
		}
		const program = await verifyProgram(oid, enrollment.programId);
		if (enrollment.attemptsUsed > program.maxAttempts) {
			throw new ORPCError("CONFLICT", {
				message: "Attempt limit exceeded.",
			});
		}
		const score = input.scorePercent ?? enrollment.scorePercent ?? null;
		// Derive pass/fail SERVER-SIDE against the program's passing score.
		const failed =
			program.passingScorePercent != null &&
			(score == null || score < program.passingScorePercent);
		await db
			.update(trainingEnrollment)
			.set({
				status: failed ? "failed" : "completed",
				scorePercent: score,
				completedAt: new Date(),
			})
			.where(
				and(
					eq(trainingEnrollment.id, enrollment.id),
					eq(trainingEnrollment.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_enrollment",
			entityId: enrollment.id,
			action: "update",
			actorId: actorId(context),
			metadata: { completed: !failed, failed },
		});
		return { id: enrollment.id, status: failed ? "failed" : "completed" };
	});

const enrollmentsWithdraw = authorizedProcedure("development", "enroll_self")
	.input(z.object({ id: z.string(), note: z.string().nullable().optional() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const enrollment = await authorizeEnrollmentAction(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		if (enrollment.status === "completed") {
			throw new ORPCError("CONFLICT", {
				message: "A completed enrollment cannot be withdrawn.",
			});
		}
		await db
			.update(trainingEnrollment)
			.set({ status: "withdrawn", note: input.note })
			.where(
				and(
					eq(trainingEnrollment.id, enrollment.id),
					eq(trainingEnrollment.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "training_enrollment",
			entityId: enrollment.id,
			action: "update",
			actorId: actorId(context),
			metadata: { withdrawn: true },
		});
		return { id: enrollment.id };
	});

// ════════════════════════════════════════════════════════════════════
// CERTIFICATIONS
// ════════════════════════════════════════════════════════════════════

const certTypesList = authorizedProcedure("development", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		return await db
			.select()
			.from(certificationType)
			.where(
				and(
					eq(certificationType.organizationId, oid),
					isNull(certificationType.deletedAt)
				)
			)
			.orderBy(asc(certificationType.name))
			.limit(LIST_LIMIT);
	}
);

const certTypeWriteFields = z.object({
	name: z.string().min(1).max(300),
	issuingBody: z.string().nullable().optional(),
	requiresRenewal: z.boolean().optional(),
	defaultValidityMonths: z.number().int().min(1).max(600).nullable().optional(),
	reminderThresholdDays: z
		.array(z.number().int().positive())
		.nullable()
		.optional(),
});

const certTypesCreate = authorizedProcedure("development", "manage")
	.input(certTypeWriteFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const id = createId();
		await db.insert(certificationType).values({
			id,
			organizationId: oid,
			name: input.name,
			issuingBody: input.issuingBody ?? null,
			requiresRenewal: input.requiresRenewal ?? true,
			defaultValidityMonths: input.defaultValidityMonths ?? null,
			reminderThresholdDays: input.reminderThresholdDays ?? null,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "certification_type",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const certTypesUpdate = authorizedProcedure("development", "manage")
	.input(certTypeWriteFields.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyCertType(oid, input.id);
		await db
			.update(certificationType)
			.set({
				name: input.name,
				issuingBody: input.issuingBody,
				requiresRenewal: input.requiresRenewal,
				defaultValidityMonths: input.defaultValidityMonths,
				reminderThresholdDays: input.reminderThresholdDays,
			})
			.where(
				and(
					eq(certificationType.id, input.id),
					eq(certificationType.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "certification_type",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const certTypesArchive = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifyCertType(oid, input.id);
		await db
			.update(certificationType)
			.set({ isArchived: true })
			.where(
				and(
					eq(certificationType.id, input.id),
					eq(certificationType.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "certification_type",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// Resolve the tenant reminder default. (MVP: the factory default; a tenant
// setting `certReminderThresholdDays` is a documented future override.)
function tenantReminderDefault(): number[] | null {
	return null;
}

async function decorateCertifications(rows: EmployeeCertRow[], now: Date) {
	const typeIds = [...new Set(rows.map((r) => r.certificationTypeId))];
	const types =
		typeIds.length > 0
			? await db
					.select({
						id: certificationType.id,
						name: certificationType.name,
						issuingBody: certificationType.issuingBody,
						reminderThresholdDays: certificationType.reminderThresholdDays,
					})
					.from(certificationType)
					.where(inArray(certificationType.id, typeIds))
			: [];
	const typeMap = new Map(types.map((t) => [t.id, t]));
	const names = await employeeNameMap(rows.map((r) => r.employeeId));
	return rows.map((r) => {
		const t = typeMap.get(r.certificationTypeId);
		const thresholds = resolveReminderThresholds(
			t?.reminderThresholdDays ?? null,
			tenantReminderDefault()
		);
		const expiry = deriveCertExpiry(r.expiryDate, now, thresholds);
		return {
			...r,
			certificationTypeName: t?.name ?? r.certificationTypeId,
			issuingBody: t?.issuingBody ?? null,
			employeeName: names.get(r.employeeId) ?? r.employeeId,
			expiryState: expiry.state,
			daysUntilExpiry: expiry.daysUntilExpiry,
			thresholdBucket: expiry.thresholdBucket,
		};
	});
}

async function listCertificationsFor(
	oid: string,
	employeeIds: string[] | "all"
) {
	const conditions = [
		eq(employeeCertification.organizationId, oid),
		isNull(employeeCertification.deletedAt),
	];
	if (employeeIds !== "all") {
		if (employeeIds.length === 0) {
			return [];
		}
		conditions.push(inArray(employeeCertification.employeeId, employeeIds));
	}
	const rows = await db
		.select()
		.from(employeeCertification)
		.where(and(...conditions))
		.orderBy(asc(employeeCertification.expiryDate))
		.limit(LIST_LIMIT);
	return await decorateCertifications(rows, new Date());
}

const certificationsList = authorizedProcedure("development", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		const r = role(context);
		if (seesAllDevelopment(r)) {
			return await listCertificationsFor(oid, "all");
		}
		const covered = await coveredEmployeeIds(oid, r, actorId(context));
		if (!covered) {
			return [];
		}
		return await listCertificationsFor(oid, covered);
	}
);

const certificationsListMine = authorizedProcedure(
	"development",
	"read"
).handler(async ({ context }) => {
	const oid = orgId(context);
	const me = await resolveCurrentEmployee(oid, actorId(context));
	if (!me) {
		return [];
	}
	return await listCertificationsFor(oid, [me.id]);
});

/** Suggest an expiry date from the type's defaultValidityMonths + issue date. */
function suggestExpiry(
	issueDate: Date | null,
	defaultValidityMonths: number | null
): Date | null {
	if (!(issueDate && defaultValidityMonths)) {
		return null;
	}
	const d = new Date(issueDate);
	const totalMonths =
		d.getUTCFullYear() * MONTHS_PER_YEAR +
		d.getUTCMonth() +
		defaultValidityMonths;
	return new Date(
		Date.UTC(
			Math.floor(totalMonths / MONTHS_PER_YEAR),
			totalMonths % MONTHS_PER_YEAR,
			d.getUTCDate()
		)
	);
}

const certRecordFields = z.object({
	certificationTypeId: z.string(),
	credentialId: z.string().nullable().optional(),
	issueDate: z.string().datetime().nullable().optional(),
	expiryDate: z.string().datetime().nullable().optional(),
	documentId: z.string().nullable().optional(),
	note: z.string().nullable().optional(),
});

async function insertCertification(args: {
	oid: string;
	actor: string;
	employeeId: string;
	type: Awaited<ReturnType<typeof verifyCertType>>;
	input: z.infer<typeof certRecordFields>;
}) {
	const { oid, actor, employeeId, type, input } = args;
	const issueDate = input.issueDate ? new Date(input.issueDate) : null;
	const expiryDate = input.expiryDate
		? new Date(input.expiryDate)
		: suggestExpiry(issueDate, type.defaultValidityMonths);
	const id = createId();
	await db.insert(employeeCertification).values({
		id,
		organizationId: oid,
		certificationTypeId: type.id,
		employeeId,
		credentialId: input.credentialId ?? null,
		issueDate,
		expiryDate,
		documentId: input.documentId ?? null,
		recordedByUserId: actor,
		note: input.note ?? null,
	});
	await createAuditEvent(db, {
		organizationId: oid,
		entityType: "employee_certification",
		entityId: id,
		action: "create",
		actorId: actor,
	});
	return { id };
}

const certificationsRecord = authorizedProcedure("development", "manage")
	.input(certRecordFields.extend({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const type = await verifyCertType(oid, input.certificationTypeId);
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
		await assertManageScope(oid, role(context), actorId(context), emp.id);
		// documentId is a soft ref — never written to the Documents table.
		return await insertCertification({
			oid,
			actor: actorId(context),
			employeeId: emp.id,
			type,
			input,
		});
	});

const certificationsRecordSelf = authorizedProcedure(
	"development",
	"record_self"
)
	.input(certRecordFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const type = await verifyCertType(oid, input.certificationTypeId);
		const me = await requireCurrentEmployeeId(oid, actorId(context));
		return await insertCertification({
			oid,
			actor: actorId(context),
			employeeId: me,
			type,
			input,
		});
	});

async function authorizeCertAction(
	oid: string,
	callerRole: string,
	userId: string,
	certId: string
): Promise<EmployeeCertRow> {
	const cert = await verifyEmployeeCert(oid, certId);
	if (canManageHR(callerRole) || callerRole === "manager") {
		await assertManageScope(oid, callerRole, userId, cert.employeeId);
		return cert;
	}
	const me = await resolveCurrentEmployee(oid, userId);
	if (!me || me.id !== cert.employeeId) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only edit your own certification.",
		});
	}
	return cert;
}

const certificationsUpdate = authorizedProcedure("development", "record_self")
	.input(
		z.object({
			id: z.string(),
			credentialId: z.string().nullable().optional(),
			issueDate: z.string().datetime().nullable().optional(),
			expiryDate: z.string().datetime().nullable().optional(),
			status: CERT_STATUS.optional(),
			note: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const cert = await authorizeCertAction(
			oid,
			role(context),
			actorId(context),
			input.id
		);
		await db
			.update(employeeCertification)
			.set({
				credentialId: input.credentialId,
				issueDate: optionalDateColumn(input.issueDate),
				expiryDate: optionalDateColumn(input.expiryDate),
				status: input.status,
				note: input.note,
			})
			.where(
				and(
					eq(employeeCertification.id, cert.id),
					eq(employeeCertification.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_certification",
			entityId: cert.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: cert.id };
	});

const certificationsRevoke = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const cert = await verifyEmployeeCert(oid, input.id);
		await assertManageScope(
			oid,
			role(context),
			actorId(context),
			cert.employeeId
		);
		await db
			.update(employeeCertification)
			.set({ status: "revoked" })
			.where(
				and(
					eq(employeeCertification.id, cert.id),
					eq(employeeCertification.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_certification",
			entityId: cert.id,
			action: "update",
			actorId: actorId(context),
			metadata: { revoked: true },
		});
		return { id: cert.id };
	});

/**
 * scanExpiring — DERIVED, idempotent counts + items per threshold bucket over
 * the SCOPED set. Optional `emit:true` (manage-gated) fans the expiring items
 * into the existing notifications inbox via createNotifications — NO new table,
 * NO write to any non-development table except the shared notification inbox.
 */
const certificationsScanExpiring = authorizedProcedure("development", "read")
	.input(z.object({ emit: z.boolean().optional() }).optional())
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const r = role(context);
		const decorated = seesAllDevelopment(r)
			? await listCertificationsFor(oid, "all")
			: await (async () => {
					const covered = await coveredEmployeeIds(oid, r, actorId(context));
					return covered ? await listCertificationsFor(oid, covered) : [];
				})();
		// Only active credentials with a derived expiring/expired state.
		const flagged = decorated.filter(
			(c) =>
				c.status === "active" &&
				(c.expiryState === "expiring_soon" || c.expiryState === "expired")
		);
		const buckets = { expired: 0, "7": 0, "30": 0, "60": 0, "90": 0 };
		for (const c of flagged) {
			if (c.expiryState === "expired") {
				buckets.expired += 1;
			} else if (c.thresholdBucket != null) {
				const key = String(c.thresholdBucket) as keyof typeof buckets;
				if (key in buckets) {
					buckets[key] += 1;
				}
			}
		}
		// Optional proactive emission — manage-gated, reuses the inbox helper.
		let emitted = 0;
		if (input?.emit) {
			if (!(canManageHR(r) || r === "manager")) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only HR / managers can send reminders.",
				});
			}
			// Resolve each flagged cert's employee → user for the inbox.
			const empIds = [...new Set(flagged.map((c) => c.employeeId))];
			const empRows =
				empIds.length > 0
					? await db
							.select({
								id: employeeProfile.id,
								userId: employeeProfile.userId,
							})
							.from(employeeProfile)
							.where(inArray(employeeProfile.id, empIds))
					: [];
			const userByEmp = new Map(
				empRows
					.filter((e): e is { id: string; userId: string } => Boolean(e.userId))
					.map((e) => [e.id, e.userId])
			);
			const notifs = flagged
				.filter((c) => userByEmp.has(c.employeeId))
				.map((c) => ({
					organizationId: oid,
					userId: userByEmp.get(c.employeeId)!,
					type: "development.certification.expiring",
					title:
						c.expiryState === "expired"
							? `${c.certificationTypeName} has expired`
							: `${c.certificationTypeName} expires soon`,
					body: certExpiryNotificationBody(c.daysUntilExpiry),
					entityType: "employee_certification",
					entityId: c.id,
				}));
			emitted = await createNotifications(db, notifs);
		}
		return {
			counts: buckets,
			total: flagged.length,
			items: flagged,
			emitted,
		};
	});

// ════════════════════════════════════════════════════════════════════
// SKILLS — categories
// ════════════════════════════════════════════════════════════════════

const skillCategoriesList = authorizedProcedure("development", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		return await db
			.select()
			.from(skillCategory)
			.where(
				and(
					eq(skillCategory.organizationId, oid),
					isNull(skillCategory.deletedAt)
				)
			)
			.orderBy(asc(skillCategory.sortOrder), asc(skillCategory.name))
			.limit(LIST_LIMIT);
	}
);

const skillCategoriesCreate = authorizedProcedure("development", "manage")
	.input(
		z.object({
			name: z.string().min(1).max(200),
			sortOrder: z.number().int().min(0).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const id = createId();
		await db.insert(skillCategory).values({
			id,
			organizationId: oid,
			name: input.name,
			sortOrder: input.sortOrder ?? 0,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_category",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const skillCategoriesUpdate = authorizedProcedure("development", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(200).optional(),
			sortOrder: z.number().int().min(0).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifySkillCategory(oid, input.id);
		await db
			.update(skillCategory)
			.set({ name: input.name, sortOrder: input.sortOrder })
			.where(
				and(
					eq(skillCategory.id, input.id),
					eq(skillCategory.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_category",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const skillCategoriesArchive = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifySkillCategory(oid, input.id);
		await db
			.update(skillCategory)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(skillCategory.id, input.id),
					eq(skillCategory.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_category",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// SKILLS — types (the proficiency ladders)
// ════════════════════════════════════════════════════════════════════

const skillTypesList = authorizedProcedure("development", "read")
	.input(z.object({ categoryId: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [
			eq(skillType.organizationId, oid),
			isNull(skillType.deletedAt),
		];
		if (input?.categoryId) {
			conditions.push(eq(skillType.categoryId, input.categoryId));
		}
		return await db
			.select()
			.from(skillType)
			.where(and(...conditions))
			.orderBy(asc(skillType.name))
			.limit(LIST_LIMIT);
	});

const MIN_LEVELS = 2;

const skillTypesCreate = authorizedProcedure("development", "manage")
	.input(
		z.object({
			categoryId: z.string(),
			name: z.string().min(1).max(200),
			description: z.string().nullable().optional(),
			proficiencyLevels: z.array(z.string().min(1)).min(MIN_LEVELS),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifySkillCategory(oid, input.categoryId);
		const id = createId();
		await db.insert(skillType).values({
			id,
			organizationId: oid,
			categoryId: input.categoryId,
			name: input.name,
			description: input.description ?? null,
			proficiencyLevels: input.proficiencyLevels,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_type",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

/**
 * Edit a skill type. If the proficiency ladder changes, RECOMPUTE every held
 * employee_skill's ordinal by matching its stored label against the new list —
 * NEVER silently drift ordinals. If a held label was DELETED from the list,
 * block the edit (409) with a clear message (open Q4 recommendation).
 */
const skillTypesUpdate = authorizedProcedure("development", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(200).optional(),
			description: z.string().nullable().optional(),
			proficiencyLevels: z.array(z.string().min(1)).min(MIN_LEVELS).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const existing = await verifySkillType(oid, input.id);
		if (input.proficiencyLevels) {
			const newLevels = input.proficiencyLevels;
			const held = await db
				.select({
					id: employeeSkill.id,
					proficiencyLevel: employeeSkill.proficiencyLevel,
				})
				.from(employeeSkill)
				.where(
					and(
						eq(employeeSkill.skillTypeId, existing.id),
						eq(employeeSkill.organizationId, oid)
					)
				);
			const missing = held.find((h) => !newLevels.includes(h.proficiencyLevel));
			if (missing) {
				throw new ORPCError("CONFLICT", {
					message: `Cannot remove level "${missing.proficiencyLevel}" — employees are still assessed at it.`,
				});
			}
			await db.transaction(async (tx) => {
				await tx
					.update(skillType)
					.set({
						name: input.name,
						description: input.description,
						proficiencyLevels: newLevels,
					})
					.where(
						and(
							eq(skillType.id, existing.id),
							eq(skillType.organizationId, oid)
						)
					);
				for (const h of held) {
					const ordinal = newLevels.indexOf(h.proficiencyLevel);
					await tx
						.update(employeeSkill)
						.set({ proficiencyOrdinal: ordinal })
						.where(eq(employeeSkill.id, h.id));
				}
			});
		} else {
			await db
				.update(skillType)
				.set({ name: input.name, description: input.description })
				.where(
					and(eq(skillType.id, existing.id), eq(skillType.organizationId, oid))
				);
		}
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_type",
			entityId: existing.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: existing.id };
	});

const skillTypesArchive = authorizedProcedure("development", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await verifySkillType(oid, input.id);
		await db
			.update(skillType)
			.set({ isArchived: true, deletedAt: new Date() })
			.where(
				and(eq(skillType.id, input.id), eq(skillType.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "skill_type",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// SKILLS — employee levels
// ════════════════════════════════════════════════════════════════════

async function decorateEmployeeSkills(rows: EmployeeSkillRow[]) {
	const typeIds = [...new Set(rows.map((r) => r.skillTypeId))];
	const types =
		typeIds.length > 0
			? await db
					.select({
						id: skillType.id,
						name: skillType.name,
						categoryId: skillType.categoryId,
					})
					.from(skillType)
					.where(inArray(skillType.id, typeIds))
			: [];
	const typeMap = new Map(types.map((t) => [t.id, t]));
	const names = await employeeNameMap(rows.map((r) => r.employeeId));
	return rows.map((r) => ({
		...r,
		skillTypeName: typeMap.get(r.skillTypeId)?.name ?? r.skillTypeId,
		categoryId: typeMap.get(r.skillTypeId)?.categoryId ?? null,
		employeeName: names.get(r.employeeId) ?? r.employeeId,
	}));
}

async function listEmployeeSkillsFor(
	oid: string,
	employeeIds: string[] | "all"
) {
	const conditions = [eq(employeeSkill.organizationId, oid)];
	if (employeeIds !== "all") {
		if (employeeIds.length === 0) {
			return [];
		}
		conditions.push(inArray(employeeSkill.employeeId, employeeIds));
	}
	const rows = await db
		.select()
		.from(employeeSkill)
		.where(and(...conditions))
		.orderBy(desc(employeeSkill.assessedAt))
		.limit(LIST_LIMIT);
	return await decorateEmployeeSkills(rows);
}

const skillsEmployeeList = authorizedProcedure("development", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		const r = role(context);
		if (seesAllDevelopment(r)) {
			return await listEmployeeSkillsFor(oid, "all");
		}
		const covered = await coveredEmployeeIds(oid, r, actorId(context));
		if (!covered) {
			return [];
		}
		return await listEmployeeSkillsFor(oid, covered);
	}
);

const skillsEmployeeListMine = authorizedProcedure(
	"development",
	"read"
).handler(async ({ context }) => {
	const oid = orgId(context);
	const me = await resolveCurrentEmployee(oid, actorId(context));
	if (!me) {
		return [];
	}
	return await listEmployeeSkillsFor(oid, [me.id]);
});

/**
 * Upsert one current level per (employee, skillType). The unique index enforces
 * one row; we update in place if the employee already has the skill, preserving
 * history through audit_event (not duplicate rows).
 */
async function upsertEmployeeSkill(args: {
	oid: string;
	actor: string;
	employeeId: string;
	type: SkillTypeRow;
	label: string;
	source: EmployeeSkillRow["source"];
	note: string | null;
	linkedCandidateId: string | null;
}) {
	const {
		oid,
		actor,
		employeeId,
		type,
		label,
		source,
		note,
		linkedCandidateId,
	} = args;
	const ordinal = resolveOrdinal(type.proficiencyLevels, label);
	const [existing] = await db
		.select({ id: employeeSkill.id })
		.from(employeeSkill)
		.where(
			and(
				eq(employeeSkill.organizationId, oid),
				eq(employeeSkill.employeeId, employeeId),
				eq(employeeSkill.skillTypeId, type.id)
			)
		)
		.limit(1);
	if (existing) {
		await db
			.update(employeeSkill)
			.set({
				proficiencyLevel: label,
				proficiencyOrdinal: ordinal,
				source,
				assessedByUserId: actor,
				assessedAt: new Date(),
				note,
				linkedCandidateId,
			})
			.where(eq(employeeSkill.id, existing.id));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_skill",
			entityId: existing.id,
			action: "update",
			actorId: actor,
		});
		return { id: existing.id };
	}
	const id = createId();
	await db.insert(employeeSkill).values({
		id,
		organizationId: oid,
		skillTypeId: type.id,
		employeeId,
		proficiencyLevel: label,
		proficiencyOrdinal: ordinal,
		source,
		assessedByUserId: actor,
		assessedAt: new Date(),
		note,
		linkedCandidateId,
	});
	await createAuditEvent(db, {
		organizationId: oid,
		entityType: "employee_skill",
		entityId: id,
		action: "create",
		actorId: actor,
	});
	return { id };
}

const skillsEmployeeAssess = authorizedProcedure("development", "manage")
	.input(
		z.object({
			employeeId: z.string(),
			skillTypeId: z.string(),
			proficiencyLevel: z.string(),
			note: z.string().nullable().optional(),
			linkedCandidateId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const type = await verifySkillType(oid, input.skillTypeId);
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
		await assertManageScope(oid, role(context), actorId(context), emp.id);
		const linkedCandidateId = await verifyCandidateRef(
			oid,
			input.linkedCandidateId
		);
		const r = role(context);
		const source = canManageHR(r) ? "hr" : "manager";
		return await upsertEmployeeSkill({
			oid,
			actor: actorId(context),
			employeeId: emp.id,
			type,
			label: input.proficiencyLevel,
			source,
			note: input.note ?? null,
			linkedCandidateId,
		});
	});

const skillsEmployeeAssessSelf = authorizedProcedure(
	"development",
	"record_self"
)
	.input(
		z.object({
			skillTypeId: z.string(),
			proficiencyLevel: z.string(),
			note: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const type = await verifySkillType(oid, input.skillTypeId);
		const me = await requireCurrentEmployeeId(oid, actorId(context));
		return await upsertEmployeeSkill({
			oid,
			actor: actorId(context),
			employeeId: me,
			type,
			label: input.proficiencyLevel,
			source: "self",
			note: input.note ?? null,
			linkedCandidateId: null,
		});
	});

const skillsEmployeeRemove = authorizedProcedure("development", "record_self")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const skill = await verifyEmployeeSkill(oid, input.id);
		// HR/manager (scoped) OR the owning employee may remove.
		if (canManageHR(role(context)) || role(context) === "manager") {
			await assertManageScope(
				oid,
				role(context),
				actorId(context),
				skill.employeeId
			);
		} else {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (!me || me.id !== skill.employeeId) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only remove your own skill.",
				});
			}
		}
		await db
			.delete(employeeSkill)
			.where(
				and(
					eq(employeeSkill.id, skill.id),
					eq(employeeSkill.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "employee_skill",
			entityId: skill.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: skill.id };
	});

/**
 * "Who knows X at level ≥ N" — hits the (skillTypeId, proficiencyOrdinal) index.
 * Scope:
 *   - HR/auditor/payroll → all employees (named rows).
 *   - manager → own + direct reports (named rows).
 *   - employee → themselves only (named rows).
 *   - recruiter → AGGREGATE COUNT ONLY (no individual employee names/ids) so they
 *     can answer "do we already have this skill in-house?" without breaching
 *     employee-record privacy.
 */
const skillsEmployeeSearch = authorizedProcedure("development", "read")
	.input(
		z.object({
			skillTypeId: z.string(),
			minProficiencyOrdinal: z.number().int().min(0).default(0),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const r = role(context);
		await verifySkillType(oid, input.skillTypeId);

		// Recruiter: aggregate count only — never individual records.
		if (r === "recruiter") {
			const [agg] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(employeeSkill)
				.where(
					and(
						eq(employeeSkill.organizationId, oid),
						eq(employeeSkill.skillTypeId, input.skillTypeId),
						gte(employeeSkill.proficiencyOrdinal, input.minProficiencyOrdinal)
					)
				);
			return { aggregateOnly: true as const, count: agg?.count ?? 0 };
		}

		const conditions = [
			eq(employeeSkill.organizationId, oid),
			eq(employeeSkill.skillTypeId, input.skillTypeId),
			gte(employeeSkill.proficiencyOrdinal, input.minProficiencyOrdinal),
		];
		if (!seesAllDevelopment(r)) {
			const covered = await coveredEmployeeIds(oid, r, actorId(context));
			if (!covered || covered.length === 0) {
				return { aggregateOnly: false as const, count: 0, items: [] };
			}
			conditions.push(inArray(employeeSkill.employeeId, covered));
		}
		const rows = await db
			.select()
			.from(employeeSkill)
			.where(and(...conditions))
			.orderBy(desc(employeeSkill.proficiencyOrdinal))
			.limit(LIST_LIMIT);
		const decorated = await decorateEmployeeSkills(rows);
		return {
			aggregateOnly: false as const,
			count: decorated.length,
			items: decorated,
		};
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const developmentRouter = {
	programs: {
		list: programsList,
		getById: programsGetById,
		create: programsCreate,
		update: programsUpdate,
		archive: programsArchive,
		modules: {
			add: modulesAdd,
			update: modulesUpdate,
			remove: modulesRemove,
		},
	},
	enrollments: {
		list: enrollmentsList,
		listMine: enrollmentsListMine,
		enroll: enrollmentsEnroll,
		enrollSelf: enrollmentsEnrollSelf,
		updateProgress: enrollmentsUpdateProgress,
		complete: enrollmentsComplete,
		withdraw: enrollmentsWithdraw,
	},
	certifications: {
		types: {
			list: certTypesList,
			create: certTypesCreate,
			update: certTypesUpdate,
			archive: certTypesArchive,
		},
		list: certificationsList,
		listMine: certificationsListMine,
		record: certificationsRecord,
		recordSelf: certificationsRecordSelf,
		update: certificationsUpdate,
		revoke: certificationsRevoke,
		scanExpiring: certificationsScanExpiring,
	},
	skills: {
		categories: {
			list: skillCategoriesList,
			create: skillCategoriesCreate,
			update: skillCategoriesUpdate,
			archive: skillCategoriesArchive,
		},
		types: {
			list: skillTypesList,
			create: skillTypesCreate,
			update: skillTypesUpdate,
			archive: skillTypesArchive,
		},
		employee: {
			list: skillsEmployeeList,
			listMine: skillsEmployeeListMine,
			assess: skillsEmployeeAssess,
			assessSelf: skillsEmployeeAssessSelf,
			remove: skillsEmployeeRemove,
			search: skillsEmployeeSearch,
		},
	},
};
