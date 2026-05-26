# Component Inventory

Every hand-rolled component in the designs maps to a shadcn/ui primitive (or a thin composition over one). This table is the canonical mapping — use it when porting.

> All component classes live in `designs/styles/heimdall.css`. All component JS (tab/dropdown/spotlight wiring) lives in `designs/js/heimdall.js`.

---

## 1 · Primitives (1:1 shadcn mapping)

| HTML class | shadcn/ui primitive | Notes |
|---|---|---|
| `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost` | `<Button variant="default \| outline \| ghost \| secondary">` | Sizes: `.btn-sm` → `sm`, `.btn-lg` → `lg`. Default `.btn` = `size="default"`. |
| `.btn-shimmer` | Custom — wrap `<Button>` in a div with the shimmer animation overlay | Marketing CTA only. See "Motion components" below. |
| `.input` | `<Input>` | Height 38px, radius 10, focus ring `--accent-ring`. |
| `.label` | `<Label>` | 12px / 500 / `--fg-2`. |
| `.kbd` | `<Kbd>` (custom) | Mono, 11px, `--bg-3` bg, 5px radius. |
| `.badge`, `.badge-accent`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info` | `<Badge variant="…">` | Pill (99px), 22px height. The `.badge-dot` span before content is a 6px colored dot — keep it. |
| `.cc-badge` | Custom `<CountryBadge cc="GY">` | Pill containing flag + 2-letter code (mono). |
| `.pill-status`, `.pill-status.active/.probation/.notice/.contract` | `<StatusPill kind="active">` | Status indicator with optional dot. Used in employee list + payroll. |
| `.tabs` / `.tab` (underlined) | `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>` | Use `variant="underline"` or shadcn default. Active marker is a 2px gold bar at bottom. |
| `.tabs.tabs-pill` | `<Tabs>` with pill styling | Active item gets `--bg-4` bg + `--shadow-sm`. |
| `.segmented` | Same as pill tabs — usually a `<ToggleGroup>` or pill `<Tabs>` | Used for time-range toggles ("12m / YTD / All", "Day / Week"). |
| `.menu` + `.menu-item` (triggered by `[data-menu-trigger]`) | `<DropdownMenu>` / `<DropdownMenuTrigger>` / `<DropdownMenuContent>` / `<DropdownMenuItem>` | Includes `.menu-section`, `.menu-sep`, `.menu-meta` (right-side keyboard hint). |
| `.menu-wide` + `.menu-notif-item` | `<DropdownMenuContent className="w-[360px]">` with custom item layout | Notifications dropdown — 360px wide. |
| Drawer (`.drawer` + `.drawer-backdrop`) | `<Sheet side="right">` (shadcn) | 460px wide. ESC closes. Backdrop click closes. |
| `.card`, `.surface` | `<Card>` / `<CardContent>` / `<CardHeader>` / `<CardFooter>` | Default radius 16px. |
| `.tbl` (legacy) and `.emp-table table` / `.pay-list` | `<Table>` + `<TableHeader>` etc | Sticky header for tall lists. Hover `--bg-2`. |
| `.checkbox` (custom-styled `<input type=checkbox>`) | `<Checkbox>` | 16×16, 5px radius, gold when checked. |
| `.pbar` + `.pbar-fill` | `<Progress>` | 6px tall, pill, gold fill (or `.success/.warning/.danger` variants). |
| `.theme-toggle` | `<ToggleGroup>` with sun/moon icons | Persists to localStorage key `heimdall.theme`. |
| `.filter-chip` (dashed) | `<Button variant="outline" size="sm">` with dashed border | Active state: solid border, accent-soft bg, accent text. Used everywhere as facet/filter UI. |
| `.cmd-trigger` (search shortcut) | `<Button>` styled as command-palette trigger | 360px wide, pill, opens cmdk on click. |
| `.kv` / `.kv-k` / `.kv-v` | Custom `<KeyValue>` row | Used in side cards. Border-top dashed between rows. |

---

## 2 · App chrome

| Class / structure | Component name | What it does |
|---|---|---|
| `.app` (grid 248px + 1fr) | `<AppLayout>` | Wraps sidebar + main column. Used by all `/app/*` routes. |
| `.sidebar` + `.tenant-switcher` + `.nav-item` | `<AppSidebar>` | Renders tenant switcher (dropdown), nav groups (Operate / Govern / Workspace), user menu. Source: `designs/js/shell.js` NAV array. |
| `.topbar` | `<AppTopbar>` | Command-K trigger + HR-sync status badge (dropdown) + theme toggle + notifications dropdown + help + user avatar dropdown. |
| `.page` + `.page-header` + `.crumbs` + `.page-title` + `.page-sub` | `<AppPageHeader>` | Crumbs above title; right-aligned action cluster. |

---

## 3 · Marketing chrome

| Class / structure | Component name | What it does |
|---|---|---|
| `.m-nav` | `<MarketingNav>` | Sticky, blurred, with theme toggle + sign-in + primary CTA. Active link gets a 2px gold underline. |
| `.m-page-hero` | `<MarketingPageHero>` | Used for `/pricing` and `/docs` — eyebrow + h1 + sub-paragraph + glow + bottom border. |
| `.footer` + `.footer-grid` + `.footer-col` + `.footer-meta` | `<MarketingFooter>` | 5-column grid: brand · product · solutions · resources · company. |

---

## 4 · App widgets (used in `dashboard.html`)

| Class | Component | Purpose |
|---|---|---|
| `.kpi` | `<KpiCard>` | Single stat tile. Has `.kpi-label`, `.kpi-value`, `.kpi-icon`, `.kpi-meta`. |
| `.widget` (+`.widget-head`, `.widget-body`, `.widget-foot`) | `<Widget>` | Generic content widget. Slots for title, action, body, footer link. |
| `.briefing-hero` | `<BriefingHero>` | Wide gradient card used in Briefing layout. |
| `.payrun-row` | `<PayRunRow>` | One row in the payroll-readiness widget: flag + country + progress + amount + status + action. |
| `.attend-grid` + `.attend-cell` | `<AttendanceHeatmap>` | 5 × 24 grid (days × hours). Levels `l1–l4` shade with accent; anomalies use `.warn`/`.danger`. |
| `.alert-item` | `<AlertItem>` | Icon + title + desc + meta. Variants: `warn`, `danger`, `info`, `success`. |
| `.approval-item` | `<ApprovalItem>` | Avatar + person + meta + approve/deny buttons. |
| `.timeline` + `.tl-item` + `.tl-dot` | `<Timeline>` / `<TimelineItem>` | Vertical activity list with a left rail line. Dots can be `.accent` / `.success` / default. |
| `.chart` + `.bar` | `<BarChart>` | Simple CSS bar chart. Use Recharts in implementation; keep visual identical. |
| `.cost-area` (inline SVG) | `<AreaChart>` | Single-series filled area. Use Recharts. |

---

## 5 · Payroll-page widgets (used in `payroll.html`)

| Class | Component | Purpose |
|---|---|---|
| `.runbar` | `<PayRunBanner>` | Header card with country flag + name + period + profile + status pill + Approve button. |
| `.country-strip` | `<CountrySwitcher>` | Horizontal pill bar of countries with a status dot per. Sticky on tall pages. |
| `.sum-card` + `.sum-card.accent` | `<PaySumCard>` | Gross / Deductions / Employer / Net. The Net card uses `.accent` variant (gold tint). |
| `.emp-table` (with `.emp-head` + table + `.pagination`) | `<EmployeePayrollTable>` | Tabbed: gross-to-net / changes / flagged / overtime. Filter chip row above table. |
| `.approval-chain` + `.chain-step` (+ `.done`/`.current`) | `<ApprovalChain>` | Horizontal stepper. `.done` = green check, `.current` = pulsing gold dot. |
| `.donut` (inline SVG) | `<DonutChart>` | Statutory deductions breakdown. Use Recharts pie with `paddingAngle`. |
| `.side-card` + `.fact-row` + `.bands` | `<CountryProfileCard>` | Sidebar fact list + PAYE bands mini-table. |

---

## 6 · Employee-page widgets

| Class | Component |
|---|---|
| `.profile-head` + `.profile-cover` + `.profile-id` + `.profile-tabs` | `<EmployeeProfileHeader>` |
| `.field-list` + `.kv` | `<FieldList>` |
| `.stat-row` + `.stat-card` | `<EmployeeStatRow>` |
| `.att-cal` + `.att-day` | `<AttendanceMiniCalendar>` (30-day) |
| `.leave-row` | `<LeaveBalanceRow>` |
| `.doc-row` | `<DocumentRow>` |
| `.pay-list` (table) | `<PayrollHistoryTable>` |

---

## 7 · Compliance-page widgets

| Class | Component |
|---|---|
| `.event-row` | `<AuditEventRow>` — time + category icon + actor/object + cat pill + severity |
| `.finding` (+`.crit`/`.warn`/`.info`) | `<Finding>` — icon + title + desc + meta + actions row |
| `.evidence-card` | `<EvidencePackCard>` — gradient card with download CTA |
| `.complete-row` | `<CompletenessRow>` — country flag + name + progress bar + percent |
| `.facet-row` | `<FacetRow>` — swatch + label + count |
| `.risk-bar` + `.risk-bar-mark` | `<RiskMeter>` — gradient bar with positional marker |
| `.sealed-banner` | `<LedgerSealBanner>` — bottom-bar showing hash + seal status |

---

## 8 · Motion components (Magic UI-style — marketing only)

Used on `marketing.html`, `pricing.html`, `docs.html`. Do **not** use these inside the authenticated app.

| Class | Component | Implementation note |
|---|---|---|
| `.aurora` | `<Aurora>` | Slow-rotating radial gradient. CSS-only, no JS. Already provides the keyframes. |
| `.bg-grid-anim` | `<AnimatedGrid>` | Subtle grid background that drifts. CSS-only. |
| `.marquee` + `.marquee-track` | `<LogoMarquee>` | Duplicate children in markup for seamless loop. `--mask-image` cuts the edges. |
| `.beam-host` (hover or `.beam-always`) | `<BorderBeam>` | Conic-gradient rotating ring on a card border. Pure CSS. |
| `.spotlight` | `<Spotlight>` | Radial gradient follows cursor (`--mx`, `--my` set in JS — `heimdall.js`). |
| `.btn-shimmer` | `<ShimmerButton>` | Diagonal sheen animation over the button. Wrap children to keep them above the sheen. |
| `.count-up[data-end]` | `<CountUp>` | Counts when scrolled into view. Re-implement with `framer-motion`'s `useMotionValue + animate` or `react-countup`. |
| `.reveal` → `.reveal.in` | `useInView` from `framer-motion` | Add `.in` when intersection observer fires. Animation: `opacity: 0; y: 14` → `opacity: 1; y: 0`, 700ms `cubic-bezier(0.16,1,0.3,1)`. |

For the marketing app, install:
- `framer-motion` (or use `motion/react`) for reveal + count-up
- No other motion lib needed — everything else is CSS keyframes

---

## 9 · Icons & flags

### Icons (Lucide-style)

`designs/js/heimdall.js` defines an `ICONS` map of ~40 Lucide-named SVG paths. Names used:

```
layout-dashboard · users · clock · calendar · wallet · globe ·
shield · shield-check · file-text · briefcase · settings ·
search · bell · chevron-down · chevron-right · chevron-left ·
arrow-up-right · arrow-right · arrow-up · arrow-down ·
trending-up · trending-down · check · x · alert-triangle · info ·
moon · sun · plus · more-horizontal · play · fingerprint · lock ·
filter · download · external-link · circle · zap · activity ·
database · command · eye · log-out · folder · git-branch ·
sparkles · building · users-2 · menu · user · github · key
```

**Use `lucide-react` in implementation.** Names are identical (`<Users />`, `<ShieldCheck />`, `<TrendingUp />`, etc.). Default size 16px, stroke 1.75.

### Flags

`designs/js/heimdall.js` has schematic SVG flags for `GY`, `TT`, `BB`, `JM`, `US`, `CA`, `GB`. They are intentionally simplified (no fine detail) so they read well at 18 × 12.

**In implementation, use `flag-icons` npm or similar** — render at the same 18 × 12 size to preserve layout, with a 2px border-radius for the rounded corner inside the badge.

### Heimdallone logo

Defined in `heimdallLogo(size)` in `designs/js/heimdall.js`. Geometry:
- Two vertical posts (the "H")
- An eye-shape (almond) spanning the H crossbar
- Iris ring + pupil dot in the center
- All in `currentColor` (so the logo inherits text color — gold by default in app contexts)

**Port to a React component** that takes a `size` prop. Keep the path data exactly.

---

## 10 · Class → directory mapping (suggested React structure)

```
src/components/
├── ui/                          ← shadcn primitives (Button, Input, Card, …)
│   ├── button.tsx
│   ├── card.tsx
│   ├── tabs.tsx
│   ├── dropdown-menu.tsx
│   ├── sheet.tsx
│   ├── badge.tsx
│   ├── input.tsx
│   ├── checkbox.tsx
│   ├── progress.tsx
│   ├── toggle-group.tsx
│   └── table.tsx
├── chrome/                      ← app/marketing layouts
│   ├── app-layout.tsx           ← grid sidebar + main
│   ├── app-sidebar.tsx
│   ├── app-topbar.tsx
│   ├── app-page-header.tsx
│   ├── tenant-switcher.tsx
│   ├── notification-menu.tsx
│   ├── theme-toggle.tsx
│   ├── marketing-nav.tsx
│   ├── marketing-footer.tsx
│   └── marketing-page-hero.tsx
├── data/                        ← domain widgets
│   ├── country-badge.tsx
│   ├── status-pill.tsx
│   ├── filter-chip.tsx
│   ├── key-value.tsx
│   ├── kpi-card.tsx
│   ├── widget.tsx
│   ├── timeline.tsx
│   ├── attendance-heatmap.tsx
│   ├── attendance-mini-calendar.tsx
│   ├── pay-run-banner.tsx
│   ├── country-switcher.tsx
│   ├── pay-sum-card.tsx
│   ├── approval-chain.tsx
│   ├── country-profile-card.tsx
│   ├── audit-event-row.tsx
│   ├── finding.tsx
│   ├── evidence-pack-card.tsx
│   ├── risk-meter.tsx
│   └── employee-profile-header.tsx
├── motion/                      ← marketing motion only
│   ├── aurora.tsx
│   ├── marquee.tsx
│   ├── border-beam.tsx
│   ├── spotlight.tsx
│   ├── shimmer-button.tsx
│   ├── count-up.tsx
│   └── reveal.tsx
├── brand/
│   ├── heimdall-logo.tsx
│   └── flag.tsx
└── icons.tsx                    ← re-exports lucide-react with consistent defaults
```
