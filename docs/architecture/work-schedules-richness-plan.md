# Work-Schedules Richness Plan (21L-D plan → Phase 21J build)

**Status: ✅ IMPLEMENTED (Phase 21J, 2026-06-14).** Shipped as `shift_rule`
(migration `0025_many_warstar`), the `resolveScheduleConfig` resolver, the
`roster.scheduleRules` API, the attendance + payroll seams, and the `mapShiftRule`
ETL. The original plan text is kept below as the design record. Implementation
detail: `docs/migration/phase-21j-work-schedule-richness.md`. Deltas from this
plan: the rule satellite is `shift_rule` (org + optional shift, null shiftId =
org-default) rather than a strictly one-per-shift table; multiplier overrides and
the night-diff window live on the same table; the deeper recalc arithmetic for
split-shift break subtraction and night-minute premium is surfaced via the
resolver/API and consumed where byte-compatible (grace/standard/break/cap), with
split/night-premium arithmetic staged for a follow-up.

**Original plan (design record):** All v1 `work_schedules` richness is preserved
losslessly in the scratch `migration_source_work_schedule` JSONB (21K).

> **SaaS Architecture Rule.** This is a tenant-configurable, country-neutral,
> effective-dated capability — NOT a Netsurf shift-pattern clone. v1 proves the
> need (night-diff, split-shift, Saturday rules, daily caps are real pay-affecting
> rules a tenant runs); it does not define the limit. Every field below becomes
> reusable shift policy, resolved by work date, not client-specific logic.

## 1. The gap in one sentence

v1 models pay-affecting rules **per work-schedule (per shift)**; v2 models the
equivalents **per-organization** (`attendance_setting`, `payroll_setting`) — and
several v1 concepts (night-diff *window*, split-shift break, Saturday-specific
times, flexi-time, daily paid cap) have **no v2 home at all**. The build pushes
the pay-affecting subset down to a per-shift, effective-dated config that the
attendance recalculation and payroll engine read.

## 2. v1 `work_schedules` field-by-field mapping

| v1 column | meaning | v2 home today | classification |
| --- | --- | --- | --- |
| `name` | schedule label | `shift.name` | direct |
| `code` | short code | — | new (add `shift.code`, minor) |
| `shift_start_minutes` / `shift_end_minutes` | default shift window | `shift_schedule.startTime`/`endTime` (per DOW) | transform (single window → per-day rows) |
| `standard_daily_minutes` | expected daily | `shift_schedule.minimumWorkMinutes` (approx) | transform |
| `standard_weekly_minutes` | expected weekly | `shift.weeklyFullTimeMinutes` | direct |
| `overtime_threshold_daily_minutes` | daily OT trigger | `attendance_setting.overtimeCutoffMinutes` (org-level, partial) | **transform → per-shift** |
| `overtime_threshold_weekly_minutes` | weekly OT trigger | — | **new (per-shift)** |
| `work_days` (jsonb) | working DOWs | `payroll_setting.workDays` (org-level) | **transform → per-shift** |
| `grace_minutes_late` | late grace | `attendance_setting.graceTimeMinutes` (org-level) | **transform → per-shift** |
| `grace_minutes_early_out` | early-out grace | — (org grace is single) | **new (per-shift)** |
| `is_flexi_time` | flexi hours | — | **new** |
| `is_split_shift` + `split_break_start_minutes` + `split_break_end_minutes` | split-shift unpaid mid-window | — | **new (pay-affecting: excludes break from worked minutes)** |
| `auto_deduct_break` + `break_minutes` + `minimum_minutes_for_break_deduction` | auto break deduction | `attendance_setting.breakDeductionMinutes` + `breakDeductionThresholdMinutes` (org-level) | **transform → per-shift** |
| `has_night_differential` + `night_diff_start_minutes` + `night_diff_end_minutes` | night premium **window** | only `payroll_setting.nightShiftMultiplier` (rate) + `shift_schedule.isNightShift` (flag) | **new (the night *window* has no home; without it night minutes can't be classified)** |
| `night_diff_multiplier_num` / `night_diff_multiplier_den` | night rate (fraction) | `payroll_setting.nightShiftMultiplier` (org-level decimal) | **transform → per-shift (fraction → decimal)** |
| `saturday_shift_start_minutes` / `saturday_shift_end_minutes` | Saturday-specific window | — (only `payroll_setting.saturdayMultiplier` rate exists) | **new** |
| `day_overrides` (jsonb) | per-DOW window overrides | partially `shift_schedule` per-DOW rows; per-date → `roster_entry` overrides | transform |
| `cap_daily_paid_minutes` | cap paid minutes/day | — | **new (pay-affecting)** |
| `is_archived` | soft archive | `shift.isActive` (inverse) | direct |
| `id`/`tenant_id`/`sync_version`/`source_node_id`/timestamps | infra | n/a | ignore |

## 3. Recommended v2 home: an effective-dated per-shift rule satellite

Add **`shift_rule`** (one-to-one-current with `shift`, **effective-dated** per the
21G pattern — `[effectiveFrom, effectiveTo)` resolved by **work date**, so a rule
change next quarter doesn't rewrite last quarter's attendance/payroll):

- `shiftId` → `shift`
- `effectiveFrom` / `effectiveTo` (resolve-by-work-date; `isPublished` publish guard)
- `workDays` (ISO jsonb) — per-shift working days
- `overtimeThresholdDailyMinutes`, `overtimeThresholdWeeklyMinutes`
- `graceMinutesLate`, `graceMinutesEarlyOut`
- `autoDeductBreak`, `breakMinutes`, `minBreakDeductionMinutes`
- `isSplitShift`, `splitBreakStartMinutes`, `splitBreakEndMinutes`
- `hasNightDifferential`, `nightDiffStartMinutes`, `nightDiffEndMinutes`, `nightDiffMultiplier` (decimal, from v1 num/den)
- `saturdayShiftStartMinutes`, `saturdayShiftEndMinutes`
- `isFlexiTime`, `capDailyPaidMinutes`

Org-level `attendance_setting` / `payroll_setting` remain the **fallback default**
when a shift has no published `shift_rule` (backwards compatible — existing tenants
unaffected). Resolution: `shift_rule` (by work date) → else org settings.

## 4. Engine seams (where the rules are read — never duplicated)

- **`attendance-recalc.ts`** — `classifyDayType` (21G-E) already reads
  `weekendDays` + holidays. Extend the worked-minutes computation to: subtract the
  split-shift break, apply per-shift grace + auto-break-deduction, classify night
  minutes via the night window, and apply `capDailyPaidMinutes`. All sourced from
  the resolved `shift_rule`.
- **`payroll-engine`** — already consumes `OvertimeByDayType {weekday, saturday,
  sunday, holiday}` + multipliers + `nightShiftMultiplier`. Night minutes and
  Saturday classification become inputs derived in the builder from `shift_rule`;
  the engine's multiplier math is unchanged. **No engine rewrite** — the engine
  stays a pure function of its inputs; the builder feeds richer inputs.
- **Pay items** — medical/other employee-level deductions (21L-A) and any
  schedule-driven allowances stay pay items; `shift_rule` only shapes minutes and
  premium classification, not arbitrary money.

## 5. Guardrails (consistent with 21G + the coordination pattern)

- Effective-dated, resolved by **work date**; historical attendance/payslips stay
  immutable (recompute only via the sanctioned 21G correction workflow).
- Tenant-configurable defaults; **no Netsurf/Foreign-Links constants** in code.
- The fraction → decimal night multiplier is the one transform that "fixes intent"
  (v1 stored num/den; v2 stores a single decimal rate).
- `migration:reconcile` must stay **46/46** after the build (regression guard).

## 6. Migration mapper (Phase 21J, not now)

`write-etl` gains `mapShiftRule(v1WorkSchedule)` reading the staged
`migration_source_work_schedule` rows → `shift_rule`. Until then the rows remain
staged source JSON (lossless). `night_diff_multiplier_num/den` → decimal;
`work_days` jsonb → ISO array; `*_minutes` carried verbatim.

## 7. Sequence (Phase 21J)

21J-A this plan → 21J-B `shift_rule` schema + migration + effective-dating columns
→ 21J-C resolver (`resolveShiftRuleAsOf`, org fallback) → 21J-D attendance-recalc
wiring (split/grace/auto-break/night/cap) + unit tests → 21J-E payroll builder night
+ Saturday classification + reconcile-46/46 guard → 21J-F migration mapper
`mapShiftRule` → 21J-G shift-rule admin UI (tenant config) + Fumadocs → 21J-H QA.

## 8. Why this is a plan, not a build (now)

The pay-affecting richness touches attendance recalculation and payroll minute
classification — the highest-correctness surface in the product. It deserves its
own TDD build with a reconciliation regression guard, not a drive-by during the
migration-hardening pass. The data is safe (staged); the build is scoped above.
