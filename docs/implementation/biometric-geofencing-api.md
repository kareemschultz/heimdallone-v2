# Biometric + Geofencing API + Processor — Phase 11C

API layer + punch processor for the Biometric/Geofencing module. **No UI yet**
(11D). Builds on the 11B schema. Native ZKTeco TCP pull and ADMS push are
**deferred** — the MVP integration surface is CSV/file import + an authenticated
API-ingest endpoint + the source-agnostic processor.

## Files

- `packages/api/src/routers/biometric.ts` — the `biometric` oRPC router.
- `packages/api/src/utils/attendance-adapters.ts` — device adapter/provider model.
- `packages/api/src/utils/biometric-processor.ts` — punch → event → record processor.
- `packages/api/src/utils/geofence.ts` — great-circle distance + work-site resolution.
- `packages/api/src/utils/attendance-recalc.ts` — shared recalc (extracted from
  the attendance router so processor + router share one implementation).
- `packages/auth/src/permissions.ts` — 4 new AC resources + grants.
- `packages/api/src/utils/role-helpers.ts` + `apps/web/src/lib/rbac.ts` — 6 helpers.
- `scripts/verify-biometric-api.ts` — processor/adapter/geofence verification.

## Device adapter / provider model

The pipeline is **vendor-agnostic**. A device's `(vendor, mode)` resolves to an
adapter (`attendance-adapters.ts`). Adapters normalize imported rows into
`NormalizedPunch[]`; the processor never branches on vendor.

| providerKey | vendor | live status | notes |
|---|---|---|---|
| `generic_csv` | generic | supported (file) | canonical CSV import |
| `generic_excel` | generic | supported (file) | Excel exported as CSV/TSV |
| `generic_api` | generic | supported (live) | the `/ingest` endpoint |
| `zkteco_tcp` | zkteco | **planned** | native TCP pull not built; use agent→ingest or CSV |
| `zkteco_adms` | zkteco | **planned** | ADMS/iClock push receiver not built |
| `ngteco_cloud` | ngteco | **planned** | cloud API needs vendor verification + prod secrets; manual export works |
| `ngteco_app` | ngteco | supported (file) | NGTeco app export upload |
| `ngteco_kseries` | ngteco | supported (file) | K-series WiFi/TCP/USB → file import |

`AttendanceDeviceAdapter` interface: `providerKey`, `displayName`, `vendor`,
`status`, `supportedModes`, `capabilities`, `parseImportRows(text)`,
`validateDeviceConfig(config)`, `getConnectionStatus()`. `getAdapter(key)` /
`listAdapters()` are the registry. Planned adapters report
`getConnectionStatus().live === false` — **we never fake live sync.**

**NGTeco reality (documented):** many small-business NGTeco cloud/app clocks do
not expose a public local/cloud API. Supported paths are manual CSV/Excel app
export, USB export (K-series), and periodic file import. A live cloud adapter is
gated behind official-API + production secret storage.

## AC resources (added to `permissions.ts`) — audit:permissions 62→73

| Resource | Actions | Granted to |
|---|---|---|
| `attendance_device` | read, manage, sync | owner/admin/hr: all; manager/auditor/payroll: read |
| `attendance_punch` | read, process, import | owner/admin/hr: all; manager/auditor/payroll: read |
| `geofence` | read, manage, check_in | owner/admin/hr: all; manager/payroll/employee: read+check_in; auditor: read |
| `attendance_exception` | read, resolve | owner/admin/hr: read+resolve; manager: read+resolve (scoped); auditor/payroll: read |

RBAC helpers (backend + frontend mirror): `canManageBiometrics`,
`canViewBiometrics`, `canManageGeofencing`, `canViewGeofencing`,
`canUseGeofenceCheckIn`, `canReviewAttendanceExceptions`.

**Self-service note:** `checkIns.createSelf` uses `authorizedProcedure("geofence",
"check_in")` — a dedicated action the **employee role holds** — with per-employee
self-scope inside the handler. It is auditable and reachable (not behind a
manage-only gate — the offboarding `documents.markUploaded` trap is avoided).

## Router (`biometric`)

- **devices** — `list` / `getById` (secrets stripped; adapter status attached) /
  `create` (returns a one-time `ingestApiKey` for api_ingest devices) / `update` /
  `rotateIngestKey` / `archive` / `testConnection` (honest adapter status, no real
  network call) / `adapters` (registry listing).
- **mappings** — `list` / `create` (unique `(device, deviceUserId)`) / `delete`.
- **syncRuns** — `list` / `getById`.
- **punches** — `list` (status filter; manager-scoped) / `importRows` (parse via
  adapter → stage punches with idempotency keys → sync-run summary; optional
  `process=true`).
- **processor** — `run` (processes all pending org punches).
- **ingest** — `submit` (**public, device-auth**): `deviceId` + `apiKey` (verified
  against `apiKeyHash`); org derived from the device; rejects biometric-template
  payloads; row-count capped; dedup by idempotency key; never logs/returns secrets.
- **geofences** — `list` / `getById` / `create` / `update` / `archive`.
- **assignments** — `list` / `create` / `delete` (employee/department/org scope).
- **checkIns** — `createSelf` (self-scoped GPS clock-in; server-side great-circle;
  soft-block-outside-with-reason; creates a check-in + a staged mobile punch +
  exceptions for outside/low-accuracy/mock-location) / `listSelf`.
- **exceptions** — `list` / `getById` / `acknowledge` / `resolve` / `dismiss`
  (resolve/dismiss require a note; manager-scoped).

## Punch processor (`processPendingPunches(orgId)`)

Source-agnostic, idempotent. For each `pending`/`unmapped` punch:
1. resolve employee via `attendance_device_employee_map` (stable `deviceUserId`);
2. unmapped → mark `unmapped` + open `unmapped_punch` **blocker** exception;
3. ensure the daily `attendance_record` stub exists;
4. `in`/unknown → new `attendance_event` (`source` = biometric/mobile/import);
   `out` → close the latest open event (or `out_of_window` warning if none);
5. `recalculateRecord(...)` (shared util);
6. post-pass: `missing_clock_out` blockers for prior-day open events;
   `clock_drift` info exceptions for devices over the drift threshold.

**Invariants:** raw punches are never paid; payroll reads approved
`attendance_record` only; re-running creates **no** duplicate events (processed
punches carry `createdAttendanceEventId` and are skipped). `unmapped` punches are
re-examined each run so a later mapping resolves them.

## Privacy / security

- **No biometric templates.** Ingest/import reject any payload key resembling a
  template (`containsBiometricTemplate`). Only punch events + verification METHOD.
- **No plaintext secrets returned.** `apiKeyHash` (hash) and `credentialRef`
  (encrypted-secret pointer) are stripped from every device response
  (`publicDevice`). The ingest key is shown once on create/rotate, never stored
  plaintext, never logged.
- **Tenant-scoped everything** via `verify*` helpers; manager lateral scope on
  punches/exceptions; auditor read-only.
- **Rate limiting** on the public `/ingest` endpoint is **deferred** (documented);
  payload row-count is capped (`MAX_INGEST_ROWS = 5000`).
- **GPS retention** enforcement (scrub raw lat/lon after `gpsRetentionDays`) is
  **deferred to 11G**; the columns + `coordsPurgedAt` exist.

## Verification (observed — `scripts/verify-biometric-api.ts`)

All checks pass: adapter parsing (generic CSV + NGTeco Title-Case headers; planned
adapters report `live=false`); great-circle math + inside/outside/low-accuracy/
unverified evaluation; privacy guard (rejects fingerprint-template payload);
processor end-to-end on seeded data (5 processed, 1 quarantined unmapped, biometric
`attendance_event` rows created, Maya's record = 452 worked minutes); processor
**idempotent** (no new events on re-run; 0 processed second time); open
`unmapped_punch` blocker exception present.

Gates: check-types 3/3, web build ✓, ultracite **224/1/2 baseline unchanged**,
**audit:permissions 73 pairs / 10 routers PASS**.

**Deferred to 11D browser pass / live RPC:** RBAC 403 matrix, ingest API-key auth
round-trip, check-in self-scope, secret-stripping in live responses.

## Next

**Phase 11D — Biometric devices UI** (`/app/biometrics` overview + devices
list/detail with secrets masked + sync-runs + punches; CSV upload; convert the
flat `biometrics.tsx` stub to a folder route).
