import { createContext } from "@Heimdallone/api/context";
import { verifyStripeWebhook } from "@Heimdallone/api/lib/stripe-client";
import { appRouter } from "@Heimdallone/api/routers/index";
import { auth } from "@Heimdallone/auth";
import { db } from "@Heimdallone/db";
import { organization } from "@Heimdallone/db/schema/auth";
import { env } from "@Heimdallone/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { eq } from "drizzle-orm";
import { initLogger } from "evlog";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimit } from "./rate-limit";

initLogger({
	env: { service: "Heimdallone-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: ["/api/auth/**"],
	maskEmail: true,
});

const app = new Hono<EvlogVariables>();

// Liveness probe — unauthenticated and placed before all middleware so container
// healthchecks and the cutover ingress get a fast, dependency-free 200 while the
// process is up. Does not touch the database.
app.get("/health", (c) => c.json({ status: "ok" }));

// ── Stripe billing webhook (ported from v1) ──────────────────────────────
// Syncs subscription state into organization.metadata. Mounted before the
// body-consuming middleware: Stripe signs the RAW bytes, so any re-serialise
// breaks the HMAC.
async function handleCheckoutCompleted(session: {
	customer?: string | null;
	subscription?: string | null;
	metadata?: { tenantId?: string; plan?: string };
}) {
	const tenantId = session.metadata?.tenantId;
	const plan = session.metadata?.plan;
	if (!(tenantId && (plan === "starter" || plan === "business"))) {
		return;
	}
	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, tenantId))
		.limit(1);
	if (!org) {
		return;
	}
	const existing = org.metadata
		? (JSON.parse(org.metadata) as Record<string, unknown>)
		: {};
	const metaUpdate: Record<string, unknown> = { ...existing, plan };
	if (session.customer) {
		metaUpdate.stripeCustomerId = session.customer;
	}
	if (session.subscription) {
		metaUpdate.stripeSubscriptionId = session.subscription;
	}
	metaUpdate.subscriptionStatus = "active";
	await db
		.update(organization)
		.set({ metadata: JSON.stringify(metaUpdate) })
		.where(eq(organization.id, tenantId));
}

async function handleSubscriptionUpdated(sub: {
	id: string;
	status: string;
	cancel_at_period_end: boolean;
	cancel_at: number | null;
	current_period_end: number;
	metadata?: { tenantId?: string };
}) {
	const tenantId = sub.metadata?.tenantId;
	if (!tenantId) {
		return;
	}
	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, tenantId))
		.limit(1);
	if (!org) {
		return;
	}
	const existing = org.metadata
		? (JSON.parse(org.metadata) as Record<string, unknown>)
		: {};
	const subscriptionStatus = sub.cancel_at_period_end
		? "canceling"
		: sub.status;
	const cancelAt = sub.cancel_at
		? new Date(sub.cancel_at * 1000).toISOString()
		: null;
	const currentPeriodEnd = new Date(
		sub.current_period_end * 1000
	).toISOString();
	const metaUpdate: Record<string, unknown> = {
		...existing,
		subscriptionStatus,
		cancelAt,
		currentPeriodEnd,
	};
	if (subscriptionStatus === "active") {
		metaUpdate.scheduledPlan = undefined;
		metaUpdate.scheduledPlanAt = undefined;
	}
	await db
		.update(organization)
		.set({ metadata: JSON.stringify(metaUpdate) })
		.where(eq(organization.id, tenantId));
}

async function handleSubscriptionDeleted(sub: {
	id: string;
	metadata?: { tenantId?: string };
}) {
	const tenantId = sub.metadata?.tenantId;
	if (!tenantId) {
		return;
	}
	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, tenantId))
		.limit(1);
	if (!org) {
		return;
	}
	const existing = org.metadata
		? (JSON.parse(org.metadata) as Record<string, unknown>)
		: {};
	const metaUpdate: Record<string, unknown> = {
		...existing,
		plan: "trial",
		subscriptionStatus: "canceled",
		stripeSubscriptionId: undefined,
		cancelAt: undefined,
		currentPeriodEnd: undefined,
	};
	await db
		.update(organization)
		.set({ metadata: JSON.stringify(metaUpdate) })
		.where(eq(organization.id, tenantId));
}

app.post("/api/stripe/webhook", async (c) => {
	const sig = c.req.header("stripe-signature");
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!(sig && secret)) {
		return c.json({ error: "Webhook not configured" }, 400);
	}
	const rawBody = await c.req.text();
	let event: ReturnType<typeof verifyStripeWebhook>;
	try {
		event = verifyStripeWebhook(rawBody, sig, secret);
	} catch {
		return c.json({ error: "Invalid signature" }, 400);
	}
	try {
		if (event.type === "checkout.session.completed") {
			await handleCheckoutCompleted(
				event.data.object as {
					customer?: string | null;
					subscription?: string | null;
					metadata?: { tenantId?: string; plan?: string };
				}
			);
		} else if (event.type === "customer.subscription.updated") {
			await handleSubscriptionUpdated(
				event.data.object as unknown as {
					id: string;
					status: string;
					cancel_at_period_end: boolean;
					cancel_at: number | null;
					current_period_end: number;
					metadata?: { tenantId?: string };
				}
			);
		} else if (event.type === "customer.subscription.deleted") {
			await handleSubscriptionDeleted(
				event.data.object as {
					id: string;
					metadata?: { tenantId?: string };
				}
			);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: operational webhook logging in the server entrypoint
		console.error(`[stripe] failed to handle ${event.type}:`, err);
	}
	return c.json({ received: true });
});

app.use(evlog());
app.use("*", async (c, next) => {
	await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
	await next();
});

app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	})
);

// Rate limiting (first-line brute-force / abuse guard). Auth is the tightest
// (login brute-force); rpc is per-user and looser since a single page load fans
// out into many RPC calls. Both per-minute caps are env-overridable. Behind a
// trusted proxy these key on the real client IP and exempt internal SSR — see
// rate-limit.ts.
const AUTH_RATE_MAX = Number(process.env.AUTH_RATE_MAX ?? 60);
const RPC_RATE_MAX = Number(process.env.RPC_RATE_MAX ?? 600);
app.use("/api/auth/*", rateLimit({ max: AUTH_RATE_MAX, bucket: "auth" }));
app.use("/rpc/*", rateLimit({ max: RPC_RATE_MAX, bucket: "rpc" }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.get("/", (c) => c.text("OK"));

export default app;
