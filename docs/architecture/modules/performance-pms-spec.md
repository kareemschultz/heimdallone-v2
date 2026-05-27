# Performance / PMS Module Specification

## Purpose

Performance management through OKRs (Objectives and Key Results), 360-degree feedback cycles, question templates, employee reviews, and bonus point awards. Enables structured performance evaluation with measurable outcomes.

## Source References

- `docs/horilla-extraction/performance.md` — Full Horilla PMS extraction
- `docs/horilla-extraction/openhrms-comparison.md` — oh_appraisal

## Dependencies

- **HR Core** (P0) — employee_profile, department

## First Version Scope

### Goals / OKRs
- Objective templates (title, description, duration, default key results)
- Employee objectives (assigned from templates or custom, with start/end dates)
- Key results per objective (measurable: percentage, number, or currency progress)
- Progress tracking (current_value → target_value → auto-calculate percentage)
- Status tracking (Not Started / On Track / Behind / At Risk / Closed)

### Feedback / Reviews
- Review periods (named periods with start/end dates)
- Question templates (reusable sets of review questions)
- Question types: Text, Rating (1-5), Boolean, Multiple choice, Likert scale
- Feedback cycles (link employee + manager + colleagues + subordinates + template)
- 360-degree: collect feedback from manager, peers, direct reports, self
- Cyclic feedback (recurring at configurable intervals)
- Anonymous feedback option (based on department/position/general)

### Meetings
- 1-on-1 meeting records (manager + employee, optional question template)
- Meeting responses with structured answers

### Bonus Points
- Auto-award points for completing objectives/KRs on time
- Configurable bonus point rules (model + condition + points)
- Points trackable per employee (existing BonusPoint in HR Core)

## Deferred Scope

- Performance analytics/dashboards, calibration sessions, performance improvement plans (PIP), competency frameworks, succession planning, 9-box grid

## Proposed Entities

### `review_period` — name, startDate, endDate, orgId
### `objective_template` — title, description, defaultKRs (jsonb), durationDays, orgId
### `employee_objective` — employeeId, templateId, title, description, startDate, endDate, status, progressPercent
### `employee_key_result` — objectiveId, title, progressType (percentage/number/currency), startValue, currentValue, targetValue, status, progressPercent
### `question_template` — title, orgId
### `question` — templateId, text, type (text/rating/boolean/multi_choice/likert), options (jsonb)
### `feedback_cycle` — title, employeeId, managerId, colleagueIds, subordinateIds, templateId, startDate, endDate, status, isCyclic, cycleIntervalDays
### `feedback_response` — feedbackCycleId, respondentId, questionId, answer (jsonb)
### `anonymous_feedback` — subject, basedOn (general/employee/department), employeeId/departmentId, description, status
### `meeting` — title, dateTime, employeeIds, managerIds, templateId, notes
### `meeting_response` — meetingId, employeeId, questionId, answer (jsonb)

## Proposed UI Routes

### `/app/performance` — Dashboard (my objectives with progress, upcoming reviews)
### `/app/performance/objectives` — All objectives list
### `/app/performance/objectives/$id` — Objective detail with KR progress
### `/app/performance/feedback` — Feedback cycles list
### `/app/performance/feedback/$id` — Feedback form / response view
### `/app/performance/settings` — Periods, templates, bonus rules

**Primitives**: DataTable, StatusBadge, PageHeader, EmptyState, EntitySheet

## RBAC

Uses existing: `appraisal:create/read/submit/review/finalize/manage`, `goal:create/read/update/complete`.

## Staff-Friendly UX

### Employee-friendly review experience
- "My Goals" — simple card grid with progress bars, click to update current value
- Goal progress: slider or number input, not complex form
- Feedback form: one question at a time (wizard-style), not all 20 at once
- "You have 3 pending feedback requests — due Friday" notification
- Self-review: guided prompts ("What did you accomplish?", "What challenges did you face?")

### Manager-friendly
- Team goals dashboard: see all direct reports' progress at a glance
- One-click review scheduling
- Review form pre-populated with employee's goal progress
- "Complete review" checklist: self-review done ✓, manager review done ✓, peer feedback received ✓

### Confusion prevention
- "Objective" vs "Key Result" — tooltip: "An Objective is what you want to achieve. Key Results are how you measure success."
- "On Track" vs "Behind" — auto-calculated from progress vs time elapsed
- Review cycle status — visual progress (3 of 5 feedback received)

## Risks and Edge Cases

1. Review fatigue — too many feedback requests. Limit per cycle.
2. Anonymous feedback abuse — moderation needed for inappropriate content.
3. Goal cascade — manager's goals should align with team goals. No enforcement in v1.
4. Rating bias — 360 feedback from 1 person skews results. Show sample size.

## Implementation Readiness

**Ready after HR Core**. Standalone from payroll/attendance/leave. Can be built independently.
