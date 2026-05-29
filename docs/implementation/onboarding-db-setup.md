# Onboarding DB Setup (Phase 9E)

Database foundation for the onboarding module. Built per the Phase 9A spec
(`docs/architecture/recruitment-onboarding-implementation-plan.md` §4–5),
mirroring the recruitment schema conventions (`cuid`, `orgRef`, `timestamps`,
`deletedAt`).

## Schema — `packages/db/src/schema/onboarding.ts`

### Enums (Phase 9A §5.6–5.8)
- `onboarding_status`: `not_started · in_progress · blocked · completed · cancelled`
- `onboarding_task_status`: `todo · in_progress · waiting · completed · skipped · blocked`
- `onboarding_category`: `document · equipment · policy · training · introduction · other`
- `document_request_status`: `requested · uploaded · approved · rejected`

### Tables (7)
| Table | Purpose | Key FKs |
|---|---|---|
| `onboarding_template` | Reusable template | org |
| `onboarding_template_task` | Template line items | template |
| `employee_onboarding` | Per-hire instance | employee_profile, candidate_application (nullable), template (nullable) |
| `onboarding_task` | Per-instance task (template snapshot) | employee_onboarding, template_task (nullable), employee_profile / user (assignee) |
| `onboarding_document_request` | Documents the hire must provide | employee_onboarding, onboarding_task (nullable), user (reviewer) |
| `onboarding_acknowledgement` | Policy/handbook sign-offs | employee_onboarding, user (acknowledger) |
| `onboarding_activity` | Per-onboarding timeline feed | employee_onboarding, user (actor) |

### Snapshot rule (design decision, spec §2.2)
`onboarding_task` carries `templateTaskId` (nullable) plus `titleSnapshot` /
`descriptionSnapshot` / `category` denormalised from the template at creation
time. **Editing a template never mutates in-flight onboardings** — the new
hire's plan is frozen at start (same pattern as payslip line items).
`employee_onboarding.templateId` is `ON DELETE SET NULL` so an instance
survives template deletion.

### Indexes
- `onboarding_template`: (org); partial unique (org, name) **where deleted_at is null**
- `onboarding_template_task`: (template, sortOrder), (org)
- `employee_onboarding`: (org, status), (employee)
- `onboarding_task`: (onboarding), (assigneeEmployee, status), (org, dueAt)
- `onboarding_document_request`: (onboarding, status)
- `onboarding_acknowledgement`: (onboarding)
- `onboarding_activity`: (onboarding, createdAt)

### Deviations from the user's suggested enums (spec wins)
- Task "type" + "assignee type" → the spec uses a single `onboarding_category`
  enum for task category and a **text** `defaultAssigneeRole` (string role label
  until an IT/identity module exists), not dedicated `task_type` /
  `assignee_type` enums.
- Document status → spec values `requested/uploaded/approved/rejected`
  (not `requested/received/waived/rejected`).
- **No "one active onboarding per employee" unique constraint** — the spec does
  not require it; omitted to avoid constraining re-onboarding / transfer cases.
  Revisit in 9F/9H if a hard invariant is wanted.

## Migration
- `packages/db/src/migrations/0009_complete_red_hulk.sql` — 4 enums, 7 tables,
  12 indexes. Onboarding-only (no changes to other tables).
- Generate: `bun run db:generate` · Apply: `bun run db:migrate` (reads
  `DATABASE_URL` from `apps/server/.env`).

## Seed — `scripts/seed-onboarding.ts`
```
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-onboarding.ts
```
Requires `seed-dev` + `seed-hr-core` first. Clears the org's existing onboarding
data (FK-safe order) then inserts:
- **3 templates** (Standard / Operations-logistics / Management) + **24 template tasks**
- **5 employee onboardings** — one each: not_started / in_progress / blocked / completed / cancelled
- **55 onboarding tasks** — all 6 statuses represented (todo / in_progress / waiting / completed / skipped / blocked)
- **12 document requests** — requested / uploaded / approved / rejected
- **2 acknowledgements** (in_progress + completed instances, with timestamp + actor)
- **16 activities** (onboarding_started / task_completed / document_uploaded / blocker_raised / onboarding_completed / comment)

## Verification (2026-05-29)
- 7 tables + 4 enums created (`pg_tables` / `pg_type`).
- Status distributions confirmed (1 onboarding per status; all task + doc statuses present).
- Partial unique `onboarding_template_org_name_uq` enforced (duplicate name → rejected).
- Gates: `check-types` ✓ · `build` ✓ · `check` 225 baseline ✓ · `audit:permissions` ✓.

## Phase 9F — Onboarding oRPC API (DONE)

`packages/api/src/routers/onboarding.ts` — 7 groups, 31 procedures:
- **templates**: list / getById / create / update / archive
- **templateTasks**: listByTemplate / create / update / delete / reorder
- **employeeOnboarding**: list / getById / getByEmployeeId / start / cancel / complete
- **tasks**: list / getById / update / complete / skip / reassign
- **documentRequests**: list / create / markUploaded / approve / reject
- **acknowledgements**: list / create / sign
- **activity**: list

Permissions (`packages/auth/src/permissions.ts`): new `onboarding` resource +
10 actions (`read, create, update, archive, start, assign, complete, skip,
approve_document, sign_acknowledgement`). Grants: owner/admin/hr_admin = all;
recruiter = read+start; manager = read/complete/skip/assign; employee =
read/complete/sign_acknowledgement; auditor = read. Helpers
`canManageOnboarding` (= canManageHR) / `canViewOnboarding` (+ manager/auditor/
recruiter) in both backend `role-helpers.ts` and frontend `rbac.ts`.

Guarantees:
- **Transactional start**: the onboarding row + all snapshot tasks + the start
  activity commit in one `db.transaction` — never a half-started onboarding.
- Snapshot category/title/description from the template; `assigneeEmployeeId`
  defaults to the new hire when the template task's `defaultAssigneeRole` is
  `new_hire`, else null (assign later).
- Tenant-verify every FK input (template/templateTask/onboarding/task/
  docRequest/acknowledgement/employee/application).
- Employee self-scope: an employee may read their own onboarding, complete
  their own/assigned tasks, and sign their own acknowledgements; cross-employee
  list/management is FORBIDDEN. Template archive/edit never mutates in-flight
  onboarding tasks (verified).
- Audit events on every create/update/archive/status/document/sign action;
  plain-language errors (no FK/enum/orgId leakage).

Verification (`scripts/verify-onboarding-api.ts`, run from apps/web): templates
list = 3; start → 11 snapshot tasks (all todo); task complete → completed +
activity; archive template → onboarding tasks survive + template hidden;
employee + auditor blocked on management calls. Gates: check-types ✓ · build ✓
· check 225 baseline ✓ · audit:permissions ✓ (45 pairs / 8 routers).

## Next: Phase 9G — Onboarding UI
