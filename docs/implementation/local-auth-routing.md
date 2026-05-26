# Local Auth Routing (Phase 4C.1)

## Problem

TanStack Start + Hono + Better Auth run on separate ports in local dev:
- Web app (Vite/TanStack Start): port 3001+ (often 3003 when 3001 is in use)
- API server (Hono): port 3000

Better Auth cookies set by port 3000 are not sent by the browser to port 3003.
`SameSite=None` without `Secure` is silently rejected by modern browsers.
`SameSite=None; Secure` requires HTTPS which isn't available on localhost dev.

This broke the SSR `beforeLoad` auth check in TanStack Start — the server function
couldn't read the session cookie, causing infinite redirect loops from `/app` → `/login`.

## Root Cause

1. **Cross-origin cookies between localhost ports** — cookies set by `localhost:3000` are not automatically sent to `localhost:3003`
2. **`SameSite=None` without `Secure`** — modern browsers (Chrome 80+) silently reject this combination
3. **SSR auth check** — TanStack Start's `beforeLoad` runs server-side and forwards browser request headers to Better Auth. If the cookie isn't in the browser's request, SSR can't authenticate.

## Fix: Vite Dev Proxy

### How it works

```
Browser (localhost:3003)
  │
  ├─ /api/*  ──Vite proxy──→ localhost:3000 (Hono)
  ├─ /rpc/*  ──Vite proxy──→ localhost:3000 (Hono)
  └─ /*      ──Vite SSR──→ TanStack Start (same process)
```

All auth and RPC requests go through the Vite proxy as same-origin requests.
Cookies are set with `SameSite=Lax` (no `Secure` needed) and are sent on every same-origin request.

### Configuration

**`apps/web/vite.config.ts`** — Vite proxy:
```ts
server: {
  port: 3001,
  proxy: {
    "/api": { target: "http://localhost:3000", changeOrigin: true },
    "/rpc": { target: "http://localhost:3000", changeOrigin: true },
  },
},
```

**`apps/web/src/lib/auth-client.ts`** — SSR/client URL split:
```ts
baseURL: typeof window === "undefined"
  ? (process.env.VITE_SERVER_URL || "http://localhost:3000")
  : "",
```
- **Browser:** empty baseURL → relative paths `/api/auth/*` → Vite proxy
- **SSR:** absolute URL → direct to Hono (for server functions that call Better Auth)

**`apps/web/src/utils/orpc.ts`** — same pattern:
```ts
url: typeof window === "undefined"
  ? `${process.env.VITE_SERVER_URL || "http://localhost:3000"}/rpc`
  : "/rpc",
```

**`packages/auth/src/index.ts`** — cookie config:
```ts
sameSite: env.NODE_ENV === "production" ? "none" : "lax",
secure: env.NODE_ENV === "production",
```
- **Dev:** `SameSite=Lax` (same-origin, no Secure needed)
- **Prod:** `SameSite=None; Secure` (cross-origin with HTTPS)

**`apps/web/src/routes/login.tsx`** — direct fetch for sign-in:
```ts
const res = await fetch("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
  credentials: "include",
});
if (res.ok) window.location.href = "/app";
```
Uses direct `fetch` instead of `authClient.signIn.email` to ensure same-origin cookie handling. Full page navigation via `window.location.href` triggers SSR with the cookie.

### Environment

**`apps/web/.env`:**
```
VITE_SERVER_URL=http://localhost:3000
```
Used only by SSR server functions. Browser-side code uses relative URLs via proxy.

**`apps/server/.env`:**
```
CORS_ORIGIN=http://localhost:3003
```
Must match the actual web app port (Vite may pick 3003 if 3001 is in use).

## Verified Behavior

| Action | Result |
|--------|--------|
| Sign in via `/login` form | Redirects to `/app` |
| Refresh `/app` | Session persists, stays on `/app` |
| Sign in as employee | Reduced sidebar (role-aware) |
| Sign in as owner | Full sidebar |
| `/api/auth/ok` via proxy | Returns `{"ok":true}` |
| Session cookie | `SameSite=Lax; HttpOnly; Path=/` |

## Production Notes

In production, the web app and API share a domain (e.g., `app.heimdallone.com` / `api.heimdallone.com`). CORS + `SameSite=None; Secure` over HTTPS handles cross-origin cookies correctly. The Vite proxy is dev-only.
