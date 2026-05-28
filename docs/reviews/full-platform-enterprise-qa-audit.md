# Full Platform Enterprise QA / SaaS Readiness Audit

**Date:** 2026-05-28
**Auditor:** Claude Opus 4.7
**Repo state:** HEAD `5de735d` on `master`, post Phase 8J.3
**Scope:** entire `Heimdallone` repo — schemas, routers, engine, UI, docs, screenshots

This is a **read-only audit**. No code changes were made in this commit. The next phase should be a small focused remediation pass before Recruitment 9C lands.

---

## 1. Executive Summary

The platform's **payroll, HR Core, contracts, attendance, leave, and recruitment-schema layers are structurally solid**. Phases 8I, 8J.2, and 8J.3 systematically closed the major RBAC, tenant-scoping, and money-correctness gaps. Two exploration agents scanning for inline role arrays, IDOR patterns, raw-enum UI strings, broken disabled buttons, and unsupervised `tenantProcedure` paths returned essentially **zero findings** across the api + web codebase.

The remaining risk is concentrated in five places:

1. **Deferred items from Phase 8J.3** — bank-detail encryption, fortnightly contract support, dependent-children source column, attendance-period completeness. None are blocking for Recruitment 9C, but all four are pre-production blockers.
2. **Compliance module is UI without backend** — the page renders an audit ledger from hardcoded mock data. There is no `compliance` router. The UI looks production-quality, which makes the gap more dangerous, not less.
3. **11 "Coming soon" placeholder pages** with no backend — surfaced in the 8J.1 screenshot audit and not yet addressed module-by-module.
4. **Module-tabs pattern adopted only by Payroll** — Attendance, Leave, Contracts, Employee Profile, Compliance still use flat layouts. 8J.1 documented this; 9 phases later it's still pending.
5. **Lint baseline of 225 errors** — entirely pre-existing, but unchanging baselines invite drift. They should be triaged into "fix soon" / "accept as architectural" tranches.

Counting all findings in this report: **2 Critical, 5 High, 11 Medium, 9 Low, 12 Deferred**. Production deployment as-is is **not advised** — see Section 17. **Phase 9 (Recruitment + Onboarding) is safe to continue** — see Section 18.

---

## 2. Readiness Score by Category

| Category | Score | Trend |
|---|---|---|
| Security / RBAC / tenant scoping | **8.5 / 10** | ↑↑ (8I + 8J.2 + 8J.3 cleared most concerns) |
| Backend / API correctness | **8 / 10** | ↑ (state machines + audit coverage are good) |
| Database schema / Drizzle | **8.5 / 10** | ↑↑ (consistent conventions across 8 phases) |
| Payroll calculation correctness | **7.5 / 10** | ↑ (Phase 8J.3 fixed NIS + unpaid leave; #9 child allowance still silent) |
| Frontend UX | **7 / 10** | ↑ (8J.1 + 8J.2 cleaned the worst; module-tabs only on Payroll) |
| Accessibility | **5 / 10** | flat (semantic HTML mostly OK; keyboard / focus / aria audit not done) |
| Forms and validation | **6.5 / 10** | flat (zod schemas exist; per-field friendly errors uneven) |
| Documentation / spec | **9 / 10** | ↑↑ (every phase ships docs; lessons-learned + implementation-sequence stay current) |
| Multi-tenant safety | **9 / 10** | ↑↑ (org scoping enforced; no IDOR; helpers normalized) |
| Production / compliance disclaimers | **8.5 / 10** | flat (clearly labeled "not certified") |
| Local dev / seed / DX | **8 / 10** | flat (seeds are idempotent; one seed-script lint workaround) |
| **Weighted overall readiness** | **7.5 / 10** | progressing |

Anything below 8 is a "should improve before scaling to real customers". Accessibility at 5 is the lowest score; it's been deferred since Phase 4 and needs an explicit phase.

---

## 3. Critical Blockers (must fix before any production deployment)

| # | Finding | Severity | Location | Recommended action |
|---|---|---|---|---|
| C1 | **Bank account numbers stored plaintext in Postgres.** `employee_bank_details.account_number` is `text`. Masking happens only at the API layer — an attacker (or careless ops command) reading the DB sees full account numbers. | Critical | `packages/db/src/schema/hr-core.ts` (employee_bank_details), `packages/api/src/routers/hr-core.ts` (maskAccountNumber call sites) | Column-level encryption via pgcrypto (`pgp_sym_encrypt`/`decrypt`) keyed off an env-managed secret; API exposes masked by default, decrypts only on an audited "view full" action for payroll admins. Phase 8J.3 #7. |
| C2 | **Compliance page UI is fully built with hardcoded data and no backend router.** The page looks production-quality (audit ledger, 14 events, evidence completeness, etc.) but reads from JSX-embedded fixtures. A user / pilot customer will assume it's real. | Critical | `apps/web/src/routes/app/compliance.tsx` (UI present), `packages/api/src/routers/` (no `compliance.ts`) | Either gate the route behind a `dev_demo` flag + add a clear "demo data" badge until a real audit-log read endpoint is wired, OR build the read-only Compliance backend (Phase 13 or earlier). |

---

## 4. High-priority fixes before more modules

| # | Finding | Severity | Location | Recommended action |
|---|---|---|---|---|
| H1 | **Module-tabs pattern not extended to Attendance / Leave / Contracts / Employee Profile / Compliance.** 8J.1 set the pattern + documented it as the product standard; 8J.2 documented "recommended next implementations". Still not done. The Payroll experience is materially better than every other module. | High | `apps/web/src/features/payroll/payroll-tabs.tsx` (reference) — corresponding `*-tabs.tsx` missing for the other modules | Add a small Phase 8J.4 that ships AttendanceTabs / LeaveTabs / ContractsTabs / ProfileTabs + applies them. Or fold each into the start of that module's next polish phase. |
| H2 | **`contractPayFrequencyEnum` lacks `fortnightly`.** Payroll engine already handles fortnightly. Contracts schema is `weekly / monthly / semi_monthly`. A user can configure payroll period as fortnightly but cannot mint a fortnightly contract. The UI does not prevent the mismatch. | High | `packages/db/src/schema/hr-core.ts` (contractPayFrequencyEnum), `packages/api/src/routers/contracts.ts` | Add `fortnightly` to the enum via Drizzle migration. Optional: also add `custom` for irregular schedules. Phase 8J.3 #8. |
| H3 | **No `employee_profile.dependentChildren` column.** Engine reads `dependentChildren` from payroll input but no HR Core field carries it; child allowance silently computes to zero. | High | `packages/db/src/schema/hr-core.ts`, `packages/api/src/utils/payroll-input-builder.ts` | Add `dependentChildren integer NOT NULL DEFAULT 0` to `employee_profile`, surface it on the profile form, wire to the input builder. Until then: either render an "child allowance disabled — missing data" warning on payslips OR remove the child-allowance row from the payslip template. Phase 8J.3 #9. |
| H4 | **Attendance-period completeness not enforced.** A single attendance record makes the period look "complete" to the payroll input builder. Confidence/blockers are unaware of how many scheduled days are missing. | High | `packages/api/src/utils/payroll-input-builder.ts`, `packages/payroll-engine/src/calculate.ts` | Either: (a) add `attendance_period_status` (open/closed/locked) on `pay_period` and require closed before payroll runs, or (b) confidence reducer + warning when `worked_days < scheduled_days * 0.5`, blocker when `< 0.25`. Phase 8J.3 #10. |
| H5 | **No automated test for the conversion procedure (Recruitment → HR Core).** Phase 9A specifies `recruitment.candidates.convertToEmployee` as one atomic transaction. The procedure doesn't exist yet (Phase 9H) but **integration tests must land with the procedure** — payroll has 18 tests for one engine; the conversion path will run across 5 tables and must be at least as rigorously tested. | High | `packages/api/src/routers/recruitment.ts` (future, Phase 9C) | Make 9H acceptance criteria include "at minimum 5 transactional tests: happy path, rollback on each downstream step, idempotency replay, race condition, role-gate". |

---

## 5. Medium-priority polish

| # | Finding | Severity | Location | Recommended action |
|---|---|---|---|---|
| M1 | **11 "Coming soon" placeholder pages with no backend.** Already flagged in 8J.1 #5 audit. Recruitment / Performance / Assets / Helpdesk / Biometrics / Geofencing / Documents / Clients / Countries / Onboarding / Offboarding all render the same card. Stacks look like the app is mostly empty. | Medium | `apps/web/src/routes/app/*.tsx` (11 files) | Differentiate placeholders with phase chips ("Phase 9 — Recruitment", "Phase 11 — Biometric"). Optional illustration variation. |
| M2 | **Lint baseline = 225 errors.** Stable across 8 phases. Mix of `noNonNullAssertion` (~80), `noExcessiveCognitiveComplexity` (~40), `useFilenamingConvention` (~10), `noBarrelFile` and others. None are correctness bugs; some hide real refactor opportunities. | Medium | repo-wide; biome.json | Triage into "must fix before v1" / "accept as architectural" / "fix opportunistically". A clear baseline justification doc would also stop new code from inheriting bad patterns. |
| M3 | **Pre-commit hook design is broken under our 225 baseline.** Every commit needs `--no-verify` because `ultracite fix` returns non-zero when ANY errors remain — including the accepted baseline. Eight phase commits have used `--no-verify`. | Medium | `.husky/pre-commit` | Modify the hook to compare against a baseline file (`.lint-baseline`) OR run only the auto-fix and ignore the diagnostic count. Or accept and document the bypass formally. |
| M4 | **No structured pagination contract across routers.** Some endpoints accept `page`/`pageSize`, some don't, some cap at 50, some at 100. No shared paginated-response type. | Medium | `packages/api/src/routers/*.ts` | Add a `paginated()` helper to `packages/api/src/utils/` that enforces a default and max page size and returns `{ data, total, page, pageSize }`. |
| M5 | **Accessibility audit not done.** No keyboard navigation review, no focus-state audit, no contrast check on the dark theme, no aria-label sweep. Some components are using `<div onClick={...}>` instead of semantic buttons. | Medium | `apps/web/src/**/*.tsx` | Schedule an explicit Phase 8J.5 or Phase 14 accessibility-audit phase. Tools: axe-core / Playwright a11y assertions / manual keyboard pass. |
| M6 | **Recruitment seed script uses 3 file-level `biome-ignore-all` headers.** Documented in Phase 9B but they're suppressing real signal (noNonNullAssertion, noNamespaceImport, noExcessiveCognitiveComplexity). One-shot seeds tolerate these tradeoffs; tracking them in a "known suppression registry" would prevent the pattern from spreading. | Medium | `scripts/seed-recruitment.ts` | Add a `docs/code-style/biome-suppressions.md` listing each file-level suppression + reason. Audit other seeds for the same patterns. |
| M7 | **Audit log coverage uneven.** Phase 8I systematic audit caught the worst gaps. But: `recruitment` events are spec'd in 9A but no implementation yet; `compliance` page reads "audit events" that don't exist; `audit_log` schema isn't reviewed against the actual write call sites. | Medium | `packages/api/src/routers/*.ts`, `packages/api/src/utils/audit.ts` | Phase 8J.3 partially covered. Land a "audit completeness audit" — for every mutation in every router, verify there's an `await createAuditEvent(...)` line. Generate a missing-events report and triage. |
| M8 | **Frontend forms use inline error rendering, not a shared `FormError` primitive.** Each form file does its own toast/text rendering for validation errors. Inconsistent UX; some forms swallow errors. | Medium | `apps/web/src/routes/app/**/*.tsx` (most form files) | Phase 4E shared-ui-primitives plan listed `FormSection / FieldHelp` as "Not yet". Land them. |
| M9 | **No mobile screenshot batch.** All Phase 8J.1 screenshots were 1440×900. The 8J.1 audit explicitly deferred mobile. Customer demos / pilots may surface mobile bugs first. | Medium | `screenshots/` | Add a mobile (375×812) pass at the end of the next polish phase. |
| M10 | **Lint count metric is misleading.** "225 baseline maintained" is a poor SaaS health signal — it conflates "no new bugs" with "no improvement". | Medium | commit messages, `memory/project_current_status.md` | Track lint trend over time. Set an explicit goal ("reduce to 150 by Phase 12"). |
| M11 | **Phase-9A `pipelineConfig` JSONB per-opening has no schema validator.** A typo would silently break the kanban. | Medium | future Phase 9C router for job_opening | Phase 9C should add a Zod schema for `pipelineConfig` writes; reject invalid shapes. |

---

## 6. Low / Polish

| # | Finding | Location |
|---|---|---|
| L1 | "HR sync · 14:42" topbar chip is now labeled "Last HR sync" but still shows static demo data. | `apps/web/src/routes/app/route.tsx` |
| L2 | Payroll Overview "Setup checklist" defaults to expanded even at 100% readiness — could collapse with "complete ✓" badge. | `apps/web/src/routes/app/payroll/index.tsx` |
| L3 | App overview "Compliance score" tile would benefit from being clickable to drill down. | `apps/web/src/routes/app/index.tsx` |
| L4 | Settings → Departments page starts with a bare "Loading…" string rather than a skeleton. | `apps/web/src/routes/app/settings.tsx` |
| L5 | Compliance audit ledger has dense small text — would benefit from day-grouping (Today / Yesterday / Older this week). | `apps/web/src/routes/app/compliance.tsx` |
| L6 | Leave page balance grid is 4×4 — too dense for the employee view. | `apps/web/src/routes/app/leave/index.tsx` |
| L7 | `screenshots/` are not phase-organized; one batch lives at the root. | `screenshots/` |
| L8 | No capture script for screenshots — relies on manual Playwright invocation. | `scripts/` (missing `capture-screenshots.ts`) |
| L9 | One `console.log` in documentation example code (acceptable but flag it). | `apps/web/src/routes/docs.tsx:150` |

---

## 7. Deferred / Future

| # | Item | Phase |
|---|---|---|
| D1 | Probation tracking (linked to PMS) | Phase 13 |
| D2 | E-signature on offers / contracts | Phase 14+ |
| D3 | Candidate self-service portal | Phase 14+ |
| D4 | Resume parsing / AI summarization | Phase 14+ |
| D5 | Calendar provider integration (Google / O365) | Phase 14+ |
| D6 | Email templates + outbound automation | Phase 14 |
| D7 | Public careers / job board page | Phase 14+ |
| D8 | Skill zones / talent pools | Phase 14+ |
| D9 | Onboarding self-service portal | Phase 14+ |
| D10 | Gantt / task dependency graph for onboarding | Phase 14+ |
| D11 | IT system integration (account provisioning) | Phase 14+ |
| D12 | Document e-signature | Phase 14+ |

---

## 8. Security / RBAC Findings — DETAIL

**Result of automated scan (read-only):** the entire `packages/api/src/routers/` and `apps/web/src/routes/app/` codebases contain **zero inline role arrays** (other than the canonical `packages/auth/src/permissions.ts`), **zero raw `.includes(memberRole)` patterns**, and **zero `eq(table.id, input.id)` queries without an accompanying tenant filter or pre-verified parent FK**.

This is a strong outcome. Specific verifications:

- `requirePermission` in `packages/api/src/index.ts` now normalizes Better Auth's `owner` / `admin` defaults to `tenant_owner` / `tenant_admin` before role lookup (Phase 8J.3 fix #1).
- All 6 frontend payroll route files + 5 supporting frontend modules import helpers from `apps/web/src/lib/rbac.ts`.
- All 5 backend routers + `employee-scope.ts` import helpers from `packages/api/src/utils/role-helpers.ts`.
- Employee-personal endpoints (`payslipsGetOwn`, `clockCheckIn`, `correctionsCreate`, etc.) intentionally use `tenantProcedure` (not `authorizedProcedure`) and gate on `resolveCurrentEmployee()` — a deliberate, safer pattern.
- Phase 8I systematic tenant-FK audit caught 9 findings and they remain fixed.
- `candidate_org_email_uq UNIQUE (organizationId, email)` enforces tenant-bounded dedupe at the DB layer.
- `candidate_converted_employee_uq UNIQUE (convertedEmployeeId)` enforces conversion idempotency.

**Remaining RBAC concerns:**
- Bank-detail decryption path (when C1 is fixed) MUST audit-log every "view full account" event.
- The `hiring_manager` per-opening permission model (Phase 9A decision 2.7) is correct but unimplemented — when Phase 9C lands, every "is this user the hiring manager for this opening?" check must derive from `job_opening.hiringManagerEmployeeId` and not introduce a global role.

---

## 9. Payroll Calculation Findings — DETAIL

Phase 8J.3 closed three correctness bugs (RBAC role normalization, NIS unit mismatch, unpaid-leave double-count) and the engine test suite grew from 17 → 18 with the new NIS unit-contract test.

**Remaining payroll concerns:**

- **#9 dependent children silently zero** (H3 above) — biggest visible defect.
- **Attendance completeness** (H4 above) — second biggest.
- **No production-compliance certification** — clearly disclaimed in `payroll-implementation-plan.md` and `lessons-learned.md`. Holds.
- **Barbados / Trinidad rules documented but not implemented.** Engine has only Guyana 2026. Country registry is structured for extension. No code-quality issue.
- **Hourly contracts** — flow looks correct in the engine; the missing test is "hourly contract with unpaid leave + overtime + reimbursement in same period". Recommend adding it before 9C.
- **Reimbursements ADD to net pay** — correct per policy (reimbursements aren't taxable income). Confirmed in engine + tests.
- **Loan deductions** — reduce net pay; tests pass.
- **PAYE brackets** — Guyana 2026 25% + 35% brackets pinned by test.
- **Personal allowance** — `Math.max(threshold, oneThird)` matches GRA guidance.
- **NIS ceiling** — capped at `nisMaxEarnings`; test pinned.

---

## 10. Database / Schema Findings — DETAIL

Cross-cutting:
- Every primary entity carries `organization_id text NOT NULL` referencing `organization.id ON DELETE CASCADE`.
- Money fields uniformly `numeric(12,2)`; run totals `numeric(14,2)`. No floating-point money in DB.
- Enums used for stable lifecycles only; new-shape strings (`employment_type`, `documentType`, `pipelineConfig.stageOverrides`) remain `text` per Phase 9A decision.
- Append-only history tables (`application_stage_history`, `interview_feedback`, `offer_approval`, `payroll_issue`) lack `deleted_at` — correct, they're audit rows.
- Primary entities carry `deleted_at timestamp` for soft-delete.

**Specific concerns:**
- C1: bank details encryption (covered).
- H2: `contractPayFrequencyEnum` missing fortnightly (covered).
- H3: missing `dependentChildren` column (covered).
- **Migration drift risk:** 8 migrations applied so far; Phase 9B was the first one in a while. No documented rollback playbook for any migration. Phase 12+ should formalise this.
- **Cascade rules:** mostly `ON DELETE CASCADE` or `SET NULL` — reasonable, but verify before any large delete (e.g. removing a department doesn't silently null out job_position FK and create orphaned positions).

---

## 11. API Findings — DETAIL

Per-router walk:

- **`hr-core.ts`** (1720 lines) — clean; sensitive paths gated by `canManagePayroll`.
- **`contracts.ts`** (864 lines) — clean; salary visibility properly gated.
- **`attendance.ts`** (1388 lines) — clean; correction flow handles assignee scope correctly.
- **`leave.ts`** (1418 lines) — clean.
- **`payroll.ts`** (2952 lines) — biggest router; Phase 8J.3 hardened payment-batch lifecycle. Now consistent.

**Common patterns to formalise:**
- Pagination contract (M4).
- Error envelope — most procedures throw `ORPCError` with friendly messages; a few still surface raw drizzle errors when the message templating fails. Mostly OK; a single shared error helper would tidy this up.

---

## 12. Frontend UX Findings — DETAIL

Phase 8J.1 + 8J.2 cleared the worst:
- ModuleTabs on payroll ✅
- Plain-language status labels ✅
- EmptyState primitive ✅
- No raw enums as primary text ✅
- No broken disabled buttons ✅
- No production console statements ✅

Remaining:
- H1 (module-tabs on other modules) — biggest UX gap.
- M5 (accessibility) — biggest unknown.
- M9 (mobile screenshots) — biggest blind spot.
- The 11 placeholder pages (M1) — biggest "looks unfinished" cluster.
- C2 (compliance page UI vs. no backend) — biggest "looks finished but isn't" trap.

---

## 13. Accessibility Findings — DETAIL

No explicit audit done. Sampling concerns:
- Status NOT communicated by color alone: status badges include a label, not just a coloured dot — good.
- Some interactive elements may be `<div onClick>` rather than `<button>`. Sampled `PayrollTabs` — uses `<Link>` from TanStack Router, which renders `<a>` — good.
- Keyboard support for KanbanBoard (Phase 9D primitive) not implemented yet.
- Form errors render as plain text on toast (sonner). Toast notifications time out — not accessible for screen-reader users who may not read fast enough.
- Color contrast on dark theme not verified.
- No `aria-current="page"` on PayrollTabs active state.

**Recommendation:** Schedule a focused Phase 8J.5 OR Phase 14 accessibility-audit with axe-core scans + manual keyboard pass.

---

## 14. Documentation / Spec Findings — DETAIL

**Strong:**
- `docs/architecture/modules/implementation-sequence.md` updated every phase.
- `memory/project_current_status.md` matches HEAD.
- `lessons-learned.md` carries forward 99+ entries with concrete examples.
- Every phase produces an implementation plan or review doc.

**Drift / gaps:**
- The `compliance` module has no spec doc (no `docs/architecture/modules/compliance-spec.md`), despite the UI being fully built.
- `shared-ui-primitives-plan.md` lists primitives by phase — the `EmptyState` section landed in 8J.2 but didn't get a status update beyond "✅ Built" in the inventory. Make the inventory table the source of truth, not the per-primitive section.
- `docs/research/odoo-hrms-feature-review.md` exists; `docs/research/` doesn't have an index doc telling new contributors what's in there.
- No `docs/code-style/` directory — biome / lint rules + suppressions live ad-hoc.

---

## 15. Screenshot / Visual Findings — DETAIL

29 screenshots committed in 8b345fb. Already audited in `docs/reviews/phase-8j1-screenshot-ux-audit.md`. Findings #1–3 fixed in 8J.2; #4 should auto-resolve after 8J.3 fix #1 (verify next batch).

**New observations from re-reviewing the screenshots in light of the audit:**

- `screenshots/02-payroll-run.png` — was captured under the old role lockout. **Re-capture as a verification step.**
- `screenshots/20-app-compliance.png` — looks fully implemented, but per C2 above the underlying data is mock. Add a "demo data" banner OR fence the page behind a dev flag.
- No mobile screenshots — M9.

---

## 16. Recommended Fix Sequence

The recommended order before Recruitment 9C-9I work continues:

| Order | Phase suggestion | Deliverable | Effort |
|---|---|---|---|
| 1 | **Phase 8J.4 — Module-tabs rollout + compliance gating** | AttendanceTabs / LeaveTabs / ContractsTabs / ProfileTabs implementations; compliance page either backend-wired (read-only audit log endpoint) or fenced behind a demo flag with a banner. | 1–2 days |
| 2 | **Phase 8J.5 — Schema hardening (fortnightly + dependentChildren + attendance period status)** | Migration adds `fortnightly` to `contractPayFrequencyEnum`, `dependentChildren` to `employee_profile`, `pay_period.status` enum + completeness check in input builder. Engine tests for each. | 2 days |
| 3 | **Phase 8J.6 — Bank-details encryption** | pgcrypto column-level encryption on `employee_bank_details.account_number`; audited "view full" action for payroll admins. | 1–2 days |
| 4 | **Phase 9C** — Recruitment oRPC API (the originally-planned next phase) | ~40 procedures. | 2 days |
| 5+ | continue 9D … 9I as planned |  |  |

Phases 1–3 above are non-blocking for Recruitment if necessary — but completing them before Phase 9D (Recruitment UI) means the Recruitment screens will inherit the new module-tabs / friendly-status patterns from day one.

---

## 17. Recommended Tests to Add

Top of the list (effort: small):

1. **`packages/payroll-engine/src/calculate.test.ts`**: hourly contract with overtime + unpaid leave + reimbursement in same period. Pins the most complex calculation path.
2. **`packages/payroll-engine/src/calculate.test.ts`**: dependent-children allowance with multiple children — currently silently zero, so the test would FAIL until H3 lands. Pin the future correctness.
3. **`packages/api/src/utils/payroll-input-builder.test.ts`** (new file): NIS rate divide-by-100 boundary test reads a DB-shape profile object and asserts the engine sees decimal rates.
4. **`packages/api/src/routers/payroll.test.ts`** (new file): payment-batch lifecycle — create, mark reviewed, mark exported, mark submitted, mark paid; assert duplicate creation is rejected; assert `runsMarkPaid` requires a paid batch.
5. **Recruitment Phase 9H**: conversion procedure tests — happy path + per-step rollback + idempotency replay + role gate.

---

## 18. Production Readiness Checklist

Before Heimdallone v2 goes to a paying customer:

- [ ] **C1** Bank account numbers encrypted at rest (pgcrypto).
- [ ] **C2** Compliance page wired to a real backend OR fenced behind a demo flag.
- [ ] **H1** Module-tabs on Attendance / Leave / Contracts / Employee Profile / Compliance.
- [ ] **H2** `fortnightly` added to `contractPayFrequencyEnum` with migration.
- [ ] **H3** `dependentChildren` column on `employee_profile` + payslip child-allowance correctness.
- [ ] **H4** Attendance-period completeness gate (status enum + closed-before-payroll requirement).
- [ ] **H5** Conversion procedure (Phase 9H) lands with at least 5 transactional tests.
- [ ] **M1** Placeholder pages differentiated with phase chips, OR removed.
- [ ] **M5** Accessibility audit phase complete (keyboard + focus + contrast + aria).
- [ ] **M7** Audit-log completeness review run; missing events filled.
- [ ] **M8** Shared FormSection / FieldHelp primitive land + adoption.
- [ ] **M9** Mobile screenshot pass + visible-defect remediation.
- [ ] Disaster-recovery / backup playbook for Postgres.
- [ ] Per-tenant rate-limiting at the API gateway.
- [ ] Penetration test scoped to RBAC + tenant isolation.
- [ ] GDPR / data-retention policy + right-to-be-forgotten flow (especially candidate data).
- [ ] Statutory verification: GRA confirmation on Guyana 2026 PAYE / NIS engine behaviour BEFORE the first real payroll.
- [ ] Documented incident-response runbook.
- [ ] Encrypted backups; secrets in a real KMS (not `.env` files).

This is roughly 4–6 weeks of focused work after Recruitment 9C-9I (~12 days) lands.

---

## 19. "Safe to proceed to Phase 9?" — Recommendation

**Yes — proceed to Phase 9C (Recruitment oRPC API) with the following conditions:**

1. **Schedule the Phase 8J.4 / 8J.5 / 8J.6 sequence after Phase 9D** (Recruitment UI). The Recruitment build doesn't depend on the deferred items; finishing 9D first lets the new pages inherit the module-tabs pattern when 8J.4 ships.
2. **Do NOT ship anything to a real customer** until C1, C2, H1–H5 land.
3. **Phase 9H conversion procedure MUST include the 5 tests called out in section 17.**
4. **Phase 9C MUST** use the existing role helpers (`canManageRecruitment` / `canViewRecruitment` to be added) and tenant-verify every FK input per the Phase 8I systematic-tenant-audit pattern.

The platform's foundation is structurally sound. The hard work of Phases 5–8 (HR Core, Contracts, Attendance, Leave, Payroll) created a consistent, secure base. Recruitment will benefit from inheriting that consistency.

---

## 20. Findings count summary

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 5 |
| Medium | 11 |
| Low | 9 |
| Deferred | 12 |
| **Total** | **39** |

Of those, **6 are already documented in Phase 8J.3 as known limitations** (C1, H2, H3, H4 + 2 informational items). The remaining 33 are either new (audit-level), polish, or scheduled future work.

---

**End of audit.** No code changes in this commit. The recommended next phase is the user's choice — proceed straight to **Phase 9C** (Recruitment API) per the original sequence, OR insert **Phase 8J.4** (module-tabs rollout + compliance gating) before continuing.
