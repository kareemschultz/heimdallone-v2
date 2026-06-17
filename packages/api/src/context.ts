import { auth } from "@Heimdallone/auth";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
	context: HonoContext;
}

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	return {
		auth: null,
		session,
		// Raw request headers — needed by device-key-authenticated public routes
		// (e.g. the attendance v1-compat ingest reads `Authorization: Bearer …`).
		// Session/AC routes must NOT use this for authz.
		reqHeaders: context.req.raw.headers,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
