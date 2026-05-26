# Tenant Model

Multi-tenancy via Better Auth Organization plugin. Organization = Tenant.

> Sources: Better Auth Organization plugin docs, Horilla multi-company patterns, HRMS industry best practices.

---

## 1. Core Model

**Organization = Tenant.** Every business using Heimdallone is a Better Auth organization. There is no custom tenant table — the plugin's `organization` table is the source of truth.

**User → Member → Organization.** A user can belong to multiple organizations (e.g., a consultant managing payroll for Atlas Shipping and Mahaica Group). Each membership has a role (one of the 9 tenant-level roles).

**Active Organization.** The session carries `activeOrganizationId` — every API call operates in the context of this organization. Switching tenants calls `auth.api.setActiveOrganization`.

---

## 2. Session Model

| Field | Source | Purpose |
|-------|--------|---------|
| `userId` | Core | Authenticated user identity |
| `token` | Core | Session token (cookie) |
| `expiresAt` | Core | Session expiry |
| `activeOrganizationId` | Organization plugin | Current tenant context |
| `impersonatedBy` | Admin plugin | Platform admin impersonation tracking |

### Auto-setting active organization

On first login, if a user belongs to exactly one organization, auto-set it via a `databaseHook`:

```ts
databaseHooks: {
  session: {
    create: {
      before: async (session) => {
        const orgs = await auth.api.listOrganizations({ headers });
        if (orgs.length === 1) {
          return { data: { ...session, activeOrganizationId: orgs[0].id } };
        }
        return { data: session };
      },
    },
  },
}
```

If the user belongs to multiple orgs, redirect to an org selection page (`/app/select-org`).

---

## 3. Data Isolation

**Every domain table has `organizationId` (FK to organization).** Every query filters by `context.organizationId` from the authenticated session. Server enforces — never trust client-side filtering.

```ts
// Pattern for all tenant-scoped queries
const employees = await db.query.employees.findMany({
  where: eq(schema.employees.organizationId, context.organizationId),
});
```

**Cross-tenant access is impossible** for tenant-level roles. Only platform admins (Admin plugin) can query across tenants.

---

## 4. Organization Hierarchy

```
Organization (Tenant)
├── Departments
│   └── Teams (optional, via Better Auth teams feature — deferred)
├── Locations / Work Sites
├── Countries (payroll country profiles)
├── Legal Entities (future — for multi-entity consolidation)
└── Members (users with roles)
```

Horilla reference: uses `Company` → `Department` → `JobPosition` → `JobRole` hierarchy under `base/models.py`. Heimdallone maps this to Organization → Departments → Job Positions → Job Roles, with Organization being the Better Auth organization.

---

## 5. Organization Lifecycle

### Sign-up auto-creates org

1. User calls `authClient.signUp.email({ email, password, name })`
2. On success, call `authClient.organization.create({ name: companyName, slug: autoSlug })`
3. Creator gets `tenant_owner` role (per `creatorRole` config)
4. Call `authClient.organization.setActive({ organizationId })`
5. Redirect to onboarding wizard

### Member invitation

1. `tenant_owner` or `tenant_admin` calls `authClient.organization.inviteMember({ email, role })`
2. Better Auth sends invitation email with token
3. Invitee accepts → joins org with assigned role
4. If invitee doesn't have an account, they sign up first, then accept

### Organization switching

The tenant switcher in the sidebar calls `authClient.organization.setActive({ organizationId })`. This updates `session.activeOrganizationId`. All subsequent API calls operate in the new tenant context.

---

## 6. Platform Admin vs Tenant Owner

| Concept | Platform Admin | Tenant Owner |
|---------|---------------|-------------|
| **Identity** | Admin plugin `adminUserIds` | Organization member with `tenant_owner` role |
| **Scope** | All tenants | Own organization only |
| **Auth check** | `user.role === "admin"` (Admin plugin) | `member.role === "tenant_owner"` (Organization plugin) |
| **Impersonation** | Can impersonate any user | Cannot impersonate |
| **User management** | Ban/unban, force password reset | Invite/remove members, change roles |
| **Org management** | Can view all orgs | Can update/delete own org |
| **Data access** | Cross-tenant (for support) | Own tenant only |

**These are completely separate auth layers.** A person can be both a platform admin AND a tenant owner (e.g., the Heimdallone founder who also runs their own payroll).

---

## 7. Organization Settings (Future)

The organization's `metadata` JSON field stores:
- `timezone` — display timezone for the tenant (e.g., "America/Guyana")
- `country` — primary country
- `currency` — primary currency
- `plan` — billing plan (starter/growth/enterprise/self-hosted)

For richer settings (work schedules, payroll components, branding), use a separate `organization_settings` table with `organizationId` FK — not the metadata JSON.

---

## 8. Teams (Deferred)

Better Auth Organization plugin has a `teams` feature (sub-org grouping). Deferred until after core RBAC is proven. When enabled, adds:
- `team` table: id, name, organizationId, createdAt
- `teamMember` table: id, teamId, userId, createdAt
- `session.activeTeamId` for team context

The `defaultStatements` spread already includes team permissions, so enabling teams later requires only config changes.

---

## 9. Cross-Tenant Isolation Rules

1. Every business table has `organizationId NOT NULL` FK
2. Every query includes `WHERE organizationId = context.organizationId`
3. Every mutation validates `organizationId` matches session context
4. No API endpoint returns data from multiple organizations (except platform admin diagnostics)
5. oRPC `tenantProcedure` middleware enforces this at the procedure level
6. Database indexes should include `organizationId` for query performance
7. Drizzle schema should use `.references(() => organization.id)` for FK integrity
