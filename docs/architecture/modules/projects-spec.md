# Projects Module Specification

## Purpose

Basic project and task management with kanban stages, task assignment, and timesheet tracking. Provides workforce project visibility and integrates with PMS bonus points.

## Source References

- `docs/horilla-extraction/projects.md` — Horilla extraction

## Dependencies

- **HR Core** (P0) — employee_profile

## First Version Scope

- Project CRUD (title, managers, members, status, dates, description)
- Project stages (kanban columns, configurable per project)
- Task CRUD (title, stage, managers, members, status, dates)
- Drag-and-drop kanban for tasks
- Timesheet entries (employee, project, task, date, hours spent, description)
- Task assignment

## Deferred Scope

- Gantt/timeline view, task dependencies, resource/workload planning, project templates, budget tracking

## Proposed Entities

### `project` — title, status (new/in_progress/completed/on_hold/cancelled), startDate, endDate, description, managerIds (jsonb), memberIds (jsonb)
### `project_stage` — projectId, title, sequence, isEndStage
### `task` — projectId, stageId, title, description, status, startDate, endDate, managerIds, memberIds, sequence
### `timesheet_entry` — projectId, taskId, employeeId, date, minutesSpent, description

## Proposed UI Routes

### `/app/projects` — Project list (card grid)
### `/app/projects/$id` — Task kanban with stages
### `/app/projects/timesheets` — Timesheet log table

**Primitives**: DataTable, PageHeader, StatusBadge, ActionMenu, EmptyState

## RBAC

Project managers: full CRUD. Members: view + update own tasks. HR: view all.

## Implementation Readiness

**Ready after HR Core**. Standalone. Many orgs may use external tools (Jira/Linear) instead.
