# Fumadocs Adoption Plan — smallest safe path

**Status:** D1 DONE — `apps/docs` scaffolded (Option A: TanStack Start + Fumadocs), docs build passes,
starter module structure + tag system in place. · **Date:** 2026-06-13 · **Rule:** satisfies the standing
**Documentation Rule — Fumadocs UI Required** (AGENTS.md / CLAUDE.md).

## D1 result (delivered)

- `apps/docs` created via the official Fumadocs TanStack Start template (`fumadocs-core`/`-ui`/`-mdx`,
  React 19, Vite, Tailwind 4, Orama search) — **isolated workspace**, product app untouched.
- Reusable **tag/badge** component (`src/components/tag.tsx`) covering the full label set (Live, Preview,
  Beta, Migration, Admin, Manager, Employee, Auditor, Payroll, HR, Finance, Security, Tenant
  Configurable, Country Rule, Effective Dated, Self-Service, Requires Setup), registered for MDX.
- **Starter module structure** under `content/docs/`: index (module cards) + Getting Started
  (Overview/Roles/Navigation) + Payroll (Overview + Effective-dated rules) + HR/Time/Finance/
  Operations/Administration/Developer landings, ordered via `meta.json`.
- `docs#build` added to the turbo pipeline (`bun run build` now 3/3); root ultracite excludes `apps/docs`
  (it self-lints via its own biome).
- **Docs build passes** (13 pages prerendered). The `apps/web` docs route is **not** replaced yet (safe).

### D1 docs debt (→ D2)
- 3 lint warnings remain in **generated** Fumadocs/TanStack files (`__root.tsx` unused import + html-lang,
  `app.css` 2× !important, `docs/$.tsx` hook-at-top-level) — left untouched to avoid destabilising the
  generated build; clean up in D2.
- nitro build preset is `vercel` (template default); set the self-host preset + docs domain at deploy.
- Per-module deep pages (D3/D4) and the `apps/web` `docs.tsx` content migration + retirement still pending.

## 1. Current docs setup (inspected)

| Surface | What it is | Verdict |
| --- | --- | --- |
| `docs/**` (134 `.md`) | Developer/operator record — `architecture`, `implementation`, `reviews`, `migration`, `decisions`, `horilla-extraction`, `operations`, `product`, `research` | **Keep** as the dev/operator record. Not the user-facing product docs. |
| `apps/web/src/routes/docs.tsx` (1041 lines) | An in-app, hand-built docs page inside the product app (carries part of the web tsc baseline) | **Migrate content out** to Fumadocs, then retire (removing it also burns down web-tsc baseline). |
| Fumadocs | **Not installed.** No `fumadocs-*` packages; no Next.js anywhere. | **Adopt.** |

**Stack reality:** monorepo is **Bun workspaces** (`apps/native`, `apps/server`, `apps/web`); `apps/web`
is **TanStack Start + Vite + TanStack Router + Tailwind 4**. No Next.js.

## 2. Key finding that sets the path

Fumadocs now has **official TanStack Start support** (alongside Next.js, React Router, Waku) — setup
guide: <https://www.fumadocs.dev/docs/manual-installation/tanstack-start>. Packages are
`fumadocs-core` + `fumadocs-ui` + `fumadocs-mdx`, on **Vite + Tailwind 4**, content in `content/docs/*.mdx`,
full-text search via **Orama** (client-side), `RootProvider` from `fumadocs-ui/provider/tanstack`.

→ The docs site can run the **exact stack the team already operates**. No foreign framework, no Next.js,
no experimental headless integration. (Known community caveats: TanStack Start has no Server Components,
and base-path needs care for sub-path hosting — both avoided by hosting docs at a root/subdomain.)

## 3. Options weighed

| Option | Description | Safety | Verdict |
| --- | --- | --- | --- |
| **A. Separate `apps/docs`** (TanStack Start + Fumadocs) | New Bun workspace app; isolated build/deploy; `content/docs/*.mdx` | **Highest** — physically cannot break `apps/web`; same toolchain the team knows | ✅ **Recommended** |
| B. Embed `/docs` in `apps/web` | Add Fumadocs routes into the product app, replace `docs.tsx` | Lower — couples docs build to the product app; base-path/SSR caveats; bigger blast radius | Revisit later if single-deploy is desired |
| C. Next.js Fumadocs app | Canonical Fumadocs setup | Lower — introduces Next.js into a Bun/Vite/TanStack monorepo (new build paradigm) | ❌ Rejected (now unnecessary) |

**Recommendation: Option A.** "Smallest safe" here = **isolation** (a workspace that can't break the
product) on the **same framework** (zero new paradigm). Hosted at `docs.<tenant-domain>` / root path to
sidestep the base-path caveat.

## 4. Proposed shape (Option A)

```
apps/docs/
  package.json            # fumadocs-core, fumadocs-ui, fumadocs-mdx, @tanstack/react-start, vite, tailwind 4
  vite.config.ts          # + fumadocs-mdx plugin
  content/docs/           # MDX — the product documentation tree (§6 structure)
  src/
    routes/__root.tsx     # <RootProvider> (fumadocs-ui/provider/tanstack)
    routes/docs/$.tsx     # docs renderer (page tree + MDX)
    routes/api/search.ts  # Orama search endpoint (createFromSource)
    lib/source.ts         # MDX source binding
    lib/layout.shared.tsx # nav/sidebar config
    components/mdx.tsx     # getMDXComponents
    styles/app.css        # tailwind + fumadocs neutral + preset
```

- Added to root `workspaces` + a `turbo`/script entry (`bun run docs:dev`, `docs:build`).
- **Reusable doc tags** (the standing rule's label set) implemented as a small MDX component / badge so
  `Live` · `Preview` · `Beta` · `Migration` · `Admin/Manager/Employee/Auditor` · `Tenant Configurable` ·
  `Country Rule` · `Effective Dated` etc. render consistently.
- Role-specific instructions via Fumadocs **Tabs**; workflows via **Steps**; permissions via **tables**;
  FAQ via **accordions**; module entry points via **cards** — exactly the UX the rule asks for.

## 5. Doc gate wiring (so the rule is enforced, not aspirational)

- `bun run docs:build` added to the docs gate; CI step (informational first, then blocking once seeded).
- The per-phase **Documentation Gate** + **Required Audit Question** ("Did this change require Fumadocs
  updates?") added to the standard final-report checklist (already in AGENTS.md/CLAUDE.md).
- "No fake-data-as-live in docs" rides the same discipline as the app-shell H6 fix — sample data must be
  labelled sample.

## 6. Content seeding (maps the rule's suggested structure)

Initial tree under `content/docs/`, seeded from existing module knowledge (CLAUDE.md logs + module specs):
Getting Started · HR (Employees/Contracts/Onboarding/Offboarding/Performance/Assets) · Time
(Attendance/Biometric/Geofencing/Rosters/Leave/Holidays) · Payroll (Setup/Pay frequencies/Country
rules/Guyana-GRA/Payslips/Reconciliation/Contractors) · Finance (GL/Journals/Payroll posting/Currency) ·
Operations (Notifications/Helpdesk/Projects/CRM/Analytics) · Administration (RBAC/Tenant
settings/Imports-exports/Audit logs/Migration & cutover) · Developer-Operator (Architecture/Module
boundaries/Quality gates/Deployment/Backup-restore/Troubleshooting).

Seed order: **Getting Started + Administration/RBAC first** (cross-cutting), then per-module pages as each
module's UI is touched (so docs and code move together going forward).

## 7. Proposed sequence

| Step | Scope |
| --- | --- |
| **D0** (this doc) | Proposal + standing rule registered ✅ |
| **D1** | Scaffold `apps/docs` (Option A), wire workspace + scripts + Tailwind/Fumadocs; `docs:build` green; one placeholder page |
| **D2** | Doc primitives: tag/badge component (full label set), role Tabs pattern, module Cards on the index |
| **D3** | Seed Getting Started + Administration/RBAC + a permissions table generated from the AC grants |
| **D4** | Per-module pages, prioritising modules with shipped UI; migrate `docs.tsx` content, then retire it |
| **D5** | CI docs-build gate (informational → blocking); link from app + README |

## 8. Relationship to Phase 21G

21G is still at spec/early-build (no user-facing UI shipped yet). When **21G-F** ships UI (rule-version
label on payslips, original-vs-corrected view, `weekendDays` setting) and **21G-G** ships the correction
workflow, those get Fumadocs pages under **Payroll → Payslips / Reconciliation / Effective-dated rules**
and **Administration → Migration & cutover** — tagged `Effective Dated`, `Country Rule`, `Admin`,
`Migration`. Until `apps/docs` exists, the obligation is tracked here as docs debt.

## 9. Open decision for the owner

- **Proceed with D1 (scaffold `apps/docs`) now**, or after the 21G code lands? Recommendation: scaffold
  now (D1–D2 are isolated and unblock documenting 21G-F/G in the same phase, satisfying the rule's
  "same PR/commit when practical"). Hosting domain (`docs.heimdallone.*` vs sub-path) to confirm at deploy.
