# Phase 21X — v1→v2 Data Completeness & Feature-Gap Audit (2026-06-16)

Driven by owner acceptance testing on the live app. This audits, per domain,
what v1 actually contained and what reached v2 — and separates **migration gaps**
(v1 had data we didn't bring) from **empty in v1** (nothing to migrate) from
**feature gaps** (v2 capability not built). Source: live `karetech_erp`
(read-only) vs `heimdallone_v2_prod`.

## Migration completeness by domain

| Domain | v1 has | In v2 now | Verdict |
|--------|--------|-----------|---------|
| Employees (core) | 23 | 23 | ✅ migrated |
| Employee **profile extras** | phone ×16, DOB ×1, emp# ×23 | **backfilled** phone 16 / DOB 1 / badge 23 | ✅ fixed this pass (v1 itself only had DOB for 1 person) |
| Statutory (TIN/NIS/children) | 23 | 23 | ✅ migrated (satellite) |
| Contracts | 18 | 18 | ✅ migrated (hourly/fortnightly correct) |
| Payslips (history) | 46 non-reversal (+23 v1-bug) | 46 + line breakdown | ✅ migrated + reconciled vs GRA |
| Per-payslip **allowances** | transport/holiday/OT/etc. | ✅ as payslip line items | ✅ transferred |
| Shifts / roster / shift-rules | 6 / 175 / 6 | 6 / 175 / 6 | ✅ migrated |
| GL accounts / journals | 11 / 11 | 11 / 11 | ✅ migrated |
| **Leave policies** | **6** | 0 | 🔴 GAP — migrate next |
| **Leave balances** | **36** | 0 | 🔴 GAP — migrate next |
| **Leave requests** | **2** | 0 | 🔴 GAP — migrate next |
| **Salary-structure assignments** (recurring allowance/pay config) | **33** | 0 | 🟠 GAP — feeds go-forward payroll (not historical) |
| Departments / job positions | (ids only, no names staged) | 0 | 🟠 needs v1 names pull or manual |

## Empty in v1 — nothing to migrate (modules ready for go-forward use)

- **Appraisals**: `appraisals` 0, `appraisal_cycles` 0, `appraisal_kra_scores` 0, `goals` 0.
- **Disciplinary**: `disciplinary_actions` 0, `disciplinary_records` 0, `disciplinary_categories` 0.
- `salary_structure_templates` 0, `insurance_premium_deductions` 0, `leave_encashment_requests` 0, `onboarding_checklist_templates` 0.

→ v1 never used Performance/Appraisals or Disciplinary. There is **no data to
bring over**; v2's Performance module (and disciplinary, where present) is
available for fresh go-forward use.

## Feature gaps (v2 capability, not a migration issue)

- **Payslip customisation/templates** — v2 ships a "Classic" template; "Modern /
  Compact / Detailed / Statutory" are labelled *coming later*. v1's customisable
  payslip layouts are **not yet built** in v2. (Build item.)
- **Preview modules** (Countries & Tax, Compliance, Documents, Clients) are
  admin-gated scaffolds on sample data — **not built out**. (Build items.)
- **Attendance corrections DO exist** (`attendance.corrections.create`, gated
  `canCorrectAttendance`; Attendance page → record actions). Some other pages
  still need fuller CRUD parity — to be swept.

## Device sync (how it connects)

The registered ZKTeco device uses **API-ingest (push)** mode: it does not have a
"Sync now" button because **the on-site poller (Raspberry Pi pyzk bridge) pushes**
punches to `https://api.heimdallone.com/rpc/biometric/ingest/submit` using the
device's one-time **ingest key** (from Time clocks → Register device, or rotate on
the device detail page). The device shows *Inactive / never synced* until the Pi
posts; then sync-runs + last-sync populate on the device detail. **Connecting it
is an operator step on the Pi** (set device id + ingest key + endpoint), keeping
the v1 Gist script as rollback until verified.

## Recommended next build order

1. **Leave migration** — policies (6) + balances (36) + requests (2) into the v2
   effective-dated leave schema (employee-mapped, reconciled).
2. **Salary-structure assignments (33)** → v2 recurring pay-items so go-forward
   payroll carries the same allowances (per-payslip history already correct).
3. **Departments/job positions** — pull names from v1 (read-only) + link.
4. **Payslip templates** + **preview module build-out** (Countries & Tax first —
   it can surface the real GY-2026 profile).
5. **CRUD parity sweep** + a11y label sweep.
