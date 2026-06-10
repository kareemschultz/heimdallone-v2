# Production Operations & Hardening (Phase 20B)

Operational runbook for deploying Heimdallone to production. Companion to
`docs/production-readiness.md` (assessment) — this is the how-to + policy.

## 1. Secrets & test credentials
- All runtime secrets come from env (`packages/env` validates at boot):
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`,
  web `VITE_SERVER_URL`. `.env` is gitignored; `.env.example` documents all.
- **Seed/verify test password**: `TEST_PASSWORD` (defaults to a dev value in
  `.env.example`). Set a unique value in any shared environment.
- **Seeds refuse production**: every `scripts/seed-*.ts` calls
  `assertSeedAllowed()` — it `process.exit(1)`s when `NODE_ENV=production`
  unless `ALLOW_DESTRUCTIVE_SEED=1`. This prevents creating known-credential
  admin users or overwriting data on a prod DB.
- Generate `BETTER_AUTH_SECRET` with `openssl rand -hex 32`. Never reuse the dev
  value.

## 2. Rate limiting
- First-line per-IP limiter on the Hono server (`apps/server/src/rate-limit.ts`):
  30/min on `/api/auth/*` (login brute-force), 300/min on `/rpc/*`. Returns 429
  + `Retry-After`.
- **`TRUST_PROXY`**: set to `true` ONLY when the API runs behind a trusted
  reverse proxy / load balancer (then `X-Forwarded-For` is trusted). Otherwise
  it uses the real TCP peer (XFF is attacker-controlled). **If you deploy behind
  an LB and forget this, all traffic shares one bucket (the LB IP).**
- **Limitation**: state is in-memory / per-instance. For multi-instance or
  serverless, replace the `Map` store with Redis/Upstash (`EXPIRE`-based) so the
  quota is shared. The limiter is a guard, not a distributed quota.

## 3. Database — backup, restore, rollback
- **Backup**: schedule `pg_dump` (logical) at least daily + before each deploy,
  retained off-host. Example: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`.
  For point-in-time recovery, enable WAL archiving / use the managed provider's
  PITR.
- **Restore**: `pg_restore --clean --if-exists -d "$DATABASE_URL" backup.dump`.
  Rehearse restore into a scratch DB regularly — an untested backup is not a backup.
- **Migrations are forward-only** (Drizzle, `packages/db/src/migrations`, 21
  applied). There are **no down-migrations**. Rollback policy:
  1. Prefer roll-*forward* (a new corrective migration).
  2. For a bad deploy, restore the pre-deploy backup (take one immediately
     before applying migrations).
  3. Always inspect generated SQL (`bun run db:generate`) before `db:migrate`
     in prod; apply additive changes; avoid destructive column drops without a
     two-step expand/contract.

## 4. Observability
- **Structured logging**: the server uses `evlog` (`apps/server/src/index.ts`)
  with per-request context + auth identity (email masked). Ship these to a log
  sink (the evlog drains: Axiom/OTLP/Datadog/Better Stack — see
  `review-logging-patterns`).
- **Errors**: oRPC `onError` interceptors log handler errors (currently
  `console.error`). **TODO**: wire an error-reporting service (Sentry/OTLP) for
  alerting + stack aggregation, and emit request metrics (latency, status
  codes, 429 rate) to a metrics backend.
- **Health**: `GET /` returns `OK` (liveness). **TODO**: add a `/health`
  readiness probe that checks DB connectivity.

## 5. Sessions / cookies / CORS
- Better Auth cookies are `secure` + `sameSite: 'none'` in production,
  `sameSite: 'lax'` in dev (`packages/auth/src/index.ts`). `trustedOrigins`
  includes `CORS_ORIGIN`.
- CORS is restricted to `env.CORS_ORIGIN` with credentials
  (`apps/server/src/index.ts`). Set this to the real web origin in prod.

## 6. Tenant bootstrap / first admin
- Today the first org + admin are created by `scripts/seed-dev.ts` (dev only,
  now prod-guarded). **TODO for production**: a real bootstrap path — either a
  one-shot `scripts/bootstrap-tenant.ts` (env-driven org name + admin email,
  sends an invite / sets a forced-reset password) or an onboarding signup flow.
  Do NOT seed demo users into prod.

## 7. CI / verification
- **Blocking PR gates** (`.github/workflows/ci.yml`): `check-types`, `build`,
  `audit:permissions`. Lint + web typecheck are `continue-on-error`
  (informational baselines: lint 201, web tsc 7).
- **DB-backed verification** (`.github/workflows/verify-db.yml`, added 20B-6):
  nightly + manual-dispatch job with a Postgres service that migrates, seeds,
  and runs `bun run verify:core` (audit + DB verifies). Kept off the blocking
  PR path (heavy + DB-dependent).
- **Local**: `bun run verify:core` (audit + DB verifies, needs a seeded DB);
  the API verifies need a running server + the copy-trick (per script headers).

## 8. Remaining hardening backlog (not blockers for staging, required for GA)
| Item | Status |
|---|---|
| Rate limiting (single-instance) | ✅ done (20B-1) |
| Distributed rate limit (Redis) | ⬜ when multi-instance |
| Seed prod-guard | ✅ done (20B-2) |
| Test password out of source | ✅ done (20B-3) |
| Backup/restore + rollback policy | ✅ documented (this doc) — automate the schedule |
| Migration rollback | ✅ policy (forward-only + restore) |
| Error reporting (Sentry/OTLP) | ⬜ TODO |
| Metrics / readiness probe | ⬜ TODO |
| Tenant bootstrap path | ⬜ TODO |
| CI DB-backed verify job | ✅ added (20B-6) |
| Burn lint 201 → 0, web tsc 7 → 0 | ⬜ in progress |
