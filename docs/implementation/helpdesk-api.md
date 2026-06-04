# Helpdesk / Requests API (Phase 13C)

The oRPC router for the Helpdesk / Requests module. **API + RBAC layer only** — no
frontend routes in this phase (those are 13D+). Builds on the 13B schema
([helpdesk-db-setup.md](helpdesk-db-setup.md)) and the spec
([helpdesk-requests-implementation-plan.md](../architecture/helpdesk-requests-implementation-plan.md) §6–§9).

## The guardrail, enforced in code

Helpdesk **links to** Assets / Payroll / Leave / Attendance / Offboarding — it
**never mutates them.** The router has zero writes to `asset`, `payslip`,
`payroll_run`, `leave_request`, `attendance_record`, or `offboarding_case`. Link
ids are tenant-**verified** on write (SELECT-only, so no dangling/cross-tenant
link) and resolved **read-only** on the detail view. Proven by the verify script:
linking an asset to a request leaves the asset's status + assignee unchanged.

## Router — `packages/api/src/routers/helpdesk.ts`

Registered as `helpdesk` in `routers/index.ts`. Reuses the existing **`ticket` AC
resource** (no `helpdesk` resource). 20 procedures across 3 groups.

### `categories` (4)

| procedure | AC gate | notes |
|---|---|---|
| `categories.list` | `ticket:read` | active by default (`includeInactive?`); +requestCount per category. Employees can read (needed for the request form). |
| `categories.create` | `ticket:update` | + `canManageHelpdesk` re-check. Unique `(org, name)` → CONFLICT on dup. |
| `categories.update` | `ticket:update` | + `canManageHelpdesk`. name/priority/SLA/approval/assignee/isActive. |
| `categories.archive` | `ticket:update` | + `canManageHelpdesk`. **Soft-delete only** — requests keep their categoryId, never deleted. |

> `ticket` has no `manage` action, so category mutations gate on `ticket:update`
> (the management verb) + a `canManageHelpdesk` handler re-check.

### `requests` (13)

| procedure | AC gate | scope / rule |
|---|---|---|
| `requests.list` | `ticket:read` | **scoped**: agents/HR/auditor/payroll see all (filter by status/category/assignee/priority/search); manager sees own + direct reports; employee sees only own. **`mine: true`** (13F) forces self-scope (requester = caller) for ANY role — the strictest filter, used by the employee "My requests" surface so a manager/HR/agent sees only their own there, never the team queue. Defaults off (backwards-compatible). Rows carry requesterName/assigneeName/categoryName + derived `slaState`. |
| `requests.getById` | `ticket:read` | `assertRequestVisible` (same scope). Returns the request + display names + `slaState` + **redacted comments** + read-only `linkedEntities` + `canViewInternalNotes`. |
| `requests.createSelf` | `ticket:create` | requester = caller's own employee (no id input). Reference + due dates computed; approvalRequired from category. |
| `requests.createForEmployee` | `ticket:create` | HR/agent for anyone; **manager only for direct reports**; employee 403s in handler. |
| `requests.update` | `ticket:update` | + `canManageHelpdesk`. title/desc/category/priority. Blocked once closed/cancelled. |
| `requests.assign` | `ticket:assign` | + `canAssignHelpdesk`. Verifies assignee is an org member; `new`→`open`; stamps firstRespondedAt. |
| `requests.changeStatus` | `ticket:update` | + `canManageHelpdesk`. Moves between working states (open/in_progress/waiting_on_employee/waiting_on_approval); rejects from terminal/resolved (reopen first). |
| `requests.resolve` | `ticket:resolve` | + `canResolveHelpdesk`. **resolutionNote required** (min 1); stamps resolvedAt. |
| `requests.close` | `ticket:close` | + `canManageHelpdesk`. Any non-terminal → closed. |
| `requests.cancel` | `ticket:create` | requester (self) **or** `canManageHelpdesk`. Active only. |
| `requests.reopen` | `ticket:update` | + `canManageHelpdesk`. resolved/closed → open; clears resolvedAt/closedAt so SLA recomputes. |
| `requests.approve` | `ticket:approve` | + `canApproveHelpdeskRequest` + **manager scope** (assigned-to-me or my report; HR/payroll any). Only when approvalRequired && pending. |
| `requests.rejectApproval` | `ticket:approve` | as approve; **reason required** (min 1). |

### `comments` (3)

| procedure | AC gate | rule |
|---|---|---|
| `comments.list` | `ticket:read` | `assertRequestVisible`; **internal notes redacted server-side** unless `canViewHelpdeskInternalNotes`. |
| `comments.create` | `ticket:create` | participant (requester / manager-scope / agent); public note; blocked on closed/cancelled. |
| `comments.createInternal` | `ticket:update` | + `canViewHelpdeskInternalNotes` (agents/HR); `isInternal = true`; stamps firstRespondedAt. |

## RBAC helpers

Backend `packages/api/src/utils/role-helpers.ts` + frontend mirror
`apps/web/src/lib/rbac.ts` (byte-aligned). The `ticket` AC grants in
`permissions.ts` are the **source of truth**; helpers gate the handler re-check
and (frontend) UI affordances.

- `canManageHelpdesk` = canManageHR ∪ helpdesk_agent
- `canViewHelpdesk` = canManageHelpdesk ∪ manager ∪ payroll_admin ∪ auditor
- `canAssignHelpdesk` = `canResolveHelpdesk` = canManageHelpdesk
- `canApproveHelpdeskRequest` = canManageHelpdesk ∪ manager ∪ payroll_admin
- `canViewHelpdeskInternalNotes` = canManageHelpdesk ∪ auditor (**never employee/plain manager**)
- `canCreateHelpdeskRequest` = canManageHelpdesk ∪ manager ∪ employee

`seesAllRequests` (org-wide read, no requester scoping) is a **local** router
helper = canManageHelpdesk ∪ auditor ∪ payroll_admin — managers are deliberately
NOT in it (they are scoped to own + direct reports).

### Role behaviour (verified)

| role | requests | approve | internal notes | lifecycle |
|---|---|---|---|---|
| owner / admin / hr_admin / helpdesk_agent | full | ✓ | ✓ | assign/status/resolve/close/reopen |
| payroll_admin | **read all** + approve | ✓ | ✗ (no ticket:update) | ✗ |
| manager | own + reports; create/on-behalf-reports | ✓ (assigned/report scope) | ✗ | ✗ |
| employee | own only; createSelf | ✗ | ✗ | ✗ |
| auditor | read all (incl. internal notes) | ✗ | ✓ read-only | ✗ |
| recruiter | none (no ticket:read) | ✗ | ✗ | ✗ |

## Two-layer authz

1. **AC gate** — `authorizedProcedure("ticket", action)` runs Better-Auth
   `authorize`; a role lacking the verb is blocked with `Missing permission:
   ticket:<action>` (coarse, role-level). e.g. payroll/auditor/recruiter have no
   `ticket:create`.
2. **Handler re-check + lateral scope** — `canManageHelpdesk` etc. plus
   `assertRequestVisible` / direct-report / requester-self checks (fine,
   instance-level — the IDOR layer). e.g. employee holds `ticket:create` but
   `createForEmployee(other)` 403s in the handler.

Every FK input (categoryId / requestId / employeeId / assignee userId / all 6
link ids) is tenant-verified before use.

## Internal-note redaction (server-side)

`helpdesk_request_comment.isInternal = true` rows are filtered out of
`comments.list` **and** `requests.getById` for any caller who is not
`canViewHelpdeskInternalNotes` (agents/HR + read-only auditor). The flag never
leaves the server for an employee — UI hiding is not relied upon. `getById` also
returns `canViewInternalNotes` so the UI can label the section, but the data is
already gone for those who can't see it.

## Derived SLA state (never stored)

`computeSlaState(row)` returns one of `not_applicable | on_track | due_soon |
overdue | breached` at **read time** from status + `firstResponseDueAt` /
`resolutionDueAt` + `resolvedAt` + the clock. There is no SLA column. Due dates
are set at creation from per-priority defaults (`SLA_HOURS`), with the category's
`defaultSlaHours` overriding the resolution window. **MVP limitation (documented
in plan §4):** time spent in `waiting_on_*` is not subtracted (pause-aware SLA
needs status history → deferred to 13G).

## Reference allocation

`HD-000042` is allocated as `MAX(reference) + 1` per org inside `createRequestRow`,
which **retries on the `(org, reference)` unique violation** (23505) so two
concurrent creates cannot collide. The partial-unique index is the real backstop;
the loop is the friendly path.

## Permissions / audit

`ticket:approve` (added in 13B) is now consumed by `requests.approve` /
`requests.rejectApproval`. Because no router used the `ticket` resource before,
adding `helpdesk` introduces **7 `ticket` pairs** (read/create/update/assign/
resolve/close/approve) + 1 router: `audit:permissions` rose **86/12 → 93/13** and
passes (every used pair is in the statement).

## Verification — `scripts/verify-helpdesk-api.ts`

64 checks, all passing, against the live API + seed (8 sections):
1. categories list/create/update/archive, dup→CONFLICT, role gates.
2. request creation + AC gates (payroll/auditor/recruiter blocked; manager
   on-behalf-report ok, employee on-behalf-other 403).
3. list + getById scope / IDOR (employee own-only, manager report-scope,
   bogus→NOT_FOUND).
4. agent lifecycle (assign → status → resolve[note required] → reopen → close;
   comment-on-closed blocked; manager/auditor lack the verbs).
5. approvals (employee/auditor blocked at AC; payroll approves; manager
   report-scope; reject reason required; non-approval → PRECONDITION).
6. **internal-note redaction** (employee hides internal in list + getById; agent
   + auditor see internal; employee createInternal blocked; cross-request comment
   403).
7. **cross-module links** tenant-verified (4 bogus link ids → BAD_REQUEST) +
   **asset NOT mutated** by linking.
8. derived SLA state (fresh = on_track; seeded overdue = overdue; resolved =
   not_applicable).

Run: seed → restart the API server (lesson #76 — `--hot` does not mount a new
router) → `cp scripts/verify-helpdesk-api.ts apps/web/_v.ts && (cd apps/web && bun
run _v.ts); rm apps/web/_v.ts`.

## Quality gates (observed)

check-types **3/3** · build **2/2** · lint **212/1/1** (baseline unchanged) ·
audit:permissions **93/13** · verify-helpdesk-api **64/64** · ultracite clean on
changed files.

## Deferred to later checkpoints

- **13D+ UI** — HelpdeskTabs + overview/queue/detail/My-requests/categories
  (delete the flat `helpdesk.tsx` stub; add the sidebar entry).
- **Pause-aware SLA** (status-history table) — 13G.
- **Attachments, multi-step approval, knowledge base, canned responses** — later
  sub-phases (placeholders only).
- **Linked-entity label resolution** beyond the asset name — the detail view
  returns typed `{ kind, id }` deep-link refs; each module's panel resolves its
  own label in 13E.
