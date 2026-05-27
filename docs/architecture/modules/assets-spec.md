# Assets Module Specification

## Purpose

Manages company property: asset categories, individual assets with tracking IDs and purchase info, assignment to employees, return with condition tracking, and employee self-service asset requests.

## Source References

- `docs/horilla-extraction/assets.md` — Horilla + OpenHRMS custody

## Dependencies

- **HR Core** (P0) — employee_profile

## First Version Scope

- Asset category CRUD
- Asset CRUD (name, tracking ID, category, purchase date/cost, status, expiry)
- Asset assignment to employees (assigned by, assigned date, return date)
- Asset return with condition (healthy/minor damage/major damage)
- Employee asset request workflow (request → approve/reject)
- Employee profile "Assets" tab showing current assignments

## Deferred Scope

- Batch/lot management, QR/barcode tracking, depreciation, warranty, custody renewal workflow, asset disposal/write-off

## Proposed Entities

### `asset_category` — name, description, orgId
### `asset` — name, trackingId (unique per org), categoryId, purchaseDate, purchaseCost (numeric 12,2), status (available/in_use/retired), currentAssigneeId, expiryDate
### `asset_assignment` — assetId, assignedToId, assignedById, assignedDate, returnDate, returnCondition, returnStatus
### `asset_request` — employeeId, categoryId, description, status (requested/approved/rejected)

## Proposed UI Routes

### `/app/assets` — Inventory table (DataTable)
### `/app/assets/$id` — Asset detail with assignment history
### `/app/assets/requests` — Request approval queue

**Primitives**: DataTable, StatusBadge, PageHeader, ActionMenu, EmptyState, ConfirmDialog

## RBAC

Uses existing: `asset:create/read/assign/return/write_off/manage`.

## Staff-Friendly UX

- Employee: "Request an asset" form → see request status
- Admin: Inventory table with filters (category, status, assignee)
- Assignment wizard: Select asset → Select employee → Confirm
- Return flow: Condition assessment with photo upload option

## Implementation Readiness

**Ready after HR Core**. Integrates with offboarding for asset return clearance (deferred).
