# Phase 17H — CRM QA / RBAC / security pass (closes Phase 17)

Two parallel **read-only** review agents audited the whole CRM module (17B schema
→ 17D-G UI): one for security / RBAC / IDOR / redaction / cross-module guardrail,
one for UI / a11y / copy / data integrity.

## Result: no critical / high findings. Module guardrails held.

### Security / RBAC / guardrail (agent A) — CLEAN
- **Cross-module write guardrail HELD.** Every db write in `crm.ts` targets a
  `crm_*` table (+ shared `audit_event`); zero writes to project/payroll/
  attendance/leave/employee/user. `crm_customer_project_link.projectId` is
  written exactly once and hard-coded `null` — the soft seam stays NULL.
- **Tenant isolation** — every list/getById/mutation filters organizationId;
  every FK input (customerId, stageId, primaryContactId, relatedId) is
  tenant-verified via `assertOwned` before use; every UPDATE/archive WHERE
  carries the org filter.
- **IDOR / lateral scope** — the 1b78b62 fix is fully applied: `assertRelatedScope`
  gates notes.list/create + activities.list/create/complete by the PARENT record's
  owner scope; the no-relatedId activity feed intersects with `ownerScope`;
  leads/deals list+getById+update+convert+advanceStage+handoff all apply owner
  scope. Customers/contacts are intentionally org-shared (the private surfaces —
  notes + money — remain individually gated). No sub-resource skips scope.
- **Redaction** — money nulled for `!canSeeCrmMoney` (deals + leads); private
  notes stripped server-side in notes.list for `!canReadPrivateCrmNotes`; all
  derive from the server-resolved role, never client input.
- **RBAC byte-alignment** — the 6 helpers are byte-identical across
  `role-helpers.ts` ↔ `rbac.ts` and none over-grant vs the AC (hr_admin/recruiter/
  helpdesk/employee have NO crm grant → excluded). `canReadPrivateCrmNotes`
  exactly matches the roles holding `crm_note:read_private`.
- **Transactional integrity** — convert + handoff use `db.transaction`; re-convert
  / re-handoff / non-won-handoff / lost-without-reason all blocked; converted
  leads are read-only.

### UI / a11y / copy (agent B) — clean except fixed items
- Error-vs-empty correctly handled on the primary list pages; copy honesty good
  (handoff framed as intent/"ready to staff", not a created project; private-note
  toggle clearly "sales team only"); data correctness verified (board groups by
  stage + sums; server-driven stalled/overdue flags; formatMoney null→"—").

## Fixes applied this pass
1. **MEDIUM** — customer detail (contacts/deals/handoffs) and deal detail (notes)
   secondary queries swallowed errors as a healthy empty state → added explicit
   `isError` branches ("Couldn't load … — please try again"). (The recurring
   error-vs-empty lesson.)
2. **MEDIUM** — the private-note checkbox had no `:focus-visible` ring → added
   `.crm-section input[type="checkbox"]:focus-visible` (WCAG 2.4.7, #86).
3. **LOW** — `LostReasonDialog` lacked Escape-to-close → added (consistent with
   the other two dialogs).
4. **LOW (security agent)** — removed a redundant double money-null in dealsList
   (`redactDealMoney` spread + explicit line); kept the explicit line, dropped
   the now-unused helper. Behaviour-identical (verify-crm-api stays 34/34).

## Deferred / documented as intentional (not defects)
- **project_manager sees all deals org-wide**, not "handed-off only" as the §5.1
  matrix wording suggests. This matches the **Phase 14I decision** that
  `project_manager` is an org-wide tier (lesson #88); money + private notes stay
  gated (PM lacks `crm_note:read_private`). Wider-read, not a leak.
- **Dialog focus-trap / initial focus** — app-wide deferred pattern (13H).
- **Drag-and-drop Kanban** — the board uses an accessible per-card stage select
  (keyboard-friendly); drag reuse deferred.
- **sales_rep "sees own not others"** full proof needs an employee-linked rep
  owning a record; verify proves the deny-by-default (no-employee → empty) +
  the sub-resource IDOR blocks.
- Contacts standalone routes; pipeline-stage management UI (`canManageCrmSettings`
  gate present, surface deferred).

## Gates
check-types 3/3 · build 2/2 · audit 147/17 · web tsc 7 (0 new touched) ·
verify-crm-api **34/34** · verify-crm-db **30/30** · lint clean.

**PHASE 17 CRM COMPLETE.**
