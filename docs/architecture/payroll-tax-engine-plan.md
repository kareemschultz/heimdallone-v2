# Phase 21D — Payroll Tax Engine: GRA-compliant, effective-dated, multi-frequency, contractor-capable

**Date:** 2026-06-12
**Status:** 21D-A spec (planning) — no engine code yet
**Origin:** Phase 21C reconciliation found v2's payroll-engine applies a flat monthly personal
allowance to every pay period (GRA + v1 prorate it). Owner then set the broader direction: build the
engine **around GRA official docs** (PAYE *and* beyond), serve **weekly/fortnightly/monthly/contract/
project** businesses, make it **yearly-updatable** (budgets change rates/thresholds annually), and
benchmark the major platforms to add/enhance what's missing.
**Source of truth:** [[reference-gra-payroll]] — **GRA (gra.gov.gy) is authoritative for all
calculations**, NOT v1 (v1 has bugs of its own). Research backing this plan: 4 read-only agents
(GRA direct, GRA indirect, platform benchmark, effective-dating architecture) — citations inline.

---

## 0. The thesis

A payroll/tax engine's correctness has a **shelf life** — every national budget changes rates,
thresholds, allowances, and sometimes the band structure. So the engine must treat statutory rules as
**effective-dated DATA, not code constants**, resolved by the **pay date**, with **frequency
proration** applied uniformly, and an **audit trail** of which rule version produced each payslip. Get
that architecture right once and every future budget (and every new country) is a data update.

---

## 1. Scope — what belongs in the payroll engine vs a finance/tax module

GRA administers many taxes; only some touch a payslip/contractor payment. (Agents 1+2.)

| Tax | Payroll engine | Finance/tax module |
| --- | --- | --- |
| PAYE personal income tax (bands/allowance) | ✅ core | returns side |
| NIS (employee 5.6% / employer 8.4%) | ✅ core | remittance |
| Self-employed income tax (shares 25%/35% bands + allowance) | ✅ shared rules | quarterly advance filing |
| **Resident contractor WHT (2% on payments > $500k)** | ✅ if engine pays contractors | remittance |
| Non-resident WHT (10% contractor; 15/20% div/int/royalty/fees/rent) | ❌ | ✅ |
| VAT (14%; reg. threshold ~GYD 15M; monthly by 21st) | ❌ (contractor-invoice context only) | ✅ |
| Corporation tax (40% commercial / 25% other / 45% telephone; 2% MCT) | ❌ | ✅ |
| Property tax (companies tiered; individuals exempt from 2025) | ❌ | ✅ |
| Capital gains tax (20%; <$500k & >25yr exempt; <12mo = income) | ❌ | ✅ |

**Decision:** Phase 21D builds the **payroll engine** scope (PAYE/NIS/allowances + resident-contractor
2% WHT). The org-level taxes (VAT/corp/property/CGT/non-resident WHT) become a **separate
finance/tax-returns module** (Phase 22+, builds on Finance Phase 16) — designed effective-dated from
the same primitives so it inherits the yearly-update machinery. **Per-tax effective dates differ**
(income/corp = Jan 1; VAT/customs 2026 = Feb 16) → resolution must be per-tax-by-date, never one annual
cutover. (Agent 2.)

---

## 2. The centerpiece — effective-dated, yearly-updatable rules

### 2.1 What's wrong today (Agent 4, with file:line)
- Constants live in DB `country_payroll_profile` **and** a duplicate hardcoded fixture
  (`packages/payroll-engine/src/fixtures/guyana-2026.ts`) — two sources, silent drift risk.
- Rule resolution is by a hand-toggled **`isActive` boolean**, not by date
  (`payroll-input-builder.ts:295`). `effectiveYear` exists but isn't used to resolve.
- **Historical payslips recompute against *today's* active row**, not the rules in force on their pay
  date — a finalized 2025 payslip would silently recompute on 2026 rules.
- `contract.payFrequency` is carried into the engine (`types.ts:34`) but **never read** by any
  `compute*` function → the frequency-proration bug (§3).
- Onboarding a new budget today = flag-flip (breaks history) + likely registry code change + editing
  constants in three places. "A budget = a data update" is **not** true today.

### 2.2 GRA year-over-year history — why this is non-negotiable (Agent 1)
| Effective | Personal allowance | Bands | Medical cap | Source |
| --- | --- | --- | --- | --- |
| 2022-01-01 | $900k/yr | 28% ≤$1.8M; 40% above | $360k/yr | GRA notice |
| 2024-01-01 | $100k/mo ($1.2M/yr) | 28% ≤$2.4M; 40% | $600k/yr | Income Tax (Amdt) Act 2/2024 |
| 2025-01-01 | $130k/mo ($1.56M/yr) | **25% ≤$3.12M; 35%** (structure changed) | $600k/yr | Act 2/2025 |
| 2026-01-01 | $140k/mo ($1.68M/yr) | 25% ≤$3.36M; 35% | **$50k/mo** | [2026 notice](https://gra.gov.gy/notice-to-employers-employees-self-employed-persons-revised-personal-allowance-and-deductions-for-income-tax-2026/) |

Mechanism: annual **National Budget → Income Tax (Amendment) Act → dated GRA notice**, effective Jan 1
(occasionally a retroactive employer-refund window). **GRA's own static pages are STALE** — the dated
budget notices are the truth (Agent 1's key data-quality warning).

### 2.3 Target design (Agent 4 + platform patterns Agent 3)
1. **Schema:** add `effective_from date NOT NULL`, `effective_to date NULL` (open-ended), and
   `figure_basis` (`'annual'`) to `country_payroll_profile`. Keep `effectiveYear` as a label.
   Demote `isActive` to a "published/draft" guard. Replace the `(org,country,year)` unique constraint
   with a **no-overlapping-windows** guarantee per `(org, countryCode)`.
2. **Resolve by pay date:** `buildCountryProfile(orgId, countryCode, asOf)` picks the row where
   `effective_from <= asOf AND (effective_to IS NULL OR asOf < effective_to)`. `asOf = payPeriod.payDate ?? endDate`.
3. **Historical stability:** when recomputing an *existing* finalized run, resolve via the pinned
   `payroll_run.countryProfileId` (already stored, `payroll.ts:348`) so payslips reproduce byte-for-byte.
   (Valid-time for new runs + transaction-time pin for old runs — the cheap bitemporal subset.)
4. **Store ANNUAL constants** as the single source of truth (seed = live = tests; kill the divergent
   fixture by deriving it from the seed object). A new budget = **one dated row insert**, no deploy.
5. **Registry by formula-shape, not year:** rename `countries/guyana-2026.ts` → `countries/guyana.ts`
   (the *formula* is year-agnostic; only numbers change yearly). `resolveCountryRules(countryCode,
   effectiveOn)` forks a formula entry only when the *algorithm* changes (e.g. a new band tier).
6. **Per-payslip rule-version audit** (platform best practice, Agent 3 / Symmetry): persist which
   profile version produced each payslip so runs are defensible and reconstructable.

---

## 3. The immediate fix — frequency proration (closes the 21C finding)

GRA prorates period constants by frequency (Agent 1): personal allowance weekly $32,308 / fortnightly
$64,615 / monthly $140,000; the **$280k/mo band ceiling, NIS ceiling, child, medical, OT caps prorate
the same way**. Canonical method (Agent 4): **store annual, divide by `periodsPerYear` at runtime**
(weekly 52 / fortnightly 26 / semi-monthly 24 / monthly 12).

**Implementation = one cross-cutting layer, country formulas untouched:**
- New `packages/payroll-engine/src/proration.ts`: `periodsPerYear(freq)`, `perPeriod(annualCents, freq)`,
  `prorateProfile(profile, freq)`.
- In `calculate.ts` (after `resolveCountryRules`, ~`:556`), **pre-prorate the profile** by
  `contract.payFrequency` → a `periodProfile`. Every existing `compute*` then receives period-correct
  numbers and needs no change.
- **Critical:** re-base the seed/fixture from monthly-magnitude (`140000.00`) to **annual** *in the
  same change* as the proration layer — else pre-prorating already-monthly numbers divides twice and
  under-pays. The fixture is 100% `monthly` today, which is exactly why the bug stayed invisible — the
  regression suite MUST add weekly + fortnightly cases (GRA-cited expected values).

Six proration touch-points (all in `countries/guyana-2026.ts`): personal-allowance floor (`:16`),
tax band edges (`:32-42`), NIS ceiling (`:9-12`), child allowance (`:22-24`), overtime cap (`:46-51`),
insurance cap floor (`:53-61`). (Agent 4.)

**Validation:** after the fix, re-run `bun run migration:reconcile` — the 43 fortnightly payslips must
move from `v2_engine_gap` to **exact** against v1 (and both certified against GRA's $64,615).

---

## 4. Versatility — contract / project / private work (owner: "both")

Adopt the **Deel model** (Agent 3) at v2's scale:
- **Worker classification** (`employee | contractor | self_employed`) drives which rules apply —
  employees get PAYE/NIS; resident contractors get the 2%-over-$500k WHT; self-employed use the
  annual allowance basis ($1.68M PA, $120k/child/yr, $600k medical/yr — Agent 1).
- **Contract-type enum: `fixed | pay_as_you_go | milestone`** — PAYG and milestone gated behind
  submit→approve before becoming payable (reuses existing approval patterns).
- **Project-based billing:** wire contractor pay to **Projects (Phase 14)** — milestone/time-based
  contractor payments feed the existing **project costing + Finance (Phase 16)**. This is the
  "deal→project→cost" seam finally closing with real contractor pay.
- **Batch payout = one approval → many payouts**, execution behind a **pluggable rail adapter**
  (local bank CSV today; Wise/Payoneer multi-currency later) — mirrors the existing biometric
  adapter/provider model. Under-build for Guyana-first: single GYD rail, no AoR, no FX yet.

---

## 5. Filing & compliance (GRA, Agent 1)
- **Form 5** monthly remittance (within 14 days of month-end); **Form 2** year-end employer summary
  (by Feb 28); **Form 7A/B/C** income categories; CSV e-filing (`paye-[Employer]-[yyyy].csv`).
- Deducted PAYE/NIS is **held in trust for the State** — 10% penalty on failure to remit. Build the
  remittance/return generation effective-dated too (form layouts change).
- Platform patterns to adopt (Agent 3): **run preview before commit**, **off-cycle run = unscheduled
  regular run** (reuse config), **corrections/reversals as first-class audited ops** (not deletes),
  **year-end checklist** orchestration.

---

## 6. Proposed phasing

- **21D-A — this spec.** ✅ (research + architecture).
- **21D-B — engine: effective-dating + frequency proration (TDD).** Schema (`effective_from/to`,
  annual re-base), date-based resolver, `proration.ts`, single-source fixture, GRA-cited weekly/
  fortnightly/monthly/contract test fixtures, per-payslip rule-version audit. Re-run reconcile → 43
  fortnightly payslips go exact. **Highest priority — real-money correctness; own test suite.**
- **21D-C — contractor + project billing.** Worker classification, contract-type enum, resident 2%
  WHT, project/milestone → contractor pay → Finance costing, batch payout + rail adapter seam.
- **21D-D — filing/compliance.** Form 5/2/7 generation effective-dated; run preview/off-cycle/
  corrections/year-end checklist.
- **(then) Phase 22 — finance/tax-returns module.** VAT/corp/property/CGT/non-resident WHT, org-level
  returns, same effective-dated primitives.

Cross-cuts: each new fiscal year (GY-2027, …) and each new country (TT/BB/JM already researched in the
payroll-engine fixtures) becomes a **dated data row**, not a code change.

## 7. Open items to verify before coding (Agents 1+2)
1. Exact GRA-rounded weekly/fortnightly free-pay and band-ceiling figures (pull from the live GRA
   Income Tax Calculator — rounding is non-trivial).
2. Resident vs non-resident contractor/professional WHT rates (governed by the Income Tax Act, not the
   PAYE notices) — confirm before implementing contractor withholding.
3. VAT registration threshold (GRA defers to ministerial regulation; GYD 15M is secondary-sourced).

## 8. Next step
**21D-B** — implement effective-dating + frequency proration in `packages/payroll-engine` under TDD
(GRA-cited fixtures per frequency), behind the existing gates, then re-run `migration:reconcile` to
prove the fortnightly payslips reconcile exact. This is the first change to real-money code in the
migration workstream — it gets its own test suite and verification, not a drive-by edit.
