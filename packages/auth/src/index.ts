import { createDb } from "@Heimdallone/db";
import * as schema from "@Heimdallone/db/schema/auth";
import { env } from "@Heimdallone/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";

import { ac, roles } from "./permissions";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			"Heimdallone://",
			"exp://",
			"http://localhost:8081",
		],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: env.NODE_ENV === "production" ? "none" : "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
		plugins: [
			expo(),
			organization({
				ac,
				roles,
				allowUserToCreateOrganization: true,
				creatorRole: "tenant_owner",
				sendInvitationEmail: async (data) => {
					console.log(
						`[dev] Invitation to ${data.email}, org: ${data.organization.name}`
					);
				},
			}),
			admin({
				adminUserIds: env.PLATFORM_ADMIN_USER_ID
					? [env.PLATFORM_ADMIN_USER_ID]
					: [],
			}),
		],
	});
}

export const auth = createAuth();
