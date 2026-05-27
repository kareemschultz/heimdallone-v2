# Shared UI Primitives — Specification

Phase 4E deliverable. TypeScript interfaces are specification-only — no component files are created in this phase.

---

## Design Fidelity Rule

- Primitives **must** preserve the current Heimdallone handoff visual language
- Handoff CSS classes (`.tbl`, `.badge`, `.filter-chip`, `.tab`, `.toolbar`, `.bulk-bar`, `.drawer`, `.kv`, `.avatar`, `.pbar`, `.tl-item`, etc.) are the **first choice** when available
- shadcn is used for **behavior/accessibility primitives** where the handoff has no equivalent (Sheet, Dialog, Select, Popover, Tooltip)
- **No primitive should visually drift toward default shadcn styling** unless explicitly approved
- When wrapping handoff CSS, the React component applies handoff class names directly — it does not re-implement the visual styling in Tailwind

---

## Handoff CSS Integration Map

| Handoff CSS Class(es) | React Primitive | Strategy |
|------------------------|----------------|----------|
| `.tbl`, `.tbl th`, `.tbl td` | DataTable | **Wrap** — render `<table className="tbl">` |
| `.badge`, `.badge-dot`, `.badge-success/warning/danger/info/accent` | StatusBadge | **Wrap** — compose className from variant prop |
| `.pill-status`, `.pill-status.active/probation/notice/contract` | StatusBadge (pill variant) | **Wrap** |
| `.filter-bar`, `.filter-chip`, `.filter-chip.active`, `.filter-chip .v` | FilterBar | **Wrap** |
| `.tab`, `.tabs`, `.tabs-pill`, `.tab[aria-selected]`, `.tab .count` | SavedViewTabs | **Wrap** |
| `.toolbar`, `.toolbar-divider` | PageHeader / composed inline | **Use directly** |
| `.bulk-bar`, `.bulk-bar.visible` | BulkActionToolbar | **Wrap** |
| `.drawer`, `.drawer-backdrop`, `.drawer-head/body/foot` | EntitySheet | **Wrap** handoff CSS for visual, consider shadcn Sheet for accessibility (focus trap, portal) |
| `.menu-root`, `.menu`, `.menu-item`, `.menu-sep`, `.menu-section` | ActionMenu | **Wrap** handoff CSS |
| `.pbar`, `.pbar-fill`, `.pbar-fill.success/warning/danger` | *(defer)* | Future ProgressBar |
| `.check-item`, `.check-icon`, `.check-icon.done/warn/pending` | *(defer)* | Future Checklist |
| `.avatar`, `.avatar-xs/sm/lg`, `.avatar-sm.online` | *(defer)* | Future Avatar |
| `.kv`, `.kv-k`, `.kv-v` | *(defer)* | Future KeyValue |
| `.stat`, `.stat-label`, `.stat-value`, `.stat-delta` | StatTile | **Wrap** — spec'd in [analytics-reporting-plan.md](analytics-reporting-plan.md) |
| `.timeline`, `.tl-item`, `.tl-dot`, `.tl-time`, `.tl-actor` | AuditTimeline | **Wrap** (CSS in dashboard.css + employee-profile.css) |
| *(no handoff equivalent)* | ConfirmDialog | **Use shadcn** Dialog/AlertDialog |
| *(no handoff equivalent)* | WizardForm | **Custom** — compose from handoff tokens |
| *(no handoff equivalent)* | EmptyState | **Custom** — compose from handoff tokens |
| *(no handoff equivalent)* | FormSection / FieldHelp | **Custom** — compose from handoff `.label`, `.input` |

---

## Component Inventory

### 1. DataTable

**Purpose**: Wraps TanStack Table with handoff `.tbl` CSS. Headless table logic (sort, filter, paginate, select) with Heimdallone visual styling.

**Location**: `packages/ui/src/components/data-table.tsx`

**Dependencies**: `@tanstack/react-table` (new install in packages/ui)

**Handoff CSS**: `.tbl`, `.tbl th`, `.tbl td`, `.tbl tr:hover td`; page-specific CSS (`.emp-list`) for module extensions

**shadcn wraps**: None — uses handoff table styling, not shadcn Table

**Prop Interface**:
```ts
interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  searchPlaceholder?: string
  enableSearch?: boolean
  enableSorting?: boolean
  enablePagination?: boolean
  enableColumnVisibility?: boolean
  enableRowSelection?: boolean
  pageSizeOptions?: number[]
  defaultPageSize?: number
  density?: "comfortable" | "default" | "compact"
  onRowClick?: (row: TData) => void
  onSelectionChange?: (selected: TData[]) => void
  emptyState?: React.ReactNode
  loadingRowCount?: number
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
  className?: string
}
```

**Accessibility**: Keyboard navigation between rows (arrow keys), sortable column headers announce sort state via `aria-sort`, row selection checkboxes have labels.

**Modules using it**: Employees, Attendance, Leave, Payroll, Recruitment, Assets, Helpdesk, Projects, Documents — every module with a list view.

**Non-goals**: Server-side pagination (added per-module when needed), virtual scrolling, inline cell editing.

**Full spec**: See `data-table-standard.md`.

---

### 2. StatusBadge

**Purpose**: Semantic status indicator wrapping handoff `.badge` and `.pill-status` CSS classes.

**Location**: `packages/ui/src/components/status-badge.tsx`

**Dependencies**: None

**Handoff CSS**: `.badge`, `.badge-dot`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`, `.badge-accent`, `.pill-status`, `.pill-status.active`, `.pill-status.probation`, `.pill-status.notice`, `.pill-status.contract`

**shadcn wraps**: None — handoff owns this visual

**Prop Interface**:
```ts
interface StatusBadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "accent"
  dot?: boolean
  children: React.ReactNode
  className?: string
}

interface PillStatusProps {
  status: "active" | "probation" | "notice" | "contract" | "archived"
  children: React.ReactNode
  className?: string
}
```

**Rendering**:
```tsx
// StatusBadge renders:
<span className={cn("badge", variant !== "default" && `badge-${variant}`, className)}>
  {dot && <span className="badge-dot" />}
  {children}
</span>

// PillStatus renders:
<span className={cn("pill-status", status, className)}>
  <span className="badge-dot" />
  {children}
</span>
```

**Accessibility**: Status badges are decorative when next to visible text. When used standalone, add `role="status"` and `aria-label`.

**Modules using it**: Every module — statuses are universal (active, pending, approved, rejected, draft, etc.).

**Non-goals**: Interactive badges (clickable badges are buttons, not badges).

---

### 3. FilterBar

**Purpose**: Row of filter chips with active state, wrapping handoff `.filter-bar` / `.filter-chip` CSS.

**Location**: `packages/ui/src/components/filter-bar.tsx`

**Dependencies**: None (future: shadcn Popover for dropdown filters)

**Handoff CSS**: `.filter-bar`, `.filter-chip`, `.filter-chip:hover`, `.filter-chip.active`, `.filter-chip .v`

**Prop Interface**:
```ts
interface FilterOption {
  value: string
  label: string
}

interface FilterDefinition {
  key: string
  label: string
  icon?: React.ReactNode
  options?: FilterOption[]
}

interface FilterBarProps {
  filters: FilterDefinition[]
  activeFilters: Record<string, string[]>
  onFilterChange: (key: string, values: string[]) => void
  onClearAll?: () => void
  className?: string
}
```

**Rendering**: Each filter renders a `.filter-chip` button. Active filters show `.filter-chip.active` with value in `.v` span.

**Accessibility**: Filter chips are buttons with `aria-pressed` state. Active filter values announced via `aria-label`.

**Modules using it**: Employees, Attendance, Leave, Payroll, Recruitment, Assets.

**Non-goals**: Complex filter forms (date ranges, sliders — those use separate popover components).

---

### 4. SavedViewTabs

**Purpose**: Switchable view lenses wrapping handoff `.tabs` / `.tabs-pill` CSS. Not for content tabs — for data view filtering (All, Active, Archived, etc.).

**Location**: `packages/ui/src/components/saved-view-tabs.tsx`

**Dependencies**: None

**Handoff CSS**: `.tabs`, `.tabs-pill`, `.tab`, `.tab[aria-selected="true"]`, `.tab .count`

**Prop Interface**:
```ts
interface ViewTab {
  key: string
  label: string
  count?: number
}

interface SavedViewTabsProps {
  views: ViewTab[]
  activeView: string
  onViewChange: (key: string) => void
  variant?: "underline" | "pill"
  className?: string
}
```

**Rendering**: `<div className={cn("tabs", variant === "pill" && "tabs-pill")}>` containing `.tab` buttons with `aria-selected` attribute and optional `.count` spans.

**Accessibility**: Uses `role="tablist"` / `role="tab"` / `aria-selected`. Keyboard: arrow keys to switch tabs.

**Modules using it**: Employees (All/Active/On leave/Archived), Attendance, Leave, Payroll, Helpdesk.

**Non-goals**: Content tab panels (this is just the tab row, not the panel switching logic).

---

### 5. BulkActionToolbar

**Purpose**: Selection-dependent action bar wrapping handoff `.bulk-bar` CSS.

**Location**: `packages/ui/src/components/bulk-action-toolbar.tsx`

**Dependencies**: None

**Handoff CSS**: `.bulk-bar`, `.bulk-bar.visible`, `.toolbar-divider`

**Prop Interface**:
```ts
interface BulkActionToolbarProps {
  selectedCount: number
  onClear: () => void
  children: React.ReactNode
  className?: string
}
```

**Rendering**: `<div className={cn("bulk-bar", selectedCount > 0 && "visible")}>` with count display, divider, action button slots, and clear button.

**Accessibility**: Announce selected count via `aria-live="polite"`. Action buttons within toolbar are focusable.

**Modules using it**: Employees, Attendance (bulk validate), Leave (bulk approve), Payroll (bulk confirm).

**Non-goals**: Does not manage selection state — that's owned by DataTable's row selection.

---

### 6. EntitySheet

**Purpose**: Slide-in side panel for quick view/edit of entity details.

**Location**: `packages/ui/src/components/sheet.tsx` (shadcn Sheet) + `packages/ui/src/components/entity-sheet.tsx` (composed wrapper)

**Dependencies**: shadcn Sheet (new install — uses @base-ui/react Dialog for accessibility)

**Handoff CSS**: `.drawer`, `.drawer-backdrop`, `.drawer-head`, `.drawer-body`, `.drawer-foot`, `.drawer-section`, `.drawer-stats` (from employees.css). shadcn Sheet provides the accessibility layer (focus trap, portal, escape-to-close); handoff CSS provides the visual styling.

**Prop Interface**:
```ts
interface EntitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  subtitle?: string
  avatar?: React.ReactNode
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  width?: number | string
  children: React.ReactNode
}
```

**Accessibility**: Focus trap when open, escape to close, background scroll lock, `role="dialog"` with `aria-label`.

**Modules using it**: Employees (preview drawer), Attendance (record detail), Leave (request detail), Payroll (payslip preview), Recruitment (candidate preview).

**Non-goals**: Does not include tab navigation inside sheet — tabs composed separately using SavedViewTabs.

---

### 7. ConfirmDialog

**Purpose**: Modal confirmation for destructive or irreversible actions.

**Location**: `packages/ui/src/components/confirm-dialog.tsx`

**Dependencies**: shadcn AlertDialog (new install)

**Handoff CSS**: None — shadcn AlertDialog styled to match Heimdallone tokens via globals.css

**Prop Interface**:
```ts
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<void>
  loading?: boolean
}
```

**Accessibility**: Focus trapped in dialog, escape to close, confirm button auto-focused for destructive variant.

**Modules using it**: All — archive employee, delete record, confirm payslip, approve/reject with consequence.

**Non-goals**: Complex forms inside dialog — use EntitySheet for that.

---

### 8. EmptyState

**Purpose**: Consistent no-data display with contextual message and optional CTA.

**Location**: `packages/ui/src/components/empty-state.tsx`

**Dependencies**: `lucide-react` (for icons)

**Handoff CSS**: None — composed from handoff design tokens (colors, spacing, typography)

**Prop Interface**:
```ts
interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}
```

**Rendering**: Centered flex column with muted icon, title (h4 style), description (fg-3 color), optional accent-colored button.

**Accessibility**: Not interactive unless action button present.

**Modules using it**: Every list view, every tab panel, every search result.

**Non-goals**: Animated illustrations, complex multi-action empty states.

---

### 9. AuditTimeline

**Purpose**: Chronological activity event feed using handoff timeline CSS.

**Location**: `packages/ui/src/components/audit-timeline.tsx`

**Dependencies**: None

**Handoff CSS**: `.timeline`, `.tl-item`, `.tl-dot`, `.tl-dot.accent`, `.tl-time`, `.tl-actor` (from dashboard.css); `.tl-item .dot`, `.tl-item .desc`, `.tl-item .meta`, `.tl-item .time` (from employee-profile.css)

**Prop Interface**:
```ts
interface TimelineEvent {
  id: string
  icon?: React.ReactNode
  dotVariant?: "default" | "accent" | "success" | "warning" | "danger"
  actor?: string
  description: React.ReactNode
  meta?: string
  timestamp: string
}

interface AuditTimelineProps {
  events: TimelineEvent[]
  emptyMessage?: string
  className?: string
}
```

**Rendering**: `<div className="timeline">` with `.tl-item` grid rows containing dot, description, and timestamp.

**Accessibility**: List semantics (`role="list"` / `role="listitem"`), timestamps in `<time>` elements.

**Modules using it**: Employee profile (activity tab), Payslip history, Leave request history, Compliance audit log.

**Non-goals**: Interactive timeline (expandable detail, inline actions).

---

### 10. ApprovalQueue

**Purpose**: List of pending items with approve/reject actions.

**Location**: `apps/web/src/components/approval-queue.tsx` (web-app level — uses oRPC mutations)

**Dependencies**: StatusBadge, ActionMenu, Sonner (toast)

**Handoff CSS**: Composed from `.card`, `.kv`, `.badge`, `.btn` patterns

**Prop Interface**:
```ts
interface ApprovalItem<T = unknown> {
  id: string
  title: string
  subtitle?: string
  avatar?: React.ReactNode
  status: string
  metadata?: Record<string, string>
  data: T
}

interface ApprovalQueueProps<T = unknown> {
  items: ApprovalItem<T>[]
  onApprove: (item: ApprovalItem<T>) => void | Promise<void>
  onReject: (item: ApprovalItem<T>) => void | Promise<void>
  approveLabel?: string
  rejectLabel?: string
  emptyMessage?: string
  isLoading?: boolean
}
```

**Accessibility**: Each item is a card with approve/reject buttons. Keyboard navigable.

**Modules using it**: Leave approvals, Attendance validation, Shift/work type requests, Asset requests, Reimbursements.

**Non-goals**: Batch approve (handled by BulkActionToolbar + DataTable row selection).

**Implementation timing**: Phase 7+ (first needed for Leave approvals).

---

### 11. FormSection

**Purpose**: Grouped form fields with heading and optional description.

**Location**: `packages/ui/src/components/form-section.tsx`

**Dependencies**: None

**Handoff CSS**: `.drawer-section .tiny` pattern for section headings; compose from tokens

**Prop Interface**:
```ts
interface FormSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}
```

**Rendering**: Div with section heading (`.tiny`-style uppercase label), optional description (fg-3 color), children below.

**Modules using it**: Employee create/edit, Contract forms, Leave type settings, Payroll settings.

**Non-goals**: Collapsible sections (use progressive disclosure pattern separately).

---

### 12. FieldHelp

**Purpose**: Inline tooltip or help text for form fields.

**Location**: `packages/ui/src/components/field-help.tsx`

**Dependencies**: shadcn Tooltip (new install)

**Handoff CSS**: None — compose from tokens

**Prop Interface**:
```ts
interface FieldHelpProps {
  text: string
  side?: "top" | "right" | "bottom" | "left"
  children?: React.ReactNode
}
```

**Rendering**: When `children` provided, wraps trigger element with Tooltip. When used standalone, renders a small `(?)` icon with tooltip.

**Accessibility**: Tooltip content accessible via `aria-describedby`.

**Modules using it**: Payroll fields (pre-tax vs post-tax), Leave type configuration (carry-forward rules), Contract fields.

**Non-goals**: Inline validation messages (those are part of TanStack Form error display).

---

### 13. ViewSwitcher

**Purpose**: Toggle between view modes (table, card grid, calendar, kanban, etc.).

**Location**: `packages/ui/src/components/view-switcher.tsx`

**Dependencies**: `lucide-react`

**Handoff CSS**: `.density-pills` pattern from employees page (reuse segmented button styling)

**Prop Interface**:
```ts
interface ViewOption {
  key: string
  label: string
  icon: React.ReactNode
}

interface ViewSwitcherProps {
  views: ViewOption[]
  activeView: string
  onViewChange: (key: string) => void
  className?: string
}
```

**Accessibility**: `role="radiogroup"` with `role="radio"` + `aria-checked` per option.

**Modules using it**: Employees (list/card/org-chart), Recruitment (list/kanban), Helpdesk (list/kanban), Attendance (grid/calendar).

**Implementation timing**: Phase 5 for employee list, Phase 7+ for other modules.

---

### 14. PageHeader

**Purpose**: Consistent page title area with breadcrumb, title, description, and primary action button.

**Location**: `packages/ui/src/components/page-header.tsx`

**Dependencies**: None

**Handoff CSS**: `.head` and `.hdr` patterns from existing pages (e.g., employees page header)

**Prop Interface**:
```ts
interface PageHeaderProps {
  title: string
  description?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}
```

**Rendering**: Flex row with title (h3), optional description (fg-2), optional badge, right-aligned action slot.

**Modules using it**: Every page.

**Non-goals**: Breadcrumb navigation (handled separately by TanStack Router).

---

### 15. ActionMenu

**Purpose**: Row-level or entity-level action dropdown wrapping handoff menu CSS.

**Location**: `packages/ui/src/components/action-menu.tsx`

**Dependencies**: None (uses handoff `.menu-root` / `.menu` / `.menu-item` CSS with toggle state)

**Handoff CSS**: `.menu-root`, `.menu`, `.menu[data-open]`, `.menu-item`, `.menu-item.danger`, `.menu-icon`, `.menu-meta`, `.menu-section`, `.menu-sep`

**Prop Interface**:
```ts
interface ActionMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: "default" | "danger"
  shortcut?: string
  disabled?: boolean
}

interface ActionMenuSection {
  title?: string
  items: ActionMenuItem[]
}

interface ActionMenuProps {
  sections: ActionMenuSection[]
  trigger?: React.ReactNode
  align?: "bottom-end" | "bottom-start" | "top-end"
}
```

**Note**: The handoff uses custom CSS-based menus (`.menu[data-open="true"]`), not shadcn DropdownMenu. Evaluate during Phase 4F whether to use handoff CSS menu with manual toggle state, or shadcn DropdownMenu for better accessibility (focus management, keyboard navigation, screen reader). Decision should favor accessibility — if shadcn DropdownMenu can be styled to match handoff visuals, prefer it.

**Accessibility**: Menu items navigable via arrow keys, escape to close, type-ahead for item labels.

**Modules using it**: Every table row, every detail page action bar.

---

### 16. ImportExportActions

**Purpose**: Standardized import/export menu for data tables.

**Location**: `apps/web/src/components/import-export-actions.tsx` (web-app level — uses browser APIs)

**Dependencies**: ActionMenu

**Handoff CSS**: Composes ActionMenu patterns

**Prop Interface**:
```ts
interface ImportExportActionsProps {
  onImportCSV?: () => void
  onImportAPI?: () => void
  onExportCSV?: (selectedIds?: string[]) => void
  onExportExcel?: (selectedIds?: string[]) => void
  selectedCount?: number
  entityLabel: string
}
```

**Modules using it**: Employees, Attendance, Payroll.

**Implementation timing**: Phase 5 (employees import/export).

---

### 17. WizardForm

**Purpose**: Multi-step form with progress indicator, per-step validation, review step, and TanStack Form integration.

**Location**: `apps/web/src/components/wizard-form.tsx` (web-app level — depends on TanStack Form)

**Dependencies**: `@tanstack/react-form` (already installed)

**Full spec**: See `form-wizard-standard.md`.

**Prop Interface**:
```ts
interface WizardStep {
  key: string
  title: string
  description?: string
  validate?: () => boolean | Promise<boolean>
  content: React.ReactNode
}

interface WizardFormProps {
  steps: WizardStep[]
  onComplete: (data: unknown) => void | Promise<void>
  onCancel?: () => void
  completeLabel?: string
  showReviewStep?: boolean
  reviewContent?: React.ReactNode
}
```

**Accessibility**: Step indicator shows current/completed/upcoming with `aria-current="step"`. Focus moves to first field in new step on navigation.

**Modules using it**: Employee creation, Contract setup, Leave type configuration, Payroll run, Device setup.

**Non-goals**: Auto-save, draft persistence (evaluated per-module).

---

## Phase 5 Implementation Recommendation

| When | Primitives |
|------|-----------|
| **Phase 4F** (build before HR Core) | DataTable, StatusBadge, EmptyState, EntitySheet (shadcn Sheet), ConfirmDialog (shadcn AlertDialog), PageHeader, ActionMenu |
| **Phase 5** (build during HR Core) | FilterBar, SavedViewTabs, BulkActionToolbar, FormSection, FieldHelp, WizardForm, ViewSwitcher, ImportExportActions |
| **Phase 7+** (defer until needed) | ApprovalQueue, AuditTimeline |

**Rationale**: Tier 1 primitives are needed for the employee list page (the first real page with live data). Tier 2 primitives can be built as the employee module grows (settings, create wizard, filters). Approval/timeline are only needed when request/approval workflows land in Phase 7-8.

---

## Implementation Notes (updated 2026-05-27)

### Server-Side Pagination Pattern (proven in Phase 5–6)

Both `employees/index.tsx` and `contracts/index.tsx` use this inline pagination pattern — no shared component needed:

```typescript
const [page, setPage] = useState(1);
const pageSize = 50;
// ... useQuery with { page, pageSize } ...
const totalPages = Math.ceil(total / pageSize);
// Render:
{totalPages > 1 && (
  <div className="pagination">
    <button disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
    <span>{page} / {totalPages}</span>
    <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>→</button>
  </div>
)}
```

The `pagination` and `pager` CSS classes are in the per-module CSS file. No shared component needed until 3+ modules repeat this pattern with identical structure.

### ContractSheet vs EntitySheet

Phase 6 used a custom inline `ContractSheet` (a fixed-position modal with backdrop button) rather than the `EntitySheet` primitive. This was intentional: contracts have a complex multi-section form that doesn't fit the `EntitySheet` field-list API. For Phase 7+, consider whether a more flexible `EntitySheet` variant (accepts arbitrary children instead of a field list) is worth building, or keep the per-module sheet pattern.

### Employee Dropdown Scaling

ContractSheet, employee create wizard, and employee edit sheet load employees via `pageSize: 100` for select dropdowns. Capped at 100 employees. For orgs with >100 employees, Phase 7+ should add search-as-you-type (debounced query on keystroke) rather than increasing the page size cap.
