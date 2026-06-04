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

## References

Technology references for this project (researched from live docs):

- [Better Auth Organization Plugin](.claude/docs/better-auth-organization.md) — multi-tenancy, roles, permissions, teams
- [Better Auth Admin Plugin](.claude/docs/better-auth-admin.md) — platform admin, user management, impersonation
- [oRPC Reference](.claude/docs/orpc-reference.md) — server/client/middleware patterns with Hono
- [Design Handoff Summary](.claude/docs/design-handoff-summary.md) — tokens, screens, interactions, sample data
- [Horilla Module Map](.claude/docs/horilla-module-map.md) — Horilla module → Heimdallone concept mapping
- [shadcn/ui Reference](.claude/docs/shadcn-reference.md) — components, Field/Form pattern, Data Table, charts, blocks, skills (uses @base-ui/react NOT Radix)

Design source of truth: `design_handoff_heimdallone/` (committed to git). Open the HTML files directly — the CSS rule is the answer.
Note: This project uses shadcn `base-lyra` style (@base-ui/react), NOT Radix. shadcn skill is installed.

- [Lessons Learned & Gotchas](.claude/docs/lessons-learned.md) — edge cases, patterns, mistakes to avoid

### Repo gates, CI & known baselines (QA hardening pass, 2026-06-04)

- **Gates:** `bun run check-types` (`turbo check-types`) covers **server/ui/payroll-engine only = 3/3** — `apps/web` is **deliberately NOT in this gate** (its tsc script is named `typecheck`, not `check-types`, so turbo doesn't aggregate it; see lesson #87). `bun run build` = 2/2. `bun run audit:permissions` = **93/13**. `bun run check` (ultracite lint) carries an **accepted 212-error baseline** in legacy shared files.
- **CI:** `.github/workflows/ci.yml` — install + `check-types` + `build` + `audit:permissions` are **blocking**; `check` (lint) and web `typecheck` run **`continue-on-error` (informational)** until their baselines are burned down.
- **Documented baselines (NOT regressions):** web `typecheck` = **7 errors** in `docs.tsx` / `app/settings.tsx` / `employees/$id.tsx` / `employees/index.tsx` / `login.tsx`; lint = 212. The pre-commit hook lints the **whole staged file**, so clearing these is a per-file burn-down task (lesson #83), not a drive-by edit. **Follow-up:** clear web tsc 7→0, rename web `typecheck`→`check-types` to enter the root gate, then flip CI lint blocking.
- **Preview modules:** Compliance, Clients, Countries & Tax, Documents are **design scaffolds on sample/demo data** — marked with a "Preview" sidebar pill + `apps/web/src/components/preview-banner.tsx` `<PreviewBanner>`. Routes are kept reachable for design review; do not present their stats/exports as live.
- **Bank data:** `employee_bank_details.account_number` is **masked at the API** for non-payroll roles (full only for HR/payroll); plaintext **at rest** is a separate, documented future hardening item (field-level encryption), not a response-layer leak.

HRMS domain extraction (Phase 4D):

- [Horilla Extraction Index](docs/horilla-extraction/README.md) — 20 module extraction docs with Heimdallone-native recommendations
- [Module Priority Index](docs/horilla-extraction/module-index.md) — priority tiers, dependencies, implementation order
- [UI Pattern Library](docs/horilla-extraction/ui-pattern-library-recommendations.md) — cross-module UI standards
- [Domain Roadmap](docs/horilla-extraction/heimdallone-domain-roadmap.md) — Phases 5-15 implementation sequence

HR Core implementation (Phase 5):

- [HR Core Domain Plan](docs/architecture/hr-core-domain-plan.md) — entity relationships, archive strategy, open questions
- [HR Core Schema Spec](docs/architecture/hr-core-schema-spec.md) — Drizzle tables, money/enum/date strategy
- [HR Core API Spec](docs/architecture/hr-core-api-spec.md) — oRPC procedures, RBAC, bank masking, known limitations
- [HR Core UI Plan](docs/architecture/hr-core-ui-plan.md) — routes, primitives, UX, Phase 5B implementation sequence
- [HR Core DB Setup](docs/implementation/hr-core-db-setup.md) — tables, migrations, seed, commands
- [Shared UI Primitives](docs/architecture/shared-ui-primitives-plan.md) — 17 component specs with handoff CSS mapping
- [Module Spec Backlog](docs/architecture/modules/README.md) — specs for all post-HR-Core modules

Contracts implementation (Phase 6):

- [Contracts Implementation Plan](docs/architecture/contracts-implementation-plan.md) — schema, API, UI, RBAC, business rules
- [Contracts Module Spec](docs/architecture/modules/contracts-spec.md) — original extraction spec

Attendance + Leave implementation (Phase 7):

- [Attendance Implementation Plan](docs/architecture/attendance-implementation-plan.md) — schema, API, UI decisions, payroll integration
- [Leave Implementation Plan](docs/architecture/leave-implementation-plan.md) — schema, API, UI decisions, balance/accrual rules
- [Payroll Readiness Plan](docs/architecture/attendance-leave-payroll-readiness-plan.md) — data flow from attendance+leave into payroll
- [Analytics & Reporting Plan](docs/architecture/analytics-reporting-plan.md) — charts, stat tiles, PDF export, per-module analytics
- [Payroll Implementation Plan](docs/architecture/payroll-implementation-plan.md) — Phase 8 spec: entities, engine, Guyana rules, UI, RBAC, Caribbean country research

Payroll engine (Phase 8C):

- `packages/payroll-engine/` — pure TypeScript calculation engine, zero dependencies
- Country rules registry: `src/countries/registry.ts` — lookup by countryCode + effectiveYear
- Guyana 2026 implemented; Barbados 2026 and Trinidad 2026 researched but deferred

Biometric + Geofencing (Phase 11 — active):

- [Biometric + Geofencing Implementation Plan](docs/architecture/biometric-geofencing-implementation-plan.md) — Phase 11A spec: device sync/import model, adapter/provider model (multi-vendor), geofenced check-in, entities, RBAC, attendance/payroll integration, UI routes, security/privacy, 11A–11H sequence
- [Biometric + Geofencing DB Setup](docs/implementation/biometric-geofencing-db-setup.md) — 11B schema (8 tables, enums, migrations 0011/0012)
- [Biometric + Geofencing API](docs/implementation/biometric-geofencing-api.md) — 11C router, adapter/provider model, punch processor, ingest endpoint, RBAC, privacy

Assets (Phase 12 — ✅ COMPLETE; 12B DB → 12C API → 12D UI → 12E QA/sidebar/offboarding-custody):

- [Assets Implementation Plan](docs/architecture/assets-implementation-plan.md) — spec (entities, Drizzle schema, oRPC API + RBAC, UI checkpoints, offboarding custody integration).
- [Assets DB Setup](docs/implementation/assets-db-setup.md) — 12B: 4 tables + 3 enums, migration 0014, idempotent seed.
- [Assets API](docs/implementation/assets-api.md) — 12C: `assets` router (inventory/categories/assignments/requests), `asset:request` AC action, 6 RBAC helpers, server-side purchaseCost redaction, transactional assign/return, two-layer authz, verify 46/46; +12D `assignments.listMine`; +12E read-only offboarding `AssetCustodyPanel`.
- [Assets Module Spec](docs/architecture/modules/assets-spec.md) — original extraction spec

Helpdesk / Requests (Phase 13 — ✅ COMPLETE; 13A spec → 13B DB → 13C API → 13D overview+queue UI → 13E detail/comments/internal-notes UI → 13F employee My Requests self-service → 13G assignment/SLA/approvals workflow → 13H QA/RBAC/security pass ✅. NEXT MODULE = Phase 14 Projects+Tasks):

- [Helpdesk Requests Implementation Plan](docs/architecture/helpdesk-requests-implementation-plan.md) — 13A spec: request/ticket LAYER that LINKS to Assets/Payroll/Leave/Offboarding (read-only link cols) and NEVER duplicates them; reuses existing `ticket` AC (employee already holds ticket:create); MVP 3 tables; status/SLA/priority; 7 RBAC helpers; router `helpdesk`; HelpdeskTabs UI; 8 open questions; benchmarks Zendesk/Freshdesk/Jira-SM/Frappe/GLPI/Horilla.
- [Helpdesk DB Setup](docs/implementation/helpdesk-db-setup.md) — 13B: 3 tables + 5 enums, migration 0016, 6 read-only cross-module link FKs (set null), SLA state DERIVED not stored, new `ticket:approve` action (least-privilege), idempotent seed (10 cat / 10 req / 6 comment).
- [Helpdesk API](docs/implementation/helpdesk-api.md) — 13C: `helpdesk` router (categories/requests/comments, 20 procs) reusing `ticket` AC; 7 RBAC helpers + frontend mirror; two-layer authz (AC gate + handler scope/IDOR); **server-side internal-note redaction**; derived SLA at read time; reference max+1 retry; link ids tenant-verified + NEVER mutated; verify-helpdesk-api 64/64; audit rose 86/12→**93/13** (ticket pairs now consumed).
- 13D UI (overview + request queue): `features/helpdesk/{labels,badge,helpdesk-tabs,types}` + routes `app/helpdesk/{index,requests/index}` + `styles/helpdesk.css`; sidebar "Helpdesk" entry (LifeBuoy, Operate group; visible to viewers + employee teaser + helpdesk_agent, NOT recruiter); deleted flat helpdesk.tsx stub (route-shadow #4). Overview = status tiles + "Needs attention" (overdue/urgent/waiting-approval/unassigned) + queue quicklink; queue = filterable table (status/priority/category server-filters + SLA client-filter; reference/title/requester/status/priority/SLA/assignee/approval/date/Linked-chip). Browser-verified 6 roles (manager scoped 1 vs admin 10; employee teaser no-queue; recruiter no-entry), 0 console errors, 7 screenshots docs/reviews/phase-13d/.
- 13E UI (request detail + comments + internal notes): route `app/helpdesk/requests/$id.tsx` + `features/helpdesk/{comment-form,request-comments,request-linked-context,request-status-actions}` (queue title now links to detail). Detail = summary grid + read-only linked-records panel ("context only", Assets deep-link gated) + public Conversation timeline + **server-redacted Internal notes** (shown only when getById.canViewInternalNotes; employees never receive the data — proven via direct RPC: REDACTION-PROBE absent from employee payload, canViewInternalNotes=false) + status actions (resolve[note]/close/cancel/reopen). Comment forms gated: public=canCreateHelpdeskRequest, internal=canManageHelpdesk; status actions=canManageHelpdesk (cancel also requester/employee). Browser-verified 5 roles (admin add public+internal; employee own-only no-internal + comment; auditor read-only sees-internal no-forms; manager non-report 403), 0 app console errors (intentional 403 probes noted), 8 screenshots docs/reviews/phase-13e/. Gates check-types 3/3, build 2/2, lint 212/1/1, audit 93/13, verify 64/64, web tsc 0 touched-file.
- 13H QA/RBAC/security/browser pass (CLOSES Phase 13): 4 read-only review agents (security/RBAC/IDOR/redaction · UI/UX/a11y/copy · integration boundaries · API/data) → **integration GUARDRAIL HELD zero violations; security no critical/high/medium; redaction server-side in both comments.list+getById confirmed**. **Small fixes**: (1) `getDirectReportIds` optional `organizationId` filter [manager-IDOR hardening], helpdesk's 4 call sites pass oid; (2) `assertCanDecideApproval` explicit non-manager throw [no "everything-else=manager"]; (3) overview loading/error state [error no longer = healthy empty desk]; (4) aria-labelledby on the 2 dialogs that lacked it; (5) `:focus-visible` rings restored on inputs/selects/pills/tabs/cards [WCAG 2.4.7]; (6) internal-note disclaimer copy accuracy [auditor/payroll]; (7) code comment for internal-note-on-terminal asymmetry. verify expanded **79→96** (cancel lifecycle+authz, all cancelled-terminal blocks, internal-note-on-closed allowed/public-blocked, changeStatus→each working state, update+terminal-block, mine self-scope). **Browser-verified 7 roles, 11 screenshots docs/reviews/phase-13h/**; **headline guardrails re-proven via real client**: employee getById HD-000002 redaction (canViewInternalNotes:false, REDACTION-PROBE absent) + comments.list no-leak; employee non-own → FORBIDDEN; manager scope AFTER hardening = report getById OK + non-report FORBIDDEN (behavior-preserved). Deferred+documented: reference lexical-max robustness (HD-format safe; unique-index backstop), dialog focus-trap (app-wide pattern), SLA waiting-pause/status_history, same getDirectReportIds hardening for onboarding/offboarding/recruitment (param now optional). Gates check-types 3/3, build 2/2, lint 212/1/1, audit 93/13, verify 96/96, web tsc 25 (0 touched). Lesson #86 (`outline:none` without `:focus-visible` = recurring WCAG miss). **PHASE 13 HELPDESK COMPLETE.**
- 13G UI+API (assignment / SLA / approvals workflow): **API additions all reuse existing `ticket` AC pairs → audit stays 93/13**: `requests.list` gains `assignedToMe`/`unassigned` filters (ticket:read, server-resolved); `requests.assignToMe`/`unassign`/`assignableAgents` procs (ticket:assign). verify-helpdesk-api expanded **64→79** (section 9: agent picker, assignToMe lifecycle, filters, teammate assign, unassign, employee/manager/auditor negatives). **Approvals stay on `ticket:approve`, NOT ticket:update** (user's flagged guardrail). UI: `features/helpdesk/{assignment-controls,approval-panel,request-sla}.tsx` + extended `request-status-actions.tsx` (Start work/Waiting on employee/Send for approval via changeStatus) + queue "Filter by assignment" (Assigned to me/Unassigned) + employee friendly `employeeStatusMessage` on My cards. Detail wires Approval panel (Approve/Reject[reason required], gated canApproveHelpdeskRequest; server enforces manager/payroll scope) + Assignment panel (Assign to me/teammate-picker/Unassign, gated canAssignHelpdesk) + Service-level SLA panel (derived state + human copy; **waiting-pause NOT implemented — surfaced as honest note, no status_history table this phase**). **Browser-verified 6 roles, 11 screenshots docs/reviews/phase-13g/**: admin full workflow round-trips (assign-to-me/teammate, Start work, reject-with-reason); payroll approve round-trip (Devon Clarke); manager scoped approve on report + non-report getById FORBIDDEN; auditor read-only zero affordances; employee Cancel-only + reply + friendly status + NO internal/assign/approval/workflow. Defense-in-depth (real client): employee changeStatus/assignToMe/approve/assignableAgents all AC-blocked; manager assignToMe blocked. 0 app console errors except intentional probes. Gates check-types 3/3, build 2/2, lint 212/1/1, audit 93/13, verify 79/79, web tsc 25 (0 touched). Deviations: queue actions read-only (mutations on detail); payroll approves any category (finance-only deferred). NEXT 13H QA/RBAC/security/browser pass.
- 13F UI (employee My Requests self-service): new route `app/helpdesk/my.tsx` (own requests list + "Request help" create form via `requests.createSelf` + reuse of the `$id` detail). Filter pills (Open/Waiting-on-me/Waiting-on-approval/Resolved-closed/All, client-side over one bounded fetch); plain-language form (category picker / Summary / "Tell us what happened" / "How urgent is this?"; no target/assignee/internal/approval/link fields); on create → toast + navigate to detail. **One JUSTIFIED API addition** (spec escape hatch): `requests.list` opt-in **`mine: true`** forces self-scope (requester = caller) for ANY role — without it "My requests" showed the team queue for managers and the **whole org for admins** (22 rows). Backwards-compatible (defaults off) → verify stays **64/64**, audit **93/13**. Employee overview is a **landing that LINKS to /my, not an auto-redirect** (a render-time `<Navigate>` bounced viewers/admins too, because OrgCtx defaults memberRole to "employee" until the async membership loads — lesson recorded). My-requests tab added for canCreate viewers (managers/HR/agents), hidden for read-only auditor/payroll; page gated `canViewHelpdesk||canCreateHelpdeskRequest` (recruiter → clean no-access). **Self-scope proven** (manager via real client: `mine` → 3 own (Andre); default → 7 own+report (Dwayne excluded from `mine`)). **Redaction re-proven** (employee getById HD-000002 → canViewInternalNotes:false, REDACTION-PROBE absent). Server enforces (auditor createSelf → Missing permission: ticket:create; employee other-request → FORBIDDEN). Browser-verified 6 roles, 14 screenshots docs/reviews/phase-13f/. Gates check-types 3/3, build 2/2, lint 212/1/1, audit 93/13, verify 64/64, web tsc 25 (0 touched-file).
- [Helpdesk Module Spec](docs/architecture/modules/helpdesk-spec.md) + [Horilla Extraction](docs/horilla-extraction/helpdesk.md) — original extraction

Projects + Tasks / Timelines (Phase 14 — ACTIVE; 14A spec ✅ → 14B DB ✅ → 14C API ✅ → 14D overview/list UI ✅ → 14E detail/members/milestones ✅ → 14F tasks/Kanban next):

- 14E UI (project detail + members + milestones): route `app/projects/$id.tsx` (in-page sub-tabs Summary·People·Milestones; Tasks/Board=14F, Time=14G, Activity=14H as later panels) + `features/projects/{project-people,project-milestones}.tsx`; list/overview names now Link to detail. Summary = grid (PM/status/health/priority/dates/members/tasks; budget only when canViewBudget; CRM soft-ref chips "context only — CRM future"; internalNote only when canViewProjectInternalNotes). People = members list + Add (employee picker via hrCore.employees.list)/Remove gated canManageProjectMembers. Milestones = list + Add + Mark-complete gated canEditProject. **API addition: `project.internalNote` now redacted SERVER-SIDE** (`redactProject`→`redactInternalNote` in list+getById; mirrors budget redaction — was UI-only) → verify 62→**68/68** (+6 internalNote redaction assertions: admin/pm/auditor see, manager/employee/payroll null); audit STAYS 109/14 (no new pairs). **Browser-verified 3 roles, 4 screenshots docs/reviews/phase-14e/**: admin full (Summary+internalNote+budget, People Add/Remove, **milestone Mark-complete WRITE round-trip In-progress→Completed**); manager **redacted (no budget, no internalNote) + read-only People (no Add/Remove)**. Transient vite HMR flake on adding $id route (AppRouteRouteImport-before-init; self-healed on reload; full build clean — not a defect). Gates check-types 3/3, build 2/2, audit 109/14, web tsc 0 touched-file, verify 68/68, lint clean. Deviation: per-project detail uses IN-PAGE sub-tabs (not separate $id/tasks routes) — simpler, 14F/G/H add panels.

- 14D UI (overview + projects list): `features/projects/{labels,badge,types,projects-tabs}` + routes `app/projects/{index,all}` + `styles/projects.css` (mirror of helpdesk.css, hd-→pj-). Sidebar "Projects" entry (FolderKanban, Operate group; added to EMPLOYEE/MANAGER/PROJECT_MANAGER visible-key sets; recruiter/helpdesk_agent NOT). **Overview** = status tiles (Active/On-hold/At-risk/Off-track/Overdue-tasks, all derived client-side from projects.list) + "Needs attention" (off-track/at-risk/on-hold/has-overdue-tasks) + All-projects quicklink; employee → landing that LINKS to /all (NOT a render-time redirect, lesson #84); recruiter → no-access. **List** (/app/projects/all) = client-side filter (status/health/search) over one bounded fetch; columns reference/name+PM/status/health/priority/tasks(open·total·overdue)/target/Linked-chip; name PLAIN TEXT (detail = 14E); employee title "My projects". Badges carry text (never colour-only). **Browser-verified 5 roles, 7 screenshots docs/reviews/phase-14d/**: admin full (7 projects); **employee scoped = 3 member projects (PRJ-000004/003/001; wifi+cpe ABSENT — no leak)**; manager scoped = 4; recruiter no nav-entry + clean no-access; project_manager (new role) nav + full overview. 0 app console errors (favicon 404 only). Gates check-types 3/3, build 2/2, audit 109/14 (UI-only, unchanged), web tsc 0 touched-file, lint clean on 8 files.
- [Projects API](docs/implementation/projects-api.md) — 14C: `projects` router (projects/members/milestones/tasks/comments/timeEntries, ~30 procs) on the 14B schema; **coordination-layer guardrail enforced in code** (ZERO writes to asset/helpdesk/payroll/attendance; link ids tenant-verified SELECT-only + resolved read-only; CRM soft text refs; **budget finance-redacted** + canViewBudget flag; **task internal-note redaction server-side**; health DERIVED). 11 RBAC helpers byte-aligned role-helpers.ts↔rbac.ts (aligned to the **actual 14B AC grant**, not the spec prose — `canViewProjectCosts` EXCLUDES project_manager/manager; `task:create` is canManageProjects-only so managers don't create tasks). Two-layer authz (AC gate + assertProjectVisible/assertTaskVisible/canActOnTask). New `project_manager` exercised via idempotent `scripts/seed-pm-user.ts` (pm@, Nadia Khan). verify-projects-api **62/62**; **audit 93/13 → 109/14** (EXPECTED — first router on project/task/time_entry, 16 new pairs). Gates check-types 3/3, build 2/2, lint clean, audit 109/14.
- [Projects DB Setup](docs/implementation/projects-db-setup.md) — 14B: **6 tables** (project / project_member [join] / project_milestone / project_task / project_task_comment / project_time_entry) + **7 enums**, migration **0017_happy_hammerhead.sql** (purely additive). **Guardrails PROVEN via constraint catalog**: `project` has NO CRM FK (linkedCustomerId/linkedDealId = soft text refs); task→asset + task→helpdesk_request FKs ON DELETE SET NULL (read-only); `project_time_entry` has NO attendance/payroll/payslip FK (reporting-only, no payrollStatus field); health DERIVED (PROJECT_HEALTH_STATES const, no column); NO project_activity table (reuse audit_event). AC resources project/task/time_entry added + **new `project_manager` role** (10 roles total; no seed user reassigned). **audit stays 93/13** (no router consumes the new pairs yet — 13B ticket:approve precedent; rises to ~106/14 in 14C). Idempotent seed (5 projects [planning/active×2/on_hold/completed; 1 CRM soft-link], 11 members, 8 milestones, 25 tasks [all 6 statuses; 1 asset-linked + 1 ticket-linked], 6 comments [2 internal], 8 time entries [draft/submitted/approved/rejected]). DB verify 26/26 (status spreads, active-membership uniqueness, linked refs valid, constraint-catalog guardrails, enums). Gates check-types 3/3, build 2/2, lint 212/1/1, audit 93/13, ultracite clean.
- [Projects + Tasks Implementation Plan](docs/architecture/projects-tasks-implementation-plan.md) — 14A spec: **coordination layer (link, never own — mirrors the Helpdesk guardrail)** for Operations work-management. Benchmarks Odoo/ERPNext/Zoho/OpenProject/Redmine/Plane/Taiga/Jira/Linear/Asana/ClickUp/Monday/Basecamp/MS-Project. **MVP = 6 tables** (project / project_member [join, supersedes Horilla jsonb] / project_milestone / project_task / project_task_comment / project_time_entry); Activity tab reuses shared `audit_event` (no project_activity table); deferred = dependencies/labels/status_history/Gantt/templates/sprints/files/budget-cost. **New `project_manager` role added in 14B** (doesn't exist yet). AC resources project/task/time_entry → audit 93/13→~106/14. **Coordination links** (mirror helpdesk SET NULL): task.linkedAssetId→asset, task.linkedHelpdeskRequestId→helpdesk_request (helpdesk enum already has project_task), generic linkedEntityType/Id; **CRM `linkedCustomerId`/`linkedDealId` = SOFT text refs NOT FKs** (crm_* tables future). Time entries **reporting-only** (cost report = Phase 16 Finance, reuses payroll-engine + reads contract rate + attendance payrollStatus, NEVER mutates). KanbanBoard primitive EXISTS (needs KeyboardSensor); Calendar/timeline GREENFIELD (simple date cards first, not Gantt). Status lifecycles (project planning/active/on_hold/completed/cancelled/archived; task todo/in_progress/blocked/in_review/done/cancelled; milestone planned/in_progress/at_risk/completed/missed/cancelled; health DERIVED). 11 RBAC helpers byte-aligned. Routes /app/projects/{index,all,$id,$id/tasks,$id/timeline,$id/time,my-tasks,my-time}. Seq 14A spec→14B DB→14C API→14D overview/list→14E detail/members/milestones→14F tasks/Kanban→14G My-Tasks/time→14H timeline/activity→14I QA. 10 open questions answered with recommendations. NEXT = 14B DB schema + migration 0017 + project_manager role + seed.
- [Projects Module Spec](docs/architecture/modules/projects-spec.md) + [Horilla Extraction](docs/horilla-extraction/projects.md) — original extraction (4-entity, jsonb members — superseded by join tables in the 14A plan)
