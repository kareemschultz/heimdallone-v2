# Phase 21U — Production Config Preflight

The production env + ingress that must be in place **before** the freeze/flip. The
side-by-side stack runs on localhost/test values; production needs the real ones.
**Placeholders only here — never commit real secrets** (they live in the host
`.env`/Infisical, gitignored `deploy/.env.v2`).

## Required production env (web + server)

| Var | Side-by-side value | Production value | Notes |
| --- | --- | --- | --- |
| `VITE_SERVER_URL` | `http://heimdallone-v2-server:3000` | `https://api.heimdallone.com` | **Required at runtime** (web SSR). Without it, authenticated `/app/*` SSR-500 (falls back to `http://localhost:3000` = the web container). `process.env`, so no rebuild — just set it. |
| `BETTER_AUTH_URL` | `http://localhost:3100` | `https://api.heimdallone.com` | Auth base; cookies/CORS depend on it. |
| `CORS_ORIGIN` | `http://localhost:3101` | `https://app.heimdallone.com` | Must match the public web origin. |
| `PLATFORM_ADMIN_USER_ID` | (unset) | `<Kareem migrated owner user id>` | Cross-tenant platform owner. |
| `GOOGLE_CLIENT_ID` | (unset) | `<real>` | From Infisical; never in repo. |
| `GOOGLE_CLIENT_SECRET` | (unset) | `<real>` | From Infisical; never in repo. |
| `DATABASE_URL` | `…@postgres-central:5432/heimdallone_v2_prod` | same | Always `heimdallone_v2_prod`, never `karetech_erp`. |

## Ingress / routing (Pangolin) — required at flip

- `app.heimdallone.com` → v2 **web** container.
- `api.heimdallone.com` → v2 **server** container.
- **`app.heimdallone.com/rpc` → v2 API.** Critical: the browser issues
  same-origin `/rpc` (it uses `window.location.origin/rpc`), so the web origin
  must route `/rpc` (and `/api/auth`) to the API, or in-browser data actions fail.
  (SSR uses `VITE_SERVER_URL` directly; the browser uses same-origin `/rpc`.)

## Google OAuth

- Add the **v2 redirect/callback URL** to the existing Google OAuth client before
  Google login QA (e.g. `https://api.heimdallone.com/api/auth/callback/google` —
  confirm the exact path against better-auth config).
- Until added, Google sign-in is intentionally untested; credential login is the
  fallback.

## Checklist before freeze
- [ ] `VITE_SERVER_URL=https://api.heimdallone.com` set on prod web
- [ ] `BETTER_AUTH_URL=https://api.heimdallone.com` set
- [ ] `CORS_ORIGIN=https://app.heimdallone.com` set
- [ ] `PLATFORM_ADMIN_USER_ID` set to Kareem's migrated owner id
- [ ] `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set (Infisical)
- [ ] Google v2 redirect URL added to the OAuth client
- [ ] Pangolin route plan ready: `app.` → web, `api.` → server, `app.../rpc` → API
- [ ] All values sourced from host/Infisical, none committed
