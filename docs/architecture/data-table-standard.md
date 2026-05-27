# DataTable Standard — Specification

Phase 4E deliverable. Defines how every list/table view in Heimdallone must behave.

---

## Architecture

- **Logic**: TanStack Table (`@tanstack/react-table`) — headless sorting, filtering, pagination, column visibility, row selection
- **Visual**: Handoff `.tbl` CSS classes — table, header, cells, hover, density
- **Wrapper**: `<DataTable>` component in `packages/ui/src/components/data-table.tsx`

The wrapper does NOT dictate surrounding layout. Toolbar, filter bar, bulk action bar, page header, and pagination are composed outside the DataTable by each page. DataTable owns only the `<table>` element and its TanStack Table state.

---

## Client-Side vs Server-Side

### Client-side (default)
- All data loaded upfront via oRPC query
- TanStack Table handles sort/filter/paginate in-memory
- Suitable for datasets under ~1,000 rows
- Used for: Employees (most orgs), Leave requests, Contracts, Assets, Tickets

### Server-side (opt-in per module)
- oRPC query accepts `page`, `pageSize`, `sort`, `filters` parameters
- TanStack Table configured with `manualPagination`, `manualSorting`, `manualFiltering`
- Total row count returned from server for pagination UI
- Used for: Attendance records (high volume), Payroll payslips (per-period), Audit events

### When to upgrade from client to server
- When a module's typical dataset exceeds ~500 rows per page load
- When users report slow page loads
- The DataTable component must support both modes without API change

---

## Pagination

### Page size options
- Default options: `[25, 50, 100]`
- Default page size: `50`
- Override per module (e.g., attendance may default to 25 for dense data)

### URL state
- Current page and page size persisted in URL search params (`?page=2&size=50`)
- Enables browser back/forward navigation
- TanStack Router `useSearch` for reading, `navigate` for writing

### UI
- Bottom of table: "Showing X–Y of Z" count
- Page navigation: Previous / Next buttons with page number indicators
- Page size selector: dropdown (25 / 50 / 100)

---

## Sorting

### Behavior
- Click column header to toggle: unsorted → ascending → descending → unsorted
- Visual indicator: arrow icon in header (↑ asc, ↓ desc)
- Single-column sort by default
- Multi-column sort: hold Shift + click (optional, per module)

### Default sort
- Each module defines a default sort column and direction
- Employees: `name` ascending
- Attendance: `date` descending
- Leave requests: `createdAt` descending
- Payslips: `periodEnd` descending

### URL state
- Sort persisted in URL: `?sort=name&dir=asc`

---

## Filtering

### Global search
- Text input above table
- Searches across all visible text columns (configurable per module)
- Debounced (300ms)
- Case-insensitive
- Placeholder: "Search by name, ID, email…" (customized per module)

### Column filters
- Available on select columns (enum fields: status, department, type)
- Triggered via filter chips in FilterBar (separate component above table)
- Each filter restricts one column's values
- Multiple filters AND together

### Faceted filters
- Multi-select for enum columns (department, status, leave type)
- Show option count per value (e.g., "Engineering (24)")
- Rendered as Popover with checkbox list when many options

### Date range filters
- Start date / end date pickers
- Common presets: Today, This week, This month, This quarter, Custom
- Used for: Attendance (date), Leave (request date), Payroll (period)

### Saved views / lenses
- Predefined filter + sort combinations per module
- Rendered via SavedViewTabs above the filter bar
- Examples: "All", "Active", "On Leave", "Archived", "My Team"
- Role-based defaults: managers see "My Team" by default
- User-saved views: future enhancement (store in localStorage or server)

---

## Column Visibility

### Toggle
- Column visibility menu (dropdown with checkboxes)
- Triggered by "Columns" button in toolbar area
- Persisted in localStorage per module per user

### Default visible columns
- Each module defines which columns are visible by default
- Dense tables (payroll, attendance): show fewer columns by default, more available
- All columns include a `meta.defaultVisible` flag in column definitions

### Required columns
- Some columns are always visible (cannot be hidden): Name/ID, Status, Actions

---

## Row Selection

### Behavior
- Checkbox in first column (opt-in per module)
- Click checkbox to select individual row
- Header checkbox: select all on current page / deselect all
- Shift+click for range selection (optional)
- Selected count shown in BulkActionToolbar

### State
- Selection state managed by TanStack Table's `rowSelection`
- Exposed via `onSelectionChange` callback

### Modules using row selection
- Employees (bulk department change, bulk archive, bulk export)
- Attendance (bulk validate, bulk approve OT)
- Leave (bulk approve/reject)
- Payroll (bulk confirm, bulk mark paid)

---

## Bulk Actions

- Rendered by BulkActionToolbar (separate component)
- Appears above table when `selectedCount > 0`
- Common patterns:
  - Bulk approve / reject (leave, attendance)
  - Bulk update field (employees — department, shift)
  - Bulk archive / restore
  - Bulk export (CSV/Excel)
- Each bulk action shows ConfirmDialog before executing
- Progress feedback via Sonner toast

---

## Row Action Dropdowns

- Last column: "⋯" button opening ActionMenu
- Standard actions per module (customized):
  - View details (navigates or opens EntitySheet)
  - Quick edit (opens EntitySheet with form)
  - Archive / Restore
  - Duplicate
  - Delete (destructive, with ConfirmDialog)
- Actions hidden on hover row (opacity transition) for cleaner visual

### RBAC-aware actions
- Actions rendered based on user's role
- **Hide** actions the user cannot perform (don't show grayed-out disabled actions — that's confusing)
- Server-side enforcement via oRPC middleware is mandatory; frontend hiding is UX-only

---

## Empty / Loading / Error States

### Empty state
- Rendered when `data.length === 0` and `isLoading === false`
- Uses EmptyState component
- Message varies by context:
  - No data ever: "No employees yet. Add your first team member." + CTA button
  - No filter match: "No results match your filters. Try adjusting your search." (no CTA)

### Loading state
- Renders Skeleton rows (4–6 rows matching column count)
- Header stays visible
- No spinner — skeleton is the loading indicator

### Error state
- Shows inline error with retry button
- "Unable to load data. Check your connection and try again. [Retry]"
- Retry triggers `onRetry` callback (re-fetches oRPC query)

---

## Export / Import

### Export
- "Export" button in toolbar or ImportExportActions menu
- Options: Export all (current filters applied) or Export selected
- Formats: CSV (always available), Excel (future)
- Client-side generation for small datasets, server-side for large
- Filename: `{module}-{date}.csv` (e.g., `employees-2026-05-26.csv`)

### Import
- "Import" button opens file picker or import wizard
- CSV upload with validation preview (show errors before committing)
- Column mapping step (match CSV columns to entity fields)
- Per-module: implemented when needed (employees first)

---

## Density

### Modes
- **Comfortable**: Row height ~48px, font 14px — for scanning and reading
- **Default**: Row height ~40px, font 13px — balanced
- **Compact**: Row height ~32px, font 12.5px — maximum data density

### Control
- Density toggle in toolbar (3-segment button matching handoff `.density-pills`)
- Persisted in localStorage per module
- Applied via `data-density` attribute on table wrapper

---

## Mobile / Responsive

### Strategy
- Tables scroll horizontally on small screens
- First column (name/ID) is sticky on horizontal scroll
- Column count reduced: hide lower-priority columns at breakpoints
- Future: card-based fallback for mobile (ViewSwitcher auto-selects card view on small screens)

### Priority columns
- Each module marks columns with priority (1 = always visible, 2 = hide < 1024px, 3 = hide < 768px)

---

## Accessibility

### Keyboard
- Tab into table → focus first row
- Arrow Up/Down: move between rows
- Enter: trigger row click (open detail)
- Space: toggle row selection (when enabled)
- Tab from row → focus row action button

### Screen reader
- `<table>` has `role="table"` (implicit)
- Sort state announced via `aria-sort` on `<th>`
- Row selection state via `aria-selected` on `<tr>`
- Bulk action toolbar announced via `aria-live="polite"` on selection change
- Empty/loading/error states have appropriate `role="status"` announcements
