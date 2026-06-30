// Stripe client + helpers (ported from v1). All functions degrade gracefully
// when STRIPE_SECRET_KEY is unset — billing DISPLAY (plans, current plan, usage)
// works without Stripe; only checkout/portal/invoices need live keys.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) {
		return null;
	}
	if (!_stripe) {
		_stripe = new Stripe(key);
	}
	return _stripe;
}

export type BillingCycle = "monthly" | "yearly";

export function getStripePrice(
	plan: "starter" | "business",
	cycle: BillingCycle
): string | null {
	const map: Record<string, Record<BillingCycle, string | undefined>> = {
		starter: {
			monthly: process.env.STRIPE_PRICE_STARTER,
			yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
		},
		business: {
			monthly: process.env.STRIPE_PRICE_BUSINESS,
			yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY,
		},
	};
	return map[plan]?.[cycle] ?? null;
}

export function verifyStripeWebhook(
	rawBody: string,
	sig: string,
	secret: string
): Stripe.Event {
	const stripe = getStripe();
	if (!stripe) {
		throw new Error("Stripe not configured");
	}
	return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

export async function getCustomerInvoices(customerId: string, limit = 10) {
	const stripe = getStripe();
	if (!stripe) {
		return [];
	}
	const list = await stripe.invoices.list({ customer: customerId, limit });
	return list.data.map((inv) => ({
		id: inv.id,
		number: inv.number,
		amountPaid: inv.amount_paid,
		currency: inv.currency,
		status: inv.status,
		periodStart: inv.period_start,
		periodEnd: inv.period_end,
		pdfUrl: inv.invoice_pdf,
		hostedUrl: inv.hosted_invoice_url,
		createdAt: inv.created,
	}));
}
