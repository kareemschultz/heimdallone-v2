# UI Pattern Library Recommendations — Cross-Module Standards

## Overview

This document defines the shared UI patterns, component standards, and design rules for Heimdallone's HRMS frontend. All modules should follow these conventions for a consistent, staff-friendly experience.

## Component Stack

- **shadcn/ui** — Base component library (Button, Input, Select, Dialog, Sheet, etc.)
- **TanStack Table** — Data tables with sorting, filtering, pagination, column visibility
- **TanStack Form** — Complex forms with validation, multi-step wizards
- **TanStack Query** — Server state, caching, optimistic updates
- **TanStack Router** — File-based routing with nested layouts
- **oRPC** — Type-safe server communication
- **Sonner** — Toast notifications for operation feedback
- **Heimdallone design tokens** — Colors, spacing, typography from `heimdall.css`

## Data Table Standard

Every list view in Heimdallone uses a consistent Data Table pattern:

### Required Features
- Column definitions with header labels and cell formatters
- Sortable columns (click header to sort)
- Global search (text search across visible columns)
- Column visibility toggle (hide/show columns)
- Pagination (25/50/100 rows per page, server-side for large datasets)
- Empty state component with contextual message and CTA
- Loading state with Skeleton rows
- Error state with retry button

### Optional Features (per module)
- Row selection (checkbox column) with bulk action toolbar
- Faceted filters (multi-select chips for enum fields like department, status)
- Date range filter
- Saved views / lenses (predefined filter combinations)
- Row actions (Dropdown Menu with View, Edit, Archive, etc.)
- Inline quick edit (for simple fields)
- Export (CSV/Excel) for selected or all rows

### Dense Mode
For HRMS tables with many columns (attendance, payroll):
- Compact row height (~36px)
- Smaller font (13px)
- Truncated cells with tooltip on hover
- Fixed header for scroll

## Status Color System

Consistent semantic colors across all modules:

| Semantic | Color Token | Usage |
|----------|-------------|-------|
| Active / Approved / Complete / Compliant | `--emerald` / green | Approved leaves, paid payslips, active employees, resolved tickets |
| Pending / Needs Review / Submitted | `--amber` / yellow | Pending approvals, draft payslips, submitted requests |
| Rejected / Failed / Overdue / Non-compliant | `--rose` / red | Rejected requests, overdue tasks, failed syncs |
| Draft / Scheduled / In Progress | `--blue` | Draft contracts, in-progress tasks, scheduled interviews |
| Archived / Inactive / Not Applicable | `--muted` / gray | Archived employees, cancelled requests |
| Special / Automation / System | `--violet` / purple | System-generated events, automation triggers |

### Badge Component
```
<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="destructive">Rejected</Badge>
<Badge variant="secondary">Draft</Badge>
<Badge variant="outline">Archived</Badge>
```

## Form Standards

### Simple Forms
- Use Sheet (side panel) for simple CRUD (create note, add comment, quick edit field)
- Inline validation with human-readable messages
- Submit button at bottom with loading state
- Cancel closes sheet without saving

### Complex Forms
- Use full page or Dialog for multi-field forms (employee create, contract setup)
- Group related fields in sections with clear headings
- Progressive disclosure: show common fields first, "Advanced" expandable section
- Conditional fields: show/hide based on selections (e.g., wage type affects which salary fields appear)

### Wizard Forms
- Use for 3+ step processes (employee creation, pay run, leave type setup)
- Step indicator at top (numbered dots or breadcrumb)
- Per-step validation (don't let user advance with errors)
- "Back" button preserves entered data
- Review step before final submit
- Success state with "What's next" guidance

### Validation Messages
- Inline under the field, not in alert boxes
- Plain language: "Email is already in use" not "Duplicate key constraint violation"
- Suggest fixes when possible: "This employee already has an active contract. Archive it first?"
- Real-time validation for format fields (email, phone, dates)

## Action Placement Rules

| Action Type | Placement |
|-------------|-----------|
| Primary page action (Create, Run Payroll) | Top-right page header button |
| Row-level action (View, Edit, Archive) | Dropdown Menu in last table column |
| Bulk action (Approve All, Export) | Floating toolbar above table (visible when rows selected) |
| Detail page action (Approve, Reject, Edit) | Action buttons in page header or action dropdown |
| Quick action (Check In, Submit Request) | Prominent button on dashboard/relevant page |
| Destructive action (Delete, Archive) | Last in menu, red text, requires confirmation Dialog |
| Contextual action (Add Note, Upload File) | Button in the relevant section/tab |

## Empty States

Every list/table/view must have a meaningful empty state:

```
[Icon]
[Headline — what the user can do]
[Description — brief context]
[Primary CTA button]
```

Examples:
- Employees: "No employees yet / Add your first team member to get started / [Add Employee]"
- Leave requests: "No leave requests / Your team hasn't submitted any leave requests yet"
- Attendance: "No attendance records for today / Check in to start tracking your work hours / [Check In]"
- Payslips: "No payslips for this period / Generate payslips when you're ready / [Run Payroll]"

## Loading States

- **Table**: Skeleton rows (4-6 rows with pulsing placeholders)
- **Detail page**: Skeleton blocks matching layout shape
- **Cards**: Skeleton cards with placeholder content
- **Charts**: Skeleton rectangle with pulse
- **Form**: Do not show skeletons — wait for data then render

## Error States

- **Network error**: "Unable to load data. Check your connection and try again. [Retry]"
- **Permission error**: "You don't have access to this page. Contact your administrator."
- **Not found**: "This record doesn't exist or has been archived."
- **Server error**: "Something went wrong on our end. We've been notified. [Retry]"

## Saved Views / Lenses

Operational modules (Attendance, Leave, Payroll, Employees) should support named filter presets:

| Module | Suggested Lenses |
|--------|-----------------|
| Employees | All, Active, My Team, By Department, Archived, New Joiners (last 30 days) |
| Attendance | Today, This Week, Exceptions, Pending Validation, Pending OT |
| Leave | My Requests, Pending Approval, Team Calendar, Expiring Balances |
| Payroll | Current Period, Pending Review, Confirmed, Paid, Blocked |
| Recruitment | Active Openings, My Pipelines, Interviews This Week |
| Helpdesk | My Tickets, Assigned to Me, Unassigned, Overdue |

## Role-Specific Default Views

| Role | Default Dashboard | Default Module View |
|------|------------------|-------------------|
| Employee | Personal dashboard (today's attendance, leave balance, pending tasks) | My view (own data) |
| Manager | Team dashboard (team attendance, pending approvals, direct reports) | Team view (direct reports) |
| HR Admin | Organization dashboard (headcount, turnover, pending actions) | All employees |
| Payroll Admin | Payroll dashboard (current run status, pending, exceptions) | Current period |
| Recruiter | Pipeline dashboard (open positions, interviews, candidates) | Active openings |
| Helpdesk Agent | Ticket queue (assigned, unassigned, SLA) | Assigned to me |
| Auditor | Audit dashboard (recent changes, compliance, risk) | Audit log |
| Executive/Owner | Executive dashboard (KPIs, headcount, payroll cost, turnover) | Organization overview |

## Module View-Mode Matrix

| Module | Table | Cards | Calendar | Kanban | Gantt | Map | Dashboard |
|--------|-------|-------|----------|--------|-------|-----|-----------|
| Employees | Primary | Yes | — | — | — | — | — |
| Attendance | Primary | — | Yes | — | — | — | Summary |
| Leave | Requests | — | Team Cal | — | — | — | Balances |
| Payroll | Primary | — | — | — | — | — | Command |
| Recruitment | Candidates | — | Interviews | Pipeline | — | — | Summary |
| Onboarding | — | — | — | Primary | Timeline | — | — |
| Offboarding | — | — | — | Primary | Timeline | — | — |
| Performance | Goals | — | — | — | — | — | Review |
| Assets | Primary | — | — | — | — | — | — |
| Projects | Tasks | — | — | Yes | Future | — | — |
| Helpdesk | Primary | — | — | Yes | — | — | — |
| Documents | Primary | — | — | — | — | — | Expiry |
| Geofencing | — | — | — | — | — | Map | — |

## Accessibility Requirements

- All interactive elements keyboard-navigable
- Focus ring visible on tab navigation
- ARIA labels on icon-only buttons
- Color is never the only indicator (use text labels alongside badges)
- Form labels always visible (not placeholder-only)
- Error messages linked to fields via aria-describedby
- Modal/Sheet trap focus when open
- Dark mode is default (matches Heimdallone design handoff)
