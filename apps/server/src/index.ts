import { createContext } from "@Heimdallone/api/context";
import { appRouter } from "@Heimdallone/api/routers/index";
import { auth } from "@Heimdallone/auth";
import { env } from "@Heimdallone/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
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
