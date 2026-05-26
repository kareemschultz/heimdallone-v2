# Horilla Reference Map

This document maps each Horilla module to its Heimdallone equivalent. Use it to guide domain modeling and feature prioritization. Horilla is a read-only reference — never import, vendor, or connect to it.

**Reading instructions:** For each module, inspect `.references/horilla-hr/<module>/models.py` (and related model files) for domain concepts. Extract business intent, not Django implementation details.

---

## Priority Tiers

| Tier | Meaning |
|---|---|
| P0 | MVP — required for first usable product |
| P1 | v1.0 — required for complete core HRMS |
| P2 | v1.x — planned post-launch expansion |
| P3 | Future — on roadmap, no committed timeline |

---

## P0 Modules (MVP)

### `base` — Platform Foundation

**Purpose:** Company structure, organizational hierarchy, and work configuration. Every other Horilla module depends on `base` for FK references.

**Key domain concepts:**
- Company entity with address, currency, and timezone
- Department hierarchy (department → parent department)
- Job position (title within a company)
- Job role (functional role within a position)
- Work type (office, remote, hybrid, fieldwork)
- Employee type (full-time, part-time, contract, intern)
- Shift (named work schedule: start time, end time, days, grace periods)
- Holiday calendars (country-level and company-level)
- Rotating shift schedules

**Heimdallone equivalent concepts:**
- `organizations` (replaces Company — owned by Better Auth Organization)
- `legal_entities` (subsidiary companies within an organization)
- `departments`
- `job_positions`
- `job_roles`
- `work_types`
- `employee_types`
- `shifts`
- `holiday_calendars`

**Priority:** P0

---

### `employee` — Employee Profiles

**Purpose:** Central employee record. All other modules FK into the employee.

**Key domain concepts:**
- Employee personal profile (name, DOB, gender, nationality, contact)
- Employee work information (department, position, role, manager, work type, shift, join date)
- Employee bank details (account number, bank name, branch — used by payroll)
- Emergency contacts
- Documents attached to employee
- Employee self-service fields
- Employee status (active, on leave, terminated, probation)
- Badge ID / employee number

**Heimdallone equivalent concepts:**
- `employees` (core profile record)
- `employee_work_profiles` (work info FK on employee)
- `employee_bank_profiles` (bank/payroll info FK on employee)
- `employee_emergency_contacts`
- `employee_documents` (via `documents` table)

**Priority:** P0

---

### `attendance` — Attendance Tracking

**Purpose:** Records and validates employee attendance. Connects to biometric, geofencing, leave, and payroll.

**Key domain concepts:**
- Attendance event (raw punch: employee, timestamp, type: check-in/check-out, source)
- Attendance activity (clock-in/out record within a day)
- Attendance (validated daily record: date, employee, shift, in-time, out-time, worked hours)
- Work record (approved worked hours feeding into payroll)
- Overtime record (excess hours, approval state)
- Attendance validation conditions (grace period, late arrival threshold)
- Attendance states: present, absent, half-day, on leave, holiday, conflict
- Manual correction workflow
- Approval flow (manager or HR validates attendance)

**Heimdallone equivalent concepts:**
- `attendance_events` (raw punches)
- `attendance_records` (validated daily records)
- `work_records` (approved, payroll-ready)
- `overtime_records`
- `attendance_policies` (grace periods, thresholds)

**Priority:** P0

---

### `leave` — Leave Management

**Purpose:** Defines leave types, tracks balances, manages requests and approvals.

**Key domain concepts:**
- Leave type (annual, sick, maternity, unpaid — with carryover rules)
- Leave policy (which employees get which leave types, accrual rules)
- Leave balance (employee's available days per leave type)
- Leave request (dates, type, reason, approval state)
- Leave allocation request (manual allocation by HR)
- Company leave day (org-wide closure)
- Holiday (country/region public holiday)
- Leave approval conditions (multi-level, manager chain)
- Leave restrictions (employee past behavior triggers)

**Heimdallone equivalent concepts:**
- `leave_types`
- `leave_policies`
- `leave_balances`
- `leave_requests`
- `leave_allocations`
- `holiday_calendars`
- `company_leave_days`

**Priority:** P0

---

### `payroll` — Payroll Engine

**Purpose:** Computes and issues payslips. Depends on employee, attendance, and leave for input data.

**Key domain concepts:**
- Contract (employee salary structure: basic pay, currency, pay period, country)
- Allowances (fixed or percentage, taxable or not)
- Deductions (statutory and voluntary)
- Filing type (tax filing status: single, married, etc.)
- Tax bracket (progressive tax rate table by country)
- Pay period (monthly, bi-weekly, weekly definition)
- Pay run (batch payroll computation for a period)
- Payslip (individual computed payslip with all components)
- Payroll settings (company-level defaults)
- Loans / installments (advance salary repaid via deductions)
- Reimbursements

**Heimdallone equivalent concepts:**
- `contracts`
- `payroll_country_profiles` (country-specific rule sets)
- `payroll_tax_brackets`
- `payroll_periods`
- `payroll_runs`
- `payroll_payslips`
- `payroll_allowances`
- `payroll_deductions`

**Priority:** P0

---

### `horilla_audit` — Audit Trail

**Purpose:** Records who changed what and when across all models.

**Key domain concepts:**
- Audit event (user, timestamp, model, object id, action type, old value, new value)
- Change history per record
- Who triggered the change (employee self-service vs HR vs system job)

**Heimdallone equivalent concepts:**
- `audit_events` (universal audit log table)

**Priority:** P0

---

## P1 Modules (v1.0)

### `biometric` — Biometric Device Integration

**Purpose:** Integrates hardware attendance terminals (ZKTeco and similar) with the attendance module.

**Key domain concepts:**
- Device registry (device name, IP, port, type, location)
- Employee-device mapping (employee fingerprint/face ID enrolled per device)
- Import job (scheduled or manual pull of punch records from device)
- Raw biometric attendance records (before validation)
- Device connectivity state

**Heimdallone equivalent concepts:**
- `biometric_devices`
- `biometric_employee_mappings`
- `biometric_import_jobs`

**Priority:** P1

---

### `geofencing` — Location-Based Attendance

**Purpose:** Restricts or validates attendance check-ins based on GPS coordinates.

**Key domain concepts:**
- Geofence zone (name, latitude, longitude, radius in meters, linked to work site)
- Zone assignment (which employees or departments must be within a zone to check in)
- Geofence attendance event (GPS coordinates at check-in, within/outside zone flag)
- Mobile-only GPS validation

**Heimdallone equivalent concepts:**
- `geofence_zones`
- `geofence_zone_assignments`
- `geofence_events`

**Priority:** P1

---

### `recruitment` — Recruitment Pipeline

**Purpose:** Manages job openings, candidate applications, stages, and hiring workflow.

**Key domain concepts:**
- Job opening (title, department, position, open date, hiring manager)
- Candidate (personal info, applied position, source)
- Recruitment stage (screening, interview 1, interview 2, offer, hired, rejected)
- Stage transition (candidate moves through pipeline stages)
- Interview scheduling
- Offer letter generation
- Candidate documents
- Conversion to employee on hire

**Heimdallone equivalent concepts:**
- `job_openings`
- `candidates`
- `recruitment_stages`
- `recruitment_stage_transitions`
- `candidate_documents`

**Priority:** P1

---

### `onboarding` — Employee Onboarding

**Purpose:** Manages tasks and stages for bringing a new hire into the organization.

**Key domain concepts:**
- Onboarding stage (pre-arrival, day 1, week 1, month 1)
- Onboarding task (task name, assigned to, due date, completion state)
- Task categories (IT setup, document submission, policy acknowledgement, training)
- Candidate-to-employee conversion trigger
- Checklist template (reusable onboarding plans per role/department)

**Heimdallone equivalent concepts:**
- `onboarding_stages`
- `onboarding_tasks`
- `onboarding_templates`

**Priority:** P1

---

### `offboarding` — Employee Offboarding

**Purpose:** Manages the exit workflow for departing employees.

**Key domain concepts:**
- Resignation/termination record
- Exit checklist (asset return, knowledge transfer, final payroll, access revocation)
- Exit interview record
- Last working day
- Document archival
- Final payslip trigger

**Heimdallone equivalent concepts:**
- `offboarding_records`
- `offboarding_tasks`

**Priority:** P1

---

### `horilla_documents` — Document Management

**Purpose:** Stores and manages employee-related documents and document request workflows.

**Key domain concepts:**
- Document record (file reference, type, owner employee, expiry date, status)
- Document request (HR requests a document from an employee)
- Document categories
- Approval/acknowledgement states

**Heimdallone equivalent concepts:**
- `documents`
- `document_requests`

**Priority:** P1

---

### `notifications` — Notification System

**Purpose:** Delivers in-app and email notifications for workflow events across all modules.

**Key domain concepts:**
- Notification record (recipient, type, message, read state, timestamp)
- Notification preference (employee opts in/out of specific notification types)
- Notification triggers (leave approved, payslip ready, task assigned, etc.)
- Delivery channels (in-app, email)

**Heimdallone equivalent concepts:**
- `notifications`
- `notification_preferences`

**Priority:** P1

---

## P2 Modules (v1.x)

### `pms` — Performance Management

**Purpose:** Manages goal-setting, feedback, and formal review cycles.

**Key domain concepts:**
- Goal (employee-level goal with key results)
- Key result (measurable outcome attached to a goal)
- Feedback (peer, manager, or self-feedback record)
- Review cycle (named period: Q1, annual — with start/end dates)
- Performance review (employee's review in a cycle, with scores and comments)
- Self-evaluation form

**Heimdallone equivalent concepts:**
- `goals`
- `key_results`
- `feedback`
- `review_cycles`
- `performance_reviews`

**Priority:** P2

---

### `asset` — Asset Management

**Purpose:** Tracks company assets, allocation to employees, and return workflows.

**Key domain concepts:**
- Asset (name, category, serial number, purchase date, value, status)
- Asset category (laptop, phone, vehicle, furniture)
- Asset request (employee requests allocation)
- Asset allocation record (asset assigned to employee with date)
- Asset return record

**Heimdallone equivalent concepts:**
- `assets`
- `asset_categories`
- `asset_requests`
- `asset_allocations`

**Priority:** P2

---

### `project` — Project and Timesheet Tracking

**Purpose:** Tracks internal projects, task assignments, and employee time allocation.

**Key domain concepts:**
- Project (name, description, start/end, status, owner)
- Task (assigned to employee, due date, status)
- Timesheet entry (employee logs hours against a task/project)

**Heimdallone equivalent concepts:**
- `projects`
- `project_tasks`
- `timesheet_entries`

**Priority:** P2

---

### `helpdesk` — Internal Service Desk

**Purpose:** Manages internal support tickets and service requests.

**Key domain concepts:**
- Ticket (title, description, category, raised by, assigned to, SLA, status)
- Ticket category (IT, HR, payroll, admin)
- SLA definition (response time, resolution time by category)
- Ticket assignment and escalation

**Heimdallone equivalent concepts:**
- `helpdesk_tickets`
- `helpdesk_categories`
- `helpdesk_sla_definitions`

**Priority:** P2

---

### `horilla_automations` — Automation Rules

**Purpose:** Defines trigger-based automation rules that execute actions across modules.

**Key domain concepts:**
- Automation rule (trigger event, conditions, action to execute)
- Trigger events (employee joins, leave approved, attendance flag, payroll run)
- Actions (send notification, create task, update field, fire webhook)
- Scheduled jobs (cron-based rules)

**Heimdallone equivalent concepts:**
- `automation_rules`
- `automation_run_logs`

**Priority:** P2

---

## Module Priority Summary

| Module | Horilla path | Heimdallone priority |
|---|---|---|
| base | `base/` | P0 |
| employee | `employee/` | P0 |
| attendance | `attendance/` | P0 |
| leave | `leave/` | P0 |
| payroll | `payroll/` | P0 |
| horilla_audit | `horilla_audit/` | P0 |
| biometric | `biometric/` | P1 |
| geofencing | `geofencing/` | P1 |
| recruitment | `recruitment/` | P1 |
| onboarding | `onboarding/` | P1 |
| offboarding | `offboarding/` | P1 |
| horilla_documents | `horilla_documents/` | P1 |
| notifications | `notifications/` | P1 |
| pms | `pms/` | P2 |
| asset | `asset/` | P2 |
| project | `project/` | P2 |
| helpdesk | `helpdesk/` | P2 |
| horilla_automations | `horilla_automations/` | P2 |
