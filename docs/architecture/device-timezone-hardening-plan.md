# Device Timezone Hardening + Backfill — Implementation Plan

Status: **Spec (A-phase).** Foundation (pure `timezone.ts` util + tests) landed; the
pipeline cutover + backfill below is NOT yet implemented and must ship as its own
reviewed, scratch-tested change. Task **#181**.

## 1. Problem

Biometric devices report **naive wall-clock** timestamps (no offset), e.g.
`2026-06-22 11:39:00` meaning 11:39 in Guyana (UTC-4). The v2 attendance pipeline
currently handles time across **three inconsistent timezone frames**:

| Frame | Where | Behaviour today |
|-------|-------|-----------------|
| **Server process TZ** | `biometric.ts` ingest (`new Date(p.timestamp…)`, L884); `attendance-recalc.ts` `fmtHm`/`getHours`/`getDate`/`getDay`; `biometric-processor.ts` `localDate`/`getDay`; `attendance.ts` "today" via `new Date()` getters | naive parsed AND read back with the **server**'s local getters (UTC in the prod container) |
| **Browser TZ** | `attendance/index.tsx` clock panel `new Date(clockInTime).toLocaleTimeString(...)` (L889, L1233, L1242) | instants formatted in the **viewer's** browser timezone |
| **Device TZ** | `attendance_device.timeZone` (default `America/Guyana`) | **stored but ignored** by ingest |

### Why it "looks fine" today but is wrong

Ingest and the server-side read-back use the **same** server-local getters, so a
GYT punch round-trips as the same wall-clock numbers — staff see the correct
"11:39 AM". This holds **only because the prod container runs UTC** and the
device sends GYT. It is fragile and incorrect:

- Stores GYT wall-clock **as if it were a UTC instant** (4h off the true instant).
- Silently depends on the server staying UTC — setting `TZ=America/Guyana`
  (a natural "fix") would shift **all historical** displays −4h.
- Ignores `device.timeZone` → breaks the moment a second device/tenant is in
  another timezone (violates the SaaS Architecture Rule).
- The clock panel uses **browser** TZ, so a manager viewing from another country
  sees different times than the device frame.

> The future-dated `2026-07-08 · Source unavailable` punch is **not** this bug
> (15-day jump ≠ 4-hour offset) — it is a device-RTC/clock or unmapped-enrolment
> data issue and is an **operator** check on the physical terminal.

## 2. Target architecture (SaaS-correct)

Store **true UTC instants** everywhere; convert at the edges using an explicit
IANA timezone. Resolution order for the zone:

1. **Punch ingest** → the punch's `device.timeZone`.
2. **Day-bucketing / "today" / shift comparisons** → the **tenant/org default
   timezone** (new setting, below) — falling back to the device zone for a punch.
3. **Display** → tenant default timezone (server-rendered, deterministic), NOT
   the browser, so all roles see the operational timezone.

Foundation already built: `packages/api/src/utils/timezone.ts`
(`wallClockToUtc`, `utcToZonedParts`, `zonedDateKey`, `zonedHm`) — zero-dep,
DST-aware, exact for fixed-offset zones. Proven by `timezone.test.ts` (7 tests,
Guyana + New York DST).

### Changes

- **New tenant setting**: `payroll_setting.timeZone` (IANA string, default
  `America/Guyana`) — the org operational timezone. (Additive migration.)
- **Ingest** (`biometric.ts` `ingestSubmit`): replace `new Date(...)` with
  `wallClockToUtc(p.timestamp, device.timeZone)`. `idempotencyKey` epoch now
  derives from the **true** instant (see §3 cutover-boundary note).
- **Recalc** (`attendance-recalc.ts`): derive `firstClockIn`/`lastClockOut`
  (`fmtHm`), `getHours` (late calc), and `eventDate` day-of-week from
  `utcToZonedParts(instant, tenantTz)` instead of raw local getters.
- **Processor** (`biometric-processor.ts`): `localDate` → `zonedDateKey(punch,
  tenantTz)`; `dow` from zoned parts.
- **"Today"** (`attendance.ts` clock-in/out/status): compute the current
  operational date via `zonedDateKey(new Date(), tenantTz)`, not `new Date()`
  server getters.
- **Display**: server returns pre-zoned `HH:mm` strings (preferred), or the web
  formats with `timeZone: tenantTz` instead of browser-local.

### Payroll safety (key invariant)

Payroll reads **`payableMinutes`** (durations), which are **offset-invariant** —
shifting an instant by a constant offset does not change a duration. So the only
behavioural risk is **day-bucketing at the midnight boundary** (a punch landing
on the adjacent calendar day). The whole design preserves the device's calendar
day, so payroll totals are unchanged. **Regression guard: `migration:reconcile`
must stay 46/46.**

## 3. One-time backfill (existing data)

Existing rows were written as GYT-wall-clock-stored-as-UTC. To convert to true
instants for Guyana (offset −4h, i.e. true = stored **+4h**):

- `attendance_punch.punchTime` += 4h
- `attendance_event.clockIn` / `clockOut` += 4h
- `attendance_record.firstClockIn` / `lastClockOut` are **display strings**
  already holding correct wall-clock — leave as-is (or regenerate by re-running
  recalc, which will reproduce identical strings once read-back is zoned).

Cutover-boundary note: the `idempotencyKey` is `dev|device|user|epoch`. After the
backfill shifts `punchTime`, **also recompute stored keys** (or run the backfill
and the ingest change atomically) so a re-sent punch around the cutover does not
create a duplicate. Must be **idempotent** and run **scratch-first**.

Backfill must be **guarded**, **reversible** (it is a pure constant shift), and
record a marker so it cannot double-apply.

## 4. Rollout sequence

1. (done) `timezone.ts` + tests — unwired foundation.
2. Migration: add `payroll_setting.timeZone`.
3. Wire ingest → recalc → processor → "today" → display to the tenant TZ.
4. Backfill script (guarded, scratch-first, idempotent, reversible).
5. QA on a **scratch** clone of prod data: prove (a) staff-facing times unchanged
   post-backfill, (b) `migration:reconcile` 46/46, (c) a synthetic punch near
   local midnight buckets to the correct day, (d) a second device in another zone
   resolves correctly.
6. Coherent image build → prod backup → migration → backfill → roll → verify.

## 5. Interim stopgap (optional, faster)

If a quick correctness win is needed before the full refactor: set the prod
container `TZ=America/Guyana` **and** run the +4h backfill together (never one
without the other). This makes the existing consistent-with-server-TZ code store
and read true instants. It is **not** multi-tenant-safe (hardcodes one zone at
the process level) and is therefore a stopgap, not the target. The full §2 design
supersedes it.
