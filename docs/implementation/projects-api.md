# Projects API — Phase 14C

oRPC router `projects` (`packages/api/src/routers/projects.ts`), registered in
`packages/api/src/routers/index.ts` as `projects`. Built on the 14B schema
(`packages/db/src/schema/projects.ts`, migration `0017`). Mirrors the Helpdesk
13C discipline exactly.

## Central guardrail — coordination layer, link never own

Projects **links** to Assets / Helpdesk / CRM / Payroll / Attendance for context
and **never** mutates them. Enforced in code:

- **Zero cross-module writes.** There is no `insert`/`update`/`delete` to
  `asset` / `helpdesk_request` / payroll / attendance anywhere in the router.
  Cross-module link ids (`task.linkedAssetId` → asset,
  `task.linkedHelpdeskRequestId` → helpdesk_request) are **tenant-verified on
  write (SELECT-only)** via `verifyTaskLinks` and **resolved read-only on read**
  in `tasks.getById` (only the asset *name* / ticket *reference* is read back;
  the rest are typed deep-link refs the UI resolves in its own panel).
  Verified: `linkedAssetId` is intact after task mutations.
- **CRM links are soft text refs** (`project.linkedCustomerId` /
  `linkedDealId`) — no FK, no verification target (crm_* is Phase 17). Stored as
  given.
- **Budget is finance-redacted server-side.** `budget` is nulled for callers
  without `canViewProjectCosts`; `getById` returns a `canViewBudget` flag.
- **The project `internalNote` is redacted server-side** (`redactProject` →
  `redactInternalNote`) for callers without `canViewProjectInternalNotes`, in
  both `list` and `getById` — UI hiding alone is not sufficient (added in 14E).
- **Task internal-note comments (`isInternal`) are redacted server-side** in
  every read unless `canViewProjectInternalNotes`. `createInternal` re-checks the
  same gate in the handler (AC alone is insufficient — employees hold
  `task:update`).
- **Project health is DERIVED at read time** (`computeProjectHealth`) — never
  stored (a persisted value goes stale, like the helpdesk SLA state).
- **Time entries are reporting-only** — they never touch Attendance or Payroll.

## RBAC (two-layer authz)

1. **AC gate** — `authorizedProcedure("project"|"task"|"time_entry", action)`
   against the 14B grants (the source of truth).
2. **Handler scope (IDOR layer)** — `seesAllProjects(role)`
   (= `canManageProjects` ∪ auditor ∪ payroll_admin) sees all; otherwise a caller
   sees projects they **manage or are an active member of**, and a **manager**
   also sees projects a **direct report** belongs to (`getDirectReportIds(me.id,
   oid)` — always tenant-scoped, per 13H). `assertProjectVisible` /
   `assertTaskVisible` gate single-row reads; `canActOnTask` is the self-service
   boundary (an employee may act only on a task assigned to them).

### Helper block (byte-aligned `role-helpers.ts` ↔ `apps/web/src/lib/rbac.ts`)

| Helper | = |
|---|---|
| `canManageProjects` | `canManageHR` ∪ `project_manager` |
| `canViewProjects` | `canManageProjects` ∪ manager ∪ payroll_admin ∪ auditor |
| `canCreateProject` / `canEditProject` / `canArchiveProject` / `canManageProjectMembers` | `canManageProjects` |
| `canAssignProjectTasks` | `canManageProjects` ∪ manager |
| `canTrackProjectTime` | `canManageProjects` ∪ manager ∪ employee |
| `canApproveProjectTime` | `canManageProjects` ∪ manager ∪ payroll_admin |
| `canViewProjectCosts` | `canManageHR` ∪ payroll_admin ∪ auditor *(matches AC `view_costs`; deliberately EXCLUDES project_manager / manager)* |
| `canViewProjectInternalNotes` | `canManageProjects` ∪ auditor |

> **Deviation from the 14A spec prose (deliberate):** the plan wrote
> `canViewProjectCosts = canManageProjects ∪ …`, but the 14B AC grant omits
> `view_costs` from `project_manager`. The helper is aligned to the **actual AC
> grant** to prevent AC/handler drift — project_manager runs delivery, not the
> books, so it sees no budget. Likewise the AC grants `task:create` only to
> `canManageProjects` (NOT manager/employee), so managers update/assign/status
> existing tasks but do not create them. (Recorded for 14D UI affordances.)

## Procedures

```
projects.list            (project:read)          scoped; filters status/health/search/includeArchived/mine; derived health + redacted budget per row
projects.getById         (project:read)          assertProjectVisible; budget redacted + canViewBudget; derived health + counts
projects.create          (project:create)        PRJ-NNNNNN MAX+1 retry; auto-creates a `lead` membership for the named PM
projects.update          (project:update)        frozen when archived; status→completedAt side effect
projects.archive         (project:archive)        isArchived + status=archived
projects.unarchive       (project:archive)        back to active (or given status)
projects.members.list    (project:read)
projects.members.add     (project:manage_members) verifyEmployeeInOrg; one active membership (CONFLICT on dup)
projects.members.remove  (project:manage_members) soft-remove (removedAt)
projects.milestones.list     (project:read)
projects.milestones.create   (project:update)
projects.milestones.update   (project:update)
projects.milestones.complete (project:update)
projects.tasks.list      (task:read)             scoped; filters project/milestone/status/priority/assignee/search; `mine` self-scope
projects.tasks.getById   (task:read)             assertTaskVisible; read-only linked-context refs
projects.tasks.create    (task:create)           TSK-NNNNNN MAX+1 retry; verifies links (SELECT-only)
projects.tasks.update    (task:update)           assignee-employee may edit basic fields of own task; structural/link edits = managing roles
projects.tasks.changeStatus (task:change_status) employee may change OWN assigned task only
projects.tasks.complete  (task:change_status)    sugar for status=done + completedAt
projects.tasks.assign    (task:assign)
projects.tasks.unassign  (task:assign)
projects.tasks.comments.list           (task:read)    internal-note redaction (server-side)
projects.tasks.comments.create         (task:comment) public comment; blocked on terminal task
projects.tasks.comments.createInternal (task:update)  + canViewProjectInternalNotes handler gate
projects.timeEntries.list    (time_entry:read)    scoped; `mine` self-scope
projects.timeEntries.create  (time_entry:create)  always the caller's own (self-scope)
projects.timeEntries.update  (time_entry:update)  own DRAFT only
projects.timeEntries.submit  (time_entry:submit)  draft → submitted
projects.timeEntries.approve (time_entry:approve) submitted → approved; approver scope (seesAll / report / project-visible)
projects.timeEntries.reject  (time_entry:approve) submitted → rejected (reason required)
projects.activity.list       (project:read)       reads shared audit_event for the project + its children (14H — no project_activity table)
```

References (`PRJ-`/`TSK-`) are MAX+1 per org with a 23505 retry loop; the
`(org, reference)` partial-unique index is the race backstop.

## Audit delta

`audit:permissions` rose **93/13 → 109/14** — EXPECTED: `projects` is the 14th
router and the first to consume the `project` / `task` / `time_entry` resources
(16 distinct new pairs: project ×5, task ×6, time_entry ×5). All are defined in
the `permissions.ts` statement. Not a regression.

## New role: `project_manager`

Added in 14B (10 roles). Full project/task control + time approval, **scoped
server-side** to projects they lead/belong to (but `seesAllProjects` is true for
the managing tier, so a PM sees all projects in the org — leads are differentiated
via `project_member.role='lead'`, not visibility). Does **not** hold `view_costs`
(budget redacted) but **does** see internal notes. No existing seed user was
reassigned; `scripts/seed-pm-user.ts` (idempotent) provisions
`pm@atlas-shipping.com` (Nadia Khan) for testing without re-running the
non-idempotent `seed-dev.ts`.

## Verification

`scripts/verify-projects-api.ts` — **70/70** against the seed + a running API:
list scope (admin/pm/auditor/payroll = 5; manager scoped = 4; employee = 3 member
projects; recruiter blocked); budget redaction (PM/manager/employee → null;
admin/auditor/payroll → visible); employee IDOR no-leak (FORBIDDEN on
non-member projects); derived health (off_track / completed / on_track);
reference allocation (PRJ-000006/007, TSK-000026); members (add/dup-CONFLICT/
manager-blocked/remove); milestones (create/manager-blocked/complete); tasks
(create scope, employee own-only changeStatus, assign scope); **internal-note
redaction** (admin/pm/auditor see; manager/employee/payroll redacted;
employee/manager `createInternal` FORBIDDEN at the handler gate); time entries
(self-scope create/submit, employee approve blocked, manager/pm approve,
reject-with-reason, precondition guards); cross-module link read-only.

Run:
```
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-projects.ts && bun run scripts/seed-pm-user.ts
# restart apps/server (lesson #76), then:
cp scripts/verify-projects-api.ts apps/web/_v.ts && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
```

## Gates

check-types 3/3 · build 2/2 · audit:permissions 109/14 · verify 70/70 · ultracite
clean on all changed files.
