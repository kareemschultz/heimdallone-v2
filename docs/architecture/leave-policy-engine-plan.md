# Leave Policy Engine / Statutory Policy Library — Phase 7I

> **Status: ACTIVE BUILD (Phase 7I, near-term).** Hardening of the Phase 7 Leave
> module. This is the 7I-A spec/research deliverable; 7I-B schema → 7I-C API →
> 7I-D UI → 7I-E payroll-integration + QA follow.

## 0. Why this phase

Phase 7 shipped a **per-org configurable** leave engine: `leave_type` (paid/unpaid,
accrual amount + period, carry-forward type/max/expiry, reset, approval/attachment,
exclude holidays/company days, compensatory), `leave_balance`
(available/used/carry-forward/expiry), `leave_request` + approvals + allocation +
restrictions + company days, and a live payroll path
(`buildLeaveInput` → `{ paidLeaveDays, unpaidLeaveDays, pendingLeaveDays }`,
`UNPAID_LEAVE` deduction, `deductLeaveFromBasicPay` contract flag, pending leave
lowers projection confidence — 11G CP3).

**What 7I adds (the confirmed gap):** statutory **country templates**, effective-date
**versioning**, **tenure/probation** rules, **encashment**, **official source
citations + verification status**, a **setup/import workflow** (use statutory / +
company / custom / copy / compare), a company **override/snapshot** layer, and an
employee **"why this balance?"** explanation.

## 1. Legal attribution (correction baked in)

**Statutory leave _entitlement_ belongs to labour law, not the tax authority.**
Sources are **the Labour Act / Leave with Pay Act / Ministry of Labour** and, for
income-replacement during leave, **the National Insurance Scheme (NIS)**. **GRA**
(Guyana Revenue Authority) is relevant **only** where leave touches payroll:
PAYE on leave pay, NIS contributions, taxable/non-taxable treatment, deductions,
and final pay. **No leave entitlement rule may be labelled a "GRA rule."** Each
rule carries `payrollTreatment` + `taxTreatmentNote` for the payroll/GRA-relevant
slice, kept distinct from the entitlement source.

## 2. Researched statutory baseline — Guyana (2026), with citations

Retrieved 2026-06-03. Each rule below maps to a `leave_policy_rule` row with the
shown `verificationStatus`.

| leave category | rule (as seeded) | verification | source |
|---|---|---|---|
| **annual** | Paid annual leave accrues ~1 day per completed month of service (≈12 days/yr); daily-paid: 1 day per 20 days worked; hourly: 1 day per 160 hours; escalates with long service (secondary sources cite up to ~24 days/yr after 10 yrs); statutory leave cannot be forfeited — carried over by agreement or paid on termination. | **needs_review** | Leave with Pay Act, Cap. 99:02 (labour.gov.gy). Primary PDF was not directly retrievable (HTTP 403) this session; per-month accrual corroborated by multiple secondary EOR sources, tenure escalation **must be confirmed against the Act text** before production. |
| **sick** | NIS Sickness Benefit: payable from the **4th day** of incapacity (first 3 days unpaid by NIS), up to **26 weeks** per continuous incapacity, at **70%** of average weekly insurable earnings ÷ 6 per day. Statutory paid sick leave itself is **not** separately mandated by the Labour Act; income replacement runs through NIS (employers often top up by collective agreement). Eligibility: ≥50 contributions + ≥8 of preceding 13 contribution weeks. | **verified** | National Insurance Scheme — Sickness Benefit, nis.org.gy/sickness_benefit (official). |
| **maternity** | NIS Maternity Allowance: **13 weeks** (extendable +13 on complications) at **70%** of average weekly insurable earnings; payable from up to 6 weeks before confinement. Maternity Grant $2,000. Eligibility: ≥15 contributions since entry + ≥7 of preceding 26 contribution weeks. | **verified** | National Insurance Scheme — Maternity Benefit, nis.org.gy/maternity_benefit (official). |
| **paternity** | No statutory paternity leave in Guyana. Seeded as a **company-policy suggestion** (e.g. 0–5 days), clearly non-statutory. | **draft** | No official statutory basis; company discretion. |
| **compassionate / bereavement** | No specific statutory entitlement; common company practice (e.g. 3 days). Seeded as company-policy suggestion. | **draft** | No official statutory basis; company discretion. |
| **study / special / unpaid** | No statutory minimum; structure only, company-defined. Unpaid leave already supported by the existing engine (reduces pay per contract). | **draft** | Company discretion. |

**Other Caribbean baselines** (designed as supported templates; **seed structure
only, no source-backed values yet** → all rules `draft` / `needs_official_review`):
Barbados (Holidays with Pay Act / NIS), Trinidad & Tobago (Minimum Wages /
Maternity Protection Act / NIS), Jamaica (Holidays with Pay Act / NIS) — to be
researched against official sources when each is scheduled.

> **Guardrail:** every system template surfaces "Verify with official guidance /
> legal advisor before production use." No legal value is hardcoded without
> `sourceName` + `sourceUrl` + `sourceRetrievedAt` + a `verificationStatus`.

## 3. Data model (7I-B)

New file `packages/db/src/schema/leave-policy.ts`. Reuses hr-core helpers
(`cuid`, `orgRef`, `timestamps`), org-scoped + soft-delete where org-owned.

### 3.1 Enums
- `leave_policy_verification_status`: `verified | needs_review | draft | deprecated`
- `leave_policy_category`: `annual | sick | maternity | paternity | compassionate | study | unpaid | special | custom`
- `leave_policy_entitlement_unit`: `days | hours | weeks`
- `leave_policy_accrual_method`: `upfront | monthly | yearly | per_days_worked | manual`
- `leave_policy_payroll_treatment`: `paid_preserve | unpaid_deduct | nis_funded | partial`
- `leave_policy_status`: `draft | active | archived`
- `leave_company_override_mode`: `statutory_only | statutory_plus_company | custom`

### 3.2 `leave_policy_template` (system or org-authored blueprint)
`id`, `organizationId` (**nullable** — null = global/system template),
`countryCode`, `jurisdictionName`, `name`, `description`, `effectiveFrom` (date),
`effectiveTo` (date null), `verificationStatus`, `sourceName`, `sourceUrl`,
`sourceRetrievedAt` (timestamp), `lastReviewedAt` (timestamp), `isSystemTemplate`
(bool), `isActive`, timestamps, `deletedAt`.

### 3.3 `leave_policy_rule` (a template's per-leave-type rule)
`id`, `policyTemplateId` (FK cascade), `leaveTypeName`, `leaveCategory`,
`isPaid`, `entitlementAmount` (numeric 6,2 null), `entitlementUnit`,
`accrualMethod`, `accrualFrequency` (text e.g. "per_completed_month"),
`tenureMinMonths` (int null), `tenureMaxMonths` (int null), `probationEligible`
(bool), `genderApplicability` (text null — `any|female|male`; used only where the
benefit is biologically scoped, e.g. NIS maternity — **never** for discriminatory
gating of general leave), `requiresDocument`, `requiresApproval`,
`carryForwardAllowed`, `carryForwardLimit` (numeric null),
`carryForwardExpiryDays` (int null), `encashmentAllowed`, `payrollTreatment`,
`taxTreatmentNote` (text null), `verificationStatus` (**per-rule** — a template
can mix verified + needs_review), `sourceUrl` (text null, per-rule override),
`notes`, timestamps.

### 3.4 `organization_leave_policy` (an org's adopted/created policy)
`id`, `organizationId`, `sourceTemplateId` (FK set null — provenance),
`countryCode`, `name`, `effectiveFrom`, `status` (`draft|active|archived`),
`companyOverrideMode`, `activatedByUserId` (FK user set null), `activatedAt`,
timestamps, `deletedAt`.

### 3.5 `organization_leave_policy_rule` (snapshotted, org-editable)
Mirror of `leave_policy_rule` fields + `organizationLeavePolicyId` (FK cascade),
`sourceRuleId` (FK set null — provenance), `linkedLeaveTypeId` (FK `leave_type`
set null — ties a policy rule to a live configurable leave type),
`isCustomized` (bool), `customOverrideNote` (text null). timestamps.

> **Snapshot rule (non-negotiable, mirrors offboarding template snapshot + assets
> derived-cache lesson):** adopting a system template **copies** its rules into
> `organization_leave_policy_rule` rows. Later edits to the system template
> **never** mutate an already-adopted org policy. Provenance is kept via
> `sourceTemplateId` / `sourceRuleId` so "compare with statutory baseline" can
> diff a live org rule against its (possibly newer) source.

Migration: one Drizzle-generated SQL adding 5 tables + 7 enums. Seed
(`scripts/seed-leave-policy.ts`): the Guyana 2026 **system** template (org null,
rules per §2 with their individual verification statuses) + structure-only draft
templates for Barbados / Trinidad / Jamaica.

## 4. API (7I-C) — router `leavePolicy`

New `packages/api/src/routers/leave-policy.ts`, registered as `leavePolicy`.
New AC resource **`leave_policy`** with actions `read / create / update / adopt /
activate / archive`; employee "why this balance" reuses `leave_request:read`
(employee self-scope) — **not** a manage gate.

- `templates.list` (read) — system + org templates for the caller's country/org.
- `templates.getById` (read) — template + rules.
- `orgPolicies.list` / `getById` (read).
- `orgPolicies.adoptTemplate` (adopt) — **transactional**: copy template + snapshot
  all rules into org rows (`status='draft'`, mode `statutory_only`).
- `orgPolicies.createCustom` (create) — empty custom policy.
- `orgPolicies.copyFrom` (create) — clone an existing org policy.
- `orgPolicies.updateRule` (update) — edit a snapshotted rule (sets `isCustomized`).
- `orgPolicies.activate` (activate) / `archive` (archive) — lifecycle; activating
  records `activatedByUserId`/`activatedAt`, audited.
- `orgPolicies.compareToBaseline` (read) — diff org rules vs `sourceRule`.
- `balanceExplanation.forSelf` / `forEmployee` (`leave_request:read`) — the
  "why this balance?" payload (starting/accrued/used/pending/carry-forward/expiry/
  adjustment/unpaid-impact + policy name + effective date + plain-language lines).
  Self-scoped (employee → own; manager → direct reports; HR/auditor → any).

RBAC re-check helpers (`role-helpers.ts` + `rbac.ts`): `canManageLeavePolicy`
(owner/admin/hr_admin), `canViewLeavePolicy` (+ manager/payroll_admin/auditor),
`canViewLeavePayrollTreatment` (payroll-capable + auditor). Two-layer authz: tenant
FK verify + manager-direct-report / employee-self scope (the 10C/12C IDOR lesson).

## 5. UI (7I-D)
Leave settings gains a **Policies** area: template gallery (country, effective
date, **verification badge**, source + review date, included leave types,
entitlement / carry-forward / payroll summaries) with actions **Use statutory
template / Use statutory + company enhancements / Create custom / Copy from
existing / Compare with statutory baseline**. Employee **"Why this balance?"**
panel on the leave page. Every system template shows the verify-before-production
notice. Plain-language throughout (payroll-UX principle).

## 6. Payroll integration (7I-E)
No change to the proven path: paid statutory/company leave preserves pay; unpaid
reduces pay per contract; pending lowers projection confidence. **Add:** a
readiness/warning signal when an employee's leave maps to an **unverified**
(`needs_review`/`draft`) or missing policy — surfaced as a soft warning, never a
silent pay change. **Encashment** planned for final-pay/offboarding (the
`encashmentAllowed` flag is recorded now; payout calc deferred unless trivial).

## 7. RBAC matrix (target)
| capability | owner/admin/hr_admin | payroll_admin | manager | auditor | employee |
|---|---|---|---|---|---|
| view templates / org policies | ✅ | ✅ | ✅ (summary) | ✅ | ❌ |
| adopt / create / edit / activate policy | ✅ | ❌ | ❌ | ❌ | ❌ |
| view payroll treatment | ✅ | ✅ | ❌ | ✅ | ❌ |
| "why this balance?" (own) | ✅ | ✅ | ✅ (reports) | ✅ | ✅ (self) |

## 8. Verification (7I-E)
`scripts/verify-leave-policy-engine.ts`: system template create; org adopt/snapshot;
**editing the system template does NOT mutate the adopted org policy** (the core
snapshot invariant); custom policy create; rule override; tenant scoping; employee
cannot read another's policy/balance detail; payroll input still yields
paid/unpaid/pending; projection confidence reacts to pending leave; an unverified
policy raises a warning but does **not** break payroll. Browser: HR template
gallery + adopt/copy + edit rule; employee "why this balance"; auditor read-only;
employee no admin; 0 console errors.

## 9. Definition of done
Schema+migration+seed (Guyana verified/needs_review per §2, BB/TT/JM draft); router
+ AC resource + helpers; snapshot invariant enforced; UI gallery + employee
explainer; payroll warning for unverified policies; verify script green; gates
(check-types, build, ultracite baseline unchanged, audit:permissions, web tsc 0
touched-file errors); docs + memory updated. **Every statutory value source-cited;
nothing presented as legal certainty.**
