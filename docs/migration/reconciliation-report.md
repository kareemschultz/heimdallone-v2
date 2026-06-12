# v1 → v2 Payroll/Attendance Reconciliation Report

**Generated:** 2026-06-12T18:14:13.119Z
**v1 source (read-only):** `postgres://heimdallone:***@172.19.0.2:5432/karetech_erp`
**Scratch DB:** _not run this pass (reconciliation is DB-free; staging is opt-in)_

> Reconciliation runs v1's OWN payslip inputs through v2's statutory rules and compares
> against v1's computed results. No writes to v1 or production v2. Amounts are shown as
> DELTAS only (PII-safe). Earnings (gross/overtime/Saturday) are roster-derived → blocked on 21D.

## 1. Cutover readiness: **BLOCKED**

Blockers / caveats:
- EARNINGS reconstruction (gross/overtime/Saturday/Sunday pay) blocked on the 21D per-date roster + scheduling-rules build (v1 stored gross, so statutory layer reconciles independently).
- 175 per-date roster entries have no v2 home (21D).
- GL + notifications feature builds required before those rows migrate (21D).
- 9 employee statutory fields need a confirmed v2 column (payroll-correctness).

## 2. Per-tenant payslip reconciliation

| Tenant | Payslips | Exact | Rounding | Review | Blocked | v1-bug (reversal) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Netsurf Group of Companies | 66 | 3 | 0 | 0 | 40 | 23 |
| Foreign Links Auto Spares | 3 | 0 | 0 | 0 | 3 | 0 |

## 3. Statutory component parity (across all reconciled payslips)

| Component | Exact | Rounding | Manual review | v2 engine gap | Mapping gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| nis_employee | 46 | 0 | 0 | 0 | 0 |
| nis_employer | 46 | 0 | 0 | 0 | 0 |
| personal_allowance | 3 | 0 | 0 | 43 | 0 |
| child_allowance | 46 | 0 | 0 | 0 | 0 |
| paye_brackets | 45 | 1 | 0 | 0 | 0 |
| net_identity | 46 | 0 | 0 | 0 | 0 |
| (whole payslip) | 0 | 0 | 0 | 0 | 0 |

## 4. Mismatch examples (review / engine gap) — delta only, PII-safe

| payslip id | component | delta (cents) | note |
| --- | --- | ---: | --- |
| fc0427ea-4d0f-4d40-af49-d2741b8eee74 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 0c897bff-a28d-4aef-a997-df870014aebd | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 70912366-d3b6-4764-84e1-a42dd014a8f7 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| ca6d0a2b-cbea-4323-92af-5dbad020062a | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 12ab6a25-3d23-455d-901c-4e74e3e682f8 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| c42f6daa-771e-4f21-9d5b-3d40b2187180 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 79c8d7f3-5f41-4b4d-98f6-81512afb14bc | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 1737259f-580b-46fc-9457-9b4288fcfc0e | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| c04078cf-407a-4c52-8ea1-f8749aa966f9 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 2784daab-b0f8-4626-8895-f8607af3bf24 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| cb60670d-c01d-48be-8a97-c0f842528eb7 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| b7a7a061-9600-4973-9f4d-6b56e14093d2 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| ff5f78b1-e876-4ace-ac94-8651ecac49a1 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 75e10281-396e-45ef-9041-a850f5913d3e | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |
| 95003e70-54ab-4bec-aebd-30168073a075 | personal_allowance | 7538462 | v2 applies full monthly personal allowance; v1 prorates to fortnightly pay period (fortnightly = x12/26) — v2 engine needs frequency proration before cutover |

## 5. Attendance mapping audit

Total punches: **880**

| Field | Present / Total | Note |
| --- | --- | --- |
| employee | 880/880 |  |
| timestamp | 880/880 |  |
| punch_type | 880/880 |  |
| source | 880/880 |  |
| device | 675/880 | device binding |
| logical_shift_date | 880/880 | v1 derives this; confirm v2 derivation |
| device_timestamp | 880/880 |  |
| gps_latitude | 57/880 | geo — confirm v2 punch geo home |

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
