# Tenant Model

Multi-tenancy in Heimdallone is implemented via the Better Auth Organization plugin. An Organization is a Tenant. There is no custom tenant table separate from Better Auth's organization table.

---

## Core Principle

Better Auth Organization plugin manages the tenant lifecycle. Heimdallone extends it with domain-specific organization settings and hierarchy, but does not replace or duplicate the auth layer.

---

## Better Auth Organization Plugin Tables

These tables are created and managed by Better Auth when the `organization` plugin is enabled. They are mapped to Drizzle schema in `packages/db/src/schema/auth.ts`.

| Table | Purpose |
|---|---|
| `organization` | The tenant record: name, slug, logo, metadata |
| `member` | User membership in an organization, with role |
| `invitation` | Pending invitation to join an organization |

### `organization` table key fields

| Field | Description |
|---|---|
| `id` | Unique organization identifier (UUID) |
| `name` | Display name of the organization |
| `slug` | URL-safe identifier (unique) |
| `logo` | Optional logo URL |
| `createdAt` | Creation timestamp |
| `metadata` | JSON metadata (used for Heimdallone-specific config) |

### `member` table key fields

| Field | Description |
|---|---|
| `id` | Unique member record ID |
| `organizationId` | FK to `organization.id` |
| `userId` | FK to `user.id` |
| `role` | Role within this organization (owner, admin, member) |
| `createdAt` | When the membership was created |

### `invitation` table key fields

| Field | Description |
|---|---|
| `id` | Unique invitation ID |
| `organizationId` | FK to `organization.id` |
| `email` | Invited email address |
| `role` | Role to assign on acceptance |
| `status` | `pending`, `accepted`, `rejected`, `expired` |
| `expiresAt` | Invitation expiry timestamp |
| `inviterId` | FK to the inviting `user.id` |

---

## Active Organization (Session Context)

When a user belongs to multiple organizations, the **active organization** is tracked on the session. The Better Auth Organization plugin adds `activeOrganizationId` to the session record.

All tenant-scoped oRPC procedures read `context.session.activeOrganizationId` to determine which tenant's data to operate on. Procedures reject requests where `activeOrganizationId` is null via the `requireActiveOrganization` middleware.

Switching tenant context (the "tenant switcher" UI) calls the Better Auth organization session API to update `activeOrganizationId` — it does not require a new login.

---

## Organization Hierarchy (Heimdallone Extensions)

Better Auth provides flat organization membership. Heimdallone adds a domain-level hierarchy through its own tables. All hierarchy tables carry `organization_id` as a non-nullable FK.

```
Organization (Better Auth)
  └── Legal Entities       (Heimdallone: legal_entities)
        └── Departments    (Heimdallone: departments)
              └── Teams    (Heimdallone: teams, future)
```

### `organization_settings` table

Extends the Better Auth organization with Heimdallone-specific configuration:

| Field | Description |
|---|---|
| `organizationId` | FK to `organization.id` (1:1) |
| `defaultCurrency` | ISO 4217 currency code |
| `defaultTimezone` | IANA timezone string |
| `defaultCountryCode` | ISO 3166-1 alpha-2 country code |
| `fiscalYearStartMonth` | Month number 1–12 |
| `payrollApprovalRequired` | Boolean — requires explicit payroll approval before payslip issuance |

### `legal_entities` table

A company or business entity within the organization:

| Field | Description |
|---|---|
| `id` | UUID |
| `organizationId` | FK to `organization.id` |
| `name` | Legal entity name |
| `registrationNumber` | Company registration number |
| `countryCode` | Country where entity is registered |
| `currency` | Entity's operating currency |
| `taxIdentifier` | Tax ID / TIN |

---

## Data Isolation Pattern

Every domain table (employees, attendance, leave, payroll, etc.) carries a non-nullable `organization_id` column referencing `organization.id`. Data queries always include an `organization_id = activeOrganizationId` filter applied in middleware or at the procedure level.

```
employees            organization_id → organization.id
departments          organization_id → organization.id
attendance_records   organization_id → organization.id
leave_requests       organization_id → organization.id
payroll_runs         organization_id → organization.id
audit_events         organization_id → organization.id
```

A user with access to Organization A cannot read Organization B's data — the filter is enforced at the query level, not the application layer.

---

## Multi-Organization User Flow

```
User registers → creates or joins an Organization
  ↓
User logs in → session created (no activeOrganizationId yet)
  ↓
User selects active organization (tenant switcher)
  ↓
Better Auth sets activeOrganizationId on session
  ↓
oRPC context reads activeOrganizationId
  ↓
All domain queries filtered by organizationId
```

If a user belongs to only one organization, the active organization can be set automatically on login.

---

## Roles Within an Organization

Better Auth Organization plugin provides base roles (`owner`, `admin`, `member`). Heimdallone maps these to its role hierarchy:

| Better Auth role | Heimdallone roles |
|---|---|
| `owner` | `tenant_owner` |
| `admin` | `tenant_admin`, `hr_admin`, `payroll_admin` |
| `member` | `manager`, `employee`, `recruiter`, `auditor`, `service_desk_agent`, `asset_manager` |

Fine-grained permission checking happens in oRPC middleware using the permission list defined in `docs/architecture/auth-rbac-plan.md`. The Better Auth role provides the membership tier; Heimdallone permissions add granularity.

---

## What Is NOT Implemented at the Tenant Layer

- Row-level security at the PostgreSQL level (enforced at application layer instead)
- Separate database per tenant (single-schema multi-tenancy with `organization_id` filter)
- Custom session tables replacing Better Auth (Better Auth owns sessions)
- Tenant-specific subdomains (not in current scope — may be added via routing config in a later phase)
