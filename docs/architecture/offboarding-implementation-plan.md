# Offboarding Implementation Plan

**Phase 10A deliverable.** Spec-only. No code, no schema, no migrations.

Builds on conventions from Phases 5–9: tenant-scoped FKs verified in API, plain-language UX, ModuleTabs per multi-page module, snapshot-on-start (same as onboarding), normalized RBAC helpers, EmptyState for loaded-but-empty tables, evidence-first reporting.

Source references reviewed:
- `docs/horilla-extraction/offboarding.md` — Horilla model extraction
- `docs/horilla-extraction/heimdallone-domain-roadmap.md`
- `docs/architecture/recruitment-onboarding-implementation-plan.md` — pattern reference
- `docs/architecture/modules/implementation-sequence.md`
- `packages/auth/src/permissions.ts` — existing `resignation` + `transfer` resources
- `packages/db/src/schema/hr-core.ts` — `employeeProfile.isActive` as termination flag
- `packages/api/src/routers/hr-core.ts` — existing `employeeArchive` (isActive = false)
- `docs/horilla-extraction/payroll.md` — final settlement loan/advance logic

---

## Table of Contents

1. Scope
2. Design Decisions
3. Proposed Entities
4. Status Lifecycles
5. Field Mapping Reference
6. RBAC and Security
7. AC Resource Mapping
8. UI Plan
9. Integration Points
10. Implementation Sequence (10A–10H)
11. Open Questions (Answered)
12. Deferred / Out of Scope
13. Acceptance Criteria for 10A

---

## 1. Scope

### Offboarding — MVP includes

- Offboarding cases covering all exit types: resignation, termination, retirement, contract end, involuntary
- Employee-initiated resignation workflow (self-service via existing `resignation` AC resource)
- HR-initiated offboarding (terminations, contract ends, involuntary separations)
- Approval workflow for resignations (manager + HR)
- Clearance task checklist (snapshotted from template at case creation)
- Asset return tracking (free-text until Assets module ships in Phase 12)
- Access revocation tracking (free-text until IAM integrations exist)
- Document collection per offboarding case
- Exit interview (optional, private to HR by default)
- Final payroll readiness panel (read-only indicators: leave balance, loan balance, advance balance)
- Offboarding activity log (audit trail)
- Employee self-service exit view (own tasks, own documents, own resignation status)
- Manager scoped view (team exits, task completion for assigned tasks)
- Offboarding templates (reusable clearance task lists)
- `employeeProfile.isActive = false` set only on case close — not on initiation

### Offboarding — Deferred

- Actual gratuity/end-of-service benefit calculation (Phase 10G placeholder, full in payroll)
- Automated account deprovisioning (IAM integrations deferred)
- Contract termination auto-close (surface a prompt but require manual confirmation)
- Email/notification automation (Phase 14)
- Offboarding portal for the exiting employee (basic self-service only in 10F)
- Payroll final settlement generation (10G/payroll integration — link exists but settlement wizard deferred)
- Document e-signature
- Bulk offboarding (reorganization/RIF scenarios)

---

## 2. Design Decisions

### 2.1 Flat case status enum over stage-based pipeline

**Decision:** Use a flat `offboarding_case` with a `status` enum instead of Horilla's stage-based kanban pipeline.

**Why:** Horilla's pipeline model (columns = stages, employees = cards) works well for large HR teams processing dozens of exits simultaneously. Heimdallone serves Caribbean SMBs with 10-500 employees — offboarding is an infrequent, high-stakes event, not a recurring assembly line. A clearance checklist view is more appropriate than a kanban board for a 1-of-a-kind event. Flat status also mirrors the onboarding pattern already proven in Phases 9E-9G, avoids a whole new CRUD surface for stage CRUD, and simplifies analytics.

**Tradeoff:** Cannot visualize "all exits by stage" in kanban form without post-hoc grouping. Acceptable — the overview dashboard shows counts by status instead.

### 2.2 Template snapshot pattern (same as onboarding)

**Decision:** When a case is created from a template, **snapshot** template tasks into `offboarding_task` rows. Editing the template does NOT mutate active cases.

**Why:** Identical to the onboarding snapshot decision (§2.2 of recruitment-onboarding-implementation-plan.md). An employee mid-clearance has agreed to a specific checklist. Template edits retroactively changing it would create audit ambiguity.

**Mechanic:** `offboarding_task.templateTaskId` (nullable FK) + `titleSnapshot` / `descriptionSnapshot` (denormalized at creation time).

### 2.3 `dueOffsetDays` is relative to last working day (negative = before)

**Decision:** Template task `dueOffsetDays` counts FROM `lastWorkingDay`. Negative = days before. Positive = days after (for HR wrap-up tasks).

**Why:** Unlike onboarding where tasks flow *from* a start date, offboarding tasks converge *toward* the exit date. "Return laptop 2 days before last day" is natural as `dueOffsetDays = -2`. This is the cleanest way to compute absolute due dates without a separate "stage sequence" concept.

**Example:**
- Exit interview: `dueOffsetDays = -5` → 5 working days before LWD
- Asset return: `dueOffsetDays = -1` → day before LWD
- Access revocation: `dueOffsetDays = 0` → on LWD
- Payroll close: `dueOffsetDays = 5` → 5 days after LWD (HR wrap-up)

### 2.4 `employeeProfile.isActive = false` only on case close

**Decision:** The employee remains active in the system until the offboarding case is explicitly closed by HR. Initiating, approving, or even reaching the last working day does NOT automatically deactivate.

**Why:** Payroll may need to process the final month. Active employees need system access until the last day. Contracts may have notice obligations. Premature deactivation cuts access before clearance is complete, making it harder to obtain signatures and asset returns.

**Mechanic:** `offboarding.close` procedure sets `isActive = false` on `employeeProfile`. It is the one and only trigger. A UI warning is surfaced if the case's `lastWorkingDay` has passed and the case is still open.

### 2.5 Resignation uses existing `resignation` AC resource; HR management uses new `offboarding` resource

**Decision:** Reuse `resignation: ["create", "read", "approve", "complete", "withdraw"]` already in `permissions.ts` for employee-facing resignation actions. Introduce `offboarding: ["create", "read", "update", "close", "cancel", "manage_tasks", "manage_access", "manage_assets", "read_settlement"]` for the HR management layer.

**Why:** The AC already has `resignation` with the right employee-role grants (`employee: ["create", "read", "withdraw"]`, `manager: ["read", "approve"]`). Overwriting it would break the established pattern. Adding `offboarding` alongside keeps concerns separated: employees own resignations, HR owns the case.

### 2.6 Assets and access revocation as free-text records

**Decision:** `offboarding_asset_return.assetDescription` + `assetTag` are free text until Phase 12 (Assets module) ships. `offboarding_access_revocation.system` is free text until IAM integrations exist.

**Why:** Don't block offboarding MVP on Assets or IAM. The schema includes nullable FK columns (`assetId`, `iamSystemId`) that Phase 12/14 can populate. Free-text works for small teams today.

### 2.7 Exit interviews private by default

**Decision:** `offboarding_exit_interview.isPrivate = true` by default. HR must explicitly mark it shareable. Employee can never read a private exit interview.

**Why:** Exit interviews often contain candid feedback about managers, compensation, and organization culture that HR needs to review before sharing. Making private the default prevents accidental exposure.

### 2.8 Soft delete everywhere; historical data preserved

**Decision:** All tables have `deletedAt`. No hard deletes. Closed and cancelled cases remain permanently visible in history.

**Why:** Legal/audit requirement. Employment law in GY/BB/TT requires retention of exit records. Cancelled offboarding cases have audit value (HR may need to demonstrate a wrongful-termination defense).

---

## 3. Proposed Entities

### 3.1 `offboarding_case` — master record per exit event

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `organizationId` | text notNull | FK → organization |
| `employeeId` | text notNull | FK → employee_profile |
| `exitType` | enum notNull | `resignation \| termination \| retirement \| contract_end \| involuntary` |
| `exitReason` | text | Free text; required for termination/involuntary |
| `noticePeriodDays` | integer | Default from org settings or template |
| `noticePeriodStartDate` | date | When notice started |
| `lastWorkingDay` | date | Computed or overridden by HR |
| `status` | enum notNull | See §4 lifecycle |
| `initiatedByUserId` | text notNull | FK → user (who opened the case) |
| `approvedByUserId` | text | FK → user (who approved, for resignations) |
| `approvedAt` | timestamp | |
| `rejectedByUserId` | text | FK → user |
| `rejectedReason` | text | |
| `closedByUserId` | text | FK → user |
| `closedAt` | timestamp | |
| `internalNote` | text | HR-only. NOT visible to employee |
| `templateId` | text | FK → offboarding_template (snapshot source) |
| `contractId` | text | FK → contract (optional link) |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Indexes: `(organizationId, status)`, `(organizationId, employeeId)`, `(organizationId, lastWorkingDay)`

Constraint: unique `(organizationId, employeeId)` where `deletedAt IS NULL AND status NOT IN ('closed','cancelled')` — one active offboarding per employee.

### 3.2 `offboarding_template` — reusable clearance task list

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `name` | text notNull | |
| `description` | text | |
| `exitType` | enum | nullable = applies to all types |
| `isActive` | boolean | default true |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Unique: `(organizationId, name)` where `deletedAt IS NULL`

### 3.3 `offboarding_template_task` — task definition within a template

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `templateId` | text notNull | FK → offboarding_template |
| `title` | text notNull | |
| `description` | text | |
| `category` | enum notNull | `clearance \| asset_return \| access_revocation \| document \| handoff \| exit_interview \| other` |
| `defaultAssigneeRole` | text | `hr \| manager \| employee \| it \| department_head` |
| `dueOffsetDays` | integer | Default 0 (on last working day); negative = before LWD |
| `isRequired` | boolean | Default false |
| `sortOrder` | integer | |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |

### 3.4 `offboarding_task` — snapshotted task instance per case

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case |
| `templateTaskId` | text | nullable FK → offboarding_template_task |
| `titleSnapshot` | text notNull | Copied from template at creation |
| `descriptionSnapshot` | text | |
| `category` | enum notNull | Same enum as template task |
| `assigneeEmployeeId` | text | FK → employee_profile (nullable) |
| `assigneeUserId` | text | FK → user (nullable) |
| `dueAt` | date | Computed from `lastWorkingDay + dueOffsetDays` |
| `status` | enum notNull | `todo \| in_progress \| done \| skipped \| blocked` |
| `completedAt` | timestamp | |
| `completedByUserId` | text | FK → user |
| `note` | text | Completion note |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Index: `(caseId, status)`, `(organizationId, assigneeEmployeeId, status)`

### 3.5 `offboarding_asset_return` — equipment return tracking

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case |
| `assetDescription` | text notNull | Free text until Phase 12 |
| `assetTag` | text | Serial / asset tag |
| `assetId` | text | nullable FK — Phase 12 will populate |
| `expectedReturnDate` | date | |
| `returnedAt` | timestamp | |
| `condition` | text | Note on condition at return |
| `receivedByUserId` | text | FK → user |
| `status` | enum notNull | `pending \| returned \| waived` |
| `note` | text | |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### 3.6 `offboarding_access_revocation` — system access removal tracking

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case |
| `system` | text notNull | Free text: "Email", "VPN", "Slack", "HRIS", etc. |
| `description` | text | What access is being removed |
| `scheduledRevokeAt` | timestamp | When to revoke (can be in the future) |
| `revokedAt` | timestamp | |
| `revokedByUserId` | text | FK → user |
| `status` | enum notNull | `pending \| revoked \| waived` |
| `note` | text | |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### 3.7 `offboarding_document_request` — clearance document collection

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case |
| `documentType` | text notNull | e.g. "NOC", "Experience Letter", "Relieving Letter" |
| `title` | text notNull | |
| `requestedByUserId` | text notNull | FK → user |
| `fileUrl` | text | nullable; DB-sourced URLs validated via safeHttpUrl at render |
| `uploadedAt` | timestamp | |
| `approvedByUserId` | text | FK → user |
| `status` | enum notNull | `requested \| uploaded \| approved \| waived` |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### 3.8 `offboarding_exit_interview` — exit interview record

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case, unique |
| `conductedByUserId` | text | FK → user (HR interviewer) |
| `conductedAt` | timestamp | |
| `isPrivate` | boolean | Default true — HR-only unless set false |
| `overallRating` | integer | 1–5 (employee's overall satisfaction at exit) |
| `reasonForLeaving` | text | Structured free text; replaces Horilla's ExitReason model |
| `whatWentWell` | text | |
| `whatCouldImprove` | text | |
| `wouldRehire` | boolean | nullable — HR's assessment |
| `internalNotes` | text | HR-only; never sent to employee even if isPrivate = false |
| `deletedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Unique: `(caseId)` where `deletedAt IS NULL` — one interview per case.

### 3.9 `offboarding_activity` — audit trail per case

| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | |
| `organizationId` | text notNull | |
| `caseId` | text notNull | FK → offboarding_case |
| `kind` | text notNull | `case_created \| status_changed \| task_completed \| task_skipped \| asset_returned \| access_revoked \| document_uploaded \| interview_recorded \| case_closed \| case_cancelled` |
| `actorUserId` | text notNull | FK → user |
| `summary` | text notNull | Human-readable sentence |
| `metadata` | jsonb | Structured payload for UI rendering |
| `createdAt` | timestamp | |

No `deletedAt` — activity rows are immutable.

---

## 4. Status Lifecycles

### `offboarding_case.status`

```
Employee-initiated (resignation):
  pending_approval → approved → active → in_clearance → pending_settlement → closed
                  ↘ rejected (case ends; employee can re-submit)
                  ↘ (employee withdraws before approval) → withdrawn

HR-initiated (termination / contract_end / retirement / involuntary):
  active (starts here — no approval step) → in_clearance → pending_settlement → closed

Any status before closed:
  ↘ cancelled (HR can cancel a case at any point before close)
```

**State meanings:**

| Status | Meaning |
|--------|---------|
| `pending_approval` | Resignation submitted; awaiting manager/HR approval |
| `rejected` | Resignation rejected by HR (terminal; re-submit allowed) |
| `withdrawn` | Employee withdrew resignation before approval |
| `active` | Offboarding confirmed; notice period running; tasks open |
| `in_clearance` | LWD reached or passed; clearance tasks in progress |
| `pending_settlement` | Clearance tasks complete; awaiting final payroll sign-off |
| `closed` | Fully complete; `employeeProfile.isActive = false` set |
| `cancelled` | HR cancelled (wrongful start, data entry error, etc.) |

**Transition rules:**
- `pending_approval → approved`: requires `resignation:approve` (manager or HR)
- `approved → active`: automatic or manual HR trigger
- `active → in_clearance`: manual HR trigger (or auto when `lastWorkingDay` reached — Phase 14 automation deferred)
- `in_clearance → pending_settlement`: all required tasks done (or HR override)
- `pending_settlement → closed`: HR explicitly closes; triggers `isActive = false`
- Any → `cancelled`: requires `offboarding:cancel`

### `offboarding_task.status`
```
todo → in_progress → done
     ↘ skipped (with note)
     ↘ blocked (with blocker description)
```

### `offboarding_asset_return.status`
```
pending → returned | waived
```

### `offboarding_access_revocation.status`
```
pending → revoked | waived
```

### `offboarding_document_request.status`
```
requested → uploaded → approved | waived
```

---

## 5. Field Mapping Reference

### Resignation → Offboarding Case
| Resignation field | → offboarding_case |
|------------------|--------------------|
| `plannedLeaveDate` | `lastWorkingDay` (HR may override) |
| `title/description` | `exitReason` |
| `status: requested` | `status: pending_approval` |
| `status: approved` | `status: active` |
| `status: rejected` | `status: rejected` |

### Exit Type → Approval Required
| exitType | Needs approval? | Initiator |
|----------|----------------|-----------|
| `resignation` | Yes | Employee or HR |
| `termination` | No | HR only |
| `retirement` | No | HR only |
| `contract_end` | No | HR only |
| `involuntary` | No | HR only (owner/admin required) |

---

## 6. RBAC and Security

### Capability Matrix

| Capability | owner/admin/hr_admin | manager | payroll_admin | employee | auditor |
|-----------|---------------------|---------|---------------|---------|---------|
| Create case (HR-initiated) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create resignation (self) | ✓ | ✗ | ✗ | Own only | ✗ |
| Approve/reject resignation | ✓ | ✓ (own team) | ✗ | ✗ | ✗ |
| Withdraw resignation | ✓ | ✗ | ✗ | Own (pending_approval only) | ✗ |
| View case list | ✓ | Scoped | ✓ (read only) | Own only | ✓ |
| View case detail | ✓ | Scoped | ✓ | Own (limited) | ✓ |
| View `internalNote` | ✓ | ✗ | ✗ | ✗ | ✓ |
| View exit interview | ✓ | ✗ | ✗ | Own if !isPrivate | ✓ |
| Complete/skip tasks | ✓ | ✓ (assigned tasks) | ✗ | ✓ (own assigned tasks only) | ✗ |
| Mark assets returned | ✓ | ✗ | ✗ | ✗ | ✗ |
| Mark access revoked | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage templates | ✓ | ✗ | ✗ | ✗ | ✗ |
| View final payroll readiness | ✓ | ✗ | ✓ | ✗ | ✓ |
| Close case | ✓ | ✗ | ✗ | ✗ | ✗ |
| Cancel case | ✓ | ✗ | ✗ | ✗ | ✗ |

### Manager scoping
A manager may view offboarding cases for employees where `employeeWorkInfo.reportingManagerId === manager.employeeId`. Same pattern as onboarding manager scope.

### Employee view restrictions
The employee view of their own offboarding case **excludes**:
- `internalNote`
- Exit interview content when `isPrivate = true`
- `exitReason` for HR-initiated terminations (show "Position ended" or similar plain language)
- Final settlement financial details beyond leave/loan balance counts

### Involuntary exit data sensitivity
`exitType = "involuntary"` requires `isOwnerOrAdmin(role)` to create. The `exitReason` for involuntary exits is never visible to the exiting employee. HR notes (`internalNote`) are always hidden from employees regardless of exit type.

---

## 7. AC Resource Mapping

### Existing resources (reuse from permissions.ts)
```ts
resignation: ["create", "read", "approve", "complete", "withdraw"]
// Covers: employee resignation self-service + manager/HR approval
```

Already granted to all relevant roles — no changes needed.

### New resource to add
```ts
offboarding: [
  "create",        // HR opens a case
  "read",          // view case list / detail
  "update",        // edit case fields (LWD, note, etc.)
  "close",         // close case → sets isActive = false
  "cancel",        // cancel a case
  "manage_tasks",  // complete/skip tasks on behalf of assignee
  "manage_access", // mark access revocations
  "manage_assets", // mark asset returns
  "manage_docs",   // upload/approve documents
  "read_settlement", // view final payroll readiness
  "conduct_interview", // record exit interview
]
```

### Role grants (proposed)

| Role | offboarding grants |
|------|-------------------|
| tenant_owner | all |
| tenant_admin | all |
| hr_admin | all |
| payroll_admin | `["read", "read_settlement"]` |
| manager | `["read", "manage_tasks"]` |
| employee | (none — employee uses `resignation` resource) |
| auditor | `["read", "read_settlement"]` |
| recruiter | (none) |

### RBAC helper functions to add
```ts
// packages/api/src/utils/role-helpers.ts (mirror to apps/web/src/lib/rbac.ts)
canManageOffboarding(role): owner/admin/hr_admin
canViewOffboarding(role): canManageOffboarding OR manager OR auditor OR payroll_admin
```

---

## 8. UI Plan

### Routes

| Route | Who sees it | Purpose |
|-------|------------|---------|
| `/app/offboarding` | canViewOffboarding | Overview dashboard — upcoming exits, attention items |
| `/app/offboarding/cases` | canViewOffboarding | All cases list with filters |
| `/app/offboarding/cases/$id` | canViewOffboarding | Case detail — tasks, assets, access, docs, timeline |
| `/app/offboarding/templates` | canManageOffboarding | Template list + create |
| `/app/offboarding/templates/$id` | canManageOffboarding | Template detail + tasks |
| `/app/offboarding/assets` | canManageOffboarding | Cross-case asset return tracking |
| `/app/offboarding/access` | canManageOffboarding | Cross-case access revocation list |
| `/app/offboarding/my` | any authenticated | Employee self-service — own resignation + exit tasks |

### OffboardingTabs (component)
Same pattern as `RecruitmentTabs` and `OnboardingTabs`. Tabs: **Overview · Cases · Templates · Assets · Access**.
`canManageOffboarding` users see all tabs. Auditor/manager/payroll_admin see Overview + Cases.

### Overview dashboard
- Stat tiles: Active exits, Pending approval (resignations queue), Overdue tasks, Pending settlements
- "What needs attention" panel: resignations awaiting approval, cases where LWD has passed but status is still `active`, required tasks overdue, assets unreturned past LWD
- Employee card: name, exit type badge, LWD, progress (done/total tasks)
- No raw enum values as primary text — use `EXIT_TYPE_LABEL` and `STATUS_LABEL` maps

### Case detail page
Section tabs: **Overview · Tasks · Assets · Access · Documents · Interview · Activity**

- **Overview**: employee name link, exit type badge, status badge, LWD, notice period, `internalNote` (HR-only field — hidden from employee), approve/reject/cancel/close action buttons (role-gated), final payroll readiness panel (leave balance, loan balance, advance balance — read from existing HR Core / payroll APIs)
- **Tasks**: `OffboardingChecklist` — reuse or extend `TaskChecklist` from onboarding; category-grouped (clearance, asset, access, handoff, exit interview, other); due-date relative to LWD; assignee badges; complete/skip actions
- **Assets**: asset return rows with description, expected return date, status badge, "Mark returned" / "Waive" buttons (canManageOffboarding only)
- **Access**: access revocation rows with system name, scheduled revoke date, status badge, "Mark revoked" / "Waive" buttons (canManageOffboarding only)
- **Documents**: document requests with type, title, status, file link (safeHttpUrl), upload/approve/waive actions
- **Interview**: exit interview form (HR only); structured fields + free text; `isPrivate` toggle; rating 1-5
- **Activity**: chronological activity log rendered as a timeline

### Employee self-service (`/app/offboarding/my`)
Employee-facing view of their own offboarding case (if one exists):
- "Submit resignation" CTA if no active case
- Resignation form: title/reason (optional), planned leave date
- Status of submitted resignation (pending / approved / rejected)
- Their assigned tasks (limited to `assigneeEmployeeId === me.id`)
- Documents they need to provide
- Exit interview result (if `!isPrivate`)
- **Does NOT show**: internal HR notes, financial settlement, exit reason for terminations

### No fake-active controls
- "Submit resignation" button disabled if employee already has an active offboarding case
- "Close case" button disabled until `in_clearance` or `pending_settlement` status
- "Mark returned" button disabled on `returned` or `waived` items
- Asset/access rows shown with plain-language status labels (never raw enum)

---

## 9. Integration Points

### HR Core (Phase 5B)
- `offboarding_case.employeeId` → `employee_profile.id`
- On case close: `employeeProfile.isActive = false` (the ONLY trigger)
- `employeeWorkInfo.reportingManagerId` used for manager-scoped case access
- After close: employee becomes inactive; their profile remains readable (soft-delete pattern)

### Contracts (Phase 6)
- `offboarding_case.contractId` → optional FK to active contract
- On case close: UI surface prompt to "Terminate contract?" but no auto-close
- Contract termination remains a separate manual action in the Contracts module

### Payroll (Phase 8)
- Final payroll readiness panel reads:
  - Leave balance via `leave_balance` table (or leave API)
  - Outstanding loan balance via `loan_account` table
  - Advance balance via `salary_advance` table
  - Open attendance corrections
- These are **read-only indicators** in Phase 10 — final settlement generation deferred to Phase 10G
- The offboarding case ID should eventually be linkable to a final payroll run

### Recruitment → Onboarding → Offboarding
- `offboarding_case.employeeId` can trace back to the employee's creation source (convertedEmployeeId on candidate) but no direct FK — the connection is through `employee_profile`
- No data dependency between recruitment and offboarding modules

### Assets (Phase 12)
- `offboarding_asset_return.assetId` nullable FK reserved for Phase 12
- Phase 12 will populate this FK when the asset return is linked to an asset record
- For now: free-text `assetDescription` + `assetTag`

### IAM / Account Provisioning (Phase 14+)
- `offboarding_access_revocation` tracks systems as free text with manual status
- No automated deprovisioning in Phase 10
- Future: Phase 14 automations can trigger webhooks to Okta/AD/GSuite based on `scheduledRevokeAt`

---

## 10. Implementation Sequence (10A–10H)

### 10A — Spec (this document)
Deliverable: `docs/architecture/offboarding-implementation-plan.md`

### 10B — Offboarding DB schema + migration + seed
Deliverable: `packages/db/src/schema/offboarding.ts` (9 tables, ~7 enums)
- Migration: `0010_offboarding.sql`
- Seed: `scripts/seed-offboarding.ts` — Atlas Shipping demo with 3 offboarding cases (1 resignation approved+active, 1 termination in_clearance, 1 contract_end pending_settlement), 2 templates (Standard Clearance, Management Handoff), clearance tasks in various statuses, 1 exit interview, asset + access rows
- Quality gates: check-types, build, lint 225 baseline

### 10C — Offboarding oRPC API
Deliverable: `packages/api/src/routers/offboarding.ts` registered in index.ts
Groups:
- `cases` (create, get, list, update, approve, reject, withdraw, activate, advance, close, cancel)
- `templates` (list, get, create, update, archive)
- `templateTasks` (list, create, update, delete, reorder)
- `tasks` (list, get, complete, skip, block, reassign)
- `assetReturns` (list, create, markReturned, waive, delete)
- `accessRevocations` (list, create, markRevoked, waive, delete)
- `documentRequests` (list, create, markUploaded, approve, waive, delete)
- `exitInterview` (get, upsert)
- `activity` (list)

Add `offboarding` resource to `permissions.ts` + grants.
Add `canManageOffboarding` / `canViewOffboarding` helpers.
Verify with `bun run audit:permissions`.

### 10D — Offboarding UI: overview, cases list, templates
Deliverable: Routes `/app/offboarding`, `/app/offboarding/cases`, `/app/offboarding/templates`, `/app/offboarding/templates/$id`
- `OffboardingTabs` component
- Overview dashboard (stat tiles + attention panel)
- Cases list with status filters and exit-type filter
- Template list + create dialog
- Template detail with task editor

### 10E — Case detail: tasks, assets, access, documents, interview, activity
Deliverable: `/app/offboarding/cases/$id` with all section tabs
- OffboardingChecklist (reuse/extend TaskChecklist)
- Asset return rows with mark-returned / waive actions
- Access revocation rows with mark-revoked / waive actions
- Document requests with upload/approve/waive
- Exit interview form (HR-only)
- Activity timeline

### 10F — Employee self-service + manager approval
Deliverable: `/app/offboarding/my`, manager scoped view on cases list
- Resignation submission form
- Employee's own task list
- Manager approval UI (approve/reject with reason)

### 10G — Final payroll readiness (payroll linkage placeholder)
Deliverable: Settlement readiness panel on case overview tab
- Leave balance indicator (reads leave API)
- Outstanding loan indicator
- Outstanding advance indicator
- "Final settlement blocked by X" reasons
- Note: Settlement generation itself is deferred to payroll integration work

### 10H — QA/RBAC/security/browser pass
- RBAC matrix verification (all 8 roles × all capabilities)
- Tenant-FK audit (every input FK verified)
- URL/XSS audit (fileUrl through safeHttpUrl)
- Employee view restrictions verified (internalNote hidden, isPrivate interview hidden)
- Browser screenshots (all key pages, 3+ roles)
- Quality gates: check-types, build, lint 225, audit:permissions
- Commit: `chore: Phase 10H — offboarding QA/RBAC/security pass`

---

## 11. Open Questions (Answered)

| # | Question | Decision |
|---|---------|---------|
| 1 | Should employee be allowed to initiate resignation? | **Yes.** Employee submits via `resignation:create`. HR/manager approves. |
| 2 | Should manager be allowed to initiate offboarding? | **No** — terminations/etc. require HR. Manager can only approve resignations. |
| 3 | Is offboarding approval required? | **Yes for resignations, no for HR-initiated.** HR-initiated cases start at `active`. |
| 4 | Should offboarding auto-update employee status? | **Only on explicit close.** `isActive = false` fires only when HR closes the case. |
| 5 | Should exit interviews be private to HR? | **Yes, default private.** HR can toggle `isPrivate = false` to share summary with employee. Employee never sees `internalNotes`. |
| 6 | What final payroll data shown now? | **Read-only indicators only.** Leave/loan/advance balances surfaced as readiness flags. Settlement generation deferred to 10G. |
| 7 | How are assets represented before Phase 12? | **Free text** (`assetDescription + assetTag`). `assetId` FK column reserved for Phase 12 wiring. |
| 8 | How is IT/access revocation tracked before IAM? | **Free text** (`system` column). Phase 14 automations can trigger webhooks later. |
| 9 | Should contract termination happen automatically? | **No.** Offboarding close surfaces a prompt "Terminate active contract?" — HR must confirm manually in the Contracts module. |
| 10 | What is the notice period model? | `noticePeriodDays` on the case; `lastWorkingDay = noticePeriodStartDate + noticePeriodDays` (HR can override). |
| 11 | Can employee see internal HR notes? | **Never.** `internalNote` is excluded from all employee-facing API responses. |
| 12 | What happens to exit type "involuntary"? | Requires `isOwnerOrAdmin`. `exitReason` hidden from employee view. |

---

## 12. Deferred / Out of Scope

| Feature | When | Why |
|---------|------|-----|
| Exit interview structured question templates | Phase 13/Performance | Shares question framework with PMS appraisals |
| Final settlement generation (gratuity, encashment) | Phase 10G / payroll | Requires payroll engine extension |
| Contract auto-termination | Contracts integration | Separate confirmation required; no auto-close |
| Automated account deprovisioning | Phase 14 automations | IAM integrations not yet designed |
| Bulk offboarding (RIF/layoffs) | Post-Phase 12 | Requires bulk operations pattern |
| Offboarding portal email invite | Phase 14 | Notification engine deferred |
| Document e-signature | Post-Phase 13 | No e-sign vendor chosen yet |
| Assets module FK link | Phase 12 | Column reserved; wiring deferred |
| Background check clearance | Post-Phase 12 | Compliance module scope |

---

## 13. Acceptance Criteria for 10A

- [x] Plan document created at `docs/architecture/offboarding-implementation-plan.md`
- [x] 9 entities proposed with all columns, types, and constraints
- [x] Status lifecycles defined for all 5 enums
- [x] RBAC capability matrix covers all 8 roles × all capabilities
- [x] AC resource mapping defines new `offboarding` resource + proposed grants
- [x] UI routes and section tabs planned for all pages
- [x] Integration points documented for HR Core, Contracts, Payroll, Assets, IAM
- [x] 12 open questions answered with clear decisions
- [x] Implementation sequence 10A–10H defined with deliverables
- [x] Deferred features listed with rationale
- [x] `dueOffsetDays` relative-to-LWD convention documented
- [x] Employee view restrictions documented (internalNote, isPrivate interview, involuntary exitReason)
- [x] `employeeProfile.isActive = false` trigger documented (case close only)
- [x] Cheyenne Phillips (Phase 9H demo data) noted — no offboarding risk (converted, not offboarded)
