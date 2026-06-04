/**
 * Projects + Tasks / Timelines — Phase 14B schema.
 *
 * Scope (per docs/architecture/projects-tasks-implementation-plan.md):
 *   project / project_member / project_milestone / project_task /
 *   project_task_comment / project_time_entry  (the MVP 6-table spine).
 *
 * CENTRAL GUARDRAIL: Projects is the COORDINATION layer — it LINKS to other
 * modules for context/reporting and NEVER owns or mutates their business rules.
 *   - Cross-module context links (project_task.linkedAssetId → asset,
 *     linkedHelpdeskRequestId → helpdesk_request) are nullable FKs ON DELETE
 *     SET NULL — read-only references; the Projects router (14C) NEVER writes to
 *     Assets / Helpdesk / Payroll / Attendance.
 *   - CRM links (project.linkedCustomerId / linkedDealId) are SOFT text refs —
 *     NOT foreign keys — because the crm_* tables don't exist yet (Phase 17).
 *     CRM owns the handoff join table and will back-fill the reverse link.
 *   - The generic project_task.linkedEntityType / linkedEntityId pair (no FK) is
 *     the forward-compat escape hatch for future CRM/Finance/external context.
 *   - `budget` is reserved + finance-redacted server-side in 14C; there is NO
 *     cost computation here — the project-time → labour-cost report is Phase 16
 *     (it will READ approved time + contract rates + payroll-engine, never write).
 *   - Time entries are REPORTING-ONLY: they never touch Attendance or Payroll.
 *
 * Project HEALTH is DERIVED at read time (PROJECT_HEALTH_STATES) — never stored
 * (a persisted health value would go stale, like the helpdesk SLA state).
 */

import { relations, sql } from "drizzle-orm";
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
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { asset } from "./assets";
import { user } from "./auth";
import { helpdeskRequest } from "./helpdesk";
import {
	cuid,
	department,
	employeeProfile,
	orgRef,
	timestamps,
} from "./hr-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const projectStatusEnum = pgEnum("project_status", [
	"planning",
	"active",
	"on_hold",
	"completed",
	"cancelled",
	"archived",
]);

// Shared by project (optional) and task (required) priority.
export const projectPriorityEnum = pgEnum("project_priority", [
	"low",
	"normal",
	"high",
	"urgent",
]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
	"lead",
	"member",
	"viewer",
]);

export const projectMilestoneStatusEnum = pgEnum("project_milestone_status", [
	"planned",
	"in_progress",
	"at_risk",
	"completed",
	"missed",
	"cancelled",
]);

export const projectTaskStatusEnum = pgEnum("project_task_status", [
	"todo",
	"in_progress",
	"blocked",
	"in_review",
	"done",
	"cancelled",
]);

export const projectTimeEntryStatusEnum = pgEnum("project_time_entry_status", [
	"draft",
	"submitted",
	"approved",
	"rejected",
]);

// Generic forward-compat link type (no FK) — future CRM/Finance/external context.
export const projectLinkedEntityTypeEnum = pgEnum(
	"project_linked_entity_type",
	["document", "expense", "crm_deal", "crm_customer", "other"]
);

// Derived-at-read-time project health (NOT a stored column — see header).
export const PROJECT_HEALTH_STATES = [
	"on_track",
	"at_risk",
	"off_track",
	"completed",
	"no_data",
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH_STATES)[number];

// ─── project ─────────────────────────────────────────────────────────────────

export const project = pgTable(
	"project",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // PRJ-000001
		name: text("name").notNull(),
		description: text("description"),
		status: projectStatusEnum("status").default("planning").notNull(),
		priority: projectPriorityEnum("priority"),
		// The single canonical owner (a.k.a. project manager) as an employee. The
		// project_member table holds the full team (incl. a matching lead row).
		projectManagerEmployeeId: text("project_manager_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "restrict" }
		),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		startDate: date("start_date", { mode: "date" }),
		targetEndDate: date("target_end_date", { mode: "date" }),
		completedAt: timestamp("completed_at"),
		// Reserved planned budget — finance-redacted server-side in 14C; no cost
		// computation in MVP (labour-cost report is Phase 16).
		budget: numeric("budget", { precision: 14, scale: 2 }),
		// SOFT CRM refs — NOT FKs (crm_* tables are Phase 17). Mirror of CRM's own
		// soft `projectId` text ref so the handoff can wire both ways without a
		// schema rewrite.
		linkedCustomerId: text("linked_customer_id"),
		linkedDealId: text("linked_deal_id"),
		internalNote: text("internal_note"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		isArchived: boolean("is_archived").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("project_org_idx").on(t.organizationId),
		index("project_org_status_idx").on(t.organizationId, t.status),
		index("project_org_manager_idx").on(
			t.organizationId,
			t.projectManagerEmployeeId
		),
		uniqueIndex("project_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
		uniqueIndex("project_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── project_member ──────────────────────────────────────────────────────────
// Real join table (supersedes the Horilla jsonb member-bag) — enables the
// lateral-scope RBAC and member-of validation the API needs in 14C.

export const projectMember = pgTable(
	"project_member",
	{
		id: cuid(),
		organizationId: orgRef(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		role: projectMemberRoleEnum("role").default("member").notNull(),
		allocationPercent: integer("allocation_percent"),
		startDate: date("start_date", { mode: "date" }),
		endDate: date("end_date", { mode: "date" }),
		removedAt: timestamp("removed_at"),
		...timestamps,
	},
	(t) => [
		index("project_member_org_project_idx").on(t.organizationId, t.projectId),
		index("project_member_org_employee_idx").on(t.organizationId, t.employeeId),
		// One ACTIVE membership per employee per project.
		uniqueIndex("project_member_active_uq")
			.on(t.projectId, t.employeeId)
			.where(sql`${t.removedAt} is null`),
	]
);

// ─── project_milestone ───────────────────────────────────────────────────────

export const projectMilestone = pgTable(
	"project_milestone",
	{
		id: cuid(),
		organizationId: orgRef(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		status: projectMilestoneStatusEnum("status").default("planned").notNull(),
		dueDate: date("due_date", { mode: "date" }),
		completedAt: timestamp("completed_at"),
		ownerEmployeeId: text("owner_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		displayOrder: integer("display_order").default(0).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("project_milestone_org_idx").on(t.organizationId),
		index("project_milestone_project_idx").on(t.projectId),
		index("project_milestone_org_status_idx").on(t.organizationId, t.status),
		index("project_milestone_project_due_idx").on(t.projectId, t.dueDate),
	]
);

// ─── project_task ────────────────────────────────────────────────────────────

export const projectTask = pgTable(
	"project_task",
	{
		id: cuid(),
		organizationId: orgRef(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		reference: text("reference").notNull(), // TSK-000001
		milestoneId: text("milestone_id").references(() => projectMilestone.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		description: text("description"),
		status: projectTaskStatusEnum("status").default("todo").notNull(),
		priority: projectPriorityEnum("priority").default("normal").notNull(),
		// Assignee = the doer (an employee). restrict preserves history; nullable
		// so a task can be unassigned.
		assigneeEmployeeId: text("assignee_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "restrict" }
		),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		startDate: date("start_date", { mode: "date" }),
		dueDate: date("due_date", { mode: "date" }),
		completedAt: timestamp("completed_at"),
		estimateMinutes: integer("estimate_minutes"),
		// Read-only cross-module CONTEXT links (the guardrail). SET NULL so deleting
		// the linked row clears the link but never breaks the task; NEVER mutated.
		linkedAssetId: text("linked_asset_id").references(() => asset.id, {
			onDelete: "set null",
		}),
		linkedHelpdeskRequestId: text("linked_helpdesk_request_id").references(
			() => helpdeskRequest.id,
			{ onDelete: "set null" }
		),
		// Generic forward-compat link (no FK) — future CRM/Finance/external.
		linkedEntityType: projectLinkedEntityTypeEnum("linked_entity_type"),
		linkedEntityId: text("linked_entity_id"),
		displayOrder: integer("display_order").default(0).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("project_task_org_idx").on(t.organizationId),
		index("project_task_project_idx").on(t.projectId),
		index("project_task_org_status_idx").on(t.organizationId, t.status),
		index("project_task_org_assignee_idx").on(
			t.organizationId,
			t.assigneeEmployeeId,
			t.status
		),
		index("project_task_org_due_idx").on(t.organizationId, t.dueDate),
		index("project_task_milestone_idx").on(t.milestoneId),
		index("project_task_linked_asset_idx").on(t.linkedAssetId),
		index("project_task_linked_ticket_idx").on(t.linkedHelpdeskRequestId),
		uniqueIndex("project_task_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── project_task_comment ────────────────────────────────────────────────────
// isInternal comments are server-side redacted in 14C (employees/plain managers
// never receive them) — mirror of the helpdesk internal-note pattern.

export const projectTaskComment = pgTable(
	"project_task_comment",
	{
		id: cuid(),
		organizationId: orgRef(),
		taskId: text("task_id")
			.notNull()
			.references(() => projectTask.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		body: text("body").notNull(),
		isInternal: boolean("is_internal").default(false).notNull(),
		...timestamps,
	},
	(t) => [
		index("project_task_comment_task_idx").on(t.taskId),
		index("project_task_comment_org_idx").on(t.organizationId),
	]
);

// ─── project_time_entry ──────────────────────────────────────────────────────
// REPORTING-ONLY: never touches Attendance or Payroll. Future Finance costing
// (Phase 16) READS approved entries; nothing here writes pay.

export const projectTimeEntry = pgTable(
	"project_time_entry",
	{
		id: cuid(),
		organizationId: orgRef(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		taskId: text("task_id").references(() => projectTask.id, {
			onDelete: "set null",
		}),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		entryDate: date("entry_date", { mode: "date" }).notNull(),
		minutes: integer("minutes").notNull(),
		description: text("description"),
		status: projectTimeEntryStatusEnum("status").default("draft").notNull(),
		submittedAt: timestamp("submitted_at"),
		approvedAt: timestamp("approved_at"),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rejectedAt: timestamp("rejected_at"),
		rejectionReason: text("rejection_reason"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("project_time_entry_org_employee_date_idx").on(
			t.organizationId,
			t.employeeId,
			t.entryDate
		),
		index("project_time_entry_org_project_date_idx").on(
			t.organizationId,
			t.projectId,
			t.entryDate
		),
		index("project_time_entry_org_status_idx").on(t.organizationId, t.status),
		index("project_time_entry_task_idx").on(t.taskId),
	]
);

// ─── Relations (intra-module structure only; cross-module links stay plain FKs) ─

export const projectRelations = relations(project, ({ one, many }) => ({
	projectManager: one(employeeProfile, {
		fields: [project.projectManagerEmployeeId],
		references: [employeeProfile.id],
	}),
	department: one(department, {
		fields: [project.departmentId],
		references: [department.id],
	}),
	members: many(projectMember),
	milestones: many(projectMilestone),
	tasks: many(projectTask),
	timeEntries: many(projectTimeEntry),
}));

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
	project: one(project, {
		fields: [projectMember.projectId],
		references: [project.id],
	}),
	employee: one(employeeProfile, {
		fields: [projectMember.employeeId],
		references: [employeeProfile.id],
	}),
}));

export const projectMilestoneRelations = relations(
	projectMilestone,
	({ one, many }) => ({
		project: one(project, {
			fields: [projectMilestone.projectId],
			references: [project.id],
		}),
		tasks: many(projectTask),
	})
);

export const projectTaskRelations = relations(projectTask, ({ one, many }) => ({
	project: one(project, {
		fields: [projectTask.projectId],
		references: [project.id],
	}),
	milestone: one(projectMilestone, {
		fields: [projectTask.milestoneId],
		references: [projectMilestone.id],
	}),
	assignee: one(employeeProfile, {
		fields: [projectTask.assigneeEmployeeId],
		references: [employeeProfile.id],
	}),
	comments: many(projectTaskComment),
	timeEntries: many(projectTimeEntry),
}));

export const projectTaskCommentRelations = relations(
	projectTaskComment,
	({ one }) => ({
		task: one(projectTask, {
			fields: [projectTaskComment.taskId],
			references: [projectTask.id],
		}),
	})
);

export const projectTimeEntryRelations = relations(
	projectTimeEntry,
	({ one }) => ({
		project: one(project, {
			fields: [projectTimeEntry.projectId],
			references: [project.id],
		}),
		task: one(projectTask, {
			fields: [projectTimeEntry.taskId],
			references: [projectTask.id],
		}),
		employee: one(employeeProfile, {
			fields: [projectTimeEntry.employeeId],
			references: [employeeProfile.id],
		}),
	})
);
