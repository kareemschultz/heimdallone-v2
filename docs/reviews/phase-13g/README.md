# Phase 13G — Helpdesk assignment, SLA & approvals workflow (browser verification)

Verified live on `:3002` (Atlas Shipping seed) across the RBAC matrix. 13G adds the
workflow layer: assignment controls (assign to me / teammate / unassign + an
"Assigned to me" / "Unassigned" queue filter), friendly status transitions, an
approval/rejection panel (gated on `ticket:approve`, **never** `ticket:update`), a
human SLA panel, and requester-facing status copy on the employee surface.

## API additions (all reuse existing `ticket` AC pairs → audit stays 93/13)

| addition | gate | purpose |
|---|---|---|
| `requests.list` `assignedToMe` filter | `ticket:read` | server resolves assignee = caller (no client userId) |
| `requests.list` `unassigned` filter | `ticket:read` | assignee IS NULL |
| `requests.assignToMe` | `ticket:assign` | self-assign |
| `requests.unassign` | `ticket:assign` | clear assignee → unassigned pool |
| `requests.assignableAgents` | `ticket:assign` | teammate picker (members in helpdesk-capable roles; userId/name/role only) |

`verify-helpdesk-api.ts` expanded 64 → **79** (new section 9: agent picker, assignToMe
lifecycle, assignedToMe/unassigned filters, teammate assign, unassign, and the
employee/manager/auditor negatives). Approvals remain on the dedicated
`ticket:approve` action — unchanged.

## Screenshots

| # | file | role | result |
|---|------|------|--------|
| 01 | `01-admin-queue-assigned-to-me.png` | admin | Queue with the new **Filter by assignment** dropdown set to "Assigned to me" → 5 rows, all assigned to Sasha Bharrat (server-side `assignedToMe`). |
| 02 | `02-admin-detail-workflow-controls.png` | admin | Detail with the full workflow: status transitions (Start work / Waiting on employee / Send for approval / Resolve / Close / Cancel), the **Assignment** panel (Assign to me / Assign teammate), and the **Service level** (SLA) panel. |
| 03 | `03-admin-assign-teammate-picker.png` | admin | Teammate picker — the assignable pool (Lia Roberts · HR, Marcus James · Helpdesk agent, Maya Persaud · Owner, Sasha Bharrat · Admin); names + role labels, **no raw IDs**; Assign disabled until selected. |
| 04 | `04-admin-status-transition-inprogress.png` | admin | After "Start work" → status badge "In progress"; "Start work" correctly drops from the bar (current status hidden). |
| 05 | `05-admin-approval-panel-pending.png` | admin | Pending-approval request (Finance) → Approval panel "Waiting for approval" + Approve / Reject. |
| 06 | `06-admin-reject-reason-required.png` | admin | Reject dialog — "Reason (shared with the requester)"; **"Reject request" disabled until a reason is entered**. |
| 07 | `07-auditor-readonly-detail.png` | auditor | Read-only — **no** status/workflow buttons, **no** approve/reject, **no** assignment controls; sees approval state + SLA + internal notes (audit access). |
| 08 | `08-payroll-approval-view.png` | payroll_admin | Approve / Reject present (payroll can approve finance); **no** assignment controls, **no** status workflow, **no** internal notes, **no** public-comment form. |
| 09 | `09-manager-scoped-approval.png` | manager | On their **direct report's** (Dwayne) pending finance request → Approve / Reject + public comment; **no** assignment, **no** status workflow, **no** internal notes. |
| 10 | `10-employee-my-requests-friendly-status.png` | employee | My requests "Waiting on me" → friendly copy **"Waiting for your reply."** |
| 11 | `11-employee-waiting-respond-no-internal.png` | employee | Own waiting-on-employee request → **only "Cancel request"**, a public reply form, the SLA "waiting" note; **no** assignment / approval / status-workflow controls and **no internal notes**. |

## Round-trips proven in the browser (real UI clicks)

- **Assign to me** → "Assigned to Sasha Bharrat" (panel + summary), Unassign appears.
- **Assign teammate** (Marcus James) → "Assigned to Marcus James".
- **Start work** → status "In progress".
- **Reject** (with reason) → "Rejected by Sasha Bharrat — <reason>", buttons gone.
- **Approve** (as payroll) → "Approved by Devon Clarke".

## Scope & defense-in-depth (real oRPC client, signed in per role)

| probe | result |
|---|---|
| manager `getById` on a non-report's request | `FORBIDDEN` (can't even load it) |
| manager `assignToMe` | blocked — `ticket:assign` (managers can't assign) |
| employee `changeStatus` / `assignToMe` / `approve` / `assignableAgents` | blocked — `ticket:update` / `ticket:assign` / `ticket:approve` / `ticket:assign` |
| employee public comment on own request | **OK** (employees can reply) |
| auditor (UI) | zero mutating affordances rendered |

The UI hides controls per role, but **the server is the boundary** — every workflow
mutation re-checks the AC gate plus the handler scope (`assertRequestVisible`,
`assertCanDecideApproval`).

## SLA — honest, not paused (documented limitation)

SLA state stays **derived at read time** (never stored). The MVP clock does **not**
subtract time spent in `waiting_on_employee`; rather than silently mis-state the
target, the SLA panel surfaces this explicitly: *"Waiting on the employee — follow-up
is paused until they reply. (Time spent waiting is not yet subtracted from the targets
above.)"* A status-history-backed pause is deferred (would need a new table — out of
scope for 13G per the plan).

## Notes / deviations

- **Queue actions are intentionally read-only** (no per-row assign/approve). All
  workflow mutations live on the detail page, per the plan's "prefer detail-page
  actions if queue actions risk complexity."
- **Payroll approves any category** (not finance-only). The current API grants
  payroll_admin approval on any request; a category restriction is a policy choice
  deferred to a later phase (the plan allowed "if API/policy supports this").
- Console: 0 app errors in normal flows; the role-scope/defense probes above each
  surface one expected AC/scope error (no `retry` cascade).
