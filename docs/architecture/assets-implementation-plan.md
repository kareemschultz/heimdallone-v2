# Assets Implementation Plan — DRAFTED / QUEUED (Phase 12 candidate)

> **Status (roadmap correction 2026-06-02): DRAFTED & QUEUED — NOT the active phase.**
> Phase 11 is **Biometric + Geofencing**
> ([biometric-geofencing-implementation-plan.md](biometric-geofencing-implementation-plan.md)),
> not Assets. This Assets spec was drafted early and is kept verbatim as a completed,
> queued deliverable for a later phase (Phase 12 candidate). **Do not run any Assets DB
> migration until Biometric + Geofencing ships.** When Assets becomes the active phase,
> its B/C/D/E checkpoints resume from this plan. The phase letters below (11B, 11C…) are
> historical labels from when this was drafted as Phase 11 — read them as the module's
> own B/C/D/E checkpoints under whatever phase number Assets is finally scheduled as.

Detailed implementation spec for the Assets (company property / custody) module.
This is the module's **A** (spec) deliverable (spec docs only; no code). It synthesises
the extraction spec ([modules/assets-spec.md](modules/assets-spec.md)) and the
Horilla extraction ([../horilla-extraction/assets.md](../horilla-extraction/assets.md))
into concrete Drizzle tables, an oRPC API surface, RBAC, UI checkpoints, and the
integration with the Offboarding asset-return clearance built in Phase 10.

> Pattern note: this mirrors the structure of
> [offboarding-implementation-plan.md](offboarding-implementation-plan.md). Every
> "A" phase is spec; "B" is DB; "C" is API; "D" is UI; "E" is QA. Do not jump
> from this plan to code — the schema starts the B checkpoint when Assets is scheduled.

## 1. Scope

### In scope (first version)
- **Asset categories** — CRUD (name, description).
- **Assets** — CRUD (name, tracking ID unique per org, category, purchase
  date/cost, status, expiry, optional lot number, notify-before days).
- **Assignment** — assign an available asset to an employee; **return** with a
  condition assessment (healthy / minor damage / major damage) + notes.
- **Assignment history** — full timeline per asset.
- **Employee self-service requests** — request an asset by category → HR
  approve / reject; resolved requests are read-only.
- **Employee custody view** — assets currently assigned to an employee (a tab on
  the employee profile, and the employee's own "My assets" self-service view).
- **Offboarding integration (read-only link)** — surface an employee's open
  custody on their offboarding case so HR can see what must come back. The
  offboarding `asset_return` rows stay free-text snapshots (Phase 10 decision);
  this phase only *displays* live custody alongside them. No automatic
  write-back in v1 (see §7).

### Deferred (not in v1)
- QR/barcode scanning, depreciation schedules, warranty tracking.
- Custody **renewal** workflow + automated return-reminder emails (OpenHRMS
  `hr_custody` has these; defer).
- Asset disposal / write-off accounting (the `write_off` AC action exists but the
  v1 UI only flips status to `retired`; full disposal ledger deferred).
- Image/photo upload for assign/return (schema reserves a nullable `imageUrl`
  but no upload UI in v1 — same "no real file upload yet" stance as onboarding
  documents).
- Bulk assign / CSV import-export.
- Lots/batches as a first-class managed entity — v1 keeps `lotNumber` as a plain
  text field on the asset (not a separate table), matching the extraction's
  "first version" recommendation.

## 2. Entities

Four tables, all org-scoped, all soft-deletable (`deletedAt`), following the
existing schema conventions (cuid2 ids, `createdAt`/`updatedAt`, money as
`numeric(12,2)` stored as string, dates as `date`/`timestamp`, enums as pg
enums).

### 2.1 `asset_category`
| column | type | notes |
|---|---|---|
| id | text (cuid2) | pk |
| organizationId | text | FK organization, indexed |
| name | text | required |
| description | text | nullable |
| createdAt / updatedAt / deletedAt | timestamp | soft-delete |

Constraint: partial unique `(organizationId, name)` where `deletedAt IS NULL`
(same pattern as offboarding template name).

### 2.2 `asset`
| column | type | notes |
|---|---|---|
| id | text (cuid2) | pk |
| organizationId | text | FK organization, indexed |
| categoryId | text | FK asset_category, nullable (category may be deleted) |
| name | text | required |
| trackingId | text | required; unique per org |
| description | text | nullable |
| purchaseDate | date {mode:"date"} | nullable |
| purchaseCost | numeric(12,2) | nullable; string over the wire |
| status | enum `asset_status` | `available` \| `in_use` \| `retired`; default `available` |
| currentAssigneeId | text | FK employee_profile, nullable (denormalised "who has it now") |
| expiryDate | date {mode:"date"} | nullable |
| notifyBeforeDays | integer | nullable (reserved for future reminders) |
| lotNumber | text | nullable (plain text in v1) |
| imageUrl | text | nullable (reserved; no upload UI v1) |
| createdAt / updatedAt / deletedAt | timestamp | soft-delete |

Constraints:
- partial unique `(organizationId, trackingId)` where `deletedAt IS NULL`.
- index `(organizationId, status)` for the inventory filters.
- index `(organizationId, currentAssigneeId)` for the custody view.

`currentAssigneeId` is a **denormalised cache** of the open assignment's
assignee, kept in sync by the assign/return procedures inside the same
transaction. The authoritative custody record is `asset_assignment`.

### 2.3 `asset_assignment`
| column | type | notes |
|---|---|---|
| id | text (cuid2) | pk |
| organizationId | text | FK organization, indexed |
| assetId | text | FK asset, **cascade** delete, indexed |
| assignedToId | text | FK employee_profile (who holds it) |
| assignedByUserId | text | FK user (who assigned) |
| assignedAt | timestamp | default now |
| returnDueDate | date {mode:"date"} | nullable (custody return date) |
| returnedAt | timestamp | nullable (null = open custody) |
| returnCondition | enum `asset_return_condition` | nullable; `healthy` \| `minor_damage` \| `major_damage` |
| returnReceivedByUserId | text | FK user, nullable |
| notes | text | nullable |
| createdAt / updatedAt / deletedAt | timestamp | soft-delete |

Constraints:
- **partial unique** `(assetId) where returnedAt IS NULL AND deletedAt IS NULL`
  — an asset can have at most ONE open assignment at a time. This is the core
  invariant that prevents double-assignment (mirrors offboarding's "one active
  case per employee" partial unique).
- index `(organizationId, assignedToId)` for "assets held by employee X".

### 2.4 `asset_request`
| column | type | notes |
|---|---|---|
| id | text (cuid2) | pk |
| organizationId | text | FK organization, indexed |
| employeeId | text | FK employee_profile (requester) |
| requestedByUserId | text | FK user |
| categoryId | text | FK asset_category, nullable |
| description | text | nullable (what / why) |
| status | enum `asset_request_status` | `requested` \| `approved` \| `rejected` \| `cancelled`; default `requested` |
| resolvedByUserId | text | FK user, nullable |
| resolvedAt | timestamp | nullable |
| resolutionNote | text | nullable (e.g. reject reason) |
| fulfilledAssetId | text | FK asset, nullable (set if approval assigns a specific asset) |
| createdAt / updatedAt / deletedAt | timestamp | soft-delete |

Enums to add: `asset_status`, `asset_return_condition`, `asset_request_status`.

Migration: a single `00XX_*.sql` (Drizzle generate) adding 4 tables + 3 enums.
Seed (`scripts/seed-assets.ts`): ~4 categories, ~12 assets across statuses, ~6
assignments (mix of open + returned), ~4 requests across statuses, for the Atlas
Shipping tenant — enough to exercise every filter and badge.

## 3. API (Phase 11C) — oRPC router `assets`

New file `packages/api/src/routers/assets.ts`, registered in
`routers/index.ts` as `assets`. Follows the offboarding router conventions:
`authorizedProcedure(resource, action)`, tenant-verify helpers per FK, handler-
level RBAC re-check, `createAuditEvent` on every mutation, plain-language errors,
transactional multi-row writes.

### 3.1 RBAC helpers (add to BOTH `role-helpers.ts` and `rbac.ts`, byte-identical)
```ts
// canManageAssets = canManageHR (owner/admin/hr_admin). Also true for any role
// whose `asset` AC grant includes "assign" (see permissions.ts line ~249).
canManageAssets(role)  // owner, admin, hr_admin (+ the asset-managing role)
canViewAssets(role)    // canManageAssets || manager || auditor || payroll_admin
canRequestAsset(role)  // employee (+ anyone who can view) — self-service create
```
The `asset` AC resource already exists in `permissions.ts`
(`create/read/assign/return/write_off/manage`) with per-role grants — the helpers
mirror those grants; the AC gate remains the source of truth.

### 3.2 Router groups & procedures

**`categories`** — `list` (read), `create` / `update` / `archive` (manage).
Archive = soft-delete; blocks if assets still reference it? No — assets keep a
nullable categoryId, so archive is allowed and orphaned assets show "Uncategorised".

**`assets`**
- `list` (read) — input `{ status?, categoryId?, search?, assignedState? ('assigned'|'available'), page, pageSize≤100 }` → `{ data, total, page }`. Joins category name + current assignee name server-side (denormalise display fields — avoid the client-side join repeated in recruitment; this is a 9I lesson applied up-front).
- `getById` (read) — asset + category + current assignee.
- `create` / `update` (create / manage) — trackingId uniqueness → CONFLICT on pg `23505`.
- `retire` (manage or write_off) — status → `retired`; precondition: no open assignment (must be returned first) → PRECONDITION_FAILED otherwise.

**`assignments`**
- `listByAsset` (read) — full history for an asset, newest first.
- `listByEmployee` (read) — open custody for an employee (powers the profile tab + offboarding link). Employee self-scope: an employee may call this only for themselves (resolveCurrentEmployee), HR/manager(scoped)/auditor for others.
- `assign` (assign) — input `{ assetId, assignedToId, returnDueDate?, notes? }`. Transactional: verify asset is `available` (PRECONDITION_FAILED if `in_use`/`retired`), verify employee in org, insert `asset_assignment` (open), set `asset.status='in_use'` + `asset.currentAssigneeId`, audit. The open-assignment partial unique is the backstop against races.
- `return` (return) — input `{ assignmentId, returnCondition, notes? }`. Transactional: verify assignment is open, set `returnedAt`/`returnCondition`/`returnReceivedByUserId`, set `asset.status='available'` + clear `currentAssigneeId`, audit.

**`requests`**
- `list` (read) — HR/manager(scoped)/auditor see all/in-scope; employee sees only their own. Input `{ status?, page, pageSize }`.
- `mine` (read, zero-arg) — employee self-service: caller's own requests.
- `create` (asset:create OR a self-service action) — employee submits `{ categoryId?, description }` → `requested`. **Self-service note:** to avoid the offboarding `documents.markUploaded` dead-branch trap (a self-service handler behind a manage-only AC gate), employee request creation MUST be gated by an AC action the employee role actually holds. If `asset:create` is not granted to employees, add an `asset:request` action to the statement + employee grant in Phase 11C rather than relying on an unreachable branch. **Verify the grant before wiring the UI.**
- `approve` (assign/manage) — `requested` → `approved`; optional `fulfilledAssetId` to immediately assign (calls the same assign logic transactionally). Sets `resolvedByUserId`/`resolvedAt`.
- `reject` (manage) — `requested` → `rejected` with `resolutionNote`.
- `cancel` (self) — employee withdraws their own `requested` request → `cancelled`.

### 3.3 Privacy / redaction
- `purchaseCost` is finance data: strip to `null` for non-managing, non-payroll, non-auditor roles (mirror the recruitment offer-compensation redaction). A `redactAsset(row, role)` helper, applied at every asset-return site.
- No other PII concerns (assignee names are already visible to viewers).

### 3.4 Authorization layers (same two-layer model as offboarding)
1. **Tenant scope** — every FK verified on `organizationId` + `deletedAt IS NULL`.
2. **Lateral scope** — for `manager` role, `assignments.listByEmployee` and
   `requests.list` must scope to direct reports (reuse the
   `getManagerDirectReportIds` / `assertVisibleToCaller` pattern from offboarding
   10C). Employee self-service procedures scope to `resolveCurrentEmployee`.
   **This is the IDOR-class risk for this module — design it in from the start,
   don't bolt it on (the 10C lesson).**

## 4. UI (Phase 11D) — checkpoints

Mirror the offboarding UI cadence. `AssetsTabs` (Inventory / Requests /
Categories), gated by `canViewAssets`; employees get a self-service view.

- **CP1 — Tabs + inventory list.** `/app/assets` DataTable (name, tracking ID,
  category, status badge, current holder, purchase date, cost [redacted]) with
  filters (category / status / assigned-or-available / search). `AssetsTabs`,
  `assets.css`, plain-language status labels (`features/assets/labels.ts`). No
  flat route-shadow (folder route from the start).
- **CP2 — Asset detail + assignment history.** `/app/assets/$id` — summary +
  assignment timeline; Edit (manage); graceful "not available" on 403/404 +
  `retry:false` (apply the 10D CP6 lessons up-front).
- **CP3 — Assign / return actions.** Assign dialog (employee picker, return-due
  date), Return dialog (condition select + notes); retire action with
  precondition messaging. Per-row actions on the inventory table. RBAC UX-only.
- **CP4 — Requests queue + employee self-service.** `/app/assets/requests`
  approval queue (approve-with-optional-assign / reject-with-reason); employee
  "My assets" view (current custody read-only via `assignments.listByEmployee` +
  request form via `requests.create` + `requests.mine` + cancel). Categories
  management on a settings tab.
- **CP5 — Integration + QA/RBAC pass.** Employee-profile "Assets" tab (current
  custody); offboarding case detail shows live open custody alongside the
  free-text asset-return rows (read-only link, §7); full RBAC/browser pass across
  all roles incl. manager direct-report scope + cost redaction; close Phase 11.

UX (staff-friendly, per the payroll-UX principle): assignment is a guided dialog
(pick asset → pick employee → confirm), return surfaces the condition choices as
plain labels with tone, requests use a simple "Request an asset" form.

## 5. Business rules (invariants)
1. An asset has **at most one open assignment** (partial unique) — enforced in DB
   and re-checked in `assign`.
2. `assign` requires `asset.status === 'available'`; `return` requires an open
   assignment; `retire` requires no open assignment. All → PRECONDITION_FAILED
   with plain-language messages.
3. `asset.status` + `currentAssigneeId` are derived caches; only `assign`/`return`
   (and `retire`) mutate them, always inside the assignment transaction.
4. `trackingId` unique per org (partial unique; CONFLICT on violation).
5. `purchaseCost` redacted from non-finance roles.
6. Soft-delete everywhere; archived categories orphan to "Uncategorised", never
   block.
7. Employee self-service is strictly self-scoped; manager reads are
   direct-report-scoped.

## 6. RBAC matrix (target)
| capability | owner/admin/hr_admin | asset-mgr role | manager | payroll_admin | auditor | employee | recruiter |
|---|---|---|---|---|---|---|---|
| view inventory / detail | ✅ | ✅ | ✅¹ | ✅ | ✅ | ❌² | ❌ |
| create/edit asset, categories | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| assign / return / retire | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| see purchaseCost | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| approve/reject requests | ✅ | ✅ | ❌³ | ❌ | ❌ | ❌ | ❌ |
| request an asset (self) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅⁴ |
| view own custody / my requests | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅⁴ |

¹ direct reports only · ² employee → self-service view, not inventory ·
³ manager-approve of reports' requests is a possible later affordance (mirrors
the deferred offboarding manager-approve) · ⁴ depends on the `asset:request`/
`asset:create` employee grant decided in 11C — **verify before building**.

The exact grants must be read from `permissions.ts` at 11C time and the helpers
made to mirror them; the matrix above is the intent.

## 7. Offboarding integration (the Phase 10 hook)
Phase 10 deliberately kept offboarding `asset_return` rows as **free-text
snapshots** ("do not over-integrate Assets yet"). Phase 11 closes the loop
**read-only**:
- On the offboarding case detail, add a small "Currently held assets" panel that
  calls `assets.assignments.listByEmployee({ employeeId })` and lists open
  custody, so HR can see what physically must come back vs the free-text
  asset-return checklist items.
- **No automatic write-back in v1**: returning an asset in the Assets module does
  NOT auto-resolve an offboarding `asset_return` row, and vice versa. A future
  phase may offer "link this asset-return to a custody record" — explicitly
  deferred to avoid coupling two lifecycles before the model is proven.
- Reuse the offboarding `assertCaseVisibleToCaller` scoping when rendering this
  panel (managers only see their reports).

## 8. Open questions (resolve at 11B/11C)
1. **Employee request AC action** — does the `employee` role hold `asset:create`,
   or must we add `asset:request`? (Read `permissions.ts`; if employee only has
   `asset:read`, add a `request` action + grant — do NOT ship a self-service
   branch behind a gate the employee can't pass. Lesson from offboarding
   `documents.markUploaded`.)
2. **Lots/batches** — confirmed deferred to a plain `lotNumber` text field, no
   `asset_lot` table in v1. Revisit if procurement needs batch reporting.
3. **purchaseCost currency** — store alongside an org default currency, or add a
   per-asset `currency` column? v1: single org currency (consistent with how
   contracts/payroll resolve currency); add per-asset currency only if multi-
   currency procurement appears.
4. **Retire vs write-off** — v1 `retire` just flips status. Full disposal ledger
   (date, reason, proceeds) deferred; the `asset:write_off` AC action stays
   reserved for that future work.

## 9. Definition of done (Phase 11)
- 11B: 4 tables + 3 enums migrated; seed populates Atlas Shipping; `bun run
  audit:permissions` green; gates green.
- 11C: `assets` router (categories/assets/assignments/requests) with the two-layer
  authz, cost redaction, transactional assign/return, helpers mirrored in
  rbac.ts; verify script green.
- 11D: CP1–CP5 shipped, browser-verified RBAC matrix (incl. manager scope + cost
  redaction + employee self-service), offboarding custody panel live, lint
  baseline unchanged.
- Docs + memory updated between every checkpoint (the phase pattern).
