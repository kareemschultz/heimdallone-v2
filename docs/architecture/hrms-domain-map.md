# HRMS Domain Map

Complete entity map using Heimdallone-native naming. Table names use `snake_case`. Every domain table carries `organization_id` (FK to Better Auth `organization.id`) for tenant isolation unless noted as platform-level.

Do not implement schemas until Phase 6 (core domain) or the corresponding module phase. This document is the authoritative naming reference — all schema files, oRPC procedures, and type definitions use these names.

---

## Entity Family: Platform

These tables define the structural foundation. Most reference an organization.

| Table | Description | Org-scoped |
|---|---|---|
| `organizations` | Extends Better Auth `organization`; top-level tenant | No (is the org) |
| `organization_settings` | Per-org config: currency, timezone, fiscal year | Yes |
| `legal_entities` | Companies/subsidiaries within an organization | Yes |
| `countries` | Reference table of supported countries (ISO 3166-1) | No (global) |
| `locations` | Physical work sites / offices | Yes |

### Key relationships

```
organization 1──1 organization_settings
organization 1──* legal_entities
organization 1──* locations
countries (reference, not org-scoped)
```

---

## Entity Family: Structure

Organizational structure tables. All org-scoped.

| Table | Description | Horilla reference |
|---|---|---|
| `departments` | Department hierarchy (parent_id self-reference) | `base.Department` |
| `job_positions` | Named position within the org (e.g. "Senior Engineer") | `base.JobPosition` |
| `job_roles` | Functional role within a position (e.g. "Tech Lead") | `base.JobRole` |
| `work_types` | Office, remote, hybrid, field | `base.WorkType` |
| `employee_types` | Full-time, part-time, contract, intern | `base.EmployeeType` |
| `shifts` | Named shift: name, start_time, end_time, days, grace_period_minutes | `base.Shift` |

### Key relationships

```
departments self-references (parent_department_id)
job_positions → departments
job_roles → job_positions
shifts → work_types (optional)
```

---

## Entity Family: People

Core people records. All org-scoped.

| Table | Description | Horilla reference |
|---|---|---|
| `employees` | Core employee profile: name, DOB, gender, nationality, contact, status, badge_id | `employee.Employee` |
| `employee_work_profiles` | Work info: department, position, role, manager, type, shift, join_date, location | `employee.EmployeeWorkInformation` |
| `employee_bank_profiles` | Bank account and payroll routing info | `employee.EmployeeBankDetails` |
| `contracts` | Employment contract: salary, currency, pay_period, country, start/end, type | `payroll.Contract` |

### Key relationships

```
employees → organization
employees → user (optional — not all employees have a login)
employee_work_profiles → employees (1:1)
employee_work_profiles → departments
employee_work_profiles → job_positions
employee_work_profiles → job_roles
employee_work_profiles → shifts
employee_work_profiles → work_types
employee_work_profiles → employee_types
employee_work_profiles → locations
employee_bank_profiles → employees (1:1)
contracts → employees
contracts → legal_entities
contracts → countries
```

---

## Entity Family: Attendance

Raw and processed attendance data. All org-scoped.

| Table | Description | Horilla reference |
|---|---|---|
| `attendance_events` | Raw punch: employee, timestamp, event_type (check_in/check_out), source | `attendance.AttendanceActivity` |
| `attendance_records` | Validated daily record: date, employee, shift, in_time, out_time, worked_hours, state | `attendance.Attendance` |
| `work_records` | Approved hours record feeding into payroll | `attendance.AttendanceOverTime` (work portion) |
| `overtime_records` | Excess hours with approval state | `attendance.AttendanceOverTime` (OT portion) |
| `attendance_policies` | Grace period rules, late threshold, overtime threshold per shift/org | `attendance.ValidationCondition` |

### States for `attendance_records.state`

`present`, `absent`, `half_day`, `on_leave`, `holiday`, `conflict`

### Sources for `attendance_events.source`

`web_checkin`, `mobile_checkin`, `biometric_import`, `geofence_auto`, `manual_entry`

---

## Entity Family: Biometric and Geofencing

| Table | Description | Horilla reference |
|---|---|---|
| `biometric_devices` | Device registry: name, ip_address, port, device_type, location_id, status | `biometric.BiometricDevices` |
| `biometric_employee_mappings` | Employee enrolled on device (fingerprint/face template reference) | biometric employee mapping |
| `biometric_import_jobs` | Scheduled or manual pull job: device, status, last_run, records_imported | biometric import job |
| `geofence_zones` | Named zone: latitude, longitude, radius_meters, location_id | `geofencing.GeoFencing` |
| `geofence_zone_assignments` | Which employees/departments must check in within a zone | geofencing assignment |
| `geofence_events` | GPS coordinates at check-in, within_zone flag, accuracy_meters | geofencing event |

---

## Entity Family: Leave

| Table | Description | Horilla reference |
|---|---|---|
| `leave_types` | Leave type definition: name, carryover_allowed, max_days, paid, country_specific | `leave.LeaveType` |
| `leave_policies` | Which employee types/countries get which leave types and accrual rules | `leave.LeaveTypeAssign` |
| `leave_balances` | Employee's current balance per leave type (updated on accrual and usage) | `leave.AvailableLeave` |
| `leave_requests` | Individual request: employee, type, dates, reason, state, approver | `leave.LeaveRequest` |
| `leave_allocations` | Manual allocation by HR: employee, type, days, reason | `leave.LeaveAllocationRequest` |
| `holiday_calendars` | Named calendar (country or org): list of holidays with dates and names | `leave.Holidays` / `leave.CompanyLeave` |
| `company_leave_days` | Org-wide closure days (distinct from personal leave) | `leave.CompanyLeave` |

### States for `leave_requests.state`

`draft`, `submitted`, `approved`, `rejected`, `cancelled`, `reverted`

---

## Entity Family: Payroll

| Table | Description | Horilla reference |
|---|---|---|
| `payroll_country_profiles` | Country-specific rule set: country_code, tax_year, currency, statutory rates | Heimdallone-native |
| `payroll_tax_brackets` | Progressive tax brackets: country_profile_id, min_income, max_income, rate | `payroll.TaxBracket` |
| `payroll_periods` | Named period definition: org, type (monthly/biweekly/weekly), start_date, end_date | `payroll.PayrollPeriod` |
| `payroll_runs` | Batch computation for a period: org, period, country, state, initiated_by | `payroll.Payslip` (run-level) |
| `payroll_payslips` | Individual payslip: run_id, employee, gross, deductions, net, state | `payroll.Payslip` |
| `payroll_allowances` | Named allowance definition: name, amount_or_pct, taxable, recurring | `payroll.Allowance` |
| `payroll_deductions` | Named deduction definition: name, amount_or_pct, statutory, pre/post_tax | `payroll.Deduction` |

### States for `payroll_runs.state`

`draft`, `processing`, `review`, `approved`, `paid`, `cancelled`

### States for `payroll_payslips.state`

`draft`, `computed`, `approved`, `sent`, `cancelled`

---

## Entity Family: Recruitment

| Table | Description | Horilla reference |
|---|---|---|
| `job_openings` | Posting: title, department, position, open_date, close_date, hiring_manager_id | `recruitment.Recruitment` |
| `candidates` | Applicant: name, email, applied_position, source, current_stage_id | `recruitment.Candidate` |
| `recruitment_stages` | Stage definitions per pipeline: name, order, type | `recruitment.Stage` |
| `recruitment_stage_transitions` | Candidate stage movement history | candidate stage log |
| `candidate_documents` | Documents submitted by candidate | candidate document |

---

## Entity Family: Onboarding and Offboarding

| Table | Description | Horilla reference |
|---|---|---|
| `onboarding_stages` | Named stage: pre_arrival, day_1, week_1, month_1 | `onboarding.OnboardingStage` |
| `onboarding_tasks` | Task in a stage: title, assigned_to, category, due_date, completed_at | `onboarding.OnboardingTask` |
| `onboarding_templates` | Reusable onboarding plan per role/department | onboarding template |
| `offboarding_records` | Exit record: employee, type (resignation/termination), last_day, state | `offboarding.Offboarding` |
| `offboarding_tasks` | Exit checklist items: asset_return, access_revocation, final_payroll | offboarding task |

---

## Entity Family: Performance

| Table | Description | Horilla reference |
|---|---|---|
| `goals` | Employee goal: title, description, owner_id, cycle_id, status | `pms.EmployeeObjective` |
| `key_results` | Measurable outcome for a goal: title, target_value, current_value, unit | `pms.EmployeeKeyResult` |
| `feedback` | Peer/manager/self feedback: from_id, to_id, cycle_id, content, rating | `pms.Feedback` |
| `review_cycles` | Named cycle: Q1 2025, Annual 2025 — with start/end dates, state | `pms.Period` |
| `performance_reviews` | Employee's review in a cycle: scores, comments, state | `pms.EmployeePerformance` |

---

## Entity Family: Assets

| Table | Description | Horilla reference |
|---|---|---|
| `assets` | Asset record: name, category_id, serial_number, purchase_date, value, status | `asset.Asset` |
| `asset_categories` | Category definition: laptop, phone, vehicle | `asset.AssetCategory` |
| `asset_requests` | Employee request for asset allocation | `asset.AssetRequest` |
| `asset_allocations` | Asset allocated to employee with date | `asset.AssetAssignment` |

### States for `assets.status`

`available`, `allocated`, `under_maintenance`, `retired`, `lost`

---

## Entity Family: Projects and Helpdesk

| Table | Description | Horilla reference |
|---|---|---|
| `projects` | Project: name, description, owner_id, start_date, end_date, status | `project.Project` |
| `project_tasks` | Task in a project: title, assigned_to, due_date, status | `project.Task` |
| `timesheet_entries` | Hours logged by employee against a task | `project.ProjectTaskMilestone` (time portion) |
| `helpdesk_tickets` | Support ticket: title, category_id, raised_by, assigned_to, state, priority | `helpdesk.Ticket` |
| `helpdesk_categories` | Category definitions with SLA targets | `helpdesk.Department` |
| `helpdesk_sla_definitions` | Response and resolution time targets per category | helpdesk SLA |

---

## Entity Family: System

| Table | Description | Horilla reference |
|---|---|---|
| `audit_events` | Universal audit log: user_id, org_id, table_name, record_id, action, old_value, new_value, timestamp | `horilla_audit` |
| `documents` | Document metadata: name, type, owner_employee_id, file_url, expiry_date, status | `horilla_documents` |
| `document_requests` | HR request for a document from an employee | document request |
| `notifications` | Notification record: recipient_id, type, message, read_at, created_at | `notifications.Notification` |
| `notification_preferences` | Per-user opt-in/out per notification type and channel | notification preference |
| `automation_rules` | Trigger + condition + action definition | `horilla_automations` |
| `automation_run_logs` | Execution log per rule trigger | automation log |

---

## Naming Convention Rules

1. Table names: `snake_case`, plural nouns
2. Column names: `snake_case`
3. Primary keys: `id` (UUID string, generated by application)
4. Foreign keys: `<referenced_table_singular>_id` (e.g. `employee_id`, `organization_id`)
5. Timestamps: `created_at`, `updated_at` (defaultNow / $onUpdate)
6. Soft delete: `deleted_at` (nullable timestamp) — not a `is_deleted` boolean
7. Tenant isolation: `organization_id` on every domain table, non-nullable

Do not use Django-style names (`EmployeeWorkInformation`, `LeaveTypeAssign`, `AttendanceOverTime`). Use the Heimdallone-native names in this document.
