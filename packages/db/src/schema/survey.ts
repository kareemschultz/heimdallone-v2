/**
 * Surveys — the other half of v1 Communications (announcements is its sibling).
 *
 * A survey is an org-scoped questionnaire from admins/HR to members, with a
 * publish lifecycle (draft → published → closed), optional open/close window,
 * audience targeting, and an anonymity flag. Questions are typed (text / single
 * choice / multi choice / rating). Responses + answers are stored separately;
 * when a survey is anonymous, the response's respondentUserId is NEVER set, so
 * an answer can never be mapped back to a person — enforced server-side.
 *
 * Audience targeting mirrors announcements: all members, a single department, or
 * a single access role. Department/role are SOFT refs (text), matched at read
 * time, so a survey survives a department being archived.
 */

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

import { user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

export const surveyStatusEnum = pgEnum("survey_status", [
	"draft",
	"published",
	"closed",
]);

export const surveyAudienceEnum = pgEnum("survey_audience", [
	"all_members",
	"department",
	"role",
]);

export const surveyQuestionTypeEnum = pgEnum("survey_question_type", [
	"text",
	"single_choice",
	"multi_choice",
	"rating",
]);

export const survey = pgTable(
	"survey",
	{
		id: cuid(),
		organizationId: orgRef(),
		title: text("title").notNull(),
		description: text("description"),
		status: surveyStatusEnum("status").notNull().default("draft"),
		isAnonymous: boolean("is_anonymous").notNull().default(true),
		audienceType: surveyAudienceEnum("audience_type")
			.notNull()
			.default("all_members"),
		// Soft refs (NOT FKs) — matched at read time.
		audienceDepartmentId: text("audience_department_id"),
		audienceRole: text("audience_role"),
		opensAt: timestamp("opens_at"),
		closesAt: timestamp("closes_at"),
		publishedAt: timestamp("published_at"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [index("survey_org_status_idx").on(t.organizationId, t.status)]
);

export const surveyQuestion = pgTable(
	"survey_question",
	{
		id: cuid(),
		organizationId: orgRef(),
		surveyId: text("survey_id")
			.notNull()
			.references(() => survey.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		questionType: surveyQuestionTypeEnum("question_type").notNull(),
		questionText: text("question_text").notNull(),
		// Choices for choice types; { maxRating } for rating.
		options: jsonb("options"),
		isRequired: boolean("is_required").notNull().default(false),
		...timestamps,
	},
	(t) => [index("survey_question_survey_idx").on(t.surveyId, t.sortOrder)]
);

export const surveyResponse = pgTable(
	"survey_response",
	{
		id: cuid(),
		organizationId: orgRef(),
		surveyId: text("survey_id")
			.notNull()
			.references(() => survey.id, { onDelete: "cascade" }),
		// NULL when the survey is anonymous — an answer can never map to a person.
		respondentUserId: text("respondent_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		submittedAt: timestamp("submitted_at").defaultNow().notNull(),
		...timestamps,
	},
	(t) => [
		index("survey_response_survey_idx").on(t.surveyId),
		// One response per identified user; anonymous responses (null) are exempt.
		uniqueIndex("survey_response_user_uq")
			.on(t.surveyId, t.respondentUserId)
			.where(sql`${t.respondentUserId} is not null`),
	]
);

export const surveyResponseAnswer = pgTable(
	"survey_response_answer",
	{
		id: cuid(),
		organizationId: orgRef(),
		responseId: text("response_id")
			.notNull()
			.references(() => surveyResponse.id, { onDelete: "cascade" }),
		questionId: text("question_id")
			.notNull()
			.references(() => surveyQuestion.id, { onDelete: "cascade" }),
		answerText: text("answer_text"),
		// Selected choice array, or { rating } for rating questions.
		answerJson: jsonb("answer_json"),
		...timestamps,
	},
	(t) => [
		index("survey_answer_response_idx").on(t.responseId),
		index("survey_answer_question_idx").on(t.questionId),
	]
);

export const surveyRelations = relations(survey, ({ one, many }) => ({
	createdBy: one(user, {
		fields: [survey.createdByUserId],
		references: [user.id],
	}),
	questions: many(surveyQuestion),
	responses: many(surveyResponse),
}));

export const surveyQuestionRelations = relations(surveyQuestion, ({ one }) => ({
	survey: one(survey, {
		fields: [surveyQuestion.surveyId],
		references: [survey.id],
	}),
}));

export const surveyResponseRelations = relations(
	surveyResponse,
	({ one, many }) => ({
		survey: one(survey, {
			fields: [surveyResponse.surveyId],
			references: [survey.id],
		}),
		answers: many(surveyResponseAnswer),
	})
);

export const surveyResponseAnswerRelations = relations(
	surveyResponseAnswer,
	({ one }) => ({
		response: one(surveyResponse, {
			fields: [surveyResponseAnswer.responseId],
			references: [surveyResponse.id],
		}),
		question: one(surveyQuestion, {
			fields: [surveyResponseAnswer.questionId],
			references: [surveyQuestion.id],
		}),
	})
);
