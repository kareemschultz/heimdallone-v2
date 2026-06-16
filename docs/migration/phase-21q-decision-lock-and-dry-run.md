# Phase 21Q — Final Owner Decision Lock + Cutover Dry-Run Walkthrough

**Date:** 2026-06-15 · **Owner decisions:** LOCKED (this doc) · **Technical
readiness:** GREEN · **Freeze:** NO-GO · **DNS cutover:** NO-GO · **Production
write-ETL:** NO-GO (no execution performed).

Locking the owner decisions removes the documented blockers from the
[21P authorization packet](./phase-21p-cutover-authorization.md). It does **not**
authorize execution — freeze/DNS/production-write still require the owner's explicit
"execute now" at the scheduled window.

> No v1 writes · no production v2 writes · no freeze · no DNS cutover · no
> production device registration · no Gist replacement · no secrets committed. The
> walkthrough ran read-only against live v1 and wrote only to a disposable scratch
> database.

---

## Part A — Owner decision lock

### Locked this phase (owner, 2026-06-15)

| # | Decision | **Locked choice** |
| --- | --- | --- |
| 1 | Statutory data (TIN/NIS/dependents) | **Accept as-is, collect after go-live.** Reconciliation is READY 46/46; dependents already drive child allowance; HR collects missing TIN/NIS post-cutover. |
| 2 | No-login employees (6, null email) | **Keep no-login for now.** Paid and tracked; add a real email + invite later if any need access. No placeholder emails. |
| 3 | Cutover order | **Foreign Links pilot first, then Netsurf.** (Write-ETL already loads Foreign Links first; isolation proven.) |
| 4 | Platform admin | **kareemschultz46@gmail.com = platform owner; KEEP the old v1 credential admin too** (owner chose to retain it as a second platform admin — not demoted). |

### Already locked in earlier turns (recorded here for completeness)

| Decision | Locked choice |
| --- | --- |
| Google sign-in | **Allowed like v1** (not owner-only); v2 redirect URL added to the existing Google client at cutover; Google secrets stay in Infisical/config only. |
| Device sync | **Register the terminal in production at cutover; reuse the existing Gist auto-updater (code only); keep a v1-script copy for rollback; no secrets in the Gist.** |
| Excluded v1-bug journals | **Remain excluded** (2 imbalanced/non-single-sided). No balancing entry fabricated; the accountant posts a corrected opening/adjustment entry in v2 via the GL if required. |
| work_schedules / shift rules | **Mapped `shift_rule` values are sufficient for cutover**; deeper split-shift/night-premium arithmetic is post-cutover unless explicitly required. |

All §1 rows of the 21P packet are now resolved.

---

## Part B — Cutover dry-run walkthrough (executed 2026-06-15)

Ran the safe sections of the [cutover runbook](./v1-to-v2-cutover-runbook.md)
end-to-end. Production-write / device / DNS sections were **not** run.

### Step 0 — Preflight (gates, this session)
check-types 3/3 · build 3/3 · audit 161/21 · lint 191 (≤212) · verify:core all
pass · transformers 38/38 · attendance-bridge 15/15 · docs build exit 0.

### Step 1 — Read-only verification + live dry-run + live reconcile
- **v1 read-only:** `migration_reader` is SELECT-only (no login-superuser); the loader
  also sets `default_transaction_read_only = on`.
- **Dry-run:** 2 tenants · 23 employees · 69 payslips · 903 attendance punches · 175
  roster · 13 GL journals · 14 notifications · **feature gaps 0** · statutory review 2
  (non-tax: company_id, kiosk_pin_hash).
- **Reconcile: READY** — personal_allowance / NIS employee / NIS employer / child /
  net **46/46 exact**; PAYE brackets 45 exact + 1 rounding. Netsurf 66 payslips (42
  exact, 1 rounding, 23 v1-bug excluded); Foreign Links 3/3 exact.

### Step 2 — Production-load sequence rehearsed on disposable scratch
Drop → recreate → apply migrations (**125 tables**) → ensure **8** source-staging
tables → write-ETL from live v1 in the locked **pilot-first** order:
- **Foreign Links Auto Spares** (loaded first): 3 employees, 3 contracts (3
  fortnightly), 0 roster, 0 journals (balanced), 0 notifications.
- **Netsurf Group of Companies:** 20 employees, 15 contracts (14 fortnightly), 175
  roster, 11 journals (balanced), 14 notifications.
- Result: 2 tenants, **GL balanced = true, isolation = true.**

### Step 3 — Attendance backfill + post-load verification
- **Attendance-bridge:** 1 device, **19 mappings**, **901 punches staged**
  (dup-on-rerun 0 = idempotent, unmatched-emp 0), **901 processed / 0 unmapped**,
  **499 events → 358 records all day-typed.**
- **Post-load counts (scratch):** 2 orgs · 23 employees · **6 no-login (null email)**
  · **23 statutory rows (3 TIN, 3 NIS — faithful to v1)** · 18 contracts (17
  fortnightly) · 6 shift_rules · GL accounts/journals present · 14 notifications.
- **GL balance:** Netsurf debit == credit == **1,204,726.65** (balanced); Foreign
  Links has no v1 journals.
- **Tenant isolation:** Foreign Links 2 members, Netsurf 23 members — no
  cross-tenant leakage.

### Step 4 — Safety proof (no v1 / production writes)
- Source-staging tables: scratch **8**, dev `Heimdallone` **0**, v1 `karetech_erp`
  **0**.
- v1 `karetech_erp` has **0** v2 tables (read-only throughout).
- dev `Heimdallone` `import` attendance punches = **1** (a pre-existing seed
  fixture, deviceUserId 9001), vs **901** written to scratch this run — proving the
  load targeted scratch only.

---

## GO / NO-GO after 21Q

| Item | State |
| --- | --- |
| Owner decisions | **LOCKED** ✅ |
| Technical readiness | **GREEN** |
| Cutover dry-run walkthrough | **PASSED** ✅ |
| **Freeze** | **NO-GO** — awaiting owner's explicit "execute" at the scheduled window |
| **Production write-ETL** | **NO-GO** — needs the reviewed prod-write enablement (scratch guard blocks prod by design) |
| **DNS cutover** | **NO-GO** — none performed |
| **Production device registration** | **NO-GO** — at cutover only |

**Path to GO:** schedule the freeze window → run the runbook's backup +
production-load sections under owner supervision → post-load checks (as rehearsed
above) → smoke tests → DNS switch; otherwise roll back.
