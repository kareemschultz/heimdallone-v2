# Phase 21N — Write-ETL report

**Source:** live v1 (read-only) → scratch (no v1/production writes)
**Tenant order:** flas-hxn1 → netsurf
**GL balanced (all tenants):** ✅ · **Tenant isolation:** ✅

> PII-safe: counts + pass/fail only. No names / emails / salaries / bank / TIN / NIS.

| Tenant | Emp | Contracts (fortnightly) | Roster (approved) | Accounts | Journals/Lines | Notifs | GL balanced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flas-hxn1 | 3 | 3 (3) | 0 (0) | 0 | 0/0 | 0 | ✅ |
| netsurf | 20 | 15 (14) | 175 (175) | 11 | 11/47 | 14 | ✅ |

## Totals
- Employees 23 (statutory rows 23 · no-login 6) · Contracts 18 (fortnightly 17) · Shift rules 6 · Roster 175
- Logins preserved: users 25 · members 25 · accounts 19 · tenant_owner 8 · tenant_admin 4 · platform admin 1
- GL accounts 11 · Journals 11 / lines 47 · Notifications 14

## Source-JSON staging (fields with no v2 app-table home)
- Historical payslips 69 · Attendance punches 899 · Work schedules 6 · Employees (full row, incl. statutory fields) 23
- Complete v1 GL preserved for accountant review (21L-C): journal entries 13 · journal lines 53

## Failed / excluded mappings (2)
| Tenant | Kind | Id | Reason |
| --- | --- | --- | --- |
| netsurf | journal | b2efdd1b-09d4-4ece-a0bd-5796110ae6a2 | imbalanced (v1 bug — excluded) |
| netsurf | journal | f8f42e15-d9dc-4090-a65a-dc1aec88c946 | line not single-sided (v1 quirk — excluded) |

## Operator notices — login & access (15)
> Non-fatal, PII-safe (opaque id + reason only). Preserved data needing an owner/HR/accountant decision before cutover — NOT exclusions.
- Summary: missing_login 8 · platform_admin 1 · platform_owner_candidate 1 · orphan_user 5

| Tenant | Kind | Id | Reason |
| --- | --- | --- | --- |
| flas-hxn1 | missing_login | 112de0e3-ca78-4f75-9b55-64dce5fff5a7 | employee has no login (null email / no migrated user) |
| flas-hxn1 | missing_login | 853f75ae-57ce-4f5b-bdbe-c53fcf64b4bf | employee has no login (null email / no migrated user) |
| flas-hxn1 | missing_login | da68da58-dc9f-4fa0-96a9-52cef59e759a | employee has no login (null email / no migrated user) |
| netsurf | platform_admin | zcmsOXSP55FOxoKGjtmfnW49zuoZiB4Q | v1 user.role=admin → cross-tenant platform owner; set PLATFORM_ADMIN_USER_ID |
| netsurf | missing_login | 0cb92689-4df6-4059-a3a0-ad26a3a50f2e | employee has no login (null email / no migrated user) |
| netsurf | missing_login | HR-EMP-00013 | employee has no login (null email / no migrated user) |
| netsurf | missing_login | HR-EMP-00012 | employee has no login (null email / no migrated user) |
| netsurf | missing_login | HR-EMP-00018 | employee has no login (null email / no migrated user) |
| netsurf | missing_login | HR-EMP-00009 | employee has no login (null email / no migrated user) |
| flas-hxn1+netsurf | platform_owner_candidate | 9ESRu2iMGiEmLJ7t6Vwf8kpcFfJlJL6D | elevated member of 2 tenants → PLATFORM_ADMIN_USER_ID candidate (super admin via admin plugin, not a tenant role) |
| (no tenant) | orphan_user | pgjoZKSci7Y8ySA9Qq2ytGsQHPnIRBFF | v1 user with no tenant membership — not migrated |
| (no tenant) | orphan_user | 4lrQ87dgxsw96NQW7o7Ivz67wkKp8zu1 | v1 user with no tenant membership (has a Google login) — not migrated; assign a membership if access is needed |
| (no tenant) | orphan_user | gjRSdbQKfD9QgEIwWYW3TCCB4b7ntiiU | v1 user with no tenant membership — not migrated |
| (no tenant) | orphan_user | fyNPVzfNa5Ai4YJ9qaPKEnsJDllKfEL9 | v1 user with no tenant membership — not migrated |
| (no tenant) | orphan_user | wInrd4TBhXTlu5VGAUjuOmRpqsgmYUUl | v1 user with no tenant membership (has a Google login) — not migrated; assign a membership if access is needed |

## What this proves
- The transform + load path writes valid v2-schema rows (org → user → member → employeeProfile → contract → shift → roster_entry → gl_account → gl_journal_entry/line → notification) with all FK constraints satisfied.
- Pay frequency is normalised v1-free-text → canonical v2 enum (e.g. "Fortnightly"/"Bi-Weekly" → `fortnightly`).
- Every migrated GL journal balances (Σ debits == Σ credits).
- Logins are PRESERVED (21N): user + member-role + account copied from v1; v1 owner→tenant_owner, admin→tenant_admin (not flattened); credential hashes carried verbatim (no reset); platform owner (user.role=admin) kept as a cross-tenant account.
- Tenants load in cutover order (Foreign Links pilot first) and are independently addressable by org id.

## Live run (operator)
Swap the synthetic provider for the v1-readonly loader and set `V1_DATABASE_URL` (read-only role), `V2_STAGING_DATABASE_URL` (disposable scratch), `CONFIRM_SCRATCH_WRITE=1`. No production writes occur in either mode.
