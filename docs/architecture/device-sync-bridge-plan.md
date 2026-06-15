# Phase 21O — Biometric / Time-Attendance Device Sync Bridge (spec)

**Status:** 21O-A spec (docs-only) · **Audience:** developer/operator · **Date:** 2026-06-15

Bring the site's existing time-attendance terminal into v2 safely before cutover.
v2 already has the full landing pipeline (Phase 11 Biometric + Geofencing), so this
is an **adapt + backfill + verify**, not a new system.

> Hard rules (in force): no v1 writes · no production v2 writes before cutover
> approval · no freeze · no DNS cutover · no secrets committed · preserve raw
> punch/source data · do not fabricate attendance · device sync NEVER writes
> payroll directly (punches → events → records → payroll, gated by `payrollStatus`)
> · timezone explicit · sync idempotent and safe to rerun.

## 0. Corrected device identity (DO NOT trust v1's label)

v1 stored `attendance_devices.device_type = 'zkteco_k40'` — **this is wrong** (a
default label). The live unit at `10.241.1.109:4370` ("K40 – Netsurf Reception"),
interrogated over the ZK protocol with `pyzk`, reports:

| Field | Value |
| --- | --- |
| Serial | `PCY7012600500` |
| Platform | `ZLM60_TFT` (ZKTeco firmware platform, older standalone TFT terminal) |
| Firmware | `Ver 6.60 (Sep 19 2019)` |
| Device name | (blank — never set) |
| Algorithms | fingerprint `fp_ver 10` (ZKFinger v10) + face `face_ver 7` (ZKFace v7) |
| Enrolled | 19 users · 14 fingerprints · 0 faces |
| On-device logs | 694 (≈ the 687 `source='device'` punches in v1 — the device buffer the Pi reads) |
| MAC | unavailable (fw 6.60 doesn't answer `get_mac`) |
| Transport | TCP 4370, ZK protocol — pyzk connects |

**Conclusion:** it is a **ZKTeco-protocol** fingerprint+face terminal → v2
`vendor: "zkteco"`, `deviceType: "zkteco"`, `model: "ZLM60_TFT / fw 6.60"`,
`supportedPunchMethods: ["fingerprint","face","pin"]` (actual enrolment is
fingerprint). The model line is cosmetic; the bridge keys off the ZK protocol,
which is proven working. Spec stays device-agnostic (provider-based) so a
different/replacement unit needs only a different adapter, not a rewrite. **19
device users must be mapped** (vs 14 employees who have punched) → 5
enrolled-not-yet-punching slots will surface in the unmatched/mapping report until
linked.

## 1. How v1 syncs today (verified)

A Raspberry Pi on the site LAN (`admin@netsurf-biometric`, `~/heimdallone-bridge`)
runs a **`pyzk` poller** (v1 `apps/device-bridge/`, both a Bun and a Python
variant). Every ~60s it:

1. connects to the terminal (TCP 4370), `get_attendance()` returns the full log;
2. filters to new records via an on-disk **cursor** (`last_uid`, the device's
   monotonic record id);
3. maps the ZK state code → punch type (0 in / 1 out / 2 break_start / 3 break_end
   / 4 overtime_in / 5 overtime_out);
4. treats the device clock as UTC and **auto-corrects a known GYT clock-drift bug**
   (after power cuts the unit reverts to UTC-4 → a 4h slip; corrected in the 3–5h
   window);
5. POSTs batches (≤500) to `/rpc/attendance/devices/recordBatchFromDevice`,
   authenticated by a **hashed device API key** (Bearer + tenant + device headers).

v1 idempotency = the Pi cursor (skip re-upload) + a DB unique index
`(tenant, employee, punch_at, punch_type)` (`onConflictDoNothing`). Employee match
= the device slot/user-id → `employees.attendanceDeviceId`. **Known v1 bug:** 5/6
insert sites wrote `logical_shift_date = NULL`, making punches invisible to payroll
("everyone 0 days") — only the device path set it; a backfill endpoint fixed it.

## 2. What v2 already has (Phase 11 — reuse, don't rebuild)

- `attendance_device` registry (multi-vendor `zkteco/anviz/cosec/dahua/generic`;
  modes incl. `api_ingest`, `csv_import`; **API key stored hashed**, `lastSyncCursor`
  watermark, `timeZone` default `America/Guyana`, `clockOffsetSeconds` drift).
- `attendance_punch` raw staging — **`idempotencyKey` UNIQUE per org**
  (`dev|deviceId|deviceUserId|epoch`), `rawPayload` JSONB, `processingStatus`
  (pending/processed/unmapped/duplicate/error), `direction`, `verifyMode`, `source`.
- `attendance_device_employee_map` — maps on the **stable `deviceUserId` enrollment
  string** (not the volatile slot `uid` — the ZK re-enrolment gotcha), unique
  `(deviceId, deviceUserId)`.
- `attendance_device_sync_run` — per-batch audit (fetched/created/duplicate/
  unmapped/error/status).
- Punch **processor** (`processPendingPunches`): resolve employee → create/close
  `attendance_event` → `recalculateRecord` (the **21G workweek/day-type + 21J
  shift_rule** seam) → `attendance_record`; unmapped → **`attendance_exception`
  review queue** (blocker); missing-out/clock-drift flagged.
- **Public `ingest` endpoint** (API-key auth) an agent can POST to; **biometric-
  template rejection** privacy guard (no fingerprint/face templates ever stored).
- Payroll seam: only `attendance_record.payrollStatus='approved'` feeds payroll;
  open blocker exceptions can gate payroll. **Raw punches never touch payroll.**

Gap: native ZK TCP pull is `*_planned` in v2 — the **agent→`api_ingest`** path is
the supported transport (exactly what the Pi already does). So we re-point the
agent, we don't build an in-server ZK driver.

## 3. Bridge design — two paths

### 3a. Live forward sync (ongoing, post-cutover)
- Register the terminal in v2: `attendance_device` (vendor `zkteco`, mode
  `api_ingest`, `model "ZLM60_TFT"`, `timeZone America/Guyana`, hashed ingest key
  shown once).
- **Re-point the existing Pi agent** at v2's ingest endpoint (URL + new device id +
  new API key in the Pi's env). Keep the cursor, the ZK-state→direction map, and —
  importantly — **carry over the clock-drift correction**. Normalize each punch to
  `{deviceUserId, timestamp(UTC, ISO), direction, verifyMode}`.
- v2 ingest dedupes on `idempotencyKey`, stages raw, then the processor builds
  events/records via 21G/21J. Idempotent + safe to rerun.

### 3b. Historical backfill (migration, scratch-first)
- Extend the migration write-ETL with an attendance-punch mapper: v1
  `attendance_punches` → v2 `attendance_punch` staging with `source='import'`,
  `idempotencyKey` (v2 algorithm), `rawPayload` carrying the **v1 punch id**
  (audit/reconciliation), `deviceUserId` resolved from v1
  `attendance_device_users`. Pre-seed `attendance_device` + `attendance_device_
  employee_map` from v1 `attendance_devices` + `attendance_device_users` +
  `employees`.
- Run `processPendingPunches` on scratch → events → records → recalc. Unmatched →
  review queue (never guessed by name).
- **Raw v1 punches preserved** (also stage the full v1 `attendance_punches` into a
  `migration_source_*` table, mirroring 21L's GL/payslip staging).

## 4. Employee matching
**Grounded correction (build):** v1 `attendance_device_users` has 19 slots but **0
linked to employees** — v1 never used it for mapping. The real slot→employee link
lives on **`employees.attendance_device_id`** (the enrolment slot per employee, how
v1's ingest resolved punches). So the bridge seeds the v2 map from
`employees.attendance_device_id` → `(deviceId, deviceUserId=slot, employeeId)` for
each device in the org. Historical punches already carry v1's resolved `employee_id`
(preserved; **no name guessing**); the slot is attached as `deviceUserId` so the
idempotency key matches a future live re-send. Unmatched punches → `attendance_
exception` (unmapped_punch) review queue, never a silent drop.

> Key correctness note: attaching the real `deviceUserId` (slot) — not a "nouser"
> placeholder — is essential. Two different employees punching in the **same second**
> produce the same `dev|device|nouser|epoch` key and would **falsely dedupe**;
> per-slot keys preserve both (verified: 861→**897** punches once slots were used).

## 5. Timezone (explicit)
Org timezone `America/Guyana` (UTC-4, no DST). Device clock treated as UTC by the
agent; **preserve the raw device timestamp** (`rawPunchTime`/`rawPayload`) and store
the normalized `punchTime` in UTC. Carry the v1 **clock-drift auto-correction**
(3–5h GYT slip) into the v2 agent. `logical-shift-date`/day-type is derived
server-side by the processor (avoids the v1 NULL bug by construction).

## 6. Idempotency
v2 `idempotencyKey` unique constraint is the correctness guarantee; the Pi cursor
is the performance optimization. Re-running the backfill or a live batch inserts
zero duplicates (proven in 21O-C by a double-run row-count check).

## 7. Reconnect to the "drop edge-sync" decision (21A)
21A locked "drop edge-sync." That referred to v1's **multi-node edge replication**
(`source_node_id` / `sync_version` fan-out) — that stays dropped. A **single
device-agent → v2 ingest** path is NOT that, and is what the owner now wants. 21O
keeps the simple agent path; it does not resurrect multi-node edge replication.

## 8. Admin/operator report
Reuse `attendance_device_sync_run` (imported/duplicate/unmapped/error/last sync) +
the exception queue (unmatched punches, employees missing a device mapping, device
errors, clock drift). Surface "last successful sync" + backfill range.

## 9. Phase sequence
- **21O-A** — this spec. ✅
- **21O-B** — pure mappers ✅ (`scripts/migration/attendance-bridge/transformers-
  attendance.ts`: `mapAttendanceDevice`/`mapDeviceEmployeeMap`/`mapAttendancePunch`
  + `directionFor`/`punchIdempotencyKey`; 15 unit tests).
- **21O-C** — backfill runner ✅ (`run-attendance-bridge.ts`, guarded scratch-only):
  loads v1 device/slots/punches read-only, stages into v2 `attendance_device` /
  `attendance_device_employee_map` / `attendance_punch`, then runs the REAL
  `processPendingPunches`. Live rehearsal: device 1, **mappings 19**, **897 punches**
  staged (dup-on-rerun **0** = idempotent, unmatched **0**), processed 897/0,
  **events 499 → records 358 all day-typed** (weekday 319/sat 32/sun 7), raw
  preserved (`source=import`, v1 id in `rawPayload`); `migration:reconcile` stays
  **READY 46/46**.
- **21O-E** — Fumadocs ✅ (`time/biometric-devices.mdx` + cutover/freeze-checklist).
- **21O-D** — live agent re-point (operator, needs the on-site Pi): register the
  device in v2, point the agent at the v2 ingest endpoint (carry the clock-drift
  fix). NOT done here (no prod writes / needs the Pi).
- **21O-F** — final QA + freeze go/no-go refresh (device sync = freeze-readiness item).

## 10. Gates each phase
check-types · build · audit (reuses `attendance_device`/`attendance_punch` AC →
**audit stays 161/21**) · verify:core · the biometric verify scripts · transformers
· live dry-run · live reconcile (READY 46/46) · scratch write-ETL · docs build/lint.

## 11. Open items for the operator
- Confirm the v2 ingest URL the Pi will reach at cutover (and that the on-site Pi
  can reach it).
- Decide cutover timing for attendance: backfill history pre-freeze; flip the live
  agent to v2 at cutover (brief dual-write window acceptable — idempotency dedupes).
- MAC/asset tagging of the unit (optional; fw 6.60 doesn't answer `get_mac`).
