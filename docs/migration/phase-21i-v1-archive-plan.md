# Phase 21I — v1 Archive Plan (PLAN ONLY — do NOT execute without owner approval)

> Status: **PLAN ONLY.** v1 (`heimdallone.git@d03e5b4`, DB `karetech_erp`, containers
> `heimdallone-{server,web,admin,fumadocs}`) remains LIVE for rollback. Nothing in
> this document is to be executed until the owner explicitly approves, after a
> clean monitoring window. This closes the planning side of the Next-Phase-Plan
> Phase I; it does not archive anything.

## Preconditions before archiving (all must hold)

1. **Monitoring window clean** — v2 (`app.heimdallone.com`) stable for an agreed
   window (recommend ≥ 2 weeks) with no rollback events.
2. **Phase D done** — the on-site Pi posts attendance to v2
   (`/rpc/biometric/ingest/submit`), the production device is registered in v2,
   and the final v1→v2 attendance delta has been backfilled (see Phase H / 21V).
   Until then v1 is still the live attendance sink and must NOT be archived.
3. **Owner sign-off** — explicit written approval naming the archive date.
4. **Backups verified restorable** — a test restore of the v1 dump into a scratch
   DB has succeeded (a backup you have never restored is a hope, not a backup).

## What to keep (retain, do not delete)

- **v1 DB logical dump** — `pg_dump -Fc karetech_erp` to cold storage (≥ 2 copies,
  one off-box). This is the legal/historical record (payslips, audit, GL).
- **v1 Docker images** — retain the `sha-d03e5b4` images
  (`heimdallone-{server,web,admin,fumadocs}`) in GHCR + locally for emergency
  rollback through the retention window.
- **v1 volumes** — snapshot any bind-mounts / named volumes before teardown.
- **DNS / Pangolin config snapshot** — the current routing so a rollback can be
  reconstructed.

## Archive sequence (when approved)

1. **Announce** a maintenance note; freeze v1 writes (it should already be
   write-quiet except the Pi, which Phase D moves to v2).
2. **Final v1 backup** — fresh `pg_dump -Fc` + volume snapshots to cold storage;
   record checksums.
3. **Test-restore** the final dump into a scratch DB; sanity-check row counts
   (employees / payslips / journals) against the last reconciliation.
4. **Stop** v1 containers (`docker stop`, do NOT `rm` yet) — observe for an agreed
   cool-down (recommend 72 h) with v2 live.
5. **Decommission** — after cool-down with no rollback need: `docker rm` the v1
   containers, remove the v1 stack from the compose/Pangolin config, free the
   ports. Keep images + dumps in cold storage per retention.
6. **Document** the archive date, who approved, what was kept, what was shut down,
   and the restore procedure, in this file.

## Rollback (until the archive cool-down completes)

- v1 images + DB are intact → re-point DNS/Pangolin back to the v1 stack and
  start the `sha-d03e5b4` containers. `karetech_erp` is untouched by v2 (v2 uses
  `heimdallone_v2_prod`), so v1 is a clean rollback target.

## Retention (recommended)

- v1 logical dump + volume snapshots: **≥ 7 years** (payroll/statutory records).
- v1 images: through the monitoring + cool-down window, then archive to cold
  registry storage (not hot disk — the build host is at ~85% disk).

## Hard rules (unchanged)

NO v1 DB writes · NO destructive archive without owner approval · keep rollback ·
no secrets in this doc · v2 (`heimdallone_v2_prod`) is the source of truth for all
data except live attendance until Phase D completes.
