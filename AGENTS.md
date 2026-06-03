# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.

---

## Heimdallone Project Context

Heimdallone v2 is a multi-tenant HRMS/payroll/workforce platform.

### Stack
- Bun + Turborepo monorepo
- TanStack Start + React (frontend)
- Hono + oRPC (API server)
- Better Auth + Organization/Admin plugins (auth/RBAC, 9 tenant roles)
- Drizzle ORM + PostgreSQL (central Postgres)
- Tailwind CSS v4 + Heimdallone design handoff CSS (dark-first, gold-accent)
- shadcn/ui with `base-lyra` style (@base-ui/react, NOT Radix)

### Implementation Pattern
Each module follows: **A** (spec) → **B** (schema+seed) → **C** (API) → **D** (UI) → **E** (QA/RBAC).

### Current Status (2026-06-02)
- **Offboarding (Phase 10): ✅ COMPLETE** — 10A spec → 10B DB → 10C API (9 router groups; `assertCaseVisibleToCaller` manager-scope IDOR fix `907ebaa`; `cases.close` is the sole `isActive=false` writer; audit 62 pairs/9 routers) → 10D UI CP1–CP6 (overview/tabs, templates, cases list+detail, checklist actions, employee self-service, QA/RBAC pass `fa7210d`). Lint baseline 224/1.
- **Suite direction (user directive 2026-06-02):** Heimdallone = 5 product groups — **People & Payroll · Operations · Finance · CRM · Admin & Compliance** — one platform; future modules documented but kept hidden/queued in the sidebar until their phase. **Post-11 order:** 12 Assets → 13 Helpdesk/Requests → 14 Projects+Tasks/Timelines → 15 Performance/PMS → 16 Finance expansion → 17 CRM → 18 Analytics/dashboards → 19 Enterprise QA/a11y/security → 20 Production readiness. **CRM/Finance/Projects/Tasks NOT built yet.** CRM is furthest out — Phase **17A is research/spec-only** (doc `docs/architecture/crm-implementation-plan.md` already drafted: 8-table MVP, synthesises Odoo/ERPNext/TwentyCRM/SuiteCRM/EspoCRM/Vtiger/YetiForce/OroCRM/HubSpot/Salesforce/Zoho/Pipedrive/Attio/Dynamics + Horilla/OpenHRMS where HR∩CRM); CRM thesis = the cross-suite flow Lead→Customer→Deal→Project→Staff→Timesheets→Payroll cost→Invoice. Do not build CRM until People/Payroll + Assets + Helpdesk + Projects are stable unless told.
- **Leave Policy Engine (Phase 7I): ✅ COMPLETE (A/B/C/D/E).** 7I-E QA + soft payroll/leave warnings shipped: read-only `orgPolicies.health` + `unverifiedNotice` on balanceExplanation; warnings on company policies list, employee "why this balance", payroll run-preview review note (read-only, under confidence NOT blockers — **payroll engine/formulas untouched, 27/27 unchanged**), leave-request no-active-policy note. **Never blocks payroll, never changes pay.** Browser-verified all roles + direct-RPC RBAC (employee/auditor mutations 403; auditor read 200), 0 console errors, 6 screenshots docs/reviews/phase-7i-e/. Gates: check-types 3/3, build, lint 218/1/2, audit 86/12, verify 22/22, payroll-engine 27/27. **Next: return to Phase 12D Assets inventory UI.** 7I-D UI shipped (commit 960ea98): `features/leave/{policy-labels,leave-policy-tabs}` + routes `app/leave/policies/{index,company,template/$id,org/$id}` + `app/leave/balance`; template gallery w/ verification badges + source/review, template detail (rules + safe source link + adopt-snapshot-dialog), org policy detail (activate/archive/edit-rule/compare-to-baseline), employee "why this balance" (self-scoped). Payroll-treatment redacted non-finance; every non-verified rule shows verify-before-production notice. Browser-verified all roles, 0 console errors, 8 screenshots docs/reviews/phase-7i-d/. Gates: check-types 3/3, build, lint 218/1/2 (improved), audit 86/12, web tsc 0 touched-file errors, verify 22/22. Next 7I-E: surface a soft payroll warning for unverified/missing policy (engine path unchanged). Hardening of Phase 7 Leave. Spec `docs/architecture/leave-policy-engine-plan.md`; impl `docs/implementation/leave-policy-engine.md`. **Correction:** statutory leave ENTITLEMENT = Labour Act/Ministry of Labour/NIS; **GRA only governs payroll/PAYE/NIS treatment of leave pay** — never label entitlement a "GRA rule". **7I-A** researched + CITED Guyana: NIS maternity (13 wks @70%) + sickness (4th day, 26 wks @70%) **verified** (nis.org.gy); annual (Leave with Pay Act Cap.99:02) **needs_review** (labour.gov.gy PDF 403 — tenure bands unconfirmed); paternity/compassionate/unpaid **draft**. **No legal value without source metadata + verificationStatus; unverified ≠ legal certainty.** **7I-B** `schema/leave-policy.ts` 4 tables (leave_policy_template [org-nullable=system], leave_policy_rule [PER-RULE verificationStatus], organization_leave_policy [snapshot; sourceTemplateId SET NULL; partial-unique one active per (org,country)], organization_leave_policy_rule [snapshotted/editable, linkedLeaveTypeId]) + 7 enums, migration 0015 applied; seed-leave-policy.ts idempotent (GY 6 rules mixed verification + BB/TT/JM draft). **7I-C** `routers/leave-policy.ts` (`leavePolicy`): AC resource `leave_policy` (owner/admin/hr full; payroll/manager/auditor read; employee none); helpers canManageLeavePolicy/canViewLeavePolicy/canViewLeavePayrollTreatment. templates.list/getById (payroll-treatment redacted non-finance); orgPolicies.adoptTemplate (**transactional snapshot — system-template edits NEVER mutate an adopted policy**: copy-at-adoption + sourceRuleId SET NULL)/createCustom/copyFrom/updateRule/activate(CONFLICT one-per-country)/archive/compareToBaseline; balanceExplanation.forSelf/forEmployee (leave_request:read, self-scoped, never blocks payroll). verify-leave-policy-engine.ts **22/22** (snapshot invariant proven: system→99.00, adopted stayed 12.00). Gates check-types 3/3, lint 223/1/2, audit **86/12**. **Next: 7I-D UI** (template gallery + verification badges + adopt/copy/compare + employee "why this balance"; every system template shows "verify with legal advisor before production") → **7I-E** browser QA + soft payroll warning for unverified/missing policy (engine path unchanged).
- **Assets (Phase 12): ACTIVE.** Spec `docs/architecture/assets-implementation-plan.md`. **12B DB ✅** — `schema/assets.ts` (4 tables asset_category/asset/asset_assignment/asset_request + 3 enums asset_status/asset_return_condition/asset_request_status), migration **0014_fat_shiver_man.sql** applied; partial-unique invariants `asset_org_tracking_uq`, `asset_category_org_name_uq`, **`asset_assignment_open_uq`** (≤1 open assignment/asset); `asset.currentAssigneeId` denormalised cache. **12C API ✅** — `routers/assets.ts` (registered `assets`). Resolved the open question: added **`asset:request`** AC action (employee held only `asset:read`) granted to owner/admin/hr_admin/payroll_admin/manager/employee/recruiter (NOT auditor/helpdesk); self-service gates on it — avoids the markUploaded manage-gate trap. 6 helpers in role-helpers.ts + rbac.ts (canManageAssets/canViewAssets/canAssignAssets/canReturnAssets/canRequestAsset/canViewAssetCosts). Inventory ops at router root (list/getById/create/update/retire/writeOff) + `categories`/`assignments`/`requests` sub-resources. **Server-side purchaseCost redaction** (`redactAsset`, finance/audit only). **Transactional** assign/return via shared `performAssign`; status+currentAssigneeId are single-writer derived caches (assign/return/retire only; `update` refuses them); major_damage return auto-retires; history preserved. Two-layer authz (tenant FK verify + manager direct-report / employee-self). Offboarding link read-only (`assignments.listByEmployee`), no write-back. Verify `scripts/verify-assets-api.ts` **46/46**; gates check-types 3/3, build, lint 223/1/2 unchanged, audit **80/11**. Doc `docs/implementation/assets-api.md`. **Next: 12D Assets inventory UI** (AssetsTabs, inventory DataTable w/ redacted cost + plain status labels, assign/return dialogs, requests queue + employee "My assets", categories settings, offboarding custody panel).
- **Biometric + Geofencing (Phase 11): ACTIVE.** 11A spec ✅; 11B DB ✅ (`schema/biometric.ts`, 8 tables + enums, migrations `0011`/`0012`); **11C sync/import API + processor ✅** — `routers/biometric.ts` (devices/mappings/syncRuns/punches/processor/ingest/geofences/assignments/checkIns/exceptions). **Multi-vendor adapter/provider model** (`utils/attendance-adapters.ts`): ZKTeco TCP/ADMS + NGTeco cloud/app/K-series + generic CSV/Excel/USB/API; live ZKTeco/NGTeco-cloud are `planned` (no faked sync). Source-agnostic idempotent processor (`utils/biometric-processor.ts`) bridges staged punches → `attendance_event` → `recalculateRecord` (extracted to `utils/attendance-recalc.ts`). Public `ingest.submit` = device API-key auth. 4 AC resources + 6 RBAC helpers. **Privacy:** no biometric templates ingested/stored; device secrets never returned. audit:permissions 73/10. **11D devices UI ✅** — `features/biometrics/*` + `routes/app/biometrics/{index,devices,devices/$id,sync-runs,punches}` + biometrics.css (flat stub removed). Overview/devices-list/detail/sync-runs/punches with a **Supported now / Planned** badge, honest planned-adapter states (no fake live sync), CSV-paste import dialog, secrets never rendered. Browser-verified admin/auditor/employee, 0 app console errors, screenshots in docs/reviews/phase-11d/. **11E punch review + exception queue UI ✅** — `/app/biometrics/punches` (Punch review: filters, Map-unmapped dialog, Process-pending confirm, payroll-safety note) + `/app/biometrics/exceptions` (queue: filters, Acknowledge/Resolve/Dismiss with required notes); `exceptions.list` enriched with resolutionNote. RBAC UX (canManageBiometrics/canReviewAttendanceExceptions); auditor read-only; employee no-access. Browser-verified incl. resolve round-trip; 0 app console errors (fixed a pageSize-200→400 bug). Lesson #76 addendum: `--hot` also won't reload handler-body/select changes → restart API server. **11F geofence locations + mobile check-in UI ✅** — `/app/geofencing{,/locations,/locations/$id,/check-in}` + GeofencingTabs + MobileCheckIn + location form dialog; new read-only `checkIns.previewSelf` (verdict preview, reuses geofence:check_in). Mobile-first, non-technical worker wording; tap-only geolocation (no background tracking); soft-block-outside-with-reason; friendly permission-denied; no raw GPS coords shown to workers. RBAC: canManageGeofencing/canViewGeofencing/canUseGeofenceCheckIn; auditor read-only; employee → check-in only. Browser-verified inside/outside/denied + blocked-from-management; 0 app console errors. **11G integration hardening IN PROGRESS — CP1 work-arrangement modes ✅** (migration 0013: work_arrangement enum + employee_work_info column; arrangementPolicy: only onsite enforces fence/raises exceptions/requires GPS; remote/hybrid/field/exempt never auto-flag outside → won't block payroll; mobile check-in shows friendly "Remote work check-in" + GPS-optional; verified remote check-in raises NO outside_geofence exception). **CP2 payroll readiness from attendance exceptions ✅** — open biometric/geofence/attendance exceptions surface as payroll blockers/warnings (never silently change pay). Builder `buildExceptionReview` period-scopes open/in_review exceptions (linked punch/event/check-in date → createdAt fallback), tallies `openExceptionBlockers`/`openExceptionWarnings`/`unprocessedPunches`; `flags.blockPayrollOnOpenExceptions` from `attendance_setting` (default true). Engine (pure) emits `UNRESOLVED_ATTENDANCE_EXCEPTION` (blocker) / `ATTENDANCE_EXCEPTION_REVIEW` (warning, downgrades blockers when policy off) / `UNPROCESSED_PUNCHES_FOR_PERIOD` (warning). `runs.confirm` gates on a **live open-blocker `payroll_issue` count** (not cached `blockerCount`). Plain-language UI labels + "raw device punches don't go directly to payroll" note. Worked minutes still read only from `attendance_record`. Verified: `scripts/verify-biometric-payroll-readiness.ts` 11/11 + browser preview (blocker under "cannot continue", `runs.confirm` 412, RBAC: employee/auditor denied, auditor confirm 403); audit 73/10. **CP3 live/projected pay hardening ✅** — projected pay is an estimate (never finalization) that now expresses a confidence level from the CP2 signals. New `payroll-engine/src/confidence.ts` = single source of truth (logic was duplicated in calculate.ts + projected-pay.ts and stale w.r.t. CP2 exception fields). `confidenceLabel`: High confidence / Needs review / Cannot finalize yet. `calculateProjectedPay` returns richer result (confidenceReasons[], warnings[], blockers[], hours/days, payType, attendanceComplete; disclaimers[0] = not-final guardrail; paid leave never reduces monthly base). API: `projectedPay.forEmployee`/`.own` — payPeriodId optional (defaults current period), `.own` strips resolutionLink (no admin links to employees), `runs.preview` returns confidenceCounts. UI: employee "Estimated pay this period" card on /app/payroll/payslips + admin "Projected pay confidence" indicator in run preview. Verified `scripts/verify-live-pay-projection.ts` 13/13 + projected-pay.test.ts (engine 27/27) + browser (employee card Cannot-finalize/Needs-review, admin preview counts, own payload no resolutionLink, auditor forEmployee 403). Hourly/daily covered by unit tests (none seeded — limitation logged; "shift"=daily, no enum). **CP4 GPS scrub + source labels + integration verify ✅ (closes 11G)** — no migration (schema already had nullable geofence lat/lon + coordsPurgedAt + attendance_setting.gps_retention_days=90). `scripts/scrub-geofence-gps.ts`: after retention window, NULL geofence_check_in lat/lon + stamp coordsPurgedAt (keep verdict/distance/accuracy/site/reason/time) + NULL attendance_event locationLat/Lon; DRY-RUN default, --apply to write, recent rows untouched, prints counts. Attendance `recordsList` enriched with source key (from linked events: single/mixed/none) + needsReview (open exception on employee+date); UI maps to plain labels (Manual entry/Biometric device/Mobile GPS check-in/File import/Admin adjustment/Mixed sources/Source unavailable) + "Needs review" badge, no raw enum/GPS. Verified `scripts/verify-biometric-geofence-attendance-payroll-integration.ts` 22/22 (raw-punch safety, exceptions, readiness, projection, privacy/scrub, processor link+idempotency) + scrub dry-run/apply proof + browser (source labels, no lat/lon leak, estimated card, geofence check-in, employee 403 on exceptions/punches, auditor validate 403). **Phase 11G COMPLETE.** **11H ✅ — PHASE 11 (Biometric + Geofencing) COMPLETE.** Module-wide QA/RBAC/security/browser pass (3 parallel read-only audits → sequential fixes only). Fixes: `payslipsList` leftJoins employeeProfile (names not raw cuid in payslips + run preview, via getTableColumns); wageType→wageTypeLabel; correction status→label; biometrics overview "Geofencing (coming soon)" <a> → <Link>; `containsBiometricTemplate` now recurses nested objects/arrays (template under meta.fingerprintData was accepted); `ingest.submit` rejects non-active devices; `buildExceptionReview` compares period bounds on DATE granularity (date-mode vs timestamp dropped last-day exceptions — lessons #80). Documented backlog (not changed in QA): manager mappings/assignments visibility (A1/A2), processor non-transactional double-create window (C-D1), unmapped-punch per-employee gap (C-D2), duplicate_punch dead type (C-D3), event-scrub date granularity (C-D5). RBAC verified live: employee global punches/exceptions 403 + own projection no resolutionLink; auditor read-only (mutations 403, no action buttons); payroll_admin/manager no device/geofence manage; public ingest bad key 401 + nested template rejected + inactive device 403. Gates: check-types 3/3, payroll-engine 27/27, build, web tsc 26 baseline, ultracite 223/1/2, audit:permissions 73/10. 12 screenshots docs/reviews/phase-11h/, 0 console errors. **Next: Phase 12 Assets** (queued spec, connects to Offboarding asset returns); user roadmap order after: Helpdesk/Requests → Projects/Tasks/Timelines → Performance → Finance → CRM. Future modules (CRM/Finance/Projects/Tasks) NOT built yet; CRM spec must research Odoo/ERPNext/TwentyCRM/SuiteCRM/EspoCRM/Vtiger + HubSpot/Salesforce/Zoho/Pipedrive (+ Horilla/OpenHRMS where HR∩CRM).
- HR Core (Phase 5): **Complete**
- Contracts (Phase 6): **Complete** end-to-end
- Phase 6E: **Complete** — payroll/attendance/leave spec enrichment, GRA verification
- Attendance + Leave (Phase 7): **Complete** through 7H (QA/RBAC pass)
- Payroll (Phase 8): **Complete** through 8K + 8J.1/8J.2/8J.3 polish + correctness fixes
- Recruitment + Onboarding (Phase 9): **Complete** (through 9I QA/hardening)
  - 9A (spec) ✅ → 9B (DB schema + seed) ✅ → 9C (oRPC API, 50 procedures) ✅ → 9C.1 manager-scope IDOR fix ✅
  - 9D (Recruitment UI) **CHECKPOINT 2** ✅ + cleanup (`5004616`): Overview + Jobs list/detail + Candidates list + KanbanBoard primitive (@dnd-kit/core only) + Pipeline page (job-scoped, drag/Move-menu, Reject dialog, one-step-backward policy, plain-language errors, `onMoveError` prop).
  - 9D **CHECKPOINT 3** ✅: Interviews list (status filter, client-side join, badges, EmptyState) — live-verified.
  - 9D **CHECKPOINTS 4–6** ✅ (all live-verified via Playwright, 0 console errors): **Offers list+detail** (compensation redaction — recruiter/auditor see "Compensation hidden", owner/admin/hr_admin/payroll_admin see amounts; no create/send/approve); **Reports** (6 stat tiles + pipeline-by-stage CSS bars + offer outcomes, gated owner/admin/hr/auditor); **Candidate detail** (Profile/Applications/Interviews/Notes/Documents tabs, PII shows "Hidden" when redacted, notes/docs FORBIDDEN degrade gracefully).
  - 9D **CHECKPOINT 7** ✅ (live-verified): **Job create/edit forms** (`JobFormDialog`) + **Job detail Overview/Settings tabs** + **status transitions** (Open/Pause/Close/Cancel with confirm dialogs + plain-language helper text; valid-transition-only, no reopen). Compensation/PII-style safety: only API-validated/scalar fields exposed; departmentId/jobPositionId/recruiterUserId omitted (not server-verified — 9I follow-up). **Backend bug found+fixed**: `posting:update` was missing from the AC statement so no role could edit a job (commit `bad8910`).
  - 9D security fix (`357d590`): stored-XSS guards — `safeHttpUrl()` on all DB-derived hrefs + `httpUrlString` Zod validator server-side.
  - 9D **CHECKPOINT 8** ✅ (live-verified): **Interview row actions** (`InterviewActions`) — Reschedule / Mark completed / Cancel / Mark no-show (scheduled-only, confirm dialogs) + Add feedback (completed-only; interviewer names via `hrCore.employees.list`; excludes already-submitted; rating 1–5 + friendly recommend) + View feedback (read-only). Valid-action-only per status; auditor read-only, employee no access. **API bug fixed**: duplicate-feedback now returns CONFLICT not 500 (Drizzle wraps pg error on `.cause`).
  - 9D **CHECKPOINT 9** ✅ (live-verified): **Pipeline candidate quick-view drawer** (Decision-B hybrid) — clicking a card's candidate name opens a right-side drawer (name/status/email/phone/added + "Open full profile →" to `/candidates/$id`); name is a stopPropagation button so drag is unaffected (body-drag still works, no accidental opens). `.qv-*` styles in recruitment.css.
  - 9D **QA/SECURITY PASS** ✅ (`53c8e87`): gates green (lint 225, check-types, build); href audit — all DB-derived hrefs `safeHttpUrl`-guarded; no raw enum leakage (all status/stage/recommend via label maps); fixed 2 internal-ID-as-text spots (jobs/$id candidate names; notes "Team member"). **RBAC matrix verified secure**: Reports gated to owner/admin/hr/auditor; recruiter/manager no Reports; employee/payroll no recruitment sidebar entry; every non-viewer data query 403s (no leak). Known minor (deferred): direct-URL nav to recruitment by a non-viewer shows a degraded Overview firing 403s (sidebar already hides it, data safe) — add a recruitment route-group `canViewRecruitment` guard in 9I; manager has scoped API view access but no sidebar entry (confirm intended).
  - 9D is **feature-complete + QA-passed**. Added `scripts/audit-permissions.ts` (`bun run audit:permissions`) — a QA gate that prevents the `posting:update` class of bug; passes (35 pairs/7 routers), negative-tested.
  - **9I hardening backlog** captured in `docs/architecture/phase-9i-hardening-backlog.md`: (1) permission audit ✅ done; (2) job FK server-verify + expose Department/JobPosition/Recruiter selectors; (3) API denormalization of candidate/opening display fields (5 pages); (4) dialog a11y (aria-labelledby/describedby, focus trap/return, Esc); (5) standardize detail-page tabs (Overview/Activity/Documents/Settings); (6) readable status-history timelines; (7) recruitment route-group no-access guard; (8) brand-new interview scheduling on pipeline/candidate flow.
  - 18/18 payroll-engine tests, 225 lint baseline maintained.
  - **Browser verification VERIFIED ✅ (2026-05-29)** via Playwright on `:3002` against a healthy local API (DB password synced from Infisical into `apps/server/.env`; full process restart). Confirmed: recruiter login → pipeline loads → job picker → drag forward (new→screening) → drag one-back (screening→new) → Move-menu one-step rule (3-back blocked with toast "Move back one stage at a time."; 1-back allowed) → Reject dialog submits + candidate leaves board + Rejected count increments → 0 steady-state console errors. Role matrix: owner/admin/hr_admin/recruiter manage (Move+Reject present); auditor read-only (board visible, 0 Move/Reject); manager scoped (Reports tab hidden, sees only managed openings); employee no access (Pipeline tab hidden).
  - **Defect found + fixed during verification**: the "Move to" menu's `onSelect` bypassed `canMoveStage` (only the drag path enforced the policy). Fixed so the menu applies the identical guard + toast. (`pipeline.tsx`)
- 9E (Onboarding DB schema + seed) ✅: `packages/db/src/schema/onboarding.ts` — 7 tables (onboarding_template, onboarding_template_task, employee_onboarding, onboarding_task, onboarding_document_request, onboarding_acknowledgement, onboarding_activity) + 4 enums (onboarding_status / onboarding_task_status / onboarding_category / document_request_status); migration `0009_complete_red_hulk.sql` applied; `scripts/seed-onboarding.ts` (3 templates/24 tmpl-tasks/5 instances across all statuses/55 tasks/12 doc-requests/2 acks/16 activities). Snapshot rule: onboarding_task denormalizes title/description/category from template (template edits don't mutate in-flight onboardings). Partial unique (org,name) where not-deleted, enforced. Gates: check-types/build/lint-225/audit:permissions all ✓. See `docs/implementation/onboarding-db-setup.md`.
- 9F (Onboarding oRPC API) ✅: `packages/api/src/routers/onboarding.ts` — 7 groups / 31 procedures (templates, templateTasks, employeeOnboarding, tasks, documentRequests, acknowledgements, activity). New `onboarding` resource + 10 actions in permissions.ts; `canManageOnboarding`/`canViewOnboarding` helpers (backend + frontend). **Transactional `start`** (onboarding + snapshot tasks + activity commit together — no half-started onboarding); tenant-verify every FK; employee self-scope (own onboarding/tasks/acks) + manager/auditor scope; audit on every action; plain-language errors. Verified end-to-end via `scripts/verify-onboarding-api.ts`. Gates: check-types/build/lint-225/**audit:permissions (45 pairs/8 routers)** all ✓.
- Next: **Phase 9G Onboarding UI** (`/app/onboarding` routes, OnboardingTabs, TaskChecklist primitive, progress/overdue, document collection, acknowledgement, employee-friendly view). Then 9F–9G Onboarding API/UI, 9H candidate→employee conversion, 9I QA + API denormalization (candidate/opening display fields in interviews.list/offers.list/applications.list) + server-verify departmentId/jobPositionId/recruiterUserId before exposing in job forms + brand-new interview scheduling on the pipeline/candidate flow + recruitment route-group no-access guard.

### Product Standards (set during Phase 8J.1, extended in 8J.2)
- **Module tabs are a product standard.** Each multi-page module exposes its sub-pages via a tabs strip immediately under the page header (`PayrollTabs` in `apps/web/src/features/payroll/payroll-tabs.tsx` is the reference). Future module tabs are recommended for Attendance, Leave, Employee Profile, and Contracts.
- **Plain-language UX.** Never surface raw enum or audit codes as primary text. "Blocker" → "Needs fixing / Cannot continue". "Warning" → "Needs review". "draft" → "Preview". "confirmed" → "Finalized". Raw codes may appear as small secondary text for debugging.
- **No payment automation.** "Marked as paid" only after manual bank confirmation. Exporting a bank file is not payment. No bank-specific export format without official documentation.
- **RBAC role normalization.** Import role helpers from `apps/web/src/lib/rbac.ts` (frontend) and `packages/api/src/utils/role-helpers.ts` (backend) — `canManageHR`, `canManagePayroll`, `canViewPayroll`, `isOwnerOrAdmin`. Helpers accept both Better Auth's default role strings (`owner`, `admin`) and our custom ones (`tenant_owner`, `tenant_admin`). Never re-declare inline `PAYROLL_ROLES` / `HR_ROLES` arrays.
- **Empty states vs skeletons.** Skeleton rows render only while `isLoading === true`. Once data has loaded and the result is empty, render `<EmptyState />` from `apps/web/src/components/empty-state.tsx` with `title` + `description` + (optional) primary action. Never use skeletons as a permanent empty display.

### Key Architecture Files
- `.claude/CLAUDE.md` — Full project instructions with doc references
- `docs/architecture/` — Schema specs, API specs, UI plans, implementation plans
- `docs/horilla-extraction/` — Module extraction docs from Horilla/OpenHRMS
- `packages/db/src/schema/` — Drizzle schema (`auth.ts`, `hr-core.ts`)
- `packages/api/src/routers/` — oRPC routers
- `packages/api/src/utils/` — Audit, scope, error utilities
- `packages/auth/src/permissions.ts` — 9 tenant roles with resource/action definitions

### Design Fidelity Rule
- Handoff CSS classes (`.tbl`, `.badge`, `.tabs`, `.filter-chip`, etc.) are first choice
- shadcn used only for behavior/accessibility where handoff has no equivalent
- No visual drift toward default shadcn styling

---

## Permanent execution model (phases 9G → 15)

Source of truth for **how** work is executed. Applies to every remaining phase.

- **Parallelism = read-only review only.** Use Workflows / parallel subagents only for
  read-only review (UX, security/RBAC, a11y, docs consistency, screenshots, QA plans,
  audits). Never run multiple agents that edit code at once — only one agent writes.
- **Implementation is sequential.** One implementation agent writes code, checkpoint by
  checkpoint. Never two writers on the same module or shared file
  (`role-helpers.ts`, `rbac.ts`, `permissions.ts`, `*.css`, `routeTree.gen.ts`, API
  routers, DB schema, `packages/ui/*`, `packages/payroll-engine/*`). No mega-commits.
- **Commit / push / verify clean tree after every checkpoint.**
- **Quality gates every checkpoint:** `bun run check-types --force --filter=web`,
  `bun run build --force --filter=web`, `bun x ultracite check` (hold the documented
  225/1 baseline — never *regress*; the baseline itself is pre-existing and accepted),
  `bun run audit:permissions` (must PASS).
- **Verification is type-specific and mandatory:** UI → Playwright (real DOM events;
  authenticate via same-origin `/api/auth/sign-in/email`; 0 console errors on the happy
  path) + screenshots under `docs/reviews/<phase>/`; backend → authenticated RPC (authz
  denial *before* existence checks); schema → migration. `browser_run_code_unsafe` runs
  in Node — DOM/`fetch`/timers only exist inside `page.evaluate(...)`. Never skip
  verification just because the build passes.
- **Security:** frontend checks are UX only, API is the source of truth; tenant-verify
  every FK; employee self-scope enforced server-side; auditor read-only everywhere.
- **Hard stops:** stop and report before touching shared credentials / secrets / central
  DB passwords / Infisical; never commit `.env`; restart only your own project's local
  dev processes (confirm a process's cwd before killing it).
- **Dev env:** API :3000, web must bind :3002 (vite proxies `/api`+`/rpc` → :3000);
  test org `atlas-shipping`; creds `*@atlas-shipping.com` / `HeimdallTest2026!`.

### Phase roadmap
Canonical build order lives in
[docs/architecture/modules/implementation-sequence.md](docs/architecture/modules/implementation-sequence.md).

✅ 5 HR Core · ✅ 6 Contracts · ✅ 7 Attendance + Leave · ✅ 8 Payroll ·
✅ 9 Recruitment + Onboarding · ✅ 10 Offboarding →
**11 Biometric + Geofencing ← NEXT** (11A spec) →
12 Assets / Helpdesk / Projects (Assets spec already drafted + queued —
`docs/architecture/assets-implementation-plan.md`) →
13 Performance / PMS → 14 Automations + Notifications →
15 Analytics + Dashboards + Reports.

Each phase still runs the A→E checkpoint cadence (A spec → B schema+seed → C API →
D UI → E QA/RBAC); Biometric + Geofencing fans 11A–11H per the spec.
