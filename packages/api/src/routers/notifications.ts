/**
 * Notifications router — Phase 21D-F.
 *
 * The per-user in-app inbox. Every procedure SELF-SCOPES to the caller
 * (userId = session user) within the active organization — a member can only
 * ever read or mutate their OWN notifications, regardless of role. Creation is
 * not exposed here: other modules emit via utils/notifications.createNotification
 * (server-side), and the migration write-ETL imports rows directly.
 *
 * Two-layer authz: AC gate (authorizedProcedure("notification", …), held by all
 * roles) + handler self-scope (userId + organizationId on every query).
 */

import { db } from "@Heimdallone/db";
import { notification } from "@Heimdallone/db/schema/notification";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const userId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;

// Always-present scope: this caller's own notifications in the active org.
function selfScope(context: {
	organizationId: string;
	session: { user: { id: string } };
}) {
	return and(
		eq(notification.organizationId, orgId(context)),
		eq(notification.userId, userId(context))
	);
}

const list = authorizedProcedure("notification", "read")
	.input(
		z
			.object({
				unreadOnly: z.boolean().default(false),
				limit: z.number().int().min(1).max(100).default(50),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conditions = [selfScope(context)];
		if (input?.unreadOnly) {
			conditions.push(isNull(notification.readAt));
		}
		return await db
			.select({
				id: notification.id,
				type: notification.type,
				title: notification.title,
				body: notification.body,
				entityType: notification.entityType,
				entityId: notification.entityId,
				readAt: notification.readAt,
				createdAt: notification.createdAt,
			})
			.from(notification)
			.where(and(...conditions))
			.orderBy(desc(notification.createdAt))
			.limit(input?.limit ?? 50);
	});

const unreadCount = authorizedProcedure("notification", "read").handler(
	async ({ context }) => {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(notification)
			.where(and(selfScope(context), isNull(notification.readAt)));
		return { count: row?.count ?? 0 };
	}
);

// Load + self-scope a single notification (404 if not the caller's).
async function loadOwn(
	context: {
		organizationId: string;
		session: { user: { id: string } };
	},
	id: string
) {
	const [row] = await db
		.select({ id: notification.id, readAt: notification.readAt })
		.from(notification)
		.where(and(eq(notification.id, id), selfScope(context)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Notification not found." });
	}
	return row;
}

const markRead = authorizedProcedure("notification", "manage")
	.input(z.object({ id: z.string(), read: z.boolean().default(true) }))
	.handler(async ({ context, input }) => {
		await loadOwn(context, input.id);
		await db
			.update(notification)
			.set({ readAt: input.read ? new Date() : null })
			.where(and(eq(notification.id, input.id), selfScope(context)));
		return { id: input.id, read: input.read };
	});

const markAllRead = authorizedProcedure("notification", "manage").handler(
	async ({ context }) => {
		const updated = await db
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(selfScope(context), isNull(notification.readAt)))
			.returning({ id: notification.id });
		return { marked: updated.length };
	}
);

const dismiss = authorizedProcedure("notification", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await loadOwn(context, input.id);
		await db
			.delete(notification)
			.where(and(eq(notification.id, input.id), selfScope(context)));
		return { id: input.id };
	});

export const notificationsRouter = {
	list,
	unreadCount,
	markRead,
	markAllRead,
	dismiss,
};
