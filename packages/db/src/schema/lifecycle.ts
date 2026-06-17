/**
 * Lifecycle — employee lifecycle events that change a person's standing in the
 * org over time: disciplinary cases, internal transfers, and employee-initiated
 * resignations. Recognition is OUT OF SCOPE (it lives in Performance / PMS).
 *
 * Per docs/architecture/lifecycle-implementation-plan.md (Phase B). v1 proves
 * the NEED for these workflows; it does NOT define the product. This schema
 * generalizes v1's intent into tenant-configurable, effective-dated, tenant-safe
 * capabilities and deliberately does NOT clone v1 quirks (free-text statuses,
 * destructive transfer overwrites, or the standalone resignation/exit-checklist
 * tables that duplicate the Offboarding module).
 *
 * THREE GUARDRAILS encoded here:
 *   1. Transfers write an EFFECTIVE-DATED history row (employee_work_info_history)
 *      resolved by resolveAsOf — NOT a destructive UPDATE of employeeWorkInfo
 *      (the key v1-bug avoided). The current position resolves by date.
 *   2. Resignation is the intent-to-leave REQUEST only. It hands off to the
 *      EXISTING Offboarding module via a read-only `offboardingCaseId` link; it
 *      NEVER re-models clearance / asset return / settlement.
 *   3. internalNote on a disciplinary record is HR-only — redacted server-side
 *      from the subject employee (mirrors helpdesk/projects internal-note redaction).
 *
 * All tables org-scoped via orgRef(), cuid() PKs, ...timestamps, soft-delete
 * (deletedAt) where a row is user-managed, pgEnum for closed value sets.
 */

import { relations, sql } from "drizzle-orm";
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
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
	cuid,
	department,
	employeeProfile,
	jobPosition,
	jobRole,
	orgRef,
	timestamps,
} from "./hr-core";
import { offboardingCase } from "./offboarding";

// ───────────────────────────────────────────────────────────────────
// Enums
// ───────────────────────────────────────────────────────────────────

export const disciplinaryRecordStatusEnum = pgEnum(
	"disciplinary_record_status",
	[
		"draft",
		"explanation_requested",
		"explained",
		"action_taken",
		"appealed",
		"closed",
		"overturned",
		"withdrawn",
	]
);

// Coarse, reportable bucket for cross-tenant analytics — the SPECIFIC action an
// org takes comes from the tenant-configurable disciplinary_action catalogue.
export const disciplinaryOutcomeEnum = pgEnum("disciplinary_outcome", [
	"none",
	"verbal_warning",
	"written_warning",
	"final_warning",
	"suspension",
	"dismissal",
	"other",
]);

export const transferTypeEnum = pgEnum("transfer_type", [
	"department",
	"position",
	"role",
	"location",
	"manager",
	"combined",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
	"draft",
	"submitted",
	"approved",
	"rejected",
	"scheduled",
	"effective",
	"cancelled",
]);

export const resignationReasonEnum = pgEnum("resignation_reason", [
	"resignation",
	"retirement",
	"end_of_contract",
	"mutual",
	"other",
]);

export const resignationStatusEnum = pgEnum("resignation_status", [
	"draft",
	"submitted",
	"manager_approved",
	"hr_approved",
	"handed_off",
	"withdrawn",
	"rejected",
]);

// ───────────────────────────────────────────────────────────────────
// 1. disciplinary_category — tenant-configurable catalogue
// ───────────────────────────────────────────────────────────────────

export const disciplinaryCategory = pgTable(
	"disciplinary_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		isArchived: boolean("is_archived").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("disciplinary_category_org_idx").on(t.organizationId),
		uniqueIndex("disciplinary_category_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. disciplinary_action — tenant-configurable severity-ranked actions
// ───────────────────────────────────────────────────────────────────

export const disciplinaryAction = pgTable(
	"disciplinary_action",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		// 1–5; validated in the API.
		severityLevel: integer("severity_level").default(1).notNull(),
		// Maps this action to the coarse, reportable outcome bucket.
		outcome: disciplinaryOutcomeEnum("outcome").default("other").notNull(),
		isArchived: boolean("is_archived").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("disciplinary_action_org_severity_idx").on(
			t.organizationId,
			t.severityLevel
		),
		uniqueIndex("disciplinary_action_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. disciplinary_record — the case (incident → explanation → action → appeal)
// ───────────────────────────────────────────────────────────────────

export const disciplinaryRecord = pgTable(
	"disciplinary_record",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // DISC-000001
		// The subject. restrict preserves history.
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		categoryId: text("category_id").references(() => disciplinaryCategory.id, {
			onDelete: "set null",
		}),
		// Immutable point-in-time event (NO effective-dating — see §4 of the plan).
		incidentDate: date("incident_date", { mode: "date" }).notNull(),
		description: text("description").notNull(),
		status: disciplinaryRecordStatusEnum("status").default("draft").notNull(),
		employeeExplanation: text("employee_explanation"),
		employeeExplanationSubmittedAt: timestamp(
			"employee_explanation_submitted_at"
		),
		finalActionId: text("final_action_id").references(
			() => disciplinaryAction.id,
			{ onDelete: "set null" }
		),
		finalActionNotes: text("final_action_notes"),
		finalActionTakenAt: timestamp("final_action_taken_at"),
		finalActionByUserId: text("final_action_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		appealText: text("appeal_text"),
		appealSubmittedAt: timestamp("appeal_submitted_at"),
		appealOutcome: text("appeal_outcome"),
		appealResolvedAt: timestamp("appeal_resolved_at"),
		appealResolvedByUserId: text("appeal_resolved_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		// HR-ONLY — redacted server-side from the subject employee.
		internalNote: text("internal_note"),
		reportedByUserId: text("reported_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("disciplinary_record_org_idx").on(t.organizationId),
		index("disciplinary_record_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		index("disciplinary_record_org_status_idx").on(t.organizationId, t.status),
		uniqueIndex("disciplinary_record_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. employee_transfer — effective-dated dept / position / role / location /
//    manager move request. Approval-gated. Executes by writing a dated history
//    window (see employee_work_info_history) — NEVER a destructive overwrite.
// ───────────────────────────────────────────────────────────────────

export const employeeTransfer = pgTable(
	"employee_transfer",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // TRF-000001
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		transferType: transferTypeEnum("transfer_type").notNull(),
		status: transferStatusEnum("status").default("draft").notNull(),
		// Effective-dating (the canonical pattern): inclusive lower / exclusive upper.
		effectiveFrom: date("effective_from", { mode: "date" }).notNull(),
		effectiveTo: date("effective_to", { mode: "date" }),
		// Destination — partial change set; null = unchanged.
		toDepartmentId: text("to_department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		toJobPositionId: text("to_job_position_id").references(
			() => jobPosition.id,
			{ onDelete: "set null" }
		),
		toJobRoleId: text("to_job_role_id").references(() => jobRole.id, {
			onDelete: "set null",
		}),
		toReportingManagerId: text("to_reporting_manager_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		toWorkLocation: text("to_work_location"),
		// Snapshot of from-* values at request time (audit/explainability).
		fromDepartmentId: text("from_department_id"),
		fromJobPositionId: text("from_job_position_id"),
		fromJobRoleId: text("from_job_role_id"),
		fromReportingManagerId: text("from_reporting_manager_id"),
		fromWorkLocation: text("from_work_location"),
		snapshotJson: jsonb("snapshot_json"),
		reason: text("reason"),
		// Workflow stamps.
		submittedByUserId: text("submitted_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		submittedAt: timestamp("submitted_at"),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at"),
		rejectionReason: text("rejection_reason"),
		executedAt: timestamp("executed_at"),
		cancelledAt: timestamp("cancelled_at"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("employee_transfer_org_status_idx").on(t.organizationId, t.status),
		index("employee_transfer_org_emp_eff_idx").on(
			t.organizationId,
			t.employeeId,
			t.effectiveFrom
		),
		uniqueIndex("employee_transfer_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 5. employee_work_info_history — effective-dated outcome of an executed
//    transfer. Lifecycle OWNS this; the employee-profile read path resolves the
//    CURRENT position via resolveAsOf(rows, today). This replaces v1's
//    destructive `UPDATE employees SET departmentId=…`.
//    All position columns nullable: a transfer is a partial change set, so a
//    window may only move department, only the manager, etc.
// ───────────────────────────────────────────────────────────────────

export const employeeWorkInfoHistory = pgTable(
	"employee_work_info_history",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "cascade" }),
		effectiveFrom: date("effective_from", { mode: "date" }).notNull(),
		effectiveTo: date("effective_to", { mode: "date" }),
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
		workLocation: text("work_location"),
		// Soft ref back to the transfer that produced this window (audit).
		sourceTransferId: text("source_transfer_id"),
		...timestamps,
	},
	(t) => [
		index("emp_work_info_history_org_emp_eff_idx").on(
			t.organizationId,
			t.employeeId,
			t.effectiveFrom
		),
	]
);

// ───────────────────────────────────────────────────────────────────
// 6. resignation_request — employee-initiated intent to leave.
//    Hands off to the EXISTING Offboarding module on HR approval. The clearance
//    checklist / settlement live in Offboarding and are read through the single
//    `offboardingCaseId` link; Lifecycle NEVER writes them.
//    NOTE: no DB-level "one open resignation per employee" unique — that
//    invariant is enforced in the API; Offboarding already holds the hard
//    one-active-case constraint.
// ───────────────────────────────────────────────────────────────────

export const resignationRequest = pgTable(
	"resignation_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // RES-000001
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		status: resignationStatusEnum("status").default("draft").notNull(),
		reasonCategory: resignationReasonEnum("reason_category").notNull(),
		reasonNotes: text("reason_notes"),
		requestedLastWorkingDate: date("requested_last_working_date", {
			mode: "date",
		}).notNull(),
		noticeStartDate: date("notice_start_date", { mode: "date" }),
		// Workflow stamps.
		submittedAt: timestamp("submitted_at"),
		managerApprovedByUserId: text("manager_approved_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerApprovedAt: timestamp("manager_approved_at"),
		hrApprovedByUserId: text("hr_approved_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		hrApprovedAt: timestamp("hr_approved_at"),
		withdrawnAt: timestamp("withdrawn_at"),
		rejectionReason: text("rejection_reason"),
		// THE SINGLE Offboarding seam — read-only link, written once on HR handoff.
		offboardingCaseId: text("offboarding_case_id").references(
			() => offboardingCase.id,
			{ onDelete: "set null" }
		),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("resignation_request_org_status_idx").on(t.organizationId, t.status),
		index("resignation_request_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		uniqueIndex("resignation_request_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations — intra-module only. Cross-module links (employeeProfile,
// offboardingCase, department, jobPosition, jobRole, user) stay plain FKs and
// are NEVER mutated by this module.
// ───────────────────────────────────────────────────────────────────

export const disciplinaryCategoryRelations = relations(
	disciplinaryCategory,
	({ many }) => ({
		records: many(disciplinaryRecord),
	})
);

export const disciplinaryActionRelations = relations(
	disciplinaryAction,
	({ many }) => ({
		records: many(disciplinaryRecord),
	})
);

export const disciplinaryRecordRelations = relations(
	disciplinaryRecord,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [disciplinaryRecord.employeeId],
			references: [employeeProfile.id],
		}),
		category: one(disciplinaryCategory, {
			fields: [disciplinaryRecord.categoryId],
			references: [disciplinaryCategory.id],
		}),
		finalAction: one(disciplinaryAction, {
			fields: [disciplinaryRecord.finalActionId],
			references: [disciplinaryAction.id],
		}),
	})
);

export const employeeTransferRelations = relations(
	employeeTransfer,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [employeeTransfer.employeeId],
			references: [employeeProfile.id],
		}),
		toDepartment: one(department, {
			fields: [employeeTransfer.toDepartmentId],
			references: [department.id],
		}),
		toJobPosition: one(jobPosition, {
			fields: [employeeTransfer.toJobPositionId],
			references: [jobPosition.id],
		}),
		toJobRole: one(jobRole, {
			fields: [employeeTransfer.toJobRoleId],
			references: [jobRole.id],
		}),
	})
);

export const employeeWorkInfoHistoryRelations = relations(
	employeeWorkInfoHistory,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [employeeWorkInfoHistory.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const resignationRequestRelations = relations(
	resignationRequest,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [resignationRequest.employeeId],
			references: [employeeProfile.id],
		}),
		offboardingCase: one(offboardingCase, {
			fields: [resignationRequest.offboardingCaseId],
			references: [offboardingCase.id],
		}),
	})
);
