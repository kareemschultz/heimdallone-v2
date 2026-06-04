# Phase 13H — Helpdesk module QA / RBAC / security / browser pass (closes Phase 13)

A full module-wide hardening pass over the Helpdesk surface (routes `app/helpdesk`,
`/requests`, `/requests/$id`, `/my`; router `helpdesk`; permissions; RBAC mirror).
Four read-only review agents swept security/RBAC/IDOR/redaction, UI/UX/a11y/copy,
integration boundaries, and API/data consistency. Findings were triaged into
sequential small fixes vs. documented deferrals. No new features.

## Read-only audit — headline results

- **Integration boundary: GUARDRAIL HELD, zero violations.** Every UI mutation calls
  only `client.helpdesk.*`; the router writes only `helpdeskCategory` /
  `helpdeskRequest` / `helpdeskRequestComment` + audit events; all `verifyLinked*`
  helpers are SELECT-only; the 6 cross-module link FKs are `ON DELETE SET NULL`,
  requester is `RESTRICT`; the linked-context UI is read-only with the "context only"
  disclaimer.
- **Security/RBAC: no critical/high/medium.** Tenant isolation on every id input,
  lateral scope on every employee/manager-reachable read, internal-note redaction
  server-side in BOTH `comments.list` and `getById`, approve/reject gated on
  `ticket:approve` (not `ticket:update`), RBAC helpers byte-aligned front/back,
  permission grants match the matrix. Two LOW defense-in-depth items found (fixed).
- **API/data consistency: no authz-bypass / corruption bugs.** Status machine guards,
  SLA derivation purity, approval guards, null handling all confirmed. One LOW
  robustness item (reference allocation on non-`HD-` data) documented + deferred.

## Fixes made (all small, sequential, verified)

| # | severity | fix | file |
|---|---|---|---|
| 1 | low (IDOR hardening) | `getDirectReportIds` gained an optional `organizationId` filter; helpdesk's 4 call sites pass `oid` so a manager's report set can never widen via a cross-tenant `reportingManagerId` pointer | `utils/employee-scope.ts`, `routers/helpdesk.ts` |
| 2 | low (defense-in-depth) | `assertCanDecideApproval` now throws explicitly for any non-`manager` role instead of treating "everything else" as a manager | `routers/helpdesk.ts` |
| 3 | medium (UX) | overview now shows a skeleton while loading and a friendly error state — an error no longer looks like a healthy empty desk | `app/helpdesk/index.tsx` |
| 4 | medium (a11y) | the two dialogs missing `aria-labelledby` (`ConfirmDialog`, `RequestHelpDialog`) now have it, matching the three siblings | `request-status-actions.tsx`, `my.tsx` |
| 5 | medium (a11y, WCAG 2.4.7) | restored a visible `:focus-visible` outline on search / filter / field inputs / pills / tabs / cards (they cleared the default outline with no replacement) | `styles/helpdesk.css` |
| 6 | low (copy) | internal-note disclaimer changed from "Only the helpdesk team" to "the helpdesk team and authorized reviewers" — accurate re: auditor/payroll read access | `request-comments.tsx` |
| 7 | clarity | added a code comment documenting the intentional internal-note-on-terminal asymmetry | `routers/helpdesk.ts` |

`scripts/verify-helpdesk-api.ts` expanded **79 → 96** (new section 10: cancel
lifecycle + authz, every cancelled-terminal transition/comment blocked, internal-note
allowed on closed while public blocked, `changeStatus` to each working state, `update`
edit + terminal block, and `mine:true` self-scoping a manage-level caller).

## Documented + deferred (not fixed — out of scope for a QA pass)

- **Reference allocation** uses a lexical `MAX(reference)` + digit-strip; safe for the
  `HD-NNNNNN` format (zero-padded → lexical==numeric) but could spin the retry loop on
  imported/custom non-numeric references, or break ordering past 999,999. The
  `(org, reference)` unique index is the correctness backstop (no corruption — at worst
  a spurious error on unsupported input, which the system never generates). Deferred.
- **Dialog focus-trap / Escape-to-close / backdrop-dismiss** — a module-wide (in fact
  app-wide) dialog-pattern enhancement; the `hd-sheet` shell matches the rest of the
  app. Deferred to a cross-app a11y pass rather than a one-module divergence.
- **SLA waiting-state pause** (status_history table), attachments/upload, knowledge
  base, multi-step approvals, category-specific approver/visibility rules — all
  pre-declared Phase-13 deferrals; unchanged.
- The same `organizationId` hardening (fix #1) would benefit onboarding / offboarding /
  recruitment callers of `getDirectReportIds`; left to a future cross-module pass
  (the param is now optional, so those paths are unchanged).

## RBAC / security matrix (browser + real-client, this pass)

| role | overview | queue | detail | my | mutations |
|---|---|---|---|---|---|
| admin / owner | full (tiles+attention) | full (68) + filters | full workflow | self-scoped | all |
| helpdesk_agent | full | full | full workflow + internal notes | — | all |
| payroll_admin | view | view | **approve/reject only** — no assign/status/internal/comment | — | approve only |
| manager | scoped | **own + reports only** | report ✓ / **non-report FORBIDDEN** | self-scoped | approve(scoped)+comment; **no assign/status** |
| auditor | view | view | read-only — sees internal, **zero buttons** | — | none |
| employee | landing→/my | **blocked** | own only, **no internal**, Cancel+reply | self-service | createSelf/comment/cancel-own |
| recruiter | **no access** | no access | no access | no access | none |

## Guardrail proofs (real oRPC client, per role)

- **Internal-note redaction (server-side):** employee Rohan's own `getById` for
  HD-000002 → `{ canViewInternalNotes: false, internalComments: 0, anyProbeText: false }`;
  `comments.list` for the same → no internal leak.
- **Employee IDOR:** employee `getById` on a non-own request → `FORBIDDEN`.
- **Manager IDOR (after the fix #1 hardening — behavior preserved):** manager queue =
  Dwayne (report) + Andre (self) only; a report's `getById` → **OK (HD-000085)**; a
  non-report's `getById` → **FORBIDDEN**.
- **No-mutation:** confirmed by the integration-boundary agent (zero writes to any
  linked module) and by the existing verify check that the linked asset is unmutated.

## Screenshots (`docs/reviews/phase-13h/`)

01 admin overview · 02 admin queue filters · 03 admin detail workflow · 04
helpdesk_agent workflow (assign + internal notes) · 05 payroll approval view · 06
manager scoped queue · 07 auditor read-only · 08 employee My Requests · 09 employee
detail (no internal notes) · 10 employee blocked from queue · 11 recruiter no-access.

## Quality gates

check-types **3/3** · build **2/2** · lint **212/1/1** (unchanged) ·
audit:permissions **93/13** (unchanged) · verify-helpdesk-api **96/96** (expanded from
79) · web tsc **25** (all pre-existing — 0 in touched files) · ultracite clean on
changed files. 0 app console errors except the intentional IDOR/scope probes (each one
expected 403, no cascade).

## Phase 13 closure

Helpdesk / Requests is **COMPLETE** (13A spec → 13B DB → 13C API → 13D overview+queue →
13E detail/comments/internal-notes → 13F employee self-service → 13G workflow → 13H QA).
The module is the request/ticket LAYER that links to (never mutates) Assets / Payroll /
Leave / Attendance / Offboarding; internal notes are server-redacted; RBAC + IDOR
boundaries are verified at the AC gate and handler scope. **Next per roadmap: Phase 14
— Projects + Tasks.**
