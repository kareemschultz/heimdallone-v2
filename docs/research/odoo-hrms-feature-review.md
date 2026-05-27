# Odoo HRMS Feature Review

Phase 7A.1 research (2026-05-27). Odoo 18.0 inspected for HRMS workflow and UX ideas.

**Purpose**: Mine Odoo for product/workflow patterns worth integrating into Heimdallone. Odoo is a reference — not source of truth, not an architecture template.

---

## Sources Reviewed

### Odoo 18.0 Documentation
- [Attendances](https://www.odoo.com/documentation/18.0/applications/hr/attendances.html)
- [Time Off](https://www.odoo.com/documentation/18.0/applications/hr/time_off.html)
- [Payroll](https://www.odoo.com/documentation/18.0/applications/hr/payroll.html)
- [Payroll: Contracts](https://www.odoo.com/documentation/18.0/applications/hr/payroll/contracts.html)
- [Payroll: Work Entries](https://www.odoo.com/documentation/18.0/applications/hr/payroll/work_entries.html)
- [Employees](https://www.odoo.com/documentation/18.0/applications/hr/employees.html)
- [Recruitment](https://www.odoo.com/documentation/18.0/applications/hr/recruitment.html)
- [Referrals](https://www.odoo.com/documentation/18.0/applications/hr/referrals.html)
- [Appraisals](https://www.odoo.com/documentation/18.0/applications/hr/appraisals.html)
- [Expenses](https://www.odoo.com/documentation/18.0/applications/finance/expenses.html)

### Odoo GitHub (18.0 branch)
- `addons/hr_attendance` — Attendance model, kiosk, overtime
- `addons/hr_holidays` — Leave types, allocations, accrual plans
- `addons/hr_contract` — Contract model, wage structures
- `addons/hr_expense` — Expense categories, approval, OCR
- `addons/hr_skills` — Skills taxonomy, resume lines
- `addons/hr_appraisal` — Appraisal cycles, goals, 360 feedback
- `addons/hr_recruitment` — Applicant pipeline, stages
- `addons/resource` — Resource calendar, working hours

---

## Key Findings by Module

### 1. Attendance

**Odoo pattern**: Simple check-in/check-out pairs. No separate "events" vs "records" split — each attendance is one row with `check_in` and `check_out` timestamps. Overtime computed as `worked_hours - expected_hours`.

**Dual tolerance model** (notable):
- **Company-favoring tolerance**: If late by < N minutes, don't count the missed time as absence (grace period)
- **Employee-favoring tolerance**: If early departure by < N minutes, don't penalize (round up)
- These are separate from overtime thresholds

**Kiosk mode**: Dedicated full-screen check-in UI for shared terminals (tablet at entrance). Employees identify via PIN, badge, or manual selection. No app access needed.

**Systray button**: Persistent red/green circle in the UI header — one click to toggle check-in/out. Always visible.

**Manager view**: Gantt/list switchable. Entries exceeding 16 or 24 hours flagged in red. "Focus Today" button for real-time monitoring.

**Session alerts**: Records flagged when they exceed configurable thresholds (16h, 24h) — likely a forgotten checkout.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Dual tolerance | `graceTimeMinutes` in attendance_setting | **Improve** — add employee-favoring tolerance too |
| Kiosk mode | Not planned | **Defer** — Phase 11+ with biometric devices |
| Systray check-in button | Dashboard check-in widget | **Adopt** — persistent status indicator in nav |
| Session alerts (16h/24h) | Missing clock-out exception | **Adopt** — configurable max session threshold |
| Gantt view | Calendar view (stretch) | **Defer** — list/grid first, Gantt later |
| Focus Today button | Today saved view | **Adopt** — prominent "Today" filter |

### 2. Time Off / Leave

**Accrual milestones** (notable): Different accrual rates based on tenure. Example: year 1 = 1 day/month, year 2+ = 1.5 days/month. Milestone rules define transitions.

**Four approval levels**: No validation, officer only, manager only, manager + officer. Configurable per leave type.

**Request granularity**: Full day, half day, or hourly. Three modes configurable per leave type.

**Negative balance**: Configurable cap — allows employees to go negative up to a limit (e.g., -5 days for emergency leave).

**Carry-over strategies**: Three built-in options: reset to zero, full rollover, capped rollover. Per leave type.

**Auto-deduction from extra hours**: Leave requests auto-deduct from overtime bank before touching leave balance.

**Public holiday awareness**: Leave requests auto-exclude public holidays per company policy.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Accrual milestones | Simple accrualAmount per period | **Adopt** — add milestone-based accrual rules |
| Hourly leave | Half-day only | **Defer** — half-day sufficient for Phase 7 |
| Negative balance cap | Not planned | **Adopt** — add `allowNegativeBalance` + `negativeBalanceCap` to leave_type |
| Extra hours deduction | Not planned | **Defer** — needs overtime bank tracking |
| Four approval levels | Single-level approval | **Improve** — keep single for Phase 7, plan multi-level |

### 3. Payroll / Contracts / Work Entries

**Work entries** (critical concept): Odoo uses a unified "work entry" system — individual records per day per employee that track work type (attendance, leave, overtime, etc.). These are auto-generated from Attendance, Planning, and Time Off modules. Payroll consumes work entries, not raw attendance.

**Comparison with Heimdallone**: Our `attendance_record` with `payrollStatus` serves a similar role but is attendance-only. Odoo's work entries are broader — they include leave entries, overtime entries, and planning entries. Our design is simpler (payroll reads attendance_record + leave_request + holidays separately) but requires more join logic at payroll time.

**Work entry conflict resolution**: Orange triangles mark conflicts. Two resolution paths: quick approve/refuse, or follow link to source record for root-cause fix. Best practice: fix source data, then regenerate entries.

**Work entry rounding**: Configurable per work entry type — 5.5 hours can round to 4 or 8 depending on direction (up/down) and unit (half-day/full-day). This is useful for payroll precision.

**Deferred time off**: If leave is taken after payslips are validated for a period, it automatically rolls to the next period's payslip. Prevents mid-cycle payroll errors.

**Contract templates**: Pre-filled templates for common employment patterns (full-time, part-time, seasonal). Auto-calculate part-time percentage from schedule comparison.

**Salary structure types**: Two defaults — Employee (salaried) and Worker (hourly). Structure type determines available salary rules.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Work entries (unified) | attendance_record + leave_request + holidays | **Keep current** — simpler join-based approach documented in payroll-readiness plan |
| Conflict resolution UX | Missing clock-out exception | **Adopt** — orange indicator + quick-fix vs root-cause paths |
| Work entry rounding | Not planned | **Adopt** — add rounding config to attendance_setting |
| Deferred time off | Not planned | **Adopt** — document for Phase 8 payroll |
| Contract templates | Deferred | **Keep deferred** — Phase 8+ |
| Part-time auto-calculation | Not planned | **Defer** — nice-to-have |

### 4. Expenses

**Three submission methods**: Manual entry, bulk drag-and-drop upload, email forwarding (send receipt emails directly to Odoo).

**OCR receipt digitization**: Auto-extracts vendor, amount, date from receipt photos.

**Three reimbursement channels**: Via payslip (deducted from next pay), individual payment, or bulk bank transfer.

**Re-invoicing**: Expenses can be billed to customers via analytic distribution — bridges HR and project accounting.

**Expense categories**: Pre-configured categories with per-diem rates, mileage rates, etc.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Email submission | Not planned | **Defer** — Phase 12+ |
| OCR receipts | Not planned | **Defer** — Phase 12+ |
| Payslip reimbursement | In payroll spec (reimbursement → allowance) | **Keep** — already designed |
| Re-invoicing | Not in scope | **Avoid** — not core HRMS |
| Expense categories | Not yet specified | **Adopt** — add to expenses spec |

### 5. Appraisals / Performance

**360-degree feedback**: Multiple reviewers invited per appraisal. Feedback aggregated on dashboard.

**Skills evolution tracking**: Longitudinal view of competency development across appraisal cycles — not just point-in-time snapshots.

**Goal tracking**: Goals linked to appraisals with completion percentage, tags, and deadline tracking.

**Appraisal templates**: Standardized question sets that can be reused across departments.

**Private notes**: Managers can add confidential observations visible only to HR/admin.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| 360 feedback | Not yet specified in detail | **Adopt** — add to PMS spec |
| Skills evolution | Not specified | **Adopt** — longitudinal skills tracking |
| Appraisal templates | Not specified | **Adopt** — add to PMS spec |
| Private notes | Not specified | **Adopt** — manager confidential notes |
| Goal tracking | In PMS spec (basic) | **Improve** — add completion %, tags, deadlines |

### 6. Recruitment

**Kanban pipeline**: 6 default stages (New → Qualification → Interview 1 → Interview 2 → Proposal → Signed). Stages customizable per job position.

**OCR resume digitization**: Auto-extracts name, phone, email from uploaded resumes.

**Stage-based email templates**: Auto-trigger notifications on stage transitions.

**Velocity analysis**: Measures hiring speed — time from application to offer.

**Referral integration**: Points awarded per stage progression, not just on hire.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Kanban pipeline | In recruitment spec | **Keep** — already planned |
| OCR resume | Not planned | **Defer** — Phase 12+ |
| Stage-based emails | In automation spec | **Keep** — already planned |
| Velocity analysis | Not specified | **Adopt** — add to recruitment spec |
| Referral points per stage | Not specified | **Adopt** — add to recruitment spec |

### 7. Employees / Skills / Documents

**Presence detection**: Three methods — check-in (attendance), login status (last Odoo activity), advanced (email + IP verification). Configurable per company.

**Remote work scheduling**: Per-day location assignments (office/home/other) on employee profiles.

**Badge system**: Recognition badges awarded to employees (gamification).

**Skills taxonomy**: Skills organized by type with proficiency levels. Self-assessed vs. manager-assessed.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Presence detection | Check-in only | **Defer** — advanced presence for Phase 14+ |
| Remote work scheduling | Not planned | **Defer** — nice-to-have |
| Badge system | Not planned | **Defer** — gamification Phase 13+ |
| Skills taxonomy | Not in HR Core | **Adopt** — add to PMS/skills spec |

### 8. Approvals / Activities / UX Patterns

**Chatter/activity log**: Every record has a timeline of comments, status changes, and scheduled activities. Activities have due dates and assigned users.

**Scheduled activities**: Reminders attached to records ("Follow up in 3 days", "Review before Friday").

**Smart buttons**: Contextual counters on record headers linking to related data ("5 Payslips", "3 Leaves").

**Status ribbons**: Colored banners across records showing current state.

**Multi-view pattern**: Most modules offer Kanban + List + Calendar + Pivot + Graph views. Toggle between them seamlessly.

**Search/filter/group**: Unified search bar with filter chips, group-by options, and saved filter presets. Every list view supports this pattern.

**Quick-create**: Minimal form for fast record creation without leaving the list view.

| Odoo Feature | Heimdallone Equivalent | Action |
|-------------|----------------------|--------|
| Activity/chatter timeline | AuditTimeline component | **Improve** — add scheduled activities concept |
| Smart buttons | Not in primitives | **Adopt** — contextual counter links on headers |
| Status ribbons | StatusBadge | **Keep** — badges serve same purpose |
| Multi-view toggle | DataTable only | **Adopt** — ViewSwitcher for list/calendar/kanban |
| Search/filter/group | FilterBar (basic) | **Improve** — add group-by and saved filter presets |
| Quick-create | EntitySheet | **Keep** — sheet pattern is equivalent |

---

## Recommendation Matrix

| Odoo Module | Feature | Why It Matters | Heimdallone Module | Action | Priority | Notes |
|-------------|---------|---------------|-------------------|--------|----------|-------|
| Attendance | Dual tolerance (company + employee) | Prevents gaming and unfairness | Attendance | Improve | P1 | Add employee-favoring tolerance to settings |
| Attendance | Persistent check-in indicator | One-click UX, always visible | Attendance UI | Adopt | P1 | Nav bar status dot, not just dashboard widget |
| Attendance | Max session threshold alert | Catches forgotten checkouts | Attendance | Adopt | P1 | Configurable 16h/24h threshold |
| Attendance | Focus Today button | Quick filter for current day | Attendance UI | Adopt | P1 | Default saved view |
| Time Off | Accrual milestones (tenure-based) | Rewards loyalty, industry standard | Leave | Adopt | P2 | Add milestone rules to leave_type |
| Time Off | Negative balance cap | Emergency leave flexibility | Leave | Adopt | P2 | `allowNegativeBalance` + cap fields |
| Time Off | Deferred time off to next period | Prevents payroll errors | Payroll | Adopt | P2 | Document for Phase 8 |
| Payroll | Work entry conflict resolution UX | Clear conflict indicator + fix paths | Attendance UI | Adopt | P1 | Orange triangle + quick-fix pattern |
| Payroll | Work entry rounding | Payroll precision control | Attendance | Adopt | P2 | Add rounding config to settings |
| Payroll | Contract templates | Faster onboarding | Contracts | Keep deferred | P3 | Phase 8+ |
| Expenses | Expense categories | Structured expense tracking | Expenses | Adopt | P3 | Phase 12+ |
| Appraisals | 360-degree feedback | Comprehensive reviews | PMS | Adopt | P3 | Phase 13 |
| Appraisals | Skills evolution tracking | Talent development analytics | PMS | Adopt | P3 | Longitudinal competency data |
| Appraisals | Appraisal templates | Standardized reviews | PMS | Adopt | P3 | Phase 13 |
| Recruitment | Velocity analysis | Measures hiring efficiency | Recruitment | Adopt | P3 | Phase 9 |
| Recruitment | Referral points per stage | Keeps referrers engaged | Recruitment | Adopt | P3 | Phase 9 |
| UX | Multi-view (list/calendar/kanban) | Users prefer different views | Shared UI | Adopt | P2 | ViewSwitcher component |
| UX | Search + filter + group-by | Power user productivity | Shared UI | Improve | P2 | Enhance FilterBar with group-by |
| UX | Activity/chatter timeline | Contextual history on records | Shared UI | Improve | P2 | Add scheduled activities to AuditTimeline |
| UX | Smart buttons (contextual counters) | Navigation shortcut | Shared UI | Adopt | P3 | Header counter links |

---

## Odoo vs Heimdallone: Architecture Comparison

### Work Entries vs Attendance Records

| Aspect | Odoo Work Entries | Heimdallone attendance_record |
|--------|------------------|------------------------------|
| Scope | Unified: attendance + leave + planning + custom types | Attendance only; leave read separately |
| Generation | Auto-generated from multiple source apps | Created on clock-in/out or admin entry |
| Payroll consumption | Payroll reads work entries directly | Payroll joins attendance_record + leave_request + holidays |
| Conflict detection | Built-in with visual indicators | Missing clock-out exception + conflict status |
| Rounding | Per work-entry-type configurable | Not yet configurable |
| Complexity | Higher — unified system requires regeneration workflow | Lower — separate sources, simpler per-module logic |

**Decision**: Keep Heimdallone's simpler approach. The join-based payroll readiness (attendance + leave + holidays) is well-documented in `attendance-leave-payroll-readiness-plan.md` and avoids the complexity of a unified work entry system. The payroll engine reads three sources and produces the `PayrollInput` interface.

### Where Odoo Is Better

1. **Dual tolerance model** — smarter than a single grace period
2. **Accrual milestones** — tenure-based earning rates
3. **Deferred time off** — auto-rolls to next period
4. **Multi-view toggle** — users choose their preferred view
5. **Activity/chatter** — built-in timeline on every record

### Where Heimdallone Should Be Better

1. **Guided setup** — Odoo requires expert configuration; Heimdallone uses wizards
2. **"Why blocked?" panels** — Odoo doesn't explain payroll blockers inline
3. **Plain-language labels** — Odoo uses technical terms; Heimdallone explains
4. **Mobile-first employee experience** — Odoo's mobile is secondary
5. **Non-technical user design** — Odoo assumes ERP expertise
6. **Payroll calculation explanation** — Odoo doesn't show step-by-step breakdowns
7. **Helper text everywhere** — Odoo relies on documentation; Heimdallone puts it inline

---

## Gaps Compared to Horilla/OpenHRMS/Heimdallone Plans

| Feature | Horilla | OpenHRMS | Odoo | Heimdallone Plan | Gap? |
|---------|---------|----------|------|-----------------|------|
| Dual tolerance attendance | No | No | Yes | Grace only | **Add employee-favoring tolerance** |
| Accrual milestones | No | No | Yes | Flat rate | **Add milestone rules** |
| Negative leave balance | No | No | Yes | No | **Add configurable cap** |
| Work entry rounding | No | No | Yes | No | **Add rounding config** |
| Deferred time off | No | No | Yes | No | **Document for payroll** |
| Kiosk mode | No | No | Yes | No | Defer — biometric phase |
| OCR (resume/receipts) | No | No | Yes | No | Defer — future phases |
| 360 feedback | No | No | Yes | Basic | **Enhance PMS spec** |
| Skills evolution | No | No | Yes | No | **Add to PMS spec** |
| Velocity analysis | No | No | Yes | No | **Add to recruitment spec** |
| Re-invoicing expenses | No | No | Yes | No | Avoid — not core HRMS |

---

## Impact on Implementation Sequence

No radical reorder needed. Roadmap remains:
- Phase 7C: Attendance API (in progress)
- Phase 7D: Attendance UI
- Phase 7E: Leave DB schema + seed
- Phase 7F: Leave API
- Phase 7G: Leave UI
- Phase 7H: Payroll-readiness QA
- Phase 8: Payroll

**Additions from Odoo research** (no phase reorder, just spec enrichment):
- Add dual tolerance + max session threshold to `attendance_setting` (Phase 7D or stretch)
- Add accrual milestone rules to leave_type design (Phase 7E)
- Add negative balance cap to leave_type (Phase 7E)
- Add deferred time off handling to payroll spec (Phase 8)
- Add work entry rounding concept to attendance or payroll spec (Phase 8)
- Add ViewSwitcher component to shared primitives (Phase 7D or 7G)

---

## GitHub Source Code Findings

### Odoo hr_attendance Model Details

Key patterns from the source:

- **Check-in modes enum**: `kiosk`, `systray`, `manual`, `technical`, `auto_check_out` — tracks HOW the check-in happened
- **Geo fields**: Separate lat/lng/city/country/IP/browser for both check-in AND check-out — enables hybrid work auditing
- **Overtime distribution**: When overtime is approved, it's distributed proportionally across attendance records using raw SQL — prevents assigning all OT to one record
- **Absence detection cron**: Automatically creates "technical" attendance records with negative overtime for employees who didn't show up — interesting but adds complexity
- **Overlap validation**: SQL-level constraint prevents overlapping attendance records per employee
- **Lunch interval subtraction**: Auto-deducts lunch from worked hours for non-flexible employees — matches our `breakDeductionMinutes` pattern

### Odoo hr_holidays Model Details

Key patterns:

- **Privacy**: Leave request has a `private_name` field hidden from non-HR users (shows `*****`) — important for medical/personal leave
- **Email approve/refuse**: Controller links in notification emails let managers approve/refuse without opening the app
- **Nightly cron**: Auto-cancels leaves where employee's accrual balance fell below the requested amount — prevents negative balance surprises
- **Split at boundaries**: Leaves can be split when company time-off policy changes mid-leave — edge case handling
- **Mandatory days**: Company-wide mandatory days off that block leave requests — like company holidays but stronger

### Odoo hr_contract Model Details

- **Auto-lifecycle cron (`update_state`)**: Automatically transitions contracts between states based on dates — matches our on-read auto-expire but uses a scheduled job instead
- **Kanban state overlay**: `normal`/`done`/`blocked` layered on top of contract status — provides a visual readiness indicator
- **Work permit tracking**: `visa_expire` field with automated expiration warnings — Caribbean relevance for migrant workers

### Odoo hr_expense Model Details

- **Dual approval flow**: Computed `approval_state` separate from `payment_state` — approval and payment are independent lifecycles
- **Duplicate detection**: SQL matching on (employee, product, date, amount) + attachment checksum — prevents double submissions
- **Email gateway**: `message_new()` creates expenses from forwarded emails — low-friction submission

### Odoo resource.calendar (Work Schedule)

- **Two-week alternating**: Boolean toggle for alternating week schedules (week A/B) — useful for factory/retail
- **Flexible hours**: Generates dummy intervals for salaried workers who don't clock in/out — supports different tracking modes
- **`hours_per_day` computed**: Average from attendance lines excluding lunch — canonical "standard day" for day/hour conversions

### Cross-Cutting GitHub Patterns

1. **Approval configurable per type**: Leave types, allocation types, expense types all let admins choose `no_validation` / `manager` / `hr` / `both`
2. **Activity-driven workflow**: Creates `mail.activity` (to-do items) for approvers at each step, with deadlines — actionable tasks, not just notifications
3. **User-facing vs internal dates**: Leave requests have `request_date_from/to` (user-facing) and `date_from/to` (UTC computed from calendar + timezone) — prevents timezone bugs
4. **Candidate vs Applicant separation**: One person can apply to multiple jobs without duplicating contact data
5. **Accrual is a first-class engine**: Multi-level progression, work-time proration, carryover with expiration, yearly caps

---

## Additional Recommendations from GitHub Analysis

| Pattern | Source | Heimdallone Impact | Action |
|---------|--------|-------------------|--------|
| Check-in mode tracking | hr_attendance | `attendance_event.source` already has this | ✅ Already covered |
| Private leave name | hr_holidays | leave_request should mask reason for non-HR roles | **Adopt** for Phase 7E |
| Overlap validation (SQL constraint) | hr_attendance | `att_record_emp_date_uq` already handles this | ✅ Already covered |
| Configurable approval per type | hr_holidays | Single-level for Phase 7, enhance later | **Plan** for Phase 8+ |
| Two-week alternating schedule | resource.calendar | shift_schedule supports dayOfWeek but not alternating weeks | **Defer** — niche need |
| User-facing vs UTC dates for leave | hr_holidays | Leave dates stored as `date` (no time component) | **Review** when building leave request logic |
| Work permit expiration tracking | hr_contract | Not in employee_profile | **Adopt** — add visa/permit fields Phase 8+ |
| Duplicate expense detection | hr_expense | Not yet designed | **Adopt** when building expenses module |
| Auto-lifecycle cron for contracts | hr_contract | Currently on-read check | **Plan** — scheduled job for Phase 8 |
