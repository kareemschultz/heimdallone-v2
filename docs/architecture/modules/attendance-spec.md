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
