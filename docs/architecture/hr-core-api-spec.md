# HR Core API Specification

Phase 5A spec. Defines oRPC routers, procedures, inputs, outputs, middleware, and RBAC for Phase 5B.

---

## RBAC Assessment

### Existing permissions (from `permissions.ts`)

The `employee` resource already has: `create`, `read`, `update`, `terminate`. The `document` resource has: `create`, `read`, `update`, `archive`, `scan_expiring`. The `audit_log` resource has: `read`. The `holiday` resource has: `create`, `read`, `update`, `archive`.

### New resources needed

| Resource | Actions | Rationale |
|----------|---------|-----------|
| `department` | `create`, `read`, `update`, `archive` | Org structure management should be separate from employee permissions |
| `job_position` | `create`, `read`, `update`, `archive` | Same |
| `shift` | `create`, `read`, `update`, `archive` | Shift management |

**Alternative**: Use `employee:create` to gate all org structure CRUD (simpler, fewer permissions). **Recommendation**: Add the new resources for granularity — some roles (manager) should read departments but not create them.

### Role access matrix (HR Core)

| Procedure | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| departments.list | R | R | R | R | R | R | R |
| departments.create | W | W | W | — | — | — | — |
| departments.update | W | W | W | — | — | — | — |
| departments.archive | W | W | W | — | — | — | — |
| employees.list | All | All | All | Own dept | Team | Self | All (read-only) |
| employees.getById | Any | Any | Any | Limited | Team + self | Self | Any |
| employees.create | W | W | W | — | — | — | — |
| employees.update | W | W | W | — | — | — | — |
| employees.archive | W | W | W | — | — | — | — |
| employees.bankDetails.get | — | Full | Full | Full | — | Own (masked) | — |
| employees.bankDetails.update | — | W | W | W | — | — | — |
| employees.documents.list | All | All | All | Own | Team | Self | All |
| audit.list | R | R | R | R | — | — | R |

### Self-scope and manager-scope

**Self-scope**: Employee role can only read/update their own profile. Enforced by matching `employeeProfile.userId === session.user.id`.

**Manager-scope**: Manager role sees employees where `workInfo.reportingManagerId` matches manager's `employeeProfile.id`. Recursive check NOT implemented initially (no skip-level visibility).

**Implementation**: A helper middleware `requireEmployeeAccess(employeeId)` checks:
1. If user has `employee:read` with HR/admin role → allow all
2. If user is the employee's reporting manager → allow
3. If user is the employee themselves → allow (self-scope)
4. Otherwise → FORBIDDEN

---

## Router Structure

File: `packages/api/src/routers/hr-core.ts`

### departments

#### `departments.list`
- **Input**: `{ search?: string, includeArchived?: boolean }`
- **Output**: `Department[]`
- **Middleware**: `tenantProcedure` + `employee:read`
- **Scope**: All departments in org, filtered by isActive unless includeArchived
- **Pagination**: Client-side (typically < 50 departments)

#### `departments.getById`
- **Input**: `{ id: string }`
- **Output**: `Department` with position count
- **Middleware**: `tenantProcedure` + `employee:read`
- **Errors**: NOT_FOUND if id doesn't exist in org

#### `departments.create`
- **Input**: `{ name: string (min 2, max 100), description?: string }`
- **Output**: `Department`
- **Middleware**: `tenantProcedure` + `department:create` (new resource) or `employee:create`
- **Audit**: `{ entityType: "department", action: "create" }`
- **Errors**: CONFLICT if name already exists in org

#### `departments.update`
- **Input**: `{ id: string, name?: string, description?: string }`
- **Output**: `Department`
- **Middleware**: `tenantProcedure` + `department:update`
- **Audit**: `{ action: "update", changes: [{field, oldValue, newValue}] }`

#### `departments.archive`
- **Input**: `{ id: string }`
- **Output**: `Department`
- **Middleware**: `tenantProcedure` + `department:archive`
- **Validation**: Cannot archive if active employees reference this department (return error with count)
- **Audit**: `{ action: "archive" }`

### jobPositions

Same CRUD pattern as departments. Input always includes `departmentId`.
- `list`: filter by departmentId (optional), search, includeArchived
- `create`: `{ departmentId, name, description? }`
- Unique: (departmentId, name)

### jobRoles

Same pattern. Input includes `jobPositionId`.
- Unique: (jobPositionId, name)

### workTypes, employeeTypes

Simpler CRUD — org-scoped, name only.
- `list`, `create`, `update`, `archive`

### shifts

#### `shifts.list`
- **Output**: `Shift[]` with schedule count

#### `shifts.getById`
- **Output**: `Shift` with full `schedules: ShiftSchedule[]`

#### `shifts.create`
- **Input**: `{ name, weeklyFullTimeMinutes?, monthlyFullTimeMinutes?, schedules: { dayOfWeek, startTime, endTime, minimumWorkMinutes? }[] }`
- Creates shift + schedules in one transaction

#### `shifts.update`
- **Input**: `{ id, name?, weeklyFullTimeMinutes?, monthlyFullTimeMinutes? }`

#### `shifts.schedules.upsert`
- **Input**: `{ shiftId, schedules: { dayOfWeek, startTime, endTime, minimumWorkMinutes? }[] }`
- Replaces all schedules for the shift (delete existing + insert new)
- Auto-calculates `isNightShift` when startTime > endTime

### employees

#### `employees.list`
- **Input**: `{ search?, departmentId?, jobPositionId?, shiftId?, workTypeId?, employeeTypeId?, isActive?, page?, pageSize?, sort?, sortDir? }`
- **Output**: `{ data: EmployeeListItem[], total: number }`
- **EmployeeListItem**: id, firstName, lastName, badgeId, email, isActive, department (name), jobPosition (name), shift (name), workType (name), profileImageUrl
- **Middleware**: `tenantProcedure` + `employee:read`
- **Scope**: HR/admin see all. Manager sees direct reports. Employee sees only self.
- **Pagination**: Server-side (pageSize default 50)

#### `employees.getById`
- **Input**: `{ id: string }`
- **Output**: Full `EmployeeProfile` with nested `workInfo`, document count, reporting manager name
- **Middleware**: `tenantProcedure` + `requireEmployeeAccess(id)`

#### `employees.create`
- **Input**: Zod schema covering profile + work info fields:
  ```
  {
    firstName: string (required),
    lastName?: string,
    email: string (email format, required),
    phone?: string,
    dateOfBirth?: string (date),
    gender?: "male" | "female" | "other",
    maritalStatus?: "single" | "married" | "divorced",
    address?: string,
    city?: string,
    state?: string,
    country?: string,
    zip?: string,
    emergencyContactName?: string,
    emergencyContactPhone?: string,
    emergencyContactRelation?: string,
    departmentId?: string,
    jobPositionId?: string,
    jobRoleId?: string,
    shiftId?: string,
    workTypeId?: string,
    employeeTypeId?: string,
    reportingManagerId?: string,
    workLocation?: string,
    workEmail?: string,
    joiningDate?: string (date),
    basicSalary?: string (decimal),
    salaryCurrency?: string (default "GYD"),
    badgeId?: string,
  }
  ```
- **Output**: `EmployeeProfile` (created)
- **Middleware**: `tenantProcedure` + `employee:create`
- **Transaction**: Creates employee_profile + employee_work_info in one transaction
- **Audit**: `{ entityType: "employee_profile", action: "create" }`
- **Errors**: CONFLICT if email already exists in org

#### `employees.update`
- **Input**: `{ id: string, ...partial profile fields }`
- **Middleware**: `tenantProcedure` + `employee:update`
- **Audit**: Changes logged with old/new values

#### `employees.archive`
- **Input**: `{ id: string }`
- **Middleware**: `tenantProcedure` + `employee:terminate`
- **Validation**: Cannot archive if employee is a reporting manager (return error listing dependents)
- **Audit**: `{ action: "archive" }`

#### `employees.restore`
- **Input**: `{ id: string }`
- **Middleware**: `tenantProcedure` + `employee:update`
- **Audit**: `{ action: "restore" }`

#### `employees.workInfo.get`
- **Input**: `{ employeeId: string }`
- **Output**: `EmployeeWorkInfo` with resolved names (department name, position name, manager name, etc.)
- **Middleware**: `tenantProcedure` + `requireEmployeeAccess(employeeId)`

#### `employees.workInfo.update`
- **Input**: `{ employeeId: string, ...partial work info fields }`
- **Middleware**: `tenantProcedure` + `employee:update`
- **Validation**: reportingManagerId must not create cycle
- **Audit**: All changes tracked (especially salary, department, manager changes)

#### `employees.bankDetails.get`
- **Input**: `{ employeeId: string }`
- **Output**: `EmployeeBankDetails` — **masked** for self-scope (accountNumber → `****1234`), full for HR/payroll
- **Middleware**: `tenantProcedure` + `requireEmployeeAccess(employeeId)`

#### `employees.bankDetails.update`
- **Input**: `{ employeeId, bankName, accountNumber, branch?, bankCode1?, bankCode2?, country? }`
- **Middleware**: `tenantProcedure` + `employee:update` + requireTenantRole("hr_admin", "payroll_admin", "tenant_admin", "tenant_owner")
- **Audit**: **Always** audited (financial data change)

### employees.documents

#### `employees.documents.list`
- **Input**: `{ employeeId: string }`
- **Output**: `EmployeeDocument[]`
- **Middleware**: `tenantProcedure` + `document:read`

#### `employees.documents.upload`
- **Input**: `{ employeeId, title, fileUrl, fileName?, fileSizeBytes?, format?, issueDate?, expiryDate?, notifyBeforeDays? }`
- **Middleware**: `tenantProcedure` + `document:create`
- **Note**: File upload itself handled separately (presigned URL or multipart). This procedure records the metadata.

#### `employees.documents.approve`
- **Input**: `{ id: string }`
- **Middleware**: `tenantProcedure` + `document:update`

#### `employees.documents.reject`
- **Input**: `{ id: string, reason: string }`
- **Middleware**: `tenantProcedure` + `document:update`

### holidays

Standard CRUD:
- `list`: `{ year?: number, includeRecurring?: boolean }`
- `create`: `{ name, startDate, endDate?, isRecurring? }`
- `update`: `{ id, name?, startDate?, endDate?, isRecurring? }`
- `delete`: `{ id }` — Hard delete allowed for holidays (they're configuration, not transactional data)
- **Middleware**: `tenantProcedure` + `holiday:*`

### audit

#### `audit.list`
- **Input**: `{ entityType?, entityId?, actorId?, startDate?, endDate?, page?, pageSize? }`
- **Output**: `{ data: AuditEvent[], total: number }`
- **Middleware**: `tenantProcedure` + `audit_log:read`
- **Pagination**: Server-side (can be high volume)
- **Sort**: createdAt DESC (always)

---

## Error Response Standards

| Error | HTTP-equivalent | When |
|-------|----------------|------|
| UNAUTHORIZED | 401 | No session |
| FORBIDDEN | 403 | Role lacks permission |
| NOT_FOUND | 404 | Entity doesn't exist in org |
| CONFLICT | 409 | Duplicate name/email/badgeId |
| BAD_REQUEST | 400 | Validation failure (Zod errors returned as field-level) |
| PRECONDITION_FAILED | 412 | Cannot archive — has dependents |

Zod validation errors should return field-level messages:
```json
{
  "code": "BAD_REQUEST",
  "issues": [
    { "path": ["email"], "message": "Enter a valid email address" },
    { "path": ["firstName"], "message": "First name is required" }
  ]
}
```

---

## Audit Utility

Shared function used by all HR Core mutations:

```ts
async function createAuditEvent(db: DrizzleDB, event: {
  organizationId: string
  entityType: string
  entityId: string
  action: "create" | "update" | "delete" | "archive" | "restore"
  actorId: string | null
  changes?: { field: string; oldValue: unknown; newValue: unknown }[]
  metadata?: Record<string, unknown>
}): Promise<void>
```

Called explicitly after each successful mutation. Not a middleware — gives control over what's logged per procedure.

---

## Implemented in Phase 5B.2

### Procedures implemented (42)

| Router | Procedures |
|--------|-----------|
| `departments` | list, getById, create, update, archive |
| `jobPositions` | list, getById, create, update, archive |
| `jobRoles` | list, create, update, archive |
| `workTypes` | list, create, update, archive |
| `employeeTypes` | list, create, update, archive |
| `shifts` | list, getById, create, update, archive, schedules.list, schedules.upsert |
| `employees` | list (paginated with joins), getById, create, update, archive, restore |
| `employees.workInfo` | get, update |
| `employees.bankDetails` | get (with role-based masking), update (upsert) |
| `employees.documents` | list, create, approve, reject, delete |
| `holidays` | list, create, update, delete |
| `audit` | list (paginated) |

### Permissions currently reused

No new RBAC resources were added. All org structure CRUD (departments, positions, shifts, etc.) uses `employee:create/update`. This is intentionally broad for MVP — a single HR admin permission gates all org config. Granular resources (`department:create`, `shift:update`) deferred.

### Audit utility behavior

- `createAuditEvent()` in `packages/api/src/utils/audit.ts` inserts into the generic `audit_event` table
- `diffChanges()` computes `{field, oldValue, newValue}[]` for update events
- Called after every successful mutation (create, update, archive, restore, approve, reject)
- Most mutations log action-level audit (not field-level diff). Field-level diff implemented for `departmentUpdate` as a pattern; can be expanded.

### Bank masking behavior

- `employees.bankDetails.get` checks `context.memberRole` server-side
- Privileged roles (`tenant_owner`, `tenant_admin`, `hr_admin`, `payroll_admin`): full data returned
- All other roles: `accountNumber` → `****XXXX` (last 4 only), `bankCode1` → `****XX` (last 2 only)
- Masking is server-side — the client never receives unmasked data for non-privileged roles

### Known limitations (Phase 5B.2)

1. **Manager-scope not implemented** — `employee:read` permission currently returns all org employees regardless of reporting relationship. Manager should only see direct reports.
2. **Employee self-scope not implemented** — Employees with `employee:read` see all org employees. Should only see own profile.
3. **No `session.userId → employeeProfile` mapping** — The router does not yet resolve the logged-in user's employee profile. Needed for self-scope and manager-scope.
4. **Granular RBAC deferred** — All org structure CRUD uses `employee:create/update` instead of specific resources.
5. **Field-level audit diffs sparse** — Most mutations only log the action, not which fields changed. Should be expanded for salary, department, manager, and bank detail changes.
6. **No duplicate email error handling** — `employees.create` will fail with a raw DB error if email is duplicate. Should catch and return a friendly CONFLICT error.
7. **No circular reporting manager check** — `workInfo.update` allows setting a reporting manager that creates a cycle.

---

## Required Before Production

### Manager-scope and employee self-scope

The current implementation allows any user with `employee:read` to see all employees in the org. Before production:

1. **Map session user to employee profile**: Query `employeeProfile` where `userId = session.user.id` to get the logged-in user's employee record and their `reportingManagerId`.
2. **Self-scope**: Employee role queries must filter to `employeeProfile.userId = session.user.id`.
3. **Manager-scope**: Manager role queries must filter to `employeeWorkInfo.reportingManagerId = currentEmployee.id`.
4. **Implementation location**: A middleware or helper in `packages/api/src/utils/` that resolves `session.userId → employeeProfile` and injects `currentEmployeeId` + `isManager` into context.

### Granular RBAC resources

Evaluate adding these resources to `permissions.ts`:
- `department:create/read/update/archive`
- `job_position:create/read/update/archive`
- `shift:create/read/update/archive`
- `work_type:create/read/update/archive`

This allows roles like "manager" to read departments but not create them, without needing `employee:create` permission.

### Field-level audit for sensitive updates

These mutations must log field-level diffs:
- `employees.workInfo.update` — especially `basicSalary`, `departmentId`, `reportingManagerId`
- `employees.bankDetails.update` — all fields (financial data)
- `employees.update` — especially `email`, `badgeId`

### Multi-org tenant isolation testing

Before production, test with 2+ organizations to verify:
- No data leaks across orgs
- Unique constraints work per-org (same email in different orgs is OK)
- Archiving in one org doesn't affect another
