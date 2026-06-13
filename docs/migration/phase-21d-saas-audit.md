# Phase 21D — SaaS Architecture Rule audit (roster / GL / notifications / write-ETL)

**Date:** 2026-06-13 · **Against:** the Heimdallone SaaS Architecture Rule (AGENTS.md / .claude/CLAUDE.md) · **Verdict:** no Netsurf-/Foreign-Links-specific *logic*; the orchestrator and all three routers are generic and tenant-safe. But several pieces are **too narrow** or **quietly inherit v1** and must be generalized before building further (especially the UIs).

Severity: 🔴 must fix before relying broadly · 🟡 generalize before building further · 🟢 clean / SaaS-general.

---

## 🟢 What is already SaaS-general (keep)

- **Tenant isolation** on every query in roster/GL/notifications (`organizationId` on every WHERE; soft refs tenant-verified SELECT-only).
- **Two-layer authz** everywhere (AC gate + handler scope): roster = org/manager-reports/self; GL = org-wide books; notifications = strict per-user self-scope.
- **No cross-module mutation:** GL `linkedPayslipId` is a soft text ref (zero payroll writes); roster only *reads* shift/employee; notifications emit via a shared helper. Matches the coordination guardrail.
- **Pay frequency is country-/client-agnostic** — resolved through the canonical `resolvePayFrequency` (alias-tolerant), never a hardcoded cycle.
- **Write-ETL orchestrator is data-driven** — it loops a *provider array* (`SYNTHETIC_TENANTS`), not two hardcoded tenants; swapping in the v1-readonly loader needs no orchestrator change. It is structurally incapable of touching prod (own guarded Pool, never imports the app db).
- **GL is genuinely configurable** — per-tenant chart, account hierarchy (`parentAccountId`), per-entry currency, source enum, reversal-as-counter-entry, bulk import. Strong.
- **Notifications are reusable** — per-user inbox, soft entity links, read/unread, emit helper for any module.

---

## 🟡 Generalize before building further

### 1. Roster cannot yet carry pay-affecting richness (the headline gap)
`roster_entry` models per-date assignment + a *single* custom window + day-off/swap + approval. The SaaS Roster requirement (and v1's live `work_schedules`, flagged by the dry-run as "no v2 home — decision needed") also needs: **split shifts** (two windows in one day — the single `customStart/EndMinutes` pair can't express this), **night differential**, **weekend / public-holiday rules**, **OT thresholds**, an explicit **payroll-impacting flag/multiplier**, and **multiple work locations** (`roster_entry` has no `locationId`). This is **generic, not client-specific** — but as built, roster can't reconstruct pay for any tenant whose pay depends on these factors (security, retail, field services, hospitality…). *Recommendation:* before the roster UI, extend the schema with a tenant-configurable **shift-rule / pay-policy** layer (differential %, weekend/holiday multipliers, OT threshold, split-window support) and a `locationId` seam — designed as policy data, not a Netsurf hardcode.

### 2. `swap` override is a label with no data model
`rosterOverrideTypeEnum` includes `swap`, but there is no `swapWithEmployeeId` / `swapWithEntryId` column — so a "swap" can't record *who/what* it swapped with. That violates "no raw enums as user-facing labels" (a swap UI would have nothing to show). *Recommendation:* model the counterparty, or drop the enum value until it's modeled.

### 3. ETL collapses every migrated user to role `employee`
`mapMember(oid, userId, "employee")` hardcodes the role. v1 admins/managers/payroll staff would all import as plain employees — a fidelity **and** RBAC gap (re-grant by hand post-cutover = error-prone). *Recommendation:* a documented **v1-role → v2-role mapping** (one of the rule's "transform map" cases), defaulting to `employee` only when unmapped.

### 4. ETL passes v1 notification `type` verbatim
`mapNotification` copies v1's `type` strings (`"system.welcome"`, `"payroll.payslip_ready"`) straight into v2. That clones v1's vocabulary into the new product ("do not clone v1 quirks"). *Recommendation:* define a v2 notification-type catalog and **map** v1 types onto it (unknown → a generic type), so the inbox UI renders v2 labels, not v1 strings.

### 5. Hardcoded `"GYD"` defaults outside a country-rule module
`salaryCurrency: c.currency ?? "GYD"` and `currency: j.currency ?? "GYD"` (transformers) and the GL zod `.default("GYD")` (3 sites) bake a Guyana assumption into generic code. The rule: "no hardcoded country assumptions outside a country-rule module." *Recommendation:* default currency from **tenant settings** (a tenant base-currency field), falling back to a configured platform default — not a literal `GYD`.

### 6. ETL hardcodes contract `status: "active"` and skips statutory fields
Every imported contract becomes `active`; v1 ended/draft contracts would be misrepresented. And `mapEmployee` maps no statutory fields (TIN/NIS/qualifying_children/second_job/medical) — the synthetic source has none, so the *live* loader must add them (the dry-run already flags 11 fields for manual review). *Recommendation:* map v1 contract status → v2 status, and map statutory fields explicitly in the live loader (these directly affect payroll correctness).

---

## 🟢/🟡 Note for later (acceptable to defer, but record the seam)

- **Notification delivery channels** — schema is in-app only; the rule names "future delivery channels". No `channel`/`deliveredAt` column yet. Fine to defer; add the seam when email/push is built.
- **GL multi-company under one tenant** — GL is org-scoped; a tenant with subsidiaries sharing one org would need an entity dimension. The rule says "multiple companies under a tenant *where needed*" — defer until a tenant needs it.

---

## Bottom line

Nothing here is a Netsurf or Foreign Links *hardcode in logic* — the design already loops over tenants, scopes by org, and resolves pay frequency generically. The risks are **narrowness** (roster pay rules, swap counterparty, delivery channels) and **silent v1 inheritance** (role collapse, notification-type passthrough, GYD defaults, contract-status/statutory mapping). Items 1–6 should be addressed (or explicitly deferred with a documented decision) **before** the roster/GL/notification UIs and **before** the live write-ETL loader, so the product generalizes for the next tenant, industry, and country — not just for the two proof cases.
