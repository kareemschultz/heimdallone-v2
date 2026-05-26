# Geofencing — Horilla Extraction

## Overview

Horilla's Geofencing module is minimal: a single GeoFencing model that stores latitude, longitude, and radius per company. When enabled (`start=True`), it validates check-in locations against the configured geofence. Only one geofence per company (OneToOne).

## Horilla Files Inspected

- `geofencing/models.py` (54 lines) — GeoFencing model

## Important Models

**GeoFencing** — Fields: latitude, longitude, radius_in_meters, company FK (OneToOne, nullable), start (bool — enabled/disabled). Uses `geopy.Nominatim` for coordinate validation. Only one record can have null company (global default).

## Heimdallone-native Interpretation

Heimdallone should significantly expand on Horilla's basic geofencing:

### Drizzle Entity Candidates

- `work_site` — organizationId FK, name, address, latitude, longitude, radiusMeters, isActive, createdBy FK
- `employee_work_site` — employeeId FK, workSiteId FK, isDefault — which sites an employee can check into
- `check_in_location_log` — attendanceEventId FK, latitude, longitude, accuracy, withinGeofence (bool), workSiteId FK (matched), distance (meters from center)

### Proposed oRPC Routers

- `geofencing.sites` — CRUD work sites with map preview
- `geofencing.assignments` — Assign employees to allowed sites
- `geofencing.validate` — Check if lat/lon is within any allowed site for employee

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/settings/work-sites` — Work site management with map view
- `/app/attendance` — Check-in shows location status (inside/outside geofence)

### View Modes
- **Map + list dual view**: Map showing all work sites with radius circles, list panel beside it
- **Employee assignment**: Table showing which employees are assigned to which sites

### Staff-Friendly UX Notes
- "Why was my check-in blocked?" — Clear message: "You're 250m from 'Main Office'. You need to be within 100m to check in. Contact HR if you're at an approved location."
- Override approval: Manager can approve out-of-zone check-ins
- Map-based site creation: Click on map to set center, drag to adjust radius
- Mobile consideration: Expo app will capture GPS for check-in (future)

## Priority

**P2** — Enhances attendance accuracy but not required for basic operation.
