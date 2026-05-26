# Offboarding — Horilla Extraction

## Overview

Horilla's Offboarding module manages employee exits: resignation requests, notice periods, offboarding pipelines with stages (Exit Interview → Work Handover → FnF → Farewell → Archived), clearance tasks per stage, and exit reasons. It integrates with Payroll for final settlement (notice period from PayrollGeneralSetting).

## Horilla Files Inspected

- `offboarding/models.py` (350 lines) — Offboarding, OffboardingStage, OffboardingTask, OffboardingEmployee, EmployeeTask, ResignationLetter, ExitReason, OffboardingNote
- OpenHRMS: `hr_resignation/`

## Important Models

**Offboarding** — Container for an offboarding process. Fields: title, description, managers M2M, status (ongoing/completed), company FK. Auto-creates 5 default stages on creation: Notice Period, Exit Interview, Work Handover, FnF (Final Settlement), Farewell, Archived.

**OffboardingStage** — Pipeline stage. Fields: title, type (notice_period/fnf/other/interview/handover/archived), offboarding FK, managers M2M, sequence.

**OffboardingEmployee** — Employee being offboarded. OneToOne to Employee. Fields: stage FK, notice_period (int), unit (day/month), notice_period_starts, notice_period_ends.

**ResignationLetter** — Self-service resignation. Fields: employee FK, title, description, planned_to_leave_on, status (requested/approved/rejected), offboarding_employee FK. On approval, creates OffboardingEmployee and starts pipeline.

**OffboardingTask** — Task templates per stage. Fields: title, managers M2M, stage FK.

**EmployeeTask** — Per-employee task instance. Fields: employee (OffboardingEmployee FK), status (todo/in_progress/stuck/completed), task FK, description. Sends notification on creation.

**ExitReason** — Exit interview data. Fields: title, description, offboarding_employee FK, attachments M2M.

## State Machine / Lifecycle

**ResignationLetter**: Requested → Approved | Rejected. Approval triggers offboarding pipeline creation.

**OffboardingEmployee**: Moves through stages — Notice Period → Exit Interview → Work Handover → FnF → Farewell → Archived.

**EmployeeTask**: Todo → In Progress → Stuck | Completed.

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/offboarding` — Active offboarding pipelines
- `/app/offboarding/$employeeId` — Individual offboarding progress
- `/app/offboarding/resignations` — Resignation request queue

### View Modes
- **Kanban**: Stages as columns, employees as cards with task completion
- **Clearance checklist**: Per-employee task list
- **Timeline**: Gantt-style view of notice period + tasks

### Staff-Friendly UX Notes
- Employee self-service: Submit resignation → see notice period → track own clearance tasks
- HR dashboard: Upcoming exits, pending resignations, overdue clearance tasks
- "Final settlement blocked" reasons: outstanding loans, unreturned assets, incomplete handover
- Exit interview form with structured questions + free text

## Proposed Drizzle Entities

- `resignation_request` — employeeId FK, title, description, plannedLeaveDate, status, approvedBy FK
- `offboarding_pipeline` — organizationId, title, description, managerId M2M
- `offboarding_stage` — pipelineId FK, title, type (enum), sequence
- `offboarding_employee` — employeeId FK, pipelineId FK, stageId FK, noticePeriodDays, noticeStartDate, noticeEndDate
- `offboarding_task_instance` — offboardingEmployeeId FK, title, assigneeId FK, status, completedAt
- `exit_interview` — offboardingEmployeeId FK, responses (JSON), notes, attachments

## Priority

**P2** — Needed when employees leave. Integrates with payroll for final settlement.
