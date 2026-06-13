# Phase 21E — Write-ETL to scratch v2

**Date:** 2026-06-13 · **Commit:** `fff2b74` · **Status:** ✅ proven against scratch (live run gated on infra)

## Goal

Prove the actual tenant-by-tenant data migration path — v1-intent → v2 schema — end to end, with
**zero production writes**, before the real cutover. This is the write-capable counterpart to the
read-only `migration:dry-run` (21B) and `migration:reconcile` (21C).

## What was built (`scripts/migration/write-etl/`)

| File | Role |
| --- | --- |
| `transformers.ts` | Pure v1-shape → v2-insert mappers (org/user/member/employee/contract/shift/roster/account/journal/notification). No DB, no env — unit-verifiable. |
| `synthetic-source.ts` | Clearly-fake v1-shaped fixtures (no real PII) in cutover order. The live run swaps this provider for the v1-readonly loader; the transformers + orchestrator are identical. |
| `run-write-etl.ts` | Orchestrator. Builds its **own** guarded `Pool` on `V2_STAGING_DATABASE_URL` (never opens prod `env.DATABASE_URL`); reverse-FK reset → per-tenant load → GL-balance reconcile → cross-tenant isolation proof → PII-safe report. |
| `report.ts` | Writes PII-safe `docs/migration/write-etl-report.{json,md}` (counts + pass/fail only). |
| `transformers.test.ts` | 19 db-free unit tests. |

## Safety (reuses the 21C scratch guards)

- Target DB name **must** contain `scratch/staging/test/migrat` and must **not** be `karetech_erp`
  (v1) or the prod v2 DB — `assertScratchTarget`.
- Writes require `CONFIRM_SCRATCH_WRITE=1` — `assertWriteConfirmed`.
- The orchestrator never imports `@Heimdallone/db`, so there is **no code path** that opens the prod
  connection string. It constructs its pool only after both guards pass.
- v1 is never written; this run reads a synthetic source.

## How v1 intent is captured (not v1 bugs)

- **Pay frequency** is normalised v1-free-text → canonical v2 enum via `resolvePayFrequency`
  (`"Fortnightly"`, `"Bi-Weekly"` → `fortnightly`); an unmappable value **throws** — no silent
  default.
- **GL journals must balance to migrate** — `mapJournal` runs the router's `validateJournalLines`
  invariant; an unbalanced v1 journal is rejected, not copied.
- **Roster overrides** are preserved but cleaned: custom start/end minutes are dropped unless the
  override is `custom_hours`.
- **Notifications**: v1 `isRead` → v2 `readAt` timestamp; soft entity refs carried untouched.

## Result (against `heimdallone_v2_migration_scratch`, all 23 migrations applied)

| Tenant (order) | Emp | Contracts (fortnightly) | Roster (approved) | Accounts | Journals/Lines | Notifs | GL balanced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| foreign-links-synthetic (pilot, first) | 2 | 1 (0) | 2 (1) | 2 | 1/2 | 1 | ✅ |
| netsurf-synthetic (operational) | 2 | 2 (2) | 3 (2) | 4 | 1/4 | 2 | ✅ |

**GL balanced (all tenants): ✅ · Tenant isolation: ✅.** The two Netsurf fortnightly contracts come
from v1 strings `"Fortnightly"` and `"Bi-Weekly"` — proving the 21D-B frequency fix flows through the
migration, not just the engine.

## Gates

`migration:write-etl` (scratch) ✅ · `migration:test-transformers` 19/19 ✅ · lint clean ·
check-types 3/3 · build 2/2 · audit 161/21 · payroll-engine 47/47.

## Remaining for the live run

1. Infra: a `SELECT`-only v1 DB role on postgres-central + its Infisical creds (§6.5 of the status
   report). This is the one true blocker.
2. Swap `SYNTHETIC_TENANTS` for the v1-readonly loader (the transformers/orchestrator are unchanged).
3. Run against a fresh disposable scratch on the *real* v1 data → reconcile → freeze → DNS cutover.
