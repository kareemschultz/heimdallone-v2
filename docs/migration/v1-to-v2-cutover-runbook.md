# v1 → v2 Production Cutover Runbook (exact commands)

**Phase 21P · Date 2026-06-15 · Status: PREPARED — NOT EXECUTED.**

> ⛔ **NOTHING IN THE PRODUCTION-WRITE / DEVICE / DNS SECTIONS RUNS WITHOUT EXPLICIT
> OWNER APPROVAL.** This document is the authorized command plan. Until the owner
> signs off the [authorization packet](./phase-21p-cutover-authorization.md), only
> the **Preflight**, **Read-only verification**, **Final dry-run**, and **Final
> reconcile** sections may be run (they make no writes anywhere).

Safety properties that hold today (verified):

- **v1 is opened read-only** — `migration_reader` is a SELECT-only role and
  `openV1ReadOnly` sets `default_transaction_read_only = on`.
- **The write-ETL is hard-guarded to a disposable scratch DB.**
  `assertScratchTarget` throws unless the target DB name contains
  `scratch/staging/test/migrat`, and additionally refuses `karetech_erp` and the
  production v2 DB. **A production write is therefore impossible with the current
  tooling without a deliberate, owner-approved enablement step** (see
  §"Production write-ETL"). This is by design.
- Secrets live only in `apps/server/.env` (gitignored), `.env.migration`
  (gitignored, SELECT-only v1 creds), Infisical, and the Pi `.env`. None are in
  the repo or any Gist.

Conventions in this doc:
- `${V1}` = SELECT-only v1 URL (from `.env.migration`; rewrite host
  `postgres-central`→`localhost` when running from the host).
- `${PRODV2}` = production v2 `DATABASE_URL` (from `apps/server/.env`).
- `${SCRATCH}` = disposable scratch URL (prod URL with db name
  `heimdallone_v2_migration_scratch`).
- Load env with: `set -a; . .env.migration; . apps/server/.env; set +a` then
  `export V1_DATABASE_URL="${V1_DATABASE_URL/@postgres-central:/@localhost:}"`.

---

## 1. Preflight checks  ✅ safe to run

```bash
git fetch origin && git log --oneline -3
git status --short                       # must be clean
git rev-parse HEAD; git rev-parse origin/master   # must match
bun run check-types                      # 3/3
bun run build                            # 3/3
bun run audit:permissions                # 161/21
bun run check                            # ≤212 baseline
bun run verify:core                      # all pass (needs apps/server/.env)
bun test scripts/migration/write-etl/transformers.test.ts            # 38/38
bun test scripts/migration/attendance-bridge/transformers-attendance.test.ts  # 15/15
```

## 2. Backups  — RUN AT FREEZE (read-heavy; no app writes)

```bash
# ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER (freeze window only)
# v1 full backup (read-only):
pg_dump "${V1}" -Fc -f backups/v1-karetech_erp-$(date +%Y%m%d-%H%M).dump
# v2 production restore point BEFORE any load:
pg_dump "${PRODV2}" -Fc -f backups/v2-prod-prefreeze-$(date +%Y%m%d-%H%M).dump
# Infisical: export/verify the migration + Google OAuth + device secrets exist:
infisical export --env=prod > /dev/null && echo "infisical OK"   # do not print values
# Current Gist v1 script backup (rollback artifact):
curl -fsSL "https://gist.githubusercontent.com/kareemschultz/0ed7921feaac8a7c316799171d370826/raw/heimdallone_sync.py" \
  -o backups/gist-v1-heimdallone_sync.py
# DNS: export current records (registrar API or screenshot) → backups/dns-current-*.txt
```

## 3. Read-only verification  ✅ safe to run

```bash
set -a; . .env.migration; . apps/server/.env; set +a
export V1_DATABASE_URL="${V1_DATABASE_URL/@postgres-central:/@localhost:}"
# v1 opened SELECT-only; proves no v1 writes are possible:
psql "${V1_DATABASE_URL}" -c "SHOW default_transaction_read_only;"   # → on
```

## 4. Final dry-run  ✅ safe to run

```bash
bun run migration:dry-run     # expect: feature gaps 0, statutory review 2 (non-tax)
```

## 5. Final reconcile  ✅ safe to run

```bash
bun run migration:reconcile   # expect: readiness READY; personal_allowance/NIS/child/net 46/46 exact
```

## 6. Production migration apply  ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER

Applies the Drizzle schema to the **production** v2 DB. Idempotent (only missing
migrations apply), but it is a production write.

```bash
# ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER
# Target is the PRODUCTION v2 database. Take the §2 restore point first.
DATABASE_URL="${PRODV2}" bun run db:migrate    # apply pending migrations to prod v2
```

## 7. Production write-ETL  ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER

> The current `migration:write-etl` is **hard-guarded to scratch-only** — it will
> **refuse** a production target. Running it against production requires a
> deliberate, owner-approved enablement (a reviewed change to the production-write
> path). That enablement is **not** built and is out of scope for Phase 21P. The
> command below documents intent; it will not write to prod as-is.

```bash
# ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER — and only via the reviewed prod-write path.
# Load tenants in the approved order (e.g. Foreign Links pilot first, then Netsurf).
# USE_V1_SOURCE=1 reads live v1 (read-only); the destination must be PRODUCTION v2.
# (As shipped, the scratch guard blocks this — intentional.)
USE_V1_SOURCE=1 <prod-write-enablement> bun run migration:write-etl
```

Scratch rehearsal equivalent (✅ safe, for final confidence before the window):

```bash
# drop + recreate + migrate scratch, then load live v1 → scratch, then bridge
docker exec postgres-central psql -U postgres -tAc "DROP DATABASE IF EXISTS heimdallone_v2_migration_scratch WITH (FORCE);"
docker exec postgres-central psql -U postgres -tAc "CREATE DATABASE heimdallone_v2_migration_scratch OWNER \"$(echo "$DATABASE_URL" | sed -E 's#postgres(ql)?://([^:]+):.*#\2#')\";"
export V2_STAGING_DATABASE_URL="${DATABASE_URL/\/Heimdallone/\/heimdallone_v2_migration_scratch}"
export CONFIRM_SCRATCH_WRITE=1 USE_V1_SOURCE=1
bun run scripts/migration/apply-scratch-migrations.ts
bun run scripts/migration/create-scratch-db.ts          # ensures 8 source-staging tables
bun run migration:write-etl
DATABASE_URL="${V2_STAGING_DATABASE_URL}" bun run migration:attendance-bridge
```

## 8. Post-load checks  — RUN AFTER PRODUCTION LOAD (read-only queries)

```bash
# ⛔ Only after the approved production load. Read-only verification queries.
bun run migration:reconcile        # must stay READY 46/46 against the loaded set
# GL balance per tenant (debit == credit), tenant isolation (no cross-tenant members),
# statutory rows present, no-login employees null-email (no placeholders), shift_rules,
# notifications, source-JSON staging — run the same SELECTs proven in the rehearsal.
```

## 9. Device sync cutover  ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER

Operator UI + Pi steps (no repo commands; secrets stay off the repo/Gist):

```text
# ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER
1. Log in to v2 as platform owner → Biometric Devices → register the ZKTeco
   terminal (vendor zkteco, mode api_ingest, model ZLM60_TFT, tz America/Guyana).
2. Copy the v2 deviceId and the one-time ingest apiKey.
3. On the Pi, set .env: HEIMDALL_API_URL, HEIMDALL_DEVICE_ID, HEIMDALL_API_KEY.
4. Replace the existing Gist heimdallone_sync.py CONTENT with
   scripts/device-bridge/heimdallone_sync.py  (code only — NO secrets).
5. Wait ≤5 min (auto-updater) or: sudo systemctl restart heimdallone-bridge
6. Confirm punches arrive; check the unmatched-punch / exception queue.
```

## 10. DNS cutover  ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER

```text
# ⛔ DO NOT RUN UNTIL OWNER APPROVES CUTOVER
# Only after ALL smoke tests pass and the owner approves:
# switch the app DNS record(s) to v2; monitor propagation.
```

## 11. Rollback

```bash
# DNS: switch back to v1 (or leave on v1 if not yet switched).
# v1: lift the read-only freeze so the business resumes on v1.
# v2: restore the pre-freeze production snapshot, discard the partial load:
pg_restore -d "${PRODV2}" --clean --if-exists backups/v2-prod-prefreeze-*.dump
# Device: restore the v1 script into the Gist and restart the bridge:
#   (re-upload backups/gist-v1-heimdallone_sync.py to the Gist)
#   sudo systemctl restart heimdallone-bridge
# Capture PII-safe failure evidence, fix, re-rehearse on scratch before retry.
```

**Rollback criteria:** post-load reconcile not READY · GL imbalance or tenant
isolation failure · any admin/employee/payroll/Google/first-login smoke test
fails · unmatched punches persist · any unexpected production write detected.
