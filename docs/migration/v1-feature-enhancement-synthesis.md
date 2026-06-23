# v1 Feature Enhancement Synthesis — what to bring into v2, enhanced

**Date:** 2026-06-23 · **Audience:** product owner + build planning · **Status:** decision-ready

The owner asked: *"what features from v1 can we bring into v2, but more enhanced and combined with
our [v2] stuff."* This doc answers that. The hard constraint is the standing **SaaS Architecture
Rule**: *Netsurf proves the need; it does not define the product.* Foreign Links proves another
workflow; it does not define the limit. So every v1 feature below is read for its **intent** — the
real operational need it served — and then re-specified as a **tenant-configurable, reusable v2
capability** that composes with the modules v2 already ships. We capture intent, not v1's quirks: v1
had real bugs (the payroll UTC reversals, the flat-monthly personal allowance, no per-date roster
home) and those are explicitly *not* ported. Where v2 already owns a capability, the recommendation
is to *compose with it*, never to rebuild it.

Sources: `phase-21x-v1-v2-feature-parity.md` (primary), `dry-run-report.md` (101 v1 tables
classified), `phase-21x-remaining-roadmap.md`, `PHASE-21-STATUS-REPORT.md`. v1 tables with **0
rows** (assets, goals, training, etc.) are *schema-only intent* in v1 — the feature existed as a
table but was never used operationally; those are weighted lower because there is no live workflow to
preserve, only a design hint.

---

## 1. Prioritized enhancement table

Legend — v2 status: **HAVE** (shipped, reuse it) · **PARTIAL** (primitive exists, needs a feature
layer) · **MISSING** (no v2 home). Effort: **S** ≤ a few days · **M** ~1–2 weeks · **L** multi-week.
Priority: **P1** build next · **P2** soon after · **P3** opportunistic / when a tenant needs it.

| # | v1 feature / area | What v1 did (the intent) | v1 bug to NOT replicate | v2 status | Recommended ENHANCED v2 capability (generalized, tenant-configurable) | Composes with | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | **Announcements / company-wide comms** (`announcements`, `*_acknowledgements`) | Push a notice to all/segment of staff; track who acknowledged | Acks were per-row only, no segmentation | PARTIAL (notifications inbox + `utils/notifications.ts` emit) | **Announcements** authoring (rich body, audience = org / department / role / location, schedule, require-acknowledgement, read receipts) that *fans out via the existing notification emit helper* — not a new delivery system | `notifications`, HR Core (dept/location), RBAC scopes | M | **P1** |
| 2 | **Surveys / staff feedback** (`surveys`, `survey_questions`, `*_responses`, `survey_anonymous_tokens`, `staff_feedback`) | Run staff surveys; anonymous-token responses | — (intent is sound) | **HAVE** (Surveys module shipped, migration 0032, `survey` AC, anonymity enforced server-side) | **No rebuild.** Generalize templates + scheduling + per-audience targeting if a tenant asks; reuse announcement audience picker | Surveys, `notifications` | S (polish only) | P3 |
| 3 | **Per-date roster / shift calendar** (`shift_roster_entries` ×175, `work_schedules`) | Per-day shift assignment with overrides, custom hours, day-off/swap; rich shift pay-policy (night-diff, split, Saturday, OT thresholds) | v1 had **no per-date table** (the gap); pay-policy fields had no clean home | **HAVE** (`roster` router + 3-view UI; `shift_rule` effective-dated pay-policy, 21J) | **No rebuild.** Already enhanced beyond v1 (Calendar/List/Timeline views, effective-dated shift rules). Remaining: engine consumption of per-shift multipliers (seams exist) | Roster, Attendance, Payroll engine, `shift_rule` | S (engine wire-up later) | P3 |
| 4 | **Disciplinary actions** (`disciplinary_actions/categories/records`, 0 rows) | Log warnings/actions against an employee with category + outcome | 0 rows — intent only | MISSING | **Employee Relations / Cases** — tenant-configurable case types (disciplinary, grievance, investigation), severity, configurable workflow + approvals, confidential notes redacted server-side, audit trail | HR Core, Helpdesk-style approval pattern, `audit_event`, Performance (links) | M | **P2** |
| 5 | **Transfers** (`employee_transfers`, 0 rows) | Move an employee between dept/location/position with effective date + approval | 0 rows — intent only | PARTIAL (HR Core holds dept/position; no transfer workflow) | **Effective-dated assignment change** request → approve → applies on date, preserving history (reuse the 21G effective-dating spine; never overwrite the prior record) | HR Core, effective-dating resolver, approvals, `notifications` | M | **P2** |
| 6 | **Resignations** (`resignation_requests` ×1) | Employee-initiated resignation → offboarding | — | PARTIAL (Offboarding module exists; no self-service resignation entry) | **Self-service resignation** request (notice period, reason, last-day) that *opens an Offboarding case* — link, don't duplicate | Offboarding, `notifications`, employee self-service | S | **P1** |
| 7 | **Recognition** (`recognition_records`, 0 rows) | Peer/manager recognition (non-monetary points) | 0 rows — intent only | **HAVE** (Performance recognition, non-monetary ledger, 15G/15H auto-award) | No rebuild. Add an announcement/feed surface if wanted | Performance, `notifications` | S (optional surface) | P3 |
| 8 | **Training & certifications** (`training_*`, `employee_certifications`, `certification_types`, 0 rows) | Assign training programs/modules; track completion; certification expiry | 0 rows — intent only | MISSING | **Learning & Compliance** — tenant-configurable courses/modules, enrollment, completion tracking, certification expiry alerts (via notifications), compliance-status report | HR Core, `notifications`, Surveys (assessments), Analytics | L | **P2** |
| 9 | **Skills matrix** (`employee_skills`, `skill_categories/types`, 0 rows) | Record employee skills/proficiency for ops planning | 0 rows — intent only | MISSING | **Skills & Capabilities** — tenant-defined skill taxonomy + per-employee proficiency; feeds Projects staffing + Recruitment gap analysis | HR Core, Projects, Recruitment, Analytics | M | P3 |
| 10 | **Branding / per-tenant logo** (`tenant_config`) | Tenant logo for app + payslips | Single global config row | PARTIAL (theme is global; no per-tenant branding store) | **Tenant branding** settings (logo, accent, payslip header) consumed by payslip templates + app shell — a real multi-tenant SaaS need | Settings, Payroll (payslip templates), app shell | M | **P2** |
| 11 | **Work locations** (`work_locations`, `employee_work_locations`, 0 rows) | Named physical sites; link to geofence + employee | 0 rows | PARTIAL (Biometric/Geofencing has geofence locations; no first-class "work location" entity HR uses) | **Work Locations** entity (address + geofence link) reusable by HR Core (assignment), Roster (per-location shifts), Attendance geofencing | HR Core, Biometric/Geofencing, Roster | M | P3 |
| 12 | **Inventory** (`inventory/items/movements/reports`) | Stock items + movement ledger (distinct from fixed Assets) | — | **HAVE** (Inventory shipped, ledger stock, migration 0031, `verify:inventory`) | No rebuild | Inventory, Assets (distinct), GL | S | P3 |
| 13 | **GL / Chart of Accounts / Trial Balance UI** (`accounts`, `journal_entries`, `journal_lines`) | Double-entry GL + payroll posting | v1 posted payslip-reversal noise into GL (UTC bug) | **HAVE** (`gl` router + GL UI as Finance tabs; balance + post-immutability + reversal-as-counter-entry) | No rebuild. Reporting views (balance-sheet, bank-rec, cost-centers) are read-models on top — build as needed | Finance, GL, Payroll (soft `linkedPayslipId`) | M (extra reports) | P3 |
| 14 | **Finance depth** (`gratuity`, `insurance_*`, `cost_centers`, `salary_advance_*`, `loan_*`) | Gratuity settlements, insurance enrollment/premiums, cost centers, advances/loans | Loan/advance edge math; 0 rows for most | PARTIAL (Payroll owns loans/reimbursements; pay-items handle deductions) | **Benefits & Deductions** as configurable pay-item categories (insurance premium, gratuity accrual, advance recovery) layered on the existing pay-item engine — *not* bespoke tables per benefit | Payroll engine, pay-items, Finance, GL | L | P3 |
| 15 | **Org-wide audit-log viewer** (`audit_logs` ×183) | One searchable activity log across the org | — | PARTIAL (`audit_event` recorded + surfaced per-module; no global page) | **Audit Log viewer** — single filterable page over `audit_event` (actor/module/entity/date), auditor-read-only, the basis of a future Compliance module | `audit_event`, Analytics, RBAC (auditor) | S | **P1** |
| 16 | **Mobile app** (`apps/mobile` Expo: leave/attendance/payslips/schedule) | Native employee self-service on phone | — | MISSING (v2 is responsive web only) | **Employee mobile** (Expo) over the *existing oRPC API* — leave, punch (geofenced), payslips, My schedule. No new server work, reuse routers | All employee-self-service routers, Biometric geofencing | L | P3 |

---

## 2. Top 5 quick wins — low effort, high staff impact

These are the "Netsurf staff just asked for it" class: small builds, big day-to-day relief, each
reusing real v2 routers.

1. **Self-service resignation → Offboarding (row 6, S).** Add an employee-facing "Resign" form
   (notice period, last working day, reason) that calls a new `offboarding.resignations.createSelf`
   procedure which opens an **Offboarding case** and emits a notification to HR via
   `utils/notifications.ts`. Link, never duplicate — the case is the system of record; the request is
   just the entry point. RBAC: any employee creates own; HR sees all. This closes the one v1
   `resignation_requests` row's intent and removes an email-to-HR workflow.

2. **Org-wide Audit Log viewer (row 15, S).** v2 already writes `audit_event` everywhere and surfaces
   it per-module (e.g. Projects Activity, `projects.activity.list`). Build one route
   `/app/audit-log` with a filterable `DataTable` over a new `audit.list` read-only procedure (actor,
   module, entity type, date range), gated to auditor + admin (reuse `seesAll*`/auditor read pattern).
   Zero new tables, zero migration, humanize entity types like the Projects activity feed already
   does. This is also the seed of the Compliance module on the roadmap.

3. **Announcements (row 1, M-small).** Authoring UI + a thin `announcements` table (title, body,
   audience filter, schedule, require-ack) whose publish step fans out through the **existing**
   `createNotifications` emit helper — so it lands in every targeted user's existing inbox. Audience =
   org / department / role / location using HR Core dept/location data. Read receipts come for free
   from notification `readAt`. This generalizes v1's `announcements` + `announcement_acknowledgements`
   into a tenant-configurable broadcast, not a Netsurf bulletin board.

4. **Tenant branding for payslips (row 10, M-small slice).** The single highest-visibility SaaS gap:
   add a `tenant_branding` settings row (logo URL, accent, payslip header line) and consume it in the
   existing payslip templates (Classic/Compact/Detailed). Per the roadmap's "optional payslip template
   enhancements" this is already half-wanted. Pure additive; immediately makes payslips look like
   *the tenant's*, not Heimdallone's.

5. **Surveys audience targeting polish (row 2, S).** Surveys already shipped with server-side
   anonymity. The quick win is reusing the announcement **audience picker** (dept/role/location) so HR
   can target a survey to "Operations dept" instead of all-staff, and schedule it. No new module — a
   targeting + scheduling layer on a module that already exists and is already secure.

---

## 3. Explicitly NOT porting (v1 quirks / bugs to drop)

- **Payroll UTC-date bug + the reversal payslips it generated** (23 of v1's 69 payslips are
  `is_reversal` UTC-bug corrections). v2 reconciles against **GRA**, not v1; historical payslips are
  preserved as data but the reversal *behavior* is dropped — corrections go through the 21G
  bitemporal `payslip_correction` workflow instead.
- **Flat-monthly personal allowance applied to every pay period.** v1 (and an early v2 build) applied
  $140k/mo to fortnightly periods. GRA prorates ($64,615 fortnightly). Already fixed in the engine
  (`proration.ts`); do not reintroduce any flat-period statutory constant.
- **v1's lack of a per-date roster table** — v1 stored only weekly patterns, which couldn't hold the
  175 per-date entries that feed pay. v2's `roster_entry` is the corrected model; do not collapse back
  to pattern-only.
- **`migrated-<id>@migrated.invalid` placeholder emails.** v1 forced an email on every employee. v2
  allows **null email = no-login employee** (migration 0024). Do not fabricate emails.
- **Single global `tenant_config` row as the catch-all.** v1 jammed branding, payroll settings, and
  org settings into one row. Split into proper tenant-scoped settings (per the SaaS rule) — branding,
  payroll setting, org settings are distinct concerns.
- **2 imbalanced / non-single-sided v1 GL journals.** Stay excluded; never fabricate a balancing
  entry. Corrected opening balances are the accountant's call via the `gl` router post-cutover.
- **0-row "feature" tables as features** (training, goals copies, assets-in-v1, etc.). These are v1
  *schema intent* with no live workflow — build the generalized v2 capability from the need, not by
  cloning empty v1 tables.
