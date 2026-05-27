# HR Core UI Plan

Phase 5A spec. Defines routes, primitive usage, UX, and staff-friendliness for Phase 5B.

---

## Routes

### `/app/employees` — Employee List

**Purpose**: Primary employee directory. Browse, search, filter, select, and act on employees.

**Roles with access**: All roles. Manager sees direct reports by default. Employee sees only self (redirect to own profile). HR/admin/owner sees all.

**Shared primitives used**:
- **PageHeader** — Title "Employees", badge with count, actions: [Import ▾] [Add Employee]
- **DataTable** — Employee list with columns, sorting, pagination, row selection
- **StatusBadge** (PillStatus) — Active/Probation/Notice/Archived status per row
- **ActionMenu** — Per-row actions dropdown
- **EmptyState** — "No employees yet. Add your first team member to get started." [Add Employee]
- **EntitySheet** — Right-side preview drawer on row click
- **BulkActionToolbar** (Phase 5B stretch) — Bulk archive, update department, export
- **FilterBar** (Phase 5B) — Department, Position, Work Type, Status chips
- **SavedViewTabs** (Phase 5B) — "All · 1,284 | Active | On leave | Archived"

**Table columns**:

| Column | Accessor | Cell | Sortable | Default Visible |
|--------|----------|------|----------|-----------------|
| Name | firstName + lastName | Avatar + Name + Badge ID subtitle | Yes | Yes |
| Department | workInfo.department.name | Text | Yes | Yes |
| Position | workInfo.jobPosition.name | Text | Yes | Yes |
| Shift | workInfo.shift.name | Text | No | Desktop only |
| Work Type | workInfo.workType.name | Text | No | Desktop only |
| Location | workInfo.workLocation | Text + country flag | No | Desktop only |
| Status | isActive | PillStatus badge | No | Yes |
| Actions | — | ActionMenu (View, Edit, Archive) | No | Yes |

**Row click**: Opens EntitySheet with employee preview (Overview, Payroll, Leave, Docs, Activity tabs — matching existing handoff drawer pattern).

**Search**: Global search across firstName, lastName, email, badgeId.

**Empty state**: Icon (Users), title "No employees yet", description "Add your first team member to get started.", action "Add Employee" → navigates to `/app/employees/create`.

**Loading state**: DataTable skeleton (5 rows).

**Error state**: "Unable to load employees. Check your connection." [Retry].

---

### `/app/employees/$id` — Employee Profile

**Purpose**: Full employee detail view with tabbed sections.

**Roles**: All roles can view (scoped by RBAC). Edit actions restricted to HR/admin.

**Shared primitives used**:
- **PageHeader** — Employee name, badge, PillStatus, actions: [Edit ▾] [Archive]
- **StatusBadge** — Profile status
- **ActionMenu** — Edit profile, Edit work info, Edit bank details, Archive (destructive)
- **ConfirmDialog** — Archive confirmation
- **EntitySheet** — Quick-edit sections (open sheet with form for a specific section)

**Tabs** (using handoff `.tabs` CSS, matching existing `$id.tsx` structure):
- **Personal** — Name, email, phone, address, DOB, gender, marital status, emergency contact
- **Work** — Department, position, role, shift, work type, employee type, reporting manager, location, joining date, salary
- **Bank** — Bank name, account (masked for non-HR), branch, codes
- **Documents** — Document list with status badges, upload button, expiry indicators
- **Activity** — AuditTimeline showing all changes to this employee

**Staff-friendly labels**:

| Internal Key | Display Label |
|-------------|---------------|
| reportingManagerId | Reports To |
| jobPositionId | Position |
| jobRoleId | Specialization |
| workTypeId | Work Arrangement |
| employeeTypeId | Employment Type |
| basicSalary | Base Salary |
| salaryCurrency | Currency |
| bankCode1 | Routing / Sort Code |
| bankCode2 | SWIFT / IBAN |

**Bank details masking**:
- Non-HR roles: Account Number → `****1234`, Bank Code → `****XX`
- HR/Payroll: Full values shown
- Visual: Muted text style for masked values with lock icon

---

### `/app/employees/create` — Employee Creation Wizard

**Purpose**: Multi-step form for creating a new employee.

**Roles**: hr_admin, tenant_admin, tenant_owner only.

**Shared primitives used**:
- **WizardForm** (built in Phase 5B) — 4-step wizard
- **ConfirmDialog** — "Discard changes?" on cancel
- **FieldHelp** (built in Phase 5B) — Tooltips for non-obvious fields

**Wizard steps**:

| Step | Title | Fields |
|------|-------|--------|
| 1 | Personal Information | firstName*, lastName, email*, phone, dateOfBirth, gender, maritalStatus |
| 2 | Work Details | departmentId, jobPositionId, jobRoleId, shiftId, workTypeId, employeeTypeId, reportingManagerId, workLocation, joiningDate |
| 3 | Compensation & Banking | basicSalary, salaryCurrency, bankName, accountNumber, branch, bankCode1, bankCode2 |
| 4 | Review & Create | Summary of all fields, edit links per section |

**Fields marked * are required.** Step 2 and 3 are entirely optional — employees can be created with just a name and email.

**Progressive disclosure**: Steps 2 and 3 show a "Skip for now" option. The review step marks skipped sections as "Not set — you can add this later."

**After creation**: Redirect to `/app/employees/$newId` with Sonner toast "Employee created successfully."

**Inline help examples**:
- Badge ID: "Leave blank to auto-generate (e.g., EMP-00042)"
- Reports To: "Select this employee's direct manager"
- Base Salary: "Monthly base salary before allowances and deductions"

---

### `/app/settings/organization` — Organization Settings

**Purpose**: Manage departments, positions, roles, shifts, work types, employee types.

**Roles**: hr_admin, tenant_admin, tenant_owner.

**Layout**: Sectioned page with collapsible groups. Each section is an inline DataTable with add/edit/archive actions.

**Shared primitives used**:
- **PageHeader** — "Organization Settings"
- **DataTable** — One per section (departments, positions, shifts, etc.)
- **ActionMenu** — Per-row edit/archive
- **ConfirmDialog** — Archive confirmation ("Cannot archive — 12 employees are in this department")
- **EmptyState** — Per-section ("No departments yet. Create your first department.")
- **EntitySheet** — Edit form for shifts (which have schedules)

**Sections**:

| Section | Columns | Actions |
|---------|---------|---------|
| Departments | Name, Description, Employees (count), Status | Add, Edit, Archive |
| Job Positions | Name, Department, Description, Employees (count), Status | Add, Edit, Archive |
| Job Roles | Name, Position, Status | Add, Edit, Archive |
| Work Types | Name, Employees (count), Status | Add, Edit, Archive |
| Employee Types | Name, Employees (count), Status | Add, Edit, Archive |
| Shifts | Name, Weekly Hours, Schedule Summary, Employees (count), Status | Add, Edit (with schedule), Archive |

**Shift edit**: Opens EntitySheet with shift name + 7-day schedule grid (day, start time, end time, minimum hours).

**Archive protection**: When archiving a department/position/shift/etc. that has active employees, show error: "Cannot archive 'Engineering' — 15 active employees are assigned to this department. Reassign them first." with link to employee list filtered by that department.

---

### `/app/settings/holidays` — Holiday Management

**Purpose**: Manage public holidays and company calendar.

**Roles**: hr_admin, tenant_admin, tenant_owner.

**Shared primitives used**:
- **PageHeader** — "Holidays", action: [Add Holiday]
- **DataTable** — Holiday list
- **ConfirmDialog** — Delete confirmation

**Columns**: Name, Start Date, End Date, Recurring (badge), Actions (Edit, Delete).

**Empty state**: "No holidays configured. Add your organization's public holidays."

---

### `/app/documents` — Document Management (HR View)

**Purpose**: Organization-wide document overview with lenses.

**Roles**: hr_admin, tenant_admin, tenant_owner (full view). Manager sees team docs. Employee sees own docs.

**Shared primitives used**:
- **PageHeader** — "Documents"
- **DataTable** — Document list
- **StatusBadge** — Document status (uploaded/approved/rejected/requested)
- **SavedViewTabs** — "All | Pending Review | Expiring Soon | Missing"
- **ActionMenu** — Approve, Reject, View, Download

**Columns**: Employee Name, Document Title, Status (badge), Format, Expiry Date, Uploaded Date, Actions.

---

## Staff-Friendly UX

### Employee creation ease
- **Minimal required fields**: Just firstName and email to create a record
- **Skip steps**: Work details and banking can be added later
- **Smart defaults**: Auto-suggest badge ID format, default currency from org setting
- **Inline validation**: Email format checked on blur, duplicate email caught on submit with clear message

### Error messages (plain language)

| Scenario | Message |
|----------|---------|
| Duplicate email | "An employee with this email already exists in your organization." |
| Cannot archive | "Maya Persaud is a manager for 3 employees. Reassign them before archiving." |
| Missing required field | "First name is required." |
| Invalid email | "Enter a valid email address (e.g., name@company.com)." |
| Department delete blocked | "This department has 5 active positions. Archive or reassign them first." |
| Circular manager | "Rohan Gopaul already reports to this employee. This would create a circular chain." |

### Empty states

| Page | Icon | Title | Description | CTA |
|------|------|-------|-------------|-----|
| Employees (new org) | Users | No employees yet | Add your first team member to get started. | Add Employee |
| Employees (filtered) | Search | No results | No employees match your filters. Try adjusting your search. | — |
| Documents (empty) | FileText | No documents | Employee documents will appear here once uploaded. | — |
| Departments | Building | No departments | Create departments to organize your team. | Add Department |
| Shifts | Clock | No shifts configured | Set up work schedules for your employees. | Add Shift |

### Role-specific defaults

| Role | Default employee list view | Default filter |
|------|---------------------------|----------------|
| Employee | Redirect to own profile | — |
| Manager | "My Team" filter active | reportingManagerId = self |
| HR Admin | "All" with no filter | — |
| Payroll Admin | "All" with Department filter | — |
| Auditor | "All" read-only | — |

### Inline help needed

| Field | Help Text |
|-------|-----------|
| Badge ID | "Unique employee identifier. Leave blank to auto-generate." |
| Reports To | "This employee's direct manager. Used for approvals and team views." |
| Base Salary | "Monthly base salary before any allowances or deductions." |
| Work Arrangement | "How this employee works: on-site, remote, hybrid, or field." |
| Employment Type | "Full-time, part-time, contractor, or intern." |
| Specialization | "Optional: a more specific role within the position (e.g., Senior Backend)." |
| Expiry Date (document) | "When this document expires. You'll be notified before the deadline." |

---

## Handoff Alignment

The existing handoff pages (`employees/index.tsx` at 1181 lines, `employees/$id.tsx`) contain mock data and inline JSX. Phase 5B will:

1. **Keep the visual structure** — same CSS classes, same layout, same drawer
2. **Replace mock data arrays** with oRPC queries via TanStack Query
3. **Replace inline table markup** with DataTable component
4. **Replace inline drawer** with EntitySheet component
5. **Replace inline status pills** with StatusBadge/PillStatus
6. **Replace inline action menus** with ActionMenu component
7. **Keep page-specific CSS** (employees.css, employee-profile.css) — these are part of the handoff

What does NOT change: colors, spacing, typography, card shapes, sidebar structure, topbar layout.

---

## Phase 5B Implementation Sequence

1. **Schema** — Create `packages/db/src/schema/hr-core.ts`, export from index
2. **Migrations** — `drizzle-kit generate` + review + push
3. **Seed data** — Extend `scripts/seed-dev.ts` with departments, positions, shifts, employees
4. **API routers** — Create `packages/api/src/routers/hr-core.ts` with all procedures
5. **Wire appRouter** — Add hrCoreRouter to `packages/api/src/routers/index.ts`
6. **Employee list** — Rewire `/app/employees` with DataTable + oRPC query
7. **Employee profile** — Rewire `/app/employees/$id` with live data
8. **Employee create** — New route `/app/employees/create` with WizardForm
9. **Org settings** — New route `/app/settings/organization`
10. **Holidays** — New route `/app/settings/holidays`
11. **Documents** — New route `/app/documents` (or tab on employee profile first)
12. **RBAC verification** — Test each role sees correct data/actions
13. **QA checklist** — Type check, build, visual comparison against handoff

### QA Checklist for Phase 5B

- [ ] `bun run check-types` passes
- [ ] `bun run build` passes
- [ ] Employee list loads with seeded data
- [ ] Employee list shows EmptyState when no employees
- [ ] Employee search works (name, email, badge)
- [ ] Employee row click opens EntitySheet with correct data
- [ ] Employee profile page loads with all tabs
- [ ] Employee create wizard creates employee with all fields
- [ ] Employee create wizard works with minimal fields (name + email only)
- [ ] Employee archive works with confirmation
- [ ] Employee archive blocked when employee is a manager (shows error)
- [ ] Org settings page shows departments/positions/shifts with CRUD
- [ ] Holidays page shows CRUD
- [ ] Bank details masked for employee role, full for HR
- [ ] Audit timeline shows changes on employee profile
- [ ] Manager sees only direct reports by default
- [ ] Employee sees only own profile
- [ ] HR admin sees all employees
- [ ] Auditor sees all employees read-only (no edit/archive actions)
