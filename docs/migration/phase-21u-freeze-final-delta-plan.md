# Phase 21U — Freeze + Final Delta Load (PLAN ONLY)

**Status: NOT EXECUTED.** This is the plan for the freeze window. Nothing here runs
until the owner explicitly says **"Approve Phase 21U freeze."** Exact commands are
in the [cutover runbook](./v1-to-v2-cutover-runbook.md); the day-of sequence is the
[execution checklist](./cutover-execution-checklist.md).

## Goal

Freeze v1, run the **final delta load** into `heimdallone_v2_prod` so v2 reflects
the latest v1 state (the current load is stale — v1 has stayed live since 21R),
validate, and hand off to Phase 21V (device) → 21W (Pangolin flip).

## Why a delta load is mandatory

`heimdallone_v2_prod` was loaded during 21R and v1 has accepted writes since. A flip
without a fresh load would serve stale data and orphan recent v1 activity. The
write-ETL is **idempotent** (re-running re-derives from v1), so the freeze-time run
brings v2 current from frozen v1.

## Preconditions (all must be true)
- [ ] Owner browser QA completed ([phase-21t-owner-browser-qa](./phase-21t-owner-browser-qa.md))
- [ ] Production config ready ([phase-21u-production-config-preflight](./phase-21u-production-config-preflight.md))
- [ ] Google OAuth v2 callback added
- [ ] Users informed of the downtime/freeze window
- [ ] v1 backup plan ready; v2 restore point plan ready
- [ ] Rollback plan rehearsed (below)
- [ ] v2 side-by-side currently healthy
- [ ] No unresolved code blockers
- [ ] **Owner explicitly approves: "Approve Phase 21U freeze"**

## Freeze execution outline (DO NOT RUN until approved)

1. **Announce freeze** — notify both tenants; begin the maintenance window.
2. **Stop/disable v1 writes** — app-layer freeze + `ALTER DATABASE karetech_erp SET default_transaction_read_only = on;` Confirm no new writes.
3. **Backup v1** — `pg_dump karetech_erp` (read-only).
4. **Backup v2** — `pg_dump heimdallone_v2_prod` (restore point before the delta load).
5. **Final dry-run** — `migration:dry-run` against frozen v1 → 0 feature gaps.
6. **Final reconcile** — `migration:reconcile` → READY 46/46.
7. **Final production write-ETL** — re-run the load into `heimdallone_v2_prod`
   (pilot-first order; idempotent) so v2 == frozen v1. Then `migration:attendance-bridge`.
8. **Validate counts** (post-load): organizations, members, users, employees,
   attendance_records, contracts, statutory rows, GL balance/reconcile, no-login
   employees, shift_rules, notifications.
9. **Validate login preservation** — owners=`tenant_owner`, admins=`tenant_admin`
   (not flattened), platform owner cross-tenant, old v1 admin retained;
   credential + Google logins authenticate.
10. **Validate device-sync readiness** — backfill present/idempotent; exception
    queue clear (live device re-point is Phase 21V, not here).
11. **Confirm readiness** for Phase 21V (device + Pi/Gist) → 21W (Pangolin flip).

> Note: the production write-ETL is hard-guarded; the prod target requires the
> reviewed `CONFIRM_PRODUCTION_WRITE` + `PRODUCTION_WRITE_TARGET=heimdallone_v2_prod`
> opt-in (and never `karetech_erp`).

## Rollback plan
- Keep **Pangolin on v1** if any validation fails — no flip.
- Keep v1 frozen only as long as needed; if aborting, lift the read-only freeze so
  the business resumes on v1.
- If the final load fails, **do not flip**; diagnose, restore `heimdallone_v2_prod`
  from the step-4 restore point (or drop + re-load), re-validate before retry.
- **v1 remains the source of truth until the Pangolin flip** (Phase 21W).

## After 21U
- **21V** — biometric device registration in prod + Pi `.env` + Gist script swap.
- **21W** — Pangolin flip `app.heimdallone.com` → v2 (+ `app.../rpc` → API).
- **21X** — monitoring. **21Y** — archive/cleanup v1 (retain read-only for fallback).
