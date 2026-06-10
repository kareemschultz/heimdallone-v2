# Phase 18I — Analytics QA / RBAC / security pass (closes Phase 18)

## Result: guardrails held; no critical/high.

### Cross-module write guardrail — HELD (grep-proven)
`packages/api/src/routers/analytics.ts` contains **zero** `db.insert/update/delete`,
no `db.transaction`, and not even a `createAuditEvent` — it is pure read
aggregation. Analytics OWNS no table; every query is SELECT-only against
employee_profile / contract / payslip / helpdesk_request / project / crm_deal /
crm_pipeline_stage / department.

### RBAC + scoping
- AC gate (`authorizedProcedure("analytics", read|export)`) + handler scope
  (`analyticsScope`): seesAllAnalytics (owner/admin/hr_admin/payroll_admin/
  auditor) → whole org; manager → own + direct-reports' departments (dept
  dimensions) and own + reports' employees (helpdesk/CRM owner/requester).
- Helpers byte-aligned `role-helpers.ts` ↔ `rbac.ts`; the analytics audience is
  a subset of the finance audience, so money is not separately redacted.

### Verification
- **verify-analytics-api 25/25** — admin whole-org (headcount 10, not scoped);
  manager scoped (headcount 4 ⊆ 10, projects 0 ⊆ 2, deals 2 ⊆ 3, `scoped:true`);
  auditor == admin; payroll not scoped; trend/pipeline/workforce/attention
  shapes; CSV export (admin + auditor); RBAC negatives all FORBIDDEN
  (employee/recruiter summary, employee export, **manager export**, recruiter
  workforceMix).
- **Browser, 3 roles** (screenshots in `../phase-18d/screenshots/`):
  - admin — full dashboard, primary `oklch(0.6 0.1 260)` (navy Corporate).
  - manager — dashboard renders, **"your team's departments only"** note,
    **no Export CSV** button, Analytics nav present (`analytics-manager-scoped.png`).
  - employee — no-access state, no data, **no** Analytics nav entry.

### Documented (intentional, not defects)
- At-risk projects + overdue helpdesk are read-model heuristics (health is
  derived, not stored) — see 18A §6.
- Employer contributions > gross in seed = pre-existing payroll-seed quirk
  (16C); Analytics reports payroll actuals faithfully.
- Charting uses CSS bars (no Recharts) to match the app's existing report
  charts; a shadcn-chart upgrade is an optional later polish.

## Gates
check-types 3/3 · build 2/2 · web tsc 7 (0 new) · lint clean · audit 149/18 ·
verify-analytics-api 25/25.

**PHASE 18 ANALYTICS COMPLETE.**
