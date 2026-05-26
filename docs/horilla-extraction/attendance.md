# Attendance — Horilla Extraction

## Overview

The Attendance module tracks employee work hours through check-in/check-out activities, calculates worked hours and overtime, manages late come/early out penalties, and produces monthly hour accounts (work records). It integrates with Biometric and Geofencing modules for automated check-in, and feeds into Payroll for work-hours-based calculations.

## Horilla Files Inspected

- `attendance/models.py` (1028 lines) — AttendanceActivity, BatchAttendance, Attendance, AttendanceOverTime, AttendanceLateComeEarlyOut, AttendanceValidationCondition, GraceTime, AttendanceGeneralSetting, WorkRecords
- `attendance/views.py`, `attendance/urls.py`, `attendance/filters.py`, `attendance/forms.py`
- `attendance/methods/utils.py` — Time calculation utilities

## Important Models

**AttendanceActivity** — Raw check-in/check-out events. Fields: employee FK, attendance_date, shift_day FK, clock_in (Time), clock_out (Time), clock_in_date, clock_out_date, in_datetime, out_datetime. Duration calculated from in-out times. Multiple activities per day (break support).

**Attendance** — Daily attendance summary (one per employee per day, unique_together). Fields: employee FK, attendance_date, shift FK, work_type FK, attendance_day FK, clock_in/out date+time (first in, last out), worked_hour (HH:MM), minimum_hour, overtime (HH:MM), overtime_approve (bool), attendance_validated (bool), at_work_second, overtime_second, approved_overtime_second, is_validate_request, request_type (create/update/revalidate), requested_data (JSON), approved_by FK, is_holiday, batch_attendance FK.

Key behaviors:
- Overtime = max(0, worked_hours - minimum_hour)
- Auto-adjusts minimum_hour to "00:00" for holidays/company leave days
- Supports overtime cutoff (max overtime cap)
- Supports auto-approve OT if minimum threshold met
- Validation request workflow: employees can request attendance validation/corrections
- Saves trigger monthly overtime account (AttendanceOverTime) recalculation

**AttendanceOverTime** — Monthly hour account per employee. Fields: employee FK, month, year, worked_hours, pending_hours, overtime (approved), hour_account_second, hour_pending_second, overtime_second. Unique per employee+month+year.

**AttendanceLateComeEarlyOut** — Flags late arrivals and early departures. Fields: attendance FK, employee FK, type (late_come/early_out). Can trigger PenaltyAccounts (leave deduction or monetary penalty).

**AttendanceValidationCondition** — Singleton settings. Fields: validation_at_work (threshold for auto-validate), minimum_overtime_to_approve, overtime_cutoff, auto_approve_ot (bool).

**GraceTime** — Configurable grace period for check-in/out. Fields: allowed_time (HH:MM:SS), allowed_time_in_secs, allowed_clock_in (bool), allowed_clock_out (bool), is_default. Linked to shifts via EmployeeShift.grace_time_id.

**BatchAttendance** — Group attendance creation. Just a title field linking multiple attendance records.

**WorkRecords** — Consolidated daily work record. Fields: employee FK, date, work_record_type (FDP=Present, HDP=Half Day, ABS=Absent, HD=Holiday, CONF=Conflict, DFT=Draft), at_work, min_hour, attendance FK, leave_request FK, shift FK, day_percentage (0-1), message, note.

**AttendanceGeneralSetting** — Per-company settings. Fields: time_runner (bool), enable_check_in (bool), company FK.

## State Machine / Lifecycle

**Attendance**:
- Created (via check-in or manual entry)
- Not Validated → Validated (by manager/HR)
- Overtime: Not Approved → Approved
- Validation Request: Employee submits request → Manager approves/rejects

**AttendanceActivity**: No state machine — raw event log.

**WorkRecords**: DFT (Draft) → FDP (Full Day Present) | HDP (Half Day) | ABS (Absent) | HD (Holiday) | CONF (Conflict requiring resolution).

## Permissions and RBAC

- `change_validateattendance` — Can validate attendance records
- `change_approveovertime` — Can approve overtime
- Self-service: employees see own attendance
- Manager scope: managers see direct reports
- HR scope: all employees
- All models use `HorillaCompanyManager` for tenant isolation

## Forms, Validation, Filters

- Clock-in date cannot be earlier than attendance date
- Clock-out date cannot be earlier than clock-in date
- Clock-out time cannot be in the future
- One attendance record per employee per day
- Overtime calculated automatically on save
- Work records validated for day_percentage between 0 and 1

Filters: date range, employee, department, shift, work type, validated/not validated, overtime approved/pending.

## Horilla UI → Backend Workflow Notes

### Check-In/Out Flow
1. Employee clicks "Check In" button → creates AttendanceActivity with clock_in
2. Employee clicks "Check Out" → updates activity with clock_out
3. Multiple check-in/out per day supported (breaks)
4. End of day: Attendance record summarizes all activities
5. Worked hours = sum of all activity durations
6. Overtime = max(0, worked_hours - shift.minimum_working_hour)

### Attendance Validation
1. Manager views attendance list (date range)
2. Each record shows: employee, date, worked hours, minimum hours, overtime, validated status
3. Manager clicks "Validate" → sets attendance_validated = true
4. Manager clicks "Approve OT" → sets attendance_overtime_approve = true

### Attendance Correction
1. Employee submits correction request (update_request or create_request)
2. Request includes modified fields stored in requested_data JSON
3. Manager reviews diff between current and requested
4. Manager approves → applies changes, or rejects with comment

### Late/Early Penalties
1. System detects late_come/early_out based on shift schedule ± grace time
2. Creates AttendanceLateComeEarlyOut record
3. HR can add penalties: leave deduction or monetary fine (PenaltyAccounts)

## Heimdallone-native Interpretation

### Drizzle Entity Candidates

- `attendance_event` — employeeId, eventDate, clockIn (timestamp), clockOut (timestamp), source (manual/biometric/geofence/mobile), deviceId (nullable), locationLat/Lon (nullable)
- `attendance_record` — employeeId, date (unique per employee+date), shiftId, workTypeId, firstClockIn, lastClockOut, workedMinutes, minimumMinutes, overtimeMinutes, isValidated, isOvertimeApproved, validatedBy, approvedBy, isHoliday
- `attendance_correction_request` — attendanceRecordId, requestedBy, requestType, requestedData (JSON), status (pending/approved/rejected), reviewedBy, reviewNote
- `overtime_account` — employeeId, month, year, workedMinutes, pendingMinutes, overtimeMinutes, approvedOvertimeMinutes
- `late_early_record` — attendanceRecordId, employeeId, type (late_come/early_out), detectedAt, graceApplied
- `attendance_setting` — organizationId, enableCheckIn, enableTimeRunner, overtimeCutoffMinutes, autoApproveOvertimeThreshold, graceTimeMinutes
- `work_record` — employeeId, date, type (present/half_day/absent/holiday/conflict/draft), workedMinutes, minimumMinutes, attendanceId, leaveRequestId, dayPercentage

### Proposed oRPC Routers

- `attendance.checkIn` — mutation: create attendance event
- `attendance.checkOut` — mutation: update latest open event
- `attendance.records` — query: list with filters (date range, employee, department, validated, overtime)
- `attendance.validate` — mutation: batch validate records
- `attendance.approveOvertime` — mutation: batch approve overtime
- `attendance.corrections` — CRUD for correction requests + approve/reject
- `attendance.monthlyAccount` — query: monthly hour account summary
- `attendance.workRecords` — query: daily work record calendar data
- `attendance.settings` — query/mutation: attendance configuration

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/attendance` — Daily attendance grid (primary view)
- `/app/attendance/calendar` — Monthly calendar view
- `/app/attendance/exceptions` — Late come/early out + corrections queue
- `/app/attendance/overtime` — Overtime review and approval
- `/app/attendance/settings` — Attendance configuration

### View Modes
- **Daily grid**: Table with employee rows, today's status columns (clock in, clock out, worked, status)
- **Calendar**: Monthly calendar with color-coded cells (present/absent/leave/holiday)
- **Exceptions queue**: Filtered list of late/early/missing checkout records
- **Overtime approval**: Table of pending overtime requests
- **Raw events**: Chronological event log (for troubleshooting)

### Data Table (Attendance Records)
- Columns: Employee, Date, Shift, Clock In, Clock Out, Worked Hours, Min Hours, Overtime, Status (validated badge), OT Status (approved badge)
- Sortable: Date, Employee, Worked Hours, Overtime
- Filters: Date range, Department, Shift, Validated/Pending, OT Approved/Pending
- Row actions: Validate, Approve OT, View activities, Edit (if correction)
- Bulk actions: Bulk validate, Bulk approve OT, Export
- Faceted filters: Department, Shift, Status

### Status Badges
- Present (Full Day): green `FDP`
- Half Day: amber `HDP`
- Absent: red `ABS`
- Holiday: blue `HD`
- Conflict: red `CONF`
- Draft: gray `DFT`
- Validated: green checkmark
- OT Approved: green `OT ✓`
- OT Pending: amber `OT ?`

### Forms
- Check-in: Single button (captures time, optional location)
- Manual attendance: Form with employee, date, clock in/out times, shift
- Correction request: Form showing current vs requested values, reason field
- Batch attendance: Select employees + date range + shift for bulk creation

## Staff-Friendly UX Notes

### Plain-Language Labels
- Avoid: "AttendanceValidationCondition", "at_work_second"
- Use: "Attendance Settings", "Hours Worked"

### First-Time User Experience
- Show "Set up your first shift schedule" if no shifts configured
- Check-in button prominent on dashboard for employees
- Timer showing current session duration

### Common Confusion Points
- Confusion: "Validated" vs "Approved" — two different things
- Prevention: Clear labels — "Attendance Confirmed" (validated) vs "Overtime Approved"
- Confusion: Missing check-out shows weird hours
- Prevention: Alert banner "You forgot to check out yesterday" with one-click fix
- Confusion: Why overtime isn't showing in payroll
- Prevention: "Overtime must be approved before it appears in payroll" tooltip

### Role-Specific Views
- Employee: Own attendance calendar + check-in button + correction requests
- Manager: Team attendance grid + validation queue + OT approval queue
- HR admin: All employees + batch attendance + settings + exceptions
- Payroll admin: Monthly hour accounts + approved OT summary

### Guided Workflows
- Correction request: Wizard showing current record → editable fields → reason → submit
- Batch attendance: Step-by-step (select employees → choose date range → set times → review → create)

## Dependencies

- **Employee** (P0) — Every attendance record links to an employee
- **Shifts** (P0, HR Core) — Minimum hours and schedule come from shift configuration
- **Leave** (P1) — Leave records create work records, affect attendance calculations
- **Payroll** (P1) — Work records feed into payroll calculations
- **Biometric** (P2) — Devices create attendance events automatically
- **Geofencing** (P2) — Location validation for check-in

## Edge Cases and Risks

1. **Midnight crossover** — Night shift check-in at 22:00, check-out at 06:00 next day. Handled via is_night_shift flag and clock_out_date != clock_in_date.
2. **Missing check-out** — Employee forgets to check out. System should detect and alert. Auto-checkout at shift end is configurable.
3. **Multiple activities per day** — Breaks create multiple check-in/out pairs. Total worked time is sum of all durations.
4. **Future check-out time** — Validation prevents clock_out > now.
5. **Timezone differences** — Employees in different timezones checking into the same org. Store UTC, display local.
6. **Holiday detection** — Auto-set minimum_hour to 0 for holidays/company leave days.
7. **Grace time stacking** — Employee is 5 minutes late but grace is 10 minutes. Should not flag as late.

## Heimdallone Enhancements Over Horilla/OpenHRMS

1. **Real-time check-in timer** with elapsed duration visible on dashboard
2. **"Forgot to check out" notification** sent at shift end + 30 minutes
3. **One-click correction** for missing check-out instead of full request form
4. **Team attendance heatmap** — calendar view showing team coverage at a glance
5. **Exception-first view** — Show only problems (late, absent, missing checkout) by default
6. **Device source indicator** — Show if attendance came from biometric, mobile, or manual
7. **Bulk validation with review** — Select records → review summary → confirm all at once
8. **"Why is overtime not approved?"** panel explaining the approval chain status
9. **Mobile-friendly check-in** via Expo app (future) with location capture
10. **Attendance analytics** — Trends over time, department comparison, tardiness patterns

## Priority

**P1** — Core operation. Required for daily HR management. Depends on HR Core (P0).
