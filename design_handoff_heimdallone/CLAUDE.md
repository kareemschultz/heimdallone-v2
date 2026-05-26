# CLAUDE.md — Heimdallone Project Instructions

You are working on **Heimdallone** — an ultra-modern HR, payroll, workforce, compliance and business-operations platform that sits as a premium layer on top of an existing **Horilla HRMS** deployment.

This file is the standing brief for every chat in this project. Read it before doing anything.

---

## 1. The design is locked

The folder `design_handoff_heimdallone/` (or wherever you've placed the bundle) contains **the canonical visual specification** for the entire product:

- `design_handoff_heimdallone/README.md` — overview + screen index
- `design_handoff_heimdallone/IMPLEMENTATION.md` — route tree + framework guidance
- `design_handoff_heimdallone/DESIGN_TOKENS.md` — every color, type, radius, shadow
- `design_handoff_heimdallone/COMPONENTS.md` — class → shadcn/ui mapping
- `design_handoff_heimdallone/INTERACTIONS.md` — exact behavior of every interactive element
- `design_handoff_heimdallone/designs/` — **the HTML/CSS/JS prototypes themselves**

**These files are the design.** Your job is to faithfully recreate them in the target stack. **Do not reinterpret, redesign, or "improve" the visual language.** If a screen looks unusual, it is intentional.

When you need to know how something should look:
1. Open the corresponding HTML file under `designs/`
2. Read the CSS rule directly
3. Match it pixel-for-pixel in the implementation

When you need to know how something should behave: read `INTERACTIONS.md`.

---

## 2. Stack — non-negotiable

This project uses **Better-T-Stack**:

- **Frontend:** TanStack Start (React) — file-based routes
- **Styling:** Tailwind v4 (CSS-first config) + shadcn/ui (`new-york` style)
- **Backend:** Hono + Bun runtime
- **API:** oRPC (type-safe end-to-end)
- **Auth:** Better Auth (email/password, SSO/SAML stub, passkey)
- **DB / ORM:** Postgres + Drizzle
- **Desktop / mobile:** Tauri (same React app)
- **Monorepo:** Turborepo + Bun

**Forbidden in this codebase** (do not introduce without explicit user approval):

- Next.js
- Material UI, Chakra, Bootstrap, Ant Design, or any custom UI kit other than shadcn/ui
- tRPC (we use oRPC)
- Prisma (we use Drizzle)
- Supabase (we use plain Postgres + Drizzle)
- Payment UI / Stripe components (out of scope for now)

---

## 3. Product positioning — keep this front of mind

Heimdallone is a **premium operating system for HR, payroll, and workforce operations**, built for companies operating across multiple countries — Caribbean-first (Guyana, Trinidad & Tobago, Barbados, Jamaica), with US, Canada and UK as secondary jurisdictions.

It feels like a **workforce command center** — fast, trustworthy, operationally serious. Not "just another HR dashboard". Marketing is **Linear/Vercel restraint** (big type, mono palette, selective motion). The app is **calm, dense, operational** — no Magic UI motion inside the authenticated routes.

### Horilla relationship

Horilla is the underlying HRMS foundation. Heimdallone enhances and modernizes the operator experience while keeping the existing HRMS backend intact.

> **"Keep Horilla running. Upgrade the experience."**

- Horilla is **subtle in the app** (a small "HR sync · 14:42" badge in the topbar, source indicators on employee records, settings page connection status).
- Horilla is **invisible on marketing** (not mentioned on landing, pricing, or docs hero; only surfaces in detailed integration docs).
- Heimdallone reads from Horilla's Postgres (read-only) and projects to its own `heim_*` tables for new features. **Do not modify Horilla schemas.**

---

## 4. Core modules (in order of scope priority)

These modules are designed and ready to implement:

1. **Marketing** — landing, pricing, docs hub
2. **Auth** — Better Auth sign-in with org-aware hints
3. **App shell** — sidebar + topbar with tenant switcher, theme toggle, command palette
4. **Executive dashboard** — KPIs, payroll readiness, attendance pulse, approvals, compliance alerts, headcount + cost trends, activity timeline (3 layout variants)
5. **Payroll command center** — multi-country pay-run engine with approval chain, gross-to-net preview, statutory deductions, country profile management
6. **Employees** — list view with drawer preview, full profile detail
7. **Compliance & audit** — hash-chained event ledger, findings, evidence-pack export

These modules are referenced (sidebar nav exists, route should resolve) but **not yet designed**. Build clean placeholders for them until designs land:

- `/app/attendance` · `/app/leave` · `/app/countries` · `/app/documents` · `/app/clients` · `/app/settings`

---

## 5. Sample data conventions

Use these names in mocks/seeds during initial implementation — they match the designs verbatim:

- **Tenants:** Atlas Shipping (primary), Mahaica Group, Trident Capital
- **Lead user:** Maya Persaud (Ops Lead, GY)
- **Demo employee for profile:** Rohan Gopaul (EMP-00214, Senior Engineer, GY)
- **Countries:** GY, TT, BB, JM (full data) + US, CA, GB (secondary)
- **Active period:** September 2026

Terminology (use exactly these, not synonyms):

- Gross pay · Net pay · PAYE · NIS · statutory deductions · employer contribution · payroll period · leave liability · overtime · attendance exception · approval workflow · audit event · tenant · organization · employee source record · country profile · effective date

---

## 6. Working agreement

When making changes:

1. **Visual changes:** check the HTML design first. If your change conflicts with it, stop and ask the user.
2. **New screens or new components:** propose the design in HTML before implementing in React. We are design-first, not code-first.
3. **Sample data:** keep names/amounts realistic and Caribbean-flavored (see § 5).
4. **Token usage:** never inline a hex code. Every color comes from the token system in `DESIGN_TOKENS.md`.
5. **Number formatting:** every numeric display uses `font-mono` + `tabular-nums`. PAYE/NIS amounts use thousand separators. Currency code is **explicit per country** (GYD, TTD, BBD, JMD, USD, CAD, GBP).

When asked to "make something look better": **default to no.** The design is locked. Suggest alternatives but don't ship them unless the user confirms.

---

## 7. File-level conventions

- Routes live in `apps/web/src/routes/` (TanStack Start file-based)
- Reusable UI in `packages/ui/src/components/{ui,chrome,data,motion,brand}/`
- oRPC contracts in `packages/api/src/`
- Drizzle schemas in `packages/db/src/schema/`
- Server entry in `apps/server/`
- Use `kebab-case` for files, `PascalCase` for components, `camelCase` for hooks/utils
- Co-locate component CSS only when it can't be expressed in Tailwind — prefer Tailwind classes throughout

---

## 8. When in doubt

Open the relevant HTML file in `design_handoff_heimdallone/designs/`. The CSS rule is the answer.

If the HTML doesn't cover the case you need, ask the user. Do not invent.
