import { db } from "@Heimdallone/db";
import * as schema from "@Heimdallone/db/schema/index";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, tenantProcedure } from "../index";
import { createAuditEvent, diffChanges } from "../utils/audit";
import {
	canMutateEmployees,
	canReadAllEmployees,
	canReadFullBankDetails,
	checkReportingManagerCycle,
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { canManagePayroll } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;

function activeFilter(table: { isActive: unknown }, includeArchived?: boolean) {
	if (includeArchived) {
		return;
	}
	return eq(table.isActive as ReturnType<typeof sql>, true);
}

// ─── Departments ──────────────────────────────────────────

const departmentList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			search: z.string().optional(),
			includeArchived: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.department.organizationId, orgId(context))];
		const af = activeFilter(schema.department, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		if (input.search) {
			conditions.push(ilike(schema.department.name, `%${input.search}%`));
		}
		return db
			.select()
			.from(schema.department)
			.where(and(...conditions))
			.orderBy(schema.department.name);
	});

const departmentGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [dept] = await db
			.select()
			.from(schema.department)
			.where(
				and(
					eq(schema.department.id, input.id),
					eq(schema.department.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!dept) {
			throw new Error("NOT_FOUND");
		}
		return dept;
	});

const departmentCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			name: z.string().min(2).max(100),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [dept] = await db
			.insert(schema.department)
			.values({
				id,
				organizationId: orgId(context),
				name: input.name,
				description: input.description ?? null,
			})
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "department",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return dept;
	});

const departmentUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(2).max(100).optional(),
			description: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const [before] = await db
			.select()
			.from(schema.department)
			.where(
				and(
					eq(schema.department.id, input.id),
					eq(schema.department.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!before) {
			throw new Error("NOT_FOUND");
		}

		const updates: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updates.name = input.name;
		}
		if (input.description !== undefined) {
			updates.description = input.description;
		}

		const [updated] = await db
			.update(schema.department)
			.set(updates)
			.where(eq(schema.department.id, input.id))
			.returning();

		const changes = diffChanges(before as Record<string, unknown>, updates);
		if (changes.length > 0) {
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "department",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				changes,
			});
		}
		return updated;
	});

const departmentArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [empCount] = await db
			.select({ c: count() })
			.from(schema.employeeWorkInfo)
			.innerJoin(
				schema.employeeProfile,
				eq(schema.employeeWorkInfo.employeeId, schema.employeeProfile.id)
			)
			.where(
				and(
					eq(schema.employeeWorkInfo.departmentId, input.id),
					eq(schema.employeeProfile.isActive, true)
				)
			);
		if (empCount && empCount.c > 0) {
			throw new Error(
				`Cannot archive — ${empCount.c} active employee(s) in this department`
			);
		}
		const [archived] = await db
			.update(schema.department)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.department.id, input.id),
					eq(schema.department.organizationId, orgId(context))
				)
			)
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "department",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return archived;
	});

// ─── Job Positions ────────────────────────────────────────

const jobPositionList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			departmentId: z.string().optional(),
			search: z.string().optional(),
			includeArchived: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.jobPosition.organizationId, orgId(context))];
		const af = activeFilter(schema.jobPosition, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		if (input.departmentId) {
			conditions.push(eq(schema.jobPosition.departmentId, input.departmentId));
		}
		if (input.search) {
			conditions.push(ilike(schema.jobPosition.name, `%${input.search}%`));
		}
		return db
			.select()
			.from(schema.jobPosition)
			.where(and(...conditions))
			.orderBy(schema.jobPosition.name);
	});

const jobPositionGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [pos] = await db
			.select()
			.from(schema.jobPosition)
			.where(
				and(
					eq(schema.jobPosition.id, input.id),
					eq(schema.jobPosition.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!pos) {
			throw new Error("NOT_FOUND");
		}
		return pos;
	});

const jobPositionCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			departmentId: z.string(),
			name: z.string().min(2).max(100),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [pos] = await db
			.insert(schema.jobPosition)
			.values({
				id,
				organizationId: orgId(context),
				departmentId: input.departmentId,
				name: input.name,
				description: input.description ?? null,
			})
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_position",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return pos;
	});

const jobPositionUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(2).max(100).optional(),
			description: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const [updated] = await db
			.update(schema.jobPosition)
			.set({
				...(input.name === undefined ? {} : { name: input.name }),
				...(input.description === undefined
					? {}
					: { description: input.description }),
			})
			.where(
				and(
					eq(schema.jobPosition.id, input.id),
					eq(schema.jobPosition.organizationId, orgId(context))
				)
			)
			.returning();
		if (!updated) {
			throw new Error("NOT_FOUND");
		}
		return updated;
	});

const jobPositionArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [archived] = await db
			.update(schema.jobPosition)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.jobPosition.id, input.id),
					eq(schema.jobPosition.organizationId, orgId(context))
				)
			)
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_position",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return archived;
	});

// ─── Job Roles ────────────────────────────────────────────

const jobRoleList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			jobPositionId: z.string().optional(),
			includeArchived: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.jobRole.organizationId, orgId(context))];
		const af = activeFilter(schema.jobRole, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		if (input.jobPositionId) {
			conditions.push(eq(schema.jobRole.jobPositionId, input.jobPositionId));
		}
		return db
			.select()
			.from(schema.jobRole)
			.where(and(...conditions))
			.orderBy(schema.jobRole.name);
	});

const jobRoleCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			jobPositionId: z.string(),
			name: z.string().min(2).max(100),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [role] = await db
			.insert(schema.jobRole)
			.values({
				id,
				organizationId: orgId(context),
				jobPositionId: input.jobPositionId,
				name: input.name,
			})
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "job_role",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return role;
	});

const jobRoleUpdate = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string(), name: z.string().min(2).max(100) }))
	.handler(async ({ context, input }) => {
		const [updated] = await db
			.update(schema.jobRole)
			.set({ name: input.name })
			.where(
				and(
					eq(schema.jobRole.id, input.id),
					eq(schema.jobRole.organizationId, orgId(context))
				)
			)
			.returning();
		return updated;
	});

const jobRoleArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [archived] = await db
			.update(schema.jobRole)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.jobRole.id, input.id),
					eq(schema.jobRole.organizationId, orgId(context))
				)
			)
			.returning();
		return archived;
	});

// ─── Work Types ───────────────────────────────────────────

const workTypeList = authorizedProcedure("employee", "read")
	.input(z.object({ includeArchived: z.boolean().optional().default(false) }))
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.workType.organizationId, orgId(context))];
		const af = activeFilter(schema.workType, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		return db
			.select()
			.from(schema.workType)
			.where(and(...conditions))
			.orderBy(schema.workType.name);
	});

const workTypeCreate = authorizedProcedure("employee", "create")
	.input(z.object({ name: z.string().min(2).max(50) }))
	.handler(async ({ context, input }) => {
		const id = createId();
		const [wt] = await db
			.insert(schema.workType)
			.values({ id, organizationId: orgId(context), name: input.name })
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "work_type",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return wt;
	});

const workTypeUpdate = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string(), name: z.string().min(2).max(50) }))
	.handler(async ({ context, input }) => {
		const [updated] = await db
			.update(schema.workType)
			.set({ name: input.name })
			.where(
				and(
					eq(schema.workType.id, input.id),
					eq(schema.workType.organizationId, orgId(context))
				)
			)
			.returning();
		return updated;
	});

const workTypeArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [archived] = await db
			.update(schema.workType)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.workType.id, input.id),
					eq(schema.workType.organizationId, orgId(context))
				)
			)
			.returning();
		return archived;
	});

// ─── Employee Types ───────────────────────────────────────

const employeeTypeList = authorizedProcedure("employee", "read")
	.input(z.object({ includeArchived: z.boolean().optional().default(false) }))
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.employeeType.organizationId, orgId(context))];
		const af = activeFilter(schema.employeeType, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		return db
			.select()
			.from(schema.employeeType)
			.where(and(...conditions))
			.orderBy(schema.employeeType.name);
	});

const employeeTypeCreate = authorizedProcedure("employee", "create")
	.input(z.object({ name: z.string().min(2).max(50) }))
	.handler(async ({ context, input }) => {
		const id = createId();
		const [et] = await db
			.insert(schema.employeeType)
			.values({ id, organizationId: orgId(context), name: input.name })
			.returning();
		return et;
	});

const employeeTypeUpdate = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string(), name: z.string().min(2).max(50) }))
	.handler(async ({ context, input }) => {
		const [updated] = await db
			.update(schema.employeeType)
			.set({ name: input.name })
			.where(
				and(
					eq(schema.employeeType.id, input.id),
					eq(schema.employeeType.organizationId, orgId(context))
				)
			)
			.returning();
		return updated;
	});

const employeeTypeArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [archived] = await db
			.update(schema.employeeType)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.employeeType.id, input.id),
					eq(schema.employeeType.organizationId, orgId(context))
				)
			)
			.returning();
		return archived;
	});

// ─── Shifts ───────────────────────────────────────────────

const shiftScheduleSchema = z.object({
	dayOfWeek: z.number().int().min(0).max(6),
	startTime: z.string().regex(/^\d{2}:\d{2}$/),
	endTime: z.string().regex(/^\d{2}:\d{2}$/),
	minimumWorkMinutes: z.number().int().min(0).optional().default(495),
});

const shiftList = authorizedProcedure("employee", "read")
	.input(z.object({ includeArchived: z.boolean().optional().default(false) }))
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.shift.organizationId, orgId(context))];
		const af = activeFilter(schema.shift, input.includeArchived);
		if (af) {
			conditions.push(af);
		}
		return db
			.select()
			.from(schema.shift)
			.where(and(...conditions))
			.orderBy(schema.shift.name);
	});

const shiftGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [s] = await db
			.select()
			.from(schema.shift)
			.where(
				and(
					eq(schema.shift.id, input.id),
					eq(schema.shift.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!s) {
			throw new Error("NOT_FOUND");
		}
		const schedules = await db
			.select()
			.from(schema.shiftSchedule)
			.where(eq(schema.shiftSchedule.shiftId, input.id))
			.orderBy(schema.shiftSchedule.dayOfWeek);
		return { ...s, schedules };
	});

const shiftCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			name: z.string().min(2).max(100),
			weeklyFullTimeMinutes: z.number().int().optional().default(2400),
			monthlyFullTimeMinutes: z.number().int().optional().default(12_000),
			schedules: z.array(shiftScheduleSchema).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [s] = await db
			.insert(schema.shift)
			.values({
				id,
				organizationId: orgId(context),
				name: input.name,
				weeklyFullTimeMinutes: input.weeklyFullTimeMinutes,
				monthlyFullTimeMinutes: input.monthlyFullTimeMinutes,
			})
			.returning();
		if (input.schedules?.length) {
			await db.insert(schema.shiftSchedule).values(
				input.schedules.map((sc) => ({
					id: createId(),
					shiftId: id,
					dayOfWeek: sc.dayOfWeek,
					startTime: sc.startTime,
					endTime: sc.endTime,
					minimumWorkMinutes: sc.minimumWorkMinutes,
					isNightShift: sc.startTime > sc.endTime,
				}))
			);
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "shift",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return s;
	});

const shiftUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(2).max(100).optional(),
			weeklyFullTimeMinutes: z.number().int().optional(),
			monthlyFullTimeMinutes: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const updates: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updates.name = input.name;
		}
		if (input.weeklyFullTimeMinutes !== undefined) {
			updates.weeklyFullTimeMinutes = input.weeklyFullTimeMinutes;
		}
		if (input.monthlyFullTimeMinutes !== undefined) {
			updates.monthlyFullTimeMinutes = input.monthlyFullTimeMinutes;
		}
		const [updated] = await db
			.update(schema.shift)
			.set(updates)
			.where(
				and(
					eq(schema.shift.id, input.id),
					eq(schema.shift.organizationId, orgId(context))
				)
			)
			.returning();
		return updated;
	});

const shiftArchive = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [archived] = await db
			.update(schema.shift)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.shift.id, input.id),
					eq(schema.shift.organizationId, orgId(context))
				)
			)
			.returning();
		return archived;
	});

const shiftSchedulesList = authorizedProcedure("employee", "read")
	.input(z.object({ shiftId: z.string() }))
	.handler(async ({ input }) =>
		db
			.select()
			.from(schema.shiftSchedule)
			.where(eq(schema.shiftSchedule.shiftId, input.shiftId))
			.orderBy(schema.shiftSchedule.dayOfWeek)
	);

const shiftSchedulesUpsert = authorizedProcedure("employee", "update")
	.input(
		z.object({
			shiftId: z.string(),
			schedules: z.array(shiftScheduleSchema),
		})
	)
	.handler(async ({ context, input }) => {
		await db
			.delete(schema.shiftSchedule)
			.where(eq(schema.shiftSchedule.shiftId, input.shiftId));
		if (input.schedules.length > 0) {
			await db.insert(schema.shiftSchedule).values(
				input.schedules.map((sc) => ({
					id: createId(),
					shiftId: input.shiftId,
					dayOfWeek: sc.dayOfWeek,
					startTime: sc.startTime,
					endTime: sc.endTime,
					minimumWorkMinutes: sc.minimumWorkMinutes,
					isNightShift: sc.startTime > sc.endTime,
				}))
			);
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "shift_schedule",
			entityId: input.shiftId,
			action: "update",
			actorId: actorId(context),
		});
		return db
			.select()
			.from(schema.shiftSchedule)
			.where(eq(schema.shiftSchedule.shiftId, input.shiftId))
			.orderBy(schema.shiftSchedule.dayOfWeek);
	});

// ─── Employees ────────────────────────────────────────────

const employeeList = authorizedProcedure("employee", "read")
	.input(
		z.object({
			search: z.string().optional(),
			departmentId: z.string().optional(),
			jobPositionId: z.string().optional(),
			shiftId: z.string().optional(),
			workTypeId: z.string().optional(),
			employeeTypeId: z.string().optional(),
			isActive: z.boolean().optional().default(true),
			page: z.number().int().min(1).optional().default(1),
			pageSize: z.number().int().min(1).max(100).optional().default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [
			eq(schema.employeeProfile.organizationId, orgId(context)),
			eq(schema.employeeProfile.isActive, input.isActive),
		];

		if (input.search) {
			conditions.push(
				or(
					ilike(schema.employeeProfile.firstName, `%${input.search}%`),
					ilike(schema.employeeProfile.lastName, `%${input.search}%`),
					ilike(schema.employeeProfile.email, `%${input.search}%`),
					ilike(schema.employeeProfile.badgeId, `%${input.search}%`)
				)!
			);
		}

		if (input.departmentId) {
			conditions.push(
				eq(schema.employeeWorkInfo.departmentId, input.departmentId)
			);
		}
		if (input.jobPositionId) {
			conditions.push(
				eq(schema.employeeWorkInfo.jobPositionId, input.jobPositionId)
			);
		}
		if (input.shiftId) {
			conditions.push(eq(schema.employeeWorkInfo.shiftId, input.shiftId));
		}
		if (input.workTypeId) {
			conditions.push(eq(schema.employeeWorkInfo.workTypeId, input.workTypeId));
		}
		if (input.employeeTypeId) {
			conditions.push(
				eq(schema.employeeWorkInfo.employeeTypeId, input.employeeTypeId)
			);
		}

		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canReadAllEmployees(role)) {
			const currentEmp = await resolveCurrentEmployee(
				orgId(context),
				actorId(context)
			);
			if (!currentEmp) {
				return { data: [], total: 0 };
			}
			if (role === "manager") {
				const reportIds = await getDirectReportIds(currentEmp.id);
				const allowedIds = [currentEmp.id, ...reportIds];
				conditions.push(
					sql`${schema.employeeProfile.id} IN (${sql.join(
						allowedIds.map((id) => sql`${id}`),
						sql`, `
					)})`
				);
			} else {
				conditions.push(eq(schema.employeeProfile.id, currentEmp.id));
			}
		}

		const where = and(...conditions);
		const offset = (input.page - 1) * input.pageSize;

		const [data, totalResult] = await Promise.all([
			db
				.select({
					id: schema.employeeProfile.id,
					badgeId: schema.employeeProfile.badgeId,
					firstName: schema.employeeProfile.firstName,
					lastName: schema.employeeProfile.lastName,
					email: schema.employeeProfile.email,
					profileImageUrl: schema.employeeProfile.profileImageUrl,
					isActive: schema.employeeProfile.isActive,
					country: schema.employeeProfile.country,
					departmentName: schema.department.name,
					jobPositionName: schema.jobPosition.name,
					shiftName: schema.shift.name,
					workTypeName: schema.workType.name,
					workLocation: schema.employeeWorkInfo.workLocation,
				})
				.from(schema.employeeProfile)
				.leftJoin(
					schema.employeeWorkInfo,
					eq(schema.employeeProfile.id, schema.employeeWorkInfo.employeeId)
				)
				.leftJoin(
					schema.department,
					eq(schema.employeeWorkInfo.departmentId, schema.department.id)
				)
				.leftJoin(
					schema.jobPosition,
					eq(schema.employeeWorkInfo.jobPositionId, schema.jobPosition.id)
				)
				.leftJoin(
					schema.shift,
					eq(schema.employeeWorkInfo.shiftId, schema.shift.id)
				)
				.leftJoin(
					schema.workType,
					eq(schema.employeeWorkInfo.workTypeId, schema.workType.id)
				)
				.where(where)
				.orderBy(schema.employeeProfile.firstName)
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ total: count() })
				.from(schema.employeeProfile)
				.leftJoin(
					schema.employeeWorkInfo,
					eq(schema.employeeProfile.id, schema.employeeWorkInfo.employeeId)
				)
				.where(where),
		]);

		return { data, total: totalResult[0]?.total ?? 0 };
	});

// Attach reportingManagerName and null out salary fields for non-payroll roles.
function maskWorkRowSalary<
	T extends { basicSalary: string | null; salaryCurrency: string | null },
>(
	row: T | undefined,
	reportingManagerName: string | null,
	canSeeSalary: boolean
) {
	if (!row) {
		return null;
	}
	return {
		...row,
		reportingManagerName,
		basicSalary: canSeeSalary ? row.basicSalary : null,
		salaryCurrency: canSeeSalary ? row.salaryCurrency : null,
	};
}

const employeeGetById = authorizedProcedure("employee", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canReadAllEmployees(role)) {
			const currentEmp = await resolveCurrentEmployee(
				orgId(context),
				actorId(context)
			);
			if (!currentEmp) {
				throw new ORPCError("FORBIDDEN", { message: "Access denied" });
			}
			if (role === "manager") {
				const reportIds = await getDirectReportIds(currentEmp.id);
				if (input.id !== currentEmp.id && !reportIds.includes(input.id)) {
					throw new ORPCError("FORBIDDEN", { message: "Access denied" });
				}
			} else if (input.id !== currentEmp.id) {
				throw new ORPCError("FORBIDDEN", { message: "Access denied" });
			}
		}

		const [emp] = await db
			.select()
			.from(schema.employeeProfile)
			.where(
				and(
					eq(schema.employeeProfile.id, input.id),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}

		const [workRow] = await db
			.select({
				id: schema.employeeWorkInfo.id,
				employeeId: schema.employeeWorkInfo.employeeId,
				departmentId: schema.employeeWorkInfo.departmentId,
				departmentName: schema.department.name,
				jobPositionId: schema.employeeWorkInfo.jobPositionId,
				jobPositionName: schema.jobPosition.name,
				jobRoleId: schema.employeeWorkInfo.jobRoleId,
				jobRoleName: schema.jobRole.name,
				shiftId: schema.employeeWorkInfo.shiftId,
				shiftName: schema.shift.name,
				workTypeId: schema.employeeWorkInfo.workTypeId,
				workTypeName: schema.workType.name,
				employeeTypeId: schema.employeeWorkInfo.employeeTypeId,
				employeeTypeName: schema.employeeType.name,
				reportingManagerId: schema.employeeWorkInfo.reportingManagerId,
				workLocation: schema.employeeWorkInfo.workLocation,
				workEmail: schema.employeeWorkInfo.workEmail,
				workPhone: schema.employeeWorkInfo.workPhone,
				joiningDate: schema.employeeWorkInfo.joiningDate,
				basicSalary: schema.employeeWorkInfo.basicSalary,
				salaryCurrency: schema.employeeWorkInfo.salaryCurrency,
			})
			.from(schema.employeeWorkInfo)
			.leftJoin(
				schema.department,
				eq(schema.employeeWorkInfo.departmentId, schema.department.id)
			)
			.leftJoin(
				schema.jobPosition,
				eq(schema.employeeWorkInfo.jobPositionId, schema.jobPosition.id)
			)
			.leftJoin(
				schema.jobRole,
				eq(schema.employeeWorkInfo.jobRoleId, schema.jobRole.id)
			)
			.leftJoin(
				schema.shift,
				eq(schema.employeeWorkInfo.shiftId, schema.shift.id)
			)
			.leftJoin(
				schema.workType,
				eq(schema.employeeWorkInfo.workTypeId, schema.workType.id)
			)
			.leftJoin(
				schema.employeeType,
				eq(schema.employeeWorkInfo.employeeTypeId, schema.employeeType.id)
			)
			.where(eq(schema.employeeWorkInfo.employeeId, input.id))
			.limit(1);

		let reportingManagerName: string | null = null;
		if (workRow?.reportingManagerId) {
			const [mgr] = await db
				.select({
					firstName: schema.employeeProfile.firstName,
					lastName: schema.employeeProfile.lastName,
				})
				.from(schema.employeeProfile)
				.where(eq(schema.employeeProfile.id, workRow.reportingManagerId))
				.limit(1);
			if (mgr) {
				reportingManagerName = `${mgr.firstName}${mgr.lastName ? ` ${mgr.lastName}` : ""}`;
			}
		}

		// basicSalary is payroll-sensitive — mask for non-payroll roles (managers
		// see their reports here, but salary follows the contracts.ts policy:
		// only canManagePayroll sees it). See repo-wide-audit-2026-06-10.
		return {
			...emp,
			workInfo: maskWorkRowSalary(
				workRow,
				reportingManagerName,
				canManagePayroll(role)
			),
		};
	});

// Read-only org chart: a flat list of nodes (employee + reporting line + dept +
// position) that the UI assembles into a tree. Reuses employee:read (no new AC
// pair). See-all roles get the whole org; a manager gets their own subtree
// (self + all descendants, resolved server-side via BFS over reportingManagerId
// so scope can never widen on the client). Names/titles only — no salary/PII.
const employeeOrgChart = authorizedProcedure("employee", "read")
	.input(z.object({ includeArchived: z.boolean().optional() }).optional())
	.handler(async ({ context, input }) => {
		const organizationId = context.organizationId;
		const role = context.memberRole;
		const includeArchived = input?.includeArchived ?? false;

		const conditions = [
			eq(schema.employeeProfile.organizationId, organizationId),
		];
		if (!includeArchived) {
			conditions.push(eq(schema.employeeProfile.isActive, true));
		}

		const allNodes = await db
			.select({
				id: schema.employeeProfile.id,
				firstName: schema.employeeProfile.firstName,
				lastName: schema.employeeProfile.lastName,
				profileImageUrl: schema.employeeProfile.profileImageUrl,
				isActive: schema.employeeProfile.isActive,
				reportingManagerId: schema.employeeWorkInfo.reportingManagerId,
				departmentName: schema.department.name,
				jobPositionName: schema.jobPosition.name,
			})
			.from(schema.employeeProfile)
			.leftJoin(
				schema.employeeWorkInfo,
				eq(schema.employeeProfile.id, schema.employeeWorkInfo.employeeId)
			)
			.leftJoin(
				schema.department,
				eq(schema.employeeWorkInfo.departmentId, schema.department.id)
			)
			.leftJoin(
				schema.jobPosition,
				eq(schema.employeeWorkInfo.jobPositionId, schema.jobPosition.id)
			)
			.where(and(...conditions))
			.orderBy(schema.employeeProfile.firstName);

		// See-all roles (owner/admin/hr/payroll/auditor) see the whole org.
		if (canReadAllEmployees(role)) {
			return { nodes: allNodes, scoped: false };
		}

		// Manager: restrict to self + all descendants (BFS over the in-memory set).
		const currentEmp = await resolveCurrentEmployee(
			organizationId,
			context.session.user.id
		);
		if (!currentEmp) {
			return { nodes: [], scoped: true };
		}
		const childrenByManager = new Map<string, typeof allNodes>();
		for (const n of allNodes) {
			if (n.reportingManagerId) {
				const list = childrenByManager.get(n.reportingManagerId) ?? [];
				list.push(n);
				childrenByManager.set(n.reportingManagerId, list);
			}
		}
		const subtree: typeof allNodes = [];
		const seen = new Set<string>();
		const queue = [currentEmp.id];
		const selfNode = allNodes.find((n) => n.id === currentEmp.id);
		if (selfNode) {
			subtree.push(selfNode);
			seen.add(selfNode.id);
		}
		while (queue.length > 0) {
			const managerId = queue.shift();
			if (!managerId) {
				continue;
			}
			for (const child of childrenByManager.get(managerId) ?? []) {
				if (!seen.has(child.id)) {
					seen.add(child.id);
					subtree.push(child);
					queue.push(child.id);
				}
			}
		}
		return { nodes: subtree, scoped: true };
	});

const employeeCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			firstName: z.string().min(1).max(200),
			lastName: z.string().max(200).optional(),
			// Optional: no-login employees (HR/payroll-only staff) have no email (21L-B).
			email: z.string().email().nullish(),
			phone: z.string().optional(),
			dateOfBirth: z.string().optional(),
			gender: z.enum(["male", "female", "other"]).optional(),
			maritalStatus: z.enum(["single", "married", "divorced"]).optional(),
			address: z.string().optional(),
			city: z.string().optional(),
			state: z.string().optional(),
			country: z.string().optional(),
			zip: z.string().optional(),
			emergencyContactName: z.string().optional(),
			emergencyContactPhone: z.string().optional(),
			emergencyContactRelation: z.string().optional(),
			badgeId: z.string().optional(),
			departmentId: z.string().optional(),
			jobPositionId: z.string().optional(),
			jobRoleId: z.string().optional(),
			shiftId: z.string().optional(),
			workTypeId: z.string().optional(),
			employeeTypeId: z.string().optional(),
			reportingManagerId: z.string().optional(),
			workLocation: z.string().optional(),
			workEmail: z.string().email().optional(),
			joiningDate: z.string().optional(),
			basicSalary: z.string().optional(),
			salaryCurrency: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can create employees.",
			});
		}

		// Uniqueness only applies when an email is provided (no-login employees skip it).
		if (input.email) {
			const [existingEmail] = await db
				.select({ id: schema.employeeProfile.id })
				.from(schema.employeeProfile)
				.where(
					and(
						eq(schema.employeeProfile.organizationId, orgId(context)),
						eq(schema.employeeProfile.email, input.email)
					)
				)
				.limit(1);
			if (existingEmail) {
				throw new ORPCError("CONFLICT", {
					message: "An employee with this email already exists.",
				});
			}
		}

		if (input.badgeId) {
			const [existingBadge] = await db
				.select({ id: schema.employeeProfile.id })
				.from(schema.employeeProfile)
				.where(
					and(
						eq(schema.employeeProfile.organizationId, orgId(context)),
						eq(schema.employeeProfile.badgeId, input.badgeId)
					)
				)
				.limit(1);
			if (existingBadge) {
				throw new ORPCError("CONFLICT", {
					message: "This badge ID is already assigned to another employee.",
				});
			}
		}

		const empId = createId();
		const [emp] = await db
			.insert(schema.employeeProfile)
			.values({
				id: empId,
				organizationId: orgId(context),
				firstName: input.firstName,
				lastName: input.lastName ?? null,
				email: input.email ?? null,
				phone: input.phone ?? null,
				dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
				gender: input.gender ?? null,
				maritalStatus: input.maritalStatus ?? null,
				address: input.address ?? null,
				city: input.city ?? null,
				state: input.state ?? null,
				country: input.country ?? null,
				zip: input.zip ?? null,
				emergencyContactName: input.emergencyContactName ?? null,
				emergencyContactPhone: input.emergencyContactPhone ?? null,
				emergencyContactRelation: input.emergencyContactRelation ?? null,
				badgeId: input.badgeId ?? null,
			})
			.returning();

		await db.insert(schema.employeeWorkInfo).values({
			id: createId(),
			employeeId: empId,
			departmentId: input.departmentId ?? null,
			jobPositionId: input.jobPositionId ?? null,
			jobRoleId: input.jobRoleId ?? null,
			shiftId: input.shiftId ?? null,
			workTypeId: input.workTypeId ?? null,
			employeeTypeId: input.employeeTypeId ?? null,
			reportingManagerId: input.reportingManagerId ?? null,
			workLocation: input.workLocation ?? null,
			workEmail: input.workEmail ?? null,
			joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
			basicSalary: input.basicSalary ?? null,
			salaryCurrency: input.salaryCurrency ?? "GYD",
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_profile",
			entityId: empId,
			action: "create",
			actorId: actorId(context),
		});
		return emp;
	});

const employeeUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			firstName: z.string().min(1).max(200).optional(),
			lastName: z.string().max(200).nullable().optional(),
			// Nullable: an employee can be set to no-login by clearing the email (21L-B).
			email: z.string().email().nullable().optional(),
			phone: z.string().nullable().optional(),
			dateOfBirth: z.string().nullable().optional(),
			gender: z.enum(["male", "female", "other"]).nullable().optional(),
			maritalStatus: z
				.enum(["single", "married", "divorced"])
				.nullable()
				.optional(),
			address: z.string().nullable().optional(),
			city: z.string().nullable().optional(),
			state: z.string().nullable().optional(),
			country: z.string().nullable().optional(),
			zip: z.string().nullable().optional(),
			badgeId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can edit employees.",
			});
		}
		const { id, ...fields } = input;
		const updates: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(fields)) {
			if (v !== undefined) {
				if (k === "dateOfBirth" && typeof v === "string") {
					updates[k] = new Date(v);
				} else {
					updates[k] = v;
				}
			}
		}
		const [updated] = await db
			.update(schema.employeeProfile)
			.set(updates)
			.where(
				and(
					eq(schema.employeeProfile.id, id),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.returning();
		if (!updated) {
			throw new Error("NOT_FOUND");
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_profile",
			entityId: id,
			action: "update",
			actorId: actorId(context),
		});
		return updated;
	});

const employeeArchive = authorizedProcedure("employee", "terminate")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can archive employees.",
			});
		}
		const [managerCount] = await db
			.select({ c: count() })
			.from(schema.employeeWorkInfo)
			.where(eq(schema.employeeWorkInfo.reportingManagerId, input.id));
		if (managerCount && managerCount.c > 0) {
			throw new Error(
				`Cannot archive — this employee is a reporting manager for ${managerCount.c} other employee(s)`
			);
		}
		const [archived] = await db
			.update(schema.employeeProfile)
			.set({ isActive: false })
			.where(
				and(
					eq(schema.employeeProfile.id, input.id),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_profile",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return archived;
	});

const employeeRestore = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can restore employees.",
			});
		}
		const [restored] = await db
			.update(schema.employeeProfile)
			.set({ isActive: true })
			.where(
				and(
					eq(schema.employeeProfile.id, input.id),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.returning();
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_profile",
			entityId: input.id,
			action: "restore",
			actorId: actorId(context),
		});
		return restored;
	});

// ─── Employee Work Info ───────────────────────────────────

const workInfoGet = authorizedProcedure("employee", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		// Tenant scope: the target employee MUST belong to the caller's org
		// (closes a cross-tenant IDOR — this endpoint is reachable by any
		// employee:read holder). See repo-wide-audit-2026-06-10.
		const [owner] = await db
			.select({ id: schema.employeeProfile.id })
			.from(schema.employeeProfile)
			.where(
				and(
					eq(schema.employeeProfile.id, input.employeeId),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!owner) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}
		const [info] = await db
			.select()
			.from(schema.employeeWorkInfo)
			.where(eq(schema.employeeWorkInfo.employeeId, input.employeeId))
			.limit(1);
		if (!info) {
			throw new ORPCError("NOT_FOUND", { message: "Work info not found" });
		}
		// basicSalary is payroll-sensitive — mask for non-payroll roles to match
		// the contracts.ts applyMasking policy (only canManagePayroll sees salary).
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canManagePayroll(role)) {
			return { ...info, basicSalary: null, salaryCurrency: null };
		}
		return info;
	});

// Tenant guard: the target employee MUST belong to the caller's org. Without this
// a privileged caller (HR/payroll) in tenant A could write another tenant's
// employee by id (cross-tenant write IDOR). Mirrors the read-path guard on
// bankDetailsGet. Throws NOT_FOUND so a foreign id is indistinguishable from a
// missing one.
async function assertEmployeeInOrg(
	oid: string,
	employeeId: string
): Promise<void> {
	const [owner] = await db
		.select({ id: schema.employeeProfile.id })
		.from(schema.employeeProfile)
		.where(
			and(
				eq(schema.employeeProfile.id, employeeId),
				eq(schema.employeeProfile.organizationId, oid)
			)
		)
		.limit(1);
	if (!owner) {
		throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
	}
}

const workInfoUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			employeeId: z.string(),
			departmentId: z.string().nullable().optional(),
			jobPositionId: z.string().nullable().optional(),
			jobRoleId: z.string().nullable().optional(),
			shiftId: z.string().nullable().optional(),
			workTypeId: z.string().nullable().optional(),
			employeeTypeId: z.string().nullable().optional(),
			reportingManagerId: z.string().nullable().optional(),
			workLocation: z.string().nullable().optional(),
			workEmail: z.string().email().nullable().optional(),
			workPhone: z.string().nullable().optional(),
			joiningDate: z.string().nullable().optional(),
			basicSalary: z.string().nullable().optional(),
			salaryCurrency: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canMutateEmployees(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators can edit work information.",
			});
		}

		const { employeeId, ...fields } = input;
		await assertEmployeeInOrg(orgId(context), employeeId);

		if (fields.reportingManagerId) {
			const isCycle = await checkReportingManagerCycle(
				employeeId,
				fields.reportingManagerId
			);
			if (isCycle) {
				throw new ORPCError("BAD_REQUEST", {
					message: "This manager assignment would create a reporting loop.",
				});
			}
		}

		const updates: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(fields)) {
			if (v !== undefined) {
				if (k === "joiningDate" && typeof v === "string") {
					updates[k] = new Date(v);
				} else {
					updates[k] = v;
				}
			}
		}
		const [updated] = await db
			.update(schema.employeeWorkInfo)
			.set(updates)
			.where(eq(schema.employeeWorkInfo.employeeId, employeeId))
			.returning();
		if (!updated) {
			throw new Error("NOT_FOUND");
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_work_info",
			entityId: employeeId,
			action: "update",
			actorId: actorId(context),
		});
		return updated;
	});

// ─── Employee Bank Details ────────────────────────────────

function maskAccountNumber(num: string): string {
	if (num.length <= 4) {
		return "****";
	}
	return `****${num.slice(-4)}`;
}

const bankDetailsGet = authorizedProcedure("employee", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		// Tenant scope: target must belong to the caller's org (closes a
		// cross-tenant IDOR — a payroll_admin could otherwise read another
		// tenant's full bank details). See repo-wide-audit-2026-06-10.
		const [owner] = await db
			.select({ id: schema.employeeProfile.id })
			.from(schema.employeeProfile)
			.where(
				and(
					eq(schema.employeeProfile.id, input.employeeId),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!owner) {
			return null;
		}
		const [details] = await db
			.select()
			.from(schema.employeeBankDetails)
			.where(eq(schema.employeeBankDetails.employeeId, input.employeeId))
			.limit(1);
		if (!details) {
			return null;
		}

		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canManagePayroll(role)) {
			return {
				...details,
				accountNumber: maskAccountNumber(details.accountNumber),
				bankCode1: details.bankCode1
					? `****${details.bankCode1.slice(-2)}`
					: null,
			};
		}
		return details;
	});

const bankDetailsUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			employeeId: z.string(),
			bankName: z.string().min(1),
			accountNumber: z.string().min(1),
			branch: z.string().nullable().optional(),
			bankCode1: z.string().nullable().optional(),
			bankCode2: z.string().nullable().optional(),
			country: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canReadFullBankDetails(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR and payroll administrators can edit bank details.",
			});
		}
		const { employeeId, ...fields } = input;
		await assertEmployeeInOrg(orgId(context), employeeId);
		const existing = await db
			.select()
			.from(schema.employeeBankDetails)
			.where(eq(schema.employeeBankDetails.employeeId, employeeId))
			.limit(1);

		let result;
		if (existing.length === 0) {
			[result] = await db
				.insert(schema.employeeBankDetails)
				.values({
					id: createId(),
					employeeId,
					bankName: fields.bankName,
					accountNumber: fields.accountNumber,
					branch: fields.branch ?? null,
					bankCode1: fields.bankCode1 ?? null,
					bankCode2: fields.bankCode2 ?? null,
					country: fields.country ?? null,
				})
				.returning();
		} else {
			[result] = await db
				.update(schema.employeeBankDetails)
				.set(fields)
				.where(eq(schema.employeeBankDetails.employeeId, employeeId))
				.returning();
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_bank_details",
			entityId: employeeId,
			action: existing.length === 0 ? "create" : "update",
			actorId: actorId(context),
		});
		return result;
	});

// ─── Employee Statutory (tax/NIS/payroll attributes) ──────

// TIN/NIS are sensitive statutory identifiers — masked for non-payroll roles,
// mirroring the bank account-number policy.
function maskStatutoryId(value: string | null): string | null {
	if (!value) {
		return value;
	}
	if (value.length <= 3) {
		return "****";
	}
	return `****${value.slice(-3)}`;
}

const statutoryGet = authorizedProcedure("employee", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		// Tenant scope: target must belong to the caller's org (closes the same
		// cross-tenant IDOR class as bankDetailsGet).
		const [owner] = await db
			.select({ id: schema.employeeProfile.id })
			.from(schema.employeeProfile)
			.where(
				and(
					eq(schema.employeeProfile.id, input.employeeId),
					eq(schema.employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!owner) {
			return null;
		}
		const [details] = await db
			.select()
			.from(schema.employeeStatutory)
			.where(eq(schema.employeeStatutory.employeeId, input.employeeId))
			.limit(1);
		if (!details) {
			return null;
		}

		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canManagePayroll(role)) {
			return {
				...details,
				taxIdentificationNumber: maskStatutoryId(
					details.taxIdentificationNumber
				),
				socialSecurityNumber: maskStatutoryId(details.socialSecurityNumber),
			};
		}
		return details;
	});

const statutoryUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			employeeId: z.string(),
			taxIdentificationNumber: z.string().nullable().optional(),
			socialSecurityNumber: z.string().nullable().optional(),
			dependentChildren: z.number().int().min(0).optional(),
			hasSecondJob: z.boolean().optional(),
			secondJobPayAmount: z.string().optional(),
			medicalInsuranceOnFile: z.boolean().optional(),
			medicalPayrollDeductionAmount: z.string().optional(),
			medicalExternalPremiumAmount: z.string().optional(),
			otherDeductionsAmount: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		// Statutory data drives payroll; editing is restricted to HR/payroll, like
		// bank details.
		if (!canReadFullBankDetails(role)) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only HR and payroll administrators can edit statutory details.",
			});
		}
		const { employeeId, ...fields } = input;
		await assertEmployeeInOrg(orgId(context), employeeId);
		const existing = await db
			.select({ id: schema.employeeStatutory.id })
			.from(schema.employeeStatutory)
			.where(eq(schema.employeeStatutory.employeeId, employeeId))
			.limit(1);

		let result: typeof schema.employeeStatutory.$inferSelect | undefined;
		if (existing.length === 0) {
			[result] = await db
				.insert(schema.employeeStatutory)
				.values({ id: createId(), employeeId, ...fields })
				.returning();
		} else {
			[result] = await db
				.update(schema.employeeStatutory)
				.set(fields)
				.where(eq(schema.employeeStatutory.employeeId, employeeId))
				.returning();
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "employee_statutory",
			entityId: employeeId,
			action: existing.length === 0 ? "create" : "update",
			actorId: actorId(context),
		});
		return result;
	});

// ─── Employee Documents ───────────────────────────────────

const documentsList = authorizedProcedure("employee", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) =>
		db
			.select()
			.from(schema.employeeDocument)
			.where(
				and(
					eq(schema.employeeDocument.employeeId, input.employeeId),
					eq(schema.employeeDocument.organizationId, orgId(context))
				)
			)
			.orderBy(desc(schema.employeeDocument.createdAt))
	);

const documentCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			employeeId: z.string(),
			title: z.string().min(3),
			fileUrl: z.string().optional(),
			fileName: z.string().optional(),
			fileSizeBytes: z.number().int().optional(),
			format: z.string().optional(),
			issueDate: z.string().optional(),
			expiryDate: z.string().optional(),
			notifyBeforeDays: z.number().int().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [doc] = await db
			.insert(schema.employeeDocument)
			.values({
				id,
				organizationId: orgId(context),
				employeeId: input.employeeId,
				title: input.title,
				fileUrl: input.fileUrl ?? null,
				fileName: input.fileName ?? null,
				fileSizeBytes: input.fileSizeBytes ?? null,
				format: input.format ?? null,
				status: input.fileUrl ? "uploaded" : "requested",
				issueDate: input.issueDate ? new Date(input.issueDate) : null,
				expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
				notifyBeforeDays: input.notifyBeforeDays ?? 30,
				uploadedBy: actorId(context),
			})
			.returning();
		return doc;
	});

const documentApprove = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [doc] = await db
			.update(schema.employeeDocument)
			.set({ status: "approved", approvedBy: actorId(context) })
			.where(
				and(
					eq(schema.employeeDocument.id, input.id),
					eq(schema.employeeDocument.organizationId, orgId(context))
				)
			)
			.returning();
		return doc;
	});

const documentReject = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const [doc] = await db
			.update(schema.employeeDocument)
			.set({ status: "rejected", rejectReason: input.reason })
			.where(
				and(
					eq(schema.employeeDocument.id, input.id),
					eq(schema.employeeDocument.organizationId, orgId(context))
				)
			)
			.returning();
		return doc;
	});

const documentDelete = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await db
			.delete(schema.employeeDocument)
			.where(
				and(
					eq(schema.employeeDocument.id, input.id),
					eq(schema.employeeDocument.organizationId, orgId(context))
				)
			);
		return { deleted: true };
	});

// ─── Holidays ─────────────────────────────────────────────

const holidayList = authorizedProcedure("employee", "read")
	.input(z.object({ year: z.number().int().optional() }))
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.holiday.organizationId, orgId(context))];
		if (input.year) {
			conditions.push(
				sql`EXTRACT(YEAR FROM ${schema.holiday.startDate}) = ${input.year}`
			);
		}
		return db
			.select()
			.from(schema.holiday)
			.where(and(...conditions))
			.orderBy(schema.holiday.startDate);
	});

const holidayCreate = authorizedProcedure("employee", "create")
	.input(
		z.object({
			name: z.string().min(1),
			startDate: z.string(),
			endDate: z.string().optional(),
			isRecurring: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		const [h] = await db
			.insert(schema.holiday)
			.values({
				id,
				organizationId: orgId(context),
				name: input.name,
				startDate: new Date(input.startDate),
				endDate: input.endDate ? new Date(input.endDate) : null,
				isRecurring: input.isRecurring,
			})
			.returning();
		return h;
	});

const holidayUpdate = authorizedProcedure("employee", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			startDate: z.string().optional(),
			endDate: z.string().nullable().optional(),
			isRecurring: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const updates: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updates.name = input.name;
		}
		if (input.startDate !== undefined) {
			updates.startDate = new Date(input.startDate);
		}
		if (input.endDate !== undefined) {
			updates.endDate = input.endDate ? new Date(input.endDate) : null;
		}
		if (input.isRecurring !== undefined) {
			updates.isRecurring = input.isRecurring;
		}
		const [updated] = await db
			.update(schema.holiday)
			.set(updates)
			.where(
				and(
					eq(schema.holiday.id, input.id),
					eq(schema.holiday.organizationId, orgId(context))
				)
			)
			.returning();
		return updated;
	});

const holidayDelete = authorizedProcedure("employee", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await db
			.delete(schema.holiday)
			.where(
				and(
					eq(schema.holiday.id, input.id),
					eq(schema.holiday.organizationId, orgId(context))
				)
			);
		return { deleted: true };
	});

// ─── Audit ────────────────────────────────────────────────

const auditList = tenantProcedure
	.input(
		z.object({
			entityType: z.string().optional(),
			entityId: z.string().optional(),
			actorId: z.string().optional(),
			page: z.number().int().min(1).optional().default(1),
			pageSize: z.number().int().min(1).max(100).optional().default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(schema.auditEvent.organizationId, orgId(context))];
		if (input.entityType) {
			conditions.push(eq(schema.auditEvent.entityType, input.entityType));
		}
		if (input.entityId) {
			conditions.push(eq(schema.auditEvent.entityId, input.entityId));
		}
		if (input.actorId) {
			conditions.push(eq(schema.auditEvent.actorId, input.actorId));
		}

		const where = and(...conditions);
		const offset = (input.page - 1) * input.pageSize;

		const [data, totalResult] = await Promise.all([
			db
				.select()
				.from(schema.auditEvent)
				.where(where)
				.orderBy(desc(schema.auditEvent.createdAt))
				.limit(input.pageSize)
				.offset(offset),
			db.select({ total: count() }).from(schema.auditEvent).where(where),
		]);

		return { data, total: totalResult[0]?.total ?? 0 };
	});

// ─── Export Router ────────────────────────────────────────

export const hrCoreRouter = {
	departments: {
		list: departmentList,
		getById: departmentGetById,
		create: departmentCreate,
		update: departmentUpdate,
		archive: departmentArchive,
	},
	jobPositions: {
		list: jobPositionList,
		getById: jobPositionGetById,
		create: jobPositionCreate,
		update: jobPositionUpdate,
		archive: jobPositionArchive,
	},
	jobRoles: {
		list: jobRoleList,
		create: jobRoleCreate,
		update: jobRoleUpdate,
		archive: jobRoleArchive,
	},
	workTypes: {
		list: workTypeList,
		create: workTypeCreate,
		update: workTypeUpdate,
		archive: workTypeArchive,
	},
	employeeTypes: {
		list: employeeTypeList,
		create: employeeTypeCreate,
		update: employeeTypeUpdate,
		archive: employeeTypeArchive,
	},
	shifts: {
		list: shiftList,
		getById: shiftGetById,
		create: shiftCreate,
		update: shiftUpdate,
		archive: shiftArchive,
		schedules: {
			list: shiftSchedulesList,
			upsert: shiftSchedulesUpsert,
		},
	},
	employees: {
		list: employeeList,
		getById: employeeGetById,
		orgChart: employeeOrgChart,
		create: employeeCreate,
		update: employeeUpdate,
		archive: employeeArchive,
		restore: employeeRestore,
		workInfo: {
			get: workInfoGet,
			update: workInfoUpdate,
		},
		bankDetails: {
			get: bankDetailsGet,
			update: bankDetailsUpdate,
		},
		statutory: {
			get: statutoryGet,
			update: statutoryUpdate,
		},
		documents: {
			list: documentsList,
			create: documentCreate,
			approve: documentApprove,
			reject: documentReject,
			delete: documentDelete,
		},
	},
	holidays: {
		list: holidayList,
		create: holidayCreate,
		update: holidayUpdate,
		delete: holidayDelete,
	},
	audit: {
		list: auditList,
	},
};
