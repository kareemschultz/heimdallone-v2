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
- Leave analytics/trends → planned in [analytics-reporting-plan.md](../analytics-reporting-plan.md)
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

---

## Payroll Readiness: Leave-to-Payroll Integration

> Added Phase 6E (2026-05-27). Defines how leave data affects payroll calculations.

### Paid vs Unpaid Leave Impact

| Leave Type | Payroll Impact |
|-----------|----------------|
| **Paid leave** | No salary deduction. Employee receives full pay for the period. Leave days counted as "worked" for payroll. |
| **Unpaid leave** | Salary deducted: `dailyRate × unpaidLeaveDays`. For hourly workers: hours not worked are not paid. |
| **Half-day leave (paid)** | Half the daily deduction applied if unpaid; no deduction if paid. |
| **Half-day leave (unpaid)** | `dailyRate × 0.5` deducted per half-day. |

### Leave → Payroll Data Flow

```
Approved Leave Request
    │
    ├── Paid leave → No payroll deduction, counted as worked day
    │
    └── Unpaid leave → Deduction calculated:
                        Monthly: dailyRate × unpaidDays
                        Daily: days not paid
                        Hourly: hours not worked (from shift schedule)
```

### Approved Leave Feeds Payroll

- Only **approved** leave requests are used in payroll calculations
- Leave approval date must be before payroll cutoff for the period
- Late-approved leave (after cutoff) creates a payroll warning, not auto-deduction
- Approved leave creates work records with type "leave" (paid or unpaid)

### Pending Leave Creates Payroll Warning

- If an employee has pending leave requests overlapping the pay period:
  - Show warning in payroll preview: "Maya has 2 pending leave requests (May 10–12). Approve or reject before finalizing payroll."
  - Payroll can proceed but with explicit acknowledgment
  - The pending leave is NOT deducted — only approved leave affects pay

### Rejected Leave and Attendance

- Rejected leave does NOT create a payroll deduction
- If the employee was absent during the rejected leave dates AND has no attendance records:
  - Creates an attendance exception: "Absent without approved leave on May 10–12"
  - HR/manager must resolve: mark as unpaid absence, add manual attendance, or re-request leave

### Holidays/Company Leave Interaction

- Public holidays and company leave days are excluded from leave request day counts (if configured per leave type)
- Holiday during leave period: day is not deducted from balance AND not counted as unpaid
- Company leave day (e.g., every Sunday): same exclusion applies
- Payroll treats holidays as worked days (paid) regardless of leave status

### Leave Cutoff Before Payroll

- Configurable: "Leave requests for this period must be finalized by {date}"
- After cutoff: pending requests shown as warnings in payroll
- Payroll admin decides: include as deduction or defer to next period

### Leave Balance/Accrual Dependency

- Payroll does not directly modify leave balances
- Leave approval deducts from balance (leave module responsibility)
- Payroll reads the deduction impact (paid/unpaid days) from approved requests
- Leave accrual happens independently of payroll (configured per leave type)

### Leave Encashment (Future Phase)

- Employee cashes out remaining leave balance for monetary value
- Creates a one-time allowance on the next payslip
- Amount: `remainingDays × dailyRate`
- Requires: payroll engine (Phase 8+)
- Deducted from leave balance upon payslip finalization

### Leave-to-Payroll Summary

Per-employee per-period summary for payroll:
- Total approved paid leave days
- Total approved unpaid leave days
- Total pending leave days (warning)
- Deduction amount (unpaid leave × daily rate)
- Holiday days in period
- Company leave days in period
- "Leave clean" status: ✅ All resolved / ⚠️ Pending requests / ❌ Rejected leave with no attendance

### "Why Payroll Is Blocked?" Panel (Leave)

| Issue | Message | Resolution |
|-------|---------|------------|
| Pending leave overlapping period | "2 leave requests pending for Maya (May 10–12)" | Approve or reject |
| Rejected leave + no attendance | "Maya was absent May 10–12 without approved leave" | Add attendance or re-request leave |
| Leave balance discrepancy | "Leave balance negative after approval — verify allocations" | HR reviews balance |
| Carry-forward expired mid-request | "Maya's carry-forward days expired before approval" | Re-calculate or allocate |

### Employee-Friendly Leave Balance View

- Balance cards per leave type with visual progress (e.g., "12 of 18 days used")
- "Available now: 6 days" prominent display
- Carry-forward balance shown separately: "2 carry-forward days (expire March 31)"
- Pending requests shown: "3 days pending approval"
- Accrual forecast: "You'll earn 1.5 more days by end of month"
- History: approved, rejected, cancelled requests with dates

### Manager/HR Approval Queue

- All pending leave requests sorted by date submitted
- Team conflict indicator: "2 team members already on leave May 10–12"
- Balance check: "Approving will leave Maya with 3 remaining days"
- Bulk approve/reject with review step
- Quick reject with reason template: "Team coverage required", "Insufficient notice", "Custom"

### Leave Policy Helper Text

- On leave type configuration: "Paid leave means the employee is paid as if they worked. Unpaid leave deducts from their salary."
- On accrual: "Accrual of 1.5 days per month means the employee earns 18 leave days per year."
- On carry-forward: "Carry-forward lets employees keep unused leave days into the next period. Set a max to prevent accumulation."
- On restrictions: "Restrict dates to prevent leave requests during busy periods (e.g., year-end close)."

### Country-Specific Leave Rules (Future)

- Minimum statutory leave days per country (e.g., Guyana Labour Act: 12 working days annual leave after 1 year)
- Maternity leave rules per country
- Sick leave rules per country
- Public holiday calendar per country
- Configurable per country payroll profile

### Audit Trail (Leave)

- Every leave request: created, approved, rejected, cancelled — with who/when
- Balance changes: allocated, deducted, carry-forward applied, expired — with who/when
- Leave type configuration changes: who changed what settings and when
- Linked to payroll: which payslip used this leave deduction

### Quality-of-Life Requirements (Leave)

- Saved views: "My Requests", "Pending Approval", "Team Calendar", "All Balances"
- Smart filters: leave type, status, date range, department
- Contextual empty states: "No leave requests yet. Take time off when you need it."
- Role-specific dashboards: employee sees balances + requests; manager sees team calendar + approval queue
- Bulk actions: bulk approve, bulk allocate leave to new employees
- Tooltips: "Half-day leave: take the morning or afternoon off"
- Preview before submit: "This will use 3 of your 12 remaining annual leave days"
- Mobile-friendly: request leave from phone, view balance
- Searchable history: search by employee, type, date
- Status badges: Pending (amber), Approved (green), Rejected (red), Cancelled (gray)
- Notification hooks: "Your leave was approved" (future Phase 14)
