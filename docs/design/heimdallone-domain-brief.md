# Heimdallone — domain brief for a frontend redesign

Paste this into the claude.ai/design chat alongside the design prompt. It describes
the **real** data, roles, and workflows so the redesign matches the product instead
of guessing. (The design tool can't call the backend — this is how it learns the
structure.)

## What the product is

**Heimdallone** is a **multi-tenant HRMS + payroll + operations SaaS** for
Caribbean businesses (Guyana first; built around GRA tax rules, **GYD** currency,
**fortnightly/monthly** pay cycles). One company logs in, manages its whole
people-and-operations stack. Tone: trustworthy, dense-but-calm operations software
(payroll is money — it must feel precise and auditable, not playful).

## Navigation (current information architecture — keep the grouping, improve the UX)

- **Operate:** Overview · Employees · Org chart · Attendance · Roster · Time clocks
  (biometric devices) · Geofencing · Leave · Announcements · Surveys · Payroll ·
  Contracts · Assets · Inventory · Helpdesk · Projects · Performance · Lifecycle
  (disciplinary/transfers/resignations) · Development (training/certs)
- **Insights:** Analytics (exec dashboards)
- **Finance:** Finance (costing, budgets, GL — chart of accounts/journals/trial balance)
- **CRM:** Leads · Customers · Deals (pipeline)
- **Govern:** Setup center · Migration status · Countries & Tax · Compliance · Documents · Clients
- **Workspace:** Users & Access · Settings

That's ~25 modules — a redesign's biggest win is **taming this with a clear,
consistent navigation + a strong landing/overview**, not redrawing every screen.

## Roles (14) — the UI is role-scoped; design for these primary 5

| Role | Sees | Scope |
|---|---|---|
| **Admin / Owner / HR Admin** | everything | whole org |
| **Payroll Admin** | payroll, finance, GL, analytics | whole org |
| **Manager** | their team only — employees, attendance, leave approvals, performance | own + direct reports |
| **Employee** | self-service — my leave, my payslips, my requests, my profile, announcements/surveys | self only |
| **Auditor** | read-only across modules | whole org, read-only |

(Plus specialist roles: recruiter, helpdesk_agent, project_manager, sales_admin,
sales_rep, inventory_manager, stock_officer — each sees a scoped slice.)
**Design implication:** the same screen (e.g. the dashboard, or a leave list) must
render differently per role — Admin sees org-wide; Manager sees the team; Employee
sees only themselves. Show at least Admin vs Manager vs Employee variants.

## Key screens + their real data

**Overview / Dashboard** — KPI stat tiles (count + label + tone + optional delta),
a "Needs attention" feed (overdue/at-risk items), recent activity. Today it's
role-aware module cards + real unread-notification count.

**Employees** — list: name, badge ID, email, **department**, **job position**,
shift, work type, work location, avatar, active/archived. Detail: profile + work
info (reporting manager, dates) + **bank details (masked unless payroll role)** +
tabs (payroll, leave, docs, activity). Filter by department/status; search.

**Org chart** — reporting-line tree (manager → reports), expand/collapse, search;
each node = name, job title, department, # reports.

**Payroll** — pay runs (period, status: draft/confirmed/paid), and **payslips** with
full Guyana breakdown: gross earnings, **PAYE (income tax)**, **NIS (employee +
employer)**, allowances, deductions, **net pay**, currency GYD. Plus payment batches,
loans/advances, reimbursements. Money is the hero — tables of figures, tabular nums.

**Attendance** — daily punches (in/out), worked/overtime minutes, day-type
(weekday/Saturday/Sunday/holiday), exceptions review queue. A timeline/calendar view.

**Leave** — per-type balances (available / used / carried-forward days, color per
type), request flow (type, date range, half-days, reason → pending → approved/rejected),
manager approval queue.

**Contracts** — employment contracts: pay frequency (weekly/fortnightly/semi-monthly/
monthly), salary/rate, effective dates, status.

**Assets / Inventory** — assets assigned to employees (assign/return/request);
inventory = stock catalogue + locations + movement ledger (in/out/transfer, pending→
approved) + on-hand balances + low-stock alerts.

**Helpdesk** — requests/tickets: reference, title, requester, status, priority, SLA,
assignee, category; public conversation + internal notes; approval flow.

**Projects** — projects → tasks (Kanban board: todo/in-progress/blocked/in-review/
done), milestones, time entries (draft→submitted→approved), members.

**Performance** — goals/OKRs (progress %), review cycles (360, peer-anonymous),
1-on-1s, recognition points (non-monetary).

**Finance** — labour cost reports (by department, by cost type, trend), budgets vs
actual variance, GL (chart of accounts, journal entries with balanced debit/credit
lines, trial balance).

**CRM** — Lead → Customer → Deal pipeline (Kanban by stage), activities, deal value.

## Cross-cutting UX patterns (the consistency the redesign should nail)

- **List → detail → side-sheet/drawer** is the dominant pattern (browse a table,
  open a row, edit in a slide-over). Make this one consistent, beautiful pattern.
- **Status badges** everywhere (draft/pending/approved/rejected/active/overdue) —
  one consistent badge system with text + color (never color-only, for a11y).
- **Stat tiles** for every module overview — one consistent KPI tile.
- **Approval workflows** (leave, helpdesk, movements, time, journals) — a consistent
  "pending → approve/reject with reason" affordance.
- **Empty / loading / error states** — every list needs all three (this is a big
  current inconsistency to fix).
- **Tables** of dense data (employees, payslips, ledgers) — needs a great, scannable,
  responsive data-table treatment (the single most-used component).
- **Role-scoped & redacted** — sensitive fields (bank details, salaries, internal
  notes) are hidden for non-privileged roles; design the "no access" state too.
- **Multi-tenant** — an org switcher; never show another tenant's data.
- **Mobile** matters — field staff use phones (attendance, leave, payslips, requests).

## Locale / realism

Use **Guyanese names**, **GYD** currency (e.g. "GYD 428,000.00"), **Georgetown/
Linden** locations, real-looking departments (Engineering, People Ops, Field
Services, Finance), fortnightly pay periods, dates in 2026. Never lorem ipsum.

## Rich views & enterprise patterns — and where each belongs

Design these as a coherent set. Items marked **(exists)** re-skin via tokens today;
**(new)** = a net-new component to design then build into `packages/ui` once, reused everywhere.

| Pattern | Where it's appropriate in Heimdallone |
|---|---|
| **Dropdown / action menu** (exists) | row actions on every table, bulk actions, the user menu, org switcher |
| **Modals** — confirm + quick-create (exists: AlertDialog/ConfirmDialog) | destructive confirms, approve-with-reason, quick "new X" without leaving the list |
| **Side-sheet / drawer** (exists: Sheet/EntitySheet) | the primary detail/edit pattern — open a row → edit in a slide-over |
| **Kanban board** (exists) | Projects tasks, CRM deals pipeline, Recruitment pipeline, Helpdesk queue |
| **Calendar — month/week grid (new)** | Roster (shift scheduling), Leave (team calendar / who's out), Attendance |
| **Gantt / timeline (new)** | Projects (tasks + milestones over time), Roster coverage |
| **Wizard / stepper (new)** | Onboarding, Offboarding, a Payroll-run setup flow, new-employee creation, Survey builder, Setup center |
| **View toggle (list ⇄ board ⇄ calendar ⇄ timeline)** | wherever data has multiple natural shapes (Projects, Roster, Leave, CRM) — one consistent toggle |
| **Command palette (⌘K) (new)** | global navigate/search across the ~25 modules + quick actions |
| **Combobox / async select, date-range picker, tooltip, popover, tabs (new)** | filters, forms, contextual help across all modules |

**Enterprise-grade table** (the most-used surface — employees, payslips, ledgers,
movements): sticky header, column sort/resize/show-hide, saved filters & views,
multi-select + bulk actions, density toggle, pagination, inline status, CSV export,
sticky first column on mobile.

**Enterprise hallmarks to weave throughout:** breadcrumbs, keyboard shortcuts,
optimistic updates + toasts, audit/activity trails on records, role-scoped + redacted
views, empty/loading/error states everywhere, responsive (field staff on phones).

## Phase-2 prompt — use AFTER the repo is updated + re-synced

Sequence: (1) explore the look in Claude Design with creative freedom → (2) I update
the repo: new navy tokens/components, consolidated nav/IA, new components (calendar/
Gantt/wizard/⌘K) → (3) I re-run `/design-sync` so the "Heimdallone UI" project holds
the FINISHED system → (4) start a fresh Claude Design chat, paste the domain brief,
then this:

> The Heimdallone UI library has just been updated to the new navy design system —
> use it as the single source of truth (every component + token here is the shipped
> look). Now design the **complete application** on top of it.
>
> **You have full freedom over information architecture** — re-group, consolidate,
> and rename the navigation. Today there are ~25 modules; propose a **consolidated IA**
> that's intuitive for the primary roles (Admin / Manager / Employee). For example
> consider hubs like *People* (employees, org chart, lifecycle, development,
> performance), *Time & Attendance* (attendance, roster, time clocks, geofencing,
> leave), *Pay & Finance* (payroll, contracts, finance, GL), *Operations* (assets,
> inventory, helpdesk, projects), *Growth* (CRM), *Admin* (users, settings, setup,
> countries & tax, compliance, documents) — but design the grouping YOU think is best
> and justify it briefly.
>
> Then design every primary surface end-to-end with the new system and the full
> enterprise pattern set (tables, side-sheets, modals, dropdowns, Kanban, calendar,
> Gantt/timeline, wizards, command palette, approval flows, empty/loading/error):
> the **app shell + new nav**, role-specific **dashboards** (Admin/Manager/Employee),
> Employees, Payroll + payslip, Attendance, Roster, Leave, Projects, CRM, Finance/GL,
> and the self-service employee experience.
>
> Build ONLY with Heimdallone UI components so it stays drop-in. Realistic Guyanese
> data + GYD per the brief. Start with the **new nav + Admin dashboard**, let me
> react, then expand module by module.

When that's done and you like it, hand it back and I'll wire the new IA into the
app shell (`routes/app/route.tsx`) + build any remaining screens, then deploy.
