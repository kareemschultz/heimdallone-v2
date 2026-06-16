# Fumadocs Usage-Docs IA Cleanup Plan

**Date:** 2026-06-15 · **Owner directive:** Fumadocs = end-user/admin **product
usage** docs (how to use Heimdallone, find things, what each feature does, what
roles can do, what workflows look like). It is **not** the home for engineering
plans, migration phase reports, shell-command runbooks, Claude phase history, or
production cutover command packets — those stay in `docs/migration/*` and
`docs/architecture/*` (internal developer/operator record).

> This plan governs the rewrite. Internal migration/operator docs are **kept** in
> `docs/migration` and only **linked from the Developer/Operator section**, never
> presented as normal user help.

## Truthfulness constraint (verified 2026-06-15)

Several areas the product will eventually expose **do not have an end-user UI yet**
— they are API-only or configured during migration / by an administrator. Docs
must say so plainly (tag **Requires Setup** / "set up by your administrator") and
must **not** invent click-paths. Verified today:

| Area | UI today? | How to document |
| --- | --- | --- |
| Employees, Statutory, Attendance, Leave | ✅ live UI | full usage page |
| Biometric devices (Devices / Punch review / Exceptions tabs) | ✅ live UI (`/app/biometrics`) | full usage page |
| Payroll runs / Payslips / Corrections | ✅ live UI (`/app/payroll`) | full usage page |
| Finance cost reports / Budgets / Variance | ✅ live UI (`/app/finance`) | full usage page |
| Settings (Departments/Positions/Job Roles/Work Types/Employment Types/Shifts/Holidays) | ✅ live UI (`/app/settings`) | admin setup page |
| Migration status report | ✅ live UI (`/app/migration-status`, HR/admin) | admin usage page |
| Org switching / Workspace settings | ✅ (sidebar switcher) | admin usage page |
| **GL accounts / Journals / Trial balance / Reversals** | ❌ API-only, no dedicated UI | concept + "administrator-managed; opening balances from migration" — **no click-path** |
| **Per-date roster calendar** | ❌ API-only | concept + "managed via shifts + your administrator" |
| **Shift-rule pay policy (night/split/OT)** | ❌ no admin UI (migration-configured) | concept under work schedules; shifts are set in Settings |
| **Dedicated user-management screen** | ❌ (members via Workspace settings; RBAC roles assigned by owner/admin) | document via Workspace settings, no fake screen |

## Navigation reality (for accurate "Go to …" language)

Sidebar groups: **Operate** (Overview, Employees, Attendance, Leave, Payroll,
Contracts, Assets, Helpdesk, Projects, Performance) · **Insights** (Analytics) ·
**Finance** · **CRM** · **Govern** (Migration status, + Preview modules) ·
**Workspace** (Settings). Biometrics is reached from Attendance →
**Biometrics & Time Clocks** (`/app/biometrics`: Overview / Devices / Sync runs /
Punch review / Exceptions). Org switch + Workspace settings are in the sidebar
workspace switcher.

## Page-by-page classification

### Administration
- `freeze-checklist.mdx` — **REWRITE → "Go-live readiness overview"** (admin-facing,
  no shell commands, no phase numbers, no engineering notes). May say "your
  administrator performs the final migration and cutover steps." Exact commands
  stay in `docs/migration/v1-to-v2-cutover-runbook.md`.
- `migration-cutover.mdx` — **REWRITE** as product/admin explanation: what was
  migrated, what users should expect, what admins verify **in the app**, how to
  find migrated employees/payslips/attendance/GL/devices, what to do if something
  looks wrong. Remove command-level + phase language.
- `migration-logins.mdx` — **REWRITE** as usage: checking migrated access,
  first-login, Google sign-in, how no-login employees appear, invite/reset,
  platform-owner vs tenant-owner from an app-usage view. Not an implementation report.
- `first-login.mdx` — **KEEP** (already user-facing).
- `index.mdx` — **REWRITE/IMPROVE** to an admin hub linking the new admin pages.
- **NEW** `organizations.mdx`, `users-and-roles.mdx`, `google-sign-in.mdx`,
  `device-setup.mdx` (links to Time → Biometric devices).

### Time
- `biometric-devices.mdx` — **REWRITE** as UI usage (find it, register, fields,
  where to copy id/key, last sync, unmatched punches, map device users,
  troubleshoot). Keep "secrets stay in the Pi `.env`" as a one-liner; **no command
  packet**.
- `work-schedules.mdx` — **REWRITE** toward usage (shifts in Settings; shift-rule
  pay policy is administrator/migration-configured; Requires Setup).
- `leave-effective-dating.mdx` — **KEEP** (concept page; light-touch).
- **NEW** `attendance.mdx`, `rosters.mdx`, `leave.mdx`.

### HR
- `employee-statutory.mdx` — **KEEP/IMPROVE** (usage + masking by role).
- **NEW** `employees.mdx` (list/profile/create + no-login + roles & access).
- `index.mdx` — **IMPROVE** hub.

### Payroll
- `effective-dating.mdx` — **KEEP**.
- **NEW** `payroll-runs.mdx`, `payslips.mdx`, `corrections.mdx`,
  `reconciliation.mdx`.
- `index.mdx` — **IMPROVE** hub.

### Finance
- **NEW** `cost-reports.mdx` + `budgets.mdx` (live UI), `general-ledger.mdx`
  (GL/journals/trial balance/reversals — honest "administrator-managed", no fake
  click-path).
- `index.mdx` — **IMPROVE** hub.

### Getting Started
- `roles.mdx`, `navigation.mdx` — **KEEP**.
- **NEW** `signing-in.mdx`, `profile-basics.mdx`. Link `first-login`.
- `index.mdx` — **IMPROVE**.

### Developer / Operator
- `index.mdx` — **IMPROVE**: add a clearly-labelled "Operator/cutover documents"
  list linking the internal docs (`docs/migration/phase-21p-cutover-authorization.md`,
  `v1-to-v2-cutover-runbook.md`, `phase-21m-freeze-readiness.md`,
  `docs/architecture/device-sync-bridge-plan.md`) as **internal**, not user help.

## Style rules (enforced on every page)
- "How to use the app," not "how we built it." No shell commands, no repo paths
  (except Developer pages), no Claude/agent/phase references.
- Navigation language: "Go to **App → Time → …**", "Click **Register device**",
  "Open **Unmatched punches**", "Choose an employee."
- Role notes per page using `<Tag>`: Employee · Manager · HR Admin · Payroll Admin ·
  Tenant Owner · Platform Owner (+ Auditor where relevant).
- Every page ends with **"What to check"** and **"Troubleshooting"** where useful.
- Mark non-live capabilities **Requires Setup** / Preview; never present fake UI or
  fake data as live.

## Nav (meta.json) after cleanup
- getting-started: index, signing-in, first-login(→ link), profile-basics, navigation, roles
- hr: index, employees, employee-statutory
- time: index, attendance, biometric-devices, rosters, work-schedules, leave, leave-effective-dating
- payroll: index, payroll-runs, payslips, corrections, reconciliation, effective-dating
- finance: index, cost-reports, budgets, general-ledger
- administration: index, organizations, users-and-roles, google-sign-in, device-setup, migration-cutover, migration-logins, first-login, freeze-checklist
- developer: index
