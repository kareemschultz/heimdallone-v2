# Integration Strategy

Heimdallone is a standalone platform. External system integrations are one-way data flows (import or export) or event-driven webhooks. No external system is a runtime dependency of Heimdallone's core operations.

---

## Integration Categories

| Category | Direction | Runtime dependency |
|---|---|---|
| Horilla data import | Inbound (one-time migration) | No |
| Biometric device polling | Inbound (scheduled) | No (offline-tolerant) |
| Accounting exports | Outbound (on-demand) | No |
| Bank payment files | Outbound (on payroll approval) | No |
| Email / notification delivery | Outbound (event-driven) | Soft (degraded gracefully) |
| Webhook delivery | Outbound (event-driven) | No |

---

## Horilla Data Import

Horilla is a reference source for domain logic, not a runtime data source. However, organizations migrating from Horilla to Heimdallone need a one-time data import path.

### Scope

| Horilla data | Import target in Heimdallone |
|---|---|
| Employee records | `employees`, `employee_work_profiles` |
| Departments / positions / roles | `departments`, `job_positions`, `job_roles` |
| Leave balances | `leave_balances` |
| Attendance history | `attendance_records` (historical, read-only) |
| Leave request history | `leave_requests` (historical, read-only) |
| Payslip history | `payroll_payslips` (historical, read-only) |

### Bridge tables

| Table | Purpose |
|---|---|
| `integration_sources` | Tracks external systems that data was imported from |
| `horilla_record_links` | Maps Heimdallone record IDs to original Horilla object IDs (for deduplication and audit) |

### `integration_sources` schema

| Field | Description |
|---|---|
| `id` | UUID |
| `organization_id` | Tenant FK |
| `source_type` | `horilla`, `old_heimdallone`, `csv`, `api` |
| `source_identifier` | Human-readable label (e.g. "Horilla export 2025-01-01") |
| `imported_at` | Timestamp of import |
| `record_count` | Number of records imported |
| `status` | `complete`, `partial`, `failed` |

### `horilla_record_links` schema

| Field | Description |
|---|---|
| `id` | UUID |
| `integration_source_id` | FK to `integration_sources.id` |
| `heimdallone_table` | Target table name (e.g. `employees`) |
| `heimdallone_id` | FK (as text) to the created Heimdallone record |
| `horilla_app` | Horilla app name (e.g. `employee`) |
| `horilla_model` | Horilla model name (e.g. `Employee`) |
| `horilla_pk` | Horilla primary key value |

### Import process

```
Horilla DB export (JSON/CSV) → import CLI tool
  ↓
Validate and transform to Heimdallone domain model
  ↓
Write Heimdallone records + horilla_record_links for deduplication
  ↓
Import log written to integration_sources
```

The import tool is a standalone CLI script — not a running service. It runs once (or on demand) and is not connected to Horilla in production.

### What import does NOT do

- No ongoing sync with a live Horilla database
- No Horilla API calls at runtime
- No Horilla Python dependency in the Heimdallone runtime
- No shared database credentials

---

## Biometric Device APIs

Biometric devices (ZKTeco and similar) are polled via their SDK or local API. This is an inbound, scheduled integration.

| Integration point | Approach |
|---|---|
| Device connectivity | TCP/IP connection to device IP and port |
| Protocol | Device-specific SDK (ZKTeco: zklib or similar Node.js/Bun-compatible library) |
| Polling | `biometric_import_jobs` scheduled tasks |
| Failure handling | Job marked as `failed`; retried on next schedule; alert sent to HR |
| Data format | Device returns raw punch records (user_id, timestamp, type) |

Device integrations are implemented as optional modules. A Heimdallone instance with no biometric devices operates identically — the biometric feature is additive.

---

## Accounting Exports

Payroll data is exported to accounting systems after a pay run is approved. This is an outbound, on-demand integration.

| System | Format | Status |
|---|---|---|
| QuickBooks Online | CSV journal entry / IIF | Planned (Phase 8) |
| Xero | CSV / Xero API | Planned (Phase 8) |
| Sage | CSV / Sage import format | Planned (Phase 8) |

Export generates a journal entry mapping payroll components (gross, deductions, employer contributions) to chart-of-accounts codes configured per organization. Chart-of-accounts mapping is stored in `organization_settings` as JSONB.

No live API connection is required. Exports produce downloadable files. Optional webhook or OAuth-based live sync may be added in a future phase.

---

## Bank Payment Files

After payroll approval, bank transfer files are generated for net pay disbursement.

| Region / bank format | Notes |
|---|---|
| Guyana (GY) | Republic Bank, Demerara Bank — format TBD |
| Trinidad & Tobago (TT) | RBC, First Citizens — format TBD |
| Barbados (BB) | Sagicor, RBC — format TBD |
| Jamaica (JM) | NCB, Scotiabank — format TBD |
| Generic ACH / NACHA | US banking standard |
| BACS | UK banking standard |

Bank file format specifications will be gathered per country before Phase 9 implementation. Files are generated server-side and downloaded by the payroll admin. No direct bank API integration in initial phases.

---

## Email and Notification Delivery

Heimdallone delivers notifications via email and in-app. Email delivery uses a transactional email provider.

| Provider | Approach |
|---|---|
| Resend | Primary provider (API key, no SMTP) |
| SMTP fallback | Configurable per organization for self-hosted setups |

Email addresses and API keys are stored in Vault, not in environment files. The notification service reads provider config from `organization_settings` or platform-level settings.

Notification types and employee preferences are managed in `notifications` and `notification_preferences` tables.

Failure to deliver an email does not block the triggering workflow (e.g. a payslip is still generated even if the email delivery fails). Delivery failures are logged and retried.

---

## API Surface

### Internal API (oRPC)

All Heimdallone frontend and mobile clients communicate via oRPC over HTTP. Type-safe, procedure-based. No REST conventions. No public-facing contract.

### External API (OpenAPI)

A versioned REST-compatible API surface generated from oRPC using `@orpc/openapi`. Intended for:
- Third-party integrations
- Client-built mobile/desktop tools
- Accounting system webhooks
- Import tools

External API requires API key authentication (separate from cookie-based session auth). API key management is a planned feature.

Endpoint pattern: `GET/POST /api/v1/<resource>`

---

## Webhook Delivery (Planned)

Outbound webhooks notify external systems of Heimdallone events.

| Event | Example consumers |
|---|---|
| `payroll_run.approved` | Accounting system |
| `employee.created` | Identity provisioning (Okta, Azure AD) |
| `leave_request.approved` | Scheduling tools |
| `offboarding.completed` | IT deprovisioning systems |

Webhook config is per-organization: URL, secret key, event subscriptions. Delivery is async with retry logic. Delivery attempts logged per webhook event.

Webhooks are planned for a later phase. Do not build webhook infrastructure until the core domain modules are stable.
