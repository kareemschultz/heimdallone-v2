# Phase 13E — Helpdesk request detail + comments + internal notes (browser verification)

Verified live on `:3002` (Atlas Shipping seed) across the RBAC matrix. The headline
guardrail — **internal notes are server-redacted, never UI-hidden** — was proven at
both the UI and the API layer.

| # | screenshot | role | result |
|---|---|---|---|
| 01 | `01-admin-detail.png` | tenant_admin | Full detail for HD-000003: reference + title + status/priority/SLA badges, status actions (Resolve / Close / Cancel), summary grid (category, requester, assignee, logged-by, created/updated, first-response-due, resolution-due), description, **Linked records** panel (Asset "Probe" deep-link + "Linked for context only — changes must be made in the source module"), **Conversation** (public comment + form), **Internal notes** (separated, "never the requesting employee", internal note with Lock badge + form). |
| 02 | `02-admin-public-comment-added.png` | tenant_admin | Posted a public comment → appears immediately under the requester's, attributed to "Sasha Bharrat" with timestamp; form cleared + submit re-disabled. |
| 03 | `03-admin-internal-note-added.png` | tenant_admin | Posted an internal note → appears in the (warning-tinted) Internal notes section with the Lock/Internal badge. |
| 04 | `04-employee-own-detail-no-internal.png` | employee (requester) | Own request HD-000002: sees summary, linked payslip ("Linked record"), public conversation, **a public comment form**, and only a **Cancel request** action. **No "Internal notes" section at all.** |
| 05 | `05-employee-public-comment.png` | employee | Posted a public comment on own request → appears, attributed to Rohan Gopaul. |
| 06 | `06-employee-cannot-view-others.png` | employee | Navigating to another employee's request (HD-000003) → "Request not found / This request is not available to you." (server 403 → EmptyState; 1 intentional-probe console error, `retry:false` prevents cascade). |
| 07 | `07-auditor-readonly-detail.png` | auditor | Full read-only detail: sees public **and** internal notes (audit access) but **no comment form, no internal-note form, no status actions**. |
| 08 | `08-manager-non-report-no-access.png` | manager | A non-report's request → "Request not found / not available to you." (server 403, no leak). |

## Internal-note redaction — proven server-side (the flagged guardrail)

The definitive test: as admin, an internal note was added to a request **the
employee Rohan owns** (HD-000002) containing the literal `REDACTION-PROBE`. Then,
signed in as Rohan, his own `helpdesk.requests.getById` response was inspected
directly in the browser:

```
{ status: 200, canViewInternalNotes: false, totalComments: 1,
  internalComments: 0, anyProbeText: false }
```

The internal note is **not present anywhere in the payload** Rohan's browser
received — it is stripped server-side, not hidden in the DOM. `canViewInternalNotes`
is `false`, so the UI also never renders the internal section or its form for him.

## Status & comment controls (per role, observed)

| role | resolve/close/reopen | cancel | public comment | internal note |
|---|---|---|---|---|
| admin / hr_admin / helpdesk_agent | ✓ | ✓ | ✓ | ✓ |
| auditor | ✗ | ✗ | ✗ (read-only) | ✗ (sees, can't add) |
| manager | ✗ | ✗ (see note) | ✓ (on visible requests) | ✗ (no internal section) |
| employee (requester) | ✗ | ✓ (own) | ✓ (own) | ✗ (never) |

The underlying mutations (resolve requires a note, close/cancel/reopen) are
exercised end-to-end by `scripts/verify-helpdesk-api.ts` (64/64) using the same
client calls the UI makes; 13E wires the buttons + dialogs and gates them per role.

## Notes
- Linked-context panel is **read-only** — only an Assets deep-link (gated by
  `canViewAssets`); every other module is a safe reference label with the
  "context only" disclaimer. No cross-module mutation affordances anywhere.
- Reference/title in the queue now link to the detail route (13D had them as plain
  text). 0 app console errors except the intentional 403 probes noted above.
- **Manager-cancels-own-request** is not surfaced in the UI (the cancel control
  shows for `canManage || employee`). The server would permit a manager to cancel
  a request they authored; this edge case is deferred (managers act from the
  queue). Documented, not a regression.
