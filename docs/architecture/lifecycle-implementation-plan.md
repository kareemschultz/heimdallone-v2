# Lifecycle Module — Implementation Plan (Phase "A" spec)

> Status: **Spec only.** No code, no migration. This is the "A" phase deliverable for the
> Lifecycle module. Build sequence is at the end (B schema → C API → D–F UI → I QA).
>
> Module owner concept: **employee lifecycle events that change a person's standing in the
> org over time** — disciplinary cases, internal transfers (effective-dated department /
> position / location moves), and employee-initiated resignations. Recognition is **out of
> scope** — it already lives in the Performance / PMS module (`recognition_point`).
>
> SaaS Architecture Rule applies (standing override). v1 (`heimdallone.git@d03e5b4`) proves
> the *need* for these workflows; it does **not** define the product. This spec generalizes
> v1's intent into tenant-configurable, effective-dated, tenant-safe capabilities and
> deliberately **does not clone v1 quirks** (e.g. v1's `crypto.randomUUID()` ids, `tenant_id`
> column naming, free-text statuses, the standalone `resignation_requests` table that
> duplicates the exit workflow, or transfers that mutate a denormalized `employees.departmentId`
> instead of writing an effective-dated history row).

---

## 1. Module scope

The Lifecycle module owns three sub-domains. Each is a tenant-configurable, org-scoped,
audited workflow. None mutate another module's data; where they touch a neighbour they do so
through an explicitly designed, documented seam.

### 1.1 Disciplinary case tracking

Tracks the **incident → explanation → action → appeal** lifecycle for an employee, with a
tenant-configurable catalogue of categories and disciplinary actions (severity-ranked).

- **Intent captured from v1** (`hr-depth.ts` `disciplinaryRouter`, `disciplinary.tsx`):
  categories, actions with a 1–5 `severityLevel`, and per-employee records moving
  `draft → explained → action_taken → appealed` (closeable). Employee submits an explanation;
  HR takes a final action (linked to a catalogue action); employee may appeal.
- **Generalizations (not in v1):** tenant-configurable category + action catalogues that are
  **archivable, not hard-deleted**; an explicit `closed`/`overturned` terminal state so an
  appeal can resolve either way; server-side **sensitive-field redaction** (HR-only internal
  notes never reach the employee); manager-scoped read of their direct reports' cases;
  effective-dating is **not** used here (a disciplinary record is a point-in-time event, not a
  validity window), but every record carries an immutable `incidentDate` and an append-only
  audit trail.

### 1.2 Employee transfers (effective-dated dept / position / location changes)

An approval-gated, **effective-dated** change to an employee's department, job position/role,
work location, and/or reporting manager.

- **Intent captured from v1** (`transfers.ts`, `transfers.tsx`, `employee_transfers`):
  `draft → submitted → approved → effective` (plus `rejected`/`cancelled`); `transferType`
  of `department | job_title | combined`; snapshots the *from* values; **executes on approval
  if effective today/past, otherwise waits** for a scheduled job; reason text.
- **Generalizations (not in v1):**
  - The transfer **writes an effective-dated history row** into the employee's
    work-info history rather than blindly overwriting `employeeWorkInfo` (v1 mutated a single
    denormalized column and lost history). The *current* position resolves via
    `resolveAsOf(history, today)` (the codebase effective-dating pattern, §4).
  - Generalize `transferType` to cover **department, position, role, location, and manager**
    moves (v1 only did department + job title). The destination is a partial change set; any
    null field means "unchanged".
  - "Execute immediately vs. wait for effective date" is preserved but expressed cleanly: an
    approved transfer with `effectiveFrom <= today` activates its history window now; a
    future-dated one is **resolved by date**, so no cron is *required* for correctness (the
    new window simply becomes the resolved one on its date). A `transfer.activate` procedure
    is still provided for an optional scheduled sweep that flips the row's status label and
    fires the notification + audit event, but the source of truth is the dated window, not a
    mutated column (this is the key v1-bug avoidance: v1 needed a cron because it mutated
    state; we need it only for cosmetics/notifications).

### 1.3 Resignations (employee-initiated notice / approval / withdraw)

An **employee self-service** request to resign: notice date, reason category, optional notes,
with manager + HR approval and a **withdraw** path.

- **Intent captured from v1** (`resignations.tsx`, `lifecycle.ts` `resignation_requests`):
  employee/HR creates a request with a requested last-working date and reason category
  (`resignation | termination | retirement | end_of_contract | other`), runs
  `submitted → manager_approved → hr_approved → completed`, supports withdraw, an exit
  checklist, and a final-settlement payslip link.
- **CRITICAL generalization — do NOT duplicate Offboarding.** v2 **already has a full
  Offboarding module** (`offboardingCase` with `exitType ∈ {resignation, termination,
  retirement, contract_end, involuntary}`, clearance tasks, asset returns, access
  revocations, document requests, exit interview, settlement readiness, one-active-case-per-
  employee constraint). v1's `resignation_requests` + `exit_checklist_*` tables are
  **the offboarding workflow, re-implemented**. Cloning them into Lifecycle would violate the
  Module Rule and the no-duplicate guardrail used by Helpdesk/Projects/Performance/Finance/CRM.
  - **v2 resignation = the employee-initiated *intent to leave*** — a lightweight request that
    captures notice + reason + approval, and on HR approval **hands off** to Offboarding by
    creating (or linking to) an `offboardingCase` with `exitType='resignation'`. The clearance
    checklist, asset return, access revocation, and final settlement are **read-only links to
    Offboarding**, never re-modelled here. Lifecycle owns the *request*; Offboarding owns the
    *exit execution*.
  - This is the same "coordination layer, link-never-own" discipline the codebase already uses.

---

## 2. Drizzle schema (Phase B)

New file: `packages/db/src/schema/lifecycle.ts`. All tables org-scoped via the shared
`orgRef()` helper, `cuid()` primary keys, `timestamps`, soft-delete (`deletedAt`) where a row
is user-managed, and `pgEnum` for closed value sets (matching the Performance/CRM schema
style, **not** v1's free-text `text("status")`). Reference codes (`DISC-000001`, `TRF-000001`,
`RES-000001`) follow the MAX+1 helper convention.

Shared helpers (verified): `cuid()` = `text("id").primaryKey().$defaultFn(createId)`;
`orgRef()` = `text("organization_id").notNull().references(() => organization.id, { onDelete:
"cascade" })`; `timestamps` = `{ createdAt, updatedAt }`. Cross-module FK targets:
`employeeProfile.id`, `department.id`, `jobPosition.id`, `jobRole.id`, `offboardingCase.id`,
`user.id`. (Note: v2 stores current dept/position/role/manager/location in the **satellite
`employeeWorkInfo`**, not on `employeeProfile`. `workLocation` is a free-text column there
today — see open question Q5.)

### 2.1 Enums

```
disciplinary_record_status = [ draft, explanation_requested, explained,
                               action_taken, appealed, closed, overturned, withdrawn ]
disciplinary_outcome       = [ none, verbal_warning, written_warning, final_warning,
                               suspension, dismissal, other ]   // descriptive; tenant
                                                                // actions catalogue is the
                                                                // real source (see action table)
transfer_type              = [ department, position, role, location, manager, combined ]
transfer_status            = [ draft, submitted, approved, rejected, scheduled,
                               effective, cancelled ]
resignation_reason         = [ resignation, retirement, end_of_contract, mutual, other ]
resignation_status         = [ draft, submitted, manager_approved, hr_approved,
                               handed_off, withdrawn, rejected ]
```

> `disciplinary_outcome` is a coarse, reportable bucket; the **specific action** an org takes
> comes from the tenant-configurable `disciplinary_action` catalogue (severity-ranked). This
> keeps cross-tenant analytics possible without hardcoding one org's action names.

### 2.2 Tables

**`disciplinary_category`** (tenant-configurable catalogue)
- `id cuid`, `organizationId orgRef`, `name text notNull`, `description text`,
  `isArchived boolean default false`, `...timestamps`, `deletedAt`.
- unique `(organizationId, name) where deletedAt is null`; index on `organizationId`.

**`disciplinary_action`** (tenant-configurable severity-ranked actions)
- `id cuid`, `organizationId orgRef`, `name text notNull`, `description text`,
  `severityLevel integer default 1 notNull` (1–5, validated in API),
  `outcome disciplinary_outcome default 'other'` (maps the action to the reportable bucket),
  `isArchived boolean default false`, `...timestamps`, `deletedAt`.
- unique `(organizationId, name) where deletedAt is null`; index `(organizationId, severityLevel)`.

**`disciplinary_record`** (the case)
- `id cuid`, `organizationId orgRef`, `reference text notNull` (`DISC-000001`),
- `employeeId → employeeProfile.id (restrict)` — the subject; restrict preserves history.
- `categoryId → disciplinary_category.id (set null)`.
- `incidentDate date notNull` (immutable point-in-time event).
- `description text notNull` (the allegation/incident).
- `status disciplinary_record_status default 'draft' notNull`.
- `employeeExplanation text`, `employeeExplanationSubmittedAt timestamp`.
- `finalActionId → disciplinary_action.id (set null)`, `finalActionNotes text`,
  `finalActionTakenAt timestamp`, `finalActionByUserId → user.id (set null)`.
- `appealText text`, `appealSubmittedAt timestamp`, `appealOutcome text`,
  `appealResolvedAt timestamp`, `appealResolvedByUserId → user.id (set null)`.
- `internalNote text` — **HR-only; redacted server-side from the subject employee** (mirrors
  helpdesk/projects internal-note redaction).
- `reportedByUserId → user.id (set null)`.
- `...timestamps`, `deletedAt`.
- indexes: `(organizationId)`, `(organizationId, employeeId)`, `(organizationId, status)`;
  unique `(organizationId, reference) where deletedAt is null`.

**`employee_transfer`** (effective-dated move request)
- `id cuid`, `organizationId orgRef`, `reference text notNull` (`TRF-000001`),
- `employeeId → employeeProfile.id (restrict)`.
- `transferType transfer_type notNull`.
- `status transfer_status default 'draft' notNull`.
- **Effective-dating** (the canonical pattern, §4): `effectiveFrom date notNull` (when the move
  takes effect — drives `resolveAsOf`), `effectiveTo date` (null = open-ended; set when a later
  transfer supersedes this one).
- destination (partial change set; null = unchanged):
  `toDepartmentId → department.id (set null)`, `toJobPositionId → jobPosition.id (set null)`,
  `toJobRoleId → jobRole.id (set null)`, `toReportingManagerId → employeeProfile.id (set null)`,
  `toWorkLocation text` (free-text, matching `employeeWorkInfo.workLocation` today).
- snapshot of *from* values at request time (audit/explainability):
  `fromDepartmentId`, `fromJobPositionId`, `fromJobRoleId`, `fromReportingManagerId`,
  `fromWorkLocation`, and a `snapshotJson jsonb` for completeness.
- `reason text`.
- workflow stamps: `submittedByUserId`, `submittedAt`, `approvedByUserId`, `approvedAt`,
  `rejectionReason`, `executedAt`, `cancelledAt`.
- `...timestamps`, `deletedAt`.
- indexes: `(organizationId, status)`, `(organizationId, employeeId, effectiveFrom)`;
  unique `(organizationId, reference) where deletedAt is null`.

> **Effective-dated history seam (open question Q5).** When a transfer executes, the *current*
> department/position/etc. must resolve by date. Two clean options, both avoiding v1's
> destructive overwrite: **(a)** add an `employee_work_info_history` table (id, employeeId,
> orgRef, `effectiveFrom`/`effectiveTo`, the same position columns, `sourceTransferId` soft
> ref) that the transfer writes and the employee-profile read path resolves via `resolveAsOf`;
> or **(b)** if HR-Core later owns a work-info history table, Lifecycle writes into that
> through an explicit seam. **Recommendation: (a)** — Lifecycle owns the transfer *and* the
> resulting dated history row, and HR-Core reads it. This keeps the move auditable and
> reversible. Confirm with the HR-Core owner before B.

**`resignation_request`** (employee-initiated intent to leave)
- `id cuid`, `organizationId orgRef`, `reference text notNull` (`RES-000001`),
- `employeeId → employeeProfile.id (restrict)` — the resigning employee.
- `status resignation_status default 'draft' notNull`.
- `reasonCategory resignation_reason notNull`, `reasonNotes text`.
- `requestedLastWorkingDate date notNull`, `noticeStartDate date`.
- workflow stamps: `submittedAt`, `managerApprovedByUserId`/`managerApprovedAt`,
  `hrApprovedByUserId`/`hrApprovedAt`, `withdrawnAt`, `rejectionReason`.
- **Offboarding handoff (read-only link, NOT a duplicate):**
  `offboardingCaseId → offboardingCase.id (set null)` — populated on HR approval when the
  exit is handed off. The clearance checklist / settlement live in Offboarding and are read
  through this link; Lifecycle never writes them.
- `createdByUserId → user.id (set null)`.
- `...timestamps`, `deletedAt`.
- indexes: `(organizationId, status)`, `(organizationId, employeeId)`;
  unique `(organizationId, reference) where deletedAt is null`. **No** unique "one open
  resignation per employee" here at the DB layer — that invariant is enforced in the API
  (mirrors how Offboarding enforces its active-case rule), and Offboarding already holds the
  hard one-active-case constraint.

Relations: intra-module `relations()` blocks (record→category/action, transfer→employee/dept/
position, resignation→employee) following the Performance schema style. Cross-module links
(`employeeProfile`, `offboardingCase`) stay plain FKs, **not** mutated by this module.

### 2.3 Migration number

Latest migration on disk is `0027_sharp_terrax.sql`. This module's migration would be the
**next available number** (`0028_*` if nothing lands first). Drizzle migrations are serialized
and auto-numbered by `drizzle-kit generate`; the spec does not pin the literal number — the
build step generates it.

---

## 3. Access control resources + role grants (Phase B — `permissions.ts`)

### 3.1 Reuse the EXISTING unconsumed resources

`packages/auth/src/permissions.ts` already declares two resources that are **defined but
unconsumed by any router** — Lifecycle is their first consumer (the 13B/14B/15B/16B/17B
precedent: defining a resource at the schema/AC phase does not change the audit count until a
router consumes it):

```
resignation: [ create, read, approve, complete, withdraw ]      // EXISTING — use as-is
transfer:    [ create, read, submit, approve, execute, cancel ] // EXISTING — use as-is
```

> These names are already wired into the role blocks (`tenant_owner`, `tenant_admin`,
> `hr_admin` hold full grants; `manager` has `resignation:[read,approve]` +
> nothing on transfer's approve beyond what's granted; `employee` has
> `resignation:[create,read,withdraw]`; `auditor` has `resignation:[read]` + `transfer:[read]`).
> **Do not invent new names for these.** Map the workflow onto the existing actions:
> - Transfer: `create` (draft) · `submit` · `approve` (also used by the reject handler, as the
>   existing transfers router does — reject is "exercise the approve authority to deny") ·
>   `execute` (scheduled/explicit activation) · `cancel`.
> - Resignation: `create` · `read` · `approve` (manager + HR approval; the handler distinguishes
>   the two approval stages by the record's current status) · `complete` (the handoff-to-
>   Offboarding terminal action) · `withdraw` (employee self-service).

### 3.2 NEW resource for disciplinary

Disciplinary has no existing resource. Add one resource with least-privilege actions that map
to the lifecycle (avoid a single coarse `manage`):

```
disciplinary: [ read, create, explain, act, appeal, close, manage ]
```

- `read` — view records/categories/actions (scoped in the handler).
- `create` — open a record + manage the category/action catalogues (catalogue CRUD is HR-level).
- `explain` — submit the employee explanation (held by employee for their own record + HR).
- `act` — record the final action (HR-level).
- `appeal` — submit an appeal (employee, own record) — kept distinct so a self-service action
  sits behind an action the subject actually holds (the offboarding `documents.markUploaded`
  dead-branch lesson noted in `permissions.ts`).
- `close` / `manage` — resolve/overturn an appeal, archive catalogue entries (HR-level).

### 3.3 Role grant matrix (add to the role blocks in `permissions.ts`)

| Role | disciplinary | transfer (existing) | resignation (existing) |
|---|---|---|---|
| tenant_owner / tenant_admin | read, create, explain, act, appeal, close, manage | full (already granted) | full (already granted) |
| hr_admin | read, create, explain, act, appeal, close, manage | full (already granted) | full (already granted) |
| manager | read *(direct reports only, handler-scoped)* | read *(scoped)* — and **propose** transfers for reports (`create`,`submit`,`cancel`); approval stays HR | read, approve *(scoped — manager approval stage; already granted)* |
| payroll_admin | — | read | read, complete *(settlement readiness; already granted)* |
| auditor | read *(read-only oversight)* | read *(already granted)* | read *(already granted)* |
| employee | read *(own record)*, explain *(own)*, appeal *(own)* | — | create, read, withdraw *(own; already granted)* |
| recruiter / helpdesk_agent / project_manager / sales_admin / sales_rep | — | — | — |

> Decision to confirm (Q1): the table above gives **managers the ability to *propose* a
> transfer for a direct report (`transfer:create/submit/cancel`) while approval stays HR**.
> v1 left transfer approval entirely to HR-level. Recommendation: grant managers
> create/submit/cancel (scoped to reports) so the workflow matches real org behaviour; keep
> `transfer:approve`/`execute` HR-only. This requires **adding `transfer:[create,submit,cancel]`
> to the `manager` block** (it currently has neither). If the owner prefers v1 parity, leave
> managers as read-only on transfers.

---

## 4. Effective-dating usage

Per `docs/architecture/effective-dating-implementation-plan.md` and
`packages/payroll-engine/src/effective-dating.ts`:

- Columns are **`effectiveFrom` (inclusive)** and **`effectiveTo` (exclusive, null = open)**.
- Resolution is by **event date**, never `now()` for historical reads. For transfers, the
  event date is **the day you ask "what is this employee's department?"** — the read path calls
  `resolveAsOf(historyRows, asOfDate)` to pick the window `[effectiveFrom, effectiveTo)` with
  the latest `effectiveFrom` that contains the date.
- A draft/submitted transfer is **not** a resolvable window. Only on `approved → effective`
  does the transfer write/activate its dated history row (and close the prior window's
  `effectiveTo`). This replaces v1's destructive `UPDATE employees SET departmentId=…`.
- `isActive`/`isPublished` publish-guard does **not** apply to transfers (a transfer is an
  approved event, not a published rule), but the same *resolve-by-date* discipline does.
- Disciplinary records and resignation requests are **point-in-time events**, not validity
  windows — they do **not** use effective-dating (they carry an immutable event date +
  audit trail instead). This is a deliberate scoping decision, documented so a future reviewer
  doesn't "add effective-dating everywhere".

---

## 5. oRPC router (Phase C)

New file: `packages/api/src/routers/lifecycle.ts`, registered in
`packages/api/src/routers/index.ts` as `lifecycle: lifecycleRouter`. Conventions (verified
against `performance.ts`): `authorizedProcedure("resource","action")` declares the AC gate;
handlers extract `organizationId` + caller role/`userId` from context, tenant-verify every id,
scope every query with `eq(table.organizationId, oid)`, use `getDirectReportIds(empId, oid)` +
`resolveCurrentEmployee(oid, userId)` for manager/self scoping, write audit via
`createAuditEvent(db, { organizationId, entityType, entityId, action, actorId, metadata })`
(note: `action` is the constrained enum `create|update|delete|archive|restore` — workflow
detail like `"submitted"`/`"approved"` goes in `metadata`), and generate references via a
MAX+1 retry helper. Two-layer authz everywhere: AC gate + handler scope/IDOR check.

```
lifecycleRouter = {
  disciplinary: {
    categories: {
      list   (disciplinary:read)   — org-scoped, non-archived.
      create (disciplinary:create) — HR; unique name.
      archive(disciplinary:manage) — soft archive (never hard delete).
    },
    actions: {
      list   (disciplinary:read)   — ordered by severityLevel.
      create (disciplinary:create) — HR; severity 1–5 validated.
      archive(disciplinary:manage)
    },
    records: {
      list   (disciplinary:read)   — filters {employeeId?, status?, categoryId?, limit}.
                                      Scope: seesAll (HR/admin/auditor) → org; manager →
                                      own + getDirectReportIds; employee → OWN records only.
      getById(disciplinary:read)   — tenant-verify + scope check; SERVER-REDACT internalNote
                                      for the subject employee (returns canViewInternalNote flag).
      create (disciplinary:create) — HR opens a record; status 'draft'; reference DISC-NNNNNN.
      requestExplanation (disciplinary:act) — draft → explanation_requested; notify employee.
      submitExplanation  (disciplinary:explain) — employee (own) OR HR; → explained.
      takeAction (disciplinary:act) — set finalActionId/notes; → action_taken; records outcome.
      appeal     (disciplinary:appeal) — employee (own), only from action_taken; → appealed.
      resolveAppeal (disciplinary:close) — HR; → closed | overturned; appealOutcome/notes.
      close      (disciplinary:close) — HR; terminal close from action_taken (no appeal).
      update     (disciplinary:create)— edit description/category/internalNote (pre-terminal).
    },
  },

  transfers: {
    list    (transfer:read)   — filters {employeeId?, status?, limit}. Scope: HR/auditor → org;
                                manager → reports; (employees have no transfer:read).
    getById (transfer:read)   — tenant-verify + scope.
    create  (transfer:create) — draft; snapshot current work-info as the from-* values;
                                require ≥1 destination field; reference TRF-NNNNNN.
    submit  (transfer:submit) — draft → submitted (proposer = creator).
    approve (transfer:approve)— submitted → approved (HR). If effectiveFrom <= today, call the
                                internal executeTransfer (write the dated history window + close
                                prior window's effectiveTo, in a db.transaction) → effective;
                                else → scheduled.
    reject  (transfer:approve)— submitted/draft → rejected; rejectionReason required.
    cancel  (transfer:cancel) — draft/submitted/approved/scheduled → cancelled (pre-execution).
    execute (transfer:execute)— activate scheduled transfers whose effectiveFrom <= today
                                (idempotent sweep + the explicit single-id activation). Writes
                                the dated history row; emits notification + audit.
  },

  resignations: {
    list    (resignation:read)   — filters {status?, mine?, limit}. Scope: HR/auditor → org;
                                   manager → reports; employee → OWN (mine:true forces self).
    getById (resignation:read)   — tenant-verify + scope; resolves the linked offboardingCaseId
                                   into a READ-ONLY summary (status, last working day) — never
                                   re-models the checklist.
    create  (resignation:create) — employee (self) or HR; status draft → (auto-submit option).
                                   Reference RES-NNNNNN.
    submit  (resignation:approve relies on read; submit is part of create flow) — draft →
                                   submitted. (Modeled as create+submit, or a submit proc gated
                                   resignation:create for the owner.)
    approveManager (resignation:approve) — manager (scoped to report) → manager_approved.
    approveHr      (resignation:approve) — HR → hr_approved.
    handoffToOffboarding (resignation:complete) — HR; from hr_approved. In a db.transaction:
                                   create an offboardingCase(exitType='resignation', employeeId,
                                   lastWorkingDay=actual/requested, initiatedByUserId) OR link an
                                   existing one; set offboardingCaseId; status → handed_off.
                                   **This is the ONLY write that touches Offboarding, and it
                                   CREATES a case — it never mutates offboarding clearance state.**
    withdraw (resignation:withdraw) — employee (own) from draft/submitted/manager_approved →
                                   withdrawn (blocked once handed_off — exit owns it then).
    reject   (resignation:approve)  — manager/HR → rejected; reason required.
  },
}
```

**Guardrail (must be grep-provable in C, like Helpdesk/Projects/Performance/CRM):** every
`db.insert/update/delete` in `lifecycle.ts` targets a `disciplinary_*` / `employee_transfer` /
`resignation_request` table, the `employee_work_info_history` table it owns (transfer
execution), **a single sanctioned `offboardingCase` *creation*** in `handoffToOffboarding`, and
`audit_event`. **No** writes to payslip/payroll/attendance/contract/leave or to existing
offboarding clearance rows. `offboardingCaseId` / cross-module link ids are tenant-verified on
write and read-only thereafter.

---

## 6. RBAC helpers (Phase C — server + web, byte-aligned)

Add to **both** `packages/api/src/utils/role-helpers.ts` and `apps/web/src/lib/rbac.ts`
(byte-for-byte mirror; lesson #88: align to the **actual AC grant**, not spec prose). Proposed
helpers, with the manager/employee scoping enforced in the handler (helpers only gate
affordances + the handler re-check):

```ts
// Disciplinary
canManageDisciplinary(role)  = canManageHR(role)                              // catalogues, act, close
canViewDisciplinary(role)    = canManageDisciplinary(role) || manager || auditor
// employee self-service (own record explain/appeal) is gated by the AC actions
// disciplinary:explain / :appeal + handler self-scope, NOT by canViewDisciplinary.
seesAllDisciplinary(role)    = canManageHR(role) || auditor                   // vs manager=reports

// Transfers
canManageTransfers(role)     = canManageHR(role)                             // approve/execute/reject
canProposeTransfer(role)     = canManageTransfers(role) || manager            // create/submit/cancel (Q1)
canViewTransfers(role)       = canManageTransfers(role) || manager || auditor
seesAllTransfers(role)       = canManageHR(role) || auditor

// Resignations
canManageResignations(role)  = canManageHR(role)                             // HR approve/handoff/reject
canApproveResignation(role)  = canManageResignations(role) || manager         // manager approval stage
canViewResignations(role)    = canManageResignations(role) || manager || auditor || payroll_admin
canRequestResignation(role)  = canManageHR(role) || manager || employee       // resignation:create holders
seesAllResignations(role)    = canManageHR(role) || auditor || payroll_admin   // vs manager=reports, employee=self
```

These mirror the established shapes (`canManage…`/`canView…`/`seesAll…`). The `seesAll…`
helpers drive the list-scope branch (`seesAll` → whole org; manager → own + direct reports;
employee → self).

---

## 7. UI (Phase D–F)

Routes under `apps/web/src/routes/app/lifecycle/*` (TanStack Start `createFileRoute("/app/
lifecycle/…")`). Feature folder `apps/web/src/features/lifecycle/{labels,types,badge,
lifecycle-tabs}.tsx` + `apps/web/src/styles/lifecycle.css` (mirror of `helpdesk.css`/
`crm.css`, `lc-` prefix, `:focus-visible` rings — lesson #86). Reuse shared primitives from
`packages/ui`: `PageHeader`, `DataTable` (browse-list tables), `StatTile`/`StatTileGrid`
(overview tiles), `EmptyState`, `StatusBadge` — **no colour-only badges, no raw enums/ids as
user-facing labels** (UI Rule). Every list needs loading / empty / **error** states (13H
lesson: "error ≠ healthy empty desk").

### 7.1 Nav entry

Add to `apps/web/src/routes/app/route.tsx`:
- A nav item `{ key: "lifecycle", label: "Lifecycle", icon: <UserCog/GitBranch>, href:
  "/app/lifecycle", group: "Operate" }` (group `People` does not exist today; `Operate` is the
  HR/people operations group — use it, or introduce a `People` group only if the owner wants
  one).
- Visibility: add `"lifecycle"` to `MANAGER_VISIBLE_KEYS` (managers see scoped cases/transfers/
  resignations) and `EMPLOYEE_VISIBLE_KEYS` (employees reach **My** disciplinary + My
  resignation). HR/admin/auditor see it via the `isNavItemVisible` see-all default for
  unlisted admin roles. Do **not** add to recruiter/helpdesk/sales/project_manager key sets.

### 7.2 Screens

**Overview** (`/app/lifecycle`) — `lifecycle-tabs` shell + status tiles derived client-side
from the three list endpoints: open disciplinary cases, pending transfers, resignations awaiting
approval; a "Needs attention" panel (overdue explanations, transfers effective soon,
resignations in the HR queue). Employee → a landing that **links** to "My cases" / "My
resignation" (a render-time `<Navigate>` is banned — lesson #84, OrgCtx defaults role to
"employee" until membership loads).

**Disciplinary** (`/app/lifecycle/disciplinary`, `/disciplinary/$id`) — DataTable (reference /
employee / category / status / incident date), filters (status/category/employee), New-case
dialog (HR). Detail = summary grid + lifecycle action buttons gated by role/status (request
explanation, submit explanation, take action [action picker from catalogue], appeal, resolve
appeal) + **server-redacted internal-notes section** (shown only when `getById.canViewInternalNote`)
+ catalogue admin (categories/actions, HR). Employee `/my` view = own cases, explain + appeal.

**Transfers** (`/app/lifecycle/transfers`, `/transfers/$id`) — DataTable (reference / employee /
type / effectiveFrom / status), New-transfer dialog (employee + destination change set +
effective date + reason), workflow buttons (Submit / Approve / Reject / Cancel / Execute) gated
by role + status. Detail shows from→to diff + the resolved effective window + audit trail. Copy
must explain: "Past-due transfers execute on approval; future-dated ones activate on their
effective date."

**Resignations** (`/app/lifecycle/resignations`, `/resignations/$id`, employee `/my`) — DataTable
(employee / reason / requested last day / status), employee self-service "Resign" form (reason
category + last working date + notes), manager/HR approval queue, and on the detail page a
**read-only Offboarding link panel** (case status, clearance progress, settlement readiness —
pulled from the linked `offboardingCase`, with a deep-link to Offboarding; **never** an editable
checklist here). "Hand off to Offboarding" button (HR, from hr_approved).

---

## 8. Read-only links to Offboarding (do NOT duplicate it)

- Lifecycle **owns** the resignation *request* (intent, notice, approval, withdraw).
- Offboarding **owns** the exit *execution* (clearance tasks, asset return, access revocation,
  document requests, exit interview, settlement readiness, one-active-case-per-employee).
- The single seam: `resignation_request.offboardingCaseId → offboardingCase.id (set null)`,
  written **once** on HR handoff (creating the case), read-only thereafter.
- The resignation detail UI renders an Offboarding **summary** (status/last working day/
  clearance %) by reading the linked case + a deep-link into `/app/offboarding`. It does not
  render or mutate offboarding tasks/checklists/settlement.
- v1's `resignation_requests` + `exit_checklist_runs` + `exit_checklist_run_items` are
  **deliberately NOT ported** — that surface already exists as Offboarding in v2 (Migration
  Rule: identify intent, map into v2's generalized model, drop the v1 quirk of two competing
  exit workflows).

---

## 9. Build sequence

- **21?-B — Schema + migration + AC.** `schema/lifecycle.ts` (4 catalogue/record tables +
  `employee_transfer` + `resignation_request` + `employee_work_info_history` per Q5 + enums),
  migration `0028_*` (next available), add `disciplinary` resource + role grants in
  `permissions.ts`, reuse existing `transfer`/`resignation` resources, idempotent seed
  (categories, actions, a few records/transfers/resignations across statuses, ≥1 transfer with
  a resolved effective window, ≥1 resignation handed off to a seeded offboarding case). DB
  verify script (constraint catalog: org scoping, soft refs, the single offboarding seam FK,
  effective-dating columns, unique refs). Expect **audit to rise** here only if a router
  consumes the pairs — it does not yet, so `disciplinary`/`transfer`/`resignation` stay
  unconsumed until C (precedent: 13B/14B/15B). audit moves in **C**.
- **21?-C — API.** `lifecycle` router (disciplinary/transfers/resignations) consuming the AC
  pairs (first consumer of `transfer`/`resignation` → audit rises; `disciplinary` is brand-new
  → audit rises). RBAC helpers byte-aligned (§6). Two-layer authz, server-side internalNote
  redaction, manager `getDirectReportIds(oid)` scope, transactional transfer-execute + the
  single offboarding-handoff write, reference MAX+1 retry. `verify-lifecycle-api` script.
- **21?-D — UI overview + browse lists** (tiles, three DataTables, nav entry, CSS, badges).
- **21?-E — UI detail + workflows** (disciplinary lifecycle, transfer approval/execute,
  resignation approval/handoff; redacted internal notes; read-only offboarding panel).
- **21?-F — Employee self-service** (My disciplinary explain/appeal, My resignation create/
  withdraw) + Fumadocs page(s) (`administration`/`hr` module docs: Live/HR/Manager/Employee/
  Auditor tabs, RBAC table, status meanings, the "resignation ≠ offboarding" relationship).
- **21?-I — QA.** 2 parallel read-only review agents (security/RBAC/IDOR/redaction/cross-module
  guardrail + UI/a11y/copy/data). Browser-verify all relevant roles; prove: tenant isolation,
  manager scope (report vs non-report `getById` FORBIDDEN), employee self-scope, internalNote
  redaction server-side (probe absent from employee payload), the **grep-proven cross-module
  write guardrail** (only lifecycle tables + the one offboarding-case creation + audit_event),
  effective-dated transfer resolves by date, no destructive overwrite of work-info. Gates:
  check-types, build, audit count, lint baseline, web tsc, `verify-lifecycle-api`,
  `verify-lifecycle-db`, docs build.

---

## 10. Open questions + recommendations

1. **Manager transfer authority.** Grant managers `transfer:[create,submit,cancel]` (scoped to
   reports) with HR-only `approve`/`execute`? **Recommend yes** (real org behaviour; v1 was
   HR-only). Requires adding those actions to the `manager` block in `permissions.ts`.
   *Fallback:* keep managers read-only on transfers for v1 parity.
2. **Disciplinary resource granularity.** Proposed `disciplinary:[read,create,explain,act,
   appeal,close,manage]` (least-privilege, mirrors v1's verbs). **Recommend this** over a single
   `manage`, so employee self-service (`explain`/`appeal` on own record) sits behind actions the
   subject actually holds (the documents.markUploaded dead-branch lesson).
3. **Resignation vs Offboarding boundary.** Confirm the recommended split: Lifecycle owns the
   *request*, Offboarding owns the *exit*; handoff creates an `offboardingCase`. **Recommend
   this** (no duplicate exit workflow). *Alternative considered & rejected:* port v1's
   `resignation_requests` + exit-checklist tables (duplicates Offboarding, violates the Module
   Rule).
4. **Withdraw after handoff.** Once handed off to Offboarding, should withdraw still be
   possible? **Recommend no** — withdraw is blocked after `handed_off`; reversing an exit is an
   Offboarding `cancel`/`withdraw` action (it owns the case). Document this in the UI copy.
5. **Effective-dated work-info history ownership.** Does Lifecycle create
   `employee_work_info_history` (option a) or write into an HR-Core-owned table (option b)?
   **Recommend (a)** for now (Lifecycle owns the transfer + its dated outcome; HR-Core reads).
   Also confirm whether `work_location` should become a real `work_location` table reference
   (it's free-text on `employeeWorkInfo` today) — if so, that's an HR-Core change, not a
   Lifecycle one. Resolve with the HR-Core owner **before B**.
6. **Notifications.** Lifecycle events (explanation requested, transfer approved, resignation
   in HR queue) should emit in-app notifications via the existing `notifications` emit helper
   (`packages/api/.../utils/notifications.ts`). **Recommend wiring this in C** (reuses the
   `notification` resource held by all roles — no new AC, no audit change).
7. **Cron for scheduled transfers.** Because *current position resolves by date*, a future-
   dated transfer is correct without a cron. The `transfer:execute` sweep is only for flipping
   the cosmetic `scheduled → effective` status label + firing the notification/audit on the
   day. **Recommend** providing the procedure but treating the dated window — not the status
   column — as the source of truth (the explicit v1-bug avoidance).
8. **Disciplinary outcome reporting bucket.** Keep the coarse `disciplinary_outcome` enum
   alongside the tenant-configurable action catalogue so cross-tenant analytics work without
   hardcoding action names. **Recommend yes** (SaaS Architecture Rule — generalize, don't
   hardcode one org's actions).

---

## 11. Required audit question (Documentation Rule)

**Did this change require Fumadocs documentation updates?** Not yet — this is the spec ("A")
phase, which is a developer/operator doc. **Phase F must add Fumadocs pages** for the Lifecycle
module (what it does · roles & permissions · disciplinary/transfer/resignation workflows ·
status meanings · the resignation→Offboarding relationship · effective-dated transfers ·
Live/Admin/Manager/Employee/Auditor role tabs), per the standing Documentation Rule — a feature
is not complete until its Fumadocs docs are updated.
