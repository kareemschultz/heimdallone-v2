# Phase 16I — Finance QA / RBAC / security pass (closes Phase 16)

Two parallel **read-only** review agents audited the whole Finance module
(16B schema → 16D-G UI): one for security / RBAC / IDOR / cross-module guardrail,
one for UI / a11y / copy / data integrity.

## Result: no critical / high findings. Module guardrails held.

### Security / RBAC / guardrail (agent A) — CLEAN
- **Cross-module write guardrail HELD.** Every `db.insert/update/delete` in
  `finance.ts` targets **only `financeBudget`** (+ shared `audit_event`). Zero
  writes to payroll / payslip / attendance / project / contract / employee;
  payrollStatus never touched. All payroll/project/contract/department access is
  SELECT-only.
- **Tenant isolation** — every data path is org-filtered (payslip, line items
  via the org-filtered payslip join, projectTimeEntry, contract, payrollSetting,
  department, financeBudget).
- **IDOR / manager dept-scope is consistent across ALL read procedures** —
  summary / byDepartment / byCostType / trend / projectCosting / budgets.list /
  getById / variance / export.costCsv all apply `financeDeptScope`. No
  sibling-asymmetry leak. project-costing is management-only (scoped managers get
  empty). A scoped manager can never obtain org-wide or other-department cost or
  budget figures.
- **Soft scopeId** tenant-verified against a real dept/project in the caller's
  org on create/update (foreign-org id → BAD_REQUEST).
- **RBAC byte-aligned** — the 4 helpers are identical in `role-helpers.ts` and
  `rbac.ts` and don't over-grant vs the `finance` AC (manage_budget = payroll
  managers only; export includes auditor; manager view-only + scoped; employee/
  recruiter/helpdesk/PM blocked at the gate).
- **CSV export** uses the hardened formula-injection-safe encoder.

### UI / a11y / copy (agent B) — clean except small items
- **Error ≠ empty** correctly applied in every query-backed section (overview,
  trend, dept, cost-type, project, budgets, variance).
- **Copy honesty** — "generated payroll cost … not cash already disbursed" on
  overview; project costing flagged "Estimate"; budgets framed as a target, not
  a spend gate.
- **Data correctness** — totalCost = gross + employer everywhere; variance
  sign/label/bar consistent; pctUsed "—" when null; money via `formatMoney`; no
  raw enum/id as primary text.
- A11y — dialog has role/aria-modal/aria-labelledby + labelled inputs; tables
  have headers; badges carry text; `:focus-visible` rings cover all interactive
  elements.

## Fixes applied this pass
1. **varianceTone(0)** returned `warning` while the label said "On budget" →
   now returns `neutral` (cosmetic consistency).
2. **Budget dialog Escape-to-close** added (a11y). Focus-trap remains the
   documented app-wide deferred pattern (Phase 13H).
3. **Defense-in-depth** — `budgets.update` / `budgets.remove` mutation WHERE
   clauses now also filter `organizationId` (already guarded by a preceding
   org-scoped existence SELECT; this makes the mutation self-contained).

## Deferred / documented as intentional (not defects)
- **Budget delete has no confirm step** — consistent with sibling modules (no
  shared ConfirmDialog pattern; `window.confirm` is lint-banned). App-wide
  follow-up.
- **Dialog focus-trap** — app-wide deferred pattern (13H).
- **`financeDeptScope` dept query without an explicit org join** — `empIds` are
  already strictly org-bound via org-scoped resolvers; not a leak.
- **Auditor sees full-org cost/budget figures** — intentional (auditor is a
  full-org read+export role; `seesAllFinance` true).
- **Inflated employer-contribution figures** in the demo (employer 18.4M vs
  gross 6.2M) are a **pre-existing payroll-seed data quirk** — Finance faithfully
  reports payroll actuals; not a Finance defect.

## Gates
check-types 3/3 · build 2/2 · audit 124/16 · web tsc 7 (0 new touched) ·
verify-finance-api **35/35** · verify-finance-db **26/26** · lint clean.

**PHASE 16 FINANCE COMPLETE.**
