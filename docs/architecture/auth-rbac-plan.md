# Auth / RBAC Plan

Better Auth is the session and authentication foundation. Server-side permissions are mandatory. Frontend route hiding is not security.

> Sources: Better Auth Organization plugin docs, Better Auth Admin plugin docs, Horilla HRMS permission patterns (Django groups/permissions, `permission_required` decorators, reporting manager scoping), HRMS industry best practices.

---

## 1. Current State

| Component | Current | Target |
|-----------|---------|--------|
| Auth | Email + password, Expo plugin | + Organization plugin, Admin plugin |
| Tables | user, session, account, verification (4) | + organization, member, invitation (7+) |
| Session | Basic (userId, token, expiry) | + activeOrganizationId, impersonatedBy |
| User columns | name, email, emailVerified, image | + role, banned, banReason, banExpires |
| Middleware | `requireAuth` only | + requireActiveOrganization, requirePermission, requireTenantRole, requireEmployeeScope |
| Roles | None (all users equal) | 11 roles across platform and tenant levels |

---

## 2. Better Auth Organization Plugin

### Purpose

Organization = Tenant. Every business using Heimdallone is an organization. Users belong to organizations as members with assigned roles.

### Configuration

```ts
import { organization } from "better-auth/plugins";
import { ac, roles } from "./permissions";

organization({
  ac,
  roles,
  allowUserToCreateOrganization: true,
  creatorRole: "tenant_owner",
  sendInvitationEmail: async (data) => {
    // Wire to email service
  },
})
```

### Schema additions

**organization** table: id, name, slug (unique), logo, metadata (JSON — timezone, country, plan), createdAt

**member** table: id, organizationId (FK), userId (FK), role (text — one of the 11 role keys), createdAt

**invitation** table: id, organizationId (FK), email, role, status (pending/accepted/rejected/canceled/expired), expiresAt, inviterId (FK), createdAt

**session** addition: `activeOrganizationId` (text, nullable)

### Critical pattern: `defaultStatements` spread

Per Better Auth docs: when you provide custom `ac`/`roles` to the organization plugin, you **fully replace** the built-in role-permission map. The plugin internally checks `invitation:create`, `member:create/update/delete`, `organization:update/delete` during invite/remove/role-change flows. Without spreading `defaultStatements`, every org management operation fails.

```ts
import { defaultStatements, ownerAc, adminAc, memberAc } from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements, // MUST be first
  // ... custom resources below
} as const;
```

---

## 3. Better Auth Admin Plugin

### Purpose

Platform-level super-admin for Heimdallone support operations. Completely separate from tenant roles.

### Configuration

```ts
import { admin } from "better-auth/plugins";

admin({
  adminUserIds: [env.PLATFORM_ADMIN_USER_ID],
})
```

### Schema additions

**user** additions: `role` (text), `banned` (boolean), `banReason` (text), `banExpires` (timestamp)

**session** addition: `impersonatedBy` (text)

### Platform Admin vs Tenant Owner

| Capability | Platform Admin | Tenant Owner |
|-----------|---------------|-------------|
| List all users across all tenants | Yes | No |
| Impersonate any user | Yes | No |
| Ban/unban users | Yes | No |
| Create/delete organizations | Yes (via API) | Own org only |
| Invite members to an org | Only if also a member | Yes |
| Finalize payroll | Only if also a tenant member | Yes |
| View audit logs | Cross-tenant | Own tenant only |

Platform admin = Heimdallone support staff (identified by `adminUserIds`).
Tenant owner = The company admin using Heimdallone for their business.

---

## 4. Role Hierarchy (11 Roles)

### Platform-level roles (Admin plugin)

| Role | Purpose | Scope |
|------|---------|-------|
| `platform_owner` | Heimdallone founder — full platform control | All tenants |
| `platform_admin` | Heimdallone support staff — impersonation, user management | All tenants |

Identified by `adminUserIds` in Admin plugin config. NOT organization member roles.

### Tenant-level roles (Organization plugin)

| Role | Purpose | Spreads | Key constraints |
|------|---------|---------|----------------|
| `tenant_owner` | Company founder/CEO | `ownerAc` | Can delete org, update statutory rates |
| `tenant_admin` | Trusted operator | `adminAc` | Same as owner except no org delete |
| `hr_admin` | HR department lead | `adminAc` | Full employee lifecycle; cannot finalize payslips or post journals |
| `payroll_admin` | Payroll/finance lead | `memberAc` | Finalizes pay runs, posts journals; no org membership management |
| `manager` | Department/team manager | `memberAc` | Approves leave for reports; read-only elsewhere |
| `employee` | Regular employee | `memberAc` | Self-service only (own records) |
| `auditor` | Compliance reviewer | `memberAc` | Read-only across all domains |
| `recruiter` | Recruitment specialist | `memberAc` | Manages job postings, candidates, interviews |
| `helpdesk_agent` | Internal support/service desk | `memberAc` | Manages helpdesk tickets, service requests |

---

## 5. Access Control Statement

Resources and actions organized by domain. Informed by Horilla's Django `permission_required` patterns translated to Heimdallone's resource-action model.

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,

  // Organization (Better Auth defaults + custom verbs)
  organization: ["update", "delete"],
  member: ["create", "update", "delete", "invite", "update_role", "remove"],

  // People (Horilla: employee.add/change/delete/view_employee)
  employee: ["create", "read", "update", "terminate"],
  resignation: ["create", "read", "approve", "complete", "withdraw"],
  transfer: ["create", "read", "submit", "approve", "execute", "cancel"],

  // Payroll
  payslip: ["draft", "finalize", "reverse", "read"],
  payroll_period: ["create", "read", "finalize", "cancel", "delete"],
  advance: ["create", "read", "approve_hr", "approve_accounting", "disburse"],
  loan: ["create", "read", "approve_hr", "approve_accounting", "disburse", "write_off"],

  // Time and attendance (Horilla: attendance.*, base.approve_shiftrequest)
  attendance: ["create", "read", "correct"],
  leave_request: ["create", "read", "approve", "reject", "cancel"],
  holiday: ["create", "read", "update", "archive"],
  work_location: ["read", "manage"],

  // Compliance (Horilla: horilla_audit.view_audittag)
  audit_log: ["read"],
  export: ["generate"],

  // Documents (Horilla: horilla_documents)
  document: ["create", "read", "update", "archive", "scan_expiring"],

  // Accounting
  journal: ["post", "reverse", "read"],
  account: ["create", "read", "update", "archive"],

  // Settings
  statutory_rules: ["read", "update"],

  // Recruitment (Horilla: recruitment.add/view/change/delete_recruitment/candidate/stage)
  posting: ["create", "read", "publish", "archive"],
  applicant: ["create", "read", "update", "convert"],
  interview: ["create", "read", "update", "complete"],
  offer: ["create", "read", "extend", "withdraw"],

  // Performance (Horilla: pms.add_employeeobjective, pms.change_feedback)
  appraisal: ["create", "read", "submit", "review", "finalize", "manage"],
  goal: ["create", "read", "update", "complete"],

  // Assets (Horilla: asset.add/change/view/delete_asset/assetassignment)
  asset: ["create", "read", "assign", "return", "write_off", "manage"],

  // Helpdesk (Horilla: helpdesk.add_faq, helpdesk.change_ticket)
  ticket: ["create", "read", "update", "assign", "resolve", "close"],
} as const;

export const ac = createAccessControl(statement);
```

---

## 6. oRPC Middleware Plan

### Existing

`requireAuth` — checks session, throws `UNAUTHORIZED` if missing.

### New middleware (Phase 4C)

**requireActiveOrganization** — checks `session.activeOrganizationId` is set, injects `organizationId` + `memberRole` into context.

**requirePermission(resource, action)** — checks AC permission via `auth.api.hasPermission`, throws `FORBIDDEN` if missing.

**requireTenantRole(...roles)** — checks member role is one of the specified roles.

**requireEmployeeScope** — resolves the caller's employee record from their userId, injects `employeeId` into context for downstream queries to filter by. For employee self-service.

### Composition pattern

```ts
const publicProcedure = os.$context<Context>();
const protectedProcedure = publicProcedure.use(requireAuth);
const tenantProcedure = protectedProcedure.use(requireActiveOrganization);

const authorizedProcedure = (resource: string, action: string) =>
  tenantProcedure.use(requirePermission(resource, action));
```

---

## 7. Scope Modifiers

Beyond resource-action checks, some permissions require scope enforcement at the API layer:

| Scope | Who | How enforced | Horilla reference |
|-------|-----|-------------|-------------------|
| Tenant-scoped | All roles | Every query filters by `context.organizationId` | Django tenant filtering |
| Self-scoped | employee | `requireEmployeeScope` injects `employeeId` | `request.user.employee_get == employee` |
| Team-scoped | manager | Query filters by `reportingManagerId` | `employee_work_info.reporting_manager_id == request.user` |
| Department-scoped | hr_admin, manager | Query filters by department membership | Horilla department-based filtering |
| Country-scoped | payroll_admin | Query filters by assigned country profiles | N/A (Heimdallone-native) |

---

## 8. Approval Workflow Access

Informed by Horilla's `MultipleApprovalCondition` + `MultipleApprovalManagers` patterns and `permission_required` decorators on approve/reject views.

| Workflow | Who can submit | Who can approve | Who can apply/execute |
|----------|---------------|----------------|----------------------|
| Leave request | employee, manager | manager (team-scoped), hr_admin | System (auto on approval) |
| Overtime claim | employee, manager | manager, hr_admin | payroll_admin (included in pay run) |
| Resignation | employee | hr_admin, tenant_owner | hr_admin (finalizes exit) |
| Transfer | hr_admin, manager | tenant_owner, tenant_admin | hr_admin (executes) |
| Payroll run | payroll_admin, hr_admin | payroll_admin, tenant_owner | payroll_admin (commits) |
| Expense claim | employee | manager, hr_admin | payroll_admin (pays) |

---

## 9. TanStack Start Route Protection

The `/app` layout route already has `beforeLoad` with auth check. Phase 4C extends it for org context. The sidebar should be role-aware — reduced for `employee`, expanded for admin roles.

---

## 10. Phase 4C Implementation Sequence

1. Create `packages/auth/src/permissions.ts` with statement, ac, roles
2. Add Organization + Admin plugins to `packages/auth/src/index.ts`
3. Update `packages/auth/src/client.ts` with `organizationClient` + `adminClient`
4. Run `bun run db:push` — creates organization, member, invitation tables
5. Update `packages/db/src/schema/auth.ts` with new table definitions
6. Add oRPC middleware (`requireActiveOrganization`, `requirePermission`, `requireTenantRole`, `requireEmployeeScope`)
7. Create seed script for dev users (9 roles)
8. Update app layout route for org-aware auth
9. Wire role-aware sidebar
10. Test all role scenarios

---

## 11. Risks / Open Questions

| Risk | Mitigation |
|------|-----------|
| `defaultStatements` spread missing | Mandatory; enforced by TypeScript `as const` |
| Admin plugin `user.role` vs Organization `member.role` | Different tables — no conflict |
| Employee self-service scope bypass | `requireEmployeeScope` on every self-service procedure |
| Manager scope not enforceable via AC alone | API layer must filter by `reportingManagerId` |
| Dynamic role creation needed? | Defer until static roles are proven |
| Teams sub-org grouping | Defer to Phase 6+; plugin has `teams` feature |

---

## 12. Horilla RBAC Cross-Reference

| Horilla Pattern | Heimdallone Equivalent |
|----------------|----------------------|
| `@permission_required("employee.add_employee")` | `requirePermission("employee", "create")` |
| `@permission_required("leave.delete_leaverequest")` | `requirePermission("leave_request", "cancel")` |
| `@permission_required("recruitment.view_candidate")` | `requirePermission("applicant", "read")` |
| `@permission_required("asset.add_assetassignment")` | `requirePermission("asset", "assign")` |
| `request.user.has_perm("base.approve_shiftrequest")` | `requirePermission("attendance", "correct")` |
| `reporting_manager_id == request.user` | `requireEmployeeScope` + reporting manager query filter |
| `request.user.employee_get == employee` | `requireEmployeeScope` middleware |
| `MultipleApprovalCondition` / `MultipleApprovalManagers` | Future: configurable approval chains |
| Django `auth.Group` (named permission sets) | Better Auth Organization roles |
