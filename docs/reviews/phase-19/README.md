# Phase 19 — Enterprise QA / a11y / theme-consistency pass

Cross-cutting QA after the Corporate theme swap + Phase 18 + the StatTile
overview consolidation. Scope: whole-app health gates + navy-theme consistency
+ a11y/theme regression check.

## Full gate suite — all green
| Gate | Result |
|---|---|
| `bun run check-types` (server/ui/payroll-engine) | **3/3** |
| `bun run build` | **2/2** |
| `bun run audit:permissions` | **149/18** |
| `bun x ultracite check` (full repo) | **205 errors** — below the accepted 212 baseline (improvement) |
| web `tsc` (apps/web) | **7** (documented baseline, 0 new) |
| `verify-analytics-api` | **25/25** |
| residual gold (`#e8b14c`/`#a87411`) in app chrome | **0** |

## Corporate theme consistency — browser-verified
The gold Heimdall brand → navy Corporate swap renders cleanly across **every
table/tile cluster**, proving no regression from the global token change:
- **`.tbl` cluster** (older modules) — `employees` data table: navy headers,
  navy active-nav, badges/avatars correct, no gold. `screenshots/employees-navy.png`.
- **`.sum-card` cluster** (payroll/recruitment/onboarding/offboarding/biometrics/
  geofencing) — `payroll` overview: READINESS 100% (navy value), OPEN PERIODS,
  ACTIVE LOANS tiles render identically to the StatTile spec (confirming the
  cluster is already visually equivalent — no churn needed).
  `screenshots/payroll-navy.png`.
- **Shared `StatTile`** (analytics + recruitment/projects/helpdesk/crm/finance/
  performance overviews) — uniform navy KPI tiles with `:focus-visible` rings.
- **Executive dashboard** — primary token resolves to `oklch(0.6 0.1 260)`.

## a11y
- StatTile interactive variant has hover + `:focus-visible` ring (WCAG 2.4.7).
- BarList breakdowns carry text label + value (never colour-only).
- Status badges keep text labels (not colour-only) across the navy palette.

## Done this phase
- Global theme swap (gold → navy Corporate) — `packages/ui` globals + heimdall
  accent tokens via `var(--primary)`; payroll/marketing stray gold cleared.
- Shared `StatTile` primitive + adoption on 7 surfaces.
- Full-suite health confirmed; lint baseline burned 212 → 205.

## Documented-deferred (carried as follow-ups, not regressions)
- Per-module list tables already share two near-identical token-driven styles
  (`.tbl` + the `*-table` clones); a full `DataTable`-component adoption across
  every list is a larger mechanical sweep (UI Overhaul 3) — the existing tables
  are already navy-consistent, so this is polish, not a defect.
- Pro sidebar/header chrome swap (UI Overhaul 2) — the existing role-gated chrome
  is one shared, navy-consistent component; swapping it is aesthetic and carries
  10-role nav-visibility re-verification risk, so it remains an explicit
  follow-up.
- Per-router security was re-audited at each module's own I-phase
  (13H/14I/15I/16I/17H/18I); Phase 19 did not re-run those.
