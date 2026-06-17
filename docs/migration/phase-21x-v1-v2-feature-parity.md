# Phase 21X — v1 → v2 Feature/Page Parity (2026-06-17)

Owner asked: *"see what pages/settings v1 had that v2 doesn't and add them and
enhance them — e.g. user/invite management, and the shift page with Gantt /
calendar / list views."*

Source of truth for v1 = `/home/karetech/projects/heimdallone` @ `d03e5b4`
(`apps/admin` is the live v1 ERP UI; `apps/web` is just marketing/careers,
`apps/v3` is an abandoned slimmer rewrite). v2 = this repo.

## Built this pass (live on `sha-2484b08`)

Both were **backend-ready, UI-only gaps** — no new server code, no migration, no
new AC pairs (permission audit stays **161/21**).

### 1. Users & Access — `/app/users` (the user/invite gap)
v1 had `settings/team.tsx` + `(auth)/accept-invitation.$invitationId.tsx`. v2 ran
the Better Auth `organization` + `admin` plugins (with `member:[invite,
update_role,remove]` granted to owner/admin/hr_admin) but shipped **no UI**.
- Members table: inline role change (all 12 org roles), remove (confirm dialog).
- Invite-by-email dialog; pending-invitations list; **Copy invite link** (email
  delivery is a dev stub, so we surface the link instead of pretending to send).
- New `/accept-invitation/$id` route (sign-in aware).
- Nav: **Workspace → Users & Access**, gated `canManageHR` (owner/admin/hr_admin);
  server `ac` enforces regardless of the UI gate.

### 2. Roster & Schedule — `/app/roster` (the shift-views gap)
v1 had `attendance/roster.tsx` + `attendance/schedules/{index,assignments}`. v2
built the `roster` router in 21D-D (verify:roster 68/68) but **no UI**.
- Three views over one dataset: **Calendar** (employees × week grid), **List**,
  **Timeline** (per-employee week strip — the lightweight "Gantt").
- Assign/edit/remove, day-off / custom-hours / swap overrides, approve/unapprove,
  **bulk-assign** a shift across a date range + weekdays.
- Managers/HR manage their team (server-scoped); employees get read-only **My
  schedule** (`roster.listMine`).
- Nav: **Operate → Roster**, gated `canViewRoster` (payroll-tier see-all + manager
  + employee).

Verification: gates green (check-types 3/3, build 3/3, web tsc 0 new, lint clean,
audit 161/21); routes registered; authenticated SSR 200 on both; `roster.list` /
`roster.shifts` return 200 via the live RPC with the QA session. Interactive
click-through (invite a member, drag/assign a shift) is the one remaining manual
QA step — added to the morning checklist.

Docs (standing Documentation Rule): updated `administration/users-and-roles.mdx`
and `time/rosters.mdx` (the latter previously said "no end-user roster screen
yet" — now stale). Docs build passes.

## Already in v2 (no gap — confirmed)
- **Settings**: departments, positions, job-roles, work types, employment types,
  **shifts**, **holidays** are all in **App → Settings** (`settings.tsx` tabs).
- **Payroll**: runs, payslips, pay-items, payments, loans, reimbursements, reports,
  tax/country profile (Countries & Tax), corrections.
- **Finance**: GL/accounts (gl router), budgets, cost reports, variance.
- **Leave / Attendance / Time clocks / Geofencing / Contracts / Assets / Helpdesk
  / Projects / Performance / Recruitment / Onboarding / Offboarding / CRM /
  Analytics** — all present.
- **Org chart**, **org-wide audit log viewer** — partial: audit_event is recorded
  and surfaced per-module (e.g. Projects Activity); no standalone org-chart or
  global audit-log page.

## Remaining v1 pages NOT in v2 (prioritised backlog — not built this pass)

High value:
1. **Communications** — `communications/announcements`, `communications/surveys`,
   `inbox`. v2 has the `notifications` inbox primitive but no announcements/surveys
   authoring. (Notifications emit helper already exists — `utils/notifications.ts`.)
2. **Lifecycle**: `disciplinary`, `transfers`, `resignations`, `recognition`. v2 has
   Performance recognition + Offboarding; disciplinary/transfers are genuinely
   absent.
3. **Development**: `training`, `certifications` (skills matrix). v1 `operations/
   skills` too. No v2 equivalent.
4. **Settings depth**: `branding` (per-tenant logo → also wanted for payslip
   branding), `work-locations`, `audit-log` viewer, `public-holidays` (v2 has a
   holidays tab — verify parity), `salary-structures`, `statutory-rates`
   (v2 covers via Countries & Tax + pay-items — verify nothing missing),
   `onboarding-templates`, `billing`.

Medium / lower:
5. **Inventory** (`inventory/items|movements|reports`) — distinct from Assets;
   stock/movement tracking. No v2 equivalent.
6. **Finance depth**: `balance-sheet`, `bank-reconciliation`, `cost-centers`,
   `gratuity`, `insurance`, `chart-of-accounts` UI (gl router exists; some of these
   are reporting views on top of it), `exports`.
7. **Org chart** (`operations/org-chart`), standalone **audit-log** page.
8. **Mobile app** (`apps/mobile` — Expo: leave/attendance/payslips/schedule). v2 is
   responsive web only; no native app.

## Recommendation
Build the backlog in the order above (Communications → Lifecycle → Development →
Settings depth) as separate verified passes, each behind its real RBAC, reusing
existing primitives (notifications, audit_event, StatTile, DataTable). None require
v1 DB access — they're new v2 product capabilities, generalised per the SaaS
Architecture Rule (not Netsurf/Foreign-Links-specific).
