# Heimdallone UI — conventions for building with this design system

Heimdallone UI is a **dark-first**, navy-corporate React design system (shadcn
`base-lyra` style on `@base-ui/react`, Tailwind v4). Build operational SaaS
surfaces — HR, payroll, attendance, finance — with it.

## Theme & setup (read this first)

- **Dark by default.** The token defaults are dark navy. There is **no React
  provider to wrap** — theming is pure CSS custom properties (loaded from the
  bundle's `styles.css`). Light mode is opt-in via `[data-theme="light"]` /
  `.light` on a parent.
- **Render on the DS surface.** Page/section roots should set
  `background: var(--bg); color: var(--fg)`. Components that own a surface
  (`Card`, `StatTile`) bring their own background; bare layouts (tables, lists,
  forms) must sit on `var(--bg)` or they look unstyled on white.

## Styling idiom

Two layers, both shipped in `styles.css`:

1. **Tailwind v4 utilities + shadcn tokens** (use on your own layout glue and via
   the components): `bg-primary` `text-primary-foreground` `bg-card`
   `text-foreground` `text-muted-foreground` `border` `border-input`
   `rounded-none` (base-lyra is **sharp-cornered**) `text-xs` `h-8`.
2. **Heimdallone CSS-var tokens** (the navy scale — use as `var(--token)`):
   - Surfaces: `--bg` `--bg-1` `--bg-2` `--bg-3` `--bg-4`
   - Lines: `--line` `--line-2` `--line-strong`
   - Text: `--fg` `--fg-2` `--fg-3` `--fg-4`
   - Accent/semantic: `--accent` `--primary` `--success` `--warning` `--danger`
     (+ `--accent-soft` `--success-soft` `--warning-soft` `--danger-soft`)

Components are configured by **props, not utility classes**:
`Button variant="default|outline|secondary|ghost|destructive|link" size="default|xs|sm|lg|icon"`,
`StatTile tone="default|primary|success|warning|danger"`,
`StatusBadge variant="default|success|warning|danger|info|accent" dot`.

## Key components

- **StatTile / StatTileGrid** — KPI tiles (`label`, `value`, `tone`, `icon`,
  `hint`, `delta={{direction,value,label}}`). Wrap in `StatTileGrid min={180}`.
- **Card** + `CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter`.
- **DataTable** — `columns` (TanStack `ColumnDef[]`) + `data`, plus `isLoading`,
  `isError`, `emptyState`. Render `StatusBadge` in a status cell.
- **StatusBadge** — pill; **PageHeader** — `title`/`description`/`actions`;
  **EmptyState** — `title`/`description`/`icon`/`action`/`compact`;
  **Input** + **Label** + **Checkbox**; **Skeleton** for loading.
- Icons come from `lucide-react`.

## Where the truth lives

Read `styles.css` (and its `@import`s) for the exact tokens, and each component's
`<Name>.d.ts` (props) + `<Name>.prompt.md` (usage) before styling.

## Idiomatic snippet

```tsx
import { Card, CardHeader, CardTitle, StatTile, StatTileGrid, StatusBadge } from "@Heimdallone/ui";

<div style={{ background: "var(--bg)", color: "var(--fg)", padding: 24 }}>
  <StatTileGrid min={180}>
    <StatTile label="Active employees" value="248" tone="primary" />
    <StatTile label="Overdue" value="7" tone="danger" />
  </StatTileGrid>
  <Card>
    <CardHeader><CardTitle>September pay run</CardTitle></CardHeader>
    <div style={{ padding: 16 }}><StatusBadge variant="success">Approved</StatusBadge></div>
  </Card>
</div>
```
