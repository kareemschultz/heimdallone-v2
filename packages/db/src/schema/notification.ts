/**
 * Notifications — Phase 21D-F schema.
 *
 * The v2 home for v1's in-app notification inbox (`notifications`, 14 live rows).
 * v2 had notification UI chrome but no backing store. This is the minimal inbox:
 * a per-user, per-org message with a type, title/body, an optional soft link to
 * the entity it concerns, and a read timestamp.
 *
 * `entityType`/`entityId` are SOFT refs (text, NOT FKs) — a notification points
 * at any module's record (a helpdesk request, a leave approval, a payslip) and
 * must survive that record being archived; resolution/deep-linking is done at
 * read time, never enforced by a foreign key.
 */

import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, orgRef } from "./hr-core";

export const notification = pgTable(
	"notification",
	{
		id: cuid(),
		organizationId: orgRef(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		// Soft cross-module link (NOT FKs).
		entityType: text("entity_type"),
		entityId: text("entity_id"),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Inbox query: a user's notifications newest-first.
		index("notification_user_created_idx").on(t.userId, t.createdAt),
		// Unread-count query.
		index("notification_user_read_idx").on(t.userId, t.readAt),
		index("notification_org_idx").on(t.organizationId),
	]
);

export const notificationRelations = relations(notification, ({ one }) => ({
	recipient: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
}));
