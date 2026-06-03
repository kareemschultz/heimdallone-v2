# Helpdesk / Requests DB Setup (Phase 13B)

Drizzle schema, migration, seed, and the `ticket:approve` permission for the
Helpdesk / Requests module. **DB + permissions layer only** — no oRPC router and
no frontend routes in this phase (those are 13C / 13D+). Implements the data
model from
[helpdesk-requests-implementation-plan.md](../architecture/helpdesk-requests-implementation-plan.md).

## Guardrail (the whole point of this module)

Helpdesk is the **request/ticket LAYER that LINKS to** Assets / Payroll / Leave /
Attendance / Offboarding via **read-only nullable FK columns** — it **NEVER
duplicates or mutates** their business logic. Procurement stays in `asset_request`;
payroll blockers stay in `payroll_issue`; leave/attendance corrections stay in
their own modules. The link columns below are context / deep-link only.

## Tables (3) — `packages/db/src/schema/helpdesk.ts`

All org-scoped (`organizationId` → `organization`, cascade), cuid2 ids,
`createdAt`/`updatedAt` (`timestamps` helper); the two long-lived tables also carry
soft-delete `deletedAt`.

| table | purpose | key columns |
|---|---|---|
| `helpdesk_category` | request categories (HR, IT, Facilities, …) | key (enum), name, description, **defaultAssigneeUserId** (FK user, set null), defaultPriority, defaultSlaHours, requiresApproval, isActive |
| `helpdesk_request` | the core ticket | **reference** (e.g. HD-000042), categoryId (FK, set null), **requesterEmployeeId** (FK employee, restrict), targetEmployeeId (FK, set null), createdByUserId, title, description, priority, status, assignedToUserId, firstResponseDueAt, resolutionDueAt, firstRespondedAt, resolvedAt, closedAt, resolutionNote, approvalRequired, approvalStatus, approvedByUserId, approvalNote, **6 read-only link FKs + generic linkedEntityType/Id** |
| `helpdesk_request_comment` | the thread | requestId (FK cascade), authorUserId (FK, set null), body, **isInternal** |

### Read-only cross-module links on `helpdesk_request` (the guardrail)

All **`ON DELETE SET NULL`** — removing the linked row clears the link but never
breaks the ticket:

- `linkedAssetId` → `asset`
- `linkedPayslipId` → `payslip`
- `linkedPayrollRunId` → `payroll_run`
- `linkedLeaveRequestId` → `leave_request`
- `linkedAttendanceRecordId` → `attendance_record`
- `linkedOffboardingCaseId` → `offboarding_case`
- `linkedEntityType` (enum) + `linkedEntityId` (text, **no FK**) — generic
  forward-compat link for Projects / Finance / CRM / documents that have no
  dedicated column yet.

These are context pointers only — there is **no cascade INTO** these modules and no
write-back. A helpdesk ticket can reference a payslip to ask "explain this
deduction"; it can never change the payslip.

## Enums (5)

- `helpdesk_request_status` — `new` | `open` | `in_progress` | `waiting_on_employee` | `waiting_on_approval` | `resolved` | `closed` | `cancelled`
- `helpdesk_priority` — `low` | `normal` | `high` | `urgent`
- `helpdesk_category_key` — `hr` | `payroll` | `attendance` | `leave` | `documents` | `assets` | `it` | `facilities` | `finance` | `general` | `custom`
- `helpdesk_approval_status` — `none` | `pending` | `approved` | `rejected` (single-step approval; a multi-step approval table is deferred)
- `helpdesk_linked_entity_type` — `document` | `project_task` | `expense` | `crm_case` | `other`

### SLA state is DERIVED, not stored

The SLA state (`not_applicable` | `on_track` | `due_soon` | `overdue` |
`breached`) is **deliberately not a DB column or enum**. It is a pure function of
`firstResponseDueAt` / `resolutionDueAt` / `status` against the current clock — it
changes with no write event, so any persisted value would be guaranteed-stale.
The 13C API computes it at read time. The canonical string values live in the
exported `HELPDESK_SLA_STATES` const + `HelpdeskSlaState` type in
`helpdesk.ts` so the API and UI share one source of truth.

> This is a deliberate deviation from the 13B prompt's enum list (which named an
> SLA-state enum). Contrast with `asset.currentAssigneeId` in 12B, which **is** a
> stored denormalised cache — because it only changes on an explicit
> assign/return write. SLA state has no such write trigger.

## Constraints & indexes

- **`helpdesk_category_org_name_uq`** — partial unique `(organizationId, name)`
  where `deleted_at is null` (one category name per org).
- **`helpdesk_request_org_reference_uq`** — partial unique
  `(organizationId, reference)` where `deleted_at is null` (ticket number unique
  per org).
- `helpdesk_request_org_status_idx` `(organizationId, status)` — queue filters.
- `helpdesk_request_org_priority_idx` `(organizationId, priority)` — triage.
- `helpdesk_request_org_assignee_idx` `(organizationId, assignedToUserId)` — "my queue".
- `helpdesk_request_org_requester_idx` `(organizationId, requesterEmployeeId)` — "my requests".
- `helpdesk_request_org_target_idx` `(organizationId, targetEmployeeId)` — on-behalf-of.
- `helpdesk_request_org_category_idx` `(organizationId, categoryId)` — per-category.
- `helpdesk_request_comment_request_idx` `(requestId)` — thread fetch.
- `helpdesk_request_comment_org_idx` `(organizationId)` — tenant scope.

FK delete behaviour: organization → cascade; category → **set null** (tickets
orphan to "uncategorised", never blocked); **requesterEmployeeId → restrict**
(employees are soft-deactivated, not hard-deleted, so request history is
preserved); targetEmployeeId / all user FKs / all 6 cross-module link FKs →
**set null**; request → comment **cascade**.

## Migration

- File: **`packages/db/src/migrations/0016_confused_vulture.sql`** (Drizzle generate).
- Adds 5 enums + 3 tables + 2 partial-unique indexes + 8 supporting indexes + FK
  constraints to existing tables (`asset`, `payslip`, `payroll_run`,
  `leave_request`, `attendance_record`, `offboarding_case`, `employee_profile`,
  `user`, `organization`, `helpdesk_category`, `helpdesk_request`). No changes to
  any existing table's own columns (verified — clean additive diff).
- Apply: `bun run db:migrate` (applied successfully to postgres-central).

## Permissions — new `ticket:approve` action

`ticket:approve` was added to the access-control statement and granted per the
least-privilege rationale: **approval is not the same as update**. Routing
approvals through `ticket:update` would let an approver edit arbitrary ticket
fields; a dedicated action keeps the 13C approve/reject mutation gated on exactly
one verb.

| role | ticket grants |
|---|---|
| tenant_owner / tenant_admin / hr_admin / helpdesk_agent | create, read, update, assign, resolve, close, **approve** |
| payroll_admin | read, **approve** |
| manager | create, read, **approve** |
| employee | create, read (no approve) |
| auditor | read |
| recruiter | (none) |

`employee` already held `ticket:create`, so — unlike Assets, which needed a new
`asset:request` action — Helpdesk needs **no new self-service action**. `audit:permissions`
stays **86/12**: `ticket:approve` is defined in the statement but no router
consumes it yet (13C will).

## Seed — `scripts/seed-helpdesk.ts`

Command: `export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-helpdesk.ts`

**Idempotent** — clears this org's helpdesk rows (comment → request → category,
FK-safe order) then re-inserts; reruns produce identical counts (verified twice).

Seeded counts (Atlas Shipping):

| entity | count | detail |
|---|---|---|
| categories | 10 | HR, Payroll, Attendance, Leave, Documents, Assets, IT, Facilities, Finance, General (IT/Facilities/General default to the helpdesk agent; Finance requires approval) |
| requests | 10 | spread across `new`/`open`/`in_progress`/`waiting_on_employee`/`waiting_on_approval`/`resolved`; one **urgent + overdue** A/C ticket; references `HD-000001…HD-000010` |
| comments | 6 | **4 public + 2 internal** (PSU bench-test note, approval-routing note); one is a resolution comment |

Cross-module links seeded (all resolve to **real** rows — context only):

- `linkedPayslipId` → a real payslip ("explain this deduction", no pay change)
- `linkedAssetId` → a real asset (laptop won't power on)
- `linkedAttendanceRecordId` → a real attendance record (missed clock-out;
  correction noted as happening in Attendance, not here)
- `linkedLeaveRequestId` → a real leave request ("why is my balance low?")
- `linkedEntityType=expense` + `linkedEntityId` → generic link (reimbursement,
  no Finance module yet)

## Verification (observed)

- Migration applied; `pg_type` shows the **5 helpdesk enums**; `helpdesk_request`
  has its unique index + 6 supporting indexes + pkey.
- Seed idempotent: two runs → `10 categories, 10 requests, 6 comments (2 internal)`
  both times.
- **category name uniqueness**: no duplicate `(org, name)` among non-deleted rows
  (query returns empty).
- **comment visibility split**: 4 `is_internal = false` / 2 `is_internal = true`.
- **link integrity**: every non-null link FK resolves — `asset_orphans = 0`,
  `payslip_orphans = 0`; 1 each of asset / payslip / leave / attendance links.
- All rows org-scoped; gates green (check-types 3/3, build 2/2, ultracite clean on
  changed files, audit:permissions **86/12** — unchanged, no router added this
  phase).

## Privacy / redaction expectations for 13C

- `helpdesk_request_comment.isInternal = true` notes are **agent/HR-only** and the
  13C API **must redact them server-side** from the requesting employee (mirroring
  recruitment offer-compensation and assets `purchaseCost` redaction). The flag
  exists on the row; visibility is enforced in the resolver, never the client.
- Cross-module link columns may point at finance/private data (payslip, payroll
  run). 13C should resolve a link to a **safe display label**, not echo the linked
  row wholesale, and respect the linked module's own redaction.

## Future API notes (13C)

`helpdesk` oRPC router (categories / requests / comments) reusing the existing
`ticket` AC resource (now incl. `ticket:approve`), with:

- **Reference generation**: transactional `max(reference)+1` per org at create
  time (the seed sets explicit `HD-000001…` values; 13C must not race).
- Two-layer authz (tenant FK verify + lateral scope: agents see the queue,
  employees see only their own requests via `requester_employee_id`).
- Server-side internal-note redaction (see above).
- Derived SLA-state computation at read time (`HELPDESK_SLA_STATES`).
- Approve/reject gated on `ticket:approve`; assignment on `ticket:assign`.
- **No cross-module writes** — link columns are read-only; the router never
  mutates Assets/Payroll/Leave/Attendance/Offboarding.

Deferred beyond MVP: configurable `sla_policy` table, `status_history`,
attachments, multi-step approval table, knowledge base, canned responses.
