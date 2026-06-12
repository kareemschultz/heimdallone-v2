# Phase 21D-B — Payroll-engine frequency-proration fix (+ 21D-C reconciliation proof)

**Date:** 2026-06-12
**Status:** ✅ complete (TDD; real-money engine code)
**Predecessors:** [21C reconciliation](./phase-21c-payroll-attendance-reconciliation.md) ·
[21D-A plan](../architecture/payroll-tax-engine-plan.md)
**Source of truth:** GRA (gra.gov.gy) — see [[reference-gra-payroll]].

## The bug (found in 21C)
v2's payroll-engine applied the **flat monthly** personal allowance (GYD 140,000) to **every** pay
period. GRA prorates it by frequency (fortnightly $64,615 = 140,000×12/26). The same flaw affected the
tax band ceiling, NIS ceiling, child allowance, and OT/insurance caps — `contract.payFrequency` was
carried into the engine but never read.

## The fix (TDD)
A single proration layer, country formulas untouched:
- **`packages/payroll-engine/src/proration.ts`** — `periodsPerYear(freq)` (weekly 52 / fortnightly 26
  / semi-monthly 24 / monthly 12) and `prorateProfile(profile, freq)` which converts the monthly-
  magnitude statutory **amounts** to the period (`×12/periodsPerYear`, rounded to the cent). **Rates
  are not prorated.** Monthly is the identity (no regression).
- **`calculate.ts`** — builds `ctx.periodProfile = prorateProfile(input.countryProfile,
  contract.payFrequency)` once and uses it for ALL statutory math (NIS, personal/child allowance,
  PAYE bands, OT split, insurance cap). `projected-pay.ts` inherits it (delegates to `calculatePayroll`).

### Tests (written first, watched fail, then implemented)
- `proration.test.ts` — 6 unit tests pinning the exact GRA per-period values (fortnightly PA
  6,461,538 cents = $64,615.38; NIS ceiling 12,923,077; child 461,538; weekly PA 3,230,769; monthly
  identity; rates unchanged).
- `calculate.test.ts` — fortnightly employee gets PA = 6,461,538 (not 14,000,000) and owes PAYE > 0;
  monthly identity guard. **Engine suite: 35/35 pass.**

## 21D-C — reconciliation proof against live v1
Updated `reconcile-payslips.ts` to prorate by each payslip's frequency (mirrors the engine), then
re-ran `migration:reconcile` (read-only v1):

| | before fix | after fix |
| --- | --- | --- |
| personal_allowance | 3 exact / 43 `v2_engine_gap` | **46/46 exact** |
| readiness | BLOCKED | **READY** |

Netsurf: 42 exact + 1 rounding + 23 v1-bug (reversals); Foreign Links: 3 exact. NIS/child/net all
46/46 exact; PAYE brackets 45 exact + 1 rounding. **The 43 fortnightly payslips now reconcile exact —
certified against both v1 and GRA.**

## Scope note
This is the focused frequency-proration fix. The larger **effective-dating** architecture from 21D-A
(resolve-by-pay-date, annual re-base, per-payslip rule-version audit, contractor/project billing,
filing) remains as 21D-A's roadmap — separable follow-ups. This change keeps constants at monthly
magnitude and converts month→period, which is the minimal correct fix and leaves monthly payroll
byte-identical.

## Gates
check-types 3/3 · build 2/2 · audit 149/18 · engine tests 35/35 · lint clean on changed files ·
`migration:reconcile` READY. Lesson #89 (reconcile against the authority, prorate period constants).
