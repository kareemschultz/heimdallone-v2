# Assets / Custody — Horilla Extraction

## Overview

Horilla's Asset module manages company property inventory: categories, lots/batches, individual assets with tracking IDs, assignment to employees, return tracking with condition assessment, and employee self-service asset requests. OpenHRMS's `hr_custody` module adds a more formal custody workflow with return dates, renewal, and automated reminders.

## Horilla Files Inspected

- `asset/models.py` (331 lines) — AssetCategory, AssetLot, Asset, AssetAssignment, AssetRequest, AssetReport, AssetDocuments, ReturnImages
- OpenHRMS: `hr_custody/models/hr_custody.py`

## Important Models

**AssetCategory** — Asset classification. Fields: name (unique), description, company M2M.

**AssetLot** — Batch grouping. Fields: lot_number (unique), description, company M2M.

**Asset** — Individual asset. Fields: name, owner FK (current user/Employee), description, tracking_id (unique), purchase_date, purchase_cost, category FK, status (In Use/Available/Not-Available), lot FK, expiry_date, notify_before (days).

**AssetAssignment** — Allocation record. Fields: asset FK, assigned_to FK, assigned_date (auto), assigned_by FK, return_date, return_condition, return_status (Minor damage/Major damage/Healthy), return_request (bool), return_images M2M, assign_images M2M.

**AssetRequest** — Employee requests an asset. Fields: requested_employee FK, asset_category FK, request_date (auto), description, status (Requested/Approved/Rejected).

**OpenHRMS Custody** — More structured: Draft → Waiting Approval → Approved → Returned | Refused. Includes return_date, renew_date, renewal workflow, automated return reminder emails.

## State Machine / Lifecycle

**Asset**: Available → In Use (when assigned) → Available (when returned). Status: Available/In Use/Not-Available.

**AssetAssignment**: Created (assigned) → Return requested → Returned (with condition).

**AssetRequest**: Requested → Approved | Rejected.

**Custody (OpenHRMS)**: Draft → To Approve → Approved → Returned | Refused. Supports renewal with new return date.

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/assets` — Asset inventory table
- `/app/assets/$id` — Asset detail (assignment history, reports, documents)
- `/app/assets/requests` — Asset request queue
- `/app/assets/settings` — Categories, lots/batches

### View Modes
- **Inventory table**: All assets with status, current user, category
- **Employee custody view**: Assets currently assigned to an employee (on employee profile)
- **Assignment history**: Timeline of all assignments for an asset

### Data Table
- Columns: Asset Name, Tracking ID, Category, Status (badge), Current User, Purchase Date, Cost
- Filters: Category, Status, Assigned/Available, Lot, Expiry soon
- Row actions: Assign, Return, View history, Edit
- Bulk actions: Bulk assign, Export inventory

## Proposed Drizzle Entities

- `asset_category` — organizationId, name, description
- `asset` — organizationId, categoryId FK, name, trackingId (unique), description, purchaseDate, purchaseCost, status (available/in_use/retired), currentAssigneeId FK, expiryDate, notifyBeforeDays, lotNumber
- `asset_assignment` — assetId FK, assignedToId FK, assignedById FK, assignedDate, returnDate, returnCondition, returnStatus (healthy/minor_damage/major_damage), notes
- `asset_request` — employeeId FK, categoryId FK, description, status (requested/approved/rejected), resolvedBy FK

## Priority

**P3** — Useful for asset tracking but not required for core HR/payroll operations.
