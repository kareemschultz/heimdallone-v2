# Heimdallone Roadmap

Phased delivery plan for the Heimdallone v2 platform. Phases are sequential within a tier but phases within the same tier can partially overlap. Do not begin a later phase until the previous phase's blocking deliverables are complete.

---

## Tier 0 — Foundation

### Phase 0: Documentation + Reference Setup
**Status: Complete**

- Cloned Horilla to `.references/horilla-hr/`
- Added `.references/` to `.gitignore`
- Committed `design_handoff_heimdallone/` to repo
- Scaffolded repo with Better-T-Stack (Bun, TanStack Start, Hono, oRPC, Better Auth, Drizzle, Expo)

**Blocking deliverable:** None (starting point)

---

### Phase 1: Documentation Baseline
**Status: Complete**

- `docs/product/source-of-truth.md`
- `docs/product/horilla-reference-map.md`
- `docs/product/heimdallone-roadmap.md` (this file)
- `docs/architecture/stack-baseline.md`
- `docs/architecture/auth-rbac-plan.md`
- `docs/architecture/tenant-model.md`
- `docs/architecture/hrms-domain-map.md`
- `docs/architecture/payroll-engine-plan.md`
- `docs/architecture/attendance-geofencing-biometric-plan.md`
- `docs/architecture/integration-strategy.md`
- `docs/decisions/adr-0001-heimdallone-native-first.md`

**Blocking deliverable:** All 11 docs merged to `master`

---

## Tier 1 — Frontend

### Phase 2: Frontend Design System Port
**Status: Planned**

- Read `design_handoff_heimdallone/DESIGN_TOKENS.md` and `heimdall.css` / `marketing.css`
- Extract color palette, spacing scale, typography, shadow definitions
- Configure Tailwind CSS v4 with Heimdallone design tokens
- Set up shadcn/ui base-lyra theme in `packages/ui`
- Implement dark/light theme toggle persisting to `localStorage.heimdall.theme`
- Default theme: dark

**Blocking deliverable:** Design tokens applied, theme toggle working

---

### Phase 3: Frontend Routes
**Status: Planned**

Marketing/public routes (fully implemented):
- `/` — marketing landing page
- `/pricing` — pricing page
- `/docs` — docs/resources page
- `/login` — login page

App shell (authenticated layout):
- Sidebar, topbar, tenant switcher, user/account menu

Implemented app routes:
- `/app` — executive dashboard
- `/app/payroll` — payroll command center
- `/app/employees` — employee list
- `/app/employees/$id` — employee profile
- `/app/compliance` — compliance/audit page

Stub routes (polished empty states, not blank pages):
- `/app/attendance`, `/app/leave`, `/app/countries`, `/app/documents`
- `/app/settings`, `/app/recruitment`, `/app/onboarding`, `/app/offboarding`
- `/app/performance`, `/app/assets`, `/app/helpdesk`, `/app/geofencing`, `/app/biometrics`

**Blocking deliverable:** All 19 routes render without runtime errors; stub routes show meaningful empty states

---

### Phase 4: Interaction Fidelity
**Status: Planned**

- Theme toggle (dark/light, persisted)
- Dropdowns (shadcn primitives)
- Tabs
- Employee preview drawer
- Bulk select on employees table
- Density toggle on employees list
- Payroll country selector
- Marketing count-up / reveal effects (marketing pages only)
- Sidebar/topbar menu behavior
- Escape / click-outside close behavior
- Loading skeletons
- Error states

All interactions use React state and shadcn primitives — no raw DOM scripts from the design handoff JS files.

**Blocking deliverable:** All interactions from `design_handoff_heimdallone/INTERACTIONS.md` implemented and tested manually

---

## Tier 2 — Auth and Domain

### Phase 5: Auth/RBAC Foundation
**Status: Planned**

- Add Better Auth Organization plugin to `packages/auth`
- Add Better Auth Admin plugin to `packages/auth`
- Update Drizzle schema in `packages/db` for plugin tables: `organization`, `member`, `invitation`
- Run DB migration
- Implement oRPC middleware:
  - `requireAuth` (exists — verify and extend)
  - `requireActiveOrganization`
  - `requirePlatformAdmin`
  - `requireTenantRole`
  - `requirePermission`
  - `requireEmployeeScope`
  - `requirePayrollCountryScope`
  - `requireManagerScope`
- Implement tenant switcher (web) backed by real organization session
- Implement platform admin guards

**Blocking deliverable:** All 8 middleware helpers implemented and covered by tests; no domain mutation proceeds without passing through a middleware

---

### Phase 6: Core Domain Schema
**Status: Planned**

Drizzle schema tables (Heimdallone-native names):
- `organizations` (extends Better Auth organization)
- `organization_settings`
- `legal_entities`
- `countries`
- `locations`
- `departments`
- `job_positions`
- `job_roles`
- `work_types`
- `employee_types`
- `shifts`
- `employees`
- `employee_work_profiles`
- `employee_bank_profiles`
- `contracts`

All tables include `organization_id` FK for tenant isolation.

**Blocking deliverable:** All tables migrated to dev DB; oRPC CRUD procedures for employees, departments, and organizations working with proper auth middleware

---

## Tier 3 — Core HRMS

### Phase 7: Attendance + Leave Modules
**Status: Planned**

- `attendance_events`, `attendance_records`, `work_records`, `overtime_records`, `attendance_policies`
- `leave_types`, `leave_policies`, `leave_balances`, `leave_requests`, `leave_allocations`, `holiday_calendars`, `company_leave_days`
- oRPC procedures for check-in/check-out, leave request, leave approval
- All procedures behind `requirePermission` middleware

**Blocking deliverable:** An employee can check in/out via web; a manager can approve a leave request; all guarded by server-side permission checks

---

### Phase 8: Payroll Engine — Core
**Status: Planned**

- `payroll_country_profiles`, `payroll_tax_brackets`, `payroll_periods`, `payroll_runs`, `payroll_payslips`
- `payroll_allowances`, `payroll_deductions`
- Core pay run calculation pipeline (gross → deductions → net)
- Payslip generation and display
- Payroll approval workflow

**Blocking deliverable:** A payroll run can be computed and a payslip rendered for a single employee on a single country profile

---

### Phase 9: Multi-Country Payroll — Caribbean First
**Status: Planned**

Country profiles to implement:
- **Guyana (GY):** NIS (employee + employer), PAYE income tax
- **Trinidad & Tobago (TT):** NIS, Health Surcharge, PAYE
- **Barbados (BB):** NIS (employee + employer), PAYE
- **Jamaica (JM):** NHT (National Housing Trust), NIS, Education Tax, PAYE

Each country profile implements:
- Statutory deduction rates (verify against current legislation before activating)
- Tax brackets for the current tax year
- Employer contribution rates
- Country-specific payslip fields

Do not ship real statutory calculations without legal verification.

**Blocking deliverable:** Pay run for a GY employee produces a payslip with correct NIS and PAYE line items (verified against sample calculation)

---

## Tier 4 — Extended HRMS (P1)

### Phase 10: Recruitment + Onboarding + Offboarding
**Status: Planned**

- `job_openings`, `candidates`, `recruitment_stages`, `recruitment_stage_transitions`
- `onboarding_stages`, `onboarding_tasks`, `onboarding_templates`
- `offboarding_records`, `offboarding_tasks`
- Candidate-to-employee conversion workflow

---

### Phase 11: Performance Management
**Status: Planned**

- `goals`, `key_results`, `feedback`, `review_cycles`, `performance_reviews`
- Self-evaluation forms, manager review, review cycle lifecycle

---

### Phase 12: Assets + Helpdesk + Projects
**Status: Planned**

- `assets`, `asset_categories`, `asset_requests`, `asset_allocations`
- `helpdesk_tickets`, `helpdesk_categories`, `helpdesk_sla_definitions`
- `projects`, `project_tasks`, `timesheet_entries`

---

### Phase 13: Biometric + Geofencing
**Status: Planned**

- `biometric_devices`, `biometric_employee_mappings`, `biometric_import_jobs`
- `geofence_zones`, `geofence_zone_assignments`, `geofence_events`
- Mobile GPS validation in Expo native app

---

### Phase 14: Documents + Audit + Notifications + Automations
**Status: Planned**

- `documents`, `document_requests`
- `audit_events` (universal audit log — backfill earlier module writes)
- `notifications`, `notification_preferences`
- `automation_rules`, `automation_run_logs`

---

## Tier 5 — Native and Desktop

### Phase 15: Native Mobile App (Expo)
**Status: Planned**

- Employee self-service flows in `apps/native`
- Attendance check-in with GPS (geofencing integration)
- Leave request submission and status
- Payslip view
- Push notifications

---

### Phase 16: Tauri Desktop
**Status: Planned**

- Package `apps/web` as a Tauri 2.x desktop application
- Windows + macOS targets
- Offline-capable views (read-only payslip and employee data)

---

## Tier 6 — Integration

### Phase 17: Integration Bridge — Horilla Import/Sync
**Status: Planned**

- One-time Horilla data import tool (not a runtime dependency)
- `integration_sources`, `horilla_record_links` bridge tables
- Import jobs: employees, departments, attendance history, leave history
- Data validation and conflict resolution
- No ongoing runtime connection to Horilla

---

## Phase Status Key

| Status | Meaning |
|---|---|
| Complete | Deliverables committed |
| In Progress | Actively being worked |
| Planned | Scoped, not started |
| Blocked | Waiting on a dependency |
| Future | On roadmap, not yet scoped |
