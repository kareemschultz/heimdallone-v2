import { db } from "@Heimdallone/db";
import * as schema from "@Heimdallone/db/schema/index";
import { PAY_FREQUENCIES } from "@Heimdallone/payroll-engine/pay-frequency";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	count,
	desc,
	eq,
	gt,
	ilike,
	isNotNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent, diffChanges } from "../utils/audit";
import {
	canMutateEmployees,
	resolveCurrentEmployee,
} from "../utils/employee-scope";

// ─── Shared helpers ───────────────────────────────────────

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const memberRole = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

import { canManagePayroll } from "../utils/role-helpers";

// Roles that may see raw salary values (same pattern as bank details masking).
// Matches "can manage payroll" — payroll_admin + HR_ROLES.
function canSeeSalary(role: string): boolean {
	return canManagePayroll(role);
}

// On-read auto-expire: active contracts past their end date are treated as expired.
// Phase 6: applied in TypeScript after fetch, not as a DB trigger.
function resolveStatus(
	status: "draft" | "active" | "expired" | "terminated",
	endDate: Date | null
): "draft" | "active" | "expired" | "terminated" {
	if (status === "active" && endDate !== null && endDate < new Date()) {
		return "expired";
	}
	return status;
}

// Mask salary for non-privileged roles. Returns null for masked fields.
function applyMasking<T extends { baseSalary: string; salaryCurrency: string }>(
	row: T,
	role: string
): T & { baseSalary: string | null } {
	if (!canSeeSalary(role)) {
		return { ...row, baseSalary: null };
	}
	return row;
}

// ─── Zod schemas ──────────────────────────────────────────

const wageTypeEnum = z.enum(["daily", "monthly", "hourly"]);
// Derived from the canonical engine list — API can never drift from the DB enum.
const payFrequencyEnum = z.enum(PAY_FREQUENCIES);
const contractStatusEnum = z.enum(["draft", "active", "expired", "terminated"]);

// ─── Filing Statuses ──────────────────────────────────────

const filingStatusList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			includeArchived: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.filingStatus.organizationId, orgId(context))];
		if (!input.includeArchived) {
			conditions.push(eq(schema.filingStatus.isActive, true));
		}
		return db
			.select()
			.from(schema.filingStatus)
			.where(and(...conditions))
			.orderBy(schema.filingStatus.name);
	});

const filingStatusGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [fs] = await db
			.select()
			.from(schema.filingStatus)
			.where(
				and(
					eq(schema.filingStatus.id, input.id),
					eq(schema.filingStatus.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!fs) {
			throw new ORPCError("NOT_FOUND", {
				message: "Filing status not found.",
			});
		}
		return fs;
	});

const filingStatusCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			name: z.string().min(2).max(100),
			basedOn: z
				.enum(["basic_pay", "gross_pay", "taxable_gross_pay"])
				.optional()
				.default("taxable_gross_pay"),
			brackets: z
				.array(
					z.object({
						min: z.number(),
						max: z.number().nullable(),
						rate: z.number().min(0).max(1),
						fixedAmount: z.number().optional().default(0),
					})
				)
				.min(1),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can manage filing statuses.",
			});
		}

		const [existing] = await db
			.select({ id: schema.filingStatus.id })
			.from(schema.filingStatus)
			.where(
				and(
					eq(schema.filingStatus.organizationId, orgId(context)),
					eq(schema.filingStatus.name, input.name)
				)
			)
			.limit(1);
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: `A filing status named "${input.name}" already exists.`,
			});
		}

		const id = createId();
		const [fs] = await db
			.insert(schema.filingStatus)
			.values({
				id,
				organizationId: orgId(context),
				name: input.name,
				basedOn: input.basedOn,
				brackets: input.brackets,
			})
			.returning();

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "filing_status",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return fs;
	});

const filingStatusUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(2).max(100).optional(),
			basedOn: z
				.enum(["basic_pay", "gross_pay", "taxable_gross_pay"])
				.optional(),
			brackets: z
				.array(
					z.object({
						min: z.number(),
						max: z.number().nullable(),
						rate: z.number().min(0).max(1),
						fixedAmount: z.number().optional().default(0),
					})
				)
				.min(1)
				.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can manage filing statuses.",
			});
		}

		const [before] = await db
			.select()
			.from(schema.filingStatus)
			.where(
				and(
					eq(schema.filingStatus.id, input.id),
					eq(schema.filingStatus.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!before) {
			throw new ORPCError("NOT_FOUND", {
				message: "Filing status not found.",
			});
		}

		const updates: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updates.name = input.name;
		}
		if (input.basedOn !== undefined) {
			updates.basedOn = input.basedOn;
		}
		if (input.brackets !== undefined) {
			updates.brackets = input.brackets;
		}

		const [updated] = await db
			.update(schema.filingStatus)
			.set(updates)
			.where(eq(schema.filingStatus.id, input.id))
			.returning();

		const changes = diffChanges(before as Record<string, unknown>, updates);
		if (changes.length > 0) {
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "filing_status",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes,
			});
		}
		return updated;
	});

const filingStatusArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can manage filing statuses.",
			});
		}

		const [fs] = await db
			.update(schema.filingStatus)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.filingStatus.id, input.id),
					eq(schema.filingStatus.organizationId, orgId(context))
				)
			)
			.returning();
		if (!fs) {
			throw new ORPCError("NOT_FOUND", {
				message: "Filing status not found.",
			});
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "filing_status",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return fs;
	});

// ─── Contracts ────────────────────────────────────────────

// Shared select shape for list rows (joined with employee name)
const contractListSelect = {
	id: schema.contract.id,
	organizationId: schema.contract.organizationId,
	employeeId: schema.contract.employeeId,
	contractName: schema.contract.contractName,
	startDate: schema.contract.startDate,
	endDate: schema.contract.endDate,
	wageType: schema.contract.wageType,
	payFrequency: schema.contract.payFrequency,
	baseSalary: schema.contract.baseSalary,
	salaryCurrency: schema.contract.salaryCurrency,
	filingStatusId: schema.contract.filingStatusId,
	status: schema.contract.status,
	departmentId: schema.contract.departmentId,
	jobPositionId: schema.contract.jobPositionId,
	shiftId: schema.contract.shiftId,
	workTypeId: schema.contract.workTypeId,
	noticePeriodDays: schema.contract.noticePeriodDays,
	documentUrl: schema.contract.documentUrl,
	deductLeaveFromBasicPay: schema.contract.deductLeaveFromBasicPay,
	notes: schema.contract.notes,
	createdAt: schema.contract.createdAt,
	updatedAt: schema.contract.updatedAt,
	employeeFirstName: schema.employeeProfile.firstName,
	employeeLastName: schema.employeeProfile.lastName,
	employeeBadgeId: schema.employeeProfile.badgeId,
};

const contractList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			employeeId: z.string().optional(),
			status: contractStatusEnum.or(z.literal("expiring_soon")).optional(),
			search: z.string().optional(),
			page: z.number().int().min(1).optional().default(1),
			pageSize: z.number().int().min(1).max(100).optional().default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		const conditions = [eq(schema.contract.organizationId, orgId(context))];

		// Self-scope: employees only see their own contracts
		if (
			!canMutateEmployees(role) &&
			role !== "payroll_admin" &&
			role !== "auditor"
		) {
			const current = await resolveCurrentEmployee(
				orgId(context),
				actorId(context)
			);
			if (!current) {
				return { data: [], total: 0 };
			}
			conditions.push(eq(schema.contract.employeeId, current.id));
		}

		if (input.employeeId) {
			conditions.push(eq(schema.contract.employeeId, input.employeeId));
		}

		if (input.status === "expiring_soon") {
			// Active contracts with endDate within the next 30 days
			conditions.push(
				and(
					eq(schema.contract.status, "active"),
					isNotNull(schema.contract.endDate),
					gt(schema.contract.endDate, sql`CURRENT_DATE`),
					lt(schema.contract.endDate, sql`CURRENT_DATE + INTERVAL '30 days'`)
				)!
			);
		} else if (input.status) {
			conditions.push(eq(schema.contract.status, input.status));
		}

		if (input.search) {
			conditions.push(
				or(
					ilike(schema.contract.contractName, `%${input.search}%`),
					ilike(schema.employeeProfile.firstName, `%${input.search}%`),
					ilike(schema.employeeProfile.lastName, `%${input.search}%`)
				)!
			);
		}

		const where = and(...conditions);
		const offset = (input.page - 1) * input.pageSize;

		const [rows, totalResult] = await Promise.all([
			db
				.select(contractListSelect)
				.from(schema.contract)
				.innerJoin(
					schema.employeeProfile,
					eq(schema.contract.employeeId, schema.employeeProfile.id)
				)
				.where(where)
				.orderBy(desc(schema.contract.createdAt))
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ total: count() })
				.from(schema.contract)
				.innerJoin(
					schema.employeeProfile,
					eq(schema.contract.employeeId, schema.employeeProfile.id)
				)
				.where(where),
		]);

		const data = rows.map((row) => {
			const withExpiry = {
				...row,
				status: resolveStatus(row.status, row.endDate),
			};
			return applyMasking(withExpiry, role);
		});

		return { data, total: totalResult[0]?.total ?? 0 };
	});

const contractGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = memberRole(context);

		const [row] = await db
			.select(contractListSelect)
			.from(schema.contract)
			.innerJoin(
				schema.employeeProfile,
				eq(schema.contract.employeeId, schema.employeeProfile.id)
			)
			.where(
				and(
					eq(schema.contract.id, input.id),
					eq(schema.contract.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Contract not found." });
		}

		// Self-scope: employees may only see their own contracts
		if (
			!canMutateEmployees(role) &&
			role !== "payroll_admin" &&
			role !== "auditor"
		) {
			const current = await resolveCurrentEmployee(
				orgId(context),
				actorId(context)
			);
			if (!current || row.employeeId !== current.id) {
				throw new ORPCError("FORBIDDEN", { message: "Access denied." });
			}
		}

		const withExpiry = {
			...row,
			status: resolveStatus(row.status, row.endDate),
		};
		return applyMasking(withExpiry, role);
	});

const contractGetByEmployeeId = authorizedProcedure("employee", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		const role = memberRole(context);

		// Self-scope: non-privileged roles may only look up their own contracts
		if (
			!canMutateEmployees(role) &&
			role !== "payroll_admin" &&
			role !== "auditor"
		) {
			const current = await resolveCurrentEmployee(
				orgId(context),
				actorId(context)
			);
			if (!current || input.employeeId !== current.id) {
				throw new ORPCError("FORBIDDEN", { message: "Access denied." });
			}
		}

		const rows = await db
			.select(contractListSelect)
			.from(schema.contract)
			.innerJoin(
				schema.employeeProfile,
				eq(schema.contract.employeeId, schema.employeeProfile.id)
			)
			.where(
				and(
					eq(schema.contract.employeeId, input.employeeId),
					eq(schema.contract.organizationId, orgId(context))
				)
			)
			.orderBy(desc(schema.contract.startDate));

		return rows.map((row) =>
			applyMasking(
				{ ...row, status: resolveStatus(row.status, row.endDate) },
				role
			)
		);
	});

const contractCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			employeeId: z.string(),
			contractName: z.string().min(2).max(200),
			startDate: z.string(),
			endDate: z.string().nullable().optional(),
			wageType: wageTypeEnum,
			payFrequency: payFrequencyEnum,
			baseSalary: z.string().regex(/^\d+(\.\d{1,2})?$/),
			salaryCurrency: z.string().length(3).optional().default("GYD"),
			filingStatusId: z.string().optional(),
			departmentId: z.string().nullable().optional(),
			jobPositionId: z.string().nullable().optional(),
			shiftId: z.string().nullable().optional(),
			workTypeId: z.string().nullable().optional(),
			noticePeriodDays: z.number().int().min(0).optional().default(30),
			documentUrl: z.string().nullable().optional(),
			deductLeaveFromBasicPay: z.boolean().optional().default(true),
			notes: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can create contracts.",
			});
		}

		// Verify employee belongs to this org
		const [emp] = await db
			.select({ id: schema.employeeProfile.id })
			.from(schema.employeeProfile)
			.where(
				and(
					eq(schema.employeeProfile.id, input.employeeId),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		// Only one draft per employee
		const [existingDraft] = await db
			.select({
				id: schema.contract.id,
				contractName: schema.contract.contractName,
			})
			.from(schema.contract)
			.where(
				and(
					eq(schema.contract.employeeId, input.employeeId),
					eq(schema.contract.status, "draft")
				)
			)
			.limit(1);
		if (existingDraft) {
			throw new ORPCError("CONFLICT", {
				message: `Cannot create draft — this employee already has a draft contract ("${existingDraft.contractName}"). Edit or delete it first.`,
			});
		}

		const id = createId();
		const [contract] = await db
			.insert(schema.contract)
			.values({
				id,
				organizationId: orgId(context),
				employeeId: input.employeeId,
				contractName: input.contractName,
				startDate: new Date(input.startDate),
				endDate: input.endDate ? new Date(input.endDate) : null,
				wageType: input.wageType,
				payFrequency: input.payFrequency,
				baseSalary: input.baseSalary,
				salaryCurrency: input.salaryCurrency,
				filingStatusId: input.filingStatusId ?? null,
				status: "draft",
				departmentId: input.departmentId ?? null,
				jobPositionId: input.jobPositionId ?? null,
				shiftId: input.shiftId ?? null,
				workTypeId: input.workTypeId ?? null,
				noticePeriodDays: input.noticePeriodDays,
				documentUrl: input.documentUrl ?? null,
				deductLeaveFromBasicPay: input.deductLeaveFromBasicPay,
				notes: input.notes ?? null,
			})
			.returning();

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "contract",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { status: "draft", employeeId: input.employeeId },
		});
		return contract;
	});

const contractUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			contractName: z.string().min(2).max(200).optional(),
			startDate: z.string().optional(),
			endDate: z.string().nullable().optional(),
			wageType: wageTypeEnum.optional(),
			payFrequency: payFrequencyEnum.optional(),
			baseSalary: z
				.string()
				.regex(/^\d+(\.\d{1,2})?$/)
				.optional(),
			salaryCurrency: z.string().length(3).optional(),
			filingStatusId: z.string().nullable().optional(),
			departmentId: z.string().nullable().optional(),
			jobPositionId: z.string().nullable().optional(),
			shiftId: z.string().nullable().optional(),
			workTypeId: z.string().nullable().optional(),
			noticePeriodDays: z.number().int().min(0).optional(),
			documentUrl: z.string().nullable().optional(),
			deductLeaveFromBasicPay: z.boolean().optional(),
			notes: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can update contracts.",
			});
		}

		const [before] = await db
			.select()
			.from(schema.contract)
			.where(
				and(
					eq(schema.contract.id, input.id),
					eq(schema.contract.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!before) {
			throw new ORPCError("NOT_FOUND", { message: "Contract not found." });
		}

		// Only draft contracts can be freely edited
		if (before.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Only draft contracts can be edited. Terminate and create a new contract to make changes.",
			});
		}

		const { id: _, ...fields } = input;
		const updates: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(fields)) {
			if (v === undefined) {
				continue;
			}
			if (k === "startDate" && typeof v === "string") {
				updates.startDate = new Date(v);
			} else if (k === "endDate") {
				updates.endDate = v ? new Date(v as string) : null;
			} else {
				updates[k] = v;
			}
		}

		const [updated] = await db
			.update(schema.contract)
			.set(updates)
			.where(eq(schema.contract.id, input.id))
			.returning();

		const changes = diffChanges(before as Record<string, unknown>, updates);
		if (changes.length > 0) {
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "contract",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes,
			});
		}
		return updated;
	});

const contractActivate = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can activate contracts.",
			});
		}

		const [contract] = await db
			.select()
			.from(schema.contract)
			.where(
				and(
					eq(schema.contract.id, input.id),
					eq(schema.contract.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!contract) {
			throw new ORPCError("NOT_FOUND", { message: "Contract not found." });
		}

		if (contract.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot activate — contract status is "${contract.status}". Only draft contracts can be activated.`,
			});
		}

		// Business rule: one active contract per employee
		const [existingActive] = await db
			.select({
				id: schema.contract.id,
				contractName: schema.contract.contractName,
			})
			.from(schema.contract)
			.where(
				and(
					eq(schema.contract.employeeId, contract.employeeId),
					eq(schema.contract.status, "active")
				)
			)
			.limit(1);
		if (existingActive) {
			throw new ORPCError("CONFLICT", {
				message: `Cannot activate — this employee already has an active contract ("${existingActive.contractName}"). Terminate it first.`,
			});
		}

		const [activated] = await db
			.update(schema.contract)
			.set({ status: "active" })
			.where(eq(schema.contract.id, input.id))
			.returning();

		// Sync salary to employee_work_info (business rule: active contract is the salary source)
		await db
			.update(schema.employeeWorkInfo)
			.set({
				basicSalary: contract.baseSalary,
				salaryCurrency: contract.salaryCurrency,
			})
			.where(eq(schema.employeeWorkInfo.employeeId, contract.employeeId));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "contract",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: {
				statusTransition: "draft → active",
				salarySync: {
					baseSalary: contract.baseSalary,
					currency: contract.salaryCurrency,
				},
			},
		});
		return activated;
	});

const contractTerminate = authorizedProcedure("employee", "terminate")
	.input(
		z.object({
			id: z.string(),
			reason: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = memberRole(context);
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can terminate contracts.",
			});
		}

		const [contract] = await db
			.select()
			.from(schema.contract)
			.where(
				and(
					eq(schema.contract.id, input.id),
					eq(schema.contract.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!contract) {
			throw new ORPCError("NOT_FOUND", { message: "Contract not found." });
		}

		if (contract.status === "terminated") {
			throw new ORPCError("BAD_REQUEST", {
				message: "This contract is already terminated.",
			});
		}
		if (contract.status === "expired") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot terminate an expired contract. It has already ended.",
			});
		}

		const updates: Record<string, unknown> = { status: "terminated" };
		if (input.reason) {
			updates.notes = contract.notes
				? `${contract.notes}\n\nTermination reason: ${input.reason}`
				: `Termination reason: ${input.reason}`;
		}

		const [terminated] = await db
			.update(schema.contract)
			.set(updates)
			.where(eq(schema.contract.id, input.id))
			.returning();

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "contract",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: {
				statusTransition: `${contract.status} → terminated`,
				reason: input.reason ?? null,
			},
		});
		return terminated;
	});

// ─── Export Router ────────────────────────────────────────

export const contractsRouter = {
	filingStatuses: {
		list: filingStatusList,
		getById: filingStatusGetById,
		create: filingStatusCreate,
		update: filingStatusUpdate,
		archive: filingStatusArchive,
	},
	contracts: {
		list: contractList,
		getById: contractGetById,
		getByEmployeeId: contractGetByEmployeeId,
		create: contractCreate,
		update: contractUpdate,
		activate: contractActivate,
		terminate: contractTerminate,
	},
};
