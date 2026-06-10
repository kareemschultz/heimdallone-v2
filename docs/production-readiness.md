# Heimdallone — Production Readiness (Phase 20)

Status assessment of the platform for production deployment, as of Phase 20
(2026-06-10). This is an honest checklist — it records what is ready and what
remains, and never overstates.

## 1. Module completeness
Phases 5–18 shipped and closed with per-module QA passes:
HR Core · Contracts · Attendance+Leave · Payroll (+ Guyana 2026 engine) ·
Recruitment+Onboarding · Offboarding · Biometric+Geofencing · Assets ·
Helpdesk · Projects+Tasks · Performance/PMS · Finance (costing/budgets) ·
CRM · Analytics/Executive dashboards.

**Preview modules** (design scaffolds on sample data, marked with a "Preview"
pill + `<PreviewBanner>`): Compliance, Clients, Countries & Tax, Documents.
Do not present their stats/exports as live.

## 2. Quality gates (CI: `.github/workflows/ci.yml`)
**Blocking** (must pass to merge):
| Gate | Command | Current |
|---|---|---|
| Type-check (server/ui/payroll-engine) | `bun run check-types` | 3/3 ✓ |
| Build | `bun run build` | 2/2 ✓ |
| Permission audit | `bun run audit:permissions` | 149/18 ✓ |

**Informational** (`continue-on-error`, tracked baselines — lower is better):
| Gate | Current baseline |
|---|---|
| Lint (`bun run check`) | 205 errors (was 212; legacy shared files) |
| Web type-check (`apps/web typecheck`) | 7 errors (docs/settings/employees/login) |

**Follow-up to flip CI fully blocking:** burn web tsc 7→0, rename web
`typecheck`→`check-types` to enter the root turbo gate, then make lint blocking.

## 3. Required environment (validated via `packages/env`)
See `.env.example`. Server: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `CORS_ORIGIN`. Web: `VITE_SERVER_URL`.
Dev tooling only (not runtime): `EMAIL`, `LICENSE_KEY` (shadcn/studio Pro).

## 4. Security posture
- Two-layer authz everywhere: AC gate (`authorizedProcedure`) + handler scope
  (IDOR/tenant). RBAC helpers byte-aligned `role-helpers.ts` ↔ `rbac.ts`.
- Server-side redaction: payroll/bank, CRM money + private notes, helpdesk
  internal notes, performance private 1-on-1 notes + peer-review anonymity,
  finance/analytics money. Verified per-module at each I-phase.
- Cross-module write guardrails (coordination layers link, never own) grep-proven
  in Helpdesk/Projects/Performance/Finance/CRM/Analytics QA passes.
- Injection-safe CSV exports (formula-trigger escaping) across payroll/finance/
  analytics.

**Documented hardening follow-ups (not blockers):**
- `employee_bank_details.account_number` is API-masked for non-payroll roles;
  plaintext **at rest** → field-level encryption is a future item.
- GPS coordinate retention scrub, device-secret/biometric-template handling —
  per the biometric plan.
- Dialog focus-trap is an app-wide deferred a11y pattern.

## 5. Design system
shadcn/studio **navy Corporate** theme (`oklch(0.35/0.60 … 260)`, radius
0.375rem) applied globally in `packages/ui/src/styles/globals.css`; browser-
verified consistent across all module clusters (`.tbl`, `.sum-card`, shared
`StatTile`). 0 residual legacy-gold in app chrome. WCAG: `:focus-visible`
rings, text+colour status (never colour-only).

## 6. Deployment notes
- Monorepo (Bun + Turborepo). `bun install --frozen-lockfile` → `bun run build`.
- Server: Hono + oRPC (`apps/server`, :3000). Web: TanStack Start (`apps/web`,
  :3002). Postgres via Drizzle; migrations in `packages/db/src/migrations`
  (latest 0020), applied with the drizzle push/migrate flow.
- Seed scripts are idempotent (`scripts/seed-*.ts`).

## 7. Open follow-ups (tracked, not regressions)
- UI Overhaul: adopt the shared `DataTable` component across all module list
  tables (tables are already navy-consistent; this is polish) + optional Pro
  sidebar/header chrome swap.
- Flip CI informational gates to blocking once baselines hit zero.
- The at-rest encryption + retention-scrub hardening items above.
