import { roles, type TenantRole } from "@Heimdallone/auth/permissions";
import { db } from "@Heimdallone/db";
import { member } from "@Heimdallone/db/schema/auth";
import { ORPCError, os } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireActiveOrganization = o.middleware(async ({ context, next }) => {
	if (!context.session?.session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	const sessionData = context.session.session as unknown as Record<
		string,
		unknown
	>;
	const activeOrgId = sessionData.activeOrganizationId as string | undefined;

	if (!activeOrgId) {
		throw new ORPCError("FORBIDDEN", {
			message: "No active organization. Select or create an organization.",
		});
	}

	const userId = context.session.user.id;
	const [memberRecord] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, activeOrgId))
		)
		.limit(1);

	const memberRole = memberRecord?.role ?? "employee";

	return next({
		context: {
			session: context.session,
			organizationId: activeOrgId,
			memberRole,
		},
	});
});

export const tenantProcedure = protectedProcedure.use(
	requireActiveOrganization
);

export function requirePermission(resource: string, action: string) {
	return o.middleware(async ({ context, next }) => {
		const ctx = context as unknown as {
			memberRole: string;
		};

		const roleName = ctx.memberRole as TenantRole;
		const roleObj = roles[roleName];

		if (!roleObj) {
			throw new ORPCError("FORBIDDEN", {
				message: `Unknown role: ${roleName}`,
			});
		}

		const result = roleObj.authorize({
			[resource]: [action],
		} as Parameters<typeof roleObj.authorize>[0]);

		if (!result.success) {
			throw new ORPCError("FORBIDDEN", {
				message: `Missing permission: ${resource}:${action}`,
			});
		}

		return next();
	});
}

export function requireTenantRole(...allowedRoles: string[]) {
	return o.middleware(async ({ context, next }) => {
		const ctx = context as unknown as { memberRole: string };
		if (!allowedRoles.includes(ctx.memberRole)) {
			throw new ORPCError("FORBIDDEN", {
				message: `Required role: ${allowedRoles.join(" | ")}`,
			});
		}
		return next();
	});
}

export function authorizedProcedure(resource: string, action: string) {
	return tenantProcedure.use(requirePermission(resource, action));
}
