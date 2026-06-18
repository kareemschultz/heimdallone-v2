/**
 * Surveys router — the Communications follow-on (announcements is its sibling).
 *
 * Two surfaces:
 *   - Member-facing FEED + respond (survey:read): published, currently-open,
 *     audience-matched surveys; submit answers. Held by every role.
 *   - Management (survey:create/update/publish/archive/manage): build questions,
 *     publish/close, view aggregate results. Held by owner/admin/hr_admin.
 *
 * Two-layer authz: AC gate (authorizedProcedure("survey", …)) + handler
 * org-scope + audience-scope. Audience matching is resolved from the caller's
 * role + department, never trusted from the client.
 *
 * ANONYMITY GUARDRAIL: when a survey isAnonymous, a response's respondentUserId
 * is NEVER written, and `results` returns aggregate-only data with no path from
 * an answer to a person — enforced here, server-side.
 */

import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	survey,
	surveyQuestion,
	surveyResponse,
	surveyResponseAnswer,
} from "@Heimdallone/db/schema/survey";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const memberRole = (ctx: { memberRole?: string }) =>
	ctx.memberRole ?? "employee";

const audienceEnum = z.enum(["all_members", "department", "role"]);
const questionTypeEnum = z.enum([
	"text",
	"single_choice",
	"multi_choice",
	"rating",
]);

const surveyWriteFields = z.object({
	title: z.string().min(1).max(300),
	description: z.string().nullable().optional(),
	isAnonymous: z.boolean().optional().default(true),
	audienceType: audienceEnum.default("all_members"),
	audienceDepartmentId: z.string().nullable().optional(),
	audienceRole: z.string().nullable().optional(),
	opensAt: z.string().datetime().nullable().optional(),
	closesAt: z.string().datetime().nullable().optional(),
});

const questionInput = z.object({
	surveyId: z.string(),
	questionType: questionTypeEnum,
	questionText: z.string().min(1).max(1000),
	options: z.array(z.string()).nullable().optional(),
	maxRating: z.number().int().min(2).max(10).nullable().optional(),
	isRequired: z.boolean().optional().default(false),
	sortOrder: z.number().int().optional(),
});

// ── audience helpers (mirror communications.ts) ──
async function callerDepartmentId(
	organizationId: string,
	userId: string
): Promise<string | null> {
	const [row] = await db
		.select({ departmentId: employeeWorkInfo.departmentId })
		.from(employeeProfile)
		.innerJoin(
			employeeWorkInfo,
			eq(employeeWorkInfo.employeeId, employeeProfile.id)
		)
		.where(
			and(
				eq(employeeProfile.organizationId, organizationId),
				eq(employeeProfile.userId, userId)
			)
		)
		.limit(1);
	return row?.departmentId ?? null;
}

function audienceMatches(
	row: {
		audienceType: string;
		audienceDepartmentId: string | null;
		audienceRole: string | null;
	},
	callerDept: string | null,
	callerRole: string
): boolean {
	if (row.audienceType === "all_members") {
		return true;
	}
	if (row.audienceType === "department") {
		return Boolean(callerDept) && row.audienceDepartmentId === callerDept;
	}
	if (row.audienceType === "role") {
		return row.audienceRole === callerRole;
	}
	return false;
}

function isOpenNow(
	row: { opensAt: Date | null; closesAt: Date | null },
	now: Date
): boolean {
	if (row.opensAt && now < row.opensAt) {
		return false;
	}
	if (row.closesAt && now > row.closesAt) {
		return false;
	}
	return true;
}

async function loadManagedSurvey(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(survey)
		.where(and(eq(survey.id, id), eq(survey.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Survey not found." });
	}
	return row;
}

function audienceCol(
	audienceType: string,
	matchType: string,
	value: string | null | undefined
): string | null {
	return audienceType === matchType ? (value ?? null) : null;
}

// For partial updates: undefined = keep current; "" / null = clear; else parse.
function resolveDateField(
	incoming: string | null | undefined,
	current: Date | null
): Date | null {
	if (incoming === undefined) {
		return current;
	}
	return incoming ? new Date(incoming) : null;
}

function buildAnswerJson(a: {
	rating?: number | null;
	choices?: string[] | null;
}): { rating: number } | { choices: string[] } | null {
	if (a.rating != null) {
		return { rating: a.rating };
	}
	if (a.choices && a.choices.length > 0) {
		return { choices: a.choices };
	}
	return null;
}

// ── member feed: published, open, audience-matched, with hasResponded ──
const feed = authorizedProcedure("survey", "read")
	.input(
		z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const uid = actorId(context);
		const now = new Date();
		const rows = await db
			.select()
			.from(survey)
			.where(
				and(eq(survey.organizationId, oid), eq(survey.status, "published"))
			)
			.orderBy(desc(survey.publishedAt))
			.limit(input?.limit ?? 50);
		const callerDept = await callerDepartmentId(oid, uid);
		const role = memberRole(context);
		const visible = rows.filter(
			(r) => isOpenNow(r, now) && audienceMatches(r, callerDept, role)
		);
		// hasResponded only meaningful for non-anonymous surveys.
		const myResponses = await db
			.select({ surveyId: surveyResponse.surveyId })
			.from(surveyResponse)
			.where(
				and(
					eq(surveyResponse.organizationId, oid),
					eq(surveyResponse.respondentUserId, uid)
				)
			);
		const respondedSet = new Set(myResponses.map((r) => r.surveyId));
		return visible.map((r) => ({
			id: r.id,
			title: r.title,
			description: r.description,
			isAnonymous: r.isAnonymous,
			opensAt: r.opensAt,
			closesAt: r.closesAt,
			publishedAt: r.publishedAt,
			hasResponded: r.isAnonymous ? false : respondedSet.has(r.id),
		}));
	});

// ── management list ──
const list = authorizedProcedure("survey", "manage")
	.input(
		z
			.object({ status: z.enum(["draft", "published", "closed"]).optional() })
			.optional()
	)
	.handler(({ context, input }) => {
		const oid = orgId(context);
		const conditions = [eq(survey.organizationId, oid)];
		if (input?.status) {
			conditions.push(eq(survey.status, input.status));
		}
		return db
			.select({
				id: survey.id,
				title: survey.title,
				status: survey.status,
				isAnonymous: survey.isAnonymous,
				audienceType: survey.audienceType,
				audienceDepartmentId: survey.audienceDepartmentId,
				audienceRole: survey.audienceRole,
				opensAt: survey.opensAt,
				closesAt: survey.closesAt,
				publishedAt: survey.publishedAt,
				createdAt: survey.createdAt,
			})
			.from(survey)
			.where(and(...conditions))
			.orderBy(desc(survey.createdAt));
	});

// ── getById: survey + ordered questions; member only if published+open+matched ──
const getById = authorizedProcedure("survey", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const row = await loadManagedSurvey(oid, input.id);
		const isManager = memberRole(context) === "manager";
		const canManage =
			memberRole(context) === "tenant_owner" ||
			memberRole(context) === "tenant_admin" ||
			memberRole(context) === "hr_admin";
		if (!canManage) {
			// Members can only open a published, currently-open, audience-matched survey.
			const now = new Date();
			const callerDept = await callerDepartmentId(oid, actorId(context));
			const role = memberRole(context);
			const visible =
				row.status === "published" &&
				isOpenNow(row, now) &&
				audienceMatches(row, callerDept, role);
			if (!visible) {
				throw new ORPCError("FORBIDDEN", {
					message: "This survey is not available to you.",
				});
			}
		}
		const questions = await db
			.select()
			.from(surveyQuestion)
			.where(
				and(
					eq(surveyQuestion.surveyId, input.id),
					eq(surveyQuestion.organizationId, oid)
				)
			)
			.orderBy(asc(surveyQuestion.sortOrder));
		return { survey: row, questions, isManager };
	});

const create = authorizedProcedure("survey", "create")
	.input(surveyWriteFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.insert(survey)
			.values({
				organizationId: oid,
				title: input.title,
				description: input.description ?? null,
				isAnonymous: input.isAnonymous,
				audienceType: input.audienceType,
				audienceDepartmentId: audienceCol(
					input.audienceType,
					"department",
					input.audienceDepartmentId
				),
				audienceRole: audienceCol(
					input.audienceType,
					"role",
					input.audienceRole
				),
				opensAt: input.opensAt ? new Date(input.opensAt) : null,
				closesAt: input.closesAt ? new Date(input.closesAt) : null,
				createdByUserId: actorId(context),
			})
			.returning({ id: survey.id });
		if (!row) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Insert failed.",
			});
		}
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "survey",
			entityId: row.id,
			action: "create",
			actorId: actorId(context),
		});
		return { id: row.id };
	});

const update = authorizedProcedure("survey", "update")
	.input(surveyWriteFields.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const existing = await loadManagedSurvey(oid, input.id);
		if (existing.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only draft surveys can be edited.",
			});
		}
		const audienceType = input.audienceType ?? existing.audienceType;
		await db
			.update(survey)
			.set({
				title: input.title ?? existing.title,
				description:
					input.description === undefined
						? existing.description
						: input.description,
				isAnonymous: input.isAnonymous ?? existing.isAnonymous,
				audienceType,
				audienceDepartmentId: audienceCol(
					audienceType,
					"department",
					input.audienceDepartmentId ?? existing.audienceDepartmentId
				),
				audienceRole: audienceCol(
					audienceType,
					"role",
					input.audienceRole ?? existing.audienceRole
				),
				opensAt: resolveDateField(input.opensAt, existing.opensAt),
				closesAt: resolveDateField(input.closesAt, existing.closesAt),
			})
			.where(and(eq(survey.id, input.id), eq(survey.organizationId, oid)));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "survey",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ── questions (draft only) ──
const questionsAdd = authorizedProcedure("survey", "update")
	.input(questionInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const parent = await loadManagedSurvey(oid, input.surveyId);
		if (parent.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Questions can only be changed on a draft survey.",
			});
		}
		const options =
			input.questionType === "rating"
				? { maxRating: input.maxRating ?? 5 }
				: (input.options ?? null);
		const [row] = await db
			.insert(surveyQuestion)
			.values({
				organizationId: oid,
				surveyId: input.surveyId,
				sortOrder: input.sortOrder ?? 0,
				questionType: input.questionType,
				questionText: input.questionText,
				options,
				isRequired: input.isRequired,
			})
			.returning({ id: surveyQuestion.id });
		if (!row) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Insert failed.",
			});
		}
		return { id: row.id };
	});

const questionsRemove = authorizedProcedure("survey", "update")
	.input(z.object({ surveyId: z.string(), questionId: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const parent = await loadManagedSurvey(oid, input.surveyId);
		if (parent.status !== "draft") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Questions can only be changed on a draft survey.",
			});
		}
		await db
			.delete(surveyQuestion)
			.where(
				and(
					eq(surveyQuestion.id, input.questionId),
					eq(surveyQuestion.surveyId, input.surveyId),
					eq(surveyQuestion.organizationId, oid)
				)
			);
		return { id: input.questionId };
	});

const publish = authorizedProcedure("survey", "publish")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManagedSurvey(oid, input.id);
		const [questionCount] = await db
			.select({ id: surveyQuestion.id })
			.from(surveyQuestion)
			.where(
				and(
					eq(surveyQuestion.surveyId, input.id),
					eq(surveyQuestion.organizationId, oid)
				)
			)
			.limit(1);
		if (!questionCount) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Add at least one question before publishing.",
			});
		}
		await db
			.update(survey)
			.set({ status: "published", publishedAt: new Date() })
			.where(and(eq(survey.id, input.id), eq(survey.organizationId, oid)));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "survey",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { status: "published" },
		});
		return { id: input.id, status: "published" };
	});

const close = authorizedProcedure("survey", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManagedSurvey(oid, input.id);
		await db
			.update(survey)
			.set({ status: "closed" })
			.where(and(eq(survey.id, input.id), eq(survey.organizationId, oid)));
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "survey",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { status: "closed" },
		});
		return { id: input.id, status: "closed" };
	});

// ── respond: submit answers (anonymity enforced) ──
const respond = authorizedProcedure("survey", "read")
	.input(
		z.object({
			surveyId: z.string(),
			answers: z.array(
				z.object({
					questionId: z.string(),
					answerText: z.string().nullable().optional(),
					choices: z.array(z.string()).nullable().optional(),
					rating: z.number().int().nullable().optional(),
				})
			),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const uid = actorId(context);
		const now = new Date();
		const target = await loadManagedSurvey(oid, input.surveyId);
		if (target.status !== "published" || !isOpenNow(target, now)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This survey is not open for responses.",
			});
		}
		const callerDept = await callerDepartmentId(oid, uid);
		if (!audienceMatches(target, callerDept, memberRole(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "This survey is not addressed to you.",
			});
		}
		const questions = await db
			.select()
			.from(surveyQuestion)
			.where(
				and(
					eq(surveyQuestion.surveyId, input.surveyId),
					eq(surveyQuestion.organizationId, oid)
				)
			);
		const answerByQ = new Map(input.answers.map((a) => [a.questionId, a]));
		for (const q of questions) {
			if (q.isRequired) {
				const a = answerByQ.get(q.id);
				const empty =
					!a ||
					(!(a.answerText?.trim() || (a.choices && a.choices.length > 0)) &&
						a.rating == null);
				if (empty) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Please answer all required questions.",
					});
				}
			}
		}
		// Non-anonymous: block a second submission. Anonymous: never store the user.
		if (!target.isAnonymous) {
			const [existing] = await db
				.select({ id: surveyResponse.id })
				.from(surveyResponse)
				.where(
					and(
						eq(surveyResponse.surveyId, input.surveyId),
						eq(surveyResponse.respondentUserId, uid)
					)
				)
				.limit(1);
			if (existing) {
				throw new ORPCError("BAD_REQUEST", {
					message: "You have already responded to this survey.",
				});
			}
		}
		const validQuestionIds = new Set(questions.map((q) => q.id));
		await db.transaction(async (tx) => {
			const [resp] = await tx
				.insert(surveyResponse)
				.values({
					organizationId: oid,
					surveyId: input.surveyId,
					// ANONYMITY: only set the user id when the survey is NOT anonymous.
					respondentUserId: target.isAnonymous ? null : uid,
				})
				.returning({ id: surveyResponse.id });
			if (!resp) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Insert failed.",
				});
			}
			const rows = input.answers
				.filter((a) => validQuestionIds.has(a.questionId))
				.map((a) => ({
					organizationId: oid,
					responseId: resp.id,
					questionId: a.questionId,
					answerText: a.answerText?.trim() ? a.answerText.trim() : null,
					answerJson: buildAnswerJson(a),
				}));
			if (rows.length > 0) {
				await tx.insert(surveyResponseAnswer).values(rows);
			}
		});
		return { ok: true };
	});

// ── results: aggregate-only; never exposes who answered ──
const results = authorizedProcedure("survey", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const target = await loadManagedSurvey(oid, input.id);
		const questions = await db
			.select()
			.from(surveyQuestion)
			.where(
				and(
					eq(surveyQuestion.surveyId, input.id),
					eq(surveyQuestion.organizationId, oid)
				)
			)
			.orderBy(asc(surveyQuestion.sortOrder));
		const responses = await db
			.select({ id: surveyResponse.id })
			.from(surveyResponse)
			.where(
				and(
					eq(surveyResponse.surveyId, input.id),
					eq(surveyResponse.organizationId, oid)
				)
			);
		const responseIds = responses.map((r) => r.id);
		const answers =
			responseIds.length > 0
				? await db
						.select({
							questionId: surveyResponseAnswer.questionId,
							answerText: surveyResponseAnswer.answerText,
							answerJson: surveyResponseAnswer.answerJson,
						})
						.from(surveyResponseAnswer)
						.where(
							and(
								eq(surveyResponseAnswer.organizationId, oid),
								inArray(surveyResponseAnswer.responseId, responseIds)
							)
						)
				: [];
		const byQuestion = new Map<string, typeof answers>();
		for (const a of answers) {
			const arr = byQuestion.get(a.questionId) ?? [];
			arr.push(a);
			byQuestion.set(a.questionId, arr);
		}
		const questionResults = questions.map((q) => {
			const qAnswers = byQuestion.get(q.id) ?? [];
			if (q.questionType === "text") {
				return {
					questionId: q.id,
					questionText: q.questionText,
					questionType: q.questionType,
					textAnswers: qAnswers
						.map((a) => a.answerText)
						.filter((t): t is string => Boolean(t)),
				};
			}
			if (q.questionType === "rating") {
				const ratings = qAnswers
					.map((a) => (a.answerJson as { rating?: number } | null)?.rating)
					.filter((n): n is number => typeof n === "number");
				const avg =
					ratings.length > 0
						? ratings.reduce((s, n) => s + n, 0) / ratings.length
						: 0;
				const distribution: Record<string, number> = {};
				for (const n of ratings) {
					distribution[String(n)] = (distribution[String(n)] ?? 0) + 1;
				}
				return {
					questionId: q.id,
					questionText: q.questionText,
					questionType: q.questionType,
					count: ratings.length,
					average: Math.round(avg * 100) / 100,
					distribution,
				};
			}
			// single_choice / multi_choice
			const counts: Record<string, number> = {};
			for (const a of qAnswers) {
				const choices =
					(a.answerJson as { choices?: string[] } | null)?.choices ?? [];
				for (const c of choices) {
					counts[c] = (counts[c] ?? 0) + 1;
				}
			}
			return {
				questionId: q.id,
				questionText: q.questionText,
				questionType: q.questionType,
				options: (q.options as string[] | null) ?? [],
				counts,
			};
		});
		return {
			survey: {
				id: target.id,
				title: target.title,
				isAnonymous: target.isAnonymous,
				status: target.status,
			},
			responseCount: responses.length,
			questions: questionResults,
		};
	});

export const surveysRouter = {
	surveys: {
		feed,
		list,
		getById,
		create,
		update,
		questionsAdd,
		questionsRemove,
		publish,
		close,
		respond,
		results,
	},
};
