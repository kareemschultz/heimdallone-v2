# Finance — Implementation Plan (Phase 16A)

> **Phase group:** Finance · **Status:** 16A spec (docs only) · **Date:** 2026-06-07
> **Next migration:** 0019 · **Prereqs:** Payroll (Phase 8), Projects (Phase 14), HR Core (Phase 5) — all ✅

## 1. Thesis — a costing & budgeting **coordination layer**

Finance in Heimdallone is **not** a new transactional system. The "Finance product
group" (per the suite roadmap) is *mostly already built inside Payroll*:

| Product-group item | Where it already lives | Phase 16 action |
|---|---|---|
| Payroll payment batches | `payroll_payment_batch` + `payrollRouter.paymentBatches.*` (create/review/export/submit/markPaid/generateCsv) | **Cross-link** from Finance landing; do NOT move/duplicate |
| Bank exports | `paymentBatches.generateCsv` | Cross-link |
| Expenses / reimbursements | `reimbursement` (expense/leave_encash/bonus_encash) + `payrollRouter.reimbursements.*` | Cross-link |
| Loans & advances | `loan`/`loan_installment` + `payrollRouter.loans.*` (AC `loan`/`advance`) | Cross-link |
| **Department / job costing** | only a single-run `reports.costByDepartment` (gross/net, one run) | **BUILD** — time-series, employer contributions, project/job costing |
| **Budget vs actual** | — (does not exist) | **BUILD** — `finance_budget` (the one table Finance owns) |
| Accounting integrations | AC `journal`/`account` exist but **UNCONSUMED** | **DEFER** — out of Phase 16 scope (future) |

So Phase 16 delivers two genuinely new things on top of a read-only aggregation
surface: **(1) labour-cost reporting across time and dimensions**, and **(2)
budgets with variance**. Everything else Finance shows is read-only and
cross-linked.

### The guardrail (same as Helpdesk 13 / Projects 14 / Performance 15)

**Finance links, never owns.** It reads `payslip` / `payslip_line_item` (actuals),
`project_time_entry` (approved minutes), `contract` (rates), `department` /
`employee_work_info` (dimensions) — all **SELECT-only** — and OWNS exactly one
table: `finance_budget`. There are **ZERO writes** to payroll / attendance /
project / contract / employee from the finance router (grep-proven in 16I). It
**never** mutates `payrollStatus`, never re-runs payroll, never writes a payslip.
Cost figures are **read models**, not a second ledger.

## 2. Benchmarks (live research, June 2026)

Labour-costing / FP&A patterns surveyed: **Odoo Accounting/Analytic Accounting**
(analytic distribution = cost per analytic account/project), **ERPNext**
(cost centers + budget-vs-actual with stop/warn thresholds), **QuickBooks /
Xero** (class & location tracking; budget overview reports), **BambooHR /
Deel / Gusto** labour-cost reports (total cost of workforce = gross + employer
taxes + benefits), **Harvest / Toggl** (project cost = hours × bill/cost rate),
**Float / Runn** (capacity vs budget). Common denominators we adopt:

- **Total labour cost** = gross + **employer contributions** (the existing
  per-run report only shows gross/net — it omits employer NIS, the biggest
  hidden cost). Finance surfaces `total_employer_contributions` everywhere.
- **Analytic dimensions**: department, employment/work type, cost type
  (earning/deduction/tax/employer_contribution), project.
- **Project/job costing** = Σ approved time-entry minutes × a **cost rate**
  derived from the employee's active contract (`baseSalary` ÷ standard hours).
  We label this an **estimate** (it uses contract rate, not payslip allocation)
  — honest, like Harvest's "cost rate" vs "pay".
- **Budget vs actual** with a clear **variance** (budget − actual) and % used;
  no hard "stop", just surfaced over/under (we are reporting, not enforcing
  spend).

## 3. Data model (16B) — ONE owned table + migration 0019

Finance owns a single table. All reporting is computed at read time.

### `finance_budget`
| col | type | notes |
|---|---|---|
| id | cuid PK | |
| organizationId | orgRef | tenant scope |
| scope | enum `finance_budget_scope` | `organization` \| `department` \| `project` |
| scopeId | text nullable | department.id or project.id; NULL when scope=organization. **Soft ref — NOT a FK** (department/project may be archived; budget history must survive). Tenant-verified on write. |
| label | text | human name ("FY26 Engineering labour") |
| category | enum `finance_budget_category` | `labour` \| `total` (MVP: labour) |
| periodStart | date | inclusive |
| periodEnd | date | inclusive |
| currency | text | default org currency |
| budgetedAmount | numeric(14,2) | |
| notes | text nullable | |
| createdBy | text → user.id (set null) | |
| ...timestamps | | |

Constraints: `unique(organizationId, scope, scopeId, category, periodStart, periodEnd)`;
indexes on `(organizationId, scope)` and `(organizationId, periodStart)`.

**Why soft ref (not FK) for scopeId:** a budget is a historical financial record;
deleting/archiving a department or project must not cascade-delete or block the
budget. We tenant-verify the id on create/update (SELECT the dept/project in this
org) but store it as plain text. Mirrors the Projects CRM soft-ref decision.

**No other tables.** Cost reports, project costing, and variance are pure
aggregation queries — no `finance_cost_snapshot`, no `finance_ledger`. (A
materialized snapshot table is a documented future optimization if reports get
slow; not needed at current data volume.)

### Access control (16B) — new `finance` resource

Add to `packages/auth/src/permissions.ts`:
```
finance: ["read", "manage_budget", "export"],
```
Grants (byte-aligned in `role-helpers.ts` ↔ `rbac.ts`):

| role | read | manage_budget | export |
|---|---|---|---|
| owner / admin / hr_admin / payroll_admin | ✅ | ✅ | ✅ |
| auditor | ✅ | — | ✅ |
| manager | ✅ (scoped to own departments in handler) | — | — |
| employee / recruiter / helpdesk_agent / project_manager | — | — | — |

`journal` / `account` stay **unconsumed** (accounting integration deferred).
This is the **first router to consume `finance`** → `audit:permissions` rises
from **121/15 → ~124/16** (+3 pairs, +1 router). Expected, not a regression
(13B/14B/15B precedent).

RBAC helpers (new, byte-aligned both files):
- `canViewFinance(role)` = `canManagePayroll(role) || role === "auditor" || role === "manager"`
- `canManageBudgets(role)` = `canManagePayroll(role)`  *(owner/admin/hr_admin/payroll_admin)*
- `canExportFinance(role)` = `canManagePayroll(role) || role === "auditor"`
- `seesAllFinance(role)` = `canManagePayroll(role) || role === "auditor"` *(manager is department-scoped)*

## 4. API (16C) — `finance` router

Two-layer authz everywhere: AC gate (`authorizedProcedure("finance", …)`) +
handler scope (manager → own departments via `getDirectReportIds(me.id, oid)` →
their reports' departments; auditor/payroll → all; employee → FORBIDDEN).

### `costReports` (finance:read)
- `summary({ from, to })` → total labour cost over a payslip date range:
  `{ grossPay, totalDeductions, netPay, totalEmployerContributions, totalCost (gross+employer), employeeCount, payslipCount, currency }`. Sourced from `payslip` where `periodStart/periodEnd` intersect the range (status confirmed/paid only — drafts excluded, documented).
- `byDepartment({ from, to })` → array `{ departmentId, departmentName, grossPay, totalEmployerContributions, totalCost, employeeCount }` (improves the payroll single-run report: range + employer contributions). Manager-scoped.
- `byCostType({ from, to })` → grouped by `payslip_line_item.type` (earning/deduction/tax/employer_contribution) → `{ type, amount }`.
- `byEmploymentType({ from, to })` → grouped by contract `wageType`/`workType`.
- `trend({ from, to })` → per-pay-period series `{ payPeriodId, periodLabel, totalCost }` for charts.
- `projectCosting({ from, to })` → per project `{ projectId, projectName, hours, estimatedCost, contributorCount }` where `estimatedCost = Σ(approved time-entry minutes/60 × hourlyRate)` and `hourlyRate` derives from the contributor's active contract (`monthly baseSalary ÷ (workingDays×standardHours)`, `daily ÷ standardHours`, `hourly = baseSalary`). **Returned with `isEstimate: true`** + a method note. Only `status='approved'` entries counted.

### `budgets` (finance:read to view, finance:manage_budget to mutate)
- `list({ scope?, periodOverlaps? })`, `getById`
- `create` / `update` / `archive` (manage_budget) — tenant-verify `scopeId` against department/project in org
- `variance({ from, to, scope })` → for each budget overlapping the window:
  `{ budget, actualCost, variance (budgeted−actual), pctUsed }`. `actualCost`
  reuses `costReports.byDepartment`/`summary`/`projectCosting` depending on scope.

### `export` (finance:export)
- `costCsv({ report, from, to })` → returns `{ filename, csv }` for the chosen
  report (summary / byDepartment / projectCosting). Mirrors
  `paymentBatches.generateCsv` shape. No file write — string back to client.

### Activity
Reuses shared `audit_event` (no `finance_activity` table). Budget create/update/
archive write audit events (`entityType:"finance_budget"`). Read/report/export
procedures do **not** write (reads are not audited, consistent with other modules).

**Verify script:** `scripts/verify-finance-api.ts` — asserts: range cost math,
employer-contribution inclusion, department scoping (manager sees only own depts),
project costing estimate flag, budget CRUD + tenant-verify reject of foreign
scopeId, variance math, RBAC negatives (employee FORBIDDEN, manager no
manage_budget, auditor no manage_budget but yes export), and the **zero-write
guardrail** (a report call leaves payslip/project/contract untouched).

## 5. UI (16D–16H)

New **Finance** sidebar group (its own group, distinct from People & Payroll).
Visible to `canViewFinance` roles. Existing payroll routes stay where they are;
Finance **cross-links** to them.

- **16D — Finance overview + department costing.** Route `app/finance/index.tsx`
  + `app/finance/costing.tsx`. Overview = cost tiles (total labour cost, employer
  contributions, headcount, this-period vs last) from `costReports.summary` +
  `trend` chart + **cross-link cards** to existing Payroll payment-batches / loans
  / reimbursements (deep links, labelled "managed in Payroll"). Costing page =
  date-range picker + `byDepartment` table + `byCostType` breakdown. Manager sees
  only own departments; employee → no Finance nav entry.
- **16E — Project / job costing.** Route `app/finance/projects.tsx` —
  `projectCosting` table (project, hours, estimated cost, contributors) with the
  **"estimate — based on contract rate, not payslip allocation"** disclaimer
  prominently shown. Cross-links each project to `/app/projects/$id`.
- **16F — Budgets.** Route `app/finance/budgets.tsx` — budget list + create/edit
  dialog (scope picker org/department/project, period, amount), gated
  `canManageBudgets`. Auditor/manager read-only.
- **16G — Budget vs actual (variance).** Route `app/finance/variance.tsx` (or a
  tab on budgets) — `variance` report: budget vs actual bars, variance, % used,
  over/under badges (text-carrying, never colour-only).
- **16H — Export + polish.** CSV export buttons (gated `canExportFinance`) wired
  to `export.costCsv`; empty/error/loading states (error ≠ healthy empty —
  13H/15I lesson); `:focus-visible` rings on all interactive elements (#86);
  a11y pass on dialogs/tables.
- **16I — QA / RBAC / security / browser pass.** Parallel **read-only** review
  agents (security/RBAC/IDOR/redaction/cross-module guardrail + UI/a11y/copy/data).
  Browser-verify 5–6 roles. Grep-prove zero cross-module writes. Close Phase 16.

Routes: `/app/finance/{index, costing, projects, budgets, variance}`.
Feature dir `apps/web/src/features/finance/`. CSS `apps/web/src/styles/finance.css`.

## 6. RBAC summary (byte-aligned both files)

| capability | helper | roles |
|---|---|---|
| see Finance nav + reports | `canViewFinance` | payroll-mgrs ∪ auditor ∪ manager(scoped) |
| create/edit/archive budgets | `canManageBudgets` | payroll-mgrs |
| export cost CSV | `canExportFinance` | payroll-mgrs ∪ auditor |
| see ALL departments (vs own) | `seesAllFinance` | payroll-mgrs ∪ auditor |

Employees never see Finance (cost data is management-only). Manager is
department-scoped (own reports' departments) — IDOR-enforced in handlers, not just
nav-hidden.

## 7. Open questions → decisions

1. **New table for cost snapshots?** No — pure aggregation at read time. Snapshot
   table is a future perf optimization.
2. **Include draft payslips in cost?** No — confirmed/paid only (drafts are
   not committed cost). Documented in report copy.
3. **Project cost rate source?** Contract-derived hourly rate, flagged as
   estimate. (Payslip-level project allocation would need a new payroll↔project
   link we deliberately don't build.)
4. **Accounting (journal/account)?** Deferred — AC stays unconsumed; a future
   phase wires GL posting.
5. **Move payment-batches/loans/reimbursements into Finance nav?** No — leave the
   routes in Payroll (avoid route-shadow + breakage); Finance cross-links.
6. **Budget enforcement (block over-spend)?** No — report variance only; Finance
   is informational, not a spend gate.
7. **Multi-currency aggregation?** MVP assumes a single org currency for roll-ups
   (mixed-currency orgs get per-currency rows; documented limitation).

## 8. Sequence

16A spec ✅ (this doc) → 16B DB (`finance_budget` + enums + migration 0019 +
`finance` AC + seed) → 16C API (`finance` router + verify) → 16D overview+costing
→ 16E project costing → 16F budgets → 16G variance → 16H export+polish → 16I QA.

**Gates each phase:** `check-types` 3/3 · `build` 2/2 · `audit:permissions`
(121/15 → ~124/16 at 16C) · lint clean on changed files · web tsc 0 new touched
· verify-finance-{db,api}. Commit + push each checkpoint.
