# Phase 21L — Statutory fields · No-login employees · Journal handoff · Dress rehearsal

**Date:** 2026-06-14 · **Outcome:** ✅ all five sub-phases complete + full-data
dress rehearsal PASSED · **Cutover:** freeze/DNS still **NO-GO** (rehearsal only).

21L closes the four migration manual-review items carried out of 21K, plus a final
full-data dress rehearsal. PII-safe throughout: counts, slugs, classifications,
opaque ids only.

> **SaaS Architecture Rule.** Every field below is a tenant-configurable,
> country-neutral capability. TIN/NIS became generic `taxIdentificationNumber` /
> `socialSecurityNumber`; the no-login employee is a reusable product concept;
> the journal handoff never fabricates financial data. Netsurf/Foreign Links prove
> the need; they do not define the model.

## 21L-A — Statutory employee fields (schema + API + migration mapper)

**Anchor:** the v2 payroll engine already consumes `input.employee.dependentChildren`
for child allowance, but `payroll-input-builder.ts` **hardcoded it to `0`** — so
child allowance always computed to zero. v1's `qualifying_children` is exactly that
missing input. Bank fields (`bank_account_number`/`bank_code`) were **0/23 in v1**
and already have `employee_bank_details` — no new home needed.

**Schema** — new one-to-one satellite `employee_statutory` (migration
`0024_steady_chameleon`, additive `CREATE TABLE`):

| column | source v1 column | note |
| --- | --- | --- |
| `tax_identification_number` | `tin_number` | sensitive PII, masked at API |
| `social_security_number` | `nis_number` | sensitive PII, masked at API |
| `dependent_children` (int) | `qualifying_children` | **drives child allowance** |
| `has_second_job` (bool) | `has_second_job` | tax treatment |
| `second_job_pay_amount` | `second_job_pay_cents` | cents → numeric(12,2) |
| `medical_insurance_on_file` (bool) | `medical_insurance_on_file` | |
| `medical_payroll_deduction_amount` | `medical_payroll_deduct_cents` | numeric |
| `medical_external_premium_amount` | `medical_external_premium_cents` | numeric |
| `other_deductions_amount` | `other_deductions_cents` | numeric |

**API** — `hrCore.employees.statutory.{get,update}`, mirroring bank-details:
TIN/NIS masked for non-payroll roles (`canManagePayroll` sees full); edit gated to
HR/payroll (`canReadFullBankDetails`); tenant-scoped (closes the cross-tenant IDOR
class). **Reuses the `employee` AC resource → audit stays 161/21 (no new pair).**

**Builder wiring** — `buildEmployeeInput` now reads `employee_statutory.dependent_children`
(absent row → 0). Child allowance is now computed from real data, not a hardcoded 0.

**Migration mapper** — `mapStatutory` (pure, unit-tested) + `loadEmployees` pulls the
9 statutory columns; `run-write-etl` inserts the satellite. The dry-run classifier
now maps these fields to `employee_statutory.*` (status `mapped`, not `manual_review`).

## 21L-B — No-login employee policy

`employee_profile.email` is now **nullable** (migration `0024`). A "no-login
employee" = HR/payroll-only staff with no system account (`userId` null) and no
email. The `(organizationId, email)` unique still holds for real emails (Postgres
treats NULLs as distinct). The migration **no longer synthesizes** the fake
`migrated-<id>@migrated.invalid` placeholder — a missing v1 email becomes null.
`employeeCreate`/`employeeUpdate` accept a null/absent email (uniqueness check
guarded behind `if (input.email)`); employee detail UI shows `— (no login)`.

## 21L-C — Accounting handoff for the 2 v1-bug journals

**Decision: hand off to an accountant — never fabricate a balancing entry.** The two
excluded journals are genuine v1 bugs (imbalanced / non-single-sided lines, part of
the v1 reversal churn already classified `v1_bug` in reconciliation). The complete
v1 GL (entries + lines) is now staged verbatim in `migration_source_journal` /
`migration_source_journal_line`; the PII-safe failures report still lists which ids
were excluded and why. **Post-cutover workflow:** an accountant cross-references the
excluded ids against the staged GL and, if a correcting opening-balance entry is
warranted, enters it via the `gl.journals.create`/`import` router. Heimdallone
migrates v1 *intent*, not v1 *bugs*; the corrected accounting entry is the
accountant's call. 11/13 journals migrated (all balanced); 11/11 accounts.

## 21L-D — Work-schedules richness plan (docs)

`docs/architecture/work-schedules-richness-plan.md` — field-by-field map of v1
`work_schedules` (night-diff window, split-shift, Saturday-specific times, OT
thresholds, flexi-time, daily cap, grace, auto-break) → recommended effective-dated
per-shift `shift_rule` satellite (org settings as fallback), with the engine seams
(`attendance-recalc` minute classification + payroll OT multipliers). **Plan only;
the data is preserved losslessly** in `migration_source_work_schedule`. Sequenced as
Phase 21J (its own TDD build with a reconcile-46/46 regression guard).

## 21L-E — Full-data dress rehearsal (live v1 → fresh scratch)

Fresh disposable scratch DB `heimdallone_v2_migration_scratch` (dropped + recreated;
**25 migrations through `0024` → 132 public tables**), live v1 read-only source.

| Check | Result |
| --- | --- |
| Tenants (Foreign Links first, then Netsurf) | ✅ 2 |
| Employees | 23 (FL 3 / Netsurf 20) |
| **`employee_statutory` rows** | **23/23** (TIN 3 · NIS 3 — faithful to v1's 3/23; dependent-children pipe connected) |
| **No-login (null-email) employees** | **6** (exactly the placeholders previously faked) |
| Contracts (fortnightly) | 18 (17 fortnightly) |
| Roster entries | 175 |
| GL accounts / journals loaded | 11 / 11 (all balanced; debit==credit) |
| **Full GL staged for accountant** | **13 entries / 53 lines** |
| Excluded mappings | 2 (both genuine v1-bug journals) |
| Tenant isolation | ✅ (20 + 3, no cross-tenant rows) |
| Live dry-run | ✅ statutory review **11 → 2** (only `company_id` + `kiosk_pin_hash` remain — neither is a tax field) |
| Live reconcile | ✅ **READY** — personal_allowance/NIS/child/net **46/46 exact**, PAYE 45 exact + 1 rounding (**no regression** from 21L) |

**Hard rules held:** no v1 writes (read-only session); no production v2 writes
(scratch only, guarded: name contains scratch/migrat, `CONFIRM_SCRATCH_WRITE=1`, prod
URL never opened); no freeze; no DNS cutover; no secrets in files/commits (v1 cred
from gitignored `.env.migration`, host rewritten container→localhost, never printed).

## Quality gates

`check-types` 3/3 · `build` 3/3 · `audit:permissions` 161/21 (statutory reuses the
`employee` resource — no new pair) · `migration:test-transformers` 23/23 ·
payroll-engine 59/59 · changed files lint-clean (no new errors over baseline) ·
live dry-run ok · live reconcile **READY (46/46)** · live write-ETL scratch run ✅.

## Go / No-Go

- **Full-data dress rehearsal: GO ✅** — end-to-end against real v1 into a fresh
  disposable scratch with all guards held and all four manual-review items addressed.
- **Freeze: NO-GO** — pending operator sign-off (real emails for the 6 no-login
  employees if any are intended to have logins; accountant treatment of the 2
  excluded journals; the Phase 21J work_schedules richness build if those pay rules
  are needed at cutover).
- **DNS cutover: NO-GO — and none was performed.**

## Operator note (re-run the rehearsal)

```sh
# v1 read-only cred (gitignored); host rewritten container→localhost
set -a; source .env.migration; set +a
export V1_DATABASE_URL="${V1_DATABASE_URL/postgres-central/localhost}"
# scratch on the dev host (db name must contain scratch/migrat); owned by app role
set -a; source apps/server/.env; set +a
export V2_STAGING_DATABASE_URL="${DATABASE_URL%/*}/heimdallone_v2_migration_scratch"
export CONFIRM_SCRATCH_WRITE=1 RESET_SCRATCH=1 USE_V1_SOURCE=1
bun run scripts/migration/create-scratch-db.ts        # source-staging tables
bun run scripts/migration/apply-scratch-migrations.ts # 25 migrations / app tables
bun run migration:write-etl                           # live v1 → scratch
bun run migration:dry-run && bun run migration:reconcile
```

> If the scratch DB is missing, create it as the Postgres superuser owned by the app
> role (the app role lacks `CREATEDB`):
> `docker exec postgres-central psql -U postgres -c 'CREATE DATABASE heimdallone_v2_migration_scratch OWNER heimdallone;'`
