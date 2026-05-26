# ADR-0001: Heimdallone-Native First, Horilla-Informed

**Status:** Accepted
**Date:** 2026-05-26
**Deciders:** KareTech team

---

## Context

We are building Heimdallone v2 from scratch on a modern TypeScript stack (Bun, TanStack Start, Hono, oRPC, Better Auth, Drizzle, PostgreSQL). The product scope is a full HRMS covering employee management, attendance, leave, payroll, recruitment, onboarding, performance, assets, helpdesk, and more.

Horilla HRMS (`https://github.com/horilla/horilla-hr`) is a production-quality open-source HRMS built in Django. It covers the same functional scope and has been used as a domain reference.

Two options were considered:

**Option A: Wrap or extend Horilla**
Run Horilla's Django backend alongside or beneath Heimdallone. Connect to its database, call its APIs, or vendor its Python codebase.

**Option B: Heimdallone-native with Horilla as reference**
Build all code, schemas, and business logic natively in TypeScript. Read Horilla's source code to understand domain models, workflows, and edge cases. Never import, connect to, or depend on Horilla at runtime.

---

## Decision

**Option B: Heimdallone-native first, Horilla-informed.**

All code, database schemas, API procedures, and naming conventions are Heimdallone-native. Horilla is a read-only reference repository cloned to `.references/horilla-hr/` and never referenced at runtime.

---

## Rationale

### Why not Option A

1. **Stack conflict.** Heimdallone is TypeScript/Bun. Horilla is Django/Python. Running both requires maintaining two runtimes, two deployment targets, and two sets of dependencies. The operational complexity outweighs any reuse benefit.

2. **Auth conflict.** Horilla uses Django's auth system (sessions, permissions, groups). Heimdallone uses Better Auth with cookie-based sessions, the Organization plugin for multi-tenancy, and the Admin plugin for platform admin. These are incompatible — there is no bridge that preserves both without duplicating auth state.

3. **Schema ownership.** Horilla's Django ORM manages its own migrations. If Heimdallone connected to Horilla's database, it would be subject to Horilla's schema evolution without control. Drizzle schema in `packages/db` must be the sole owner of Heimdallone's database.

4. **Tenancy model.** Horilla is single-tenant by design. Heimdallone is multi-tenant via Better Auth Organization. Adapting Horilla to multi-tenancy would require invasive changes to all its models — at that point it is no longer Horilla.

5. **API protocol.** Horilla exposes Django REST Framework APIs. Heimdallone uses oRPC with end-to-end TypeScript type safety. Proxying through DRF would lose type safety and add latency.

6. **Licensing and coupling risk.** Vendoring Horilla would make Heimdallone's codebase subject to Horilla's license terms and tied to its release cadence.

### Why Option B works

Horilla's value is its **domain knowledge**: 18+ HRMS modules with production-tested workflows, edge cases, permission patterns, and data models built over years. All of this is extractable from reading the source code without running a single line of Python.

The Heimdallone team reads Horilla's `models.py`, forms, views, and services to understand business intent — then implements equivalent logic natively in TypeScript, tailored to Heimdallone's architecture.

---

## Consequences

### Positive

- **Clean TypeScript domain model.** All entities, schemas, and procedures are Heimdallone-native with consistent naming conventions (`snake_case` tables, no Django-isms).
- **No Python dependencies.** The entire runtime is Bun. No virtual environments, no pip, no Django server.
- **Better Auth is the auth foundation.** Cookie-based sessions, multi-tenancy via Organization plugin, and platform admin via Admin plugin — all in one library that integrates directly with Drizzle and Hono.
- **Drizzle is the ORM.** Type-safe schema definitions, migration ownership, and direct PostgreSQL control. No ORM mismatch between Django's ORM and TypeScript queries.
- **oRPC is the API contract.** End-to-end type safety between server procedures and client callers. No REST/DRF contract to maintain separately.
- **Multi-tenancy from day one.** The Heimdallone schema is designed for `organization_id`-scoped data isolation from the first migration.

### Negative / Trade-offs

- **More upfront work.** We cannot reuse Horilla's Django views or serializers. Every workflow must be re-implemented in TypeScript. This is offset by the domain reference saving research time.
- **Horilla reference must be kept current.** When Horilla adds a new module or changes a workflow, we must manually check if Heimdallone should adopt the same change. There is no automatic sync.
- **No Horilla data at rest.** Horilla-hosted customer data cannot be read directly. A one-time import tool (`docs/architecture/integration-strategy.md`) handles migrations.

---

## Rules Derived from This Decision

1. The `heimdallone-v2` repository is the only target for code changes.
2. `.references/horilla-hr/` is a read-only reference. It is in `.gitignore` and never committed.
3. No Python code appears in any Heimdallone package or app.
4. No Horilla database connection string appears in any Heimdallone environment variable or config.
5. Heimdallone table and column names follow the conventions in `docs/architecture/hrms-domain-map.md`, not Horilla's Django model names.
6. Better Auth owns sessions. No custom JWT or session layer is introduced.
7. Drizzle owns the database schema. No raw SQL migrations outside of Drizzle Kit.
8. oRPC is the API protocol. No parallel REST API using Express, Fastify, or NestJS.
9. Server-side permission checks via oRPC middleware are mandatory for all protected procedures. Frontend route guards are UX only.

---

## Related Documents

- `docs/product/source-of-truth.md` — defines all four sources of truth and access rules for each
- `docs/architecture/stack-baseline.md` — exact stack versions and forbidden changes
- `docs/architecture/auth-rbac-plan.md` — Better Auth plugin plan and RBAC middleware design
- `docs/architecture/tenant-model.md` — Better Auth Organization as the tenancy foundation
- `docs/product/horilla-reference-map.md` — module-by-module reference map of Horilla
