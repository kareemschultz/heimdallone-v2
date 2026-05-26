# Projects — Horilla Extraction

## Overview

Horilla's Project module provides basic project and task management with stage-based kanban, task assignment, timesheets, and integration with the PMS bonus point system. Projects have managers/members, tasks have managers/members, and timesheets track hours spent per employee per task.

## Horilla Files Inspected

- `project/models.py` (646 lines) — Project, ProjectStage, Task, TimeSheet

## Important Models

**Project** — Fields: title (unique), managers M2M, members M2M, status (new/in_progress/completed/on_hold/cancelled/expired), start_date, end_date, document (file), description, company FK. Auto-creates "Todo" stage on creation. Auto-expires if end_date < today.

**ProjectStage** — Kanban columns per project. Fields: title, project FK, sequence, is_end_stage (bool — only one per project). Unique: project + title.

**Task** — Work items. Fields: title, project FK, stage FK, task_managers M2M, task_members M2M, status (to_do/in_progress/completed/expired), start_date, end_date, document, description, sequence. End date must be within project date range. Unique: project + title.

**TimeSheet** — Hours tracking. Fields: project FK, task FK, employee FK, date, time_spent (HH:MM), status (in_progress/completed), description. Employee must be a member/manager of the task or project.

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/projects` — Project list
- `/app/projects/$id` — Project detail with task kanban
- `/app/projects/$id/tasks` — Task list view
- `/app/projects/timesheets` — Timesheet log

### View Modes
- **Project list**: Card grid with status, member count, task count, progress
- **Task kanban**: Drag-and-drop by stage
- **Task table**: Sortable/filterable list
- **Gantt/timeline**: Visual timeline if tasks have dates (future enhancement)
- **Timesheet table**: Employee hours by project/task/date

## Proposed Drizzle Entities

- `project` — organizationId, title, description, status, startDate, endDate, documentUrl, managerIds (JSON), memberIds (JSON)
- `project_stage` — projectId FK, title, sequence, isEndStage
- `task` — projectId FK, stageId FK, title, description, status, startDate, endDate, sequence, managerIds (JSON), memberIds (JSON)
- `timesheet_entry` — projectId FK, taskId FK, employeeId FK, date, minutesSpent, description, status

## Priority

**P3** — Useful for workforce project tracking but not core HR. Many orgs use external project tools (Jira, Linear, etc.).
