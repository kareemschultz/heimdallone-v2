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

## Next: Phase 9F — Onboarding oRPC API
templates CRUD + task ordering; `employeeOnboarding.start/list/get`;
task complete/skip/reassign/comment; document request lifecycle;
acknowledgement sign; activity feed. Tenant-verify every FK; RBAC helpers
(`canManageOnboarding` / `canViewOnboarding`); audit every status/document
action; employee self-scope for assigned tasks; manager scope. Add the new
`onboarding` resource + actions to `packages/auth/src/permissions.ts` and run
`bun run audit:permissions`.
