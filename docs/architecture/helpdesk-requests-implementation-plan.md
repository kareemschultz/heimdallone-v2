# Helpdesk / Requests Implementation Plan — Phase 13

> **Status: 13A spec/research (docs only — NO code, schema, routes, or migration).**
> This is the module's **A** deliverable. 13B (schema) starts the code. Mirrors the
> structure of [assets-implementation-plan.md](assets-implementation-plan.md) and
> [leave-policy-engine-plan.md](leave-policy-engine-plan.md).

## 0. Core thesis + the central guardrail

Employees and managers need **one simple place** to ask for help, attach context,
track status, and get approvals. Admins/agents need **one queue** to triage,
assign, resolve, and audit.

**THE central guardrail (user directive):** Helpdesk is the **request/ticket layer
that LINKS to** Assets, Payroll, Leave, Attendance, Offboarding (and later Projects,
Finance, CRM) — **it is never a second copy of their business logic.** A helpdesk
request may *reference* and *deep-link to* a row in another module (read-only) and
record that an issue was raised, but:
- it **never** mutates `asset` / `asset_assignment` (procurement & assignment stay in Assets),
- it **never** mutates payroll (blockers stay in `payroll_issue`; pay never changes),
- it **never** corrects attendance/leave (those flows stay in their modules).

The schema expresses this with **nullable read-only link columns** on the request
(`linkedAssetId`, `linkedPayslipId`, `linkedLeaveRequestId`, …) plus a generic
`linkedEntityType` + `linkedEntityId`. The helpdesk reads those for context and
links the user across; mutations always happen in the owning module.

## 1. Research summary (benchmarks, retrieved 2026-06-03)

| product | what it teaches | fit for Heimdallone |
|---|---|---|
| **Zendesk** | 5-status lifecycle New→Open→Pending→On-hold→Solved(→Closed); SLA reply/update/resolution metrics; *Pending* (waiting on requester) pauses resolution timing. | Adopt the **pending/waiting state pauses SLA** idea; adopt response-vs-resolution split. |
| **Freshdesk** | Lean 4 statuses (Open/Pending/Resolved/Closed); Pending halts the SLA timer; configurable statuses. | Keep the **lean status set**; pending pauses SLA. |
| **Jira Service Management** | **Service request (approval + fulfillment)** vs **incident (triage + resolution)**; SLAs differ (time-to-first-response, time-to-resolution, fulfillment, approval turnaround); SLA **pauses in "Waiting for Approval."** | Adopt one unified request with an **approval flavor**; pause SLA in waiting-on-approval. |
| **ERPNext / Frappe Helpdesk** | HD Ticket carries an **SLA chosen by Type+Priority** with `First Response Due` / resolution due computed against working hours; **agent/team** assignment (team→agent). | Adopt **per-priority SLA defaults** + first-response/resolution dues; agent assignment. |
| **Zammad / osTicket / GLPI** | Mature open-source desks: states, owner/agent, priority, internal notes, canned responses, KB. GLPI ties tickets to assets/CMDB. | **GLPI's asset↔ticket link** validates the linkedAssetId pattern. Internal notes + canned responses confirmed as standard. |
| **ServiceNow** | Enterprise reference: request catalog, approval chains, CMDB, SLAs, escalation. | **Overkill for MVP** — catalogs, multi-step approval chains, CMDB are later/never. |
| **HubSpot Service Hub / Zoho Desk** | Conversational desk + KB + SLA + ticket pipelines; simple "form → ticket." | Confirms the **simple employee form → ticket** UX and **categories/pipelines**. |
| **SuiteCRM / EspoCRM cases** | Case management for customer support. | **Future-only** (customer helpdesk); MVP is the *internal* employee/agent desk. |
| **Horilla / OpenHRMS** | Internal ticket types (suggestion/complaint/service_request/anonymous), priority, dept/position/individual assignment, comments+attachments, FAQ. | The existing Heimdallone `ticket` AC + `helpdesk-spec.md` derive from this. Reframe ticket-*types* into request-*categories*; keep employee self-service + FAQ-later. |

**What's overkill for MVP:** configurable SLA-policy tables, working-hours/holiday
SLA calendars, multi-step approval chains, service catalogs, CSAT/CMDB, real-time
agent presence, customer-facing portals, ticket merging, auto-assignment rules.
**Where HR requests differ from generic helpdesk:** they are **self-identified**
(no anonymous customer), strongly **category-routed** (HR vs IT vs Payroll have
different owners/visibility), frequently need a **manager/HR/finance approval**, and
must respect **HR privacy** (internal notes hidden from the employee; payroll
visibility is finance-gated) — closer to an internal service desk than a public one.

## 2. Domain boundaries (what Helpdesk is and is NOT)

| concept | owner module | helpdesk relationship |
|---|---|---|
| **Helpdesk request / ticket** | **Helpdesk** (new) | the entity this module owns |
| **Asset request** (`asset_request`) | Assets (12C) | a helpdesk "asset support" ticket may **link** `linkedAssetId`; **procurement/assignment stays in Assets** (`asset_request`/`assignments.assign`). Do NOT duplicate. |
| **Payroll issue** (`payroll_issue`) | Payroll (8/11G) | a helpdesk "payroll question" may **link** `linkedPayslipId`/`linkedPayrollRunId`; **payroll blockers + pay stay in Payroll.** Do NOT duplicate. |
| **Leave request** (`leave_request`) | Leave (7) | a helpdesk "leave question" may **link** `linkedLeaveRequestId`; **leave approval/balance stays in Leave.** No correction here. |
| **Attendance record** | Attendance (7/11) | an "attendance correction" request may **link** an attendance record id (generic link); **correction stays in Attendance.** |
| **HR document request** (onboarding/offboarding doc requests) | Onboarding/Offboarding | a helpdesk "document request" may link an employee document; **document approval stays in its module.** |
| **Approval request** | Helpdesk (lightweight) | the **approval flavor** of a helpdesk request (waiting_on_approval → approved/rejected). NOT the offboarding/leave approvals — those stay in their modules. |
| **Project task** | Projects (Phase 14, future) | later: a request may hand off to a project task. Not in MVP. |
| **CRM / customer support case** | CRM (Phase 17, future) | later: external customer support. MVP is **internal only**. |

## 3. Recommended MVP entities — **3 tables** (lean)

Following Heimdallone conventions (cuid2 ids, `orgRef()`, `timestamps`,
`deletedAt` soft-delete, pg enums, money as numeric string where needed). The
**AC resource name stays `ticket`** (already in `permissions.ts`); the **table** is
named `helpdesk_request` for the request-layer framing (table name ≠ AC resource —
same precedent as `asset_request` under the `asset` resource).

### 3.1 `helpdesk_category` ✅ MVP
`id`, `organizationId`, `key` (enum/text — see §5), `name`, `description`,
`defaultAssigneeUserId` (FK user set null — the default owner/queue for this
category), `defaultPriority` (enum), `defaultSlaHours` (int — per-category default
SLA; per-priority overrides in code §4), `requiresApproval` (bool — e.g. some HR
categories), `isActive`, timestamps, `deletedAt`. Partial-unique `(org, name)`.

### 3.2 `helpdesk_request` ✅ MVP (the core)
`id`, `organizationId`, `reference` (human ticket no. e.g. `HD-00042`, unique per
org), `categoryId` (FK set null), `requestedByEmployeeId` (FK employee restrict —
the subject), `createdByUserId` (FK user — who logged it; = requester for self-service),
`title`, `description`, `priority` (enum low/normal/high/urgent),
`status` (enum, §4), `assignedToUserId` (FK user set null — current agent/owner),
`firstResponseDueAt` / `resolutionDueAt` (timestamp — set at creation from priority/
category, §4), `firstRespondedAt` / `resolvedAt` / `closedAt` (timestamp null),
`resolutionNote` (text null), **approval flavor:** `approvalRequired` (bool),
`approvalStatus` (enum none/pending/approved/rejected default none),
`approvedByUserId` (FK user set null), `approvalNote` (text null),
**cross-module read-only links (the guardrail):** `linkedAssetId` (FK asset set null),
`linkedPayslipId` / `linkedPayrollRunId` (FK set null), `linkedLeaveRequestId`
(FK set null), `linkedOffboardingCaseId` (FK set null), `linkedEntityType` (text
null) + `linkedEntityId` (text null — generic escape hatch, no FK, for attendance/
documents/future), timestamps, `deletedAt`.
Indexes: `(org, status)`, `(org, assignedToUserId)`, `(org, requestedByEmployeeId)`,
`(org, categoryId)`, partial-unique `(org, reference)`.

### 3.3 `helpdesk_request_comment` ✅ MVP
`id`, `organizationId`, `requestId` (FK cascade), `authorUserId` (FK user set null),
`body` (text), `isInternal` (bool default false — **internal notes**, redacted from
the requesting employee, mirrors offboarding `internalNote`), timestamps. Index
`(requestId)`. *(Status changes are recorded via `createAuditEvent` for the audit
trail; the visible timeline = comments + status badges. A dedicated activity table
is deferred — see below.)*

### Deferred (NOT in MVP, with rationale)
- **`helpdesk_request_attachment`** → metadata-only/placeholder; same "no real file
  upload yet" stance as onboarding documents + assets `imageUrl`. Wire to a real
  documents/storage layer later. (Open question §12.)
- **`helpdesk_sla_policy`** → MVP uses **per-priority code defaults** + per-category
  `defaultSlaHours` (§4), not a configurable policy table. Add the table only when
  customers need editable SLAs/business-hours calendars.
- **`helpdesk_request_status_history`** → MVP records transitions via
  `createAuditEvent`; a dedicated table is needed only for **pause-aware SLA**
  (excluding time in waiting states) — deferred to 13G.
- **`helpdesk_request_approval`** (separate table) → MVP folds a **single-step**
  approval into columns on `helpdesk_request` (§3.2). A table is needed only for
  **multi-step/parallel** approval chains — deferred.
- **`helpdesk_request_assignment`** (history) → MVP keeps a single
  `assignedToUserId`; reassignment is audited. Multi-assignee/round-robin deferred.
- **`helpdesk_knowledge_article` + `helpdesk_canned_response`** → **placeholder
  routes only** in MVP; full KB + canned responses are a later sub-phase.

Migration: a single Drizzle-generated SQL adding 3 tables + ~5 enums. Seed §10.

## 4. Status lifecycle, priority, SLA

**Status** (`helpdesk_request_status` enum) — plain-language labels in UI:
`new` "New" → `open` "Open" → `in_progress` "In progress" →
`waiting_on_employee` "Waiting on you" / `waiting_on_approval` "Waiting on approval"
→ `resolved` "Resolved" → `closed` "Closed"; plus terminal `cancelled` "Cancelled".
Transitions (validated in API):
- new → open (auto when an agent first views/assigns) → in_progress (agent working).
- in_progress ⇄ waiting_on_employee (agent asks requester) / waiting_on_approval
  (needs manager/HR/finance sign-off).
- in_progress / waiting_* → resolved (resolutionNote required) → closed (by agent or
  auto after N days). resolved → open (reopen on employee reply, like Zendesk).
- any non-terminal → cancelled (requester withdraws, or agent dupes).
**SLA pause:** `waiting_on_employee` and `waiting_on_approval` pause the resolution
clock (Zendesk/Freshdesk/Jira). *MVP note: pause-aware computation needs status
history → deferred to 13G; MVP sets due dates at creation and flags overdue/breached
against now without subtracting waiting time (documented limitation).*

**Priority** (`helpdesk_priority` enum): `low` / `normal` / `high` / `urgent`.
Per-priority default SLA (code constants, overridable by category `defaultSlaHours`):
urgent = 4h first-response / 1 business day resolution; high = 8h / 2d; normal = 1d /
5d; low = 2d / 10d (illustrative — confirm with the org before production).

**SLA state** (derived, not stored) for the UI badge: `not_applicable` (resolved/
closed/cancelled or no due) / `on_track` / `due_soon` (≤25% of window left) /
`overdue` (past due, unresolved) / `breached` (past due at resolution time). Shown
with icon + text, never colour-only (a11y).

## 5. Request categories (seeded)

`helpdesk_category_key` enum + seeded rows: **HR · Payroll · Attendance · Leave ·
Documents · Assets · IT · Facilities · Finance · General**. Each seeds a sensible
`defaultPriority`, `defaultSlaHours`, `requiresApproval` (e.g. Finance/Payroll may
default to approval), and (optionally) a `defaultAssigneeUserId` queue. Categories
are org-scoped + editable so tenants can rename/disable.

## 6. RBAC model

**Reuse the existing `ticket` AC resource** (`create / read / update / assign /
resolve / close`) — already granted: owner/admin/hr_admin/payroll_admin =
full; manager = `create,read`; employee = `create,read`; auditor = `read`;
helpdesk_agent = full. **Employee already holds `ticket:create`** → employee
self-service request creation needs **NO new action** (contrast Assets, which needed
`asset:request`). 

Helpers (backend `role-helpers.ts` + frontend `rbac.ts`, byte-aligned):
- `canViewHelpdesk` = canManageHR ∪ payroll_admin ∪ manager ∪ auditor ∪ helpdesk_agent
- `canManageHelpdesk` = canManageHR ∪ helpdesk_agent (triage/edit/categories)
- `canAssignHelpdesk` = canManageHelpdesk
- `canResolveHelpdesk` = canManageHelpdesk
- `canApproveHelpdeskRequest` = canManageHR ∪ manager ∪ payroll_admin (scoped — see below)
- `canViewHelpdeskInternalNotes` = canManageHelpdesk ∪ auditor (NOT employee, NOT plain manager unless agent)
- `canCreateHelpdeskRequest` = anyone who holds `ticket:create` (employee/manager/HR/agent/recruiter…); helper mirrors that for UI gating.

Role behaviour:
- **owner/admin:** full.
- **hr_admin:** manage HR/payroll/leave/document/general requests; sees internal notes.
- **payroll_admin:** view + work payroll/finance-category requests; **not** private HR
  internal notes unless agent; can approve finance/payroll approvals.
- **manager:** view **own + direct-report** requests; approve approvals **assigned to
  them**; create requests; **no** internal-note access by default.
- **employee:** **create + view own requests only**; never internal notes; never
  others' requests.
- **auditor:** read-only across all (incl. internal notes for audit); no mutations.
- **helpdesk_agent:** full ticket lifecycle (the IT/facilities/general agent).
- **Future roles (flagged):** dedicated **IT / Facilities agent** scoping and a
  **finance** role — see open questions §12. For MVP, helpdesk_agent + category
  visibility covers IT/Facilities.

**Two-layer authz (the 10C/12C pattern):** every FK input tenant-verified; employee
self-scoped (`resolveCurrentEmployee`); manager direct-report-scoped
(`getManagerDirectReportIds`); internal-note comments **redacted server-side** from
employees (mirror `redactCase`/`redactAsset`). Category-based visibility (e.g.
employees in IT can't see HR-private tickets) is enforced by the owner/assignee/
requester scoping, not by leaking category contents.

## 7. API plan — oRPC router `helpdesk`

New `packages/api/src/routers/helpdesk.ts`, registered as `helpdesk`. All gate on
the **existing `ticket` AC** via `authorizedProcedure("ticket", action)` + a
handler-level helper re-check + two-layer scope.

- `categories.list` (read) / `create`,`update`,`archive` (update/manage).
- `requests.list` (read) — `{ status?, categoryId?, assignedToUserId?, priority?, search?, scope?, page, pageSize }` → `{data,total,page}`; **scoped**: agents/HR/auditor see all (filterable), manager sees own+reports, employee sees own. Rows carry plain-language labels + requester/assignee **display names** (no raw ids) + SLA-state. Internal data never in list.
- `requests.getById` (read) — request + comments (internal redacted for employees) + linked-entity summaries (read-only).
- `requests.createSelf` (`ticket:create`) — employee logs own request `{ categoryId, title, description, priority?, link fields? }`; `requestedByEmployeeId` = caller; reference + due dates computed; status `new`.
- `requests.createForEmployee` (`ticket:create`, manager/HR scope) — log on behalf of a report/any (manager→reports, HR→any); employees can't reach this branch.
- `requests.update` (`ticket:update`) — title/description/category/priority (agent/HR).
- `requests.assign` (`ticket:assign`) — set `assignedToUserId`; sets status open if new; audited.
- `requests.changeStatus` (`ticket:update`) — validated transitions incl. waiting_on_employee/approval; sets firstRespondedAt on first agent action.
- `requests.resolve` (`ticket:resolve`) — → resolved, `resolutionNote` required, stamps resolvedAt + SLA-met.
- `requests.close` (`ticket:close`) — → closed.
- `requests.cancel` (`ticket:update` for agents; requester may cancel own while not terminal — reuses `ticket:create` holder + self-scope, like assets `requests.cancel`).
- `requests.reopen` (`ticket:update`) — resolved → open (e.g. on employee reply).
- `comments.list` (read, internal redacted) / `comments.create` (read+author; any participant) / `comments.createInternal` (`ticket:update` + canViewHelpdeskInternalNotes — agents/HR only).
- `approvals.decide` (`ticket:approve` **new action — open question §12**, or reuse `ticket:update` + canApproveHelpdeskRequest) — approve/reject a `waiting_on_approval` request with a note; sets approvalStatus + approvedByUserId.
- `attachments.*` — **placeholder/deferred** until storage; metadata-only stub if needed.

Every input ID tenant-verified (no IDOR on requestId/categoryId/commentId/link ids);
employee self-scoped; manager report-scoped; internal notes redacted; **link ids are
verified to belong to the org but never mutated** (the guardrail).

## 8. UI plan — routes + `HelpdeskTabs` (ModuleTabs)

> **Route-shadow gotcha:** delete the existing flat `apps/web/src/routes/app/
> helpdesk.tsx` "Coming Soon" stub before adding the folder (4th time — recruitment/
> onboarding/offboarding/assets). And the **sidebar "Helpdesk" entry** edits the
> shared `route.tsx` — now lint-clean after 12E, so it's safe (lesson #83 resolved).

`HelpdeskTabs` (gated `canViewHelpdesk`): **Overview · Requests · My requests ·
Categories · (Knowledge — later)**. Employees without `canViewHelpdesk` use the
self-service **My requests** view (no tab strip), like assets `My assets`.
Routes:
- `/app/helpdesk` — overview (stat tiles: open / waiting / overdue / mine; quick links). Non-viewers → redirect to `/app/helpdesk/my`.
- `/app/helpdesk/requests` — agent queue DataTable (filters: status/category/priority/assignee/search; SLA badge; plain-language status).
- `/app/helpdesk/requests/$id` — detail: summary, **SLA due indicator**, linked-entity panel (read-only deep links to Asset/Payslip/Leave/Offboarding), **comments timeline with internal-note separation**, assignment + status + resolve controls (agents), approval controls (approvers).
- `/app/helpdesk/my` — employee: "Request help" form + my requests + status; cancel own; reply (adds a comment).
- `/app/helpdesk/categories` — settings (create/edit/archive, default priority/SLA/approval).
- `/app/helpdesk/knowledge` — **later placeholder.**

UX: non-technical "What do you need help with?" form with a clear **category
picker**; priority badge **icon + text** (not colour-only); SLA due indicator with
plain wording ("Due in 3h" / "Overdue"); comments timeline; internal notes visually
separated + hidden from employees; empty/loading/error states; mobile-friendly; no
fake-active actions; resolve/cancel require confirm + note.

## 9. Integration plan (LINK, don't duplicate)

- **Assets:** asset-support request → `linkedAssetId`; detail shows a read-only
  custody/asset summary + a deep link to `/app/assets/inventory/$id`. **No** call to
  `assets.assignments.*` from helpdesk in MVP (procurement stays in Assets; a future
  "fulfil via Assets" action could call the Assets API intentionally).
- **Payroll:** payroll question → `linkedPayslipId`/`linkedPayrollRunId`; deep link to
  the payslip/run; **no payroll mutation, no pay change** (blockers stay in `payroll_issue`).
- **Leave / Attendance:** link `linkedLeaveRequestId` or generic `linkedEntityId`;
  deep link; **no auto-correction** (corrections stay in Leave/Attendance).
- **Offboarding:** `linkedOffboardingCaseId`; later, an offboarding clearance issue
  could *create* a linked helpdesk ticket (one-way, read-only link) — flagged future.
- **Projects (14) / Finance (16) / CRM (17):** future hand-off (request → project
  task; finance reimbursement; customer case). Generic `linkedEntityType/Id` leaves
  room without schema churn.

## 10. Seed plan (Atlas Shipping, idempotent — 13B)

10 categories (§5) + ~9 realistic requests spanning states/priorities/links:
HR document request (general); payroll question **linked to a payslip**; laptop issue
**linked to an asset** (assigned to helpdesk_agent, in_progress); access-card issue
(facilities, new); attendance-correction request (linked via generic entity, waiting_on_employee);
facilities request (open); a **waiting_on_approval** finance request (approver = manager);
a **resolved** IT request (with resolutionNote + SLA met); an **overdue** high-priority
request (due date in the past). Mix of internal + public comments to exercise redaction.
Reuse owner/admin/helpdesk@/manager@/employee@ users for author/assignee/requester.

## 11. Implementation sequence
- **13A** — this spec/research ✅.
- **13B** — DB: 3 tables + enums + migration + idempotent seed; `audit:permissions`
  unchanged (reuses `ticket` AC, no new pair) **unless** we add `ticket:approve`.
- **13C** — oRPC `helpdesk` router (categories/requests/comments/approvals) + RBAC
  helpers + two-layer authz + internal-note redaction + `verify-helpdesk-api.ts`.
- **13D** — Helpdesk overview + request-queue UI + HelpdeskTabs + sidebar entry
  (delete flat stub) + plain-language labels.
- **13E** — request detail + comments timeline + internal-note separation + linked-
  entity read-only panels + status/resolve controls.
- **13F** — employee self-service "My requests" + request form + cancel/reply.
- **13G** — assignment/triage + SLA due indicators + (pause-aware SLA via status
  history) + approvals.
- **13H** — QA/RBAC/security/browser pass (scope, internal-note redaction, no
  cross-module mutation, IDOR) → close Phase 13.

## 12. Open questions (resolve before 13B/13C)
1. **`helpdesk_agent` role:** keep it as the single agent role for MVP (IT+Facilities+
   General), or split dedicated **IT** / **Facilities** roles now? *Recommend: keep
   helpdesk_agent + category routing for MVP; split later if visibility demands.*
2. **Category visibility rules:** should HR/Payroll-category tickets be hidden from
   IT/Facilities agents (and vice-versa)? *Recommend: MVP scopes by owner/assignee/
   requester; add per-category agent ACLs later if needed.*
3. **SLA granularity:** per-**priority** (simple) or per-**category** or both?
   *Recommend: per-priority code defaults + per-category `defaultSlaHours` override.*
4. **Attachments:** metadata-only placeholder until file storage exists, or defer
   entirely? *Recommend: defer (placeholder), consistent with onboarding docs.*
5. **Approval action:** add a dedicated **`ticket:approve`** AC action (cleanest,
   audit 86→87/12), or gate approvals on `ticket:update` + `canApproveHelpdeskRequest`?
   *Recommend: add `ticket:approve` — explicit + auditable, like leave_policy:adopt.*
6. **Asset-support link target:** link to **`asset`** (the item) or **`asset_request`**
   (the procurement request)? *Recommend: link `asset` for "my laptop is broken";
   leave procurement to a separate `asset_request`. Generic link covers edge cases.*
7. **Payroll link target:** link **payslip** vs **payroll run**, or keep text-only in
   MVP? *Recommend: nullable both; deep-link read-only; never mutate.*
8. **Anonymous tickets** (Horilla had them): include now? *Recommend: defer — HR
   internal desk is self-identified; revisit for a whistleblower flow later.*

## 13. Roadmap (unchanged — future-only)
Phase **14** Projects + Tasks & Timelines · **15** Performance/PMS · **16** Finance
expansion · **17** CRM (17A spec drafted, future-only) · **18** Analytics/Exec
dashboards · **19** Enterprise QA/a11y/security · **20** Production readiness. **CRM,
Inventory (separate from Assets), and billing/packaging remain future-only.**

## Definition of done (Phase 13)
3 tables + reused `ticket` AC (+ optional `ticket:approve`); the **link-not-duplicate**
guardrail enforced in schema + API (read-only links, zero cross-module mutation);
employee self-service via existing `ticket:create`; agent queue + triage + SLA +
single-step approval; internal-note redaction; category routing; verify script +
browser RBAC pass; docs + memory updated each checkpoint. **Helpdesk never changes
pay, never mutates assets/leave/attendance — it links and tracks.**
