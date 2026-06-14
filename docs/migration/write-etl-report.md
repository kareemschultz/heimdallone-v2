# Phase 21K — Write-ETL report

**Source:** live v1 (read-only) → scratch (no v1/production writes)
**Tenant order:** flas-hxn1 → netsurf
**GL balanced (all tenants):** ✅ · **Tenant isolation:** ✅

> PII-safe: counts + pass/fail only. No names / emails / salaries / bank / TIN / NIS.

| Tenant | Emp | Contracts (fortnightly) | Roster (approved) | Accounts | Journals/Lines | Notifs | GL balanced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flas-hxn1 | 3 | 3 (3) | 0 (0) | 0 | 0/0 | 0 | ✅ |
| netsurf | 20 | 15 (14) | 175 (175) | 11 | 11/47 | 6 | ✅ |

## Totals
- Employees 23 (statutory rows 23 · no-login 6) · Contracts 18 (fortnightly 17) · Roster 175
- GL accounts 11 · Journals 11 / lines 47 · Notifications 6

## Source-JSON staging (fields with no v2 app-table home)
- Historical payslips 69 · Attendance punches 891 · Work schedules 6 · Employees (full row, incl. statutory fields) 23
- Complete v1 GL preserved for accountant review (21L-C): journal entries 13 · journal lines 53

## Failed / excluded mappings (2)
| Tenant | Kind | Id | Reason |
| --- | --- | --- | --- |
| netsurf | journal | b2efdd1b-09d4-4ece-a0bd-5796110ae6a2 | imbalanced (v1 bug — excluded) |
| netsurf | journal | f8f42e15-d9dc-4090-a65a-dc1aec88c946 | line not single-sided (v1 quirk — excluded) |

## What this proves
- The transform + load path writes valid v2-schema rows (org → user → member → employeeProfile → contract → shift → roster_entry → gl_account → gl_journal_entry/line → notification) with all FK constraints satisfied.
- Pay frequency is normalised v1-free-text → canonical v2 enum (e.g. "Fortnightly"/"Bi-Weekly" → `fortnightly`).
- Every migrated GL journal balances (Σ debits == Σ credits).
- Tenants load in cutover order (Foreign Links pilot first) and are independently addressable by org id.

## Live run (operator)
Swap the synthetic provider for the v1-readonly loader and set `V1_DATABASE_URL` (read-only role), `V2_STAGING_DATABASE_URL` (disposable scratch), `CONFIRM_SCRATCH_WRITE=1`. No production writes occur in either mode.
