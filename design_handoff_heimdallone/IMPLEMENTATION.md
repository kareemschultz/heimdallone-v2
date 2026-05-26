# Implementation Guide

Concrete plan for turning the HTML designs into TanStack Start routes + React components inside the Better-T-Stack monorepo.

---

## 1. Monorepo target

The Better-T-Stack scaffold lands as:

```
heimdallone/
├── apps/
│   ├── web/                 ← TanStack Start (React) — marketing + app, same project
│   ├── native/              ← (optional) Tauri shell wrapping web
│   └── server/              ← Hono + oRPC server
├── packages/
│   ├── api/                 ← oRPC contracts + clients
│   ├── db/                  ← Drizzle schemas (heim_* tables only; Horilla read separately)
│   └── ui/                  ← Shared shadcn + Heimdall components (this is where most of the design ports go)
└── ...
```

**Everything visual goes in `apps/web` and `packages/ui`.** The server / db packages are unaffected by this handoff.

---

## 2. Route tree (file-based, TanStack Start)

```
apps/web/src/routes/
├── __root.tsx                 ← Loads heimdall.css, font stylesheets, theme bootstrap
├── index.tsx                  ← / → marketing landing       (marketing.html)
├── pricing.tsx                ← /pricing                    (pricing.html)
├── docs.tsx                   ← /docs                       (docs.html)
├── login.tsx                  ← /login                      (login.html)
└── app/                       ← protected segment
    ├── route.tsx              ← <AppLayout> wrapper (sidebar + topbar). All /app/* nest in here.
    ├── index.tsx              ← /app → executive dashboard  (app/dashboard.html)
    ├── payroll/
    │   └── index.tsx          ← /app/payroll                (app/payroll.html)
    ├── employees/
    │   ├── index.tsx          ← /app/employees              (app/employees.html)
    │   └── $employeeId.tsx    ← /app/employees/EMP-00214    (app/employee.html)
    └── compliance/
        └── index.tsx          ← /app/compliance             (app/compliance.html)
```

**Sidebar items pointing to undesigned routes** (`/app/attendance`, `/app/leave`, `/app/countries`, `/app/documents`, `/app/clients`, `/app/settings`) should render a clean placeholder for now — same `AppLayout`, same `AppPageHeader`, then an `<EmptyState>` saying "Coming soon". Do not stub fake screens.

---

## 3. Bootstrap order (Block A — do these first, in order)

1. **Install fonts**
   - Add `<link>` for `Inter` (400, 500, 600, 700) and `JetBrains Mono` (400, 500, 600) to `__root.tsx`, or self-host with `next/font`-equivalent.
2. **Port `heimdall.css` tokens**
   - Copy the tokens from `designs/styles/heimdall.css` into `apps/web/src/styles/globals.css`. They are already CSS-variable-based.
   - Add the Tailwind v4 `@theme` block from `DESIGN_TOKENS.md`.
3. **Set up `data-theme` switching**
   - Use the same `localStorage` key (`heimdall.theme`) and the same attribute (`data-theme="dark"` / `"light"`) on `<html>`. Code in `designs/js/heimdall.js` → port to `apps/web/src/lib/theme.ts`.
   - Wrap in a React context provider that reads/writes localStorage and toggles the attribute.
4. **Init shadcn/ui (`new-york` style)**
   - `pnpm dlx shadcn@latest init` → choose `new-york` + `slate` (we override colors in step 5)
   - Add primitives via `shadcn add button card input label badge tabs dropdown-menu sheet checkbox progress toggle-group table separator`
5. **Override shadcn variables**
   - Replace `globals.css`'s shadcn `:root` block with the override in `DESIGN_TOKENS.md § shadcn/ui token override`. Without this step, shadcn defaults will leak through and the gold accent will be wrong.
6. **Verify**
   - Build a single throwaway page with one `<Button>`, one `<Card>`, one `<Badge>`, one `<Tabs>`. Toggle the theme. Compare to any of our HTML designs. They must match. **Don't proceed until they do.**

---

## 4. Block B: Marketing pages

Build in this order. Each page is independent and depends only on Block A.

### `/` — Marketing landing (`marketing.html`)

**Sections (top to bottom):**
1. `<MarketingNav>` — sticky, blurred, gold underline on active link
2. `<Hero>` — has three variants stored in `searchParams.hero` (or local state): `centered` / `split` / `editorial`. Tweak strip at bottom of viewport lets visitor switch live. Render the centered preview card unless variant is split.
3. `<LogoMarquee>` — duplicated children for seamless loop
4. `<BentoGrid>` — 6-col grid, mixed `b-lg / b-md / b-sm` cards with `<BorderBeam>` on the featured one
5. `<MultiCountryPayroll>` — 2-col with country tabs on the right showing per-country PAYE/NIS preview
6. `<ComplianceSteps>` — 3-step card row on `--bg-1`
7. `<CTA>` — gold-glow mega card with `<ShimmerButton>` primary action
8. `<MarketingFooter>`

**Hero variants:** Just CSS — same markup, different `data-variant` attribute. Look at `marketing.html` `.hero[data-variant="…"]` rules.

### `/pricing` — Plans (`pricing.html`)

- `<MarketingPageHero>` (small hero) with eyebrow + h1 + sub + billing toggle (`Monthly` / `Annual`)
- 4-up `<PlanCard>` row — Starter / Growth (Most Popular badge + `<BorderBeam beam-always>`) / Enterprise / Self-hosted
- Comparison table with section header rows
- FAQ grid (2 cols, `<details>` accordion)
- CTA block

**Billing toggle:** updates the `data-price-monthly` / `data-price-annual` attribute via React state, with a 160ms opacity fade between values.

### `/docs` — Docs hub (`docs.html`)

- Hero with search bar + 7 quick-search tag pills
- Quick-start block (2-col) with code tabs (`heimdallone.ts` / `curl` / `oRPC client`) and a copy button
- 9-cat grid of `<CategoryCard>` with `<Spotlight>` hover
- Two-column row: "Popular this week" + "Changelog"
- 3-up help row (Community / Support / Implementation)
- Footer

**Code highlighting:** these designs use hand-rolled `.tok-*` spans. For implementation use `shiki` (server-side) or `prism-react-renderer`. Use these token colors:

```ts
const heimdallTheme = {
  keyword: "#d089ff" /* light: "#6f42c1" */,
  string:  "#b9e077" /* light: "#2e7d32" */,
  fn:      "var(--color-accent)",
  comment: "var(--color-fg-4)",
  num:     "#ffb86c" /* light: "#b45309" */,
  prop:    "#7dd3fc" /* light: "#0369a1" */,
};
```

---

## 5. Block C: Auth

### `/login` (`login.html`)

- 2-col grid (1.05fr / 1fr)
- **Left:** brand-logo top, hero text "_Sign in to run your operations_", status panel below (live ops indicators), SOC 2 badge bottom
- **Right:** form — org-aware hint card (tenant pre-selected from subdomain) + email + password + SSO row + legal + theme toggle bottom

**Better Auth integration:**
- Email/password → `authClient.signIn.email(...)`
- Org-aware hint: read subdomain (e.g. `atlas-shipping.heimdallone.app`) → fetch tenant logo/colors → render the hint card
- SSO buttons → `authClient.signIn.social(...)` (placeholders OK; can wire later)
- Passkey button → `authClient.signIn.passkey(...)`

On successful login, `navigate({ to: "/app" })`.

---

## 6. Block D: App shell + dashboard

### `/app/*` layout (`app/dashboard.html` for sidebar/topbar reference)

`apps/web/src/routes/app/route.tsx`:

```tsx
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/chrome/app-sidebar";
import { AppTopbar } from "@/components/chrome/app-topbar";

export const Route = createFileRoute("/app")({
  component: () => (
    <div className="app">
      <AppSidebar />
      <main>
        <AppTopbar />
        <Outlet />
      </main>
    </div>
  ),
});
```

**Auth guard:** check Better Auth session in `loader`. Redirect to `/login` if not signed in.

### `/app` — Executive dashboard

Three layout variants exposed in the page header (`Balanced` / `Command` / `Briefing`), stored in `searchParams.layout` so URLs are sharable.

```tsx
type Layout = "balanced" | "command" | "briefing";

// Same widgets, different grid placement via CSS data attribute.
<div data-layout={layout} className="dash">
  {/* KPI row (hidden in briefing) */}
  {/* Briefing hero (only in briefing) */}
  <div className="layout-grid">
    <Widget className="w-payroll">…</Widget>
    <Widget className="w-alerts">…</Widget>
    <Widget className="w-attend">…</Widget>
    <Widget className="w-approvals">…</Widget>
    <Widget className="w-activity">…</Widget>
    <Widget className="w-headcount">…</Widget>
    <Widget className="w-cost">…</Widget>
  </div>
</div>
```

The CSS rules `.dash[data-layout="balanced"] .w-payroll { grid-column: span 8 }` etc — keep them.

---

## 7. Block E: Payroll & people

### `/app/payroll`

Three big subsystems on one page:
- **Top:** `<PayRunBanner>` (active country + period + status + Approve button) + `<CountrySwitcher>` strip
- **Left col:** 4 `<PaySumCard>` (gross / deductions / employer / net), `<EmployeePayrollTable>` (tabbed), `<ApprovalChain>`
- **Right col:** `<ReadinessChecklist>`, `<StatutoryDeductionsCard>` (donut), `<CountryProfileCard>` (PAYE bands)

**Country switching:** updates `searchParams.country` (e.g. `?country=TT`). All cards re-render from the country profile. No page reload.

**Data:** the country data is defined inline in `payroll.html` under `COUNTRY_LABEL`. Move that to `packages/api/src/payroll/countries.ts` and serve via oRPC.

### `/app/employees`

- Toolbar: search + segmented status filter + density toggle + columns dropdown
- Filter chip row below toolbar (Country / Department / Employment / Manager / Joined + Add filter)
- Bulk action bar (appears when any row checkbox is checked)
- `<EmployeeTable>` — supports density `comfortable / default / compact` via `data-density`
- Row click opens `<EmployeeDrawer>` (shadcn `<Sheet>`)
- Drawer link "Open full profile" navigates to `/app/employees/$employeeId`

### `/app/employees/$employeeId`

- `<EmployeeProfileHeader>` (cover gradient + avatar + name + status badges + actions + tabs)
- Tab routing: `searchParams.tab` (`overview` / `attendance` / `leave` / `payroll` / `documents` / `activity`)
- `overview` tab: 3-col left identity stack + main-col stat row + attendance heatmap + leave bars + activity timeline
- `attendance` tab: time activity log table
- `leave` tab: 2-col balances + recent requests
- `payroll` tab: pay-run history table (9 rows currently)
- `documents` tab: doc list
- `activity` tab: full timeline

---

## 8. Block F: Compliance

### `/app/compliance`

- 4-up KPI row (Compliance score / Open findings / Events captured / Risk meter)
- 2-col grid: `<EventLedger>` (left, tabbed by category) + sidebar with `<EvidencePackCard>` + `<DocumentCompletenessCard>` + `<FacetCard>` + `<TopActorsCard>`
- Event tabs: All / Approvals / Payroll / HR / Security / Findings
- `findings` tab: `<Finding>` cards with severity (critical / warn / info)
- Bottom: `<LedgerSealBanner>` showing the hash chain status

**Event data:** comes from the `heim_audit_events` table (you'll build this). For initial implementation, hard-code the 10 rows in `app/compliance.html`.

---

## 9. Data — sample to live

**Phase 1 (visual parity, no backend yet):** Hard-code sample data inline. The HTML files already do this. Copy values verbatim into your route components so the look is preserved during initial bring-up.

**Phase 2 (oRPC + Drizzle):** Define oRPC procedures matching the routes. Server reads from Horilla (read-only Postgres) + projects to `heim_*` tables. Frontend swaps hard-coded data for `orpc.payroll.compute.useQuery(...)` etc.

**Phase 3 (real Horilla deployment):** Connect the read-only Postgres URL, run the audit-ledger projection, ingest biometric data. No frontend changes needed — types match.

Pattern for each screen:

```tsx
// Phase 1
const employees = SAMPLE_EMPLOYEES;            // const array from designs

// Phase 2
const { data: employees = [] } =
  useQuery(orpc.employees.list.queryOptions({ tenant, country }));
```

---

## 10. Theme + dark/light parity

The designs work in both themes. Test parity on **every screen** before declaring it done:

1. Default render → dark
2. Click sun icon → light → every component must remain legible and on-token
3. Refresh → theme persists from `localStorage.heimdall.theme`

Both modes share the same component code; only the CSS variables change.

---

## 11. Responsive (low priority)

The designs target **1440 × 900** as the primary viewport. Mobile responsiveness is **out of scope** for this handoff except:

- Marketing pages collapse the bento + footer to 1-col below 880px (already in CSS)
- Login collapses to single column below 900px (already in CSS)
- Authenticated app pages assume desktop. If a mobile breakpoint is needed, the sidebar should become a slide-in `<Sheet>` triggered by a hamburger in the topbar.

Tauri desktop and mobile native are handled via the same React tree — the Tauri shell sets `data-tauri` on `<html>` for any platform-specific adjustments.

---

## 12. Don't-touch list

The following decisions are **locked** for this handoff. Do not change without an explicit design conversation:

- Gold accent (`#e8b14c` / `#a87411`) and warm-paper light bg (`#fbfaf6`)
- Inter + JetBrains Mono (no other font families)
- 248px sidebar width
- 56px topbar height
- 16px default card radius / 10px button radius / pill chips
- The Heimdallone logo geometry
- The "italic-serif accent words" treatment in heros
- Sample tenant name ("Atlas Shipping") and persona ("Maya Persaud") in demos
- 7 supported countries (GY · TT · BB · JM · US · CA · GB)
- Approval chain step labels (Computed → Reviewed (HR) → Verified (Finance) → Approve (Ops) → Commit & seal → Disburse)
- "Keep Horilla running. Upgrade the experience." product positioning

Anything else is fair game.

---

## 13. Acceptance criteria

A screen is "done" when:

- [ ] Side-by-side comparison at 1440 × 900 matches the HTML design pixel-for-pixel
- [ ] Both dark and light modes render correctly without regressions
- [ ] Every interactive element behaves as described in `INTERACTIONS.md`
- [ ] All tokens (color, type, radius, shadow) come from the design system — no inline hex codes
- [ ] All numbers use `font-mono` + `tabular-nums`
- [ ] Lighthouse accessibility score ≥ 90
- [ ] Zero console errors / warnings (other than Babel dev warning if applicable)
- [ ] Route is keyboard-navigable (Tab order matches reading order; ESC closes drawers/menus)
