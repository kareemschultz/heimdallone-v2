# Attendance + Leave → Payroll Readiness Plan

How Attendance and Leave data flows into Payroll. Reviewed and finalized Phase 7A (2026-05-27).

---

## Data Flow Overview

```
                          ┌─────────────────────┐
                          │   Payroll Engine     │
                          │   (Phase 8)          │
                          └──────────┬───────────┘
                                     │ reads
                    ┌────────────────┼────────────────┐
                    │                │                │
            ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
            │ attendance   │  │  leave     │  │  holiday   │
            │ _record      │  │  _request  │  │  (HR Core) │
            │ WHERE        │  │  WHERE     │  │            │
            │ payrollStatus│  │  status =  │  │  All in    │
            │ = approved   │  │  approved  │  │  period    │
            └──────────────┘  └────────────┘  └────────────┘
                    │                │                │
                    ▼                ▼                ▼
              Worked hours     Leave days        Holiday days
              OT hours         (paid/unpaid)     (non-working paid)
              Day types        Half-days
```

---

## How Attendance Work Records Feed Projected Pay

### For Hourly Employees

```
projectedGross = approvedHours × hourlyRate
               + approvedOvertimeHours × hourlyRate × overtimeMultiplier
```

**Data source**: `attendance_record` WHERE `payrollStatus IN ('approved')` AND `date` within pay period

| Field | Used For |
|-------|----------|
| `workedMinutes` | Regular hours (capped at `minimumMinutes`) |
| `overtimeMinutes` | OT hours (only if `isOvertimeApproved = true`) |
| `dayType` | OT rate selection (weekday 1.5×, sunday 2×, holiday 2×) |
| `isValidated` | Confidence check — unvalidated records trigger warning |
| `payrollStatus` | Only `approved` records feed payroll |

### For Daily Employees

```
projectedGross = approvedDays × dailyRate
```

**Data source**: Count of `attendance_record` WHERE `payrollStatus = 'approved'` AND `status IN ('present', 'half_day')` AND `date` within pay period. Half days count as 0.5.

### For Monthly/Salaried Employees

```
projectedGross = monthlySalary - unpaidLeaveDeduction
unpaidLeaveDeduction = unpaidLeaveDays × (monthlySalary / workingDaysInPeriod)
```

**Data source**: Salary from active contract. Unpaid leave days from `leave_request`. Attendance used only for OT and late/absence tracking.

---

## How Leave Affects Payable Hours/Days

### Paid Leave

- **No salary deduction** — employee receives full pay
- **Day counts as worked** for payroll purposes (not a deduction)
- **Half-day paid leave** — no deduction for the half-day; employee may work the other half

### Unpaid Leave

- **Salary deducted**: `dailyRate × unpaidLeaveDays`
- **Half-day unpaid leave**: `dailyRate × 0.5`
- **For hourly workers**: hours not worked = not paid (no separate deduction needed)
- **For daily workers**: day not worked = not paid

### Leave Day Calculation for Payroll

```
Per employee per pay period:
  paidLeaveDays     = SUM(requestedDays) WHERE leave_type.isPaid = true AND status = 'approved'
  unpaidLeaveDays   = SUM(requestedDays) WHERE leave_type.isPaid = false AND status = 'approved'
  halfDayAdjustment = (count of half-day leaves) × 0.5
```

---

## How Holidays/Company Leave Affect Attendance and Leave

### Holidays

- **Attendance**: If an employee works on a holiday, `attendance_record.isHoliday = true` and `dayType = 'holiday'`. Overtime rate applies (2× per Labour Act).
- **Leave**: Holiday days within a leave request date range are excluded from `requestedDays` count (if `leave_type.excludeHolidays = true`). Employee doesn't "use" leave for holidays.
- **Payroll**: Holidays are paid days. Salaried employees receive normal pay. Hourly/daily employees: holiday pay configurable (paid or not, per org policy).

### Company Leave Days

- **Attendance**: Company leave days (e.g., every Sunday) are not expected working days. No attendance record expected.
- **Leave**: Company leave days within a leave request are excluded from count (if `leave_type.excludeCompanyLeaves = true`).
- **Payroll**: Company leave days are treated as non-working days in the `workingDaysInPeriod` calculation.

---

## What Blocks Payroll

These issues PREVENT payroll from processing for an employee. Must be resolved before finalization.

| Blocker | Source | Message | Resolution |
|---------|--------|---------|------------|
| No active contract | Contracts | "No active contract found for {name}. Create a contract to include them in payroll." | → Create contract |
| Missing bank details | HR Core | "Bank details not set for {name}." | → Update bank info |
| Missing clock-out | Attendance | "{name} didn't clock out on {date}." | → Add manual clock-out or submit correction |
| Unvalidated attendance (if org blocks on this) | Attendance | "{count} attendance days not validated for {name}." | → Manager validates records |
| Negative net pay | Payroll calculation | "{name}'s deductions ({amount}) exceed gross pay ({amount})." | → Review deductions/loans |
| Absent without leave | Attendance + Leave | "{name} has no attendance and no approved leave for {dates}." | → Add attendance, submit leave, or mark unpaid absence |

---

## What Creates Warnings Only

These issues are flagged but do NOT block payroll. Payroll admin can proceed with acknowledgment.

| Warning | Source | Message | Suggested Action |
|---------|--------|---------|-----------------|
| Pending leave requests | Leave | "{count} leave requests pending for {name} ({dates})." | Approve or reject before finalizing |
| Unapproved overtime | Attendance | "{hours} OT hours pending approval for {name}." | OT excluded from payroll unless approved |
| Unvalidated attendance (if org warns only) | Attendance | "{count} days not validated — hours may change." | Manager validates |
| Unusual salary change | Payroll calculation | "{name}'s gross changed by {percent}% from last period." | Review for accuracy |
| Late arrivals | Attendance | "{name} was late {count} times this period." | Informational only |
| Pending correction | Attendance | "Correction request submitted for {name} on {date}." | Approve/reject before finalizing |

---

## What Can Be Overridden

| Item | Override By | Audit? |
|------|------------|--------|
| Unvalidated attendance → include in payroll | Payroll admin | Yes — "Included unvalidated hours for {name}" |
| Pending leave → exclude from deduction | Payroll admin | Yes — "Excluded pending leave deduction for {name}" |
| Absent day → mark as unpaid absence | HR admin | Yes — "Marked {date} as unpaid absence for {name}" |
| OT not approved → include anyway | Payroll admin | Yes — "Included unapproved OT for {name}" |

**Overrides are always audited** — the payroll run record stores which overrides were applied and by whom.

---

## What Must Be Approved Before Payroll Finalization

| Item | Approved By | Required? |
|------|------------|-----------|
| Attendance records validated | Manager/HR | Configurable (block or warn) |
| Overtime approved | Manager/HR | Required for OT to be paid |
| Leave requests approved/rejected | Manager/HR | Required — pending leave is ambiguous |
| Corrections resolved | Manager/HR | Required — pending corrections may change hours |

---

## How "Estimate Only" Projected Pay Reads from Attendance + Leave

### Projection Rules

| Data | Treatment in Projection |
|------|------------------------|
| Approved attendance records | Included at face value |
| Pending (unvalidated) attendance | Included with "estimated" flag |
| Open shifts (clocked in, not yet out) | Projected to shift end time |
| Approved leave (paid) | No deduction |
| Approved leave (unpaid) | Deducted from projection |
| Pending leave | Excluded — too uncertain to include |
| Holidays in period | Included as paid non-working days |
| Days with no data yet (future days in period) | Projected at expected hours from shift schedule |

### Projection Confidence Levels

| Level | Conditions | Display |
|-------|------------|---------|
| **High** | All records approved, no pending corrections, >80% of period complete | "Estimated pay (high confidence)" |
| **Medium** | Some unvalidated records, or <80% of period complete | "Estimated pay (may change)" |
| **Low** | Open corrections, pending leave overlapping period, or <50% complete | "Rough estimate — several items need review" |
| **Cannot estimate** | No contract, no attendance data, or critical missing info | "Cannot estimate — {reason}" |

### Projection Update Triggers

- Attendance record created/updated/validated
- Overtime approved
- Leave request approved/rejected/cancelled
- Correction approved
- Holiday added/removed for period

---

## Exact "Why Blocked?" Messages for Attendance Issues

### Attendance Blockers

```
"Maya Persaud didn't clock out on May 15."
→ [Add Manual Clock-Out] or [Submit Correction]

"3 attendance records not validated for Raj Singh (May 10, 12, 14)."
→ [View Records] → [Validate All]

"Correction request pending for Maya Persaud on May 11."
→ [Review Correction]

"No attendance and no approved leave for Raj Singh on May 8–9."
→ [Add Attendance] or [Submit Leave Request] or [Mark as Unpaid Absence]
```

### Leave Blockers/Warnings

```
"2 leave requests pending for Maya Persaud (May 10–12)."
→ [Approve] or [Reject]

"Maya's carry-forward days expired — leave balance may be incorrect."
→ [Review Leave Balance]

"Unpaid leave not yet calculated for Raj Singh — leave request approved after attendance cutoff."
→ [Recalculate] or [Defer to Next Period]
```

---

## Pay Period Aggregation Summary

For each employee in a pay period, payroll receives:

```typescript
interface PayrollInput {
  employeeId: string;
  contractId: string;
  periodStart: Date;
  periodEnd: Date;

  // From attendance
  attendance: {
    totalWorkedMinutes: number;
    totalApprovedOvertimeMinutes: number;
    overtimeByDayType: {
      weekday: number;     // 1.5× rate
      saturday: number;    // employer-configured rate
      sunday: number;      // 2× rate
      holiday: number;     // 2× rate
    };
    daysPresent: number;
    daysHalfDay: number;
    daysAbsent: number;
    daysHoliday: number;
    lateArrivals: number;
    pendingItems: number;  // unvalidated + pending corrections
    isComplete: boolean;   // all days in period have records
  };

  // From leave
  leave: {
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    pendingLeaveDays: number;  // warning only
  };

  // From holidays
  holidays: {
    count: number;
    dates: Date[];
  };

  // Readiness
  isPayrollReady: boolean;
  blockers: string[];      // empty if ready
  warnings: string[];      // informational
}
```

---

## Implementation Sequence (Full Phase 7)

| Sub-phase | Scope | Depends On |
|-----------|-------|-----------|
| **7B** | Attendance DB schema (4 tables, 4 enums) + migration + seed | HR Core |
| **7C** | Attendance oRPC router (~15 procedures) | 7B |
| **7D** | Attendance UI: grid, check-in widget, corrections | 7C |
| **7E** | Leave DB schema (6 tables, 5 enums) + migration + seed | HR Core |
| **7F** | Leave oRPC router (~24 procedures) | 7E |
| **7G** | Leave UI: dashboard, request form, approvals, calendar, settings | 7F |
| **7H** | Payroll-readiness QA/RBAC/usability pass | 7D + 7G |

**Total: 7 sub-phases.** Attendance (7B–7D) can start immediately. Leave (7E–7G) can start after 7B is stable, or after 7D for safest sequencing. 7H is the final QA pass.

---

## Quality/Debt Planning

### Pre-Existing Lint Debt

`bun run check` currently reports **218 pre-existing lint errors** across:
- `apps/native/` — namespace imports, unused variables, nested ternaries
- `apps/web/src/routes/app/compliance.tsx` — aria-selected on buttons, anchor href
- `packages/ui/src/components/` — array index keys, nested ternaries, label without control
- `scripts/` — namespace imports, non-null assertions

**Action**: Do NOT fix unrelated lint in Phase 7. These errors pre-date Contracts and are in files not touched by Attendance/Leave work. A separate lint cleanup phase is recommended:

**Recommended: Phase 7.1 (optional, between 7D and 7E or after 7H)**
- Fix native app lint (5 errors)
- Fix compliance page aria issues (5 errors)
- Fix data-table/label component issues (4 errors)
- Fix seed script issues (4 errors)
- Remaining ~200 errors: assess whether they're in files we'll touch or can defer further

### Frontend Route/Role Guards

Current gap: settings/create routes are accessible to any authenticated user in the browser (API enforces RBAC, but the routes render). This should be a small task:

**Recommended: Add route guards in Phase 7D or 7G**
- Check `memberRole` in route `beforeLoad` or component render
- Redirect unauthorized roles to `/app` with toast
- Apply to: `/app/attendance` (admin views), `/app/leave/settings`, `/app/leave/approvals`
