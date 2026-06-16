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

### Historical payslips — MATERIALIZED (owner chose "full delta")

`scripts/migration/materialize-payslips.ts` (prod backed up first; same
prod-write opt-in). Loaded the **46 non-reversal** staged payslips (the 23
reversals are v1's UTC-bug artifacts — excluded per "capture intent, not bugs").

Mapping was the blocker — `employee_profile` has no v1 source-id. Resolved by a
verified join: **email (14) + name-within-org for the no-login employees (4) =
all 18 employees mapped, 0 unmapped** (script hard-aborts if any employee is
unmapped or contract-less, and rolls back the whole transaction). Period dates
pulled read-only from v1 `payroll_periods`. Synthesized the
`pay_period → payroll_run → payslip` chain.

**Reconciliation guard (per payslip, in-transaction):** `gross − (PAYE + NIS_emp
+ medical + other) == net` must hold to the cent or the transaction rolls back —
no partial financials. All 46 passed; total net **1,409,833.96 GYD**.

**Result (verified in UI):**
- Netsurf: 3 runs / 43 payslips — April 2026 (15 emp, 416,668.02), May Fortnightly
  1 (15, 620,530.04), May Fortnightly 2 (13, 372,635.90); readiness 75%→**88%
  "Ready to run payroll"**; payslips render with real employees + GYD amounts.
- Foreign Links: 1 run / 3 payslips ("May 22" — net 0.00, faithful: that v1
  period was incomplete/processing).
- Evidence: `verify-netsurf-payroll.png`, `verify-netsurf-payslips.png`.

Idempotent (skips a period whose run already exists). Provenance preserved in
each payslip's `explanation` jsonb (`migratedFromV1`, v1 id, snapshot).

### Also deferred
- **Departments** — v1 dept *names* aren't staged (only ids); needs a v1
  read-only pull or manual setup. Not blocking payroll.

## Pass 4 — biometric/time-clock discoverability + registration UI (2026-06-16)

The biometrics module (devices/sync-runs/exceptions/punches) existed but was
**not in the nav** and the devices page had **no registration flow** — so "where
do I register a time clock?" had no answer. Fixed (web-only, `sha-3753f5d`):
- `route.tsx`: new **"Time clocks"** nav entry (Operate group, gated
  `canViewBiometrics` = HR/admin/manager/auditor/payroll).
- `biometrics/devices`: **"Register device"** panel (gated `canManageBiometrics`)
  wired to `biometric.devices.create` — name/vendor/model/serial/mode; on
  `api_ingest` it surfaces the **one-time ingest key + the v2 ingest endpoint +
  on-site poller (Pi) setup note**, with copy buttons. Breadcrumb de-hardcoded.
- Verified in UI (Netsurf): nav entry present, form renders with ZKTeco/ZLM60_TFT
  hints; an existing ZKTeco terminal already shows. Evidence:
  `verify-device-register.png`.

Operator step (unchanged, needs the physical device + Pi): register the real
ZLM60_TFT (serial PCY7012600500), capture its ingest key, re-point the Pi's
script to the v2 endpoint — keep the v1 Gist as rollback until verified.

## Pass 5 — payroll-correctness verification + payslip line backfill + QA audit (2026-06-16)

### Payroll correctness (owner ask: "previous payrolls with correct formulas, hourly rates")

- `migration:reconcile` re-run vs **GRA + v1**: readiness READY; statutory parity
  for all 46 — NIS employee 46/46, NIS employer 46/46, personal allowance 46/46,
  child allowance 46/46, PAYE 45 exact + 1 sub-cent rounding, **net identity
  46/46**. 23 v1-bug reversals excluded.
- **Payslip line backfill** (`scripts/migration/backfill-payslip-lines.ts`): the
  detail view reads `payslip_line_item`; materialization wrote only totals, so
  backfilled **189 line items across 46 payslips** from the reconciled v1
  components, per-payslip-guarded (earnings==gross; PAYE+NIS+medical+other==
  gross−net). Prod backed up first; idempotent.
- **UI-verified** payslip detail (Netsurf, HR-EMP-00011, **wage type hourly,
  contract rate $644**): Earnings Basic $12,000 + OT $750 + Public-holiday $7,100
  + Transport $9,000 + Other $1,012.50 = **Gross $29,862.50**; NIS employee 5.6%
  = $1,672.30; NIS employer 8.4% = $2,508.45 (transparency, not deducted); **Net
  $28,190.20**. Hourly staff + pay rates render correctly.
- The payslip-detail `getOwnById` 404 in the console is the **expected
  self-service fallback** (admin isn't the payslip's owner → NOT_FOUND → renders
  via admin `getById`); works for the employee themselves. Not a defect.

### Hermes/Codex QA audit reconciliation (`qa-output/…/updated-comprehensive-qa-audit.md`)

| Audit finding | Status now |
|---------------|-----------|
| Rate-limit 429s during traversal | **FIXED** — per-user limiter + internal exemption (the audit's fast single-IP crawl tripped the old shared bucket) |
| 5 routes "Something went wrong" (payroll/loans, payroll/reports, contracts, assets, assets/requests) | **RESOLVED** — all load on single navigation; they were rate-limit artifacts of the crawl |
| Payroll history "not materialized" | **DONE** — 46 payslips materialized + line breakdown, reconciled |
| Compliance fake data (Atlas Shipping/Maya Persaud/Lia Roberts) | Admin-gated **Preview** scaffold on labeled sample data; not shown to normal users (deferred de-fake) |
| Departments / job positions empty | Deferred — v1 names not staged; needs a v1 pull or manual setup |
| Unlabeled inputs / icon-only buttons (a11y) | Partial — new device form + copy buttons are labelled; broader a11y label sweep remains |
| Full CTA/button-by-button testing | Ongoing — key flows verified, exhaustive sweep remains |

## Pass 6 — engine allowances, departments, fake-data, a11y, mobile, Pi prep (2026-06-16)

Live tag progression this pass: …→ `sha-8429683` (web/server/docs coherent).

### Hermes/Codex QA audit — item-by-item
| # | Finding | Status |
|---|---------|--------|
| 1 | Rate-limit 429s during traversal | **Fixed** (Pass 3: per-user limiter + internal exemption; security-hardened) |
| 2 | 5 routes "Something went wrong" (payroll/loans, payroll/reports, contracts, assets, assets/requests) | **Not reproducible** — all render OK on single navigation at 390px + desktop; were rate-limit artifacts of the fast crawl |
| 3 | Compliance fake data (Atlas Shipping / Maya Persaud / Lia Roberts / 1,284) | **Fixed** — compliance.tsx replaced with honest admin-only Preview; form placeholders genericized. (Remaining: employees/$id.tsx sample activity/document tabs — documented follow-up, placeholders for unbuilt features.) |
| 4 | Departments + job positions empty | **Fixed** — `migrate-departments.ts`: 3 depts + 14 positions, 15 contracts linked (Netsurf; Foreign Links had none in v1) |
| 5 | Unlabeled inputs/selects | **No empty aria-label/placeholder app-wide**; new forms use `<label>` wrapping |
| 6 | Employees icon-only buttons | **Fixed** — aria-labels on close + more-actions; broader app-wide a11y sweep ongoing |
| 7 | Full CTA/button testing | Key flows verified across the session; exhaustive per-button sweep ongoing |
| 8 | Mobile responsiveness/scrolling | **Verified** — 14 key routes at 390px: 0 crashes, 0 horizontal overflow |

### New builds this pass
- **Recurring allowances** now apply to future runs (engine already consumes pay-item `overrideAmount` taxable; test-locked, engine 60/60, reconcile 46/46).
- **Departments/positions** migrated + linked to contracts.
- **Pi cutover prep** documented (`phase-21x-pi-cutover-prep.md`) — v2 script drops the v1 heartbeat so no compat route needed; 2 operator steps remain.

### Gates (this pass)
check-types 3/3 · build 3/3 · engine 60/60 · migration:reconcile READY 46/46 ·
web tsc 0 non-nitro · changed files lint-clean · server logs clean (no 500/getSetupStatus).

## Pass 7 — engine allowance proof, Setup Center, employee fake-data, full mobile QA (2026-06-16)

- **Recurring allowances confirmed applied to future runs** — read-only proof
  (`scripts/migration/verify-allowance-applied.ts`): real employee, Transport
  $7,000 → taxable into gross, NIS computed, PAYE $0 (below threshold). Engine
  60/60; reconcile READY 46/46. (P1 closed — engine already consumed pay items.)
- **Setup Center** — new `/app/setup` hub + "Setup center" nav (Govern), role-aware
  cards to org settings / payroll settings / Countries & Tax / pay items / time
  clocks / geofencing / leave policies / migration status. (P9.)
- **Employee detail fake data removed** — Overview activity, Activity tab, and
  Documents tab sample blocks (Maya Persaud / Lia Roberts / fake salary/promotion)
  replaced with honest empty states; "Documents · 4" count dropped. No fake
  person/data remains in any /app route (only apex marketing page).
- **Mobile QA complete** — 390 / 430 / 768 / desktop across all key routes: 0
  crashes, 0 horizontal overflow.
- **a11y** — aria-labels on icon-only employee buttons.
- **Pi cutover** — `phase-21x-pi-cutover-prep.md`; v2 script drops heartbeat (no
  compat route needed); 2 operator steps remain.

Live tag end of pass: `sha-c11e45f`. Gates: check-types 3/3 · build 3/3 ·
engine 60/60 · reconcile 46/46 · web tsc 0 non-nitro · server logs clean.

## Pass 8 — real operational dashboard + fake-data sign-off (2026-06-16)

- **Dashboard is now operational, not a launcher** (`app/index.tsx`): leads with
  real role-gated StatTiles — Active employees (live `employees.list` total),
  Pending leave (live, awaiting approval), Unread notifications, and a Setup
  quick-action — then module quick-access below. UI-verified: Foreign Links shows
  "Active employees 3". `verify-dashboard.png`.
- **Fake-data sign-off**: `grep` for Atlas Shipping / Maya Persaud / Lia Roberts /
  Sasha B / Shanice Powell / 1,284 / 14,820 / 5,612 / 3,604 across
  `apps/web/src/routes/app` + `packages` → **0 hits**. Compliance verified honest
  Preview (`verify-compliance.png`). Only the apex marketing page retains mockup
  copy (separate rebuild; the app subdomain redirects away from it).
- Mobile re-verified incl. `/app/compliance`; all viewports clean.

Live tag end of pass: `sha-72ca623`.
