# Onboarding Module Specification

## Purpose

Stage-based task checklist system for transitioning hired candidates into active employees. Tracks completion of orientation tasks, document collection, equipment setup, and training across multiple stages with assignable task owners.

## Source References

- `docs/horilla-extraction/onboarding.md` — Horilla extraction

## Dependencies

- **HR Core** (P0) — employee_profile (conversion target)
- **Recruitment** (P2) — candidates flow from hiring pipeline

## First Version Scope

- Onboarding templates (reusable stage + task definitions)
- Onboarding instances per candidate/new employee
- Task assignment with owners and due dates
- Task status tracking (todo/in_progress/stuck/done)
- Progress tracking (X/Y tasks completed)
- Candidate-to-employee conversion trigger on final stage completion

## Deferred Scope

- Onboarding portal (self-service for new hires)
- Gantt/timeline view with task dependencies
- Automated task assignment based on department/position
- Document request integration (auto-request required docs)
- Welcome email automation

## Proposed Entities

### `onboarding_template` — Reusable plan with stages/tasks
### `onboarding_instance` — Active onboarding for a candidate, links to template
### `onboarding_task_instance` — Individual task with assignee, status, due date

## Proposed UI Routes

### `/app/onboarding` — Kanban view (stages as columns, candidates as cards with progress bar)
### `/app/onboarding/$candidateId` — Task checklist view

**Primitives**: PageHeader, StatusBadge (task status), EmptyState, EntitySheet (task detail)

## RBAC

HR admin: full management. Manager: view assigned tasks. Employee (new hire): view own tasks.

## Staff-Friendly UX

- Progress bar on each candidate card: "4/7 tasks completed"
- Task managers get notifications when assigned
- "Onboarding complete — Create employee record" CTA on final stage
- Simple task toggle: click to mark done, no complex form

## Implementation Readiness

**Needs HR Core + Recruitment**. Can be implemented alongside or after recruitment.
