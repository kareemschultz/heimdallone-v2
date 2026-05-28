import { db } from "@Heimdallone/db";
import {
	companyLeaveDay,
	department,
	employeeProfile,
	leaveAllocationRequest,
	leaveBalance,
	leaveRequest,
	leaveRequestApproval,
	leaveRestriction,
	leaveType,
} from "@Heimdallone/db/schema/index";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, tenantProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	canReadAllEmployees,
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

import { canManageHR } from "../utils/role-helpers";

async function scopedEmployeeIds(
	organizationId: string,
	userId: string,
	memberRole: string
): Promise<string[] | "all"> {
	if (canReadAllEmployees(memberRole)) {
		return "all";
	}
	const currentEmp = await resolveCurrentEmployee(organizationId, userId);
	if (!currentEmp) {
		return [];
	}
	if (memberRole === "manager") {
		const reportIds = await getDirectReportIds(currentEmp.id);
		return [currentEmp.id, ...reportIds];
	}
	return [currentEmp.id];
}

function scopeFilter(scope: string[] | "all", column: unknown) {
	if (scope === "all") {
		return;
	}
	if (scope.length === 0) {
		return sql`false`;
	}
	return sql`${column} IN (${sql.join(
		scope.map((id) => sql`${id}`),
		sql`, `
	)})`;
}

async function checkApprovalScope(
	context: {
		organizationId: string;
		session: { user: { id: string } };
	},
	targetEmployeeId: string
): Promise<void> {
	const r = role(context);
	if (canManageHR(r)) {
		return;
	}

	if (r === "manager") {
		const currentEmp = await resolveCurrentEmployee(
			context.organizationId,
			context.session.user.id
		);
		if (!currentEmp) {
			throw new ORPCError("FORBIDDEN", {
				message: "You don't have an employee profile in this organization.",
			});
		}
		const reportIds = await getDirectReportIds(currentEmp.id);
		if (!reportIds.includes(targetEmployeeId)) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"You can only approve or reject leave for your direct reports.",
			});
		}
		return;
	}

	throw new ORPCError("FORBIDDEN", {
		message: "Insufficient permission to perform this action.",
	});
}

const typesList = authorizedProcedure("leave_request", "read")
	.input(z.object({ includeInactive: z.boolean().optional().default(false) }))
	.handler(async ({ context, input }) => {
		const conditions = [eq(leaveType.organizationId, orgId(context))];
		if (!input.includeInactive) {
			conditions.push(eq(leaveType.isActive, true));
		}
		return db
			.select()
			.from(leaveType)
			.where(and(...conditions));
	});

const typesCreate = authorizedProcedure("holiday", "create")
	.input(
		z.object({
			name: z.string().min(1),
			color: z.string().default("#3b82f6"),
			isPaid: z.boolean().default(true),
			accrualAmount: z.string().default("1.00"),
			accrualPeriod: z.enum(["day", "month", "year"]).default("month"),
			limitDays: z.string().nullable().optional(),
			resetEnabled: z.boolean().default(true),
			resetBasis: z.enum(["yearly", "monthly", "weekly"]).default("yearly"),
			resetMonth: z.number().int().min(1).max(12).nullable().optional(),
			resetDay: z.number().int().min(1).max(31).nullable().optional(),
			carryForwardType: z
				.enum(["none", "carry", "carry_expire"])
				.default("none"),
			carryForwardMax: z.string().nullable().optional(),
			carryForwardExpiryDays: z.number().int().nullable().optional(),
			requireApproval: z.boolean().default(true),
			requireAttachment: z.boolean().default(false),
			excludeHolidays: z.boolean().default(true),
			excludeCompanyLeaves: z.boolean().default(true),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		await db.insert(leaveType).values({
			id,
			organizationId: orgId(context),
			...input,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_type",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { name: input.name },
		});

		return { id };
	});

const typesUpdate = authorizedProcedure("holiday", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			color: z.string().optional(),
			isPaid: z.boolean().optional(),
			accrualAmount: z.string().optional(),
			accrualPeriod: z.enum(["day", "month", "year"]).optional(),
			limitDays: z.string().nullable().optional(),
			resetEnabled: z.boolean().optional(),
			resetBasis: z.enum(["yearly", "monthly", "weekly"]).optional(),
			resetMonth: z.number().int().min(1).max(12).nullable().optional(),
			resetDay: z.number().int().min(1).max(31).nullable().optional(),
			carryForwardType: z.enum(["none", "carry", "carry_expire"]).optional(),
			carryForwardMax: z.string().nullable().optional(),
			carryForwardExpiryDays: z.number().int().nullable().optional(),
			requireApproval: z.boolean().optional(),
			requireAttachment: z.boolean().optional(),
			excludeHolidays: z.boolean().optional(),
			excludeCompanyLeaves: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const { id, ...updates } = input;
		const [existing] = await db
			.select()
			.from(leaveType)
			.where(
				and(eq(leaveType.id, id), eq(leaveType.organizationId, orgId(context)))
			)
			.limit(1);

		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Leave type not found." });
		}

		await db.update(leaveType).set(updates).where(eq(leaveType.id, id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_type",
			entityId: id,
			action: "update",
			actorId: actorId(context),
			metadata: { changes: updates },
		});

		return { id };
	});

const typesArchive = authorizedProcedure("holiday", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await db
			.update(leaveType)
			.set({ isActive: false })
			.where(
				and(
					eq(leaveType.id, input.id),
					eq(leaveType.organizationId, orgId(context))
				)
			);

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_type",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});

		return { id: input.id };
	});

const balancesList = authorizedProcedure("leave_request", "read")
	.input(
		z.object({
			employeeId: z.string().optional(),
			leaveTypeId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		const conditions: ReturnType<typeof eq>[] = [];

		if (input.employeeId) {
			conditions.push(eq(leaveBalance.employeeId, input.employeeId));
		}
		if (input.leaveTypeId) {
			conditions.push(eq(leaveBalance.leaveTypeId, input.leaveTypeId));
		}

		const sf = scopeFilter(scope, leaveBalance.employeeId);
		if (sf) {
			conditions.push(sf as never);
		}
		if (scope !== "all" && scope.length === 0) {
			return [];
		}

		return db
			.select({
				id: leaveBalance.id,
				employeeId: leaveBalance.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				leaveTypeId: leaveBalance.leaveTypeId,
				leaveTypeName: leaveType.name,
				leaveTypeColor: leaveType.color,
				leaveTypeIsPaid: leaveType.isPaid,
				availableDays: leaveBalance.availableDays,
				usedDays: leaveBalance.usedDays,
				carryForwardDays: leaveBalance.carryForwardDays,
				assignedDate: leaveBalance.assignedDate,
				resetDate: leaveBalance.resetDate,
				expiryDate: leaveBalance.expiryDate,
			})
			.from(leaveBalance)
			.innerJoin(
				employeeProfile,
				eq(leaveBalance.employeeId, employeeProfile.id)
			)
			.innerJoin(leaveType, eq(leaveBalance.leaveTypeId, leaveType.id))
			.where(conditions.length > 0 ? and(...conditions) : undefined);
	});

const balancesAssign = authorizedProcedure("holiday", "create")
	.input(
		z.object({
			employeeId: z.string(),
			leaveTypeId: z.string(),
			availableDays: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		const [emp] = await db
			.select({ id: employeeProfile.id })
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found.",
			});
		}

		const [lt] = await db
			.select({ id: leaveType.id })
			.from(leaveType)
			.where(
				and(
					eq(leaveType.id, input.leaveTypeId),
					eq(leaveType.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!lt) {
			throw new ORPCError("NOT_FOUND", {
				message: "Leave type not found.",
			});
		}

		const id = createId();
		await db
			.insert(leaveBalance)
			.values({
				id,
				employeeId: input.employeeId,
				leaveTypeId: input.leaveTypeId,
				availableDays: input.availableDays,
				assignedDate: new Date(),
			})
			.onConflictDoUpdate({
				target: [leaveBalance.employeeId, leaveBalance.leaveTypeId],
				set: { availableDays: input.availableDays },
			});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_balance",
			entityId: id,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "assign", ...input },
		});

		return { id };
	});

const balancesAdjust = authorizedProcedure("holiday", "update")
	.input(
		z.object({
			employeeId: z.string(),
			leaveTypeId: z.string(),
			adjustDays: z.string(),
			reason: z.string().min(1),
		})
	)
	.handler(async ({ context, input }) => {
		const [emp] = await db
			.select({ id: employeeProfile.id })
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found.",
			});
		}

		const [lt] = await db
			.select({ id: leaveType.id })
			.from(leaveType)
			.where(
				and(
					eq(leaveType.id, input.leaveTypeId),
					eq(leaveType.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!lt) {
			throw new ORPCError("NOT_FOUND", {
				message: "Leave type not found.",
			});
		}

		const [balance] = await db
			.select()
			.from(leaveBalance)
			.where(
				and(
					eq(leaveBalance.employeeId, input.employeeId),
					eq(leaveBalance.leaveTypeId, input.leaveTypeId)
				)
			)
			.limit(1);

		if (!balance) {
			throw new ORPCError("NOT_FOUND", {
				message: "No leave balance found for this employee and leave type.",
			});
		}

		const newAvailable = (
			Number(balance.availableDays) + Number(input.adjustDays)
		).toFixed(2);

		await db
			.update(leaveBalance)
			.set({ availableDays: newAvailable })
			.where(eq(leaveBalance.id, balance.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_balance",
			entityId: balance.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "availableDays",
					oldValue: balance.availableDays,
					newValue: newAvailable,
				},
			],
			metadata: { action: "adjust", reason: input.reason },
		});

		return { id: balance.id, availableDays: newAvailable };
	});

const requestsList = authorizedProcedure("leave_request", "read")
	.input(
		z.object({
			status: z
				.enum(["requested", "approved", "rejected", "cancelled"])
				.optional(),
			employeeId: z.string().optional(),
			leaveTypeId: z.string().optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		const conditions = [eq(leaveRequest.organizationId, orgId(context))];

		if (input.status) {
			conditions.push(eq(leaveRequest.status, input.status));
		}
		if (input.employeeId) {
			conditions.push(eq(leaveRequest.employeeId, input.employeeId));
		}
		if (input.leaveTypeId) {
			conditions.push(eq(leaveRequest.leaveTypeId, input.leaveTypeId));
		}
		if (input.startDate) {
			conditions.push(gte(leaveRequest.startDate, new Date(input.startDate)));
		}
		if (input.endDate) {
			conditions.push(lte(leaveRequest.endDate, new Date(input.endDate)));
		}

		const sf = scopeFilter(scope, leaveRequest.employeeId);
		if (sf) {
			conditions.push(sf as never);
		}
		if (scope !== "all" && scope.length === 0) {
			return { data: [], total: 0 };
		}

		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(leaveRequest)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;

		const data = await db
			.select({
				id: leaveRequest.id,
				employeeId: leaveRequest.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				leaveTypeId: leaveRequest.leaveTypeId,
				leaveTypeName: leaveType.name,
				leaveTypeColor: leaveType.color,
				leaveTypeIsPaid: leaveType.isPaid,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
				startBreakdown: leaveRequest.startBreakdown,
				endBreakdown: leaveRequest.endBreakdown,
				requestedDays: leaveRequest.requestedDays,
				description: leaveRequest.description,
				status: leaveRequest.status,
				rejectReason: leaveRequest.rejectReason,
				createdAt: leaveRequest.createdAt,
			})
			.from(leaveRequest)
			.innerJoin(
				employeeProfile,
				eq(leaveRequest.employeeId, employeeProfile.id)
			)
			.innerJoin(leaveType, eq(leaveRequest.leaveTypeId, leaveType.id))
			.where(where)
			.orderBy(desc(leaveRequest.createdAt))
			.limit(input.pageSize)
			.offset(offset);

		return { data, total: totalResult?.total ?? 0 };
	});

const requestsGetById = authorizedProcedure("leave_request", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [request] = await db
			.select()
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, input.id),
					eq(leaveRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!request) {
			throw new ORPCError("NOT_FOUND", { message: "Leave request not found." });
		}

		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		if (scope !== "all" && !scope.includes(request.employeeId)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You don't have access to this leave request.",
			});
		}

		const approvals = await db
			.select()
			.from(leaveRequestApproval)
			.where(eq(leaveRequestApproval.leaveRequestId, input.id));

		return { ...request, approvals };
	});

const requestsCreate = tenantProcedure
	.input(
		z.object({
			leaveTypeId: z.string(),
			startDate: z.string(),
			endDate: z.string(),
			startBreakdown: z
				.enum(["full_day", "first_half", "second_half"])
				.default("full_day"),
			endBreakdown: z
				.enum(["full_day", "first_half", "second_half"])
				.default("full_day"),
			requestedDays: z.string(),
			description: z.string().optional(),
			attachmentUrl: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		const [lt] = await db
			.select()
			.from(leaveType)
			.where(
				and(
					eq(leaveType.id, input.leaveTypeId),
					eq(leaveType.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!lt) {
			throw new ORPCError("NOT_FOUND", { message: "Leave type not found." });
		}

		const [balance] = await db
			.select()
			.from(leaveBalance)
			.where(
				and(
					eq(leaveBalance.employeeId, currentEmp.id),
					eq(leaveBalance.leaveTypeId, input.leaveTypeId)
				)
			)
			.limit(1);

		if (lt.isPaid && balance) {
			const totalAvailable =
				Number(balance.availableDays) + Number(balance.carryForwardDays);
			if (Number(input.requestedDays) > totalAvailable) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: `Insufficient leave balance. You have ${totalAvailable} days available but requested ${input.requestedDays} days.`,
				});
			}
		}

		const restrictions = await db
			.select()
			.from(leaveRestriction)
			.where(
				and(
					eq(leaveRestriction.organizationId, orgId(context)),
					lte(leaveRestriction.startDate, new Date(input.endDate)),
					gte(leaveRestriction.endDate, new Date(input.startDate))
				)
			);

		if (restrictions.length > 0) {
			const titles = restrictions.map((r) => r.title).join(", ");
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Leave requests are blocked during this period: ${titles}. Contact HR for exceptions.`,
			});
		}

		const id = createId();
		await db.insert(leaveRequest).values({
			id,
			organizationId: orgId(context),
			employeeId: currentEmp.id,
			leaveTypeId: input.leaveTypeId,
			startDate: new Date(input.startDate),
			endDate: new Date(input.endDate),
			startBreakdown: input.startBreakdown,
			endBreakdown: input.endBreakdown,
			requestedDays: input.requestedDays,
			description: input.description ?? null,
			attachmentUrl: input.attachmentUrl ?? null,
			status: "requested",
			createdBy: actorId(context),
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: {
				leaveType: lt.name,
				days: input.requestedDays,
				dates: `${input.startDate} to ${input.endDate}`,
			},
		});

		return { id };
	});

const requestsApprove = authorizedProcedure("leave_request", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [request] = await db
			.select()
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, input.id),
					eq(leaveRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!request) {
			throw new ORPCError("NOT_FOUND", { message: "Leave request not found." });
		}
		if (request.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This request has already been reviewed.",
			});
		}

		await checkApprovalScope(context, request.employeeId);

		await db
			.update(leaveRequest)
			.set({
				status: "approved",
				approvedBy: actorId(context),
				approvedAt: new Date(),
			})
			.where(eq(leaveRequest.id, input.id));

		const [balance] = await db
			.select()
			.from(leaveBalance)
			.where(
				and(
					eq(leaveBalance.employeeId, request.employeeId),
					eq(leaveBalance.leaveTypeId, request.leaveTypeId)
				)
			)
			.limit(1);

		if (balance) {
			const reqDays = Number(request.requestedDays);
			const deductFromAvailable = Math.min(
				reqDays,
				Number(balance.availableDays)
			);
			let deductFromCarry = reqDays - deductFromAvailable;
			if (deductFromCarry < 0) {
				deductFromCarry = 0;
			}

			const newAvailable = (
				Number(balance.availableDays) - deductFromAvailable
			).toFixed(2);
			const newCarry = (
				Number(balance.carryForwardDays) - deductFromCarry
			).toFixed(2);
			const newUsed = (Number(balance.usedDays) + reqDays).toFixed(2);

			await db
				.update(leaveBalance)
				.set({
					availableDays: newAvailable,
					carryForwardDays: newCarry,
					usedDays: newUsed,
				})
				.where(eq(leaveBalance.id, balance.id));
		}

		await db.insert(leaveRequestApproval).values({
			id: createId(),
			leaveRequestId: input.id,
			managerId: actorId(context),
			sequence: 1,
			isApproved: true,
			approvedAt: new Date(),
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "approved" },
			],
			metadata: { action: "approve", days: request.requestedDays },
		});

		return { id: input.id, status: "approved" as const };
	});

const requestsReject = authorizedProcedure("leave_request", "reject")
	.input(z.object({ id: z.string(), rejectReason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const [request] = await db
			.select()
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, input.id),
					eq(leaveRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!request) {
			throw new ORPCError("NOT_FOUND", { message: "Leave request not found." });
		}
		if (request.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This request has already been reviewed.",
			});
		}

		await checkApprovalScope(context, request.employeeId);

		await db
			.update(leaveRequest)
			.set({ status: "rejected", rejectReason: input.rejectReason })
			.where(eq(leaveRequest.id, input.id));

		await db.insert(leaveRequestApproval).values({
			id: createId(),
			leaveRequestId: input.id,
			managerId: actorId(context),
			sequence: 1,
			isRejected: true,
			approvedAt: new Date(),
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "rejected" },
			],
			metadata: { action: "reject", reason: input.rejectReason },
		});

		return { id: input.id, status: "rejected" as const };
	});

const requestsCancel = authorizedProcedure("leave_request", "cancel")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		const [request] = await db
			.select()
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, input.id),
					eq(leaveRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!request) {
			throw new ORPCError("NOT_FOUND", { message: "Leave request not found." });
		}

		const isHR = canManageHR(role(context));
		if (!isHR && request.employeeId !== currentEmp.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only cancel your own leave requests.",
			});
		}

		if (request.status === "approved" && !isHR) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Approved leave cannot be cancelled by employees. Contact HR to reverse this leave.",
			});
		}

		if (request.status === "rejected" || request.status === "cancelled") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This request has already been rejected or cancelled.",
			});
		}

		const wasApproved = request.status === "approved";

		await db
			.update(leaveRequest)
			.set({ status: "cancelled" })
			.where(eq(leaveRequest.id, input.id));

		if (wasApproved) {
			const [balance] = await db
				.select()
				.from(leaveBalance)
				.where(
					and(
						eq(leaveBalance.employeeId, request.employeeId),
						eq(leaveBalance.leaveTypeId, request.leaveTypeId)
					)
				)
				.limit(1);

			if (balance) {
				const reqDays = Number(request.requestedDays);
				const newAvailable = (Number(balance.availableDays) + reqDays).toFixed(
					2
				);
				const newUsed = Math.max(0, Number(balance.usedDays) - reqDays).toFixed(
					2
				);

				await db
					.update(leaveBalance)
					.set({ availableDays: newAvailable, usedDays: newUsed })
					.where(eq(leaveBalance.id, balance.id));
			}
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: request.status, newValue: "cancelled" },
			],
			metadata: { action: "cancel", balanceRestored: wasApproved },
		});

		return { id: input.id, status: "cancelled" as const };
	});

const allocationsCreate = tenantProcedure
	.input(
		z.object({
			leaveTypeId: z.string(),
			requestedDays: z.string(),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		const [lt] = await db
			.select({ id: leaveType.id })
			.from(leaveType)
			.where(
				and(
					eq(leaveType.id, input.leaveTypeId),
					eq(leaveType.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!lt) {
			throw new ORPCError("NOT_FOUND", {
				message: "Leave type not found.",
			});
		}

		const id = createId();
		await db.insert(leaveAllocationRequest).values({
			id,
			organizationId: orgId(context),
			employeeId: currentEmp.id,
			leaveTypeId: input.leaveTypeId,
			requestedDays: input.requestedDays,
			description: input.description ?? null,
			status: "requested",
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_allocation_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { days: input.requestedDays },
		});

		return { id };
	});

const allocationsList = authorizedProcedure("leave_request", "read")
	.input(
		z.object({
			status: z.enum(["requested", "approved", "rejected"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		const conditions = [
			eq(leaveAllocationRequest.organizationId, orgId(context)),
		];

		if (input.status) {
			conditions.push(eq(leaveAllocationRequest.status, input.status));
		}

		const sf = scopeFilter(scope, leaveAllocationRequest.employeeId);
		if (sf) {
			conditions.push(sf as never);
		}
		if (scope !== "all" && scope.length === 0) {
			return { data: [], total: 0 };
		}

		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(leaveAllocationRequest)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;

		const data = await db
			.select({
				id: leaveAllocationRequest.id,
				employeeId: leaveAllocationRequest.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				leaveTypeId: leaveAllocationRequest.leaveTypeId,
				leaveTypeName: leaveType.name,
				requestedDays: leaveAllocationRequest.requestedDays,
				description: leaveAllocationRequest.description,
				status: leaveAllocationRequest.status,
				rejectReason: leaveAllocationRequest.rejectReason,
				createdAt: leaveAllocationRequest.createdAt,
			})
			.from(leaveAllocationRequest)
			.innerJoin(
				employeeProfile,
				eq(leaveAllocationRequest.employeeId, employeeProfile.id)
			)
			.innerJoin(
				leaveType,
				eq(leaveAllocationRequest.leaveTypeId, leaveType.id)
			)
			.where(where)
			.orderBy(desc(leaveAllocationRequest.createdAt))
			.limit(input.pageSize)
			.offset(offset);

		return { data, total: totalResult?.total ?? 0 };
	});

const allocationsApprove = authorizedProcedure("leave_request", "approve")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageHR(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR admins can approve allocation requests.",
			});
		}

		const [alloc] = await db
			.select()
			.from(leaveAllocationRequest)
			.where(
				and(
					eq(leaveAllocationRequest.id, input.id),
					eq(leaveAllocationRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!alloc) {
			throw new ORPCError("NOT_FOUND", {
				message: "Allocation request not found.",
			});
		}
		if (alloc.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This allocation request has already been reviewed.",
			});
		}

		await db
			.update(leaveAllocationRequest)
			.set({ status: "approved", reviewedBy: actorId(context) })
			.where(eq(leaveAllocationRequest.id, input.id));

		const [balance] = await db
			.select()
			.from(leaveBalance)
			.where(
				and(
					eq(leaveBalance.employeeId, alloc.employeeId),
					eq(leaveBalance.leaveTypeId, alloc.leaveTypeId)
				)
			)
			.limit(1);

		if (balance) {
			const newAvailable = (
				Number(balance.availableDays) + Number(alloc.requestedDays)
			).toFixed(2);
			await db
				.update(leaveBalance)
				.set({ availableDays: newAvailable })
				.where(eq(leaveBalance.id, balance.id));
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_allocation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "approved" },
			],
			metadata: { days: alloc.requestedDays },
		});

		return { id: input.id, status: "approved" as const };
	});

const allocationsReject = authorizedProcedure("leave_request", "reject")
	.input(z.object({ id: z.string(), rejectReason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canManageHR(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR admins can reject allocation requests.",
			});
		}

		const [alloc] = await db
			.select()
			.from(leaveAllocationRequest)
			.where(
				and(
					eq(leaveAllocationRequest.id, input.id),
					eq(leaveAllocationRequest.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!alloc) {
			throw new ORPCError("NOT_FOUND", {
				message: "Allocation request not found.",
			});
		}
		if (alloc.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This allocation request has already been reviewed.",
			});
		}

		await db
			.update(leaveAllocationRequest)
			.set({
				status: "rejected",
				rejectReason: input.rejectReason,
				reviewedBy: actorId(context),
			})
			.where(eq(leaveAllocationRequest.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_allocation_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "rejected" },
			],
			metadata: { reason: input.rejectReason },
		});

		return { id: input.id, status: "rejected" as const };
	});

const restrictionsList = authorizedProcedure("leave_request", "read").handler(
	async ({ context }) =>
		db
			.select()
			.from(leaveRestriction)
			.where(eq(leaveRestriction.organizationId, orgId(context)))
);

const restrictionsCreate = authorizedProcedure("holiday", "create")
	.input(
		z.object({
			title: z.string().min(1),
			startDate: z.string(),
			endDate: z.string(),
			departmentId: z.string().nullable().optional(),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (input.departmentId) {
			const [dept] = await db
				.select({ id: department.id })
				.from(department)
				.where(
					and(
						eq(department.id, input.departmentId),
						eq(department.organizationId, orgId(context))
					)
				)
				.limit(1);
			if (!dept) {
				throw new ORPCError("NOT_FOUND", {
					message: "Department not found.",
				});
			}
		}

		const id = createId();
		await db.insert(leaveRestriction).values({
			id,
			organizationId: orgId(context),
			title: input.title,
			startDate: new Date(input.startDate),
			endDate: new Date(input.endDate),
			departmentId: input.departmentId ?? null,
			description: input.description ?? null,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_restriction",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { title: input.title },
		});

		return { id };
	});

const restrictionsDelete = authorizedProcedure("holiday", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await db
			.delete(leaveRestriction)
			.where(
				and(
					eq(leaveRestriction.id, input.id),
					eq(leaveRestriction.organizationId, orgId(context))
				)
			);

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "leave_restriction",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});

		return { id: input.id };
	});

const companyLeaveDaysList = authorizedProcedure(
	"leave_request",
	"read"
).handler(async ({ context }) =>
	db
		.select()
		.from(companyLeaveDay)
		.where(eq(companyLeaveDay.organizationId, orgId(context)))
);

const companyLeaveDaysCreate = authorizedProcedure("holiday", "create")
	.input(
		z.object({
			weekOfMonth: z.number().int().min(0).max(4).nullable().optional(),
			dayOfWeek: z.number().int().min(0).max(6),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		await db.insert(companyLeaveDay).values({
			id,
			organizationId: orgId(context),
			weekOfMonth: input.weekOfMonth ?? null,
			dayOfWeek: input.dayOfWeek,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "company_leave_day",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { dayOfWeek: input.dayOfWeek },
		});

		return { id };
	});

const companyLeaveDaysDelete = authorizedProcedure("holiday", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await db
			.delete(companyLeaveDay)
			.where(
				and(
					eq(companyLeaveDay.id, input.id),
					eq(companyLeaveDay.organizationId, orgId(context))
				)
			);

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "company_leave_day",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});

		return { id: input.id };
	});

const calendarData = authorizedProcedure("leave_request", "read")
	.input(
		z.object({
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);

		const conditions = [
			eq(leaveRequest.organizationId, orgId(context)),
			eq(leaveRequest.status, "approved"),
			lte(leaveRequest.startDate, new Date(input.endDate)),
			gte(leaveRequest.endDate, new Date(input.startDate)),
		];

		const sf = scopeFilter(scope, leaveRequest.employeeId);
		if (sf) {
			conditions.push(sf as never);
		}
		if (scope !== "all" && scope.length === 0) {
			return [];
		}

		return db
			.select({
				id: leaveRequest.id,
				employeeId: leaveRequest.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				leaveTypeName: leaveType.name,
				leaveTypeColor: leaveType.color,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
				requestedDays: leaveRequest.requestedDays,
			})
			.from(leaveRequest)
			.innerJoin(
				employeeProfile,
				eq(leaveRequest.employeeId, employeeProfile.id)
			)
			.innerJoin(leaveType, eq(leaveRequest.leaveTypeId, leaveType.id))
			.where(and(...conditions));
	});

export const leaveRouter = {
	types: {
		list: typesList,
		create: typesCreate,
		update: typesUpdate,
		archive: typesArchive,
	},
	balances: {
		list: balancesList,
		assign: balancesAssign,
		adjust: balancesAdjust,
	},
	requests: {
		list: requestsList,
		getById: requestsGetById,
		create: requestsCreate,
		approve: requestsApprove,
		reject: requestsReject,
		cancel: requestsCancel,
	},
	allocations: {
		list: allocationsList,
		create: allocationsCreate,
		approve: allocationsApprove,
		reject: allocationsReject,
	},
	restrictions: {
		list: restrictionsList,
		create: restrictionsCreate,
		delete: restrictionsDelete,
	},
	companyLeaveDays: {
		list: companyLeaveDaysList,
		create: companyLeaveDaysCreate,
		delete: companyLeaveDaysDelete,
	},
	calendar: calendarData,
};
