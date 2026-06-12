# Phase 21 — v1 → v2 Migration & Cutover Plan

**Date:** 2026-06-11
**Status:** 21A spec (planning) — no code yet
**Predecessor:** [v1→v2 Gap Analysis](./v1-to-v2-gap-analysis.md)
**Guiding principle (owner's directive):** *Capture v1's **intent**, map it onto what v2 already
has, and port the data. Do NOT faithfully clone v1's implementation — v1 has known bugs/quirks
(e.g. the payroll UTC-timezone bug that forced payslip reversals — visible in v1's GL journals).
v2 is the cleaner rebuild; we carry the **data and the intent**, not the v1 code.*

This is the "A" (spec) phase. It defines the migration, the intent-capture method, the ETL, the
reconciliation gate, and the cutover sequence. The "B"+ phases implement it.

---

## 0. Intent-capture method (how we decide what to port)

For each v1 feature area we answer three questions, in order:

1. **What was v1 *trying* to do?** — inferred from v1's data shape + behaviour, NOT its bugs.
2. **Does v2 already express that intent?** — if yes, map v1 data → v2 tables (ETL only).
3. **If v2 has a structural gap** (GL, per-date rostering, notifications) — add the **minimum** v2
   table(s) that capture the intent the *data* requires, built the v2 way (clean, AC-gated,
   coordination-guardrail-respecting). Never port v1's logic verbatim.

> Rule: the **live data** is the contract. If a v1 column holds data that changes a payroll/leave
> result (e.g. `qualifying_children`, `second_job_pay_cents`, a per-date roster override), it MUST
> land somewhere in v2 or the result will silently change. Empty v1 tables (0 rows) carry no data
> contract — they're intent-only and can be deferred.

---

## 1. Scope: the data contract (what MUST land in v2)

From the live `karetech_erp` inspection. Two tenants; **Netsurf is the real one**, Foreign Links is
the low-risk dry-run.

| Domain | v1 source (rows) | v2 destination | Port type |
| --- | --- | --- | --- |
| Org / auth | organization (2), user (29), member (25), account (23), invitation (22) | same Better-Auth tables | direct |
| Employees | employees (23) | employee_profile + employee_work_info + employee_bank_details | **field-map (§3)** |
| Departments / titles | departments (3), job_titles (14) | department, job_position/job_role | map |
| Attendance | attendance_punches (865), punch_correction_requests (11), attendance_devices (1), attendance_device_users (19) | attendance_punch, attendance_correction, attendance_device, attendance_device_employee_map | direct-ish |
| Shifts / roster | work_schedules (6), employee_shift_assignments (17), **shift_roster_entries (175)** | shift + shift_schedule + **NEW per-date roster (§4.2)** | **intent-gap** |
| Payroll | payslips (69), payslip_line_items, payroll_periods (5), payroll_components (26), employee_payroll_components (17), salary_structures (4), salary_structure_assignments (33) | payslip, payslip_line_item, pay_period, pay_item, pay_item_assignment | **ETL transform (§4.4)** |
| Leave | leave_balances (36), leave_policies (6), leave_requests (2) | leave_balance, leave_policy_template, leave_request | map |
| Holidays | public_holidays (30) | holiday | direct |
| Statutory | tenant_statutory_rules (2), tenant_config (1) | country_payroll_profile, payroll_setting | map |
| GL | accounts (11), journal_entries (13), journal_lines (53) | **NEW minimal GL (§4.1)** OR archive | **decision (§4.1)** |
| Notifications | notifications (14) | **NEW notification table (§4.3)** | **intent-gap (feature, data optional)** |
| Audit | audit_logs (178) | audit_event | map (or archive) |
| Offboarding | resignation_requests (1) | offboarding_case | map |

Drop (transient): `session`, `verification`. Drop (v2-architectural): `sync_version` /
`source_node_id` on every table — v2 is central, not edge-sync (§5).

---

## 2. Phase breakdown (A→E, mirrors the module pattern)

- **21A — Plan (this doc).** Intent-capture method, data contract, ETL design, reconciliation gate,
  cutover sequence. No code.
- **21B — ETL foundation.** A read-only v1 connector + a typed mapping layer
  (`scripts/migration/`): connect to `karetech_erp`, read each v1 table, transform to v2 insert
  shape, write to a v2 target DB. Idempotent + tenant-scoped + dry-run mode. Starts with the
  **direct-port** domains (org/auth, departments, employees, holidays, leave).
- **21C — Payroll & attendance ETL + reconciliation harness.** The transform-heavy domains
  (salary structures → pay items, payslips, punches, roster). Ships the **parity gate** (§6):
  recompute each v1 payslip in v2's payroll-engine and assert net-pay match per employee/period.
- **21D — Intent-gap builds (only what the data forces).** Per §4 decisions: minimal GL (if kept),
  per-date roster table, notification subsystem. Each built the v2 way (schema → migration → AC →
  router → UI), reusing existing primitives. Each is its own spec→build→verify sub-cycle.
- **21E — Cutover dry-run → live.** Foreign Links full migration as a rehearsal; fix; then Netsurf;
  freeze v1 read-only; final delta; flip DNS.

---

## 3. Employee statutory field map (highest payroll-correctness risk) — do in 21B

v1 `employees` carries Guyana payroll inputs. Each MUST have a v2 home or net pay silently changes.
**Action in 21B:** confirm/locate each v2 destination column; any with no home is a 21D micro-build.

| v1 field | Drives | v2 destination (to confirm) |
| --- | --- | --- |
| `tin_number` | PAYE filing | employee_work_info (tax id) |
| `nis_number` | NIS deduction | employee_work_info |
| `qualifying_children` | income-tax child allowance | **verify exists** — if not, ADD |
| `has_second_job` + `second_job_pay_cents` | second-job tax treatment | **verify exists** — if not, ADD |
| `medical_insurance_on_file` + `medical_payroll_deduct_cents` + `medical_external_premium_cents` | medical deduction | **verify** — maps to a pay_item or work_info |
| `other_deductions_cents` | misc deduction | pay_item_assignment |
| `kiosk_pin_hash` | biometric/kiosk login | attendance device map / employee auth |
| `attendance_device_id` | device binding | attendance_device_employee_map |
| `reports_to_employee_id` | org hierarchy / RBAC manager-scope | employee_work_info.reports_to |
| `bank_account_number` + `bank_code` | payment batch / bank CSV | employee_bank_details (masked at rest is a separate item) |

---

## 4. Intent-gap decisions (the structural deltas)

### 4.1 General Ledger
- **v1 intent:** post payroll to a double-entry GL (accounts + balanced journal lines), reversible.
- **v1 reality:** the only journals present are payroll postings + UTC-bug reversals (13 entries, 1
  tenant). It's a thin, payroll-only GL.
- **v2 state:** `journal`/`account` AC resources exist but UNCONSUMED; no tables.
- **Recommended path (capture intent, minimal build):** add a **minimal payroll-GL** in v2 —
  `gl_account` (chart) + `gl_journal_entry` + `gl_journal_line`, with payroll runs posting balanced
  entries (the v2 way: a coordination read of payslip actuals, never mutating payroll). Port v1's 11
  accounts as the opening chart; **do NOT port v1's bug-reversal churn** — port net balances / a
  clean opening position instead. *Alternative if owner prefers:* export v1 journals to the client's
  external accountant and ship v2 without GL (archive v1 GL read-only). **Decision still open** —
  default to minimal-build unless told otherwise.

### 4.2 Per-date shift rostering
- **v1 intent:** assign each employee a shift **per date**, with overrides (custom start/end
  minutes), a note, and an approval step — feeding attendance/overtime/pay.
- **v2 state:** weekly day-of-week pattern only (`shift` + `shift_schedule`). Cannot hold a dated
  override.
- **Recommended:** add `roster_entry` to v2 (org-scoped: employeeId, date, shiftId/scheduleId,
  overrideType, customStart/EndMinutes, note, approval fields) — the clean v2 expression of v1's
  175 rows. Wire it as the per-day source attendance/payroll reads (v2 way: derived, AC-gated).
  This is the **most load-bearing** gap for Netsurf — 175 live rows feeding pay.

### 4.3 Notifications
- **v1 intent:** an in-app inbox (type/title/body + entity link + read state).
- **v2 state:** UI chrome only, no store.
- **Recommended:** add `notification` (org+user scoped: type, title, body, entityType/Id, readAt) +
  a thin router (list/markRead) + emit points where v2 already audits events. **Historical v1 rows
  are low-value — port is optional; the *feature* is the deliverable.**

### 4.4 Salary structure / components → pay items (ETL only, no new table)
- **v1 intent:** named salary structures (pay frequency, rules version) with components
  (earning/deduction, default cents) assigned to employees.
- **v2 expression:** `pay_item` + `pay_item_assignment` + country profile. **Transform, don't
  rebuild:** map component_type → pay_item kind, default_amount_cents → amount, structure
  assignment → pay_item_assignment; rules_version → country_payroll_profile selection.

---

## 5. Architectural delta — offline edge-sync

Every v1 table has `sync_version` + `source_node_id` (offline-first / multi-node kiosk sync). v2 is
central-only. **Decision:** unless the client genuinely runs disconnected on-site nodes, **drop**
these columns in ETL (don't carry the sync model into v2). Flag to owner; default = drop.

---

## 6. Reconciliation gate (the cutover safety net) — ships in 21C

No DNS flip until these pass, per tenant:

1. **Row-count parity** — every ported table's row count reconciles (ported + intentionally-dropped
   = v1 source), with a written manifest of every dropped row and why.
2. **Payroll parity** — for each v1 payslip, recompute in v2's payroll-engine from the ported
   inputs and assert **net pay (and each statutory line) matches within tolerance**. Mismatches are
   triaged as either (a) a v1 bug we're intentionally correcting (documented + owner-signed-off) or
   (b) a port error (fix before cutover). *This is where v1's quirks surface and get decided.*
3. **Spot-check** — N employees' attendance totals, leave balances, and roster for a sample period
   match between v1 UI and v2 UI.

---

## 7. Cutover sequence (21E)

1. Stand up a clean v2 target DB (empty, migrated to HEAD).
2. **Dry run: Foreign Links** (3 employees, no attendance/GL) — full ETL, fix any mapping bugs.
3. **Netsurf** — full ETL; run the §6 reconciliation gate; triage payroll mismatches with owner.
4. **Freeze:** put v1 read-only, run a final delta ETL (anything changed since the bulk load).
5. **Flip:** point `api/app.heimdallone.com` at v2; keep v1 archived read-only for N weeks.
6. Post-cutover: build deferred feature-intent modules (insurance/training/disciplinary/etc.) as
   normal v2 phases — they carry no data, so they don't block the flip.

---

## 8. Open decisions for the owner (cannot default)

1. **GL:** minimal v2 payroll-GL (recommended) vs export-to-external + archive? (§4.1)
2. **Edge-sync:** drop `sync_version`/`source_node_id` (recommended) vs v2 needs offline nodes? (§5)
3. **Payroll mismatch policy:** when v2 (correct) ≠ v1 (buggy), do we cut over on v2's number and
   issue corrections, or freeze v1 numbers as historical and only apply v2 going forward? (§6.2)
4. **Notification history:** port v1's 14 rows or start clean in v2? (§4.3)
5. **Feature-intent modules:** which (if any) must exist *before* cutover vs after? (default: after)

---

## 9. Immediate next step

**21B — ETL foundation.** Build the read-only v1 connector + typed mapping layer in
`scripts/migration/`, starting with the direct-port domains (org/auth, departments, employees +
the §3 statutory field map, holidays, leave) against a scratch v2 DB, in dry-run mode. No
production writes, no cutover — just prove the read + transform + reconcile loop on real data.
