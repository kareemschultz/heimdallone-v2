import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
	cuid,
	department,
	employeeProfile,
	orgRef,
	timestamps,
} from "./hr-core";

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
	"requested",
	"approved",
	"rejected",
	"cancelled",
]);

export const leaveBreakdownEnum = pgEnum("leave_breakdown", [
	"full_day",
	"first_half",
	"second_half",
]);

export const leaveCarryForwardTypeEnum = pgEnum("leave_carry_forward_type", [
	"none",
	"carry",
	"carry_expire",
]);

export const leaveAccrualPeriodEnum = pgEnum("leave_accrual_period", [
	"day",
	"month",
	"year",
]);

export const leaveResetBasisEnum = pgEnum("leave_reset_basis", [
	"yearly",
	"monthly",
	"weekly",
]);

export const leaveType = pgTable(
	"leave_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		color: text("color").default("#3b82f6").notNull(),
		isPaid: boolean("is_paid").default(true).notNull(),
		accrualAmount: numeric("accrual_amount", { precision: 6, scale: 2 })
			.default("1.00")
			.notNull(),
		accrualPeriod: leaveAccrualPeriodEnum("accrual_period")
			.default("month")
			.notNull(),
		limitDays: numeric("limit_days", { precision: 6, scale: 2 }),
		resetEnabled: boolean("reset_enabled").default(true).notNull(),
		resetBasis: leaveResetBasisEnum("reset_basis").default("yearly").notNull(),
		resetMonth: integer("reset_month"),
		resetDay: integer("reset_day"),
		carryForwardType: leaveCarryForwardTypeEnum("carry_forward_type")
			.default("none")
			.notNull(),
		carryForwardMax: numeric("carry_forward_max", {
			precision: 6,
			scale: 2,
		}),
		carryForwardExpiryDays: integer("carry_forward_expiry_days"),
		requireApproval: boolean("require_approval").default(true).notNull(),
		requireAttachment: boolean("require_attachment").default(false).notNull(),
		excludeHolidays: boolean("exclude_holidays").default(true).notNull(),
		excludeCompanyLeaves: boolean("exclude_company_leaves")
			.default(true)
			.notNull(),
		isCompensatory: boolean("is_compensatory").default(false).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		unique("leave_type_org_name_uq").on(t.organizationId, t.name),
		index("leave_type_org_idx").on(t.organizationId),
	]
);

export const leaveBalance = pgTable(
	"leave_balance",
	{
		id: cuid(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		leaveTypeId: text("leave_type_id")
			.notNull()
			.references(() => leaveType.id, { onDelete: "restrict" }),
		availableDays: numeric("available_days", { precision: 6, scale: 2 })
			.default("0")
			.notNull(),
		usedDays: numeric("used_days", { precision: 6, scale: 2 })
			.default("0")
			.notNull(),
		carryForwardDays: numeric("carry_forward_days", {
			precision: 6,
			scale: 2,
		})
			.default("0")
			.notNull(),
		assignedDate: date("assigned_date", { mode: "date" }).notNull(),
		resetDate: date("reset_date", { mode: "date" }),
		expiryDate: date("expiry_date", { mode: "date" }),
		...timestamps,
	},
	(t) => [
		unique("leave_balance_emp_type_uq").on(t.employeeId, t.leaveTypeId),
		index("leave_balance_emp_idx").on(t.employeeId),
	]
);

export const leaveRequest = pgTable(
	"leave_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		leaveTypeId: text("leave_type_id")
			.notNull()
			.references(() => leaveType.id, { onDelete: "restrict" }),
		startDate: date("start_date", { mode: "date" }).notNull(),
		endDate: date("end_date", { mode: "date" }).notNull(),
		startBreakdown: leaveBreakdownEnum("start_breakdown")
			.default("full_day")
			.notNull(),
		endBreakdown: leaveBreakdownEnum("end_breakdown")
			.default("full_day")
			.notNull(),
		requestedDays: numeric("requested_days", {
			precision: 6,
			scale: 2,
		}).notNull(),
		description: text("description"),
		attachmentUrl: text("attachment_url"),
		status: leaveRequestStatusEnum("status").default("requested").notNull(),
		rejectReason: text("reject_reason"),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		index("leave_request_org_idx").on(t.organizationId),
		index("leave_request_emp_status_idx").on(t.employeeId, t.status),
		index("leave_request_dates_idx").on(t.startDate, t.endDate),
	]
);

export const leaveRequestApproval = pgTable(
	"leave_request_approval",
	{
		id: cuid(),
		leaveRequestId: text("leave_request_id")
			.notNull()
			.references(() => leaveRequest.id, { onDelete: "cascade" }),
		managerId: text("manager_id")
			.notNull()
			.references(() => user.id, { onDelete: "set null" }),
		sequence: integer("sequence").default(1).notNull(),
		isApproved: boolean("is_approved").default(false).notNull(),
		isRejected: boolean("is_rejected").default(false).notNull(),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		...timestamps,
	},
	(t) => [index("leave_approval_request_idx").on(t.leaveRequestId)]
);

export const leaveAllocationRequest = pgTable(
	"leave_allocation_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		leaveTypeId: text("leave_type_id")
			.notNull()
			.references(() => leaveType.id, { onDelete: "restrict" }),
		requestedDays: numeric("requested_days", {
			precision: 6,
			scale: 2,
		}).notNull(),
		description: text("description"),
		status: leaveRequestStatusEnum("status").default("requested").notNull(),
		rejectReason: text("reject_reason"),
		reviewedBy: text("reviewed_by").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [index("leave_alloc_org_idx").on(t.organizationId)]
);

export const leaveRestriction = pgTable(
	"leave_restriction",
	{
		id: cuid(),
		organizationId: orgRef(),
		title: text("title").notNull(),
		startDate: date("start_date", { mode: "date" }).notNull(),
		endDate: date("end_date", { mode: "date" }).notNull(),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		description: text("description"),
		...timestamps,
	},
	(t) => [index("leave_restriction_org_idx").on(t.organizationId)]
);

export const companyLeaveDay = pgTable(
	"company_leave_day",
	{
		id: cuid(),
		organizationId: orgRef(),
		weekOfMonth: integer("week_of_month"),
		dayOfWeek: integer("day_of_week").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		unique("company_leave_day_uq").on(
			t.organizationId,
			t.weekOfMonth,
			t.dayOfWeek
		),
	]
);

export const leaveTypeRelations = relations(leaveType, ({ many }) => ({
	balances: many(leaveBalance),
	requests: many(leaveRequest),
	allocationRequests: many(leaveAllocationRequest),
}));

export const leaveBalanceRelations = relations(leaveBalance, ({ one }) => ({
	employee: one(employeeProfile, {
		fields: [leaveBalance.employeeId],
		references: [employeeProfile.id],
	}),
	leaveType: one(leaveType, {
		fields: [leaveBalance.leaveTypeId],
		references: [leaveType.id],
	}),
}));

export const leaveRequestRelations = relations(
	leaveRequest,
	({ one, many }) => ({
		employee: one(employeeProfile, {
			fields: [leaveRequest.employeeId],
			references: [employeeProfile.id],
		}),
		leaveType: one(leaveType, {
			fields: [leaveRequest.leaveTypeId],
			references: [leaveType.id],
		}),
		approvals: many(leaveRequestApproval),
	})
);

export const leaveRequestApprovalRelations = relations(
	leaveRequestApproval,
	({ one }) => ({
		leaveRequest: one(leaveRequest, {
			fields: [leaveRequestApproval.leaveRequestId],
			references: [leaveRequest.id],
		}),
	})
);

export const leaveAllocationRequestRelations = relations(
	leaveAllocationRequest,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [leaveAllocationRequest.employeeId],
			references: [employeeProfile.id],
		}),
		leaveType: one(leaveType, {
			fields: [leaveAllocationRequest.leaveTypeId],
			references: [leaveType.id],
		}),
	})
);

export const leaveRestrictionRelations = relations(
	leaveRestriction,
	({ one }) => ({
		department: one(department, {
			fields: [leaveRestriction.departmentId],
			references: [department.id],
		}),
	})
);
