# Stack Baseline

This document is the authoritative record of Heimdallone's exact technology stack. Do not deviate from these choices without an ADR.

---

## Runtime and Package Manager

| Tool | Version |
|---|---|
| Bun | 1.3.12 |
| TypeScript | ^6 |

---

## Monorepo

| Tool | Version |
|---|---|
| Turborepo | ^2.8.12 |

---

## Workspace Layout

```
heimdallone-v2/
├── apps/
│   ├── native/          # Expo mobile app (iOS + Android)
│   ├── server/          # Hono API server (runs on Bun)
│   └── web/             # TanStack Start web app
│       └── src-tauri/   # Tauri desktop packaging
├── packages/
│   ├── api/             # oRPC router definitions and procedures
│   ├── auth/            # Better Auth configuration and plugins
│   ├── config/          # Shared TypeScript and tooling config
│   ├── db/              # Drizzle schema, migrations, and db client
│   ├── env/             # Type-safe environment variable validation
│   └── ui/              # shadcn/ui-compatible component library
```

---

## Application Layer

| App | Framework | Version |
|---|---|---|
| `apps/web` | TanStack Start | Current (React 19.2.6) |
| `apps/native` | Expo + native-uniwind | Current |
| `apps/server` | Hono | 4.8.2 |

---

## API Layer

| Tool | Version | Package |
|---|---|---|
| oRPC server | 1.13.14 | `@orpc/server` |
| oRPC client | 1.13.14 | `@orpc/client` |
| oRPC TanStack Query | 1.13.14 | `@orpc/tanstack-query` |
| oRPC OpenAPI | 1.13.14 | `@orpc/openapi` |
| oRPC Zod | 1.13.14 | `@orpc/zod` |

---

## Auth Layer

| Tool | Version | Package |
|---|---|---|
| Better Auth | 1.6.11 | `better-auth` |
| Better Auth Expo | 1.6.11 | `@better-auth/expo` |

Current auth config (`packages/auth/src/index.ts`):
- Email + password enabled
- Expo plugin registered
- Cookie-based sessions (`sameSite: none`, `secure: true`, `httpOnly: true`)
- Session lookup: `auth.api.getSession({ headers: c.req.raw.headers })`

Planned plugins (Phase 5):
- `organization` — multi-tenancy (Better Auth Organization plugin)
- `admin` — platform admin (Better Auth Admin plugin)

---

## Database Layer

| Tool | Version | Package |
|---|---|---|
| PostgreSQL | Latest stable | (Docker — dev) |
| Drizzle ORM | 0.45.1 | `drizzle-orm` |
| Drizzle Kit | Current | `drizzle-kit` |

Current schema tables (in `packages/db/src/schema/auth.ts`):
- `user`
- `session`
- `account`
- `verification`

---

## UI Layer

| Tool | Version | Notes |
|---|---|---|
| shadcn/ui | base-lyra variant | Component library in `packages/ui` |
| Tailwind CSS | v4.2.2 | v4 syntax — no `tailwind.config.js` |
| React | 19.2.6 | Used in web and native |

---

## Desktop Packaging

| Tool | Version |
|---|---|
| Tauri | 2.4.0 |

Tauri wraps `apps/web` under `apps/web/src-tauri/`. Targets: Windows, macOS.

---

## Quality Tooling

| Tool | Version | Purpose |
|---|---|---|
| Biome | 2.4.15 | Linting and formatting |
| Ultracite | 7.8.0 | Zero-config Biome preset |
| Husky | latest | Git hooks |
| Lefthook | latest | Git hook runner |
| evlog | ^2.14.1 | Structured logging |

**Lint/format commands:**
```bash
bun x ultracite fix    # Auto-fix all issues
bun x ultracite check  # Check without fixing
bun x ultracite doctor # Diagnose setup
```

---

## Environment Variables

### Server (`packages/env/src/server.ts`)

| Variable | Type | Description |
|---|---|---|
| `DATABASE_URL` | string (min 1) | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | string (min 32) | Better Auth signing secret |
| `BETTER_AUTH_URL` | url | Better Auth base URL (e.g. `http://localhost:3000`) |
| `CORS_ORIGIN` | url | Allowed CORS origin for web client |
| `NODE_ENV` | `development\|production\|test` | Runtime environment |

### Web client (`packages/env/src/web.ts`)

| Variable | Type | Description |
|---|---|---|
| `VITE_SERVER_URL` | url | Server base URL for API calls |

All env vars validated at startup via `@t3-oss/env-core` + Zod. Missing required vars will crash the process at boot — this is intentional.

---

## Build Commands

```bash
# Development (all apps)
bun dev

# Development (individual apps)
bun dev:web
bun dev:server
bun dev:native

# Build (all)
bun build

# Type check (all)
bun check-types

# Database
bun db:push        # Push schema to dev DB
bun db:migrate     # Run migrations
bun db:generate    # Generate migration files
bun db:studio      # Open Drizzle Studio
bun db:start       # Start local PostgreSQL (Docker)
bun db:stop        # Stop local PostgreSQL
```

---

## Forbidden Stack Changes

The following must never be introduced. If a use case seems to require one of these, raise an ADR first.

| Forbidden | Reason |
|---|---|
| Next.js | Conflicts with TanStack Start; different router and server model |
| Prisma | Drizzle is already in use; Prisma's generated client conflicts |
| Supabase | We own our auth (Better Auth) and DB; Supabase would duplicate both |
| tRPC | oRPC is already in use; tRPC would create a competing API layer |
| Express | Server is Hono on Bun; Express adds Node.js dependency and no benefit |
| Fastify | Same reason as Express |
| NestJS | Incompatible architecture style; heavy framework on top of Express/Fastify |
| Material UI | Conflicts with shadcn/ui and Tailwind v4 styling approach |
| Chakra UI | Same reason as Material UI |
| Bootstrap | Same reason as Material UI |
| Ant Design | Same reason as Material UI |
| Custom JWT session system | Better Auth already manages sessions; rolling a custom system introduces security risk |
| Separate auth layer replacing Better Auth | Better Auth is the foundation — replacing it requires a full ADR and migration plan |
| Separate API protocol replacing oRPC | oRPC is the API contract layer; replacing it breaks the entire client/server type contract |
