/**
 * Development — Learning & Growth (Phase Dev).
 *
 * The v2 home for v1 Netsurf's internal LMS-light + certification expiry tracking
 * + skills search. Three sub-domains, ONE module:
 *   1. Training programs + enrollments (a clean enroll → in_progress → completed |
 *      failed | withdrawn lifecycle; pass/fail derived against the program's
 *      passingScorePercent on completion).
 *   2. Certifications (definitions + held credentials). Expiry status is DERIVED
 *      at read time from expiryDate vs now + the configured threshold list — it is
 *      NEVER stored as a flag column (same discipline as Helpdesk SLA / Projects
 *      health). Only issueDate / expiryDate are stored.
 *   3. Skills matrix (tenant-defined categories + skill types carrying an ORDERED
 *      proficiency-level list, plus per-employee levels). Each employee_skill
 *      caches a proficiencyOrdinal (denormalized from the type's list at write) so
 *      "who knows X at level ≥ N" is an index hit, not a string compare.
 *
 * SaaS Architecture Rule: nothing is hardcoded for one tenant. Cert names,
 * issuing bodies, proficiency ladders, validity windows and reminder thresholds
 * are all tenant-defined rows / jsonb, not enum values. Every table is orgRef()
 * scoped, soft-archived where appropriate, and audited (via the shared
 * audit_event log — there is NO development_activity table).
 *
 * CENTRAL GUARDRAIL: this module OWNS its own tables and LINKS read-only to
 * neighbours. documentId (Documents) and linkedApplicantId (Recruitment) are
 * SOFT refs / SET-NULL FKs resolved read-only; the module never writes a foreign
 * table.
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
import { candidate } from "./recruitment";

// ── Enums ────────────────────────────────────────────────────────────────────

export const trainingProgramStatusEnum = pgEnum("training_program_status", [
	"draft",
	"active",
	"archived",
]);

export const trainingDeliveryEnum = pgEnum("training_delivery", [
	"internal",
	"external",
	"online",
	"in_person",
	"blended",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
	"enrolled",
	"in_progress",
	"completed",
	"failed",
	"withdrawn",
]);

// NOTE: "expired" is deliberately NOT a value here — certification expiry is
// DERIVED at read time from expiryDate, never stored. These are the lifecycle
// states a human sets.
export const certificationStatusEnum = pgEnum("certification_status", [
	"active",
	"revoked",
	"superseded",
]);

export const skillAssessmentSourceEnum = pgEnum("skill_assessment_source", [
	"self",
	"manager",
	"hr",
	"import",
]);

// Derived-at-read certification expiry buckets — a const tuple, NOT an enum or a
// column (mirrors OBJECTIVE_HEALTH_STATES). See utils/cert-expiry.ts.
export const CERT_EXPIRY_STATES = [
	"no_expiry",
	"valid",
	"expiring_soon",
	"expired",
] as const;
export type CertExpiryState = (typeof CERT_EXPIRY_STATES)[number];

// ── Training ───────────────────────────────────────────────────────────────

export const trainingCategory = pgTable(
	"training_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("training_category_org_idx").on(t.organizationId),
		uniqueIndex("training_category_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

export const trainingProgram = pgTable(
	"training_program",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		categoryId: text("category_id").references(() => trainingCategory.id, {
			onDelete: "set null",
		}),
		delivery: trainingDeliveryEnum("delivery").notNull().default("internal"),
		// Optional free-text provider name for external/online programs (MVP — no
		// third-party LMS integration).
		provider: text("provider"),
		durationHours: numeric("duration_hours", { precision: 7, scale: 2 }),
		// Nullable — not all programs are scored.
		passingScorePercent: integer("passing_score_percent"),
		maxAttempts: integer("max_attempts").notNull().default(1),
		allowSelfEnroll: boolean("allow_self_enroll").notNull().default(true),
		status: trainingProgramStatusEnum("status").notNull().default("draft"),
		isArchived: boolean("is_archived").notNull().default(false),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("training_program_org_idx").on(t.organizationId),
		index("training_program_org_status_idx").on(t.organizationId, t.status),
		uniqueIndex("training_program_org_reference_uq")
			.on(t.organizationId, t.reference)
			.where(sql`${t.deletedAt} is null`),
	]
);

export const trainingModule = pgTable(
	"training_module",
	{
		id: cuid(),
		organizationId: orgRef(),
		programId: text("program_id")
			.notNull()
			.references(() => trainingProgram.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		content: text("content"),
		displayOrder: integer("display_order").notNull().default(0),
		...timestamps,
	},
	(t) => [index("training_module_program_idx").on(t.programId)]
);

export const trainingEnrollment = pgTable(
	"training_enrollment",
	{
		id: cuid(),
		organizationId: orgRef(),
		programId: text("program_id")
			.notNull()
			.references(() => trainingProgram.id, { onDelete: "restrict" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		status: enrollmentStatusEnum("status").notNull().default("enrolled"),
		enrolledByUserId: text("enrolled_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// Nullable until completion.
		scorePercent: integer("score_percent"),
		attemptsUsed: integer("attempts_used").notNull().default(0),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		note: text("note"),
		...timestamps,
	},
	(t) => [
		index("training_enrollment_org_idx").on(t.organizationId),
		index("training_enrollment_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		index("training_enrollment_org_program_idx").on(
			t.organizationId,
			t.programId
		),
		index("training_enrollment_program_idx").on(t.programId),
	]
);

// ── Certifications ───────────────────────────────────────────────────────────

export const certificationType = pgTable(
	"certification_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		issuingBody: text("issuing_body"),
		requiresRenewal: boolean("requires_renewal").notNull().default(true),
		// Nullable; used to SUGGEST expiryDate on issue.
		defaultValidityMonths: integer("default_validity_months"),
		// Nullable; per-type override of the tenant default reminder cadence
		// (e.g. [90, 60, 30, 7]). Resolved at read time.
		reminderThresholdDays: jsonb("reminder_threshold_days").$type<number[]>(),
		isArchived: boolean("is_archived").notNull().default(false),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("certification_type_org_idx").on(t.organizationId),
		uniqueIndex("certification_type_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

export const employeeCertification = pgTable(
	"employee_certification",
	{
		id: cuid(),
		organizationId: orgRef(),
		certificationTypeId: text("certification_type_id")
			.notNull()
			.references(() => certificationType.id, { onDelete: "restrict" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		credentialId: text("credential_id"),
		issueDate: date("issue_date", { mode: "date" }),
		// Nullable (non-expiring). Expiry STATE is derived from this — never stored.
		expiryDate: date("expiry_date", { mode: "date" }),
		// Soft ref to a Documents row (NO FK — module may be off-tenant);
		// tenant-verified on write, resolved read-only.
		documentId: text("document_id"),
		status: certificationStatusEnum("status").notNull().default("active"),
		recordedByUserId: text("recorded_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		note: text("note"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("employee_certification_org_idx").on(t.organizationId),
		index("employee_certification_org_employee_idx").on(
			t.organizationId,
			t.employeeId
		),
		// Drives the derived expiry scan.
		index("employee_certification_org_expiry_idx").on(
			t.organizationId,
			t.expiryDate
		),
		index("employee_certification_type_idx").on(t.certificationTypeId),
	]
);

// ── Skills ───────────────────────────────────────────────────────────────────

export const skillCategory = pgTable(
	"skill_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("skill_category_org_idx").on(t.organizationId),
		uniqueIndex("skill_category_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

export const skillType = pgTable(
	"skill_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		categoryId: text("category_id")
			.notNull()
			.references(() => skillCategory.id, { onDelete: "restrict" }),
		name: text("name").notNull(),
		description: text("description"),
		// ORDERED string[] (min 2). Index in array = the ordinal. The label is what
		// users see; the ordinal is what search compares.
		proficiencyLevels: jsonb("proficiency_levels").$type<string[]>().notNull(),
		isArchived: boolean("is_archived").notNull().default(false),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("skill_type_org_idx").on(t.organizationId),
		uniqueIndex("skill_type_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

export const employeeSkill = pgTable(
	"employee_skill",
	{
		id: cuid(),
		organizationId: orgRef(),
		skillTypeId: text("skill_type_id")
			.notNull()
			.references(() => skillType.id, { onDelete: "restrict" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		proficiencyLevel: text("proficiency_level").notNull(),
		// Denormalized from the type's list at write — the search key.
		proficiencyOrdinal: integer("proficiency_ordinal").notNull(),
		source: skillAssessmentSourceEnum("source").notNull().default("self"),
		assessedByUserId: text("assessed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		assessedAt: timestamp("assessed_at"),
		note: text("note"),
		// Optional read-only Recruitment provenance seam — records that a new hire's
		// initial skill came from their candidate record (SET NULL, read-only;
		// Development never writes Recruitment). v2's recruitment table is
		// `candidate` (the spec's "applicant").
		linkedCandidateId: text("linked_candidate_id").references(
			() => candidate.id,
			{ onDelete: "set null" }
		),
		...timestamps,
	},
	(t) => [
		index("employee_skill_org_idx").on(t.organizationId),
		index("employee_skill_org_employee_idx").on(t.organizationId, t.employeeId),
		// The "who knows X at level ≥ N" search index.
		index("employee_skill_type_ordinal_idx").on(
			t.skillTypeId,
			t.proficiencyOrdinal
		),
		// One current level per (employee, skill); history lives in audit_event.
		uniqueIndex("employee_skill_employee_type_uq").on(
			t.employeeId,
			t.skillTypeId
		),
	]
);

// ── Relations (intra-module only) ────────────────────────────────────────────

export const trainingProgramRelations = relations(
	trainingProgram,
	({ one, many }) => ({
		category: one(trainingCategory, {
			fields: [trainingProgram.categoryId],
			references: [trainingCategory.id],
		}),
		modules: many(trainingModule),
		enrollments: many(trainingEnrollment),
	})
);

export const trainingCategoryRelations = relations(
	trainingCategory,
	({ many }) => ({
		programs: many(trainingProgram),
	})
);

export const trainingModuleRelations = relations(trainingModule, ({ one }) => ({
	program: one(trainingProgram, {
		fields: [trainingModule.programId],
		references: [trainingProgram.id],
	}),
}));

export const trainingEnrollmentRelations = relations(
	trainingEnrollment,
	({ one }) => ({
		program: one(trainingProgram, {
			fields: [trainingEnrollment.programId],
			references: [trainingProgram.id],
		}),
		employee: one(employeeProfile, {
			fields: [trainingEnrollment.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const certificationTypeRelations = relations(
	certificationType,
	({ many }) => ({
		certifications: many(employeeCertification),
	})
);

export const employeeCertificationRelations = relations(
	employeeCertification,
	({ one }) => ({
		certificationType: one(certificationType, {
			fields: [employeeCertification.certificationTypeId],
			references: [certificationType.id],
		}),
		employee: one(employeeProfile, {
			fields: [employeeCertification.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const skillCategoryRelations = relations(skillCategory, ({ many }) => ({
	skillTypes: many(skillType),
}));

export const skillTypeRelations = relations(skillType, ({ one, many }) => ({
	category: one(skillCategory, {
		fields: [skillType.categoryId],
		references: [skillCategory.id],
	}),
	employeeSkills: many(employeeSkill),
}));

export const employeeSkillRelations = relations(employeeSkill, ({ one }) => ({
	skillType: one(skillType, {
		fields: [employeeSkill.skillTypeId],
		references: [skillType.id],
	}),
	employee: one(employeeProfile, {
		fields: [employeeSkill.employeeId],
		references: [employeeProfile.id],
	}),
}));
