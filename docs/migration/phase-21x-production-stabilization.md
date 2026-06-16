# Phase 21X — Live v2 Production Stabilization (2026-06-16, overnight)

Post-cutover hardening of `app.heimdallone.com` (already live on v2) during an
announced overnight maintenance window. All changes committed, built from the
exact SHA, deployed with coherent image tags, and smoke-verified. **No v1
writes, no `karetech_erp` writes, no write-ETL, no biometric device registration,
no Gist change, no secrets committed.** v1 containers left running for rollback.

## Deploys (coherent web+server+docs tags)

| # | SHA | Tag | What shipped |
|---|-----|-----|--------------|
| pre | (working-tree hotfix) | `sha-f610eb7c*` | Google auth + cross-subdomain cookie + SW kill-switch (later committed) |
| 1 | `ccb1ee9` | `sha-ccb1ee9` | Tenant switch, real counts, nav cleanup, mobile drawer, first-login + login polish, payroll `isPublished` fix |
| 2 | `2e65485` | `sha-2e65485` | Truthful role-aware `/app` dashboard (replaced 1031-line mockup) |

Current live tag: **`sha-2e65485`** on web, server, docs.

## Issues fixed

1. **Google login → "Loading workspace" hang.** Root cause = stale v1 PWA
   service worker + web↔server generation skew calling deleted
   `organization.getSetupStatus`. Fixed via kill-switch `sw.js` +
   `registerSW.js` no-op, and rebuilding web+server from one commit. See
   lessons-learned #97.
2. **Cross-subdomain auth.** `COOKIE_DOMAIN=.heimdallone.com` →
   `crossSubDomainCookies`; absolute OAuth `callbackURL` to the app origin;
   `BETTER_AUTH_URL=api.` reuses v1's already-registered Google callback (no
   Google console change).
3. **Tenant switch only showed one org.** Membership data was correct (owner is
   `tenant_owner` of BOTH Foreign Links + Netsurf — proven by SQL). The switcher
   was a static mockup. Rewired to `authClient.useListOrganizations()` +
   `organization.setActive()`. **No DB repair needed.**
4. **Fake/demo data removed from production UI:** sidebar `1,284`/`12`/`●`
   metas, topbar "Demo sync status / Horilla" badge, the entire mock `/app`
   dashboard. Replaced dashboard with real, role-aware module cards + real
   unread-notification count.
5. **Production navigation cleaned:** preview/scaffold modules (Countries & Tax,
   Compliance, Documents, Clients) gated to admins only, like Migration status.
6. **Mobile UX:** off-canvas sidebar drawer + backdrop + toggle; no global
   horizontal overflow; topbar fits; first-login modal width/max-height/scroll;
   login page rebuilt (truthful copy, primary Google button, real errors,
   removed non-working SSO/Passkey + dead links, mobile-friendly).
7. **Payroll active-profile bug:** pages filtered `isActive` (renamed
   `isPublished` in 21G) → setup detection broken. Fixed on
   settings/run/index.

## Verification (per deploy)

- Gates: `check-types` 3/3, `build` 3/3, web `typecheck` 0 errors, changed files
  lint-clean (public assets excluded in `biome.json`).
- Smoke: `app/` 200, `/login` 200, `/app` 307→/login, `api/health` 200.
- Logs: clean server boot, **0 `getSetupStatus` 404s** after web redeploy, no
  500s/errors (only the on-site Pi heartbeat 404 — see below).
- Bundle: grepped the running container `.output` — no stale
  `getSetupStatus`/"Loading workspace"/fake dashboard strings in app chunks
  (remaining `1,284` only in the admin-gated `compliance` preview).

## Biometric / attendance device (NOT changed — needs operator)

- The on-site Pi posts to the **v1** path `/rpc/attendance/devices/heartbeat`
  → 404 on v2 (harmless noise; nothing breaks, attendance just doesn't ingest).
- v2's real ingest endpoint EXISTS: **`/rpc/biometric/ingest/submit`**
  (`publicProcedure`, authenticated by device id + ingest API key).
- **To complete (operator, Phase 21V):** register the device in v2
  (`biometric.devices.create` mode `api_ingest`, model `ZLM60_TFT`, serial
  `PCY7012600500`, correct org — likely Netsurf per 21O mapping) → capture the
  one-time `ingestApiKey` → update the Pi's Gist script to POST to the v2 path
  with that key. Do NOT replace the Gist until the v2 device + key are verified;
  keep the v1 script as rollback. Not done tonight because the Pi (10.241.1.109)
  is on-site and not reachable from this host, and registration needs the org/
  employee-map decision.

## Rollback

- v1 containers (`heimdallone-web`/`-server`/`-nginx`, `sha-d03e5b4`) are still
  running. To roll back: repoint the Pangolin Traefik `heimdallone-*-service`
  back to `heimdallone-nginx-service` (config at
  `/opt/docker/_network/pangolin/config/traefik/dynamic_config.yml`).
- To roll back a v2 deploy only: set `deploy/.env.v2` `TAG=` to the prior tag and
  `docker compose -f deploy/docker-compose.v2.yml --env-file deploy/.env.v2 up -d
  --no-deps --force-recreate web server`.

## Remaining (follow-ups, not blocking morning use)

- **Marketing/public landing** (`apps/web/src/routes/index.tsx`): still a
  1500-line design mockup (fake "1,284"/"Atlas Shipping", potential mobile
  overflow). Candidate for a Magic UI Pro / shadcn-studio rebuild (tokens in
  project `.env` / Infisical). Lower priority than the app itself.
- **Compliance preview** still shows sample data (admin-gated, labeled Preview).
- **Biometric Pi re-point** (operator, above).
- **Fumadocs user-facing module docs** — expand per the standing Documentation
  Rule.
- Broader mobile QA across every module page + helper tips/empty-state polish is
  an ongoing pass, not a single change.
