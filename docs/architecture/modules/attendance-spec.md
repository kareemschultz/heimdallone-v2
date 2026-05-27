# Attendance Module Specification

## Purpose

Tracks employee work hours through check-in/check-out events, computes daily attendance records, manages overtime calculation and approval, detects late arrivals and early departures, produces monthly hour accounts, and supports attendance correction requests.

## Source References

- `docs/horilla-extraction/attendance.md` — Full Horilla model extraction
- `docs/horilla-extraction/biometric.md` — Device integration
- `docs/horilla-extraction/geofencing.md` — Location validation
- `docs/architecture/hr-core-schema-spec.md` — shift, shift_schedule

## Dependencies

- **HR Core** (P0) — employee_profile, shift, shift_schedule, holiday
- **Contracts** (P0) — wage type affects overtime calculations (hourly vs monthly)

## First Version Scope

- Manual check-in/check-out (button in app)
- Daily attendance record (one per employee per day)
- Multiple check-in/out per day (breaks)
- Worked hours computation
- Overtime calculation (worked - minimum from shift schedule)
- Late come / early out detection (comparing against shift start/end ± grace time)
- Attendance validation by manager/HR
- Overtime approval by manager/HR
- Attendance correction request workflow
- Monthly hour account (aggregated worked/pending/overtime per employee per month)
- Work record status (Present/Half Day/Absent/Holiday/Conflict)
- Grace time configuration
- Attendance settings (enable check-in, overtime cutoff, auto-approve threshold)

## Deferred Scope

- Biometric device integration (Phase: Biometric/Geofencing)
- Geofencing check-in validation (Phase: Biometric/Geofencing)
- Batch attendance creation (import)
- Rotating shift attendance tracking
- Split shift handling
- Attendance analytics/dashboards
- Mobile check-in via Expo

## Proposed Entities

### `attendance_event`
- **Purpose**: Raw check-in/check-out timestamps (multiple per day for breaks)
- **Key fields**: id, organizationId, employeeId (FK), eventDate (date), clockIn (timestamp), clockOut (timestamp, nullable), source (manual/biometric/mobile — pgEnum), deviceId (nullable, future FK), locationLat/locationLon (numeric, nullable, future)
- **Tenant scope**: organizationId
- **Audit**: Create/update tracked
- **Delete**: Cascade with parent attendance_record; or soft via attendance_record archive
- **Open questions**: Should we store in/out as separate rows or paired? Paired (single row with clockIn + clockOut) matches Horilla and is simpler.

### `attendance_record`
- **Purpose**: Daily attendance summary (one per employee per day, unique)
- **Key fields**: id, organizationId, employeeId (FK), date (date, unique with employeeId), shiftId (FK, nullable), workTypeId (FK, nullable), firstClockIn (time), lastClockOut (time, nullable), workedMinutes (int), minimumMinutes (int — from shift schedule), overtimeMinutes (int), isValidated (bool), isOvertimeApproved (bool), validatedBy (FK user, nullable), overtimeApprovedBy (FK user, nullable), isHoliday (bool), status (present/half_day/absent/holiday/conflict — pgEnum)
- **Tenant scope**: organizationId
- **Unique**: (employeeId, date)
- **Audit**: All changes — especially validation and OT approval

### `attendance_correction_request`
- **Purpose**: Employee requests modification to their attendance record
- **Key fields**: id, attendanceRecordId (FK, nullable — null if requesting creation), employeeId (FK), requestType (create/update/revalidate — pgEnum), requestedData (jsonb — modified field values), reason (text), status (pending/approved/rejected — pgEnum), reviewedBy (FK user, nullable), reviewNote (text, nullable), createdAt, updatedAt
- **Audit**: Status transitions

### `overtime_account`
- **Purpose**: Monthly aggregation of worked hours, pending hours, and overtime per employee
- **Key fields**: id, organizationId, employeeId (FK), month (int 1-12), year (int), workedMinutes (int), pendingMinutes (int), overtimeMinutes (int), approvedOvertimeMinutes (int)
- **Unique**: (employeeId, month, year)

### `late_early_record`
- **Purpose**: Flags late arrivals and early departures
- **Key fields**: id, attendanceRecordId (FK), employeeId (FK), type (late_come/early_out — pgEnum), detectedMinutes (int — how many minutes late/early), graceApplied (bool), createdAt

### `attendance_setting`
- **Purpose**: Per-org attendance configuration
- **Key fields**: id, organizationId (unique), enableCheckIn (bool, default true), graceTimeMinutes (int, default 15), overtimeCutoffMinutes (int, nullable), autoApproveOvertimeThresholdMinutes (int, nullable), enableAutoCheckout (bool, default false), autoCheckoutAfterMinutes (int, nullable)

## Proposed oRPC Routers

### `attendance`

| Procedure | Input | Permission | Notes |
|-----------|-------|-----------|-------|
| checkIn | — (uses session employee) | self | Creates attendance_event, creates/updates attendance_record |
| checkOut | — | self | Updates latest open event, recalculates attendance_record |
| records.list | dateRange, employeeId?, departmentId?, isValidated?, page/size | attendance:read | Manager: direct reports. HR: all. Employee: self. |
| records.getById | id | attendance:read + access check | |
| validate | ids[] | attendance:correct | Batch validate — sets isValidated |
| approveOvertime | ids[] | attendance:correct | Batch approve OT |
| corrections.create | attendanceRecordId?, requestedData, reason | self | Employee submits correction |
| corrections.list | status?, employeeId?, page/size | attendance:correct | Manager/HR approval queue |
| corrections.approve | id | attendance:correct | Applies changes to record |
| corrections.reject | id, reviewNote | attendance:correct | |
| monthlyAccounts.list | month, year, departmentId? | attendance:read | |
| settings.get | — | attendance:read | |
| settings.update | partial fields | attendance:correct | HR/admin only |

## Proposed UI Routes

### `/app/attendance`
- **Purpose**: Daily attendance view
- **Primary view**: DataTable — Employee, Date, Clock In, Clock Out, Worked Hours, Min Hours, OT, Status (badge), OT Status (badge)
- **Secondary views**: Calendar (monthly color-coded grid), Exceptions (late/absent filter)
- **Filters**: Date range, Department, Validated/Pending, OT Approved/Pending
- **Saved views**: Today, This Week, Pending Validation, Pending OT, Exceptions
- **Bulk actions**: Bulk validate, Bulk approve OT
- **Row actions**: Validate, Approve OT, View events, Edit (if correction)
- **Employee dashboard widget**: Check-in/out button with elapsed timer

### `/app/attendance/corrections`
- **Purpose**: Correction request queue
- **View**: ApprovalQueue pattern — pending requests with approve/reject

## RBAC

Uses existing `attendance:create/read/correct`. Self-scope for check-in. Manager-scope for validation and approval.

## Staff-Friendly UX

- **Check-in button** prominent on employee dashboard: single tap, shows elapsed time
- **"Forgot to check out"** notification sent 30min after shift end
- **One-click correction**: "I forgot to check in yesterday" with pre-filled form
- **Confusion**: "Validated" vs "Approved" — use labels "Hours Confirmed" and "Overtime Approved"
- **Team heatmap**: Manager sees team grid with color-coded attendance at a glance
- **Missing checkout alert**: Banner "You didn't check out yesterday — fix it now?" with one-click action
- **Grace time explanation**: "You checked in at 8:12. Grace time is 15 minutes, so this is not counted as late."
- **Why OT not in payroll?**: "Overtime must be approved before it appears in your payslip."

## Risks and Edge Cases

1. Midnight crossover — night shift check-in 22:00, check-out 06:00 next day
2. Missing check-out — system must detect and alert, optionally auto-checkout
3. Multiple break activities — total worked time = sum of all event durations
4. Timezone differences — store UTC, display local
5. Holiday detection — set minimumMinutes to 0 for holidays
6. Grace time edge — employee is within grace but system flags late anyway (rounding)
7. Concurrent check-in — employee has two devices, clicks twice

## Implementation Readiness

**Needs HR Core + Contracts**. Shifts and shift schedules from HR Core provide minimum hours. Contract wage type affects overtime pay calculation (deferred to Payroll phase).

---

## Payroll Readiness and Time Evidence Pipeline

> Added Phase 6E (2026-05-27). Defines how attendance data flows into payroll.

### Pipeline Overview

```
Raw Event (biometric punch / manual clock / geofence check-in / mobile GPS)
    │
    ▼
Attendance Event (paired clock-in/out, source tagged)
    │
    ▼
Daily Attendance Record (worked hours, minimum hours, overtime candidate)
    │
    ▼
Exception Detection (missing clock-out, duplicate punch, late/early, geofence mismatch)
    │
    ▼
Correction/Regularization (employee requests fix → manager approves)
    │
    ▼
Validated Attendance Record (manager/HR confirmed)
    │
    ▼
Approved Work Record (payable hours, overtime approved)
    │
    ▼
Payroll Projection → Payroll Review → Finalized Payroll
```

### Pipeline Rules

1. **Raw biometric punches are evidence, not payroll truth** — a punch proves presence, not payable hours
2. **Raw GPS/geofence events are evidence, not payroll truth** — validates location, doesn't replace attendance records
3. **Manual clock-in/out is evidence, not payroll truth** — same validation pipeline as biometric
4. **Missing clock-out creates an exception** — system detects, alerts, auto-checkout configurable
5. **Duplicate punches create an exception** — deduplicated automatically, logged for audit
6. **Device sync conflicts create an exception** — conflicting punches from two devices
7. **Geofence mismatch creates an exception** — requires manager override approval
8. **Late/early/overtime are calculated but reviewable** — manager can override before payroll
9. **Approved work records are payroll source of truth** — only validated records feed payroll
10. **Corrections must be auditable** — before/after with approver and timestamp
11. **Managers/HR must approve corrections before payroll uses them**
12. **Payroll shows whether hours are approved, pending, or blocked** per employee
13. **Device/geofence problems never silently affect pay** — exceptions block payroll until resolved
14. **Employees see disputed/pending time issues** — "3 days need attention" in self-service
15. **All data must be explainable and reviewable** — trace back to raw events

### Attendance Data Types for Payroll

| Data Type | Definition | Payroll Impact |
|-----------|------------|---------------|
| Raw attendance events | Individual clock-in/out timestamps | None directly — fed into records |
| Daily attendance records | One per employee per day | Worked hours calculation |
| Work records | Approved daily summary with classification | Source of truth for payroll |
| Payable hours | Hours that count toward compensation | Rate × hours for hourly/daily |
| Expected hours | Scheduled hours from shift | Overtime and absence calculation |
| Approved hours | Validated by manager | Feed directly into payroll |
| Pending hours | Recorded but not validated | Excluded from payroll, shown as warning |
| Overtime candidate hours | Worked - minimum from shift | Pending OT approval |
| Late/early records | Arrivals/departures outside grace | May trigger deductions (configurable) |
| Unpaid absence candidates | No attendance and no approved leave | Deducted from salary |
| Correction requests | Employee-submitted fixes awaiting approval | Cannot affect payroll until approved |

### Day Classification (Overtime Rate Types)

Priority order for each day (from v1 + Horilla + Labour Act):

1. **Public holiday** → 2× rate (statutory)
2. **Sunday** → 2× rate (statutory)
3. **Saturday (not scheduled workday)** → 1.5× rate
4. **Saturday (scheduled workday)** → regular rate, OT after minimum hours
5. **Scheduled weekday** → regular (first N hours) + OT (1.5× beyond minimum)

**Configuration**: Work schedule determines which days are "scheduled". Mon-Fri employers: Saturday = premium. Mon-Sat employers: Saturday = regular until OT.

### Break Auto-Deduction

- Configurable lunch/break deduction per shift
- Rule: "Deduct {breakMinutes} if worked > {minimumMinutesForBreak}"
- Example: "Deduct 60 min lunch if employee worked more than 6 hours"
- Prevents over-counting when employees don't clock out for breaks

### Logical Shift Date Attribution

- Punches attributed to the shift START date, not calendar date
- Critical for overnight shifts: clock-in 22:00 May 15, clock-out 06:00 May 16 → both attributed to May 15
- Prevents payroll misalignment between attendance and pay periods

### Pay Period Aggregation

Before each payroll run, attendance aggregated per employee per period:
- Total approved worked minutes
- Total approved overtime minutes (by rate type: weekday/Saturday/Sunday/holiday)
- Total pending/unvalidated minutes (shown as warning)
- Total absent days (no attendance, no leave)
- Late arrivals count + total minutes
- Exception count (unresolved issues)

### Attendance Cutoff Before Payroll

- Configurable: "Attendance for period must be finalized by {date}"
- After cutoff: no corrections without override
- Payroll run validates: "All attendance validated?" → proceeds or shows warnings
- Blocked employees listed with specific unresolved exceptions

### Payroll-Blocking Exceptions

| Exception | Message | Resolution |
|-----------|---------|------------|
| Missing clock-out | "Maya didn't clock out on May 15" | Add manual clock-out or correction |
| Unvalidated attendance | "3 days not confirmed by manager" | Manager validates |
| Unapproved overtime | "12 hours OT pending approval" | Manager approves/rejects |
| Pending correction | "Correction awaiting review" | Manager approves/rejects |
| Geofence violation | "Checked in from unauthorized location" | Manager override |
| Device sync error | "Conflicting punches from two devices" | HR resolves |

### Staff-Friendly Correction UX

- **"I forgot to clock in"** — one-click button, pre-filled correction form
- **"I forgot to clock out"** — auto-suggests shift end time
- **"My hours are wrong"** — inline edit with reason field
- **Correction categories**: Forgot clock-in, Forgot clock-out, Wrong time, System error, Different location
- **Manager inbox**: grouped by employee, diff view (before → after), approve/reject with note

### Time Summary Report

Per-employee per-period:
- Total worked hours (regular, OT, Saturday, Sunday, holiday breakdown)
- Total expected hours, approved vs pending hours
- Late arrivals, early departures (count + minutes)
- Absences (with/without leave), exceptions resolved
- Payroll readiness: ✅ Ready / ⚠️ Warnings / ❌ Blocked

### "Why Is This Time Blocked?" Panel

For each blocked record: what happened, why it matters, how to fix, who can fix, direct action link.

### Manager Approval Queue

- Pending validations, OT approvals, correction requests in a single inbox
- Grouped by employee, sorted by priority/date
- Bulk approve with review step
- One-click approve/reject with optional reason

### Employee Self-Service Time View

- Check-in/out button with elapsed timer
- Today's attendance status
- This period's summary (worked hours, OT, exceptions)
- "3 items need attention" badge for unresolved exceptions
- Correction request history

### Device Sync Troubleshooting

- Last sync time with health badge
- Pending punch count
- Device offline alerts
- "Contact IT if sync > 24 hours" escalation

### Correction History / Audit Trail

Per-employee: all corrections (approved/rejected), original → corrected, who/when/why, linked payroll period.

### Quality-of-Life Requirements (Attendance)

- Saved views: "Today", "This Week", "Pending Validation", "Pending OT", "Exceptions"
- Smart filters: date range, department, shift, validation status, OT status
- Contextual empty states: "No records for today. Check-ins will appear as employees clock in."
- Role-specific dashboards: employee check-in + own records; manager team grid + approval queue
- Bulk actions with review: select → review → validate all / approve all OT
- Sticky summary: period totals at top of view
- Tooltips: "Validated = manager confirmed these hours"
- Export-ready: time summary CSV, attendance report PDF
- Mobile-friendly: check-in button, timer, today's status
- Status badges: Present (green), Half Day (amber), Absent (red), Holiday (blue), Conflict (red)
- Notification hooks: "Forgot to check out" (future Phase 14)
