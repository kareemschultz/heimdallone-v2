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

---

## Payroll Readiness and Time Evidence Pipeline

> Added Phase 6E (2026-05-27). Defines how biometric/geofence data feeds into attendance and ultimately payroll.

### Evidence Pipeline

```
Biometric Punch (K40/Anviz/COSEC/Dahua)
    │
    ├── Device sync → raw_punch_event (pending)
    │
    ├── Employee mapping → match deviceUserId → employeeId
    │     │
    │     ├── Mapped → attendance_event created (source: biometric)
    │     └── Unmapped → raw_punch_event (status: unmapped) → resolution queue
    │
    └── attendance_event feeds into attendance pipeline
         (see attendance-spec.md: Payroll Readiness Pipeline)

Geofence Check-In (mobile GPS)
    │
    ├── Location captured → check_in_location_log
    │
    ├── Validate against employee's allowed work sites
    │     │
    │     ├── Within radius → attendance_event created normally
    │     └── Outside radius → exception created, manager approval required
    │
    └── Override approved → attendance_event created with geofence_override flag
```

### Rules

1. **Biometric punches are raw evidence** — they prove a device registered a user at a time. They do NOT directly create payable hours.
2. **Unmapped punches are quarantined** — they cannot affect attendance or payroll until mapped to an employee.
3. **Device clock drift must be handled** — if device time differs from server by >5 minutes, flag as exception.
4. **Duplicate biometric punches** — same user, same device, within 2 minutes: deduplicate, keep first.
5. **Geofence violations block attendance** — unless manager explicitly overrides.
6. **GPS accuracy affects geofence validation** — if accuracy > 100m, warn but don't block (buildings can degrade GPS).
7. **All evidence is auditable** — raw punches, geofence logs, and overrides are never deleted.

### Device Health and Payroll Impact

| Status | Meaning | Payroll Impact |
|--------|---------|---------------|
| Live (synced < 1h ago) | Device working normally | None — punches flowing |
| Stale (synced 1-24h ago) | Possible connectivity issue | Warning: "Some punches may be delayed" |
| Offline (synced > 24h ago) | Device disconnected | Alert: "No biometric data from {device}. Employees must clock in manually." |
| Sync error | Last sync had errors | Warning: "{N} punches failed to import" |

### Unmapped Event Resolution

- Queue shows: device name, device user ID, punch time, direction
- Resolution: map device user to employee (one-time, persists for future punches)
- Batch resolution: "Auto-map by employee badge number" if convention matches
- Unresolved after N days: escalate to HR with reminder

### Quality-of-Life Requirements (Biometric/Geofencing)

- **Device dashboard**: map view of locations, color-coded by health
- **Sync status**: last sync time, events imported, errors — always visible
- **Setup wizard**: select device type → enter credentials → test connection → map employees
- **Unmapped queue**: badge count on sidebar, inline resolution
- **Map-based site creation**: click to place center, drag to set radius
- **Employee-facing**: "You checked in from {location}. Within range of {site name}." or "Outside range — notify your manager."
- **Override audit trail**: every geofence override logged with who approved and why
