# Phase 21C — Payroll / Attendance Reconciliation Dry-Run

**Date:** 2026-06-12
**Status:** ✅ complete (reconciliation + guarded scratch-staging proof; NO production writes)
**Predecessors:** [21A plan](./v1-to-v2-cutover-plan.md) · [21B ETL](./phase-21b-etl-foundation.md) · [Gap analysis](./v1-to-v2-gap-analysis.md)
**Next:** Phase 21D — minimal v2 feature builds + the payroll-engine frequency-proration fix

## What this is

The cutover safety net for payroll: re-run every v1 payslip's **own inputs** through **v2's
statutory rules** and compare. It answers "does v2 reproduce the client's real payslips?" — and where
it doesn't, **GRA adjudicates** (see §2). Read-only on v1; the only writes go to a disposable scratch
DB behind multiple guards.

## 1. Methodology — GRA is the source of truth, NOT v1

> **v1 is a *candidate*, not the gold standard.** v1 has proven bugs (a payroll UTC bug forced 23
> payslip reversals, visible in its GL). So this phase does **not** treat v1 as correct. It compares
> v2 against v1 to surface *differences*, then adjudicates each against **GRA — the Guyana Revenue
> Authority — the authoritative source for all PAYE/NIS/allowance math** (gra.gov.gy). Where v1≡v2,
> that is only an *agreement*; it is GRA that certifies it.

Mechanism: v1 stored, per payslip, both the `inputs` it fed its calculator and the `computed`
results (`snapshot_json`). Feeding v1's own inputs into v2's `CountryRules` isolates **engine/rule**
differences from input differences — and needs no attendance/roster (gross is given). Earnings
reconstruction (gross/overtime/Saturday) IS roster-derived and is honestly reported as blocked on 21D.

## 2. Results (46 non-reversal payslips; 23 reversals classified v1-bug, not reconciled)

| Component | Result | GRA adjudication |
| --- | --- | --- |
| NIS employee | **46/46 exact** | v2 constants match GRA (5.6%, ceiling $280k/mo) — ✅ trustworthy |
| NIS employer | **46/46 exact** | matches GRA (8.4%) — ✅ |
| Child allowance | **46/46 exact** | matches GRA ($10k/mo per child) — ✅ |
| PAYE brackets | **45 exact + 1 rounding** | v2 bands match GRA (25% to $280k/mo, 35% above) — ✅ (tested on v1's own chargeable income) |
| Net identity | **46/46 exact** | composition consistent — ✅ |
| **Personal allowance** | **3 exact (monthly) / 43 `v2_engine_gap` (fortnightly)** | **GRA confirms v1, v2 is WRONG — see §3** |

Per-tenant: Netsurf 66 payslips (3 exact, 40 engine-gap, 23 v1-bug); Foreign Links 3 (all 3 engine-gap,
all fortnightly). **Readiness: BLOCKED** — on the engine fix below.

## 3. Headline finding — v2 does not prorate allowances by pay frequency  🔴

- Every fortnightly mismatch is a **uniform delta of GYD 75,384.62** (7,538,462 cents).
- v1 personal allowance (fortnightly) = **GYD 64,615.38** = $140,000 × 12/26.
- v2 `computePersonalAllowance` returns the **flat monthly $140,000** every period.
- **GRA 2026 (authoritative) publishes the prorated per-period figures:**
  **weekly $32,308 · fortnightly $64,615 · monthly $140,000 · yearly $1,680,000.**
- ∴ **v1 is correct, v2 is wrong.** For fortnightly payroll v2 over-grants the personal allowance →
  under-computes PAYE. Netsurf runs **fortnightly** payroll, so this would mis-tax every Netsurf
  employee at cutover.

This is a genuine **v2 payroll-engine defect**, not a v1 quirk — so we fix v2 (correctly, per GRA),
we do **not** ship v2's wrong number.

## 4. The real requirement — v2 must serve ALL pay frequencies (owner directive)

v2 must cater for **weekly, fortnightly, monthly, and contract/self-employed** businesses. The
personal-allowance bug is one instance of a general gap: **every period-based GRA constant must be
prorated to the pay frequency.** The 21D engine fix must apply frequency-aware proration to:

| GRA constant | Monthly | Fortnightly (×12/26) | Weekly (×12/52) | Contract / self-employed |
| --- | --- | --- | --- | --- |
| Personal allowance | $140,000 | $64,615 | $32,308 | $1,680,000/yr (or ⅓ gross) |
| Income-tax 25% band ceiling | $280,000 | ~$129,231 | ~$64,615 | $3,360,000/yr |
| NIS ceiling | $280,000 | proportional | proportional | annual basis |
| Child allowance / child | $10,000 | proportional | proportional | $120,000/yr |
| Medical/life cap | $50,000 | proportional | proportional | $600,000/yr |

(NIS/child/medical happened to reconcile here because those employees were under-ceiling / 0 children,
but the **threshold proration must still be implemented** or they break for higher earners.) The
engine fix needs its own TDD pass (GRA-cited fixtures per frequency) — it is **not** done in this
phase (21C is reconciliation only; we don't patch the engine inside a dry-run).

## 5. GRA 2026 reference (source of truth)

- PAYE: https://gra.gov.gy/optimal/paye/
- 2026 personal allowance & deductions notice: https://gra.gov.gy/notice-to-employers-employees-self-employed-persons-revised-personal-allowance-and-deductions-for-income-tax-2026/
- Personal allowance GYD 1,680,000/yr or ⅓ gross (whichever greater), prorated per period (above).
- Tax: 25% up to $3,360,000/yr chargeable, 35% above. NIS 5.6% employee / 8.4% employer, ceiling
  $280,000/mo. Child $10,000/mo. Medical: lesser of 10% gross or $50,000/mo.

## 6. Scratch-staging proof (the first write-capable path)

Writes go ONLY to a disposable scratch DB behind guards (proven this phase on a throwaway, isolated
Postgres — never postgres-central, never production):
- `create-scratch-db.ts` refuses any DB name without scratch/staging/test/migrat, refuses the v1 DB
  and the v2 prod DB, and requires `CONFIRM_SCRATCH_WRITE=1`. **All three guards verified to reject.**
- `load-scratch-v2.ts` parks v1 source rows in `migration_source_*` JSONB staging tables (idempotent
  truncate+reload). Proven load: 2 orgs, 23 employees, 69 payslips, 880 punches, 175 roster, 6 schedules.
- Roster/work-schedule are staged **source-only** (no final v2 home until 21D), per the gap analysis.

## 7. Attendance audit & statutory fields

- 880 punches; carry employee/timestamp/type/source/device/GPS. `logical_shift_date` present (confirm
  v2 derivation). **Earnings reconstruction blocked** on the 21D roster + scheduling-rules build.
- 9 employee statutory fields flagged manual-review (TIN, NIS, qualifying_children, second_job ×2,
  medical, other_deductions, kiosk_pin_hash, company_id) — each needs a confirmed v2 column.

## 8. Cutover readiness: BLOCKED — required before flip

1. **v2 payroll-engine frequency-proration fix** (§3/§4) — top priority; affects every non-monthly
   tenant. GRA-cited, own TDD pass.
2. Per-date roster + rich work-schedule rules (21D) — unblocks earnings reconstruction.
3. Minimal v2 payroll-GL + notification subsystem (21D).
4. Confirm v2 columns for all employee statutory fields.
5. Confirm production `country_payroll_profile` equals the GRA-2026 constants (and add per-frequency
   proration metadata).

## 9. How to run

```bash
export V1_DATABASE_URL="postgres://heimdallone:****@172.19.0.2:5432/karetech_erp"
bun run migration:reconcile                 # reconciliation only — no DB writes

# optional: also stage source data into a disposable scratch DB
export V2_STAGING_DATABASE_URL="postgres://.../heimdallone_v2_migration_scratch"
export CONFIRM_SCRATCH_WRITE=1
bun run migration:reconcile
```

Outputs (PII-safe — deltas/classifications/opaque IDs only, no absolute salary amounts):
`docs/migration/reconciliation-report.md` + `.json`.

## Gates at completion
`check-types` 3/3 · `build` 2/2 · `audit:permissions` 149/18 · `check` lint clean on changed files ·
`migration:dry-run` + `migration:reconcile` produce reports. v2 payroll-engine **not** modified this
phase (the fix is a scoped 21D change with its own tests).
