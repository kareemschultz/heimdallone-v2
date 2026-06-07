# Phase 16D–16G — Finance UI (overview · costing · project costing · budgets · variance)

The Finance product-group surface, built on the 16C router. New sidebar group
**Finance** (Landmark icon) visible to `canViewFinance` (payroll-mgrs ∪ auditor ∪
manager-scoped); employees/recruiter/helpdesk/PM never see it. Five routes under
`/app/finance/{index, costing, projects, budgets, variance}` + `FinanceTabs`.

UI compresses the planned 16D–16G checkpoints into one verified pass (overview +
costing = 16D, project costing = 16E, budgets = 16F, variance = 16G; export
buttons + dialog-scroll polish folded in). Also carries the **16C security fix**
flagged by the automated commit review: `budgets.list` / `budgets.getById` now
apply `financeDeptScope` (managers see only their department budgets — was
returning all-org), matching `budgets.variance`.

## Browser-verified (3 roles, 6 screenshots, server :3000 + web :3002)

- **admin** (`admin-overview.png`, `admin-costing.png`, `admin-variance.png`,
  `admin-project-costing.png`, `admin-budgets-created.png`):
  - Overview tiles with REAL data — Total labour cost **GYD 24,574,289** = Gross
    6,206,429 + Employer contributions 18,367,860; 8 employees, 16 payslips;
    trend table; cross-link cards to Payroll payment-batches/loans/reimbursements.
  - Cost by department — 4 departments (Engineering/HR/Finance/Operations) with
    gross + employer + total; by-cost-type breakdown (Earnings/Deductions/Tax/
    Employer contributions).
  - Budgets — 4 budgets with Edit/Remove; **create write-path** exercised (added
    "VERIFY browser budget" → 5 rows, then **Remove** → back to 4).
  - Budget vs actual — all 4 budgets with budgeted/actual/variance/%used/status;
    math consistent with summary (org 48M budget vs 24.57M actual = 51.2% used).
  - Project costing — "Estimate" disclaimer, 2 projects with hours/contributors/
    estimated cost, deep-links to `/app/projects/$id`; Network Upgrade 16,267
    matches the variance actual.
- **manager** (`manager-costing-scoped.png`, `manager-budgets-scoped.png`):
  - Cost by department shows **only Operations** (their team) vs admin's 4;
    **no Export CSV** button (no finance:export).
  - Budgets show **only the Operations department budget** — NOT the org-wide
    (48M), Engineering (14M), or project budgets; **no New/Edit/Remove** (read
    only). Proves the budgetsList/getById dept-scope security fix end-to-end.
- **employee** (`employee-no-access.png`): **no Finance nav entry** + the route
  renders "You don't have access to Finance".

0 app console errors (favicon 404 only).

## Known minor item (fixed)
Budget dialog could push its Save button below the fold on short viewports →
added `max-height: calc(100vh - 40px)` + `overflow-y: auto` to `.fn-dialog`.

## Gates
check-types 3/3 · build 2/2 · audit 124/16 · web tsc 7 (0 new touched) ·
verify-finance-api 35/35 · verify-finance-db 26/26 · lint clean on changed files.
