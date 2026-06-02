# Implementation Sequence — Module Build Order

## Recommended Order

```
Phase 5B:  HR Core (employees, org settings, documents, audit) ✅
Phase 6:   Contracts ✅ (6A-6E complete, verified end-to-end)
Phase 7:   Attendance + Leave ✅
Phase 8:   Payroll ✅ (8A–8K + 8J.1 module-tabs / UX clarity polish + 8J.2 role normalization)
Phase 9:   Recruitment + Onboarding ✅ COMPLETE (9A–9I, verified end-to-end)
Phase 10:  Offboarding ✅ COMPLETE (10A spec, 10B DB, 10C API, 10D UI CP1 overview + CP2 templates + CP3 cases + CP4 checklist actions + CP5 employee self-service + CP6 QA/RBAC pass)
Phase 11:  Biometric + Geofencing ← NEXT (11A spec)
Phase 12:  Assets / Helpdesk / Projects (can parallelize; Assets spec already drafted — assets-implementation-plan.md, queued)
Phase 13:  Performance / PMS
Phase 14:  Automations + Notifications
Phase 15:  Analytics + Dashboards + Reports
```

> **Roadmap correction (2026-06-02):** Phase 11 is **Biometric + Geofencing**, not
> Assets. The Assets implementation plan
> ([assets-implementation-plan.md](../assets-implementation-plan.md)) was drafted
> early and remains a **completed, queued spec** for a later phase (Phase 12
> candidate). It is NOT the active phase — no Assets DB migration is to be run until
> Biometric + Geofencing ships. See the dated entries below.

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

- **Phase 11A** (ACTIVE): ✅ Biometric + Geofencing implementation plan — [biometric-geofencing-implementation-plan.md](../biometric-geofencing-implementation-plan.md). Spec/research A-phase only (no code/schema). Live-researched Odoo `hr_attendance`/kiosk, ERPNext `Employee Checkin` + Shift-Type auto-attendance + `biometric-attendance-sync-tool`, Horilla attendance/biometric/geofencing, OpenHRMS/Cybrosys, and ZKTeco `pyzk`/ADMS — synthesised against the **existing** Phase 7 Attendance module (which already has `attendance_event.source` incl. `biometric`/`mobile`/`import`, `deviceId`, `locationLat/Lon` stubs; `attendance_record` payroll-gated by `payrollStatus`; `attendance_correction` review flow). Decided minimum entity set: **8 new tables** (`attendance_device`, `attendance_device_employee_map`, `attendance_device_sync_run`, `attendance_punch` raw staging, `geofence_location`, `geofence_assignment`, `geofence_check_in`, `attendance_exception` = the review queue) + 13 new enums; **reuses** attendance_event/record/correction/setting (no fork). Core model: raw punches **staged, never authoritative** → map→dedupe→geofence→processor → `attendance_event`(source=biometric/mobile/import) → `recalculateRecord` → `attendance_record`; **only approved records reach payroll**. Device protocol lives in an **external sync-agent + punch-ingest REST API + CSV import** (Bun can't speak the ZK binary protocol — Frappe's model); native TCP pull + ADMS push deferred. Geofence = **soft-block-with-reason** (server-side great-circle), GPS retained 90d then scrubbed, **never store biometric templates** (verifyMode = method enum only). New AC resources `attendance_device`/`attendance_punch`/`geofence`/`attendance_exception` + helpers canManageBiometrics/canViewBiometrics/canManageGeofencing/canUseGeofenceCheckIn/canReviewAttendanceExceptions; mobile check-in stays a `tenantProcedure` self-scope (avoids the documents.markUploaded manage-gate trap). UI routes `/app/biometrics{,/devices,/devices/$id,/sync-runs,/punches}` + `/app/geofencing{,/locations,/check-in}` + exceptions/corrections integrated into Attendance. Sequence **11A–11H** (B schema+seed → C sync/import API+processor → D devices UI → E punch/exception queue → F geofence+mobile check-in → G attendance/payroll integration → H QA/RBAC/security). Next: **11B Biometric + Geofencing DB schema + migration + seed.**
- **Assets (queued spec — Phase 12 candidate, drafted 2026-06-02)**: ✅ Implementation plan — [assets-implementation-plan.md](../assets-implementation-plan.md). **Not the active phase** (Phase 11 is Biometric + Geofencing per the roadmap correction above); this spec is drafted and queued, no DB migration to be run yet. Synthesised from `modules/assets-spec.md` + `horilla-extraction/assets.md` into 4 Drizzle tables (asset_category, asset, asset_assignment, asset_request) + 3 enums (asset_status, asset_return_condition, asset_request_status); the `assets` oRPC router (categories / assets / assignments / requests) with the two-layer authz (tenant + manager direct-report scope), `purchaseCost` redaction for non-finance roles, transactional assign/return keeping `asset.status`+`currentAssigneeId` in sync, and the **one-open-assignment partial unique** invariant; canManageAssets/canViewAssets/canRequestAsset helpers to mirror the existing `asset` AC grants; UI checkpoints CP1 inventory → CP2 detail+history → CP3 assign/return → CP4 requests+self-service → CP5 integration+QA; and a **read-only** offboarding custody panel (no auto write-back to the free-text asset_return rows in v1). Bakes in the 10D lessons up-front: folder routes (no shadow), graceful 403/404 + retry:false, denormalised display fields in list endpoints, and a flagged open question to add an `asset:request` AC action rather than ship a self-service branch behind a manage-only gate (the offboarding `documents.markUploaded` trap). **Queued behind Biometric + Geofencing (Phase 11)** — its B/C/D/E checkpoints resume when Assets becomes the active phase (Phase 12 candidate).
- **Phase 10D CP6**: ✅ Offboarding QA / RBAC / browser pass (closes Phase 10D) — verification + hardening pass, no new features. Two parallel READ-ONLY review agents audited the UI (static QA/a11y) and the API (authorization correctness + role×capability matrix). **Confirmed clean:** frontend `rbac.ts` mirrors backend `role-helpers.ts` byte-for-byte for the three offboarding helpers; the 10C `assertCaseVisibleToCaller` manager-scope (IDOR) fix covers all 9 manager-reachable per-case reads + `cases.approve`; `redactCase`/`interviewGetByCaseId` redaction matches spec; no raw enums as primary text, no internal IDs as primary text, no unsafe hrefs, every input labelled, every dialog has role/aria-modal/aria-labelledby. **Fixed (sequential, me):** (1) the read-only case detail (`cases/$id.tsx`) now shows a graceful "Case not available" EmptyState when `getById` is forbidden/404 instead of a blank page; the per-case list queries (tasks/assets/access/docs) are gated on the case being visible (`enabled: Boolean(c)`) so an IDOR-blocked manager no longer triggers a cascade of 403s; extracted `useCaseDetailData` hook to keep `CaseDetail` ≤ Biome complexity 20; (2) `MyOffboarding` shows a graceful "Not available" state when `getMyCase` 403s (roles without `resignation:read`, e.g. recruiter) instead of an unusable resignation form; (3) `retry: false` on `getById`/`getMyCase` so the no-access state appears immediately (~1s vs ~7s) and the 403 console noise drops to a single request. Browser-verified the full RBAC matrix on :3002: owner full actions, auditor read-only + settlement, employee self-service, **manager** scoped list (0 rows for no reports) + IDOR-blocked case → "Case not available" with NO data leak, **recruiter** → "Not available", **payroll_admin** → views case + settlement data, NO manage buttons, `internalNote` redacted. **Documented as 10-series hardening backlog (not fixed — out of QA-pass scope):** (a) app-wide a11y — section titles use `div.eyebrow` not `<h2>` (the established design-system pattern across every module; changing only offboarding would break consistency); (b) latent 10C API bug — `documents.markUploaded` has an employee self-service branch that is unreachable because its AC action is `manage_documents` (employees don't hold it); fails safe (no over-permission) and no UI exposes employee document upload, so zero user impact today; (c) managers cannot approve/reject a direct report's pending resignation via the UI (`CaseStatusActions` is gated to `canManage`=HR), though the API allows it. Gates: build 0, web tsc 0 offboarding errors (26 baseline), lint 224/1/2 unchanged. Screenshots: `docs/reviews/phase-10d-cp6/`.
- **Phase 10D CP5**: ✅ Offboarding employee self-service — `apps/web/src/features/offboarding/my-offboarding.tsx` (`MyOffboarding`) replaces the CP1 "coming later" placeholder; wired into `routes/app/offboarding/index.tsx` (employee fall-through) and the `routes/app/offboarding/my.tsx` route. The employee surface is intentionally narrow because the offboarding `*.list` endpoints are HR-gated (`canViewOffboarding` excludes employees) — clearance (asset return / access revocation / settlement) is an HR/IT responsibility, not the departing employee's. So the page uses only the three resignation-resource procedures the employee role is granted (`resignation: create/read/withdraw`): `cases.getMyCase` (zero-arg, returns the caller's latest redacted case or null), `cases.submitResignation` (proposed last working day + notice-period days + optional reason → confirm dialog → `pending_approval`), `cases.withdraw` (pending-only, confirm dialog). When the latest case is terminal (rejected/withdrawn/cancelled/closed) a "Submit a new resignation" form reappears; otherwise a status card shows type/status/last-working-day/notice/reason plus a plain-language `explainStatus()` message and (pending-only) a Withdraw button. No HR tab strip for employees. Reusable `DialogShell`/`DialogHeader`/`DialogActions` keep each piece under Biome complexity 20. Browser-verified as employee: submit → Pending approval status card + Withdraw → Withdrawn + new form; 0 console errors; the test case was hard-deleted (cascade) via a throwaway script — zero seed pollution. Gates: build 0, web tsc 0 offboarding errors (26 baseline), lint 224/1/2 unchanged. Screenshots: `docs/reviews/phase-10d-cp5/`.
- **Phase 10D CP4**: ✅ Offboarding checklist actions — made the read-only CP3 case-detail page actionable with **no API changes** (every action wires to an existing 10C mutation; the API was built action-complete in 10C and exposed read-only through CP1–CP3). New `apps/web/src/features/offboarding/`: `use-invalidate-offboarding.ts` (one `invalidateQueries` predicate on `queryKey[0][0] === "offboarding"` — refetches the whole module after any mutation), `offboarding-note-prompt-dialog.tsx` (reusable `NotePromptDialog`, optional/required note + `danger` tone, used by skip/block/waive/reject/cancel/close to keep each action component flat under Biome complexity 20), `offboarding-task-actions.tsx` (Complete / Skip-note / Block-note-required), `offboarding-asset-actions.tsx` (Mark returned / Waive + `AddAssetDialog`), `offboarding-access-actions.tsx` (Mark revoked / Waive + `AddAccessDialog`, "disable outside Heimdallone" note), `offboarding-document-actions.tsx` (requested→Mark received, uploaded→Approve, Waive + `AddDocumentDialog`; file upload deferred to CP5), `offboarding-case-actions.tsx` (`CaseStatusActions` header: pending_approval→Approve/Reject, active→Move to clearance, in_clearance→Mark clearance complete, in_clearance|pending_settlement→Close case, non-terminal→Cancel; Close shows the "deactivates employee — only path that sets isActive=false" warning), `offboarding-interview-dialog.tsx` (`InterviewDialog` upsert: date/rating/reason/wentWell/couldImprove/wouldRehire[HR]/internalNotes[HR]/Keep-private-default-checked, prefills from the redacted read row). `cases/$id.tsx` sections gained an Actions column + Add/Request/Record buttons gated by `canManageOffboarding`; `SectionCard` gained a header `action` slot; extracted `toInterviewDefaults` to keep `InterviewSection` ≤ complexity 20. **RBAC is UX-only** — controls render only when `canManage`, the API re-checks every call. Browser-verified on the seeded in-clearance case as owner (Complete flipped To do→Done with counter 3→4 of 6, interview upsert logged to activity, Close confirm dialog showed deactivation warning and was cancelled — no side effect) and auditor (full case incl. settlement data, ZERO action buttons); the two test mutations were reverted via a throwaway scalpel script (zero seed pollution); 0 app console errors. Gates: build 0, web tsc 0 offboarding errors (26 pre-existing baseline), lint 224/1/2 unchanged. Screenshots: `docs/reviews/phase-10d-cp4/`.
- **Phase 10D CP3**: ✅ Offboarding cases UI — `apps/web/src/routes/app/offboarding/cases/{index,$id}.tsx` (flat `cases.tsx` → folder route, 4th route-shadow conversion), `apps/web/src/features/offboarding/offboarding-create-case-dialog.tsx` (HR-initiated case: employee picker via `hrCore.employees.list`, exit type, last working day, template, reason, internal note). Cases list: status filter pills (All / Pending approval / Active / In clearance / Pending settlement / Closed); columns employee (name resolved via merged active+inactive `hrCore.employees.list` map), exit type, status badge, last working day, per-case clearance progress (each `CaseRow` fires its own `tasks.list` → done/total); employees → no-access EmptyState (no queries). Case detail (read-only, the centerpiece): header + status badge; "What needs attention" panel derived from the section lists (no settlement 403 for managers); sections Summary / Clearance tasks / Asset returns / Access removal (with manual-tracking note) / Documents / Exit interview / Final settlement readiness (gated `canReadOffboardingSettlement`; shows "calculation handled later" disclaimer) / Activity timeline. Status label/tone helpers for task/asset/access/document added to `labels.ts`. Privacy is API-enforced (`redactCase` hides internalNote + involuntary exitReason; `interviewGetByCaseId` strips private/HR-only fields) — UI renders what each endpoint returns. **Client-typing note:** `cases.getById/list` return `Record<string,unknown>` (the API `redactCase` generic collapses the row type), so the UI casts to a `CaseView`; Drizzle date columns type as `Date` but serialize to strings, so `fmtDate` accepts `string | Date`. Browser-verified create→detail round-trip as owner (10 template tasks snapshotted, then hard-deleted the test case — zero seed pollution), filter narrowing, auditor read-only (no Create), employee no-access; 0 console errors. No mutation controls on detail yet (CP4). Screenshots: `docs/reviews/phase-10d-cp3/`.

- **Phase 10D CP2**: ✅ Offboarding templates UI — `apps/web/src/routes/app/offboarding/templates/{index,$id}.tsx` (converted the flat `templates.tsx` placeholder to a folder route — 3rd route-shadow conversion after recruitment/onboarding), `apps/web/src/features/offboarding/offboarding-template-form-dialog.tsx` (create/edit: name + exit-type select + description), label helpers `assigneeRoleLabel` / `dueOffsetLabel` added to `labels.ts`. List: name/description, exit type, Active|Archived status, task count (via `useQueries` on `templateTasks.listByTemplate`), category summary, updated date; `templates.list` returns a plain array (input `{includeInactive:true}` to show archived); employees get a no-access EmptyState with queries disabled (no 403 spam). Detail: summary (exit type / status / task counts / categories) + ordered tasks table with plain-language `dueOffsetLabel` ("N days before/on/after last working day") and human `assigneeRoleLabel`; "Task editing… coming in a later checkpoint" note. Create/edit/archive gated by `canManageOffboarding`; archive confirm copy "Archive this template? / Existing offboarding cases will not be changed." Extracted `ArchiveTemplateDialog` to keep the detail component under the cognitive-complexity ceiling (20). Browser-verified create→archive round-trip as owner (then hard-deleted the test row — zero seed pollution), auditor read-only (no Create/Edit/Archive), employee no-access; 0 console errors. Screenshots: `docs/reviews/phase-10d-cp2/`.

- **Phase 10D CP1**: ✅ Offboarding overview + tabs — `apps/web/src/features/offboarding/{offboarding-tabs,offboarding-placeholder,labels}.tsx`, `apps/web/src/routes/app/offboarding/{index,cases,templates,tasks,assets,access,my}.tsx`, `apps/web/src/styles/offboarding.css`. Removed the flat `routes/app/offboarding.tsx` placeholder that would shadow the folder routes (same fix as onboarding). Overview dashboard: 5 stat tiles (Active / Pending approval / In clearance / Pending settlement / Closed) sourced from `offboarding.cases.list` per-status count queries (`pageSize: 1`, read `.total`); "What needs attention" panel derives plain-language action items from the same counts (settlement item gated by `canReadOffboardingSettlement`); quick-links grid. RBAC (UX layer only — API is source of truth): HR/owner/admin/manager/auditor/payroll_admin see the dashboard via `canViewOffboarding`; employees fall through to a self-service "Coming later" placeholder (no tab strip). `cases`/`templates`/`tasks`/`assets`/`access` tabs render honest "Coming later" placeholders (ship in later CPs); `/my` is the employee self-service shell. Plain-language status labels in `labels.ts` (no raw enums as primary text). Placeholder card titles use a styled div (not a heading) to keep `h1→h2` order intact, matching `EmptyState`. Browser-verified across employee / owner / auditor with seeded data (0/1/1/1/1) and 0 console errors. **Gotcha hit:** the stale `bun run --hot` API server 404'd the new offboarding routes until restarted — see lessons-learned #76. Screenshots: `docs/reviews/phase-10d-cp1/`.

- **Phase 10C**: ✅ Offboarding oRPC API — `packages/api/src/routers/offboarding.ts` (9 router groups: templates / templateTasks / cases / tasks / assets / access / documents / interviews / activity / settlement). New `offboarding` AC resource (14 actions) in `permissions.ts`; reuses `resignation` resource for employee self-service. RBAC helpers `canManageOffboarding` / `canViewOffboarding` / `canReadOffboardingSettlement` mirrored in `role-helpers.ts` + `rbac.ts`. Two orthogonal authz layers: tenant scope (`verifyOBCase` on org_id + deletedAt) AND lateral manager→direct-report scope (`assertCaseVisibleToCaller`, applied to all 7 manager-reachable per-case reads — closed an IDOR found in review, commit `907ebaa`). `cases.create` / `submitResignation` are transactional (case + task snapshot + activity, with 23505 conflict → friendly "already has an active case"); `cases.close` is the ONLY procedure that sets `employeeProfile.isActive = false`. `redactCase()` hides `internalNote` from non-HR and the involuntary `exitReason` from the employee. audit:permissions = 62 pairs / 9 routers.

- **Phase 10B**: ✅ Offboarding DB schema + migration + seed — `packages/db/src/schema/offboarding.ts` (9 tables, 7 enums). Migration `0010_tricky_jimmy_woo.sql` applied. Seed: 3 templates / 23 template tasks / 4 cases across all key statuses (pending_approval, in_clearance, pending_settlement, closed) / 23 case tasks / 5 asset returns / 8 access revocations / 6 document requests / 2 exit interviews / 12 activity entries. Key constraints: partial unique `ob_case_employee_active_uq` (one active case per employee); partial unique `ob_exit_interview_case_uq` (one interview per case). `employeeProfile.isActive` NOT changed by schema/seed — set only by Phase 10C API close procedure. See [docs/implementation/offboarding-db-setup.md](../../implementation/offboarding-db-setup.md).

- **Phase 10A**: ✅ Offboarding spec — [offboarding-implementation-plan.md](../offboarding-implementation-plan.md). 9 entities (offboarding_case, _template, _template_task, _task, _asset_return, _access_revocation, _document_request, _exit_interview, _activity). Status lifecycle: pending_approval→approved→active→in_clearance→pending_settlement→closed (resignations); active→…→closed (HR-initiated). New `offboarding` AC resource (10 actions); reuses existing `resignation` resource. RBAC: owner/admin/hr_admin manage; manager scoped+task-complete; employee self-resign only; payroll_admin read_settlement; auditor read. Employee view restrictions: internalNote always hidden, isPrivate interview hidden, involuntary exitReason hidden. `employeeProfile.isActive = false` only on explicit case close. dueOffsetDays relative to lastWorkingDay (negative = before LWD). Asset/access as free text until Phase 12/14. Integration points: HR Core (isActive), Contracts (prompt but no auto-close), Payroll (readiness indicators), Assets Phase 12, IAM Phase 14.

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
| KanbanBoard | 9 (recruitment pipeline) | ✅ Done (Phase 9D) |

## Modules Needing More Research

| Module | What's needed |
|--------|--------------|
| Payroll | GY 2026 ✅ implemented. BB 2026 + TT 2026 researched (rates documented in payroll-implementation-plan.md) — need official verification before production. TT 2027 NIS rate change (19.2%) needs separate module. JM PAYE still unresearched. Bank file formats for local banks still needed. |
| Biometric | ZKTeco SDK/protocol documentation. Anviz cloud API docs. Test device availability. |
| Geofencing | GPS accuracy requirements for Caribbean field operations. Mobile app capabilities. |
| Performance | OKR framework preferences for Caribbean organizations. Appraisal cycle norms. |
