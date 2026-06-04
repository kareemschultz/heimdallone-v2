# Performance / PMS — Implementation Plan (Phase 15A)

> **Status:** Phase 15A — research & spec only. No code, no schema, no migrations,
> no routes in this phase. This document is the contract for 15B+.
>
> **Central guardrail (mirrors Projects/Helpdesk discipline):** Performance is a
> **People & Payroll** module that **OWNS** its performance data (goals, reviews,
> feedback, 1-on-1s, recognition points) but **links read-only** to neighbouring
> modules and **never mutates them**:
> - It **reads** Projects task-completion as an optional goal/key-result signal
>   (`key_result.linkedProjectTaskId → project_task`, `ON DELETE SET NULL`,
>   SELECT-only) — Projects' 14A plan already reserved this seam ("PMS owns the
>   objective↔task read link"). **Zero writes to `project*`.**
> - **Recognition "bonus points" are a PMS-owned ledger** (gamification /
>   non-monetary), NOT payroll pay. PMS **never writes Payroll**; converting
>   points → money (if ever) is a future Finance concern that would *read* this
>   ledger. There is no FK to `payslip`/`payroll_run` and no pay mutation.
> - HR Core (`employee_profile`, `department`) and `user` are referenced read-only
>   (restrict / set null), owned elsewhere.

Suite group: **People & Payroll** (alongside Employees · Contracts · Attendance ·
Leave · Payroll · Recruitment · Onboarding · Offboarding). Roadmap position:
**Phase 15**, between Projects (14 ✅) and Finance expansion (16).

---

## 1. Research summary

### 1.1 What the benchmarks teach us (researched live, June 2026)

**Continuous-feedback SaaS (15Five · Lattice · Leapsome · Culture Amp ·
Small Improvements · Betterworks · PerformYard · Workday Talent).**

- **15Five** — built around *weekly check-ins* ("15 minutes to write, 5 to read")
  + OKRs + continuous feedback; replaces the annual review with a lightweight
  rhythm. **Take:** the SMB sweet spot is *light and frequent*, not a heavy annual
  ceremony. A simple periodic check-in beats a 30-question annual form.
- **Lattice** — the growth-stage default: goals/OKRs + structured review cycles +
  360 feedback + 1-on-1s + (compensation link). AI now drafts review summaries.
  **Take:** the spine is *goals → review cycle → 360 → 1-on-1*. **Leave:** the
  compensation-calibration and AI-drafting layers (Finance/AI, later).
- **Leapsome** — widest breadth (performance + surveys + recognition + OKRs +
  learning); highly customizable 360. **Take:** recognition + OKRs belong
  together; question templates must be reusable. **Leave:** learning/LMS, deep
  survey analytics.
- **Culture Amp** — engagement surveys + sentiment analytics + benchmarking;
  supports SMART / OKR / MBO goal frameworks. **Take:** don't force one goal
  framework — support a simple OKR (objective + measurable key results) that also
  reads as a SMART goal. **Leave:** engagement-survey analytics / benchmarking.

**360 / review-cycle design (best-practice research).**
- SMB cadence: **annual or biannual**, the full cycle run over **6–12 weeks**;
  keep a 360 **≥ 3 months apart from a formal evaluation** (separate *development*
  feedback from *evaluation*).
- **Rater fatigue is the #1 failure** — too many / too-long surveys collapse
  response quality. Keep question sets short; one question at a time.
- **Anonymity needs a minimum-rater threshold** — show aggregated peer feedback
  only when **≥ 3 responses** in a rater category, so a single rater can't be
  identified. SMB target: **6–10 total raters** per subject.

**Horilla / OpenHRMS (the existing extraction — `docs/horilla-extraction/
performance.md`, `modules/performance-pms-spec.md`, `oh_appraisal`).** Gives the
entity spine — objective template → employee objective → key result; review
period → question template → feedback cycle (manager/peer/subordinate/self) →
response; 1-on-1 meeting; **auto-award bonus points on on-time objective
completion**; anonymous feedback. **Supersede:** its jsonb id-bags
(`colleagueIds`, `subordinateIds`, `employeeIds`) with **real join rows** (the
house convention since Recruitment 9I), which is what 360 fan-out, per-reviewer
status, and the anonymity threshold require.

### 1.2 Which patterns fit Heimdallone

- **Goals/OKRs spine:** objective + measurable key results, optional link to a
  **Projects task** as a progress signal (the 14A seam).
- **One review-cycle model that fans out into per-reviewer requests** (self /
  manager / peer / report), one question at a time, with an anonymity threshold.
- **Reusable question templates** (Lattice/Leapsome) — a join table, not jsonb.
- **Lightweight 1-on-1s** (notes, optional template) — the 15Five rhythm.
- **Recognition points** as a PMS-owned ledger (Leapsome) — manual award + an
  optional auto-award on on-time objective completion.
- **Plain-language, one-question-at-a-time, manager team dashboard, employee
  self-service** (the standing Heimdallone UX rules + the helpdesk/projects
  precedents).

### 1.3 Too heavy for MVP (explicitly deferred)

Engagement-survey analytics + sentiment + benchmarking; AI review-drafting;
compensation calibration / 9-box / succession / PIP; competency frameworks;
learning/LMS; goal cascade enforcement (manager↔team alignment rules); weekly
pulse surveys; ad-hoc anonymous feedback *outside* a cycle; configurable review
workflows; performance-improvement-plan tracking.

### 1.4 What a Guyana/Caribbean SMB-friendly version looks like

A small HR/ops team runs **one or two review cycles a year** plus light
quarterly goal-setting. They need: set a few goals per person (with a measurable
target and an optional "this goal is delivered by completing project task X");
update progress with a slider/number from a phone; run an annual 360 where the
manager, a couple of peers, and the person themselves answer 5–8 plain questions
*one at a time*; have a 1-on-1 with a note; and recognise good work with a few
points. No OKR jargon walls, no 30-question forms, no calibration spreadsheets.

### 1.5 Where Performance differs from Projects tasks and Helpdesk tickets

| | **Project task** | **Helpdesk ticket** | **Goal / Review** |
|---|---|---|---|
| Question it answers | "How do we deliver this work?" | "Someone needs help" | "How is this person growing & performing?" |
| Lifespan | days–weeks | short, reactive | a quarter / a review cycle |
| Primary actor | assignee + lead | requester → agent | employee ↔ manager (+ peers) |
| Owns | status, time, milestones | SLA, routing | goals, KR progress, review responses, recognition |
| Heimdallone status | ✅ Phase 14 | ✅ Phase 13 | **this module** |

A project task **feeds** a key result (`key_result.linkedProjectTaskId`, read-only);
completing it can move KR progress — but Performance never writes back to the task.

---

## 2. Domain boundaries

| Concept | Owned by | PMS' relationship |
|---|---|---|
| **Objective / goal** | **Performance** | owns |
| **Key result** | **Performance** | owns; *reads* a linked project task's completion as a progress signal |
| **Review cycle / question template / review request + response** | **Performance** | owns |
| **1-on-1 meeting + notes** | **Performance** | owns |
| **Recognition (bonus) points** | **Performance** | owns the ledger (non-monetary) |
| **Project task** | **Projects** | **read-only link** (`key_result.linkedProjectTaskId`, set null); never mutated |
| **Payroll bonus / pay** | **Payroll / Finance** | **none in MVP** — points are not pay; a future Finance phase may *read* the points ledger to propose a monetary bonus. **No payroll write.** |
| **Employee / department / manager** | **HR Core** | read-only refs (restrict / set null); `reportingManagerId` drives the manager-scope + the "manager" review relationship |
| **Audit trail** | shared `createAuditEvent` | call on every mutation; **no `performance_activity` table** (reuse `audit_event`, like Projects 14H) |

**Hard rules (mirror Projects/Helpdesk):**
1. **No cross-module writes.** The Performance router never insert/update/deletes
   any table outside `performance*` (its own tables). The linked project-task id
   is tenant-**verified** SELECT-only on write and resolved **read-only** on read.
2. **Points are not pay.** No FK to payroll; no pay mutation; the points ledger is
   PMS-internal recognition.
3. **Anonymity is enforced server-side.** Peer responses are aggregated and only
   revealed when the rater-category count ≥ the threshold; individual anonymous
   responses are never returned with a respondent identity to a non-admin.
4. **Self vs manager vs peer relationship** is derived from `reportingManagerId`
   + the cycle's request rows — two-layer authz like every other module.

---

## 3. Recommended MVP entities (decided)

Convention (from `projects.ts`/`helpdesk.ts`): `id` = `cuid()`, `organizationId`
= `orgRef()`, `...timestamps`, separate `deletedAt`; `pgEnum` for enums; FK
`onDelete` = **restrict** (employee history), **set null** (optional / cross-module),
**cascade** (owned children); partial-unique for one-active-per-org + reference
uniqueness; references (`GOAL-`/`REV-`) MAX+1 with the `(org,reference)` backstop.

### MVP tables (Phase 15B) — **9 tables**

| # | Table | Purpose | Key columns (beyond id/org/timestamps/deletedAt) |
|---|---|---|---|
| 1 | **performance_objective** | a goal / OKR objective | `reference` (GOAL-000NNN), `employeeId → employee_profile` (restrict), `ownerUserId → user` (set null), `title`, `description`, `cycleId → review_cycle` (set null, optional), `status` enum, `weight int`, `startDate`, `dueDate`, `completedAt`, `progressPercent` (derived/cached), `isArchived` |
| 2 | **performance_key_result** | a measurable result under an objective | `objectiveId → performance_objective` (cascade), `title`, `progressType` enum (percentage / number / currency / boolean), `startValue`, `currentValue`, `targetValue` (numeric), `status` enum, `linkedProjectTaskId → project_task` (**set null, read-only signal**) |
| 3 | **review_cycle** | a named review period | `reference` (REV-000NNN), `name`, `type` enum (self / manager / 360 / upward), `startDate`, `endDate`, `status` enum, `questionTemplateId → question_template` (set null), `anonymityThreshold int` (default 3), `isAnonymousPeers boolean` |
| 4 | **question_template** | reusable question set | `name`, `description`, `isArchived` |
| 5 | **review_question** | one question in a template | `templateId → question_template` (cascade), `text`, `type` enum (text / rating / boolean / multi_choice / likert), `options` jsonb, `displayOrder` |
| 6 | **review_request** | the 360 fan-out: one (subject, reviewer, relationship) per cycle | `cycleId → review_cycle` (cascade), `subjectEmployeeId → employee_profile` (restrict), `reviewerEmployeeId → employee_profile` (restrict), `relationship` enum (self / manager / peer / report), `status` enum (pending / in_progress / submitted / declined), `submittedAt`, unique `(cycle, subject, reviewer)` |
| 7 | **review_response** | one answer to one question on a request | `requestId → review_request` (cascade), `questionId → review_question` (set null), `answerText`, `answerRating int`, `answerJson` jsonb |
| 8 | **one_on_one** | a 1-on-1 meeting record | `managerEmployeeId → employee_profile` (restrict), `employeeId → employee_profile` (restrict), `scheduledAt`, `status` enum (scheduled / completed / cancelled), `sharedNotes`, `privateManagerNotes` (**redacted from the employee server-side**) |
| 9 | **recognition_point** | the PMS-owned recognition ledger | `employeeId → employee_profile` (restrict), `points int`, `reason`, `source` enum (manual / objective_completed), `awardedByUserId → user` (set null), `objectiveId → performance_objective` (set null) |

**Activity feed (decision):** reuse the shared **`audit_event`** log (the Projects
14H precedent) — **no `performance_activity` table**.

### Deferred entities / columns (reserved, not built in 15B)

- `anonymous_feedback` (ad-hoc, outside a cycle) — **deferred**; anonymity is a
  cycle flag in MVP.
- `meeting_question` / `meeting_response` (templated 1-on-1s) — **deferred**;
  1-on-1 is notes-only in MVP.
- `competency` / `competency_rating`, `pip`, `calibration_session`, `nine_box` —
  **deferred**.
- `objective_template` (org default goal sets) — **deferred** (objectives are
  created directly in MVP; templating is a fast-follow, like Leave-policy
  templates).
- `check_in` (weekly pulse) — **deferred** (1-on-1 covers the rhythm for MVP).
- points → pay conversion — **no column, no FK**; a Finance concern that would
  *read* `recognition_point`.

### Decided answer to "create all?" — **NO.** MVP = the 9 tables above.

---

## 4. Lifecycles & enums

- **Objective status** (`objective_status`): `draft` · `active` · `on_track` ·
  `at_risk` · `behind` · `completed` · `cancelled`. (`on_track`/`at_risk`/`behind`
  may also be **derived** from progress-vs-time, but a stored status is fine since
  objectives are explicitly managed; **`progressPercent` is derived from the key
  results** and cached on write.)
- **Key-result status** (`key_result_status`): `not_started` · `on_track` ·
  `at_risk` · `done`. Progress % = `(current − start) / (target − start)` clamped
  0–100 (boolean type → 0 or 100).
- **Review-cycle status** (`review_cycle_status`): `draft` · `active` · `closed` ·
  `cancelled`. Terminal `closed`/`cancelled` reject new requests/responses.
- **Review-request status** (`review_request_status`): `pending` · `in_progress` ·
  `submitted` · `declined`. Terminal `submitted`/`declined` reject edits.
- **Review relationship** (`review_relationship`): `self` · `manager` · `peer` ·
  `report`.
- **Question type** (`question_type`): `text` · `rating` · `boolean` ·
  `multi_choice` · `likert`.
- **One-on-one status** (`one_on_one_status`): `scheduled` · `completed` ·
  `cancelled`.
- **Recognition source** (`recognition_source`): `manual` · `objective_completed`.

**Transition rules (mirror the dedicated-proc discipline):** `changeStatus` /
`complete` / `close` procs; terminal states reject working-state transitions;
the server is the boundary, the UI only hides invalid transitions.

---

## 5. Views

**Module-level tabs** (`PerformanceTabs`, per-module — copy the
`projects-tabs`/`helpdesk-tabs` recipe; no shared ModuleTabs):
Overview · Goals · Reviews · *(Recognition)* · My Goals · My Reviews ·
*(Settings — templates/cycles, later)*.

- **Overview** (`/app/performance`) — status tiles (active goals / at-risk goals /
  open review cycles / pending reviews) + a "Needs attention" panel (overdue
  goals, at-risk KRs, review requests due, 1-on-1s due). Employee → a **landing
  that links to My Goals / My Reviews** (NOT a render-time redirect — lesson #84).
- **Goals** (`/app/performance/goals`) — filterable list (status / cycle / owner /
  search); a manager sees own + direct reports; HR sees all.
- **Goal detail** (`/app/performance/goals/$id`) — objective + KR progress
  (sliders / number inputs), the optional linked-project-task chip (read-only),
  recognition awarded.
- **Reviews** (`/app/performance/reviews`) — review cycles list + a cycle detail
  showing the request matrix (subject × relationship) and aggregated results
  (peer results gated by the anonymity threshold).
- **My Goals** (`/app/performance/my-goals`) — the caller's own objectives
  (self-scoped, `mine`).
- **My Reviews** (`/app/performance/my-reviews`) — review requests assigned **to
  me** (one question at a time) + my self-review.
- **Recognition** — a simple points feed + award action (manager/HR).

**Deferred views:** analytics dashboards, calibration, settings (templates/cycle
builder ship as a later sub-phase once the core flows are proven).

---

## 6. RBAC model

### No new role needed.
The existing 10 roles cover PMS. **Do NOT add a performance-specific role** —
HR (`hr_admin`) runs cycles/templates, `manager` reviews + sets reports' goals,
`employee` self-reviews + owns their goals, `auditor`/`payroll_admin` read.

### AC resources — **mostly already defined**
`appraisal` and `goal` already exist in `permissions.ts` (statement + per-role
grants) but are **not yet consumed by any router** — so 15C will be the first to
use them and the audit count **rises** (the 13B `ticket:approve` / 14C precedent).

```
goal:       ["create", "read", "update", "complete"]                         (exists)
appraisal:  ["create", "read", "submit", "review", "finalize", "manage"]     (exists)
recognition:["read", "award"]                                                 (NEW — add in 15B)
```
- Goals/objectives + key results gate on `goal:*`.
- Review cycles / templates / requests / responses gate on `appraisal:*`
  (`manage` = cycle/template admin; `review` = answer a request; `submit` =
  submit own self-review; `finalize` = close a cycle).
- 1-on-1s gate on `appraisal:read`/`appraisal:review` (manager-scoped).
- Recognition points gate on the **new `recognition:[read, award]`** resource
  (HR/manager award; everyone reads their own). Adding it is mechanical (mirrors
  13B `ticket:approve`); audit reflects it once 15C consumes it.

### Per-role grants (verify against existing in 15B)
| Role | goal | appraisal | recognition |
|---|---|---|---|
| owner / admin / hr_admin | full | full | read, award |
| manager | create/read/update (own + reports) | read, submit, review (scoped) | read, award (reports) |
| employee | full (own) | read, submit (own) | read (own) |
| payroll_admin | read | read | read |
| auditor | read | read | read |
| recruiter / helpdesk_agent / project_manager | — | — | — |

### Two-layer authz (mirror Projects)
1. **AC gate** — `authorizedProcedure("goal"|"appraisal"|"recognition", action)`.
2. **Handler scope (IDOR layer)** — `seesAllPerformance` (HR ∪ auditor ∪
   payroll_admin) sees all; a **manager** sees own + direct reports
   (`getDirectReportIds(me.id, oid)` — **always pass `oid`**, lesson 13H); an
   **employee** sees only their own goals / their own review requests / their own
   recognition. `assertObjectiveVisible` / `assertReviewRequestVisible` gate
   single-row reads.
3. **Manager private-note redaction** — `one_on_one.privateManagerNotes` stripped
   server-side from the employee (mirrors helpdesk/projects internal-note
   redaction; UI hiding is insufficient).
4. **Anonymity enforcement** — peer review responses returned **aggregated only**
   (no respondent id) to anyone but `appraisal:manage`; an individual peer answer
   is never revealed below the cycle's `anonymityThreshold`.

**Audit delta:** `audit:permissions` counts distinct `(resource,action)` pairs +
routers. PMS adds 1 router + the `goal`/`appraisal`/`recognition` pairs it uses →
**109/14 → ~122/15** (exact = distinct pairs referenced; `recognition` is the
only genuinely new resource, +2 pairs; `goal`/`appraisal` already in the
statement). Define `recognition` in `statement` before writing the router.

---

## 7. API plan (oRPC router `performance`, Phase 15C)

Every input id tenant-verified; every list/single-read lateral-scoped; the linked
project-task id verified SELECT-only on write and resolved read-only on read; the
Performance router contains **zero writes** to any non-`performance*` table.

```
goals.list / getById / create / update / changeStatus / complete / archive   (goal:*)
goals.keyResults.add / update / updateProgress / remove                       (goal:update)
goals.mine                                                                    (goal:read, self)
cycles.list / getById / create / update / activate / close                   (appraisal:manage / finalize)
cycles.templates.list / create / addQuestion / updateQuestion                (appraisal:manage)
cycles.requests.list / generate (fan-out self+manager+peers+reports)         (appraisal:manage)
reviews.assignedToMe / getRequest                                            (appraisal:review, self-scope)
reviews.saveResponse / submit / decline                                      (appraisal:submit/review)
reviews.results (aggregated; anonymity-thresholded)                          (appraisal:read, scoped)
oneOnOnes.list / create / complete / cancel  (privateManagerNotes redacted)  (appraisal:review, scoped)
recognition.list / award / mine                                             (recognition:read/award)
activity.list  (reads shared audit_event for the objective/cycle)            (goal:read | appraisal:read)
```

**Self-service guarantees:** `goals.mine` / `reviews.assignedToMe` /
`recognition.mine` force self-scope (the helpdesk/projects `mine` precedent); an
employee may only edit their own goals + answer requests assigned to them.
**Auto-award seam:** when an objective is completed *on time*, the server MAY
insert one `recognition_point` row (`source = objective_completed`) — this is a
PMS-internal write, configurable, never a payroll write.

---

## 8. UI plan (Phase 15D–15H)

**Routes (folder-routes day one — no flat stub, route-shadow gotcha):**
```
/app/performance                overview (index.tsx)
/app/performance/goals          goals list
/app/performance/goals/$id      goal detail (KR progress)
/app/performance/reviews        review cycles list
/app/performance/reviews/$id    cycle detail (request matrix + aggregated results)
/app/performance/my-goals       My Goals (self-scoped)
/app/performance/my-reviews     My Reviews (answer one question at a time)
```
*(Recognition + Settings/templates routes — later sub-phases.)*

**Sidebar:** add a "Performance" nav (lucide `Target` or `TrendingUp`) to the
**People** group; add `performance` to the employee/manager/HR visible-key sets
(recruiter/helpdesk_agent/project_manager do not get it). **Budget for lesson
#83** (route.tsx a11y/lint debt — clear in-checkpoint or defer the entry).

**Primitive reuse:** `DataTable`, `EmptyState`, `Badge`/StatusBadge,
`ConfirmDialog`/`Sheet`; **progress sliders/number inputs** for KR updates
(greenfield — a simple `<input type=range>` + number, not a charting lib);
**one-question-at-a-time wizard** for review answering (copy the onboarding
TaskChecklist *rhythm*, not the component). New
`apps/web/src/styles/performance.css` + `features/performance/{labels,badge,
performance-tabs,types}` (copy the projects recipe).

---

## 9. UX requirements

- **Plain language, no OKR jargon walls.** "Goal" not "Objective" in employee
  copy; a one-line tooltip explains "what you want to achieve" vs "how you measure
  it". Labels via `features/performance/labels.ts` — **no raw enums**.
- **One question at a time** for reviews (the #1 anti-fatigue lever); a progress
  bar ("3 of 8"); save-as-you-go.
- **Progress is a slider/number, not a form** — update a KR's current value in one
  tap; the objective % recomputes server-side.
- **Manager team dashboard** — all direct reports' goal progress at a glance;
  one-click "request review".
- **Anonymity is visible and honest** — "Peer feedback is shown only when at least
  3 people have responded" copy; never imply individual attribution.
- **Loading / Empty / Error triad** on every list & detail (the 13H "error ≠
  healthy empty" rule; the 14I `isError`-branch fix applies — include it from day
  one). `:focus-visible` rings (lesson #86), `aria-labelledby` on dialogs (#75),
  text-bearing badges, `enabled: canView…` query gating.
- **Mobile-friendly** goal progress + review answering (phone-first).

---

## 10. Integration plan (link, never own)

| Module | Link | MVP scope | Rule |
|---|---|---|---|
| **Projects** | `key_result.linkedProjectTaskId → project_task` (set null) | reserve column + read-only "linked task" chip + read the task's `completedAt` as a progress hint | **no Projects mutation**; deep-link only (Projects 14A reserved this seam) |
| **HR Core** | `employee_profile` / `department` / `reportingManagerId` | drives manager scope + the "manager" review relationship | read-only refs |
| **Payroll / Finance** | recognition points | **none in MVP** — points are NOT pay; no FK, no write | a future Finance phase may *read* `recognition_point` to propose a monetary bonus; **Performance never writes payroll** |
| **Audit** | shared `audit_event` | Activity tab reads it (no `performance_activity` table) | call `createAuditEvent` on every mutation |
| **Generic** | (reserved) | a future `linkedEntityType/Id` escape hatch if needed | context/deep-link only |

All real cross-module FKs are `ON DELETE SET NULL`; the linked task id is
tenant-verified on write (SELECT-only) and resolved read-only on read; the
Performance router contains **zero writes** to any non-`performance*` table
(enforced + grep-verified in 15I, like Projects 14I / Helpdesk 13H).

---

## 11. Seed plan (Atlas Shipping, idempotent — Phase 15B)

Realistic, mirroring the projects/helpdesk seed discipline (idempotent
delete-then-insert; references `GOAL-000001…`, `REV-000001…`):

- **Objectives (~8):** spread across statuses (draft/active/on_track/at_risk/
  behind/completed/one cancelled), 2–3 employees incl. a manager + reports; **1
  key result linked to a real seeded `project_task`** (exercise the read-only
  signal); weights + due dates incl. one overdue.
- **Key results:** 2–4 per objective across percentage/number/currency/boolean
  progress types with realistic current/target.
- **Review cycle (1 active 360):** a question template (~6 questions across all
  types) + generated requests (self + manager + 2 peers + 1 report for one
  subject) with mixed statuses (pending/in_progress/submitted) + a few responses
  (enough to exercise the anonymity threshold both above and below).
- **1-on-1s (~3):** scheduled/completed, one with `privateManagerNotes` (to prove
  redaction).
- **Recognition (~5):** manual awards + 1 auto (`objective_completed`).
- **Activity:** none seeded — the Activity tab reads `audit_event` (documented as
  "fills as work happens").

Must pass an idempotent re-run check + an invariant check (one self-request per
subject per cycle; references unique per org; no orphaned links; anonymity
threshold honoured).

---

## 12. Implementation sequence

| Phase | Deliverable | Gate focus |
|---|---|---|
| **15A** | This research + spec (`performance-pms-implementation-plan.md`) | docs only; gates unchanged |
| **15B** | DB schema (9 tables + enums) + migration `0018` + `recognition` AC resource + verify per-role grants + idempotent seed | migration clean; seed idempotent; audit reflects new pairs once router lands |
| **15C** | oRPC `performance` router (the §7 procs) + RBAC helpers (byte-aligned) + `verify-performance-api.ts` + two-layer authz + private-note + anonymity redaction + reference allocation | verify NN/NN; audit ~122/15; **zero cross-module writes** |
| **15D** | Overview + Goals list + `PerformanceTabs` + sidebar entry | browser RBAC; loading/empty/error+isError; lesson #83 |
| **15E** | Goal detail + key-result progress (sliders) + linked-task chip + recognition | scope/redaction in browser |
| **15F** | Review cycles + question templates + request fan-out + **answer-one-at-a-time** + aggregated results (anonymity) | anonymity threshold proof; redaction |
| **15G** | My Goals + My Reviews + 1-on-1s (private-note redaction) | self-scope proof; private-note redaction |
| **15H** | Recognition feed + auto-award-on-objective-complete + Activity tab (audit-backed) | points-not-pay proof; no payroll write |
| **15I** | QA/RBAC/security/browser pass (read-only review agents) → close Phase 15 | guardrail held (grep zero cross-module writes); IDOR/redaction/anonymity re-proven; gates |

(Points → pay conversion = **Phase 16 Finance**; goal-cascade enforcement,
competencies, calibration, surveys = later.)

---

## 13. Open questions to resolve before 15B

| # | Question | **Recommendation** |
|---|---|---|
| 1 | Add a performance-specific role? | **No.** HR/manager/employee + existing grants cover it; adding a role muddies People&Payroll semantics (contrast: Projects needed `project_manager` because no role owned projects). |
| 2 | OKR-only, or also SMART/MBO? | **One flexible model** (objective + measurable key results) that also reads as a SMART goal; don't build three frameworks. |
| 3 | Bonus points = pay? | **No — PMS-owned recognition ledger, not pay.** No payroll FK/write. Points→pay is a future Finance *read* of this ledger. |
| 4 | Link goals to project tasks now? | **Yes — reserve `key_result.linkedProjectTaskId` (set null) + read-only chip + read `completedAt` signal.** The Projects 14A seam. No Projects write. |
| 5 | Anonymous feedback as its own table? | **No in MVP** — anonymity is a **cycle flag + a server-side rater threshold**. Ad-hoc anonymous feedback deferred. |
| 6 | 1-on-1s templated (questions) now? | **No** — notes-only (shared + private-manager) in MVP; templated 1-on-1s deferred. |
| 7 | Objective templates (org default goal sets)? | **Defer** — create objectives directly first (like Leave-policy templates were a fast-follow). |
| 8 | Question template: jsonb or join table? | **Join table** (`review_question`) — the house convention; enables per-question types/options/ordering. |
| 9 | Review cycle vs evaluation separate? | **One `review_cycle` with a `type`** (self/manager/360/upward); keep a 360 conceptually ≥3 months from a formal evaluation in copy/guidance, not enforced. |
| 10 | Manager private 1-on-1 notes? | **Yes — `privateManagerNotes` redacted server-side from the employee** (helpdesk/projects internal-note precedent). |

These are recommendations baked into the plan; 15B proceeds on them unless overridden.

---

## 14. Roadmap update (suite groupings unchanged)

| Phase | Module | Status |
|---|---|---|
| 13 | Helpdesk / Requests | ✅ complete |
| 14 | Projects + Tasks / Timelines | ✅ complete (`9e5d1cf`) |
| **15** | **Performance / PMS** | **active — 15A spec (this doc)** |
| 16 | Finance expansion (costing, points→pay, bank exports) | queued |
| 17 | CRM (spec drafted) | queued |
| 18 | Analytics / executive dashboards | queued |
| 19 | Enterprise QA / accessibility / security | queued |
| 20 | Production readiness | queued |

**People & Payroll** group gains Performance. Future modules stay hidden/queued in
the sidebar until their phase begins.

---

**Next phase: Phase 15B — Performance DB schema (9 tables + enums) + migration
`0018` + the `recognition` AC resource + per-role grant verification + idempotent
Atlas Shipping seed.**

Sources (live research, June 2026):
- [Lattice vs 15Five vs Culture Amp — Outsail](https://www.outsail.co/post/lattice-vs-15five-vs-culture-amp-performance)
- [Best performance management tools 2025 — FlexOS](https://www.flexos.work/tool-review/best-employee-performance-management-tools)
- [Best PMS for SMBs 2025 — ThriveSparrow](https://www.thrivesparrow.com/tools/performance-management-system-for-small-business)
- [360 feedback complete guide — Peoplebox](https://www.peoplebox.ai/blog/360-performance-review/)
- [360 feedback for small business — Business.com](https://www.business.com/articles/360-feedback/)
- [Setting up a 360 feedback cycle — Small Improvements](https://resources.small-improvements.com/knowledge-base/setting-up-a-360o-feedback-cycle/)
