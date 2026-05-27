# Attendance Implementation Plan

Phase 7B–7D spec. Reviewed and finalized Phase 7A (2026-05-27).

---

## Design Decisions

### 1. `attendance_record` IS the payroll-ready work record

The spec proposed both `attendance_record` and `work_record` as separate entities. **Decision: merge them.** A single `attendance_record` table with an `isPayrollReady` flag and a `payrollStatus` enum serves both purposes:

- Before validation: it's an attendance record
- After validation + OT approval: it becomes the payroll-ready work record
- The `payrollStatus` field tracks: `pending` → `approved` → `payroll_locked`

**Why not a separate `work_record` table?** Duplicating data across two tables creates sync risk. Every approved attendance record IS a work record. The payroll engine reads `attendance_record WHERE payrollStatus = 'approved'` — no copy step needed.

### 2. Status enums are minimal at launch

Per user guidance: "Do not invent too many DB enums before the workflow is stable." We define only the enums we need for Phase 7:

| Enum | Values | Notes |
|------|--------|-------|
| `attendanceSourceEnum` | manual, biometric, mobile, import, admin | Source of the clock event |
| `attendanceStatusEnum` | present, half_day, absent, holiday, conflict | Daily attendance classification |
| `attendanceCorrectionStatusEnum` | pending, approved, rejected | Correction request lifecycle |
| `attendancePayrollStatusEnum` | pending, approved, payroll_locked | Payroll readiness |

No `overtimeStatusEnum` — overtime approval is a boolean (`isOvertimeApproved`) on the record itself, not a separate lifecycle.

### 3. Biometric prepared but not implemented

Phase 7 creates the `source` enum and nullable `deviceId`/`locationLat`/`locationLon` columns on `attendance_event`. The biometric device tables, sync engine, and geofence validation are Phase 11. Phase 7 starts with manual check-in and admin import.

### 4. Attendance before Leave in implementation order

Attendance is the larger payroll dependency. Hourly/daily workers need attendance records for projected pay. Leave can be designed in parallel but implemented after attendance foundation is stable.

---

## Schema Plan

### Enums (pgEnum)

```typescript
attendanceSourceEnum: manual | biometric | mobile | import | admin
attendanceStatusEnum: present | half_day | absent | holiday | conflict
attendanceCorrectionStatusEnum: pending | approved | rejected
attendancePayrollStatusEnum: pending | approved | payroll_locked
```

### `attendance_event`

Raw clock-in/out timestamps. Multiple events per employee per day (breaks).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | Tenant scope |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| eventDate | date | NOT NULL | Calendar date of the shift |
| clockIn | timestamp | NOT NULL | |
| clockOut | timestamp | nullable | Null = shift still open |
| durationMinutes | integer | nullable | Computed on clockOut |
| source | attendanceSourceEnum | NOT NULL, default "manual" | |
| deviceId | text | nullable | Future FK for biometric devices |
| locationLat | numeric(10,7) | nullable | Future GPS |
| locationLon | numeric(10,7) | nullable | Future GPS |
| notes | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId), (employeeId, eventDate), (eventDate)

### `attendance_record`

Daily attendance summary — one per employee per day. **This IS the payroll-ready work record.**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| date | date | NOT NULL | |
| shiftId | text | FK → shift.id, nullable | Snapshot of assigned shift |
| firstClockIn | text | nullable | Time string HH:MM |
| lastClockOut | text | nullable | Time string HH:MM |
| workedMinutes | integer | NOT NULL, default 0 | Sum of all event durations |
| minimumMinutes | integer | NOT NULL, default 0 | From shift_schedule for this day |
| overtimeMinutes | integer | NOT NULL, default 0 | max(0, worked - minimum) |
| breakMinutesDeducted | integer | NOT NULL, default 0 | Auto-deducted lunch/breaks |
| lateMinutes | integer | NOT NULL, default 0 | Minutes past shift start + grace |
| earlyMinutes | integer | NOT NULL, default 0 | Minutes before shift end |
| status | attendanceStatusEnum | NOT NULL, default "present" | Daily classification |
| isValidated | boolean | NOT NULL, default false | Manager/HR confirmed hours |
| validatedBy | text | FK → user.id, nullable | |
| validatedAt | timestamp | nullable | |
| isOvertimeApproved | boolean | NOT NULL, default false | OT approved for payroll |
| overtimeApprovedBy | text | FK → user.id, nullable | |
| isHoliday | boolean | NOT NULL, default false | |
| payrollStatus | attendancePayrollStatusEnum | NOT NULL, default "pending" | Payroll readiness |
| dayType | text | nullable | weekday/saturday/sunday/holiday — for OT rate classification |
| notes | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (employeeId, date) — one record per employee per day
**Indexes**: (organizationId, date), (employeeId, date), (payrollStatus)

### `attendance_correction`

Employee-submitted corrections, reviewed by manager/HR.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| attendanceRecordId | text | FK → attendance_record.id, nullable | Null if requesting new record |
| employeeId | text | FK → employee_profile.id, NOT NULL | |
| category | text | NOT NULL | forgot_clock_in, forgot_clock_out, wrong_time, system_error, other |
| requestedClockIn | text | nullable | Proposed clock-in time |
| requestedClockOut | text | nullable | Proposed clock-out time |
| requestedDate | date | nullable | For new record requests |
| reason | text | NOT NULL | |
| status | attendanceCorrectionStatusEnum | NOT NULL, default "pending" | |
| reviewedBy | text | FK → user.id, nullable | |
| reviewNote | text | nullable | |
| reviewedAt | timestamp | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (employeeId), (status), (organizationId, status)

### `attendance_setting`

Per-org attendance configuration.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, UNIQUE, NOT NULL | One per org |
| enableCheckIn | boolean | NOT NULL, default true | |
| graceTimeMinutes | integer | NOT NULL, default 15 | Grace before flagging late |
| overtimeCutoffMinutes | integer | nullable | Max OT per day (null = unlimited) |
| autoApproveOvertimeThresholdMinutes | integer | nullable | Auto-approve OT below this |
| breakDeductionMinutes | integer | NOT NULL, default 60 | Lunch break auto-deduction |
| breakDeductionThresholdMinutes | integer | NOT NULL, default 360 | Only deduct if worked > this |
| enableAutoCheckout | boolean | NOT NULL, default false | |
| autoCheckoutAfterMinutes | integer | nullable | Auto clock-out after N min |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

---

## Status Lifecycle

### Attendance Record Lifecycle

```
Clock-in event created
    │
    ▼
attendance_record created (status: present, payrollStatus: pending)
    │
    ├── Clock-out event → workedMinutes computed, OT/late/early calculated
    │
    ├── No clock-out by shift end + autoCheckout → exception flagged
    │
    ▼
Manager validates (isValidated: true)
    │
    ▼
Manager approves OT if applicable (isOvertimeApproved: true)
    │
    ▼
payrollStatus → approved (ready for payroll)
    │
    ▼
Payroll run locks → payrollStatus → payroll_locked (immutable)
```

### Correction Lifecycle

```
pending → approved (changes applied to attendance_record, audit logged)
        → rejected (reviewNote explains why)
```

### Source Types

| Source | Description | Phase |
|--------|-------------|-------|
| `manual` | Employee clicks check-in/out button in web app | Phase 7 |
| `admin` | HR/admin creates or edits attendance directly | Phase 7 |
| `import` | Bulk import from CSV/spreadsheet | Phase 7 (stretch) |
| `biometric` | Device punch via bridge | Phase 11 |
| `mobile` | Expo app with GPS | Phase 11+ |

---

## Exception Handling

| Exception | Detection | Action | Blocks Payroll? |
|-----------|-----------|--------|----------------|
| Missing clock-out | clockOut IS NULL at shift end + grace | Banner: "You didn't clock out" + auto-checkout if enabled | Yes until resolved |
| Duplicate event | Same employee, same source, within 2 minutes | Auto-deduplicate, keep first | No |
| Late arrival | clockIn > shiftStart + graceTime | Create late_minutes on record | No (warning only) |
| Early departure | clockOut < shiftEnd - graceTime | Create early_minutes on record | No (warning only) |
| No attendance + no leave | No record for a scheduled workday | Mark as absent | Yes — must resolve (leave or correction) |
| Conflict | Multiple conflicting events from different sources | status → conflict | Yes until resolved |
| Unvalidated record | isValidated = false at payroll cutoff | Warning in payroll preview | Configurable (warn or block) |
| Unapproved OT | overtimeMinutes > 0 but not approved | OT excluded from payroll | No — OT just excluded |

---

## API Plan

### `attendance` router

| Procedure | Input | Permission | Scope | Notes |
|-----------|-------|-----------|-------|-------|
| checkIn | notes? | self | Self only | Creates event + creates/updates record |
| checkOut | notes? | self | Self only | Closes latest open event, recalculates record |
| events.list | employeeId?, dateRange, page/size | attendance:read | Role-scoped | Raw events log |
| records.list | dateRange, employeeId?, departmentId?, isValidated?, payrollStatus?, page/size | attendance:read | Role-scoped | Daily records |
| records.getById | id | attendance:read | Access check | Single record with events |
| records.createManual | employeeId, date, clockIn, clockOut | attendance:correct | HR/admin | Admin creates attendance |
| validate | ids[] | attendance:correct | Manager/HR | Batch validate records |
| approveOvertime | ids[] | attendance:correct | Manager/HR | Batch approve OT |
| corrections.create | attendanceRecordId?, category, requestedClockIn?, requestedClockOut?, reason | self | Self only | Employee submits correction |
| corrections.list | status?, employeeId?, page/size | attendance:correct | Manager/HR | Approval queue |
| corrections.approve | id | attendance:correct | Manager/HR | Applies changes to record |
| corrections.reject | id, reviewNote | attendance:correct | Manager/HR | |
| settings.get | — | attendance:read | Org | |
| settings.update | partial fields | attendance:correct | HR/admin | |
| summary.monthly | month, year, employeeId?, departmentId? | attendance:read | Role-scoped | Monthly hour summary |

### RBAC

| Role | Check In/Out | View Records | Validate/Approve | Manage Settings | Create Manual |
|------|-------------|-------------|-----------------|----------------|--------------|
| tenant_owner | Own | All | Yes | Yes | Yes |
| tenant_admin | Own | All | Yes | Yes | Yes |
| hr_admin | Own | All | Yes | Yes | Yes |
| payroll_admin | Own | All (read-only) | No | No | No |
| auditor | No | All (read-only) | No | No | No |
| manager | Own | Self + reports | Self + reports | No | No |
| employee | Own | Self only | No | No | No |

---

## UI Plan

### Route: `/app/attendance`

**Primary view**: Daily attendance grid (DataTable)

| Column | Notes |
|--------|-------|
| Employee | Name + avatar |
| Date | Calendar date |
| Clock In | First clock-in time |
| Clock Out | Last clock-out time |
| Worked | Total worked hours:minutes |
| Min Hours | From shift schedule |
| OT | Overtime hours:minutes |
| Status | StatusBadge: Present/Half Day/Absent/Holiday/Conflict |
| Validated | Checkmark or pending icon |
| OT Approved | Checkmark or pending icon |
| Actions | Validate, Approve OT, View events, Edit |

**Filters**: Date range, Department, Shift, Validated/Pending, OT Approved/Pending, Status
**Saved views / lenses**: Today, This Week, Pending Validation, Pending OT, Exceptions (absent+conflict)
**Bulk actions**: Bulk Validate, Bulk Approve OT (with review step)
**Empty state**: "No attendance records for this period. Records will appear as employees check in."
**Loading**: Skeleton rows (reuse DataTable skeleton pattern from contracts)

### Employee Self-Service (widget on `/app` dashboard)

- Large check-in/out button with elapsed timer
- Today's status card (clock-in time, worked so far, shift info)
- "3 items need attention" badge linking to corrections
- Quick links: "I forgot to clock in/out" → pre-filled correction form

### Route: `/app/attendance/corrections`

**View**: Approval queue (ApprovalQueue pattern from status-and-workflow-components.md)
- Cards with: employee name, date, category, requested change, reason
- Approve / Reject buttons with optional note
- Diff view: current record → proposed changes
**Filters**: Status (pending/approved/rejected), Employee, Date range
**Empty state**: "No correction requests pending."

### Route: `/app/attendance/calendar` (stretch goal for 7D)

**View**: Monthly calendar grid with employee rows, color-coded status cells
- Green = present, Amber = half day, Red = absent, Blue = holiday, Gray = no data
**Role-specific**: Manager sees team only, HR sees all

### Time Summary Report (within `/app/attendance`)

**View**: Monthly summary table
- Per-employee: total worked, expected, OT approved, OT pending, late count, absent days, payroll readiness badge
- Export CSV button
- **Sticky summary panel**: period totals at top

### Staff-Friendly Helper Text

- Check-in button: "Tap to start your work day"
- Validated tooltip: "Your manager confirmed these hours are correct"
- OT Approved tooltip: "Approved overtime will appear in your payslip"
- Grace time: "You checked in at 8:12. Grace time is 15 minutes, so this is not counted as late."
- "Why is this blocked?" panel: per-exception explanations with resolution links

---

## Implementation Sequence

| Sub-phase | Scope | Depends On |
|-----------|-------|-----------|
| **7B** | Attendance DB schema (4 tables, 4 enums) + migration + seed | HR Core schema |
| **7C** | Attendance oRPC router (~15 procedures) | 7B |
| **7D** | Attendance UI: /app/attendance grid, check-in widget, corrections queue | 7C |

---

## First Version Scope

- Manual check-in/out (web button)
- Admin manual attendance creation
- Daily attendance record with worked/minimum/OT calculation
- Multiple events per day (breaks)
- Break auto-deduction (configurable)
- Late/early detection with grace time
- Attendance validation by manager/HR
- Overtime approval by manager/HR
- Correction request workflow (submit → approve/reject)
- Monthly hour summary
- Day type classification (weekday/saturday/sunday/holiday)
- Payroll status tracking (pending → approved → locked)
- Attendance settings (grace time, OT cutoff, break deduction)
- Employee self-service: check-in button, own records, correction requests

## Deferred Scope

| Feature | Deferred To | Reason |
|---------|------------|--------|
| Biometric device integration | Phase 11 | Needs device bridge + hardware |
| Geofence validation | Phase 11 | Needs mobile GPS app |
| Batch attendance import | Phase 7D stretch | Nice-to-have, not critical for MVP |
| Calendar view | Phase 7D stretch | Grid view is primary; calendar is secondary |
| Rotating shift detection | Phase 8+ | Complex shift assignment logic |
| Attendance analytics/charts | Phase 15 | Analytics phase |
| Mobile check-in (Expo) | Phase 11+ | Needs mobile app |
| Overtime rate type calculation | Phase 8 (Payroll) | Rate multipliers are payroll concern, not attendance |
| Auto-checkout | Phase 7D stretch | Configurable but not critical for MVP |

---

## Audit Events

| Action | Entity | Changes Tracked |
|--------|--------|----------------|
| check_in | attendance_event | clockIn, source |
| check_out | attendance_event | clockOut, durationMinutes |
| create_manual | attendance_record | All fields (admin-created) |
| validate | attendance_record | isValidated: false → true, validatedBy |
| approve_overtime | attendance_record | isOvertimeApproved: false → true |
| correction_submit | attendance_correction | category, requested changes |
| correction_approve | attendance_correction + attendance_record | Status change + record modifications |
| correction_reject | attendance_correction | Status + reviewNote |
| settings_update | attendance_setting | Changed fields |

---

## Open Questions

| # | Question | Recommendation | Status |
|---|----------|---------------|--------|
| 1 | Should `dayType` be computed on-write or on-read? | On-write — set when record is created based on holiday table + shift schedule. Avoids recomputation. | Decided |
| 2 | Should break deduction be per-event or per-day? | Per-day — deduct from total `workedMinutes` after summing all events. Simpler and matches Horilla pattern. | Decided |
| 3 | Should payroll lock be automatic or manual? | Automatic when payroll run starts. The payroll engine sets `payroll_locked` on all records in the period. | Decided |
| 4 | Should overtime approval be separate from validation? | Yes — validation confirms hours are correct; OT approval confirms overtime should be paid. Two separate concerns. | Decided |
| 5 | Should we store `minimumMinutes` on the record or look it up from shift? | Store on record — snapshot at creation time. If shift changes later, existing records aren't affected. | Decided |
| 6 | Night shift: how to handle overnight clock-in/out? | Use `eventDate` (the shift START date) as the canonical date. Clock-out on the next calendar day is still attributed to the start date. Matches v1's `logicalShiftDate` pattern. | Decided |
