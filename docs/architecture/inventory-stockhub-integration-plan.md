# Inventory — Netsurf StockHub → Heimdallone v2 Integration Plan

**Date:** 2026-06-17 · **Status:** Spec (the "A" phase for the Inventory module).
Supersedes the thin "Inventory" line in the v1→v2 parity backlog — the real target
is porting the **Netsurf StockHub** app, not a from-scratch stock module.

## TL;DR

Netsurf StockHub (`/home/karetech/projects/Netsurf-Inventory`, live at
`netsurf-inv-*` containers) is a **mature, full inventory platform built on the
exact same stack as Heimdallone v2** — Bun, TanStack Start SSR, Hono + oRPC,
Drizzle, Postgres, Better Auth, Ultracite/Biome. It is effectively a sibling of
v2. That means we **port and multi-tenantize** it (schema + routers + UI lift over
with org-scoping + v2 AC), rather than rebuild. This is the single biggest
accelerator in the whole backlog.

Scope of StockHub (what "full inventory functionality" means):
- **Catalog**: products (SKU/model/brand/price-cents/reorder), categories,
  product types, aliases, attributes, images, price history.
- **Ledger**: append-only `stock_movements` (11 types) + derived `stock_balances`
  cache; **balances move only through APPROVED movements**, one mutation path,
  negative-balance guard with override permission, deterministic recompute.
- **Multi-location** (office / customs-bond) with per-location balances.
- **Stock counts**: phone-friendly count sessions, variance, flag, submit →
  approve emits `count_adjustment` movements; compare two counts.
- **Inbound / receiving**: shipments (expected→reconciled), expected lines mapped
  to products, receiving sessions with received/damaged/variance, approve emits
  `in` movements into bond.
- **Excel import**: upload → background parse (ExcelJS, image extraction) → map
  columns → validate/match products → commit (seeds count session or inbound).
- **Exports/reports**: inventory valuation, low/out of stock, by-location,
  variance; CSV / Excel / PDF; export history; report templates (data-driven).
- **Activity log** (append-only audit), attachments, data-quality checks,
  dashboard/analytics.
- **RBAC**: 56 permissions × 7 roles; separation-of-duties (creator ≠ approver).

## Why a port, not a rebuild
Same framework, same ORM, same RPC layer, same auth library, same lint/format
config. The schema is clean Drizzle; the routers are pure oRPC handlers with the
business logic already factored into testable helpers (`balances.ts`,
`approval.ts`, `counts.ts`, `inbound.ts`, import/export libs). The main work is
**adaptation**, not authorship:

1. **Multi-tenancy** — add `organizationId` (orgRef) to the root tables
   (`product`, `category`, `product_type`, `location`, `stock_movement`,
   `stock_balance`, `stock_count_session`, `inbound_shipment`, `import_batch`,
   `export_batch`); children inherit org through their parent FK + are tenant-
   verified on write. Every query filters by `orgId(context)`. (Mirrors how every
   v2 module already scopes.)
2. **Auth/RBAC** — drop StockHub's standalone Better Auth + its 7 product roles;
   re-express its **56 permissions as a v2 AC resource set** and map its role
   intent onto v2's existing org roles (admin/HR see all; a new `inventory_manager`
   + `stock_officer` role pair for operational staff; auditor read-only; employee
   none). New AC resources → audit count rises (expected, like every module).
3. **Audit** — replace StockHub's `activity_logs` table with v2's shared
   `audit_event` (the established pattern; Activity tab reads it).
4. **Attachments/images/uploads** — StockHub uses local-disk storage under an
   uploads dir; v2 has no file-storage layer yet. **This is the one genuine net-new
   piece** (see Risks). MVP can defer image upload/Excel-image-extraction and ship
   text-only catalog first.
5. **Design system** — StockHub uses shadcn/Tailwind/Base-UI primitives very close
   to v2's `base-lyra`. Port screens onto v2's `StatTile`/`DataTable`/`EmptyState`/
   dialog idiom + a new `styles/inventory.css`, matching the Navy Corporate theme.
6. **Money** — StockHub stores `*_cents` as bigint/integer + currencyCode; v2
   payroll uses its own money convention. Keep cents-integer (it's correct) and
   render with v2's money formatter.

## Relationship to v2 Assets (avoid overlap)
v2 already has an **Assets** module (assigned equipment / custody). Inventory is
**distinct**: Assets = "who holds this laptop"; Inventory = "how many units of SKU
X are in which bond, ledger-backed." Keep them separate modules. A future seam:
issuing inventory stock could create an Asset (out-of-scope for the port).

## Proposed phasing (each a verified pass, schema additive, deploy + reconcile-safe)
- **INV-A** (this doc) — spec.
- **INV-B** — schema port + migration: catalog + locations + ledger
  (`product`/`category`/`product_type`/`location`/`stock_movement`/`stock_balance`
  + enums), all org-scoped; idempotent seed. AC resources `inventory_product`,
  `inventory_stock`, `inventory_location` (+ actions read/create/update/archive/
  move/approve/negative_override). New roles `inventory_manager` + `stock_officer`.
- **INV-C** — ledger router + balances/approval helpers (ported `applyApprovedMovement`,
  `movementDeltas`, `recomputeBalances`, separation-of-duties) + verify script.
- **INV-D** — catalog UI (items list/grid, product detail) + locations.
- **INV-E** — movements UI (ledger, approve/reject) + dashboard tiles.
- **INV-F** — stock counts (sessions, phone count flow, review/approve, compare).
- **INV-G** — inbound/receiving (shipments, receive flow, approve).
- **INV-H** — exports/reports (CSV/Excel/PDF) + activity (audit_event) + data quality.
- **INV-I** — Excel import wizard + **file/image storage layer** (the net-new infra).
- **INV-J** — QA/RBAC/security pass; docs (Fumadocs `inventory/*`).
- **Data**: optionally migrate the real 189-product Netsurf catalog + balances from
  the StockHub DB into the Netsurf tenant (read-only ETL, same guardrails as the
  v1→v2 migration). Treated like any other migration source.

## Risks / open decisions
1. **File storage** (images, Excel uploads, PDF output, document attachments) — v2
   has no storage abstraction. Need a `StorageProvider` (local disk for now, S3-
   compatible later). Biggest net-new piece; INV-I gates on it. MVP ships text-only.
2. **Scale of the port** — ~30 tables, ~60 procedures, 26 screens. This is the
   largest single module in the backlog; INV-B…INV-J are multiple passes.
3. **Roles** — adds `inventory_manager` + `stock_officer` to the org role set
   (12 → 14). Confirm naming.
4. **Excel parsing** — pulls in ExcelJS + a background-worker pattern; v2 has no
   detached-worker convention yet (StockHub fires a detached async fn). Port the
   same fire-and-forget-with-status pattern.
5. **Live StockHub** — `netsurf-inv-*` is running in production for Netsurf. The v2
   Inventory module is additive; do not touch the live StockHub app/DB until the
   owner decides to cut Netsurf over from StockHub to v2 Inventory.

## Recommendation
Do the **full port, phased** (INV-B…INV-J), after the lighter backlog modules
(Communications, Lifecycle, Development, Settings-depth) since those are quick wins
and Inventory is a multi-pass effort. Start INV-B once the owner confirms (a) the
two new role names and (b) that a file-storage layer is in scope (or that MVP ships
text-only first). Source surveys captured in this session; StockHub source is the
reference implementation to lift from.
