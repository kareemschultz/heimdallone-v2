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

## Pass 2 — authenticated mobile/desktop QA (2026-06-16, same window)

Logged into the **live** app as an owner-authorized QA superuser
(`scripts/create-qa-user.ts`; platform admin + tenant_owner of both orgs;
password gitignored in `.qa-cred`, never printed; remove with
`REMOVE=1 … create-qa-user.ts`) and inspected the authenticated UI with
Playwright at 390px and 1440px. Evidence + full findings table in
`docs/reviews/phase-21x-mobile-qa/`.

Verified the mobile shell/drawer are actually correct; the real pain was
per-page overflow + a fake tenant name. Fixed:

1. **Fake "Atlas Shipping" tenant name** on Employees list + detail →
   `{org.orgName}` from `OrgCtx`.
2. **Shared mobile CSS** in `styles/heimdall.css` (one block, every module page):
   header action rows wrap; `.segmented` / `.tabs` / `*-tabs` strips scroll
   horizontally instead of clipping; `.toolbar` stacks; `.page` padding tightened.
3. **Settings card headers** — 5 inline-flex `space-between` headers → reusable
   `.card-head-row` class that stacks on mobile (inline styles can't be made
   responsive by CSS).
4. **web-tsc cleanup** — exported `NavItem` from `route.tsx`, typed the
   dashboard `NAV.flatMap` (cleared the `item is unknown` errors).

Deferred (documented): marketing `/` mobile rebuild (P2); Compliance preview
demo name (admin-gated); per-employee fake activity timeline.

## Pass 3 — production rate-limiter fix + payroll delta load (2026-06-16)

### Rate limiter (was throttling the whole app)

The `/rpc/*` limiter was 300/min and, behind Pangolin/Traefik without
`TRUST_PROXY`, **all** users + SSR shared one bucket (the proxy IP) → "Too Many
Requests" 500s under light load (hit while QA-browsing settings). Fixed
(`apps/server/src/rate-limit.ts`, `index.ts`, compose):
- Behind a trusted proxy, key on the **real client IP** (left-most XFF) → per-user.
- When XFF is absent, exempt ONLY a verified internal TCP peer
  (loopback/RFC1918/RFC4193 via `getConnInfo`) — NOT on the missing header alone
  (that fail-open was caught by automated security review and corrected); other
  no-XFF callers are limited by peer IP.
- `AUTH_RATE_MAX` (60) / `RPC_RATE_MAX` (600) env-overridable; rpc raised 300→600.
- `TRUST_PROXY=true` set in `deploy/.env.v2` + passed through compose.

### Production data audit (`scripts/prod-data-audit.ts`, read-only)

| Data | Foreign Links | Netsurf |
|------|---------------|---------|
| employees / contracts | 3 / 3 | 20 / 15 |
| shifts / roster / shift_rules | 0/0/0 | 6/175/6 |
| **departments** | 0 | 0 |
| **country_payroll_profile / payroll_setting** | 0→**1** / 0→**1** | 0→**1** / 0→**1** |
| **payroll_run / payslip** | 0 | 0 |

The original prod load (21R) brought people/contracts/roster but never loaded the
payroll country profile, payroll settings, departments, or historical payslips.

### Delta load shipped (`scripts/migration/complete-prod-delta.ts`)

Owner approved "full delta load now". Prod backed up first
(`backups/heimdallone_v2_prod-*.sql.gz`, via `pg_dump` in `postgres-central`).
Guarded by the reviewed prod-write opt-in
(`CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod`, refuses
v1). Created, idempotently, for BOTH tenants:
- **GRA Guyana 2026 country payroll profile** (effective-dated, published; PAYE
  25/35 bands, NIS 5.6/8.4, personal allowance $140k/mo, child $10k — GRA values,
  mirrors `seed-payroll.ts`).
- **Payroll settings** (fortnightly default — both tenants run fortnightly; GY
  workweek + OT multipliers).

**Verified:** payroll page now shows "Guyana 2026 · Active · PAYE + NIS
configured", readiness 75%, Country-profile + Payroll-settings + Contracts ✅ in
the setup checklist. Evidence: `docs/reviews/phase-21x-mobile-qa/verify-payroll-desktop.png`.

### BLOCKED — historical payslips (must NOT be pushed blind)

69 v1 payslips are staged as JSONB in `migration_source_payslip`, but **cannot be
safely materialized into the live `payslip` table yet**:
- v2 `employee_profile` has **no v1 source-id** (migrated employees got fresh
  cuid2 IDs with no stored link to v1 `HR-EMP-xxxxx`).
- The only candidate join key is **email — matches just 17 of 23 employees**
  (the 6 no-login employees have no email); `badge_id` is null.
- `payslip` is a NOT-NULL financial record requiring `payroll_run_id` +
  `contract_id` + per-employee attribution.

Materializing on a partial key would **misattribute financial records**. The
reconciliation (`migration:reconcile`) already proved the numbers are correct in
aggregate, but per-row materialization needs a **verified 1:1 employee mapping
first**. Recommended next step: add/restore a v1 source-id on the migrated
employees (or build a verified mapping table from `migration_source_employee`),
then a reconciled materialization run that aborts on any unmapped row or
net-pay-sum mismatch. NOT done overnight — financial-record safety over speed.

### Also deferred
- **Departments** — v1 dept *names* aren't staged (only ids); needs a v1
  read-only pull or manual setup. Not blocking payroll.
