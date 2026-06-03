# Assets DB Setup (Phase 12B)

Drizzle schema, migration, and seed for the Assets (company property / custody)
module. **DB layer only** — no oRPC router and no frontend routes in this phase
(those are 12C / 12D). Implements the data model from
[assets-implementation-plan.md](../architecture/assets-implementation-plan.md) §2.

## Tables (4) — `packages/db/src/schema/assets.ts`

All org-scoped (`organizationId` → `organization`, cascade), cuid2 ids,
`createdAt`/`updatedAt` (`timestamps` helper) + soft-delete `deletedAt`.

| table | purpose | key columns |
|---|---|---|
| `asset_category` | groups assets | name, description |
| `asset` | a tracked item | categoryId (FK, set null), name, **trackingId**, purchaseDate, **purchaseCost** (numeric 12,2), status, **currentAssigneeId** (denormalised cache), expiryDate, notifyBeforeDays, lotNumber, imageUrl |
| `asset_assignment` | custody record (assign → return) | assetId (FK cascade), assignedToId (FK employee, restrict), assignedByUserId, assignedAt, returnDueDate, returnedAt, returnCondition, returnReceivedByUserId, notes |
| `asset_request` | employee self-service request | employeeId (FK, restrict), requestedByUserId, categoryId (FK, set null), description, status, resolvedByUserId, resolvedAt, resolutionNote, fulfilledAssetId (FK, set null) |

`asset.currentAssigneeId` is a **denormalised cache** of the open assignment's
holder — the authoritative custody record is `asset_assignment`. The 12C
assign/return procedures keep them in sync inside one transaction.

## Enums (3)

- `asset_status` — `available` | `in_use` | `retired`
- `asset_return_condition` — `healthy` | `minor_damage` | `major_damage`
- `asset_request_status` — `requested` | `approved` | `rejected` | `cancelled`

## Constraints & indexes

- **`asset_category_org_name_uq`** — partial unique `(organizationId, name)` where
  `deleted_at is null` (one category name per org).
- **`asset_org_tracking_uq`** — partial unique `(organizationId, trackingId)` where
  `deleted_at is null` (asset tag/serial unique per org).
- **`asset_assignment_open_uq`** — partial unique `(assetId)` where
  `returned_at is null and deleted_at is null`. **The core invariant: at most one
  OPEN assignment per asset** — DB-level backstop against double-assignment.
- `asset_org_status_idx` `(organizationId, status)` — inventory filters.
- `asset_org_assignee_idx` `(organizationId, currentAssigneeId)` — custody view.
- `asset_assignment_org_assignee_idx` `(organizationId, assignedToId)` — "assets held by X".
- `asset_assignment_asset_idx` `(assetId)` — per-asset history.
- `asset_request_org_employee_idx` / `asset_request_org_status_idx` — request queues.

FK delete behaviour: organization → cascade; category → **set null** (asset
orphans to "Uncategorised", never blocks); asset → assignment **cascade**;
employee FKs → **restrict** (employees are soft-deactivated, not hard-deleted, so
custody/request history is preserved); user FKs → **set null**; `fulfilledAssetId`
→ set null.

## Migration

- File: **`packages/db/src/migrations/0014_fat_shiver_man.sql`** (Drizzle generate).
- Adds 4 tables + 3 enums + 3 partial-unique indexes + supporting indexes. No
  changes to any existing table (verified — clean diff).
- Apply: `bun run db:migrate` (applied successfully to postgres-central).

## Seed — `scripts/seed-assets.ts`

Command: `export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-assets.ts`

**Idempotent** — clears this org's asset rows (request → assignment → asset →
category, FK-safe order) then re-inserts; reruns produce identical counts (verified
twice).

Seeded counts (Atlas Shipping):

| entity | count | detail |
|---|---|---|
| categories | 5 | Laptop, Mobile Phone, Network Equipment, Access Card, Vehicle / Field Equipment |
| assets | 10 | across `available` / `in_use` / `retired`; one maintenance (damaged-return), one retired write-off |
| assignments | 8 | **5 open** + 3 returned (healthy, minor_damage, major_damage) |
| requests | 4 | one per status: requested / approved (with `fulfilledAssetId`) / rejected / cancelled |

## Verification (observed)

- Migration applied; `pg_tables` shows `asset, asset_assignment, asset_category,
  asset_request`; the 3 enums + 3 partial-unique indexes exist.
- Seed idempotent: two runs → `5 categories, 10 assets, 8 assignments, 4 requests`
  both times.
- **one-open-assignment invariant**: inserting a second open assignment for an
  already-open asset → rejected by `asset_assignment_open_uq`.
- **trackingId uniqueness**: duplicate `(org, trackingId)` → rejected by
  `asset_org_tracking_uq`.
- All rows org-scoped; gates green (check-types 3/3, build, ultracite 223/1/2,
  audit:permissions 73/10 — unchanged, no router added this phase).

## Privacy

- `purchaseCost` is finance data — it exists on the row but the **future 12C API
  must redact it** for non-finance/non-admin roles (a `redactAsset(row, role)`
  helper, mirroring recruitment offer-compensation redaction). No secrets, no
  employee-private data beyond assignment relationships.

## Future API notes (12C)

`assets` oRPC router (categories / assets / assignments / requests) with two-layer
authz (tenant + manager direct-report scope + employee self-scope), transactional
assign/return keeping `asset.status` + `currentAssigneeId` in sync, cost redaction,
and a self-service request action. **Open question for 12C:** confirm whether the
`employee` role holds `asset:create` or needs a new `asset:request` AC action
before wiring self-service (avoid the offboarding `documents.markUploaded`
unreachable-branch trap). See the implementation plan §3 / §8.

## Offboarding integration note

Phase 10 kept offboarding `asset_return` rows as **free-text snapshots**. Assets
12C/12D will surface an employee's live open custody on the offboarding case
**read-only** (via `assignments.listByEmployee`); **no automatic write-back** in
v1 (returning an asset does not auto-resolve an offboarding asset-return row, and
vice versa). This phase (12B) adds no offboarding coupling.
