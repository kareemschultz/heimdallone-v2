# Analytics / Executive Dashboards — Implementation Plan (Phase 18A)

> **Phase group:** Admin & Compliance (cross-cutting) · **Status:** 18A spec (docs only) · **Date:** 2026-06-07
> **Prereqs:** every operational module (Phases 5–17) ✅ — Analytics reads them all.
> Builds on the earlier [analytics-reporting-plan.md](analytics-reporting-plan.md) (Phase 7H,
> per-module charts) — this plan is the **cross-module executive layer** that one did not deliver.

## 1. Thesis — a read-only aggregation layer (link, never own)

Every module already surfaces its own reports/overviews (payroll `reports.dashboardSummary`,
finance cost reports, helpdesk/projects/performance/CRM dashboards, attendance/leave analytics).
What's missing is the **single executive view** that rolls those signals up across the whole
suite — People & Payroll · Operations · Finance · CRM — into one C-suite dashboard.

Phase 18 is therefore a **coordination/aggregation layer**, the same guardrail as Helpdesk/
Projects/Performance/Finance/CRM: the `analytics` router **READS** from every module's tables
(payslip, employee, attendance, leave, helpdesk, project, performance, finance_budget, crm_deal …)
**SELECT-only** and **OWNS nothing** (no new business table). It never writes a module's data;
KPIs are read models computed at read time. Money stays finance-redacted; everything respects
the same tenant scoping + RBAC as the source modules.

## 2. What exists vs the gap

| Already built | Phase 18 adds |
|---|---|
| Per-module reports/overviews/dashboards (each module) | One **cross-module executive dashboard** |
| `payroll.reports.dashboardSummary`, `finance.costReports.*` | An `analytics` router that **combines** them into suite-wide KPIs |
| Module-scoped RBAC | An `analytics` AC resource gating the exec view (exec/HR/finance see all; managers scoped) |
| `analytics-reporting-plan.md` per-module chart specs | The executive roll-up + trends those specs deferred |

## 3. Data model (18B) — NO new owned table

Analytics owns no business data. The only optional persistence is a tiny **`analytics_saved_view`**
(per-user saved dashboard filter/date-range) — **deferred** unless needed; MVP uses URL/query
state. So 18B is **AC-only** (no migration) in the MVP: add an `analytics` resource.

### Access control (18B)
Add to `permissions.ts`:
```
analytics: ["read", "export"],
```
Grants: owner/admin/hr_admin/payroll_admin read+export; auditor read+export; manager read
(department-scoped in handler); recruiter/helpdesk_agent/project_manager/sales_*/employee — none
(they have their own module dashboards). First consumer = the 18C router → audit rises (+2 pairs,
+1 router) — same precedent as every prior module's first router.

RBAC helpers (byte-aligned both files):
- `canViewAnalytics(role)` = `canManagePayroll(role) || role === "auditor" || role === "manager"`
- `canExportAnalytics(role)` = `canManagePayroll(role) || role === "auditor"`
- `seesAllAnalytics(role)` = `canManagePayroll(role) || role === "auditor"` (manager dept-scoped)

(Mirrors the Finance helper shape exactly — Analytics and Finance share the management audience.)

## 4. API (18C) — `analytics` router (read-only)

All procedures SELECT-only, tenant-scoped, money finance-redacted, manager department-scoped via
the Finance `financeDeptScope` pattern (reuse the helper or mirror it). Reuses existing module
queries where possible rather than re-deriving.

### `executive` group (analytics:read)
- `summary({ from, to })` → the suite KPI header:
  `{ headcount, activeContracts, payrollCostMTD, employerContributions, attendanceRatePct,
     leaveLiabilityDays, openHelpdesk, overdueHelpdesk, activeProjects, atRiskProjects,
     openDeals, pipelineValue, currency }` — each a single aggregate read from its module.
- `headcountTrend({ months })` → `[{ period, count }]` (employee_profile active by month).
- `payrollCostTrend({ from, to })` → reuses finance `costReports.trend` shape (per-period total).
- `pipelineByStage()` → CRM open-deal value by stage (reuses crm deal aggregation).
- `workforceMix()` → headcount by department / employment type (for a donut).
- `attentionFeed()` → cross-module "needs attention" roll-up (overdue helpdesk + at-risk projects
  + stalled deals + overdue follow-ups + pending approvals), each capped + labelled by source.

### `export` group (analytics:export)
- `summaryCsv({ from, to })` → CSV of the KPI summary (injection-safe `csvCell`, the payroll lesson).

### Guardrail
ZERO writes (no `db.insert/update/delete` anywhere in the router) — grep-proven in 18I. Reads only.
No `analytics_*` table. Activity/audit: reads aren't audited (consistent with other read surfaces).

**Verify:** `scripts/verify-analytics-api.ts` — KPI math, money redaction, manager dept-scope
(⊆ admin), RBAC negatives (employee/recruiter blocked; manager no-export), zero-write guardrail.

## 5. UI (18D–18H)

- **18D — Executive dashboard.** Route `app/analytics/index.tsx` (+ a sidebar entry under a new
  **Insights**/Admin group, or fold into the existing `/app` overview gated by canViewAnalytics).
  KPI stat tiles (headcount, payroll cost, attendance rate, leave liability, open helpdesk, active
  projects, pipeline value) + the cross-module attention feed. Reuse the StatTile primitive from
  analytics-reporting-plan; charts via shadcn Chart (Recharts) respecting tokens.
- **18E — Trends + breakdowns.** Headcount trend (area), payroll-cost trend (line), pipeline-by-
  stage (bar), workforce mix (donut). Editable date range; CSV export (gated canExportAnalytics).
- **18F — Polish + a11y.** error≠empty on every widget; `:focus-visible` rings; charts have text
  alternatives (a table fallback / aria-label) — charts must not be the only encoding.
- **18I — QA / RBAC / security pass.** Parallel read-only review agents; grep-prove zero writes;
  browser-verify roles (exec/HR sees all; manager scoped; employee/recruiter no access). Close 18.

Routes: `/app/analytics` (+ optionally `/app/analytics/trends`). Feature dir
`apps/web/src/features/analytics/`. CSS `apps/web/src/styles/analytics.css`. Reuse the chart
primitive once (shadcn Chart) — install if not present.

## 6. Open questions → decisions
1. **New table?** No — pure read aggregation. `analytics_saved_view` deferred (URL state in MVP).
2. **Real-time vs cached?** Real-time queries (org sizes are modest); materialized aggregates are
   a documented scale-phase follow-up (carried over from analytics-reporting-plan §Q4).
3. **Charts library?** shadcn Chart (Recharts) per the 7H plan — tokens, no hardcoded hex.
4. **Manager scope?** Department-scoped (own + reports), reusing the Finance scope helper — a
   manager's exec view shows their slice, not the whole org.
5. **Separate route vs `/app` overview?** Separate `/app/analytics` route (keeps the existing
   per-role `/app` landing intact; the exec dashboard is opt-in via nav) — revisit in 18D.

## 7. Sequence
18A spec ✅ → 18B AC (`analytics` resource + helpers; no migration) → 18C `analytics` router +
verify → 18D exec dashboard → 18E trends/breakdowns + export → 18F polish → 18I QA.

**Gates each phase:** check-types 3/3 · build 2/2 · audit (+2/+1 at 18C) · web tsc baseline ·
verify-analytics-api · lint clean. Commit + push each checkpoint.
