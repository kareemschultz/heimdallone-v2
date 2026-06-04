# Phase 13F — Helpdesk employee My Requests self-service (browser verification)

Verified live on `:3002` (Atlas Shipping seed) across the RBAC matrix. 13F adds the
employee-facing self-service surface (`/app/helpdesk/my`): a "My requests" list, a
"Request help" form (`requests.createSelf`), own-request detail/comment reuse, and a
"My requests" tab for staff who also log their own requests. The headline guardrail —
**internal notes are server-redacted, never UI-hidden** — was re-proven for 13F.

## Screenshots

| # | file | role | result |
|---|------|------|--------|
| 01 | `01-employee-my-requests-list.png` | employee | `/app/helpdesk/my`: own requests only (server-scoped), filter pills (Open / Waiting on me / Waiting on approval / Resolved-closed / All), "Request help" button, status/priority/SLA/Linked badges, no staff tab strip. |
| 02 | `02-employee-request-help-form.png` | employee | "Request help" dialog: category picker (loaded), plain-language Summary / "Tell us what happened" / "How urgent is this?", **Send disabled while title empty** (validation). |
| 03 | `03-employee-request-help-filled.png` | employee | Form filled (IT · WiFi issue · High). Send enabled. |
| 04 | `04-employee-created-request-detail.png` | employee | After submit → navigated to the new request **HD-000022** detail: role-aware **"Back to my requests"**, Cancel-only action, summary grid, description, public Conversation form ("Visible to the requester"), success toast, **no Internal notes section**. |
| 05 | `05-employee-public-comment-no-internal.png` | employee | Posted a public comment → persists across a full reload, attributed to Rohan Gopaul; still **no Internal notes section**. |
| 06 | `06-employee-queue-blocked.png` | employee | `/app/helpdesk/requests` (global queue) → "You don't have access to the request queue" (no queue data). |
| 07 | `07-employee-other-request-blocked.png` | employee | Another employee's request (HD-000003, Shanice Powell) → "Request not found / not available to you" (server 403; role-aware back link). |
| 08 | `08-admin-overview-with-my-tab.png` | tenant_admin | `/app/helpdesk` shows the **Overview** (tiles + Needs attention) — **no redirect** — with the new **My requests** tab in the strip. |
| 09 | `09-admin-queue-intact.png` | tenant_admin | Request queue still works (22 rows), full tab strip. No regression. |
| 10 | `10-admin-my-requests-self-scoped.png` | tenant_admin | "My requests" (All) shows **only the admin's own** (0 here) — **not** the 22-row org queue. The `mine` self-scope holds. |
| 11 | `11-manager-my-requests-own-only.png` | manager | "My requests" shows only Andre Sealey's own requests; his report (Dwayne Wilson) is excluded. |
| 12 | `12-auditor-readonly-no-create.png` | auditor | `/app/helpdesk/my`: read-only — **no "Request help" button**, tab strip shows Overview/Requests only (**no My requests tab**). |
| 13 | `13-recruiter-no-access.png` | recruiter | No sidebar Helpdesk entry; `/app/helpdesk/my` → clean "You don't have access to the helpdesk" (not a generic error). |
| 14 | `14-employee-helpdesk-landing.png` | employee | `/app/helpdesk` → employee landing "Your requests live here" with **"Go to my requests"** CTA → `/app/helpdesk/my` (a link, not an auto-redirect — see note). |

## Self-scope proof (the "no team-queue leak" guardrail)

`requests.list` is role-scoped: HR/agent/admin see all, managers see own + direct
reports. A naive "My requests" over that list would mislabel the whole queue as
"mine". 13F adds an opt-in `mine: true` flag that forces the requester to the caller
**regardless of role**. Proven via the real app client, signed in as the **manager**:

```
requests.list({ mine: true })  → total 3, requesters = ["Andre Sealey"]          // own only
requests.list({})              → total 7, requesters = ["Dwayne Wilson","Andre Sealey"]  // own + report
```

The report (Dwayne Wilson) is present in the queue scope but **absent** from `mine`.
For the admin, `mine` returned 0 (Sasha authored none) rather than the 22-row org
queue. The flag defaults off — existing callers, the queue, and verify (64/64) are
unaffected.

## Internal-note redaction — re-proven server-side (the flagged guardrail)

Signed in as **Rohan (employee)**, his own `helpdesk.requests.getById` for HD-000002
(which carries the 13E `REDACTION-PROBE` internal note) was inspected via the real
oRPC client:

```
{ reference: "HD-000002", canViewInternalNotes: false,
  totalComments: 1, internalComments: 0, anyProbeText: false }
```

The internal note is **absent from the payload Rohan's browser received** — stripped
server-side, not DOM-hidden. Identical to 13E, re-confirmed for 13F.

## Server enforces self-service (defense in depth)

The UI hides affordances, but the server is the boundary — proven with direct client
calls:

| probe (real oRPC client) | result |
|---|---|
| employee `getById` on another's request | `FORBIDDEN — You do not have access to this request.` |
| auditor `createSelf` | `FORBIDDEN — Missing permission: ticket:create` |
| employee global queue / other detail | server 403 → clean EmptyState |

## Console

0 app console errors in normal flows. The intentional 403 probes (employee
cross-request, auditor create, recruiter list during the role-loading window) each
surface a single expected 403 (`retry: false` prevents cascade). One `<Toast>`
`insertBefore` error appeared once — it was a **test-harness artifact**: a manual
`evaluate` that removed Sonner's toast `<li>` nodes out from under React, not a 13F
defect (the comment it accompanied persisted across a full reload).

## Notes / deviations

- **Landing, not auto-redirect.** The 13D plan said the employee overview should
  "link to /app/helpdesk/my". An initial attempt used a render-time `<Navigate>`,
  but `OrgCtx` resolves the member role asynchronously (default `"employee"` until
  the active membership loads), so a render-time redirect bounced **viewers/admins**
  to `/my` on first paint too. The fix renders a landing that **links** to My
  requests — correct for every role, never misroutes a viewer. (Lesson recorded.)
- **My requests tab** shows only for viewers who can also create (managers/HR/agents);
  read-only viewers (auditor/payroll) don't see it. Pure employees get the single
  self-service page with no tab strip.
- **Linked context on create** is intentionally omitted from the employee form (no
  cross-module pickers) to keep self-service simple and avoid surfacing other
  modules' ids; links are still shown read-only on detail (13E) when present.
