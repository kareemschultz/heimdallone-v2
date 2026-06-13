# Full-codebase SaaS Architecture audit — 2026-06-13

**Against:** the Heimdallone SaaS Architecture Rule ("No Client-Specific Builds", in AGENTS.md / .claude/CLAUDE.md).
**Scope:** all 18 substantive routers (~30K LOC) + their schemas + the payroll engine, audited by 5 parallel review agents (read-only) plus the 21D coordination/migration audit. No data inspected (findings are PII-safe; they reference code, not rows).

## Headline verdict

**There is no Netsurf- or Foreign-Links-specific business logic anywhere in the codebase.** Grep for `Netsurf` / `Foreign Links` across all routers/schemas/engine = zero matches outside clearly-labelled seed/synthetic fixtures. The architecture is genuinely multi-tenant: every module loops over tenants, scopes by `organizationId`, and resolves pay frequency generically.

The real risks fall into three buckets:
1. **Two live cross-tenant write IDORs** (hr-core) — **FIXED in this pass.**
2. **Effective-dating by `isActive`/`status` flag instead of by date** — payroll profile + leave policy. The biggest *correctness* theme.
3. **Hardcoded Guyana defaults (`"GYD"`, weekend = Sat/Sun, `America/Guyana`) outside a country-rule module**, and a few **narrow/fixed models** (worker types, recruitment pipeline, roster pay-rules) — the biggest *generalization* theme.

---

## 🔴 Must fix — security/correctness (blocks SaaS)

| # | Location | Finding | Status |
|---|---|---|---|
| 1 | `hr-core.ts` `workInfoUpdate` (was ~1347) | Updated `employee_work_info` (incl. `basicSalary`) by `employeeId` with **no org predicate** → a privileged caller in tenant A could overwrite tenant B's work info. | ✅ **FIXED** — `assertEmployeeInOrg` guard added. |
| 2 | `hr-core.ts` `bankDetailsUpdate` (was ~1435) | Upserted `employee_bank_details` by `employeeId` with no org verification (the write twin of the already-hardened `bankDetailsGet`). | ✅ **FIXED** — same guard added. |
| 3 | `payroll-input-builder.ts:298-310` + `payroll.ts:1349-1358` + `schema/payroll.ts:139,159` | The statutory `country_payroll_profile` driving **every payslip** is resolved by `isActive=true`, **not** by the pay period's date. Regenerating/previewing a historical run recomputes it on *today's* rules. The exact effective-dating anti-pattern the rule forbids. | ⏳ Open — fix = resolve by `effectiveYear`/effective-range from `period.endDate`. (Engine registry also keys by *year* only, so a mid-year budget can't be represented — `countries/registry.ts`.) |
| 4 | `leave-policy.ts:652-664,88-89,189` | Active leave policy/rules resolved by `status==="active"` ordered by `activatedAt`, **not** the `effectiveFrom`/`effectiveTo` columns that already exist → back-dated leave resolves against today's policy. Same flag-vs-date defect. | ⏳ Open — resolve by request date against effective range; keep `status` only for draft/publish. |
| 5 | `attendance-recalc.ts:58-69` (`classifyDayType`) | Weekend hardcoded to Sun(0)/Sat(6) for **every** tenant; `dayType` flows into payroll OT via `payroll-input-builder.ts:392/536` → wrong weekend/Saturday pay for a Fri/Sat or Sun-only weekend tenant. | ⏳ Open — tenant-configurable weekend mask / country-rule lookup. |

Items 3–5 are correctness bugs that only *manifest* for tenants outside the current proof case (non-calendar-year statutory change, back-dated leave, non-Sat/Sun weekend) — but they're exactly what "build for the next tenant/country" means. They are larger than a one-line fix and should be scheduled as their own scoped change (the effective-dating work is already on the 21D-A roadmap).

---

## 🟡 Generalize before building further

**Hardcoded country/currency defaults (outside a country-rule module):**
- `crm.ts:706,863` — `crm_deal.currency` set to literal `"GYD"` on create + convert, with **no input field and no default** on the column → a non-Guyana tenant's pipeline is mislabeled. *The one true currency gap (not overridable).* Accept `currency` input / resolve tenant default.
- `schema/payroll.ts:158`, `schema/hr-core.ts:259,366`, `contracts.ts:515`, `payroll.ts:827,1074,1373`, `finance.ts:196`, `analytics.ts:202,217,227` — scattered `?? "GYD"` / `.default("GYD")` fallbacks. Overridable via tenant `payrollSetting.defaultCurrency`, but a tenant with no setting silently gets Guyana dollars. Centralize on one `resolveTenantCurrency(oid)`.
- `biometric.ts:296` — device `timeZone` defaults to `"America/Guyana"`. Field is configurable; default should be the org timezone.

**Narrow / fixed models that should be configurable:**
- **Worker types** — `WageType` / `contract_wage_type` / API enum = `daily|monthly|hourly` only (`engine/types.ts:39`, `schema/hr-core.ts:315`, `contracts.ts:67`). Rule mandates fixed/hourly/shift/rostered/**contractor**/**project**/**commission**. Contractor/project/commission cannot be represented. Also `pay-frequency.ts` lacks **annual**.
- **Country rules are seed-only / compile-time** — no API to create/update `country_payroll_profile`; engine `countries/registry.ts` is a one-entry `Map` (GY-2026). Adding a country/budget is a code change today, contradicting the "new dated row, not a code change" thesis. Build the effective-dated rule-management surface.
- **Recruitment pipeline is a fixed enum** — `applicationStageEnum` is hardcoded and the existing `jobOpening.pipelineConfig jsonb` is **never read** (`recruitment.ts`). A tenant can't configure its hiring funnel. Drive stages from `pipelineConfig` (as onboarding/offboarding already do via template tables).
- **Roster pay-affecting richness missing** (from the 21D audit) — no split shifts, night differential, weekend/holiday multipliers, OT thresholds, payroll-impacting flag, or `locationId`. The `swap` enum has no counterparty column. Extend with a tenant-configurable shift-rule/pay-policy layer before the roster UI.
- **Leave days taken as raw client input** — `leave.ts:626,661` validates `requestedDays` against balance but never computes working-days server-side honoring the weekend mask / `companyLeaveDay` / `excludeHolidays` flag. Compute server-side (ties into the weekend fix).
- Product-fixed status/priority/health enums in projects/helpdesk — acceptable now; a future "configurable workflow" capability.

**Defense-in-depth tenant scoping (no live leak — ids already org-sourced, but should self-defend):**
- `contracts.ts:751,756-761,729-739` (also a documented hr-core salary-sync seam), `finance.ts:98-101`, `projects.ts:554-561`, `helpdesk.ts:935-944`, `biometric-processor.ts:133-161` — add explicit `eq(...organizationId, oid)` to these mutation/lookup WHEREs.

**Migration write-ETL (from the 21D audit):**
- ETL collapses every migrated user to role `employee`; passes v1 notification `type` verbatim; hardcodes contract `status:"active"`; doesn't yet map statutory fields. The live loader must add a v1→v2 role map, a notification-type map, contract-status map, and statutory-field mapping.

**Undocumented module seams (functionally safe, designed-but-undocumented):**
- `recruitment.ts:1327-1410` writes hr-core (`employeeProfile`/`employeeWorkInfo`) on hire; `offboarding.ts:1374` sets `employeeProfile.isActive=false` (this one *is* documented in-code). Document the recruitment→hr-core handoff seam.

---

## 🟢 Clean / already SaaS-general (the majority)

- **Tenant isolation** is consistent across all 18 routers — every list/get/create scopes `organizationId`; single-record paths go through org-scoped `verify*` helpers. The only gaps were the two 🔴 write IDORs (now fixed) + the defense-in-depth list above.
- **Cross-module mutation guardrail HOLDS, grep-proven** in every cluster: coordination modules (projects/helpdesk/assets), performance, crm, finance, attendance/leave/biometric each write **only their own tables + shared `audit_event`**. Soft cross-module links (asset/task/payslip/project/customer) are tenant-verified SELECT-only and never mutated. **Analytics is pure-read** (zero writes, no audit_event — confirmed).
- **Server-side redaction** is real (not UI-only): bank account, basicSalary, project budget + internal notes, helpdesk internal notes, recruitment candidate-sensitive + offer comp, offboarding internal/exit-reason, 1-on-1 private notes, peer-review anonymity (configurable threshold), CRM money + private notes.
- **RBAC** helpers are explicit allowlists (deny unknown roles by default — no fail-open in backend paths; the two `return true` helpers are the intentionally-universal, self-scoped notifications inbox). Two-layer authz (AC gate + handler scope/IDOR) is the consistent pattern.
- **Pay-frequency proration is exemplary** — single canonical source, country-agnostic, monthly = identity, all period constants prorated; statutory constants confined to `engine/countries/*` and fixtures (the legitimate home).
- **Configurable where it counts** — leave types/accrual/holidays are tenant-defined rows (no baked-in national scheme; `leave_policy.countryCode` is multi-country aware); onboarding/offboarding checklists are template-driven; biometric is a pluggable multi-vendor adapter/provider model; contracts are effective-dated (`startDate`/`endDate`/`status`).
- **Geography fields are generic** — `country`/`workLocation` are free-text/ISO configurable, not baked-in.

---

## Recommended order of work

1. ✅ **Done now:** the two hr-core write IDORs (🔴 #1, #2).
2. **Next scoped change — effective-dating** (🔴 #3, #4, #5 + worker-type/annual + country-rule-management API): this is the 21D-A roadmap; it's the single highest-leverage correctness investment and unblocks multi-country/multi-frequency tenants properly.
3. **Currency generalization** (🟡): one `resolveTenantCurrency(oid)`, fix the CRM no-input gap, drop literal `"GYD"`/`America/Guyana` defaults.
4. **Per-module config** before each module's *next* build: recruitment `pipelineConfig`, roster pay-rules + location, server-side leave-day computation.
5. **Defense-in-depth** org predicates + **document the recruitment→hr-core seam**.
6. **Migration loader maps** (role/notification-type/contract-status/statutory) before the live write-ETL.
