# oRPC Reference

> Sourced from https://orpc.dev/docs (2026-05-26)

## Server Setup (with Hono)

```ts
import { RPCHandler } from "@orpc/server/fetch";
import { onError } from "@orpc/server";

const handler = new RPCHandler(router, {
  interceptors: [onError((error) => console.error(error))],
});

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {},
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});
```

## Procedures and Routers

```ts
import { os, ORPCError } from "@orpc/server";
import * as z from "zod";

const publicProcedure = os.$context<Context>();
const protectedProcedure = publicProcedure.use(requireAuth);

const listEmployees = protectedProcedure
  .input(z.object({ limit: z.number().optional() }))
  .handler(async ({ input, context }) => { /* ... */ });

const router = { employees: { list: listEmployees } };
```

## Middleware

```ts
const requireAuth = os
  .$context<{ headers: Headers }>()
  .middleware(async ({ context, next }) => {
    const session = await auth.api.getSession({ headers: context.headers });
    if (!session) throw new ORPCError("UNAUTHORIZED");
    return next({ context: { user: session.user, session: session.session } });
  });
```

Context passed to `next()` merges with existing context. Middleware chains via `.use()`.

## Client Setup

```ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
  url: "http://localhost:3000",
  headers: { Authorization: "Bearer token" },
});

export const orpc: RouterClient<typeof router> = createORPCClient(link);
```

## Lifecycle Hooks

```ts
import { onStart, onSuccess, onError, onFinish } from "@orpc/server";

const procedure = os
  .use(onStart(() => {}))
  .use(onError(() => {}))
  .handler(async () => {});
```
