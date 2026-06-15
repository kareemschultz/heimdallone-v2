/**
 * Migration router — Phase 21N.
 *
 * The migrated user's own first-login onboarding state. Every procedure is
 * SELF-SCOPED to the caller's own `user` row (no resource/role gate — any
 * authenticated user may read and acknowledge their OWN migration notice), so
 * this router uses `protectedProcedure` and consumes NO access-control pair
 * (audit stays 161/21). It never reads or writes another user's row.
 *
 * Backs the required first-login modal: `me.status` tells the client whether to
 * show it (and stamps the first-login time), `me.acknowledge` records the
 * acknowledgement (idempotent — the FIRST time is preserved), and
 * `me.markProfileReviewed` records that the user reviewed their profile.
 */

import { db } from "@Heimdallone/db";
import { user } from "@Heimdallone/db/schema/auth";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";

import { authorizedProcedure, protectedProcedure } from "../index";
import { canManageHR } from "../utils/role-helpers";

const callerId = (context: { session: { user: { id: string } } }) =>
	context.session.user.id;

async function loadSelf(uid: string) {
	const [row] = await db
		.select({
			migratedFromV1: user.migratedFromV1,
			firstLoginAfterMigrationAt: user.firstLoginAfterMigrationAt,
			migrationNoticeAcknowledgedAt: user.migrationNoticeAcknowledgedAt,
			profileReviewCompletedAt: user.profileReviewCompletedAt,
		})
		.from(user)
		.where(eq(user.id, uid))
		.limit(1);
	return row ?? null;
}

const status = protectedProcedure.handler(async ({ context }) => {
	const uid = callerId(context);
	const self = await loadSelf(uid);
	// Stamp the first authenticated visit after migration (once).
	if (self?.migratedFromV1 && !self.firstLoginAfterMigrationAt) {
		await db
			.update(user)
			.set({ firstLoginAfterMigrationAt: new Date() })
			.where(and(eq(user.id, uid), isNull(user.firstLoginAfterMigrationAt)));
	}
	// Resolve the caller's own employee record (for the "review your profile"
	// deep link). A user maps to at most one employee profile.
	const [emp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(eq(employeeProfile.userId, uid))
		.limit(1);
	const migratedFromV1 = self?.migratedFromV1 ?? false;
	const acknowledgedAt = self?.migrationNoticeAcknowledgedAt ?? null;
	return {
		migratedFromV1,
		needsNotice: migratedFromV1 && acknowledgedAt === null,
		firstLoginAfterMigrationAt: self?.firstLoginAfterMigrationAt ?? null,
		acknowledgedAt,
		profileReviewCompletedAt: self?.profileReviewCompletedAt ?? null,
		employeeId: emp?.id ?? null,
	};
});

const acknowledge = protectedProcedure.handler(async ({ context }) => {
	const uid = callerId(context);
	// Idempotent: only set on the first acknowledgement (preserve the original
	// timestamp on repeat calls).
	await db
		.update(user)
		.set({ migrationNoticeAcknowledgedAt: new Date() })
		.where(and(eq(user.id, uid), isNull(user.migrationNoticeAcknowledgedAt)));
	return { acknowledged: true };
});

const markProfileReviewed = protectedProcedure.handler(async ({ context }) => {
	const uid = callerId(context);
	await db
		.update(user)
		.set({ profileReviewCompletedAt: new Date() })
		.where(and(eq(user.id, uid), isNull(user.profileReviewCompletedAt)));
	return { reviewed: true };
});

// ── HR/admin migration-status report (21N-E) ──
// Reuses the existing employee:read AC pair (audit stays 161/21) + a handler
// canManageHR gate (owner/admin/hr_admin). Org-scoped. Names are shown in-app to
// authorised HR only; the PII-safe *file* reports live in the ETL.
type MigrationCategory =
	| "login_active"
	| "login_pending_ack"
	| "login_pending_review"
	| "no_login_has_email"
	| "no_login_missing_email";

function categorize(row: {
	userId: string | null;
	email: string | null;
	migratedFromV1: boolean | null;
	acknowledgedAt: Date | null;
	profileReviewCompletedAt: Date | null;
}): MigrationCategory {
	if (!row.userId) {
		return row.email ? "no_login_has_email" : "no_login_missing_email";
	}
	if (row.migratedFromV1 && !row.acknowledgedAt) {
		return "login_pending_ack";
	}
	if (row.migratedFromV1 && !row.profileReviewCompletedAt) {
		return "login_pending_review";
	}
	return "login_active";
}

const adminReport = authorizedProcedure("employee", "read").handler(
	async ({ context }) => {
		const role = (context as unknown as { memberRole: string }).memberRole;
		if (!canManageHR(role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR and admins can view the migration status report.",
			});
		}
		const oid = (context as unknown as { organizationId: string })
			.organizationId;
		const rows = await db
			.select({
				employeeId: employeeProfile.id,
				firstName: employeeProfile.firstName,
				lastName: employeeProfile.lastName,
				email: employeeProfile.email,
				userId: employeeProfile.userId,
				migratedFromV1: user.migratedFromV1,
				acknowledgedAt: user.migrationNoticeAcknowledgedAt,
				profileReviewCompletedAt: user.profileReviewCompletedAt,
				firstLoginAfterMigrationAt: user.firstLoginAfterMigrationAt,
			})
			.from(employeeProfile)
			.leftJoin(user, eq(employeeProfile.userId, user.id))
			.where(eq(employeeProfile.organizationId, oid))
			.orderBy(asc(employeeProfile.firstName));

		const items = rows.map((r) => {
			const category = categorize(r);
			const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ");
			return {
				employeeId: r.employeeId,
				name: fullName || "Unknown",
				email: r.email,
				hasLogin: r.userId !== null,
				migratedFromV1: r.migratedFromV1 ?? false,
				acknowledged: r.acknowledgedAt !== null,
				profileReviewed: r.profileReviewCompletedAt !== null,
				category,
			};
		});

		const summary = {
			total: items.length,
			loginPreserved: items.filter((i) => i.hasLogin).length,
			missingEmail: items.filter((i) => i.category === "no_login_missing_email")
				.length,
			noLoginHasEmail: items.filter((i) => i.category === "no_login_has_email")
				.length,
			pendingAck: items.filter((i) => i.category === "login_pending_ack")
				.length,
			pendingReview: items.filter((i) => i.category === "login_pending_review")
				.length,
			acknowledged: items.filter((i) => i.acknowledged).length,
		};
		return { items, summary };
	}
);

export const migrationRouter = {
	me: {
		status,
		acknowledge,
		markProfileReviewed,
	},
	admin: {
		report: adminReport,
	},
};
