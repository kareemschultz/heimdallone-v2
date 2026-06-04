# Projects + Tasks / Timelines — Implementation Plan (Phase 14A)

> **Status:** Phase 14A — research & spec only. No code, no schema, no migrations, no
> routes in this phase. This document is the contract for 14B+.
>
> **Central guardrail (user directive):** Projects is the **coordination layer**, not a
> duplicate of Helpdesk, CRM, Payroll, or Assets. It **links** those modules and later
> supports **costing/reporting**, but it never takes over their business rules. This
> mirrors the Helpdesk discipline exactly: read-only nullable cross-module FKs
> (`ON DELETE SET NULL`) + a generic `linkedEntityType/Id` escape hatch, **zero writes**
> to any other module's tables, money finance-redacted server-side.

Suite group: **Operations** (alongside Assets ✅ and Helpdesk ✅ — the neighbours it
links to). Roadmap position: **Phase 14**, between Helpdesk (13 ✅) and Performance (15).

---

## 1. Research summary

### 1.1 What the benchmarks teach us

**ERP-integrated (Odoo · ERPNext · Zoho Projects · MS Dynamics/Project).** These prove
the thesis that matters for Heimdallone: a project is the spine that ties *people →
tasks → time → cost → invoice*. Odoo Project + Timesheets + Planning shows timesheets
feeding analytic cost lines and (with Sales) invoicing; ERPNext Projects ties Task →
Timesheet → (Sales Invoice) and exposes per-project costing/profitability; Zoho
Projects ties tasks → timesheets → budgets. **Take:** model the *links and the
timesheet*, reserve the costing/invoice seam — but do **not** build a costing engine or
invoicing in Phase 14 (that is Finance, Phase 16, reusing `payroll-engine`). **Leave:**
their heavy analytic-accounting, billing rules, and capacity/forecasting.

**Open-source (OpenProject · Redmine · Plane · Taiga · GitLab Boards).** OpenProject &
Redmine teach work-breakdown + a real Gantt with dependencies + milestones + per-project
membership/roles — powerful but heavy. Plane & Taiga teach a *lighter* modern take:
projects → cycles/sprints → issues with a clean board, states, and labels. GitLab
Issues/Boards teach the issue↔board↔milestone trio with minimal ceremony. **Take:** the
project/membership/milestone/task spine, simple status board, and a *simple* timeline.
**Leave (MVP):** dependency graphs / critical-path Gantt, sprints/cycles, sub-issues.

**Modern SaaS UX (Linear · Asana · ClickUp · Monday · Notion · Trello).** Linear teaches
ruthless speed + opinionated states + "My issues" + keyboard-first. Asana/ClickUp/Monday
teach multi-view (list ↔ board ↔ calendar ↔ timeline) over one dataset and "My tasks".
Trello teaches the board as the whole product (too thin alone). Notion teaches flexible
properties (too flexible for an HRMS). **Take:** opinionated status set, list+board over
one task table, a first-class **My Tasks** + **My Time**, plain-language everything,
keyboard-accessible filters/board. **Leave:** infinite custom fields, automations,
multiple workspaces.

**Enterprise planning (Jira/JWM · MS Project · ServiceNow PPM).** Jira teaches
configurable workflows + JQL + portfolio; MS Project teaches the dependency/critical-path
Gantt; ServiceNow PPM teaches portfolio/demand. All are far too heavy for an SMB MVP.
**Take:** a clear (but fixed) status workflow and a *health* signal. **Leave:** workflow
configuration, portfolio/PPM, critical path.

**SMB/simple (Basecamp · Trello · Zoho · ClickUp-lite).** Basecamp teaches "a project is a
home for a small team's to-dos, schedule, and discussion" — exactly the right altitude
for a Guyana/Caribbean SMB. **Take:** simple setup, a to-do list, a schedule of dates, a
discussion thread per task, and "what needs attention." **Leave:** nothing heavier.

**Horilla / OpenHRMS (HR intersection only).** The existing extraction
(`docs/horilla-extraction/projects.md`, `modules/projects-spec.md`) gives the four-entity
spine — project / stage / task / timesheet — plus the rule that a **timesheet entry must
belong to a project/task member**, the stage-based kanban, and the "auto-award PMS bonus
points on on-time completion" idea (a Phase-15 seam, not built here). **Supersede:** its
`managerIds`/`memberIds` as **jsonb id-bags** — the house convention since Recruitment 9I
is real join tables + denormalised display names, which is what lateral-scope RBAC and
member-of validation require.

### 1.2 Which patterns fit Heimdallone

- **Project → members → milestones → tasks → timesheets** spine (ERPNext/Odoo/OpenProject ∩ Horilla).
- **List + Kanban board over one task table** (Linear/Asana/Plane). We already have a generic
  `KanbanBoard` primitive (`apps/web/src/components/kanban-board.tsx`).
- **First-class "My Tasks" + "My Time"** self-service (Linear/Asana), gated by the same
  self-scope the rest of the app uses (helpdesk `mine:true` precedent).
- **A "Needs attention" panel** on the overview (helpdesk precedent).
- **Plain-language labels, derived health/SLA-style state, finance-redacted money** (helpdesk/assets precedents).
- **Coordination links** to Assets + Helpdesk now, CRM/Finance/Performance seams reserved.

### 1.3 Too heavy for MVP (explicitly deferred)

Dependency graph + critical-path Gantt; sprints/cycles; configurable workflows;
portfolio/PPM; capacity/resource planning; budget forecasting; custom fields; automations;
sub-tasks; invoicing/billing; project templates; file attachments (no central file storage
exists yet).

### 1.4 What a Guyana/Caribbean SMB-friendly version looks like

A small ops/IT/HR team runs a handful of concurrent projects ("Main Office Network
Upgrade", "Vessel Crew WiFi Deployment", "Customer CPE Installation Batch"). They need:
create a project in <60s with a non-technical wizard; add a few team members; lay out a
few milestones (dates); break work into tasks; assign them; let staff update their own
task status and log time from a phone; see a simple board and a simple schedule; and see
"what's overdue / at risk." Costing ("how much labour did this project consume?") is a
*later* report, not a blocker. No Gantt, no sprints, no billing on day one.

### 1.5 Where Projects differs from Helpdesk tickets and CRM deals

| | **Helpdesk ticket** | **CRM deal** | **Project / Task** |
|---|---|---|---|
| Question it answers | "Someone needs help / something is broken" | "Will we win this customer's business?" | "How do we plan & deliver this body of work?" |
| Lifespan | short, reactive, one requester | sales-cycle, one customer/pipeline | weeks–months, a team, milestones |
| Primary actor | requester (employee) → agent | sales rep → manager | project lead + assigned team |
| Owns | SLA, internal notes, request routing | pipeline stage, deal value, win/loss | tasks, milestones, timesheets, schedule |
| Heimdallone status | ✅ shipped (Phase 13) | ⏳ Phase 17 (spec only) | **this module** |

A ticket can **spawn** a task (`task.linkedHelpdeskRequestId`); a deal can **hand off**
to a project (`project.linkedDealId`, soft ref). Neither relationship lets Projects mutate
the other module.

---

## 2. Domain boundaries

| Concept | Owned by | Projects' relationship |
|---|---|---|
| **Project** | **Projects** | owns |
| **Task** | **Projects** | owns |
| **Milestone** | **Projects** | owns |
| **Timeline / schedule view** | **Projects** | owns (derived from project/milestone/task dates) |
| **Timesheet / time entry** | **Projects** | owns the *record*; **reads** rate/attendance for costing |
| **Helpdesk ticket** | **Helpdesk** | link only (`task.linkedHelpdeskRequestId`, read-only); never mutated |
| **Asset assignment / custody** | **Assets** | link only (`task.linkedAssetId`, read-only); custody stays in `asset_assignment` |
| **CRM deal / customer** | **CRM (Ph17)** | soft link only (`project.linkedCustomerId/linkedDealId`); CRM owns the join table |
| **Finance invoice / costing** | **Finance (Ph16)** | reserve `budget` column + approved-time seam; no cost math in MVP |
| **Payroll calculation / rate** | **Payroll** (`contract` + `payroll-engine`) | **read-only** for future costing; never re-implement rate math |
| **Attendance record** | **Attendance** | **read-only** for the costing gate; never written |
| **Performance goal / bonus points** | **PMS (Ph15)** | expose task-completion signal; PMS owns the read link + award rule |
| **Audit trail** | shared `createAuditEvent` | call on every mutation; no Projects-local audit table |

**Hard rules (mirror Helpdesk):**
1. **No cross-module writes.** The Projects router never `insert`/`update`/`delete`s any
   table outside `project*`. Link ids are tenant-**verified** on write (SELECT-only) and
   resolved **read-only** on read.
2. **No duplicated business logic.** No ticket SLA, no deal pipeline, no payroll calc, no
   asset custody, no PMS award — Projects only references ids.
3. **Money is finance-redacted server-side** (`budget`, any future cost) — null it out for
   roles without `canViewProjectBudget`, return a `canViewBudget` flag (assets
   `purchaseCost` precedent).

---

## 3. Recommended MVP entities (decided)

Convention for every table (from `helpdesk.ts`/`assets.ts`): `id` = `cuid()`,
`organizationId` = `orgRef()` (cascade on org delete), `...timestamps`, then a separate
`deletedAt` for soft-delete; `pgEnum` for enums; FK `onDelete` = **restrict** (preserve
history, e.g. employee refs), **set null** (optional / cross-module links), **cascade**
(owned children); partial-unique indexes for one-active-per-org + reference uniqueness;
`PRJ-`/`TSK-` references allocated MAX+1 with a `(org,reference)` unique backstop.

### MVP tables (Phase 14B)

| # | Table | Purpose | Key columns (beyond id/org/timestamps/deletedAt) |
|---|---|---|---|
| 1 | **project** | the project | `reference` (PRJ-000NNN), `name`, `description`, `status` (enum), `health` (derived — not stored), `leadUserId → user` (set null), `startDate`, `dueDate`, `budget numeric` (finance-redacted), `linkedCustomerId text` (soft ref), `linkedDealId text` (soft ref), `isArchived` |
| 2 | **project_member** | team membership (supersedes jsonb) | `projectId → project` (cascade), `employeeId → employee_profile` (restrict), `role` enum (lead / member / viewer), unique `(project, employee)` |
| 3 | **project_milestone** | dated checkpoints | `projectId → project` (cascade), `name`, `description`, `status` (enum), `dueDate`, `completedAt` |
| 4 | **project_task** | the unit of work | `projectId → project` (cascade), `reference` (TSK-000NNN), `title`, `description`, `status` (enum), `priority` (enum), `assigneeEmployeeId → employee_profile` (restrict, nullable), `milestoneId → project_milestone` (set null), `createdByUserId → user` (set null), `dueDate`, `estimateMinutes int`, `completedAt`, `linkedAssetId → asset` (set null), `linkedHelpdeskRequestId → helpdesk_request` (set null), `linkedEntityType` enum + `linkedEntityId text` (no FK, generic) |
| 5 | **project_task_comment** | task discussion | `taskId → project_task` (cascade), `authorUserId → user` (set null), `body`, `isInternal boolean` (redacted server-side, like helpdesk) |
| 6 | **project_time_entry** | timesheet line (reporting-only in MVP) | `projectId → project` (cascade), `taskId → project_task` (set null), `employeeId → employee_profile` (restrict), `workDate date`, `minutes int`, `description`, `status` enum (draft / submitted / approved / rejected), `approvedByUserId → user` (set null), `approvedAt` |

**Activity feed (decision):** **reuse the shared `audit_event` log** (read-only, filtered
to the project's entity ids) for the "Activity" tab in MVP — **no dedicated
`project_activity` table**. Every mutation already calls `createAuditEvent`. A richer
dedicated feed is deferred until the audit read proves insufficient. (This keeps the MVP
schema to 6 tables instead of 7.)

### Deferred entities / columns (reserved, not built in 14B)

- `project_task_dependency` — blocks/blocked-by; **deferred** (no Gantt engine in MVP; the
  timeline is date-based, not dependency-based).
- `project_label` + `project_task_label` — **deferred** (status + priority + milestone are
  enough taxonomy for MVP).
- `project_status_history` / `project_task_status_history` — **deferred** (audit_event
  covers it; add only if a real status timeline is needed).
- `project_template` — **deferred**.
- Sprint/cycle/board-column tables — **deferred** (the board groups by the fixed task
  `status` enum, not by configurable columns).
- File attachments — **deferred** until central file storage exists (no upload anywhere in
  Heimdallone yet; precedent: assets `imageUrl` reserved, no UI).
- `budget`/cost — the **column ships** on `project` (nullable, finance-redacted) but **no
  cost computation** in MVP; the project-time → labour-cost report is **Phase 16 Finance**.

### Decided answers to "create all?" — **NO.** MVP = the 6 tables above; everything in the deferred list waits.

---

## 4. Lifecycles & enums

**Project status** (`project_status` enum): `planning` · `active` · `on_hold` ·
`completed` · `cancelled` · `archived`. (Plain labels: Planning / Active / On hold /
Completed / Cancelled / Archived. `archived` is reached via `isArchived` + status; archive
is a soft, reversible end-state.)

**Project health** (`project_health` — **DERIVED at read time, not stored**, like
helpdesk SLA): `on_track` · `at_risk` · `off_track` · `completed` · `no_data`. Computed
from: due dates vs now, % milestones/tasks complete, overdue task count. (Never persisted —
a stored value goes stale.)

**Task status** (`task_status` enum): `todo` · `in_progress` · `blocked` · `in_review` ·
`done` · `cancelled`. Board columns = these (minus `cancelled`, shown via a filter). Plain
labels: To do / In progress / Blocked / In review / Done / Cancelled.

**Task priority** (`task_priority` enum): `low` · `normal` · `high` · `urgent` (reuse the
helpdesk priority shape/tones for consistency).

**Milestone status** (`milestone_status` enum): `planned` · `in_progress` · `at_risk` ·
`completed` · `missed` · `cancelled`. (`at_risk`/`missed` may be derived hints, but a
stored status is fine here since milestones are explicitly managed.)

**Time-entry status** (`time_entry_status` enum): `draft` · `submitted` · `approved` ·
`rejected`.

**Transition rules (mirror helpdesk's dedicated procs + guards):** dedicated
`changeStatus`/`complete`/`archive` procs; terminal states (`completed`/`cancelled`/
`archived` for projects; `done`/`cancelled` for tasks; `approved`/`rejected` for time)
reject further working-state transitions; reopen is explicit. The server is the boundary;
the UI only hides invalid transitions.

---

## 5. Views

**Module-level tabs** (`ProjectsTabs`, per-module component — there is no shared
ModuleTabs; copy the `assets-tabs.tsx`/`helpdesk-tabs.tsx` recipe):
Overview · Projects · My Tasks · Time · *(Calendar/Timeline)* · *(Reports — later)* ·
*(Settings — later)*.

**MVP module views:**
- **Overview** (`/app/projects`) — status tiles (active / on-hold / overdue / at-risk
  counts) + a "Needs attention" panel (overdue tasks, at-risk milestones, unassigned tasks,
  blocked tasks) + quick links. Employee → a landing that **links** to My Tasks (NOT a
  render-time redirect — lesson #84).
- **Projects list** (`/app/projects/all`) — filterable table (status / health / lead /
  search), plain-language columns, `Linked` chip when cross-module links present.
- **Project detail** (`/app/projects/$id`) with tabs: **Summary · Tasks · Board ·
  Milestones · Time · People · Activity** (Files later).
- **Task list + Kanban board** — list view + the existing `KanbanBoard` grouped by task
  status (drag to change status; `canMove` guard server-enforced).
- **My Tasks** (`/app/projects/my-tasks`) — the caller's assigned tasks across all
  projects (self-scoped, `mine`-style), plain-language status.
- **My Time** (`/app/projects/my-time`) — the caller's time entries + a simple log form +
  submit-for-approval.

**Deferred views:** full Gantt; team workload/capacity; reports/analytics; settings.
**Timeline/calendar** ships **simple first** (milestone/date cards on a horizontal date
axis), **not** a dependency Gantt — see §9.

Project-detail tabs use the same per-module tabs pattern, scoped to the `$id`.

---

## 6. RBAC model

### New role decision: **add `project_manager` in 14B.** ✅
A dedicated `project_manager` does **not** exist today (9 roles confirmed). Adding it now is
cheap (the AC pattern is mechanical) and future-proofs the module; the alternative
(overloading `manager`/`admin`) muddies the People&Payroll `manager` semantics. **Decision:
add `project_manager` to `permissions.ts` `roles` in 14B**, granted full project/task
control + time approval, scoped server-side to projects they lead/are a member of.

### AC resources to add (to `statement` in `permissions.ts`)
```
project:    ["create", "read", "update", "archive", "manage"]
task:       ["create", "read", "update", "assign", "complete", "manage"]
time_entry: ["create", "read", "submit", "approve"]
```

### Per-role grants

| Role | project | task | time_entry |
|---|---|---|---|
| tenant_owner / tenant_admin | full | full | full |
| hr_admin | full | full | read, approve |
| **project_manager** (NEW) | full (scoped to own projects) | full (scoped) | read, approve |
| manager | read (own + reports) | read, update, assign, complete (scoped) | read, approve |
| employee | read (member projects) | read, update, complete (own tasks) | create, read, submit |
| payroll_admin | read | read | read, approve |
| auditor | read | read | read |
| recruiter | — | — | — |
| helpdesk_agent | — (read later, to view a ticket's linked task) | — | — |

### Frontend/backend helper block (byte-aligned `role-helpers.ts` ↔ `rbac.ts`)
```
canViewProjects        = canManageProjects ∪ manager ∪ payroll_admin ∪ auditor
canManageProjects      = canManageHR ∪ project_manager
canCreateProject       = canManageProjects
canEditProject         = canManageProjects        (handler adds: project lead / member scope)
canArchiveProject      = canManageProjects
canAssignProjectTasks  = canManageProjects ∪ manager
canManageProjectMembers= canManageProjects
canTrackProjectTime    = canManageProjects ∪ manager ∪ employee   (self-service log)
canApproveProjectTime  = canManageProjects ∪ manager
canViewProjectCosts    = canManageProjects ∪ payroll_admin ∪ auditor   (finance-redaction gate)
canViewProjectInternalNotes = canManageProjects ∪ auditor              (task internal notes)
```

### Two-layer authz (mirror helpdesk)
1. **AC gate** — `authorizedProcedure("project"|"task"|"time_entry", action)`.
2. **Handler scope (IDOR layer)** — `seesAllProjects(role)` (= canManageProjects ∪ auditor ∪
   payroll_admin) sees all; a **project member** sees their projects; a **manager** sees
   own + direct-report-assigned (via `getDirectReportIds(me.id, oid)` — always pass `oid`,
   per 13H); an **employee** sees projects they are a member of / tasks assigned to them /
   their own time entries. Single-row reads call `assertProjectVisible` / `assertTaskVisible`.
3. **Finance redaction** — `budget`/cost nulled for `!canViewProjectCosts`, with a flag.
4. **Internal-note redaction** — task comments `isInternal` filtered server-side unless
   `canViewProjectInternalNotes`.

**Audit delta:** `audit:permissions` counts distinct `(resource,action)` pairs + routers.
Projects adds 1 router + the project/task/time_entry pairs the router uses → **93/13 →
~106/14** (exact = distinct pairs referenced). Adding the `project_manager` role does **not**
change the audit count. Define all actions in `statement` before writing the router.

---

## 7. API plan (oRPC router `projects`, Phase 14C)

Every input id is **tenant-verified** (`verifyProject`/`verifyTask`/`verifyMilestone`/
`verifyMember` — SELECT … WHERE id AND organizationId AND deletedAt IS NULL). Every list/
single-read applies lateral scope. Cross-module link ids are verified SELECT-only on write
and never mutated. References (`PRJ-`/`TSK-`) allocated MAX+1 with the 23505 retry loop +
`(org,reference)` partial-unique backstop.

```
projects.list                 (project:read)   scoped: all / member / manager-reports / self
projects.getById              (project:read)   assertProjectVisible; budget redacted; returns canViewBudget flag
projects.create               (project:create)
projects.update               (project:update) + lead/member scope; blocked when terminal
projects.archive              (project:archive)
projects.members.list         (project:read)
projects.members.add          (project:manage)  verifyEmployeeInOrg
projects.members.remove       (project:manage)
milestones.list               (project:read)
milestones.create             (project:update)
milestones.update             (project:update)
milestones.complete           (project:update)
tasks.list                    (task:read)       scoped; filters status/priority/assignee/milestone; `mine`/`assignedToMe`
tasks.getById                 (task:read)       assertTaskVisible; internal comments redacted
tasks.create                  (task:create)     project member / canManageProjects
tasks.update                  (task:update)
tasks.changeStatus            (task:update)     working-state machine; employee may change OWN assigned task status
tasks.assign                  (task:assign)
tasks.unassign                (task:assign)
tasks.complete                (task:complete)
tasks.comments.list           (task:read)       internal-note redaction (server-side)
tasks.comments.create         (task:create)     public; createInternal (task:update) for internal notes
timeEntries.list              (time_entry:read) scoped; `mine`
timeEntries.create            (time_entry:create)  requester = caller's own employee
timeEntries.update            (time_entry:create)  own draft only
timeEntries.submit            (time_entry:submit)  draft → submitted
timeEntries.approve           (time_entry:approve) submitted → approved (manager/PM scope)
timeEntries.reject            (time_entry:approve) submitted → rejected (reason required)
```

**Self-service guarantees (employee):** `tasks.list`/`timeEntries.list` honour a `mine`
flag forcing self-scope for any role (helpdesk `mine:true` precedent); an employee may
`changeStatus`/`complete` only a task **assigned to them** and may `create`/`submit` only
their **own** time entries. Approval requires `canApproveProjectTime`; reject requires a
reason (helpdesk reject precedent). Members add/remove and project edit are
`canManageProjects` + handler lead/member scope.

---

## 8. UI plan (Phase 14D–14H)

**Routes (folder-routes from day one — never a flat `app/projects.tsx` stub; route-shadow
gotcha):**
```
/app/projects                      overview (index.tsx)
/app/projects/all                  projects list
/app/projects/$id                  project detail (tabs)
/app/projects/$id/tasks            tasks list + board
/app/projects/$id/timeline         milestone/date timeline (simple)
/app/projects/$id/time             project time entries
/app/projects/my-tasks             My Tasks (self-scoped)
/app/projects/my-time              My Time (self-scoped)
```
*(Reports / Settings routes — later phases.)*

**Sidebar:** add a "Projects" nav item (lucide `FolderKanban` or `KanbanSquare`) to the
**Operate** group in `routes/app/route.tsx`; add `projects` to the per-role visible-key
sets (employee/manager get it; recruiter does not; owner/admin/payroll fall through to
see-all). **Budget for lesson #83** — editing `route.tsx` trips pre-existing a11y/lint
debt the pre-commit hook blocks on; clear it in the same checkpoint or defer the entry to a
hardening sub-phase (assets 12D→12E precedent).

**Project-detail tabs:** Summary · Tasks · Board · Milestones · Time · People · Activity
(Files later).

**Primitive reuse (from the UI audit):**
- **`KanbanBoard`** (`apps/web/src/components/kanban-board.tsx`) — reuse for the task board;
  **add a `KeyboardSensor`** (it is currently PointerSensor-only — a11y gap, lesson #86's
  cousin) before shipping.
- **`DataTable`** (`packages/ui`) for the list views; **`EmptyState`**, **`Badge`/StatusBadge**,
  **`ConfirmDialog`/`Sheet`** as elsewhere.
- **`TaskChecklist`** (onboarding) is a strong *template* but onboarding-coupled — copy &
  genericise, don't import.
- **Calendar/Timeline is greenfield** — start with a simple horizontal date axis of
  milestone/task cards (see §9); a real Gantt/library wrap is a later phase.
- New `apps/web/src/styles/projects.css` + `features/projects/{labels,badge,projects-tabs,types}`.

---

## 9. UX requirements

- **Non-technical setup wizard** — "Create a project" in ≤60s: name, what it's for
  (description), optional dates, optional team — no jargon, no required taxonomy.
- **"What needs attention" panel** on the overview (overdue tasks / at-risk milestones /
  unassigned / blocked).
- **Plain-language labels everywhere** via `features/projects/labels.ts` (status/priority/
  health/milestone maps + accessors) — **no raw enum strings**; a separate requester-facing
  message map for employee surfaces (e.g. "You have 3 tasks due this week").
- **No internal IDs as primary text** — use `reference` (PRJ-/TSK-) or title; demote ids to
  small secondary text.
- **Loading / Empty / Error triad** on every list & detail (skeleton while loading; friendly
  error + retry; `EmptyState` only when loaded-and-empty — never as a loading substitute;
  the helpdesk 13H "error ≠ healthy empty desk" fix applies).
- **Mobile-friendly task updates** — large tap targets for status change + time log; My
  Tasks / My Time usable on a phone.
- **Keyboard-accessible filters/buttons**; **status badges carry text, never colour-only**;
  **`:focus-visible` rings** on every input/select/pill/tab that clears the default outline
  (lesson #86 — grep `outline: none` in `projects.css`); **`aria-labelledby` on every
  dialog** (lesson #75); accessible (labelled) filters.
- **List queries gated `enabled: canView…`** so non-permitted roles don't spam 403s.
- **KanbanBoard** with a **KeyboardSensor** (don't ship mouse-only).
- **Timeline simple first** — a date-ordered set of milestone/task cards, not a heavy Gantt
  dependency engine.

---

## 10. Integration plan (link, never own)

| Module | Link | MVP scope | Rule |
|---|---|---|---|
| **Helpdesk** | `task.linkedHelpdeskRequestId → helpdesk_request` (set null) | reserve column + read-only "linked ticket" chip on the task; helpdesk's enum already has `project_task` for the reverse | **no Helpdesk mutation**; deep-link only |
| **Assets** | `task.linkedAssetId → asset` (set null) | reserve column + read-only "linked asset" chip (asset *name* resolved read-only) | custody stays in `asset_assignment`; **no Assets mutation** |
| **Attendance / Timesheets** | `project_time_entry` is Projects-owned; reads `attendance_record.payrollStatus` for the *future* cost gate | record time entries; **do not** write/override attendance | **no attendance mutation** in MVP |
| **Payroll** | future cost report reads `contract` (wageType/baseSalary) + reuses `payroll-engine` | **none in MVP** (column `budget` reserved, finance-redacted) | **no payroll calc / mutation**; reuse engine, don't re-implement |
| **Finance** | project budget/cost/invoicing | **none in MVP**; the project-time → labour-cost report is **Phase 16** | no invoice creation |
| **CRM** | `project.linkedCustomerId` / `linkedDealId` — **soft `text` refs, NOT FKs** (crm_* tables don't exist yet) | reserve columns only | CRM (Ph17) owns `crm_customer_project_link` + back-fills `projectId`; **no deal/pipeline logic in Projects** |
| **Performance (PMS)** | task-completion signal | expose status + completedAt; **write nothing to PMS** | PMS (Ph15) adds the objective↔task read link + owns the bonus-point award |
| **Generic** | `task.linkedEntityType` enum + `linkedEntityId text` (no FK) | forward-compat escape hatch (mirror helpdesk) | context/deep-link only |

All real cross-module FKs are `ON DELETE SET NULL`; link ids are tenant-verified on write
(SELECT-only) and resolved read-only on read; the Projects router contains **zero writes**
to any non-`project*` table (enforced + verified, like helpdesk 13H).

---

## 11. Seed plan (Atlas Shipping, idempotent — Phase 14B)

Realistic ops/IT projects, mirroring the helpdesk/assets seed discipline (idempotent
delete-then-insert; references `PRJ-000001…`, `TSK-000001…`):

- **Projects (5):** "Main Office Network Upgrade" (active), "Vessel Crew WiFi Deployment"
  (active), "Payroll Rollout Project" (on_hold), "HR Document Digitization" (completed),
  "Customer CPE Installation Batch" (active, with a `linkedCustomerId`/`linkedDealId` soft
  ref placeholder for the future CRM handoff).
- **Members:** each project has a lead (e.g. Andre Sealey / Marcus James) + 2–3 members
  drawn from seeded employees (Rohan Gopaul, Dwayne Wilson, …).
- **Milestones:** 2–4 per active project across `planned`/`in_progress`/`completed`/(one
  `at_risk`/overdue).
- **Tasks (~25):** spread across all statuses (todo / in_progress / blocked / in_review /
  done / one cancelled) and priorities (incl. one urgent + overdue); ~1 task with
  `linkedAssetId` (an actual seeded asset) and ~1 with `linkedHelpdeskRequestId` (a seeded
  ticket) to exercise the coordination links read-only.
- **Comments:** a few public + at least one `isInternal` (to prove redaction).
- **Time entries:** several across `draft`/`submitted`/`approved`/(one `rejected`), tied to
  real tasks/employees with `workDate`/`minutes`.
- **Activity:** none seeded — the Activity tab reads `audit_event` (the seed's inserts
  won't generate audit events, so the tab is documented as "fills as work happens").

Seed must pass an idempotent re-run check and an invariant check (one lead per project,
references unique per org, no orphaned links).

---

## 12. Implementation sequence

| Phase | Deliverable | Gate focus |
|---|---|---|
| **14A** | This research + spec (`projects-tasks-implementation-plan.md`) | docs only; gates unchanged |
| **14B** | DB schema (6 tables + enums) + migration `0017` + `project_manager` role + AC resources + idempotent seed | migration applies clean; seed idempotent; audit reflects new pairs once router lands |
| **14C** | oRPC `projects` router (the §7 procs) + RBAC helpers (byte-aligned) + `verify-projects-api.ts` + two-layer authz + redaction + reference allocation | verify NN/NN; audit ~106/14; no cross-module writes |
| **14D** | Projects overview + list UI + `ProjectsTabs` + sidebar entry | browser RBAC; loading/empty/error; lesson #83 (route.tsx) |
| **14E** | Project detail + members + milestones tabs | scope/redaction in browser |
| **14F** | Task list + **Kanban board** (+ KeyboardSensor) + task detail + comments (internal redaction) | board a11y; redaction proof |
| **14G** | My Tasks + My Time + timesheet submit/approve/reject flow | self-scope proof; approval scope |
| **14H** | Simple project timeline/calendar + Activity tab (audit-backed) | timeline simple-first; no Gantt |
| **14I** | QA/RBAC/security/browser pass (4 read-only review agents) → close Phase 14 | guardrail held; IDOR/redaction re-proven; gates |

(Costing/profitability report = **Phase 16 Finance**; CRM handoff wiring = **Phase 17**;
PMS task→objective link = **Phase 15** — all out of scope here.)

---

## 13. Open questions to resolve before 14B

| # | Question | **Recommendation** |
|---|---|---|
| 1 | Add a `project_manager` role now? | **Yes — add in 14B.** Cheap, future-proofs, keeps `manager` semantics clean. |
| 2 | Internal-only first, or include customer/client fields now? | **Internal-only for delivery; reserve `linkedCustomerId`/`linkedDealId` as soft text refs** (no CRM tables yet). No customer UI in MVP. |
| 3 | Time entries payroll-affecting now or reporting-only? | **Reporting-only.** They record labour; the cost report (× rate from `contract`, reusing `payroll-engine`, gated on approved attendance) is **Phase 16**. Projects never writes attendance/payroll. |
| 4 | Task dependencies in MVP? | **No.** Timeline is date-based; dependency graph/Gantt deferred. |
| 5 | Milestones: separate table or fields on project/task? | **Separate `project_milestone` table.** Cleaner; tasks reference `milestoneId` (set null). |
| 6 | Budget/cost now or later? | **Reserve a `budget` column (nullable, finance-redacted) now; no cost computation.** Cost report = Phase 16. |
| 7 | Employees create tasks, or only update assigned? | **Update/complete own assigned tasks + log own time in MVP; task *creation* is `canManageProjects`/manager.** (Self-created subtasks can come later.) |
| 8 | Helpdesk tickets linkable to projects in Phase 14 or later? | **Reserve `task.linkedHelpdeskRequestId` now + a read-only chip; full bidirectional UI polish later.** (Helpdesk's enum already has `project_task`.) |
| 9 | Project files/attachments? | **Wait for central file storage.** Reserve nothing beyond a future column; no upload UI (assets `imageUrl` precedent). |
| 10 | Calendar/timeline: simple cards or full Gantt? | **Simple date-ordered milestone/task cards first.** A library-backed Gantt is a later phase. |

These are recommendations baked into the plan; 14B proceeds on them unless overridden.

---

## 14. Roadmap update (suite groupings unchanged)

| Phase | Module | Status |
|---|---|---|
| 12 | Assets | ✅ complete |
| 13 | Helpdesk / Requests | ✅ complete (`b6384bb`) |
| **14** | **Projects + Tasks / Timelines** | **active — 14A spec (this doc)** |
| 15 | Performance / PMS | next |
| 16 | Finance expansion (incl. project/department costing) | queued |
| 17 | CRM (Leads/Customers/Deals → **project handoff**) | queued (spec drafted) |
| 18 | Analytics / executive dashboards | queued |
| 19 | Enterprise QA / accessibility / security | queued |
| 20 | Production readiness | queued |

**Five suite groups (unchanged):** People & Payroll · **Operations** (Assets · Helpdesk ·
**Projects/Tasks/Timesheets** · Field work) · Finance · CRM · Admin & Compliance. Future
modules stay hidden/queued in the sidebar until their phase begins. **CRM / Finance /
Inventory / Billing are NOT implemented now.**

---

**Next phase: Phase 14B — Projects DB schema (6 tables + enums) + migration `0017` +
`project_manager` role + AC resources + idempotent Atlas Shipping seed.**
