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
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import {
	cuid,
	department,
	employeeProfile,
	jobPosition,
	orgRef,
	timestamps,
} from "./hr-core";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 9A status lifecycles
// ───────────────────────────────────────────────────────────────────

export const requisitionStatusEnum = pgEnum("requisition_status", [
	"draft",
	"pending_approval",
	"approved",
	"rejected",
	"cancelled",
]);

export const jobOpeningStatusEnum = pgEnum("job_opening_status", [
	"draft",
	"open",
	"paused",
	"closed",
	"cancelled",
]);

export const applicationStageEnum = pgEnum("application_stage", [
	"new",
	"screening",
	"shortlisted",
	"interview",
	"offer",
	"hired",
	"rejected",
	"withdrawn",
]);

export const candidateStatusEnum = pgEnum("candidate_status", [
	"active",
	"inactive_pool",
	"blocked",
]);

export const candidateSourceEnum = pgEnum("candidate_source", [
	"direct",
	"referral",
	"job_board",
	"agency",
	"linkedin",
	"other",
]);

export const rejectionReasonEnum = pgEnum("rejection_reason", [
	"not_qualified",
	"position_filled",
	"failed_interview",
	"failed_background_check",
	"salary_mismatch",
	"candidate_unresponsive",
	"other",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
	"scheduled",
	"completed",
	"cancelled",
	"no_show",
]);

export const feedbackRecommendEnum = pgEnum("feedback_recommend", [
	"strong_hire",
	"hire",
	"no_hire",
	"strong_no_hire",
]);

export const offerStatusEnum = pgEnum("offer_status", [
	"draft",
	"pending_approval",
	"approved",
	"sent",
	"accepted",
	"rejected",
	"expired",
	"withdrawn",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
	"pending",
	"approved",
	"rejected",
]);

// ───────────────────────────────────────────────────────────────────
// 1. recruitment_requisition — the request to hire (approval gate)
// ───────────────────────────────────────────────────────────────────

export const recruitmentRequisition = pgTable(
	"recruitment_requisition",
	{
		id: cuid(),
		organizationId: orgRef(),
		title: text("title").notNull(),
		description: text("description"),
		jobPositionId: text("job_position_id").references(() => jobPosition.id, {
			onDelete: "set null",
		}),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		headcount: integer("headcount").default(1).notNull(),
		requestedByEmployeeId: text("requested_by_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		status: requisitionStatusEnum("status").default("draft").notNull(),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at"),
		rejectedReason: text("rejected_reason"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("requisition_org_idx").on(t.organizationId),
		index("requisition_org_status_idx").on(t.organizationId, t.status),
		index("requisition_department_idx").on(t.departmentId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. job_opening — the active hiring effort
// ───────────────────────────────────────────────────────────────────

export const jobOpening = pgTable(
	"job_opening",
	{
		id: cuid(),
		organizationId: orgRef(),
		requisitionId: text("requisition_id").references(
			() => recruitmentRequisition.id,
			{ onDelete: "set null" }
		),
		title: text("title").notNull(),
		description: text("description"),
		jobPositionId: text("job_position_id").references(() => jobPosition.id, {
			onDelete: "set null",
		}),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "set null",
		}),
		workLocation: text("work_location"),
		employmentType: text("employment_type"),
		vacancyCount: integer("vacancy_count").default(1).notNull(),
		hiringManagerEmployeeId: text("hiring_manager_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		recruiterUserId: text("recruiter_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		pipelineConfig: jsonb("pipeline_config"),
		status: jobOpeningStatusEnum("status").default("draft").notNull(),
		publishedAt: timestamp("published_at"),
		closedAt: timestamp("closed_at"),
		startDate: date("start_date"),
		endDate: date("end_date"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("opening_org_status_idx").on(t.organizationId, t.status),
		index("opening_hiring_manager_idx").on(
			t.organizationId,
			t.hiringManagerEmployeeId
		),
		index("opening_requisition_idx").on(t.requisitionId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. candidate — the person
// ───────────────────────────────────────────────────────────────────

export const candidate = pgTable(
	"candidate",
	{
		id: cuid(),
		organizationId: orgRef(),
		firstName: text("first_name").notNull(),
		lastName: text("last_name"),
		email: text("email").notNull(),
		phone: text("phone"),
		country: text("country"),
		source: candidateSourceEnum("source").default("direct").notNull(),
		referrerEmployeeId: text("referrer_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		resumeUrl: text("resume_url"),
		portfolioUrl: text("portfolio_url"),
		dateOfBirth: date("date_of_birth"),
		gender: text("gender"),
		address: text("address"),
		linkedinUrl: text("linkedin_url"),
		status: candidateStatusEnum("status").default("active").notNull(),
		convertedEmployeeId: text("converted_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("candidate_org_status_idx").on(t.organizationId, t.status),
		// Phase 9A Q3: candidate uniqueness scoped to tenant by email
		unique("candidate_org_email_uq").on(t.organizationId, t.email),
		unique("candidate_converted_employee_uq").on(t.convertedEmployeeId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. candidate_application — candidate applied to a specific opening
// ───────────────────────────────────────────────────────────────────

export const candidateApplication = pgTable(
	"candidate_application",
	{
		id: cuid(),
		organizationId: orgRef(),
		candidateId: text("candidate_id")
			.notNull()
			.references(() => candidate.id, { onDelete: "restrict" }),
		jobOpeningId: text("job_opening_id")
			.notNull()
			.references(() => jobOpening.id, { onDelete: "restrict" }),
		stage: applicationStageEnum("stage").default("new").notNull(),
		stageEnteredAt: timestamp("stage_entered_at").defaultNow().notNull(),
		ratingAverage: numeric("rating_average", { precision: 3, scale: 2 }),
		ratingCount: integer("rating_count").default(0).notNull(),
		appliedAt: timestamp("applied_at").defaultNow().notNull(),
		outcomeAt: timestamp("outcome_at"),
		rejectedReason: rejectionReasonEnum("rejected_reason"),
		rejectedFeedback: text("rejected_feedback"),
		withdrawnAt: timestamp("withdrawn_at"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		// One application per candidate per opening
		unique("application_candidate_opening_uq").on(
			t.candidateId,
			t.jobOpeningId
		),
		index("application_org_stage_idx").on(t.organizationId, t.stage),
		index("application_opening_stage_idx").on(t.jobOpeningId, t.stage),
		index("application_candidate_idx").on(t.candidateId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 5. application_stage_history — audit-grade stage transition log
// ───────────────────────────────────────────────────────────────────

export const applicationStageHistory = pgTable(
	"application_stage_history",
	{
		id: cuid(),
		organizationId: orgRef(),
		applicationId: text("application_id")
			.notNull()
			.references(() => candidateApplication.id, { onDelete: "cascade" }),
		fromStage: applicationStageEnum("from_stage"),
		toStage: applicationStageEnum("to_stage").notNull(),
		changedByUserId: text("changed_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		changedAt: timestamp("changed_at").defaultNow().notNull(),
		note: text("note"),
	},
	(t) => [
		index("stage_history_app_idx").on(t.applicationId, t.changedAt),
		index("stage_history_org_to_idx").on(t.organizationId, t.toStage),
	]
);

// ───────────────────────────────────────────────────────────────────
// 6. interview — scheduled candidate conversation
// ───────────────────────────────────────────────────────────────────

export const interview = pgTable(
	"interview",
	{
		id: cuid(),
		organizationId: orgRef(),
		applicationId: text("application_id")
			.notNull()
			.references(() => candidateApplication.id, { onDelete: "restrict" }),
		scheduledStart: timestamp("scheduled_start").notNull(),
		scheduledEnd: timestamp("scheduled_end"),
		location: text("location"),
		interviewType: text("interview_type"),
		interviewerEmployeeIds: jsonb("interviewer_employee_ids")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		status: interviewStatusEnum("status").default("scheduled").notNull(),
		notes: text("notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("interview_org_start_idx").on(t.organizationId, t.scheduledStart),
		index("interview_application_idx").on(t.applicationId),
		index("interview_org_status_idx").on(t.organizationId, t.status),
	]
);

// ───────────────────────────────────────────────────────────────────
// 7. interview_feedback — one row per interviewer per interview
// ───────────────────────────────────────────────────────────────────

export const interviewFeedback = pgTable(
	"interview_feedback",
	{
		id: cuid(),
		organizationId: orgRef(),
		interviewId: text("interview_id")
			.notNull()
			.references(() => interview.id, { onDelete: "cascade" }),
		interviewerEmployeeId: text("interviewer_employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		rating: integer("rating").notNull(),
		recommend: feedbackRecommendEnum("recommend").notNull(),
		strengths: text("strengths"),
		concerns: text("concerns"),
		notes: text("notes"),
		submittedAt: timestamp("submitted_at").defaultNow().notNull(),
	},
	(t) => [
		unique("feedback_interview_interviewer_uq").on(
			t.interviewId,
			t.interviewerEmployeeId
		),
		index("feedback_interview_idx").on(t.interviewId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 8. offer — formal compensation proposal
// ───────────────────────────────────────────────────────────────────

export const offer = pgTable(
	"offer",
	{
		id: cuid(),
		organizationId: orgRef(),
		applicationId: text("application_id")
			.notNull()
			.references(() => candidateApplication.id, { onDelete: "restrict" }),
		status: offerStatusEnum("status").default("draft").notNull(),
		currency: text("currency").notNull(),
		baseAmount: numeric("base_amount", { precision: 12, scale: 2 }).notNull(),
		baseAmountFrequency: text("base_amount_frequency")
			.default("monthly")
			.notNull(),
		variableAmount: numeric("variable_amount", { precision: 12, scale: 2 }),
		startDate: date("start_date"),
		expiresAt: timestamp("expires_at"),
		letterUrl: text("letter_url"),
		approvalRequired: boolean("approval_required").default(true).notNull(),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at"),
		sentAt: timestamp("sent_at"),
		respondedAt: timestamp("responded_at"),
		withdrawnAt: timestamp("withdrawn_at"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("offer_org_status_idx").on(t.organizationId, t.status),
		index("offer_application_idx").on(t.applicationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 9. offer_approval — multi-stage approval chain (ships with sequence column)
// ───────────────────────────────────────────────────────────────────
// MVP uses sequence=1 only; column exists so future multi-step approvals
// land without a migration. See Phase 9A Q1.

export const offerApproval = pgTable(
	"offer_approval",
	{
		id: cuid(),
		organizationId: orgRef(),
		offerId: text("offer_id")
			.notNull()
			.references(() => offer.id, { onDelete: "cascade" }),
		approverUserId: text("approver_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		sequence: integer("sequence").default(1).notNull(),
		status: approvalStatusEnum("status").default("pending").notNull(),
		decidedAt: timestamp("decided_at"),
		comment: text("comment"),
		...timestamps,
	},
	(t) => [
		unique("offer_approval_offer_sequence_uq").on(t.offerId, t.sequence),
		index("offer_approval_offer_idx").on(t.offerId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 10. candidate_document — generic attachments per candidate
// ───────────────────────────────────────────────────────────────────

export const candidateDocument = pgTable(
	"candidate_document",
	{
		id: cuid(),
		organizationId: orgRef(),
		candidateId: text("candidate_id")
			.notNull()
			.references(() => candidate.id, { onDelete: "cascade" }),
		applicationId: text("application_id").references(
			() => candidateApplication.id,
			{ onDelete: "set null" }
		),
		documentType: text("document_type").notNull(),
		fileUrl: text("file_url").notNull(),
		fileName: text("file_name").notNull(),
		fileSizeBytes: integer("file_size_bytes"),
		mimeType: text("mime_type"),
		uploadedByUserId: text("uploaded_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("candidate_doc_candidate_idx").on(t.candidateId),
		index("candidate_doc_application_idx").on(t.applicationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 11. recruitment_note — free-form internal note
// ───────────────────────────────────────────────────────────────────

export const recruitmentNote = pgTable(
	"recruitment_note",
	{
		id: cuid(),
		organizationId: orgRef(),
		candidateId: text("candidate_id")
			.notNull()
			.references(() => candidate.id, { onDelete: "cascade" }),
		applicationId: text("application_id").references(
			() => candidateApplication.id,
			{ onDelete: "set null" }
		),
		stage: applicationStageEnum("stage"),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		body: text("body").notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("recruitment_note_candidate_idx").on(t.candidateId),
		index("recruitment_note_application_idx").on(t.applicationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const recruitmentRequisitionRelations = relations(
	recruitmentRequisition,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [recruitmentRequisition.organizationId],
			references: [organization.id],
		}),
		department: one(department, {
			fields: [recruitmentRequisition.departmentId],
			references: [department.id],
		}),
		jobPosition: one(jobPosition, {
			fields: [recruitmentRequisition.jobPositionId],
			references: [jobPosition.id],
		}),
		requestedBy: one(employeeProfile, {
			fields: [recruitmentRequisition.requestedByEmployeeId],
			references: [employeeProfile.id],
		}),
		openings: many(jobOpening),
	})
);

export const jobOpeningRelations = relations(jobOpening, ({ one, many }) => ({
	organization: one(organization, {
		fields: [jobOpening.organizationId],
		references: [organization.id],
	}),
	requisition: one(recruitmentRequisition, {
		fields: [jobOpening.requisitionId],
		references: [recruitmentRequisition.id],
	}),
	department: one(department, {
		fields: [jobOpening.departmentId],
		references: [department.id],
	}),
	jobPosition: one(jobPosition, {
		fields: [jobOpening.jobPositionId],
		references: [jobPosition.id],
	}),
	hiringManager: one(employeeProfile, {
		fields: [jobOpening.hiringManagerEmployeeId],
		references: [employeeProfile.id],
	}),
	applications: many(candidateApplication),
}));

export const candidateRelations = relations(candidate, ({ one, many }) => ({
	organization: one(organization, {
		fields: [candidate.organizationId],
		references: [organization.id],
	}),
	referrer: one(employeeProfile, {
		fields: [candidate.referrerEmployeeId],
		references: [employeeProfile.id],
	}),
	convertedEmployee: one(employeeProfile, {
		fields: [candidate.convertedEmployeeId],
		references: [employeeProfile.id],
	}),
	applications: many(candidateApplication),
	documents: many(candidateDocument),
	notes: many(recruitmentNote),
}));

export const candidateApplicationRelations = relations(
	candidateApplication,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [candidateApplication.organizationId],
			references: [organization.id],
		}),
		candidate: one(candidate, {
			fields: [candidateApplication.candidateId],
			references: [candidate.id],
		}),
		jobOpening: one(jobOpening, {
			fields: [candidateApplication.jobOpeningId],
			references: [jobOpening.id],
		}),
		stageHistory: many(applicationStageHistory),
		interviews: many(interview),
		offers: many(offer),
	})
);

export const applicationStageHistoryRelations = relations(
	applicationStageHistory,
	({ one }) => ({
		application: one(candidateApplication, {
			fields: [applicationStageHistory.applicationId],
			references: [candidateApplication.id],
		}),
		changedBy: one(user, {
			fields: [applicationStageHistory.changedByUserId],
			references: [user.id],
		}),
	})
);

export const interviewRelations = relations(interview, ({ one, many }) => ({
	application: one(candidateApplication, {
		fields: [interview.applicationId],
		references: [candidateApplication.id],
	}),
	feedback: many(interviewFeedback),
}));

export const interviewFeedbackRelations = relations(
	interviewFeedback,
	({ one }) => ({
		interview: one(interview, {
			fields: [interviewFeedback.interviewId],
			references: [interview.id],
		}),
		interviewer: one(employeeProfile, {
			fields: [interviewFeedback.interviewerEmployeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const offerRelations = relations(offer, ({ one, many }) => ({
	application: one(candidateApplication, {
		fields: [offer.applicationId],
		references: [candidateApplication.id],
	}),
	approvals: many(offerApproval),
}));

export const offerApprovalRelations = relations(offerApproval, ({ one }) => ({
	offer: one(offer, {
		fields: [offerApproval.offerId],
		references: [offer.id],
	}),
	approver: one(user, {
		fields: [offerApproval.approverUserId],
		references: [user.id],
	}),
}));

export const candidateDocumentRelations = relations(
	candidateDocument,
	({ one }) => ({
		candidate: one(candidate, {
			fields: [candidateDocument.candidateId],
			references: [candidate.id],
		}),
		application: one(candidateApplication, {
			fields: [candidateDocument.applicationId],
			references: [candidateApplication.id],
		}),
		uploadedBy: one(user, {
			fields: [candidateDocument.uploadedByUserId],
			references: [user.id],
		}),
	})
);

export const recruitmentNoteRelations = relations(
	recruitmentNote,
	({ one }) => ({
		candidate: one(candidate, {
			fields: [recruitmentNote.candidateId],
			references: [candidate.id],
		}),
		application: one(candidateApplication, {
			fields: [recruitmentNote.applicationId],
			references: [candidateApplication.id],
		}),
		author: one(user, {
			fields: [recruitmentNote.authorUserId],
			references: [user.id],
		}),
	})
);
