# Phase 21B — v1 → v2 ETL Foundation & Dry-Run Framework

**Date:** 2026-06-12
**Status:** ✅ complete (read-only discovery + dry-run mapping; NO writes)
**Predecessors:** [Gap Analysis](./v1-to-v2-gap-analysis.md) · [21A Cutover Plan](./v1-to-v2-cutover-plan.md)
**Next:** Phase 21C — payroll/attendance reconciliation dry-run

## What this is

A **read-only** framework that connects to the live v1 database, maps every v1 table to v2
concepts, validates coverage, and emits a migration report — **without touching production**. It is
the safe first rung of the cutover: discover and dry-run-map before writing a single migrated row.

## Safety model (enforced in code)

- **v1 is read-only.** `v1-readonly.ts` refuses any URL that is not `karetech_erp` and runs
  `SET default_transaction_read_only = on` — a stray write throws instead of mutating client data
  (verified: `CREATE TEMP TABLE` is rejected).
- **No v2 production writes.** `v2-staging.ts` refuses to target the v2 production DB (compares
  host+db against `DATABASE_URL`/`V2_PROD_DATABASE_URL`), refuses the v1 DB, and requires the target
  to look disposable (`stag|scratch|migrat|test` or `ALLOW_V2_TARGET=1`). **All write methods throw
  in 21B** (`refuseWrite()`) — writes are 21C.
- **Dry-run only.** `run-dry-run.ts` performs SELECTs and writes a report file. Nothing else.

## File structure (`scripts/migration/`)

| File | Role |
| --- | --- |
| `v1-readonly.ts` | read-only v1 connector + guards + table/row helpers |
| `v2-staging.ts` | v2 staging connector + **production guard**; writes throw (21C) |
| `types-v1.ts` | shared types, the authoritative `V1_TABLE_PLAN` classification, `coverFields` |
| `map-tenants.ts` | `organization` → v2 organization |
| `map-employees.ts` | `employees` → profile/work_info/bank + **statutory field review** |
| `map-payroll.ts` | periods/components/structures/**payslips (archive)** mappers |
| `map-attendance.ts` | punches/corrections/devices/device-users mappers |
| `map-rosters.ts` | work_schedules / shift assignments / **per-date roster (gap)** |
| `migration-report.ts` | PII-free Markdown + JSON report generator |
| `run-dry-run.ts` | orchestrator (reads v1, runs mappers, writes report) |

> Addition vs the 21A file list: a `coverFields` helper lives in `types-v1.ts` (data-driven field
> coverage — any v1 column with no known mapping surfaces as `unmapped` rather than being silently
> dropped). No other structural change.

## How to run

```bash
# v1 is reachable from the host via the postgres-central container IP (no host port mapping):
export V1_DATABASE_URL="postgres://heimdallone:****@172.19.0.2:5432/karetech_erp"
# optional, only when a disposable staging DB exists:
# export V2_STAGING_DATABASE_URL="postgres://.../heimdallone_staging"
bun run migration:dry-run
```

Outputs (PII-free — counts, table/field names, classifications, opaque IDs only):
- `docs/migration/dry-run-report.md`
- `docs/migration/dry-run-report.json`

## First dry-run results (2026-06-12, live v1)

Totals: **2 tenants, 29 users, 23 employees, 69 payslips, 874 punches, 175 roster entries,
13 GL journals, 14 notifications, 2 leave requests.** (Punch count rises run-to-run — v1 is live.)

Table classification (101 v1 tables):
| Classification | Tables |
| --- | ---: |
| Direct map | 13 |
| Transform map | 13 |
| Requires new v2 feature | 5 |
| Archive only | 3 |
| Ignore / defer | 68 (transient + empty scaffolds) |

### Feature gaps that block write-migration (→ 21D)
1. **GL** — `accounts` (11) + `journal_entries` (13) + `journal_lines` (53). Minimal v2 payroll-GL;
   do NOT clone v1's bug-reversal churn.
2. **Per-date roster** — `shift_roster_entries` (175, incl. overrides/approvals). Needs a v2
   `roster_entry` table. Highest-impact gap (feeds the operational tenant's pay).
3. **Notifications** — `notifications` (14). Build the subsystem; history optional.
4. **Scheduling richness** — `work_schedules` has **19 fields with no v2 home** (night
   differential, split shift, Saturday rates, OT thresholds, grace, daily caps) that **feed
   payroll**. Decision: extend v2's `shift` model or accept simplified scheduling.

### Statutory fields needing manual review (payroll correctness)
11 `employees` fields flagged: TIN, NIS, `qualifying_children`, `has_second_job` +
`second_job_pay_cents`, medical (3 columns), `other_deductions_cents`, `kiosk_pin_hash`,
`company_id`. Each must have a confirmed v2 home before payroll cutover or net pay shifts.

### Notable data facts
- v1 `payslips` carry the full Guyana breakdown **inline** (PAYE/NIS/allowances/etc.) **plus
  `snapshot_json`** → historical preservation is clean. `payslip_line_items` is empty (detail is
  inline). Some payslips are `is_reversal` (the UTC-bug corrections) — preserved as history, **not
  replayed**.
- 8 of 23 employees have no `user_id` (no auth login link); 6 have no email → migrate as
  profile-only. 0 employees have a manager set (`reports_to` empty in the data).
- v1 punches carry GPS — confirm v2's punch geo home during 21C.

## Blockers before 21C
- None for the **read** side. 21C builds the **reconciliation harness** (recompute each v1 payslip
  in v2's payroll-engine, assert net-pay parity) — that needs the employee + pay-input mappers from
  this phase plus a scratch v2 target to write into. The feature gaps above block **write**-
  migration of GL/roster/notifications but not the payroll parity dry-run.

## Gates at completion
`check-types` 3/3 · `build` 2/2 · `check` (lint) clean on changed files · `audit:permissions`
149/18 (unchanged — no AC/router change) · `migration:dry-run` produces the report. The migration
scripts are read-only operational tooling (not part of the app build).
