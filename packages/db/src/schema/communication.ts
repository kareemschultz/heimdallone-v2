/**
 * Communications — announcements.
 *
 * The v2 home for v1's `communications/announcements`. An announcement is an
 * org-wide (or audience-scoped) message from admins/HR to members, with a
 * publish lifecycle, optional pin, and optional expiry. Read state is tracked
 * per-user so the UI can show unread counts and "new" badges.
 *
 * Audience targeting is intentionally simple and tenant-safe: all members, a
 * single department, or a single access role. Department/role are SOFT refs
 * (text) so an announcement survives a department being archived; matching is
 * resolved at read time, never enforced by a foreign key.
 *
 * Surveys (the other half of v1 Communications) are a separate follow-on; this
 * file is announcements only.
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

export const announcementStatusEnum = pgEnum("announcement_status", [
	"draft",
	"published",
	"archived",
]);

export const announcementAudienceEnum = pgEnum("announcement_audience", [
	"all_members",
	"department",
	"role",
]);

export const announcement = pgTable(
	"announcement",
	{
		id: cuid(),
		organizationId: orgRef(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		status: announcementStatusEnum("status").notNull().default("draft"),
		audienceType: announcementAudienceEnum("audience_type")
			.notNull()
			.default("all_members"),
		// Soft refs (NOT FKs) — resolved/matched at read time.
		audienceDepartmentId: text("audience_department_id"),
		audienceRole: text("audience_role"),
		isPinned: boolean("is_pinned").notNull().default(false),
		publishedAt: timestamp("published_at"),
		expiresAt: timestamp("expires_at"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		index("announcement_org_status_idx").on(t.organizationId, t.status),
		index("announcement_org_published_idx").on(t.organizationId, t.publishedAt),
	]
);

export const announcementRead = pgTable(
	"announcement_read",
	{
		id: cuid(),
		organizationId: orgRef(),
		announcementId: text("announcement_id")
			.notNull()
			.references(() => announcement.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		readAt: timestamp("read_at").defaultNow().notNull(),
	},
	(t) => [
		unique("announcement_read_uq").on(t.announcementId, t.userId),
		index("announcement_read_user_idx").on(t.userId),
	]
);

export const announcementRelations = relations(
	announcement,
	({ one, many }) => ({
		createdBy: one(user, {
			fields: [announcement.createdByUserId],
			references: [user.id],
		}),
		reads: many(announcementRead),
	})
);

export const announcementReadRelations = relations(
	announcementRead,
	({ one }) => ({
		announcement: one(announcement, {
			fields: [announcementRead.announcementId],
			references: [announcement.id],
		}),
		reader: one(user, {
			fields: [announcementRead.userId],
			references: [user.id],
		}),
	})
);
