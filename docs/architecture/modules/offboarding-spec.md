# Offboarding Module Specification

## Purpose

Manages employee exits: resignation requests with approval, notice period tracking, offboarding pipeline with clearance stages (Exit Interview → Work Handover → Final Settlement → Farewell → Archived), per-stage tasks, and exit interview data collection.

## Source References

- `docs/horilla-extraction/offboarding.md` — Horilla extraction
- `docs/horilla-extraction/openhrms-comparison.md` — hr_resignation

## Dependencies

- **HR Core** (P0) — employee_profile
- **Payroll** (P1) — final settlement calculation
- **Assets** (P3) — asset return clearance

## First Version Scope

- Resignation request (employee self-service → HR approval)
- Notice period tracking (start/end dates)
- Offboarding pipeline with default stages
- Per-stage tasks with assignees and status
- Exit reason/interview data collection
- Employee deactivation on pipeline completion

## Deferred Scope

- Final settlement automation (payroll integration)
- Asset return checklist (asset module integration)
- Knowledge transfer tracking
- Clearance certificate generation
- Offboarding analytics (exit reasons, turnover)

## Proposed Entities

### `resignation_request` — Employee submits, HR approves/rejects, triggers offboarding
### `offboarding_pipeline` — Container with stages (auto-created defaults)
### `offboarding_stage` — Pipeline stage (notice_period/interview/handover/settlement/farewell/archived)
### `offboarding_employee` — Employee linked to pipeline with notice period dates
### `offboarding_task_instance` — Per-employee task with assignee and status
### `exit_interview` — Structured responses + notes

## Proposed UI Routes

### `/app/offboarding` — Pipeline kanban view
### `/app/offboarding/resignations` — Resignation request queue (ApprovalQueue pattern)
### `/app/offboarding/$employeeId` — Individual clearance progress

## Staff-Friendly UX

- Employee self-service resignation: "Submit Resignation" form with planned leave date
- HR sees resignation queue with approve/reject
- Clearance checklist — simple task toggles for each department
- "Final settlement blocked" reasons: outstanding loans, unreturned assets
- Exit interview structured form with predefined questions + free text

## Implementation Readiness

**Needs HR Core**. Payroll integration for final settlement is deferred. Asset integration for return tracking is deferred.
