# Better Auth Admin Plugin Reference

> Sourced from https://better-auth.com/docs/plugins/admin (2026-05-26)

## Setup

```ts
// Server
import { admin } from "better-auth/plugins";
export const auth = betterAuth({ plugins: [admin()] });

// Client
import { adminClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({ plugins: [adminClient()] });
```

## Schema Changes

Adds to **user** table: `role` (string, default "user"), `banned` (boolean), `banReason` (string), `banExpires` (date).
Adds to **session** table: `impersonatedBy` (string).

## Key Options

```ts
admin({
  defaultRole: "user",
  adminRoles: ["admin", "superadmin"],
  adminUserIds: ["user_id_1"],
  impersonationSessionDuration: 3600,
  defaultBanReason: "No reason",
})
```

## Key Methods

- `authClient.admin.createUser({ email, password, name, role })`
- `authClient.admin.listUsers({ query: { searchValue, limit, offset, sortBy } })`
- `authClient.admin.setRole({ userId, role })`
- `authClient.admin.banUser({ userId, banReason, banExpiresIn })`
- `authClient.admin.unbanUser({ userId })`
- `authClient.admin.removeUser({ userId })`
- `authClient.admin.impersonateUser({ userId })`
- `authClient.admin.stopImpersonating()`
- `authClient.admin.listUserSessions({ userId })`
- `authClient.admin.revokeUserSession({ sessionToken })`

## Custom Permissions

Same `createAccessControl` pattern as Organization plugin. Define statements, create roles, pass `ac` and `roles` to both server and client.

Default admin permissions: user (create, list, set-role, ban, impersonate, delete, set-password), session (list, revoke, delete).

## Permission Checking

```ts
// Client
await authClient.admin.hasPermission({ permissions: { project: ["create"] } })

// Server
await auth.api.userHasPermission({ body: { userId, permissions: { project: ["create"] } } })
```
