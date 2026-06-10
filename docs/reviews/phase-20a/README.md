# Phase 20A — Production Readiness + Repo Status Reconciliation

Reconciliation + hardening pass triggered by an external (ChatGPT) static
GitHub audit. No new product modules. Small safe code/docs fixes only.

## Context: the external audit predated two of this repo's commits
The external audit was a static snapshot taken **before** `cdbb7f9` (repo-wide
audit) and `17661e6` (hr-core security fix). So two of its findings were
already addressed:
- "implementation-sequence still says Phase 18 ACTIVE" → already corrected in
  `cdbb7f9`.
- "Phase 19 didn't re-run per-router security" → the `cdbb7f9` repo-wide audit
  ran a 5-agent cross-cutting RBAC/redaction/cross-module security review and
  **found + fixed 2 HIGH bugs** (`17661e6`). That cross-cutting review is done.

The remaining findings were genuinely valid and are addressed here.

## Repo state
- **HEAD:** `17661e6` → (this commit advances it); HEAD == origin/master, tree clean (proven in the commit step).
- Gates: check-types **3/3**, build **2/2**, audit **149/18**, lint **201** (≤212 baseline), web tsc **7** (baseline).
- `verify:core` (new) **82 ✓ / 0 ✗** = audit + performance-db 25 + crm-db 30 + finance-db 26.

## Findings addressed (code + docs)
| # | Finding | Action |
|---|---|---|
| F6 | `implementation-sequence.md` still said "Future modules — DO NOT implement yet: CRM, Finance, Projects" (stale; 14/16/17 live) | Rewritten as a HISTORICAL note ("now LIVE; no module queued/hidden") |
| F5 | `/app/clients` said "Coming Soon … a future phase" (ambiguous now CRM is live) | Relabelled **Client Portal** (planned external portal, distinct from CRM) + a link to the live `/app/crm/customers`; still PreviewBanner-marked |
| F7 | nav `isNavItemVisible` fail-open default `return true` (route.tsx:377) | Changed to **`return false`** (deny-by-default for unknown/future roles). Browser-verified no regression: admin 18-item see-all (via `canViewPayroll`), employee 8-item scoped (excludes Analytics/Finance/Clients) |
| F3 | CI runs no module verify scripts | Added `verify:db` + `verify:core` npm scripts (audit + DB verifies; server-independent, CI-friendly). CI workflow change recommended below (not applied — needs a postgres service container, an infra change to be tested in CI itself) |
| F1, F8 | implementation-sequence stale / no cross-cutting security | Already done in `cdbb7f9`/`17661e6` (see Context) |

## Production readiness checklist (honest status)
| Area | Status | Evidence / Note |
|---|---|---|
| Blocking CI gates | ✅ | check-types + build + audit:permissions block (`.github/workflows/ci.yml`) |
| Env validation | ✅ | `packages/env` (zod) validates server/web env at boot; `.env.example` documents all vars |
| CORS | ✅ | `hono/cors` with `env.CORS_ORIGIN` (apps/server/src/index.ts:38) |
| Session / cookie hardening | ✅ | Better Auth: `secure: NODE_ENV==='production'`, `sameSite: 'none'` in prod (packages/auth/src/index.ts:33-34) + `trustedOrigins` |
| Structured logging | ✅ | `evlog` logger initialised (apps/server/src/index.ts:10/19) |
| Auth secret / DB URL | ✅ | required env (`BETTER_AUTH_SECRET`, `DATABASE_URL`); not committed (`.env` gitignored) |
| Module verify orchestrator | ✅ (new) | `bun run verify:core` (audit + DB verifies); API verifies still need a live server + copy-trick |
| **Rate limiting** | ⬜ TODO | no rate-limit middleware found on the Hono server — add before public exposure |
| **Backup / restore** | ⬜ TODO (ops) | no in-repo policy; Postgres backup/restore is an ops concern to document |
| **Migration rollback** | ⬜ partial | Drizzle migrations are **forward-only** (21 applied, no down-migrations); rollback = restore-from-backup. Document the policy |
| **Observability / metrics** | ⬜ TODO | logging exists; no metrics/tracing/error-reporting (Sentry/OTLP) wired |
| **Test-user password in verify scripts** | ⚠️ dev-only | `HeimdallTest2026!` is hardcoded in 12 `scripts/verify-*`/`seed-*` files. These run only against a locally-seeded dev DB. Seeds are **not prod-gated** — recommend a `NODE_ENV==='production'` refuse-guard at the top of seed scripts and moving the test password to `.env.test`/`TEST_PASSWORD` before any shared/staging deploy |
| Tenant bootstrap / admin setup | ⬜ TODO | first-org + first-admin provisioning flow is seed-driven (dev); production needs a real bootstrap/invite path |
| Production build smoke | ✅ | `bun run build` 2/2; full-route smoke covered incrementally across phase reviews |

## CI recommendation (proposed, not applied)
Add a separate **DB-backed job** (postgres service container) that runs
migrations → seeds → `bun run verify:core`, on a nightly schedule or manual
dispatch. Keep it off the blocking PR path (heavy + DB-dependent). Optionally
add API-verify jobs that boot the server. Flipping lint + web typecheck to
blocking should wait until the baselines (lint 201, web tsc 7) are burned to 0.

## Top remaining blockers before "production-done"
1. **Rate limiting** on the public API (none today).
2. **Seed prod-guard** + move test password out of source (dev-only today).
3. **Backup/restore + migration-rollback policy** (ops docs).
4. **Observability** (error reporting / metrics) beyond request logging.
5. **Tenant bootstrap** path for real first-admin provisioning.
6. CI: DB-backed verify job; burn lint 201→0 + web tsc 7→0 then make blocking.

None are code-correctness bugs; they are operational/hardening items. The
application code, RBAC, redaction, and cross-module guardrails are verified
clean (see `repo-wide-audit-2026-06-10`).

## Verdict
**Phase 20A complete. Safe to proceed.** Status docs reconciled, stale copy
fixed, nav hardened (deny-by-default), verify:core added. The roadmap (Phases
5–20) is functionally complete and re-verified. **A Phase 20B** could pick up
the operational hardening checklist above (rate limiting, seed/secret hygiene,
backup/rollback policy, observability, tenant bootstrap, CI DB-job) — these are
deploy-readiness items, not feature work, and can begin whenever you choose.
