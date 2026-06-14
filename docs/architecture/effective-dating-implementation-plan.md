# Phase 21G — Effective-Dated Policy & Rule Resolution (cross-module)

**Status:** 21G-A spec ✅ · 21G-B schema/migration 0023 ✅ · 21G-C payroll resolve-by-date ✅ · 21G-D leave resolve-by-date + server-computed days ✅ · 21G-E workweek/weekend classifier ✅ · **21G-G historical payslip correction (API) ✅ (delivered).** · **Date:** 2026-06-14 · §10 Q1/Q2 owner-decided.

> **21G-G delivered (correction API/core).** `payroll.corrections.{preview,apply,list,getById}` +
> exported core `computeCorrection` / `applyPayslipCorrection` + pure `buildComponentDeltas`
> (`packages/api/src/utils/payslip-correction.ts`). **preview** recomputes an issued payslip under the
> rule resolved by its PAY DATE (never the original run's possibly-wrong pin) and diffs per component
> (gross / taxableGross / totalDeductions / net / employer contributions) — read-only. **apply** (admin,
> `payroll:update`) is transactional: inserts `payslip_correction` (reason + resolved historical rule +
> ruleVersionLabel + componentDeltas) and sets ONLY the original's sanctioned `supersededByCorrectionId`
> back-pointer — **the original issued values are never mutated** (Migration Rule). The GL adjustment is
> recorded as an **explicit obligation** (`glAdjustmentStatus` `not_required`/`pending` + net delta);
> **payroll never writes the ledger** (cross-module guardrail) — posting happens via the GL module.
> Double-correction and no-change are blocked. Reuses `payroll:read/update` → **audit stays 161/21**.
> Proof: `verify:payslip-correction` 11/11 (pure deltas + DB lifecycle: read-only preview, txn apply,
> original immutable, GL obligation, double-block). UI surfacing = 21G-F.

> **21G-E delivered.** `classifyDayType` (`packages/api/src/utils/attendance-recalc.ts`) no longer hardcodes
> Sat=6/Sun=0 — it reads `payrollSetting.weekendDays` (ISO) + the org holiday calendar via new
> `resolveDayTypeConfig(orgId)`, classifying each work date into the OT-multiplier bucket
> (weekday/saturday/sunday/holiday). Holiday wins; Sunday keeps its distinct bucket; every other rest day
> maps to the `saturday` (rest-day premium) bucket (schema carries two named weekend multipliers). Default
> Sat/Sun tenant = byte-identical to before. Both call sites (attendance check-in, biometric punch
> processor) fetch config and pass it; holiday matching reuses the 21G-D `isHolidayOn`. The `holiday`
> bucket is now actually populated (previously dead). Proof: `verify:workweek` 13/13 (default unchanged,
> Fri/Sat + Sun/Mon weekends, holiday precedence + recurring). No new AC pair → audit stays 161/21.

> **21G-D delivered.** Leave policy resolves by **request start date**, not `status='active'` alone:
> `packages/api/src/utils/leave-policy-resolver.ts` (`resolveLeavePolicyAsOf`) reuses the 21G-C pure
> `resolveAsOf` core — **no migration needed** because archived policies are preserved with their
> `effectiveFrom` (the next policy's start is the implicit upper bound; legacy undated rows fall back to
> `activatedAt ?? createdAt`). `getPolicyHealth` now resolves as-of today via the resolver. **H10:** leave
> days are computed **server-side** (`packages/api/src/utils/leave-days.ts` `countLeaveDays`) from the date
> range + half-day breakdowns + tenant workweek (`payrollSetting.workDays`) + org holiday calendar (when
> the leave type excludes holidays); `requestsCreate` uses the server count for the balance check and the
> persisted `requestedDays` (client value advisory only) and rejects ranges with no working days.
> Proof: `verify:leave-resolver` 13/13 (8 pure day-count + 5 DB resolve-by-date incl. draft-skipped +
> tenant scope). No new AC pair → audit stays 161/21.

> **21G-C delivered.** Pure date-window core `resolveAsOf` (`packages/payroll-engine/src/effective-dating.ts`,
> 12 unit tests) + DB shell `payroll-profile-resolver.ts` (`resolveCountryPayrollProfileAsOf` /
> `resolvePublishedProfileForOrgAsOf` / `resolveProfileById` / `mapCountryPayrollProfile` /
> `ruleVersionLabelFor`). Run-create resolves by the period's pay date (fallback period end) and **pins**
> `payrollRun.countryProfileId` + `ruleVersionLabel`. Generation **honors the pin** (pre-21G runs backfill
> by pay date via `resolveRunProfilePin`); `buildPayrollInput` accepts an optional `pinnedProfileId`; ad-hoc
> previews/projections resolve by pay date. Proof: engine 59/59, `verify:payroll-resolver` 8/8 (DB
> resolve-by-date + tenant scope + builder honors pin + dangling-pin fallback). Engine compute path
> (`registry`/`proration`/`calculate`) byte-unchanged → `migration:reconcile` structurally preserved at 46/46.

> **SaaS Architecture Rule tie-in.** "Effective-dated rules" and "historical records … future payroll
> rule changes without rewriting old results" are explicit, repeated requirements of the standing
> SaaS Architecture Rule (Payroll Rule, GL Rule, SaaS Requirements). A statutory rule is **data with a
> validity window**, resolved by the **date of the event being computed** — never a hand-toggled
> "current" flag. A 2024 payslip must compute on 2024 rules forever; a backdated leave request must use
> the policy that was in force on the request date. This phase makes that true in code.

This plan **completes the resolve-by-date half of the 21D-A architecture** (see
`docs/architecture/payroll-tax-engine-plan.md` §1-2) that 21D-B deferred, and **generalizes the same
pattern** to Leave (H2) and the tenant workweek/weekend (H3). It closes audit findings **H1, H2, H3,
H10** from `docs/reviews/repo-wide-saas-architecture-audit-2026-06-13/README.md`.

---

## 1. Problem statement (as-is, with evidence)

| # | Concern | Evidence (file:line) | Defect |
| --- | --- | --- | --- |
| **H1** | Payroll country profile resolved by `isActive`, not pay date | `packages/api/src/routers/payroll.ts:1355` (run create pins the *active* profile) · `packages/api/src/utils/payroll-input-builder.ts:304` (generate **re-resolves by `isActive`, ignoring the run's pinned `countryProfileId`**) · schema `packages/db/src/schema/payroll.ts:107,139` has only `effectiveYear:int` + `isActive:bool`, **no date range** | A run for a historical/backdated period silently computes on **today's** active profile. The engine then keys rules by a bare `effectiveYear` (`packages/payroll-engine/src/countries/registry.ts:4`). The pin on `payrollRun.countryProfileId` (`payroll.ts:1374`) is **cosmetic** — generation never reads it. |
| **H2** | Leave policy resolved by `status==='active'`, not request date | `packages/api/src/routers/leave-policy.ts:659` (`eq(...status, "active")` + `orderBy(activatedAt desc)`) — but the table **already has** `effectiveFrom`/`effectiveTo` (`packages/db/src/schema/leave-policy.ts:88-89`) | A backdated leave request uses whatever policy is flagged active *now*, not the one in force on the request date. The date columns exist but are unused for resolution. |
| **H3** | Weekend/rest-day hardcoded `Sat/Sun` | `packages/api/src/utils/attendance-recalc.ts:61-66` (`dow===0→"sunday"`, `dow===6→"saturday"`) — but `payrollSetting.workDays` jsonb (`packages/db/src/schema/payroll.ts:189`, default `[1,2,3,4,5]`) and all four OT multipliers (`payroll.ts:162-182`) are **already tenant-configurable** | A tenant whose rest days are not Sat/Sun (e.g. Fri/Sat, or a 6-day week) gets the wrong OT bucket → wrong pay. The config exists; the classifier ignores it. |
| **H10** | Leave-day counts trusted from client / not server-recomputed under the resolved policy | (cross-cuts the leave request create/approve path; tie to the H2 resolver) | Day counts and paid/unpaid must be computed **server-side under the policy resolved for the request's dates**, never taken from the client. |

**Common root cause:** "current rule" is modeled as a **boolean toggle** (`isActive` / `status==='active'`)
instead of a **validity window resolved against an event date**. The fix is one small, well-tested
resolution seam per domain, plus the missing date columns on the one table that lacks them.

---

## 2. Architecture thesis (one pattern, three applications)

A statutory/policy rule row carries `[effectiveFrom, effectiveTo)` (half-open; `effectiveTo = null` =
open-ended "current"). Resolution is a pure function:

```
resolveAsOf(rows, asOf) =
  the row where effectiveFrom <= asOf AND (effectiveTo IS NULL OR asOf < effectiveTo),
  picking the latest effectiveFrom on overlap; null if none.
```

- **The event date drives resolution, never `now()`.** Payroll → the **pay date** (period end / pay
  date). Leave → the **request start date** (per-day for spanning ranges if a policy boundary falls
  mid-range — see §5). Workweek → the **work date** of the attendance day.
- **A new national budget / new policy / new country = one dated row insert, never a code change**
  (the SaaS rule's "future rule changes without rewriting old results"). GRA history proves it: PA
  $100k→$130k→$140k/mo across 2024→26; bands 28/40→25/35 in 2025 (cited in 21D-A §2).
- **`isActive` is demoted, not deleted** — it becomes a **publish/draft guard** ("is this row live
  enough to be resolvable at all"), orthogonal to the date window. A draft 2027 profile can exist
  unpublished without affecting 2026 resolution.
- **Computed results pin their inputs.** A generated payslip records *which* profile row + rule
  version it used, so the record is reproducible and immune to later edits (extends the existing
  `payrollRun.countryProfileId` pin so it is actually honored — see §4).
- **Historical computed records are immutable** (Migration Rule + Payroll Rule): effective-dating
  governs **new** computations and re-previews of *open* runs only. We do **not** retro-recompute
  already-issued payslips (see §10 Q1).

---

## 3. Payroll profile — resolve by pay date (H1)

**Schema (21G-B).** Add to `country_payroll_profile` (`packages/db/src/schema/payroll.ts`):

- `effectiveFrom date NOT NULL` — start of validity (pay-date basis).
- `effectiveTo date NULL` — exclusive end; `null` = current/open.
- Keep `effectiveYear int` **as a human label only** (display + backfill helper), no longer the resolution key.
- **Rename `isActive` → `isPublished`** (owner decision Q2). It becomes an explicit **publish/draft
  guard** ("is this row live enough to be resolvable at all"), orthogonal to the date window.
  Resolution requires `isPublished = true` **and** the date window — so an unpublished future row is
  invisible to resolution. The rename is a real migration (`RENAME COLUMN`) and touches every
  reference site (`payroll.ts:1355`, `payroll-input-builder.ts:304`, settings CRUD, seed).
- Replace unique `(org, country, effectiveYear)` with a **no-overlap guarantee** per `(org, country)`.
  Postgres can't express a half-open range exclusion on plain `date` columns trivially; **recommend**
  an application-level overlap check on write **plus** a `unique(org, country, effectiveFrom)` backstop
  (no two windows start the same day). (Range-type + GiST `EXCLUDE` is the "correct" DB-level solution
  but is heavier; documented as a future hardening — see §10 Q3.)

**Backfill migration.** Existing rows have only `effectiveYear`. Backfill
`effectiveFrom = make_date(effectiveYear, 1, 1)` and `effectiveTo = null` for the latest year /
`make_date(nextYear,1,1)` for superseded years. Purely additive + a data backfill; no row loss.

**Resolution seam (21G-C).** New pure helper, single source of truth:

```ts
// packages/api/src/utils/payroll-profile-resolver.ts
resolveCountryProfile(orgId, { asOf: Date, countryCode?: string }): Promise<Profile | null>
```

Rewrite the **two** call sites to use it with the pay date:
- `payroll.ts` run-create (~1349): resolve `asOf = period.payDate` (fallback `period.endDate`); pin the
  resolved id onto `payrollRun.countryProfileId`.
- `payroll-input-builder.ts buildCountryProfile` (~295): **read the run's pinned `countryProfileId`
  first** (honor the pin); only if absent, resolve by the period date. **Never** fall back to
  `isActive` alone.

**Engine registry (21G-C).** `resolveCountryRules(countryCode, effectiveYear)` stays the in-code
fallback for code-shipped country packs, but the **DB profile is authoritative** when present. The
engine already accepts a fully-specified `countryProfile` input, so no engine signature change is
required for H1 — only the *builder* changes which row it loads. (The deeper "annual figure_basis
re-base" remains 21D-A's roadmap and is **not** required to fix H1; proration already shipped in 21D-B.)

---

## 4. Payslip rule-version pinning (H1, durability)

- `payrollRun.countryProfileId` already exists (`payroll.ts:348`) — **make it authoritative at generate
  time** (§3). Add `ruleVersionLabel text` (e.g. `"GY 2026 (from 2026-01-01)"`) onto the run or payslip
  for human-readable provenance on the payslip detail + GL audit.
- Recommend a lightweight `resolvedRuleSnapshot jsonb` on the **payslip** (the exact bracket set /
  allowance figures used), so a reissued PDF reproduces byte-for-byte even if the profile row is later
  corrected. (v1 already proved the value of inline snapshots — `snapshot_json` on v1 payslips;
  Migration notes.) Mark optional / phase-tail if scope tightens.

---

## 4.5 Historical payslip correction workflow (owner decision Q1 — bitemporal)

**Owner ruling:** historical payroll **must be correctable** when the original was computed under the
wrong/missing effective-dated rule, wrong proration, or a known engine bug — but **never** by silent
recompute or destructive overwrite. The originally-issued values are preserved as an **immutable audit
artifact**; the corrected values become the current corrected historical truth, fully traceable.

This makes effective-dating **bitemporal**: we keep *transaction-time* truth (what we issued) **and**
*valid-time* truth (the correct figure under the rule in force on the pay date).

### Hard rules (owner-stated, verbatim intent)
- Do **not** silently recompute historical payslips on page load.
- Do **not** overwrite without explicit admin approval.
- Do **not** hide that a payslip was corrected.
- Do **not** destroy or mutate the original issued record.
- Every correction is explicit, auditable, reversible-or-traceable, and tied to the correct
  effective-dated statutory rule.

### Data model (21G-B)
- **`payslip_correction`** (new table) — one row per applied correction:
  `id`, `organizationId`, `originalPayslipId` (FK, the immutable issued record), `payrollRunId`
  (the correction run), `correctedAt`, `correctedBy`, `reasonCode` (enum: `wrong_rule` /
  `missing_effective_rule` / `wrong_proration` / `engine_bug` / `data_fix` / `other`),
  `reasonNote text`, `resolvedProfileId` (the historical profile used), `ruleVersionLabel`,
  `glAdjustmentStatus` (enum: `not_required` / `pending` / `posted` / `failed`),
  `glJournalId` (soft ref to the GL adjustment journal), and `componentDeltas jsonb`
  (per-component original→corrected→delta: gross, PAYE, NIS emp/employer, allowances, net, etc.).
- The **original payslip is never updated** beyond a `supersededByCorrectionId` back-pointer
  (nullable) so the UI can surface "corrected" without losing the issued figures.
- The **corrected figures** live in the correction run's own payslip rows (reuse the existing
  `payslip` table under a correction `payrollRun`), linked via `payslip_correction`. No second payslip
  shape to maintain.

### Workflow (21G-G — first-class)
1. **Identify** affected payslips — filter (period range, country, profile, "computed before
   effective-dating", or an explicit selection). Read-only.
2. **Resolve** the correct historical profile/rule **by pay date** (the §3 resolver) for each.
3. **Recompute** each affected payslip via the payroll engine under that historical rule (off to the
   side, no writes).
4. **Compare** original vs corrected per component → deltas.
5. **Preview/report** — a correction preview listing every affected payslip, its deltas, the rule used,
   and the proposed GL adjustment. Nothing written yet.
6. **Approve** — requires explicit `canManagePayroll` admin approval (two-step: preview → confirm).
7. **Apply in a transaction** — create the correction `payrollRun` + corrected `payslip` rows + the
   `payslip_correction` records + `supersededByCorrectionId` back-pointers, atomically.
8. **Preserve** the original snapshot/issued values untouched.
9. **Audit** — `createAuditEvent` per correction (entityType `payslip_correction`), capturing actor,
   reason, deltas summary, rule used.
10. **GL adjustment** — emit explicit GL adjustment/reversal journals via the existing `gl` router
    (21D-E) for the net delta; **never** mutate the original GL postings. Status tracked on the
    correction row. (Honors the GL Rule: GL links to payroll, GL does not mutate payroll — here payroll
    *requests* a GL adjustment; it does not edit GL history.)
11. **Export** — an exportable, PII-safe correction report (CSV/PDF) for the run.

### UI (21G-F/G)
The payslip detail must show **both** when a correction exists: originally-issued values, corrected
values, reason, correction date, corrected-by, rule/profile used, per-component delta, and GL
adjustment status. A "Corrections" admin screen lists correction runs and their reports. No corrected
figure is ever presented as if it were the original issue (no fake-data-as-live).

### Guardrails / RBAC
- Reuses existing `payroll` AC pairs (`payroll:update` for the workflow, `payroll:read` for preview)
  + `gl` pairs for the adjustment — **no new AC pair, audit stays 161/21** (the 13B/14B/15B unconsumed-
  pair precedent does not apply; these pairs are already consumed). New enum-only schema.
- Correction is **not** a page-load side effect anywhere — it only runs through the explicit
  preview→approve→apply path.
- Transaction-or-nothing; partial application is impossible.

---

## 5. Leave policy — resolve by request date (H2) + server-computed days (H10)

- **Resolution seam (21G-D).** New pure helper mirroring the payroll resolver:

  ```ts
  // packages/api/src/utils/leave-policy-resolver.ts
  resolveLeavePolicy(orgId, { asOf: Date, countryCode? }): Promise<Policy | null>
  ```

  Resolve against `organizationLeavePolicy.effectiveFrom/effectiveTo` (columns already exist) +
  `isActive`/`status` as the publish guard + `deletedAt IS NULL`. Replace the `status==='active'`
  lookup in `getPolicyHealth` (`leave-policy.ts:659`) and any request-time policy read.
- **Event date = leave request start date.** If a request spans a policy boundary (rare), **recommend**
  resolving per-day and summing (correct for accrual/limit rules that changed mid-range); minimum
  viable = resolve once on the start date and note the simplification. (§10 Q4.)
- **H10 — server authority.** Day counts, working-day exclusions (uses the §6 workweek), and
  paid/unpaid classification must be **computed server-side under the resolved policy** at create and
  re-validated at approve; the client value is advisory/displayed only, never trusted for balance math.
  Audit confirmed the policy notices are non-blocking — this phase makes the **numeric** path
  authoritative without changing the soft-notice UX.

---

## 6. Tenant workweek / weekend policy (H3)

The config already exists — the bug is one classifier ignoring it.

- **Reuse `payrollSetting.workDays`** (`[1..7]`, ISO-ish; default `[1,2,3,4,5]`). Add a companion
  **`restDayMultiplierMap`** only if a tenant needs *per-rest-day* rates beyond the existing
  `saturdayMultiplier`/`sundayMultiplier`; **recommend** keeping the existing two named multipliers and
  introducing a small mapping `weekendDays:int[]` (default `[6,7]` = Sat/Sun) so "which days are the
  weekend" is config, distinct from "which days we work".
- **Fix the classifier (21G-E).** `attendance-recalc.ts` `classifyDay(dow)` must read the tenant's
  `weekendDays` + public-holiday calendar instead of hardcoding `0/6`. Map each work date to a bucket
  (`weekday | saturday | sunday | holiday`) **or** generalize the bucket to
  `(normal | restDayA | restDayB | holiday)` keyed to config. Minimum viable that fixes H3 without an
  engine change: keep the four existing buckets but **decide membership from `weekendDays`**, not from
  literal `0/6`.
- **Event date = the work date.** A tenant that changes its weekend policy effective a date → store the
  workweek setting effective-dated too (lighter: `payrollSetting` is a single current-row table today;
  recommend a dated `tenant_workweek_policy` only if a tenant actually needs historical weekend
  changes — otherwise current-row is acceptable and documented as a known limitation; §10 Q5).

---

## 7. RBAC, tenancy, security (unchanged guardrails)

- **No new resources/actions/roles.** This is an internal resolution-correctness change; the existing
  `payroll` / `leave_request` / `leave_policy` AC pairs already gate every touched procedure. Audit
  count stays **161/21** (no new consumed pair).
- **Tenant isolation preserved.** Every resolver filters by `organizationId`; system templates
  (`organizationId IS NULL`) remain readable but a tenant override always wins by date.
- **No frontend-only security.** All resolution + day-count math is server-side; the client receives
  only the resolved result.
- **No cross-module mutation.** Resolvers are read-only; leave never writes payroll, attendance never
  writes leave. The §3 builder change writes only `payrollRun` (its own table).

---

## 8. Verification plan (per the SaaS Verification Rule)

- **Engine/unit (TDD, 21G-C/D/E):** `resolveAsOf` boundary tests — `asOf` exactly on `effectiveFrom`
  (inclusive), exactly on `effectiveTo` (exclusive), between two windows, before all, after all,
  open-ended `null` end; overlap → latest-start wins. Pure, no DB.
- **`verify:payroll` / `verify:leave` script additions:** a historical pay period resolves the
  *historical* profile (not today's); a backdated leave request resolves the *historical* policy; a
  Fri/Sat-weekend tenant buckets OT correctly; pinned `countryProfileId` is honored at generate.
- **Regression:** re-run `migration:reconcile` against live v1 — fortnightly personal-allowance must
  stay **46/46 EXACT** (the 21D-B certification must not regress; resolve-by-date must pick the same
  GY-2026 row for 2026 periods).
- **Gates:** `check-types` 3/3 · `build` 2/2 · `audit` 161/21 · `verify:pay-frequency` · engine suite ·
  lint baseline · web tsc 0-new.
- **Browser:** spot-check payroll run preview on a historical period + a leave request on a backdated
  date show the correct resolved rule label; 3-role smoke unchanged.

---

## 9. Phase sequence

| Sub-phase | Scope | Output |
| --- | --- | --- |
| **21G-A** | This spec | `docs/architecture/effective-dating-implementation-plan.md` (this file) |
| **21G-B** | Schema + migration | `country_payroll_profile` gains `effectiveFrom/effectiveTo`; backfill from `effectiveYear`; `weekendDays` on `payrollSetting`; migration `0023_*`; idempotent seed updates; DB-verify |
| **21G-C ✅** | Payroll resolve-by-date | **DONE.** `effective-dating.ts` (pure `resolveAsOf`, 12 tests) + `payroll-profile-resolver.ts`; run-create pins profile + `ruleVersionLabel`; generation honors pin (`resolveRunProfilePin`, pre-21G backfill); `buildPayrollInput({pinnedProfileId})`; engine registry unchanged; `verify:payroll-resolver` 8/8; reconcile structurally 46/46 |
| **21G-D ✅** | Leave resolve-by-date + server-computed days | **DONE.** `leave-policy-resolver.ts` (`resolveLeavePolicyAsOf`, reuses `resolveAsOf`, no migration) + `leave-days.ts` (`countLeaveDays`); `getPolicyHealth` resolves as-of today; `requestsCreate` server-authoritative day count (H10, client advisory); `verify:leave-resolver` 13/13; audit stays 161/21 |
| **21G-E ✅** | Tenant workweek/weekend | **DONE.** `classifyDayType` reads `payrollSetting.weekendDays` + holiday calendar via `resolveDayTypeConfig`; OT buckets from config (holiday wins, Sunday distinct, other rest days → saturday bucket); default Sat/Sun unchanged; `holiday` bucket now populated; `verify:workweek` 13/13; audit stays 161/21 |
| **21G-F** | UI surfacing | Payslip/run + leave detail show the resolved rule-version label honestly; payslip detail shows original-vs-corrected when superseded; payroll settings expose `weekendDays`; no fake data |
| **21G-G ✅** | Historical payslip correction workflow (Q1) | **DONE (API/core).** `payroll.corrections.{preview,apply,list,getById}` + `applyPayslipCorrection`/`computeCorrection` + pure `buildComponentDeltas`; recompute-by-pay-date → per-component deltas; txn apply; immutable original (back-pointer only); GL adjustment as obligation (`pending`/`not_required`, posted via GL module — payroll never writes the ledger); admin-only; double/no-change blocked; `verify:payslip-correction` 11/11; audit stays 161/21. Deferred: corrected-payslip row + GL posting + exportable report (UI = 21G-F) |
| **21G-I** | QA / RBAC / security / browser pass | parallel read-only review agents; reconcile regression 46/46; correction workflow audited (original never mutated, no silent recompute, txn-or-nothing, GL adjustment explicit); close Phase 21G |

---

## 10. Open questions (Q1/Q2 DECIDED by owner 2026-06-13)

1. **Historical payslips computed on the wrong rules — recompute or leave?**
   **DECIDED — bulk-correct as a first-class, auditable, bitemporal workflow (§4.5).** Not silent
   recompute, not destructive overwrite, and not "leave wrong forever." Original issued values are kept
   immutable for audit/legal; corrected values become the corrected historical truth, linked to the
   original with per-component deltas, reason, actor, the resolved historical rule, and an explicit GL
   adjustment. Requires admin approval; transaction-or-nothing; never a page-load side effect.
   → adds sub-phase **21G-G** + `payslip_correction` schema in 21G-B.
2. **`isActive` in place vs explicit `isPublished`?**
   **DECIDED — rename to `isPublished`** (§3). Real `RENAME COLUMN` migration; resolution =
   `isPublished AND date-window`. Reference sites updated (`payroll.ts:1355`,
   `payroll-input-builder.ts:304`, settings CRUD, seed).
3. **No-overlap enforcement: app-level check + `unique(org,country,effectiveFrom)` vs DB range `EXCLUDE`?**
   Recommendation: app-level + unique backstop now (simple, portable); GiST range `EXCLUDE` documented
   as future hardening.
4. **Leave request spanning a policy boundary: per-day vs resolve-once-on-start?**
   Recommendation: resolve-once-on-start for MVP (boundary spans are rare), with a code comment; per-day
   summation is a clean follow-up.
5. **Workweek changes over time: dated `tenant_workweek_policy` table vs current-row `payrollSetting`?**
   Recommendation: current-row now (matches today's single-row settings model), `weekendDays` added as
   config; dated workweek history deferred until a tenant needs it (documented limitation).

---

## 11. Non-goals (explicitly deferred)

- Annual `figure_basis` re-base + multi-year country packs beyond GY-2026 (→ 21D-A roadmap / future).
- Contractor / project-billing effective-dating (→ 21D-A roadmap, separate engine).
- Finance/tax-returns module effective-dating (→ Phase 22).
- Range-type DB `EXCLUDE` constraint (§10 Q3 — future hardening).

> Note: retro-correction of issued payslips is **in scope** as the controlled bitemporal workflow in
> §4.5 / sub-phase 21G-G (owner decision Q1) — it is explicitly *not* a non-goal. What remains out is
> *silent* recompute / destructive overwrite.
