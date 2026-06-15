# Phase 21 — v1 → v2 Migration Workstream: Status Report & Audit

**Date:** 2026-06-14 (updated after 21G + 21K; original body 2026-06-13)
**Prepared for:** owner review (autonomous session)
**Repo state at report time:** `HEAD == origin/master == d0b14294c55ce7a1e759a0d7c363549e14d8040a`, tree clean.
**Source of truth for payroll math:** GRA (gra.gov.gy) — see [[reference-gra-payroll]].

> **2026-06-14 update — see §10 (Phase 21G effective-dating ✅ COMPLETE) and §11 (Phase 21K
> live write-ETL rehearsal ✅ PASSED) appended at the end for current state.** §1–§9 below are
> the 2026-06-13 record through 21F and remain accurate as of that point in time.

> Honest framing up front: the **migration discovery, the payroll-correctness fix, the v2 data
> homes, the feature routers (roster/GL/notifications), the fortnightly-first-class work, and a
> proven write-ETL path are now done and gated**. The **live cutover itself is not done** — it needs
> the write-ETL run against the *real* v1 DB (requires the infra read-only role + Infisical creds),
> the module UIs, and the operator decisions in §6. Nothing in this workstream wrote to v1 or to
> production v2; all DB writes went to disposable throwaway Postgres containers.

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
| 21D fortnightly | First-class pay frequency (canonical module + enum 0022 + UI + drift guard) | `7e9bdd2` |
| 21D-D roster API | `roster` router + RBAC + `verify:roster` 68/68 | `cefceb1` |
| 21D-E GL API/import | `gl` router (accounts/journals, balance + post-immutability + reversal) + `verify:gl` 64/64 | `bd8e35d` |
| 21D-F notifications API | `notifications` router (per-user inbox) + emit helper + `verify:notifications` 49/49 | `78705a9` |
| 21E write-ETL | scratch-only tenant load (Foreign Links → Netsurf), GL-balanced, isolated; transformers 19/19 | `fff2b74` |

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

**Decisions only you can make (status updated 2026-06-13):**
1. ✅ **RESOLVED — Fortnightly contract enum.** `fortnightly` is now first-class: a single canonical
   `pay-frequency.ts` module feeds the DB enum (migration `0022`), Zod validation, UI labels, and the
   engine, with a CI drift guard (`verify:pay-frequency`). The write-ETL normalizes v1 free-text
   (`"Fortnightly"`, `"Bi-Weekly"`) → the canonical `fortnightly` value and refuses (throws) on
   anything unmappable — no silent default.
2. **OPEN — GRA rounding** — confirm whether GRA's calculator uses whole-dollar or cent precision for
   the per-period free-pay (v1 used cents, and the reconciliation matched v1 at cents; GRA *displays*
   whole dollars). Pull the live GRA calculator to lock fixtures byte-for-byte.
3. **OPEN — GL scope at cutover** — port v1's chart + clean opening balances (recommended) vs export
   to the client's external accountant + archive v1 GL. (The GL API now supports both: account/journal
   import + balanced posting + reversal.)
4. **OPEN — Notification history** — port v1's 14 rows or start clean. (The notifications API + ETL
   mapper support import either way.)
5. **OPEN — Dedicated read-only v1 DB role** (infra) — create a `SELECT`-only Postgres role on
   postgres-central + load its creds from Infisical so `migration:dry-run` / `migration:reconcile`
   and the **live** write-ETL can run. This is the gating blocker for the real-data cutover run.

**Build remaining (next phases):**
- ✅ **DONE — Routers + RBAC + verify** for roster / GL / notifications. All three are AC-gated
  (audit 161/21), two-layer authz, db-free verify scripts (roster 68 / GL 64 / notifications 49). The
  GL router enforces balance + post-immutability + reversal-as-counter-entry; zero payroll writes.
- ✅ **DONE — write-ETL path (21E), proven against scratch.** Tenant-by-tenant transform → load → FK
  integrity → GL-balance → cross-tenant isolation, Foreign Links pilot first then Netsurf, PII-safe
  report, zero production writes. **Remaining:** swap the synthetic source for the v1-readonly loader
  and run against the *real* v1 DB (gated on decision #5), then freeze + DNS cutover.
- **OPEN — UI** for roster / GL / notifications (the D-phase of each).
- **OPEN — Effective-dating architecture** (21D-A roadmap): resolve rules by pay date, store constants
  annually, per-payslip rule-version audit, contractor/project billing, GRA full-suite tax module.
  Until then the engine is correct-for-2026 but a new budget is still a code/seed change, not a pure
  data update.

## 7. Gates at report time
`check-types` 3/3 · `build` 2/2 · `audit:permissions` **161/21** · payroll-engine tests **47/47** ·
`verify:pay-frequency` clean · `verify:roster` **68/68** · `verify:gl` **64/64** ·
`verify:notifications` **49/49** · write-ETL transformers **19/19** · lint clean on all changed files ·
migrations **0000–0022** apply clean on a fresh throwaway DB (23 applied) · **`migration:write-etl`
loads 2 isolated tenants to scratch, GL balanced=true, isolation=true** · `migration:reconcile`
readiness **READY** (personal_allowance 46/46 exact). `migration:dry-run` / `migration:reconcile`
need live `V1_DATABASE_URL` to re-run (unreachable this session; last green reports committed).
**No production writes anywhere in the workstream.**

## 8. One-paragraph verdict
The migration is **de-risked, built, and proven end-to-end against scratch**: we know exactly what v1
holds, we found and fixed a real payroll-correctness bug (certified against GRA, proven against live
client payslips), the three blocking feature gaps now have audited v2 **schemas + AC-gated routers**,
pay frequency is **first-class** (fortnightly included, with a drift guard), and the write-ETL
transforms + loads v1-intent data into a real v2 schema with GL balance and tenant isolation holding.
It is **not yet live-cutover-ready** — that needs exactly one infra unblock (a read-only v1 DB role +
Infisical creds, §6.5) to run the ETL/reconcile against the *real* v1 data, plus the module UIs and
the effective-dating architecture for future budgets. None of those are blocked by code; they're the
next, well-scoped steps.

---

## 10. Phase 21G — Effective-dating ✅ COMPLETE (2026-06-14)

Statutory rules now resolve by the **event date** (pay date / leave-request date / work date),
not by a mutable `isActive` flag. Commits `db0c25d → 324b8d9 → cdeeb4e → 39954c8 → 9fd14eb →
f6524e9` (all pushed). **No new AC pair across 21G → audit stays 161/21.**

| Sub-phase | Delivered | Proof |
| --- | --- | --- |
| 21G-C payroll resolve-by-pay-date + run pin | pure `resolveAsOf` core; run pins profile + `ruleVersionLabel`; generation honors pin | engine 12 unit + `verify:payroll-resolver` 8/8 |
| 21G-D leave resolve-by-request-date + server days (H10) | `resolveLeavePolicyAsOf` (no migration); `countLeaveDays` server-authoritative | `verify:leave-resolver` 13/13 |
| 21G-E workweek/weekend classifier | `classifyDayType` reads tenant `weekendDays` + holidays | `verify:workweek` 13/13 |
| 21G-G historical payslip correction (API) | preview/apply/list/getById; original IMMUTABLE (back-pointer only); GL adjustment = obligation, payroll never writes ledger | `verify:payslip-correction` 11/11 |
| 21G-F UI | payslip original→corrected panel + run rule-version label | web tsc baseline unchanged |
| 21G-I QA | independent adversarial review — all 7 categories CLEAN | `docs/reviews/phase-21g/` |

## 11. Phase 21K — Live v1 → v2 scratch write-ETL rehearsal ✅ PASSED (2026-06-14)

Commit `d0b1429`. Ran the write-ETL end-to-end against **real v1 data** into a disposable scratch
DB. Full record: `docs/migration/phase-21k-live-write-etl-rehearsal.md`.

- **Hard rules honored:** NO v1 writes (read-only session), NO production v2 writes, NO freeze,
  NO DNS cutover, no secrets in files/commits (v1 cred in gitignored `.env.migration`).
- **Live v1 dry-run: PASS** — 101 tables classified (read-only).
- **Live v1 reconcile: READY** — personal_allowance / NIS-emp / NIS-employer / child / net_identity
  **46/46 exact**, PAYE 45 exact + 1 rounding; 21G did not regress reconciliation.
- **Scratch target:** `heimdallone_v2_migration_scratch` (guards held) — **24 migrations through
  `0023_effective_dating` → 129 public tables**.
- **Records read from v1:** 23 employees / 29 users / 33 assignments / 11 accounts / 13 journals /
  53 lines / 14 notifications / 175 roster / 6 schedules / 69 payslips / 891 punches.
- **Records written to scratch:** 2 orgs, 15 users, 15 members, 23 employees, 18 contracts (17
  fortnightly), 6 shifts, 175 roster, 10 GL accounts, 11 journals / 47 lines, 6 notifications.
- **Source-JSON staged** (no v2 app-table home yet): 69 payslips · 891 attendance punches · 6
  work_schedules.
- **Excluded mappings (2, by design):** 2 v1-quality journals (imbalanced / non-single-sided
  line). *(Follow-up `dc79885`: v1 `revenue`→v2 `income` account-type mapping recovered the
  previously-excluded account → 11/11 accounts migrate; full v1 employee rows now staged in
  `migration_source_employee` JSONB, preserving the 11 statutory fields losslessly.)*
- **Manual-review items:** 11 statutory fields; 6 employees missing v1 email → deterministic
  `migrated-<id>@migrated.invalid` placeholders; 1 GL account type + 2 journals; work_schedules
  richness (night-diff/split-shift/Saturday/OT) staged as source JSON.
- **GL balance: PASS** (Netsurf debit == credit == 1,204,726.65). **Tenant isolation: PASS**
  (20 Netsurf + 3 Foreign Links, no cross-tenant rows). **PII scan: PASS** (no names/emails/
  salaries/bank/TIN/NIS in any report).
- **Effective-dating / correction compatibility:** scratch carries the 0023 columns
  (`effective_from/to`, `is_published`, `weekend_days`, `rule_version_label`) + `payslip_correction`
  table — migrated data is schema-compatible with 21G.
- **Go / No-Go:** live write-ETL rehearsal **GO ✅**; **freeze NO-GO**; **DNS cutover NO-GO (and
  none performed).**

## 12. Phase 21L — Statutory fields · no-login policy · journal handoff · dress rehearsal ✅ COMPLETE (2026-06-14)

Closes the four §11 manual-review items + a full-data dress rehearsal. Doc:
`phase-21l-statutory-nologin-journal-handoff.md`.

- **21L-A statutory fields:** new `employee_statutory` satellite (migration `0024`) homes
  TIN→`tax_identification_number`, NIS→`social_security_number`, `qualifying_children`→`dependent_children`,
  second-job (+pay), medical (on-file/payroll-deduction/external-premium), other-deductions. `hrCore.employees.statutory.{get,update}`
  (TIN/NIS masked for non-payroll, edit HR/payroll-only) — **reuses `employee` AC → audit stays 161/21**.
  **Wired `dependent_children` into `payroll-input-builder` (was hardcoded `0`)** so child allowance computes from real data.
  `mapStatutory` mapper + 4 new transformer tests.
- **21L-B no-login policy:** `employee_profile.email` now NULLABLE (migration `0024`); mapper drops the fake
  `migrated-<id>@migrated.invalid` placeholder (→ null); `employeeCreate/Update` accept null email; detail UI shows `— (no login)`.
- **21L-C journal handoff:** full v1 GL (entries + lines) staged in `migration_source_journal[_line]` for
  accountant review; **the 2 v1-bug journals stay excluded — no balancing entry is ever fabricated**; corrected
  opening-balance entry is the accountant's call via the `gl` router post-cutover.
- **21L-D work_schedules richness:** plan `docs/architecture/work-schedules-richness-plan.md` (effective-dated
  per-shift `shift_rule` satellite, engine seams) — **plan only**, scheduled as Phase 21J; data preserved losslessly.
- **21L-E full-data dress rehearsal:** fresh scratch (25 migrations / 132 tables) ← live v1. **23/23 statutory rows,
  6 no-login employees, 13/53 GL staged, 11 balanced journals loaded, isolation PASS.** Live reconcile **READY,
  personal_allowance + NIS + child + net 46/46 exact (NO regression)**; dry-run statutory review **11 → 2** (only
  `company_id` + `kiosk_pin_hash`, neither a tax field).
- **Gates:** check-types 3/3 · build 3/3 · audit 161/21 · transformers 23/23 · engine 59/59 · changed files lint-clean.
- **Hard rules held:** no v1 writes · no prod v2 writes · no freeze · no DNS cutover · no secrets committed.

## 13. Phase 21J — Work-schedule richness build ✅ COMPLETE (2026-06-14)

Tenant-configurable, effective-dated v2 home for v1 `work_schedules` pay policy.
Doc: `phase-21j-work-schedule-richness.md`. **audit STAYS 161/21** (reuses the
`roster` AC resource).

- **Schema (0025_many_warstar):** `shift_rule` (org + optional shift; null shiftId =
  org-default; `[effectiveFrom,effectiveTo)` + isPublished; partial-unique indexes).
  Carries split shift, night-diff window+multiplier, Saturday/Sunday/holiday +
  weekday-OT multipliers, OT daily/weekly thresholds, grace late/early, auto-break,
  standard daily/weekly minutes, flexi, daily cap, per-shift workDays. Most columns
  nullable → inherit org fallback (no-rule tenant byte-compatible).
- **Resolver:** `resolveScheduleConfig` — shift-specific → org-default → org settings
  → built-in defaults, by work date. `verify:shift-rule-resolver` 29/29.
- **API:** `roster.scheduleRules.{list,getById,resolve,create,update,archive}`; manage
  narrowed to admin/HR/payroll (managers do assignments, not pay policy).
  `verify:shift-rule-api` 32/32.
- **Seams:** attendance recalc consumes grace/standard/auto-break/cap (byte-compatible);
  payroll builder resolves by pay date + carries `ScheduleRuleInput` (engine ignores →
  reconcile exact); roster never writes payroll.
- **ETL:** `mapShiftRule` (night num/den→decimal, archived→unpublished, no-target fields
  preserved in source JSON). Live rehearsal: **6/6 work_schedules mapped, 0 orphans**,
  dry-run gaps **6→5** (work_schedules CLEARED), reconcile **READY 46/46 (no regression)**.
- **Docs:** Fumadocs `time/work-schedules.mdx`.
- **Deferred:** deeper split-shift/night-premium attendance arithmetic + engine per-shift
  multiplier consumption (seams exist) + shift-rule admin UI.

### Immediate next step (supersedes §9 / §11)
Operator sign-off on the residual items — real emails for any of the 6 no-login employees intended to have
logins, accountant treatment of the 2 excluded journals, and the Phase 21J work_schedules richness build if those
pay rules are needed at cutover — then freeze + DNS cutover. **Code is not blocking; the remaining gaps are
operational/data decisions.**
