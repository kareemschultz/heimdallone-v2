import { createDb } from "@Heimdallone/db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema is consumed as a namespace (schema.*)
import * as schema from "@Heimdallone/db/schema/auth";
import { env } from "@Heimdallone/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

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
			// The auth server's own origin (api.) — needed so the OAuth callback
			// redirect back to the app is honored when app./api. differ.
			env.BETTER_AUTH_URL,
			"Heimdallone://",
			"exp://",
			"http://localhost:8081",
		],
		emailAndPassword: {
			enabled: true,
		},
		// Google sign-in (preserved from v1). Registered only when the client
		// id/secret are present so non-Google deployments are unaffected. Callback
		// is ${BETTER_AUTH_URL}/api/auth/callback/google.
		...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					socialProviders: {
						google: {
							clientId: env.GOOGLE_CLIENT_ID,
							clientSecret: env.GOOGLE_CLIENT_SECRET,
						},
					},
				}
			: {}),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			// When the browser (app.) and the auth server (api.) live on different
			// subdomains, the session cookie must be scoped to the shared apex so
			// it is readable on both. Enabled only when COOKIE_DOMAIN is set, so
			// single-host / localhost deploys are unaffected.
			...(env.COOKIE_DOMAIN
				? {
						crossSubDomainCookies: {
							enabled: true,
							domain: env.COOKIE_DOMAIN,
						},
					}
				: {}),
			defaultCookieAttributes: {
				sameSite: env.NODE_ENV === "production" ? "none" : "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						const members = await db
							.select()
							.from(schema.member)
							.where(eq(schema.member.userId, session.userId))
							.limit(1);
						if (members.length === 1) {
							return {
								data: {
									...session,
									activeOrganizationId: members[0]?.organizationId,
								},
							};
						}
						return { data: session };
					},
				},
			},
		},
		plugins: [
			expo(),
			organization({
				ac,
				roles,
				allowUserToCreateOrganization: true,
				creatorRole: "tenant_owner",
				// biome-ignore lint/suspicious/useAwait: better-auth expects an async signature
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
