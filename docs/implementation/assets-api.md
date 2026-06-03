# Assets oRPC API — Phase 12C

Implementation record for the `assets` oRPC router. Builds on the 12B schema
([assets-db-setup.md](assets-db-setup.md)) per the spec
([../architecture/assets-implementation-plan.md](../architecture/assets-implementation-plan.md) §3).
Code: `packages/api/src/routers/assets.ts`, registered as `assets` in
`routers/index.ts`.

## 1. Permissions — the `asset:request` decision (open question #1, resolved)

The spec's first open question: *does the `employee` role hold an action that lets
it self-serve a request, or must one be added?* Reading
`packages/auth/src/permissions.ts`, the `asset` AC statement was
`create/read/assign/return/write_off/manage` and `employee` held only
`asset:read`. There was **no `request` action at all** — so shipping
`requests.createSelf` would have repeated the offboarding `documents.markUploaded`
trap (a self-service handler behind a gate the user can't pass).

**Resolution:** added a first-class **`asset:request`** action to the statement and
granted it to every staff role that legitimately self-serves:

| role | `asset` grant after 12C | self-request? |
|---|---|---|
| tenant_owner / tenant_admin | create, read, assign, return, write_off, manage, **request** | ✅ |
| hr_admin | create, read, assign, return, manage, **request** | ✅ |
| payroll_admin | read, **request** | ✅ |
| manager | read, **request** | ✅ |
| employee | read, **request** | ✅ |
| recruiter | read, **request** | ✅ |
| auditor | read | ❌ (read-only oversight) |
| helpdesk_agent | — | ❌ |

`requests.createSelf` / `createForEmployee` / `cancel` gate on
`authorizedProcedure("asset", "request")` — an action these roles actually hold —
so the branch is reachable *and* correctly scoped. `bun scripts/audit-permissions.ts`
passes (80 pairs / 11 routers).

## 2. RBAC helpers

Six helpers added to **both** `packages/api/src/utils/role-helpers.ts` (backend
re-check) and `apps/web/src/lib/rbac.ts` (UI gating), kept byte-aligned:

- `canManageAssets` = `canManageHR` (owner/admin/hr_admin) — create/edit/assign/return/retire.
- `canViewAssets` = manage ∪ manager ∪ auditor ∪ payroll_admin — inventory list/detail.
- `canAssignAssets` / `canReturnAssets` = `canManageAssets`.
- `canRequestAsset` = manage ∪ manager ∪ payroll_admin ∪ employee ∪ recruiter (NOT auditor).
- `canViewAssetCosts` = manage ∪ payroll_admin ∪ auditor — drives purchaseCost redaction.

The AC grants in `permissions.ts` remain the source of truth; helpers mirror them.

## 3. Router surface

Inventory ops live at the **router root** (`assets.list`, `assets.retire`, …) so the
path doesn't stutter (`assets.assets.*`); categories/assignments/requests are
namespaced sub-resources — same shape as `hrCore`.

**Inventory** (root)
- `list` (read) — filters `{ status?, categoryId?, currentAssigneeId?, search?, assignedState?('assigned'|'unassigned'), page, pageSize≤100 }` → `{ data, total, page }`. Server-side join adds `categoryName` + `currentAssigneeName` (display name, never a raw id); `purchaseCost` redacted.
- `getById` (read) — asset + category + assignee display, redacted.
- `create` (create) / `update` (manage) — `trackingId` unique per org → CONFLICT on pg `23505`. `update` deliberately refuses `status`/`currentAssigneeId` (derived caches).
- `retire` (manage) — status → `retired`; precondition: no open assignment.
- `writeOff` (write_off) — disposal; owner/admin only (hr_admin lacks write_off). v1 behaviour = retire; the audit transition (`write_off`) distinguishes it so a future disposal ledger can hang off it.

**categories** — `list` (read) with per-category `assetCount`; `create`/`update`/`archive` (manage). Archive is a soft-delete; it never blocks (assets orphan to "Uncategorised").

**assignments**
- `listByAsset` (read) — full history, newest first, with assignee display name.
- `listByEmployee` (read) — **open** custody for an employee; self-scoped (employee → self only; manager → direct reports; HR/auditor/payroll → anyone). Powers "My assets", the profile tab, and the read-only offboarding custody panel.
- `assign` (assign) — transactional `performAssign`: verify asset assignable, write open `asset_assignment`, set `asset.status='in_use'` + `currentAssigneeId`. The open-assignment partial unique is the race backstop.
- `return` (return) — transactional: set `returnedAt`/`returnCondition`/`returnReceivedByUserId`, clear `currentAssigneeId`. Condition drives status: healthy/minor_damage → `available`; **major_damage → `retired`** (auto-retire so a broken item can't be reassigned). History is preserved (never deleted).

**requests**
- `list` (read) — HR/auditor/payroll see all; manager sees own + direct reports; employee/recruiter see only their own.
- `getById` (read) — same scope.
- `createSelf` (request) — requester is always the caller's own employee record.
- `createForEmployee` (request) — HR for anyone; manager for direct reports only; employee/recruiter always 403 here.
- `approve` (manage) — `requested` → `approved`; does **not** assign.
- `reject` (manage) — `requested` → `rejected`; reason required (stored as `resolutionNote`).
- `fulfill` (assign) — transactional: assign a specific asset to the requester (`performAssign`) + set `fulfilledAssetId` + resolve.
- `cancel` (request) — requester withdraws own `requested` request.

## 4. Cost redaction (server-side)

`redactAsset(row, role)` nulls `purchaseCost` unless `canViewAssetCosts(role)`,
applied at every site that returns an asset (`list`, `getById`). Verified over the
wire: manager rows return `purchaseCost: null`; admin/auditor/payroll_admin see the
value. UI gating is not relied upon.

## 5. Two-layer authorization (IDOR-class)

1. **Tenant scope** — every FK input (`assetId`/`assignmentId`/`requestId`/`categoryId`/`employeeId`) verified on `organizationId` + `deletedAt IS NULL` before use (helpers throw NOT_FOUND / BAD_REQUEST).
2. **Lateral scope** — manager reads scoped to `getManagerDirectReportIds`; employee self-service scoped to `resolveCurrentEmployee`. Designed in from the start (the 10C lesson).

## 6. Invariants enforced

One open assignment per asset (DB partial unique + `performAssign` re-check);
`assign` requires `available`; `return` requires an open assignment; `retire`/
`writeOff` require no open assignment; `trackingId` unique per org; status +
`currentAssigneeId` mutated only by assign/return/retire inside their transaction.
Friendly errors: "Asset is already assigned." / "Asset is not currently assigned." /
"Asset is retired and cannot be assigned." / "Employee is not in this organization."

## 7. Verification

`scripts/verify-assets-api.ts` — 46 RPC assertions across 6 sections (listing +
redaction, IDOR, assign/return lifecycle + invariants, lateral scope, requests
workflow, write-path RBAC). **46 passed, 0 failed.** Run requires the API server
restarted after the new router (lesson #76):

```
bun run scripts/seed-assets.ts
# restart apps/server `bun run --hot src/index.ts`
cp scripts/verify-assets-api.ts apps/web/_v.ts && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
```

## 8. Offboarding integration (read-only)

No write into offboarding. `assignments.listByEmployee({ employeeId })` is the
read used by the offboarding custody panel (wired in **12E** —
`features/assets/custody-panel.tsx`, read-only, on the offboarding case detail) and
the employee profile tab — it returns open custody, manager/self-scoped. The
offboarding `asset_return` rows stay free-text snapshots (Phase 10 decision); there
is no auto-write-back in v1.

## 9. Gates (12C)

check-types (turbo 3/3) · build (2/2) · audit:permissions (80/11) · lint changed
files clean · full lint baseline 223/1/2 unchanged · verify-assets-api 46/46.

## 10. Later additions (12D/12E)

- **12D** added `assignments.listMine` (zero-arg, self-resolved open custody for the
  employee "My assets" view; reuses `asset:read` → no new AC pair, **audit stays
  86/12**) + extracted a shared `fetchOpenCustody` helper.
- **12E** wired the **read-only offboarding custody panel** (`AssetCustodyPanel`) via
  the existing `assignments.listByEmployee` — no new API, no write-back, no
  `purchaseCost` (the custody read omits it).

**Phase 12 (Assets) COMPLETE:** 12B DB → 12C API → 12D UI → 12E QA/hardening + sidebar
nav + offboarding custody. Next per roadmap: Phase 13 Helpdesk/Requests.
