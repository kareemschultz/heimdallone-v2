# HeimdallOne v1 → v2 Migration Gap Analysis

**Date:** 2026-06-11
**Author:** Cutover readiness audit
**Purpose:** Before migrating live client companies off v1 onto v2, identify every v1 feature and
every v1 data table that v2 does **not** yet cover, so nothing clients depend on is silently dropped.

> Standing note: v1 is **not** a design/implementation source of truth (v2 is a clean rebuild).
> But for **migration completeness** v1 *is* the source of truth for "what data and behaviour exist
> today that clients rely on." This doc uses that lens only.

---

## 1. What v1 actually is (evidence)

| Thing | Value |
| --- | --- |
| v1 repo | `github.com/kareemschultz/heimdallone.git` → local `/home/karetech/projects/heimdallone` |
| v1 deployed commit | `d03e5b4` ("record verified production pipeline run") |
| v1 live containers | `heimdallone-{server,web,admin,fumadocs,nginx}` (`sha-d03e5b4`, up 2 days) at `api/app.heimdallone.com` |
| v1 live database | `karetech_erp` on container `postgres-central` (postgres:18) |
| Even older ancestor | `github.com/kareemschultz/HeimdallOne` → `.references/old-heimdallone` (not deployed) |
| v2 repo | `github.com/kareemschultz/heimdallone-v2.git` → `/home/karetech/Heimdallone` (HEAD `070d6aa`) |

**v1 is a live deployment with real client data.** The deployed sha is **not** in v2's git history — v2
has never been deployed against this data.

### Live tenants & data volume (from `pg_stat_user_tables`)

| Tenant | Employees | Payslips | Punches | Roster entries | GL journals | Leave req |
| --- | --- | --- | --- | --- | --- | --- |
| **Netsurf Group of Companies** (`netsurf-group-tenant-001`) | 20 | 66 | 865 | 175 | 13 | 2 |
| **Foreign Links Auto Spares** (`F48EVSUONAHB…`) | 3 | 3 | 0 | 0 | 0 | 0 |

Netsurf is the real operational tenant; Foreign Links is a small/pilot tenant. Most of v1's ~120
tables are scaffolded modules with **0 rows** (see §5).

---

## 2. Migration-BLOCKING gaps — real v1 data with no v2 home

These hold live data **and** have no table/feature in v2. They must be resolved (build the feature, or
make an explicit "drop this data" decision) **before** cutover.

### 2.1 General Ledger / Accounting  🔴 highest impact
- **v1 data:** `accounts` (11 — chart of accounts), `journal_entries` (13), `journal_lines` (53).
- The journals are **real, posted, double-entry** — e.g. `source='payroll'`, `status='posted'`,
  including payroll reversals. v1 posts payroll into a GL.
- **v2 state:** explicitly deferred. `packages/db/src/schema/finance.ts` says *"journal / account AC
  resources exist but stay UNCONSUMED — accounting/GL deferred."* There is **no** `journal_entry` /
  `account` (GL) / `ledger` table in v2's 117-table schema.
- **Decision needed:** Does v2 need GL at cutover? Options: (a) build a minimal GL (accounts +
  journal_entries + journal_lines + payroll posting), (b) export v1 journals to the client's external
  accounting system and **not** carry GL into v2, (c) snapshot-archive v1 GL read-only.

### 2.2 In-app Notifications  🟠
- **v1 data:** `notifications` (14) — `type`, `title`, `body`, `entity_id`, `entity_type`, `read_at`.
- **v2 state:** **no `notification` table.** (`apps/web/.../route.tsx` references "notifications" in UI
  chrome only — there is no backing store/router.)
- **Decision needed:** v2 needs a notifications subsystem if clients expect the in-app inbox. Historical
  rows are low-value (transient) and probably **don't** need migrating — but the **feature** is missing.

### 2.3 Shift Rostering (per-date)  🟠
- **v1 data:** `shift_roster_entries` (175) — **per-date** assignments with `override_type`,
  `custom_shift_start_minutes`/`custom_shift_end_minutes`, and an approval workflow
  (`is_approved`/`approved_by_user_id`). Plus `employee_shift_assignments` (17), `work_schedules` (6).
- **v2 state:** v2 models shifts as a **weekly day-of-week pattern only** — `shift` (weekly/monthly
  minutes) + `shift_schedule` (one row per `day_of_week` with start/end time). There is **no per-date
  roster table** and **no per-date override/approval**. v2 cannot represent "on 2026-06-15 employee X's
  shift was overridden to 06:00–14:00, approved by Y."
- **Impact:** Netsurf actively uses rostering (175 entries). Attendance/overtime/payroll that depend on
  the *actual* rostered shift per day will be wrong if collapsed to a weekly pattern.
- **Decision needed:** Add a per-date roster table to v2 (recommended) or confirm clients will move to
  pure weekly patterns.

---

## 3. Model-MISMATCH — data migrates, but needs ETL mapping (not a 1:1 copy)

The concept exists in both, but the schema shape differs — a transform is required.

| v1 (shape) | v2 (shape) | Mapping note |
| --- | --- | --- |
| `salary_structures` (`pay_frequency`, `rules_version`) + `salary_structure_assignments` (33) + `salary_structure_templates` | `pay_item` + `pay_item_assignment` + `payroll_setting` | v1 "structure→assignment" maps to v2 pay-item assignment; rules_version → country profile. **No direct table.** |
| `payroll_components` (26; `component_type`, `default_amount_cents`) + `employee_payroll_components` (17) | `pay_item` + `pay_item_assignment` | Component-type enum mapping; cents stay cents. |
| `work_schedules` (6) + `employee_shift_assignments` (17) | `shift` + `shift_schedule` | Pattern maps; per-date overrides need §2.3. |
| `tenant_statutory_rules` (2), `tenant_config` (1) | `country_payroll_profile`, `payroll_setting`, org settings | Map Guyana/TT statutory rules to v2 country profiles. |
| `resignation_requests` (1) | `offboarding_case` | Concept covered; field map. |
| `job_titles` (14) | `job_position` / `job_role` | v2 splits position vs role — decide mapping. |

### 3.1 Employee statutory/payroll fields that MUST be carried (verify v2 has a column for each)
v1 `employees` carries Guyana-specific payroll inputs that drive correct tax/NIS calculation:
`tin_number`, `nis_number`, `qualifying_children`, `has_second_job` + `second_job_pay_cents`,
`medical_insurance_on_file` + `medical_payroll_deduct_cents` + `medical_external_premium_cents`,
`other_deductions_cents`, `kiosk_pin_hash`, `attendance_device_id`, `reports_to_employee_id`.
**Action:** column-level map each against v2 `employee_profile` / `employee_work_info` /
`employee_bank_details` and flag any with no destination — a missing `qualifying_children` or
`second_job_pay_cents` would silently mis-calculate net pay after cutover.

---

## 4. COVERED — v1 data with a clean v2 home (low risk)

| v1 table (rows) | v2 destination |
| --- | --- |
| `attendance_punches` (865) | `attendance_punch` |
| `punch_correction_requests` (11) | `attendance_correction` |
| `attendance_devices` (1) / `attendance_device_users` (19) | `attendance_device` / `attendance_device_employee_map` |
| `payslips` (69) / `payslip_line_items` | `payslip` / `payslip_line_item` |
| `payroll_periods` (5) | `pay_period` |
| `leave_balances` (36) / `leave_policies` (6) / `leave_requests` (2) | `leave_balance` / `leave_policy_template` / `leave_request` |
| `public_holidays` (30) | `holiday` |
| `departments` (3) | `department` |
| `employees` (23) | `employee_profile` (+ work_info, bank_details) — see §3.1 |
| `user` (29) / `member` (25) / `account` (23) / `invitation` (22) / `organization` (2) | same Better-Auth tables in v2 |
| `audit_logs` (178) | `audit_event` |
| `notifications`→ see §2.2 | — |

Auth/session tables (`session` 107, `verification`) are transient — do not migrate.

---

## 5. FEATURE-INTENT gaps — v1 scaffolded the module but it has 0 rows, and v2 has no equivalent

No data to migrate, so these **do not block cutover**, but they represent v1's *intended* scope. Decide
per module whether v2 should build it (the "carry the intent over" question).

| v1 module (0 rows) | v2 equivalent? | Note |
| --- | --- | --- |
| Insurance (`insurance_plans`, `insurance_enrollments`, `insurance_premium_deductions`) | ❌ none | Medical fields live on `employees` today; full plan/enrolment module absent in v2. |
| Training (`training_programs`, `training_modules`, `training_enrollments`, `training_module_completions`) | ❌ none | No LMS in v2. |
| Surveys (`surveys`, `survey_questions`, `survey_responses`, `survey_anonymous_tokens`) | ⚠ partial | v2 has performance 360/reviews; standalone anonymous surveys absent. |
| Disciplinary (`disciplinary_actions`, `disciplinary_records`, `disciplinary_categories`) | ❌ none | Absent in v2. |
| Certifications & Skills (`employee_certifications`, `certification_types`, `employee_skills`, `skill_types`, `skill_categories`) | ❌ none | Absent in v2. |
| Salary advances (`salary_advance_requests/policies/installments`) | ⚠ `loan` model | v2 `loan` could cover advances; confirm. |
| Gratuity (`gratuity_settlements`) | ❌ none | Statutory gratuity settlement absent. |
| Cost centers (`cost_centers`) | ❌ none | Absent (finance is budget-only). |
| Work locations (`work_locations`, `employee_work_locations`) | ⚠ geofence only | v2 has `geofence_location` (attendance) + a recruitment work-location field, not an employee work-location assignment. |
| Announcements (`announcements`, `announcement_acknowledgements`) | ❌ none | Absent in v2. |
| Expense claims (`expense_claims/lines/approvals`, `expense_categories`) | ⚠ `reimbursement` | v2 payroll `reimbursement` likely covers; confirm field parity. |
| Onboarding/exit checklists (`onboarding_*`, `exit_checklist_*`) | ✅ v2 onboarding/offboarding | Covered. |
| Recruitment (`applicants`, `interviews`, `job_postings`, `job_offers`) | ✅ v2 recruitment | Covered. |
| Appraisals/goals/360/recognition (`appraisals`, `goals`, `feedback_360`, `recognition_records`) | ✅ v2 performance | Covered. |
| Assets (`assets`, `asset_categories`, `asset_assignments`) | ✅ v2 assets | Covered. |

---

## 6. Architectural note — offline edge-sync (`sync_version` / `source_node_id`)

**Every** v1 table carries `sync_version` (bigint) + `source_node_id` (text). v1 was built for
offline-first / multi-node edge sync (likely on-site kiosks/devices syncing to a central node). v2 has
**no** sync-version columns. This is an intentional-or-not architectural difference.
**Decision needed:** confirm whether multi-node offline sync is in v2's intended scope, or whether v2 is
deliberately central-only (in which case the sync columns are simply dropped during ETL).

---

## 7. Recommended cutover sequence

1. **Decisions first (product/owner calls — cannot default these):**
   - GL: build minimal GL in v2, vs export-to-external + archive v1 (§2.1).
   - Rostering: add per-date roster table to v2 (recommended), vs weekly-only (§2.3).
   - Notifications: build the subsystem in v2 (§2.2).
   - Offline sync: in scope for v2 or dropped (§6).
   - Feature-intent modules (§5): which to build before cutover vs defer post-cutover.
2. **Column-level field map** for §3.1 (employee statutory fields) — highest correctness risk for payroll.
3. **Write a deterministic ETL** (v1 `karetech_erp` → v2 schema) tenant-by-tenant; start with **Foreign
   Links** (3 employees, no attendance/GL) as the low-risk migration dry-run, then **Netsurf**.
4. **Reconciliation harness:** row counts + payroll re-calculation parity (v1 payslip net pay == v2
   recomputed net pay per employee per period) before flipping DNS.
5. **Freeze + cutover:** read-only v1, final delta sync, switch `api/app.heimdallone.com` to v2.

---

## 8. One-line verdict

v2 **covers the bulk** of v1's live data (attendance, payroll, leave, employees, org/auth, audit) and
**exceeds** v1 on most scaffolded modules (CRM, projects, helpdesk, performance, assets — all real in v2,
empty in v1). The **genuine blockers** are narrow and specific: **General Ledger**, **per-date
rostering**, **notifications**, and a **salary-structure/component ETL mapping** — plus a column-level
check of Guyana statutory payroll fields. None are large builds; all need an explicit scope decision
first.
