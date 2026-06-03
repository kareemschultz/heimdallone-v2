import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { asset } from "./assets";
import { attendanceRecord } from "./attendance";
import { user } from "./auth";
import { cuid, employeeProfile, orgRef, timestamps } from "./hr-core";
import { leaveRequest } from "./leave";
import { offboardingCase } from "./offboarding";
import { payrollRun, payslip } from "./payroll";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 13B Helpdesk / Requests
//
// GUARDRAIL: Helpdesk is the request/ticket LAYER that LINKS to Assets / Payroll /
// Leave / Attendance / Offboarding via read-only FK columns — it NEVER duplicates
// or mutates their business logic. Procurement stays in asset_request; payroll
// blockers stay in payroll_issue; leave/attendance corrections stay in their
// modules. The link columns below are context/deep-link only.
// ───────────────────────────────────────────────────────────────────

export const helpdeskRequestStatusEnum = pgEnum("helpdesk_request_status", [
	"new",
	"open",
	"in_progress",
	"waiting_on_employee",
	"waiting_on_approval",
	"resolved",
	"closed",
	"cancelled",
]);

export const helpdeskPriorityEnum = pgEnum("helpdesk_priority", [
	"low",
	"normal",
	"high",
	"urgent",
]);

// Canonical request categories (seeded). `custom` lets a tenant add their own.
export const helpdeskCategoryKeyEnum = pgEnum("helpdesk_category_key", [
	"hr",
	"payroll",
	"attendance",
	"leave",
	"documents",
	"assets",
	"it",
	"facilities",
	"finance",
	"general",
	"custom",
]);

// Single-step approval flavour (multi-step approval table deferred).
export const helpdeskApprovalStatusEnum = pgEnum("helpdesk_approval_status", [
	"none",
	"pending",
	"approved",
	"rejected",
]);

// Generic forward-compat link target for modules without a dedicated FK column
// (the well-known ones get real FKs below). No FK — these may be future/external.
export const helpdeskLinkedEntityTypeEnum = pgEnum(
	"helpdesk_linked_entity_type",
	["document", "project_task", "expense", "crm_case", "other"]
);

// NOTE: SLA state (not_applicable | on_track | due_soon | overdue | breached) is
// DERIVED at read time from firstResponseDueAt/resolutionDueAt + status — it
// changes purely as the clock advances, so it is NEVER stored (a persisted value
// would be guaranteed-stale). The 13C API computes it; these are the canonical
// values for that code:
export const HELPDESK_SLA_STATES = [
	"not_applicable",
	"on_track",
	"due_soon",
	"overdue",
	"breached",
] as const;
export type HelpdeskSlaState = (typeof HELPDESK_SLA_STATES)[number];

// ───────────────────────────────────────────────────────────────────
// 1. helpdesk_category — request categories (HR, IT, Facilities, …)
// ───────────────────────────────────────────────────────────────────

export const helpdeskCategory = pgTable(
	"helpdesk_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		key: helpdeskCategoryKeyEnum("key").default("general").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		// The default owner/queue this category routes to (an agent user).
		defaultAssigneeUserId: text("default_assignee_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		defaultPriority: helpdeskPriorityEnum("default_priority")
			.default("normal")
			.notNull(),
		// Per-category SLA default (hours to resolution); per-priority code defaults
		// override when null. Configurable SLA-policy table is deferred.
		defaultSlaHours: integer("default_sla_hours"),
		requiresApproval: boolean("requires_approval").default(false).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("helpdesk_category_org_idx").on(t.organizationId),
		uniqueIndex("helpdesk_category_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. helpdesk_request — the core ticket. Carries read-only links to other
//    modules (the guardrail) but owns none of their logic.
// ───────────────────────────────────────────────────────────────────

export const helpdeskRequest = pgTable(
	"helpdesk_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		// Human-friendly ticket no. (e.g. HD-000042), unique per org. Generated at
		// creation (13C: transactional max+1 per org; seed sets explicit values).
		reference: text("reference").notNull(),
		categoryId: text("category_id").references(() => helpdeskCategory.id, {
			onDelete: "set null",
		}),
		// The employee the request is FOR (owner/subject). restrict = preserve history.
		requesterEmployeeId: text("requester_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		// Set when the request is about a DIFFERENT employee (logged on-behalf).
		targetEmployeeId: text("target_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		// Who actually logged it (= requester for self-service; HR/manager for on-behalf).
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		description: text("description"),
		priority: helpdeskPriorityEnum("priority").default("normal").notNull(),
		status: helpdeskRequestStatusEnum("status").default("new").notNull(),
		// Current agent/owner (a user — agents act as authenticated users; authz is
		// user-scoped, mirroring asset_assignment.assignedByUserId).
		assignedToUserId: text("assigned_to_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// SLA targets, set at creation from priority/category. SLA *state* is derived.
		firstResponseDueAt: timestamp("first_response_due_at"),
		resolutionDueAt: timestamp("resolution_due_at"),
		firstRespondedAt: timestamp("first_responded_at"),
		resolvedAt: timestamp("resolved_at"),
		closedAt: timestamp("closed_at"),
		resolutionNote: text("resolution_note"),
		// Single-step approval flavour.
		approvalRequired: boolean("approval_required").default(false).notNull(),
		approvalStatus: helpdeskApprovalStatusEnum("approval_status")
			.default("none")
			.notNull(),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvalNote: text("approval_note"),
		// ── Read-only cross-module links (the guardrail). All ON DELETE SET NULL so
		//    removing the linked row clears the link but never breaks the ticket.
		linkedAssetId: text("linked_asset_id").references(() => asset.id, {
			onDelete: "set null",
		}),
		linkedPayslipId: text("linked_payslip_id").references(() => payslip.id, {
			onDelete: "set null",
		}),
		linkedPayrollRunId: text("linked_payroll_run_id").references(
			() => payrollRun.id,
			{ onDelete: "set null" }
		),
		linkedLeaveRequestId: text("linked_leave_request_id").references(
			() => leaveRequest.id,
			{ onDelete: "set null" }
		),
		linkedAttendanceRecordId: text("linked_attendance_record_id").references(
			() => attendanceRecord.id,
			{ onDelete: "set null" }
		),
		linkedOffboardingCaseId: text("linked_offboarding_case_id").references(
			() => offboardingCase.id,
			{ onDelete: "set null" }
		),
		// Generic forward-compat link (Projects/Finance/CRM/documents) — no FK.
		linkedEntityType: helpdeskLinkedEntityTypeEnum("linked_entity_type"),
		linkedEntityId: text("linked_entity_id"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		uniqueIndex("helpdesk_request_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
		index("helpdesk_request_org_status_idx").on(t.organizationId, t.status),
		index("helpdesk_request_org_priority_idx").on(t.organizationId, t.priority),
		index("helpdesk_request_org_assignee_idx").on(
			t.organizationId,
			t.assignedToUserId
		),
		index("helpdesk_request_org_requester_idx").on(
			t.organizationId,
			t.requesterEmployeeId
		),
		index("helpdesk_request_org_target_idx").on(
			t.organizationId,
			t.targetEmployeeId
		),
		index("helpdesk_request_org_category_idx").on(
			t.organizationId,
			t.categoryId
		),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. helpdesk_request_comment — thread; internal notes flagged isInternal
//    (redacted from the requesting employee server-side in 13C).
// ───────────────────────────────────────────────────────────────────

export const helpdeskRequestComment = pgTable(
	"helpdesk_request_comment",
	{
		id: cuid(),
		organizationId: orgRef(),
		requestId: text("request_id")
			.notNull()
			.references(() => helpdeskRequest.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		body: text("body").notNull(),
		// true = internal agent/HR note, NEVER shown to the requesting employee.
		isInternal: boolean("is_internal").default(false).notNull(),
		...timestamps,
	},
	(t) => [
		index("helpdesk_request_comment_request_idx").on(t.requestId),
		index("helpdesk_request_comment_org_idx").on(t.organizationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const helpdeskCategoryRelations = relations(
	helpdeskCategory,
	({ many }) => ({
		requests: many(helpdeskRequest),
	})
);

export const helpdeskRequestRelations = relations(
	helpdeskRequest,
	({ one, many }) => ({
		category: one(helpdeskCategory, {
			fields: [helpdeskRequest.categoryId],
			references: [helpdeskCategory.id],
		}),
		requester: one(employeeProfile, {
			fields: [helpdeskRequest.requesterEmployeeId],
			references: [employeeProfile.id],
		}),
		comments: many(helpdeskRequestComment),
	})
);

export const helpdeskRequestCommentRelations = relations(
	helpdeskRequestComment,
	({ one }) => ({
		request: one(helpdeskRequest, {
			fields: [helpdeskRequestComment.requestId],
			references: [helpdeskRequest.id],
		}),
	})
);
