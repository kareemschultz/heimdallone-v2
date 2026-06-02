# Biometric + Geofencing Implementation Plan — Phase 11

Detailed implementation spec for the **Biometric attendance + Geofenced check-in**
module. This is the Phase 11 **A** deliverable (spec/research docs only; no code, no
schema, no migration). It synthesises live research of Odoo, ERPNext/Frappe HR,
Horilla, OpenHRMS/Cybrosys, and the ZKTeco/pyzk + ADMS protocols against the
**existing** Heimdallone Attendance module, then decides the minimum entity set, the
device-sync/import model, the geofence model, RBAC, payroll-safety rules, the UI
route plan, and the 11A–11H build sequence.

> Pattern note: this mirrors the A→E (here A→H) structure of
> [offboarding-implementation-plan.md](offboarding-implementation-plan.md) and
> [attendance-implementation-plan.md](attendance-implementation-plan.md). Every "A"
> phase is spec; "B" is DB; "C+" is API; later checkpoints are UI; the final
> checkpoint is QA/RBAC/security. **Do not jump from this plan to code — Phase 11B
> starts the schema.**

> Source-of-truth note: the **Attendance API is already built** (Phase 7). This module
> is an *ingestion + reconciliation layer that sits in front of attendance* — it must
> not duplicate or fork the attendance record. Raw punches and GPS check-ins flow
> **into** the existing `attendance_event` → `attendance_record` pipeline; only
> reviewed/approved `attendance_record` rows ever reach payroll (the gate already
> exists). See §5.

---

## 0. Research synthesis (what we studied, what we adopt)

Five systems were inspected live (source + docs). Full findings, with field names
and URLs, are captured in the research appendix at the end of this document (§14).
The decisions below are derived from them.

### 0.1 Systems studied

| System | What we took from it |
|---|---|
| **ERPNext / Frappe HR** | The canonical **raw-punch → processed-attendance** pipeline: `Employee Checkin` (raw log, separate doctype) is processed into `Attendance` by a background `Shift Type` job using a `last_sync_of_checkin` **watermark cursor**. The **`biometric-attendance-sync-tool`** (external Python daemon that polls ZKTeco over the network with `pyzk` and POSTs to a REST `add_log_based_on_employee_field` endpoint, mapping device user-id → employee, treating "duplicate timestamp" as a non-fatal skip). **`Shift Location`** (location_name, latitude, longitude, `checkin_radius`) is a *native* geofence enforced at check-in time. |
| **Horilla** | Two-layer model: `AttendanceActivity` (raw in/out events) → `Attendance` (one per employee per day, `attendance_validated` flag). `BiometricDevices` (machine_type zk/anviz/cosec/dahua/etimeoffice, ip/port, `is_live` live-capture vs `is_scheduler` cron-pull, `last_fetch_date`/`last_fetch_time` watermark, `device_direction` in/out/alternate/system). `BiometricEmployees` maps **(device, user_id string)** → employee. `GeoFencing` (lat, lon, `radius_in_meters`, `start` flag) validated with **geopy `geodesic`** (great-circle, not Euclidean). Punch-code sets: clock-in `{0,3,4}`, clock-out `{1,2,5}`. |
| **Odoo `hr_attendance`** | `in_mode`/`out_mode` enum (`kiosk`/`systray`/`manual`) recording **how** a punch was made; GPS captured from the browser Geolocation API into `in_latitude`/`in_longitude` (read-only); **kiosk mode** (unauthenticated kiosk URL + barcode/RFID/manual-select + optional PIN). Honest finding: Odoo has **no native geofence enforcement** (third-party only). Overtime as a separate `hr.attendance.overtime` accumulator with an `adjustment` escape hatch. |
| **OpenHRMS / Cybrosys** | ZKTeco uFace/iFace via `zklib`, manual "Download Data" trigger, employee match by a per-employee "Biometric Device ID". **Anti-pattern to avoid:** auto-creating an employee when a device user-id is unknown. Community pyzk variant adds punch-sequence normalisation (`in→in→out` collapses the duplicate). |
| **ZKTeco / pyzk + ADMS** | **Pull** (`pyzk`: TCP port 4370, `get_attendance()`, `live_capture()`, `get_time()`/`set_time()`, `disable_device()` during read) vs **Push** (ADMS/iclock: device POSTs tab-separated `ATTLOG` to `/iclock/cdata?SN=…&table=ATTLOG`). **Critical privacy fact:** a punch record carries only `user_id`, `timestamp`, in/out `status`, and `verify_mode` (a *byte* saying fingerprint/card/password was used) — **no fingerprint or face template ever leaves the device.** |

### 0.2 Adopted decisions (the spine of this spec)

1. **Raw punches are staged, never authoritative.** A new `attendance_punch` staging
   table (ERPNext `Employee Checkin` equivalent) holds every raw event. A processor
   turns *mapped, de-duplicated, non-exception* punches into the existing
   `attendance_event` (`source` = `biometric`/`mobile`/`import`), then recalculates
   `attendance_record`. Payroll only ever reads approved `attendance_record` rows. (§5, §6)
2. **Device protocol lives in an external sync-agent, not in our Bun server.** A
   Bun/Hono/TS server cannot practically speak the ZKTeco binary protocol. We ship a
   **punch-ingest REST API + CSV import** for the MVP, plus a documented **external
   sync-agent contract** (an agent like Frappe's tool polls ZK and POSTs punches with
   an API key). Native pull and ADMS push are planned but staged later. (§2.1, §12, §13)
3. **Watermark + idempotency, never device-log-clearing.** Each device row carries a
   `lastSyncCursor`; ingest is idempotent on `(org, deviceId, deviceUserId, punchTime)`.
   We never call `clear_attendance()`. (§2.1, §2.4)
4. **Geofence = soft-block-with-reason, not hard-block.** Outside-radius check-ins are
   *allowed* but flagged as an exception requiring a reason and manager review — fitting
   Caribbean field operations — rather than ERPNext's hard reject. Validation is
   **server-side** (great-circle distance); the client is never trusted. (§3, §6)
5. **Store punch events only; never biometric templates.** `verifyMode` records the
   *method* (fingerprint/face/card) as an enum; no template, image, or raw biometric
   measurement is ingested or stored. This keeps us out of GDPR/BIPA/PDPA
   biometric-template scope. (§11)

---

## 1. Module goals

- **Biometric attendance device integration** — register devices, map device user-ids
  to employees, ingest punches (via external agent / push / CSV), and turn them into
  attendance with full audit.
- **Mobile / geofenced check-in** — let staff clock in/out from a mobile browser with
  GPS, validated server-side against an assigned work site radius.
- **Attendance device sync** — scheduled/manual sync runs with watermark cursors, sync
  logs, error classification, and retry.
- **Real-time and batch import** — push (near-real-time) and pull/CSV (batch), unified
  into one staging pipeline.
- **Manual review and correction** — an exception queue + the existing
  `attendance_correction` flow; nothing silently mutates attendance.
- **Payroll/attendance safety** — raw punches never feed payroll; unresolved blocker
  exceptions become payroll blockers; only approved `attendance_record` rows are paid.
- **Auditability and fraud prevention** — every device CRUD, sync run, mapping change,
  exception resolution, and manual override is audited; accuracy/spoofing/clock-drift
  indicators are captured.

---

## 2. Device integration concepts

### 2.1 Integration modes (honest capability matrix for the MVP)

| Mode | What it is | MVP status | Why |
|---|---|---|---|
| **CSV / Excel import** | HR uploads a punch export (deviceUserId, timestamp, in/out, deviceId) | **✅ MVP** | Zero device connectivity needed; works in dev; covers any device that can export. |
| **Punch-ingest REST API** (external sync-agent → us) | An agent on the customer LAN polls ZKTeco with `pyzk` and POSTs punches to our API with a per-device API key | **✅ MVP (the API; the agent is a documented contract + reference script, not in-repo)** | Mirrors Frappe's proven model; isolates the binary protocol outside our Bun server. |
| **ADMS / iclock push** (device → us) | Device POSTs tab-separated `ATTLOG` to a public endpoint | **🔶 Planned (11C stretch / later)** | Near-real-time; but needs a public endpoint + SN allowlist + shared-secret auth + careful rate-limiting. |
| **Native TCP pull** (us → device) | Our server opens TCP:4370 and calls `get_attendance()` | **⛔ Deferred** | Not practical from Bun; would need a TS ZK-protocol implementation. Use the external-agent contract instead. |
| **Live capture (threaded)** | Long-lived `live_capture()` stream | **⛔ Deferred** | Fragile across server restarts (Horilla lesson #6); the agent or push covers real-time. |
| **Manual entry** | HR types a punch | **✅ already exists** | `attendance.events.createManual` (`source:"admin"`). |

> **Architectural rationale (recorded so 11C doesn't relitigate it):** ERPNext, Horilla,
> and OpenHRMS all reach ZKTeco from a **Python** runtime (`pyzk`/`zklib`). Our server
> is Bun/Hono/TypeScript. Rather than implement the ZK binary protocol in TS, the
> punch-ingest API makes the device protocol someone else's process — exactly Frappe's
> design. The reference sync-agent is a small documented script; the *contract* (auth,
> payload, dedupe, watermark) is owned by us in 11C.

### 2.1a Device adapter/provider model (multi-vendor — added 11C)

The integration is **not** ZKTeco-only. Devices carry a `vendor`
(`zkteco`/`ngteco`/`generic`/`other`), `modelFamily`, a `mode` (the connection
mode — see the expanded enum below), and capability metadata
(`supportedPunchMethods` = face/fingerprint/rfid/pin/mobile_app/gps_mobile,
`networkCapabilities` = wifi_2_4ghz/wifi_5ghz/tcp_ip/usb/cloud_app, `capacity*`,
`supportsOfflineLogs/ShiftRules/CloudSync/MobileApp/GpsPunch`,
`requiresSubscriptionForAdvancedFeatures`). A `(vendor, mode)` resolves to an
**`AttendanceDeviceAdapter`** (`packages/api/src/utils/attendance-adapters.ts`):

```ts
interface AttendanceDeviceAdapter {
  providerKey: string; displayName: string;
  vendor: "zkteco" | "ngteco" | "generic" | "custom";
  status: "supported" | "planned";
  supportedModes: string[]; capabilities: string[];
  parseImportRows(text): { punches: NormalizedPunch[]; errors: string[] };
  validateDeviceConfig(config): { ok: boolean; errors: string[] };
  getConnectionStatus(): { live: boolean; mode; detail };
}
```

Adapters normalize imported rows; the **processor is adapter-agnostic** (it never
branches on vendor). Initial adapters: `generic_csv`, `generic_excel`,
`generic_api` (supported); `zkteco_tcp`, `zkteco_adms`, `ngteco_cloud`
(**planned** — `getConnectionStatus().live === false`, no faked sync);
`ngteco_app`, `ngteco_kseries` (supported file import). NGTeco cloud/app clocks
often expose no public API — supported paths are manual CSV/Excel export, USB
export (K-series), and periodic file import; a live cloud adapter is gated behind
official-API + production secret storage.

**Expanded `attendance_device_mode` enum (11C):** `csv_import`, `excel_import`,
`usb_export_import`, `api_ingest`, `zkteco_tcp_planned`,
`zkteco_adms_push_planned`, `ngteco_cloud_export`, `ngteco_app_export`,
`vendor_manual_upload`, `custom_adapter_planned`. The `*_planned` values name
not-yet-built live integrations so the UI/API represent them honestly.

### 2.2 Concepts to plan for

- **ZKTeco-style devices** (zkteco/eSSL share the `pyzk` protocol) — primary target.
  Anviz (cloud API), COSEC, Dahua reserved in the enum but **deferred** (each is a
  separate integration — OpenHRMS lesson).
- **TCP/IP LAN devices** — reached by the external agent, not our server.
- **Pull / push / CSV / manual** — see §2.1.
- **Multi-device per location** — `attendance_device` is org-scoped; many devices may
  map to one work site; a punch's site is inferred from the device's configured site.
- **Device → employee mapping** — `attendance_device_employee_map` on the stable
  **string** `deviceUserId` (NOT the device serial `uid`, which resets on re-enrolment —
  Horilla/ZK gotcha). Unmapped punch → quarantined, never auto-creates an employee
  (OpenHRMS anti-pattern).
- **Device time zone + clock drift** — each device stores a `timeZone` + we record
  `clockOffsetSeconds` from the last sync (`get_time()` vs server). Drift beyond a
  threshold raises a `clock_drift` exception; ingest timestamps are normalised to UTC on
  arrival.
- **Duplicate punch handling** — idempotency key `(org, deviceId, deviceUserId, punchTime)`;
  re-ingest of a seen punch → `duplicate` status (skipped, non-fatal — Frappe "error 3"
  pattern). Optional sequence-normalisation (`in→in→out` collapse) as a processor rule.
- **Missed punch handling** — open `attendance_event` (clock-in with no clock-out) past
  a window → `missing_clock_out` exception; existing `enableAutoCheckout` setting can
  auto-close, otherwise it's a review item.
- **Offline device sync** — the agent buffers locally and replays; our watermark +
  idempotency make re-delivery safe.
- **Sync logs / errors / retry** — `attendance_device_sync_run` records each batch
  (counts, status, error). Failed runs are retryable; partial runs record per-punch
  errors as exceptions. We **never** clear device logs (data-loss risk).

### 2.3 Proposed entity: `attendance_device`

Registry of a physical/virtual device or import source. Credentials are **encrypted at
rest** and **never returned to the client in plaintext** (§11).

Key fields: `id`, `organizationId` (tenant), `name`, `deviceType` (enum, §4.1),
`mode` (enum: pull/push/csv_import/manual), `serialNumber` (for ADMS SN match,
nullable), `connectionConfig` (jsonb — host/port/timeout/secret refs, **encrypted**),
`apiKeyHash` (for the ingest endpoint; only a hash stored), `workSiteId` (FK →
`geofence_location`, nullable — the device's physical location, stamped on its punches),
`direction` (enum in/out/alternate/system), `timeZone` (IANA), `clockOffsetSeconds`
(last measured drift), `isScheduled` (bool), `scheduleIntervalMinutes` (nullable),
`lastSyncCursor` (timestamp watermark), `lastSyncRunId` (FK, nullable), `lastSyncStatus`
(enum), `status` (active/inactive/error), `notes`, timestamps, `deletedAt`.

### 2.4 Proposed entity: `attendance_device_employee_map`

Maps **(device, device user-id string)** → employee. Partial-unique
`(deviceId, deviceUserId) WHERE deletedAt IS NULL`.

Fields: `id`, `organizationId`, `deviceId` (FK), `deviceUserId` (string, the stable
enrolment id), `deviceUserSerial` (int `uid`, secondary/nullable), `employeeId` (FK →
`employee_profile`), `enrollmentMethod` (nullable note), timestamps, `deletedAt`.

### 2.5 Proposed entity: `attendance_device_sync_run`

One row per ingest batch (pull/push-batch/csv import). The audit trail of a sync.

Fields: `id`, `organizationId`, `deviceId` (FK, nullable for org-wide CSV imports),
`mode` (enum pull/push/csv_import), `startedAt`, `finishedAt` (nullable while running),
`cursorFrom`, `cursorTo` (watermark span), `punchesFetched`, `punchesCreated`,
`punchesDuplicate`, `punchesUnmapped`, `punchesError`, `status` (enum
running/success/partial/failed), `errorSummary` (nullable), `triggeredByUserId`
(nullable — null = scheduler/agent), timestamps.

### 2.6 Proposed entity: `attendance_punch` (raw staging)

The ERPNext `Employee Checkin` equivalent — **the staging table**. Every raw event
lands here first. Idempotency: partial-unique
`(organizationId, deviceId, deviceUserId, punchTime) WHERE deletedAt IS NULL`; for
device-less sources (mobile/CSV-without-device) the key falls back to
`(organizationId, employeeId, punchTime, source)`.

Fields: `id`, `organizationId`, `deviceId` (FK, nullable for mobile/manual),
`syncRunId` (FK, nullable), `deviceUserId` (string, nullable for mobile), `employeeId`
(FK, **nullable until mapped**), `punchTime` (timestamptz, UTC-normalised),
`rawPunchTime` (text — the original device-local string, for audit), `direction` (enum
in/out/unknown), `verifyMode` (enum fingerprint/face/card/password/mobile_gps/manual/
unknown — **method only, no template**), `source` (mirrors `attendance_source`:
biometric/mobile/import/manual/admin), `processingStatus` (enum
pending/processed/unmapped/duplicate/error, §4), `createdAttendanceEventId` (FK →
`attendance_event`, set when processed), `geofenceCheckInId` (FK, nullable),
`rawPayload` (jsonb — original row for forensics), `errorReason` (nullable), timestamps,
`deletedAt`.

---

## 3. Geofencing concepts

### 3.1 Decisions

- **Worksite geofence** — `geofence_location` (org-scoped named site: lat, lon,
  `radiusMeters`, `accuracyThresholdMeters`, `isActive`). Many sites per org (Horilla's
  one-fence-per-company is too coarse for multi-site Caribbean operations).
- **Assignment** — `geofence_assignment` ties a site to an **employee**, a
  **department**, or the **whole organization** (scope enum), with an `isDefault` site
  per employee. Shift-tied geofences are **deferred**.
- **GPS check-in/out** — captured from the **browser Geolocation API** (works on mobile
  browsers today; native app later). The clock-in mutation accepts `{lat, lon, accuracy}`.
- **Allowed radius** — default **150 m** (configurable per site). **Accuracy threshold**
  default **100 m** — a fix worse than this is `low_accuracy` (warn, don't silently pass).
- **Location spoofing warning** — capture the browser/mobile `mockLocation` flag where
  available, plus **impossible-travel** detection (two check-ins whose distance/elapsed
  implies an implausible speed) → `spoofing_suspected` exception. Heuristic, advisory.
- **Photo/selfie** — **deferred**; schema reserves a nullable `selfieUrl` on
  `geofence_check_in`. Not captured in MVP.
- **Device/browser metadata** — store `userAgent`, coarse platform, and `mockLocation`
  flag for audit/fraud, subject to the retention policy (§11).
- **Mobile-first UX** — the check-in screen is a single big button, designed for a phone
  browser; see §9.
- **Offline / poor connectivity** — the check-in screen queues a pending punch locally
  (client) and submits when back online; server idempotency makes resubmission safe.
  Clearly show "saved, will sync" state.
- **Exception workflow when outside geofence** — **soft block**: the user may still
  submit but must enter a reason; the punch is flagged `outside_geofence` and routed to
  the manager/HR review queue (§6). Validation is always server-side.

### 3.2 Proposed entity: `geofence_location` (work site)

Fields: `id`, `organizationId`, `name`, `address` (nullable), `latitude` (text/numeric,
see §4.3), `longitude`, `radiusMeters` (int, default 150), `accuracyThresholdMeters`
(int, default 100), `allowOutsideWithReason` (bool, default true), `isActive` (bool),
`notes`, timestamps, `deletedAt`. Unique `(organizationId, name) WHERE deletedAt IS NULL`.

### 3.3 Proposed entity: `geofence_assignment`

Fields: `id`, `organizationId`, `workSiteId` (FK), `scope` (enum
employee/department/organization), `employeeId` (FK, nullable), `departmentId` (FK,
nullable), `isDefault` (bool — the employee's primary site), timestamps, `deletedAt`.
Resolution precedence at check-in: employee assignment → department assignment →
organization default.

### 3.4 Proposed entity: `geofence_check_in`

The per-check-in GPS evidence log (one per geofenced punch). Raw coordinates are subject
to the retention policy (§11) — after the window they are truncated to the derived verdict.

Fields: `id`, `organizationId`, `employeeId`, `attendancePunchId` (FK, nullable),
`attendanceEventId` (FK, nullable), `latitude`, `longitude`, `accuracyMeters`,
`matchedWorkSiteId` (FK, nullable), `distanceMeters` (computed great-circle),
`status` (enum inside/outside/low_accuracy/unverified), `mockLocationFlag` (bool),
`impossibleTravelFlag` (bool), `reason` (nullable — required when outside), `userAgent`
(nullable), `platform` (nullable), `selfieUrl` (nullable, deferred), `capturedAt`,
`coordsPurgedAt` (nullable — set when lat/lon are scrubbed per retention), timestamps.

---

## 4. Core entities — the decided minimum set

The candidate list in the brief was 14 entities. We **reuse** the existing attendance
tables and add **8** new ones — the minimum that supports the goals without duplicating
attendance.

| Candidate | Decision |
|---|---|
| `attendance_device` | ✅ new |
| `attendance_device_employee_map` | ✅ new |
| `attendance_device_sync_run` | ✅ new |
| `attendance_device_sync_event` | ❌ folded into `attendance_device_sync_run` counters + per-punch `attendance_punch.errorReason` + exceptions |
| `attendance_punch_import` | ❌ folded into `attendance_device_sync_run` (mode=`csv_import`) |
| `attendance_punch` | ✅ new (raw staging) |
| `geofence_location` | ✅ new (work site) |
| `geofence_assignment` | ✅ new |
| `geofence_check_in` | ✅ new |
| `attendance_exception` | ✅ new (this **is** the review queue) |
| `attendance_review_queue` | ❌ not a table — "the queue" = `attendance_exception WHERE status='open'` |
| `attendance_correction_request` | ❌ **already exists** as `attendance_correction` (reuse) |
| `attendance_policy_rule` | ❌ extend existing `attendance_setting` + per-site fields; defer a generic rule engine |

**Reused existing tables** (do not fork): `attendance_event` (the per-punch event;
already has `source`, `deviceId`, `locationLat`, `locationLon`), `attendance_record`
(the daily, payroll-gated summary), `attendance_correction` (the correction flow),
`attendance_setting` (extend with policy fields), `shift`, `employee_profile`,
`department`, `organization`, `user`, `audit_event`.

### 4.1 Proposed entity: `attendance_exception` (the review queue)

Fields: `id`, `organizationId`, `employeeId` (FK, nullable for unmapped punches),
`attendancePunchId` (FK, nullable), `attendanceEventId` (FK, nullable),
`attendanceRecordId` (FK, nullable), `geofenceCheckInId` (FK, nullable), `deviceId`
(FK, nullable), `type` (enum, §4.2), `severity` (enum info/warning/blocker),
`status` (enum open/in_review/resolved/dismissed), `detail` (text — plain-language),
`resolutionAction` (nullable — what was done), `resolvedBy` (FK → user, nullable),
`resolvedAt` (nullable), `resolutionNote` (nullable), `correctionId` (FK →
`attendance_correction`, nullable — when an exception spawns a correction), timestamps.
Indexes on `(organizationId, status)`, `(employeeId)`, `(type)`.

### 4.2 New enums

| Enum (proposed pgEnum) | Values |
|---|---|
| `attendance_device_type` | `zkteco`, `anviz`, `cosec`, `dahua`, `generic`, `virtual_kiosk` *(MVP implements `zkteco`, `generic`; others reserved)* |
| `attendance_device_mode` | `pull`, `push`, `csv_import`, `manual` |
| `attendance_device_status` | `active`, `inactive`, `error` |
| `attendance_device_direction` | `in`, `out`, `alternate`, `system` |
| `attendance_sync_mode` | `pull`, `push`, `csv_import` |
| `attendance_sync_status` | `running`, `success`, `partial`, `failed` |
| `attendance_punch_direction` | `in`, `out`, `unknown` |
| `attendance_punch_status` | `pending`, `processed`, `unmapped`, `duplicate`, `error` |
| `attendance_verify_mode` | `fingerprint`, `face`, `card`, `password`, `mobile_gps`, `manual`, `unknown` |
| `geofence_assignment_scope` | `employee`, `department`, `organization` |
| `geofence_check_status` | `inside`, `outside`, `low_accuracy`, `unverified` |
| `attendance_exception_type` | `unmapped_punch`, `duplicate_punch`, `missing_clock_out`, `outside_geofence`, `low_gps_accuracy`, `clock_drift`, `spoofing_suspected`, `device_error`, `out_of_window` |
| `attendance_exception_status` | `open`, `in_review`, `resolved`, `dismissed` |
| `attendance_exception_severity` | `info`, `warning`, `blocker` |

> **Reused existing enums** (`packages/db/src/schema/attendance.ts`): `attendance_source`
> = `manual | biometric | mobile | import | admin` (already includes the values we
> produce); `attendance_status`, `attendance_payroll_status` = `pending | approved |
> payroll_locked`, `attendance_correction_status`, `attendance_day_type`. **No change to
> existing enum values** — we only *populate* `biometric`/`mobile`/`import`.

### 4.3 Storage conventions (match existing module)

- **Coordinates:** the existing `attendance_event.locationLat/locationLon` are **`text`**
  (the attendance plan noted a `numeric(10,7)` intent but the shipped columns are text).
  New geofence coordinate columns should **match the shipped convention** for
  consistency unless 11B decides to migrate both together. 11B must reconcile this
  explicitly and pick one (recommended: `numeric(10,7)` for new columns + a noted
  follow-up to migrate the two `attendance_event` text columns, OR text everywhere for
  zero-friction). Flag, don't silently diverge.
- **Durations:** integer minutes/seconds (attendance module convention — no `"HH:MM"`
  strings; Horilla's dual-format lesson is satisfied because we already store integers).
- **Money:** none in this module.
- **Soft delete:** `deletedAt` on registry/config tables (devices, mappings, sites,
  assignments); raw punches/check-ins/exceptions are immutable evidence (no soft delete
  beyond `dismissed`/`resolved` status — keep for audit).
- **Invariants as partial-unique indexes** (offboarding `ob_case_employee_active_uq`
  pattern): device-user map uniqueness, punch idempotency, site name uniqueness.

---

## 5. Relationship to the existing Attendance module

Inspected first (per the brief). Findings (`packages/db/src/schema/attendance.ts`,
`packages/api/src/routers/attendance.ts`, `apps/web/src/routes/app/attendance/`):

- **`attendance_event`** = raw clock in/out events, many per day. **Already has**
  `source` (enum incl. `biometric`/`mobile`/`import`), `deviceId` (text, nullable),
  `locationLat`/`locationLon` (text, nullable) — **Phase 7 stubs explicitly reserved for
  this phase.**
- **`attendance_record`** = one row per employee per day, `UNIQUE(employeeId, date)`.
  This **is** the payroll-ready record. Carries `workedMinutes`, `overtimeMinutes`,
  `approvedOvertimeMinutes`, `status`, `dayType`, `isValidated`, and
  `payrollStatus` (`pending → approved → payroll_locked`).
- **`attendance_correction`** = employee-submitted correction requests with
  approve/reject — the manual-correction flow already exists.
- **`attendance.clock.checkIn`** currently hardcodes `source:"manual"` and ignores
  `deviceId`/location.
- **Payroll gate (already built):** the payroll engine reads **only**
  `attendance_record WHERE payrollStatus = 'approved'`; `payroll_locked` rows are
  immutable (`assertNotLocked`). See
  [attendance-leave-payroll-readiness-plan.md](attendance-leave-payroll-readiness-plan.md).

### 5.1 What extends current attendance vs what is new

| Need | Decision |
|---|---|
| Where raw biometric/GPS punches live | **New** `attendance_punch` staging table (do not overload `attendance_event`, which is the *processed* event). |
| How a punch becomes attendance | **Extend** the existing pipeline: processor creates an `attendance_event` (`source` = `biometric`/`mobile`/`import`, `deviceId`, `locationLat/Lon`) then calls the existing `recalculateRecord()` to update `attendance_record`. |
| How geofence check-ins become attendance | A mobile GPS clock-in writes `attendance_punch` (source=`mobile`) + `geofence_check_in`, validates server-side, then (if not a blocker exception) flows through the same processor into `attendance_event`/`attendance_record`. |
| Corrections | **Reuse** `attendance_correction`; an exception can spawn one. |
| Policy (grace/OT/thresholds) | **Extend** `attendance_setting` (add geofence defaults, drift threshold, accuracy threshold, retention days, "block payroll on open exceptions" flag) + per-site overrides on `geofence_location`. |
| Sync/import layer | **New** (`attendance_device*`, `attendance_punch`, sync runs) — purely an ingestion layer in front of attendance. |
| Exceptions | **New** `attendance_exception`. |

### 5.2 The bridge (canonical flow)

```
ingest (agent POST / ADMS push / CSV / mobile GPS clock-in)
  → attendance_punch (status=pending)            [staging — never paid]
  → MAP   (device,deviceUserId)→employee         [unmapped → exception, stop]
  → DEDUPE idempotency key                        [duplicate → skip, stop]
  → GEOFENCE (mobile only) server-side distance   [outside/low_acc → geofence_check_in + exception]
  → PROCESS mapped+unique+non-blocker punches
        → attendance_event (source=biometric|mobile|import, deviceId, lat/lon)
        → recalculateRecord()  → attendance_record (payrollStatus stays 'pending')
  → REVIEW exceptions (manager/HR)  → resolve / correct / dismiss
  → VALIDATE attendance_record (existing records.validate)
  → APPROVE for payroll (existing records.approvePayroll, canManagePayroll)
  → LOCK at payroll run (existing records.lockForPayroll)
```

Raw punches are **never** read by payroll. Only approved `attendance_record` rows are.

---

## 6. Payroll safety

Documented rules (enforced in 11G; they reuse the existing readiness mechanism):

1. **Biometric/geofence data never directly affects payroll.** It produces
   `attendance_event` rows that recalc `attendance_record`; payroll reads only
   `payrollStatus='approved'` records. There is no path from a raw punch to a payslip.
2. **Unresolved exceptions create payroll blockers/warnings.** During the existing
   payroll-readiness check for a period:
   - `severity='blocker'` open exceptions (e.g. `missing_clock_out`, `unmapped_punch`
     for an in-scope employee, `device_error` affecting the period) → **payroll blocker**
     ("Cannot continue" in the run wizard).
   - `severity='warning'` (e.g. `outside_geofence` resolved-with-reason,
     `low_gps_accuracy`, `clock_drift`) → **payroll warning** ("Needs review").
   This plugs into the existing `pendingItems`/blocker/warning fields of `PayrollInput`.
3. **Duplicate / missing punches are classified, not dropped.** Duplicates → `duplicate`
   (skipped, logged in the sync run); missing clock-out → `missing_clock_out` exception
   (auto-close only if `enableAutoCheckout` is set, else a review item).
4. **Late/early/overtime need policy rules.** Lateness/early-leave/OT come from the
   existing `attendance_setting` grace/cutoff fields and `attendance_record`
   minute columns — biometric ingest does not invent new pay rules; it just feeds minutes.
5. **Payroll uses processed, approved attendance — not raw punches.** Restated as the
   hard invariant: the only attendance input to payroll is `attendance_record` with
   `payrollStatus='approved'`, locked to `payroll_locked` at run time.

---

## 7. Status lifecycles

**Device sync run** (`attendance_device_sync_run.status`)
`running → success` | `running → partial` (some punches errored/unmapped) | `running → failed`.
Retry creates a **new** run (idempotent ingest makes this safe).

**Punch processing** (`attendance_punch.processingStatus`)
`pending → processed` (event created) | `pending → unmapped` (no employee map → exception;
re-runs after mapping is added) | `pending → duplicate` (idempotency hit) | `pending → error`
(malformed → exception). `unmapped → processed` once a mapping is created and reprocessed.

**Geofence check-in** (`geofence_check_in.status`)
`unverified` (no GPS / no assigned site) | `inside` | `outside` (→ exception, reason
required) | `low_accuracy` (→ warning exception). Terminal after capture; coordinates
later scrubbed (`coordsPurgedAt`).

**Attendance exception** (`attendance_exception.status`)
`open → in_review → resolved` | `open → dismissed` | `open → resolved` (direct).
A `resolved` exception may carry a `correctionId` if it spawned an `attendance_correction`.

**Correction request** — **reuses existing** `attendance_correction_status`:
`pending → approved` | `pending → rejected` (unchanged from Phase 7).

---

## 8. RBAC

### 8.1 New helpers (added to **both** `packages/api/src/utils/role-helpers.ts` and
`apps/web/src/lib/rbac.ts`, kept byte-for-byte in sync — the established convention).

The 9 tenant roles (from `packages/auth/src/permissions.ts`): `tenant_owner`,
`tenant_admin`, `hr_admin`, `payroll_admin`, `manager`, `employee`, `auditor`,
`recruiter`, `helpdesk_agent`. `normalizeRole` maps Better-Auth `owner`→`tenant_owner`,
`admin`→`tenant_admin` before lookup.

| Helper | Membership |
|---|---|
| `canManageBiometrics(role)` | `canManageHR` (owner/admin/hr_admin) |
| `canViewBiometrics(role)` | `canManageBiometrics` + `auditor` |
| `canManageGeofencing(role)` | `canManageHR` |
| `canViewGeofencing(role)` | `canManageGeofencing` + `manager` + `auditor` + `payroll_admin` |
| `canUseGeofenceCheckIn(role)` | any active attendance-taking member: owner/admin/hr_admin/payroll_admin/manager/employee *(excludes auditor, recruiter, helpdesk_agent)* |
| `canReviewAttendanceExceptions(role)` | `canManageHR` + `manager` *(manager scoped to direct reports — §8.3)* |

> Also add the long-missing `canManageAttendance` / `canViewAttendance` helpers while in
> these files (today the attendance router/UI use inline checks) — small, in-scope
> consolidation that 11B/11C should land alongside the new helpers.

### 8.2 Expected role behaviour

- **owner / admin / hr_admin** — manage devices, mappings, sync, work sites,
  assignments; review/resolve all exceptions; full punch visibility.
- **manager** — view/review **scoped** team exceptions and punches (direct reports
  only); can use geofence check-in; no device/site management.
- **employee** — use mobile geofence check-in; see **own** punches, own check-in logs,
  own exceptions; submit corrections (existing flow). No device/site/queue access.
- **auditor** — read-only **everywhere** (devices, sync runs, punches, sites,
  exceptions); resolves nothing.
- **payroll_admin** — view **processed** attendance + payroll warnings/blockers and
  geofence sites (context for pay), but **cannot** manage devices or resolve device
  exceptions; can already approve/lock payroll attendance (existing).
- **recruiter / helpdesk_agent** — no access (no attendance role today).

### 8.3 AC resources (new, added to `permissions.ts` `statement` **and** every relevant
role block — the audited rule that prevents the `posting:update` 403 class of bug;
`bun run audit:permissions` must pass).

| Resource | Actions | Granted to |
|---|---|---|
| `attendance_device` | `read`, `manage`, `sync` | owner/admin/hr: all; auditor/payroll: read |
| `attendance_punch` | `read`, `process` | owner/admin/hr: read+process; auditor/payroll/manager: read |
| `geofence` | `read`, `manage` | owner/admin/hr: read+manage; manager/employee/payroll/auditor: read |
| `attendance_exception` | `read`, `resolve` | owner/admin/hr: read+resolve; manager: read+resolve (scoped); auditor/payroll: read |

**Existing `attendance` resource** (`create`/`read`/`correct`) is reused for the
resulting records. **Mobile geofence clock-in stays a `tenantProcedure` with server-side
self-scope** (like the existing `clock.checkIn`) — it is deliberately **not** behind a
manage-only AC gate, so employees can actually use it. This directly applies the
offboarding `documents.markUploaded` lesson (a self-service branch must not sit behind a
manage-only action) and the Assets `asset:request` resolution.

### 8.4 Two-layer authorization (the offboarding pattern)

Every per-record read/mutation enforces **(a)** tenant scope (org_id + `deletedAt`) AND
**(b)** lateral manager→direct-report scope via `assertCaseVisibleToCaller`-equivalent
(`assertPunchVisibleToCaller` / `assertExceptionVisibleToCaller`). Frontend RBAC is UX
only; the API re-checks every call (authz **before** existence checks → no IDOR).

---

## 9. UI plan

Conventions enforced (from offboarding/onboarding): **folder routes** (delete the flat
`apps/web/src/routes/app/biometrics.tsx` and `geofencing.tsx` stubs first — they would
shadow folder routes), a `<ModuleTabs>` strip, `EmptyState` for no-access (queries
disabled so no 403 spam), graceful 403/404 + `retry:false` on `getById`,
**denormalized display fields** in list endpoints (no client-side join), plain-language
labels (no raw enums), no fake-active controls.

### 9.1 Routes

| Route | Purpose | Tabs/component |
|---|---|---|
| `/app/biometrics` | Devices/sync overview dashboard (device health, last sync, pending punches, open exceptions) | `BiometricsTabs` |
| `/app/biometrics/devices` | Device registry list | `BiometricsTabs` |
| `/app/biometrics/devices/$id` | Device detail: config (secrets masked), mappings, sync history, recent punches; CSV import + "test"/sync trigger | folder route |
| `/app/biometrics/sync-runs` | Sync-run log (counts, status, errors), retry | `BiometricsTabs` |
| `/app/biometrics/punches` | Raw punch review table (filter by status: pending/unmapped/duplicate/error), map-unmapped action | `BiometricsTabs` |
| `/app/geofencing` | Geofencing overview (sites, assignments, recent check-ins) | `GeofencingTabs` |
| `/app/geofencing/locations` | Work-site list + detail (lat/lon/radius/accuracy) — **map placeholder** until a map lib is chosen (show coords + a static "open in maps" safe-href; no fake map) | `GeofencingTabs` |
| `/app/geofencing/check-in` | **Employee mobile GPS clock-in/out screen** (big button, live status, "you're inside/outside <site>", reason field when outside, offline "will sync" state) | mobile-first, self-service |
| `/app/attendance/exceptions` | **Exception review queue** (integrated into the existing Attendance module via an `AttendanceTabs`/lens), resolve/dismiss/correct | extends attendance |
| `/app/attendance/corrections` | Existing correction queue, surfaced as its own route/lens | extends attendance |

> The existing `/app/attendance` ClockPanel stays for non-GPS clock-in. Exceptions and
> corrections are **integrated into Attendance** (not a separate top-level module) since
> they are attendance review surfaces; biometrics+geofencing get their own top-level
> sections because they are configuration/ingestion. A combined "Attendance Devices" tab
> grouping is acceptable if 11D prefers it — decide at 11D, keep one tabs convention.

### 9.2 UI patterns to build

- `BiometricsTabs`, `GeofencingTabs` (mirror `OffboardingTabs`).
- **Device sync dashboard** — status tiles (devices active/error, last sync age, pending
  punches, open exceptions), driven by cheap `pageSize:1` count queries.
- **Punch review table** — status filter pills; inline "map to employee" for unmapped
  (employee picker via `hrCore.employees.list`); reprocess after mapping.
- **Exception review queue** — severity + type + status pills; resolve/dismiss/spawn-
  correction; manager sees only scoped rows.
- **Map/geofence placeholder** — coordinates + radius shown numerically; an honest "map
  view coming with a map library" note; never a fake/non-interactive map image. (Pick a
  map lib — MapLibre GL / Leaflet — as a later enhancement; flagged open question.)
- **Mobile employee check-in screen** — single primary action, geolocation permission
  prompt handling, clear inside/outside state, mandatory reason when outside, offline
  queue indicator.
- `EmptyState` for every no-access / empty surface; no raw enums; no fake-active toggles.

---

## 10. Integration points

- **Attendance** — primary: punch → `attendance_event` → `attendance_record` (the bridge,
  §5.2); reuse `recalculateRecord`, `attendance_correction`, `attendance_setting`.
- **Leave** — the processor/exception logic must not flag `absent`/`missing` when an
  **approved leave** covers the day (cross-check the leave module, as the existing
  readiness plan already does for payroll).
- **Payroll** — blockers/warnings from open exceptions feed the existing payroll-readiness
  check; only approved records are paid (§6).
- **Employee profile** — a "Devices/mapping" context (HR view of an employee's device
  user-ids) and the employee's own "My attendance / my check-ins" self-service.
- **Departments / locations** — `geofence_assignment` can target a **department**; a work
  site has an address; devices reference a work site.
- **Audit log** — every device/site/mapping CRUD, sync run, exception resolution, manual
  override, and punch reprocess writes an `audit_event` (the no-exception rule).
- **Future mobile app** — the GPS clock-in API is app-agnostic (browser first); the
  external sync-agent contract is the device bridge.
- **Future notification system** — sync-failure alerts, unmapped-punch alerts, exception
  assignment, and "you were clocked outside your site" employee notices (Phase 14).

---

## 11. Security / privacy

- **GPS is sensitive personal data.** Capture only on check-in/out; store on
  `geofence_check_in`; **retention policy**: raw lat/lon retained `gpsRetentionDays`
  (default **90**, per-org configurable) then scrubbed to the derived verdict
  (`inside`/`outside` + `matchedWorkSiteId` + `distanceMeters`), stamping
  `coordsPurgedAt`. Employees can see their **own** location history; managers see scoped
  reports; nobody sees cross-tenant.
- **Never store biometric templates.** Ingest only punch events: `deviceUserId`,
  `punchTime`, `direction`, `verifyMode` (the *method* enum). No fingerprint/face/iris
  template, image, or raw sensor data is ever requested, transmitted, or stored. This is
  the explicit design line that keeps us out of biometric-template regulation
  (GDPR Art. 9 / BIPA / PDPA). Documented as a hard constraint for 11C reviewers.
- **Device credentials encrypted / secret-managed.** `connectionConfig` secrets and the
  ingest API key are stored **encrypted at rest** (column-level encryption — same
  pre-prod track as the deferred payroll bank-details encryption; flag it) and the API
  key is stored only as a **hash**. Secrets are **never** returned to the client
  (masked on read), **never** logged, **never** put in audit `changes`.
- **Spoofing / tamper indicators.** `mockLocationFlag`, `low_gps_accuracy`,
  `impossible_travel`, and device `clock_drift` are captured and surfaced as advisory
  exceptions — never silent.
- **Audit on corrections / overrides.** Every manual map, reprocess, exception
  resolution, and override is audited with actor + reason.
- **Manager scope restrictions.** Two-layer authz (§8.4); managers strictly limited to
  direct reports.
- **Tenant FK verification.** Every FK (`deviceId`, `employeeId`, `workSiteId`,
  `departmentId`, `punchId`) is verified on `organizationId` before use — **no
  cross-tenant device/punch/location data leakage.**
- **ADMS push endpoint (when built)** must authenticate by registered device
  `serialNumber` allowlist + shared secret, validate `organizationId` from the device
  record, and be rate-limited — it is the one endpoint a device hits without a user
  session.
- **CSV import** is parsed defensively (no formula injection echoed back; size/row caps;
  per-row error rows become exceptions, not a failed whole batch).

---

## 12. Implementation sequence (11A–11H)

| Phase | Scope | Key gates |
|---|---|---|
| **11A** | **This spec + research** (done in this doc). No code. | docs only |
| **11B** | DB schema + seed: 8 new tables + 13 new enums in `packages/db/src/schema/biometric.ts` (+ extend `attendance_setting`); `drizzle generate` migration applied to postgres-central; `scripts/seed-biometric.ts` (Atlas Shipping: ~3 devices incl. one CSV + one virtual_kiosk, ~12 device-user maps, 2 work sites with assignments, ~30 punches across all statuses, ~10 geofence check-ins incl. outside/low-accuracy, ~8 exceptions across types/severities, a couple of sync runs). Reconcile the coord column type (§4.3). | build, `audit:permissions`, lint baseline |
| **11C** | Device sync/import API: `biometric` + `geofencing` oRPC routers (devices/mappings/sync/punch-ingest/CSV-import + sites/assignments/validate); **punch-ingest endpoint** (API-key auth) + **CSV import**; the **punch processor** (map→dedupe→geofence→event→recalc); new AC resources + RBAC helpers; document the **external sync-agent contract** + a reference script (not in-repo runtime). | `audit:permissions`, authenticated RPC tests (authz-before-existence) |
| **11D** | Biometric devices UI: `/app/biometrics` overview + devices list/detail (secrets masked) + sync-runs + punches; CSV upload; convert the flat `biometrics.tsx` stub to a folder. | Playwright + screenshots |
| **11E** | Punch review + exception queue: unmapped-punch mapping UI, `/app/attendance/exceptions` queue, resolve/dismiss/spawn-correction, manager scoping. | Playwright + screenshots |
| **11F** | Geofence locations + employee check-in: `/app/geofencing` sites/assignments (map placeholder), **mobile GPS check-in** screen with server-side validation + soft-block-with-reason + offline state; convert flat `geofencing.tsx` stub. | Playwright (incl. mobile viewport) + screenshots |
| **11G** | Attendance/payroll integration: wire the processor into `attendance_event`/`recalculateRecord`; payroll blockers/warnings from open exceptions in the readiness check; leave cross-check. | RPC + payroll-readiness verification |
| **11H** | QA/RBAC/security/browser pass (closes Phase 11): full role matrix, IDOR re-test, secret-masking audit, GPS retention check, no-template audit, lint/build/type/audit:permissions baselines. | all gates + browser matrix |

Verification is type-specific and mandatory each checkpoint (execution model): UI →
Playwright + screenshots under `docs/reviews/phase-11x/`; backend → authenticated RPC;
schema → migration. Commit/push/verify-clean-tree every checkpoint.

---

## 13. Open questions (with recommendations)

1. **Which biometric devices first?** → **ZKTeco/eSSL** (shared `pyzk` protocol, widest
   Caribbean install base). Anviz/COSEC/Dahua reserved in the enum, deferred.
2. **ZKTeco direct TCP/IP in MVP, or CSV first?** → **CSV import + punch-ingest API
   first**; ZKTeco pull via the **external sync-agent** (not our Bun server). Native TS
   pull and ADMS push are later. (§2.1)
3. **Mobile app now, or browser geolocation first?** → **Browser Geolocation API first**
   (works on mobile browsers in the existing web app); native app later.
4. **Should GPS check-in require a photo/selfie?** → **No in MVP**; schema reserves a
   nullable `selfieUrl`.
5. **Default radius?** → **150 m** radius, **100 m** accuracy threshold; both per-site
   configurable.
6. **Allow check-in outside the geofence with a reason?** → **Yes — soft block with a
   mandatory reason** + an `outside_geofence` exception for review (field-ops reality),
   not a hard reject. Per-site `allowOutsideWithReason` can switch to hard-block.
7. **How long to retain raw GPS?** → **90 days** raw (configurable), then scrub to the
   derived verdict.
8. **Device credentials in DB or external secrets?** → **Encrypted DB column** (the
   column-level-encryption pre-prod track), API key stored as a hash, secrets never
   returned/logged. (Self-hosted single-tenant could later opt into Infisical.)
9. **Should payroll block on unresolved exceptions?** → **Yes for `blocker` severity**
   (payroll blocker), **warn for `warning`** — via the existing readiness mechanism.
10. **Geofence tied to department, employee, shift, or location?** → tied to a **work
    site (location)** with `geofence_assignment.scope` = employee / department /
    organization; **shift-tied geofences deferred**.

**Additional open questions surfaced by research:**
11. **Map library** — defer (MapLibre GL vs Leaflet) to a UI enhancement; 11F ships a
    numeric coordinate placeholder, no fake map.
12. **Coordinate column type** — reconcile the existing `attendance_event` `text`
    lat/lon vs a `numeric(10,7)` ideal in 11B (§4.3); pick one, don't diverge.
13. **ADMS push** — build the public iclock receiver now or later? Recommend **later**;
    the ingest API + CSV cover the MVP and push needs a hardened public endpoint.

---

## 14. Research appendix (field-level findings + sources)

### 14.1 ERPNext / Frappe HR
- **Employee Checkin** doctype (raw log, separate from Attendance): `employee`, `time`,
  `log_type` (`""`/`IN`/`OUT`), `device_id`, `latitude`, `longitude`, `shift`,
  `skip_auto_attendance`, `attendance` (back-link), `offshift`. API
  `add_log_based_on_employee_field(employee_field_value, timestamp, device_id, log_type,
  latitude, longitude)` matches `employee_field_value` against `attendance_device_id`.
- **Shift Type auto-attendance pipeline:** `enable_auto_attendance`,
  `process_attendance_after`, `last_sync_of_checkin` (**watermark**, advanced +1 min
  after each shift window), `determine_check_in_and_check_out`
  (alternating vs strict log-type), `working_hours_calculation_based_on`,
  `late_entry_grace_period`, `early_exit_grace_period`,
  `working_hours_threshold_for_half_day` / `…_absent`. Runs hourly; enqueued for >1000
  logs. Status: absent < half-day < present (thresholds halved on half-holidays).
- **Shift Location** (native geofence): `location_name`, `latitude`, `longitude`,
  `checkin_radius`; linked to Shift Assignment; "Allow Geolocation Tracking" in HR
  Settings; **hard-blocks** check-in outside radius.
- **biometric-attendance-sync-tool:** Python daemon, `PULL_FREQUENCY`, per-device
  `{device_id, ip, punch_direction AUTO/IN/OUT, clear_from_device_on_fetch, latitude,
  longitude}`, `pyzk` `connect()/disable_device()/get_attendance()/enable_device()`,
  PickleDB `status.json` pull/push timestamps, `allowed_exceptions=[1,2,3]` (1 no
  employee, 2 inactive, 3 duplicate timestamp → non-fatal skip), pre-clear dump file for
  crash recovery.
- **Payroll:** "Calculate Payroll Working Days Based On" = Attendance; Absent → day
  removed, Half Day → fraction; `Consider Unmarked Attendance As` Present/Absent.
- Sources: github.com/frappe/hrms (employee_checkin.py, shift_type.py),
  github.com/frappe/biometric-attendance-sync-tool, docs.frappe.io/hr.

### 14.2 Horilla
- **Attendance** (`unique_together (employee_id, attendance_date)`):
  `attendance_validated`, `is_validate_request`, `request_type`
  (create/update/revalidate), `requested_data` (JSON), `approved_by`; worked hours as
  `"HH:MM"` **and** `at_work_second` int. **AttendanceActivity** (raw in/out:
  `in_datetime`, `clock_in`, `out_datetime`, `clock_out`).
  **AttendanceValidationCondition** (`auto_approve_ot`, `overtime_cutoff`).
  **AttendanceLateComeEarlyOut** (`unique (attendance_id, type)`), **GraceTime**
  (`allowed_clock_in`/`allowed_clock_out`).
- **BiometricDevices** (`machine_type` zk/anviz/cosec/dahua/etimeoffice, `machine_ip`,
  `port`, `zk_password`, api_url/key/secret for cloud, `is_live` vs `is_scheduler`,
  `scheduler_duration`, `last_fetch_date`/`last_fetch_time` **watermark**,
  `device_direction` in/out/alternate/system). **BiometricEmployees** maps
  `(device, user_id string)` → employee (`uid` device-serial secondary). Live capture =
  `threading.Thread` + `live_capture()`; scheduler = APScheduler pull filtered by
  watermark. Punch codes: in `{0,3,4}`, out `{1,2,5}`. Never clears device logs.
- **GeoFencing** (`latitude`, `longitude`, `radius_in_meters`, `start` flag,
  OneToOne company) validated with geopy `geodesic`; outside → HTTP 400, client gates.
  Separate IP allowlist (`AttendanceAllowedIP`).
- Sources: github.com/horilla-opensource/horilla (attendance/, biometric/,
  geofencing/).

### 14.3 Odoo `hr_attendance`
- `hr.attendance`: `check_in`/`check_out`, `worked_hours`, `overtime_hours`,
  `in_mode`/`out_mode` (`kiosk`/`systray`/`manual`), `in_latitude`/`in_longitude`
  (10,7, browser geolocation, read-only), `in_city`/`in_country_name` (IP-derived).
  Kiosk = unauthenticated URL + barcode/RFID/manual-select + optional PIN.
  **No native geofence enforcement** (OCA/commercial only). `hr.attendance.overtime`
  (`duration`, `adjustment` escape hatch). Payroll via `hr.work.entry`.
- Sources: github.com/odoo/odoo (17.0 hr_attendance), odoo.com/documentation/17.0.

### 14.4 OpenHRMS / Cybrosys
- ZKTeco uFace/iFace via `zklib`; per-employee "Biometric Device ID"; manual "Download
  Data"; **anti-pattern:** auto-creates employee for unknown device user-id (we will
  **not**). Community `ruuter/odoo-hr_zk_attendance_pyzk` normalises punch sequences.
- Sources: cybrosys.com biometric blog, openhrms.com biometric app.

### 14.5 ZKTeco / pyzk / ADMS
- **pyzk** (github.com/fananimi/pyzk): TCP **4370**, `get_attendance()` →
  `Attendance(user_id, timestamp, status, punch, uid)`, `live_capture()`,
  `get_users()`, `get_time()`/`set_time()`, `disable_device()` during read,
  `clear_attendance()` (**do not use** in prod). 40-byte pull record = serial, user_id
  string, verify_type (0 pwd/1 fingerprint/2 card), time, in/out state (0–5). **No
  template in the record.**
- **ADMS / iclock push:** device POSTs tab-separated `ATTLOG` to
  `/iclock/cdata?SN=…&table=ATTLOG` (UserID/Pin, DateTime, Status 0–5, VerifyMode,
  WorkCode); server replies `OK`; `/iclock/getrequest` for command polling. **No
  template transmitted.**
- Pull vs push trade-offs and "do not store templates / do not clear device logs / do
  not trust `uid` / correct for clock drift" gotchas: see §0.1 and §2.2.
- Sources: github.com/fananimi/pyzk, github.com/adrobinoga/zk-protocol,
  github.com/s0x90/zkteco-adms.
