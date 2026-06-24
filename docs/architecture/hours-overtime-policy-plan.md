# Hours & Overtime Policy — Implementation Plan

Status: **Spec (A-phase).** Slice 1 (org-wide overtime-handling mode, default-preserving)
is implemented alongside this doc. Slices 2–3 (cap-at-shift for hourly, TOIL banking,
per-shift overrides, the hourly OT double-count fix) are specified here and deferred to
their own reviewed, scratch-tested changes.

Driven by live Netsurf staff feedback (2026-06-24):

1. > "on the pay slip ot is being calculated — we don't pay or do overtime, can this be
>    removed or blocked from calculation"
2. > "can the hours go according to their shift, e.g. if my shift is 8-5 it records up to
>    5pm … for everyone according to their shift … and start recording when they sign in"
3. > "field staff start 5am finish 11pm = 9 hours additional in 1 day … take the next day
>    off to balance back to 80 … how would the system calculate that?"

Owner decisions (2026-06-24): **mixed wage types** — Netsurf is *mostly hourly*, a subset
at another branch is *monthly*; **toggles for all scenarios** (configurable, not one
hardcoded behavior); the no-overtime rule applies **org-wide** for Netsurf.

> SaaS Architecture Rule: every behavior below is a **tenant-configurable policy with a
> default equal to today's behavior**. Netsurf proves the need; it does not define the
> product. No Netsurf-specific code path.

## 1. How pay is computed today (grounded)

`packages/payroll-engine/src/calculate.ts`:

- **`computeBasePay`**
  - `monthly` → `baseSalary` (fixed; hours do not change it). `:79`
  - `daily` → `dailyRate × (daysPresent + 0.5·halfDays)`. `:89`
  - `hourly` → `hourlyRate × (totalWorkedMinutes / 60)`. `:102` — **uses raw worked
    minutes**, which *include* the day's OT minutes.
- **`computeOvertime`** (`:152`) pays `(otMinutes/60) × hourlyRateForOT × multiplier` per
  day-type, but only for minutes the input builder counted as **approved** OT.
- **Input builder** (`payroll-input-builder.ts:561`): `totalWorkedMinutes += workedMinutes`
  for every record; OT is added to `overtimeByDayType`/`totalApprovedOvertimeMinutes`
  **only when `isOvertimeApproved && payrollStatus==='approved'`**.
- **Payslip** `overtimeHours = totalApprovedOvertimeMinutes / 60` (`payroll.ts:1574`); the
  web shows an "Overtime Xh" line whenever that is non-zero.

### 1a. Latent bug found: hourly OT is double-counted

For an **hourly** contract with approved OT, the OT minutes are paid **twice**: once at
straight time inside base pay (because `totalWorkedMinutes` includes them) and again as the
full-multiplier premium in `computeOvertime`. Net effect ≈ **2.5× for weekday OT** instead
of 1.5×. This is almost certainly part of why Netsurf (hourly, OT approved) sees inflated
overtime. `monthly` is unaffected (base is the fixed salary, so the premium-on-top is the
correct semantics). **Fix = Slice 2** (only the premium *delta* is added for hourly), gated
so the `monthly` path and the 46/46 reconciliation are byte-identical.

### 1b. Reconciliation independence

`migration:reconcile` re-runs only the **statutory** layer (NIS/PAYE/allowances/net) from
v1's stored gross — it never calls `computeBasePay`/`computeOvertime`
(`reconcile-payslips.ts:7-11`). Therefore **every change in this plan is reconcile-neutral**;
46/46 must remain a regression guard regardless.

## 2. Policy model

New org-level setting `payroll_setting.overtimeHandling` (enum, default `premium`):

| Mode | Meaning | hourly base | monthly base | OT premium line |
|------|---------|-------------|--------------|-----------------|
| `premium` *(default)* | Today's behavior | all worked hrs × rate | fixed salary | paid at multipliers when approved |
| `straight_time` | No premium; hours still paid flat | all worked hrs × rate | fixed salary | **suppressed (0)** |
| `none` | No OT **and** cap paid hours at the scheduled shift | **payable (capped) hrs × rate** | fixed salary | **suppressed (0)** |

- `straight_time` answers message 1 + 3 for **hourly**: a 17h field day is paid 17h flat
  (no premium); a lieu day off is a recorded non-working day → the period balances with no
  overtime windfall. For **monthly** the salary is fixed, so it just removes the premium.
- `none` answers message 2 for **office** staff: clock-out past 5pm is dropped; only the
  scheduled shift is paid.
- Because Netsurf needs office-cap **and** field-count for different groups, the truly
  complete answer is a **per-shift override** (Slice 3) layered on the org default — the
  Phase 21J `shift_rule` table is the home for it. The org-wide setting ships first.

### Wage-type guidance (for the admin team)

- **Never enter a fabricated shift.** Record the real hours; mark the lieu/rest day as an
  approved day off so it is not an unpaid absence. Fabrication breaks the audit trail and
  the SaaS truthfulness rule.
- **monthly** field worker: long day + lieu day net out automatically (salary fixed).
- **hourly** field worker: under `straight_time` the long day is paid flat and the lieu day
  is unpaid — balancing to a period target is a **TOIL bank** (Slice 2): the surplus over
  the daily standard accrues a lieu balance that funds paid lieu days.

## 3. Slices

- **Slice 1 (now):** `overtimeHandling` enum + column (migration, default `premium`);
  engine suppresses OT when mode ≠ `premium`; input builder zeroes `overtimeByDayType` /
  `totalApprovedOvertimeMinutes` when mode ≠ `premium`; payslip/run/estimate hide the OT
  line at 0; settings UI selector; Fumadocs. Engine unit test per mode. Gates +
  reconcile 46/46. **Netsurf → `straight_time` via the in-app setting (operator/admin).**
- **Slice 2:** `none` cap for hourly (base sums payable, not worked); hourly OT
  double-count fix (premium-delta only); TOIL accrual + lieu draw-down (new
  `attendance_record` lieu fields or a `toil_ledger`), tenant-configurable. Scratch QA on
  a prod clone; reconcile 46/46.
- **Slice 3:** per-shift override of the policy via `shift_rule` (office capped, field
  banks) resolved by pay date (reuse 21J resolver). Scratch QA.

## 4. Rollout

Build images coherently (web+server+docs, one SHA) → operator backs up prod → apply
migration → roll → admin sets Netsurf **Overtime handling = Straight time** in Payroll
Settings → verify a draft run shows no OT line for an hourly worker.
