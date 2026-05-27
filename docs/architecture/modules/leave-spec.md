# Leave Module Specification

## Purpose

Manages employee time-off: leave type configuration with accrual/reset/carry-forward rules, leave balances, leave requests with approval workflows, leave allocation requests, holidays and company leave days interaction, leave restrictions, compensatory leave, and team calendar views.

## Source References

- `docs/horilla-extraction/leave.md` — Full Horilla extraction
- `docs/horilla-extraction/openhrms-comparison.md` — Holiday approval, vacation management

## Dependencies

- **HR Core** (P0) — employee_profile, department, holiday
- **Attendance** (P1) — compensatory leave references attendance records; leave affects work records

## First Version Scope

- Leave type configuration (paid/unpaid, accrual, reset, carry-forward, attachment requirement)
- Leave balance per employee per type (available days + carry-forward days)
- Leave request lifecycle (requested → approved/rejected/cancelled)
- Half-day leave (first half / second half / full day breakdown)
- Holiday and company leave day exclusion from requested day count
- Multi-level approval (configurable per department/condition)
- Leave allocation requests (employee requests additional days)
- Leave restrictions (block periods by department/dates)
- Team calendar view (who's on leave when)
- Employee self-service (request, view balance, cancel)

## Deferred Scope

- Compensatory leave (needs attendance module)
- Leave encashment (needs payroll module)
- Leave import/export
- Leave analytics/trends
- Leave accrual based on service length
- Pro-rata for mid-year joiners (auto-calculation)
- Leave calendar integration (Google/Outlook)

## Proposed Entities

### `leave_type`
- **Purpose**: Configuration for each leave category
- **Key fields**: id, organizationId, name, color (hex), icon (nullable), isPaid (bool), accrualAmount (numeric), accrualPeriod (day/month/year), limitDays (numeric, nullable — null=unlimited), resetEnabled (bool), resetBasis (yearly/monthly/weekly), resetMonth (int, nullable), resetDay (int, nullable), carryForwardType (none/carry/carry_expire — pgEnum), carryForwardMax (numeric, nullable), carryForwardExpiryDays (int, nullable), requireApproval (bool, default true), requireAttachment (bool, default false), excludeHolidays (bool, default false), excludeCompanyLeaves (bool, default false), isCompensatory (bool, default false — singleton), isActive (bool), createdAt, updatedAt
- **Tenant scope**: organizationId
- **Audit**: Changes tracked
- **Archive**: isActive flag

### `leave_balance`
- **Purpose**: Current balance per employee per leave type
- **Key fields**: id, employeeId (FK), leaveTypeId (FK), availableDays (numeric 6,2), carryForwardDays (numeric 6,2), assignedDate (date), resetDate (date, nullable), expiryDate (date, nullable), createdAt, updatedAt
- **Unique**: (employeeId, leaveTypeId)
- **Audit**: Changes tracked (especially balance deductions)

### `leave_request`
- **Purpose**: Employee's request for time off
- **Key fields**: id, organizationId, employeeId (FK), leaveTypeId (FK), startDate (date), endDate (date), startBreakdown (full_day/first_half/second_half — pgEnum), endBreakdown (same), requestedDays (numeric 6,2 — auto-calculated), description (text), attachmentUrl (nullable), status (requested/approved/rejected/cancelled — pgEnum), rejectReason (text, nullable), approvedBy (FK user, nullable), createdBy (FK user, nullable), createdAt, updatedAt
- **Tenant scope**: organizationId
- **Audit**: Status transitions
- **Delete**: Only when status = "requested". Otherwise immutable.

### `leave_request_approval`
- **Purpose**: Multi-level approval chain tracking
- **Key fields**: id, leaveRequestId (FK), managerId (FK employee_profile), sequence (int), isApproved (bool), isRejected (bool), approvedAt (timestamp, nullable)
- **Auto-created based on department approval conditions**

### `leave_allocation_request`
- **Purpose**: Employee requests additional leave days beyond allocation
- **Key fields**: id, organizationId, employeeId (FK), leaveTypeId (FK), requestedDays (numeric), description (text), attachmentUrl (nullable), status (requested/approved/rejected), rejectReason, createdAt, updatedAt
- **Approval adds to leave_balance.availableDays**

### `leave_restriction`
- **Purpose**: Block leave requests for specific date ranges
- **Key fields**: id, organizationId, title, startDate, endDate, departmentId (FK, nullable), leaveTypeIds (jsonb — which types restricted, null=all), description, createdAt, updatedAt

### `company_leave_day`
- **Purpose**: Recurring weekly off days (e.g., every Sunday, alternating Saturdays)
- **Key fields**: id, organizationId, weekOfMonth (int 0-4, nullable — null=every), dayOfWeek (int 0-6), createdAt
- **Unique**: (organizationId, weekOfMonth, dayOfWeek)

## Proposed oRPC Routers

### `leave`

| Procedure | Permission | Key behavior |
|-----------|-----------|--------------|
| types.list | employee:read | All leave types for org |
| types.create | holiday:create (or new leave_type resource) | Create leave type config |
| types.update | same | Update config |
| balances.list | employee:read | HR: all. Manager: team. Employee: self. |
| balances.assign | employee:create | Assign leave type to employee(s) |
| requests.create | leave_request:create | Employee self-service. Validates balance, overlaps, restrictions. |
| requests.list | leave_request:read | Filtered by role scope |
| requests.approve | leave_request:approve | Deducts balance, status → approved |
| requests.reject | leave_request:reject | Requires reason |
| requests.cancel | leave_request:cancel | Only by requestor, only if status=requested |
| allocations.create | leave_request:create | Employee requests extra days |
| allocations.approve | leave_request:approve | Adds to balance |
| calendar | leave_request:read | Team calendar data (approved leaves by date range) |
| restrictions.list/create/update/delete | holiday:create | Manage blocked periods |
| companyLeaveDays.list/create/delete | holiday:create | Manage recurring offs |

## Proposed UI Routes

### `/app/leave`
- **Purpose**: Employee's leave dashboard
- **Primary view**: Balance cards (per leave type with remaining/total) + request list below
- **Secondary view**: Team calendar (manager), Approval queue (manager/HR)
- **Filters**: Leave type, Status, Date range
- **Saved views**: My Requests, Pending Approval (manager), Team Calendar
- **Row actions**: View details, Cancel (own, if pending)
- **Empty state**: "No leave requests yet. Request time off when you need it."

### `/app/leave/calendar`
- **Purpose**: Team leave calendar
- **View**: Monthly calendar grid with employee rows, color-coded leave types

### `/app/leave/approvals`
- **Purpose**: Pending approval queue
- **View**: ApprovalQueue pattern — cards with approve/reject

### `/app/leave/settings`
- **Purpose**: Leave type config, restrictions, holidays, company leave days
- **View**: Sectioned settings page (like org settings)

## RBAC

Uses existing `leave_request:create/read/approve/reject/cancel` and `holiday:create/read/update/archive`.

## Staff-Friendly UX

- **Balance cards** with visual progress (12/18 days used — circular indicator)
- **Half-day selection**: AM/PM toggle per day, not confusing dropdown labels
- **Day count preview**: "You're requesting 3 days (Oct 1–5, minus 1 holiday, minus 1 weekend)"
- **Team conflict warning**: "2 team members already on leave during these dates" (warning, not blocker)
- **Approval chain display**: "Step 1 of 2: Waiting for Maya Persaud" with visual progress
- **Why rejected?**: Show rejection reason inline with the request
- **Carry-forward explanation**: Tooltip — "Unused days that roll over. Max 5 days, expires after 3 months."

## Risks and Edge Cases

1. Half-day overlap — first half of type A, second half of type B on same day
2. Negative balance — carry-forward expires during pending request
3. Leave during probation — some types restricted
4. Reset timing — monthly reset on 31st when month has 30 days
5. Concurrent approvals — two managers approve at same time, double-deducting balance
6. Leave clashes — multiple team members on leave same day (show warning, don't block)

## Implementation Readiness

**Needs HR Core**. Attendance needed only for compensatory leave (deferred). Payroll needed only for leave encashment (deferred).
