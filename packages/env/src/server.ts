import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		PLATFORM_ADMIN_USER_ID: z.string().optional(),
		// Google OAuth (optional) — when both are set, Google sign-in is enabled.
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),
		// Cookie domain for cross-subdomain auth (e.g. ".example.com"). When set,
		// session cookies are scoped to the apex so they are readable across
		// app./api. subdomains. Leave unset for single-host / localhost deploys.
		COOKIE_DOMAIN: z.string().optional(),
		// Transactional email (Resend). When RESEND_API_KEY is absent, email helpers
		// fall back to logging (dev) so non-email deploys are unaffected. EMAIL_FROM
		// must use a Resend-verified domain.
		RESEND_API_KEY: z.string().optional(),
		EMAIL_FROM: z.string().default("Heimdallone <noreply@heimdallone.com>"),
		// Stripe billing (optional). When STRIPE_SECRET_KEY is unset, billing
		// DISPLAY still works (plans, current plan, usage); only checkout/portal/
		// invoices require live keys. Price IDs map plan+cycle → Stripe price.
		STRIPE_SECRET_KEY: z.string().optional(),
		STRIPE_PUBLISHABLE_KEY: z.string().optional(),
		STRIPE_WEBHOOK_SECRET: z.string().optional(),
		STRIPE_PRICE_STARTER: z.string().optional(),
		STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
		STRIPE_PRICE_BUSINESS: z.string().optional(),
		STRIPE_PRICE_BUSINESS_YEARLY: z.string().optional(),
		STRIPE_PORTAL_RETURN_URL: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
