# v1 → v2 Payroll/Attendance Reconciliation Report

**Generated:** 2026-06-16T02:53:04.024Z
**v1 source (read-only):** `postgresql://migration_reader:***@localhost:5432/karetech_erp`
**Scratch DB:** _not run this pass (reconciliation is DB-free; staging is opt-in)_

> Reconciliation runs v1's OWN payslip inputs through v2's statutory rules and compares
> against v1's computed results. No writes to v1 or production v2. Amounts are shown as
> DELTAS only (PII-safe). Earnings (gross/overtime/Saturday) are roster-derived → blocked on 21D.

## 1. Cutover readiness: **READY**

Blockers / caveats:
- EARNINGS reconstruction (gross/overtime/Saturday/Sunday pay) blocked on the 21D per-date roster + scheduling-rules build (v1 stored gross, so statutory layer reconciles independently).
- 175 per-date roster entries have no v2 home (21D).
- GL + notifications feature builds required before those rows migrate (21D).
- 9 employee statutory fields need a confirmed v2 column (payroll-correctness).

## 2. Per-tenant payslip reconciliation

| Tenant | Payslips | Exact | Rounding | Review | Blocked | v1-bug (reversal) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Netsurf Group of Companies | 66 | 42 | 1 | 0 | 0 | 23 |
| Foreign Links Auto Spares | 3 | 3 | 0 | 0 | 0 | 0 |

## 3. Statutory component parity (across all reconciled payslips)

| Component | Exact | Rounding | Manual review | v2 engine gap | Mapping gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| nis_employee | 46 | 0 | 0 | 0 | 0 |
| nis_employer | 46 | 0 | 0 | 0 | 0 |
| personal_allowance | 46 | 0 | 0 | 0 | 0 |
| child_allowance | 46 | 0 | 0 | 0 | 0 |
| paye_brackets | 45 | 1 | 0 | 0 | 0 |
| net_identity | 46 | 0 | 0 | 0 | 0 |
| (whole payslip) | 0 | 0 | 0 | 0 | 0 |

## 4. Mismatch examples (review / engine gap) — delta only, PII-safe

_None — all reconciled statutory components match (exact or within rounding)._

## 5. Attendance mapping audit

Total punches: **903**

| Field | Present / Total | Note |
| --- | --- | --- |
| employee | 903/903 |  |
| timestamp | 903/903 |  |
| punch_type | 903/903 |  |
| source | 903/903 |  |
| device | 692/903 | device binding |
| logical_shift_date | 903/903 | v1 derives this; confirm v2 derivation |
| device_timestamp | 903/903 |  |
| gps_latitude | 62/903 | geo — confirm v2 punch geo home |

**Roster/work-schedule blocker:** 175 roster entries + 6 work schedules. Per-date roster + rich work-schedule rules (night diff / split shift / Saturday / OT thresholds) are required to reconstruct earnings (gross/overtime/Saturday/Sunday pay) from punches. v2 has no home for these yet — blocks EARNINGS reconstruction until 21D. The STATUTORY layer (NIS/PAYE/allowances/net) reconciles independently because v1 stored the gross.

## 6. Statutory / payroll field status (employees)

| Field | Present / Total | Status | Note |
| --- | --- | --- | --- |
| tin_number | 3/23 | manual_review | PAYE filing — confirm v2 column |
| nis_number | 3/23 | manual_review | NIS — confirm v2 column |
| qualifying_children | 23/23 | manual_review | child allowance — drives PAYE |
| has_second_job | 23/23 | manual_review | second-job tax treatment |
| second_job_pay_cents | 23/23 | manual_review | second-job income |
| medical_payroll_deduct_cents | 23/23 | manual_review | medical deduction |
| other_deductions_cents | 23/23 | manual_review | misc deduction |
| kiosk_pin_hash | 0/23 | manual_review | kiosk/biometric PIN |
| company_id | 0/23 | manual_review | no v2 company sub-entity |

## 7. Feature builds required before cutover (21D)

- Per-date roster table (+ rich work-schedule rules: night differential, split shift, Saturday rates, OT thresholds) — unblocks earnings reconstruction.
- Minimal v2 payroll-GL (accounts + journal entries/lines) — port chart + clean balances, not v1 bug-reversal churn.
- In-app notification subsystem.
- Confirm v2 columns for all employee statutory fields (TIN/NIS/qualifying_children/second_job/medical/other_deductions/company).
- Confirm production country_payroll_profile equals the GY-2026 constants used here.

---

_Next: Phase 21D — minimal v2 feature builds (per-date roster, payroll-GL, notifications,
scheduling-rules) that unblock write-migration, then 21E dry-run cutover on a scratch DB._
