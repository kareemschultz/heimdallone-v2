# Design Handoff Summary

> Source: `design_handoff_heimdallone/` (canonical, committed to git)

## Visual Identity

- **Brand:** Heimdallone — Norse-mythic "all-seeing" workforce command center
- **Mode:** Dark-first (`data-theme="dark"` default); full light-mode parity
- **Accent:** Amber gold (`#e8b14c` dark / `#a87411` light)
- **Fonts:** Inter (sans, 400/500/600/700) + JetBrains Mono (numerics, code, payroll)
- **Corners:** 10px buttons, 16px cards, 99px badges/pills
- **Density:** App = dense operational. Marketing = spacious.

## Token System

All tokens in `designs/styles/heimdall.css`. Key CSS variables:
- Backgrounds: `--bg` through `--bg-4`
- Foregrounds: `--fg` through `--fg-4`
- Borders: `--line`, `--line-2`, `--line-strong`
- Accent: `--accent`, `--accent-2`, `--accent-ink`, `--accent-soft`, `--accent-ring`
- Semantic: `--success`, `--warning`, `--danger`, `--info` (each with `-soft` variant)
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

Theme switch via `data-theme="light"` on `<html>`. Persist to `localStorage.heimdall.theme`.

## Screens (9 designs)

| File | Route | Chrome |
|------|-------|--------|
| `marketing.html` | `/` | Marketing nav + footer |
| `pricing.html` | `/pricing` | Marketing nav + footer |
| `docs.html` | `/docs` | Marketing nav + footer |
| `login.html` | `/login` | Standalone (no nav/footer) |
| `app/dashboard.html` | `/app` | App sidebar + topbar |
| `app/payroll.html` | `/app/payroll` | App sidebar + topbar |
| `app/employees.html` | `/app/employees` | App sidebar + topbar |
| `app/employee.html` | `/app/employees/$id` | App sidebar + topbar |
| `app/compliance.html` | `/app/compliance` | App sidebar + topbar |

## Sample Data Conventions

- **Tenants:** Atlas Shipping (primary), Mahaica Group, Trident Capital
- **Lead user:** Maya Persaud (Ops Lead, GY)
- **Demo employee:** Rohan Gopaul (EMP-00214, Senior Engineer, GY)
- **Countries:** GY, TT, BB, JM (full) + US, CA, GB (secondary)
- **Active period:** September 2026

## Key Interactions (from INTERACTIONS.md)

Theme toggle, hero variant switcher (3 variants), dropdown menus (click-outside/ESC close), underline + pill tabs, employee drawer (460px Sheet), bulk select, density toggle (3 modes), country switcher (payroll), dashboard layout variants (3), animated counters, reveal-on-scroll, spotlight effect, border beam, shimmer button, approval chain stepper, filter chips.

## Icons & Assets

- Icons: Lucide-style SVGs in `heimdall.js` ICONS map → use `lucide-react`
- Flags: Schematic SVGs in `heimdall.js` → use `flag-icons` npm
- Logo: `heimdallLogo()` geometric H + eye → port to React component
