/**
 * Communications router — announcements.
 *
 * Two surfaces:
 *   - Member-facing FEED (read): published, non-expired announcements whose
 *     audience matches the caller (all members / their department / their role),
 *     with per-user read state. Held by every role.
 *   - Management (manage): list (incl. drafts/archived), create/update/publish/
 *     archive/remove. Held by owner/admin/hr_admin via the `announcement` AC.
 *
 * Two-layer authz: AC gate (authorizedProcedure("announcement", …)) + handler
 * org-scope + audience-scope. Audience matching is resolved in code from the
 * caller's role (context.memberRole) and department (their employee work info),
 * never trusted from the client.
 */

import { db } from "@Heimdallone/db";
import {
	announcement,
	announcementRead,
} from "@Heimdallone/db/schema/communication";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const memberRole = (ctx: { memberRole?: string }) =>
	ctx.memberRole ?? "employee";

const audienceEnum = z.enum(["all_members", "department", "role"]);
type AudienceType = z.infer<typeof audienceEnum>;

const writeFields = z.object({
	title: z.string().min(1).max(300),
	body: z.string().min(1),
	audienceType: audienceEnum.default("all_members"),
	audienceDepartmentId: z.string().nullable().optional(),
	audienceRole: z.string().nullable().optional(),
	isPinned: z.boolean().optional().default(false),
	expiresAt: z.string().datetime().nullable().optional(),
});

// Resolve the caller's department id (via their employee work info), if any.
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
		return !!callerDept && row.audienceDepartmentId === callerDept;
	}
	if (row.audienceType === "role") {
		return row.audienceRole === callerRole;
	}
	return false;
}

// For partial updates: an audience column is set to its value only when the new
// audienceType matches, cleared when audienceType changed to something else, and
// left untouched (undefined) when audienceType isn't part of this update.
function audienceColForUpdate(
	audienceType: AudienceType | undefined,
	matchType: AudienceType,
	value: string | null | undefined
): string | null | undefined {
	if (audienceType === undefined) {
		return;
	}
	return audienceType === matchType ? (value ?? null) : null;
}

function expiresForUpdate(
	expiresAt: string | null | undefined
): Date | null | undefined {
	if (expiresAt === undefined) {
		return;
	}
	return expiresAt ? new Date(expiresAt) : null;
}

// ── member feed: published, non-expired, audience-matched, with read state ──
const feed = authorizedProcedure("announcement", "read")
	.input(
		z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const now = new Date();
		const rows = await db
			.select({
				id: announcement.id,
				title: announcement.title,
				body: announcement.body,
				audienceType: announcement.audienceType,
				audienceDepartmentId: announcement.audienceDepartmentId,
				audienceRole: announcement.audienceRole,
				isPinned: announcement.isPinned,
				publishedAt: announcement.publishedAt,
				expiresAt: announcement.expiresAt,
				readAt: announcementRead.readAt,
			})
			.from(announcement)
			.leftJoin(
				announcementRead,
				and(
					eq(announcementRead.announcementId, announcement.id),
					eq(announcementRead.userId, actorId(context))
				)
			)
			.where(
				and(
					eq(announcement.organizationId, oid),
					eq(announcement.status, "published"),
					or(
						isNull(announcement.expiresAt),
						lte(sql`${now}`, announcement.expiresAt)
					)
				)
			)
			.orderBy(desc(announcement.isPinned), desc(announcement.publishedAt))
			.limit(input?.limit ?? 50);
		const callerDept = await callerDepartmentId(oid, actorId(context));
		const role = memberRole(context);
		return rows.filter((r) => audienceMatches(r, callerDept, role));
	});

const unreadCount = authorizedProcedure("announcement", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		const now = new Date();
		const rows = await db
			.select({
				audienceType: announcement.audienceType,
				audienceDepartmentId: announcement.audienceDepartmentId,
				audienceRole: announcement.audienceRole,
				readAt: announcementRead.readAt,
			})
			.from(announcement)
			.leftJoin(
				announcementRead,
				and(
					eq(announcementRead.announcementId, announcement.id),
					eq(announcementRead.userId, actorId(context))
				)
			)
			.where(
				and(
					eq(announcement.organizationId, oid),
					eq(announcement.status, "published"),
					or(
						isNull(announcement.expiresAt),
						lte(sql`${now}`, announcement.expiresAt)
					)
				)
			);
		const callerDept = await callerDepartmentId(oid, actorId(context));
		const role = memberRole(context);
		const count = rows.filter(
			(r) => !r.readAt && audienceMatches(r, callerDept, role)
		).length;
		return { count };
	}
);

const markRead = authorizedProcedure("announcement", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.select({ id: announcement.id })
			.from(announcement)
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Announcement not found." });
		}
		await db
			.insert(announcementRead)
			.values({
				organizationId: oid,
				announcementId: input.id,
				userId: actorId(context),
			})
			.onConflictDoNothing();
		return { id: input.id };
	});

// ── management: full list (incl. drafts/archived) ──
const list = authorizedProcedure("announcement", "manage")
	.input(
		z
			.object({
				status: z.enum(["draft", "published", "archived"]).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [eq(announcement.organizationId, oid)];
		if (input?.status) {
			conditions.push(eq(announcement.status, input.status));
		}
		return await db
			.select({
				id: announcement.id,
				title: announcement.title,
				status: announcement.status,
				audienceType: announcement.audienceType,
				audienceDepartmentId: announcement.audienceDepartmentId,
				audienceRole: announcement.audienceRole,
				isPinned: announcement.isPinned,
				publishedAt: announcement.publishedAt,
				expiresAt: announcement.expiresAt,
				createdAt: announcement.createdAt,
			})
			.from(announcement)
			.where(and(...conditions))
			.orderBy(desc(announcement.createdAt));
	});

const getById = authorizedProcedure("announcement", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.select()
			.from(announcement)
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Announcement not found." });
		}
		return row;
	});

async function loadManaged(oid: string, id: string) {
	const [row] = await db
		.select({ id: announcement.id, status: announcement.status })
		.from(announcement)
		.where(and(eq(announcement.id, id), eq(announcement.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Announcement not found." });
	}
	return row;
}

const create = authorizedProcedure("announcement", "manage")
	.input(writeFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.insert(announcement)
			.values({
				organizationId: oid,
				title: input.title,
				body: input.body,
				audienceType: input.audienceType,
				audienceDepartmentId:
					input.audienceType === "department"
						? (input.audienceDepartmentId ?? null)
						: null,
				audienceRole:
					input.audienceType === "role" ? (input.audienceRole ?? null) : null,
				isPinned: input.isPinned,
				expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
				createdByUserId: actorId(context),
			})
			.returning({ id: announcement.id });
		if (!row) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Insert failed.",
			});
		}
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "announcement",
			entityId: row.id,
			action: "create",
			actorId: actorId(context),
		});
		return { id: row.id };
	});

const update = authorizedProcedure("announcement", "manage")
	.input(writeFields.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManaged(oid, input.id);
		await db
			.update(announcement)
			.set({
				title: input.title,
				body: input.body,
				audienceType: input.audienceType,
				audienceDepartmentId: audienceColForUpdate(
					input.audienceType,
					"department",
					input.audienceDepartmentId
				),
				audienceRole: audienceColForUpdate(
					input.audienceType,
					"role",
					input.audienceRole
				),
				isPinned: input.isPinned,
				expiresAt: expiresForUpdate(input.expiresAt),
			})
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "announcement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const publish = authorizedProcedure("announcement", "manage")
	.input(z.object({ id: z.string(), publish: z.boolean().default(true) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManaged(oid, input.id);
		await db
			.update(announcement)
			.set({
				status: input.publish ? "published" : "draft",
				publishedAt: input.publish ? new Date() : null,
			})
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "announcement",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { published: input.publish },
		});
		return { id: input.id, published: input.publish };
	});

const archive = authorizedProcedure("announcement", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManaged(oid, input.id);
		await db
			.update(announcement)
			.set({ status: "archived" })
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "announcement",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const remove = authorizedProcedure("announcement", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await loadManaged(oid, input.id);
		await db
			.delete(announcementRead)
			.where(eq(announcementRead.announcementId, input.id));
		await db
			.delete(announcement)
			.where(
				and(eq(announcement.id, input.id), eq(announcement.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "announcement",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

export const communicationsRouter = {
	announcements: {
		feed,
		unreadCount,
		markRead,
		list,
		getById,
		create,
		update,
		publish,
		archive,
		remove,
	},
};
