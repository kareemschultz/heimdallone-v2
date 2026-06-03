# CRM Implementation Plan — DRAFTED / QUEUED (Phase 17 candidate)

> **Status: DRAFTED & QUEUED — future-only. NOT an active phase, NOT scheduled, NO code.**
> This is a **spec/research-only synthesis** (Phase 17A: the "A" deliverable). It contains
> **no code, no Drizzle schema, no migrations, no routes**. Field lists below are conceptual
> prose, not table definitions.
>
> **Do NOT implement until the foundations it leans on are stable.** CRM is gated behind
> **Phases 12–16** — it must wait for **People/Payroll (✅), Assets (Phase 12), Helpdesk /
> Requests (Phase 13-ish), and especially Projects / Tasks / Timelines** to exist, because the
> CRM's whole value thesis is the handoff into Projects → staffing → timesheets → payroll cost.
> Per the roadmap directive (implementation-sequence.md): **Phase 12 = Assets → Helpdesk /
> Requests → Projects / Tasks / Timelines → Performance → Finance expansion → CRM.** CRM is
> last in that chain by design.
>
> This document is a **draft synthesis from live-doc research** (June 2026). When Phase 17
> actually begins, every assumption flagged in §9 must be **re-validated against live docs** —
> do not treat this draft as settled fact. Following the project's live-docs rule and the
> "no v1 source of truth" rule, the v1 HeimdallOne is explicitly NOT consulted; competitive
> patterns below are cited from current vendor docs.

> Pattern note: this mirrors the structure of
> [assets-implementation-plan.md](assets-implementation-plan.md) (the house gold-standard).
> Every "A" phase is spec; "B" is DB; "C" is API; "D" onward is UI; the last is QA. Do not jump
> from this plan to code — the schema starts the **17B** checkpoint when CRM is scheduled.

---

## 1. Purpose — why CRM belongs in Heimdallone

Most CRMs stop at *sales tracking*: lead → deal → "won". Heimdallone is an **HRMS + operations
suite**, so its differentiated thesis is the opposite of a standalone CRM:

> **CRM is the front door of work. Heimdallone already owns the back office (people, payroll,
> attendance, assets). A CRM that connects *who we sell to* with *who does the work* and *what
> it costs us to deliver* is uniquely valuable — and is exactly what siloed CRMs can't do.**

The signature flow this module exists to enable is:

```
Lead → Customer → Deal → Project → Staff assignment → Timesheets → Payroll cost → Invoice / report
```

| Hop | What happens | Module that owns it |
|---|---|---|
| **Lead** | An inbound/outbound prospect captured (web form, referral, campaign, manual). Unqualified, may have no formal company record yet. | **CRM** (this module) |
| **Lead → Customer** | When qualified, the lead is *converted* — a `crm_customer` (account/company) + `crm_contact` (person) are created/matched, mirroring Salesforce's "one-step conversion → Account + Contact + Opportunity". | **CRM** |
| **Customer → Deal** | A revenue opportunity against the customer, moving through pipeline stages on a Kanban board. | **CRM** |
| **Deal → Project** | When a deal is **won**, it "hands off": a Project is created/linked to deliver the work. (Odoo: confirmed sales order auto-creates a Project & Task; ERPNext: Opportunity → Quotation → Sales Order → Project.) | **Projects** (future, Phase ~14-15) — CRM only stores the *link point* |
| **Project → Staff assignment** | Employees are assigned to the project to do the work. | **Projects** + **HR Core** (employee_profile) |
| **Staff → Timesheets** | Assigned staff log time against the project. | **Projects / Timesheets** (future) — conceptually adjacent to existing **Attendance** |
| **Timesheets → Payroll cost** | Logged time × employee pay rate = the **labour cost to deliver** this customer's work. Heimdallone *already* has the pay rates (contracts) and the engine (`payroll-engine`). | **Payroll** (✅ exists) |
| **Payroll cost → Invoice / report** | The customer's deal value vs. delivery cost = margin; surfaced as a report (and, when **Finance** exists, an invoice). | **Finance** (future) + CRM/Projects reporting |

The CRM module's job in v1 is the **left half** of that chain (Lead → Customer → Deal) plus
**well-designed link points** for the right half — it must NOT depend on Projects/Finance
existing yet (see §4). The strategic payoff is that Heimdallone can answer a question no
standalone CRM can: *"This won deal was worth X; we assigned these employees; their timesheeted
hours at their pay rates cost us Y; margin = X − Y."*

---

## 2. Competitive research synthesis

Researched June 2026 from current vendor docs. Five categories, each with top contenders and a
**borrow / avoid** verdict.

### 2.1 ERP-integrated CRM (the closest analogues — sales wired to operations)

- **Odoo CRM/Sales** — single `crm.lead` model holds *both* leads and opportunities (a stage
  flag distinguishes them); pipeline is Kanban by stage with a per-deal **win probability %**
  for weighted forecasting; won opportunity → one-click **quotation** → confirmed **sales
  order** → triggers delivery/invoicing, and a service product can **auto-create a Project &
  Task**. ([Odoo CRM 19.0 docs](https://www.odoo.com/documentation/19.0/applications/sales/crm.html),
  [crm.lead model](https://www.dasolo.ai/blog/odoo-data-api-5/odoo-crm-lead-model-guide-169),
  [convert leads](https://www.odoo.com/documentation/19.0/applications/sales/crm/acquire_leads/convert.html))
- **ERPNext** — six core objects: **Lead, Opportunity, Prospect, Customer, Contact,
  Quotation**; flow is **Lead → Opportunity → Quotation → Customer**; multiple Opportunities
  per Lead/Customer; Customer record is the hub for downstream Sales Orders/Deliveries/Invoices.
  ([ERPNext Opportunity docs](https://docs.erpnext.com/docs/user/manual/en/opportunity),
  [Lead vs Contact vs Customer](https://www.zikpro.com/ERPNext-docs/Difference-between-Lead,-Contact,-and-Customer))
- **Zoho CRM / Zoho One** — standard Leads/Contacts/Accounts/Deals; "Zoho One" is the
  operations-suite angle (CRM + projects + HR + books under one tenant). Borrow the *suite*
  framing, not the module sprawl.
- **Microsoft Dynamics 365** — same Lead/Account/Contact/Opportunity backbone as Salesforce;
  heavyweight, enterprise. Confirms the canonical object model but is not a UX role model for
  our SMB audience.

**Borrow:** Odoo's **single lead/opportunity-adjacent model with a stage flag** is tempting but
we'll keep Lead and Deal *separate* (clearer for non-technical users — see §3). Borrow Odoo's
**won-deal → Project auto-handoff** as our signature flow, and ERPNext's explicit **Customer =
operational hub** concept. **Avoid:** Odoo/Dynamics quotation→sales-order→invoice machinery in
v1 — that's Finance's job (defer; keep a quote *placeholder* only).

### 2.2 Open-source CRM (data-model + self-host reference)

- **SuiteCRM** (AGPL, full-featured) — Leads/Contacts/Accounts/Opportunities/Cases/Campaigns;
  every touchpoint logged as **Activities** (Tasks, Calls, Meetings); per-stage **probability**.
- **EspoCRM** — clean sales-pipeline + BPM automation; modern, lean schema.
- **Vtiger** — mature (since 2004); community edition has the core, but **help-desk / marketing
  automation are paywalled** — a caution about scope creep.
- **TwentyCRM** — modern data model: standard **Objects** (People, Companies, Opportunities,
  Tasks, Notes), every object viewable as **table OR Kanban**, two-way relationship attributes;
  TypeScript/Postgres/React stack (closest to ours).
- **YetiForce / OroCRM** — enterprise-grade OSS; OroCRM leans B2B commerce. Heavier than we need.
  ([Open-source CRM 2026 overview](http://erp-software.org/en/crm-software/free/),
  [SuiteCRM activities model](https://crm.org/news/suitecrm-review))

**Borrow:** TwentyCRM's **object → table-or-Kanban duality** and **two-way relationships**;
SuiteCRM's **unified Activities log** (one polymorphic activity entity for calls/meetings/tasks
attached to any record). **Avoid:** SuiteCRM/Vtiger's sprawling module surface and dated UX;
TwentyCRM's fully-custom-objects engine (over-engineering for our fixed HR-ops use case).

### 2.3 Modern SaaS UX (the look-and-feel bar)

- **HubSpot** — lifecycle-stage model: keep trial users as **Contacts**, only open a **Deal**
  on real buying intent (keeps the pipeline clean); customizable deal stages with **stage gates
  / required fields** before a deal can advance.
- **Pipedrive** — **activity-based selling**: visual drag-drop Kanban, every deal tied to a
  *next action*; **deal-rotting** alerts when a deal stalls; multiple pipelines.
- **Salesforce Sales Cloud** — canonical **Lead → (convert) → Account + Contact + Opportunity**
  in one step; Account is the central hub.
- **Attio** — radically flexible Objects/Records/Attributes, **Lists** to model a process,
  automatic relationship intelligence; gold-standard modern UI.
  ([HubSpot pipeline best practices](https://community.hubspot.com/t5/Tips-Tricks-Best-Practices/Best-Practice-for-Setting-Up-Leads-and-Deal-Pipelines-for-SAAS/m-p/1229968),
  [Pipedrive vs HubSpot](https://monday.com/blog/crm-and-sales/pipedrive-vs-hubspot/),
  [Salesforce lead conversion](https://www.phoneiq.co/blog/understanding-the-difference-between-a-lead-account-contact-and-opportunity-in-salesforce-2025),
  [Attio data model](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views))

**Borrow:** Pipedrive's **next-action / deal-rotting** nudge and drag-drop Kanban (reuse our
existing `KanbanBoard` from recruitment); HubSpot's **stage gates** (required fields before
advance) and **don't-make-a-deal-too-early** discipline; Salesforce's **one-step lead
conversion**. **Avoid:** Attio's infinite flexibility (great for a horizontal CRM, wrong for a
focused HR-ops module); HubSpot's marketing-hub bloat.

### 2.4 SMB / simple-pipeline (our actual audience)

Pipedrive, HubSpot Starter, Zoho Bigin, TwentyCRM. The lesson across all four: **a non-technical
SMB user wants a Kanban they can drag, a follow-up reminder, and a contact list — not 40
objects.** This aligns with our existing payroll-UX principle (defaults + dropdowns + plain
language). **Borrow** the minimal-surface ethos; this directly drives the lean MVP in §3.

### 2.5 Operations-connected (the thesis validators)

Odoo, ERPNext, Zoho One, Dynamics 365 all prove the **CRM → operations** loop is real and
valuable: Odoo's *CRM opportunity → project → timesheet → invoice* chain and **billing by
employee rate** is almost exactly our target flow.
([Odoo timesheet → SO → project → invoice](https://www.odoo.com/documentation/19.0/applications/sales/sales/invoicing/time_materials.html),
[Odoo timesheet billing by employee rate](https://www.odoo.com/app/timesheet))
**Borrow:** the *shape* of that chain as our §4 integration design. **Avoid:** building it
end-to-end in v1 — we own the people/payroll half already; the projects/finance half is future.

### 2.6 Horilla / OpenHRMS — only where HR ops intersect CRM

Horilla/OpenHRMS are HRMS, not CRM, so they're consulted **only** at the intersection: client-
service ops, staffing a client engagement, employee assignment, document attachments, approval
flows, and service requests. The takeaway: **the "Customer" and "Project" in our CRM should feel
like first-class operational entities staffed by employees** — i.e. treat a won deal like an
internal staffing/onboarding event, reusing the approval/assignment/document patterns we already
built for recruitment/onboarding/offboarding, rather than inventing CRM-only mechanics.

### 2.7 Comparison table

| System | Core objects | Lead→Customer | Pipeline UX | Activity model | ERP/ops handoff | Borrow | Avoid |
|---|---|---|---|---|---|---|---|
| **Odoo** | crm.lead (lead+oppy), partner, sale.order | 1-click convert | Kanban + win % | activities/log | **SO→Project+Task, bill by employee rate** | won→Project handoff, employee-rate costing | quote/SO/invoice machinery in v1 |
| **ERPNext** | Lead, Opportunity, Customer, Contact, Quotation | Lead→Oppy→Quote→Customer | list + funnel | activities | Customer = ops hub → SO/Delivery/Invoice | Customer-as-hub | multi-step quote chain |
| **Zoho One** | Leads/Contacts/Accounts/Deals | convert | Kanban | tasks/calls | suite (CRM+Projects+HR) | suite framing | module sprawl |
| **Dynamics 365** | Lead/Account/Contact/Opportunity | qualify→convert | pipeline | activities | enterprise ERP | canonical model | enterprise weight |
| **SuiteCRM** | Lead/Contact/Account/Opportunity/Case/Campaign | convert | stages + probability | **unified Activities (call/meeting/task)** | — | one polymorphic Activity entity | dated UX, sprawl |
| **EspoCRM** | Lead/Contact/Account/Opportunity | convert | pipeline + BPM | activities | — | lean schema | — |
| **Vtiger** | Lead/Contact/Org/Opportunity | convert | Kanban | activities | paid only | — | paywalled helpdesk/automation |
| **TwentyCRM** | People/Companies/Opportunities/Tasks/Notes | relationship link | **table OR Kanban per object** | Tasks/Notes/Activities | — | table↔Kanban duality, 2-way relations | full custom-object engine |
| **HubSpot** | Contacts/Companies/Deals/Tickets | lifecycle stage | Kanban + **stage gates** | notes/tasks/calls/emails/meetings | — | stage gates, defer-the-deal discipline | marketing-hub bloat |
| **Pipedrive** | Leads/Deals/Persons/Orgs | convert | **drag Kanban + deal-rotting** | **activity-based selling** | projects add-on | next-action nudge, deal-rotting | — |
| **Salesforce** | Lead/Account/Contact/Opportunity | **1-step → Acct+Contact+Oppy** | pipeline | activities | enterprise | one-step conversion semantics | enterprise weight |
| **Attio** | Objects/Records/Attributes + Lists | relationship | table/Kanban, very flexible | activities | — | modern UI, relationship intelligence | infinite flexibility |

---

## 3. Entity evaluation — MVP vs later

Following the house conventions: cuid2 ids, `organizationId` (tenant scope, indexed),
`createdAt`/`updatedAt`/`deletedAt` (soft-delete), money as `numeric(12,2)` stored as string
(redacted for non-finance roles), dates as `date`/`timestamp`, enums as pg enums, **denormalised
display fields in list endpoints** (the recruitment 9I lesson), and **partial-unique invariants**
where a single active row must be enforced.

Each candidate is evaluated and assigned **MVP** or **Later**. The guiding principle (from §2.4 +
the payroll-UX rule): **ship the smallest pipeline a non-technical SMB user can run, with clean
link points for the operations half — not every object an enterprise CRM has.**

### 3.1 The MVP minimum set (explicit decision)

**MVP = 8 tables:** `crm_customer`, `crm_contact`, `crm_lead`, `crm_deal`, `crm_pipeline_stage`,
`crm_activity`, `crm_note`, `crm_customer_project_link`. Plus reuse of the **existing audit
event** infrastructure (no CRM-specific audit table) and **existing source/owner concepts folded
into columns** rather than separate tables.

Justification: this is exactly the **Lead → Customer → Deal** spine plus the **activity/follow-up
loop** (the single most-used CRM feature per §2.3-2.4) plus the **one link point to Projects**
(the thesis). Everything else (campaigns, multi-pipeline config, quotes, tasks-as-separate-from-
activities, documents-as-first-class) is deferred until proven needed — mirroring the Assets v1
"keep lotNumber a plain text field, no separate table" discipline.

### 3.2 MVP entities (conceptual fields)

**`crm_customer`** (the operational hub — ERPNext's "Customer", Salesforce's "Account")
- id (cuid2, pk); organizationId (FK, indexed)
- name (text, required) — company/account name
- type (enum `crm_customer_type`: `company` | `individual`; default `company`)
- status (enum `crm_customer_status`: `prospect` | `active` | `inactive`; default `prospect`)
- website (text, nullable; **scheme-validate before any href** — the safe-href lesson)
- phone / email (text, nullable)
- industry (text, nullable)
- ownerEmployeeId (FK employee_profile, nullable) — the account owner (sales rep)
- addressLine / city / country (text, nullable)
- sourceKey (enum `crm_source` inline column, see deferred-table note) — how acquired
- notes summary / denormalised openDealCount + openDealValue (cache for list view)
- createdAt / updatedAt / deletedAt
- Constraint: partial unique `(organizationId, lower(name))` where `deletedAt IS NULL`? — **soft**
  uniqueness only (warn-on-duplicate, don't hard-block; real companies legitimately share names).
  Decide at 17B (flagged §9).

**`crm_contact`** (a person at a customer — B2B: many contacts per customer)
- id; organizationId (FK, indexed)
- customerId (FK crm_customer, nullable — a contact may exist before being linked, indexed)
- firstName / lastName (text); email (text, nullable, lowercased+trimmed — recruitment lesson)
- phone / jobTitle (text, nullable)
- isPrimary (boolean, default false) — the primary contact for the customer
- ownerEmployeeId (FK employee_profile, nullable)
- createdAt / updatedAt / deletedAt
- Constraint: partial unique `(organizationId, lower(email))` where `email IS NOT NULL AND
  deletedAt IS NULL` (mirror recruitment candidate email uniqueness).

**`crm_lead`** (unqualified inbound/outbound — kept *separate* from deal, see §3.4 rationale)
- id; organizationId (FK, indexed)
- name (text) — person or company name as captured (may pre-date a real customer record)
- contactEmail / contactPhone / companyName (text, nullable) — raw capture fields
- status (enum `crm_lead_status`: `new` | `contacted` | `qualified` | `unqualified` |
  `converted`; default `new`)
- sourceKey (enum `crm_source` inline column) — web_form | referral | campaign | manual |
  import | event | other
- ownerEmployeeId (FK employee_profile, nullable) — assigned rep
- estimatedValue (numeric(12,2), nullable; **finance-redacted**)
- convertedCustomerId / convertedContactId / convertedDealId (FK, nullable) — set on conversion
- convertedAt (timestamp, nullable); convertedByUserId (FK user, nullable)
- description (text, nullable)
- createdAt / updatedAt / deletedAt
- Constraint: a lead with `status = converted` is read-only (re-conversion blocked, like
  recruitment terminal states).

**`crm_deal`** (the opportunity — the pipeline card)
- id; organizationId (FK, indexed)
- customerId (FK crm_customer, **required** — a deal always belongs to a customer)
- primaryContactId (FK crm_contact, nullable)
- title (text, required); stageId (FK crm_pipeline_stage, indexed)
- value (numeric(12,2), nullable; **finance-redacted for non-finance roles**)
- currency (text; resolve from org default — the Assets currency open-question pattern)
- probabilityPct (integer 0–100, nullable; per-stage default, Odoo/SuiteCRM pattern)
- expectedCloseDate (date, nullable)
- status (enum `crm_deal_status`: `open` | `won` | `lost`; default `open`)
- lostReason (text, nullable; required when status→lost — stage-gate pattern)
- ownerEmployeeId (FK employee_profile, nullable) — deal owner
- lastActivityAt (timestamp, nullable; denormalised — powers **deal-rotting** "stalled" badge)
- handedOffProjectLinkId (FK crm_customer_project_link, nullable) — set when won→handoff
- createdAt / updatedAt / deletedAt
- Indexes: `(organizationId, stageId)` for the Kanban; `(organizationId, ownerEmployeeId)` for
  "my deals"; `(organizationId, status)`.
- Denormalised list fields (server-side join, 9I lesson): customer name, stage name, owner name.

**`crm_pipeline_stage`** (ordered Kanban columns; **single default pipeline in MVP**)
- id; organizationId (FK, indexed)
- name (text, required); position (integer — column order)
- defaultProbabilityPct (integer 0–100, nullable)
- isWon / isLost (boolean) — terminal-stage markers (won stage triggers handoff prompt)
- createdAt / updatedAt / deletedAt
- Constraint: partial unique `(organizationId, lower(name))` where `deletedAt IS NULL`.
- **MVP decision:** ONE pipeline per org (no `crm_pipeline` parent table). Multi-pipeline is
  deferred (see 3.3). Seed a sensible default: New → Qualified → Proposal → Negotiation → Won /
  Lost.

**`crm_activity`** (unified touchpoint log — SuiteCRM's polymorphic Activities, the MVP "task"
too — see 3.4)
- id; organizationId (FK, indexed)
- type (enum `crm_activity_type`: `call` | `meeting` | `email` | `task` | `follow_up` | `note`?)
  — `note` lives in its own table (below); activity covers actionable touchpoints
- subject (text, required); body (text, nullable)
- dueAt (timestamp, nullable) — for follow-ups/tasks (the Pipedrive next-action engine)
- completedAt (timestamp, nullable; null = open/pending)
- relatedType (enum: `lead` | `customer` | `contact` | `deal`) + relatedId (text) —
  **polymorphic link** (one of the four). Index `(organizationId, relatedType, relatedId)`.
- assignedToEmployeeId (FK employee_profile, nullable)
- createdByUserId (FK user)
- createdAt / updatedAt / deletedAt
- This single table powers the **activity feed/timeline**, **follow-up reminders**, and
  **deal-rotting** (max(completedAt/createdAt) per deal → `crm_deal.lastActivityAt`).

**`crm_note`** (free-text notes; separated from activity because of the **privacy** requirement —
private sales notes vs finance-visible deal data, §7)
- id; organizationId (FK, indexed)
- relatedType + relatedId (polymorphic, same shape as activity)
- body (text, required)
- visibility (enum `crm_note_visibility`: `team` | `private`; default `team`) — **private notes
  are never shown to finance/auditor** (the redaction surface)
- authorUserId (FK user)
- createdAt / updatedAt / deletedAt

**`crm_customer_project_link`** (the **thesis link point** — survives even though Projects
doesn't exist yet)
- id; organizationId (FK, indexed)
- customerId (FK crm_customer, required)
- dealId (FK crm_deal, nullable — the deal that triggered the handoff)
- projectId (text, **nullable, NOT a FK yet**) — a soft reference reserved for the future
  Projects module; nullable so the row can exist as a "handoff intent" before Projects is built
- handoffStatus (enum `crm_handoff_status`: `intended` | `linked` | `delivered` | `cancelled`)
- handoffNote (text, nullable); handedOffByUserId (FK user); handedOffAt (timestamp)
- createdAt / updatedAt / deletedAt
- **Design intent:** in v1 (no Projects module) this records the *intent to deliver* a won deal
  and surfaces it on the customer/deal detail as "Ready to staff" — when Projects ships, it
  back-fills `projectId` and the right-half chain lights up. See §4.

### 3.3 Deferred entities (NOT in MVP) and why

| Entity | Verdict | Rationale |
|---|---|---|
| **`crm_pipeline`** (multi-pipeline parent) | **Later** | One default pipeline covers SMB; multi-pipeline is a config feature most users never touch (HubSpot/Pipedrive sell it as advanced). Add when a tenant demonstrably needs separate sales processes. |
| **`crm_task`** (separate from activity) | **Later → folded** | MVP uses `crm_activity` with `type='task'`/`'follow_up'` + `dueAt`/`completedAt` instead of a dedicated table (TwentyCRM keeps Tasks separate; we consolidate for simplicity, like Assets folding lot into a column). Split out only if tasks need their own lifecycle. |
| **`crm_document`** (first-class) | **Later** | Same stance as Assets/onboarding: **no real file upload yet** across Heimdallone. Reserve a nullable `documentUrl` concept on notes/activities if needed; a first-class document entity waits for a platform-wide file-storage decision. |
| **`crm_source`** (table) | **Later → enum** | MVP keeps `sourceKey` as a **pg enum column** on lead/customer (web_form/referral/campaign/manual/import/event/other) — the Assets `lotNumber`-as-text precedent. Promote to a managed table only when orgs need custom sources + source ROI reporting. |
| **`crm_campaign`** | **Later** | Campaign/marketing attribution is a whole sub-domain (Vtiger paywalls it). Out of scope until a marketing phase; `sourceKey='campaign'` is the cheap stand-in. |
| **`crm_quote` / proposal** | **Later (placeholder only)** | Quotations belong to **Finance** (Odoo/ERPNext put them in Sales/Accounting). MVP reserves a nullable `quoteRef` text concept on the deal at most; no quote table, no line items, no PDF. Real quoting waits for Finance. |
| **`crm_owner_assignment`** (table) | **Later → column** | MVP uses an `ownerEmployeeId` column on lead/customer/deal (the simple, common case: one owner). A separate assignment/sharing table (multiple owners, team sharing) is deferred — mirrors how we model a single denormalised owner elsewhere. |
| **`crm_audit_event`** (CRM-specific) | **Rejected — reuse existing** | Heimdallone already has cross-cutting audit (`createAuditEvent`, used by every module since HR Core). CRM mutations call it; **no new audit table.** |

### 3.4 Two design rationales worth recording

1. **Lead and Deal are separate tables (we did NOT copy Odoo's single `crm.lead`).** Odoo
   merges lead+opportunity into one model with a stage flag; that's elegant for power users but
   confusing for the non-technical SMB audience (the payroll-UX principle). Keeping a `crm_lead`
   (unqualified, raw capture) distinct from a `crm_deal` (a real opportunity against a real
   customer) gives clearer mental models and a clean **conversion** event (Salesforce's
   one-step Lead → Customer + Contact + Deal). The cost (a conversion procedure) is small.
2. **Activities are one polymorphic table, notes are another.** SuiteCRM's unified Activities
   log is the right call for the feed; we split *notes* out only because notes carry a
   **privacy/visibility** dimension (private sales notes) that activities don't, and the
   redaction logic is cleaner on a dedicated table (§7).

---

## 4. Heimdallone integration design

CRM v1 must **not depend on Projects or Finance existing** — those are future modules. It
designs the **link points** so the right half of the chain can be wired in later without a
schema rewrite.

### 4.1 `crm_customer` ↔ future Projects
- A future Project will carry a nullable `customerId` (or the link lives in
  `crm_customer_project_link`). In v1, the customer detail page shows a **"Projects" section**
  that is empty/"coming soon" until the Projects module ships; the data shape
  (`crm_customer_project_link`) already exists, so Projects only has to populate it.

### 4.2 Deal → Project handoff (the "won" moment)
- When a deal moves to a **won** stage, the UI prompts: *"This deal is won — ready to deliver?"*
  and offers **"Create a project handoff"**, which writes a `crm_customer_project_link`
  (`handoffStatus='intended'`, `dealId`, `customerId`) and stamps `crm_deal.handedOffProjectLinkId`.
- In v1 (no Projects module) this is a **handoff record + a visible "Ready to staff" state** on
  the customer — *not* an actual project. This mirrors the Odoo "won → project" flow but stops at
  the boundary of what exists. (Same discipline as offboarding's "read-only link, no auto
  write-back in v1".)
- When **Projects** ships, "Create a project handoff" creates a real Project and back-fills
  `projectId` + `handoffStatus='linked'`.

### 4.3 Project staff assignment → timesheets → payroll cost → invoice/report
Designed now, built later (in Projects/Finance phases):
1. **Staff assignment** — Projects assigns `employee_profile` rows to a project (reusing HR Core
   employees; conceptually like recruitment/onboarding assignment).
2. **Timesheets** — assigned staff log time against the project. Conceptually adjacent to the
   existing **Attendance** module; a future Timesheets feature (Projects phase) provides
   hours-per-employee-per-project.
3. **Payroll cost** — hours × the employee's pay rate (Heimdallone **already** has rates via
   Contracts and the **`payroll-engine`** pure-TS cost calc). A future "delivery cost" report
   joins project timesheets → contract rate → cost. **No new costing engine needed** — reuse
   `payroll-engine` primitives. Money stays finance-redacted.
4. **Invoice / report** — deal value (CRM) vs. delivery cost (Projects+Payroll) = **margin**,
   surfaced as a report in v-future; true invoicing waits for **Finance**.

**v1 deliverable for this section:** the **link points and the customer "delivery" section
scaffold** only. The doc explicitly forbids depending on Projects/Finance — design the seams,
build none of the right-half plumbing.

### 4.4 Reuse, don't reinvent
- **Employees** = existing `employee_profile` (owners, assignees) — never a CRM-local "user".
- **Audit** = existing `createAuditEvent`.
- **RBAC** = Better Auth org ACL (new resources/roles, §5).
- **Money redaction** = the existing finance-redaction pattern (HR Core bank, recruitment offer,
  Assets purchaseCost).
- **Kanban** = the existing recruitment `KanbanBoard` primitive (§6).

---

## 5. RBAC model

Two-layer authorization, identical in spirit to recruitment/offboarding/assets:
**(1) tenant scope** — every FK verified on `organizationId` + `deletedAt IS NULL` via per-entity
`verify*` helpers (the recruitment "six verify helpers eliminate IDOR by construction" pattern);
**(2) lateral/owner scope** — a `sales_rep` sees only leads/deals they **own** (or are assigned);
a `manager` sees their **team's** pipeline (reuse `getManagerDirectReportIds` /
`assertVisibleToCaller`). This is the IDOR-class risk for the module — design it in from the
start (the 10C lesson).

### 5.1 Roles

| Role | CRM scope |
|---|---|
| **owner / admin** | Everything (all CRM). |
| **sales_admin** *(new)* | CRM settings: pipeline stages, sources, defaults; all leads/customers/deals org-wide. |
| **sales_rep** *(new)* | Leads/deals **they own or are assigned**; create/edit their own; cannot manage settings. |
| **manager** | Read **team** pipeline (direct reports' leads/deals); no settings. |
| **finance** | Read customers/accounts + deals **for invoicing** (value, customer, stage) — **NOT private sales notes** unless explicitly allowed; sees money (deal value). |
| **project_manager** *(new)* | Customers + **deals handed off to projects** (the handoff records); read customer/deal context for delivery; no pipeline edit. |
| **auditor** | Read-only across CRM; **no private notes**; no mutations (action buttons hidden, API 403). |
| **employee** | **No CRM access** unless explicitly assigned to a deal/activity (then narrow read of that record only). |

> **New roles** `sales_admin`, `sales_rep`, `project_manager` must be **added to the Better Auth
> ACL** (`packages/auth/src/permissions.ts` statement + per-role grants) — and the
> `audit:permissions` script must stay green. Lesson #70/#83: a new `authorizedProcedure(resource,
> action)` is a silent 403 unless the exact action is in the statement AND granted; grep-audit
> after wiring.

### 5.2 Permissions resource/action matrix (target — read live `permissions.ts` at 17C)

New AC resources: `crm_lead`, `crm_customer`, `crm_contact`, `crm_deal`, `crm_pipeline`,
`crm_activity`, `crm_note`. Actions per resource roughly:
`create / read / update / archive / convert (lead) / advance_stage (deal) / handoff (deal) /
manage (settings) / read_private (note)`.

| capability | owner/admin | sales_admin | sales_rep | manager | finance | project_manager | auditor | employee |
|---|---|---|---|---|---|---|---|---|
| view leads/deals (all) | ✅ | ✅ | own only¹ | team only¹ | ✅ (deal+customer) | handed-off only | ✅ (no private notes) | assigned only |
| create/edit lead/deal/customer/contact | ✅ | ✅ | own | ❌ | ❌ | ❌ | ❌ | ❌ |
| convert lead | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ❌ |
| advance deal stage / win-loss | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ❌ |
| create project handoff | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ✅ | ❌ | ❌ |
| manage pipeline stages / sources / settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| see deal **value** (money) | ✅ | ✅ | ✅ (own) | ✅ (team) | ✅ | ✅ | ✅ | ❌ |
| read **private** notes | ✅ | ✅ | author/owner | ❌² | ❌ | ❌ | ❌ | ❌ |
| log activity / follow-up | ✅ | ✅ | ✅ (own) | ✅ (team) | ❌ | ✅ (handed-off) | ❌ | assigned only |

¹ lateral scope (owner/team). ² manager read of a report's private note is a deferred affordance
(mirrors offboarding's deferred manager-approve). RBAC helpers `canManageCrm` / `canViewCrm` /
`canManageCrmSettings` / `canSeeCrmMoney` / `canReadPrivateCrmNotes` to be **mirrored byte-for-byte
in both** `apps/web/src/lib/rbac.ts` and `packages/api/src/utils/role-helpers.ts`.

---

## 6. UX plan

Follows house standards: **module-tabs pattern** (the 8J.1 product standard), **folder routes
from the start** (no flat route-shadow — the recurring lesson), **graceful 403/404 no-access
states** + `retry:false`, **plain-language labels, never raw enums** as primary text,
**denormalised list fields**, **EmptyState** primitive, **safe-href** validation for customer
websites.

### 6.1 Routes (under `/app/crm/*`)

| Route | Purpose |
|---|---|
| `/app/crm` | CRM dashboard (overview) |
| `/app/crm/leads` | Leads list (filters: status / source / owner / search) |
| `/app/crm/leads/$id` | Lead detail + **Convert** action |
| `/app/crm/customers` | Customers/accounts list |
| `/app/crm/customers/$id` | Customer detail (contacts, deals, activity, **delivery/handoff section**) |
| `/app/crm/contacts` | Contacts list |
| `/app/crm/contacts/$id` | Contact detail |
| `/app/crm/deals` | **Deals pipeline Kanban** (the centerpiece) |
| `/app/crm/deals/$id` | Deal detail (timeline, notes, handoff) |
| `/app/crm/activities` | Activities / follow-ups (my open follow-ups, optional calendar view) |
| `/app/crm/settings` | Pipeline stages / sources / defaults (sales_admin) |

`CrmTabs` strip: Dashboard / Leads / Customers / Contacts / Deals / Activities / Settings,
gated by `canViewCrm` (employees with no access fall through to a clean no-access state).

### 6.2 Screen notes
- **Dashboard** — stat tiles (open deals, open value [redacted], leads to follow up, deals won
  this month, stalled deals [deal-rotting]); "What needs attention" panel (overdue follow-ups,
  stalled deals, unassigned leads) — the same attention-panel pattern as offboarding/biometrics.
- **Leads list/detail** — DataTable + status/source/owner filters; detail shows capture fields,
  activity timeline, and a prominent **Convert** button (→ creates/matches customer + contact +
  optional deal in one transactional procedure; Salesforce one-step semantics).
- **Customers/accounts list/detail** — list with denormalised open-deal count/value; detail tabs:
  Contacts / Deals / Activity timeline / Notes / **Delivery (project handoffs)** [scaffold].
- **Contacts** — list + detail; primary-contact badge; linked customer.
- **Deals pipeline Kanban** — **reuse the existing recruitment `KanbanBoard`** (built Phase 9D;
  drag a card between stages → `advance_stage`); cards show title, customer, value [redacted],
  owner, **stalled badge** when `lastActivityAt` is old (Pipedrive deal-rotting); won column →
  **handoff prompt**; lost → required `lostReason` (stage gate, HubSpot pattern).
- **Activities / follow-ups** — "my open follow-ups" list + optional calendar; complete/snooze;
  this is the daily-driver screen.
- **Timeline / activity feed** — per-record chronological feed (activities + notes), reused on
  lead/customer/contact/deal detail.
- **Notes / documents** — team vs **private** note toggle (visibility); documents deferred
  (honest "file upload coming later", the cross-module stance).
- **Saved filters** — saved-view tabs on the leads/deals lists (uses the planned `SavedViewTabs`
  primitive when available).
- **Import / export** — CSV import (leads/customers/contacts) + export; honest "file upload
  coming later" if platform file handling isn't ready (Assets-style deferral). 17G.
- **Empty states** — every list uses `EmptyState` with a clear primary action ("Add your first
  lead").
- **Mobile quick-follow-up** — a mobile-friendly "log a follow-up / mark done" surface (echoes
  the mobile-first geofence check-in ethos), so reps can update on the go.

---

## 7. Privacy & security

- **Private sales notes vs finance-visible deal data** — `crm_note.visibility='private'` rows are
  stripped at the API boundary for finance/auditor/manager (the redaction-at-boundary pattern,
  lesson #65); finance sees deal **value + customer + stage** (for invoicing) but never private
  notes. A `redactCrmNote(row, role)` / `redactDeal(row, role)` helper applied at every return site.
- **Money** — `crm_deal.value`, `crm_lead.estimatedValue` are finance data: nulled for roles
  without `canSeeCrmMoney` (mirror Assets `purchaseCost`, recruitment offer comp).
- **Tenant isolation** — every FK verified via `verify*` helpers on `organizationId` +
  `deletedAt IS NULL` (the "six verify helpers → zero IDOR" construction); lateral owner/team
  scope on top for sales_rep/manager (the IDOR-by-enumeration class, lesson #100).
- **Document handling** — no real file upload in v1 (cross-module stance); when added, no public
  buckets, signed/short-lived access, no secrets in URLs.
- **No secrets** — no API keys/tokens for any future email/marketing integration are stored in
  CRM v1; if integrations come, secrets live hashed/ref'd and are **never returned** (the
  biometric `apiKeyHash` precedent).
- **Audit events** — every mutation (create/convert/advance-stage/win-loss/handoff/note) writes
  `createAuditEvent`; `audit:permissions` stays green.
- **Safe href** — customer `website`/contact links scheme-validated (`safeHttpUrl`) before
  rendering (the stored-XSS lesson).

---

## 8. Implementation sequence (when Phase 17 is scheduled)

Module checkpoints (A→H), each gated by the house quality bar (check-types, build, web tsc
baseline, ultracite unchanged, `audit:permissions` green) with docs/memory updated between every
checkpoint (the phase pattern).

- **17A — Spec (this doc).** Research synthesis; no code. ✅ when reviewed.
- **17B — DB schema + seed.** 8 MVP tables + enums (`crm_customer_type/status`, `crm_lead_status`,
  `crm_deal_status`, `crm_note_visibility`, `crm_activity_type`, `crm_source`, `crm_handoff_status`)
  + 1 Drizzle migration; partial-unique invariants (contact email, stage name); seed the default
  pipeline + a demo dataset for the Atlas Shipping tenant exercising every status/badge.
- **17C — oRPC API.** `crm` router (leads / customers / contacts / deals / stages / activities /
  notes / handoff) with the **two-layer authz**, money + private-note redaction, transactional
  **lead conversion** and **won→handoff**, `verify*` helpers, audit on every mutation; new AC
  resources + roles in `permissions.ts`; helpers mirrored in `rbac.ts`; verify script.
- **17D — Dashboard + leads/customers UI.** `CrmTabs`, dashboard tiles + attention panel, leads
  list/detail + Convert, customers list/detail. Folder routes, graceful no-access, EmptyState.
- **17E — Deals pipeline Kanban + activities.** Reuse `KanbanBoard`; drag→advance-stage; deal
  detail; win/loss (lostReason gate); deal-rotting badge; activities/follow-ups screen + timeline.
- **17F — Customer detail + project-handoff planning.** Customer delivery section scaffold;
  won-deal handoff record + "Ready to staff" state; the `crm_customer_project_link` seam (no
  Projects dependency).
- **17G — Import/export + reports.** CSV import/export (honest deferral if platform file handling
  isn't ready); pipeline/source/owner reports; export hardening (CSV-injection `csvCell()` — the
  payroll lesson).
- **17H — QA / RBAC / security / browser pass.** Parallel read-only audits (security/RBAC,
  UX/a11y, integration/correctness) then sequential fixes for confirmed defects only; full RBAC
  matrix browser-verified across all roles (incl. sales_rep owner-scope, manager team-scope,
  finance money-but-no-private-notes, auditor read-only, employee no-access); close Phase 17.

---

## 9. Open questions & decisions for kickoff (re-validate at 17B/17C)

This document is a **draft synthesis**; the following assumptions MUST be confirmed against
**live docs** and the live codebase when Phase 17 actually starts:

1. **Foundations exist?** CRM is gated behind Projects/Finance for the right-half thesis. Confirm
   Projects (and a Timesheets concept) actually exist before relying on §4.2-4.3; if Projects is
   still absent, 17F ships only the *scaffold* (as designed) — do not over-build.
2. **Lead vs Deal split** — confirmed recommendation is **separate tables** (§3.4). Re-validate
   against the current Odoo/Salesforce model at kickoff; if the team prefers Odoo's unified model,
   that's a 17B decision.
3. **Single vs multi-pipeline** — MVP = one default pipeline (no `crm_pipeline` table). Confirm no
   tenant needs multiple pipelines at launch.
4. **Customer name uniqueness** — soft (warn) vs hard (partial-unique) — recommend **soft**;
   decide at 17B (real companies share names).
5. **`crm_source` enum vs table** — MVP = enum column. Confirm no need for custom sources + source
   ROI reporting at launch.
6. **Quote/proposal ownership** — confirmed **deferred to Finance**; verify Finance is the home for
   quoting before reserving even a `quoteRef` field.
7. **New roles** — `sales_admin`/`sales_rep`/`project_manager` must be added to the Better Auth ACL.
   Confirm naming + grants against the live `permissions.ts` and the role-normalization helpers
   (Phase 8J.2). Run the grep-audit (#70) after wiring.
8. **Private-note visibility** — confirm finance/manager/auditor must NOT see `private` notes, and
   whether a manager may read a report's private notes (recommend: no, defer).
9. **Activity vs Task consolidation** — MVP folds tasks into `crm_activity`. Validate this still
   feels right for users at kickoff; split only if tasks need a distinct lifecycle.
10. **File/document handling** — depends on a platform-wide file-storage decision (still deferred
    across Heimdallone as of June 2026). Confirm status before promising import/export or documents.
11. **Money/currency** — single org-default currency (the Assets/contracts precedent) vs per-deal
    currency. Recommend single; add per-deal only if multi-currency sales appear.
12. **Live-doc re-research** — the §2 citations are June 2026. Re-fetch Odoo/ERPNext/Twenty/
    SuiteCRM/HubSpot/Salesforce/Attio docs at kickoff (the no-v1-source + live-docs rules) — vendor
    data models change.

---

## 10. Definition of done (Phase 17, when scheduled)
- **17A:** this spec reviewed; MVP entity set agreed; open questions logged.
- **17B:** 8 tables + enums migrated; partial-unique invariants in place; default pipeline + demo
  seed; gates green.
- **17C:** `crm` router with two-layer authz, money + private-note redaction, transactional
  conversion + handoff, helpers mirrored, new roles/resources in ACL; `audit:permissions` green;
  verify script green.
- **17D-17G:** dashboard + leads/customers, deals Kanban + activities, customer detail +
  handoff scaffold, import/export + reports — all folder-routed, graceful no-access, plain-language
  labels, browser-verified.
- **17H:** module-wide QA/RBAC/security/browser pass across every role; lint baseline unchanged.
- Docs + memory updated between every checkpoint (the phase pattern).
