# Heimdallone v2 — Claude Code Mega Prompt

You are Claude Code acting as a Principal Software Engineer, Solutions Architect, product-minded HRMS domain analyst, and senior frontend implementation agent.

You are working on **Heimdallone v2**, a clean Better-T-Stack rebuild of a full HRMS, workforce operations, payroll, compliance, attendance, leave, recruitment, onboarding, offboarding, asset, helpdesk, geofencing, biometric attendance, and multi-country business operations platform.

This prompt is the source of truth for your assignment. Read it fully before taking action.

---

## 0. Non-negotiable mission

Heimdallone v2 is not only payroll.

Heimdallone v2 must eventually cover the complete functional scope of Horilla HRMS and then extend beyond it with Heimdallone-specific capabilities such as multi-country payroll, multi-tenancy, regional tax calculators, shared services, client/company management, accounting exports, compliance packs, and native mobile workflows.

The product direction is:

```txt
Heimdallone-native first.
Horilla-informed for HRMS domain logic.
Old HeimdallOne-informed for proprietary feature ideas.
Standalone platform eventually.
```

Horilla is not the implementation target. Horilla is the **domain/workflow/reference source** for HRMS features and backend logic.

The new `heimdallone-v2` repository is the **only implementation target**.

---

## 1. Current repo and stack reality

The current repo was scaffolded with Better-T-Stack.

Expected repo:

```txt
heimdallone-v2/
├── .agents/
│   └── skills/
├── .claude/
│   ├── CLAUDE.md
│   ├── settings.json
│   └── skills/
├── .husky/
├── apps/
│   ├── native/
│   ├── server/
│   └── web/
├── packages/
│   ├── api/
│   ├── auth/
│   ├── config/
│   ├── db/
│   ├── env/
│   └── ui/
├── AGENTS.md
├── README.md
├── biome.json
├── bts.jsonc
├── bun.lock
├── bunfig.toml
├── lefthook.yml
├── package.json
├── skills-lock.json
├── tsconfig.json
└── turbo.json
```

The recorded Better-T-Stack scaffold is:

```bash
bun create better-t-stack@latest Heimdallone \
  --frontend tanstack-start native-uniwind \
  --backend hono \
  --runtime bun \
  --database postgres \
  --orm drizzle \
  --api orpc \
  --auth better-auth \
  --payments none \
  --addons biome evlog husky lefthook skills tauri turborepo ultracite \
  --examples none \
  --db-setup docker \
  --web-deploy none \
  --server-deploy none \
  --git \
  --package-manager bun \
  --install
```

Do not recreate this project. Work inside the existing scaffold.

### Current stack constraints

You must preserve this stack:

- Runtime/package manager: Bun
- Monorepo: Turborepo
- Web app: TanStack Start with React
- Native app: Expo / native-uniwind / NativeWind-compatible setup in `apps/native`
- Server: Hono running on Bun in `apps/server`
- API protocol: oRPC in `packages/api`
- Auth: Better Auth in `packages/auth`
- Database: PostgreSQL
- ORM: Drizzle in `packages/db`
- UI: shadcn/ui-compatible primitives in `packages/ui`
- Styling: Tailwind CSS v4
- Desktop/mobile packaging: existing Tauri setup under `apps/web/src-tauri`
- Quality/tooling: Biome, evlog, Husky, Lefthook, Ultracite

### Forbidden stack changes

Do not introduce or migrate to:

- Next.js
- Prisma
- Supabase
- tRPC
- Express
- Fastify
- NestJS
- Material UI
- Chakra UI
- Bootstrap
- Ant Design
- custom JWT session system
- separate auth/session layer replacing Better Auth
- separate API protocol replacing oRPC

---

## 2. Required initial local reading

Before modifying files, read these local files if present:

```txt
AGENTS.md
.claude/CLAUDE.md
bts.jsonc
package.json
turbo.json
biome.json
lefthook.yml
apps/web/package.json
apps/server/package.json
packages/api/package.json
packages/auth/package.json
packages/db/package.json
packages/ui/package.json
packages/api/src/index.ts
packages/api/src/context.ts
packages/api/src/routers/index.ts
packages/auth/src/index.ts
packages/auth/src/client.ts
packages/db/src/schema/auth.ts
packages/db/src/schema/index.ts
apps/server/src/index.ts
apps/web/src/routes/__root.tsx
apps/web/src/routes/index.tsx
apps/web/src/routes/login.tsx
apps/web/src/routes/dashboard.tsx
```

Also read relevant local skills under `.agents/skills` and `.claude/skills` before implementation, especially any that relate to:

```txt
better-auth
hono
shadcn
react
tanstack
turborepo
ultracite
web-design-guidelines
building-native-ui
expo-tailwind-setup
native-data-fetching
```

If the exact skill names differ, search the skills folders and read the closest matching files.

---

## 3. External reference cloning requirement: Horilla

Clone Horilla into a local reference-only folder before creating the HRMS feature map.

Use:

```bash
git clone --depth=1 https://github.com/horilla/horilla-hr .references/horilla-hr
```

If `.references/horilla-hr` already exists, update it safely:

```bash
git -C .references/horilla-hr pull --ff-only || true
```

Add `.references/` to `.gitignore` if it is not already ignored.

Do not copy Horilla source files into Heimdallone app/package code.

Do not vendor Horilla.

Do not connect to a Horilla database.

Do not import Horilla Python code into the TypeScript app.

Use Horilla only as a **reference repository** for domain logic, workflows, data models, permissions patterns, screens, modules, edge cases, and feature coverage.

You must inspect at least these Horilla modules before writing the feature map:

```txt
base/
employee/
attendance/
leave/
payroll/
recruitment/
onboarding/
offboarding/
pms/
asset/
project/
helpdesk/
biometric/
geofencing/
horilla_audit/
horilla_documents/
horilla_automations/
notifications/
```

Inspect the Django model files, admin/forms/views/services/decorators where present, and URL/app structure.

Pay special attention to:

```txt
employee/models.py
attendance/models.py
leave/models.py
payroll/models/models.py or payroll model files
base/models.py
biometric models/services
geofencing models/services
horilla_audit models/services
```

Do not overfit to Django table names or Django implementation details. Extract the product/domain intent.

---

## 4. Design handoff requirement

The user will place a design handoff zip/folder into the project, expected as:

```txt
design_handoff_heimdallone/
├── README.md
├── CLAUDE.md
├── COMPONENTS.md
├── DESIGN_TOKENS.md
├── IMPLEMENTATION.md
├── INTERACTIONS.md
└── designs/
    ├── marketing.html
    ├── pricing.html
    ├── docs.html
    ├── login.html
    ├── app/
    │   ├── dashboard.html
    │   ├── payroll.html
    │   ├── employees.html
    │   ├── employee.html
    │   └── compliance.html
    ├── styles/
    │   ├── heimdall.css
    │   └── marketing.css
    └── js/
        ├── heimdall.js
        ├── shell.js
        └── marketing-chrome.js
```

If this folder exists, treat it as the canonical frontend design source of truth.

Read these files in order:

```txt
design_handoff_heimdallone/README.md
design_handoff_heimdallone/CLAUDE.md
design_handoff_heimdallone/DESIGN_TOKENS.md
design_handoff_heimdallone/COMPONENTS.md
design_handoff_heimdallone/IMPLEMENTATION.md
design_handoff_heimdallone/INTERACTIONS.md
```

Then inspect all HTML/CSS/JS prototypes.

Do not redesign them. Port them faithfully into the TanStack Start web app.

If the design handoff folder is not present, stop and ask the user to add it before frontend porting.

---

## 5. Product sources of truth

Create documentation that separates the three sources of truth clearly.

### Implementation source

```txt
heimdallone-v2 repository
```

Only this repo receives code changes.

### HRMS reference source

```txt
https://github.com/horilla/horilla-hr
```

Horilla is the backend/domain/workflow reference for the full HRMS feature set.

Use it to understand:

- Employee management
- Company / department / job position / job role / work type / shift models
- Attendance
- Time tracking
- Check-in/check-out activity
- Late arrival / early out
- Overtime
- Work records
- Biometric device attendance
- Geofencing
- Leave management
- Holidays and company leave
- Leave allocations and restrictions
- Payroll contracts
- Allowances
- Deductions
- Tax brackets
- Payslips
- Loans
- Reimbursements
- Recruitment
- Candidate pipelines
- Onboarding
- Offboarding
- Performance management
- Assets
- Projects
- Helpdesk / service desk
- Documents
- Audit history
- Notifications
- Automations
- Permissions and groups
- Reporting-manager based access

Do not copy the Django architecture blindly.

### Feature archive source

The old HeimdallOne repository is a feature archive only.

Use it to preserve ideas such as:

- Multi-country payroll engine
- Multi-tenancy
- Regional tax calculators
- Shared services CRM
- Client/company management
- Accounting exports
- Compliance packs
- Payroll export workflows
- Country-specific statutory deductions
- Caribbean-first payroll logic

Do not port old code directly unless explicitly asked.

---

## 6. Documentation deliverables required before major backend implementation

Create these docs before schema/domain implementation:

```txt
docs/product/source-of-truth.md
docs/product/horilla-reference-map.md
docs/product/old-heimdallone-feature-map.md
docs/product/heimdallone-roadmap.md
docs/architecture/stack-baseline.md
docs/architecture/auth-rbac-plan.md
docs/architecture/tenant-model.md
docs/architecture/hrms-domain-map.md
docs/architecture/payroll-engine-plan.md
docs/architecture/attendance-geofencing-biometric-plan.md
docs/architecture/integration-strategy.md
docs/decisions/adr-0001-heimdallone-native-first.md
```

These docs must be practical engineering docs, not generic filler.

They should explicitly say:

```txt
Heimdallone-native first.
Horilla-informed, not Horilla-dependent.
Better Auth is the session/auth foundation.
Better Auth Organization plugin is the preferred tenancy foundation.
Better Auth Admin plugin is the preferred platform-admin foundation.
All sensitive actions require server-side permissions.
Frontend visibility is not security.
```

---

## 7. Horilla-derived module map to implement over time

The long-term Heimdallone feature scope should include every major Horilla module and then extend it.

### 7.1 Core platform

- Tenants / organizations
- Companies / legal entities
- Countries / regions
- Locations / work sites
- Departments
- Job positions
- Job roles
- Work types
- Employee types
- Shifts
- Shift schedules
- Reporting structure
- Roles and permissions
- Teams
- Audit logging
- Notifications
- Automation rules
- Documents
- Imports/exports

### 7.2 Employee / HR core

Inspired by Horilla `employee` and `base` apps.

Target concepts:

- Employee profile
- Employee identity
- Work information
- Department
- Job position
- Job role
- Manager
- Employment type
- Work type
- Shift
- Company/legal entity
- Country/location
- Contract
- Salary profile
- Bank/payroll details
- Emergency/contact details
- Documents
- Policies
- Disciplinary records
- Activity timeline
- Employee self-service

### 7.3 Attendance and time tracking

Inspired by Horilla `attendance`, `biometric`, and `geofencing` apps.

Target concepts:

- Attendance event / raw punch
- Check-in/check-out
- Attendance activity timeline
- Daily attendance record
- Work record
- Present / absent / half-day / leave / holiday / conflict states
- Late arrival
- Early out
- Overtime
- Grace periods
- Attendance validation conditions
- Approval workflow
- Device source tracking
- Biometric import source
- Geofence check-in restrictions
- Location verification
- Manual correction workflow
- Attendance audit trail

Future tables/concepts may include:

```txt
attendance_events
attendance_records
attendance_activities
attendance_exceptions
overtime_records
work_records
attendance_policies
grace_period_rules
attendance_device_sources
biometric_devices
biometric_import_jobs
geofence_zones
geofence_events
attendance_approvals
```

Do not implement these tables until the domain and auth plan are documented.

### 7.4 Leave management

Inspired by Horilla `leave` app.

Target concepts:

- Leave types
- Leave policies
- Available leave / leave balance
- Leave requests
- Leave allocation requests
- Holidays
- Company leave
- Leave approval conditions
- Leave restrictions
- Employee past leave restrictions
- Team calendar
- Country-specific holidays
- Statutory leave packs
- Leave audit trail

Future tables/concepts may include:

```txt
leave_types
leave_policies
leave_balances
leave_requests
leave_allocations
holiday_calendars
company_leave_days
leave_approval_steps
leave_restrictions
leave_audit_events
```

### 7.5 Payroll

Inspired by Horilla `payroll` app plus Heimdallone’s multi-country payroll vision.

Target concepts:

- Contracts
- Pay periods
- Pay runs
- Work records
- Allowances
- Deductions
- Benefits
- Reimbursements
- Loans / installments
- Filing status
- Tax brackets
- Statutory deductions
- Employer contributions
- Payslips
- Payroll settings
- Payroll auto-generation
- Payroll approvals
- Payroll audit trail
- Payroll exports
- Country compliance rules

Heimdallone-specific multi-country model:

```txt
payroll_country_profiles
payroll_tax_years
payroll_tax_brackets
payroll_statutory_deductions
payroll_employer_contributions
payroll_allowances
payroll_deductions
payroll_benefits
payroll_periods
payroll_runs
payroll_run_employees
payroll_payslips
payroll_pay_items
payroll_exports
payroll_audit_events
```

Caribbean-first sample countries:

- Guyana
- Trinidad & Tobago
- Barbados
- Jamaica

Secondary sample countries:

- United States
- Canada
- United Kingdom

Do not implement real statutory calculations until the payroll engine plan is documented and reviewed.

### 7.6 Recruitment

Inspired by Horilla `recruitment` app.

Target concepts:

- Recruitment pipeline
- Job openings
- Candidates
- Stages
- Interviews
- Offers
- Hiring managers
- Candidate documents
- Recruitment analytics
- Conversion to employee/onboarding

### 7.7 Onboarding

Inspired by Horilla `onboarding` app.

Target concepts:

- Onboarding stage
- Onboarding tasks
- Candidate-to-employee workflow
- Document checklist
- Manager assignments
- IT/equipment preparation
- Policy acknowledgement
- First-day workflow

### 7.8 Offboarding

Inspired by Horilla `offboarding` app.

Target concepts:

- Resignation/termination workflow
- Exit checklist
- Asset return
- Final payroll checklist
- Knowledge transfer
- Exit interview
- Access revocation
- Document archival

### 7.9 Performance management

Inspired by Horilla `pms` app.

Target concepts:

- Goals
- Key results
- Feedback
- Reviews
- Performance cycles
- Manager reviews
- Self evaluations
- Analytics

### 7.10 Asset management

Inspired by Horilla `asset` app.

Target concepts:

- Assets
- Categories
- Asset requests
- Asset allocation
- Asset return
- Maintenance
- Audit log

### 7.11 Projects and helpdesk

Inspired by Horilla `project` and `helpdesk` apps.

Target concepts:

- Projects
- Tasks
- Timesheets or work allocation
- Helpdesk tickets
- Service requests
- Assignments
- SLA/state tracking
- Internal operations workflow

### 7.12 Documents, audit, notifications, automations

Inspired by Horilla supporting apps.

Target concepts:

- Document storage metadata
- Document request workflow
- Approval states
- Audit events
- Change history
- Notification preferences
- Email/in-app notification hooks
- Automation rules
- Scheduled jobs

---

## 8. Auth, session, admin, tenant, and RBAC strategy

This is critical. Do not hallucinate auth.

The scaffold already uses Better Auth with Hono and Drizzle. Preserve it.

### 8.1 Better Auth facts to respect

Better Auth is the session/auth foundation.

Better Auth Hono integration mounts the handler like:

```ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

CORS middleware must be registered before auth routes and must support credentials for cookie-based auth.

Session lookup should use:

```ts
auth.api.getSession({ headers: c.req.raw.headers })
```

The current repo already does this in the oRPC context. Extend it; do not replace it.

### 8.2 Required plugin direction

For multi-tenancy, prefer the Better Auth Organization plugin.

For platform-level admin/user management, prefer the Better Auth Admin plugin.

Do not invent custom organization/session/admin tables before checking Better Auth plugin schema requirements.

Expected future auth plugins:

```ts
import { admin, organization } from "better-auth/plugins";
```

Expected client plugins:

```ts
import { adminClient, organizationClient } from "better-auth/client/plugins";
```

Only implement plugin integration after reading current Better Auth docs and checking the repo’s current `packages/auth` setup.

### 8.3 RBAC/ABAC model target

Roles needed eventually:

```txt
platform_owner
platform_admin
tenant_owner
tenant_admin
hr_admin
payroll_admin
country_payroll_specialist
manager
employee
auditor
recruiter
service_desk_agent
asset_manager
```

Permissions needed eventually:

```txt
tenant:read
tenant:update
organization:manage
member:invite
member:update_role
employee:read
employee:create
employee:update
employee:sensitive:read
employee:sensitive:update
attendance:read
attendance:create
attendance:update
attendance:approve
attendance:override
leave:read
leave:create
leave:approve
leave:policy_manage
payroll:read
payroll:run
payroll:approve
payroll:sensitive:read
payroll:settings_manage
country_rules:read
country_rules:manage
recruitment:read
recruitment:manage
onboarding:manage
offboarding:manage
performance:read
performance:manage
assets:read
assets:manage
helpdesk:read
helpdesk:manage
documents:read
documents:manage
audit:read
settings:update
```

Server-side enforcement is mandatory.

Frontend route hiding is not security.

Every protected oRPC procedure must check:

1. authenticated user
2. active organization/tenant where applicable
3. required permission/role
4. resource scope, such as manager/department/country/location access

### 8.4 Required future oRPC middleware helpers

Plan and then implement helpers like:

```txt
requireAuth
requireActiveOrganization
requirePlatformAdmin
requireTenantRole
requirePermission
requireEmployeeScope
requirePayrollCountryScope
requireManagerScope
```

Do not implement broad domain mutations until these helpers exist or are explicitly planned.

---

## 9. Frontend implementation goal

Primary frontend task: port the design handoff into `apps/web`.

Use TanStack Start routes.

Use Tailwind CSS v4.

Use shadcn/ui-compatible primitives from `packages/ui` where natural.

Use Magic UI-style effects only where the design handoff uses them, mostly marketing.

Do not over-animate the operational app.

### Required routes from design handoff

Marketing/public:

```txt
/           -> marketing landing page
/pricing    -> pricing page
/docs       -> docs/resources page
/login      -> login page
```

Authenticated app:

```txt
/app                    -> executive dashboard
/app/payroll            -> payroll command center
/app/employees          -> employee list
/app/employees/$id      -> employee profile
/app/compliance         -> compliance/audit page
```

Stub routes using the same app shell:

```txt
/app/attendance
/app/leave
/app/countries
/app/documents
/app/settings
/app/recruitment
/app/onboarding
/app/offboarding
/app/performance
/app/assets
/app/helpdesk
/app/geofencing
/app/biometrics
```

Stub routes must have polished empty states, not blank pages.

### Design fidelity requirements

- Preserve colors, spacing, density, typography, shadows, and layout from the design handoff.
- Preserve dark/light theme behavior.
- Default app theme should be dark.
- Persist theme to `localStorage.heimdall.theme` if the handoff requires this.
- Use tabular numerics for metric-heavy UI.
- Marketing can be lighter and more polished.
- App should feel like a serious operational command center.

### Required UI/component areas

- Marketing nav
- Marketing footer
- Marketing hero
- Marketing feature/bento sections
- Pricing cards
- Docs hub cards
- Login card
- App sidebar
- App topbar
- Tenant switcher
- User/account menu
- Theme toggle
- Sync/source status badge
- Metric cards
- Employee table
- Employee profile drawer
- Payroll country selector
- Payroll readiness checklist
- Compliance event ledger
- Audit/risk cards
- Empty states
- Loading skeletons
- Error states

### Interactions to preserve

- Theme toggle
- Dropdowns
- Tabs
- Employee preview drawer
- Bulk select on employees table
- Density toggle on employees list
- Payroll country selector
- Marketing count-up/reveal effects if present
- Sidebar/topbar menu behavior
- Escape/click-outside close behavior where relevant

Prefer React state and shadcn primitives over copying raw DOM scripts.

---

## 10. Mock data requirement

For frontend implementation, use local typed mock data only.

Create mock data modules for:

```txt
tenants
users
roles
employees
departments
locations
payrollCountries
payRuns
attendanceSummaries
leaveSummaries
complianceEvents
auditFindings
geofenceZones
biometricDevices
recruitmentPipelines
onboardingTasks
assets
helpdeskTickets
```

Use realistic Caribbean-first examples.

Do not implement real payroll calculations yet.

Do not wire backend APIs unless needed for existing scaffold compile checks.

---

## 11. Backend/API work allowed in this first pass

Allowed:

- Preserve existing Hono server.
- Preserve Better Auth handler.
- Preserve current oRPC health/privateData examples unless replacing with equivalent compile-safe examples.
- Add documentation.
- Add type-safe mock-only frontend modules.
- Add route-level frontend auth placeholders if already supported by the scaffold.
- Add TODO-free but clearly staged architecture docs.

Not allowed in this first pass unless explicitly asked:

- Creating real domain database migrations.
- Adding real payroll calculation engine.
- Connecting to Horilla DB.
- Implementing Horilla import/sync.
- Mirroring Django table names.
- Replacing Better Auth session handling.
- Adding custom auth tables outside Better Auth plugin requirements.

---

## 12. Database strategy for later phases

The current database only needs Better Auth core tables plus any plugin-generated tables when Better Auth Organization/Admin is integrated.

For Heimdallone-native domain tables later, prefer clean domain tables rather than Django names.

Possible table families later:

```txt
organizations
organization_settings
legal_entities
countries
locations
departments
job_positions
job_roles
work_types
employee_types
shifts
shift_schedules
employees
employee_work_profiles
employee_bank_profiles
contracts
attendance_events
attendance_records
attendance_exceptions
work_records
overtime_records
biometric_devices
biometric_import_jobs
geofence_zones
leave_types
leave_policies
leave_balances
leave_requests
leave_allocations
holiday_calendars
payroll_country_profiles
payroll_tax_years
payroll_tax_brackets
payroll_statutory_deductions
payroll_periods
payroll_runs
payroll_payslips
audit_events
```

Reserve future integration bridge tables for Horilla compatibility/imports:

```txt
integration_sources
integration_external_records
horilla_import_jobs
horilla_record_links
```

Do not create these until the architecture docs and auth model are established.

---

## 13. Mobile/native posture

`apps/native` already exists.

Do not scaffold a new Expo app.

Do not port the full web design to native in the first pass.

Keep `apps/native` as the future mobile target.

When writing docs, acknowledge that native will eventually use:

- Expo
- NativeWind/native-uniwind
- Better Auth Expo client support
- shared API contracts through oRPC
- shared domain types where appropriate

Web comes first.

Native follows after app shell, auth, tenant model, and API boundaries stabilize.

---

## 14. Tauri posture

Tauri already exists under `apps/web/src-tauri`.

Do not move it into `apps/tauri` unless explicitly requested.

Design the web app so it can run well inside the Tauri shell.

Avoid browser-only assumptions that would break Tauri unnecessarily.

---

## 15. Quality gates

After implementation, run the appropriate project commands.

At minimum, inspect `package.json` scripts and run the available equivalents of:

```bash
bun install
bun run check
bun run check-types
bun run build
```

If script names differ, use the closest existing scripts and report exactly what was run.

Fix all TypeScript, lint, formatting, and build errors introduced by your changes.

Do not leave broken code.

Do not leave generated junk.

Do not leave TODO comments for unfinished implementation.

Do not delete Better-T-Stack scaffold files.

---

## 16. Suggested execution plan

### Phase 0 — repo and reference setup

1. Read local repo docs and skills.
2. Confirm stack from `bts.jsonc` and package files.
3. Clone Horilla into `.references/horilla-hr`.
4. Ensure `.references/` is ignored.
5. Verify design handoff folder exists.

### Phase 1 — documentation baseline

Create the required docs:

```txt
docs/product/source-of-truth.md
docs/product/horilla-reference-map.md
docs/product/old-heimdallone-feature-map.md
docs/product/heimdallone-roadmap.md
docs/architecture/stack-baseline.md
docs/architecture/auth-rbac-plan.md
docs/architecture/tenant-model.md
docs/architecture/hrms-domain-map.md
docs/architecture/payroll-engine-plan.md
docs/architecture/attendance-geofencing-biometric-plan.md
docs/architecture/integration-strategy.md
docs/decisions/adr-0001-heimdallone-native-first.md
```

These docs should be specific to Heimdallone and Horilla. Avoid generic SaaS filler.

### Phase 2 — frontend design system port

1. Move/translate design tokens into the Tailwind v4/global CSS layer.
2. Preserve shadcn compatibility.
3. Implement theme system.
4. Implement shared layout primitives.
5. Keep UI reusable but do not over-abstract prematurely.

### Phase 3 — frontend routes

Implement:

```txt
/
/pricing
/docs
/login
/app
/app/payroll
/app/employees
/app/employees/$id
/app/compliance
```

Add polished stubs for:

```txt
/app/attendance
/app/leave
/app/countries
/app/documents
/app/settings
/app/recruitment
/app/onboarding
/app/offboarding
/app/performance
/app/assets
/app/helpdesk
/app/geofencing
/app/biometrics
```

### Phase 4 — interaction fidelity

Implement design handoff interactions:

- theme toggle
- nav states
- app sidebar
- tenant switcher
- dropdowns
- employee preview drawer
- table selection
- density toggle
- payroll country selector
- tabs
- empty/loading/error states

### Phase 5 — auth/RBAC plan only unless explicitly approved

Do not fully implement Better Auth Organization/Admin unless the user approves the next phase.

But document exactly how it will be added:

- server plugin config
- client plugin config
- Drizzle schema/migration impact
- tenant active organization model
- server-side oRPC middleware
- route protection model
- platform admin vs tenant admin
- HR/payroll scoped permissions

### Phase 6 — report

At the end, report:

1. Files changed
2. Routes implemented
3. Docs created
4. Horilla modules reviewed
5. Design handoff files used
6. Commands run and whether they passed
7. Any design mismatch or limitation
8. Recommended next task

---

## 17. Claude Code output format

When you finish, respond with:

```md
## Summary

## Files changed

## Routes implemented

## Documentation created

## Horilla reference coverage

## Auth/RBAC notes

## Commands run

## Issues / limitations

## Recommended next step
```

Do not include unnecessary prose.

---

## 18. Final guardrails

You are not building a small payroll app.

You are laying the foundation for a full Heimdallone HRMS platform that can eventually match and surpass Horilla’s entire functional scope.

Keep the implementation clean, typed, tenant-aware, secure, and compatible with the selected Better-T-Stack architecture.

Do not guess. Read the repo, read the local skills, read the design handoff, clone Horilla as reference, then implement in controlled phases.
