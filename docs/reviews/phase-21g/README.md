# Phase 21G — Effective-Dating · QA Pass (21G-I)

**Date:** 2026-06-14 · **Status:** ✅ CLOSED · **Audit:** 161/21 (unchanged across 21G)

Phase 21G makes statutory rules **effective-dated** — resolved by the event date
(pay date, leave request date, work date), not by a mutable "current rule" flag —
and adds a bitemporal historical payslip correction workflow. This is the QA
record closing the phase.

## Sub-phases delivered

| Sub-phase | What | Proof |
| --- | --- | --- |
| 21G-A | Spec (`effective-dating-implementation-plan.md`) | docs |
| 21G-B | Schema + migration `0023` (`effectiveFrom/effectiveTo`, `isActive`→`isPublished`, `weekendDays`, `ruleVersionLabel`, `payslip_correction`) | 15/15 ephemeral-DB (prior session) |
| 21G-C | Payroll resolve-by-pay-date + honor run pin | `verify:payroll-resolver` 8/8 + engine 12 unit |
| 21G-D | Leave resolve-by-request-date + server-computed days (H10) | `verify:leave-resolver` 13/13 |
| 21G-E | Workweek/weekend classifier from tenant config (H3) | `verify:workweek` 13/13 |
| 21G-G | Historical payslip correction workflow (API) | `verify:payslip-correction` 11/11 |
| 21G-F | UI rule-version label + original-vs-corrected panel | web tsc 5 (baseline), browser deferred |
| 21G-I | This QA pass | all gates + independent review |

## Guardrails — independently verified (read-only adversarial review)

All 7 mandated categories returned **CLEAN** (no critical/high/medium):

1. **Tenant isolation** — every resolver/query filters by `organizationId`
   (payroll-profile-resolver, leave-policy-resolver, computeCorrection's payslip/
   run/period scope, correction list/getById, resolveDayTypeConfig).
2. **Cross-module write guardrail** — the correction transaction writes ONLY
   `payslip_correction` (insert) + `payslip.supersededByCorrectionId`
   (back-pointer). No `gl_*`/journal writes anywhere in payroll. The GL
   adjustment is recorded as an obligation (`pending`/`not_required`) and posted
   via the GL module.
3. **Historical immutability** — `applyPayslipCorrection`'s only `update(payslip)`
   sets exclusively `supersededByCorrectionId` + `updatedAt`; original money
   columns are read-only.
4. **RBAC** — all 4 correction procs gate on `canManagePayroll`; apply also sits
   on `payroll:update`.
5. **Resolve-by-date** — half-open `[from, to)` window correct, no off-by-one on
   the exclusive `effectiveTo` boundary (UTC day granularity).
6. **H10 (leave)** — `requestsCreate` uses the server-computed `serverDays` for
   both the balance check and the persisted value; the client `requestedDays` is
   accepted in the schema but never read in the handler (advisory only).
7. **Weekend classifier** — reads tenant `weekendDays`, byte-identical for the
   default Sat/Sun tenant; a tenant whose Sunday is a working day is now bucketed
   correctly.

### Documented LOW items (intentional, in-code)

- Multi-country resolve-by-date resolves among all the org's published profiles
  (correct for the single-country reality; a country filter is the forward step —
  the country-specific primitive `resolveCountryPayrollProfileAsOf` already
  exists). Still org-scoped — not a tenant leak.
- The classifier now returns `holiday` when a holiday matches (the deliberate
  21G-E fix; gated on a non-empty holiday calendar, so no-holiday tenants are
  unaffected).

## Gates (this pass)

- `check-types` 3/3 · `build` 3/3 · `audit:permissions` **161/21** · engine
  **59/59** · docs build 14 pages + lint 0.
- 21G verify scripts: `verify:payroll-resolver` 8/8 · `verify:leave-resolver`
  13/13 · `verify:workweek` 13/13 · `verify:payslip-correction` 11/11.
- Lint baseline unchanged (changed files clean); web tsc 5 (baseline, 0 new).

## Deferred (tracked, not blocking)

- `migration:reconcile` 46/46 — structurally preserved (engine compute path
  byte-unchanged; reconcile imports none of the 21G files). Live run needs the
  read-only v1 `V1_DATABASE_URL` (operator Infisical session).
- 21G-F browser verification (no running app/auth in this session).
- 21G-G: corrected-payslip row + actual GL posting + exportable report; in-screen
  "run a correction" action button; `weekendDays` settings UI.
- Multi-country country-filtered resolution (use `resolveCountryPayrollProfileAsOf`
  in the run-create/correction paths when multi-country lands).

**Phase 21G complete.**
