# Interactions Spec

Exact behavior for every interactive element. If the HTML design does it, the React port must do it.

---

## 1. Theme toggle

**Where:** Marketing nav (every marketing page), login page bottom-right, app topbar.

**Behavior:**
- Click sun icon → `data-theme="light"` on `<html>` + persist to `localStorage.heimdall.theme`
- Click moon icon → `data-theme="dark"` + persist
- Active button gets `--bg-4` bg, inactive buttons are `--fg-3`
- On page load, read `localStorage.heimdall.theme` (default `dark`) and apply before first paint to avoid flash
- All `[data-theme-toggle]` instances in the page stay in sync

**Code reference:** `designs/js/heimdall.js` → `HeimdallTheme`

---

## 2. Hero variant switcher (marketing landing)

**Where:** Floating "Tweaks" strip at the bottom of `marketing.html` when host activates edit mode.

**Behavior:**
- 3 variants: `centered` / `split` / `editorial`
- Click a variant → set `data-variant` on the `<section class="hero">` element
- `centered` shows the full-width preview card below the title
- `split` shows a smaller preview card on the right beside the title, hides the centered preview
- `editorial` shows the editorial stat strip (the 4 animated counters) at the bottom of the hero, larger headline
- All CSS-driven via `data-variant` selectors — no JS layout work needed beyond toggling the attribute

**Code reference:** `designs/marketing.html` → `setHero(variant)`

---

## 3. Accent color switcher (marketing landing)

**Where:** Same floating Tweaks strip.

**Behavior:**
- 4 swatches: gold (default) / violet / green / blue
- Click swatch → write `--accent`, `--accent-2`, `--accent-ink`, `--accent-soft`, `--accent-ring` to `<html>` inline style
- Persist to `localStorage.heimdall.accent`
- Every gold element (links, accents, badges, gradients) re-tints live

**Code reference:** `designs/marketing.html` → `setAccent(key)` + `ACCENTS` map

---

## 4. Dropdown menus

**Where:** Tenant switcher, user menu (sidebar bottom + topbar avatar), notifications bell, HR sync badge, "Import" button (employees), country flag picker, "More" buttons (kebab menu) on table rows.

**Behavior:**
- Click trigger → menu opens with `data-open="true"`, scale-and-fade animation (140ms)
- Click outside → close
- Press `Escape` → close
- Click a `.menu-item` → close (item handler runs first)
- Only one menu open at a time — opening another closes the previous

**Side variants (positioning):**
- `bottom-end` — drops from top-right of trigger
- `bottom-start` — drops from top-left
- `top-end` — drops upward (used in sidebar user menu — appears above the avatar)

**Implementation:** Use shadcn's `<DropdownMenu>` which already handles all of this — just match the styling tokens.

**Code reference:** `designs/js/heimdall.js` → `[data-menu-trigger]` handler block

---

## 5. Tabs

**Where:** Dashboard activity widget, payroll employee table (Gross-to-net / Changes / Flagged / Overtime), employee drawer, employee profile, compliance event ledger.

**Behavior:**
- Click a `.tab[data-tab="…"]` → sets `aria-selected="true"` on that tab, `false` on siblings
- Matching `.tab-panel[data-tab-panel="…"]` becomes visible with `fade-up` animation (240ms)
- Two visual styles:
  - **Underline tabs** (default `.tabs`) — 2px gold bar at bottom of active tab
  - **Pill tabs** (`.tabs.tabs-pill`) — active tab gets `--bg-4` bg + subtle shadow
- The `.count` span inside a tab is a small pill-shaped counter (e.g. `Findings <count>3</count>`). Active tab's count uses `--accent-soft` / `--accent`.

**Code reference:** `designs/js/heimdall.js` → `.tab[data-tab]` handler

---

## 6. Drawer (employee preview)

**Where:** Click any row in the employees list (`app/employees.html`).

**Behavior:**
- Backdrop fades in (opacity 0 → 1, 200ms)
- Drawer slides in from right, 280ms `cubic-bezier(0.16, 1, 0.3, 1)`, 460px wide
- Inside the drawer: another set of tabs (Overview / Payroll / Leave / Documents / Activity)
- Close triggers: X button, backdrop click, `Escape` key
- "Open full profile" button at the bottom navigates to `/app/employees/$id`

**Implementation:** shadcn `<Sheet side="right">` handles all of this. Customize size to 460px.

---

## 7. Bulk select (employees list)

**Where:** Header checkbox + per-row checkboxes in `app/employees.html`.

**Behavior:**
- Header checkbox toggles all rows
- Selecting any row shows the **bulk action bar** above the toolbar (pill-shaped, dashed accent border)
- Bulk bar shows count + actions: Move department, Send document, Add to pay run, Archive (red), Clear
- "Clear" button uncheck all + hides bar
- Row gets `.selected` styling — accent-soft tint

---

## 8. Density toggle (employees list)

**Where:** Toolbar in `app/employees.html`.

**Behavior:**
- 3 modes: `comfortable` / `default` / `compact`
- Click a button → sets `data-density` on `.emp-list`
- CSS rules adjust row padding + avatar size + font size accordingly

---

## 9. Country switcher (payroll)

**Where:** Pill strip below the page header in `app/payroll.html`.

**Behavior:**
- Click a country pill → active pill gets `--bg-3` bg + shadow
- The `<runbar>` re-renders with new country name, currency, employee count, profile version, effective date
- Each country has a status dot: green (sealed), gold pulsing (ready), yellow (action needed), default (queued/inactive)
- Currently visual-only; in implementation, drive the entire page from the active country

---

## 10. Layout variants (dashboard)

**Where:** Page header pill group in `app/dashboard.html`.

**Behavior:**
- 3 variants: `balanced` / `command` / `briefing`
- Same widgets, different grid placement via `data-layout` attribute
- URL hash also respected: `app/dashboard.html#command` opens in command layout
- All CSS-driven once the `data-layout` is set

---

## 11. Animated counters (marketing hero, editorial variant)

**Where:** Editorial hero strip on `marketing.html`.

**Behavior:**
- 4 stats: `7`, `12,000+`, `99.99%`, `<3`s
- When the element scrolls into view (`IntersectionObserver` threshold 0.15), count animates from 0 to target over 1400ms (cubic ease-out)
- Numbers stay in `font-mono` with `tabular-nums` so width doesn't jitter

**Code reference:** `designs/js/heimdall.js` → `animateCount()` + `.count-up[data-end]`

---

## 12. Reveal on scroll (marketing)

**Where:** Sections on `marketing.html`, `pricing.html`, `docs.html` with `.reveal` class.

**Behavior:**
- Initial state: `opacity: 0`, `transform: translateY(14px)`
- When 15% visible, gets `.in` class → animation plays (700ms cubic-bezier)
- Animation uses `animation` not `transition` (workaround for a Chromium transition glitch in some headless captures)

**Implementation:** `useInView` from `framer-motion`, or roll your own with `IntersectionObserver`.

---

## 13. Spotlight (bento + doc cards)

**Where:** `.spotlight` class on bento cards and doc category cards.

**Behavior:**
- `mousemove` over the element sets CSS custom properties `--mx` and `--my` to the cursor position
- `::after` pseudo-element shows a radial gradient centered on the cursor when hovered

**Code reference:** `designs/js/heimdall.js` → `document.addEventListener("mousemove", ...)`

---

## 14. Border beam (featured bento + Growth plan)

**Where:** `.beam-host` class on the multi-country payroll bento card and the Growth pricing card.

**Behavior:**
- A 1px conic-gradient ring slowly rotates around the card border (6s linear infinite)
- Default hidden, shown on hover OR always-on via `.beam-always` modifier
- Pure CSS using `::before` with conic-gradient + mask trick

---

## 15. Logo marquee (marketing landing)

**Where:** Below the hero on `marketing.html`.

**Behavior:**
- 8 placeholder logos, duplicated for seamless loop
- Animates `transform: translateX(0) → translateX(-50%)` over 40s linear infinite
- Mask gradient fades the left and right edges
- Pauses on hover

---

## 16. Shimmer button (marketing CTAs)

**Where:** Primary CTAs on `marketing.html`, `pricing.html`.

**Behavior:**
- Inner pseudo-element runs a diagonal white sheen across the button every 3.2s
- Button content must be wrapped in a `<span>` so it sits above the sheen

---

## 17. Aurora / animated grid (marketing hero)

**Where:** Hero of `marketing.html`.

**Behavior:**
- 3 overlapping radial gradients on a slow 24s rotation (the `aurora`)
- Background grid drifts by `56px` every 30–35s (the `bg-grid-anim`)
- Both pure CSS; no JS

---

## 18. Search inputs

**Where:** Topbar `<cmd-trigger>` (acts as a fake command palette opener), docs hero search, employees toolbar search, compliance event filter.

**Behavior:**
- Topbar `⌘K` button: when clicked or `Cmd+K` pressed, open a `<Command>` palette (use `cmdk` + shadcn `<CommandDialog>`)
- Docs search: large rounded input, focus ring `--accent-ring`, accepts free text
- Employees / compliance search: in-line, debounced, filters the visible rows

---

## 19. Approval chain stepper (payroll)

**Where:** Below the employee table in `app/payroll.html`.

**Behavior:**
- 6 steps shown horizontally
- States:
  - `.done` — green check, connector to next step is green
  - `.current` — gold pulse ring around the dot (animation `pulse-ring 1.8s ease-out infinite`)
  - default — gray dot
- Steps in the live design: Computed → Reviewed (HR) → Verified (Finance) → **Approve (Ops) [current]** → Commit & seal → Disburse

---

## 20. Filter chips

**Where:** Employees list, compliance event filter, payroll employee table.

**Behavior:**
- Inactive: dashed border, `--fg-2` text
- Active: solid border, `--accent-soft` bg, `--accent` text, border `--accent`
- Clicking opens a `<Popover>` with a checkbox list of options (not visually shown in the designs but should be the behavior). Selecting items shows summary in the chip's `.v` span (e.g. `Country · GY · TT · BB`)
- "Add filter" chip opens a popover listing available facets

---

## 21. Status indicators

| Indicator | Visual | When |
|---|---|---|
| `.badge badge-success` with dot | Green pill + pulsing dot | "HR sync · 14:42" topbar, "Operational" status, "Synced" labels |
| `.badge badge-warning` with dot | Amber pill | "Review", "Action", "Late · 24m" |
| `.badge badge-danger` with dot | Red pill | "Blocking", "Failed" |
| `.badge badge-accent` with dot | Gold pill | "Ready", "Pending you" |
| `.pill-status.active` + dot | Green | Employee active status |
| `.pill-status.probation` | Blue | Probation employees |
| `.pill-status.notice` | Amber | Notice period |
| Online dot on `.avatar-sm` | Green | Currently logged in / on-shift |
| Risk meter mark | Position on green→amber→red gradient | Risk score gauge |

---

## 22. Keyboard shortcuts (when implementing cmd palette + nav)

These appear as `<kbd>` hints in the UI. Implement them once the command palette is wired up:

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `Esc` | Close any open dropdown / modal / drawer / palette |
| `?` | Show keyboard shortcuts cheat-sheet |
| `g` then `o` | Go to Overview (dashboard) |
| `g` then `e` | Go to Employees |
| `g` then `p` | Go to Payroll |
| `g` then `c` | Go to Compliance |
| `/` | Focus the page's search input |

These hints already appear in the user-menu dropdown ("Keyboard shortcuts · `?`"). Wire them in Block D.

---

## 23. Copy interactions

**Where:** Docs hub code block has a "Copy" button.

**Behavior:**
- Click copy → `navigator.clipboard.writeText(code)`
- Button label changes to "Copied" with a check icon + accent color for 1400ms, then reverts
