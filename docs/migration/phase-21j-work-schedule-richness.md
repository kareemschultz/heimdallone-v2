# Phase 21J — Work-Schedule Richness Build

**Date:** 2026-06-14 · **Outcome:** ✅ COMPLETE · **Cutover:** freeze/DNS still
**NO-GO** (build only). Plan: `docs/architecture/work-schedules-richness-plan.md`.

Builds the v2 home for pay-affecting work-schedule richness so v1 `work_schedules`
intent migrates cleanly and future tenants can configure shift/pay policy.

> **SaaS Architecture Rule.** `shift_rule` is a tenant-configurable, country-neutral
> capability — NOT a Netsurf shift clone. Every field is configurable; a tenant
> with no rules behaves exactly as before. **audit STAYS 161/21** (reuses the
> `roster` AC resource).

## 21J-B — Schema + migration

New **`shift_rule`** table (migration **`0025_many_warstar`**, purely additive —
`CREATE TABLE` + 2 FKs + 4 indexes incl. two partial-unique indexes):

- Scope: `organizationId` + optional `shiftId` (**null `shiftId` = organization
  default**). Effective-dated `[effectiveFrom, effectiveTo)` + `isPublished`.
- Fields: standard daily/weekly minutes · OT daily/weekly thresholds · grace
  late/early · auto break (+ break minutes / min-deduction) · split shift (+ break
  window) · night differential (window + multiplier) · Saturday-specific window ·
  weekday-OT / Saturday / Sunday / public-holiday multipliers · flexi-time · daily
  paid-minutes cap · per-shift `workDays`.
- Partial uniques: one window per shift per `effectiveFrom`; one org-default
  window per `effectiveFrom`. Verified on the dev DB (34 cols, 5 indexes) and on
  the throwaway scratch (full migration set applies clean → 133 tables).

Most columns are **nullable** = "inherit the org fallback", which is what keeps a
no-rule tenant byte-compatible.

## 21J-C — Resolver (`shift-rule-resolver.ts`)

Pure `resolveShiftRuleRow(rows, shiftId, date)` (reuses 21G `resolveAsOf`) +
`mergeScheduleRule(row, fallback)` + DB `resolveScheduleConfig(org, shiftId, date)`.

**Precedence:** shift-specific rule (by date) → org-default rule (by date) →
org settings (`payroll_setting` / `attendance_setting`) → built-in defaults. A
null rule resolves to the org fallback verbatim (`source: "settings_fallback"`).
`verify:shift-rule-resolver` **29/29** (precedence, date windows, unpublished
ignored, no-rule fallback, DB integration on dev).

## 21J-D — API (`roster.scheduleRules`)

`list` / `getById` / `resolve` / `create` / `update` / `archive`, reusing the
`roster` AC resource. **Two-layer authz:** read = `roster:read` (admin/HR/payroll/
manager/employee/auditor); **manage = `roster:manage` AC gate + a handler
narrowing to admin/HR/payroll only** — managers manage roster *assignments* but
NOT pay policy (`canManageScheduleRules`, mirrored role-helpers ↔ rbac.ts).
`resolve` lets an employee resolve their OWN shift's rule, a manager their reports',
org-wide viewers any. Archive = unpublish (history preserved). Tenant-scoped
throughout. `verify:shift-rule-api` **32/32** (RBAC alignment + the manager
least-privilege narrowing). **audit stays 161/21.**

## 21J-E — Attendance + payroll seams

- **Attendance** (`attendance-recalc.ts`): `recalculateRecord` resolves the rule
  and sources grace, standard (expected) minutes, auto break deduction, and a
  daily paid cap from it. **Byte-compatible when no rule** — the resolver returns
  the org settings fallback and `standardDailyMinutes` is rule-only (null → the
  shift-schedule minimum stays the source). Cap only applies when a rule sets it.
- **Payroll** (`payroll-input-builder.ts` + engine `ScheduleRuleInput`): the
  builder resolves the rule by **pay date** and attaches it to the payroll input as
  a read seam (effective-dating preserves the historical rule). The engine does not
  yet consume it, so **no calculation changes** — schedule policy already influences
  pay through the attendance record's worked/payable/overtime minutes. Roster /
  schedule rules **never write payroll** (read-only resolve).

## 21J-F — ETL `mapShiftRule` + live rehearsal

`mapShiftRule` (v1 `work_schedules` → `shift_rule`): night-diff numerator/
denominator → a single decimal multiplier; `is_archived` → unpublished; fields with
no clean target (raw shift windows, day overrides) preserved in
`migration_source_work_schedule`; migrated rules open at 2000-01-01 to cover all
historical work dates. Only ISO weekday-number arrays map to `workDays` (other
shapes left null + preserved). `migration:test-transformers` **30/30** (+6 for
mapShiftRule).

**Live v1 → scratch rehearsal:**

| Check | Result |
| --- | --- |
| Migrations applied (incl. 0025) | ✅ 133 tables |
| Source `work_schedules` staged | 6 |
| **`shift_rule` rows mapped** | **6/6** (Netsurf; Foreign Links has none) |
| Orphan rules (bad shift link) | 0 |
| Archived → unpublished | 1 of 6 |
| Daily-cap carried | 6 of 6 |
| Tenant isolation / GL balance | ✅ |
| Live dry-run feature gaps | **6 → 5** (work_schedules gap CLEARED; now `transform_map`) |
| Live reconcile | **READY** — personal_allowance + NIS + net **46/46 exact (NO regression)** |

## 21J-G — Fumadocs

`apps/docs/content/docs/time/work-schedules.mdx` (+ Time `meta.json`): what a shift
rule is, effective-dating, resolution precedence + fallback, attendance/payroll
flow, rosters, role matrix (incl. the manager least-privilege note), admin setup,
migration notes. Tags: Time · Payroll · Admin · Manager · Tenant Configurable ·
Effective Dated · Requires Setup. Docs build passes (prerendered); `apps/docs` lint
clean (2 pre-existing warnings in generated files — D2 backlog, not this page).

## Quality gates

`check-types` 3/3 · `build` 3/3 (incl. docs) · `audit:permissions` **161/21** ·
`verify:core` all green (incl. `verify:shift-rule-resolver` 29, `verify:shift-rule-api`
32) · `migration:test-transformers` 30/30 · payroll-engine 59/59 · changed source
files lint-clean (no new errors over baseline) · live `migration:dry-run` ok · live
`migration:reconcile` **READY (46/46)** · live write-ETL scratch run ✅.

## Hard rules honored

No v1 writes · no production v2 writes · no freeze · no DNS cutover · no secrets
committed · no hardcoded Netsurf/Foreign-Links assumptions · v1 source preserved ·
no fabricated payroll values.

## Remaining gaps (documented, deferred)

- Deeper attendance arithmetic for **split-shift break subtraction** and
  **night-minute premium classification** is surfaced via the resolver/API but not
  yet applied in `recalculateRecord` (the byte-safe seams — grace/standard/break/cap
  — are wired). Next increment.
- The **engine consuming per-shift multipliers** (Saturday/Sunday/holiday/night
  overrides) — the input seam exists (`ScheduleRuleInput`); engine consumption is a
  follow-up gated by its own reconcile pass.
- A **shift-rule admin UI** (rules are API-managed today).
- Pre-existing stale dry-run classifications for GL / notifications / roster (those
  modules are built in 21D; the dry-run classifier predates them) — out of 21J
  scope.

## Go / No-Go

- **Build: GO ✅.** **Freeze: NO-GO.** **DNS cutover: NO-GO (none performed).**
