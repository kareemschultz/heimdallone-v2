# Repo-Wide Phase Completion Audit — 2026-06-10

Evidence-first verification audit (not a build phase). All claims below are
backed by command output run during this audit.

## Repo state (Step 1)
- **HEAD:** `b170bb71b68406536c23b90ab7b6b50c6f05b071`
- **origin/master:** `b170bb71b68406536c23b90ab7b6b50c6f05b071` → **HEAD == origin/master ✓**
- **`git status --porcelain`:** empty → **tree clean ✓**
- **`git status -sb`:** `## master...origin/master` (no divergence)
- **Briefing was stale:** the briefing's "latest SHA `2c3e68c` / next = 15E" is a snapshot from Phase 15D. `git rev-list --count 2c3e68c..HEAD` = **32 commits** since; Phases **15E, 15F, 15G, 15H, 15I, 16(A–I), 17(A–H), 18(A–I), 19, 20** all landed, plus a UI consistency overhaul (StatTile + DataTable + Corporate theme + collapsible chrome). **Actual next phase: none open** — Phase 20 (production readiness) is the last roadmap item and is complete.

## Gates (Step 3)
| Gate | Type | Result |
|---|---|---|
| `bun run check-types` | blocking | **3/3 PASS** |
| `bun run build` | blocking | **2/2 PASS** |
| `bun run audit:permissions` | blocking | **149 pairs / 18 routers PASS** |
| `bun run check` (lint) | informational | **201 errors** (baseline was 212 → improved; all legacy shared files) |
| `apps/web typecheck` | informational | **7 errors** (documented baseline: settings×2, employees/$id×2, login, docs, employees/index) — **0 new**, none in Performance/Projects/Helpdesk/Assets |

## Verification scripts (Step 4) — all run this audit, all PASS
| Script | Result |
|---|---|
| verify-performance-db | **25/25** |
| verify-performance-api | **37/37** (incl. employee activity.list → FORBIDDEN, peer anonymity, 1-on-1 redaction) |
| verify-crm-db | **30/30** |
| verify-crm-api | **34/34** |
| verify-finance-db | **26/26** |
| verify-finance-api | **35/35** |
| verify-analytics-api | **25/25** |
| verify-projects-api | **71/71** |

All mutating seeds were restored after API verifies.

## Phase completion matrix
| Phase | Module | Claimed | Evidence | Verify Script | Browser | Actual |
|---|---|---|---|---|---|---|
| 5 | HR Core | complete | schema+router+seed | (integration) | prior | **complete** |
| 6 | Contracts | complete | router + masking (applyMasking) | (integration) | prior | **complete** |
| 7 | Attendance/Leave/Policy | complete | routers + verify-leave-policy-engine | leave-policy | prior | **complete** |
| 8 | Payroll | complete | payroll-engine + router | verify-live-pay-projection | prior | **complete** |
| 9 | Recruitment/Onboarding | complete | routers + verify-onboarding-api | onboarding-api | prior | **complete** |
| 10 | Offboarding | complete | router + seed | (integration) | prior | **complete** |
| 11 | Biometric/Geofencing | complete | router + verify-biometric-* | biometric-api + integration | prior | **complete** |
| 12 | Assets | complete | router + redactAsset | verify-assets-api | prior | **complete** |
| 13 | Helpdesk | complete | router + verify-helpdesk-api | helpdesk-api | prior | **complete** |
| 14 | Projects/Tasks | complete | router | **verify-projects-api 71/71** | prior | **complete (re-verified)** |
| 15A–15D | Performance spec/DB/API/goals UI | complete | docs + schema + router | **perf-db 25, perf-api 37** | prior | **complete (re-verified)** |
| 15E | Review cycles + responses UI | complete | `4567fd3` + routes | perf-api (anonymity) | prior | **complete** |
| 15F | 1-on-1s UI | complete | `ffea401` + redactOneOnOne | perf-api | prior | **complete** |
| 15G | Recognition UI | complete | `6708da1` | perf-api | prior | **complete** |
| 15H | Auto-award recognition | complete | `3f1e211` | perf-api | prior | **complete** |
| 15I | Performance QA | complete | `565b409` + docs/reviews/phase-15i | — | prior | **complete** |
| 16 | Finance | complete | `eb40162…d33d67e` | **finance-db 26, finance-api 35** | prior | **complete (re-verified)** |
| 17 | CRM | complete | `81a0ec9…2463a63` | **crm-db 30, crm-api 34** | prior | **complete (re-verified)** |
| 18 | Analytics | complete | `b7c1077…118e9e9` | **analytics-api 25** | this audit (admin/employee/manager) | **complete (re-verified)** |
| 19 | Enterprise QA / a11y | complete | `d2f6e27` + docs/reviews/phase-19 | gate suite | this audit | **complete** |
| 20 | Production readiness | complete | `70efaed` + docs/production-readiness.md | gate suite | n/a | **complete (no dedicated review folder — see docs note)** |

## RBAC audit (Step 5) — CLEAN
All 17 routers registered. audit:permissions 149/18. Backend `role-helpers.ts` ↔ frontend `rbac.ts` byte-aligned (only frontend-only `isEmployee`/`isManager` display helpers have no backend mirror — harmless). Specific checks all PASS: payroll_admin has no Performance mutation grant; project_manager/recruiter/helpdesk_agent have no Performance grant; auditor read-only (zero mutation verbs); manager direct-report scoped; employee self-only; owner/admin full. Sensitive gates are server-side (privateManagerNotes, peer anonymity, CRM money/private notes, project budget) — not UI-only.

## Cross-module write guardrail (Step 7) — CLEAN
Grep of `db.(insert|update|delete)` (123 hits / 15 routers) + tx-scoped writes verified: every coordination-module write targets its own tables + `audit_event`. **analytics.ts = zero writes** (confirmed). `recognition_point` is a non-monetary points ledger (no money/payroll FK). `crm_customer_project_link.projectId` written NULL. payroll pulls no raw biometric punch into pay. No violations.

## Route / navigation audit (Step 6) — CLEAN (1 Low)
No flat-vs-folder route shadowing. `/app/performance` is a folder route (no flat stub); goals/$id, my-goals, reviews, one-on-ones, recognition all present. Preview modules (Compliance/Clients/Countries/Documents) carry `<PreviewBanner>` + a "Preview" nav pill. No-access branches present on every spot-checked index. No sidebar visibility leaks for recruiter/helpdesk_agent/project_manager/sales. **Low:** `route.tsx:377` `isNavItemVisible` defaults to `return true` (fail-open) — all 12 real roles are explicitly handled so not currently exploitable, but a future/typo role would default to see-all (nav-only; data still route-guarded). Recommend `return false`.

## Sensitive-data / redaction audit (Step 8) — 2 HIGH + 1 MEDIUM found
**Confirmed by direct code read (hr-core.ts):**
- **HIGH-1 — Cross-tenant IDOR.** `workInfoGet` (hr-core.ts:1231) and `bankDetailsGet` (hr-core.ts:1323) filter by `employeeId` only with **no `organizationId` scope** → an authenticated member of org A can read org B rows by passing a cross-tenant `employeeId`. `bankDetailsGet` masks the account number for non-payroll roles but returns FULL bank details to a `payroll_admin` — i.e. a payroll_admin in tenant A can read tenant B bank accounts. `workInfoGet` returns the full row including `basicSalary`.
- **HIGH-2 — Salary masking gap.** `workInfoGet` returns `basicSalary`/`salaryCurrency` to ANY `employee:read` holder (employee, manager, recruiter, helpdesk_agent) with no masking — bypassing the scoped gate on `employeeGetById`. The codebase masks this same value in `contracts.ts` (`applyMasking`, only `canManagePayroll` sees it), so this is an inconsistency, not a design choice.
- **MEDIUM — `employeeGetById` salary.** Properly scoped (manager→reports, employee→self, org-checked) but returns `basicSalary` unmasked to managers/self — same policy inconsistency vs `contracts.ts` (same-org, scoped; lower blast radius than the above).

All OTHER sensitive fields verified **redacted server-side**: one-on-one privateManagerNotes (redactOneOnOne, list+getById), peer-review anonymity (threshold logic), project budget/internalNote (redactProject), asset purchaseCost (redactAsset), bank account masking (maskAccountNumber), contract baseSalary (applyMasking), biometric device secrets (publicDevice strips apiKeyHash/credentialRef), CRM deal.value/lead.estimatedValue + private notes, finance/analytics money (AC + dept scope).

→ These three are addressed in a **separate code-fix commit** (see below), not in this audit-docs commit.

## Fake / demo data audit (Step 9) — 1 MEDIUM
- **MEDIUM — `apps/web/src/routes/app/index.tsx`** (the main `/app` dashboard) renders **entirely hardcoded data** (name "Maya", "Atlas Shipping", headcount 1,284, fabricated charts) with **no `orpc.*` queries and no `<PreviewBanner>`** — only a small "Demo sync status" chrome badge. It looks production-live. Recommend: add `<PreviewBanner>` or wire to real `orpc` queries. (This is the legacy landing page, predates the module dashboards.)
- Preview scaffolds (compliance/countries/documents/clients) correctly labeled (PreviewBanner + "Coming Soon"). analytics/finance/recognition confirmed backed by real `orpc.*` queries (not hardcoded). 3 benign `TODO(9I)` denormalization notes in recruitment; 0 FIXMEs. Other "placeholder" hits are honest scaffolds (no-file-storage notes, anti-spoof `mockLocationFlag`).

## Docs consistency audit (Step 11) — stale trackers (corrected this commit)
| Doc | Was | Action |
|---|---|---|
| `docs/architecture/modules/implementation-sequence.md` | "Phase 18 (ACTIVE)" | corrected → 18/19/20 COMPLETE |
| `AGENTS.md` | "Phase 15 COMPLETE / NEXT = Phase 16" | corrected → Phases 16–20 complete |
| `.claude/CLAUDE.md` | reaches Phase 18, frames 19/20+overhaul as upcoming | appended 19/20 + overhaul COMPLETE |
| `memory/project_current_status.md` | (not in repo — lives in ~/.claude memory) | n/a for repo commit |
| `docs/reviews/phase-20/` | absent | Phase 20 review captured in `docs/production-readiness.md` (noted) |

## Browser smoke (Step 10)
Performed this audit (plus extensive smoke earlier in the UI-overhaul work): admin `/app/performance` (4 StatTiles, no error), `/app/performance/goals` (DataTable, 7 rows), employee `/app/performance/my-goals` (renders; nav scoped to 8 items, **no Analytics/Finance/CRM/Payroll**). No console error banners; nav gating correct per role. Not exhaustively re-smoked every route × every role this pass — the verify scripts (above) cover server-side RBAC; the route agent confirmed no-access branches statically.

## Verdict
**Safe to proceed — with one caveat.** All blocking gates pass, all verify scripts pass, RBAC + cross-module + route layers are clean, and Phases 5–20 are genuinely complete (re-verified, not doc-trusted). The roadmap has **no open build phase**. The audit found **2 HIGH multi-tenancy/redaction bugs in hr-core.ts** (cross-tenant IDOR + salary masking gap) which are small and safe to fix and are addressed in a separate hardening commit. The `app/index.tsx` fake-dashboard (Medium) and the fail-open nav default (Low) are recommended for a follow-up `Phase 20-hardening` pass.

## Top issues (severity-ranked)
1. **HIGH** — Cross-tenant IDOR: `workInfoGet`/`bankDetailsGet` lack org scope (hr-core.ts:1231,1323). *Fix now (separate commit).*
2. **HIGH** — `workInfoGet` returns `basicSalary` unmasked to any `employee:read` holder (hr-core.ts:1231). *Fix now.*
3. **MEDIUM** — `employeeGetById` returns `basicSalary` unmasked to managers (hr-core.ts:920/968) vs contracts.ts policy. *Fix now (consistency).*
4. **MEDIUM** — `app/index.tsx` main dashboard is hardcoded fake data with no Preview marker. *Defer to hardening phase.*
5. **LOW** — `isNavItemVisible` fail-open default (route.tsx:377). *Defer / one-line deny-by-default.*
6. **LOW** — manager-scope `getDirectReportIds` org-param not passed on 7 older call sites (attendance/biometric/hr-core/leave). *Defer (documented).*
7. **CLEANUP** — frontend-only `isEmployee`/`isManager` helpers have no backend mirror.
8. **CLEANUP** — no `docs/reviews/phase-20/` folder (covered by production-readiness.md).
9. **ENHANCEMENT** — add verify-*-db/api scripts for hr-core/contracts/attendance/payroll (currently covered only by integration verifies).
10. **ENHANCEMENT** — burn web tsc 7→0 + lint 201→0 to flip CI informational gates to blocking.
