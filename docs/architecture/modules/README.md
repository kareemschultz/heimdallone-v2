# Module Specification Backlog

Phase 5A.1 deliverable. Specification docs for every Heimdallone module after HR Core.

## Purpose

These docs define what each module does, what entities it needs, what API procedures it exposes, what UI it provides, and what dependencies it has — so implementation phases can proceed without re-analyzing the product each time.

## Source Hierarchy

1. **Phase 4D Horilla/OpenHRMS extraction** (`docs/horilla-extraction/`) — domain knowledge
2. **Phase 4E shared primitive specs** (`docs/architecture/shared-ui-primitives-plan.md`) — UI patterns
3. **Phase 5A HR Core spec** (`docs/architecture/hr-core-*.md`) — foundation schema/API patterns
4. **Existing permissions** (`packages/auth/src/permissions.ts`) — RBAC model

## Spec Files

| # | File | Module | Priority |
|---|------|--------|----------|
| 1 | `contracts-spec.md` | Employment Contracts | P0 |
| 2 | `attendance-spec.md` | Attendance & Time Tracking | P1 |
| 3 | `leave-spec.md` | Leave Management | P1 |
| 4 | `payroll-spec.md` | Payroll Engine | P1 |
| 5 | `recruitment-spec.md` | Recruitment Pipeline | P2 |
| 6 | `onboarding-spec.md` | Employee Onboarding | P2 |
| 7 | `offboarding-spec.md` | Employee Offboarding | P2 |
| 8 | `biometric-geofencing-spec.md` | Devices & Location | P2 |
| 9 | `assets-spec.md` | Asset Management | P3 |
| 10 | `helpdesk-spec.md` | Internal Support Tickets | P3 |
| 11 | `projects-spec.md` | Projects & Timesheets | P3 |
| 12 | `performance-pms-spec.md` | Performance / OKRs / 360 Feedback | P3 |
| 13 | `audit-documents-automation-spec.md` | Audit, Documents, Automations | P0–P3 |
| 14 | `implementation-sequence.md` | Build order & milestones | — |

## Rules

- Specs are **conceptual only** — no Drizzle code, no oRPC code, no route files
- Each spec follows the same section format for consistency
- Entities use Heimdallone-native naming, not Django/Odoo names
- All entities are organization-scoped via `organizationId`
- Money uses `numeric(12, 2)` with ISO 4217 currency code
- All dates use Drizzle `date` type; timestamps use `timestamp`
- IDs are `text` with cuid2
- Audit events via the generic `audit_event` table from HR Core
