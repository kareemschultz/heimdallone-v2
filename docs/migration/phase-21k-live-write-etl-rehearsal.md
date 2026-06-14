# Phase 21K — Live v1 → v2 Scratch Write-ETL Rehearsal

**Date:** 2026-06-14 · **Outcome:** ✅ rehearsal PASSED · **Cutover:** freeze/DNS **NO-GO** (rehearsal only)

PII-safe: counts, slugs, classifications, and opaque ids only. No names, emails,
salaries, bank/TIN/NIS, or row content.

## Hard rules honored

- **No v1 writes** — v1 opened strictly read-only (`openV1ReadOnly` sets
  `default_transaction_read_only = on`); the loader only `SELECT`s.
- **No production v2 writes** — all writes targeted the disposable scratch DB
  `heimdallone_v2_migration_scratch` (guarded: name contains scratch/migrat, not
  `karetech_erp`, not prod v2; `CONFIRM_SCRATCH_WRITE=1` required).
- **No freeze, no DNS cutover** performed.
- **No secrets in files/commits** — the v1 credential lived only in a gitignored
  `.env.migration`, sourced into the shell; never printed, never committed.

## 1. Live v1 dry-run (read-only)

Connected to real `karetech_erp` (read-only). Classified 101 v1 tables: 13
direct-map · 13 transform-map · 5 requires-new-feature · 3 archive-only · 68
ignore. Feature gaps surfaced as before (GL, per-date roster, notifications,
work_schedules richness) — all now have a v2 home post-21D/21G. 11 statutory
fields flagged for manual review (payroll correctness). Report:
`dry-run-report.{md,json}`.

## 2. Live v1 reconcile (readiness after 21G)

**readiness: READY.** Per-tenant payslip parity (66 Netsurf + 3 Foreign Links):
42 exact, 1 rounding, 23 v1-bug (reversal churn, excluded). Statutory components:

| Component | Result |
| --- | --- |
| personal_allowance | **46/46 exact** |
| nis_employee | 46/46 exact |
| nis_employer | 46/46 exact |
| child_allowance | 46/46 exact |
| paye_brackets | 45 exact + 1 rounding |
| net_identity | 46/46 exact |

21G did **not** regress reconciliation — the fortnightly personal-allowance
certification (21D-B) still holds on live data. Report:
`reconciliation-report.{md,json}`.

## 3. Scratch target + migrations

- Scratch DB `heimdallone_v2_migration_scratch` created on the same Postgres host
  (owned by the app role); `karetech_erp` untouched.
- All **24 migrations through `0023_effective_dating`** applied via the
  programmatic migrator → **129 public tables**.

## 4. Live v1 → scratch load (real data)

Source swapped from synthetic to the new **v1-readonly loader**
(`write-etl/v1-source.ts`, `USE_V1_SOURCE=1`). Tenants loaded in cutover order
(Foreign Links pilot first, then Netsurf).

| Tenant | Emp | Contracts (fortnightly) | Roster | GL journals/lines (balanced) | Notifs |
| --- | --- | --- | --- | --- | --- |
| Foreign Links (flas) | 3 | 3 (3) | 0 | 0 (✅) | 0 |
| Netsurf | 20 | 15 (14) | 175 | 11/47 (✅) | 6 |
| **Scratch totals** | **23** | **18** | **175** | **11/47** | **6** |

Also created: 2 organizations, 15 users, 15 members, 10 GL accounts.

**Records read → written:** v1 read 23 employees / 29 users / 33 assignments / 11
accounts / 13 journals / 53 lines / 14 notifications / 175 roster / 6 schedules /
69 payslips / 891 punches. Written to scratch as above (contracts deduped to one
active per employee; notifications filtered to migrated users).

### Source-JSON staging (no v2 app-table home yet)

Parked in `migration_source_*` JSONB (preserved as source, computed forward):
**69 historical payslips · 891 attendance punches · 6 work_schedules**.

## 5. Failed / excluded mappings (3)

| Tenant | Kind | Reason |
| --- | --- | --- |
| netsurf | account | unmapped account type (1 of 11) |
| netsurf | journal | imbalanced (v1 bug — excluded) |
| netsurf | journal | line not single-sided (v1 quirk — excluded) |

These are v1 data-quality issues excluded by design (capture v1 intent, not v1
bugs). 10/11 accounts and 11/13 journals migrated; all migrated journals balance.

## 6. Manual-review items (carried forward)

- 11 statutory employee fields (TIN/NIS/qualifying_children/second_job/medical)
  — payroll-correctness review before live cutover.
- 6 employees had no v1 email → deterministic non-deliverable placeholders
  (`migrated-<id>@migrated.invalid`); confirm real addresses pre-cutover.
- 1 unmapped GL account type + 2 excluded v1 journals — confirm chart-of-accounts
  mapping + opening-balance treatment.
- work_schedules richness (night-diff/split-shift/Saturday/OT) staged as source
  JSON — wire into v2 roster/payroll where pay-affecting.

## 7. Verification results

- **GL balance:** ✅ every migrated journal balances (Netsurf debit == credit ==
  1,204,726.65; Foreign Links no journals).
- **Roster:** ✅ 175 per-date entries loaded (Netsurf).
- **Notifications:** ✅ 6 loaded (scoped to migrated users).
- **Tenant isolation:** ✅ 20 Netsurf + 3 Foreign Links employees, each row set
  addressable only by its own org id; no cross-tenant rows.
- **Correction / effective-dating compatibility:** ✅ scratch carries
  `country_payroll_profile.{effective_from,effective_to,is_published}`,
  `payroll_setting.weekend_days`, `payroll_run.rule_version_label`, and the
  `payslip_correction` table — the migrated data is schema-compatible with the
  21G resolve-by-date + correction features.
- **PII scan:** ✅ no names/emails/salaries/bank/TIN/NIS in any report (scan hits
  were field-name mentions, the disclaimer line, and opaque-id digit substrings).

## 8. Quality gates

`check-types` 3/3 · `build` 3/3 · `audit:permissions` 161/21 · `check` lint 192
(baseline) · `verify:core` all green · `migration:test-transformers` 19/19 ·
live `migration:dry-run` ok · live `migration:reconcile` READY ·
live write-ETL scratch run ✅.

## 9. Go / No-Go

- **Live write-ETL rehearsal: GO ✅** — proven end-to-end against real v1 data
  into a disposable scratch DB with all guards held.
- **Freeze: NO-GO** — pending operator sign-off on the manual-review items (§6)
  and a final full-data dress rehearsal.
- **DNS cutover: NO-GO — and NO DNS CUTOVER WAS PERFORMED in this phase.**

> Operator unblock for the live run: source the gitignored `.env.migration`
> (sets `V1_DATABASE_URL`), then `USE_V1_SOURCE=1 CONFIRM_SCRATCH_WRITE=1
> V2_STAGING_DATABASE_URL=<scratch> bun run migration:write-etl`.
