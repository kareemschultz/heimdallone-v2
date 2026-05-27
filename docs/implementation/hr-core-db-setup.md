# HR Core Database Setup (Phase 5B.1)

## Tables Created

13 new HR Core tables added to the existing 7 Better Auth tables (20 total):

| Table | Purpose | Rows (seed) |
|-------|---------|-------------|
| `department` | Organizational unit | 4 |
| `job_position` | Role within department | 8 |
| `job_role` | Specialization within position | 3 |
| `work_type` | How employee works (On-site, Remote, Hybrid) | 3 |
| `employee_type` | Employment class (Full-time, Part-time, Contractor) | 3 |
| `shift` | Named work schedule | 2 |
| `shift_schedule` | Per-day start/end times per shift | 10 |
| `holiday` | Public holidays (Guyana 2026) | 8 |
| `employee_profile` | Core employee entity | 9 |
| `employee_work_info` | Employment details (dept, position, salary) | 9 |
| `employee_bank_details` | Bank account for salary (sensitive) | 5 |
| `employee_document` | Uploaded documents with expiry | 4 |
| `audit_event` | Generic change log (reusable across all modules) | 2 |

4 pgEnum types created: `gender`, `marital_status`, `document_status`, `audit_action`.

## Migrations

| Migration | Description |
|-----------|-------------|
| `0000_ambiguous_colonel_america.sql` | Initial schema — all 20 tables (auth + HR Core) |
| `0001_lyrical_guardsmen.sql` | Partial unique index on `employee_profile(organization_id, badge_id) WHERE badge_id IS NOT NULL` |

## Commands

```bash
# Generate migration (from packages/db/)
export $(grep -v '^#' ../../apps/server/.env | xargs)
bunx drizzle-kit generate

# Push schema to central Postgres
bunx drizzle-kit push

# Run seed (from project root)
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-hr-core.ts
```

## Central Postgres Target

Schema applied to the central Postgres container (`postgres-central`) accessed via socat proxy at `localhost:5432`. See `docs/implementation/central-postgres-setup.md` for proxy setup.

## Seed Script

**File**: `scripts/seed-hr-core.ts`

**Prerequisites**: Run `scripts/seed-dev.ts` first (creates Better Auth users + Atlas Shipping org).

**What it creates**:
- 4 departments (Operations, Engineering, Finance, Human Resources)
- 8 job positions across departments
- 3 job roles (Backend, Frontend, Senior Accountant)
- 3 work types (On-site, Remote, Hybrid)
- 3 employee types (Full-time, Part-time, Contractor)
- 2 shifts (Day 08:00–17:00, Night 22:00–06:00) with Mon–Fri schedules
- 8 Guyana 2026 public holidays
- 9 employee profiles:
  - 5 linked to Better Auth users (Maya Persaud/owner, Rohan Gopaul/employee, Kareena Ramnath/hr, Andre Sealey/manager, Priya Singh/auditor)
  - 4 without app login (Shanice Powell, Devon Ali, Dwayne Wilson, Camille Ramjattan) — validates nullable `userId`
- 5 bank detail records (fake test data — "Demerara Bank" with sequential account numbers)
- 4 documents (National ID, Contract, Passport, Driver's License with varying statuses)
- 2 audit events (department create, employee create)

**All seed data is fake/demo-only.** Bank account numbers, NIS numbers, and personal details are fictional.

## Root-Level Seed Dependencies

The seed scripts (`scripts/seed-dev.ts`, `scripts/seed-hr-core.ts`) run from the project root and import from workspace packages directly. This requires `@paralleldrive/cuid2` and `drizzle-orm` as root-level dev dependencies.

**Decision**: Keep as root dev dependencies for now. The alternative — moving seed scripts into `packages/db/` — would complicate their dependency on `packages/auth` (seed-dev.ts uses Better Auth's handler). Root-level scripts with root-level deps is the simpler pattern for now. If seed scripts multiply, consider a dedicated `packages/seed` workspace.

## badgeId Partial Unique Index

The `employee_profile` table has a partial unique index:

```sql
CREATE UNIQUE INDEX employee_profile_org_badge_uidx
  ON employee_profile (organization_id, badge_id)
  WHERE badge_id IS NOT NULL;
```

This ensures badge IDs are unique per organization while allowing multiple employees to have `NULL` badge IDs (employees not yet assigned a badge).

**Drizzle definition** (in `hr-core.ts`):
```ts
uniqueIndex("employee_profile_org_badge_uidx")
  .on(t.organizationId, t.badgeId)
  .where(sql`${t.badgeId} IS NOT NULL`)
```

This index is critical for future badge auto-generation and biometric/time-attendance device matching (Phase 11).

## Key Schema Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Money fields | `numeric(12, 2)` | Exact decimal, no floating-point errors |
| IDs | `text` with cuid2 | Consistent with Better Auth pattern |
| Enums | `pgEnum` for stable sets | Database-level enforcement |
| Dates | Drizzle `date` type | Calendar dates, not timestamps |
| Tenant scope | `organizationId` FK on every table | Better Auth Organization integration |
| Soft delete | `isActive` boolean | No hard delete for referenced entities |
| Employee login | `userId` nullable | Not every employee has app access |
| FK on delete | `restrict` for org structure, `cascade` for child records | Prevent orphans, auto-cleanup children |
| Self-reference | `reportingManagerId` on work_info | Cycle detection at app layer, not DB |
