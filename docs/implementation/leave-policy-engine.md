# Leave Policy Engine — implementation record (Phase 7I)

Hardening of the Phase 7 Leave module. Spec/research: [../architecture/leave-policy-engine-plan.md](../architecture/leave-policy-engine-plan.md).
Checkpoints: **7I‑A** research/spec ✅ · **7I‑B** schema+migration+seed ✅ · **7I‑C**
API+RBAC ✅ · **7I‑D** UI (next) · **7I‑E** browser QA + payroll-warning surfacing (next).

## Legal attribution
Statutory leave **entitlement** = Labour Act / Ministry of Labour / NIS / company
policy. **GRA** governs only the **payroll** slice (PAYE on leave pay, NIS, taxable
treatment, final pay) — carried per-rule as `payrollTreatment` + `taxTreatmentNote`,
kept distinct from the entitlement source. No entitlement rule is a "GRA rule".

## 7I‑A — researched statutory baseline (Guyana, retrieved 2026-06-03)
| category | seeded | verification | source |
|---|---|---|---|
| maternity | 13 wks (extend +13) @ 70% avg weekly insurable earnings; grant $2,000 | **verified** | NIS — nis.org.gy/maternity_benefit |
| sick | from 4th day, max 26 wks @ 70% | **verified** | NIS — nis.org.gy/sickness_benefit |
| annual | ~1 day/completed month (daily-paid 1/20; hourly 1/160); cannot be forfeited | **needs_review** | Leave with Pay Act Cap. 99:02, labour.gov.gy (primary PDF 403 this session; tenure escalation to confirm vs the Act) |
| paternity / compassionate / unpaid | company-policy suggestions, non-statutory | **draft** | company discretion |

Barbados / Trinidad & Tobago / Jamaica: structure-only **draft** templates (no
source-backed values yet — research before use).

## 7I‑B — schema (`packages/db/src/schema/leave-policy.ts`), migration `0015_futuristic_tattoo.sql`
4 tables, 7 enums:
- `leave_policy_template` — `organizationId` **nullable** (null = system/global,
  seeded). Official-source metadata first-class: `sourceName/sourceUrl/
  sourceRetrievedAt/lastReviewedAt` + `verificationStatus`.
- `leave_policy_rule` — one per leave type; **per-rule `verificationStatus`** so a
  template mixes verified + needs_review + draft. tenure/probation/encashment/
  carry-forward/gender-applicability/payrollTreatment fields.
- `organization_leave_policy` — an org's adopted/authored policy; `sourceTemplateId`
  **ON DELETE SET NULL**; partial-unique **one active per (org, country)**.
- `organization_leave_policy_rule` — snapshotted, org-editable; `sourceRuleId` SET
  NULL (provenance), `linkedLeaveTypeId` → live `leave_type`, `isCustomized`.

Seed `scripts/seed-leave-policy.ts` (idempotent — delete system templates then
insert; adopted org policies survive via set-null): GY 2026 system template (6
rules per §A) + BB/TT/JM draft templates. Verified idempotent ×2 (9 rules).

## 7I‑C — API (`packages/api/src/routers/leave-policy.ts`, registered `leavePolicy`)
New AC resource `leave_policy` (read/create/update/adopt/activate/archive):
owner/admin/hr_admin full; payroll_admin/manager/auditor read; employee/recruiter/
helpdesk none. Helpers (role-helpers.ts + rbac.ts): `canManageLeavePolicy`,
`canViewLeavePolicy`, `canViewLeavePayrollTreatment`.

- `templates.list/getById` — library (system + org). Payroll-treatment columns
  redacted for non-finance roles.
- `orgPolicies.adoptTemplate` — **transactional snapshot**: copies template rules
  into org rows. **System-template edits never mutate an adopted policy**
  (structural: copy-at-adoption + `sourceRuleId` SET NULL, no live read-through).
- `orgPolicies.createCustom / copyFrom / updateRule` (sets `isCustomized`) /
  `activate` (one active per (org,country) → CONFLICT on the partial unique) /
  `archive` / `compareToBaseline` (diffs each org rule vs its source rule).
- `balanceExplanation.forSelf / forEmployee` — employee "why this balance?", gated
  by `leave_request:read`, self-scoped (employee→self, manager→reports, HR/payroll/
  auditor→any). Computes pending from `leave_request`; carries `isPaid`; soft
  "no active policy" notice; never blocks payroll.

Two-layer authz (tenant FK verify + manager-direct-report / employee-self).
Unverified (needs_review/draft) rules travel with every policy → the UI warns;
nothing is presented as legal certainty.

## Verification
`scripts/verify-leave-policy-engine.ts` — **22/22** (template library + per-rule
verification mix; payroll-treatment redaction; adopt + the **snapshot invariant**
[system rule mutated to 99.00, adopted policy stayed 12.00, then restored];
custom/override/compare; activate-one-per-country CONFLICT + archive; RBAC + IDOR;
self-scoped balance explainer; unverified-signal-present-payroll-unaffected). Run
needs the API server restarted (lesson #76) and env exported (the DB-touching part):
```
bun run scripts/seed-leave-policy.ts
# restart apps/server bun run --hot src/index.ts
cp scripts/verify-leave-policy-engine.ts apps/web/_v.ts \
  && export $(grep -v '^#' apps/server/.env | xargs) \
  && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
```

## Gates (7I‑A/B/C)
check-types 3/3 (router type-clean; only the pre-existing `index.ts` TS7056
baseline) · ultracite full baseline 223/1/2 unchanged · audit:permissions 86/12 ·
seed idempotent ×2 · verify 22/22.

## Remaining (7I‑D / 7I‑E)
UI: leave-policy settings area — template gallery (country, effective date,
**verification badge**, source/review, leave-types/entitlement/carry-forward/
payroll summaries) + actions (use statutory / + company / custom / copy / compare);
org policy detail + rule editing; employee **"Why this balance?"** panel; every
system template shows "Verify with official guidance / legal advisor before
production use." Payroll: surface a soft warning when an employee's leave maps to an
unverified/missing policy (engine path unchanged — paid preserves, unpaid deducts,
pending lowers projection confidence). Encashment payout deferred to final-pay.
Browser QA across roles + screenshots; gates incl. web tsc 0 touched-file errors.
