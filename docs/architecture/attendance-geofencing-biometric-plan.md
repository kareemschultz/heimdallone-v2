# Attendance, Geofencing, and Biometric Plan

Attendance tracking is event-driven. Raw events (punches) flow through a validation pipeline into approved records that feed payroll. Geofencing and biometric devices are input sources — they produce the same event type as web or mobile check-ins.

---

## Event Model

```
Raw Event (attendance_events)
  ↓ validation pipeline
Validated Record (attendance_records)
  ↓ manager/HR approval
Approved Record (work_records / overtime_records)
  ↓ payroll
Work hours included in payroll run
```

No raw event directly affects payroll. Events must pass through validation and approval before they are payroll-eligible.

---

## Event Sources

| Source | Value in `attendance_events.source` | Platform |
|---|---|---|
| Web browser check-in | `web_checkin` | `apps/web` |
| Mobile app check-in | `mobile_checkin` | `apps/native` |
| Biometric device punch | `biometric_import` | Pulled from device via import job |
| Geofence auto-check | `geofence_auto` | Mobile GPS triggers auto-event |
| Manual HR entry | `manual_entry` | HR corrects or adds a record directly |

---

## Attendance States

Every `attendance_records` row carries a `state` field:

| State | Meaning |
|---|---|
| `present` | Employee clocked in and out within expected shift window |
| `absent` | No attendance event recorded for the day; shift was scheduled |
| `half_day` | Employee worked less than half the expected shift hours |
| `on_leave` | Day covered by an approved leave request |
| `holiday` | Day is a company or public holiday in the employee's calendar |
| `conflict` | System detected inconsistency (e.g. two consecutive check-ins with no check-out) |

The validation pipeline sets the state. Conflicts must be resolved by HR or the employee before the record moves to approved.

---

## Validation Pipeline

Runs on demand or on a scheduled job after each working day closes.

```
Input: attendance_events for a given employee + date
  ↓
1. Pair check-in / check-out events (handle missing check-out)
2. Calculate worked hours
3. Compare against shift definition (expected start, end, duration)
4. Apply attendance_policies (grace period, late threshold)
5. Detect conflicts (duplicate events, reversed in/out, impossible durations)
6. Determine state (present / absent / half_day / conflict)
7. Write attendance_records row
  ↓
Output: attendance_records row with state set
```

### Policy application

`attendance_policies` define per-org (or per-shift) rules:

| Policy field | Description |
|---|---|
| `grace_period_minutes` | Minutes after shift start before an arrival is marked late |
| `late_threshold_minutes` | Minutes late before half-day is triggered |
| `minimum_hours_for_present` | Hours worked required to count as present |
| `minimum_hours_for_half_day` | Hours worked to qualify as half-day |
| `overtime_threshold_minutes` | Minutes beyond shift end before overtime starts accruing |

---

## Approval Workflow

After the validation pipeline runs, records move through an approval flow:

```
attendance_records.state = present/half_day
  ↓ (manager or auto-approve if policy allows)
work_records row created (approved hours)
  ↓ (if hours > shift hours)
overtime_records row created (pending OT approval)
  ↓ (separate OT approval by manager/HR)
overtime_records.state = approved
```

Conflicts must be resolved before approval. Absent records with no leave coverage may trigger a notification to the employee and manager.

---

## Leave Module Integration

The attendance pipeline checks `leave_requests` before marking a day as absent:

```
No attendance event for date X
  ↓
Check: does employee have approved leave_request covering date X?
  Yes → state = on_leave
  No  → Check: is date X in holiday_calendars for employee's country/location?
         Yes → state = holiday
         No  → state = absent
```

---

## Biometric Integration

### Device registry (`biometric_devices`)

| Field | Description |
|---|---|
| `id` | UUID |
| `organization_id` | Tenant FK |
| `name` | Human-readable device name |
| `ip_address` | Device IP on local network |
| `port` | Device SDK port (typically 4370 for ZKTeco) |
| `device_type` | `zkteco`, `anviz`, `suprema`, `other` |
| `location_id` | FK to `locations` — where is the device installed |
| `status` | `active`, `offline`, `error` |
| `last_seen_at` | Timestamp of last successful poll |

### Employee-device mapping (`biometric_employee_mappings`)

| Field | Description |
|---|---|
| `device_id` | FK to `biometric_devices.id` |
| `employee_id` | FK to `employees.id` |
| `device_user_id` | User ID as stored on the device (integer, device-specific) |
| `enrolled_at` | When the mapping was created |

### Import jobs (`biometric_import_jobs`)

Import jobs pull raw punch records from a device and write them as `attendance_events` with `source = biometric_import`.

| Field | Description |
|---|---|
| `device_id` | FK to `biometric_devices.id` |
| `status` | `pending`, `running`, `complete`, `failed` |
| `scheduled_at` | When the job is scheduled to run |
| `started_at` | Actual start time |
| `completed_at` | Completion time |
| `records_pulled` | Count of raw records fetched from device |
| `records_imported` | Count successfully written to `attendance_events` |
| `error_message` | Failure detail if status = failed |

### Import flow

```
Scheduled job triggers → connect to biometric_device via SDK/API
  ↓
Pull punch records since last_imported_at
  ↓
Match device_user_id to employees via biometric_employee_mappings
  ↓
Write attendance_events rows (source = biometric_import)
  ↓
Update biometric_import_jobs record with result
  ↓
Validation pipeline picks up new events on next run
```

Biometric device connectivity is not real-time. Polling intervals are configurable per device (e.g. every 15 minutes, every hour).

---

## Geofencing Integration

### Zone definitions (`geofence_zones`)

| Field | Description |
|---|---|
| `id` | UUID |
| `organization_id` | Tenant FK |
| `name` | Zone name (e.g. "Head Office", "Warehouse A") |
| `location_id` | FK to `locations` |
| `latitude` | Center latitude (decimal degrees) |
| `longitude` | Center longitude (decimal degrees) |
| `radius_meters` | Allowed radius from center for a valid check-in |

### Zone assignments (`geofence_zone_assignments`)

Links zones to employees or departments. An employee in an assigned zone must be within the zone's radius at check-in time.

| Field | Description |
|---|---|
| `zone_id` | FK to `geofence_zones.id` |
| `target_type` | `employee` or `department` |
| `target_id` | FK to `employees.id` or `departments.id` |

### Geofence events (`geofence_events`)

Written alongside the `attendance_events` row when a mobile check-in includes GPS data.

| Field | Description |
|---|---|
| `attendance_event_id` | FK to `attendance_events.id` |
| `latitude` | GPS latitude at check-in |
| `longitude` | GPS longitude at check-in |
| `accuracy_meters` | Device-reported GPS accuracy |
| `within_zone` | Boolean — was the employee inside the required zone |
| `zone_id` | FK to `geofence_zones.id` (nullable if no zone assigned) |

### Mobile check-in flow (Expo `apps/native`)

```
Employee taps Check In
  ↓
Native GPS requested (react-native-location or expo-location)
  ↓
GPS coordinates sent to server with check-in request
  ↓
Server fetches geofence_zone_assignments for employee
  ↓
Server calculates distance from zone center using Haversine formula
  ↓
If outside zone radius → reject check-in (or warn, configurable)
  ↓
Write attendance_events + geofence_events rows
```

GPS validation runs on the server — never trust client-side zone validation only.

---

## Web Check-In

Web check-in (`apps/web`) does not validate geofencing by default (no GPS in desktop browsers). If geofencing is required for web, the policy must explicitly enable browser Geolocation API with a warning that accuracy is lower.

Web check-in writes `attendance_events` with `source = web_checkin` and no associated `geofence_events` row.

---

## Conflict Resolution

When `attendance_records.state = conflict`, the system:

1. Notifies the employee (if notification preferences allow)
2. Notifies the employee's manager
3. Blocks the record from moving to `work_records` until resolved
4. Provides HR with a conflict queue view

Resolution options:
- Employee submits correction (manual in/out times)
- HR overrides directly (`attendance:override` permission required)
- Record is marked as absent if no correction is made by a configurable deadline

---

## Implementation Constraints

- Geofencing GPS validation must run server-side. Never trust the client's within-zone calculation.
- Biometric import jobs must be idempotent. Importing the same punch twice must not create duplicate `attendance_events` rows (use device + device_user_id + timestamp as unique key).
- Attendance validation is not real-time. It runs as a job after the working day ends or on demand.
- Do not implement biometric device SDK integrations until Phase 13. Phase 7 covers the core event/record/approval model.
- Do not implement geofencing until Phase 13. Phase 7 can accept `latitude`/`longitude` fields on `attendance_events` without zone validation logic.
