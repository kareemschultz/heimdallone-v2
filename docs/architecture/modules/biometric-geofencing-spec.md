# Biometric & Geofencing Module Specification

## Purpose

Manages physical attendance devices (ZKTeco, Anviz, COSEC, Dahua, eTimeOffice), imports raw punch events, maps device users to employees, and validates check-in locations against geofence zones. Feeds into the Attendance module.

## Source References

- `docs/horilla-extraction/biometric.md` — Device types, sync, mapping
- `docs/horilla-extraction/geofencing.md` — Location validation

## Dependencies

- **HR Core** (P0) — employee_profile
- **Attendance** (P1) — attendance_event (biometric creates events)

## First Version Scope

### Biometric
- Device registry (name, type, connection config, direction, company)
- Employee-device user mapping (map device user IDs to employee profiles)
- Manual sync trigger (fetch events from device on demand)
- Scheduled sync (configurable interval)
- Sync log (started, completed, events imported, errors)
- Raw punch event queue (pending, processed, unmapped, error)
- Unmapped event resolution UI (match device users to employees)

### Geofencing
- Work site registry (name, address, lat/lon, radius)
- Employee-to-site assignment (which sites an employee can check into)
- Location validation during check-in (compare GPS against allowed sites)
- Override approval (manager approves out-of-zone check-in)

## Deferred Scope

- Live device status monitoring
- Device firmware update tracking
- Multi-device per employee
- Geofence polygon zones (non-circular)
- Mobile check-in via Expo app (captures GPS)
- Offline punch queue (device disconnected, queue until reconnected)
- Face detection integration

## Proposed Entities

### `biometric_device`
- **Key fields**: id (uuid), organizationId, name, deviceType (zk/anviz/cosec/dahua/etimeoffice — pgEnum), connectionConfig (jsonb — IP/port/credentials), direction (in/out/alternate — pgEnum), isScheduled (bool), scheduleIntervalMinutes (int), lastSyncAt (timestamp, nullable), lastSyncStatus (text), isActive (bool)
- **Sensitive**: Connection credentials in jsonb — encrypt at rest, never expose via API

### `biometric_employee_mapping`
- **Key fields**: id, deviceId (FK), employeeId (FK), deviceUserId (text), mappedAt (timestamp)
- **Unique**: (deviceId, deviceUserId)

### `biometric_sync_log`
- **Key fields**: id, deviceId (FK), startedAt, completedAt, eventsImported (int), eventsFailed (int), errors (jsonb)

### `raw_punch_event`
- **Key fields**: id, deviceId (FK), deviceUserId (text), punchTime (timestamp), direction (in/out, nullable), status (pending/processed/unmapped/error — pgEnum), attendanceEventId (FK, nullable), processedAt (timestamp, nullable)

### `work_site`
- **Key fields**: id, organizationId, name, address, latitude (numeric), longitude (numeric), radiusMeters (int), isActive (bool)

### `employee_work_site`
- **Key fields**: id, employeeId (FK), workSiteId (FK), isDefault (bool)

### `check_in_location_log`
- **Key fields**: id, attendanceEventId (FK), latitude (numeric), longitude (numeric), accuracyMeters (numeric), withinGeofence (bool), matchedWorkSiteId (FK, nullable), distanceMeters (int)

## Proposed UI Routes

### `/app/settings/devices` — Device registry with test connection, sync now
### `/app/settings/devices/$id` — Device detail (mappings, sync log, raw events)
### `/app/settings/work-sites` — Work site map + list view
### `/app/attendance` — Check-in shows location status (inside/outside geofence)

## Staff-Friendly UX

- **Device setup wizard**: Select type → Enter credentials → Test connection → Map employees
- **Sync status dashboard**: Last sync, events count, errors, "Sync Now" button
- **Unmapped event queue**: "3 punches couldn't be matched. Click to resolve." → match device user to employee
- **Clear error messages**: "Connection to 'Front Door ZK' failed — check IP address and port"
- **"Why was check-in blocked?"**: "You're 250m from Main Office. You need to be within 100m. Contact HR if you're at an approved location."
- **Map-based site creation**: Click on map to set center, drag to adjust radius

## Risks and Edge Cases

1. Device connectivity — network failures during sync, partial imports
2. Duplicate punches — same employee punches twice in 1 minute
3. Unmapped users — new employee on device not yet mapped in system
4. Clock drift — device time differs from server time
5. Geofence accuracy — GPS accuracy on mobile can be 50m+ in buildings

## Implementation Readiness

**Needs HR Core + Attendance**. Device integration requires network access to physical devices. Geofencing requires GPS-capable clients (mobile app).
