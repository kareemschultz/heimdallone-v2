# Phase 21E — Write-ETL dry-run report

**Source:** synthetic (no live v1 / no production writes)
**Tenant order:** foreign-links-synthetic → netsurf-synthetic
**GL balanced (all tenants):** ✅ · **Tenant isolation:** ✅

> PII-safe: counts + pass/fail only. No names / emails / salaries / bank / TIN / NIS.

| Tenant | Emp | Contracts (fortnightly) | Roster (approved) | Accounts | Journals/Lines | Notifs | GL balanced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| foreign-links-synthetic | 2 | 1 (0) | 2 (1) | 2 | 1/2 | 1 | ✅ |
| netsurf-synthetic | 2 | 2 (2) | 3 (2) | 4 | 1/4 | 2 | ✅ |

## Totals
- Employees 4 · Contracts 3 (fortnightly 2) · Roster 5
- GL accounts 6 · Journals 2 / lines 6 · Notifications 3

## What this proves
- The transform + load path writes valid v2-schema rows (org → user → member → employeeProfile → contract → shift → roster_entry → gl_account → gl_journal_entry/line → notification) with all FK constraints satisfied.
- Pay frequency is normalised v1-free-text → canonical v2 enum (e.g. "Fortnightly"/"Bi-Weekly" → `fortnightly`).
- Every migrated GL journal balances (Σ debits == Σ credits).
- Tenants load in cutover order (Foreign Links pilot first) and are independently addressable by org id.

## Live run (operator)
Swap the synthetic provider for the v1-readonly loader and set `V1_DATABASE_URL` (read-only role), `V2_STAGING_DATABASE_URL` (disposable scratch), `CONFIRM_SCRATCH_WRITE=1`. No production writes occur in either mode.
