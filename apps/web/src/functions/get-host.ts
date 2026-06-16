import { createMiddleware, createServerFn } from "@tanstack/react-start";

// Exposes the request Host header to route loaders so the root route can send the
// app subdomain (app.heimdallone.com) straight to the application while the apex/
// www host keeps serving the marketing landing — mirroring v1's domain split.
const hostMiddleware = createMiddleware().server(({ next, request }) =>
	next({ context: { host: request.headers.get("host") ?? "" } })
);

export const getHost = createServerFn({ method: "GET" })
	.middleware([hostMiddleware])
	.handler(({ context }) => context.host);
