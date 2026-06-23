import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, employeeProfile, orgRef, shift, timestamps } from "./hr-core";

export const attendanceBreak = pgTable(
	"attendance_break",
	{
		id: cuid(),
		organizationId: orgRef(),
		attendanceEventId: text("attendance_event_id")
			.notNull()
			.references(() => attendanceEvent.id, { onDelete: "cascade" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		breakIn: timestamp("break_in", { withTimezone: true }).notNull(),
		breakOut: timestamp("break_out", { withTimezone: true }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("att_break_event_idx").on(t.attendanceEventId),
		index("att_break_emp_idx").on(t.employeeId),
	]
);

export const attendanceSourceEnum = pgEnum("attendance_source", [
	"manual",
	"biometric",
	"mobile",
	"import",
	"admin",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
	"present",
	"half_day",
	"absent",
	"holiday",
	"conflict",
]);

export const attendancePayrollStatusEnum = pgEnum("attendance_payroll_status", [
	"pending",
	"approved",
	"payroll_locked",
]);

export const attendanceCorrectionStatusEnum = pgEnum(
	"attendance_correction_status",
	["pending", "approved", "rejected"]
);

export const attendanceDayTypeEnum = pgEnum("attendance_day_type", [
	"weekday",
	"saturday",
	"sunday",
	"holiday",
]);

export const attendanceEvent = pgTable(
	"attendance_event",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		eventDate: date("event_date", { mode: "date" }).notNull(),
		clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
		clockOut: timestamp("clock_out", { withTimezone: true }),
		durationMinutes: integer("duration_minutes"),
		source: attendanceSourceEnum("source").default("manual").notNull(),
		deviceId: text("device_id"),
		locationLat: text("location_lat"),
		locationLon: text("location_lon"),
		notes: text("notes"),
		...timestamps,
	},
	(t) => [
		index("att_event_org_idx").on(t.organizationId),
		index("att_event_emp_date_idx").on(t.employeeId, t.eventDate),
		index("att_event_date_idx").on(t.eventDate),
	]
);

export const attendanceRecord = pgTable(
	"attendance_record",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		date: date("date", { mode: "date" }).notNull(),
		shiftId: text("shift_id").references(() => shift.id, {
			onDelete: "set null",
		}),
		firstClockIn: text("first_clock_in"),
		lastClockOut: text("last_clock_out"),
		workedMinutes: integer("worked_minutes").default(0).notNull(),
		minimumMinutes: integer("minimum_minutes").default(0).notNull(),
		payableMinutes: integer("payable_minutes").default(0).notNull(),
		overtimeMinutes: integer("overtime_minutes").default(0).notNull(),
		approvedOvertimeMinutes: integer("approved_overtime_minutes")
			.default(0)
			.notNull(),
		lateMinutes: integer("late_minutes").default(0).notNull(),
		earlyLeaveMinutes: integer("early_leave_minutes").default(0).notNull(),
		breakDeductedMinutes: integer("break_deducted_minutes")
			.default(0)
			.notNull(),
		status: attendanceStatusEnum("status").default("present").notNull(),
		dayType: attendanceDayTypeEnum("day_type").default("weekday").notNull(),
		isValidated: boolean("is_validated").default(false).notNull(),
		validatedBy: text("validated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		validatedAt: timestamp("validated_at", { withTimezone: true }),
		isOvertimeApproved: boolean("is_overtime_approved")
			.default(false)
			.notNull(),
		overtimeApprovedBy: text("overtime_approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		isHoliday: boolean("is_holiday").default(false).notNull(),
		payrollStatus: attendancePayrollStatusEnum("payroll_status")
			.default("pending")
			.notNull(),
		notes: text("notes"),
		...timestamps,
	},
	(t) => [
		unique("att_record_emp_date_uq").on(t.employeeId, t.date),
		index("att_record_org_date_idx").on(t.organizationId, t.date),
		index("att_record_emp_idx").on(t.employeeId),
		index("att_record_payroll_idx").on(t.payrollStatus),
	]
);

export const attendanceCorrection = pgTable(
	"attendance_correction",
	{
		id: cuid(),
		organizationId: orgRef(),
		attendanceRecordId: text("attendance_record_id").references(
			() => attendanceRecord.id,
			{ onDelete: "set null" }
		),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		category: text("category").notNull(),
		requestedChanges: jsonb("requested_changes").notNull(),
		reason: text("reason").notNull(),
		status: attendanceCorrectionStatusEnum("status")
			.default("pending")
			.notNull(),
		reviewedBy: text("reviewed_by").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewNote: text("review_note"),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		...timestamps,
	},
	(t) => [
		index("att_correction_emp_idx").on(t.employeeId),
		index("att_correction_status_idx").on(t.status),
		index("att_correction_org_idx").on(t.organizationId, t.status),
	]
);

export const attendanceSetting = pgTable("attendance_setting", {
	id: cuid(),
	organizationId: orgRef(),
	enableCheckIn: boolean("enable_check_in").default(true).notNull(),
	graceTimeMinutes: integer("grace_time_minutes").default(15).notNull(),
	overtimeCutoffMinutes: integer("overtime_cutoff_minutes"),
	autoApproveOvertimeThresholdMinutes: integer(
		"auto_approve_overtime_threshold_minutes"
	),
	breakDeductionMinutes: integer("break_deduction_minutes")
		.default(60)
		.notNull(),
	breakDeductionThresholdMinutes: integer("break_deduction_threshold_minutes")
		.default(360)
		.notNull(),
	enableAutoCheckout: boolean("enable_auto_checkout").default(false).notNull(),
	autoCheckoutAfterMinutes: integer("auto_checkout_after_minutes"),
	// Biometric + Geofencing policy (Phase 11). All additive with safe defaults.
	enableGeofencedCheckIn: boolean("enable_geofenced_check_in")
		.default(false)
		.notNull(),
	defaultGeofenceRadiusMeters: integer("default_geofence_radius_meters")
		.default(150)
		.notNull(),
	defaultGeofenceAccuracyMeters: integer("default_geofence_accuracy_meters")
		.default(100)
		.notNull(),
	clockDriftThresholdSeconds: integer("clock_drift_threshold_seconds")
		.default(300)
		.notNull(),
	gpsRetentionDays: integer("gps_retention_days").default(90).notNull(),
	blockPayrollOnOpenExceptions: boolean("block_payroll_on_open_exceptions")
		.default(true)
		.notNull(),
	...timestamps,
});

export const attendanceEventRelations = relations(
	attendanceEvent,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [attendanceEvent.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const attendanceRecordRelations = relations(
	attendanceRecord,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [attendanceRecord.employeeId],
			references: [employeeProfile.id],
		}),
		shift: one(shift, {
			fields: [attendanceRecord.shiftId],
			references: [shift.id],
		}),
		validatedByUser: one(user, {
			fields: [attendanceRecord.validatedBy],
			references: [user.id],
			relationName: "validatedByUser",
		}),
	})
);

export const attendanceCorrectionRelations = relations(
	attendanceCorrection,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [attendanceCorrection.employeeId],
			references: [employeeProfile.id],
		}),
		attendanceRecord: one(attendanceRecord, {
			fields: [attendanceCorrection.attendanceRecordId],
			references: [attendanceRecord.id],
		}),
	})
);

export const attendanceBreakRelations = relations(
	attendanceBreak,
	({ one }) => ({
		attendanceEvent: one(attendanceEvent, {
			fields: [attendanceBreak.attendanceEventId],
			references: [attendanceEvent.id],
		}),
		employee: one(employeeProfile, {
			fields: [attendanceBreak.employeeId],
			references: [employeeProfile.id],
		}),
	})
);
