import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

const cuid = () => text("id").primaryKey().$defaultFn(createId);
const orgRef = () =>
	text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });
const timestamps = {
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
};

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const maritalStatusEnum = pgEnum("marital_status", [
	"single",
	"married",
	"divorced",
]);
export const documentStatusEnum = pgEnum("document_status", [
	"requested",
	"uploaded",
	"approved",
	"rejected",
]);
export const auditActionEnum = pgEnum("audit_action", [
	"create",
	"update",
	"delete",
	"archive",
	"restore",
]);

export const department = pgTable(
	"department",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		index("department_org_idx").on(t.organizationId),
		unique("department_org_name_uq").on(t.organizationId, t.name),
	]
);

export const jobPosition = pgTable(
	"job_position",
	{
		id: cuid(),
		organizationId: orgRef(),
		departmentId: text("department_id")
			.notNull()
			.references(() => department.id, { onDelete: "restrict" }),
		name: text("name").notNull(),
		description: text("description"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [unique("job_position_dept_name_uq").on(t.departmentId, t.name)]
);

export const jobRole = pgTable(
	"job_role",
	{
		id: cuid(),
		organizationId: orgRef(),
		jobPositionId: text("job_position_id")
			.notNull()
			.references(() => jobPosition.id, { onDelete: "restrict" }),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [unique("job_role_position_name_uq").on(t.jobPositionId, t.name)]
);

export const workType = pgTable(
	"work_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [unique("work_type_org_name_uq").on(t.organizationId, t.name)]
);

export const employeeType = pgTable(
	"employee_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [unique("employee_type_org_name_uq").on(t.organizationId, t.name)]
);

export const shift = pgTable(
	"shift",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		weeklyFullTimeMinutes: integer("weekly_full_time_minutes")
			.default(2400)
			.notNull(),
		monthlyFullTimeMinutes: integer("monthly_full_time_minutes")
			.default(12_000)
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [unique("shift_org_name_uq").on(t.organizationId, t.name)]
);

export const shiftSchedule = pgTable(
	"shift_schedule",
	{
		id: cuid(),
		shiftId: text("shift_id")
			.notNull()
			.references(() => shift.id, { onDelete: "cascade" }),
		dayOfWeek: integer("day_of_week").notNull(),
		startTime: text("start_time").notNull(),
		endTime: text("end_time").notNull(),
		minimumWorkMinutes: integer("minimum_work_minutes").default(495).notNull(),
		isNightShift: boolean("is_night_shift").default(false).notNull(),
	},
	(t) => [unique("shift_schedule_shift_day_uq").on(t.shiftId, t.dayOfWeek)]
);

export const holiday = pgTable(
	"holiday",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		startDate: date("start_date", { mode: "date" }).notNull(),
		endDate: date("end_date", { mode: "date" }),
		isRecurring: boolean("is_recurring").default(false).notNull(),
		...timestamps,
	},
	(t) => [index("holiday_org_idx").on(t.organizationId)]
);

export const employeeProfile = pgTable(
	"employee_profile",
	{
		id: cuid(),
		organizationId: orgRef(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		badgeId: text("badge_id"),
		firstName: text("first_name").notNull(),
		lastName: text("last_name"),
		email: text("email").notNull(),
		phone: text("phone"),
		profileImageUrl: text("profile_image_url"),
		dateOfBirth: date("date_of_birth", { mode: "date" }),
		gender: genderEnum("gender"),
		maritalStatus: maritalStatusEnum("marital_status"),
		address: text("address"),
		city: text("city"),
		state: text("state"),
		country: text("country"),
		zip: text("zip"),
		emergencyContactName: text("emergency_contact_name"),
		emergencyContactPhone: text("emergency_contact_phone"),
		emergencyContactRelation: text("emergency_contact_relation"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		index("employee_profile_org_idx").on(t.organizationId),
		index("employee_profile_user_idx").on(t.userId),
		unique("employee_profile_org_email_uq").on(t.organizationId, t.email),
		uniqueIndex("employee_profile_org_badge_uidx")
			.on(t.organizationId, t.badgeId)
			.where(sql`${t.badgeId} IS NOT NULL`),
	]
);

export const employeeWorkInfo = pgTable(
	"employee_work_info",
	{
		id: cuid(),
		employeeId: text("employee_id")
			.notNull()
			.unique()
			.references(() => employeeProfile.id, { onDelete: "cascade" }),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		jobPositionId: text("job_position_id").references(() => jobPosition.id, {
			onDelete: "set null",
		}),
		jobRoleId: text("job_role_id").references(() => jobRole.id, {
			onDelete: "set null",
		}),
		reportingManagerId: text("reporting_manager_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		shiftId: text("shift_id").references(() => shift.id, {
			onDelete: "set null",
		}),
		workTypeId: text("work_type_id").references(() => workType.id, {
			onDelete: "set null",
		}),
		employeeTypeId: text("employee_type_id").references(() => employeeType.id, {
			onDelete: "set null",
		}),
		workLocation: text("work_location"),
		workEmail: text("work_email"),
		workPhone: text("work_phone"),
		joiningDate: date("joining_date", { mode: "date" }),
		basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }),
		salaryCurrency: text("salary_currency").default("GYD").notNull(),
		...timestamps,
	},
	(t) => [
		index("work_info_dept_idx").on(t.departmentId),
		index("work_info_manager_idx").on(t.reportingManagerId),
	]
);

export const employeeBankDetails = pgTable("employee_bank_details", {
	id: cuid(),
	employeeId: text("employee_id")
		.notNull()
		.unique()
		.references(() => employeeProfile.id, { onDelete: "cascade" }),
	bankName: text("bank_name").notNull(),
	accountNumber: text("account_number").notNull(),
	branch: text("branch"),
	bankCode1: text("bank_code_1"),
	bankCode2: text("bank_code_2"),
	country: text("country"),
	...timestamps,
});

export const employeeDocument = pgTable(
	"employee_document",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		fileUrl: text("file_url"),
		fileName: text("file_name"),
		fileSizeBytes: integer("file_size_bytes"),
		format: text("format"),
		status: documentStatusEnum("status").default("uploaded").notNull(),
		rejectReason: text("reject_reason"),
		issueDate: date("issue_date", { mode: "date" }),
		expiryDate: date("expiry_date", { mode: "date" }),
		notifyBeforeDays: integer("notify_before_days").default(30),
		uploadedBy: text("uploaded_by").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		index("employee_document_emp_idx").on(t.employeeId),
		index("employee_document_expiry_idx").on(t.organizationId, t.expiryDate),
	]
);

export const auditEvent = pgTable(
	"audit_event",
	{
		id: cuid(),
		organizationId: orgRef(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		action: auditActionEnum("action").notNull(),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		changes: jsonb("changes"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("audit_event_entity_idx").on(
			t.organizationId,
			t.entityType,
			t.entityId
		),
		index("audit_event_time_idx").on(t.organizationId, t.createdAt),
		index("audit_event_actor_idx").on(t.actorId),
	]
);

export const departmentRelations = relations(department, ({ many }) => ({
	jobPositions: many(jobPosition),
}));

export const jobPositionRelations = relations(jobPosition, ({ one, many }) => ({
	department: one(department, {
		fields: [jobPosition.departmentId],
		references: [department.id],
	}),
	jobRoles: many(jobRole),
}));

export const jobRoleRelations = relations(jobRole, ({ one }) => ({
	jobPosition: one(jobPosition, {
		fields: [jobRole.jobPositionId],
		references: [jobPosition.id],
	}),
}));

export const shiftRelations = relations(shift, ({ many }) => ({
	schedules: many(shiftSchedule),
}));

export const shiftScheduleRelations = relations(shiftSchedule, ({ one }) => ({
	shift: one(shift, {
		fields: [shiftSchedule.shiftId],
		references: [shift.id],
	}),
}));

export const employeeProfileRelations = relations(
	employeeProfile,
	({ one, many }) => ({
		workInfo: one(employeeWorkInfo, {
			fields: [employeeProfile.id],
			references: [employeeWorkInfo.employeeId],
		}),
		bankDetails: one(employeeBankDetails, {
			fields: [employeeProfile.id],
			references: [employeeBankDetails.employeeId],
		}),
		documents: many(employeeDocument),
		user: one(user, {
			fields: [employeeProfile.userId],
			references: [user.id],
		}),
	})
);

export const employeeWorkInfoRelations = relations(
	employeeWorkInfo,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [employeeWorkInfo.employeeId],
			references: [employeeProfile.id],
		}),
		department: one(department, {
			fields: [employeeWorkInfo.departmentId],
			references: [department.id],
		}),
		jobPosition: one(jobPosition, {
			fields: [employeeWorkInfo.jobPositionId],
			references: [jobPosition.id],
		}),
		jobRole: one(jobRole, {
			fields: [employeeWorkInfo.jobRoleId],
			references: [jobRole.id],
		}),
		shift: one(shift, {
			fields: [employeeWorkInfo.shiftId],
			references: [shift.id],
		}),
		workType: one(workType, {
			fields: [employeeWorkInfo.workTypeId],
			references: [workType.id],
		}),
		employeeType: one(employeeType, {
			fields: [employeeWorkInfo.employeeTypeId],
			references: [employeeType.id],
		}),
		reportingManager: one(employeeProfile, {
			fields: [employeeWorkInfo.reportingManagerId],
			references: [employeeProfile.id],
			relationName: "reportingManager",
		}),
	})
);

export const employeeBankDetailsRelations = relations(
	employeeBankDetails,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [employeeBankDetails.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const employeeDocumentRelations = relations(
	employeeDocument,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [employeeDocument.employeeId],
			references: [employeeProfile.id],
		}),
	})
);
