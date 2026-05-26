# Performance / PMS — Horilla Extraction

## Overview

Horilla's PMS (Performance Management System) implements an OKR framework (Objectives and Key Results) with 360-degree feedback, question templates, bonus points, meetings, and anonymous feedback. Managers set objectives → employees get assigned → track key results with measurable targets → collect feedback from managers/colleagues/subordinates.

## Horilla Files Inspected

- `pms/models.py` (1054 lines) — Period, KeyResult, Objective, EmployeeObjective, Comment, EmployeeKeyResult, QuestionTemplate, Question, QuestionOptions, Feedback, AnonymousFeedback, Answer, KeyResultFeedback, Meetings, MeetingsAnswer, EmployeeBonusPoint, BonusPointSetting

## Important Models

**Period** — Review period. Fields: period_name (unique), start_date, end_date, company M2M.

**Objective** — Goal template. Fields: title, description, managers M2M, assignees M2M, key_result_id M2M (default KRs), duration_unit (days/months/years), duration, add_assignees (bool), self_employee_progress_update.

**EmployeeObjective** — Individual employee's objective instance. Fields: objective (title), objective_description, objective_id FK (template), employee FK, key_result_id M2M, start_date, end_date (auto-calculated from objective duration), status (On Track/Behind/Closed/At Risk/Not Started), progress_percentage (auto-calculated from KR progress). Unique: employee + objective.

**KeyResult** — Measurable result template. Fields: title, description, progress_type (%/#/currency), target_value (default 100), duration (days).

**EmployeeKeyResult** — Individual KR instance. Fields: key_result (title), employee_objective FK, key_result_id FK (template), progress_type, status, start_value, current_value, target_value, start_date, end_date, progress_percentage. Progress = (current_value / target_value) * 100. Updates parent objective's progress on save.

**Feedback** — 360-degree feedback cycle. Fields: review_cycle (title), manager FK, employee FK, colleague M2M, subordinate M2M, others M2M, question_template FK, status, start_date, end_date, employee_key_results M2M, cyclic_feedback (bool), cyclic_feedback_days_count, cyclic_feedback_period. Supports recurring feedback cycles.

**Question** — Feedback questions. Types: Text, Rating, Boolean, Multi-choices, Likert. Linked to templates.

**BonusPointSetting** — Auto-award bonus points for completing objectives/KRs/tasks/projects. Configurable conditions (completion date vs end date).

**Meetings** — Manager-employee meetings with optional question template for structured responses.

## State Machine / Lifecycle

**EmployeeObjective/EmployeeKeyResult status**: Not Started → On Track → Behind | At Risk → Closed

**Feedback status**: Not Started → On Track → Behind | At Risk → Closed

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/performance` — Performance dashboard (current cycle objectives)
- `/app/performance/objectives` — All objectives list
- `/app/performance/objectives/$id` — Objective detail with KRs
- `/app/performance/feedback` — Feedback cycles
- `/app/performance/feedback/$id` — Feedback form / responses
- `/app/performance/settings` — Periods, question templates, bonus settings

### View Modes
- **Objective tracker**: Card grid showing each objective with progress bar
- **KR detail**: Table of key results with progress indicators
- **Feedback form**: Dynamic form based on question template
- **360 view**: Spider/radar chart showing feedback from all sources
- **Review timeline**: Chronological view of all reviews for an employee

### Staff-Friendly UX Notes
- Employee view: "My Goals" with progress bars, "My Reviews" with status
- Manager view: Team goals summary, pending feedback to give, review deadlines
- Simple goal progress: slider or number input to update current_value
- Feedback reminders: "You have 3 pending feedback requests due by Friday"

## Proposed Drizzle Entities

- `review_period` — organizationId, name, startDate, endDate
- `objective_template` — organizationId, title, description, defaultKRs (JSON), durationDays
- `employee_objective` — employeeId FK, templateId FK, title, description, startDate, endDate, status, progressPercent
- `employee_key_result` — objectiveId FK, title, progressType, startValue, currentValue, targetValue, startDate, endDate, status, progressPercent
- `feedback_cycle` — organizationId, title, employeeId FK, managerId FK, templateId FK, startDate, endDate, status, isCyclic, cycleIntervalDays
- `feedback_response` — feedbackCycleId FK, respondentId FK, questionId FK, answer (JSON)

## Priority

**P3** — Growth feature. Not needed for daily operations but valuable for employee development.
