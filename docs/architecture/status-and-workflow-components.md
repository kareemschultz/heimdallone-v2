# Status & Workflow Components — Specification

Phase 4E deliverable. Defines how status indicators, workflow lifecycles, approval UIs, audit trails, and blocking/error states are displayed across all Heimdallone modules.

---

## StatusBadge Variants

### Badge (`.badge` class family)

| Variant | CSS Class | Color Token | Usage |
|---------|-----------|-------------|-------|
| `default` | `.badge` | `--fg-2` on `--bg-3` | Generic / neutral labels |
| `success` | `.badge-success` | `--success` on `--success-soft` | Approved, Active, Complete, Compliant, Synced, Paid |
| `warning` | `.badge-warning` | `--warning` on `--warning-soft` | Pending, Due Soon, Needs Review, Probation |
| `danger` | `.badge-danger` | `--danger` on `--danger-soft` | Rejected, Failed, Overdue, Non-compliant, Blocked |
| `info` | `.badge-info` | `--info` on `--info-soft` | Draft, Scheduled, In Progress, Informational |
| `accent` | `.badge-accent` | `--accent` on `--accent-soft` | Highlighted, Featured, Current |

### Dot indicator
- `.badge-dot` — 6px colored circle inside badge, inherits text color
- Used for live status (online/offline, active/inactive)

### Pill Status (`.pill-status` class family)
Employee-specific lifecycle indicators:

| Status | CSS Class | Visual |
|--------|-----------|--------|
| Active | `.pill-status.active` | Green dot + "Active" |
| Probation | `.pill-status.probation` | Blue dot + "Probation" |
| Notice | `.pill-status.notice` | Amber dot + "Notice" |
| Contract | `.pill-status.contract` | Default dot + "Contract" |
| Archived | *(add in Phase 4F)* | Gray dot + "Archived" |

### Cross-Module Status Mapping

| Entity | Statuses → Badge Variant |
|--------|--------------------------|
| Employee | active→success, probation→info, notice→warning, archived→default |
| Leave Request | requested→warning, approved→success, rejected→danger, cancelled→default |
| Attendance | validated→success, pending→warning, conflict→danger, holiday→info |
| Overtime | approved→success, pending→warning |
| Contract | draft→info, active→success, expired→default, terminated→danger |
| Payslip | draft→default, review→warning, confirmed→info, paid→success |
| Ticket | new→info, in_progress→warning, on_hold→default, resolved→success, canceled→default |
| Asset | available→success, in_use→info, not_available→default |
| Asset Request | requested→warning, approved→success, rejected→danger |
| Candidate | (varies by stage type) — applied→info, interview→warning, hired→success, cancelled→danger |
| Onboarding Task | todo→default, scheduled→info, ongoing→warning, stuck→danger, done→success |
| Offboarding Task | todo→default, in_progress→warning, stuck→danger, completed→success |
| Document | requested→warning, approved→success, rejected→danger |
| Reimbursement | requested→warning, approved→success, rejected→danger |
| Loan | active→info, settled→success |

---

## Workflow Lifecycle Display

### Linear lifecycle (most common)
Show the entity's progression through a fixed sequence of states.

**Pattern**: Horizontal step indicator with current state highlighted.

```
[ Draft ] → [ Under Review ] → [ Confirmed ] → [ Paid ]
   ○              ○                  ●             ○
                              (current state)
```

- Completed states: checkmark, muted color
- Current state: filled dot, accent color, bold label
- Upcoming states: empty dot, muted label

**Used for**: Payslips, Contracts, Loan installments, Offboarding pipeline

### Non-linear lifecycle (branching)
Where outcomes branch (approved vs rejected).

**Pattern**: Show current status as a badge on the entity card/row. Full history shown in AuditTimeline on the detail page. No visual step indicator — just the badge.

**Used for**: Leave requests, Attendance validation, Asset requests, Reimbursements

---

## Approval Queue Pattern

### Layout
Approval queue renders as a list of cards, each representing a pending request:

```
┌─────────────────────────────────────────────┐
│ [Avatar] Employee Name                      │
│          Leave Type · 3 days · Oct 1–3      │
│          Requested 2 hours ago              │
│                                             │
│          [Approve]  [Reject]  [View ▾]      │
└─────────────────────────────────────────────┘
```

### Behavior
- Sorted by: oldest first (FIFO) by default, switchable to newest first
- Filter by: type (leave/shift/attendance), department, urgency
- Approve: single click → Sonner toast "Leave approved for Maya Persaud"
- Reject: opens small dialog or inline text field for reason → "Rejected: insufficient coverage"
- View: expands card or opens EntitySheet with full details

### Batch approve
- Checkbox on each card
- BulkActionToolbar appears: "3 selected · [Approve All] [Reject All] [Clear]"
- Approve All → ConfirmDialog: "Approve 3 leave requests?" with summary list

### Empty state
- "No pending approvals — you're all caught up!" with checkmark icon

### Modules using approval queues
- Leave requests (manager/HR approves)
- Attendance validation (manager validates worked hours)
- Overtime approval (manager approves OT hours)
- Shift/work type requests (manager approves)
- Asset requests (admin approves)
- Reimbursement requests (manager/finance approves)
- Resignation requests (HR approves)
- Document approval (HR approves uploaded docs)

---

## AuditTimeline Pattern

### Layout
Vertical timeline with connecting line, event dots, descriptions, and timestamps:

```
│ ● [accent]  Contract activated
│              by Kareem S. · HR Admin
│                                    14:42
│
│ ○ [default] Department changed
│              Operations → Engineering
│              by Maya P. · Manager
│                                    09:15
│
│ ○ [default] Employee created
│              via CSV import
│                                    Jan 3
```

### Handoff CSS classes used
- `.timeline` — container with vertical line via `::before` pseudo-element
- `.tl-item` — grid row: 24px dot column, 1fr description, auto timestamp
- `.tl-dot` / `.tl-dot.accent` / `.tl-dot.success` — circular dot indicator with icon
- `.tl-time` — monospace timestamp
- `.tl-actor` — bold actor name
- `.desc` — event description text
- `.meta` — secondary info (muted color)

### Event rendering rules
- **Created** events: accent dot, "Employee created"
- **Updated** events: default dot, show field: "old value → new value"
- **Status changes**: colored dot matching new status, "Status changed to Approved"
- **Destructive** events: danger dot, "Employee archived"
- **System** events: muted dot, "Automated reminder sent"

### Timestamp formatting
- < 1 hour: "5 min ago"
- < 24 hours: "3 hours ago"
- < 7 days: "Tuesday at 14:42"
- Older: "Jan 3, 2026 · 14:42"
- Always show full timestamp on hover/tooltip

### Where it appears
- Employee profile → Activity tab
- Payslip detail → History section
- Leave request detail → Timeline
- Contract detail → Change history
- Compliance page → Audit event stream
- Any entity detail page with audit logging enabled

---

## Blocked / Error Explanation Panels

### "Why Is This Blocked?" Pattern

When an action cannot be performed, show a clear explanation with resolution steps.

**Layout**:
```
┌─ ⚠ Cannot run payroll for this employee ──────┐
│                                                │
│  • No active contract found                    │
│    → Create a contract for this employee       │
│                                                │
│  • Attendance not validated for 3 days         │
│    → Go to Attendance → Validate               │
│                                                │
│  • Missing bank details                        │
│    → Update bank information                   │
│                                                │
└────────────────────────────────────────────────┘
```

### Rules
- Show at point of failure (inline in the form, not a toast)
- List ALL blocking reasons, not just the first one
- Each reason has:
  - A plain-language description of the problem
  - A resolution action (link or button) to fix it
- Yellow/warning background (`--warning-soft`) for recoverable blocks
- Red/danger background (`--danger-soft`) for hard blocks (permissions, deleted records)

### Where it appears
- Payroll run wizard: "Blocked employees" step listing who can't be paid and why
- Leave request form: "Insufficient balance" with balance breakdown
- Attendance check-in: "Outside geofence" with distance info
- Contract creation: "Active contract exists" with link to existing contract
- Archive employee: "Employee is a reporting manager for 3 others" with list

---

## Destructive Action Confirmation Rules

### When to show ConfirmDialog

| Action | Confirm? | Dialog variant |
|--------|----------|----------------|
| Archive employee | Yes | destructive |
| Delete record | Yes | destructive |
| Terminate contract | Yes | destructive |
| Reject request | Yes (with reason field) | default |
| Cancel own request | Yes | default |
| Confirm payslip | Yes | default |
| Mark payslip as paid | Yes | default |
| Bulk approve | Yes (with count) | default |
| Bulk reject | Yes (with count + reason) | destructive |
| Bulk archive | Yes (with count) | destructive |
| Save/update | No | — |
| Approve (single) | No (toast feedback is enough) | — |
| Filter/sort | No | — |

### Wording standards

**Destructive**:
- Title: "Archive {count} employee(s)?" or "Terminate contract for Maya Persaud?"
- Description: Explain the consequence — "Archived employees will no longer appear in active lists. You can restore them later."
- Confirm button: Action-specific label in red — "Archive", "Terminate", "Delete" (never "OK" or "Yes")
- Cancel button: "Cancel" (never "No")

**Non-destructive confirmation**:
- Title: "Confirm payslip for September 2026?"
- Description: "This will lock the payslip for editing. 24 employees will be affected."
- Confirm button: Action-specific label — "Confirm Payslip"
- Cancel button: "Cancel"

### With reason field
For rejections, the confirmation dialog includes a text field:
- Label: "Reason for rejection (optional)" or "(required)" based on module config
- Placeholder: "Explain why this request is being rejected…"
- The reason is stored in the entity's `rejectReason` field

---

## Error States in Workflow Context

### Request submission errors
- Form validation: inline field errors (see form-wizard-standard.md)
- Server error: banner at top of form — "Something went wrong. Please try again."
- Conflict: "This request overlaps with an existing approved request" (leave overlap)

### Approval errors
- Stale data: "This request was already approved by another manager. Refreshing…" → auto-refresh
- Permission: "You don't have permission to approve this request" → should never appear if UI hides the button correctly
- Dependency: "Cannot approve — employee's leave balance is insufficient" → show balance breakdown

### State transition errors
- "Cannot move to 'Paid' — 2 payslips are still in 'Draft' status" → list the blocking payslips
- "Contract cannot be activated — another active contract exists" → link to the existing one
