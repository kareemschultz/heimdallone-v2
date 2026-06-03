import { db } from "@Heimdallone/db";
import {
	department,
	employeeBankDetails,
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	countryPayrollProfile,
	loan,
	loanInstallment,
	payItem,
	payItemAssignment,
	payPeriod,
	payrollIssue,
	payrollPaymentBatch,
	payrollPaymentItem,
	payrollRun,
	payrollSetting,
	payslip,
	payslipLineItem,
	reimbursement,
} from "@Heimdallone/db/schema/payroll";
import { calculatePayroll } from "@Heimdallone/payroll-engine/calculate";
import { fromCents } from "@Heimdallone/payroll-engine/money";
import { calculateProjectedPay } from "@Heimdallone/payroll-engine/projected-pay";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, tenantProcedure } from "../index";
import { createAuditEvent, diffChanges } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
import { buildPayrollInput } from "../utils/payroll-input-builder";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

function maskAccountNumber(acctNum: string): string {
	if (acctNum.length > 4) {
		return `****${acctNum.slice(-4)}`;
	}
	if (acctNum) {
		return "****";
	}
	return "";
}

const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const CSV_NEEDS_QUOTE = /[",\n\r]/;

function csvCell(value: unknown): string {
	let s = String(value ?? "");
	if (CSV_FORMULA_TRIGGER.test(s)) {
		s = `'${s}`;
	}
	s = s.replace(/"/g, '""');
	if (CSV_NEEDS_QUOTE.test(s)) {
		return `"${s}"`;
	}
	return s;
}

import { canManagePayroll, isOwnerOrAdmin } from "../utils/role-helpers";

// ═══════════════════════════════════════════════════════════════
// 1. SETTINGS
// ═══════════════════════════════════════════════════════════════

const settingsGet = authorizedProcedure("payroll", "read").handler(
	async ({ context }) => {
		const [row] = await db
			.select()
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, orgId(context)))
			.limit(1);
		return row ?? null;
	}
);

const settingsUpdate = authorizedProcedure("payroll", "update")
	.input(
		z.object({
			defaultCurrency: z.string().optional(),
			defaultPayFrequency: z.string().optional(),
			weekdayOvertimeMultiplier: z.string().optional(),
			saturdayMultiplier: z.string().optional(),
			sundayMultiplier: z.string().optional(),
			publicHolidayMultiplier: z.string().optional(),
			nightShiftMultiplier: z.string().optional(),
			workDays: z.array(z.number()).optional(),
			standardHoursPerDay: z.string().optional(),
			lunchDeductionMinutes: z.number().int().optional(),
			minimumNetPayThreshold: z.string().nullable().optional(),
			paidHolidaysForHourly: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can update settings.",
			});
		}
		const [existing] = await db
			.select()
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, orgId(context)))
			.limit(1);

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payroll settings not found. Run initial setup first.",
			});
		}

		const changes = diffChanges(existing, input);
		await db
			.update(payrollSetting)
			.set({ ...input, updatedAt: new Date() })
			.where(eq(payrollSetting.id, existing.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_setting",
			entityId: existing.id,
			action: "update",
			actorId: actorId(context),
			changes,
		});

		return { id: existing.id };
	});

const settingsGetCountryProfile = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(countryPayrollProfile)
			.where(
				and(
					eq(countryPayrollProfile.id, input.id),
					eq(countryPayrollProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", {
				message: "Country payroll profile not found.",
			});
		}
		return row;
	});

const settingsListCountryProfiles = authorizedProcedure(
	"payroll",
	"read"
).handler(async ({ context }) =>
	db
		.select()
		.from(countryPayrollProfile)
		.where(eq(countryPayrollProfile.organizationId, orgId(context)))
		.orderBy(desc(countryPayrollProfile.effectiveYear))
);

// ═══════════════════════════════════════════════════════════════
// 2. PAY PERIODS
// ═══════════════════════════════════════════════════════════════

const payPeriodsList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			status: z.enum(["open", "processing", "closed"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(payPeriod.organizationId, orgId(context))];
		if (input.status) {
			conditions.push(eq(payPeriod.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(payPeriod)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(payPeriod)
			.where(where)
			.orderBy(desc(payPeriod.startDate))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const payPeriodsGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.id),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}
		return row;
	});

const payPeriodsCreate = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			name: z.string().min(1),
			startDate: z.string(),
			endDate: z.string(),
			payDate: z.string().nullable().optional(),
			frequency: z.string(),
			workingDays: z.number().int().min(1),
			expectedHours: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can create pay periods.",
			});
		}
		const id = createId();
		await db.insert(payPeriod).values({
			id,
			organizationId: orgId(context),
			name: input.name,
			startDate: new Date(input.startDate),
			endDate: new Date(input.endDate),
			payDate: input.payDate ? new Date(input.payDate) : null,
			frequency: input.frequency,
			workingDays: input.workingDays,
			expectedHours: input.expectedHours,
			status: "open",
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_period",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});

		return { id };
	});

const payPeriodsUpdate = authorizedProcedure("payroll", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().optional(),
			payDate: z.string().nullable().optional(),
			workingDays: z.number().int().optional(),
			expectedHours: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can update pay periods.",
			});
		}
		const [existing] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.id),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}
		if (existing.status === "closed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Cannot edit a closed pay period.",
			});
		}
		const { id: _id, ...updates } = input;
		await db
			.update(payPeriod)
			.set({
				...updates,
				payDate: input.payDate ? new Date(input.payDate) : undefined,
				updatedAt: new Date(),
			})
			.where(eq(payPeriod.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_period",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: diffChanges(
				existing as Record<string, unknown>,
				updates as Record<string, unknown>
			),
		});

		return { id: input.id };
	});

const payPeriodsClose = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can close pay periods.",
			});
		}
		const [existing] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.id),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}
		if (existing.status === "closed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Pay period is already closed.",
			});
		}
		await db
			.update(payPeriod)
			.set({ status: "closed", updatedAt: new Date() })
			.where(eq(payPeriod.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_period",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "closed" },
			],
		});

		return { id: input.id };
	});

const payPeriodsReopen = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.id),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}
		if (existing.status !== "closed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only closed pay periods can be reopened.",
			});
		}
		await db
			.update(payPeriod)
			.set({ status: "open", updatedAt: new Date() })
			.where(eq(payPeriod.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_period",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "closed", newValue: "open" }],
		});

		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// 3. PAY ITEMS
// ═══════════════════════════════════════════════════════════════

const payItemsList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			type: z.enum(["allowance", "deduction"]).optional(),
			includeInactive: z.boolean().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(payItem.organizationId, orgId(context))];
		if (input.type) {
			conditions.push(eq(payItem.type, input.type));
		}
		if (!input.includeInactive) {
			conditions.push(eq(payItem.isActive, true));
		}
		return await db
			.select()
			.from(payItem)
			.where(and(...conditions))
			.orderBy(payItem.sortOrder);
	});

const payItemsGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.id),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}
		const assignments = await db
			.select()
			.from(payItemAssignment)
			.where(eq(payItemAssignment.payItemId, row.id));
		return { ...row, assignments };
	});

const payItemsCreate = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			type: z.enum(["allowance", "deduction"]),
			category: z.string().default("custom"),
			title: z.string().min(1),
			description: z.string().nullable().optional(),
			isFixed: z.boolean().default(true),
			fixedAmount: z.string().nullable().optional(),
			basedOn: z.string().nullable().optional(),
			rate: z.string().nullable().optional(),
			isTaxable: z.boolean().default(true),
			isPreTax: z.boolean().default(false),
			isTax: z.boolean().default(false),
			isStatutory: z.boolean().default(false),
			employerRate: z.string().nullable().optional(),
			includeAllActive: z.boolean().default(true),
			maxAmount: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can create pay items.",
			});
		}
		const id = createId();
		await db.insert(payItem).values({
			id,
			organizationId: orgId(context),
			...input,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});

		return { id };
	});

const payItemsUpdate = authorizedProcedure("payroll", "update")
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			description: z.string().nullable().optional(),
			isFixed: z.boolean().optional(),
			fixedAmount: z.string().nullable().optional(),
			basedOn: z.string().nullable().optional(),
			rate: z.string().nullable().optional(),
			isTaxable: z.boolean().optional(),
			isPreTax: z.boolean().optional(),
			maxAmount: z.string().nullable().optional(),
			includeAllActive: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.id),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}
		const { id: _id, ...updates } = input;
		await db
			.update(payItem)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(payItem.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: diffChanges(existing, updates),
		});

		return { id: input.id };
	});

const payItemsArchive = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.id),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}
		await db
			.update(payItem)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(payItem.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});

		return { id: input.id };
	});

const payItemsAssignToEmployee = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			payItemId: z.string(),
			employeeId: z.string(),
			overrideAmount: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [pi] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.payItemId),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!pi) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}

		const [emp] = await db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		const id = createId();
		await db.insert(payItemAssignment).values({
			id,
			payItemId: input.payItemId,
			employeeId: input.employeeId,
			overrideAmount: input.overrideAmount ?? null,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item_assignment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { payItemId: input.payItemId, employeeId: input.employeeId },
		});

		return { id };
	});

const payItemsAssignToDepartment = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			payItemId: z.string(),
			departmentId: z.string(),
			overrideAmount: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [pi] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.payItemId),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!pi) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}

		const [dept] = await db
			.select()
			.from(department)
			.where(
				and(
					eq(department.id, input.departmentId),
					eq(department.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!dept) {
			throw new ORPCError("NOT_FOUND", { message: "Department not found." });
		}

		const id = createId();
		await db.insert(payItemAssignment).values({
			id,
			payItemId: input.payItemId,
			departmentId: input.departmentId,
			overrideAmount: input.overrideAmount ?? null,
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item_assignment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: {
				payItemId: input.payItemId,
				departmentId: input.departmentId,
			},
		});

		return { id };
	});

const payItemsRemoveAssignment = authorizedProcedure("payroll", "delete")
	.input(z.object({ id: z.string(), payItemId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [pi] = await db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.id, input.payItemId),
					eq(payItem.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!pi) {
			throw new ORPCError("NOT_FOUND", { message: "Pay item not found." });
		}

		await db
			.delete(payItemAssignment)
			.where(
				and(
					eq(payItemAssignment.id, input.id),
					eq(payItemAssignment.payItemId, input.payItemId)
				)
			);

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "pay_item_assignment",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});

		return { success: true };
	});

// ═══════════════════════════════════════════════════════════════
// 4. LOANS
// ═══════════════════════════════════════════════════════════════

const loansList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			employeeId: z.string().optional(),
			status: z.enum(["active", "settled", "written_off"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const conditions = [eq(loan.organizationId, orgId(context))];
		if (input.employeeId) {
			conditions.push(eq(loan.employeeId, input.employeeId));
		}
		if (input.status) {
			conditions.push(eq(loan.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(loan)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(loan)
			.where(where)
			.orderBy(desc(loan.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const loansGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(loan)
			.where(
				and(eq(loan.id, input.id), eq(loan.organizationId, orgId(context)))
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Loan not found." });
		}
		const installments = await db
			.select()
			.from(loanInstallment)
			.where(eq(loanInstallment.loanId, row.id))
			.orderBy(loanInstallment.sequenceNumber);
		return { ...row, installments };
	});

const loansCreate = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			employeeId: z.string(),
			type: z.enum(["loan", "advance", "fine"]),
			title: z.string().min(1),
			amount: z.string(),
			currency: z.string().default("GYD"),
			providedDate: z.string(),
			totalInstallments: z.number().int().min(1),
			installmentAmount: z.string(),
			installmentStartDate: z.string(),
			description: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [emp] = await db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		const loanId = createId();
		await db.insert(loan).values({
			id: loanId,
			organizationId: orgId(context),
			employeeId: input.employeeId,
			type: input.type,
			title: input.title,
			amount: input.amount,
			currency: input.currency,
			providedDate: new Date(input.providedDate),
			totalInstallments: input.totalInstallments,
			installmentAmount: input.installmentAmount,
			installmentStartDate: new Date(input.installmentStartDate),
			remainingBalance: input.amount,
			status: "active",
			approvedBy: actorId(context),
		});

		const startDate = new Date(input.installmentStartDate);
		for (let i = 1; i <= input.totalInstallments; i++) {
			const dueDate = new Date(startDate);
			dueDate.setMonth(dueDate.getMonth() + (i - 1));
			await db.insert(loanInstallment).values({
				id: createId(),
				loanId,
				sequenceNumber: i,
				dueDate,
				amount: input.installmentAmount,
				status: "pending",
			});
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "loan",
			entityId: loanId,
			action: "create",
			actorId: actorId(context),
			metadata: { employeeId: input.employeeId, amount: input.amount },
		});

		return { id: loanId };
	});

const loansSettle = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(loan)
			.where(
				and(eq(loan.id, input.id), eq(loan.organizationId, orgId(context)))
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Loan not found." });
		}
		if (existing.status !== "active") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Loan is not active.",
			});
		}
		await db
			.update(loan)
			.set({
				status: "settled",
				settledAt: new Date(),
				remainingBalance: "0",
				updatedAt: new Date(),
			})
			.where(eq(loan.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "loan",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "active", newValue: "settled" }],
		});

		return { id: input.id };
	});

const loansListInstallments = authorizedProcedure("payroll", "read")
	.input(z.object({ loanId: z.string() }))
	.handler(async ({ context, input }) => {
		const [l] = await db
			.select()
			.from(loan)
			.where(
				and(eq(loan.id, input.loanId), eq(loan.organizationId, orgId(context)))
			)
			.limit(1);
		if (!l) {
			throw new ORPCError("NOT_FOUND", { message: "Loan not found." });
		}
		return db
			.select()
			.from(loanInstallment)
			.where(eq(loanInstallment.loanId, input.loanId))
			.orderBy(loanInstallment.sequenceNumber);
	});

const loansSkipInstallment = authorizedProcedure("payroll", "update")
	.input(z.object({ installmentId: z.string(), loanId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [l] = await db
			.select()
			.from(loan)
			.where(
				and(eq(loan.id, input.loanId), eq(loan.organizationId, orgId(context)))
			)
			.limit(1);
		if (!l) {
			throw new ORPCError("NOT_FOUND", { message: "Loan not found." });
		}
		const [inst] = await db
			.select()
			.from(loanInstallment)
			.where(
				and(
					eq(loanInstallment.id, input.installmentId),
					eq(loanInstallment.loanId, input.loanId)
				)
			)
			.limit(1);
		if (!inst) {
			throw new ORPCError("NOT_FOUND", { message: "Installment not found." });
		}
		if (inst.status !== "pending") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Installment is not pending.",
			});
		}
		await db
			.update(loanInstallment)
			.set({ status: "skipped" })
			.where(eq(loanInstallment.id, input.installmentId));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "loan_installment",
			entityId: input.installmentId,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "pending", newValue: "skipped" }],
		});

		return { id: input.installmentId };
	});

// ═══════════════════════════════════════════════════════════════
// 5. REIMBURSEMENTS
// ═══════════════════════════════════════════════════════════════

const reimbursementsList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			employeeId: z.string().optional(),
			status: z.enum(["requested", "approved", "rejected", "paid"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const conditions = [eq(reimbursement.organizationId, orgId(context))];
		if (input.employeeId) {
			conditions.push(eq(reimbursement.employeeId, input.employeeId));
		}
		if (input.status) {
			conditions.push(eq(reimbursement.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(reimbursement)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(reimbursement)
			.where(where)
			.orderBy(desc(reimbursement.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const reimbursementsGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(reimbursement)
			.where(
				and(
					eq(reimbursement.id, input.id),
					eq(reimbursement.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Reimbursement not found." });
		}
		return row;
	});

const reimbursementsCreate = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			employeeId: z.string(),
			type: z.enum(["expense", "leave_encash", "bonus_encash"]),
			title: z.string().min(1),
			amount: z.string(),
			currency: z.string().default("GYD"),
			reimbursementDate: z.string(),
			description: z.string().nullable().optional(),
			attachmentUrl: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can create reimbursements.",
			});
		}
		const [emp] = await db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		const id = createId();
		await db.insert(reimbursement).values({
			id,
			organizationId: orgId(context),
			employeeId: input.employeeId,
			type: input.type,
			title: input.title,
			amount: input.amount,
			currency: input.currency,
			reimbursementDate: new Date(input.reimbursementDate),
			description: input.description ?? null,
			attachmentUrl: input.attachmentUrl ?? null,
			status: "requested",
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "reimbursement",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});

		return { id };
	});

const reimbursementsApprove = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(reimbursement)
			.where(
				and(
					eq(reimbursement.id, input.id),
					eq(reimbursement.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Reimbursement not found." });
		}
		if (existing.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Reimbursement is not in requested state.",
			});
		}
		await db
			.update(reimbursement)
			.set({
				status: "approved",
				approvedBy: actorId(context),
				approvedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(reimbursement.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "reimbursement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "approved" },
			],
		});

		return { id: input.id };
	});

const reimbursementsReject = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(reimbursement)
			.where(
				and(
					eq(reimbursement.id, input.id),
					eq(reimbursement.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Reimbursement not found." });
		}
		if (existing.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Reimbursement is not in requested state.",
			});
		}
		await db
			.update(reimbursement)
			.set({ status: "rejected", updatedAt: new Date() })
			.where(eq(reimbursement.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "reimbursement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "requested", newValue: "rejected" },
			],
		});

		return { id: input.id };
	});

const reimbursementsMarkPaid = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(reimbursement)
			.where(
				and(
					eq(reimbursement.id, input.id),
					eq(reimbursement.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Reimbursement not found." });
		}
		if (existing.status !== "approved") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Reimbursement must be approved first.",
			});
		}
		await db
			.update(reimbursement)
			.set({ status: "paid", updatedAt: new Date() })
			.where(eq(reimbursement.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "reimbursement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "approved", newValue: "paid" }],
		});

		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// 6. PAYROLL RUNS
// ═══════════════════════════════════════════════════════════════

const runsList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			payPeriodId: z.string().optional(),
			status: z
				.enum(["draft", "preview", "confirmed", "paid", "reversed"])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const conditions = [eq(payrollRun.organizationId, orgId(context))];
		if (input.payPeriodId) {
			conditions.push(eq(payrollRun.payPeriodId, input.payPeriodId));
		}
		if (input.status) {
			conditions.push(eq(payrollRun.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(payrollRun)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(payrollRun)
			.where(where)
			.orderBy(desc(payrollRun.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const runsGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [row] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.id),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}
		return row;
	});

const runsCreateDraft = authorizedProcedure("payroll", "create")
	.input(
		z.object({
			payPeriodId: z.string(),
			batchName: z.string().min(1),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only payroll administrators can create payroll runs.",
			});
		}
		const [period] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.payPeriodId),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!period) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}

		const [profile] = await db
			.select()
			.from(countryPayrollProfile)
			.where(
				and(
					eq(countryPayrollProfile.organizationId, orgId(context)),
					eq(countryPayrollProfile.isActive, true)
				)
			)
			.limit(1);

		const [settings] = await db
			.select()
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, orgId(context)))
			.limit(1);

		const id = createId();
		await db.insert(payrollRun).values({
			id,
			organizationId: orgId(context),
			payPeriodId: input.payPeriodId,
			batchName: input.batchName,
			status: "draft",
			currency: settings?.defaultCurrency ?? "GYD",
			countryProfileId: profile?.id ?? null,
			generatedBy: actorId(context),
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_run",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { payPeriodId: input.payPeriodId, batchName: input.batchName },
		});

		return { id };
	});

const runsPreview = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.id),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}
		if (run.status !== "draft" && run.status !== "preview") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Can only preview draft or re-preview runs.",
			});
		}

		const [period] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, run.payPeriodId),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!period) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}

		const allEmployees = await db
			.select({ id: employeeProfile.id })
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.organizationId, orgId(context)),
					eq(employeeProfile.isActive, true)
				)
			);

		const employeeIds = allEmployees.map((e) => e.id);

		await db.delete(payslip).where(eq(payslip.payrollRunId, run.id));
		await db.delete(payrollIssue).where(eq(payrollIssue.payrollRunId, run.id));

		let totalGross = 0;
		let totalDeductions = 0;
		let totalNet = 0;
		let totalEmployerContrib = 0;
		let blockerCount = 0;
		let warningCount = 0;
		let processedCount = 0;

		for (const empId of employeeIds) {
			const payrollInput = await buildPayrollInput(
				orgId(context),
				empId,
				period.id
			);
			const result = calculatePayroll(payrollInput);

			if (!payrollInput.contract.id) {
				for (const blocker of result.blockers) {
					await db.insert(payrollIssue).values({
						id: createId(),
						organizationId: orgId(context),
						payrollRunId: run.id,
						employeeId: empId,
						issueType: "blocker",
						code: blocker.code,
						message: blocker.message,
						resolution: blocker.resolution,
						status: "open",
					});
				}
				blockerCount += result.blockers.length;
				processedCount++;
				continue;
			}

			const payslipId = createId();
			await db.insert(payslip).values({
				id: payslipId,
				organizationId: orgId(context),
				payrollRunId: run.id,
				employeeId: empId,
				contractId: payrollInput.contract.id,
				periodStart: period.startDate,
				periodEnd: period.endDate,
				currency: result.currency,
				contractWage: String(fromCents(payrollInput.contract.baseSalary)),
				wageType: payrollInput.contract.wageType,
				basicPay: String(fromCents(result.basePay)),
				grossPay: String(fromCents(result.grossPay)),
				taxableGross: String(fromCents(result.taxableGross)),
				totalDeductions: String(fromCents(result.totalDeductions)),
				netPay: String(fromCents(result.netPay)),
				totalEmployerContributions: String(
					fromCents(result.totalEmployerContributions)
				),
				workedDays: String(
					payrollInput.attendance.daysPresent +
						payrollInput.attendance.daysHalfDay * 0.5
				),
				workedHours: String(payrollInput.attendance.totalWorkedMinutes / 60),
				overtimeHours: String(
					payrollInput.attendance.totalApprovedOvertimeMinutes / 60
				),
				paidLeaveDays: String(payrollInput.leave.paidLeaveDays),
				unpaidLeaveDays: String(payrollInput.leave.unpaidLeaveDays),
				holidayDays: payrollInput.holidays.count,
				status: "draft",
				explanation: result.explanation,
				blockers: result.blockers,
				warnings: result.warnings,
			});

			for (const lineItem of result.lineItems) {
				await db.insert(payslipLineItem).values({
					id: createId(),
					payslipId,
					payItemId: lineItem.payItemId,
					type: lineItem.type,
					category: lineItem.category,
					title: lineItem.title,
					amount: String(fromCents(lineItem.amount)),
					isEmployerContribution: lineItem.isEmployerContribution,
					isTaxable: lineItem.isTaxable,
					explanation: lineItem.explanation,
					sortOrder: lineItem.sortOrder,
				});
			}

			for (const blocker of result.blockers) {
				await db.insert(payrollIssue).values({
					id: createId(),
					organizationId: orgId(context),
					payrollRunId: run.id,
					employeeId: empId,
					issueType: "blocker",
					code: blocker.code,
					message: blocker.message,
					resolution: blocker.resolution,
					status: "open",
				});
			}

			for (const warning of result.warnings) {
				await db.insert(payrollIssue).values({
					id: createId(),
					organizationId: orgId(context),
					payrollRunId: run.id,
					employeeId: empId,
					issueType: "warning",
					code: warning.code,
					message: warning.message,
					resolution: warning.suggestedAction,
					status: "open",
				});
			}

			totalGross += result.grossPay;
			totalDeductions += result.totalDeductions;
			totalNet += result.netPay;
			totalEmployerContrib += result.totalEmployerContributions;
			blockerCount += result.blockers.length;
			warningCount += result.warnings.length;
			processedCount++;
		}

		await db
			.update(payrollRun)
			.set({
				status: "preview",
				employeeCount: processedCount,
				totalGross: String(fromCents(totalGross)),
				totalDeductions: String(fromCents(totalDeductions)),
				totalNet: String(fromCents(totalNet)),
				totalEmployerContributions: String(fromCents(totalEmployerContrib)),
				blockerCount,
				warningCount,
				updatedAt: new Date(),
			})
			.where(eq(payrollRun.id, run.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_run",
			entityId: run.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: run.status, newValue: "preview" }],
			metadata: { employeeCount: processedCount, blockerCount, warningCount },
		});

		return {
			id: run.id,
			employeeCount: processedCount,
			totalGross: fromCents(totalGross),
			totalDeductions: fromCents(totalDeductions),
			totalNet: fromCents(totalNet),
			blockerCount,
			warningCount,
		};
	});

const runsConfirm = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.id),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}
		if (run.status !== "preview") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Payroll run must be in preview state to confirm.",
			});
		}
		// Count OPEN blocker issues live so resolving/overriding an issue (e.g. an
		// attendance exception blocker) actually unblocks confirmation — the run's
		// stored blockerCount is a snapshot from preview and goes stale on override.
		const [openBlockers] = await db
			.select({ n: count() })
			.from(payrollIssue)
			.where(
				and(
					eq(payrollIssue.payrollRunId, input.id),
					eq(payrollIssue.issueType, "blocker"),
					eq(payrollIssue.status, "open")
				)
			);
		const unresolvedBlockers = openBlockers?.n ?? 0;
		if (unresolvedBlockers > 0) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Cannot confirm: ${unresolvedBlockers} unresolved blocker(s).`,
			});
		}

		await db
			.update(payrollRun)
			.set({
				status: "confirmed",
				confirmedAt: new Date(),
				confirmedBy: actorId(context),
				updatedAt: new Date(),
			})
			.where(eq(payrollRun.id, input.id));
		await db
			.update(payslip)
			.set({ status: "confirmed" })
			.where(eq(payslip.payrollRunId, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_run",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "preview", newValue: "confirmed" },
			],
		});

		return { id: input.id };
	});

const runsMarkPaid = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.id),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}
		if (run.status !== "confirmed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Payroll run must be confirmed before marking as paid.",
			});
		}

		// Phase 8J.3 fix #5: Don't allow the payroll run to be marked paid
		// without a matching paid payment batch. Direct markPaid bypassed the
		// bank-confirmation gate the payment-batches workflow exists for.
		// Cancellation flow: cancel the run instead; do not mark it paid.
		const paidBatches = await db
			.select({ id: payrollPaymentBatch.id })
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.payrollRunId, run.id),
					eq(payrollPaymentBatch.organizationId, orgId(context)),
					eq(payrollPaymentBatch.status, "paid")
				)
			)
			.limit(1);
		if (paidBatches.length === 0) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Mark a payment batch as paid first (after bank confirmation). Payroll runs cannot be marked paid directly.",
			});
		}

		await db
			.update(payrollRun)
			.set({
				status: "paid",
				paidAt: new Date(),
				paidBy: actorId(context),
				updatedAt: new Date(),
			})
			.where(eq(payrollRun.id, input.id));
		await db
			.update(payslip)
			.set({ status: "paid" })
			.where(eq(payslip.payrollRunId, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_run",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "confirmed", newValue: "paid" }],
		});

		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// 7. PAYSLIPS
// ═══════════════════════════════════════════════════════════════

const payslipsList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			payrollRunId: z.string().optional(),
			employeeId: z.string().optional(),
			status: z.enum(["draft", "confirmed", "paid"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const conditions = [eq(payslip.organizationId, orgId(context))];
		if (input.payrollRunId) {
			conditions.push(eq(payslip.payrollRunId, input.payrollRunId));
		}
		if (input.employeeId) {
			conditions.push(eq(payslip.employeeId, input.employeeId));
		}
		if (input.status) {
			conditions.push(eq(payslip.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(payslip)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(payslip)
			.where(where)
			.orderBy(desc(payslip.generatedAt))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const payslipsGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [row] = await db
			.select()
			.from(payslip)
			.where(
				and(
					eq(payslip.id, input.id),
					eq(payslip.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Payslip not found." });
		}
		const lineItems = await db
			.select()
			.from(payslipLineItem)
			.where(eq(payslipLineItem.payslipId, row.id))
			.orderBy(payslipLineItem.sortOrder);
		return { ...row, lineItems };
	});

const payslipsGetOwn = tenantProcedure
	.input(
		z.object({
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const emp = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!emp) {
			return { data: [], total: 0 };
		}

		const conditions = [
			eq(payslip.organizationId, orgId(context)),
			eq(payslip.employeeId, emp.id),
			inArray(payslip.status, ["confirmed", "paid"]),
		];
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(payslip)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(payslip)
			.where(where)
			.orderBy(desc(payslip.periodEnd))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const payslipsGetOwnById = tenantProcedure
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const emp = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Payslip not found." });
		}

		const [row] = await db
			.select()
			.from(payslip)
			.where(
				and(
					eq(payslip.id, input.id),
					eq(payslip.organizationId, orgId(context)),
					eq(payslip.employeeId, emp.id),
					inArray(payslip.status, ["confirmed", "paid"])
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Payslip not found." });
		}
		const lineItems = await db
			.select()
			.from(payslipLineItem)
			.where(eq(payslipLineItem.payslipId, row.id))
			.orderBy(payslipLineItem.sortOrder);
		return { ...row, lineItems };
	});

const payslipsPreviewEmployee = authorizedProcedure("payroll", "read")
	.input(z.object({ employeeId: z.string(), payPeriodId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [emp] = await db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		const [period] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.payPeriodId),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!period) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}

		const payrollInput = await buildPayrollInput(
			orgId(context),
			input.employeeId,
			input.payPeriodId
		);
		const result = calculatePayroll(payrollInput);

		return {
			...result,
			basePay: fromCents(result.basePay),
			overtimePay: fromCents(result.overtimePay),
			taxableAllowances: fromCents(result.taxableAllowances),
			nonTaxableAllowances: fromCents(result.nonTaxableAllowances),
			grossPay: fromCents(result.grossPay),
			taxableGross: fromCents(result.taxableGross),
			employeeNis: fromCents(result.employeeNis),
			employerNis: fromCents(result.employerNis),
			paye: fromCents(result.paye),
			totalDeductions: fromCents(result.totalDeductions),
			reimbursements: fromCents(result.reimbursements),
			netPay: fromCents(result.netPay),
			totalEmployerContributions: fromCents(result.totalEmployerContributions),
			lineItems: result.lineItems.map((li) => ({
				...li,
				amount: fromCents(li.amount),
			})),
		};
	});

// ═══════════════════════════════════════════════════════════════
// 8. ISSUES
// ═══════════════════════════════════════════════════════════════

const issuesList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			payrollRunId: z.string().optional(),
			issueType: z.enum(["blocker", "warning"]).optional(),
			status: z
				.enum(["open", "acknowledged", "resolved", "overridden"])
				.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const conditions = [eq(payrollIssue.organizationId, orgId(context))];
		if (input.payrollRunId) {
			conditions.push(eq(payrollIssue.payrollRunId, input.payrollRunId));
		}
		if (input.issueType) {
			conditions.push(eq(payrollIssue.issueType, input.issueType));
		}
		if (input.status) {
			conditions.push(eq(payrollIssue.status, input.status));
		}
		return await db
			.select()
			.from(payrollIssue)
			.where(and(...conditions))
			.orderBy(payrollIssue.createdAt);
	});

const issuesAcknowledge = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [existing] = await db
			.select()
			.from(payrollIssue)
			.where(
				and(
					eq(payrollIssue.id, input.id),
					eq(payrollIssue.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Issue not found." });
		}
		await db
			.update(payrollIssue)
			.set({ status: "acknowledged", updatedAt: new Date() })
			.where(eq(payrollIssue.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_issue",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "status",
					oldValue: existing.status,
					newValue: "acknowledged",
				},
			],
		});

		return { id: input.id };
	});

const issuesResolve = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [existing] = await db
			.select()
			.from(payrollIssue)
			.where(
				and(
					eq(payrollIssue.id, input.id),
					eq(payrollIssue.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Issue not found." });
		}
		await db
			.update(payrollIssue)
			.set({
				status: "resolved",
				resolvedAt: new Date(),
				resolvedBy: actorId(context),
				updatedAt: new Date(),
			})
			.where(eq(payrollIssue.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_issue",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "resolved" },
			],
		});

		return { id: input.id };
	});

const issuesOverride = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!isOwnerOrAdmin(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only org admins can override payroll issues.",
			});
		}
		const [existing] = await db
			.select()
			.from(payrollIssue)
			.where(
				and(
					eq(payrollIssue.id, input.id),
					eq(payrollIssue.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Issue not found." });
		}
		await db
			.update(payrollIssue)
			.set({
				status: "overridden",
				overriddenBy: actorId(context),
				overrideReason: input.reason,
				updatedAt: new Date(),
			})
			.where(eq(payrollIssue.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payroll_issue",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: existing.status, newValue: "overridden" },
			],
			metadata: { overrideReason: input.reason },
		});

		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// 9. PROJECTED PAY
// ═══════════════════════════════════════════════════════════════

const projectedPayForEmployee = authorizedProcedure("payroll", "read")
	.input(z.object({ employeeId: z.string(), payPeriodId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [emp] = await db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!emp) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
		}

		const [period] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.payPeriodId),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!period) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}

		const payrollInput = await buildPayrollInput(
			orgId(context),
			input.employeeId,
			input.payPeriodId
		);
		const result = calculateProjectedPay(payrollInput);

		return {
			...result,
			estimatedGross: fromCents(result.estimatedGross),
			estimatedDeductions: fromCents(result.estimatedDeductions),
			estimatedNet: fromCents(result.estimatedNet),
			breakdown: {
				basePay: fromCents(result.breakdown.basePay),
				overtimePay: fromCents(result.breakdown.overtimePay),
				allowances: fromCents(result.breakdown.allowances),
				deductions: fromCents(result.breakdown.deductions),
				tax: fromCents(result.breakdown.tax),
				loanDeductions: fromCents(result.breakdown.loanDeductions),
			},
		};
	});

const projectedPayOwn = tenantProcedure
	.input(z.object({ payPeriodId: z.string() }))
	.handler(async ({ context, input }) => {
		const emp = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!emp) {
			throw new ORPCError("NOT_FOUND", {
				message: "No employee profile found.",
			});
		}

		const [period] = await db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, input.payPeriodId),
					eq(payPeriod.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!period) {
			throw new ORPCError("NOT_FOUND", { message: "Pay period not found." });
		}

		const payrollInput = await buildPayrollInput(
			orgId(context),
			emp.id,
			input.payPeriodId
		);
		const result = calculateProjectedPay(payrollInput);

		return {
			...result,
			estimatedGross: fromCents(result.estimatedGross),
			estimatedDeductions: fromCents(result.estimatedDeductions),
			estimatedNet: fromCents(result.estimatedNet),
			breakdown: {
				basePay: fromCents(result.breakdown.basePay),
				overtimePay: fromCents(result.breakdown.overtimePay),
				allowances: fromCents(result.breakdown.allowances),
				deductions: fromCents(result.breakdown.deductions),
				tax: fromCents(result.breakdown.tax),
				loanDeductions: fromCents(result.breakdown.loanDeductions),
			},
		};
	});

// ═══════════════════════════════════════════════════════════════
// 10. REPORTS
// ═══════════════════════════════════════════════════════════════

const reportsDashboardSummary = authorizedProcedure("payroll", "read").handler(
	async ({ context }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const org = orgId(context);

		const [runsCount] = await db
			.select({ total: count() })
			.from(payrollRun)
			.where(eq(payrollRun.organizationId, org));
		const [openPeriods] = await db
			.select({ total: count() })
			.from(payPeriod)
			.where(
				and(eq(payPeriod.organizationId, org), eq(payPeriod.status, "open"))
			);
		const [activeLoans] = await db
			.select({ total: count() })
			.from(loan)
			.where(and(eq(loan.organizationId, org), eq(loan.status, "active")));
		const [pendingReimb] = await db
			.select({ total: count() })
			.from(reimbursement)
			.where(
				and(
					eq(reimbursement.organizationId, org),
					eq(reimbursement.status, "requested")
				)
			);

		const latestRun = await db
			.select({
				id: payrollRun.id,
				batchName: payrollRun.batchName,
				status: payrollRun.status,
				totalGross: payrollRun.totalGross,
				totalNet: payrollRun.totalNet,
				employeeCount: payrollRun.employeeCount,
			})
			.from(payrollRun)
			.where(eq(payrollRun.organizationId, org))
			.orderBy(desc(payrollRun.createdAt))
			.limit(1)
			.then((r) => r[0] ?? null);

		return {
			totalRuns: runsCount?.total ?? 0,
			openPeriods: openPeriods?.total ?? 0,
			activeLoans: activeLoans?.total ?? 0,
			pendingReimbursements: pendingReimb?.total ?? 0,
			latestRun,
		};
	}
);

const reportsCostByDepartment = authorizedProcedure("payroll", "read")
	.input(z.object({ payrollRunId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.payrollRunId),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}

		const results = await db
			.select({
				departmentId: employeeWorkInfo.departmentId,
				departmentName: department.name,
				totalGross: sql<string>`sum(${payslip.grossPay})`,
				totalNet: sql<string>`sum(${payslip.netPay})`,
				employeeCount: count(),
			})
			.from(payslip)
			.innerJoin(
				employeeWorkInfo,
				eq(payslip.employeeId, employeeWorkInfo.employeeId)
			)
			.leftJoin(department, eq(employeeWorkInfo.departmentId, department.id))
			.where(eq(payslip.payrollRunId, input.payrollRunId))
			.groupBy(employeeWorkInfo.departmentId, department.name);

		return results;
	});

const reportsBlockersSummary = authorizedProcedure("payroll", "read")
	.input(z.object({ payrollRunId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.payrollRunId),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}

		const results = await db
			.select({
				code: payrollIssue.code,
				issueType: payrollIssue.issueType,
				total: count(),
			})
			.from(payrollIssue)
			.where(eq(payrollIssue.payrollRunId, input.payrollRunId))
			.groupBy(payrollIssue.code, payrollIssue.issueType);

		return results;
	});

// ═══════════════════════════════════════════════════════════════
// 11. PAYMENT BATCHES
// ═══════════════════════════════════════════════════════════════

const paymentBatchesList = authorizedProcedure("payroll", "read")
	.input(
		z.object({
			status: z
				.enum([
					"draft",
					"reviewed",
					"exported",
					"submitted",
					"paid",
					"partially_paid",
					"failed",
					"cancelled",
				])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const conditions = [eq(payrollPaymentBatch.organizationId, orgId(context))];
		if (input.status) {
			conditions.push(eq(payrollPaymentBatch.status, input.status));
		}
		const where = and(...conditions);
		const [totalResult] = await db
			.select({ total: count() })
			.from(payrollPaymentBatch)
			.where(where);
		const offset = (input.page - 1) * input.pageSize;
		const data = await db
			.select()
			.from(payrollPaymentBatch)
			.where(where)
			.orderBy(desc(payrollPaymentBatch.createdAt))
			.limit(input.pageSize)
			.offset(offset);
		return { data, total: totalResult?.total ?? 0 };
	});

const paymentBatchesGetById = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [row] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		const items = await db
			.select()
			.from(payrollPaymentItem)
			.where(eq(payrollPaymentItem.paymentBatchId, row.id))
			.orderBy(payrollPaymentItem.employeeName);
		return { ...row, items };
	});

const paymentBatchesCreate = authorizedProcedure("payroll", "create")
	.input(z.object({ payrollRunId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [run] = await db
			.select()
			.from(payrollRun)
			.where(
				and(
					eq(payrollRun.id, input.payrollRunId),
					eq(payrollRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!run) {
			throw new ORPCError("NOT_FOUND", { message: "Payroll run not found." });
		}
		if (run.status !== "confirmed" && run.status !== "paid") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Payment batch can only be created from a confirmed or paid payroll run.",
			});
		}

		// Phase 8J.3 fix #4: Block creating a new payment batch when a
		// non-terminal batch already exists for this run. "Terminal" =
		// paid / cancelled / failed. Re-exporting after a successful paid
		// batch still requires explicit cancellation + a new batch — we
		// don't silently overwrite payment history.
		const existingBatches = await db
			.select({
				id: payrollPaymentBatch.id,
				status: payrollPaymentBatch.status,
			})
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.payrollRunId, run.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			);
		const TERMINAL_BATCH_STATUSES = ["cancelled", "failed"];
		const blockingBatch = existingBatches.find(
			(b) => !TERMINAL_BATCH_STATUSES.includes(b.status)
		);
		if (blockingBatch) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `A payment batch already exists for this payroll run (status: ${blockingBatch.status}). Cancel it first or work with the existing batch.`,
			});
		}

		const payslips = await db
			.select()
			.from(payslip)
			.where(
				and(
					eq(payslip.payrollRunId, run.id),
					eq(payslip.organizationId, orgId(context))
				)
			);

		const batchId = createId();
		let totalAmount = 0;

		await db.insert(payrollPaymentBatch).values({
			id: batchId,
			organizationId: orgId(context),
			payrollRunId: run.id,
			payPeriodId: run.payPeriodId,
			status: "draft",
			totalEmployees: payslips.length,
			totalAmount: "0",
			currency: run.currency,
			createdBy: actorId(context),
		});

		for (const ps of payslips) {
			const netPay = Number(ps.netPay);
			if (netPay <= 0) {
				continue;
			}

			const [bank] = await db
				.select()
				.from(employeeBankDetails)
				.where(eq(employeeBankDetails.employeeId, ps.employeeId))
				.limit(1);

			const [emp] = await db
				.select({
					firstName: employeeProfile.firstName,
					lastName: employeeProfile.lastName,
				})
				.from(employeeProfile)
				.where(eq(employeeProfile.id, ps.employeeId))
				.limit(1);

			const empName = emp
				? `${emp.firstName} ${emp.lastName ?? ""}`.trim()
				: ps.employeeId;
			const acctNum = bank?.accountNumber ?? "";
			const masked = maskAccountNumber(acctNum);

			totalAmount += netPay;

			await db.insert(payrollPaymentItem).values({
				id: createId(),
				organizationId: orgId(context),
				paymentBatchId: batchId,
				payslipId: ps.id,
				employeeId: ps.employeeId,
				employeeName: empName,
				bankName: bank?.bankName ?? null,
				branchCode: bank?.branch ?? null,
				accountNumberMasked: masked,
				accountHolderName: bank ? empName : null,
				amount: String(netPay),
				currency: ps.currency,
				paymentReference: `PAY-${run.id.slice(0, 8)}-${ps.employeeId.slice(0, 6)}`,
				status: "pending",
			});
		}

		await db
			.update(payrollPaymentBatch)
			.set({ totalAmount: String(totalAmount), updatedAt: new Date() })
			.where(eq(payrollPaymentBatch.id, batchId));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: batchId,
			action: "create",
			actorId: actorId(context),
			metadata: {
				payrollRunId: run.id,
				totalEmployees: payslips.length,
				totalAmount,
			},
		});

		return { id: batchId };
	});

const paymentBatchesMarkReviewed = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		if (batch.status !== "draft") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only draft batches can be marked as reviewed.",
			});
		}
		await db
			.update(payrollPaymentBatch)
			.set({ status: "reviewed", updatedAt: new Date() })
			.where(eq(payrollPaymentBatch.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "draft", newValue: "reviewed" }],
		});
		return { id: input.id };
	});

const paymentBatchesMarkExported = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		if (batch.status !== "reviewed") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only reviewed batches can be exported.",
			});
		}
		await db
			.update(payrollPaymentBatch)
			.set({
				status: "exported",
				exportedBy: actorId(context),
				exportedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(payrollPaymentBatch.id, input.id));
		await db
			.update(payrollPaymentItem)
			.set({ status: "exported" })
			.where(eq(payrollPaymentItem.paymentBatchId, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "reviewed", newValue: "exported" },
			],
		});
		return { id: input.id };
	});

const paymentBatchesMarkSubmitted = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		if (batch.status !== "exported") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only exported batches can be marked as submitted.",
			});
		}
		await db
			.update(payrollPaymentBatch)
			.set({
				status: "submitted",
				submittedBy: actorId(context),
				submittedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(payrollPaymentBatch.id, input.id));
		await db
			.update(payrollPaymentItem)
			.set({ status: "submitted" })
			.where(eq(payrollPaymentItem.paymentBatchId, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{ field: "status", oldValue: "exported", newValue: "submitted" },
			],
		});
		return { id: input.id };
	});

const paymentBatchesMarkPaid = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		if (batch.status !== "submitted") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Only submitted batches can be marked as paid. Upload the file to your bank first.",
			});
		}
		await db
			.update(payrollPaymentBatch)
			.set({
				status: "paid",
				markedPaidBy: actorId(context),
				markedPaidAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(payrollPaymentBatch.id, input.id));
		await db
			.update(payrollPaymentItem)
			.set({ status: "paid" })
			.where(eq(payrollPaymentItem.paymentBatchId, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "submitted", newValue: "paid" }],
		});
		return { id: input.id };
	});

const paymentBatchesMarkFailed = authorizedProcedure("payroll", "update")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		if (["paid", "cancelled", "failed"].includes(batch.status)) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Cannot mark a ${batch.status} batch as failed.`,
			});
		}
		await db
			.update(payrollPaymentBatch)
			.set({
				status: "failed",
				failureReason: input.reason,
				updatedAt: new Date(),
			})
			.where(eq(payrollPaymentBatch.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [
				{
					field: "status",
					oldValue: batch.status,
					newValue: "failed",
				},
			],
			metadata: { failureReason: input.reason },
		});
		return { id: input.id };
	});

const paymentBatchesGenerateCsv = authorizedProcedure("payroll", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [batch] = await db
			.select()
			.from(payrollPaymentBatch)
			.where(
				and(
					eq(payrollPaymentBatch.id, input.id),
					eq(payrollPaymentBatch.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!batch) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment batch not found.",
			});
		}
		const items = await db
			.select()
			.from(payrollPaymentItem)
			.where(eq(payrollPaymentItem.paymentBatchId, batch.id))
			.orderBy(payrollPaymentItem.employeeName);

		// Phase 8J.3 fix #6: Header used to say "accountNumber" while the
		// data is masked (****1234). Rename to make the preview status
		// explicit — full account numbers are NEVER produced by this
		// procedure. A real bank-ready export requires per-bank format
		// specs (Republic Bank / EZPay) and is deferred.
		const header =
			"employeeId,employeeName,bankName,branchCode,accountNumberMasked,currency,amount,paymentReference";
		const rows = items.map((item) =>
			[
				csvCell(item.employeeId),
				csvCell(item.employeeName),
				csvCell(item.bankName ?? ""),
				csvCell(item.branchCode ?? ""),
				csvCell(item.accountNumberMasked ?? ""),
				csvCell(item.currency),
				csvCell(item.amount),
				csvCell(item.paymentReference ?? ""),
			].join(",")
		);

		const csv = [header, ...rows].join("\n");

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "payment_batch",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "csv_generated", rowCount: items.length },
		});

		return {
			csv,
			// Phase 8J.3 fix #6: prefix "preview-" so users don't mistake this
			// for a bank-ready file. Real bank exports need per-bank format specs.
			fileName: `payment-batch-${batch.id.slice(0, 8)}-preview.csv`,
			rowCount: items.length,
			totalAmount: batch.totalAmount,
		};
	});

// ═══════════════════════════════════════════════════════════════
// ROUTER EXPORT
// ═══════════════════════════════════════════════════════════════

export const payrollRouter = {
	settings: {
		get: settingsGet,
		update: settingsUpdate,
		getCountryProfile: settingsGetCountryProfile,
		listCountryProfiles: settingsListCountryProfiles,
	},
	payPeriods: {
		list: payPeriodsList,
		getById: payPeriodsGetById,
		create: payPeriodsCreate,
		update: payPeriodsUpdate,
		close: payPeriodsClose,
		reopen: payPeriodsReopen,
	},
	payItems: {
		list: payItemsList,
		getById: payItemsGetById,
		create: payItemsCreate,
		update: payItemsUpdate,
		archive: payItemsArchive,
		assignToEmployee: payItemsAssignToEmployee,
		assignToDepartment: payItemsAssignToDepartment,
		removeAssignment: payItemsRemoveAssignment,
	},
	loans: {
		list: loansList,
		getById: loansGetById,
		create: loansCreate,
		settle: loansSettle,
		listInstallments: loansListInstallments,
		skipInstallment: loansSkipInstallment,
	},
	reimbursements: {
		list: reimbursementsList,
		getById: reimbursementsGetById,
		create: reimbursementsCreate,
		approve: reimbursementsApprove,
		reject: reimbursementsReject,
		markPaid: reimbursementsMarkPaid,
	},
	runs: {
		list: runsList,
		getById: runsGetById,
		createDraft: runsCreateDraft,
		preview: runsPreview,
		confirm: runsConfirm,
		markPaid: runsMarkPaid,
	},
	payslips: {
		list: payslipsList,
		getById: payslipsGetById,
		getOwn: payslipsGetOwn,
		getOwnById: payslipsGetOwnById,
		previewEmployee: payslipsPreviewEmployee,
	},
	issues: {
		list: issuesList,
		acknowledge: issuesAcknowledge,
		resolve: issuesResolve,
		override: issuesOverride,
	},
	projectedPay: {
		forEmployee: projectedPayForEmployee,
		own: projectedPayOwn,
	},
	reports: {
		dashboardSummary: reportsDashboardSummary,
		costByDepartment: reportsCostByDepartment,
		blockersSummary: reportsBlockersSummary,
	},
	paymentBatches: {
		list: paymentBatchesList,
		getById: paymentBatchesGetById,
		create: paymentBatchesCreate,
		markReviewed: paymentBatchesMarkReviewed,
		markExported: paymentBatchesMarkExported,
		markSubmitted: paymentBatchesMarkSubmitted,
		markPaid: paymentBatchesMarkPaid,
		markFailed: paymentBatchesMarkFailed,
		generateCsv: paymentBatchesGenerateCsv,
	},
};
