# Performance / PMS DB Setup — Phase 15B

`packages/db/src/schema/performance.ts` — **9 tables + 10 enums**, migration
**`0018_simple_tomorrow_man.sql`** (purely additive; applied; no drift).
Registered in `schema/index.ts`. Built on the 15A plan.

## Tables

| Table | Purpose | Notable columns / FKs |
|---|---|---|
| `performance_objective` | a goal / OKR objective | `reference` (GOAL-NNNNNN), `employeeId → employee_profile` (restrict), `cycleId → review_cycle` (set null), `status`, `weight`, `progressPercent` (cached), `internalNote`, dates |
| `performance_key_result` | measurable result | `objectiveId → performance_objective` (cascade), `progressType`, start/current/target `numeric`, `status`, **`linkedProjectTaskId → project_task` (SET NULL, read-only signal)** |
| `review_cycle` | a named review period | `reference` (REV-NNNNNN), `type` (self/manager/three_sixty/upward), `status`, dates, **`anonymityThreshold`**, **`isAnonymousPeers`** |
| `question_template` | reusable question set | `name`, `isArchived` |
| `review_question` | one question | `templateId → question_template` (cascade), `type` (text/rating/boolean/multi_choice/likert), `options` jsonb, `displayOrder` |
| `review_request` | the 360 fan-out | `cycleId → review_cycle` (cascade), `subjectEmployeeId`/`reviewerEmployeeId → employee_profile` (restrict), `relationship` (self/manager/peer/report), `status`, **unique `(cycle, subject, reviewer)`** |
| `review_response` | one answer | `requestId → review_request` (cascade), `questionId → review_question` (set null), `answerText`/`answerRating`/`answerJson` |
| `one_on_one` | a 1-on-1 record | manager/employee `→ employee_profile` (restrict), `sharedNotes`, **`privateManagerNotes`** (redacted from the employee in 15C) |
| `recognition_point` | the PMS-owned recognition ledger | `employeeId → employee_profile` (restrict), **`points` int** (non-monetary), `reason`, `source` (manual/objective_completed), `awardedByUserId → user` (set null), `objectiveId → performance_objective` (set null) — **NO payroll FK** |

## Guardrails — PROVEN via `scripts/verify-performance-db.ts` (DB-verify **25/25**)

The constraint-catalog verifier proves every guardrail the spec promised:

- **Recognition is not pay.** `recognition_point` FKs reference **only**
  organization / employee_profile / user / performance_objective — **no FK to
  payslip / payroll_run / attendance**; **no** money/pay/salary/amount/currency
  column; `points` is a plain integer ledger.
- **The project-task link is read-only + one-directional.**
  `performance_key_result.linked_project_task_id → project_task` is **ON DELETE
  SET NULL**, and `project_task` has **no FK back** to any performance table.
  Performance reads the task's completion; it never writes Projects.
- **Private manager notes are ready for redaction.**
  `one_on_one.private_manager_notes` exists alongside the employee-visible
  `shared_notes` (15C strips the private column server-side).
- **Anonymity is structurally supported.** `review_request` has the unique
  `(cycle, subject, reviewer)` index + a `relationship` enum, and `review_cycle`
  carries `anonymity_threshold` + `is_anonymous_peers` — so 15C can aggregate peer
  responses and reveal them only above the threshold.
- **Activity reuses `audit_event`.** There is **no `performance_activity` table**
  (the Projects 14H decision).
- 9 tables + 10 enums present; seed invariants hold (objectives span all 7
  statuses; exactly 1 KR links a valid project task; the 360 fan-out is
  self+manager+2 peers+1 report; exactly 1 one-on-one carries a private-note
  redaction probe; 5 recognition points incl. 1 objective_completed auto-award,
  all positive integers; GOAL-/REV- references unique per org).

## Permissions

`packages/auth/src/permissions.ts` — `appraisal` and `goal` **already existed**
(unconsumed); a **new `recognition: ["read", "award"]`** resource was added.
Per-role grants: owner / admin / hr_admin / manager → `recognition: [read, award]`;
payroll_admin / employee / auditor → `[read]`; recruiter / helpdesk_agent /
project_manager → none. **No new role** (the 10 existing roles cover PMS).

**`audit:permissions` STAYS 109/14** — `recognition` (and the pre-existing
`appraisal`/`goal`) are defined in the statement but **not yet consumed by any
router**; the audit counts pairs *used* in `authorizedProcedure`, so the count
rises only when the Phase 15C `performance` router lands (the 13B `ticket:approve`
/ 14B precedent → ~122/15 in 15C).

## Seed

`scripts/seed-performance.ts` — idempotent (delete-then-insert, FK-safe order;
twice → identical): 7 objectives (all statuses), 6 questions / 1 template, 1
active 360 cycle, 5 review requests (self+manager+2 peers+1 report) + 6 responses,
2 one-on-ones (1 with a private manager note), 5 recognition points (1 auto). It
**reads** one real `project_task` id for the KR link and writes **nothing**
outside the performance tables.

## Commands

```
export $(grep -v '^#' apps/server/.env | xargs)
bun run db:generate            # already produced 0018_simple_tomorrow_man.sql
bun run db:migrate             # applied
bun run scripts/seed-performance.ts        # idempotent
bun run scripts/verify-performance-db.ts   # 25/25
```

## Gates

check-types 3/3 · build 2/2 · audit:permissions 109/14 (unchanged) · DB-verify
25/25 · seed idempotent · migration applied (no drift) · ultracite clean.
