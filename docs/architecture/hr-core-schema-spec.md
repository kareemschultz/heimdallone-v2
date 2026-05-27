# HR Core Schema Specification

Phase 5A spec. Exact Drizzle table definitions for Phase 5B implementation.

File: `packages/db/src/schema/hr-core.ts`

---

## Enum Strategy

Use **`pgEnum`** for small, stable value sets that benefit from database-level enforcement. Use **`text` + Zod enum** for values that may evolve frequently or are primarily validated at the application layer.

| Field | Strategy | Rationale |
|-------|----------|-----------|
| gender | pgEnum | Stable set (male/female/other) |
| maritalStatus | pgEnum | Stable set (single/married/divorced) |
| dayOfWeek | pgEnum or integer 0-6 | **Integer 0-6** (Monday=0...Sunday=6) — simpler for calculations |
| documentStatus | pgEnum | Stable set (requested/uploaded/approved/rejected) |
| auditAction | pgEnum | Stable set (create/update/delete/archive/restore) |

Define pgEnums at the top of `hr-core.ts`:

```ts
export const genderEnum = pgEnum("gender", ["male", "female", "other"])
export const maritalStatusEnum = pgEnum("marital_status", ["single", "married", "divorced"])
export const documentStatusEnum = pgEnum("document_status", ["requested", "uploaded", "approved", "rejected"])
export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete", "archive", "restore"])
```

---

## Money Strategy

Use **`numeric(12, 2)`** (Drizzle: `numeric({ precision: 12, scale: 2 })`) for all monetary amounts. This avoids floating-point precision issues and supports amounts up to 9,999,999,999.99.

**Currency**: Store as ISO 4217 code (`text`, e.g., "GYD", "TTD", "USD"). Default currency configured per organization (future org settings table) or hardcoded to "GYD" initially.

**Do NOT use integer cents** — Caribbean currencies have complex denominator situations and payroll requires exact decimal arithmetic.

---

## Date Strategy

Use Drizzle `date` type (maps to Postgres `date`) for calendar dates (dateOfBirth, joiningDate, startDate, expiryDate). Use `timestamp` for point-in-time events (createdAt, updatedAt).

---

## ID Strategy

Use `text` primary keys with `cuid2` generation (via `@paralleldrive/cuid2`). Consistent with Better Auth's existing `text("id").primaryKey()` pattern.

---

## Table Specifications

### `department`

**Purpose**: Organizational unit within a tenant.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, onDelete cascade, NOT NULL | Tenant scope |
| name | text | NOT NULL | |
| description | text | nullable | |
| isActive | boolean | default true | Archive flag |
| createdAt | timestamp | defaultNow, NOT NULL | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId)
**Unique**: (organizationId, name)
**Audit**: create, update, archive tracked
**Priority**: P0

---

### `job_position`

**Purpose**: Role title within a department.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | Tenant scope |
| departmentId | text | FK → department.id, onDelete restrict, NOT NULL | Cannot delete dept if positions reference it |
| name | text | NOT NULL | |
| description | text | nullable | |
| isActive | boolean | default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (departmentId, name)
**Audit**: create, update, archive
**Priority**: P0
**Note**: `onDelete: restrict` on departmentId — must archive department's positions first or reassign.

---

### `job_role`

**Purpose**: Specialization within a job position.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| jobPositionId | text | FK → job_position.id, onDelete restrict, NOT NULL | |
| name | text | NOT NULL | |
| isActive | boolean | default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (jobPositionId, name)
**Priority**: P1 — Optional refinement. Many orgs only use Position, not Role.

---

### `work_type`

**Purpose**: How an employee works (On-site, Remote, Hybrid, Field).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | |
| isActive | boolean | default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, name)
**Priority**: P0

---

### `employee_type`

**Purpose**: Employment classification (Full-time, Part-time, Contractor, Intern).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | |
| isActive | boolean | default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, name)
**Priority**: P0

---

### `shift`

**Purpose**: Named work schedule defining weekly hours.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | e.g., "Day Shift", "Night Shift" |
| weeklyFullTimeMinutes | integer | default 2400 | 40 hours |
| monthlyFullTimeMinutes | integer | default 12000 | 200 hours |
| isActive | boolean | default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, name)
**Priority**: P0

---

### `shift_schedule`

**Purpose**: Per-day start/end times for a shift.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| shiftId | text | FK → shift.id, onDelete cascade, NOT NULL | |
| dayOfWeek | integer | NOT NULL, 0-6 | 0=Monday, 6=Sunday |
| startTime | text | NOT NULL | "HH:MM" format, e.g., "08:00" |
| endTime | text | NOT NULL | "HH:MM" format, e.g., "17:00" |
| minimumWorkMinutes | integer | default 495 | 8h15m |
| isNightShift | boolean | default false | Auto-set when startTime > endTime |

**Unique**: (shiftId, dayOfWeek)
**Priority**: P0
**Note**: 7 rows per shift (one per day). Days without schedule = day off.

---

### `holiday`

**Purpose**: Public or company holidays.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | e.g., "Mashramani", "Independence Day" |
| startDate | date | NOT NULL | |
| endDate | date | nullable | Null = single-day holiday |
| isRecurring | boolean | default false | Repeats annually |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Priority**: P0

---

### `employee_profile`

**Purpose**: Core employee entity — personal information.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| userId | text | FK → user.id, nullable | **Nullable** — not every employee logs in |
| badgeId | text | nullable | Employee ID badge, e.g., "EMP-00128" |
| firstName | text | NOT NULL | |
| lastName | text | nullable | |
| email | text | NOT NULL | May differ from user login email |
| phone | text | nullable | |
| profileImageUrl | text | nullable | URL to stored image |
| dateOfBirth | date | nullable | |
| gender | genderEnum | nullable | pgEnum: male/female/other |
| maritalStatus | maritalStatusEnum | nullable | pgEnum: single/married/divorced |
| address | text | nullable | |
| city | text | nullable | |
| state | text | nullable | |
| country | text | nullable | |
| zip | text | nullable | |
| emergencyContactName | text | nullable | |
| emergencyContactPhone | text | nullable | |
| emergencyContactRelation | text | nullable | |
| isActive | boolean | default true | Archive flag |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, email)
**Partial unique**: (organizationId, badgeId) WHERE badgeId IS NOT NULL

**badgeId partial unique strategy**: Drizzle does not natively support partial unique indexes. Use a raw SQL index in the migration:
```sql
CREATE UNIQUE INDEX employee_profile_org_badge_uidx
  ON employee_profile (organization_id, badge_id)
  WHERE badge_id IS NOT NULL;
```
Or use Drizzle's `.sql` escape hatch in the table definition.

**Indexes**: (organizationId), (userId)
**Priority**: P0

---

### `employee_work_info`

**Purpose**: Employment details linking employee to org structure.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| employeeId | text | FK → employee_profile.id, onDelete cascade, UNIQUE, NOT NULL | One-to-one |
| departmentId | text | FK → department.id, onDelete set null, nullable | |
| jobPositionId | text | FK → job_position.id, onDelete set null, nullable | |
| jobRoleId | text | FK → job_role.id, onDelete set null, nullable | |
| reportingManagerId | text | FK → employee_profile.id, onDelete set null, nullable | Self-referential |
| shiftId | text | FK → shift.id, onDelete set null, nullable | |
| workTypeId | text | FK → work_type.id, onDelete set null, nullable | |
| employeeTypeId | text | FK → employee_type.id, onDelete set null, nullable | |
| workLocation | text | nullable | Free text: "Georgetown", "Remote" |
| workEmail | text | nullable | Work-specific email |
| workPhone | text | nullable | |
| joiningDate | date | nullable | |
| basicSalary | numeric(12, 2) | nullable | **Decimal**, not integer cents |
| salaryCurrency | text | default "GYD" | ISO 4217 code |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (employeeId — unique), (departmentId), (reportingManagerId)
**Audit**: All changes tracked (especially salary, department, position, manager)
**Priority**: P0

**Circular reference guard**: reportingManagerId must not create cycles. Validate at the application layer (oRPC mutation) — not a database constraint.

---

### `employee_bank_details`

**Purpose**: Bank account for salary payment. Sensitive data.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| employeeId | text | FK → employee_profile.id, onDelete cascade, UNIQUE, NOT NULL | One-to-one |
| bankName | text | NOT NULL | |
| accountNumber | text | NOT NULL | |
| branch | text | nullable | |
| bankCode1 | text | nullable | Routing/sort code |
| bankCode2 | text | nullable | SWIFT/IBAN |
| country | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Permission rules**:
- **Read**: employee (own only, masked), hr_admin (full), payroll_admin (full)
- **Write**: hr_admin, payroll_admin
- **Masking**: Account number shown as `****1234` (last 4 digits) to non-privileged roles
- **Audit**: All changes to bank details MUST be audited (fraud prevention)

**Priority**: P0

---

### `employee_document`

**Purpose**: Uploaded files associated with employees.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, onDelete cascade, NOT NULL | |
| title | text | NOT NULL, min 3 chars | |
| fileUrl | text | nullable | **Abstracted** — URL to file regardless of storage backend |
| fileName | text | nullable | Original upload filename |
| fileSizeBytes | integer | nullable | |
| format | text | nullable | "pdf", "docx", "jpg", etc. |
| status | documentStatusEnum | default "uploaded" | requested/uploaded/approved/rejected |
| rejectReason | text | nullable | When status = rejected |
| issueDate | date | nullable | When the document was issued |
| expiryDate | date | nullable | When it expires |
| notifyBeforeDays | integer | default 30 | Days before expiry to send reminder |
| uploadedBy | text | FK → user.id, nullable | |
| approvedBy | text | FK → user.id, nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (employeeId), (organizationId, expiryDate — for expiring-soon queries)
**Storage note**: `fileUrl` is a URL. Phase 5B can use local file serving or S3. The schema does not dictate storage backend.
**Priority**: P0

---

### `audit_event`

**Purpose**: Generic, reusable change log. Used by HR Core now, all modules later.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| entityType | text | NOT NULL | "employee_profile", "department", "employee_bank_details", etc. |
| entityId | text | NOT NULL | The ID of the changed entity |
| action | auditActionEnum | NOT NULL | create/update/delete/archive/restore |
| actorId | text | FK → user.id, nullable | Who performed the action (null for system actions) |
| changes | jsonb | nullable | Array of {field, oldValue, newValue} |
| metadata | jsonb | nullable | IP address, source (UI/API/import), request ID |
| createdAt | timestamp | defaultNow, NOT NULL | |

**Indexes**:
- (organizationId, entityType, entityId) — entity timeline queries
- (organizationId, createdAt DESC) — recent activity feed
- (actorId) — user activity queries

**Insert-only**: Audit events are never updated or deleted.
**Priority**: P0
**Note**: This table grows unboundedly. Consider partitioning by month/year in production. For Phase 5B, no partitioning needed.

---

## Schema File Structure

```
packages/db/src/schema/
  ├── auth.ts        (existing — user, session, account, organization, member, invitation)
  ├── hr-core.ts     (NEW — all tables above)
  └── index.ts       (update — export * from "./hr-core")
```

---

## Drizzle Relations

Define relations in `hr-core.ts` for type-safe query building:

- department → jobPositions (one-to-many)
- jobPosition → jobRoles (one-to-many)
- shift → shiftSchedules (one-to-many)
- employeeProfile → employeeWorkInfo (one-to-one)
- employeeProfile → employeeBankDetails (one-to-one)
- employeeProfile → employeeDocuments (one-to-many)
- employeeWorkInfo → department, jobPosition, jobRole, shift, workType, employeeType (many-to-one each)
- employeeWorkInfo → reportingManager (self-ref many-to-one on employeeProfile)

---

## Migration Strategy for Phase 5B

1. Write `hr-core.ts` with all pgEnums + tables + relations
2. Export from `index.ts`
3. `bunx drizzle-kit generate` — creates SQL migration
4. Review generated SQL for correctness (especially partial unique index for badgeId)
5. Manually add partial unique index SQL if drizzle-kit doesn't handle it
6. `bunx drizzle-kit push` — apply to central Postgres
7. Verify with `bunx drizzle-kit studio`
