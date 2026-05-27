# Contracts Module Specification

> **Phase 6 implementation plan**: See [`docs/architecture/contracts-implementation-plan.md`](../contracts-implementation-plan.md) for full schema, API, UI, RBAC, and business rules.

## Purpose

Employment contracts define the legal and financial terms of an employee's engagement: wage type, pay frequency, base salary, filing status, notice period, and contract dates. Every payroll calculation starts from the active contract.

## Source References

- `docs/horilla-extraction/payroll.md` — Contract model (draft/active/expired/terminated, wage type, pay frequency)
- `docs/horilla-extraction/hr-core.md` — Contract linked to employee work info
- `docs/architecture/hr-core-schema-spec.md` — `employee_work_info.basicSalary` field

## Dependencies

- **HR Core** (P0) — employee_profile, employee_work_info, department, job_position, shift

## First Version Scope

- Contract CRUD with status lifecycle (draft → active → expired → terminated)
- One active + one draft contract per employee
- Active contract syncs `basicSalary` to employee_work_info
- Contract document upload
- Auto-expire when end_date < today

## Deferred Scope

- Contract renewal workflow
- Contract templates
- Probation period tracking
- Contract comparison (diff two contracts)
- Bulk contract generation

## Proposed Entities

### `contract`

- **Purpose**: Employment agreement linking employee to compensation terms
- **Key fields**: id, organizationId, employeeId (FK), contractName, startDate (date), endDate (date, nullable), wageType (daily/monthly/hourly — pgEnum), payFrequency (weekly/monthly/semi_monthly — pgEnum), baseSalary (numeric 12,2), salaryCurrency (text, default "GYD"), filingStatusId (FK, nullable), status (draft/active/expired/terminated — pgEnum), departmentId, jobPositionId, shiftId, workTypeId, noticePeriodDays (int, default 30), documentUrl (nullable), deductLeaveFromBasicPay (bool, default true), notes (text, nullable), createdAt, updatedAt
- **Tenant scope**: organizationId FK
- **Audit**: All changes tracked, especially salary and status transitions
- **Archive/delete**: Soft — status transitions only (terminated is the "archive"). Never hard delete.
- **Sensitive**: Salary is sensitive — same masking rules as bank details for non-HR roles
- **Open questions**: Should filing status be a separate entity or an enum? Separate entity allows per-country tax configurations.

### `filing_status`

- **Purpose**: Tax calculation method (bracket-based or custom)
- **Key fields**: id, organizationId, name, basedOn (basic_pay/gross_pay/taxable_gross_pay), brackets (jsonb — array of {min, max, rate, fixedAmount}), createdAt, updatedAt
- **Tenant scope**: organizationId FK
- **Open questions**: Should brackets be a separate table or JSON? JSON is simpler for Phase 6, separate table allows more complex tax rules later.

## Proposed oRPC Routers

### `contracts`

| Procedure | Input | Permission | Audit | Error Cases |
|-----------|-------|-----------|-------|-------------|
| list | employeeId?, status?, page/size | employee:read | — | — |
| getById | id | employee:read | — | NOT_FOUND |
| create | contractName, employeeId, startDate, wageType, baseSalary, ... | employee:create | create | CONFLICT (active already exists) |
| update | id, partial fields | employee:update | update (changes) | CONFLICT (activating when active exists) |
| activate | id | employee:update | update (status) | CONFLICT |
| terminate | id | employee:terminate | update (status) | — |

## Proposed UI Routes

### `/app/payroll/contracts`
- **Purpose**: Contract management table
- **Primary view**: DataTable with columns: Employee, Contract Name, Status (badge), Wage Type, Salary, Start, End, Actions
- **Filters**: Status, Department, Employee
- **Row actions**: View, Edit, Activate, Terminate (destructive)
- **Empty state**: "No contracts yet. Create an employee contract to set up their compensation."

### Employee profile → Work tab
- Show active contract summary inline
- "View/Edit Contract" link

## RBAC

Uses existing `employee:create/read/update/terminate`. No new resources needed.

## Staff-Friendly UX

- **Confusion**: "What's the difference between Draft and Active?" → Tooltip: "Draft contracts are being prepared. Only one contract can be Active at a time — it defines the employee's current pay."
- **Wizard**: Not needed — single form with clear sections (Details, Compensation, Terms)
- **Confirmation**: Activating a contract shows: "This will set [name]'s base salary to $X. The previous contract will be superseded."
- **Error**: "An active contract already exists for Maya Persaud. Terminate or expire it first."

## Risks

- Mid-month contract changes require proration logic in Payroll
- Multiple overlapping contracts must be prevented at DB level
- Currency changes between contracts affect payroll continuity

## Implementation Readiness

**Ready after HR Core**. No additional dependencies.
