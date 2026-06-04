# Projects + Tasks / Timelines — DB Setup (Phase 14B)

First code-touching Projects phase: Drizzle schema, migration, access-control
resources + the new `project_manager` role, and idempotent Atlas Shipping seed.
**No API router and no frontend routes** (those are 14C+).

Spec: [`projects-tasks-implementation-plan.md`](../architecture/projects-tasks-implementation-plan.md).

## Coordination-layer guardrail (enforced in the schema)

Projects **links** to other modules for context/reporting and **never owns or
mutates** their business rules. Proven at the DB level (constraint catalog):

- **No CRM foreign keys.** `project.linkedCustomerId` / `project.linkedDealId` are
  plain `text` columns (soft refs) — the `crm_*` tables are Phase 17. CRM will own
  the handoff join table and back-fill the reverse link.
- **Cross-module context links are read-only, `ON DELETE SET NULL`.**
  `project_task.linkedAssetId → asset` and `project_task.linkedHelpdeskRequestId →
  helpdesk_request` are nullable FKs that the Projects API will only ever READ.
- **`project_time_entry` has no Attendance/Payroll FK.** Its FKs are only
  project / project_task / employee_profile / user / organization. Time entries are
  **reporting-only**; the labour-cost report is Phase 16 (it will READ approved
  time + contract rates + the payroll-engine, never write). There is deliberately
  **no `payrollStatus`/lock field** — finalization/costing is owned by Finance later.
- **Project health is DERIVED at read time** (`PROJECT_HEALTH_STATES` const + type) —
  there is **no stored health column** (a persisted value would go stale, like the
  helpdesk SLA state).
- **Activity reuses the shared `audit_event` log** — there is **no
  `project_activity` table**.

## Tables created (`packages/db/src/schema/projects.ts`)

| Table | Purpose | FKs (onDelete) |
|---|---|---|
| `project` | the project | projectManagerEmployeeId→employee_profile (restrict), departmentId→department (set null), createdByUserId→user (set null), organizationId→organization (cascade) |
| `project_member` | team membership (join table — supersedes Horilla jsonb) | projectId→project (cascade), employeeId→employee_profile (restrict), org (cascade) |
| `project_milestone` | dated checkpoints | projectId→project (cascade), ownerEmployeeId→employee_profile (set null), org |
| `project_task` | the unit of work | projectId→project (cascade), milestoneId→project_milestone (set null), assigneeEmployeeId→employee_profile (restrict), createdByUserId→user (set null), **linkedAssetId→asset (set null)**, **linkedHelpdeskRequestId→helpdesk_request (set null)**, org |
| `project_task_comment` | task discussion (isInternal redacted in 14C) | taskId→project_task (cascade), authorUserId→user (set null), org |
| `project_time_entry` | timesheet line (reporting-only) | projectId→project (cascade), taskId→project_task (set null), employeeId→employee_profile (restrict), approvedByUserId→user (set null), org |

`project` also carries: `reference` (PRJ-000NNN), `status`, `priority?`, `startDate`,
`targetEndDate`, `completedAt`, `budget numeric(14,2)` (reserved — finance-redacted in
14C, **no cost computation**), `linkedCustomerId`/`linkedDealId` (soft CRM refs),
`internalNote`, `isArchived`, `...timestamps`, `deletedAt`.
`project_task` also carries the generic forward-compat link `linkedEntityType`
(`project_linked_entity_type` enum) + `linkedEntityId` (no FK).

## Enums (7)

`project_status` (planning / active / on_hold / completed / cancelled / archived) ·
`project_priority` (low / normal / high / urgent — shared by project + task) ·
`project_member_role` (lead / member / viewer) ·
`project_milestone_status` (planned / in_progress / at_risk / completed / missed /
cancelled) · `project_task_status` (todo / in_progress / blocked / in_review / done /
cancelled) · `project_time_entry_status` (draft / submitted / approved / rejected) ·
`project_linked_entity_type` (document / expense / crm_deal / crm_customer / other).

Plus `PROJECT_HEALTH_STATES` (const array, derived — not an enum/column):
on_track / at_risk / off_track / completed / no_data.

## Constraints & indexes

- Partial-unique `project_org_reference_uq` (org, reference) WHERE deletedAt IS NULL;
  `project_org_name_uq` (org, name) WHERE deletedAt IS NULL;
  `project_task_org_reference_uq` (org, reference) WHERE deletedAt IS NULL.
- **`project_member_active_uq` (project, employee) WHERE removedAt IS NULL** — one
  active membership per employee per project (verified: 0 duplicates).
- Tenant indexes on every table; plus project (org+status, org+manager), milestone
  (org+status, project+dueDate), task (org+status, org+assignee+status, org+dueDate,
  milestone, linkedAsset, linkedTicket), comment (taskId, org), time entry
  (org+employee+date, org+project+date, org+status, taskId).

## Migration

`packages/db/src/migrations/0017_happy_hammerhead.sql` — **purely additive** (6 new
tables + 7 new enums; no changes to any existing table). Applied with
`bun run db:migrate`. Re-running `db:generate` reports "No schema changes".

## Access control (`packages/auth/src/permissions.ts`)

New resources in `statement`:

```
project:    ["create","read","update","archive","manage_members","view_costs","view_internal_notes"]
task:       ["create","read","update","assign","change_status","comment","view_internal_notes"]
time_entry: ["create","read","update","submit","approve","view_costs"]
```

Per-role grants:

| Role | project | task | time_entry |
|---|---|---|---|
| tenant_owner / tenant_admin | full | full | full |
| hr_admin | full | full | read, approve, view_costs |
| **project_manager** (NEW) | create, read, update, archive, manage_members, view_internal_notes | full | create, read, update, submit, approve |
| payroll_admin | read, view_costs | read | read, approve, view_costs |
| manager | read | read, update, assign, change_status, comment | read, approve |
| employee | read | read, update, change_status, comment | create, read, update, submit |
| auditor | read, view_costs, view_internal_notes | read, view_internal_notes | read, view_costs |
| recruiter | — | — | — |
| helpdesk_agent | — | — | — |

`view_costs` (finance/audit) and `view_internal_notes` (PM/HR/audit) are the
server-side **redaction gates** the 14C router will enforce (mirror of assets
`purchaseCost` + helpdesk internal notes). `project_manager` is deliberately **not**
granted `view_costs`.

### `project_manager` role decision — **added now** (14B)

The plan recommended adding it in 14B; it's added to the AC + the `roles` map (now 10
roles). **No existing seed user was reassigned** to `project_manager` — doing so would
disturb other modules' RBAC expectations. The role exists for future assignment; the
seed designates project leads via `project_member.role = 'lead'` + `project.project
ManagerEmployeeId` instead.

### Audit impact — **stays 93/13**

`audit:permissions` counts distinct `(resource, action)` pairs **used by routers** + the
router count. No router consumes `project`/`task`/`time_entry` yet (the router is 14C),
so the count is unchanged — exactly the Phase-13B `ticket:approve` precedent. It will
rise in 14C to ~106/14 when the `projects` router lands.

## Seed (`scripts/seed-projects.ts`)

Idempotent (FK-safe delete of time entries → comments → tasks → milestones → members →
projects, then re-insert). Reads one real asset id + one real helpdesk_request id for
the read-only context links — **writes nothing outside `project_*`**.

```
export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-projects.ts
```

Counts (identical on re-run — idempotency verified):

- **5 projects** — Main Office Network Upgrade (active), Vessel Crew WiFi Deployment
  (planning), Payroll Rollout Project (on_hold), HR Document Digitization (completed),
  Customer CPE Installation Batch (active, with soft `linkedCustomerId=CUST-2026-0007`
  + `linkedDealId=DEAL-2026-0042`).
- **11 members** (each project a lead + members, deduped).
- **8 milestones** across planned / in_progress / at_risk / completed / missed.
- **25 tasks** covering all 6 statuses (incl. blocked, in_review, done, cancelled),
  with **1 asset-linked** task and **1 helpdesk-ticket-linked** task.
- **6 comments** (4 public / **2 internal** — for 14C redaction).
- **8 time entries** across draft / submitted / approved / rejected, multiple
  employees, linked to project + task.

## DB verification (26/26 passed)

Tables + counts; status spreads (projects ≥4 statuses, tasks all 6, time entries all
4, milestones incl. at_risk/missed/completed); **active-membership uniqueness (0
dups)**; every `linkedAssetId`/`linkedHelpdeskRequestId` resolves to a real row; CRM
soft refs present; **constraint-catalog guardrail proof** (project has no CRM FK;
task→asset and task→helpdesk_request are `SET NULL`; time_entry has no
attendance/payroll/payslip FK); all 7 enums present.

## Quality gates

check-types **3/3** · build **2/2** · lint **212/1/1** (unchanged) ·
audit:permissions **93/13** (unchanged — explained above) · ultracite clean on changed
files. Migration applied; seed idempotent.

## Notes for the 14C API

- Router `projects` (oRPC), gating `authorizedProcedure("project"|"task"|"time_entry",
  action)` — this is when the audit count rises.
- Two-layer authz: AC gate + handler lateral scope (`seesAllProjects` = canManageProjects
  ∪ auditor ∪ payroll_admin; project members see their projects; managers own +
  direct-reports via `getDirectReportIds(me.id, oid)`; employees their assigned
  tasks / own time). `verifyProject`/`verifyTask`/`verifyMilestone`/`verifyMember`
  tenant checks on every id.
- **Server-side redaction:** null `budget` for `!view_costs` (return a `canViewCosts`
  flag); filter `isInternal` task comments unless `view_internal_notes`.
- Cross-module links: tenant-verify the asset/ticket id on write (SELECT-only), resolve
  read-only on read (name only) — **never write** to Assets/Helpdesk. CRM soft refs are
  stored/echoed verbatim (no validation against non-existent crm_* tables).
- Time entries: `submit`/`approve`/`reject` lifecycle; **no Attendance/Payroll write**.
- References `PRJ-`/`TSK-` allocated MAX+1 with a `(org, reference)` unique backstop.
