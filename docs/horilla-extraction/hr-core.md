# HR Core — Horilla Extraction

## Overview

HR Core is the foundation of all HRMS operations. In Horilla, it spans two modules: `base/` (organizational structure) and `employee/` (personnel management). Together they define companies, departments, job positions, job roles, work types, shifts, employee types, and the Employee model with its work information, bank details, notes, policies, disciplinary actions, and bonus points.

## Horilla Files Inspected

- `base/models.py` (1865 lines) — Company, Department, JobPosition, JobRole, WorkType, RotatingWorkType, EmployeeShift, ShiftSchedule, RotatingShift, WorkTypeRequest, ShiftRequest, Tags, Holidays, CompanyLeaves, PenaltyAccounts, Announcements, DynamicEmailConfiguration, MultipleApprovalCondition
- `employee/models.py` (1004 lines) — Employee, EmployeeWorkInformation, EmployeeBankDetails, EmployeeNote, Policy, BonusPoint, DisciplinaryAction, Actiontype, EmployeeGeneralSetting

## Important Models

### Organization Structure

**Company** — Top-level entity. Fields: name, hq (boolean), address, country, state, city, zip, icon, date_format, time_format. One company can be HQ. Date/time format is per-company.

**Department** — Belongs to company (M2M). Unique per company. Simple name field.

**JobPosition** — Links to Department (FK). Company (M2M). Represents a role within a department (e.g., "Software Engineer" in "Engineering").

**JobRole** — Links to JobPosition (FK). More specific than position (e.g., "Senior Backend Engineer"). Unique together with job_position.

**WorkType** — Defines how an employee works (e.g., "Remote", "On-site", "Hybrid"). Company-scoped.

**EmployeeType** — Categories like "Full-time", "Part-time", "Contractor", "Intern". Company-scoped.

**EmployeeShift** — Named shift with weekly schedule. Fields: name, weekly_full_time (default "40:00"), full_time (default "200:00" monthly), grace_time FK. Links to EmployeeShiftSchedule for per-day start/end times.

**EmployeeShiftSchedule** — Per-day schedule for a shift. Fields: day, shift FK, minimum_working_hour (default "08:15"), start_time, end_time, is_night_shift (auto-calculated if start > end), auto_punch_out_enabled, auto_punch_out_time.

**RotatingWorkType / RotatingShift** — Allows employees to rotate between work types or shifts on a schedule (weekly, monthly, or after N days). Tracks current and next assignment with change dates. Only one active assignment per employee.

### Employee

**Employee** — Core entity. Fields: badge_id, user FK (OneToOne to Django User), first_name, last_name, profile_image, email (unique), phone, address, country, state, city, zip, dob, gender, qualification, experience, marital_status, children, emergency_contact/name/relation, is_active, additional_info (JSON).

Key behaviors:
- Auto-creates Django User on save (username=email, password=phone)
- Auto-creates EmployeeWorkInformation if none exists
- Validates profile image (supports SVG and raster)
- Archive protection: cannot archive if employee is a reporting manager, recruitment manager, or onboarding stage/task manager
- XSS protection on text fields

**EmployeeWorkInformation** — OneToOne to Employee. Fields: department FK, job_position FK, job_role FK, reporting_manager FK (self-referential Employee), shift FK, work_type FK, employee_type FK, tags M2M, location (CharField), company FK, work_email, work_phone, joining_date, contract_end_date, basic_salary, salary_hour, experience (auto-calculated from joining_date). Has audit history tracking.

**EmployeeBankDetails** — OneToOne to Employee. Fields: bank_name, account_number (unique across employees), branch, address, country, state, city, bank_code_1, bank_code_2, additional_info (JSON).

**EmployeeNote** — Notes on employees. Fields: employee FK, description, note_files M2M, updated_by (Employee FK).

**Policy** — Company policies. Fields: title, body, is_visible_to_all, specific_employees M2M, attachments M2M, company M2M.

**BonusPoint** — OneToOne to Employee. Fields: points (int), encashment_condition, redeeming_points, reason. Auto-created for every new employee via post_save signal.

**DisciplinaryAction** — Fields: employee M2M, action FK (to Actiontype), description, unit_in (days/hours), days, hours, start_date, attachment. Actiontype has title, action_type (warning/suspension/dismissal), and block_option (can block employee login).

### Requests

**WorkTypeRequest** — Employee requests a work type change. Fields: employee FK, requested work_type FK, previous work_type FK, requested_date, requested_till, description, is_permanent, approved, canceled. Validates no overlapping approved requests. Cannot delete once approved.

**ShiftRequest** — Employee requests a shift change. Same pattern as WorkTypeRequest with additional reallocate_to (swap with another employee). Has reallocate_approved/canceled flags.

### Organizational

**Holidays** — Company holidays. Fields: name, start_date, end_date, recurring (boolean), company FK.

**CompanyLeaves** — Recurring weekly off days. Fields: based_on_week (1st-5th week or null for every), based_on_week_day (Mon-Sun), company FK.

**Announcement** — Company announcements. Fields: title, description, attachments M2M, expire_date, employees M2M, department M2M, job_position M2M, company M2M, disable_comments, public_comments. Tracks views per user.

**MultipleApprovalCondition** — Configurable multi-level approval chains per department. Uses condition fields/operators/values (e.g., "if leave requested_days > 5, route to manager chain").

## State Machine / Lifecycle

**WorkTypeRequest / ShiftRequest**: Requested → Approved | Rejected (canceled). Cannot delete once approved.

**Employee**: Active → Archived (soft). Archive blocked if employee has dependent relationships (reporting manager, recruitment manager, etc.).

**DisciplinaryAction**: Created with action type (warning/suspension/dismissal). Suspension/dismissal can block employee login.

## Permissions and RBAC

- `change_ownprofile` — Employee can update own profile
- `view_ownprofile` — Employee can view own profile
- `approve_worktyperequest` — Approve work type requests
- `cancel_worktyperequest` — Cancel work type requests
- `approve_shiftrequest` — Approve shift requests
- `cancel_shiftrequest` — Cancel shift requests

All models use `HorillaCompanyManager` for company-scoped queries (multi-tenant isolation).

## Forms, Validation, Filters

- Employee email must be unique
- Badge ID must be unique (when not null)
- Employee first_name + last_name + email unique together
- Bank account_number unique across employees
- Work type/shift requests validate no overlapping approved requests for the same employee
- Department unique per company
- Shift schedule: one entry per day per shift

## Horilla UI → Backend Workflow Notes

### Employee List
- Table view with columns: name, badge, department, position, shift, work type, status
- Card/grid view available
- Filters: department, position, shift, work type, employee type, active/archived
- Actions: create, edit, archive, import (CSV), export
- Bulk actions: archive, update department/position/shift

### Employee Profile
- Tabs: Personal Info, Work Info, Bank Details, Documents, Leave Balance, Attendance Summary
- Actions per tab: edit fields, upload documents, view history
- Reporting manager shown as link
- Experience auto-calculated from joining date

### Shift/WorkType Requests
- Employee self-service: submit request
- Manager/HR: approve/reject with comments
- History tracking on all changes

## Heimdallone-native Interpretation

### Drizzle Entity Candidates

- `organization` — Already exists via Better Auth Organization plugin
- `department` — organizationId FK, name, description
- `job_position` — departmentId FK, name
- `job_role` — jobPositionId FK, name
- `work_type` — organizationId FK, name (Remote, On-site, Hybrid)
- `employee_type` — organizationId FK, name (Full-time, Part-time, Contractor, Intern)
- `shift` — organizationId FK, name, weeklyFullTimeMinutes, monthlyFullTimeMinutes
- `shift_schedule` — shiftId FK, day (enum), startTime, endTime, minimumWorkMinutes, isNightShift, autoCheckOutTime
- `employee_profile` — userId FK (Better Auth), organizationId FK, badgeId, firstName, lastName, email, phone, dob, gender, address, country, emergencyContact, profileImageUrl, isActive
- `employee_work_info` — employeeId FK, departmentId FK, jobPositionId FK, jobRoleId FK, reportingManagerId FK (self), shiftId FK, workTypeId FK, employeeTypeId FK, location, workEmail, workPhone, joiningDate, contractEndDate, baseSalary
- `employee_bank_details` — employeeId FK, bankName, accountNumber, branch, bankCode1, bankCode2
- `holiday` — organizationId FK, name, startDate, endDate, isRecurring
- `company_leave_day` — organizationId FK, weekOfMonth (nullable), dayOfWeek
- `shift_request` — employeeId FK, requestedShiftId FK, previousShiftId FK, startDate, endDate, isPermanent, status (enum), description
- `work_type_request` — same pattern as shift_request

### Proposed oRPC Routers

- `organization.departments` — CRUD + list with filters
- `organization.jobPositions` — CRUD, scoped by department
- `organization.shifts` — CRUD with schedule management
- `employees` — CRUD, list with advanced filters, import/export
- `employees.profile` — Get/update personal info
- `employees.workInfo` — Get/update work information
- `employees.bankDetails` — Get/update bank details
- `employees.requests` — Shift/work type request CRUD + approval

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/employees` — Employee list (table/card/org-chart views)
- `/app/employees/$id` — Employee profile with tabs
- `/app/employees/create` — Employee creation wizard
- `/app/settings/organization` — Departments, positions, roles, shifts, work types
- `/app/settings/holidays` — Holiday calendar management

### View Modes
- **Employee list**: Data table (primary), card grid, org chart
- **Employee profile**: Tabbed detail view (Personal, Work, Bank, Documents, Leave, Attendance, History)
- **Org settings**: Sectioned settings page with inline CRUD tables

### Data Table (Employee List)
- Columns: Avatar+Name, Badge, Department, Position, Shift, Work Type, Status, Actions
- Sortable: Name, Department, Joining Date
- Filters: Department, Position, Shift, Work Type, Employee Type, Active/Archived, Country, Location
- Faceted filters for Department and Position
- Row actions: View, Quick Edit (Sheet), Archive
- Bulk actions: Update department, Update shift, Archive, Export
- Search: Name, email, badge
- Empty state: "No employees yet. Add your first team member to get started."

### Forms
- **Employee create**: Multi-step wizard (Personal → Work Info → Bank Details → Review)
- **Employee edit**: Sheet/dialog for quick edits, full page for comprehensive edit
- **Shift request**: Simple form with date range, shift selection, reason
- Use TanStack Form for employee create/edit wizard

## CRUD, Bulk Actions, Filters, and Views

### Primary Records
- Employee: table + detail route, create via wizard, edit via sheet, archive (soft delete), no hard delete
- Department/Position/Role: inline CRUD in settings, no individual routes

### Filters
- Search: name, email, badge
- Status: active, archived
- Department, Position, Role, Shift, Work Type, Employee Type, Location, Country
- Date range: joining date
- Manager: reporting manager
- Custom: tags

### Bulk Actions
- Bulk update department/position/shift/work type
- Bulk archive
- Bulk export (CSV/Excel)

### Status Badges
- Active: green
- Archived: gray/muted
- On Leave: amber
- Expected Working: blue

## Staff-Friendly UX Notes

### Plain-Language Labels
- Avoid: "EmployeeWorkInformation", "FK", "M2M"
- Use: "Work Details", "Department", "Reports To"

### First-Time User Experience
- Empty state with "Add your first employee" CTA
- Setup checklist: Create departments → Add positions → Configure shifts → Add first employee
- Guided wizard for employee creation with clear step indicators

### Common Confusion Points
- Confusion: Difference between Job Position and Job Role
- Prevention: Tooltip explaining "Position is the title (e.g., Engineer), Role is the specialty (e.g., Backend)"
- Confusion: Where to find/change employee shift
- Prevention: Direct link from employee card to Work Info tab

### Role-Specific Simplification
- Employee view: Own profile (personal info, work info read-only, bank details), own requests
- Manager view: Team list filtered to direct reports, approve shift/work type requests
- HR admin view: All employees, full edit, import/export, bulk actions
- Auditor view: Read-only with audit trail visible

### Error and Empty States
- Empty: "No employees match your filters. Try adjusting your search or filters."
- Blocked: Archive blocked — "This employee is a reporting manager for 3 other employees. Reassign them first."
- Validation: "Email already in use by another employee" with link to that employee

## Dependencies

None — HR Core is the foundation for all other modules.

## Edge Cases and Risks

1. **Reporting manager cycles** — Employee A reports to B who reports to A. Must validate no circular references.
2. **Archive with dependencies** — Cannot archive employees who are managers, recruiters, or onboarding task owners without reassignment.
3. **Badge ID uniqueness** — Must be unique when not null (partial unique constraint).
4. **Employee type changes** — Changing from full-time to contractor may affect payroll, leave balances, etc.
5. **Multi-org employees** — A user may have employee records in multiple organizations. Each org has its own employee profile.

## Heimdallone Enhancements Over Horilla/OpenHRMS

1. **Guided employee creation wizard** instead of a flat form with 30+ fields
2. **Inline org chart view** from employee list (not just a table)
3. **Progressive disclosure** — Show basic fields first, reveal advanced fields on demand
4. **Setup checklist** for new tenants — guide HR through department/position/shift setup
5. **Audit timeline** on every employee profile tab showing all changes
6. **Better search** — Full-text across name, email, badge, department, position
7. **Smart defaults** — Pre-fill department/position/shift from most recent similar employee
8. **Bulk import with validation preview** — Show errors before committing
9. **Reporting manager tree view** — Visual org hierarchy from any employee
10. **Document completeness indicator** — Show which required documents are missing

## Priority

**P0** — Foundation. Must be implemented first.
