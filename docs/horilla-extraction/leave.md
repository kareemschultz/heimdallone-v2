# Leave — Horilla Extraction

## Overview

The Leave module manages employee time-off: leave types with accrual/reset/carry-forward rules, leave balances (AvailableLeave), leave requests with approval workflows, leave allocation requests, holidays, company leave days, leave restrictions, and compensatory leave. It is tightly coupled with Attendance (compensatory leave from worked holidays) and Payroll (leave deductions).

## Horilla Files Inspected

- `leave/models.py` (1574 lines) — LeaveType, Holiday, CompanyLeave, AvailableLeave, LeaveRequest, LeaveAllocationRequest, RestrictLeave, CompensatoryLeaveRequest, LeaveRequestConditionApproval
- `leave/methods.py` — calculate_requested_days, holiday_dates_list, company_leave_dates_list
- `leave/views.py`, `leave/forms.py`, `leave/filters.py`

## Important Models

**LeaveType** — Configuration for each leave category. Fields: name, icon, color, payment (paid/unpaid), count (accrual amount, default 1), period_in (day/month/year), limit_leave (bool), total_days, reset (bool), is_encashable, reset_based (yearly/monthly/weekly), reset_month, reset_day, reset_weekend, carryforward_type (none/carryforward/carryforward_expire), carryforward_max, carryforward_expire_in, carryforward_expire_period, require_approval (yes/no), require_attachment (yes/no), exclude_company_leave (yes/no), exclude_holiday (yes/no), is_compensatory_leave (singleton), company FK.

**AvailableLeave** — Balance per employee per leave type (unique_together). Fields: employee FK, leave_type FK, available_days, carryforward_days, total_leave_days (computed: available + carryforward), assigned_date, reset_date, expired_date. Handles reset scheduling, carry-forward expiry, and leave forecasting.

**LeaveRequest** — The core request entity. Fields: employee FK, leave_type FK, start_date, end_date, start_date_breakdown (full_day/first_half/second_half), end_date_breakdown, requested_days (auto-calculated), leave_clashes_count, description, attachment, status (requested/approved/cancelled/rejected), requested_date, approved_available_days, approved_carryforward_days, reject_reason, created_by FK. 

Key behaviors:
- Auto-calculates requested_days from dates + breakdown
- Excludes holidays/company leave days from count if configured
- Validates sufficient balance (available + carryforward + forecasted)
- Detects overlapping requests
- Counts leave clashes (same dept/position employees on leave same dates)
- Multi-level approval via LeaveRequestConditionApproval
- Cannot delete once approved
- Half-day leave support via breakdown fields

**LeaveAllocationRequest** — Employee requests additional leave days. Fields: leave_type FK, employee FK, requested_days, description, attachment, status (requested/approved/rejected), reject_reason.

**CompensatoryLeaveRequest** — Request leave credit for working on holidays. Links to Attendance records for proof. Fields: leave_type FK (must be compensatory type), employee FK, attendance M2M, requested_days, status.

**RestrictLeave** — Block leave requests for specific date ranges. Fields: title, start_date, end_date, department FK, job_position M2M, include_all (bool), specific_leave_types M2M, excluded_leave_types M2M.

**LeaveRequestConditionApproval** — Multi-level approval chain tracking. Fields: sequence, is_approved, is_rejected, leave_request FK, manager FK. Created automatically based on MultipleApprovalCondition rules.

## State Machine / Lifecycle

**LeaveRequest**: Requested → Approved | Rejected | Cancelled
- Only "requested" status can be deleted
- Approval deducts from AvailableLeave (first from available_days, overflow from carryforward_days)
- Cancellation after approval: must restore balance
- Multi-level: each manager in chain must approve in sequence

**LeaveAllocationRequest**: Requested → Approved | Rejected
- Approval adds to AvailableLeave.available_days

**CompensatoryLeaveRequest**: Requested → Approved | Rejected
- Approval adds to AvailableLeave for compensatory leave type

## Permissions and RBAC

- Self-service: employees create own leave requests
- Superusers can bypass date restrictions (past date leave)
- Manager approval based on reporting relationship or configured approval chain
- HR can approve/reject all leave requests
- EmployeePastLeaveRestrict: global toggle to prevent past-date requests

## Horilla UI → Backend Workflow Notes

### Leave Request Flow
1. Employee opens leave request form
2. Selects leave type → system shows available balance
3. Picks date range + breakdown (full day / first half / second half)
4. System auto-calculates requested days (excluding holidays/company leaves per type config)
5. Validates: sufficient balance, no overlapping requests, not in restricted period
6. Submits → status = "requested"
7. If multi-level approval configured: routes through approval chain
8. Manager/HR approves → deducts from balance → status = "approved"

### Leave Balance Management
1. HR assigns leave types to employees (creates AvailableLeave records)
2. System handles reset: monthly/weekly/yearly based on leave type config
3. Carry-forward calculated at reset: min(remaining_days, carryforward_max)
4. Expired carry-forward: after configured period, carryforward_days set to 0

### Team Calendar
- Shows all team members' approved leaves on a calendar
- Leave clashes highlighted (same dept/position overlap)

## Heimdallone-native Interpretation

### Drizzle Entity Candidates

- `leave_type` — organizationId FK, name, color, icon, isPaid, accrualAmount, accrualPeriod (day/month/year), limitDays (nullable), resetEnabled, resetBasis (yearly/monthly/weekly), resetMonth, resetDay, carryForwardType (none/carry/carry_expire), carryForwardMax, carryForwardExpiryDays, requireApproval, requireAttachment, excludeHolidays, excludeCompanyLeaves, isCompensatory
- `leave_balance` — employeeId FK, leaveTypeId FK, availableDays, carryForwardDays, assignedDate, resetDate, expiryDate (unique: employee + leaveType)
- `leave_request` — employeeId FK, leaveTypeId FK, startDate, endDate, startBreakdown (full/first_half/second_half), endBreakdown, requestedDays, description, attachmentUrl, status (requested/approved/rejected/cancelled), rejectReason, createdBy FK, approvedBy FK
- `leave_request_approval` — leaveRequestId FK, managerId FK, sequence, isApproved, isRejected, approvedAt
- `leave_allocation_request` — employeeId FK, leaveTypeId FK, requestedDays, description, status, rejectReason
- `leave_restriction` — organizationId FK, title, startDate, endDate, departmentId FK, leaveTypeIds (JSON array), description
- `public_holiday` — organizationId FK, name, startDate, endDate, isRecurring

### Proposed oRPC Routers

- `leave.types` — CRUD leave type configuration
- `leave.balances` — Query employee balances, assign leave types to employees
- `leave.requests` — Create, list, approve, reject, cancel
- `leave.allocations` — Allocation request CRUD + approve/reject
- `leave.holidays` — Public holiday CRUD
- `leave.restrictions` — Leave restriction period CRUD
- `leave.calendar` — Team calendar query (approved leaves by date range + department)
- `leave.dashboard` — Summary cards (pending requests, upcoming leaves, balance overview)

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/leave` — My leave requests + balance cards (employee view)
- `/app/leave/calendar` — Team leave calendar
- `/app/leave/approvals` — Pending approval queue (manager/HR)
- `/app/leave/settings` — Leave types, restrictions, holidays
- `/app/leave/balances` — All employee balances (HR view)

### View Modes
- **My Leaves**: Balance cards at top, request list below
- **Team calendar**: Monthly calendar with employee rows, color-coded leave types
- **Approval queue**: Table of pending requests with approve/reject actions
- **Balance overview**: Table of all employees with leave type columns showing remaining days

### Data Table (Leave Requests)
- Columns: Employee, Leave Type (color badge), Start Date, End Date, Days, Status (badge), Clashes, Actions
- Sortable: Date, Employee, Days, Status
- Filters: Leave type, Status, Date range, Department, Employee
- Row actions: Approve, Reject, View details, Cancel (if own)
- Bulk actions: Bulk approve, Bulk reject, Export

### Status Badges
- Requested: amber `Pending`
- Approved: green `Approved`
- Rejected: red `Rejected`
- Cancelled: gray `Cancelled`

### Forms
- **Leave request**: Start/end date pickers with breakdown selectors, leave type dropdown showing balance, description, attachment upload, preview of calculated days
- **Leave type config**: Multi-section form (Basic → Accrual → Reset → Carry Forward → Rules)
- Use TanStack Form for leave type configuration (complex conditional fields)

## Staff-Friendly UX Notes

### Plain-Language Labels
- Avoid: "AvailableLeave", "carryforward_expire_period", "start_date_breakdown"
- Use: "Leave Balance", "Carry Forward Expires After", "Morning Half / Afternoon Half"

### First-Time User Experience
- Setup checklist: Create leave types → Set holidays → Assign leave to employees
- Employee sees balance cards even when empty: "0 days of Annual Leave — Talk to HR about your leave allocation"

### Common Confusion Points
- Confusion: Why leave request shows fewer days than selected date range
- Prevention: Show calculation breakdown — "5 days selected, minus 1 public holiday, minus 1 weekend = 3 leave days"
- Confusion: What "carry forward" means
- Prevention: Tooltip — "Unused leave days that roll over to the next period"
- Confusion: Half-day leave mechanics
- Prevention: Visual date picker showing AM/PM selector per day

### Role-Specific Views
- Employee: Own balances + requests + request form
- Manager: Team calendar + approval queue + team balances
- HR admin: All leave management + settings + bulk allocation
- Payroll admin: Leave summary for payroll period (leave deductions)

## Dependencies

- **Employee** (P0) — Leave records belong to employees
- **HR Core** (P0) — Departments for restriction rules, job positions for approval conditions
- **Attendance** (P1) — Compensatory leave references attendance records; leave affects work records
- **Payroll** (P1) — Leave deductions from salary; leave encashment

## Edge Cases and Risks

1. **Half-day leave on same day** — First half from one type, second half from another. Overlap check must handle breakdown.
2. **Negative balance** — If carry-forward expires mid-request, employee may go negative. Must validate at approval time.
3. **Leave during probation** — Some leave types should be restricted for probationary employees.
4. **Overlapping requests** — System must handle edge case where half-day requests overlap but aren't actually conflicting.
5. **Reset timing** — Monthly reset on the 31st when month has 30 days → defaults to last day.
6. **Leave clashes** — Multiple employees on leave same day. Show count but don't block unless configured.

## Heimdallone Enhancements Over Horilla/OpenHRMS

1. **Visual balance cards** with circular progress indicators per leave type
2. **Interactive team calendar** — click to see who's off, drag to select dates for new request
3. **Leave calculation preview** before submission — "This will use 3 of your 12 remaining annual leave days"
4. **Smart conflict detection** — "2 of your team members are already on leave during this period" with names
5. **One-click half-day** — AM/PM toggle per date instead of confusing breakdown dropdowns
6. **Approval chain visualization** — Show where request is in multi-level approval (step 1 of 3)
7. **Holiday calendar** — Visual public holiday calendar shared across the organization
8. **Balance forecast** — "By end of year you'll have X days remaining" based on accrual schedule
9. **Auto-assignment** — Assign leave types to all new employees based on employee type/department rules
10. **Mobile leave request** — Quick request from phone via Expo app (future)

## Priority

**P1** — Core daily operation. Most employees interact with leave management weekly.
