# Better Auth Organization Plugin Reference

> Sourced from https://better-auth.com/docs/plugins/organization (2026-05-26)

## Setup

```ts
// Server
import { organization } from "better-auth/plugins";
export const auth = betterAuth({ plugins: [organization()] });

// Client
import { organizationClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({ plugins: [organizationClient()] });
```

Run `npx @better-auth/cli@latest migrate` after adding.

## Tables Created

- **organization**: id, name, slug, logo?, metadata?, createdAt
- **member**: id, userId (FK), organizationId (FK), role (comma-separated), createdAt
- **invitation**: id, email, inviterId (FK), organizationId (FK), role?, status (pending/accepted/rejected), createdAt, expiresAt, teamId?
- **Session additions**: activeOrganizationId?, activeTeamId?
- **organizationRole** (if dynamicAccessControl enabled): id, organizationId, role, permission (JSON), createdAt, updatedAt?

## Key Options

| Option | Default | Purpose |
|--------|---------|---------|
| `allowUserToCreateOrganization` | `true` | Can be async function |
| `organizationLimit` | unlimited | Max orgs per user |
| `creatorRole` | `"owner"` | Role for org creator |
| `membershipLimit` | 100 | Max members per org |
| `invitationExpiresIn` | 172800 (48h) | Seconds |
| `sendInvitationEmail` | required | Async email handler |
| `teams.enabled` | false | Enable teams feature |
| `dynamicAccessControl.enabled` | false | Runtime role management |

## Default Roles

- **owner**: Full control, can delete org
- **admin**: Full control except deletion/owner changes
- **member**: Read-only

## Custom Access Control

```ts
import { createAccessControl } from "better-auth/plugins/access";

const statement = { project: ["create", "share", "update", "delete"] } as const;
const ac = createAccessControl(statement);

const member = ac.newRole({ project: ["create"] });
const admin = ac.newRole({ project: ["create", "update"], organization: ["update"] });
const owner = ac.newRole({ project: ["create", "update", "delete"], organization: ["update", "delete"] });

// Pass to plugin
organization({ ac, roles: { owner, admin, member } })
```

## Key Methods

- `auth.api.createOrganization({ body: { name, slug }, headers })`
- `auth.api.setActiveOrganization({ body: { organizationId }, headers })`
- `auth.api.getFullOrganization({ query: { organizationId }, headers })`
- `auth.api.listOrganizations({ headers })`
- `auth.api.createInvitation({ body: { email, role, organizationId }, headers })`
- `auth.api.addMember({ body: { userId, role, organizationId } })` (server-only)
- `auth.api.hasPermission({ headers, body: { permissions: { resource: ["action"] } } })`

## Session Integration

Active organization stored in session via `activeOrganizationId`. Set via `setActiveOrganization`. Auto-set on creation unless `keepCurrentActiveOrganization: true`.

## Schema Customization

```ts
organization({
  schema: {
    organization: {
      modelName: "organizations",
      additionalFields: { myField: { type: "string", input: true } },
    },
  },
})
```
