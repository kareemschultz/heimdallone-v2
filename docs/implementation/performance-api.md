# Performance / PMS API — Phase 15C

oRPC router `performance` (`packages/api/src/routers/performance.ts`), registered
in `packages/api/src/routers/index.ts` as `performance`. Built on the 15B schema
(`packages/db/src/schema/performance.ts`, migration `0018`). First router to
consume the `goal` / `appraisal` / `recognition` AC resources.

## Router groups & procedures

```
objectives.list           (goal:read)      scoped: HR/auditor/payroll all; manager own+reports; employee own; `mine`
objectives.getById        (goal:read)      assertObjectiveVisible; key results + READ-ONLY linkedTask context
objectives.create         (goal:create)    self/report/any (scoped); cycle + employee tenant-verified
objectives.update         (goal:update)    scoped; status→completedAt
objectives.complete       (goal:complete)  owner/admin any; employee own (HR/manager complete via update)
objectives.archive        (goal:update)    isArchived
objectives.keyResults.add / updateProgress / remove  (goal:update)   linkedProjectTaskId tenant-verified; recompute objective %
reviewCycles.list         (appraisal:read) HR/auditor/payroll all; others see cycles they have a request in
reviewCycles.create       (appraisal:create)
reviewCycles.activate     (appraisal:manage)   draft → active
reviewCycles.close        (appraisal:finalize) active → closed
reviewCycles.templates.list (appraisal:read) / create / addQuestion (appraisal:manage)
reviewCycles.requests.generate (appraisal:manage)   360 fan-out; (cycle,subject,reviewer) unique; idempotent
reviewCycles.requests.assignedToMe (appraisal:read) reviewer = me
reviewCycles.requests.decline (appraisal:review)    own request only
reviewCycles.responses.save / submit (appraisal:submit)   reviewer-own only; questionId tenant-verified
reviewCycles.responses.results (appraisal:read)     ANONYMITY-CRITICAL — see below
oneOnOnes.list / getById  (appraisal:read) HR+auditor all (private redacted for auditor); participants own
oneOnOnes.create / update (appraisal:review) owning manager / HR; private note write
recognition.list          (recognition:read)  HR/auditor/payroll all; manager reports; employee own; `mine`
recognition.award         (recognition:award) HR any; manager direct-report only
performance.activity.list (goal:read)      reads shared audit_event (management read; no performance_activity table)
```

## Audit delta

`audit:permissions` rose **109/14 → 121/15** — EXPECTED: `performance` is the
15th router and the first to consume `goal` (read/create/update/complete = 4),
`appraisal` (read/create/submit/review/finalize/manage = 6), and `recognition`
(read/award = 2) = **12 new distinct pairs**. All defined in the statement (15B).
Not a regression.

## RBAC (two-layer authz) — byte-aligned `role-helpers.ts` ↔ `rbac.ts`

| Helper | = (aligned to the actual AC grant, lesson #88) |
|---|---|
| `canManagePerformance` | `canManageHR` |
| `canViewPerformance` | `canManageHR` ∪ manager ∪ payroll_admin ∪ auditor |
| `canCreateObjective` / `canUpdateObjective` | `canManageHR` ∪ manager ∪ employee |
| `canCompleteObjective` | owner/admin ∪ employee *(goal:complete grant — HR/manager use update)* |
| `canManageReviewCycles` / `canFinalizeReview` | `canManageHR` |
| `canSubmitReview` | owner/admin ∪ manager ∪ employee *(appraisal:submit grant)* |
| `canReviewPerformance` | `canManageHR` ∪ manager |
| `canAwardRecognition` | `canManageHR` ∪ manager |
| `canViewRecognition` | `canManageHR` ∪ manager ∪ payroll_admin ∪ employee ∪ auditor |
| `canViewPrivatePerformanceNotes` | `canManageHR` ∪ manager *(handler scopes manager to OWNED 1-on-1s)* |

Handler scope: `seesAllPerformance` (HR ∪ auditor ∪ payroll_admin) sees all; a
manager sees own + direct reports (`getDirectReportIds(me.id, oid)` — always
tenant-scoped, 13H); an employee sees only their own. `assertObjectiveVisible` /
`assertOneOnOneVisible` / `assertOwnRequest` gate single rows.

## The two HIGHEST-RISK redactions (enforced server-side)

### 1. Private manager notes (`one_on_one.privateManagerNotes`)
`redactOneOnOne` strips the column for every caller who is **not** HR **and not
the OWNING manager** of that meeting — applied in `oneOnOnes.list` AND `getById`.
The employee participant and the auditor receive `null`; the probe text never
leaves the server for them. Proven: employee/auditor payloads contain no private
text; HR + owning manager see it.

### 2. Peer-review anonymity (`reviewCycles.responses.results`)
- **self / manager / report** responses are returned **named** (only peers are
  anonymised).
- **peer** responses: HR (`canManageHR`) gets a **raw** view with reviewer
  identity. Everyone else (the subject, a manager-of-subject) gets:
  - **`hidden`** when submitted peer count < `review_cycle.anonymityThreshold`
    ("Not enough peer responses yet") — no names, no responses;
  - **`aggregated`** at/above the threshold — the responses with **no reviewer
    identity**.
Proven both ways: below threshold the subject sees no peer names/responses; above
threshold the subject sees the response with no reviewer name, while HR sees the
name.

## Guardrails (link, never own — grep-proven)

- **Zero cross-module writes.** Every `db.insert/update/delete` targets a
  `performance*` table only (objectives / key results / cycles / templates /
  questions / requests / responses / 1-on-1s / recognition); there is no write to
  `project_task` / payroll / payslip / attendance / asset / helpdesk / employee.
- **Read-only project link.** `key_result.linkedProjectTaskId` is tenant-verified
  SELECT-only on write (`verifyLinkedTask`) and resolved read-only on read
  (`resolveLinkedTask` returns only title/status/completedAt). A cross-tenant id →
  BAD_REQUEST.
- **Recognition is not pay.** `recognition.award` writes ONLY `recognition_point`
  (a non-monetary `points` ledger); the list returns `isPay: false` and has no
  amount/currency/pay field. No payroll write, no payroll FK (15B).
- **Activity reuses `audit_event`** — no `performance_activity` table.

## Verification — `scripts/verify-performance-api.ts` (**36/36**)

Objective scope + IDOR (employee own-only, teammate getById/complete FORBIDDEN,
recruiter/project_manager blocked by AC); read-only project link (resolved +
cross-tenant BAD_REQUEST); **private-note redaction** (HR + owning manager see;
employee + auditor redacted, probe text absent); **peer anonymity** (hidden below
threshold, aggregated-no-name at threshold, HR raw view named); review submit
scope; recognition ledger-not-pay (isPay:false, no money field, employee/recruiter
blocked from award, payroll read-only); objective complete scope; activity audit
read (employee blocked). DB-verify `scripts/verify-performance-db.ts` stays
**25/25** on a fresh seed.

## Known limitations / deferred

- `goal:complete` is held only by owner/admin + employee; HR/manager complete a
  report's goal via `objectives.update(status="completed")` (aligned to the
  existing grant — not a bug).
- `objective.internalNote` exists but is not yet surfaced/redacted in a read
  (reserved for a future "manager private note on a goal" — 15D+ if needed).
- 1-on-1s are notes-only (no templated meeting questions — deferred per 15A).
- Auto-award on on-time objective completion (the `objective_completed` source)
  is reserved for 15H (the UI phase) — the column + source enum exist.

## Gates

check-types 3/3 · build 2/2 · audit:permissions **121/15** · verify-performance-api
**36/36** · verify-performance-db **25/25** · ultracite clean on all changed files.
