# Phase 18D–18F — Executive dashboard UI (Analytics)

Route `app/analytics/index.tsx` — the cross-module executive overview, the
first surface built on the new shared `StatTile` primitive + Corporate navy
theme.

## What shipped
- **Sidebar**: new **Insights** nav group → **Analytics** (`BarChart3`),
  visible to the analytics audience (owner/admin/hr_admin/payroll_admin/auditor
  via `canViewPayroll` see-all; `manager` via `MANAGER_VISIBLE_KEYS`).
  recruiter / helpdesk_agent / project_manager / sales_* / employee — hidden.
- **KPI tiles** (shared `StatTile` + `StatTileGrid`): Headcount, Active
  contracts, Payroll cost, Employer contributions, Open helpdesk (warning tone
  + overdue hint), Active projects (at-risk hint), Open deals, Pipeline value.
- **Needs attention** feed (overdue helpdesk / at-risk projects / open helpdesk
  / open deals), error-vs-empty handled.
- **Breakdowns + trends** via `BarList` (lightweight CSS bars, matching the
  existing payroll/recruitment report charts — no charting dependency; bars
  carry a text label + value, never colour-only): pipeline by stage, workforce
  by department, 12-month headcount trend, payroll cost by period.
- **Export CSV** button gated `canExportAnalytics` (payroll-mgrs + auditor).
- `styles/analytics.css` (`an-*`, Corporate tokens).

## Browser verification (2 roles)
- **admin** — full dashboard renders; primary token resolves to
  `oklch(0.6 0.1 260)` (navy Corporate active); Headcount 10, Payroll GYD 6.2M,
  Pipeline GYD 10.2M; all sections present; Export CSV shown.
  Screenshot: `screenshots/analytics-admin.png`.
- **employee** — `/app/analytics` shows the no-access state, **no** dashboard
  data, and **no** Analytics nav entry (UI matches the server AC; API proven
  25/25 incl. employee FORBIDDEN).

## Notes
- Charting: the app has no Recharts; the established pattern is CSS/SVG bars, so
  the dashboard follows it for consistency (18A named Recharts; deviation
  documented — a Recharts/shadcn-chart upgrade is an optional later polish).
- Employer contributions (GYD 18.4M) exceed gross (6.2M) — a pre-existing
  payroll-seed quirk (flagged in 16C); Analytics reports payroll actuals
  faithfully.

## Gates
check-types 3/3 · build 2/2 · web tsc 7 (baseline, 0 new) · lint clean ·
audit 149/18 · verify-analytics-api 25/25.
