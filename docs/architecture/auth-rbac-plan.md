# Auth / RBAC Plan

Better Auth is the session and authentication foundation. Do not replace it, work around it, or build a parallel session system.

Server-side permissions are mandatory. Frontend route hiding is not security.

---

## Current State

### Auth setup (`packages/auth/src/index.ts`)

- Email + password authentication enabled
- `@better-auth/expo` plugin for native cookie bridging
- Cookie attributes: `sameSite: none`, `secure: true`, `httpOnly: true`
- Session retrieval in oRPC context: `auth.api.getSession({ headers: c.req.raw.headers })`

### Database tables (`packages/db/src/schema/auth.ts`)

| Table | Purpose |
|---|---|
| `user` | Auth identity (email, name, emailVerified) |
| `session` | Active sessions with expiry and token |
| `account` | OAuth provider accounts (including email+password) |
| `verification` | Email verification tokens |

### oRPC context (`packages/api/src/context.ts`)

The context currently exposes `session` (Better Auth session object or null). The `auth` field is `null` — placeholder for future expansion.

---

## Planned Plugin Additions (Phase 5)

### Better Auth Organization Plugin

Provides multi-tenancy. One user can belong to multiple organizations.

```ts
import { organization } from "better-auth/plugins";
```

Added tables (managed by the plugin, mapped to Drizzle schema):
- `organization` — the tenant record
- `member` — user membership in an organization (with role)
- `invitation` — pending invitations

Session extension: `activeOrganizationId` stored on the session. Set when a user switches tenant context.

### Better Auth Admin Plugin

Provides platform-level admin capabilities. Distinct from tenant-level admin.

```ts
import { admin } from "better-auth/plugins";
```

Capabilities:
- List and manage all users across all tenants
- Ban/unban users
- Impersonate users (audited)
- Set user roles at platform level

### Client plugins

```ts
import { adminClient, organizationClient } from "better-auth/client/plugins";
```

Do not implement plugin integration before reading the current Better Auth plugin documentation and inspecting `packages/auth/src/index.ts`.

---

## oRPC Middleware Plan

All protected procedures must chain through the appropriate middleware. Middleware are composable — layer them in order.

### Middleware registry

| Middleware | Status | Purpose |
|---|---|---|
| `requireAuth` | Exists (verify) | Rejects unauthenticated requests; extracts session |
| `requireActiveOrganization` | Planned | Rejects if no `activeOrganizationId` on session |
| `requirePlatformAdmin` | Planned | Rejects if user does not have `platform_admin` or `platform_owner` role |
| `requireTenantRole` | Planned | Rejects if user's membership role in active org is below the required role |
| `requirePermission` | Planned | Rejects if user does not have the specified permission string |
| `requireEmployeeScope` | Planned | Limits data access to employees within the user's department or reporting chain |
| `requirePayrollCountryScope` | Planned | Limits payroll access to countries the user is scoped to |
| `requireManagerScope` | Planned | Limits data access to direct/indirect reports of the current user |

### Middleware composition pattern

```ts
// Example: HR admin creating an employee
const createEmployee = base
  .use(requireAuth)
  .use(requireActiveOrganization)
  .use(requirePermission("employee:create"))
  .input(createEmployeeSchema)
  .handler(async ({ input, context }) => { ... });

// Example: Manager reading their team's attendance
const getTeamAttendance = base
  .use(requireAuth)
  .use(requireActiveOrganization)
  .use(requirePermission("attendance:read"))
  .use(requireManagerScope)
  .handler(async ({ context }) => { ... });

// Example: Platform admin listing all tenants
const listTenants = base
  .use(requireAuth)
  .use(requirePlatformAdmin)
  .handler(async ({ context }) => { ... });
```

---

## Role Hierarchy

Roles are ordered by privilege level. Higher roles inherit the abilities of lower roles in their domain.

```
platform_owner
  └── platform_admin
        └── tenant_owner
              └── tenant_admin
                    ├── hr_admin
                    ├── payroll_admin
                    └── (other domain admins)
                          └── manager
                                └── employee
```

### Additional roles (same level as manager)

| Role | Domain |
|---|---|
| `auditor` | Read-only access to audit logs and reports across the tenant |
| `recruiter` | Recruitment pipeline management |
| `service_desk_agent` | Helpdesk ticket management |
| `asset_manager` | Asset lifecycle management |
| `country_payroll_specialist` | Payroll for specific country scopes only |

---

## Permission List

Permissions are checked server-side per procedure. The frontend may hide UI for permissions the user lacks, but the server never trusts the frontend's visibility decisions.

### Tenant / Organization

| Permission | Description |
|---|---|
| `tenant:read` | Read tenant settings and structure |
| `tenant:update` | Modify tenant settings |
| `organization:manage` | Manage organization-level config |
| `member:invite` | Invite users to the organization |
| `member:update_role` | Change a member's role |

### Employee

| Permission | Description |
|---|---|
| `employee:read` | Read basic employee profiles |
| `employee:create` | Create new employee records |
| `employee:update` | Update employee profile fields |
| `employee:sensitive:read` | Read salary, bank, tax, and ID fields |
| `employee:sensitive:update` | Modify salary, bank, and tax fields |

### Attendance

| Permission | Description |
|---|---|
| `attendance:read` | Read attendance records |
| `attendance:create` | Submit attendance events (check-in/out) |
| `attendance:update` | Edit attendance records |
| `attendance:approve` | Approve submitted attendance records |
| `attendance:override` | Override validated attendance records |

### Leave

| Permission | Description |
|---|---|
| `leave:read` | Read leave requests and balances |
| `leave:create` | Submit leave requests |
| `leave:approve` | Approve or reject leave requests |
| `leave:policy_manage` | Create and edit leave types and policies |

### Payroll

| Permission | Description |
|---|---|
| `payroll:read` | Read payroll summaries and payslips |
| `payroll:run` | Initiate a payroll run |
| `payroll:approve` | Approve a payroll run |
| `payroll:sensitive:read` | Read individual payslip amounts and deductions |
| `payroll:settings_manage` | Manage payroll configuration and country profiles |

### Country Payroll

| Permission | Description |
|---|---|
| `country_rules:read` | Read country-specific tax brackets and statutory rates |
| `country_rules:manage` | Modify country payroll profiles |

### Recruitment

| Permission | Description |
|---|---|
| `recruitment:read` | View job openings and candidates |
| `recruitment:manage` | Create openings, move candidates, manage pipeline |

### Onboarding / Offboarding

| Permission | Description |
|---|---|
| `onboarding:manage` | Create and assign onboarding tasks |
| `offboarding:manage` | Initiate and complete offboarding workflows |

### Performance

| Permission | Description |
|---|---|
| `performance:read` | Read goals and review results |
| `performance:manage` | Create cycles, assign reviews, record feedback |

### Assets

| Permission | Description |
|---|---|
| `assets:read` | View asset inventory and allocations |
| `assets:manage` | Create assets, process requests, record returns |

### Helpdesk

| Permission | Description |
|---|---|
| `helpdesk:read` | View tickets |
| `helpdesk:manage` | Assign, escalate, and close tickets |

### Documents

| Permission | Description |
|---|---|
| `documents:read` | View documents (scoped to employee or role) |
| `documents:manage` | Upload, request, and archive documents |

### System

| Permission | Description |
|---|---|
| `audit:read` | Read audit event log |
| `settings:update` | Modify system-level settings |

---

## Server-Side Enforcement Rules

Every oRPC procedure that touches domain data must:

1. Verify the user is authenticated (`requireAuth`)
2. Verify an active organization where the data is tenant-scoped (`requireActiveOrganization`)
3. Verify the required permission or role (`requirePermission` or `requireTenantRole`)
4. Apply resource scope where applicable (`requireManagerScope`, `requireEmployeeScope`, `requirePayrollCountryScope`)

No mutation proceeds without passing all applicable middleware checks. The oRPC handler itself should not contain auth logic — that belongs in middleware.

Frontend route guards and hidden UI elements are UX conveniences only. They are not security boundaries.
