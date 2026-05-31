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

import { organization, user } from "./auth";
import { cuid, employeeProfile, orgRef, timestamps } from "./hr-core";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 10A offboarding status lifecycles
// ───────────────────────────────────────────────────────────────────

// Case status: resignation → pending_approval → approved → active
// HR-initiated → active directly (no approval step)
// active → in_clearance → pending_settlement → closed
// Any state → cancelled (HR cancel) or rejected/withdrawn (resignation only)
export const offboardingCaseStatusEnum = pgEnum("offboarding_case_status", [
	"pending_approval",
	"approved",
	"active",
	"in_clearance",
	"pending_settlement",
	"closed",
	"rejected",
	"withdrawn",
	"cancelled",
]);

// Exit type determines whether approval is required and who can initiate
export const offboardingExitTypeEnum = pgEnum("offboarding_exit_type", [
	"resignation",
	"termination",
	"retirement",
	"contract_end",
	"involuntary",
]);

// Template task + case task categories (mirrors onboarding_category pattern)
export const offboardingCategoryEnum = pgEnum("offboarding_category", [
	"clearance",
	"asset_return",
	"access_revocation",
	"document",
	"handoff",
	"exit_interview",
	"other",
]);

// Task instance lifecycle: todo → in_progress → done | skipped | blocked
export const offboardingTaskStatusEnum = pgEnum("offboarding_task_status", [
	"todo",
	"in_progress",
	"done",
	"skipped",
	"blocked",
]);

// Asset return status
export const offboardingAssetStatusEnum = pgEnum("offboarding_asset_status", [
	"pending",
	"returned",
	"waived",
]);

// Access revocation status
export const offboardingAccessStatusEnum = pgEnum("offboarding_access_status", [
	"pending",
	"revoked",
	"waived",
]);

// Document request status (spec adds "waived" over onboarding's "rejected")
export const offboardingDocumentStatusEnum = pgEnum(
	"offboarding_document_status",
	["requested", "uploaded", "approved", "waived"]
);

// ───────────────────────────────────────────────────────────────────
// 1. offboarding_template — reusable clearance task list
// ───────────────────────────────────────────────────────────────────

export const offboardingTemplate = pgTable(
	"offboarding_template",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		// null = applies to all exit types; set to restrict template to one type
		exitType: offboardingExitTypeEnum("exit_type"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("offboarding_template_org_idx").on(t.organizationId),
		// One template name per org among non-deleted templates
		uniqueIndex("offboarding_template_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. offboarding_template_task — task definitions within a template
//    dueOffsetDays: relative to lastWorkingDay (negative = before LWD,
//    zero = on LWD, positive = after LWD for HR wrap-up tasks)
// ───────────────────────────────────────────────────────────────────

export const offboardingTemplateTask = pgTable(
	"offboarding_template_task",
	{
		id: cuid(),
		organizationId: orgRef(),
		templateId: text("template_id")
			.notNull()
			.references(() => offboardingTemplate.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		category: offboardingCategoryEnum("category").notNull(),
		// String role label: "hr" | "manager" | "employee" | "it" | "department_head"
		// Not an enum so adding roles in future doesn't require a migration.
		defaultAssigneeRole: text("default_assignee_role"),
		// Days relative to lastWorkingDay. Negative = before LWD. Zero = on LWD.
		dueOffsetDays: integer("due_offset_days").default(0).notNull(),
		isRequired: boolean("is_required").default(false).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_template_task_template_sort_idx").on(t.templateId, t.sortOrder),
		index("ob_template_task_org_idx").on(t.organizationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. offboarding_case — master record per exit event
//    One active case per employee enforced via partial unique index.
//    employeeProfile.isActive=false is set ONLY by the API close procedure.
// ───────────────────────────────────────────────────────────────────

export const offboardingCase = pgTable(
	"offboarding_case",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		exitType: offboardingExitTypeEnum("exit_type").notNull(),
		// Free-text reason; required for termination/involuntary; hidden from
		// employee view when exitType = "involuntary" (enforced in API layer).
		exitReason: text("exit_reason"),
		noticePeriodDays: integer("notice_period_days"),
		noticePeriodStartDate: date("notice_period_start_date", { mode: "date" }),
		// HR-confirmed last day; computed default: noticePeriodStartDate + noticePeriodDays
		lastWorkingDay: date("last_working_day", { mode: "date" }),
		status: offboardingCaseStatusEnum("status")
			.default("pending_approval")
			.notNull(),
		// User who opened the case (HR or the employee themselves for resignation)
		initiatedByUserId: text("initiated_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at"),
		rejectedByUserId: text("rejected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rejectedReason: text("rejected_reason"),
		closedByUserId: text("closed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		closedAt: timestamp("closed_at"),
		// HR-only internal note — never exposed to the departing employee
		internalNote: text("internal_note"),
		// Snapshot source — nullable; survives template deletion
		templateId: text("template_id").references(() => offboardingTemplate.id, {
			onDelete: "set null",
		}),
		// Optional link to the employee's active contract (for prompt-to-terminate)
		contractId: text("contract_id"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_case_org_status_idx").on(t.organizationId, t.status),
		index("ob_case_employee_idx").on(t.organizationId, t.employeeId),
		index("ob_case_lwd_idx").on(t.organizationId, t.lastWorkingDay),
		// One active (non-terminal) case per employee per org
		uniqueIndex("ob_case_employee_active_uq")
			.on(t.organizationId, t.employeeId)
			.where(
				sql`${t.status} NOT IN ('closed','cancelled','rejected','withdrawn') AND ${t.deletedAt} IS NULL`
			),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. offboarding_task — snapshotted task instance per case
//    dueAt = lastWorkingDay + dueOffsetDays from template (computed at creation)
//    Editing the template never mutates existing tasks (snapshot pattern).
// ───────────────────────────────────────────────────────────────────

export const offboardingTask = pgTable(
	"offboarding_task",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		// Nullable: ad-hoc tasks added after case creation have no template source
		templateTaskId: text("template_task_id").references(
			() => offboardingTemplateTask.id,
			{ onDelete: "set null" }
		),
		titleSnapshot: text("title_snapshot").notNull(),
		descriptionSnapshot: text("description_snapshot"),
		category: offboardingCategoryEnum("category").notNull(),
		assigneeEmployeeId: text("assignee_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		assigneeUserId: text("assignee_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		dueAt: date("due_at", { mode: "date" }),
		status: offboardingTaskStatusEnum("status").default("todo").notNull(),
		completedAt: timestamp("completed_at"),
		completedByUserId: text("completed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		note: text("note"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_task_case_status_idx").on(t.caseId, t.status),
		index("ob_task_assignee_status_idx").on(
			t.organizationId,
			t.assigneeEmployeeId,
			t.status
		),
		index("ob_task_org_due_idx").on(t.organizationId, t.dueAt),
	]
);

// ───────────────────────────────────────────────────────────────────
// 5. offboarding_asset_return — equipment/asset return per case
//    assetDescription is free text until Phase 12 (Assets module).
//    assetId column reserved for Phase 12 FK wiring.
// ───────────────────────────────────────────────────────────────────

export const offboardingAssetReturn = pgTable(
	"offboarding_asset_return",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		assetDescription: text("asset_description").notNull(),
		assetTag: text("asset_tag"),
		// Reserved for Phase 12 Assets module FK wiring — null until then
		assetId: text("asset_id"),
		expectedReturnDate: date("expected_return_date", { mode: "date" }),
		returnedAt: timestamp("returned_at"),
		condition: text("condition"),
		receivedByUserId: text("received_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: offboardingAssetStatusEnum("status").default("pending").notNull(),
		note: text("note"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_asset_return_case_status_idx").on(t.caseId, t.status),
		index("ob_asset_return_org_status_idx").on(t.organizationId, t.status),
	]
);

// ───────────────────────────────────────────────────────────────────
// 6. offboarding_access_revocation — system access removal per case
//    system is free text until Phase 14 (IAM automations).
// ───────────────────────────────────────────────────────────────────

export const offboardingAccessRevocation = pgTable(
	"offboarding_access_revocation",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		// Free text: "Email", "VPN", "Slack", "HRIS", "GitHub", etc.
		system: text("system").notNull(),
		description: text("description"),
		scheduledRevokeAt: timestamp("scheduled_revoke_at"),
		revokedAt: timestamp("revoked_at"),
		revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: offboardingAccessStatusEnum("status").default("pending").notNull(),
		note: text("note"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_access_revoc_case_status_idx").on(t.caseId, t.status),
		index("ob_access_revoc_org_status_idx").on(t.organizationId, t.status),
	]
);

// ───────────────────────────────────────────────────────────────────
// 7. offboarding_document_request — clearance/exit document collection
//    fileUrl is DB-sourced; API layer validates via safeHttpUrl at render.
// ───────────────────────────────────────────────────────────────────

export const offboardingDocumentRequest = pgTable(
	"offboarding_document_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		documentType: text("document_type").notNull(),
		title: text("title").notNull(),
		requestedByUserId: text("requested_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		fileUrl: text("file_url"),
		uploadedAt: timestamp("uploaded_at"),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: offboardingDocumentStatusEnum("status")
			.default("requested")
			.notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_doc_request_case_status_idx").on(t.caseId, t.status),
		index("ob_doc_request_org_status_idx").on(t.organizationId, t.status),
	]
);

// ───────────────────────────────────────────────────────────────────
// 8. offboarding_exit_interview — one optional exit interview per case
//    isPrivate=true (default) means only HR can see the content.
//    internalNotes are always HR-only regardless of isPrivate.
// ───────────────────────────────────────────────────────────────────

export const offboardingExitInterview = pgTable(
	"offboarding_exit_interview",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		conductedByUserId: text("conducted_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		conductedAt: timestamp("conducted_at"),
		// Default private — HR must explicitly toggle to share summary with employee
		isPrivate: boolean("is_private").default(true).notNull(),
		overallRating: integer("overall_rating"),
		reasonForLeaving: text("reason_for_leaving"),
		whatWentWell: text("what_went_well"),
		whatCouldImprove: text("what_could_improve"),
		// HR's rehire recommendation — never visible to employee
		wouldRehire: boolean("would_rehire"),
		// HR-only field — never exposed to departing employee
		internalNotes: text("internal_notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("ob_exit_interview_case_idx").on(t.caseId),
		// One interview per active case
		uniqueIndex("ob_exit_interview_case_uq")
			.on(t.caseId)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 9. offboarding_activity — immutable audit trail per case
// ───────────────────────────────────────────────────────────────────

export const offboardingActivity = pgTable(
	"offboarding_activity",
	{
		id: cuid(),
		organizationId: orgRef(),
		caseId: text("case_id")
			.notNull()
			.references(() => offboardingCase.id, { onDelete: "cascade" }),
		// Allowed kinds: case_created | status_changed | task_completed |
		// task_skipped | asset_returned | access_revoked | document_uploaded |
		// interview_recorded | case_closed | case_cancelled
		kind: text("kind").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		summary: text("summary").notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// No updatedAt / deletedAt — activity rows are append-only
	},
	(t) => [
		index("ob_activity_case_created_idx").on(t.caseId, t.createdAt),
		index("ob_activity_org_created_idx").on(t.organizationId, t.createdAt),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const offboardingTemplateRelations = relations(
	offboardingTemplate,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [offboardingTemplate.organizationId],
			references: [organization.id],
		}),
		tasks: many(offboardingTemplateTask),
		cases: many(offboardingCase),
	})
);

export const offboardingTemplateTaskRelations = relations(
	offboardingTemplateTask,
	({ one }) => ({
		template: one(offboardingTemplate, {
			fields: [offboardingTemplateTask.templateId],
			references: [offboardingTemplate.id],
		}),
	})
);

export const offboardingCaseRelations = relations(
	offboardingCase,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [offboardingCase.organizationId],
			references: [organization.id],
		}),
		employee: one(employeeProfile, {
			fields: [offboardingCase.employeeId],
			references: [employeeProfile.id],
		}),
		template: one(offboardingTemplate, {
			fields: [offboardingCase.templateId],
			references: [offboardingTemplate.id],
		}),
		tasks: many(offboardingTask),
		assetReturns: many(offboardingAssetReturn),
		accessRevocations: many(offboardingAccessRevocation),
		documentRequests: many(offboardingDocumentRequest),
		exitInterview: many(offboardingExitInterview),
		activity: many(offboardingActivity),
	})
);

export const offboardingTaskRelations = relations(
	offboardingTask,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingTask.caseId],
			references: [offboardingCase.id],
		}),
		assigneeEmployee: one(employeeProfile, {
			fields: [offboardingTask.assigneeEmployeeId],
			references: [employeeProfile.id],
		}),
		templateTask: one(offboardingTemplateTask, {
			fields: [offboardingTask.templateTaskId],
			references: [offboardingTemplateTask.id],
		}),
	})
);

export const offboardingAssetReturnRelations = relations(
	offboardingAssetReturn,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingAssetReturn.caseId],
			references: [offboardingCase.id],
		}),
	})
);

export const offboardingAccessRevocationRelations = relations(
	offboardingAccessRevocation,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingAccessRevocation.caseId],
			references: [offboardingCase.id],
		}),
	})
);

export const offboardingDocumentRequestRelations = relations(
	offboardingDocumentRequest,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingDocumentRequest.caseId],
			references: [offboardingCase.id],
		}),
	})
);

export const offboardingExitInterviewRelations = relations(
	offboardingExitInterview,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingExitInterview.caseId],
			references: [offboardingCase.id],
		}),
	})
);

export const offboardingActivityRelations = relations(
	offboardingActivity,
	({ one }) => ({
		case: one(offboardingCase, {
			fields: [offboardingActivity.caseId],
			references: [offboardingCase.id],
		}),
	})
);
