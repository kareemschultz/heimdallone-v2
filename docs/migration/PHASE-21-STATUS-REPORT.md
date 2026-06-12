# Phase 21 — v1 → v2 Migration Workstream: Status Report & Audit

**Date:** 2026-06-12
**Prepared for:** owner review (autonomous session)
**Repo state at report time:** `HEAD == origin/master == 78eac13`, tree clean.
**Source of truth for payroll math:** GRA (gra.gov.gy) — see [[reference-gra-payroll]].

> Honest framing up front: the **migration discovery, the payroll-correctness fix, and the v2 data
> homes are done and gated**. The **cutover itself is not done** — it needs the remaining write-ETL,
> a few feature routers/UIs, and the operator decisions listed in §6. Nothing in this workstream wrote
> to v1 or to production v2; all DB writes went to disposable throwaway Postgres containers.

---

## 1. What this workstream is

v2 will replace and migrate the **live** v1 deployment (repo `heimdallone.git@d03e5b4`, DB
`karetech_erp` on `postgres-central`, 2 real tenants: Netsurf Group operational + Foreign Links
pilot). The goal: capture v1's **intent + data** without cloning v1's bugs, certify correctness
against **GRA** (not v1), and migrate safely.

## 2. Phases completed (with commits)

| Phase | What | Commit |
| --- | --- | --- |
| 21 gap analysis | Live v1 DB inspection → coverage map | `0431dda` |
| 21A plan | Migration & cutover plan (intent-capture) | `0d01fad` |
| 21B ETL foundation | Read-only v1 connector + dry-run framework (`migration:dry-run`) | `3660b26` |
| 21C reconciliation | Re-ran v1 payslips through v2 rules vs GRA (`migration:reconcile`) | `99b783c` |
| 21D-A engine spec | GRA full-suite + platform benchmark + effective-dating architecture | `858bb8c` |
| 21D-B engine fix | Frequency-proration (TDD) | `7c25e54` |
| 21D-C recon proof | 43 fortnightly payslips → exact | `7c25e54` |
| 21D-D/E/F schemas | roster / payroll-GL / notifications + migration 0021 | `09ccb64` |
| 21D-I QA/audit fixes | 3 Fable-5 audits → critical + high fixes | `78eac13` |

## 3. The headline result — payroll correctness

**21C reconciliation** ran every v1 payslip's own stored inputs through v2's statutory rules and
compared, adjudicating against GRA (v1 is a *candidate*, not the oracle — it has its own bugs: 23 of
its 69 payslips are UTC-bug reversals).

- **Found:** v2's engine applied the **flat monthly** personal allowance ($140k) to **every** pay
  period; GRA prorates it (fortnightly $64,615 = 140k×12/26). Same flaw on the tax band ceiling, NIS
  ceiling, child allowance, OT/insurance caps. Real bug — Netsurf runs **fortnightly** payroll.
- **Fixed (21D-B, TDD):** one `proration.ts` layer; `calculate.ts` prorates the profile by pay
  frequency once and uses it for all statutory math. Monthly stays byte-identical. Engine 36/36 tests.
- **Proven (21D-C):** re-ran `migration:reconcile` → personal_allowance **3-exact/43-gap → 46/46
  EXACT**; readiness **BLOCKED → READY**. NIS/child/net all 46/46; PAYE brackets 45 exact + 1 rounding.
- **A second bug the audit caught (21D-I):** the proration map used `"semi-monthly"` but the DB enum
  is `"semi_monthly"` → semi-monthly employees were still broken. Fixed by normalizing the key.

## 4. The v2 data homes (schema-layer, migration 0021)

The three migration-blocking gaps now have v2 tables (the foundation the cutover ETL writes into).
**Schema only — routers/UI are the next layer (see §6).**

- **`roster_entry`** (21D-D) — per-date shift assignment with override/custom-hours/day-off/swap +
  approval. Home for v1's 175 roster rows that feed pay (v2's weekly-pattern `shift` couldn't hold
  them). FK to employee is `restrict` (history-safe, per audit).
- **`gl_account` / `gl_journal_entry` / `gl_journal_line`** (21D-E) — minimal double-entry payroll-GL
  for v1's chart + journals. **Coordination guardrail proven:** `gl_journal_line.linkedPayslipId` is a
  soft text ref (no FK to payslip) — the GL reads payroll, never owns it. Per-entry `currency` (added
  per audit).
- **`notification`** (21D-F) — per-user in-app inbox (type/title/body + soft entity link + readAt).

Migration `0021_handy_mac_gargan.sql` is **purely additive** (5 tables, 4 enums, 13 FKs, zero
destructive ops) and was **verified by applying the full 0000–0021 journal to a throwaway Postgres**
(then torn down). AC unchanged (no router consumes the new resources yet → audit stays 149/18).

## 5. QA / security audit (3 parallel Fable-5 read-only agents)

### Engine audit
- **CRITICAL — `semi_monthly` enum-spelling miss** → **FIXED** (normalize key; test added).
- HIGH — unknown frequency fails open (silent monthly) → *documented*; mitigated because the contract
  enum constrains valid values and normalize now covers them. A fail-closed blocker is recommended.
- HIGH — the fortnightly fixture tests a frequency the **contract enum can't store** (it lists
  weekly/monthly/semi_monthly, **not fortnightly**) while v1 data IS fortnightly → **§6 decision**.
- MEDIUM — cent vs GRA whole-dollar rounding; weekly/semi_monthly integration tests missing → *documented*.
- LOW — child-allowance display formula used un-prorated figure → **FIXED**.
- **Verified clean:** all 6 statutory call sites use the prorated profile; projected-pay inherits the
  fix; negative/zero gross safe; monthly is a true identity.

### Schema audit
- HIGH — roster employee FK `cascade`→`restrict` → **FIXED**.
- MEDIUM — GL entry `currency` column → **FIXED**.
- MEDIUM — no debit/credit/balance CHECKs → *documented* as app-layer invariants for the GL router
  (consistent with house style; the repo uses zero `check()` constraints).
- MEDIUM — posted entries hard-deletable → *documented* (router must forbid delete on posted/reversed).
- LOW — parentAccountId comment vs reality → **FIXED** (real self-FK added).
- **Verified clean:** tenant isolation on all tables; GL guardrail (no payslip FK); migration additive.

### Migration-tooling audit
- HIGH — v1 read-only rests on a session GUC over a read-write account → *documented* (recommend a
  dedicated `SELECT`-only DB role — an operator/infra action, not done autonomously).
- HIGH — table-identifier interpolation in `v1Count` → **FIXED** (`^[a-z0-9_]+$` validation).
- HIGH — production-equality guard fail-open + alias-fragile → **FIXED** (fail-closed + normalized
  host + db-name-alone comparison).
- MEDIUM — disposability heuristic tested whole URL → **FIXED** (tests db name).
- LOW — redact() could leak a password containing `@` → **FIXED** (URL parse).
- **Verified clean:** committed reports are **PII-safe** (only counts/deltas/classifications/opaque
  IDs — no names, emails, salaries, bank/TIN/NIS); **no code path writes to v1 or production v2**;
  registry SQL not injectable; fails closed on missing env.

## 6. What remains before cutover (owner decisions + build)

**Decisions only you can make:**
1. **Fortnightly contract enum.** v1 tenants run fortnightly payroll, but v2's `contract.pay_frequency`
   enum is `weekly | monthly | semi_monthly`. Add `fortnightly` (a small enum migration touching
   schema + zod + UI) before migrating fortnightly employees, or map them to another frequency.
2. **GRA rounding** — confirm whether GRA's calculator uses whole-dollar or cent precision for the
   per-period free-pay (v1 used cents, and the reconciliation matched v1 at cents; GRA *displays*
   whole dollars). Pull the live GRA calculator to lock fixtures byte-for-byte.
3. **GL scope at cutover** — port v1's chart + clean opening balances (recommended) vs export to the
   client's external accountant + archive v1 GL.
4. **Notification history** — port v1's 14 rows or start clean.
5. **Dedicated read-only v1 DB role** (infra) — create a `SELECT`-only Postgres role on
   postgres-central for the migration tooling (defense-in-depth over the session GUC).

**Build remaining (next phases):**
- **Routers + RBAC + verify** for roster / GL / notifications (the C-phase of each — turns the schemas
  into usable, AC-gated features; GL router must enforce the balance/post-immutability invariants).
- **UI** for each (the D-phase).
- **Effective-dating architecture** (21D-A roadmap): resolve rules by pay date, store constants
  annually, per-payslip rule-version audit, contractor/project billing, GRA full-suite tax module.
  Until then the engine is correct-for-2026 but a new budget is still a code/seed change, not a pure
  data update.
- **The write-ETL** (21E): the actual tenant-by-tenant data migration into a real v2 target +
  reconciliation gate, dry-run on Foreign Links first, then Netsurf, then freeze + DNS cutover.

## 7. Gates at report time
`check-types` 3/3 · `build` 2/2 · `audit:permissions` 149/18 · payroll-engine tests **36/36** ·
lint clean on all changed files · migration 0021 applies clean on a fresh DB · `migration:dry-run`
and `migration:reconcile` both produce reports · `migration:reconcile` readiness **READY**
(personal_allowance 46/46 exact). No production writes anywhere in the workstream.

## 8. One-paragraph verdict
The migration is **de-risked and on a sound footing**: we know exactly what v1 holds, we found and
fixed a real payroll-correctness bug (certified against GRA, proven against live client payslips), the
three blocking feature gaps now have audited v2 schemas, and the tooling is read-only-safe and
PII-clean. It is **not yet cutover-ready** — that needs the fortnightly-enum decision, the feature
routers/UIs, the effective-dating architecture for future-proofing, and the write-ETL with its
reconciliation gate. None of those are blocked; they're the next, well-scoped phases.
