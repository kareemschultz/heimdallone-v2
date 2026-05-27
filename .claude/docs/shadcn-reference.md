# shadcn/ui Reference for Heimdallone

Researched from live docs on 2026-05-26.

## Important: This Project Uses base-ui (NOT Radix)

The `components.json` specifies `"style": "base-lyra"` — this means all shadcn components use **@base-ui/react** primitives, not @radix-ui. When referencing shadcn docs, use the `/docs/components/base/` path (not `/docs/components/radix/`). The underlying headless library is `@base-ui/react` version 1.x.

## Component Inventory (59 components)

**Layout**: Card, Accordion, Collapsible, Resizable, Scroll Area, Separator, Tabs, Aspect Ratio
**Navigation**: Breadcrumb, Menubar, Navigation Menu, Pagination, Sidebar
**Data Display**: Avatar, Badge, Calendar, Carousel, Chart (Recharts), Data Table, Table, Progress, Skeleton, Typography
**Input**: Button, Button Group, Checkbox, Combobox, Input, Input Group, Input OTP, Label, Native Select, Radio Group, Select, Slider, Switch, Textarea, Toggle, Toggle Group
**Feedback**: Alert, Sonner/Toast, Spinner, Tooltip, Hover Card, Kbd
**Overlay**: Alert Dialog, Command, Context Menu, Dialog, Drawer, Dropdown Menu, Popover, Sheet
**Misc**: Direction, Empty, Field

## TanStack Form Integration Pattern

```tsx
const form = useForm({
  defaultValues: { title: "", description: "" },
  validators: { onSubmit: zodSchema },
  onSubmit: async ({ value }) => { /* ... */ },
})

<form.Field name="title" children={(field) => {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>Title</FieldLabel>
      <Input id={field.name} value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur} aria-invalid={isInvalid} />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}} />
```

Key shadcn form components: `<Field>`, `<FieldLabel>`, `<FieldDescription>`, `<FieldError>`, `<FieldGroup>`

## Charts (Recharts-based)

Types: Area, Bar, Line, Pie, Radar, Radial. Copy-paste pattern with built-in theming.

## Blocks (Pre-built Layouts)

- `dashboard-01` — Sidebar + charts + data table
- `sidebar-03` — Submenus
- `sidebar-07` — Collapsible to icons
- `login-03` / `login-04` — Auth pages

Install: `npx shadcn add [block-name]`

## Pagination (for Data Tables)

"Icons only" variant recommended for data tables — Previous/Next buttons + rows-per-page selector. No numbered page links needed.

## Menubar vs DropdownMenu

- **Menubar**: Persistent top-level navigation bar (File/Edit/View style)
- **DropdownMenu**: Single-trigger action menu

## Skills System

`pnpm dlx skills add shadcn/ui` — Gives AI assistants project-aware component knowledge. Auto-detects `components.json`, injects project config, enforces composition patterns.

## Data Table Pattern (from shadcn docs)

Three-file structure: `columns.tsx` (ColumnDef[]), `data-table.tsx` (reusable wrapper), `page.tsx` (data fetching).
Features: sorting (getSortedRowModel), filtering (getFilteredRowModel), pagination (getPaginationRowModel), column visibility (VisibilityState), row selection (checkbox column).
Helper components: DataTableColumnHeader, DataTablePagination, DataTableViewOptions.

## Field Component Family (for forms)

| Component | Purpose |
|-----------|---------|
| `<Field>` | Wrapper with orientation (vertical/horizontal/responsive), `data-invalid` |
| `<FieldLabel>` | Semantic label |
| `<FieldDescription>` | Helper/hint text |
| `<FieldError>` | Accepts `errors` array from validators |
| `<FieldGroup>` | Stack multiple fields with container query |
| `<FieldSet>` / `<FieldLegend>` | Semantic grouping |
| `<FieldContent>` | Flex column for control + descriptions |
| `<FieldSeparator>` | Divider between sections |

## Empty Component (native shadcn empty state)

```
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">{icon}</EmptyMedia>
    <EmptyTitle>Title</EmptyTitle>
    <EmptyDescription>Description</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>{action buttons}</EmptyContent>
</Empty>
```

Install: `bunx shadcn@latest add empty`

## Pagination (for Data Tables)

"Icons only" variant: Previous/Next buttons + rows-per-page selector. No numbered page links.
Install: `bunx shadcn@latest add pagination`

## Available Blocks

- `dashboard-01` — Sidebar + charts + data table
- `sidebar-07` — Collapsible to icons
- `login-03` / `login-04` — Auth pages
- Install: `npx shadcn add [block-name]`

## Charting (Recharts)

7 chart types: Area, Bar, Line, Pie, Radar, Radial, Tooltip. Uses Recharts under the hood.
Install: `bunx shadcn@latest add chart`

## Skills System

Installed via: `pnpm dlx skills add shadcn/ui`
Provides: project-aware component knowledge, CLI reference, theming guidance, registry authoring, MCP server integration.
Status: **Installed** in this project.

## Heimdallone Design Fidelity Rule

shadcn components are used ONLY for behavior/accessibility where handoff CSS has no equivalent:
- **Use shadcn**: Sheet, AlertDialog, Dialog, Select, Popover, Tooltip, Command, Field/FieldError (form structure)
- **Use handoff CSS instead**: Badge (.badge), Tabs (.tab/.tabs-pill), Table (.tbl), Filter (.filter-chip), Menu (.menu/.menu-item), Toolbar (.toolbar), Avatar (.avatar)
- **Evaluate case-by-case**: Empty (shadcn Empty vs our custom EmptyState), Pagination (shadcn vs inline)
