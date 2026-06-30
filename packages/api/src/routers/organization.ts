// Organization billing router — ported from v1, adapted to v2.
//
// Plan/subscription state lives on Better Auth `organization.metadata` (a JSON
// string). getBillingStatus + getInvoices work WITHOUT Stripe keys (display).
// createCheckoutSession / createBillingPortalSession / resumeSubscription
// require STRIPE_SECRET_KEY and degrade with a clear error otherwise.
import { db } from "@Heimdallone/db";
import { organization } from "@Heimdallone/db/schema/auth";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import {
	getPlanFromMetadata,
	PLAN_LIMITS,
	TRIAL_DAYS,
} from "../lib/plan-limits";
import {
	type BillingCycle,
	getCustomerInvoices,
	getStripe,
	getStripePrice,
} from "../lib/stripe-client";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_RETURN_URL = "https://app.heimdallone.com/app/billing";

function parseMeta(raw: string | null): Record<string, unknown> {
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {};
	}
}

// ── getBillingStatus — read-only, any tenant member. No Stripe needed. ──
export const getBillingStatus = tenantProcedure.handler(async ({ context }) => {
	const tenantId = orgId(context);

	const [org] = await db
		.select({
			createdAt: organization.createdAt,
			metadata: organization.metadata,
		})
		.from(organization)
		.where(eq(organization.id, tenantId))
		.limit(1);

	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found." });
	}

	const plan = getPlanFromMetadata(org.metadata);
	const limits = PLAN_LIMITS[plan];

	const [empRow] = await db
		.select({ n: count(employeeProfile.id) })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, tenantId),
				eq(employeeProfile.isActive, true)
			)
		);
	const employeeCount = Number(empRow?.n ?? 0);

	const createdMs = org.createdAt.getTime();
	const elapsedDays = Math.floor((Date.now() - createdMs) / DAY_MS);
	const trialDaysRemaining = Math.max(0, TRIAL_DAYS - elapsedDays);
	const trialEndsAt = new Date(createdMs + TRIAL_DAYS * DAY_MS).toISOString();
	const isTrial = plan === "trial";
	const isTrialExpired = isTrial && trialDaysRemaining === 0;

	const meta = parseMeta(org.metadata);

	return {
		plan,
		planLabel: limits.label,
		employeeCount,
		employeeLimit:
			limits.employeeLimit === Number.POSITIVE_INFINITY
				? null
				: limits.employeeLimit,
		entityLimit:
			limits.entityLimit === Number.POSITIVE_INFINITY
				? null
				: limits.entityLimit,
		upgradeTarget: limits.upgradeTarget,
		upgradable: limits.upgradable,
		billingCycle:
			(meta.billingCycle as "monthly" | "yearly" | undefined) ?? null,
		nextBillingDate: (meta.nextBillingDate as string | undefined) ?? null,
		amountUSD: (meta.amountUSD as number | undefined) ?? null,
		stripeCustomerId: (meta.stripeCustomerId as string | undefined) ?? null,
		subscriptionStatus: (meta.subscriptionStatus as string | undefined) ?? null,
		currentPeriodEnd: (meta.currentPeriodEnd as string | undefined) ?? null,
		cancelAt: (meta.cancelAt as string | undefined) ?? null,
		scheduledPlan: (meta.scheduledPlan as string | undefined) ?? null,
		scheduledPlanAt: (meta.scheduledPlanAt as string | undefined) ?? null,
		stripeSubscriptionId:
			(meta.stripeSubscriptionId as string | undefined) ?? null,
		// Manual credits applied outside Stripe (e.g. the v2-upgrade goodwill
		// extension). Surfaced as a note on the billing page.
		v2CreditDays: (meta.v2CreditDays as number | undefined) ?? null,
		v2CreditNote: (meta.v2CreditNote as string | undefined) ?? null,
		v2CreditOriginalRenewal:
			(meta.v2CreditOriginalRenewal as string | undefined) ?? null,
		trial: {
			isTrial,
			isExpired: isTrialExpired,
			daysRemaining: trialDaysRemaining,
			endsAt: trialEndsAt,
			startedAt: org.createdAt.toISOString(),
		},
	};
});

// ── createCheckoutSession — needs Stripe keys. ──
export const createCheckoutSession = tenantProcedure
	.input(
		z.object({
			plan: z.enum(["starter", "business"]),
			cycle: z.enum(["monthly", "yearly"]),
		})
	)
	.handler(async ({ context, input }) => {
		const tenantId = orgId(context);
		const stripe = getStripe();
		if (!stripe) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Billing is not configured on this server.",
			});
		}
		const priceId = getStripePrice(input.plan, input.cycle as BillingCycle);
		if (!priceId) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: `No price configured for ${input.plan}/${input.cycle}.`,
			});
		}
		const returnUrl =
			process.env.STRIPE_PORTAL_RETURN_URL ?? DEFAULT_RETURN_URL;
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${returnUrl}?checkout=cancelled`,
			metadata: { tenantId, plan: input.plan },
			subscription_data: { metadata: { tenantId } },
		});
		if (!session.url) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Stripe did not return a checkout URL.",
			});
		}
		return { url: session.url };
	});

// ── createBillingPortalSession — needs Stripe keys + a customer. ──
export const createBillingPortalSession = tenantProcedure
	.input(z.object({ returnUrl: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const tenantId = orgId(context);

		const [org] = await db
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, tenantId))
			.limit(1);

		if (!org) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found." });
		}

		const meta = parseMeta(org.metadata);
		const customerId = meta.stripeCustomerId as string | undefined;
		if (!customerId) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"No Stripe subscription. Contact support@heimdallone.com to manage your plan.",
			});
		}

		const stripe = getStripe();
		if (!stripe) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Billing is not configured on this server.",
			});
		}

		const returnUrl =
			input.returnUrl ??
			process.env.STRIPE_PORTAL_RETURN_URL ??
			DEFAULT_RETURN_URL;

		const session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: returnUrl,
		});

		return { url: session.url };
	});

// ── getInvoices — returns [] when no Stripe customer / keys. ──
export const getInvoices = tenantProcedure.handler(async ({ context }) => {
	const tenantId = orgId(context);

	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, tenantId))
		.limit(1);

	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found." });
	}

	const meta = parseMeta(org.metadata);
	const customerId = meta.stripeCustomerId as string | undefined;
	if (!customerId) {
		return [];
	}

	return getCustomerInvoices(customerId);
});

// ── resumeSubscription — needs Stripe keys + a subscription. ──
export const resumeSubscription = tenantProcedure.handler(
	async ({ context }) => {
		const tenantId = orgId(context);

		const stripe = getStripe();
		if (!stripe) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Billing is not configured on this server.",
			});
		}

		const [org] = await db
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, tenantId))
			.limit(1);

		if (!org) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found." });
		}

		const meta = parseMeta(org.metadata);
		const subId = meta.stripeSubscriptionId as string | undefined;
		if (!subId) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "No active subscription found.",
			});
		}

		await stripe.subscriptions.update(subId, {
			cancel_at_period_end: false,
		});

		const updated = {
			...meta,
			cancelAt: null,
			subscriptionStatus: "active",
		};

		await db
			.update(organization)
			.set({ metadata: JSON.stringify(updated) })
			.where(eq(organization.id, tenantId));

		return { success: true };
	}
);

export const organizationRouter = {
	getBillingStatus,
	getInvoices,
	createCheckoutSession,
	createBillingPortalSession,
	resumeSubscription,
};
