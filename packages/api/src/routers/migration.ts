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
import { and, eq, isNull } from "drizzle-orm";

import { protectedProcedure } from "../index";

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

export const migrationRouter = {
	me: {
		status,
		acknowledge,
		markProfileReviewed,
	},
};
