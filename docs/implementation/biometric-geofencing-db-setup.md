# Biometric + Geofencing DB Setup — Phase 11B

Database foundation for the Biometric attendance + Geofenced check-in module.
Implements the schema decided in
[../architecture/biometric-geofencing-implementation-plan.md](../architecture/biometric-geofencing-implementation-plan.md)
(§2–§5). **DB only** — no API, no UI, no device sync, no GPS capture, no payroll
integration (those are 11C–11G).

## Files

- `packages/db/src/schema/biometric.ts` — 8 tables + 13 enums + relations.
- `packages/db/src/schema/attendance.ts` — `attendance_setting` extended with 6
  additive policy columns (safe defaults).
- `packages/db/src/schema/index.ts` — barrel re-exports `./biometric`.
- `packages/db/src/migrations/0011_early_lady_vermin.sql` — generated + applied.
- `scripts/seed-biometric.ts` — Atlas Shipping demo data (re-runnable).

## Enums (13)

| Enum | Values |
|---|---|
| `attendance_device_type` | zkteco, anviz, cosec, dahua, generic, virtual_kiosk |
| `attendance_device_mode` | csv_import, api_ingest, zkteco_tcp_planned, adms_push_planned, manual |
| `attendance_device_status` | active, inactive, error |
| `attendance_device_direction` | in, out, alternate, system |
| `attendance_sync_status` | running, success, partial, failed |
| `attendance_punch_direction` | in, out, unknown |
| `attendance_punch_status` | pending, processed, unmapped, duplicate, error |
| `attendance_verify_mode` | fingerprint, face, card, password, mobile_gps, manual, unknown |
| `geofence_assignment_scope` | organization, department, employee |
| `geofence_check_status` | inside, outside, low_accuracy, unverified |
| `attendance_exception_type` | unmapped_punch, duplicate_punch, missing_clock_out, outside_geofence, low_gps_accuracy, clock_drift, spoofing_suspected, device_error, out_of_window |
| `attendance_exception_status` | open, in_review, resolved, dismissed |
| `attendance_exception_severity` | info, warning, blocker |

> `attendance_device_mode` is reused for the sync-run `mode` column. `verify_mode`
> values name the verification METHOD only — no biometric template is stored.

## Tables (8 new)

1. **geofence_location** — work site (lat/lon `numeric(10,7)`, `radius_meters`,
   `accuracy_threshold_meters`, `allow_outside_with_reason`, `is_active`).
   Unique `(organization_id, name) WHERE deleted_at IS NULL`.
2. **attendance_device** — device/import-source registry. `mode`, `device_type`,
   `vendor`/`model`/`serial_number`, `work_site_id`, `direction`, `time_zone`,
   `clock_offset_seconds`, `last_sync_cursor`/`last_sync_status`, `status`.
   **Secrets:** `api_key_hash` (hash only), `credential_ref` (encrypted-secret
   pointer — never plaintext). Unique `(organization_id, serial_number)` where serial
   not null & not deleted.
3. **attendance_device_employee_map** — `(device, device_user_id string)` → employee.
   Unique `(device_id, device_user_id) WHERE deleted_at IS NULL`. Maps on the stable
   `device_user_id`, not the resettable serial index.
4. **attendance_device_sync_run** — one row per ingest batch; counts
   (fetched/created/duplicate/unmapped/error), `status`, `error_summary`, cursor span.
5. **attendance_punch** — **raw staging** (ERPNext Employee Checkin equivalent).
   `punch_time`, `direction`, `verify_mode`, `source`, `processing_status`,
   `idempotency_key`, `created_attendance_event_id`, `raw_payload`. Idempotency:
   unique `(organization_id, idempotency_key) WHERE deleted_at IS NULL`.
6. **geofence_assignment** — site → employee/department/organization (`scope`),
   `is_default`.
7. **geofence_check_in** — per-check-in GPS evidence (lat/lon nullable,
   `accuracy_meters`, `matched_work_site_id`, `distance_meters`, `status`,
   `mock_location_flag`, `impossible_travel_flag`, `reason`, `selfie_url` reserved,
   `coords_purged_at` for retention scrub).
8. **attendance_exception** — the review queue. `type`, `severity`, `status`,
   `detail`, resolution fields, `correction_id` (→ existing `attendance_correction`).

### `attendance_setting` additive columns (Phase 11 policy)

`enable_geofenced_check_in` (false), `default_geofence_radius_meters` (150),
`default_geofence_accuracy_meters` (100), `clock_drift_threshold_seconds` (300),
`gps_retention_days` (90), `block_payroll_on_open_exceptions` (true). All
`NOT NULL DEFAULT` → safe migration for existing rows.

## Reused (not forked)

`attendance_event` (the processed event — already has `source` incl.
biometric/mobile/import, `device_id`, `location_lat/lon`), `attendance_record`
(payroll-gated by `payroll_status`), `attendance_correction` (review flow),
`employee_profile`, `department`, `user`, `organization`, `attendance_source` enum.

## Invariants (partial unique indexes)

- `att_punch_idem_uq` — punch idempotency (NULL-safe single key, dedupes every source).
- `att_dev_map_device_user_uq` — one mapping per `(device, device_user_id)`.
- `attendance_device_org_serial_uq` — one serial per org (ADMS SN match).
- `geofence_location_org_name_uq` — one site name per org.

Every table carries a tenant `organization_id` index (+ status/type/employee/device
indexes as appropriate).

## Commands

```bash
# generate (diffs schema vs migration snapshots — no DB needed)
bun run db:generate

# apply to postgres-central
bun run db:migrate

# seed Atlas Shipping demo data (re-runnable; clears its own org rows first)
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-biometric.ts
```

## Seed counts (Atlas Shipping)

```
geofence_location:               2   (Main Office, Warehouse / Port)
attendance_device:               2   (Main Office Terminal api_ingest, Warehouse Gate csv_import)
attendance_device_employee_map:  5   (1 device user-id left intentionally UNMAPPED)
geofence_assignment:             3   (org default + department + per-employee)
attendance_device_sync_run:      2   (1 success, 1 partial w/ unmapped)
attendance_punch:                8   (normal in/out, duplicate, missing-out, error, unmapped, 2 mobile)
geofence_check_in:               3   (inside, outside-with-reason, low_accuracy)
attendance_exception:            5   (blocker×2, warning×2, info×1; open×3, resolved×1, dismissed×1)
```

## Verification (observed)

- Migration `0011_early_lady_vermin.sql` generated (13 enums, 8 tables, 6 additive
  `attendance_setting` columns, **0 destructive statements**) and applied to
  postgres-central (`migrations applied successfully`).
- Seed runs; all 8 table counts non-zero as above.
- **Idempotency constraint enforced** — the seed's negative test re-inserts a seen
  `(org, idempotency_key)` and confirms the DB rejects it (`att_punch_idem_uq ENFORCED ✓`).
- **Privacy** — the seed introspects `information_schema.columns` for the 8 tables and
  asserts **no** `template`/`fingerprint_data`/`face_template`/`palm`/`iris`/
  `biometric_data` columns exist (`NONE ✓`). No plaintext secret is seeded:
  `credential_ref` is null, `api_key_hash` holds a hash.
- Gates: `check-types` 3/3, `build` web ✓, `ultracite check` 224/1/2 baseline
  unchanged, `audit:permissions` 62 pairs/9 routers PASS.

## Privacy / security notes (carried from plan §11)

- **No biometric templates** ever stored — only punch/check-in events + the
  verification METHOD (`verify_mode`).
- **No plaintext device secrets** — `credential_ref` references an encrypted secret;
  `api_key_hash` is a hash. Neither is seeded with a real value, and neither must be
  returned to clients (enforced in 11C).
- GPS raw lat/lon on `geofence_check_in` are subject to `gps_retention_days` (default
  90) then scrubbed to the derived verdict (`coords_purged_at`) — enforced in 11C/11G.

## Migration 0012 — device adapter/provider model (Phase 11C)

A follow-up additive migration `0012_clever_wrecker.sql` (applied) expands the
device model for **multi-vendor** support (ZKTeco TCP + ADMS, NGTeco cloud/app/
K-series, generic CSV/Excel/USB/API):

- New enum `attendance_vendor` (`zkteco`/`ngteco`/`generic`/`other`).
- `attendance_device_mode` recreated with the full set: `csv_import`,
  `excel_import`, `usb_export_import`, `api_ingest`, `zkteco_tcp_planned`,
  `zkteco_adms_push_planned`, `ngteco_cloud_export`, `ngteco_app_export`,
  `vendor_manual_upload`, `custom_adapter_planned`.
- `attendance_device` gains `vendor` (enum), `model_family`,
  `supported_punch_methods` (jsonb string[]), `network_capabilities`
  (jsonb string[]), `capacity_users`, `capacity_logs`, `supports_offline_logs`,
  `supports_shift_rules`, `supports_cloud_sync`, `supports_mobile_app`,
  `supports_gps_punch`, `requires_subscription_for_advanced_features`.

> The `vendor` text→enum cast required clearing the 11B seed rows first (they had
> stored `vendor` as display text). New seed uses canonical enum values. See the
> API doc for the adapter/provider model that consumes this metadata.

The seed now provisions **4 representative devices**: Main Office ZKTeco TCP
(`zkteco_tcp_planned`), Warehouse ZKTeco ADMS (`zkteco_adms_push_planned`),
Reception NGTeco TC cloud clock (`ngteco_app_export`, cloud/app + subscription),
Warehouse NGTeco K4 (`usb_export_import`). Live ZKTeco-TCP/ADMS/NGTeco-cloud are
marked planned — no faked sync.

## Next

**Phase 11C — Device sync / import API + punch processor.** See
[biometric-geofencing-api.md](biometric-geofencing-api.md).
**Phase 11D — Biometric devices UI.** Adds the `biometric` +
`geofencing` oRPC routers, the punch-ingest endpoint + CSV import, the
map→dedupe→geofence→event processor, the new AC resources
(`attendance_device`/`attendance_punch`/`geofence`/`attendance_exception`) and RBAC
helpers, and the external sync-agent contract. `audit:permissions` will grow when the
new resources land.

## Migration 0013 — work arrangement (Phase 11G CP1)

Additive: new enum `work_arrangement` (onsite/hybrid/remote/field/exempt) + column
`employee_work_info.work_arrangement` (NOT NULL DEFAULT 'onsite'). Existing
employees default to onsite (geofence enforced as before). Drives whether mobile
check-in enforces the geofence and raises outside/low-accuracy exceptions — see the
API doc's work-arrangement section.

## GPS retention scrub — no migration (Phase 11G CP4)

The retention scrub (`scripts/scrub-geofence-gps.ts`) needs **no schema change**:
`geofence_check_in.latitude`/`longitude` are already nullable, `coordsPurgedAt`
(timestamp) already exists as the scrubbed-marker column (migration 0011/0012), and
`attendance_setting.gps_retention_days` already defaults to 90. The scrub nulls the
precise coordinates and stamps `coordsPurgedAt` while preserving the verdict
(`status`), `distanceMeters`, `accuracyMeters`, `matchedWorkSiteId`, `reason`, and
`capturedAt`. `attendance_event.locationLat`/`locationLon` (text) are also nulled
for old rows (no `coordsPurgedAt` there — null is the marker). See the API doc's
CP4 section.
