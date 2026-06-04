/**
 * Performance / PMS — Phase 15B schema.
 *
 * Scope (per docs/architecture/performance-pms-implementation-plan.md):
 *   performance_objective / performance_key_result / review_cycle /
 *   question_template / review_question / review_request / review_response /
 *   one_on_one / recognition_point   (the MVP 9-table spine).
 *
 * CENTRAL GUARDRAIL: Performance OWNS its data (goals/OKRs, reviews, 1-on-1s,
 * recognition) but LINKS read-only to neighbours and NEVER mutates them — the
 * same discipline as Projects/Helpdesk.
 *   - `performance_key_result.linkedProjectTaskId → project_task` is a nullable
 *     FK ON DELETE SET NULL — a READ-ONLY progress signal (the Projects 14A seam:
 *     PMS reads a linked task's completion). The Performance router (15C) NEVER
 *     writes to `project*`.
 *   - `recognition_point` is the PMS-owned RECOGNITION ledger — NON-MONETARY
 *     gamification points, NOT pay. There is deliberately NO foreign key to
 *     `payslip` / `payroll_run` and NO money/currency column here. PMS NEVER
 *     writes Payroll; a future Finance phase may READ this ledger to propose a
 *     monetary bonus, owning that conversion.
 *   - `one_on_one.privateManagerNotes` is the manager's private note column,
 *     redacted from the employee SERVER-SIDE in 15C (mirrors helpdesk/projects
 *     internal-note redaction).
 *   - Peer-review ANONYMITY is structurally supported: `review_request` carries
 *     the (subject, reviewer, relationship) so the 15C reader can aggregate peer
 *     responses and only reveal them above `review_cycle.anonymityThreshold`.
 *   - There is NO `performance_activity` table — the Activity tab reads the shared
 *     `audit_event` log (the Projects 14H decision).
 *
 * Objective `progressPercent` is a cached derived value (recomputed from the key
 * results on write); the qualitative health (on_track/at_risk/behind) may be
 * derived but a stored status is fine since objectives are explicitly managed.
 */

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
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, employeeProfile, orgRef, timestamps } from "./hr-core";
import { projectTask } from "./projects";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const objectiveStatusEnum = pgEnum("objective_status", [
	"draft",
	"active",
	"on_track",
	"at_risk",
	"behind",
	"completed",
	"cancelled",
]);

export const keyResultStatusEnum = pgEnum("key_result_status", [
	"not_started",
	"on_track",
	"at_risk",
	"done",
]);

export const keyResultProgressTypeEnum = pgEnum("key_result_progress_type", [
	"percentage",
	"number",
	"currency",
	"boolean",
]);

export const reviewCycleStatusEnum = pgEnum("review_cycle_status", [
	"draft",
	"active",
	"closed",
	"cancelled",
]);

// "three_sixty" is the value for a 360 cycle (kept alphanumeric for clean code;
// the UI labels it "360"). upward = reports reviewing their manager.
export const reviewCycleTypeEnum = pgEnum("review_cycle_type", [
	"self",
	"manager",
	"three_sixty",
	"upward",
]);

export const reviewRequestStatusEnum = pgEnum("review_request_status", [
	"pending",
	"in_progress",
	"submitted",
	"declined",
]);

export const reviewRelationshipEnum = pgEnum("review_relationship", [
	"self",
	"manager",
	"peer",
	"report",
]);

export const questionTypeEnum = pgEnum("question_type", [
	"text",
	"rating",
	"boolean",
	"multi_choice",
	"likert",
]);

export const oneOnOneStatusEnum = pgEnum("one_on_one_status", [
	"scheduled",
	"completed",
	"cancelled",
]);

// Recognition is non-monetary: `manual` = a person awarded it; `objective_completed`
// = the server auto-awarded it on an on-time objective completion (15H).
export const recognitionSourceEnum = pgEnum("recognition_source", [
	"manual",
	"objective_completed",
]);

// Derived-at-read-time objective health (NOT a stored column on its own — the
// `objective_status` enum already carries on_track/at_risk/behind when managed).
export const OBJECTIVE_HEALTH_STATES = [
	"on_track",
	"at_risk",
	"behind",
	"completed",
	"no_data",
] as const;
export type ObjectiveHealth = (typeof OBJECTIVE_HEALTH_STATES)[number];

// ─── review_cycle ──────────────────────────────────────────────────────────────
// Defined before objective/request because they reference it (Drizzle FK
// callbacks are lazy, but this keeps the read order natural).

export const reviewCycle = pgTable(
	"review_cycle",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // REV-000001
		name: text("name").notNull(),
		description: text("description"),
		type: reviewCycleTypeEnum("type").default("manager").notNull(),
		status: reviewCycleStatusEnum("status").default("draft").notNull(),
		startDate: date("start_date", { mode: "date" }),
		endDate: date("end_date", { mode: "date" }),
		// Aggregated peer responses are only revealed at/above this many raters in a
		// category — the anonymity threshold (research default 3).
		anonymityThreshold: integer("anonymity_threshold").default(3).notNull(),
		isAnonymousPeers: boolean("is_anonymous_peers").default(true).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("review_cycle_org_idx").on(t.organizationId),
		index("review_cycle_org_status_idx").on(t.organizationId, t.status),
		uniqueIndex("review_cycle_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── question_template ─────────────────────────────────────────────────────────

export const questionTemplate = pgTable(
	"question_template",
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
		index("question_template_org_idx").on(t.organizationId),
		uniqueIndex("question_template_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── review_question ───────────────────────────────────────────────────────────

export const reviewQuestion = pgTable(
	"review_question",
	{
		id: cuid(),
		organizationId: orgRef(),
		templateId: text("template_id")
			.notNull()
			.references(() => questionTemplate.id, { onDelete: "cascade" }),
		text: text("text").notNull(),
		type: questionTypeEnum("type").default("text").notNull(),
		options: jsonb("options"), // for multi_choice / likert
		displayOrder: integer("display_order").default(0).notNull(),
		...timestamps,
	},
	(t) => [
		index("review_question_template_idx").on(t.templateId),
		index("review_question_org_idx").on(t.organizationId),
	]
);

// ─── performance_objective ──────────────────────────────────────────────────────

export const performanceObjective = pgTable(
	"performance_objective",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(), // GOAL-000001
		// The person the goal belongs to. restrict preserves history.
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		ownerUserId: text("owner_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		description: text("description"),
		// Optional link to a review cycle (a goal set as part of a cycle).
		cycleId: text("cycle_id").references(() => reviewCycle.id, {
			onDelete: "set null",
		}),
		status: objectiveStatusEnum("status").default("draft").notNull(),
		weight: integer("weight").default(0).notNull(),
		startDate: date("start_date", { mode: "date" }),
		dueDate: date("due_date", { mode: "date" }),
		completedAt: timestamp("completed_at"),
		// Cached derived progress (0–100) recomputed from the key results on write.
		progressPercent: integer("progress_percent").default(0).notNull(),
		internalNote: text("internal_note"),
		isArchived: boolean("is_archived").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("performance_objective_org_idx").on(t.organizationId),
		index("performance_objective_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		index("performance_objective_org_status_idx").on(
			t.organizationId,
			t.status
		),
		index("performance_objective_cycle_idx").on(t.cycleId),
		uniqueIndex("performance_objective_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── performance_key_result ─────────────────────────────────────────────────────
// The measurable result under an objective. `linkedProjectTaskId` is the READ-ONLY
// cross-module signal (the Projects 14A seam) — SET NULL, NEVER mutated by PMS.

export const performanceKeyResult = pgTable(
	"performance_key_result",
	{
		id: cuid(),
		organizationId: orgRef(),
		objectiveId: text("objective_id")
			.notNull()
			.references(() => performanceObjective.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		progressType: keyResultProgressTypeEnum("progress_type")
			.default("percentage")
			.notNull(),
		// numeric so a currency/number KR is exact; a percentage KR uses 0..100.
		startValue: numeric("start_value", { precision: 14, scale: 2 })
			.default("0")
			.notNull(),
		currentValue: numeric("current_value", { precision: 14, scale: 2 })
			.default("0")
			.notNull(),
		targetValue: numeric("target_value", { precision: 14, scale: 2 })
			.default("100")
			.notNull(),
		status: keyResultStatusEnum("status").default("not_started").notNull(),
		// READ-ONLY cross-module CONTEXT link (the guardrail). SET NULL so deleting
		// the linked task clears the link but never breaks the KR; NEVER mutated.
		linkedProjectTaskId: text("linked_project_task_id").references(
			() => projectTask.id,
			{ onDelete: "set null" }
		),
		displayOrder: integer("display_order").default(0).notNull(),
		...timestamps,
	},
	(t) => [
		index("performance_key_result_objective_idx").on(t.objectiveId),
		index("performance_key_result_org_idx").on(t.organizationId),
		index("performance_key_result_linked_task_idx").on(t.linkedProjectTaskId),
	]
);

// ─── review_request ──────────────────────────────────────────────────────────────
// The 360 fan-out: one (subject, reviewer, relationship) per cycle. This row IS the
// structural support for anonymity — peer rows are counted per category and
// aggregated above the cycle threshold without exposing the reviewer.

export const reviewRequest = pgTable(
	"review_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		cycleId: text("cycle_id")
			.notNull()
			.references(() => reviewCycle.id, { onDelete: "cascade" }),
		subjectEmployeeId: text("subject_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		reviewerEmployeeId: text("reviewer_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		relationship: reviewRelationshipEnum("relationship").notNull(),
		status: reviewRequestStatusEnum("status").default("pending").notNull(),
		submittedAt: timestamp("submitted_at"),
		...timestamps,
	},
	(t) => [
		index("review_request_cycle_idx").on(t.cycleId),
		index("review_request_org_subject_idx").on(
			t.organizationId,
			t.subjectEmployeeId
		),
		index("review_request_org_reviewer_idx").on(
			t.organizationId,
			t.reviewerEmployeeId
		),
		// One request per (cycle, subject, reviewer) — no duplicate fan-out rows.
		uniqueIndex("review_request_cycle_subject_reviewer_uq").on(
			t.cycleId,
			t.subjectEmployeeId,
			t.reviewerEmployeeId
		),
	]
);

// ─── review_response ─────────────────────────────────────────────────────────────

export const reviewResponse = pgTable(
	"review_response",
	{
		id: cuid(),
		organizationId: orgRef(),
		requestId: text("request_id")
			.notNull()
			.references(() => reviewRequest.id, { onDelete: "cascade" }),
		questionId: text("question_id").references(() => reviewQuestion.id, {
			onDelete: "set null",
		}),
		answerText: text("answer_text"),
		answerRating: integer("answer_rating"),
		answerJson: jsonb("answer_json"),
		...timestamps,
	},
	(t) => [
		index("review_response_request_idx").on(t.requestId),
		index("review_response_org_idx").on(t.organizationId),
	]
);

// ─── one_on_one ──────────────────────────────────────────────────────────────────
// `privateManagerNotes` is the manager's private note — redacted from the employee
// SERVER-SIDE in 15C (the column exists here to make that redaction possible).

export const oneOnOne = pgTable(
	"one_on_one",
	{
		id: cuid(),
		organizationId: orgRef(),
		managerEmployeeId: text("manager_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		scheduledAt: timestamp("scheduled_at"),
		status: oneOnOneStatusEnum("status").default("scheduled").notNull(),
		sharedNotes: text("shared_notes"),
		// Manager-only — stripped from the employee server-side in 15C.
		privateManagerNotes: text("private_manager_notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("one_on_one_org_idx").on(t.organizationId),
		index("one_on_one_org_employee_idx").on(t.organizationId, t.employeeId),
		index("one_on_one_org_manager_idx").on(
			t.organizationId,
			t.managerEmployeeId
		),
	]
);

// ─── recognition_point ───────────────────────────────────────────────────────────
// The PMS-owned RECOGNITION ledger. Non-monetary points — NO payroll FK, NO money
// column. Points are NOT pay; a future Finance phase may READ this to propose a
// monetary bonus. PMS never writes Payroll.

export const recognitionPoint = pgTable(
	"recognition_point",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		points: integer("points").notNull(),
		reason: text("reason"),
		source: recognitionSourceEnum("source").default("manual").notNull(),
		awardedByUserId: text("awarded_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// Optional provenance: the objective whose completion triggered an auto-award.
		objectiveId: text("objective_id").references(
			() => performanceObjective.id,
			{ onDelete: "set null" }
		),
		...timestamps,
	},
	(t) => [
		index("recognition_point_org_idx").on(t.organizationId),
		index("recognition_point_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		index("recognition_point_objective_idx").on(t.objectiveId),
	]
);

// ─── Relations (intra-module only; cross-module links stay plain FKs) ───────────

export const performanceObjectiveRelations = relations(
	performanceObjective,
	({ one, many }) => ({
		employee: one(employeeProfile, {
			fields: [performanceObjective.employeeId],
			references: [employeeProfile.id],
		}),
		cycle: one(reviewCycle, {
			fields: [performanceObjective.cycleId],
			references: [reviewCycle.id],
		}),
		keyResults: many(performanceKeyResult),
	})
);

export const performanceKeyResultRelations = relations(
	performanceKeyResult,
	({ one }) => ({
		objective: one(performanceObjective, {
			fields: [performanceKeyResult.objectiveId],
			references: [performanceObjective.id],
		}),
	})
);

export const reviewCycleRelations = relations(reviewCycle, ({ many }) => ({
	requests: many(reviewRequest),
	objectives: many(performanceObjective),
}));

export const questionTemplateRelations = relations(
	questionTemplate,
	({ many }) => ({
		questions: many(reviewQuestion),
	})
);

export const reviewQuestionRelations = relations(reviewQuestion, ({ one }) => ({
	template: one(questionTemplate, {
		fields: [reviewQuestion.templateId],
		references: [questionTemplate.id],
	}),
}));

export const reviewRequestRelations = relations(
	reviewRequest,
	({ one, many }) => ({
		cycle: one(reviewCycle, {
			fields: [reviewRequest.cycleId],
			references: [reviewCycle.id],
		}),
		subject: one(employeeProfile, {
			fields: [reviewRequest.subjectEmployeeId],
			references: [employeeProfile.id],
		}),
		responses: many(reviewResponse),
	})
);

export const reviewResponseRelations = relations(reviewResponse, ({ one }) => ({
	request: one(reviewRequest, {
		fields: [reviewResponse.requestId],
		references: [reviewRequest.id],
	}),
}));

export const recognitionPointRelations = relations(
	recognitionPoint,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [recognitionPoint.employeeId],
			references: [employeeProfile.id],
		}),
		objective: one(performanceObjective, {
			fields: [recognitionPoint.objectiveId],
			references: [performanceObjective.id],
		}),
	})
);
