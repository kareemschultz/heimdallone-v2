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
 *
 * admin.createLogin — HR-gated procedure to provision a Better Auth user +
 * credential account + org membership for a migrated employee who has no login.
 * Reuses the `employee:read` AC pair already consumed by admin.report (audit
 * stays unchanged). Writes: user table, account table (credential), member table,
 * employee_profile.userId + email (if null). NEVER touches v1 or payroll.
 */

import { auth } from "@Heimdallone/auth";
import { db } from "@Heimdallone/db";
import { user } from "@Heimdallone/db/schema/auth";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { env } from "@Heimdallone/env/server";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, protectedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
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

// ── HR/admin: provision a login for a no-login migrated employee ──
// Gated to canManageHR (owner / tenant_admin / hr_admin). Reuses the existing
// employee:read AC pair already consumed by admin.report — audit stays 161/21.
//
// Allowed org roles that HR may grant to new accounts. Excludes tenant_owner /
// tenant_admin — those are elevated roles that require a deliberate separate
// action, not a one-click "give them a portal login" path.
// Roles HR may grant via this tool. `as const` so the values flow through to a
// literal union (z.enum below + addMember's role param) instead of bare string.
// tenant_owner / tenant_admin are intentionally excluded (no privilege escalation).
const GRANTABLE_ROLES = [
	"hr_admin",
	"payroll_admin",
	"manager",
	"employee",
	"auditor",
	"recruiter",
	"helpdesk_agent",
	"project_manager",
	"sales_admin",
	"sales_rep",
	"inventory_manager",
	"stock_officer",
] as const;

const adminCreateLogin = authorizedProcedure("employee", "read")
	.input(
		z.object({
			employeeId: z.string().min(1),
			// HR may override or supply the email. Required when profile email is null.
			email: z.string().email().optional(),
			// Org membership role. Defaults to "employee" if omitted.
			role: z.enum(GRANTABLE_ROLES).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const callerRole = (context as unknown as { memberRole: string })
			.memberRole;
		if (!canManageHR(callerRole)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR administrators and owners can create logins.",
			});
		}

		const oid = (context as unknown as { organizationId: string })
			.organizationId;
		const actorId = (
			context as unknown as { session: { user: { id: string } } }
		).session.user.id;

		// Role is validated by z.enum(GRANTABLE_ROLES) at the input boundary;
		// default to "employee" when omitted.
		const requestedRole = input.role ?? "employee";

		// Load the employee — tenant-scoped IDOR guard.
		const [emp] = await db
			.select({
				id: employeeProfile.id,
				firstName: employeeProfile.firstName,
				lastName: employeeProfile.lastName,
				email: employeeProfile.email,
				userId: employeeProfile.userId,
				organizationId: employeeProfile.organizationId,
			})
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, input.employeeId),
					eq(employeeProfile.organizationId, oid)
				)
			)
			.limit(1);

		if (!emp) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found in this organization.",
			});
		}

		// Idempotent guard — already has a user link.
		if (emp.userId) {
			throw new ORPCError("CONFLICT", {
				message: "This employee already has a login. No action taken.",
			});
		}

		// Resolve email: prefer the caller-supplied override, then the profile value.
		const resolvedEmail = (input.email ?? emp.email ?? "").trim().toLowerCase();
		if (!resolvedEmail) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"No email address is on file for this employee. Supply one to create a login.",
			});
		}

		const fullName =
			[emp.firstName, emp.lastName].filter(Boolean).join(" ") || "New employee";

		// Generate a secure one-time temporary password. The admin must share this
		// out-of-band; it is returned once and never logged or stored in plaintext.
		// We deliberately do NOT write it to audit metadata.
		// 18 CSPRNG bytes (144 bits of entropy) rendered as printable base64url; the
		// fixed "Hm…!" wrapper guarantees upper/lower/special so any password-complexity
		// policy is satisfied without weakening the underlying randomness.
		const tempPassword = `Hm${Buffer.from(
			crypto.getRandomValues(new Uint8Array(18))
		).toString("base64url")}!`;

		// Create Better Auth user + credential account via the admin plugin's
		// server-side endpoint. Called without request headers so the admin-plugin
		// session gate is bypassed (the server is the caller, not a browser session).
		// This is the same pattern used by scripts/seed-dev.ts via auth.handler().
		const createResult = await auth.api.createUser({
			body: {
				email: resolvedEmail,
				password: tempPassword,
				name: fullName,
			},
		});

		if (!createResult?.user?.id) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Better Auth failed to create the user. Check server logs.",
			});
		}

		const newUserId = createResult.user.id;

		// Add the new user as a member of this organisation.
		await auth.api.addMember({
			body: {
				userId: newUserId,
				role: requestedRole,
				organizationId: oid,
			},
			// addMember is server-only (no browser session required); pass a minimal
			// Origin header so the plugin's CORS guard is satisfied.
			headers: new Headers({ Origin: env.CORS_ORIGIN }),
		});

		// Link the employee profile to the new user + backfill email if it was null.
		await db
			.update(employeeProfile)
			.set({
				userId: newUserId,
				...(emp.email ? {} : { email: resolvedEmail }),
			})
			.where(
				and(
					eq(employeeProfile.id, emp.id),
					eq(employeeProfile.organizationId, oid)
				)
			);

		// Audit: record the login creation without the password.
		await createAuditEvent(db as Parameters<typeof createAuditEvent>[0], {
			organizationId: oid,
			entityType: "user",
			entityId: newUserId,
			action: "create",
			actorId,
			metadata: {
				employeeId: emp.id,
				email: resolvedEmail,
				role: requestedRole,
				source: "admin_create_login",
			},
		});

		// Return the temp password once. The caller must present it to the employee
		// securely (e.g. copy + share face-to-face). It will not appear again.
		return {
			userId: newUserId,
			email: resolvedEmail,
			role: requestedRole,
			temporaryPassword: tempPassword,
		};
	});

export const migrationRouter = {
	me: {
		status,
		acknowledge,
		markProfileReviewed,
	},
	admin: {
		report: adminReport,
		createLogin: adminCreateLogin,
	},
};
