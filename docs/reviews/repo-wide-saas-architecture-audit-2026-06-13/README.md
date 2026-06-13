# Repo-wide SaaS Architecture Audit — 2026-06-13

**Against:** the Heimdallone SaaS Architecture Rule ("No Client-Specific Builds", AGENTS.md / .claude/CLAUDE.md — now the permanent standing rule, verbatim).
**Method:** 6 parallel read-only review agents across all 18 module routers + schemas + the payroll engine (~30K LOC) + cross-cutting surfaces (RBAC/nav, geofencing, seeds, verify scripts, UI shared primitives, migration tooling). Findings are PII-safe (they reference code, not data).
**Fixes applied this pass:** 2 Critical (cross-tenant write IDORs) + 1 backend defense-in-depth. Everything else is documented below.

---

## 1. Executive summary

**The architecture is sound and genuinely multi-tenant.** There is **no Netsurf- or Foreign-Links-specific business logic** anywhere — grep for those names across all routers/schemas/engine returns hits only in clearly-labelled synthetic fixtures and report identifiers. Every module scopes by `organizationId`, RBAC is deny-by-default, the cross-module mutation guardrail holds (grep-proven), redaction is server-side, and pay-frequency proration is exemplary.

The remaining risk is **not security or client-coupling** — it is **generalization / future-proofing**: a handful of "resolve by `isActive` instead of by date", "hardcoded Guyana/Sat-Sun default", "model too narrow", and "demo chrome shown as live" issues that bite the *next* tenant, country, or year rather than the current proof cases.

### Classification (owner framing, confirmed by this audit)
- **Critical / High live security bugs:** found 2, **fixed** (HR Core cross-tenant write IDORs).
- **Netsurf-specific hardcoding:** **not found.**
- **Foreign Links-specific hardcoding:** **not found.**
- **SaaS architecture:** **mostly sound.**
- **Remaining risks:** generalization / future-proofing items (effective-dating, workweek, currency, worker types, roster richness, server-side leave calc, demo chrome).

### Findings by severity
| Severity | Count | Status |
|---|---|---|
| 🔴 Critical | 2 | ✅ both fixed (`cb392ab`) |
| 🟠 High | 10 | open (1 partially mitigated) |
| 🟡 Medium | 9 | open (1 fixed this pass) |
| 🟢 Good / clean | majority | — |

---

## 2. Module-by-module matrix

| Module | SaaS-general? | 🔴 | 🟠 | 🟡 | Cutover blocker? |
|---|---|---|---|---|---|
| HR Core | yes (after fix) | 2 (fixed) | 0 | 1 | no |
| Contracts | yes | 0 | 1 (worker types) | 1 | no |
| Attendance | mostly | 0 | 1 (weekend) | 0 | no¹ |
| Leave | mostly | 0 | 1 (server-calc) | 0 | no |
| Leave Policy | mostly | 0 | 1 (effective date) | 0 | no¹ |
| Payroll | mostly | 0 | 1 (effective date) +shares worker-types/country-rules | 1 | no¹ |
| Recruitment | yes | 0 | 1 (fixed pipeline) | 1 (seam doc) | no |
| Onboarding | yes | 0 | 0 | 0 | no |
| Offboarding | yes | 0 | 0 | 0 | no |
| Biometric + Geofencing | yes | 0 | 0 | 2 (tz default; scope ✅fixed) | no |
| Assets | yes | 0 | 0 | 0 | no |
| Helpdesk | yes | 0 | 0 | 1 (def-in-depth) | no |
| Projects | yes | 0 | 0 | 1 (def-in-depth) | no |
| Performance | yes | 0 | 0 | 0 | no |
| Finance | yes | 0 | 0 | 2 | no |
| CRM | mostly | 0 | 1 (currency) | 1 | no |
| Analytics | yes (pure-read) | 0 | 0 | 0 | no |
| Roster | structurally yes | 0 | 1 (pay richness) | 0 | no |
| GL | yes | 0 | 0 | 1 | no |
| Notifications | yes | 0 | 0 | 0 | no |
| Migration / ETL | yes | 0 | 0 | 1 (loader maps) | no |
| RBAC / Nav / role-helpers | yes (deny-by-default) | 0 | 0 | 0 | no |
| UI shared / app shell | mixed | 0 | 1 (fake-as-live shell) | 1 | **yes²** |

¹ Effective-dating + weekend are correctness issues that only *manifest* for tenants outside the current proof case (mid-year statutory change, back-dated runs, non-Sat/Sun weekend). Not a blocker for the two Guyana/Sat-Sun pilot tenants; **must** be done before onboarding a tenant they affect.
² The app-shell fake data (fake user identity, fake notifications, fake org switcher) is a blocker for any **production login by real users** or external demo — it shows "Maya Persaud / atlas-shipping.com" to everyone.

---

## 3. Findings (with IDs)

### 🔴 Critical — FIXED this work

| ID | Module | File | Evidence | Why it violates the rule | Fix | Status |
|---|---|---|---|---|---|---|
| C1 | HR Core | `hr-core.ts` `workInfoUpdate` | Updated `employee_work_info` (incl. `basicSalary`) by `employeeId` with no `organizationId` predicate | Cross-tenant write / no tenant isolation — a privileged caller in tenant A could overwrite tenant B's salary by id | Added `assertEmployeeInOrg(oid, employeeId)` (mirrors the hardened read path; throws NOT_FOUND) | ✅ `cb392ab` |
| C2 | HR Core | `hr-core.ts` `bankDetailsUpdate` | Upserted `employee_bank_details` by `employeeId` with no org verification | Same cross-tenant write IDOR (write twin of the already-hardened `bankDetailsGet`) | Same `assertEmployeeInOrg` guard before insert/update | ✅ `cb392ab` |

### 🟠 High — open

| ID | Module | File:line | Evidence | Why | Fix | Now/defer | Cutover blocker |
|---|---|---|---|---|---|---|---|
| H1 | Payroll | `payroll-input-builder.ts:298-310`, `payroll.ts:1349-1358`, `schema/payroll.ts:139` | Statutory `country_payroll_profile` resolved by `isActive=true`, not pay date | Historical/back-dated runs recompute on *today's* rules | Resolve by `effectiveYear`/effective-range from `period.endDate`; pin profile id on the payslip | **21G** | no¹ |
| H2 | Leave Policy | `leave-policy.ts:652-664,88-89,189` | Active policy/rules resolved by `status="active"` ordered by `activatedAt`, not the existing `effectiveFrom`/`effectiveTo` | Back-dated leave resolves against today's policy | Resolve by request date against effective range; keep `status` for draft/publish only | **21G** | no¹ |
| H3 | Attendance | `attendance-recalc.ts:58-69` | Weekend hardcoded Sun(0)/Sat(6) for every tenant; `dayType` flows to OT via `payroll-input-builder.ts:392/536` | Country/operating-style assumption; wrong weekend/Saturday pay for non-Sat/Sun tenants | Tenant/location workweek policy (weekend mask), not a weekday constant | **21G** | no¹ |
| H4 | Payroll/Contracts | `engine/types.ts:39`, `schema/hr-core.ts:315`, `contracts.ts:67`; `pay-frequency.ts` | `WageType` = `daily\|monthly\|hourly` only; no `annual` frequency | Cannot model contractor/project/commission/piece-rate/retainer/casual/temporary | Extend worker-type taxonomy + base-pay branching; add `annual` | **21I** | no |
| H5 | Payroll | `countries/registry.ts`, no `country_payroll_profile` create/update API | One-entry compile-time Map; profiles seed-only | Adding a country/budget is a code change, not a dated-row insert | Effective-dated rule-management surface; country-keyed rule store | **21G/21I** | no |
| H6 | UI / app shell | `apps/web/src/routes/app/route.tsx:455-458, 483-535, 945-976, 1018-1040` | Hardcoded country chips (GY·TT·BB), fake workspaces (Atlas/Mahaica/Trident), fake notifications (NIS/Barbados pay run), fake user identity (Maya Persaud / atlas-shipping.com) — all presented as live | "No fake data presented as live"; shows a fixed fake identity/tenant to every real user | Wire avatar/name/email to session `OrgCtx`; consume the real notifications API (now exists, 21D-F); real org switcher; derive country chips from the org's configured countries | **quick win** | **yes** |
| H7 | CRM | `crm.ts:706,863`, `schema/crm.ts:208` | `crm_deal.currency` set to literal `"GYD"` on create + convert; column has no default and no input field | Hardcoded country assumption; non-Guyana tenant pipeline mislabeled | Accept `currency` input / resolve tenant default currency | **21H** | no |
| H8 | Recruitment | `schema/recruitment.ts:46,181`, `recruitment.ts` | `applicationStageEnum` fixed; `jobOpening.pipelineConfig jsonb` exists but is **never read** | Hiring funnel not tenant-configurable | Drive stages from `pipelineConfig` (template pattern onboarding/offboarding already use) | defer (before recruitment's next build) | no |
| H9 | Roster | `schema/roster.ts`, `roster.ts` | No split shifts, night differential, weekend/holiday multipliers, `locationId`; `swap` enum has no counterparty column | Too narrow vs SaaS roster rule; can't reconstruct pay for many tenant types | Tenant-configurable shift-rule/pay-policy layer + location + swap counterparty | **21J** | no |
| H10 | Leave | `leave.ts:626,661` | `requestedDays` taken as raw client input, validated only vs balance | Server doesn't compute working-days honoring weekend/holiday/`excludeHolidays` | Compute server-side from start/end + tenant calendar (ties to H3) | **21G/21J** | no |

### 🟡 Medium — open (M3 fixed this pass)

| ID | Module | File | Finding | Fix |
|---|---|---|---|---|
| M1 | Cross-module | `schema/payroll.ts:158`, `schema/hr-core.ts:259,366`, `contracts.ts:515`, `payroll.ts:827,1074,1373`, `finance.ts:196`, `analytics.ts:202,217,227`, `write-etl/transformers.ts:166,228`, `seed-finance.ts:23`, `seed-crm.ts:270` | Scattered `?? "GYD"` / `.default("GYD")` fallbacks | One `resolveTenantCurrency(oid)` from tenant settings; drop literals (**21H**) |
| M2 | Biometric | `schema/biometric.ts:220` | `timeZone` column defaults to `"America/Guyana"` at schema level | Required-on-input or neutral default; tenant-configurable (**21H**) |
| M3 | Biometric | `biometric.ts:163` (`scopedEmployeeIds`) | `getDirectReportIds(cur.id)` omitted the org arg (manager scope not tenant-bounded) | ✅ **FIXED this pass** — now passes `org` |
| M4 | Several | `contracts.ts:751,756-761,729-739`, `finance.ts:98-101`, `projects.ts:554-561`, `helpdesk.ts:935-944`, `biometric-processor.ts:133-161` | Defense-in-depth: mutation/lookup WHEREs miss `organizationId` (ids already org-sourced → no live leak) | Add explicit `eq(...organizationId, oid)` for self-defending queries |
| M5 | Seeds | `seed-hr-core.ts:252` (holidays), `seed-contracts.ts:76` (GY PAYE filing), `seed-payroll.ts:96` (GY profile), `seed-leave-policy.ts:84` | Guyana statutory data seeded as product default rather than country-keyed template | Move to system-level country-keyed rule seeds (leave-policy's `organizationId=NULL` pattern); ties to H5 (**21G/21I**). All seeds correctly call `assertSeedAllowed()` — no prod-write risk |
| M6 | Migration/ETL | `write-etl/transformers.ts` | Role collapse to `employee`; v1 notification `type` passthrough; contract `status:"active"` hardcoded; statutory fields unmapped | Live loader needs v1→v2 role map, notification-type map, contract-status map, statutory-field mapping (**21K**) |
| M7 | UI shared | `packages/ui/src/components/`, `apps/web/src/components/empty-state.tsx` | No shared no-access/forbidden primitive; `empty-state` duplicated web vs ui | Add `AccessDeniedState`; upstream the web variant |
| M8 | Recruitment | `recruitment.ts:1327-1410` | Hire writes hr-core (`employeeProfile`/`employeeWorkInfo`) — safe + transactional but the seam is undocumented | Document the candidate→employee handoff seam (offboarding's `isActive` seam is already documented) |
| M9 | UI / integrations | `route.tsx:828-894` | Horilla integration name baked into a (demo-labelled) topbar widget | Generalize to a configurable integration-status surface |

### 🟢 Good — already SaaS-general (highlights)
- **Tenant isolation** consistent across all 18 routers; single-record paths go through org-scoped `verify*` helpers.
- **Cross-module mutation guardrail HOLDS, grep-proven** — coordination modules (projects/helpdesk/assets), performance, crm, finance, attendance/leave/biometric each write only their own tables + shared `audit_event`. **Analytics is pure-read** (zero writes confirmed).
- **Server-side redaction** real (bank/salary/budget/internal-notes/peer-anonymity/CRM money & private notes/offer comp/candidate-sensitive).
- **RBAC** deny-by-default allowlists, byte-aligned server↔client, two-layer authz; **nav `isNavItemVisible` is NOT fail-open** (unknown roles → `return false`); preview modules carry a Preview badge.
- **Pay-frequency proration** exemplary; statutory constants confined to `engine/countries/*` + fixtures (the legitimate home).
- **Configurable where it counts** — leave types/accrual/holidays are tenant rows; onboarding/offboarding checklists are template-driven; biometric is a pluggable multi-vendor adapter model; geofencing is multi-site per tenant; contracts effective-dated.
- **Migration tooling guards solid** — v1 read-only (session GUC + refuses non-`karetech_erp`), v2-staging refuse-write, scratch requires `CONFIRM_SCRATCH_WRITE=1` + name regex + refuse-prod; client names only in labelled synthetic fixtures.
- **UI primitives** (data-table/stat-tile/status-badge/page-header/preview-banner) are label-agnostic with built-in loading/error states; no baked currency/locale.

---

## 4. Top 10 risks (ranked)
1. **H1 — payroll resolves statutory profile by `isActive`, not pay date.** Highest-leverage correctness risk: a new budget year silently rewrites prior payslips.
2. **H6 — app-shell fake data shown as live** (fake user identity/notifications/org switcher). Blocks any real-user production login / external demo.
3. **H2 — leave policy resolves by active status, not date.** Back-dated leave miscomputed.
4. **H3 — hardcoded Sat/Sun weekend** flows into OT pay; breaks non-Sat/Sun tenants.
5. **H5 — country rules seed-only / compile-time.** Multi-country is a code change, not config.
6. **H4 — worker-type taxonomy too narrow** (no contractor/project/commission); blocks whole tenant categories.
7. **H7 — CRM deal currency hardcoded GYD** with no input/default.
8. **H9 — roster lacks pay-affecting policy** (split/night/weekend-multiplier/location/swap).
9. **H10 — leave days from raw client input**, not server-computed from the calendar.
10. **M6 — migration loader inherits v1** (role collapse, notification-type passthrough) — fix before the live ETL writes real data.

## 5. Quick wins (safe, low-risk)
- ✅ M3 biometric manager scope org-bound (done).
- H6 (partial): point the topbar avatar/name/email at `OrgCtx` session user (the sidebar already does) — removes the most visible fake-as-live with a contained edit.
- M4: add `eq(...organizationId, oid)` to the 5 defense-in-depth WHEREs.
- M2: change the biometric `timeZone` default to neutral / required.
- M7: add a shared `AccessDeniedState`; upstream the duplicated empty-state.
- M8: document the recruitment→hr-core hire seam (one comment block + a line in the module-seam docs).

## 6. Cutover blockers
- **H6 app-shell fake data** — must be wired to real data before real users log in (or any external demo). This is the only *strict* cutover blocker found.
- Everything else is either fixed (C1/C2/M3) or correctness/generalization work that is **required before onboarding a tenant it affects** (different statutory year, non-Sat/Sun weekend, non-GYD currency, contractor workforce) but does **not** block the two Guyana/Sat-Sun/fortnightly pilot tenants.

## 7. Post-cutover enhancements
- Recruitment configurable pipeline (H8), roster policy richness beyond pay basics (H9), shared no-access primitive (M7), configurable integration-status widget (M9), country-keyed system rule seeds (M5).

---

## 8. Go / No-Go

| Decision | Verdict | Rationale |
|---|---|---|
| **Live v1 → v2 scratch write-ETL rehearsal** | **GO (tooling-safe)** | v1 access is read-only-guarded; scratch is name/CONFIRM-guarded; dry-run + reconcile already **PASS/READY** against live v1; no cross-tenant logic. Build the v1-readonly loader + M6 mapping, run into a **named disposable scratch only**. *Owner has chosen to sequence this after 21G — see below.* |
| **Freeze v1** | **NO-GO** | Only after the live write-ETL rehearsal + reconcile of loaded data succeed. |
| **DNS cutover** | **NO-GO** | Only after rehearsal + freeze + effective-dating (21G) + H6 app-shell fix. |

**Recommended immediate next phase: 21G (effective-dated policy/rule resolution).** Owner's sequencing puts SaaS-correctness (21G) before the live ETL rehearsal, because today's rules silently rewriting yesterday's results is the biggest class of future payroll/leave bugs. This audit concurs: H1/H2/H3 are the highest-leverage work.

---

## 9. Recommended roadmap (owner-confirmed)
- **Phase 21G — Effective-dated policy/rule resolution:** payroll profile resolves by pay date (not `isActive`); payslips pin the rule/profile version; leave policy resolves by request date; tenant/location workweek+weekend policy replaces hardcoded Sat/Sun; backdated calcs never use today's rules. *(Addresses H1, H2, H3, H10; partial H5/M5.)*
- **Phase 21H — Tenant currency / locale / timezone generalization:** one `resolveTenantCurrency(oid)`; fix CRM no-input currency; drop `"GYD"`/`America/Guyana` literals. *(H7, M1, M2.)*
- **Phase 21I — Worker-type + contractor/project/commission modeling:** extend the taxonomy + `annual`; country-rule management surface. *(H4, H5.)*
- **Phase 21J — Roster policy richness:** split shifts, night differential, weekend/holiday multipliers, location, swap counterparty, pay-impact flags. *(H9.)*
- **Phase 21K — Live write-ETL rehearsal:** v1-readonly loader + mapping (M6) → named disposable scratch → verify + reconcile loaded data → go/no-go for freeze. *(M6.)*
- **App-shell fix (H6)** — fold into 21H or do as a standalone browser-verified quick win before any external demo.

## 10. Quality gates (this pass)
`check-types` 3/3 · `build` 2/2 · `audit:permissions` 161/21 · payroll-engine 47/47 · lint clean on changed files (hr-core/biometric baseline unchanged). The two Critical fixes (`cb392ab`) and the biometric scope hardening compile and pass gates. `migration:dry-run` / `migration:reconcile` PASS/READY against live v1 (last run this session).

## 11. Final recommendation
Ship the standing SaaS rule (done), keep the two IDOR fixes (done), and proceed to **Phase 21G effective-dated resolution** as the next build — it is the highest-leverage SaaS-correctness investment and the right gate before any live data migration or cutover. The codebase is in good architectural shape; the work ahead is generalization, not rescue.
