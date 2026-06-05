# Phase 15I — Performance / PMS QA, RBAC & security pass (closes Phase 15)

Two parallel **read-only** review agents audited the whole Performance module
(15B schema → 15H auto-award): one for security / RBAC / IDOR / redaction /
cross-module guardrail, one for UI / a11y / copy / data integrity.

## Result: no critical / high findings. Module guardrails held.

### Security / RBAC / redaction (agent A) — CLEAN
- **privateManagerNotes** stripped server-side in BOTH `oneOnOnes.list` and
  `getById` for everyone except HR and the owning manager; `canViewPrivateNotes`
  is derived from the **redacted** value, not the raw row. No leak path.
- **Peer-review anonymity** — `responses.results` returns `hidden` below the
  cycle threshold, `aggregated` (no `reviewerName` field) at/above, and `raw`
  (named) only when `rawPeerView = canManageHR`. self/manager/report are named;
  only peers are anonymized. A non-HR caller (incl. the subject) cannot obtain a
  peer's identity.
- **Recognition non-monetary** — both `recognition.award` and the 15H
  objective-completion auto-award write only `recognition_point` (no money/
  currency column, no payroll/payslip/attendance FK or write). The auto-award is
  guarded to fire once (transition into completed) and only on time.
- **Cross-module guardrail** — every `db.insert/update/delete` in the router
  targets a `performance_*` table (or `audit_event`). Zero writes to
  project / asset / helpdesk / payroll / attendance / leave / employee / user.
  `key_result.linkedProjectTaskId` is tenant-verified SELECT-only on write;
  `resolveLinkedTask` is read-only.
- **RBAC byte-alignment** — all performance helpers are byte-identical between
  `apps/web/src/lib/rbac.ts` and `packages/api/src/utils/role-helpers.ts`, and
  none grant more than the actual AC grant in `permissions.ts`.
- **IDOR handler scope** — objectives / 1-on-1s / review-results enforce
  manager→direct-reports (via `getDirectReportIds(me.id, oid)`) / employee→self
  beyond the AC gate.
- **Nav visibility** — recruiter / helpdesk_agent / project_manager do not see
  the Performance nav entry; payroll_admin and auditor are read-only (no award /
  edit / complete affordances; server re-checks).

### UI / a11y / copy (agent B) — clean except two small items (both fixed)
- Recognition copy never frames points as pay/bonus; the "appreciation record
  only … not payroll or bonus pay" disclaimer is on the page, the award dialog,
  and the overview preview. `key_result` `currency` is labelled "Amount" (a
  goal-measurement unit, not money).
- No redaction-sensitive field (`objective.internalNote`, `privateManagerNotes`,
  peer identities in hidden/aggregated mode) is rendered unconditionally; the
  results panel renders only the server's mode.
- Dialogs carry `role="dialog"` + `aria-modal` + `aria-labelledby`; inputs have
  labels; badges carry text; no raw enums/IDs as primary text; no route shadow.

## Fixes applied this pass
1. **MEDIUM** — `RecognitionPreview` (overview) swallowed a query error as "no
   recognition" (error ≠ healthy empty, 13H lesson). Added an explicit `isError`
   branch.
2. **LOW** — `.pf-rating-pill` had no explicit `:focus-visible` ring (visual
   inconsistency with every other interactive element). Added it to the ring
   group (WCAG 2.4.7, lesson #86).

## Deferred / documented as intentional (not defects)
- **Upward-review feedback is named to the subject.** Only `peer` relationships
  are anonymized; a `report` reviewing their manager (an upward cycle) is shown
  named, per the documented "only peers anonymized" rule. If upward anonymity is
  ever wanted, it would be a deliberate product change.
- **A pure employee sees four self/participant tabs** (My goals, My reviews,
  1-on-1s, Recognition) — all self-scoped read surfaces with server-side
  redaction; not the management Overview/Goals/Reviews tabs.

## Gates
check-types 3/3 · build 2/2 · audit 121/15 · lint clean on changed files ·
web tsc 0 new touched-file · verify-performance-api **37/37** · verify-performance-db **25/25**.

**PHASE 15 PERFORMANCE / PMS COMPLETE.**
