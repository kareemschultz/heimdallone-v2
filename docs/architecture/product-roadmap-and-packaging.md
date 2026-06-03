# Product Roadmap, Module Grouping & Commercial Packaging — DIRECTION ONLY

> **Status: DOCUMENTATION ONLY (recorded 2026-06-02). NOT a build instruction.**
> This file records the long-term product direction so future phases don't guess.
> **Do NOT implement Inventory, CRM, Finance, Projects, billing, plan enforcement,
> or entitlement gating from this document.** Each becomes real only at its own
> scheduled phase with its own spec ("A") deliverable. For the active build order
> see [modules/implementation-sequence.md](modules/implementation-sequence.md).

## 1. Suite shape — five product groups

Heimdallone is one platform organised into five groups (see the grouping table in
the implementation-sequence doc for the per-module membership):

**People & Payroll · Operations · Finance · CRM · Admin & Compliance**

## 2. Assets vs Inventory — two DIFFERENT modules (do not conflate)

This is the key clarification for the Operations group. **Assets** (Phase 12, now
in build) and **Inventory** (a future Operations module) are distinct domains with
different data models, lifecycles, and integrations. Do not merge them.

| | **Assets** (Phase 12 — building) | **Inventory** (future Operations module) |
|---|---|---|
| What | Company property assigned to employees | Stock / items / products / materials moving through locations |
| Examples | Laptops, phones, access cards, tools, routers, vehicles | Resale devices, spare parts, consumables, customer equipment / CPE, network-equipment **stock**, warehouse stock |
| Unit model | One tracked item, one custodian at a time | Quantities of SKUs across warehouses/bins, moved via a ledger |
| Lifecycle | assign → custody → return (condition) → retire | receive → store → transfer → reserve → issue → count/adjust |
| Connects to | HR, Onboarding, Offboarding, custody, asset returns | Procurement, Finance, Projects, Sales/CRM, Service/Helpdesk |
| Quantity | implicit (1 per asset row) | **immutable movement ledger** (never a hand-edited number) |

A network router given to an IT admin to use is an **Asset**. A pallet of routers
held in a warehouse for resale / customer installation is **Inventory**. The same
physical product can exist in both domains at different points in its life.

### Inventory — future benchmark research (when Inventory is scheduled)

Research these before designing (live docs, per the no-v1-source rule):
Oracle NetSuite · SAP S/4HANA / SAP EWM · Odoo Inventory · ERPNext Stock ·
Fishbowl Inventory · Zoho Inventory · Cin7 · Unleashed · Katana MRP ·
inFlow Inventory · Sortly · QuickBooks inventory ecosystem.

### Inventory — capabilities the spec must evaluate

Item/product master · SKU / barcode / QR codes · serial numbers · batch/lot
tracking · warehouses · bins/locations · **stock ledger / inventory movement
journal** · stock adjustments · cycle counts · stock transfers · receipts/issues ·
reservations · reorder points · low-stock alerts · import/export · mobile
scanning · landed cost · valuation methods (FIFO/AVCO/etc.) · project/customer
stock allocation · integration to Finance, CRM, Projects, Helpdesk, and Assets.

### Inventory — architecture principle (non-negotiable)

Use an **inventory ledger / movement-journal** model (Odoo/ERPNext style): stock
on hand is **derived** from an append-only sequence of stock movements (receipt,
issue, transfer, adjustment, count), each immutable and audited. **Never store an
editable "quantity" integer that staff overwrite by hand** — every change is a
movement with a reason, location(s), timestamp, and actor. This mirrors the
Heimdallone payroll/attendance principle (derive from an immutable event stream;
caches are derived and owned by one writer) and the assets `currentAssigneeId`
cache lesson.

## 3. Commercial packaging — modular SaaS (direction only)

Not every customer buys the whole suite, so Heimdallone must support **modular
packaging** with internal feature flags underneath simple customer-facing bundles.
**Do not expose every technical module as its own plan** — sell understandable
bundles; flag features internally.

### Product families
People & Payroll · Operations · Finance · CRM · Admin & Compliance.

### Potential packages (internal naming)
Heimdallone **HR Core** · **People & Payroll** · **Attendance & Biometrics** ·
**Assets** · **Inventory** · **Operations** · **Finance** · **CRM** · **Suite**.

### Suggested customer-facing tiers (simple, bundle-based)
1. **Starter** — HR Core, employee records, documents, basic leave.
2. **People** — HR Core + Recruitment + Onboarding + Offboarding + Assets.
3. **People & Payroll** — People + Attendance + Leave + Payroll + Payslips + Bank export.
4. **Workforce Pro** — People & Payroll + Biometrics + Geofencing + Advanced reports.
5. **Operations** — Assets + Inventory + Helpdesk + Projects + Tasks.
6. **Finance** — Expenses, reimbursements, payment batches, costing, accounting integrations.
7. **CRM** — Leads, customers, deals, activities, project handoff.
8. **Full Suite** — all modules.

Pricing should stay easy to understand: **base platform fee + included
users/employees + add employee packs + add module bundles + add
devices/locations/storage** as needed.

### Billing must eventually support
Tenant subscription · package/bundle selection · module entitlements · user seats
by type · employee-count tiers · **active-payroll-employee** tiers ·
device/location add-ons · biometric/geofence add-ons · inventory
warehouse/location add-ons · storage limits · support tiers · implementation/setup
fees · annual/monthly billing · trial/demo tenants · feature flags · grandfathered
plans · per-module enable/disable in the UI.

### Future billing/entitlement entities (plan later — DO NOT build now)
`billing_plan` · `billing_package` · `billing_feature` · `tenant_subscription` ·
`tenant_entitlement` · `subscription_seat` · `usage_meter` · `invoice_snapshot` ·
`plan_change_history`.

> **Entitlement architecture note (for when billing is built):** module
> visibility/enablement should be driven by **tenant entitlements + feature flags**
> resolved server-side, not hard-coded per role. The sidebar already hides
> not-yet-built modules; the same gating mechanism should later read entitlements
> so a tenant only sees the modules in their package. This keeps "queued/hidden
> future module" and "not in your plan" the same code path.

## 4. Guardrails (current)

- **Build nothing here yet.** Inventory, CRM, Finance, Projects, Tasks, billing,
  and plan/entitlement enforcement are all **future-only**.
- Keep future modules **queued/hidden** in the sidebar until their phase begins.
- When a future module is scheduled, start with its research/spec ("A") deliverable
  (live-docs research), not code — e.g. CRM 17A is already drafted
  ([crm-implementation-plan.md](crm-implementation-plan.md)).
