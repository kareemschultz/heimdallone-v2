# Phase 21P — Production Cutover Authorization Packet

**Date:** 2026-06-15 · **Status:** PREPARED — awaiting owner approval ·
**Freeze:** NO-GO · **DNS cutover:** NO-GO · **Production device registration:** NOT performed.

This is the single packet the owner signs to move from **NO-GO → GO**. It contains
(1) the owner/operator decision checklist, (2) the freeze checklist, and (3) the
GO/NO-GO. The exact commands live in the
[cutover runbook](./v1-to-v2-cutover-runbook.md). Background:
[cutover plan](./v1-to-v2-cutover-plan.md) · [21M freeze readiness](./phase-21m-freeze-readiness.md)
· [status report](./PHASE-21-STATUS-REPORT.md).

> **Nothing is executed by this packet.** Preparing it performed **no v1 writes, no
> production v2 writes, no freeze, no DNS change, no production device registration,
> no Gist replacement, and committed no secrets.**

## Technical readiness — GREEN (verified 2026-06-15)

| Gate | Result |
| --- | --- |
| check-types / build / audit | 3/3 · 3/3 · **161/21** |
| lint (`check`) | 191 (≤212 baseline; cutover work added 0 TS) |
| verify:core | all pass |
| transformers / attendance-bridge tests | 38/38 · 15/15 |
| live dry-run (v1 read-only) | **0 feature gaps**; 2 tenants, 23 employees, 69 payslips, 903 punches, 175 roster; statutory review 2 (non-tax) |
| live reconcile (v1 read-only) | **READY** — personal_allowance / NIS emp+employer / child / net **46/46 exact** |
| attendance scratch rehearsal | 1 device, 19 mappings, **901 staged / 901 processed / 0 unmapped**, 499 events → 358 records all day-typed; **idempotent on rerun** |

**The blockers to GO are owner decisions, not code.**

---

## 1. Owner / operator decision checklist

Each row needs an explicit **CONFIRM** (or an alternative) from the named owner.
"Recommendation" is the safe default; nothing is auto-applied.

### Platform owner

- [ ] **PLATFORM_ADMIN_USER_ID** — set to the migrated user id for
  `kareemschultz46@gmail.com` (the cross-tenant platform-owner candidate from the
  migration report). _Recommendation: CONFIRM._ Set as an env/Infisical secret at
  cutover, not in the repo.
- [ ] **Old v1 credential `user.role='admin'` account** — review and **demote** if
  it is not meant to remain a platform admin (it is a separate account from
  kareemschultz). _Recommendation: demote unless intentionally retained._

### Google OAuth

- [ ] **Google sign-in remains allowed like v1** (not owner-only). _Recommendation: CONFIRM._
- [ ] **v2 redirect/callback URL added** to the existing Google OAuth client.
- [ ] **Google client id/secret live in Infisical/config only** — never in the repo or Gist. _CONFIRM._

### No-login / missing-login employees

- [ ] Confirm **which employees remain no-login** (null email, no placeholder —
  the dress rehearsal showed 6 no-login).
- [ ] Confirm **which (if any) require a real email/login before production load**.
- [ ] **No fake emails** — the ETL drops the v1 `migrated-<id>@…invalid` placeholder to null. _CONFIRM._

### Statutory fields (payroll correctness)

- [ ] Accept missing **TIN/NIS/dependent** data **as-is** for cutover (faithful to
  v1 — only 3/23 carry TIN/NIS today), **or** list exactly what must be collected
  first. _Recommendation: accept as-is; collect post-cutover via HR. Child
  allowance already computes from migrated `dependent_children`._

### Excluded v1-bug journals

- [ ] Confirm the **2 bad v1 journals remain excluded** (imbalanced / non-single-sided). _CONFIRM._
- [ ] Confirm the **accountant** will post any corrected opening-balance/adjustment
  journal in v2 via the `gl` router if required. **No balancing entry is fabricated.**

### work_schedules / shift rules

- [ ] Confirm the mapped **`shift_rule`** values are **sufficient for cutover**
  (6/6 v1 work_schedules mapped, 1 unpublished; full row preserved in
  `migration_source_work_schedule`). _Recommendation: CONFIRM._
- [ ] Confirm deeper **split-shift / night-premium arithmetic is post-cutover**
  unless explicitly required now (seams wired, byte-safe; engine ignores until enabled).

### Time-attendance device

- [ ] Device will be **registered in production v2 during cutover** (not before). _CONFIRM._
- [ ] Pi `.env` updated at cutover with **HEIMDALL_API_URL / HEIMDALL_DEVICE_ID /
  HEIMDALL_API_KEY**.
- [ ] **Existing Gist auto-update mechanism reused** (code only). _CONFIRM._
- [ ] **v1 script copy kept as rollback** before replacing the Gist. _CONFIRM._
- [ ] **No secrets in the Gist.** _CONFIRM._

### Cutover order

- [ ] **Foreign Links pilot first, then Netsurf**, _or_ both tenants in the same
  freeze window. _Recommendation: pilot first (the write-ETL already loads Foreign
  Links first; isolation proven)._

---

## 2. Freeze checklist (execution order)

Run only after every §1 row is confirmed and the owner approves. Commands:
[runbook](./v1-to-v2-cutover-runbook.md).

**Pre-freeze backups**
- [ ] v1 DB backup (`pg_dump`, read-only)
- [ ] v2 production DB backup / restore point (before any load)
- [ ] Infisical export/check (migration + Google OAuth + device secrets present)
- [ ] Current Gist v1 script backup (rollback artifact)
- [ ] DNS current records exported/screenshotted

**Freeze**
- [ ] Freeze announcement + downtime window communicated
- [ ] v1 set read-only / maintenance mode; confirm no new writes

**Final read-only checks (against frozen v1)**
- [ ] Final live v1 dry-run → 0 feature gaps
- [ ] Final live v1 reconcile → READY 46/46

**Production load** ⛔ owner-approved only
- [ ] Final production v2 migration apply (after restore point)
- [ ] Final production write-ETL (approved order; via the reviewed prod-write path)

**Post-load validation**
- [ ] Post-load reconcile stays READY 46/46
- [ ] GL balance per tenant (debit == credit); tenant isolation; statutory rows;
  no-login null-email; contracts/pay-frequency; roster; shift_rules; notifications;
  source-JSON staging
- [ ] Platform-owner login test (cross-tenant switch works)
- [ ] Tenant owner/admin login test (roles intact — not flattened to employee)
- [ ] Employee login test
- [ ] Google login test (migrated Google account authenticates)
- [ ] First-login modal acknowledgement test (required, then clears)
- [ ] Payroll smoke test (historical payslip immutable; draft current-period run matches reconcile)

**Device sync cutover** ⛔ owner-approved only
- [ ] Register the biometric device in production v2
- [ ] Update Pi `.env` (API URL / device id / ingest key)
- [ ] Replace the Gist script content with the v2-native script (code only)
- [ ] Biometric punch smoke test
- [ ] Unmatched-punch queue check

**Cutover**
- [ ] GL balance re-check after first postings
- [ ] DNS switch (only after all smoke tests pass + owner approval)
- [ ] Post-cutover monitoring (error rates, first live payroll, auth for migrated logins, backups)

**Rollback criteria** — reconcile not READY · GL/isolation failure · any smoke
test fails · unmatched punches persist · unexpected production write detected.
**Rollback steps** — DNS back to v1 · lift v1 freeze · restore v2 pre-freeze
snapshot · restore v1 Gist script + restart bridge · capture evidence, fix,
re-rehearse on scratch. (Commands in the runbook §11.)

---

## 3. GO / NO-GO

| Decision | State | Gate |
| --- | --- | --- |
| Technical readiness | **GREEN** | all gates pass; rehearsal passed |
| Live write-ETL scratch rehearsal | **GO** | proven 2026-06-15 |
| **Freeze** | **NO-GO** | pending owner sign-off on every §1 row |
| **Production write-ETL** | **NO-GO** | needs approval + the reviewed prod-write enablement |
| **DNS cutover** | **NO-GO** | none performed |
| **Production device registration** | **NO-GO** | deferred to cutover by design |

**Path to GO:** owner confirms §1 → schedule the freeze window → execute §2 via the
runbook → if all green, DNS switch; else rollback.
