# Source of Truth

Heimdallone operates with four defined sources of truth. Each has a strict scope. Mixing them is an architectural violation.

---

## 1. Implementation Source — `heimdallone-v2` (this repo)

**Path:** `/home/karetech/Heimdallone/` (local) / `heimdallone-v2` (git remote)

This is the **only** repository that receives code changes. All schema definitions, API routes, UI components, business logic, migration files, and configuration live here.

| Scope | Allowed |
|---|---|
| TypeScript code | Yes — all app and package code |
| Drizzle schema | Yes — Heimdallone-native table names only |
| oRPC procedures | Yes |
| Better Auth config | Yes |
| Tailwind / UI | Yes |
| Documentation | Yes, under `docs/` |
| Django code | No |
| Python files | No |
| Horilla ORM models | No |
| Horilla DB connection strings | No |

**What is NOT allowed from this source:** Nothing is "not allowed" from the implementation source — it is the target. The constraints are about what must NOT be imported from the other sources.

---

## 2. HRMS Reference Source — Horilla HRMS

**Remote:** `https://github.com/horilla/horilla-hr`
**Local clone:** `.references/horilla-hr/` (not committed to git; listed in `.gitignore`)

Horilla is a mature Django-based open-source HRMS. It is used exclusively as a **domain and workflow reference**. Inspect its models, views, forms, and URL configs to understand HRMS product intent — not to copy its implementation.

### What to extract from Horilla

- Domain concepts and entity relationships
- Workflow state machines (leave approval steps, attendance validation, payroll run states)
- Permission patterns (who can approve what, manager-scoped access, reporting hierarchy)
- Edge cases in each module (leave restrictions, attendance exceptions, payroll loan installments)
- Data model field vocabulary (not Django field types — just the business meaning)
- Module boundaries and inter-module dependencies

### What is NOT allowed from Horilla

| Prohibited action |
|---|
| Copying Django model classes into TypeScript |
| Connecting Heimdallone to a Horilla PostgreSQL/MySQL database |
| Vendoring Horilla as a dependency |
| Importing Python code of any kind |
| Using Django URL patterns, view logic, or template code as implementation targets |
| Replicating Django admin configurations |
| Following Django's `apps.py` / `settings.py` conventions in the TypeScript stack |
| Using Horilla's table naming conventions verbatim (use Heimdallone-native names) |

### Modules to reference

```
base/           employee/       attendance/     leave/
payroll/        recruitment/    onboarding/     offboarding/
pms/            asset/          project/        helpdesk/
biometric/      geofencing/     horilla_audit/  horilla_documents/
horilla_automations/            notifications/
```

---

## 3. Feature Archive Source — Old HeimdallOne Repository

**Location:** To be provided by the user (path will be noted here when supplied)
**Status:** Not yet available — user will provide access

The original HeimdallOne repository contains proprietary feature work from the previous product iteration. It is a **feature archive and idea source only**.

### What to extract from old HeimdallOne

- Multi-country payroll engine design
- Multi-tenancy architecture decisions
- Regional tax calculator logic (Caribbean statutory deductions: GY, TT, BB, JM)
- Shared services CRM concepts
- Client/company management workflows
- Accounting export formats (QuickBooks, Xero, Sage)
- Compliance pack structure
- Country-specific payroll export workflows
- Caribbean statutory deduction rates and rules (for reference; verify against current law before implementing)

### What is NOT allowed from old HeimdallOne

| Prohibited action |
|---|
| Porting old code verbatim without explicit user instruction |
| Carrying over any legacy authentication or session system |
| Importing old database schemas directly |
| Using old API contracts that conflict with oRPC patterns |
| Treating old HeimdallOne as production-ready — it is archived, not current |

---

## 4. Design Handoff Source — `design_handoff_heimdallone/`

**Path:** `design_handoff_heimdallone/` (committed to git, present in repo root)

This folder is the **canonical frontend design truth**. It contains static HTML prototypes and associated CSS/JS that define the visual language, component behavior, and interaction patterns for Heimdallone's web frontend.

### Structure

```
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

### How to use

Read HTML files to extract CSS rules, design tokens, spacing, color palette, and component structure. Port faithfully into TanStack Start + Tailwind CSS v4 + shadcn/ui components. Do not redesign.

### What is NOT allowed from design handoff

| Prohibited action |
|---|
| Copying raw JS scripts into React components — port to React state and shadcn primitives |
| Deviating from colors, spacing, or density defined in the HTML prototypes |
| Treating this as a non-binding suggestion — it is canonical |
| Ignoring `INTERACTIONS.md` — all documented interactions must be implemented |

---

## Rule Summary

```
Code changes       -> heimdallone-v2 only
HRMS domain logic  -> read from .references/horilla-hr, implement natively
Proprietary ideas  -> read from old HeimdallOne (when provided), implement natively
UI/UX fidelity     -> read from design_handoff_heimdallone/, port to TanStack + Tailwind
```
