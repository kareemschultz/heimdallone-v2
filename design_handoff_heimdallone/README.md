# Heimdallone — Design Handoff

> **This bundle is the canonical visual specification for Heimdallone.**
> Recreate it faithfully in the target stack. Do not reinterpret.

---

## 0. ⚠️ Read this first

The HTML files in `designs/` are the **canonical, drop-in specification** for how Heimdallone should look and behave. They are **not sketches** or "directional" mocks — they are the design.

**Your job is to recreate them faithfully** in the target stack (Better-T-Stack: TanStack Start + React + Tailwind v4 + shadcn/ui + Tauri + oRPC + Better Auth + Drizzle/Postgres).

Specifically:

- ✅ **Match the layouts exactly.** Same grids, same spacing, same component sizes.
- ✅ **Match the colors exactly.** Use the tokens in `DESIGN_TOKENS.md`. The CSS variables are already named for direct port.
- ✅ **Match the typography exactly.** Inter for everything; JetBrains Mono for every numeric / monospace label.
- ✅ **Match the interactions exactly.** Tab behavior, dropdown opening, drawer slide, theme toggle — see `INTERACTIONS.md`.
- ✅ **Match the copy exactly.** Sample data, labels, error states, badges — they are the design.
- ❌ **Do not "modernize" or "improve" the visual language.** If something looks unusual (e.g. italic-serif accent words in the gold), it is intentional.
- ❌ **Do not swap shadcn/ui primitives.** The hand-rolled components in these designs map 1:1 to shadcn — see `COMPONENTS.md`.
- ❌ **Do not introduce new colors, radii, or shadows.** Everything is in the token system.

**When in doubt: open the HTML file and copy the exact CSS rule.** The designs are the source of truth.

---

## 1. Fidelity

**High-fidelity.** Pixel-perfect mockups with final colors, typography, spacing, motion and interactions. Every screen is a complete, interactive HTML prototype rendered against the same shared design system (`designs/styles/heimdall.css`).

You can open any HTML file directly in a browser and click around — toggles, tabs, dropdowns, drawers, theme switch, layout variants all work.

---

## 2. What's in this bundle

```
design_handoff_heimdallone/
├── README.md                  ← you are here
├── IMPLEMENTATION.md          ← route map, file split, framework guidance
├── COMPONENTS.md              ← shadcn/ui mapping for every hand-rolled component
├── DESIGN_TOKENS.md           ← full color/type/spacing/radius spec
├── INTERACTIONS.md            ← every interactive behavior, exact triggers
└── designs/
    ├── index.html             ← Design canvas (entry — links to all 10 screens)
    ├── marketing.html         ← Public landing
    ├── pricing.html           ← Plans + comparison + FAQ
    ├── docs.html              ← Documentation hub
    ├── login.html             ← Better Auth sign-in
    ├── app/
    │   ├── dashboard.html     ← Executive overview (3 layout variants)
    │   ├── payroll.html       ← Pay-run command center (7 countries)
    │   ├── employees.html     ← Employee list + drawer
    │   ├── employee.html      ← Employee profile
    │   └── compliance.html    ← Audit ledger + findings
    ├── styles/
    │   ├── heimdall.css       ← THE design system (tokens + components)
    │   └── marketing.css      ← Marketing-page-only chrome
    ├── js/
    │   ├── heimdall.js        ← Theme, icons, tabs, dropdowns, count-up, reveal
    │   ├── shell.js           ← App sidebar + topbar renderer
    │   └── marketing-chrome.js ← Marketing nav + footer renderer
    └── design-canvas.jsx      ← (For the design-overview canvas only — not for app code.)
```

---

## 3. Screens at a glance

| # | File | Purpose | Target route (TanStack Start) |
|---|------|---------|--------------------------------|
| 1 | `marketing.html` | Public landing page | `/` (marketing app) |
| 2 | `pricing.html` | Plans, comparison, FAQ | `/pricing` |
| 3 | `docs.html` | Documentation hub | `/docs` |
| 4 | `login.html` | Better Auth sign-in | `/login` |
| 5 | `app/dashboard.html` | Executive overview | `/app` (authed root) |
| 6 | `app/payroll.html` | Pay-run command center | `/app/payroll` |
| 7 | `app/employees.html` | Employee list + drawer | `/app/employees` |
| 8 | `app/employee.html` | Employee profile detail | `/app/employees/$id` |
| 9 | `app/compliance.html` | Audit ledger | `/app/compliance` |
| – | `index.html` | Design canvas overview | (handoff-only, do not implement) |

See `IMPLEMENTATION.md` for the full route tree, including stubs for screens that aren't yet designed (countries, leave, attendance, documents, settings — these are wired in the sidebar but should be built later).

---

## 4. Visual identity (read once, then refer to `DESIGN_TOKENS.md`)

- **Brand:** Heimdallone — Norse-mythic "all-seeing" workforce command center
- **Mode:** Dark-first; full light-mode parity (theme toggle in topbar + login)
- **Accent:** Amber gold (`#e8b14c` dark / `#a87411` light)
- **Type:** Inter (sans, 400/500/600/700) + JetBrains Mono (numerics, code, payroll values)
- **Voice for italic-serif accent words:** Inter italic 500 weight, used sparingly on hero / accent lines (e.g. "_command center_", "_scales_", "_Heimdallone_")
- **Corners:** 8–10px (controls), 14–18px (cards / surfaces), pill (99px) for badges/segmented/chips
- **Density:** Operational. The app is dense; marketing is spacious. Do not change either.

---

## 5. Implementation order

Recommended sequence — each block is a complete vertical slice you can ship:

**Block A — Design system foundation (do first, blocks everything)**
1. Port `designs/styles/heimdall.css` tokens into Tailwind v4's CSS-first config — see `DESIGN_TOKENS.md § Tailwind config`.
2. Set up shadcn/ui with the `new-york` style and overwrite its tokens with the Heimdall palette.
3. Verify theme toggle works at the document root.

**Block B — Marketing layer**
4. `/` — marketing landing
5. `/pricing`
6. `/docs` (hub only; individual doc pages are out of scope for this handoff)

**Block C — Auth**
7. `/login` with Better Auth email/password + SSO placeholder

**Block D — App shell**
8. `/app` layout (sidebar + topbar) with tenant switcher, theme toggle, all dropdowns wired
9. `/app` dashboard (executive overview)

**Block E — Payroll & people**
10. `/app/payroll` (with country switcher, gross-to-net table, approval chain)
11. `/app/employees` (list + drawer)
12. `/app/employees/$id` (full profile)

**Block F — Compliance**
13. `/app/compliance` (audit ledger + evidence-pack export stub)

Do **not** ship anything in Block E until Block A and Block D are pixel-matched. The whole point is that the design system carries through unchanged.

---

## 6. What's out of scope for this handoff

These are referenced by the sidebar nav but not yet designed. Build them later, matching the established patterns:

- `/app/attendance` — biometric/device feed, exception queue (use payroll's filter+table pattern)
- `/app/leave` — team calendar + approval cards (use dashboard's approval-queue widget pattern)
- `/app/countries` — country profile editor (use payroll's right-side fact-list pattern)
- `/app/documents` — workflow board
- `/app/clients` — shared-services client list
- `/app/settings` — workspace settings

---

## 7. Stack reminders (no surprises)

- **Framework:** TanStack Start (React) — file-based routes
- **Styling:** Tailwind v4 (CSS-first) + shadcn/ui (`new-york` style)
- **Auth:** Better Auth (email/password + SSO/SAML stub)
- **API:** oRPC client (type-safe, replaces tRPC)
- **DB/ORM:** Postgres + Drizzle (read from Horilla schema; project our own `heim_*` tables)
- **Desktop/Mobile:** Tauri (same React app)
- **Monorepo:** Better-T-Stack (Bun + Turborepo)

Do **not** introduce: Next.js · Material UI · Chakra · Bootstrap · Ant · Prisma · Supabase · tRPC · payment UIs.

---

## 8. Sample data

The data in the designs is realistic but synthetic. You can use it verbatim during initial implementation to keep visual parity, then swap to live data once the schema and oRPC routes are in place.

Reference companies / employees / amounts used:
- Tenant: **Atlas Shipping** (also "Mahaica Group", "Trident Capital" for switcher)
- Lead: **Maya Persaud** (Ops Lead, GY)
- Senior eng: **Rohan Gopaul** (used as the profile demo)
- Countries with full data: **GY, TT, BB, JM** (Caribbean-first)
- Countries with secondary data: **US, CA, GB** (UK)
- Active period: **September 2026** (current pay run in mocks)

---

## 9. Asset attribution

- **Fonts:** Inter (OFL) + JetBrains Mono (OFL) — load via Google Fonts as currently done, or self-host
- **Icons:** Hand-written Lucide-style SVG paths in `designs/js/heimdall.js` (`ICONS` map). Swap for `lucide-react` in implementation — names match 1:1.
- **Flags:** Schematic SVG generators in `designs/js/heimdall.js` (`flagSvg`). Replace with `flag-icons` or similar in implementation.
- **Logo:** `heimdallLogo()` in `designs/js/heimdall.js` — geometric H + watchful-eye motif. Convert to a React component, keep the shape exact.
- **Imagery:** None embedded. The design uses gradients, grids, and aurora effects in lieu of photography.

---

## 10. Hand-off checklist (for the developer)

Before declaring any screen "done":

- [ ] Compare side-by-side at 1440 × 900 against the corresponding HTML file
- [ ] Toggle dark ↔ light — both must match the design HTML
- [ ] Hover every interactive element — match hover/active states
- [ ] Click every tab, dropdown, drawer — match the open behavior
- [ ] All numeric values use `font-family: "JetBrains Mono"` + `font-variant-numeric: tabular-nums`
- [ ] No off-token colors, radii, shadows, or font sizes anywhere
- [ ] No console errors

---

Open `designs/index.html` to see all 10 screens side-by-side. That's the starting point.
