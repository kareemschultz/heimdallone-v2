# Implementation Sequence — Module Build Order

## Recommended Order

```
Phase 5B:  HR Core (employees, org settings, documents, audit) ✅
Phase 6:   Contracts ✅ (6A-6E complete, verified end-to-end)
Phase 7:   Attendance + Leave ✅
Phase 8:   Payroll ✅ (8A–8K + 8J.1 module-tabs / UX clarity polish + 8J.2 role normalization)
Phase 9:   Recruitment + Onboarding ← IN PROGRESS (9A spec ✅, 9B DB ✅, 9C API ✅, 9D UI ✅ + QA pass ✅, 9E onboarding DB schema + seed ✅; 9F onboarding API next → 9G UI → 9H candidate→employee conversion → 9I QA/hardening)
Phase 9:   Recruitment + Onboarding (can parallelize)
Phase 10:  Offboarding
Phase 11:  Biometric + Geofencing
Phase 12:  Assets + Helpdesk + Projects (can parallelize)
Phase 13:  Performance / PMS
Phase 14:  Automations + Notifications
Phase 15:  Analytics + Dashboards + Reports
```

### Phase Status (2026-05-28 — Phase 9A complete)
- **Phase 5**: ✅ HR Core MVP complete (employees, org settings, holidays, RBAC)
- **Phase 6**: ✅ Contracts complete (schema, API, UI — verified; 6E QA/docs closure done)
- **Phase 6E**: ✅ Payroll/attendance/leave/biometric spec enrichment, GRA 2026 rates verified, gy-taxcalc + v1 inspected
- **Phase 7**: ✅ Attendance + Leave complete (schema, API, UI, QA/security pass — 7A through 7H)
- **Phase 8A**: ✅ Payroll spec finalization — [payroll-implementation-plan.md](../payroll-implementation-plan.md)
- **Phase 8B**: ✅ Payroll DB schema + migration + seed (12 tables, 12 enums, GY 2026 profile)
- **Phase 8C**: ✅ Payroll calculation engine (`packages/payroll-engine/`) — 17 tests, 76 assertions
- **Phase 8D**: ✅ Payroll oRPC API — 10 router groups, ~60 procedures, PayrollInput builder, engine integration
- **Phase 8E**: ✅ Payroll settings + pay items UI — 5 routes (dashboard, settings, pay-items, loans, reimbursements), setup checklist
- **Phase 8F**: ✅ Payroll run wizard — 5-step wizard, preview generation, blockers/warnings, payslip detail
- **Phase 8G**: ✅ Payslip list/detail + print-ready layout, employee self-service
- **Phase 8H**: ✅ Payroll analytics/reports dashboard — metrics, department costs, issues, export placeholders
- **Phase 8I**: ✅ QA/RBAC/compliance pass — 9 tenant-FK security fixes, browser-verified all 8 payroll pages
- **Phase 8J**: ✅ Branding, templates, onboarding polish — checklist badges, helper copy, compliance notes, template selector
- **Phase 8K**: ✅ Payment batch + generic CSV bank export — schema, API, UI, batch lifecycle
- **Phase 8J.2**: ✅ Role string normalization + EmptyState primitive + payslip filter labels — fixes top 3 findings from the 8J.1 screenshot UX audit. Centralized RBAC helpers in `apps/web/src/lib/rbac.ts` and `packages/api/src/utils/role-helpers.ts` accept both Better Auth defaults (`owner`/`admin`) and our custom roles (`tenant_owner`/`tenant_admin`); 12+ frontend/backend files migrated off inline role arrays. `<EmptyState />` primitive shipped and applied to Pay Items / Loans / Reimbursements. Payslip segmented filters now display `Preview / Finalized / Paid` (consistent with the badge labels). HR sync chip got a tooltip and "Last HR sync" prefix. `scripts/seed-dev.ts` now promotes the org creator's membership to `tenant_owner` so future seeds match the ACL.
- **Phase 8J.1**: ✅ Payroll tabs navigation + UX clarity polish — completed in two passes:
  - First pass (commit `13f54d7`): PayrollTabs component across all 10 payroll pages, CSV injection fix (`csvCell()` helper), payment-batch state machine terminal-state guard.
  - Second pass (this phase): Overview regrouped into Payroll Work / Setup / Payments with "Recommended" highlight on the readiness-met next step; Run wizard jargon swept ("blocker" → "Needs fixing / Cannot continue", "warning" → "Needs review", raw issue codes demoted to small secondary text); Payslips list status legend (Preview / Finalized / Paid); Payslip detail negative net-pay "Needs review — blocked preview" banner and collapsible `<details>` calculation explanation; Reports "what these mean" helper text and updated export-placeholder copy; Settings reordered into General / Overtime / Work schedule / Country rules / Payslip numbering; Pay Items 6-pill filter (All / Earnings / Allowances / Deductions / Statutory / Employer Contributions); Loans pill set extended with Advances; Payments already in place per spec. Module-tabs are now a product standard — see [shared-ui-primitives-plan.md](../shared-ui-primitives-plan.md#moduletabs-pattern).

- **Phase 9C**: ✅ Recruitment oRPC API — `packages/api/src/routers/recruitment.ts` (50 procedures across 10 entity groups: requisitions / jobs / candidates / applications / interviews / feedback / offers / offer approvals / documents / notes). New RBAC helpers `canManageRecruitment` and `canViewRecruitment` added to both `apps/web/src/lib/rbac.ts` and `packages/api/src/utils/role-helpers.ts`. Tenant-FK invariants enforced via 6 verification helpers (`verifyRequisition` / `verifyJobOpening` / `verifyCandidate` / `verifyApplication` / `verifyInterview` / `verifyOffer`). Every stage transition writes `application_stage_history`; terminal states (`hired` / `rejected` / `withdrawn`) cannot reverse without owner/admin + audit override. Candidate emails lowercased+trimmed; `deletedAt` rows excluded from default lists; interviewer FK arrays validated cross-tenant. Offer compensation fields stripped from output for non-payroll roles. ACL: reuses existing `posting / applicant / interview / offer / document` resources from `permissions.ts` — no new resources needed.
- **Phase 9B**: ✅ Recruitment DB schema + migration + seed — `packages/db/src/schema/recruitment.ts` (11 tables, 10 enums, relations), migration `0008_large_mindworm.sql`, `scripts/seed-recruitment.ts` (Atlas Shipping demo: 3 requisitions, 4 openings, 10 candidates, 10 applications across all 8 stages, 24 stage-history rows, 4 interviews, 3 feedback rows, 2 offers + approvals, 11 documents, 3 notes). 0 unique-constraint violations on candidate `(organizationId, email)`. Quality gates: check-types ✅, build ✅, ultracite 225 baseline. See [docs/implementation/recruitment-db-setup.md](../../implementation/recruitment-db-setup.md).
- **Phase 9A**: ✅ Recruitment + Onboarding spec finalization — see [recruitment-onboarding-implementation-plan.md](../recruitment-onboarding-implementation-plan.md). 18 proposed entities (12 recruitment + 7 onboarding — adjusted from initial 23 after consolidation: stages are enum + per-opening JSON, not a separate table; "hiring_manager" is per-opening employee FK, not a global role). Status lifecycles defined for requisitions, openings, applications, interviews, offers, onboarding, and onboarding tasks. UI routes + `RecruitmentTabs` + `OnboardingTabs` + new `KanbanBoard` / `TaskChecklist` primitives planned. RBAC matrix maps every capability to every role using the Phase 8J.2 normalized helpers. Candidate-to-employee conversion designed as one atomic API procedure with optional contract draft + onboarding handoff. Analytics shapes defined for both modules. 9B–9I sequence with effort estimates and parallelism notes. 10 open questions captured with recommendations.

### Product Standards Set in 8J.1
- **Module tabs are a product standard.** Recommended next implementations: Attendance, Leave, Employee Profile, Contracts. The reference implementation is `apps/web/src/features/payroll/payroll-tabs.tsx`.
- **Plain-language UX.** Never surface raw enum or audit codes as primary text. Codes may appear as small secondary text for support/debugging.
- **Manual payment confirmation only.** "Mark as paid" requires bank confirmation; exporting a bank file is not payment.

## Dependency Graph

```
HR Core (P0)
  │
  ├── Contracts (P0)
  │     │
  │     ├── Attendance (P1) ← Shifts from HR Core
  │     │     │
  │     │     ├── Biometric (P2) ← creates attendance events
  │     │     └── Geofencing (P2) ← validates check-in location
  │     │
  │     ├── Leave (P1) ← Holidays from HR Core
  │     │     │
  │     │     └── Compensatory Leave ← needs Attendance
  │     │
  │     └── Payroll (P1) ← needs Contracts + Attendance + Leave
  │           │
  │           └── Final Settlement ← needs Offboarding
  │
  ├── Recruitment (P2)
  │     └── Onboarding (P2) ← candidate-to-employee flow
  │
  ├── Offboarding (P2) ← needs HR Core, optionally Payroll + Assets
  │
  ├── Assets (P3)
  ├── Helpdesk (P3)
  ├── Projects (P3)
  └── Performance / PMS (P3)

Cross-cutting:
  Audit — implemented with HR Core, used by all modules
  Documents — implemented with HR Core, expanded per module
  Notifications — Phase 7+ (when approval flows exist)
  Automations — Phase 14 (after all triggers exist)
```

## What Can Be Parallelized

| Phase | Modules | Why parallel works |
|-------|---------|-------------------|
| 7 | Attendance + Leave | Both depend on HR Core but not on each other (compensatory leave deferred) |
| 9 | Recruitment + Onboarding | Onboarding depends on recruitment but can start simultaneously |
| 12 | Assets + Helpdesk + Projects | All independent, only need HR Core |

## What Must Wait

| Module | Must wait for | Reason |
|--------|--------------|--------|
| Payroll | Contracts (schema), Attendance (worked hours), Leave (deduction days) | Gross-to-net calculation needs all inputs |
| Biometric | Attendance | Creates attendance events |
| Geofencing | Attendance | Validates check-in |
| Compensatory Leave | Attendance | References attendance records |
| Leave encashment | Payroll | Creates payroll allowance |
| Final settlement | Payroll + Offboarding | Calculates remaining pay + deductions |
| Automations | All core modules | Needs triggers from all entity types |

## First 3 Milestones After HR Core

### Milestone 1: "Employees Live" (Phase 5B)
- Employee list with real data (DataTable, filters, search)
- Employee profiles with all tabs (personal, work, bank, documents, activity)
- Employee creation wizard
- Organization settings (departments, positions, shifts)
- Holiday management
- Audit event logging
- **Value**: HR can manage employee records, replacing spreadsheets

### Milestone 2: "Contracts + Time Tracking" (Phase 6 + 7)
- Employment contracts with status lifecycle
- Manual check-in/out with daily attendance records
- Overtime calculation and approval
- Leave type configuration with balances
- Leave request and approval workflow
- Team calendar
- **Value**: HR can track attendance, manage time-off, and prepare for payroll

### Milestone 3: "Payroll Running" (Phase 8)
- Pay item configuration (allowances, deductions)
- Payslip generation with gross-to-net
- Pay run wizard with preview
- Employee payslip portal
- Loans and reimbursements
- **Value**: Organization can run payroll through Heimdallone

## Highest-Risk Modules

| Module | Risk Level | Why |
|--------|-----------|-----|
| Payroll | Very High | Complex calculations, multi-country tax, money precision, high-stakes errors |
| Attendance | High | Edge cases (midnight, missing checkout, timezone), device integration |
| Leave | High | Balance calculations, carry-forward, concurrent approval race conditions |
| Biometric | High | Physical device connectivity, multiple protocols, sync reliability |
| Contracts | Medium | One-active constraint, mid-period changes, salary sync |
| Recruitment | Medium | Kanban drag-drop UX, candidate-to-employee conversion |
| Performance | Medium | 360 feedback from multiple sources, review fatigue |

## Staff Training / Adoption Risks

| Module | Adoption Risk | Mitigation |
|--------|--------------|------------|
| Payroll | High — payroll clerks used to Excel | Step-by-step wizard, preview before generate, "why blocked" panels |
| Attendance | Medium — field workers may struggle with check-in | Big check-in button on dashboard, mobile-friendly, grace time |
| Leave | Low — employees already request leave | Intuitive calendar, balance cards, clear status badges |
| Performance | Medium — review fatigue, unfamiliarity with OKRs | One-question-at-a-time review, simple goal progress sliders |
| HR Core | Low — HR staff are primary users | Setup checklist, guided wizard, smart defaults |
| Recruitment | Low — recruiters understand pipeline concept | Familiar kanban UX |
| Assets | Low — straightforward inventory | Simple table with assign/return actions |
| Helpdesk | Low — employees understand ticketing | "What do you need help with?" simple form |

## Shared Primitives Still Needed

| Primitive | Needed by Phase | Status |
|-----------|----------------|--------|
| DataTable | 5B (HR Core) | ✅ Built (Phase 4F) |
| StatusBadge | 5B | ✅ Built |
| EmptyState | 5B | ✅ Built |
| EntitySheet | 5B | ✅ Built |
| ConfirmDialog | 5B | ✅ Built |
| PageHeader | 5B | ✅ Built |
| ActionMenu | 5B | ✅ Built |
| FilterBar | 5B stretch / 7 | ⬜ Not yet |
| SavedViewTabs | 5B stretch / 7 | ⬜ Not yet |
| BulkActionToolbar | 5B stretch / 7 | ⬜ Not yet |
| WizardForm | 5B (employee create) | ⬜ Not yet |
| FormSection | 5B | ⬜ Not yet |
| FieldHelp | 5B | ⬜ Not yet |
| ViewSwitcher | 7 (attendance calendar) | ⬜ Not yet |
| AuditTimeline | 5B (employee activity) | ⬜ Not yet |
| ApprovalQueue | 7 (leave/attendance approvals) | ⬜ Not yet |
| KanbanBoard | 9 (recruitment pipeline) | ⬜ Not yet |

## Modules Needing More Research

| Module | What's needed |
|--------|--------------|
| Payroll | GY 2026 ✅ implemented. BB 2026 + TT 2026 researched (rates documented in payroll-implementation-plan.md) — need official verification before production. TT 2027 NIS rate change (19.2%) needs separate module. JM PAYE still unresearched. Bank file formats for local banks still needed. |
| Biometric | ZKTeco SDK/protocol documentation. Anviz cloud API docs. Test device availability. |
| Geofencing | GPS accuracy requirements for Caribbean field operations. Mobile app capabilities. |
| Performance | OKR framework preferences for Caribbean organizations. Appraisal cycle norms. |
