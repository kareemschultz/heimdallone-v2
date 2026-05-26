# Biometric & Device Integration — Horilla Extraction

## Overview

Horilla's Biometric module manages physical attendance devices (ZKTeco/eSSL, Anviz, Matrix COSEC, Dahua, eTimeOffice). Each device is registered with connection credentials, can be scheduled for automatic data fetch, and maps device user IDs to employees. Raw punch events from devices feed into the Attendance module's AttendanceActivity records.

## Horilla Files Inspected

- `biometric/models.py` (302 lines) — BiometricDevices, BiometricEmployees, COSECAttendanceArguments

## Important Models

**BiometricDevices** — Device registration. Fields: name, machine_type (zk/anviz/cosec/dahua/etimeoffice), machine_ip, port, zk_password, bio_username, bio_password, anviz_request_id, api_url, api_key, api_secret, api_token, api_expires, is_live (bool), is_scheduler (bool), scheduler_duration (HH:MM), last_fetch_date, last_fetch_time, device_direction (in/out/alternate/system), company FK. UUID primary key.

Different device types require different credentials:
- ZKTeco: IP + port + numeric password
- Anviz: API URL + key + secret (cloud-based)
- COSEC/Dahua: IP + port + username + password
- eTimeOffice: API-based

**BiometricEmployees** — Maps device users to system employees. Fields: uid, ref_user_id, user_id (string from device), dahua_card_no, employee FK, device FK. UUID primary key.

**COSECAttendanceArguments** — COSEC-specific sync state. Fields: last_fetch_roll_ovr_count, last_fetch_seq_number, device FK.

## Heimdallone-native Interpretation

### Drizzle Entity Candidates

- `biometric_device` — id (uuid), organizationId, name, deviceType (enum), connectionConfig (JSON — IP, port, credentials), direction (in/out/alternate), isLive, isScheduled, scheduleIntervalMinutes, lastSyncAt, lastSyncStatus, isActive
- `biometric_employee_mapping` — deviceId FK, employeeId FK, deviceUserId (string), mappedAt, status (mapped/unmapped)
- `biometric_sync_log` — deviceId FK, syncStartedAt, syncCompletedAt, eventsImported, eventsFailed, errors (JSON)
- `raw_punch_event` — deviceId FK, deviceUserId, punchTime, direction (in/out), processedAt, attendanceEventId FK (nullable), status (pending/processed/unmapped/error)

### Proposed oRPC Routers

- `biometric.devices` — CRUD, test connection, sync now
- `biometric.mappings` — Map/unmap employees to device user IDs
- `biometric.sync` — Trigger sync, view sync history, view raw events
- `biometric.unmapped` — Queue of unmapped punch events for resolution

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/settings/devices` — Device registry and management
- `/app/settings/devices/$id` — Device detail (mappings, sync history, raw events)

### Staff-Friendly UX Notes
- Device setup wizard: Step-by-step (Select type → Enter credentials → Test connection → Map employees)
- Sync status dashboard: Show last sync time, events count, errors
- Unmapped event queue: "3 punch events couldn't be matched to employees" with resolution actions
- Clear error messages: "Connection to device 'Front Door ZK' failed — check IP address and port"

## Priority

**P2** — Required for automated attendance but not for initial launch. Manual attendance check-in works without biometric.
