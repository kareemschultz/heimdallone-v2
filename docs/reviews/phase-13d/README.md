# Phase 13D — Helpdesk overview + request queue UI (browser verification)

Verified live on `:3002` (Atlas Shipping seed) across the RBAC matrix. 0 app
console errors (only the pre-existing `favicon.ico` 404). No raw enum strings, no
raw internal IDs as primary text, no internal notes anywhere in 13D.

| # | screenshot | role | result |
|---|---|---|---|
| 01 | `01-admin-overview.png` | tenant_admin | Overview: tiles (Open 2 / In progress 2 / Waiting on employee 1 / Waiting on approval 2 / Overdue 1, the Overdue tile flagged), "Needs attention" panel (overdue/urgent/waiting-on-approval/unassigned with plain-language badges + real names), quick link to the queue. **Sidebar "Helpdesk" entry visible under Operate** (LifeBuoy icon). |
| 02 | `02-admin-request-queue.png` | tenant_admin | Full queue (10 requests): reference, title+category, requester name, status/priority/SLA badges, assignee ("Marcus James"/"Unassigned"), approval ("Waiting for approval" only when required), updated date, "Linked" chip where a cross-module link exists. All four filters (status/priority/category/SLA) labelled. |
| 03 | `03-helpdesk-agent-queue.png` | helpdesk_agent | Full queue (agent sees all). |
| 04 | `04-manager-scoped-queue.png` | manager | **Scoped queue — "1 request"** (own only; admin saw 10). No leak of other employees' requests. Sidebar shows Helpdesk. |
| 05 | `05-auditor-readonly-queue.png` | auditor | Full queue, read-only (no mutation controls exist in 13D for anyone). |
| 06 | `06-employee-teaser.png` | employee | Friendly teaser — "Your requests page is on the way / your HR or helpdesk team can log a request for you." **No admin queue, no tiles, no data.** No tab strip. |
| 07 | `07-recruiter-no-access.png` | recruiter | **No "Helpdesk" sidebar entry**; direct nav to `/app/helpdesk` → "You don't have access to the helpdesk" no-access state. |

Additional checks (snapshots, not separate screenshots):
- Employee → `/app/helpdesk/requests` directly = "You don't have access to the
  request queue" EmptyState with a "Back to helpdesk" link. The list query is
  gated `enabled: canView`, so **no 403 spam** in the employee console (0 errors).
- Route-shadow fixed: flat `apps/web/src/routes/app/helpdesk.tsx` deleted; folder
  routes `/app/helpdesk` + `/app/helpdesk/requests` registered in the route tree.
- Filters are real `<select>`/`<input>` with `aria-label`s; badges always carry
  text (never colour-only); the queue is keyboard-navigable.

**No mutation controls** (assign/resolve/approve/internal-note) are present in
13D — those land in 13E/13G. No request **detail** link yet (reference/title are
plain text), so there are no broken links to the not-yet-built `$id` route.
