# Phase 21X — Authenticated Mobile/Desktop QA pass (2026-06-16)

Live production hardening continued. This pass **logged into the live app**
(`app.heimdallone.com`) as an owner-authorized QA superuser and inspected the
authenticated UI at iPhone width (390px) and desktop (1440px) with Playwright,
instead of reasoning about CSS blind. Screenshots in this folder are the
before-fix evidence captured against the live `sha-2e65485` deploy.

## How the QA login was set up (no secrets leaked)

- `scripts/create-qa-user.ts` (owner-authorized, dedicated — NOT a demo seed):
  creates one Better Auth user `qa+platform@heimdallone.com`, grants the
  admin-plugin platform role (`user.role = admin`) **and** `tenant_owner`
  membership in every org, so QA sees all tenants + all module surfaces.
- Guarded: refuses the v1 DB (`karetech_erp`) and requires `CONFIRM_QA_USER=1`.
- The generated password is written only to gitignored `.qa-cred` (mode 600) and
  is **never printed**. Playwright reads it through a short-lived loopback HTTP
  bridge so the value never appears in any tool call/transcript.
- **Cleanup:** `REMOVE=1 … bun run scripts/create-qa-user.ts` deletes the user +
  memberships when QA is done.

## Findings (live `sha-2e65485`)

| # | Severity | Page | Issue | Status |
|---|----------|------|-------|--------|
| 1 | High | Employees list + detail | Breadcrumb / activity hardcoded **"Atlas Shipping"** (a seed-org name) while the active tenant was Foreign Links — a fake tenant name in production | **Fixed** → `{org.orgName}` |
| 2 | High | Leave | Header action row + filter segmented control overflowed the viewport; "+ Request time off" and "All" clipped off-screen | **Fixed** (shared mobile CSS) |
| 3 | High | Settings | Tab strip clipped ("Work Types"/"Tax…" cut off); card header crushed the description into a ~90px sliver while action buttons clipped | **Fixed** (`.tabs` scroll + `.card-head-row` stack) |
| 4 | Med | Employees table | Wide table extends past viewport | Mitigated — scrolls inside its card (`overflow-x:auto`) |
| 5 | Low | Compliance (preview) | Hardcoded "Atlas Shipping" | Deferred — admin-gated, labeled demo |
| 6 | Med | Marketing `/` | Mobile layout broken (large empty voids, fake "Atlas Shipping"/"GYD 184,720" mock dashboard) | Deferred — P2 rebuild |

## What was already good (verified, not assumed)

- **Mobile app shell + drawer work correctly:** sidebar is a proper off-canvas
  drawer with dimmed backdrop; closed state gives content the full viewport;
  topbar fits; module cards stack. The "desktop-first" impression came from the
  per-page overflow issues above, not the shell.
- Overview dashboard, login page, and the tenant switcher render cleanly on
  mobile and desktop with real data and the real active tenant name.

## Fixes shipped this pass

1. **Fake tenant name** — `employees/index.tsx`, `employees/$id.tsx` now read
   the active org from `OrgCtx` (`org.orgName`).
2. **Shared mobile primitives** (`styles/heimdall.css`, one block, fixes every
   module page at once):
   - `.page` padding tightened on mobile.
   - `.page-header` + action groups (`.leave-head-actions`,
     `.page-header > div:last-child`) wrap instead of clipping.
   - `.segmented` and any `*-tabs` / `.tabs` / `.tab-row` strip become
     horizontally scrollable (`overflow-x:auto`, momentum, hidden scrollbar)
     with `flex-shrink:0` tabs so options never compress/clip.
   - `.toolbar` stacks vertically; search field allowed to shrink.
3. **Settings card header** — replaced 5 identical inline-flex
   `space-between` headers with a reusable `.card-head-row` class that stacks on
   mobile (inline styles can't be made responsive by CSS — the root cause).
4. **Type cleanup** — exported `NavItem` from `route.tsx` and typed the
   dashboard's `NAV.flatMap`, clearing the `item is unknown` web-tsc errors the
   new dashboard introduced.

## Lesson reinforced

Inline `style={{display:'flex',justifyContent:'space-between'}}` headers are the
silent killer of mobile responsiveness — CSS media queries cannot override inline
styles, so they crush on small screens. Prefer a class for any layout that must
adapt. (See lessons-learned #97.)
