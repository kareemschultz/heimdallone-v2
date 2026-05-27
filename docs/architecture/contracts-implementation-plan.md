# Contracts Implementation Plan

Phase 6A spec. Bridges HR Core and Payroll.

---

## Domain Scope

Employment contracts define the legal/financial terms of an employee's engagement. Each employee can have **one active** and **one draft** contract at a time. The active contract is the source of truth for salary, wage type, pay frequency, and filing status — all inputs to future payroll calculations.

### Relationship to HR Core

- `contract.employeeId` → `employee_profile.id`
- When a contract activates, it syncs `baseSalary` and `salaryCurrency` to `employee_work_info`
- Contract references `department`, `jobPosition`, `shift`, `workType` at the time of signing (snapshot, not live FK)
- Contract does NOT replace `employee_work_info` — it supplements it with compensation terms

### Relationship to Future Payroll

- Payroll runs will require an active contract per employee
- `baseSalary` + `wageType` + `payFrequency` from the active contract feed the gross-to-net calculation
- `filingStatus` determines tax bracket application
- No payroll work is implemented in Phase 6

---

## Schema Plan

### `contract`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, cascade, NOT NULL | Tenant scope |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| contractName | text | NOT NULL | e.g., "Maya Persaud — 2026 Employment Agreement" |
| startDate | date | NOT NULL | |
| endDate | date | nullable | Null = open-ended/permanent |
| wageType | contractWageTypeEnum | NOT NULL | daily/monthly/hourly |
| payFrequency | contractPayFrequencyEnum | NOT NULL | weekly/monthly/semi_monthly |
| baseSalary | numeric(12,2) | NOT NULL | |
| salaryCurrency | text | NOT NULL, default "GYD" | ISO 4217 |
| filingStatusId | text | FK → filing_status.id, nullable | Tax method |
| status | contractStatusEnum | NOT NULL, default "draft" | draft/active/expired/terminated |
| departmentId | text | FK → department.id, nullable | Snapshot at signing |
| jobPositionId | text | FK → job_position.id, nullable | |
| shiftId | text | FK → shift.id, nullable | |
| workTypeId | text | FK → work_type.id, nullable | |
| noticePeriodDays | integer | NOT NULL, default 30 | |
| documentUrl | text | nullable | Contract file URL |
| deductLeaveFromBasicPay | boolean | NOT NULL, default true | |
| notes | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId), (employeeId), (employeeId, status)
**Unique**: (employeeId, startDate, endDate) — prevent duplicate contracts for same period
**Enums** (pgEnum):
- `contractWageTypeEnum`: daily, monthly, hourly
- `contractPayFrequencyEnum`: weekly, monthly, semi_monthly
- `contractStatusEnum`: draft, active, expired, terminated

**Archive/delete**: Status-based only. `terminated` is the terminal state. Never hard delete.
**Money**: `numeric(12,2)` for `baseSalary` — consistent with HR Core pattern.
**Audit**: All changes tracked via `audit_event`. Status transitions are critical audit events.

### `filing_status`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, cascade, NOT NULL | |
| name | text | NOT NULL | e.g., "GY Standard PAYE", "TT PAYE Band A" |
| basedOn | text | NOT NULL, default "taxable_gross_pay" | basic_pay / gross_pay / taxable_gross_pay |
| brackets | jsonb | NOT NULL | Array of `{min, max, rate, fixedAmount}` |
| isActive | boolean | NOT NULL, default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, name)
**Open question resolved**: JSON brackets for Phase 6 (simpler). Separate bracket table if needed for Phase 8 payroll.

### Contract history

Use the existing generic `audit_event` table — no separate contract_history table needed.

### Contract documents

Use `documentUrl` field on the contract itself. If multiple documents needed, defer to `employee_document` with a contract reference. Phase 6 keeps it simple with one URL.

---

## Business Rules

1. **One active contract per employee** — Attempting to activate a second contract while one is already active returns a friendly error: "An active contract already exists. Terminate or expire it first."
2. **One draft per employee** — Same rule for drafts.
3. **Active contract syncs salary** — When status changes to "active", update `employee_work_info.basicSalary` and `salaryCurrency` to match the contract. This is the canonical salary source.
4. **Auto-expire** — Contracts with `endDate < today` and status "active" should be marked "expired". This can be a scheduled check or on-read check. Phase 6: on-read check when listing contracts.
5. **Terminate vs Archive** — Terminating a contract is a deliberate HR action (early end). Archiving an employee is different — it archives the person. A terminated contract stays on the employee's history.
6. **Payroll prerequisite** — Future payroll will only process employees with active contracts. No active contract = "payroll blocked" for that employee.
7. **Contract changes always audited** — Every create, update, activate, terminate generates an audit event.
8. **Salary masking** — Same rules as HR Core: only HR/admin/payroll see salary values. Employee sees own contract summary without salary in Phase 6 (or not at all).

---

## API Plan

### `contracts` router

| Procedure | Input | Output | Permission | Scope | Audit | Errors |
|-----------|-------|--------|-----------|-------|-------|--------|
| list | employeeId?, status?, page, pageSize | { data: Contract[], total } | employee:read | HR/admin: all. Payroll: all. Others: own only. | — | — |
| getById | id | Contract with employee name | employee:read | Same scope as list | — | NOT_FOUND, FORBIDDEN |
| getByEmployeeId | employeeId | Contract[] for that employee | employee:read | Same scope | — | — |
| create | employeeId, contractName, startDate, wageType, payFrequency, baseSalary, ... | Contract | employee:create (HR only) | Tenant | create | CONFLICT (draft exists) |
| update | id, partial fields | Contract | employee:update (HR only) | Tenant | update | CONFLICT, NOT_FOUND |
| activate | id | Contract | employee:update (HR only) | Tenant | update (status→active) | CONFLICT (active exists), NOT_FOUND |
| terminate | id, reason? | Contract | employee:terminate (HR only) | Tenant | update (status→terminated) | NOT_FOUND |

### `filingStatuses` router

| Procedure | Input | Output | Permission | Errors |
|-----------|-------|--------|-----------|--------|
| list | includeArchived? | FilingStatus[] | employee:read | — |
| create | name, basedOn, brackets | FilingStatus | employee:create (HR only) | CONFLICT (name exists) |
| update | id, name?, basedOn?, brackets? | FilingStatus | employee:update (HR only) | NOT_FOUND |
| archive | id | FilingStatus | employee:update (HR only) | — |

---

## UI Plan

### Route: `/app/payroll/contracts`

**Purpose**: Contract management for HR/payroll admins

**Primitives**: DataTable, StatusBadge, PageHeader, ActionMenu, ConfirmDialog, EmptyState

**Columns**: Employee Name, Contract Name, Status (badge), Wage Type, Base Salary, Currency, Start Date, End Date, Actions

**Saved views**: All, Active, Draft, Expiring Soon (end_date within 30 days), Terminated

**Row actions**:
- View details
- Edit (draft only)
- Activate (draft → active, with confirmation)
- Terminate (active → terminated, with confirmation)

**Empty state**: "No contracts yet. Create an employee contract to set up their compensation terms."

### Employee Profile → Work tab

Add contract summary card showing:
- Active contract name, salary, wage type, start date
- "View contract" link
- "Create contract" if no contract exists

### Contract Create/Edit

Sheet or dialog (not wizard — contracts are simpler than employee creation):
- Contract name (auto-suggest: "{Employee Name} — {Year} Employment Agreement")
- Employee (select, or pre-filled if creating from employee profile)
- Start date, End date (optional)
- Wage type, Pay frequency
- Base salary, Currency
- Filing status (select from org's filing statuses)
- Department, Position, Shift, Work Type (snapshot from employee's current work info)
- Notice period days
- Document upload (URL)
- Notes

---

## RBAC

| Role | List | View | Create | Edit | Activate | Terminate |
|------|------|------|--------|------|----------|-----------|
| tenant_owner | All | All | Yes | Yes | Yes | Yes |
| tenant_admin | All | All | Yes | Yes | Yes | Yes |
| hr_admin | All | All | Yes | Yes | Yes | Yes |
| payroll_admin | All | All | No | No | No | No |
| auditor | All | All | No | No | No | No |
| manager | Own reports | Own reports | No | No | No | No |
| employee | Own only | Own only | No | No | No | No |

Salary values: visible to HR/admin/payroll. Masked or hidden for employee/manager/auditor in Phase 6.

---

## Staff-Friendly UX

### Labels
- "Contract Name" not "contract_name"
- "Base Salary" not "baseSalary"
- "Pay Schedule" for payFrequency
- "Contract Type" for wageType (Monthly / Daily / Hourly)
- "Filing Method" for filingStatus

### Status explanations
- **Draft**: "Being prepared. Not yet effective."
- **Active**: "Currently in effect. Defines this employee's pay."
- **Expired**: "Past its end date. No longer in effect."
- **Terminated**: "Ended early by HR. No longer in effect."

### Confirmations
- Activate: "This will set {name}'s base salary to {salary} {currency} and mark this as their active contract. Any previous active contract must be terminated first."
- Terminate: "This will end {contract name} immediately. The employee will have no active contract until a new one is activated."

### "Why blocked?" messages
- "Cannot activate — {name} already has an active contract ({contract name}). Terminate it first."
- "Cannot create draft — {name} already has a draft contract. Edit the existing one or delete it."
- "Cannot terminate — this contract is already terminated/expired."

### Empty states
- Contracts list: "No contracts yet. Create an employee contract to define their compensation."
- Employee profile: "No contract. Create one to set up this employee's pay."
- Expiring soon: "No contracts expiring in the next 30 days."

---

## Phase 6 Implementation Sequence

| Phase | Scope |
|-------|-------|
| **6A** | Spec review — **done** |
| **6B** | Drizzle schema (`contract`, `filing_status`, 3 pgEnums) + migration + seed data — **done** |
| **6C** | oRPC router (`contracts.*`, `filingStatuses.*`) with scope/audit/errors — **done** (12/12 live checks passed) |
| **6D** | UI: `/app/contracts`, employee profile payroll tab, create/edit sheet, activate/terminate dialogs — **done** |
| **6E** | QA/RBAC/usability closure + payroll/attendance/leave prep docs — **done** |

---

## Phase 6 Verification Results (2026-05-27)

### End-to-End Flows Verified (Browser)

1. **Create contract** — Draft created successfully, auto-suggested name, all fields persisted
2. **Edit contract** — Updated salary and end date on draft, changes saved correctly
3. **Activate contract** — Draft → Active, salary synced to `employee_work_info.basicSalary`
4. **Activation conflict** — Attempting to activate a second contract returned friendly error toast: "An active contract already exists"
5. **Terminate contract** — Active → Terminated with confirmation dialog, employee now has no active contract
6. **Employee profile payroll tab** — Active contract summary card renders correctly with salary, wage type, dates
7. **Console check** — 0 errors on contracts page after all fixes

### Bugs Fixed During Verification

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | 500 on `contracts/update` — `"—"` date | `fmtDate(null)` returns em-dash (truthy), passed to API as date string | Use `toISOString().slice(0,10)` for form state, not display formatter |
| 2 | 400 on employee profile payroll tab | `pageSize: 200` in `employees/$id.tsx` exceeds Zod `max(100)` | Changed to `pageSize: 100` |
| 3 | 400 on employee create wizard | `pageSize: 200` in `employees/create.tsx` same issue | Changed to `pageSize: 100` |

### Contract State Machine (Implemented)

```
Draft ──── activate() ───→ Active ──── terminate() ───→ Terminated
                             │
                             │ (endDate < today, on-read check)
                             ▼
                           Expired
```

- **Draft → Active**: Sets `employee_work_info.basicSalary` + `salaryCurrency`. Blocked if another active contract exists.
- **Active → Terminated**: Deliberate HR action. Clears the "active contract" for the employee.
- **Active → Expired**: On-read detection when `endDate < today`. Not a manual action.
- **No reverse transitions**: Terminated/Expired contracts cannot be reactivated. Create a new contract instead.

### One-Active-Contract-Per-Employee Rule

- Enforced server-side in `contracts.activate` procedure
- Before activating, queries for existing active contract for the same `employeeId`
- Returns `CONFLICT` error with message: "An active contract already exists for {name}. Terminate or expire it first."
- One draft also enforced: cannot create a second draft for same employee

### Salary Sync Behavior

- On activation: `employee_work_info.basicSalary = contract.baseSalary`, `salaryCurrency = contract.salaryCurrency`
- Sync is immediate and atomic within the same transaction
- Audited as a separate audit event (contract status change + work info salary update)

### RBAC Scope Behavior (Implemented)

| Role | Behavior |
|------|----------|
| tenant_owner / tenant_admin / hr_admin | Full CRUD + activate/terminate on all contracts |
| payroll_admin | Read-only access to all contracts (needs salary visibility for payroll) |
| auditor | Read-only access to all contracts |
| manager | Limited scope — deferred; currently treated as self-scope only |
| employee | Own contracts only (self-scope via `resolveCurrentEmployee`) |

### Salary/Rate Masking Rules

- Salary values are visible to: tenant_owner, tenant_admin, hr_admin, payroll_admin
- Auditor: can see salary values (read-only, needed for audit function)
- Employee: sees own contract salary (self-scope)
- Manager: sees own only (manager-scope for reports' contracts deferred)
- Masking enforcement is server-side — non-privileged roles never receive salary data for other employees

### Deviations from Original Spec

| Deviation | Reason |
|-----------|--------|
| No archive/restore workflow | Status enum IS the lifecycle. `terminated` is the terminal state. No separate archive flag needed — contracts aren't "archived" like employees. |
| Manager scope deferred | Manager seeing direct reports' contracts adds complexity without Phase 6 value. Treated as self-scope only. Will expand in Phase 7+ when manager dashboards are built. |
| Route at `/app/contracts` not `/app/payroll/contracts` | Contracts are a standalone module bridge — they belong to HR Core conceptually but feed Payroll. Top-level route avoids nesting under a payroll route that doesn't exist yet. Will evaluate route reorganization when Payroll UI is built in Phase 8. |
| No auto-expire scheduled job | On-read check during list queries. Sufficient for Phase 6. Scheduled job can be added when payroll requires guaranteed expiry timing. |
| No contract document upload UI | `documentUrl` field exists in schema but the upload UI is deferred. Value can be set via API. Phase 8+ will add file upload component. |

### Remaining Gaps

| Gap | Phase | Notes |
|-----|-------|-------|
| Filing status CRUD UI | Phase 8 | Entity exists in schema + API but no UI page yet. Can be created via seed or API. |
| Contract templates | Phase 8+ | Pre-filled contract templates for common positions |
| Probation period tracking | Phase 8+ | `probationEndDate` field not yet in schema |
| Contract renewal workflow | Phase 8+ | Auto-create new draft from expiring contract |
| Contract comparison (diff) | Phase 10+ | Compare two contracts side-by-side |
| Bulk contract generation | Phase 10+ | Create contracts for multiple employees at once |
| Auto-expire scheduled job | Phase 8 | Replace on-read check with cron for payroll reliability |
| Employee dropdown search-as-you-type | Phase 7 | Dropdowns capped at 100 employees; needs search for large orgs |

### Known Pre-Existing Lint Debt (Not Caused by Contracts)

| File | Issue | Origin |
|------|-------|--------|
| `sign-in-form.tsx` | References `/dashboard` route (doesn't exist) | Auth scaffold |
| `employees/$id.tsx` | Unused variables | Pre-existing from Phase 5D |
| `app/route.tsx` | `.meta` property type, unused variables | TanStack Router scaffold |
| `settings.tsx` | `Date` vs `string` type cast | Pre-existing from Phase 5B.4 |

These are pre-existing and not introduced by Contracts work. Documented here to prevent confusion during quality gate runs.

---

## Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Filing status: separate entity or enum? | **Separate entity** — allows per-org tax configurations |
| 2 | Brackets: separate table or JSON? | **JSON** for Phase 6 simplicity |
| 3 | Contract documents: separate table? | **No** — single `documentUrl` field on contract |
| 4 | Auto-expire: scheduled job or on-read? | **On-read** for Phase 6 (check when listing) |
| 5 | Probation period: include now? | **Defer** — add `probationEndDate` field in a future phase |
| 6 | Contract templates: include now? | **Defer** — templates are a convenience, not a requirement |
