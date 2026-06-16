# Live Cutover Execution Checklist (day-of)

**Use this on the scheduled freeze day.** It is the time-sequenced, gated version of
the [cutover runbook](./v1-to-v2-cutover-runbook.md). Decisions are locked in
[Phase 21Q](./phase-21q-decision-lock-and-dry-run.md); authorization in the
[21P packet](./phase-21p-cutover-authorization.md).

> **Gates.** Every step marked 🛑 **STOP — owner confirm** must pause for explicit
> owner approval before proceeding. The 🛑 steps are: pre-freeze backups, freeze,
> production migration apply, production write-ETL, device registration, Gist
> replacement, and DNS switch. Steps marked ✅ are non-destructive (read-only or
> scratch) and safe to run any time.
>
> **Where each step runs.** ✅ read-only steps can run from any environment with the
> read-only v1 credentials. 🛑 production steps run **on the production deployment
> infrastructure with the owner present** — not from a developer session.

## Roles present
- **Owner / Platform owner** — gives each 🛑 go; performs device registration + DNS.
- **Operator** — runs the backup + load + verification commands on prod infra.
- **HR / Payroll** — runs the post-load smoke tests.

## Timeline

### T-24h — Final rehearsal & comms ✅
- [ ] ✅ Confirm gates green (check-types / build / audit / verify:core).
- [ ] ✅ Run the [21Q dry-run walkthrough](./phase-21q-decision-lock-and-dry-run.md) once more on scratch — must be all-green.
- [ ] Send the maintenance-window notice to both tenants.
- [ ] Confirm the reviewed **production-write enablement** is ready (the write-ETL is scratch-guarded by design; production needs the approved enablement).

### T-0 — Preflight (no writes) ✅
- [ ] ✅ `git` clean + HEAD == origin/master at the intended release SHA.
- [ ] ✅ Read-only verify: v1 role is SELECT-only.
- [ ] ✅ Final live **dry-run** → feature gaps 0.
- [ ] ✅ Final live **reconcile** → READY 46/46.

### T+0 — Backups 🛑 STOP — owner confirm
- [ ] 🛑 Back up live v1 (read-only `pg_dump`).
- [ ] 🛑 Take a production v2 **restore point** (before any load) — record the restore command + id.
- [ ] 🛑 Verify Infisical has migration + Google OAuth + device secrets.
- [ ] 🛑 Back up the current **Gist** v1 device script (rollback artifact).
- [ ] 🛑 Export current **DNS** records.

### T+0:15 — Freeze 🛑 STOP — owner confirm
- [ ] 🛑 Announce downtime is starting.
- [ ] 🛑 Set v1 **read-only / maintenance mode**; confirm no new writes arrive.

### T+0:20 — Final checks against frozen v1 ✅
- [ ] ✅ Final dry-run against frozen v1 → 0 gaps.
- [ ] ✅ Final reconcile against frozen v1 → READY 46/46.

### T+0:30 — Production load 🛑 STOP — owner confirm (per step)
- [ ] 🛑 Apply migrations to **production v2** (after the restore point).
- [ ] 🛑 Run the **production write-ETL** in the locked order: **Foreign Links pilot first, then Netsurf** (via the reviewed prod-write enablement).

### T+1:00 — Post-load validation ✅
- [ ] ✅ Reconcile against the loaded set → READY 46/46.
- [ ] ✅ GL balance per tenant (debit == credit); tenant isolation; 23 statutory rows; **6 no-login** (null email, no placeholders); contracts/pay-frequency; roster; shift rules; notifications; source-JSON staging.
- [ ] ✅ Roles intact — owners are owners, admins are admins (not flattened); platform owner can switch tenants; **old v1 admin retained** per the lock.

### T+1:10 — Deploy v2 app side-by-side ⛔ STOP — owner confirm (no routing change)
- [ ] 🛑 Start the v2 containers against `heimdallone_v2_prod` (Pangolin stays on v1): `docker compose -f deploy/docker-compose.v2.yml --env-file deploy/.env.v2 up -d`. See [docker-deployment](../operations/docker-deployment.md).
- [ ] ✅ `curl /health` (server) + `/docs` (docs) return 200. **NB: web `/` SSR has an open app-level bug (Route.update) — fix before web cutover; server + docs images are ready.**

### T+1:15 — Smoke tests ✅
- [ ] ✅ Platform-owner login (cross-tenant switch).
- [ ] ✅ Tenant owner/admin login.
- [ ] ✅ Employee login + the one-time first-login welcome notice appears and is required.
- [ ] ✅ Google sign-in (a migrated Google user authenticates).
- [ ] ✅ Payroll: a historical payslip is immutable; a draft current-period run matches reconcile.

### T+1:30 — Device cutover 🛑 STOP — owner confirm (per step)
- [ ] 🛑 Register the biometric terminal in **production** v2; copy device id + one-time ingest key.
- [ ] 🛑 Update the Pi `.env` (API URL / device id / ingest key) — secrets stay on the Pi.
- [ ] 🛑 Replace the **Gist** `heimdallone_sync.py` content with the v2-native script (code only).
- [ ] ✅ Confirm first punch arrives; check the unmatched-punch / exception queue.

### T+1:45 — DNS cutover 🛑 STOP — owner confirm
- [ ] 🛑 Only after **all** smoke tests pass: switch DNS to v2; monitor propagation.

### T+2:00 — Monitor ✅
- [ ] ✅ Error rates/latency; first live payroll vs reconcile baseline; GL trial balance; auth for migrated logins; backups succeeding.

## Rollback (any failed check)
**Criteria:** post-load reconcile not READY · GL imbalance / tenant-isolation failure
· any smoke test fails · unmatched punches persist · unexpected production write.
**Steps:** DNS back to v1 → lift the v1 read-only freeze → restore the v2
pre-freeze snapshot (discard the partial load) → restore the v1 script into the Gist
+ restart the bridge → capture PII-safe evidence, fix, re-rehearse on scratch.
(Exact commands: runbook §11.)
