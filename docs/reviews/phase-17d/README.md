# Phase 17D–17G — CRM UI (dashboard · leads · customers · deals pipeline · activities)

The CRM product-group surface on the 17C router. New **CRM** sidebar group
(Handshake icon) visible to `canViewCrm` (owner/admin/sales_admin/sales_rep/
manager/payroll_admin/auditor/project_manager); employees/recruiter/helpdesk
never see it. Routes under `/app/crm/{index, leads, leads/$id, customers,
customers/$id, deals, deals/$id, activities}` + `CrmTabs`.

The planned 17D–17G checkpoints are delivered in one verified pass (dashboard +
leads = 17D, customers = 17D, deals pipeline + activities = 17E, deal/lead/
customer detail + handoff = 17F). Also adds a `SALES_VISIBLE_KEYS` nav set so the
new sales_admin/sales_rep roles get a scoped sidebar (isNavItemVisible otherwise
defaults unknown roles to see-all).

## Browser-verified (3 roles, 4 screenshots; server :3000 + web :3002)

- **admin** (`admin-dashboard.png`, `admin-pipeline.png`):
  - Dashboard tiles with REAL data — 3 open deals, **GYD 10,200,000** open value,
    3 leads to work, 1 won, 1 stalled, 1 overdue; "What needs attention" panel
    (stalled deal + overdue follow-up).
  - Pipeline board — 6 stage columns (New/Qualified/Proposal/Negotiation/Won/
    Lost) with per-column count + value total; 5 deal cards; stalled badge;
    "Create handoff" correctly HIDDEN on the already-handed-off won deal.
  - **Stage-move WRITE** — moved "Fleet GPS rollout" New → Qualified via the card
    select; board re-rendered (New empty, Qualified holds it).
- **sales_admin** (`salesadmin-dashboard.png`): scoped sidebar (4 entries — CRM
  yes; payroll/employees NO), full CRM dashboard (6 tiles). Proves the new-role
  nav gating + seesAllCrm.
- **employee** (`employee-no-access.png`): NO CRM nav entry + "You don't have
  access to CRM" no-access state.

0 app console errors on fresh navigation (favicon 404 only). Transient vite HMR
`AppRouteRouteImport-before-init` errors appeared *during* route-file edits and
self-healed on reload — the known flake (14E precedent); full `bun run build`
clean 2/2.

## Carried in this pass
The 17C **sub-resource IDOR fix** (notes/activities parent-scope + contact FK
tenant-verify, commit 1b78b62) was committed separately just before this UI.

## Gates
check-types 3/3 · build 2/2 · audit 147/17 · web tsc 7 (0 new touched) ·
verify-crm-api 34/34 · verify-crm-db 30/30 · lint clean on changed files.

## Deferred (documented)
- Drag-and-drop Kanban: the board uses an accessible per-card stage **select**
  (move-to-stage) rather than the recruitment drag KanbanBoard — simpler +
  keyboard-friendly; drag reuse is a future enhancement.
- Contacts list/detail as standalone routes (contacts shown on customer detail).
- sales_rep "sees own not others" full proof needs an employee-linked rep
  owning a record → 17H browser pass.
