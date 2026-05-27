# HR Core Domain Plan

Phase 5A spec. Defines what HR Core covers, entity relationships, and open questions.

---

## Domain Scope

HR Core is the foundation module. Every future module (Attendance, Leave, Payroll, Recruitment, etc.) depends on it. It covers:

### Organization Settings (Tenant-Level Configuration)
- **Departments** — Organizational units (Engineering, Operations, Finance, HR)
- **Job Positions** — Roles within departments (Software Engineer, Ops Lead, Finance Manager)
- **Job Roles** — Specializations within positions (Senior Backend, Junior Frontend)
- **Work Types** — How employees work (On-site, Remote, Hybrid, Field)
- **Employee Types** — Employment classification (Full-time, Part-time, Contractor, Intern)
- **Shifts** — Named work schedules with per-day start/end times and minimum hours
- **Shift Schedules** — Per-day configuration for each shift (Monday–Sunday)
- **Holidays** — Public/company holidays with optional recurrence
- **Company Leave Days** — Recurring weekly off days (e.g., every Sunday, alternating Saturdays)

### Employee Management
- **Employee Profiles** — Personal information, contact, demographics
- **Employee Work Information** — Department, position, role, shift, work type, reporting manager, salary, joining date
- **Employee Bank/Payroll Details** — Bank account for salary, sensitive data with masking
- **Employee Documents** — Uploaded files with status, expiry tracking, approval workflow

### Cross-Cutting
- **Audit Events** — Generic change log for all HR Core entities (and reusable by future modules)

---

## Entity Relationship Diagram (Conceptual)

```
Organization (Better Auth — already exists)
  │
  ├── Department ─── Job Position ─── Job Role
  ├── Work Type
  ├── Employee Type
  ├── Shift ─── Shift Schedule (per day)
  ├── Holiday
  │
  └── Employee Profile
       ├── Employee Work Info
       │    ├── → Department
       │    ├── → Job Position
       │    ├── → Job Role
       │    ├── → Shift
       │    ├── → Work Type
       │    ├── → Employee Type
       │    └── → Reporting Manager (self-ref → Employee Profile)
       ├── Employee Bank Details
       ├── Employee Document (0..n)
       └── → User (Better Auth, nullable)

Audit Event (generic, cross-entity)
  → Organization
  → Entity Type + Entity ID
  → Actor (User)
```

---

## Tenant Scoping Strategy

Every HR Core entity has an `organizationId` FK to the Better Auth `organization` table. All oRPC queries filter by `organizationId` from the session's `activeOrganizationId`. This is enforced at the middleware level (`tenantProcedure`), not per-query.

**Cascade rule**: When an organization is deleted, all HR Core data cascades. In practice, organizations are never deleted — they are archived.

---

## Archive Strategy (Soft Delete)

- **No hard deletes** for entities referenced by other records (departments, positions, employees)
- `isActive: boolean (default true)` on all archivable entities
- Archive = set `isActive = false`
- Archived entities are excluded from dropdowns/selects but remain in historical data
- Restore = set `isActive = true`
- `employee_document` can be hard-deleted if status is "requested" and no file uploaded

---

## Identity: Employee vs User

An `employee_profile` represents a person employed by the organization. A Better Auth `user` represents someone who can log into the system.

**Not every employee has a user account.** Some employees (field workers, warehouse staff) may never log in. The `userId` on `employee_profile` is **nullable**.

**Not every user is an employee.** Platform admins or external auditors may have user accounts without employee profiles.

**When both exist**: The `member` table (Better Auth Organization) links user → organization with a role. The `employee_profile` links to the same user via `userId`. The employee's org role comes from `member.role`, not from the employee profile.

---

## Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should departments support hierarchy (parent department)? | Flat (Horilla) vs Tree | **Flat for now**, add parentId later if needed |
| 2 | Should job positions exist without a department? | Required FK vs Optional | **Required FK** — positions always belong to a department |
| 3 | Should we support rotating shifts in Phase 5? | Now vs Defer | **Defer** to Phase 7 — complex, not needed for basic operations |
| 4 | Should company leave days (recurring weekly offs) be in Phase 5? | Now vs Defer | **Include** — simple model, needed for attendance/leave calculations |
| 5 | File storage for documents — local vs S3? | Local uploads vs cloud | **Abstract with `fileUrl`** — store URL regardless of backend. Implementation TBD. |
| 6 | Should audit events store the full entity snapshot or just changes? | Full vs Delta | **Delta only** (changes array) — smaller storage, sufficient for compliance |
| 7 | Multi-currency for salary — how to handle? | Single currency per org vs per employee | **Per-employee currency** on work_info, default from org settings |
| 8 | Badge ID format — auto-generated or manual? | Auto (EMP-00001) vs Manual | **Both** — auto-generate with configurable prefix, allow manual override |

---

## Priority Classification

| Entity | Priority | Rationale |
|--------|----------|-----------|
| Department | P0 | Every employee needs one |
| Job Position | P0 | Core org structure |
| Job Role | P1 | Optional refinement of position |
| Work Type | P0 | Basic employment configuration |
| Employee Type | P0 | Full-time/Part-time/Contractor |
| Shift | P0 | Needed for attendance (Phase 7) but defined here |
| Shift Schedule | P0 | Per-day config for shifts |
| Holiday | P0 | Needed for leave/attendance calculations |
| Employee Profile | P0 | Core entity |
| Employee Work Info | P0 | Links employee to org structure |
| Employee Bank Details | P0 | Needed for payroll |
| Employee Document | P0 | Document management |
| Audit Event | P0 | Compliance requirement from day one |
| Company Leave Day | P1 | Recurring weekly offs (e.g., every Sunday) |
