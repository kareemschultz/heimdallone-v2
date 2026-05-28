# Recruitment DB Setup (Phase 9B)

**Status:** Complete. Schema, migration, and seed all landed on 2026-05-28.

## What this phase delivered

- **Schema file**: `packages/db/src/schema/recruitment.ts` — 11 tables + 10 enums + relations, following the Phase 9A spec exactly.
- **Migration**: `packages/db/src/migrations/0008_large_mindworm.sql` — 11 `CREATE TABLE`, 10 `CREATE TYPE` (enums), 19 `CREATE INDEX`, 5 `CREATE UNIQUE INDEX`/UNIQUE constraints, FK constraints throughout.
- **Seed**: `scripts/seed-recruitment.ts` — demo data for the Atlas Shipping tenant (~70 rows across the 11 tables).
- **Schema export**: re-exported from `packages/db/src/schema/index.ts`.

## Tables created

| Table | Purpose | Phase 9A spec section |
|---|---|---|
| `recruitment_requisition` | Hiring request with approval gate | 3.1 |
| `job_opening` | Active hiring effort spawned from a requisition | 3.2 |
| `candidate` | Person record (one per email per tenant) | 3.3 |
| `candidate_application` | Candidate ↔ opening with stage | 3.4 |
| `application_stage_history` | Audit-grade stage transition log | 3.5 |
| `interview` | Scheduled candidate conversation | 3.6 |
| `interview_feedback` | One row per interviewer per interview | 3.7 |
| `offer` | Compensation proposal | 3.8 |
| `offer_approval` | Multi-step approval chain (sequence column shipped, MVP uses seq=1) | 3.9 |
| `candidate_document` | File attachments per candidate or application | 3.10 |
| `recruitment_note` | Free-form internal note | 3.11 |

## Enums created

`requisition_status`, `job_opening_status`, `application_stage`, `candidate_status`, `candidate_source`, `rejection_reason`, `interview_status`, `feedback_recommend`, `offer_status`, `approval_status` — values match Phase 9A section 5.

## Tenant scoping

Every table has `organization_id text NOT NULL` referencing `organization.id ON DELETE CASCADE`. No table is global. All indexes lead with `organization_id` for the common per-tenant queries.

## Constraints to remember

- `candidate_org_email_uq` — UNIQUE `(organization_id, email)` — Phase 9A Q3 decision; dedupe is per-tenant only.
- `candidate_converted_employee_uq` — UNIQUE `(converted_employee_id)` — Phase 9A section 8.3 idempotency for the conversion procedure.
- `application_candidate_opening_uq` — UNIQUE `(candidate_id, job_opening_id)` — one application per candidate per opening; re-apply requires a new opening.
- `feedback_interview_interviewer_uq` — UNIQUE `(interview_id, interviewer_employee_id)` — one feedback per interviewer per interview.
- `offer_approval_offer_sequence_uq` — UNIQUE `(offer_id, sequence)` — supports multi-step approvals without re-migration.

## Indexes for common access patterns (Phase 9A section 9.1 analytics + 6.3 list views)

- Jobs by status: `opening_org_status_idx`
- Jobs by hiring manager: `opening_hiring_manager_idx`
- Applications by stage (org-wide): `application_org_stage_idx`
- Applications by opening + stage (pipeline kanban): `application_opening_stage_idx`
- Candidates by status: `candidate_org_status_idx`
- Stage history (per-application timeline): `stage_history_app_idx`
- Interviews by start time (calendar view): `interview_org_start_idx`
- Interviews by status (filter pills): `interview_org_status_idx`
- Offers by status: `offer_org_status_idx`
- Documents by candidate / application: `candidate_doc_candidate_idx`, `candidate_doc_application_idx`

## Soft delete strategy

All primary entities carry `deleted_at timestamp` for soft-delete. `application_stage_history` and `interview_feedback` and `offer_approval` do NOT — those are append-only audit rows.

`candidate.status` is a separate `candidateStatusEnum` (active / inactive_pool / blocked) — soft-delete vs status are distinct concerns. A blocked candidate is still in the DB but cannot apply to new openings.

## Seed data summary

Demo data inserted for Atlas Shipping tenant on 2026-05-28:

| Table | Rows | Notes |
|---|---|---|
| `recruitment_requisition` | 3 | 2 approved, 1 pending_approval |
| `job_opening` | 4 | 3 open, 1 closed (historic) |
| `candidate` | 10 | mixed sources (referral, job_board, linkedin, agency, direct) |
| `candidate_application` | 10 | all 8 stages represented |
| `application_stage_history` | 24 | synthetic path per application (new → ... → current) |
| `interview` | 4 | 1 scheduled, 2 completed, 1 cancelled |
| `interview_feedback` | 3 | mix of strong_hire and hire recommendations |
| `offer` | 2 | 1 accepted, 1 pending_approval |
| `offer_approval` | 2 | 1 approved, 1 pending |
| `candidate_document` | 11 | 10 resumes + 1 signed offer (placeholder URLs only) |
| `recruitment_note` | 3 | internal notes attached to applications |

Seed is idempotent — re-running deletes existing recruitment rows for Atlas Shipping first, then re-inserts.

## Commands

```bash
# Generate migration after schema edit
bun run db:generate

# Apply migration
bun run db:migrate

# Seed demo data (requires seed-dev.ts and seed-hr-core.ts to have run)
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-recruitment.ts
```

## Verification queries

```sql
-- Counts per table
SELECT 'recruitment_requisition' AS t, COUNT(*) FROM recruitment_requisition WHERE organization_id = '<atlas-org-id>'
UNION ALL SELECT 'job_opening', COUNT(*) FROM job_opening WHERE organization_id = '<atlas-org-id>'
-- … etc
;

-- Candidate uniqueness sanity
SELECT COUNT(*) FROM (
  SELECT organization_id, email, COUNT(*)
  FROM candidate
  WHERE organization_id = '<atlas-org-id>'
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
) x;  -- should return 0

-- Stage distribution
SELECT stage, COUNT(*) FROM candidate_application
WHERE organization_id = '<atlas-org-id>'
GROUP BY 1 ORDER BY 1;
```

## Deviations from Phase 9A spec

None. All 11 entities + 10 enums + all listed indexes are present. The `offer_approval.sequence` column shipped per Q1 recommendation (multi-step approvals later, no DDL change required).

## Next phase

**Phase 9C — Recruitment oRPC API.** ~40 procedures expected across requisitions, jobs, candidates, applications, interviews, feedback, offers, documents, notes. Use the role helpers from `packages/api/src/utils/role-helpers.ts` plus the new `canManageRecruitment` / `canViewRecruitment` that will be added in 9C.
