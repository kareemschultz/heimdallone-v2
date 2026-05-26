# Frontend-Backend Workflow Patterns — Cross-Module Summary

## Overview

This document synthesizes how Horilla connects frontend screens to backend operations across all modules, translated into Heimdallone-native patterns using TanStack Start + oRPC + shadcn/ui.

## Common Workflow Patterns

### 1. List → Detail → Action

Most modules follow: Table/List view → Click row → Detail view → Action buttons → Mutation → Toast feedback.

**Heimdallone pattern**:
- List: shadcn Data Table with TanStack Table
- Detail: Sheet (quick preview) or full route (`/$id`)
- Actions: Dropdown Menu on row, primary action buttons on detail
- Mutations: oRPC mutation → TanStack Query invalidation → Sonner toast

### 2. Request → Approve/Reject

Used by: Leave requests, shift requests, work type requests, attendance corrections, asset requests, reimbursements, resignation, document approvals, loan approvals.

**Backend**: `status` enum field (requested → approved/rejected). Approval may trigger side effects (deduct leave balance, create payroll allowance, update employee work info).

**Heimdallone pattern**:
- Employee: Form → Submit → See status badge in "My Requests" list
- Manager/HR: Approval queue (filtered table/list) → Review details → Approve/Reject with optional comment
- oRPC: `module.requests.create` (mutation), `module.requests.approve` / `module.requests.reject` (mutation)
- UI: Status badge changes color on mutation. Sonner toast for feedback.
- Optimistic update: Show approved status immediately, roll back on error

### 3. CRUD with Status Lifecycle

Used by: Contracts (draft/active/expired/terminated), Payslips (draft/review/confirmed/paid), Projects (new/in_progress/completed), Tickets (new/in_progress/resolved).

**Heimdallone pattern**:
- Status shown as colored Badge on list and detail views
- Status transitions via action buttons (not dropdown select)
- Confirmation Dialog for irreversible transitions (e.g., "Confirm payslip — this cannot be undone")
- Audit event created on each transition

### 4. Pipeline/Kanban

Used by: Recruitment (stages), Onboarding (stages), Offboarding (stages), Projects (stages), Helpdesk (statuses).

**Heimdallone pattern**:
- Kanban board: Columns = stages/statuses, Cards = entities
- Drag-and-drop to move between columns
- Card shows: avatar, name, key info, progress indicator
- Column header shows count
- oRPC: `module.moveToStage` mutation

### 5. Calendar View

Used by: Leave (team calendar), Attendance (monthly grid), Recruitment (interview calendar), Holidays.

**Heimdallone pattern**:
- Monthly calendar grid with color-coded cells
- Click date to see details or create new entry
- shadcn Calendar component for date picker, custom grid for month view
- Data: oRPC query with date range → render cells

### 6. Configuration/Settings

Used by: Leave types, Shifts, Pay items, Ticket types, Asset categories, Automation rules.

**Heimdallone pattern**:
- Settings page with sectioned groups
- Inline table CRUD (edit in place or Sheet for complex items)
- No separate routes for individual settings — all on one page per section
- Route: `/app/settings/{section}`

### 7. Multi-Step Wizard

Used by: Employee creation, Payroll run, Contract setup, Leave type configuration, Onboarding plan setup.

**Heimdallone pattern**:
- TanStack Form with step state management
- Step indicator at top showing progress
- Next/Back navigation with per-step validation
- Review step before final submit
- Success screen with next actions

### 8. Bulk Operations

Used by: Attendance validation, Overtime approval, Leave approval, Payslip generation, Employee archive, Export.

**Heimdallone pattern**:
- Checkbox row selection in Data Table
- Floating action toolbar appears when rows selected
- Actions: Approve All, Reject All, Export Selected, Update Field
- Confirmation: Dialog showing count + summary before executing
- Progress: Sonner toast with progress for large batches

## Module-Specific Screen → Backend Mappings

### Employee Module
| Screen | oRPC Query | oRPC Mutation | Permission |
|--------|-----------|---------------|------------|
| Employee list | `employees.list` | — | `employee:read` |
| Employee profile | `employees.getById` | — | `employee:read` (self or manager/HR) |
| Create employee | — | `employees.create` | `employee:create` |
| Update work info | — | `employees.updateWorkInfo` | `employee:update` |
| Archive employee | — | `employees.archive` | `employee:delete` |

### Attendance Module
| Screen | oRPC Query | oRPC Mutation | Permission |
|--------|-----------|---------------|------------|
| Check-in | — | `attendance.checkIn` | self |
| Daily grid | `attendance.records` | — | self + manager + HR |
| Validate | — | `attendance.validate` | `attendance:update` |
| Approve OT | — | `attendance.approveOvertime` | `attendance:update` |

### Leave Module
| Screen | oRPC Query | oRPC Mutation | Permission |
|--------|-----------|---------------|------------|
| My leaves | `leave.requests` (filtered self) | — | self |
| Request leave | — | `leave.requests.create` | self |
| Approve | — | `leave.requests.approve` | manager/HR |
| Team calendar | `leave.calendar` | — | manager/HR |
| Balance view | `leave.balances` | — | self (own) / HR (all) |

### Payroll Module
| Screen | oRPC Query | oRPC Mutation | Permission |
|--------|-----------|---------------|------------|
| Payslip list | `payroll.payslips.list` | — | payroll_admin |
| Generate payslips | — | `payroll.run.generate` | payroll_admin |
| Review payslip | `payroll.payslips.getById` | — | payroll_admin / self (own) |
| Confirm payslip | — | `payroll.payslips.confirm` | payroll_admin |
| Mark paid | — | `payroll.payslips.markPaid` | payroll_admin |

## Shared UI Components to Build First

Based on cross-module patterns, these shared primitives should be built before module-specific screens:

1. **DataTable** — shadcn Table + TanStack Table with: column visibility, sorting, filtering, pagination, row selection, bulk action toolbar, empty/loading/error states
2. **StatusBadge** — Colored badge component with semantic color mapping
3. **ApprovalQueue** — Reusable list of pending items with approve/reject actions
4. **EntitySheet** — Sheet component for quick view/edit of entity details
5. **WizardForm** — Multi-step form component with TanStack Form integration
6. **KanbanBoard** — Drag-and-drop column layout for pipeline views
7. **MonthCalendar** — Color-coded monthly calendar grid
8. **AuditTimeline** — Chronological activity feed for entity history
9. **ConfirmDialog** — Reusable confirmation dialog for destructive/irreversible actions
10. **EmptyState** — Consistent empty state with icon, message, and CTA
11. **FilterDrawer** — Advanced filter panel with saved views/lenses
12. **BulkActionToolbar** — Floating toolbar showing actions for selected rows
