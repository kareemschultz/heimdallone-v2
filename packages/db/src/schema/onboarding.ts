import { relations, sql } from "drizzle-orm";
import {
	boolean,
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
import { candidateApplication } from "./recruitment";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 9A onboarding status lifecycles (spec §5.6–5.8)
// ───────────────────────────────────────────────────────────────────

// §5.6 not_started → in_progress → blocked → in_progress → completed | cancelled
export const onboardingStatusEnum = pgEnum("onboarding_status", [
	"not_started",
	"in_progress",
	"blocked",
	"completed",
	"cancelled",
]);

// §5.7 todo → in_progress → waiting → in_progress → completed | skipped | blocked
export const onboardingTaskStatusEnum = pgEnum("onboarding_task_status", [
	"todo",
	"in_progress",
	"waiting",
	"completed",
	"skipped",
	"blocked",
]);

// §5.8 onboardingCategoryEnum
export const onboardingCategoryEnum = pgEnum("onboarding_category", [
	"document",
	"equipment",
	"policy",
	"training",
	"introduction",
	"other",
]);

// §5.8 documentRequestStatusEnum (spec values: requested / uploaded / approved / rejected)
export const documentRequestStatusEnum = pgEnum("document_request_status", [
	"requested",
	"uploaded",
	"approved",
	"rejected",
]);

// ───────────────────────────────────────────────────────────────────
// 1. onboarding_template — reusable template (spec §4.1)
// ───────────────────────────────────────────────────────────────────

export const onboardingTemplate = pgTable(
	"onboarding_template",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		isDefault: boolean("is_default").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("onboarding_template_org_idx").on(t.organizationId),
		// Unique name per org among non-deleted templates.
		uniqueIndex("onboarding_template_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. onboarding_template_task — template line items (spec §4.2)
// ───────────────────────────────────────────────────────────────────

export const onboardingTemplateTask = pgTable(
	"onboarding_template_task",
	{
		id: cuid(),
		organizationId: orgRef(),
		templateId: text("template_id")
			.notNull()
			.references(() => onboardingTemplate.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		category: onboardingCategoryEnum("category").notNull(),
		// String role label until an IT/identity module exists
		// (e.g. "hr_admin" / "manager" / "new_hire" / "it_admin").
		defaultAssigneeRole: text("default_assignee_role"),
		dueOffsetDays: integer("due_offset_days").default(0).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isRequired: boolean("is_required").default(true).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("onboarding_template_task_template_idx").on(
			t.templateId,
			t.sortOrder
		),
		index("onboarding_template_task_org_idx").on(t.organizationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. employee_onboarding — per-hire instance (spec §4.3)
// ───────────────────────────────────────────────────────────────────

export const employeeOnboarding = pgTable(
	"employee_onboarding",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		// Link back to the application if the onboarding was started from a hire.
		applicationId: text("application_id").references(
			() => candidateApplication.id,
			{ onDelete: "set null" }
		),
		// Snapshot source — nullable so the instance survives template deletion.
		templateId: text("template_id").references(() => onboardingTemplate.id, {
			onDelete: "set null",
		}),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		targetCompletionAt: timestamp("target_completion_at"),
		completedAt: timestamp("completed_at"),
		status: onboardingStatusEnum("status").default("in_progress").notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("employee_onboarding_org_status_idx").on(t.organizationId, t.status),
		index("employee_onboarding_employee_idx").on(t.employeeId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. onboarding_task — per-instance task, snapshot of template task (spec §4.4)
// ───────────────────────────────────────────────────────────────────

export const onboardingTask = pgTable(
	"onboarding_task",
	{
		id: cuid(),
		organizationId: orgRef(),
		onboardingId: text("onboarding_id")
			.notNull()
			.references(() => employeeOnboarding.id, { onDelete: "cascade" }),
		// Nullable for ad-hoc tasks added after start. Editing the template never
		// mutates these snapshot fields — the new hire's plan is frozen at start.
		templateTaskId: text("template_task_id").references(
			() => onboardingTemplateTask.id,
			{ onDelete: "set null" }
		),
		titleSnapshot: text("title_snapshot").notNull(),
		descriptionSnapshot: text("description_snapshot"),
		category: onboardingCategoryEnum("category").notNull(),
		assigneeEmployeeId: text("assignee_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		// For non-employee assignees (e.g. an IT admin user).
		assigneeUserId: text("assignee_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		dueAt: timestamp("due_at"),
		status: onboardingTaskStatusEnum("status").default("todo").notNull(),
		completedAt: timestamp("completed_at"),
		completedByUserId: text("completed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		notes: text("notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("onboarding_task_onboarding_idx").on(t.onboardingId),
		index("onboarding_task_assignee_status_idx").on(
			t.assigneeEmployeeId,
			t.status
		),
		index("onboarding_task_org_due_idx").on(t.organizationId, t.dueAt),
	]
);

// ───────────────────────────────────────────────────────────────────
// 5. onboarding_document_request — documents the new hire must provide (spec §4.5)
// ───────────────────────────────────────────────────────────────────

export const onboardingDocumentRequest = pgTable(
	"onboarding_document_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		onboardingId: text("onboarding_id")
			.notNull()
			.references(() => employeeOnboarding.id, { onDelete: "cascade" }),
		onboardingTaskId: text("onboarding_task_id").references(
			() => onboardingTask.id,
			{ onDelete: "set null" }
		),
		documentType: text("document_type").notNull(),
		requiredFileTypes: jsonb("required_file_types").$type<string[]>(),
		status: documentRequestStatusEnum("status").default("requested").notNull(),
		uploadedFileUrl: text("uploaded_file_url"),
		uploadedAt: timestamp("uploaded_at"),
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: timestamp("reviewed_at"),
		rejectionReason: text("rejection_reason"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("onboarding_doc_request_onboarding_status_idx").on(
			t.onboardingId,
			t.status
		),
	]
);

// ───────────────────────────────────────────────────────────────────
// 6. onboarding_acknowledgement — policy/handbook sign-offs (spec §4.6)
// ───────────────────────────────────────────────────────────────────

export const onboardingAcknowledgement = pgTable(
	"onboarding_acknowledgement",
	{
		id: cuid(),
		organizationId: orgRef(),
		onboardingId: text("onboarding_id")
			.notNull()
			.references(() => employeeOnboarding.id, { onDelete: "cascade" }),
		policyName: text("policy_name").notNull(),
		policyVersion: text("policy_version"),
		policyUrl: text("policy_url"),
		acknowledgedAt: timestamp("acknowledged_at"),
		acknowledgedByUserId: text("acknowledged_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("onboarding_ack_onboarding_idx").on(t.onboardingId)]
);

// ───────────────────────────────────────────────────────────────────
// 7. onboarding_activity — per-onboarding timeline feed (spec §4.7)
// ───────────────────────────────────────────────────────────────────

export const onboardingActivity = pgTable(
	"onboarding_activity",
	{
		id: cuid(),
		organizationId: orgRef(),
		onboardingId: text("onboarding_id")
			.notNull()
			.references(() => employeeOnboarding.id, { onDelete: "cascade" }),
		// "task_completed" / "document_uploaded" / "comment" / "blocker_raised" / "blocker_cleared"
		kind: text("kind").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		summary: text("summary").notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("onboarding_activity_onboarding_created_idx").on(
			t.onboardingId,
			t.createdAt
		),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const onboardingTemplateRelations = relations(
	onboardingTemplate,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [onboardingTemplate.organizationId],
			references: [organization.id],
		}),
		tasks: many(onboardingTemplateTask),
	})
);

export const onboardingTemplateTaskRelations = relations(
	onboardingTemplateTask,
	({ one }) => ({
		template: one(onboardingTemplate, {
			fields: [onboardingTemplateTask.templateId],
			references: [onboardingTemplate.id],
		}),
	})
);

export const employeeOnboardingRelations = relations(
	employeeOnboarding,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [employeeOnboarding.organizationId],
			references: [organization.id],
		}),
		employee: one(employeeProfile, {
			fields: [employeeOnboarding.employeeId],
			references: [employeeProfile.id],
		}),
		application: one(candidateApplication, {
			fields: [employeeOnboarding.applicationId],
			references: [candidateApplication.id],
		}),
		template: one(onboardingTemplate, {
			fields: [employeeOnboarding.templateId],
			references: [onboardingTemplate.id],
		}),
		tasks: many(onboardingTask),
		documentRequests: many(onboardingDocumentRequest),
		acknowledgements: many(onboardingAcknowledgement),
		activities: many(onboardingActivity),
	})
);

export const onboardingTaskRelations = relations(onboardingTask, ({ one }) => ({
	onboarding: one(employeeOnboarding, {
		fields: [onboardingTask.onboardingId],
		references: [employeeOnboarding.id],
	}),
	templateTask: one(onboardingTemplateTask, {
		fields: [onboardingTask.templateTaskId],
		references: [onboardingTemplateTask.id],
	}),
	assigneeEmployee: one(employeeProfile, {
		fields: [onboardingTask.assigneeEmployeeId],
		references: [employeeProfile.id],
	}),
}));

export const onboardingDocumentRequestRelations = relations(
	onboardingDocumentRequest,
	({ one }) => ({
		onboarding: one(employeeOnboarding, {
			fields: [onboardingDocumentRequest.onboardingId],
			references: [employeeOnboarding.id],
		}),
		task: one(onboardingTask, {
			fields: [onboardingDocumentRequest.onboardingTaskId],
			references: [onboardingTask.id],
		}),
	})
);

export const onboardingAcknowledgementRelations = relations(
	onboardingAcknowledgement,
	({ one }) => ({
		onboarding: one(employeeOnboarding, {
			fields: [onboardingAcknowledgement.onboardingId],
			references: [employeeOnboarding.id],
		}),
	})
);

export const onboardingActivityRelations = relations(
	onboardingActivity,
	({ one }) => ({
		onboarding: one(employeeOnboarding, {
			fields: [onboardingActivity.onboardingId],
			references: [employeeOnboarding.id],
		}),
	})
);
