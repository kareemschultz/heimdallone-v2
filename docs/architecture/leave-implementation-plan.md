# Leave Implementation Plan

Phase 7E–7G spec. Reviewed and finalized Phase 7A (2026-05-27). **Implementation complete** — schema (7E), API (7F), UI (7G), QA/security pass (7H) all done.

---

## Design Decisions

### 1. Leave implementation follows Attendance

Leave can be designed in parallel with Attendance, but implementation is sequenced: Attendance first (7B–7D), then Leave (7E–7G). Reason: Leave affects attendance work records (approved leave creates "leave" day entries), and that integration is easier to build on a stable attendance foundation.

### 2. Leave creates payroll-ready absence records, not separate work records

When leave is approved, it does NOT create a row in `attendance_record`. Instead, the payroll engine reads approved leave requests directly and computes deductions. This avoids double-counting (an employee on leave should NOT have an attendance record for that day).

**Payroll reads:**
- `attendance_record WHERE payrollStatus = 'approved'` → worked days/hours
- `leave_request WHERE status = 'approved' AND dateRange overlaps period` → leave days
- Holidays from `holiday` table → non-working paid days

### 3. Status enums are minimal

| Enum | Values | Notes |
|------|--------|-------|
| `leaveRequestStatusEnum` | requested, approved, rejected, cancelled | Core lifecycle |
| `leaveBreakdownEnum` | full_day, first_half, second_half | Half-day support |
| `leaveCarryForwardTypeEnum` | none, carry, carry_expire | Carry-forward policy |
| `leaveAccrualPeriodEnum` | day, month, year | How often leave accrues |
| `leaveResetBasisEnum` | yearly, monthly, weekly | When balances reset |

No `leaveAllocationStatusEnum` — allocation requests reuse `leaveRequestStatusEnum`.

### 4. Company leave days are a simple entity, not a shift attribute

Recurring weekly offs (e.g., every Sunday, alternating Saturdays) are modeled as `company_leave_day` rows. They are NOT part of the shift schedule — shifts define work hours, company leave days define non-working days organization-wide.

---

## Schema Plan

### Enums (pgEnum)

```typescript
leaveRequestStatusEnum: requested | approved | rejected | cancelled
leaveBreakdownEnum: full_day | first_half | second_half
leaveCarryForwardTypeEnum: none | carry | carry_expire
leaveAccrualPeriodEnum: day | month | year
leaveResetBasisEnum: yearly | monthly | weekly
```

### `leave_type`

Configuration for each leave category.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | e.g., "Annual Leave", "Sick Leave" |
| color | text | NOT NULL, default "#3b82f6" | Hex color for calendar/badges |
| isPaid | boolean | NOT NULL, default true | |
| accrualAmount | numeric(6,2) | NOT NULL, default 1.0 | Days earned per accrual period |
| accrualPeriod | leaveAccrualPeriodEnum | NOT NULL, default "month" | |
| limitDays | numeric(6,2) | nullable | Max days per period (null = unlimited) |
| resetEnabled | boolean | NOT NULL, default true | |
| resetBasis | leaveResetBasisEnum | NOT NULL, default "yearly" | |
| resetMonth | integer | nullable | 1-12 for yearly reset |
| resetDay | integer | nullable | 1-31 for monthly/yearly reset |
| carryForwardType | leaveCarryForwardTypeEnum | NOT NULL, default "none" | |
| carryForwardMax | numeric(6,2) | nullable | Max days to carry |
| carryForwardExpiryDays | integer | nullable | Days until carry-forward expires |
| requireApproval | boolean | NOT NULL, default true | |
| requireAttachment | boolean | NOT NULL, default false | |
| excludeHolidays | boolean | NOT NULL, default true | Exclude public holidays from day count |
| excludeCompanyLeaves | boolean | NOT NULL, default true | Exclude company leave days from count |
| isCompensatory | boolean | NOT NULL, default false | Singleton compensatory leave type |
| isActive | boolean | NOT NULL, default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, name)
**Indexes**: (organizationId)

### `leave_balance`

Current balance per employee per leave type.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| leaveTypeId | text | FK → leave_type.id, NOT NULL | |
| availableDays | numeric(6,2) | NOT NULL, default 0 | |
| carryForwardDays | numeric(6,2) | NOT NULL, default 0 | |
| assignedDate | date | NOT NULL | When this balance was assigned |
| resetDate | date | nullable | Next scheduled reset |
| expiryDate | date | nullable | When carry-forward expires |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (employeeId, leaveTypeId)
**Indexes**: (employeeId)

### `leave_request`

Employee time-off request.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| leaveTypeId | text | FK → leave_type.id, NOT NULL | |
| startDate | date | NOT NULL | |
| endDate | date | NOT NULL | |
| startBreakdown | leaveBreakdownEnum | NOT NULL, default "full_day" | |
| endBreakdown | leaveBreakdownEnum | NOT NULL, default "full_day" | |
| requestedDays | numeric(6,2) | NOT NULL | Auto-calculated from dates + exclusions |
| description | text | nullable | |
| attachmentUrl | text | nullable | |
| status | leaveRequestStatusEnum | NOT NULL, default "requested" | |
| rejectReason | text | nullable | |
| approvedBy | text | FK → user.id, nullable | |
| approvedAt | timestamp | nullable | |
| createdBy | text | FK → user.id, nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId), (employeeId, status), (startDate, endDate)

### `leave_allocation_request`

Employee requests additional leave days.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| leaveTypeId | text | FK → leave_type.id, NOT NULL | |
| requestedDays | numeric(6,2) | NOT NULL | |
| description | text | nullable | |
| status | leaveRequestStatusEnum | NOT NULL, default "requested" | Reuse same enum |
| rejectReason | text | nullable | |
| reviewedBy | text | FK → user.id, nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

### `leave_restriction`

Block leave requests for specific date ranges.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| title | text | NOT NULL | e.g., "Year-End Close" |
| startDate | date | NOT NULL | |
| endDate | date | NOT NULL | |
| departmentId | text | FK → department.id, nullable | Null = all departments |
| description | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

### `company_leave_day`

Recurring weekly off days (e.g., every Sunday).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| weekOfMonth | integer | nullable | 0-4, null = every week |
| dayOfWeek | integer | NOT NULL | 0=Sunday, 6=Saturday |
| createdAt | timestamp | defaultNow | |

**Unique**: (organizationId, weekOfMonth, dayOfWeek)

---

## Status Lifecycle

### Leave Request Lifecycle

```
Employee submits request
    │
    ▼
status: requested
    │
    ├── Manager/HR approves → status: approved
    │     └── Balance deducted (availableDays first, overflow from carryForwardDays)
    │
    ├── Manager/HR rejects → status: rejected (rejectReason required)
    │
    └── Employee cancels → status: cancelled (only while status = requested)
         └── If was approved, balance restored
```

**Constraints:**
- Cannot delete approved/rejected requests — only cancel
- Cancellation after approval restores balance
- Overlapping requests for same employee: warn, don't block (unless same dates exactly)
- Requests during restriction periods: blocked with explanation

### Day Calculation

```
requestedDays = count(workingDays in [startDate..endDate])
              - holidays (if excludeHolidays)
              - company leave days (if excludeCompanyLeaves)
              + half-day adjustments (first_half/second_half = 0.5 instead of 1.0)
```

---

## Accrual, Carry-Forward, and Reset Strategy

### Accrual

- `accrualAmount` days earned per `accrualPeriod`
- Example: 1.5 days per month = 18 annual leave days
- Accrual happens automatically (scheduled check or on-demand calculation)
- For Phase 7: on-demand calculation when balance is queried or when leave is requested

### Carry-Forward

| Type | Behavior |
|------|----------|
| `none` | Remaining days are lost at reset |
| `carry` | Min(remaining, carryForwardMax) carries to next period, never expires |
| `carry_expire` | Min(remaining, carryForwardMax) carries, expires after carryForwardExpiryDays |

### Reset

- On reset date: current `availableDays` is evaluated for carry-forward, then reset to 0
- Carry-forward amount added to `carryForwardDays`
- Previous carry-forward checked for expiry
- Reset is triggered by: scheduled job (future) or on-demand check when balance is queried

---

## API Plan

### `leave` router

| Procedure | Input | Permission | Scope | Notes |
|-----------|-------|-----------|-------|-------|
| types.list | includeInactive? | employee:read | Org | All leave types |
| types.create | name, color, isPaid, accrual*, reset*, carryForward*, ... | leave_type:create | HR/admin | |
| types.update | id, partial fields | leave_type:update | HR/admin | |
| types.archive | id | leave_type:update | HR/admin | Sets isActive = false |
| balances.list | employeeId?, leaveTypeId? | employee:read | Role-scoped | HR: all. Manager: team. Employee: self. |
| balances.assign | employeeId, leaveTypeId, availableDays | employee:create | HR/admin | Initial allocation |
| balances.bulkAssign | leaveTypeId, employeeIds[] | employee:create | HR/admin | Bulk allocation |
| requests.create | leaveTypeId, startDate, endDate, startBreakdown?, endBreakdown?, description?, attachment? | leave_request:create | Self | Validates balance, restrictions, overlaps |
| requests.list | status?, employeeId?, leaveTypeId?, dateRange?, page/size | leave_request:read | Role-scoped | |
| requests.getById | id | leave_request:read | Access check | |
| requests.approve | id | leave_request:approve | Manager/HR | Deducts balance |
| requests.reject | id, rejectReason | leave_request:reject | Manager/HR | |
| requests.cancel | id | leave_request:cancel | Self (own only) | Restores balance if was approved |
| allocations.create | leaveTypeId, requestedDays, description? | leave_request:create | Self | Employee requests extra days |
| allocations.list | status?, page/size | leave_request:read | Role-scoped | |
| allocations.approve | id | leave_request:approve | HR/admin | Adds to balance |
| allocations.reject | id, rejectReason | leave_request:reject | HR/admin | |
| calendar | dateRange, departmentId? | leave_request:read | Role-scoped | Team calendar data |
| restrictions.list | — | employee:read | Org | |
| restrictions.create | title, startDate, endDate, departmentId?, description? | holiday:create | HR/admin | |
| restrictions.update | id, partial fields | holiday:update | HR/admin | |
| restrictions.delete | id | holiday:update | HR/admin | |
| companyLeaveDays.list | — | employee:read | Org | |
| companyLeaveDays.create | weekOfMonth?, dayOfWeek | holiday:create | HR/admin | |
| companyLeaveDays.delete | id | holiday:update | HR/admin | |

### RBAC

| Role | Request Leave | View Balance | Approve/Reject | Manage Types | Manage Restrictions |
|------|-------------|-------------|----------------|-------------|-------------------|
| tenant_owner | Own | All | Yes | Yes | Yes |
| tenant_admin | Own | All | Yes | Yes | Yes |
| hr_admin | Own | All | Yes | Yes | Yes |
| payroll_admin | No | All (read-only) | No | No | No |
| auditor | No | All (read-only) | No | No | No |
| manager | Own | Self + reports | Self + reports | No | No |
| employee | Own | Self only | No | No | No |

---

## UI Plan

### Route: `/app/leave`

**Primary view**: Employee leave dashboard

**Top section**: Balance cards (per leave type)
- Card per leave type showing: type name, color badge, available days, used days, circular progress
- Carry-forward shown separately: "2 carry-forward days (expire March 31)"
- Pending requests count

**Bottom section**: Leave request list (DataTable)

| Column | Notes |
|--------|-------|
| Leave Type | Color badge + name |
| Start Date | |
| End Date | |
| Days | Requested days count |
| Status | StatusBadge: Pending/Approved/Rejected/Cancelled |
| Actions | View details, Cancel (if own + pending) |

**Filters**: Leave type, Status, Date range
**Saved views**: My Requests, Pending Approval (manager), All (HR)
**Empty state**: "No leave requests yet. Take time off when you need it."
**Action button**: [Request Leave] → opens leave request form

### Leave Request Form (Sheet/Dialog)

1. **Leave type** — dropdown showing available balance per type
2. **Start date** — date picker
3. **End date** — date picker
4. **Breakdown** — AM/PM toggle for start and end dates (full_day/first_half/second_half)
5. **Preview** — "You're requesting 3 days (May 10–14, minus 1 holiday, minus 1 weekend)"
6. **Description** — optional text
7. **Attachment** — file upload (if required by leave type)
8. **Submit**

**Validation on submit:**
- Sufficient balance (available + carry-forward >= requested)
- No restriction period overlap
- No exact-duplicate dates
- Attachment required check

**Helper text:**
- "This will use 3 of your 12 remaining annual leave days"
- "2 team members are already on leave during these dates" (warning, not blocker)

### Route: `/app/leave/approvals` (manager/HR)

**View**: Approval queue
- Cards with: employee name, leave type (color badge), dates, days, description
- Approve / Reject buttons
- Reject requires reason
- Team conflict indicator: "2 others on leave during these dates"
- Balance check: "Approving will leave Maya with 3 remaining days"
**Bulk actions**: Bulk approve with review step

### Route: `/app/leave/calendar`

**View**: Monthly calendar grid
- Employee rows, date columns
- Color-coded cells by leave type
- Filter by department
- "Click a day to see who's off"
**Role-specific**: Manager sees team, HR sees all

### Route: `/app/leave/settings` (HR/admin)

**Sections:**
1. **Leave Types** — DataTable with create/edit/archive
2. **Company Leave Days** — Weekly off configuration (checkboxes: Mon-Sun, with "alternating" option)
3. **Restrictions** — DataTable of blocked date ranges
4. **Balance Overview** — All employees × leave types with remaining days

### Staff-Friendly Helper Text

- Leave request: "Select your dates and we'll calculate the leave days automatically, excluding holidays and weekends"
- Half-day: "Take just the morning or afternoon off"
- Carry-forward: "Unused leave days that roll over to the next period. Max 5 days, expires after 3 months."
- Restriction: "Leave requests are blocked during this period because: Year-End Close"
- Balance: "You'll earn 1.5 more days by end of month based on your accrual rate"
- Rejection: "Your leave was not approved because: Team coverage required during this period"

---

## Implementation Sequence

| Sub-phase | Scope | Depends On |
|-----------|-------|-----------|
| **7E** | Leave DB schema (6 tables, 5 enums) + migration + seed | HR Core schema |
| **7F** | Leave oRPC router (~24 procedures) | 7E |
| **7G** | Leave UI: /app/leave dashboard, request form, approvals, calendar, settings | 7F |

---

## First Version Scope

- Leave type configuration (paid/unpaid, accrual, reset, carry-forward)
- Leave balance per employee per type
- Leave request lifecycle (requested → approved/rejected/cancelled)
- Half-day leave support (first half / second half)
- Holiday exclusion from day count
- Company leave day exclusion
- Single-level approval (manager or HR approves)
- Leave allocation requests (employee requests extra days)
- Leave restrictions (blocked date ranges)
- Team calendar (monthly view)
- Employee self-service (request, view balance, cancel)
- Balance cards with visual progress

## Deferred Scope

| Feature | Deferred To | Reason |
|---------|------------|--------|
| Multi-level approval chains | Phase 8+ | Single-level covers 90% of cases |
| Compensatory leave | Phase 8+ | Needs attendance module stable first |
| Leave encashment | Phase 10+ | Needs payroll engine |
| Accrual based on service length | Phase 8+ | Requires tenure calculation |
| Pro-rata for mid-year joiners | Phase 8+ | Complex calculation |
| Leave calendar integration (Google/Outlook) | Phase 14 | Integration phase |
| Leave analytics/trends | Phase 15 | Analytics phase |
| Country-specific leave rules | Phase 8+ | Needs country profile system |

---

## Audit Events

| Action | Entity | Changes Tracked |
|--------|--------|----------------|
| create_type | leave_type | All fields |
| update_type | leave_type | Changed fields |
| archive_type | leave_type | isActive: true → false |
| assign_balance | leave_balance | employeeId, leaveTypeId, availableDays |
| request_leave | leave_request | Type, dates, days |
| approve_leave | leave_request + leave_balance | Status change + balance deduction |
| reject_leave | leave_request | Status + rejectReason |
| cancel_leave | leave_request + leave_balance | Status change + balance restoration |
| create_restriction | leave_restriction | All fields |

---

## Open Questions

| # | Question | Recommendation | Status |
|---|----------|---------------|--------|
| 1 | Should leave balance be computed or stored? | Stored — `leave_balance` is the source of truth. Updates happen on approval/cancellation/reset. On-demand recalculation as a validation check only. | Decided |
| 2 | Should rejected leave automatically create an absence? | No — absence detection is the attendance module's responsibility. If an employee is absent without leave, attendance flags it. | Decided |
| 3 | Should carry-forward reset be a scheduled job? | Phase 7: on-demand check when balance is queried. Phase 8+: scheduled job for reliability. | Decided |
| 4 | Should leave requests block on team conflicts? | No — warn only. "2 team members already on leave" is informational, not a blocker. Configurable in future phases. | Decided |
| 5 | Can half-day leave span multiple days? | Yes — start_date first_half + end_date second_half is valid. Middle days are full_day. | Decided |
| 6 | Should company_leave_day support custom dates (not just weekly)? | No — use the existing `holiday` table for specific dates. `company_leave_day` is for recurring weekly patterns only. | Decided |

---

## Odoo-Inspired Enhancements (Phase 7A.1 Research)

> Added 2026-05-27 from Phase 7A.1 Odoo HRMS research.

### Adopt for Phase 7E Schema

1. **Accrual milestones** — Add milestone-based accrual rules to leave_type. Instead of a flat `accrualAmount`, support tiered rates by tenure:
   - Year 1: 1 day/month
   - Year 2-5: 1.5 days/month
   - Year 5+: 2 days/month
   - Implementation: JSON array field `accrualMilestones` on leave_type, or a separate `leave_accrual_milestone` table if more complex. Odoo uses a full `hr.leave.accrual.level` model with progression rules. For Phase 7E, a JSON array on leave_type is sufficient.

2. **Negative balance cap** — Add `allowNegativeBalance` (boolean, default false) and `negativeBalanceCap` (numeric, nullable) to leave_type. Allows employees to go negative for emergency leave up to a configurable limit. Prevents balance violations while supporting genuine emergencies.

3. **Private leave reason** — Add `isReasonPrivate` (boolean, default false) to leave_request. When true, the `description` field is masked for non-HR roles (shows "Personal leave" instead of the actual text). Important for medical, family, or mental health leave. Odoo calls this `private_name`.

### Adopt for Phase 7F API

4. **Configurable approval per type** — Leave types should have an `approvalType` field: `none` (auto-approve), `manager`, `hr`, `both` (manager then HR). Phase 7F starts with `manager` as default; multi-level approval queues added later.

5. **Mandatory day enforcement** — Add ability to mark dates as "mandatory work days" that block leave requests (e.g., inventory day, audit day). Uses existing `leave_restriction` entity but adds an `isHardBlock` flag to distinguish "warn only" vs "block entirely".

### Defer

6. **Hourly leave requests** — Odoo supports hour-based leave. Half-day is sufficient for Phase 7; hourly adds complexity.
7. **Extra hours deduction** — Auto-deduct from overtime bank before touching leave balance. Needs overtime bank tracking, which is Phase 8+.
8. **Email-based approve/refuse** — Links in notification emails. Phase 14.
9. **Nightly accrual reconciliation cron** — Auto-cancels leaves where balance dropped below request. Phase 8+ scheduled job.
