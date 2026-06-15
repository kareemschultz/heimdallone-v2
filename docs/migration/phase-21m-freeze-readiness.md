# Phase 21M — Freeze Readiness & Final Cutover Dress Rehearsal

**Date:** 2026-06-15 · **Outcome:** ✅ dress rehearsal PASSED · **Freeze:** NO-GO
(pending owner sign-off) · **DNS cutover:** NO-GO (none performed)

PII-safe: counts, slugs, classifications, and opaque ids only. No names, emails,
salaries, bank/TIN/NIS, or row content.

## Hard rules honored

- **No v1 writes** — v1 opened strictly read-only (SELECT-only `migration_reader`
  role; `openV1ReadOnly` also sets `default_transaction_read_only = on`).
- **No production v2 writes** — all writes targeted the disposable scratch DB
  `heimdallone_v2_migration_scratch` (guard: name must contain
  scratch/staging/test/migrat, not `karetech_erp`, not the prod v2 DB name
  `Heimdallone`; `CONFIRM_SCRATCH_WRITE=1` required). Proven: the 8
  `migration_source_*` staging tables exist in scratch (8) and **not** in
  `Heimdallone` (0); v1 has **0** v2 tables.
- **No freeze, no DNS cutover** performed.
- **No secrets in files/commits** — the v1 credential lives only in a gitignored
  `.env.migration`, sourced into the shell; container host `postgres-central`
  rewritten to `localhost` from the host; never printed, never committed.
- **GRA remains the source of truth** for Guyana payroll (reconciliation gate).
- **v1 source data preserved** losslessly in `migration_source_*`; **no
  accounting/payroll values fabricated** (the 2 v1-bug journals stay excluded; no
  balancing entry invented).

## 1. Operator decision checklist (carried to freeze)

These need owner / accountant ground-truth — they are **not** completable by the
ETL alone. Each is preserved losslessly today so the decision can be applied
later without data loss.

> **Update (2026-06-15, owner):** decision #1 below is superseded — **preserve
> logins wherever possible; resolve missing real emails before cutover for
> employees who need access; use true no-login only when explicitly intended; on
> first v2 login show a migration/update modal and require acknowledgement.** A
> grounded review of live v1 also found the ETL would (a) flatten 12 elevated
> tenant roles (`owner`×8, `admin`×4) to `employee` and (b) drop real
> credential/Google logins to no-login. Both are fixed in **Phase 21N**
> ([migration-login-preservation-plan.md](../architecture/migration-login-preservation-plan.md)).
> The platform owner (`kareemschultz`, v1 `user.role='admin'`) is preserved as a
> cross-tenant admin-plugin account, **not** a tenant member role.

| # | Decision | Current state (rehearsal) | Options | Owner |
| --- | --- | --- | --- | --- |
| 1 | **Logins & access (was: 6 no-login employees)** | **Superseded by Phase 21N.** v1 holds `member.role` `owner`×8 / `admin`×4 / `employee`×13 and `account` `credential`×13 (with hashes) / `google`×10. The 21N ETL preserves user + member-role + credential/Google account (Better Auth→Better Auth, hashes carry verbatim — no reset/weakening) and maps `owner`→`tenant_owner`, `admin`→`tenant_admin`. | **Decided:** preserve logins wherever possible; resolve missing real emails before cutover for employees who need access; true no-login only when explicitly intended; first-login modal + acknowledgement. **Still open:** which no-login employees should get a real email; Google scope for 10 v1 Google users (spec §3.1). | Owner / HR |
| 2 | **Statutory completeness** | 23/23 statutory satellite rows created; **only 3** carry a TIN and **3** an NIS (faithful to v1 — source has exactly 3 each, nothing dropped); 0 have qualifying children > 0. | (a) accept v1 as-is; (b) capture TIN/NIS/dependents for the other employees before cutover for payroll correctness | Owner / Payroll |
| 3 | **2 excluded v1-bug journals** | 11/13 journals migrated (all balanced); 2 excluded (`imbalanced`, `line not single-sided` — reversal churn). Full v1 GL (13 entries / 53 lines) preserved in `migration_source_journal[_line]`. | (a) exclude permanently; (b) accountant enters a corrected opening-balance journal **post-cutover** via the GL module | Accountant |
| 4 | **work_schedules richness** | 6/6 v1 work_schedules mapped → `shift_rule` (1 archived → unpublished); residual fields preserved in `migration_source_work_schedule`. | (a) mapped `shift_rule` values sufficient for cutover; (b) stage deeper night/split-shift premium arithmetic first | Owner / Payroll |
| 5 | **Cutover order** | Rehearsal loads Foreign Links (pilot) first, then Netsurf — tenant-isolated. | (a) pilot first then the rest; (b) all tenants in one freeze window | Owner |

## 2. Final scratch dress rehearsal (live v1 → fresh scratch)

- **Fresh scratch DB:** `heimdallone_v2_migration_scratch` — **dropped and
  recreated** (owned by the `heimdallone` app role) for a clean rehearsal.
- **Migrations applied:** **26 / 26** via the programmatic migrator →
  **133 public tables** (125 app tables + 8 source-staging tables).
- **Live v1 dry-run:** 2 tenants · 29 users · 23 employees · 69 payslips · 891
  attendance punches · 175 roster · 13 GL journals · 14 notifications · 2 leave.
  Classification: 13 direct_map · 18 transform_map · 3 archive_only · 68
  ignore_defer. **Feature gaps blocking write-migration: 0** (GL / roster /
  notifications reclassified `requires_new_v2_feature` → `transform_map` this
  phase — their v2 homes shipped in 21D-D/E/F; the classification registry had
  drifted). Statutory fields to review: **2** (`company_id`, `kiosk_pin_hash` —
  neither a tax field).
- **Live v1 reconcile:** **READY** — personal_allowance + NIS (emp/employer) +
  child_allowance + net_identity **46/46 exact**; PAYE brackets 45 exact + 1
  rounding; 23 v1-bug reversal payslips excluded by design. 21G/21J did **not**
  regress reconciliation.

### Records read → written

| Step | Result |
| --- | --- |
| Source staged (JSONB, lossless) | payslips **69** · attendance **891** · work_schedules **6** · employees **23** · GL **13** entries / **53** lines |
| Excluded mappings | **2** (both v1-bug journals: imbalanced; non-single-sided) |

| Loaded to scratch | Count | Verified |
| --- | --- | --- |
| organizations | 2 | — |
| users / members | 15 / 15 | login only for employees that have one |
| employees | 23 | flas-hxn1 = 3, netsurf = 20 |
| no-login employees (null email) | **6** | 0 `@migrated.invalid` placeholders |
| statutory rows | **23** | 3 TIN + 3 NIS (matches source — no drops) |
| contracts (fortnightly) | 18 (**17**) | pay frequency normalised |
| shifts | 6 | — |
| shift_rules (work_schedules) | **6** | 1 unpublished (archived in v1) |
| roster entries | **175** | per-date |
| GL accounts | **11** | all v1 accounts (revenue → income) |
| GL journals / lines | **11 / 47** | all migrated journals balance |
| notifications | **6** | scoped to migrated users |

## 3. Verification results

- **Tenant isolation:** ✅ flas-hxn1 = 3 + netsurf = 20 employees; **0**
  cross-tenant member leaks (member org == its employee's org for all).
- **Payroll reconciliation:** ✅ READY; statutory parity 46/46 exact (above).
- **Statutory mapping:** ✅ 23 satellite rows; TIN/NIS fidelity source(3/3) ==
  satellite(3/3); `dependent_children` now feeds the engine's child allowance.
- **No-login:** ✅ 6 null-email employees, no user/member rows; 0 placeholders.
- **Contracts / pay frequency:** ✅ 18 contracts, 17 fortnightly (one active per
  employee; v1 "Bi-Weekly"/"Fortnightly" → canonical `fortnightly`).
- **Roster:** ✅ 175 per-date entries.
- **Shift rules / work_schedules:** ✅ 6/6 mapped to `shift_rule`, 1 unpublished;
  residual richness preserved in source JSON.
- **GL:** ✅ Netsurf debits == credits == **1,204,726.65**; Foreign Links 0/0;
  every migrated journal balances. Full v1 GL staged for accountant review.
- **Notifications:** ✅ 6 loaded.
- **Source-JSON staging:** ✅ payslips 69 · attendance 891 · work_schedules 6 ·
  employees 23 · journals 13 · journal_lines 53.
- **PII scan:** ✅ no emails (placeholder/field-name mentions only), no
  TIN/NIS-length numbers; the only "salary" hits are v1 **table names** in the
  classification matrix, not values.
- **No production writes:** ✅ scratch has the 8 `migration_source_*` tables;
  `Heimdallone` has 0; `karetech_erp` has 0 v2 tables.

## 4. Cutover runbook

The operator-facing runbook (pre-freeze backups → announcement/downtime → freeze
v1 read-only → final delta dry-run → final reconciliation → final ETL into prod
v2 → post-load reconciliation → admin/employee/payroll smoke tests → DNS switch →
rollback criteria/steps → post-cutover monitoring) is published in Fumadocs:
**[Administration → Freeze & cutover checklist](../../apps/docs/content/docs/administration/freeze-checklist.mdx)**
(`/docs/administration/freeze-checklist`), with the what-migrates/guarantees
companion at `/docs/administration/migration-cutover`.

## 5. Quality gates

`check-types` **3/3** · `build` **3/3** (incl. docs) · `audit:permissions`
**161/21** · `check` lint **193** (within the accepted ≤212 baseline; the two
edited migration scripts carry `biome-ignore-all` headers) · `verify:core` **all
green** (audit 161 · pay-frequency · roster 68 · GL 64 · notifications 49 ·
payroll-resolver 8 · leave-resolver 13 · workweek 13 · payslip-correction 11 ·
shift-rule-resolver 29 · shift-rule-api 32 · performance-db 25 · crm-db 30 ·
finance-db 26) · `migration:test-transformers` **30/30** · live
`migration:dry-run` ok (0 gaps) · live `migration:reconcile` **READY** · live
write-ETL scratch rehearsal **✅** · docs build **0** · docs lint **0** (2
pre-existing warnings/infos in generated CSS).

## 6. Go / No-Go

- **Login preservation (Phase 21N): COMPLETE ✅** — the ETL now preserves v1
  logins, tenant roles (`owner→tenant_owner`, `admin→tenant_admin`), credential/
  Google accounts, and the cross-tenant platform owner; first-login modal +
  migration-status report shipped. Live scratch rehearsal: roles 8/4/13=25, no
  flattening; reconcile still 46/46. See
  [phase-21n-login-preservation.md](./phase-21n-login-preservation.md).
- **Live write-ETL rehearsal: GO ✅** — proven end-to-end against real v1 data
  into a fresh disposable scratch DB with all guards held.
- **Freeze: NO-GO** — pending explicit owner sign-off on the §1 operator
  decisions. The technical readiness is GREEN; the blockers are decisions, not
  code.
- **DNS cutover: NO-GO — and NO DNS CUTOVER WAS PERFORMED in this phase.**

> Operator unblock for the live run (production target, owner-approved only):
> source `.env.migration`, then run dry-run + reconcile read-only; on READY, run
> the write-ETL against the **production** v2 target with the agreed cutover
> order — per the freeze checklist, never automatically.
