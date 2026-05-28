# Recruitment + Onboarding Implementation Plan

**Phase 9A deliverable.** Spec-only. No code, no schema, no migrations.

Builds on the conventions established in Phases 5–8: tenant-scoped FKs verified in API, plain-language UX, ModuleTabs per multi-page module, normalized RBAC helpers (`canManageHR` / `canManagePayroll` / etc.), EmptyState for loaded-but-empty tables, money/IDs never exposed as primary labels, and an explicit "what to do next" hint on every workflow screen.

Source references reviewed:
- `docs/architecture/modules/implementation-sequence.md`
- `docs/architecture/shared-ui-primitives-plan.md`
- `docs/reviews/phase-8j1-screenshot-ux-audit.md`
- `docs/architecture/hr-core-schema-spec.md` + `hr-core-api-spec.md`
- `docs/architecture/contracts-implementation-plan.md`
- `docs/horilla-extraction/recruitment.md` + `onboarding.md`
- `docs/architecture/modules/recruitment-spec.md` + `onboarding-spec.md`
- `docs/research/odoo-hrms-feature-review.md`

---

## Table of Contents

1. Scope
2. Design Decisions
3. Proposed Entities — Recruitment
4. Proposed Entities — Onboarding
5. Status Lifecycles
6. UI Plan
7. RBAC and Security
8. Candidate-to-Employee Conversion Flow
9. Analytics and Reporting
10. Implementation Sequence (9A–9I)
11. Open Questions
12. Deferred / Out of Scope
13. Acceptance Criteria for 9A

---

## 1. Scope

### Recruitment — MVP includes
- Hiring requests (requisitions) with approval flow
- Job openings / posts (internal only — public careers page deferred)
- Candidate profiles with resume/CV file attachments
- Pipeline stages per opening (drag-and-drop kanban + list view)
- Interview scheduling (single + panel)
- Interview feedback + per-evaluator candidate ratings
- Offer creation, approval, sent/accepted/rejected/expired lifecycle
- Offer letter file attachment (no e-sign yet)
- Candidate documents (offer signed, ID, qualifications)
- Internal notes per candidate / per stage
- Candidate-to-employee conversion handoff
- Recruitment analytics (open jobs, candidates per stage, time-to-hire, offer acceptance rate)

### Recruitment — Deferred
- Public careers page / job board posting
- Candidate self-service portal
- Bulk CSV candidate import
- LinkedIn / Indeed integration
- Resume parsing
- AI candidate summarization / scoring
- Email templates and outbound email automation
- Calendar provider integration (Google / O365)
- e-signature on offers
- Skill zones / talent pools as standalone entity
- Recruitment survey / assessment templates

### Onboarding — MVP includes
- Reusable onboarding templates (snapshot per use)
- Template tasks with role-based default assignees
- Per-employee onboarding instance
- Onboarding tasks with assignee + due date + status
- Document collection (request + upload) checklist
- Policy acknowledgement checklist
- Equipment / account-setup checklist (Asset module not required yet — string placeholders)
- Department / manager assignment confirmation
- Contract creation handoff to the Contracts module
- Employee profile creation handoff to HR Core
- First-day checklist preset
- Onboarding progress dashboard (% complete, overdue, blockers)

### Onboarding — Deferred
- Probation tracking and review cycles (Phase 13 alongside PMS)
- Welcome email automation
- Self-service portal for new hires
- Gantt / dependency graph between tasks
- Automated task assignment by department / position
- Document e-signature
- Integration with IT systems (account provisioning)

---

## 2. Design Decisions

### 2.1 `recruitment_requisition` vs `job_opening` — keep both

**Decision:** Separate `recruitment_requisition` (the *request to hire*) from `job_opening` (the *active hiring effort*). Horilla collapses both into `Recruitment`; we don't.

**Why:** A requisition has its own approval lifecycle (`draft → pending_approval → approved → cancelled`). Multiple openings can be created from one approved requisition (e.g. "open 3 driver positions in Berbice"). Splitting them keeps the approval audit clean and lets the same requisition spawn additional vacancies later without re-approving the original headcount need.

**Acceptable simplification:** when a requisition has exactly one opening (the common case), the UI can collapse them into a single "Hiring Request → Open" wizard. The two tables stay; the UI just hides the requisition card if only one opening exists.

### 2.2 Snapshot the template into the onboarding instance

**Decision:** When an onboarding instance is created from a template, **snapshot** the template tasks into `onboarding_task` rows. Editing the template later does NOT mutate in-flight onboardings.

**Why:** Same pattern as payslip line items — once an onboarding starts, the new hire and their manager have agreed to a specific plan. Mutating it under them creates audit ambiguity.

**Mechanic:** `onboarding_task` carries `templateTaskId` (nullable FK to source template task) and `titleSnapshot` / `descriptionSnapshot` (denormalised from template at creation time). Future template edits don't propagate.

### 2.3 No separate `recruitment_stage` table — use enum-driven defaults + per-opening override JSON

**Decision:** Pipeline stages are NOT first-class rows. We use a canonical enum (`new → screening → shortlisted → interview → offer → hired | rejected | withdrawn`) and store a per-opening `pipelineConfig` JSONB override for orgs that want custom stage names (e.g. "Phone screen" vs "Screening").

**Why:** Horilla makes Stage a row, but in practice 90% of orgs use the default 7-stage pipeline. Keeping it enum-driven with a soft override avoids a whole CRUD surface for stages, simplifies analytics, and still lets advanced users rename / hide stages.

**Tradeoff:** Removing a stage retroactively orphans cards in that stage. The override schema must enforce that all candidate-occupied stages remain selectable; deletions are soft (hide) only.

### 2.4 Soft-delete + status enums over hard delete

Consistent with HR Core: `deletedAt` timestamp, status enums for lifecycle, `archived` for older records. Never hard-delete candidates (legal / audit requirement). Cancelled requisitions and withdrawn candidates stay in DB with their final status.

### 2.5 Resume / candidate documents — file storage decision deferred to 9C

Resume URLs and offer-letter URLs are `text` columns at the schema layer. The actual upload mechanism (S3 / R2 / local disk / Better Auth file plugin) is an **API-layer concern**, addressed in Phase 9C. Phase 9B just defines the column shape and a `candidate_document` table for arbitrary attachments.

### 2.6 Money in offers uses the same precision rules as Payroll

`offerBaseAmount`, `offerVariableAmount`, etc. use `numeric(12,2)` matching `pay_item.fixedAmount`. Currency follows the org's payroll default unless explicitly overridden on the offer. Future cross-currency offers would add `currency` + `currencyRateSnapshot` columns.

### 2.7 "Hiring manager" is a role assigned per-opening, not a separate user role

**Decision:** `hiring_manager` is NOT in the org-level role enum. Instead, an employee is named `hiringManagerEmployeeId` on each `job_opening`. Their permissions on that opening are derived: they can read candidates, schedule interviews, and submit feedback — but not approve offers (HR / org admin signs off).

**Why:** Adding `hiring_manager` to the global org role would require touching the ACL + every RBAC helper. Per-opening assignment is cheaper, more accurate (managers change between hires), and naturally tenant-scoped.

### 2.8 Conversion is one atomic API procedure

`recruitment.candidates.convertToEmployee` is transactional: candidate → employee_profile + employee_work_info + (optional) contract draft + (optional) onboarding instance + audit event, all in one DB transaction. If any step fails, the candidate stays in `offer.status = accepted` and no employee record is created.

---

## 3. Proposed Entities — Recruitment

All entities are tenant-scoped via `organizationId text NOT NULL FK → organization.id`. Money uses `numeric(12,2)`. Timestamps are `timestamp with default now()` plus `$onUpdate`. Primary keys are cuid2 `text`.

### 3.1 `recruitment_requisition` — the request to hire

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK, cuid2 | |
| organizationId | text | FK, NOT NULL | |
| title | text | NOT NULL | e.g. "Two drivers for Berbice route" |
| description | text | nullable | Business justification |
| jobPositionId | text | FK → job_position, nullable | Optional pre-link to canonical position |
| departmentId | text | FK → department, nullable | |
| headcount | integer | NOT NULL, default 1 | Total positions requested |
| requestedByEmployeeId | text | FK → employee_profile, NOT NULL | Hiring manager / requester |
| status | requisitionStatusEnum | NOT NULL, default 'draft' | |
| approvedByUserId | text | FK → user, nullable | |
| approvedAt | timestamp | nullable | |
| rejectedReason | text | nullable | |
| createdAt / updatedAt / deletedAt | timestamp | | Standard |

**Indexes**: (organizationId), (organizationId, status), (departmentId).
**Audit**: status transitions, approval events.

### 3.2 `job_opening` — the active hiring effort

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| requisitionId | text | FK → recruitment_requisition, nullable | Nullable for fast-track hires |
| title | text | NOT NULL | User-visible job title |
| description | text | nullable | |
| jobPositionId | text | FK → job_position, nullable | |
| departmentId | text | FK → department, nullable | |
| workLocation | text | nullable | |
| employmentType | text | nullable | "full_time" / "part_time" / "contract" — mirrors contracts spec |
| vacancyCount | integer | NOT NULL, default 1 | |
| hiringManagerEmployeeId | text | FK → employee_profile, nullable | See decision 2.7 |
| recruiterUserId | text | FK → user, nullable | Primary recruiter |
| pipelineConfig | jsonb | nullable | Per-opening stage rename/hide overrides |
| status | jobOpeningStatusEnum | NOT NULL, default 'draft' | |
| publishedAt | timestamp | nullable | When status first hit 'open' |
| closedAt | timestamp | nullable | |
| startDate | date | nullable | Posting visible from |
| endDate | date | nullable | Application deadline |
| createdAt / updatedAt / deletedAt | | | |

**Indexes**: (organizationId, status), (organizationId, hiringManagerEmployeeId), (requisitionId).
**Audit**: status transitions, publishedAt, closedAt, hiring manager assignment.

### 3.3 `candidate` — the person

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| firstName | text | NOT NULL | |
| lastName | text | nullable | |
| email | text | NOT NULL | |
| phone | text | nullable | |
| country | text | nullable | ISO 3166-2 |
| source | candidateSourceEnum | NOT NULL, default 'direct' | |
| referrerEmployeeId | text | FK → employee_profile, nullable | For referrals |
| resumeUrl | text | nullable | See decision 2.5 |
| portfolioUrl | text | nullable | |
| dateOfBirth | date | nullable | Sensitive — masked for non-HR |
| gender | text | nullable | Sensitive |
| address | text | nullable | Sensitive |
| linkedinUrl | text | nullable | |
| status | candidateStatusEnum | NOT NULL, default 'active' | Top-level: active / inactive_pool / blocked |
| convertedEmployeeId | text | FK → employee_profile, nullable, UNIQUE | Conversion link |
| createdAt / updatedAt / deletedAt | | | |

**Unique**: (organizationId, email) — same candidate can apply once per tenant; we don't dedupe across the world.
**Indexes**: (organizationId, status), (organizationId, email), (convertedEmployeeId).
**Audit**: status transitions, conversion event.
**Privacy**: DOB, gender, address — visible to HR/recruiter only; never returned in API to hiring_manager scope.

### 3.4 `candidate_application` — a candidate applied to a specific opening

A candidate can have multiple applications across different openings.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| candidateId | text | FK → candidate, NOT NULL | |
| jobOpeningId | text | FK → job_opening, NOT NULL | |
| stage | applicationStageEnum | NOT NULL, default 'new' | |
| stageEnteredAt | timestamp | NOT NULL, default now | Updated on every stage move |
| ratingAverage | numeric(3,2) | nullable | Cached from candidate_rating |
| ratingCount | integer | NOT NULL, default 0 | |
| appliedAt | timestamp | NOT NULL, default now | |
| rejectedReason | rejectionReasonEnum | nullable | If stage = rejected |
| rejectedFeedback | text | nullable | Internal note |
| withdrawnAt | timestamp | nullable | |
| createdAt / updatedAt / deletedAt | | | |

**Unique**: (candidateId, jobOpeningId) — one application per candidate per opening. Re-apply requires re-opening or creating a new opening.
**Indexes**: (organizationId, stage), (jobOpeningId, stage), (candidateId).
**Audit**: every stage transition + final outcome.

### 3.5 `application_stage_history` — audit-grade stage transition log

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| applicationId | text | FK → candidate_application, NOT NULL | |
| fromStage | applicationStageEnum | nullable | Null = initial application |
| toStage | applicationStageEnum | NOT NULL | |
| changedByUserId | text | FK → user, NOT NULL | |
| changedAt | timestamp | NOT NULL, default now | |
| note | text | nullable | |

**Indexes**: (applicationId, changedAt), (organizationId, toStage).

### 3.6 `interview`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| applicationId | text | FK → candidate_application, NOT NULL | |
| scheduledStart | timestamp | NOT NULL | Stored UTC, displayed in tenant TZ |
| scheduledEnd | timestamp | nullable | |
| location | text | nullable | "Office room 2" or video URL |
| interviewType | text | nullable | "phone" / "in_person" / "video" / "panel" |
| interviewerEmployeeIds | jsonb | NOT NULL | Array of employeeProfile.id |
| status | interviewStatusEnum | NOT NULL, default 'scheduled' | |
| notes | text | nullable | Recruiter prep notes (not shared with candidate) |
| createdAt / updatedAt / deletedAt | | | |

**Indexes**: (organizationId, scheduledStart), (applicationId).
**Audit**: status transitions, reschedules.

### 3.7 `interview_feedback`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| interviewId | text | FK → interview, NOT NULL | |
| interviewerEmployeeId | text | FK → employee_profile, NOT NULL | |
| rating | integer | NOT NULL, CHECK rating BETWEEN 1 AND 5 | |
| recommend | feedbackRecommendEnum | NOT NULL | strong_hire / hire / no_hire / strong_no_hire |
| strengths | text | nullable | |
| concerns | text | nullable | |
| notes | text | nullable | |
| submittedAt | timestamp | NOT NULL, default now | |

**Unique**: (interviewId, interviewerEmployeeId) — one feedback per interviewer per interview.

### 3.8 `offer`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| applicationId | text | FK → candidate_application, NOT NULL | |
| status | offerStatusEnum | NOT NULL, default 'draft' | |
| currency | text | NOT NULL, default org's payroll currency | |
| baseAmount | numeric(12,2) | NOT NULL | Annual or monthly per `baseAmountFrequency` |
| baseAmountFrequency | text | NOT NULL, default 'monthly' | "annual" / "monthly" / "hourly" |
| variableAmount | numeric(12,2) | nullable | Bonus / commission target |
| startDate | date | nullable | Proposed start |
| expiresAt | timestamp | nullable | Offer expiry deadline |
| letterUrl | text | nullable | Signed PDF storage (when e-sign lands) |
| approvalRequired | boolean | NOT NULL, default true | False = offer can be sent without org-admin sign-off |
| approvedByUserId | text | FK → user, nullable | |
| approvedAt | timestamp | nullable | |
| sentAt | timestamp | nullable | |
| respondedAt | timestamp | nullable | Accept / reject timestamp |
| withdrawnAt | timestamp | nullable | |
| createdAt / updatedAt / deletedAt | | | |

**Indexes**: (organizationId, status), (applicationId).
**Audit**: every status transition is logged. Approval and acceptance are high-value audit events.
**Privacy**: `baseAmount` / `variableAmount` only visible to roles passing `canManagePayroll(role)` (matches the contracts salary-visibility rule).

### 3.9 `offer_approval` — multi-stage approval chain (future-friendly)

For Phase 9 MVP this table holds at most one row per offer. Schema allows multi-step approvals later.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| offerId | text | FK → offer, NOT NULL | |
| approverUserId | text | FK → user, NOT NULL | |
| sequence | integer | NOT NULL, default 1 | Order in chain |
| status | approvalStatusEnum | NOT NULL, default 'pending' | |
| decidedAt | timestamp | nullable | |
| comment | text | nullable | |

### 3.10 `candidate_document`

Generic attachments per candidate (offer signed, ID, certificates).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| candidateId | text | FK → candidate, NOT NULL | |
| applicationId | text | FK → candidate_application, nullable | Some docs are candidate-level, some are per-application |
| documentType | text | NOT NULL | "resume" / "offer_signed" / "id_card" / "qualification" / "other" |
| fileUrl | text | NOT NULL | |
| fileName | text | NOT NULL | |
| fileSizeBytes | integer | nullable | |
| mimeType | text | nullable | |
| uploadedByUserId | text | FK → user, NOT NULL | |
| createdAt / deletedAt | | | |

**Audit**: upload + delete events. Document downloads are NOT audited at MVP (would create write traffic on every read).

### 3.11 `recruitment_note`

Free-form internal note pinned to a candidate or application.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| candidateId | text | FK → candidate, NOT NULL | |
| applicationId | text | FK → candidate_application, nullable | |
| stage | applicationStageEnum | nullable | Stage context at time of note |
| authorUserId | text | FK → user, NOT NULL | |
| body | text | NOT NULL | |
| createdAt / updatedAt / deletedAt | | | |

---

## 4. Proposed Entities — Onboarding

### 4.1 `onboarding_template`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| name | text | NOT NULL | |
| description | text | nullable | |
| isDefault | boolean | NOT NULL, default false | One default per org for fast-start |
| createdAt / updatedAt / deletedAt | | | |

**Unique**: (organizationId, name) when not deleted.

### 4.2 `onboarding_template_task`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| templateId | text | FK → onboarding_template, NOT NULL | |
| title | text | NOT NULL | |
| description | text | nullable | |
| category | onboardingCategoryEnum | NOT NULL | document / equipment / policy / training / introduction / other |
| defaultAssigneeRole | text | nullable | "hr_admin" / "manager" / "new_hire" / "it_admin" — string until IT module exists |
| dueOffsetDays | integer | NOT NULL, default 0 | Days from onboarding start |
| sortOrder | integer | NOT NULL, default 0 | |
| isRequired | boolean | NOT NULL, default true | |
| createdAt / updatedAt / deletedAt | | | |

### 4.3 `employee_onboarding`

The per-hire instance.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| employeeId | text | FK → employee_profile, NOT NULL | |
| applicationId | text | FK → candidate_application, nullable | Link back if started from a hire |
| templateId | text | FK → onboarding_template, nullable | Snapshot source |
| startedAt | timestamp | NOT NULL, default now | |
| targetCompletionAt | timestamp | nullable | startedAt + max(template task offset) |
| completedAt | timestamp | nullable | |
| status | onboardingStatusEnum | NOT NULL, default 'in_progress' | |
| createdAt / updatedAt / deletedAt | | | |

**Indexes**: (organizationId, status), (employeeId).

### 4.4 `onboarding_task`

Per-instance task. Snapshot of template task at creation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| onboardingId | text | FK → employee_onboarding, NOT NULL | |
| templateTaskId | text | FK → onboarding_template_task, nullable | Nullable for ad-hoc tasks added later |
| titleSnapshot | text | NOT NULL | |
| descriptionSnapshot | text | nullable | |
| category | onboardingCategoryEnum | NOT NULL | |
| assigneeEmployeeId | text | FK → employee_profile, nullable | |
| assigneeUserId | text | FK → user, nullable | For non-employee assignees (IT admin) |
| dueAt | timestamp | nullable | |
| status | onboardingTaskStatusEnum | NOT NULL, default 'todo' | |
| completedAt | timestamp | nullable | |
| completedByUserId | text | FK → user, nullable | |
| notes | text | nullable | |
| createdAt / updatedAt / deletedAt | | | |

**Indexes**: (onboardingId), (assigneeEmployeeId, status), (organizationId, dueAt).
**Audit**: status transitions, assignee changes.

### 4.5 `onboarding_document_request`

Tracks documents the new hire must upload. Generic enough to extend later for re-verification cycles.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| onboardingId | text | FK → employee_onboarding, NOT NULL | |
| onboardingTaskId | text | FK → onboarding_task, nullable | Link if requested via a task |
| documentType | text | NOT NULL | "tax_id" / "bank_statement" / "id_card" / "qualification" / "address_proof" |
| requiredFileTypes | jsonb | nullable | e.g. ["application/pdf", "image/jpeg"] |
| status | documentRequestStatusEnum | NOT NULL, default 'requested' | |
| uploadedFileUrl | text | nullable | |
| uploadedAt | timestamp | nullable | |
| reviewedByUserId | text | FK → user, nullable | |
| reviewedAt | timestamp | nullable | |
| rejectionReason | text | nullable | If status = rejected |
| createdAt / updatedAt / deletedAt | | | |

### 4.6 `onboarding_acknowledgement`

Policy / handbook acknowledgements signed by the new hire.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| onboardingId | text | FK → employee_onboarding, NOT NULL | |
| policyName | text | NOT NULL | "Code of conduct", "Acceptable use", etc. |
| policyVersion | text | nullable | |
| policyUrl | text | nullable | |
| acknowledgedAt | timestamp | nullable | |
| acknowledgedByUserId | text | FK → user, nullable | |
| createdAt | | | |

**Indexes**: (onboardingId).

### 4.7 `onboarding_activity`

Lightweight activity log for the onboarding timeline UI. Distinct from `audit_log` (which captures system-wide events); this is a per-onboarding feed.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | |
| organizationId | text | FK, NOT NULL | |
| onboardingId | text | FK → employee_onboarding, NOT NULL | |
| kind | text | NOT NULL | "task_completed" / "document_uploaded" / "comment" / "blocker_raised" / "blocker_cleared" |
| actorUserId | text | FK → user, nullable | |
| summary | text | NOT NULL | Human-readable line |
| metadata | jsonb | nullable | Optional structured payload |
| createdAt | timestamp | NOT NULL, default now | |

**Indexes**: (onboardingId, createdAt DESC).

---

## 5. Status Lifecycles

### 5.1 `requisitionStatusEnum`
```
draft → pending_approval → approved → cancelled
                       ↓
                    rejected
```
- `draft` — work in progress, not submitted.
- `pending_approval` — awaiting HR / admin sign-off.
- `approved` — can spawn job openings.
- `rejected` — terminal; reason captured.
- `cancelled` — terminal; requester or admin pulled the request.

### 5.2 `jobOpeningStatusEnum`
```
draft → open → paused → open
            ↘ closed
            ↘ cancelled
```
- `draft` / `open` / `paused` / `closed` / `cancelled`. Reopen path: `closed` → `open` is NOT allowed (create a new opening). `paused` → `open` is allowed.

### 5.3 `applicationStageEnum`
```
new → screening → shortlisted → interview → offer → hired
                                                ↘ rejected | withdrawn
```
- Terminal states: `hired`, `rejected`, `withdrawn`.
- Going backwards is allowed in the UI (with confirmation) and logged in `application_stage_history`.
- Reaching `hired` flips a derived `application.outcomeAt`.

### 5.4 `interviewStatusEnum`
`scheduled → completed | cancelled | no_show`.

### 5.5 `offerStatusEnum`
```
draft → pending_approval → approved → sent → accepted
                                          ↘ rejected
                                          ↘ expired
                                          ↘ withdrawn
```
- `withdrawn` is a recruiter-initiated terminal state at any point after `draft`.
- `expired` is auto-set when `expiresAt < now()` while in `sent` (cron job — Phase 14).

### 5.6 `onboardingStatusEnum`
`not_started → in_progress → blocked → in_progress → completed | cancelled`.
- `blocked` is set when one or more required tasks have status `blocked`.

### 5.7 `onboardingTaskStatusEnum`
`todo → in_progress → waiting → in_progress → completed | skipped | blocked`.
- `waiting` = "waiting on someone else" (e.g. waiting for IT to provision the laptop).
- `skipped` is terminal but requires a note.

### 5.8 Other enums
- `candidateSourceEnum`: direct / referral / job_board / agency / linkedin / other.
- `rejectionReasonEnum`: not_qualified / position_filled / failed_interview / failed_background_check / salary_mismatch / candidate_unresponsive / other.
- `feedbackRecommendEnum`: strong_hire / hire / no_hire / strong_no_hire.
- `approvalStatusEnum`: pending / approved / rejected.
- `documentRequestStatusEnum`: requested / uploaded / approved / rejected.
- `onboardingCategoryEnum`: document / equipment / policy / training / introduction / other.
- `candidateStatusEnum`: active / inactive_pool / blocked.

---

## 6. UI Plan

### 6.1 Routes

**Recruitment** (`apps/web/src/routes/app/recruitment/`)
- `index.tsx` — Overview dashboard
- `jobs/index.tsx` — Job list with status pills
- `jobs/$id.tsx` — Job detail (overview, applications, settings)
- `candidates/index.tsx` — Candidate list (cross-job)
- `candidates/$id.tsx` — Candidate detail
- `pipeline.tsx` — Pipeline kanban (per-job or cross-job filter)
- `interviews.tsx` — Interview list + calendar view toggle
- `offers/index.tsx` — Offer list
- `offers/$id.tsx` — Offer detail
- `reports.tsx` — Recruitment analytics

**Onboarding** (`apps/web/src/routes/app/onboarding/`)
- `index.tsx` — Overview dashboard (counts, overdue)
- `templates/index.tsx` — Template list
- `templates/$id.tsx` — Template builder
- `employees/index.tsx` — Active onboardings
- `employees/$id.tsx` — Per-employee onboarding checklist
- `tasks/index.tsx` — Cross-employee task list (for HR / IT / managers)
- `documents/index.tsx` — Document requests list
- `reports.tsx` — (deferred to 9G stretch / Phase 15)

### 6.2 ModuleTabs

Following the standard set in Phase 8J.1 (`PayrollTabs`). Each module ships a per-module tabs component under `apps/web/src/features/<module>/<module>-tabs.tsx`.

**`RecruitmentTabs`**:
| Key | Label | Group | Roles |
|---|---|---|---|
| overview | Overview | work | any view-capable |
| jobs | Jobs | work | recruiter, HR, admin/owner |
| candidates | Candidates | work | recruiter, HR, admin/owner |
| pipeline | Pipeline | work | recruiter, HR, admin/owner |
| interviews | Interviews | work | recruiter, HR, admin/owner, hiring manager (filtered) |
| offers | Offers | work | recruiter, HR, admin/owner |
| reports | Reports | reports | HR, admin/owner, auditor |

**`OnboardingTabs`**:
| Key | Label | Group | Roles |
|---|---|---|---|
| overview | Overview | work | any view-capable |
| templates | Templates | setup | HR, admin/owner |
| employees | Employees | work | HR, admin/owner, manager (filtered) |
| tasks | Tasks | work | task assignees + HR + admin/owner |
| documents | Documents | work | HR, admin/owner |

### 6.3 View modes per page

| Page | Primary view | Secondary | Empty state |
|---|---|---|---|
| Jobs list | DataTable with status pills | Card grid toggle | "No hiring requests yet — create your first one to start" + CTA |
| Job detail | Tabs: Overview / Pipeline / Settings | Inline applications table | If no applications: "No candidates have applied yet" |
| Candidates list | DataTable | Filterable | "No candidates match these filters" |
| Candidate detail | Tabs: Profile / Applications / Interviews / Notes / Documents | — | per-tab empty states |
| Pipeline | Kanban (drag-drop) | List fallback | "No active candidates in this pipeline" |
| Interviews | List + calendar toggle | — | "No interviews scheduled" |
| Offers | DataTable with status pills | — | "No offers yet" |
| Reports | Stat tiles + charts | — | "No data yet — run a hiring cycle to populate" |
| Templates list | DataTable | — | "No onboarding templates yet — start with the default 7-day plan" + CTA |
| Template builder | Two-pane: task list + edit drawer | — | "Add your first task" |
| Employee onboardings | DataTable with progress bar per row | Kanban toggle (by status) | "No active onboardings" |
| Per-employee checklist | Grouped task list with progress header | — | If template is empty: "This onboarding has no tasks yet" |

### 6.4 Plain-language UX rules (carried from 8J.1 / 8J.2)

| Internal term | UI label |
|---|---|
| recruitment_requisition | Hiring request |
| job_opening | Job |
| application_stage | Stage |
| applicationStage = "new" | Just applied |
| applicationStage = "screening" | Screening |
| applicationStage = "shortlisted" | Shortlisted |
| applicationStage = "interview" | In interviews |
| applicationStage = "offer" | Offer stage |
| applicationStage = "hired" | Hired |
| applicationStage = "rejected" | Not selected |
| applicationStage = "withdrawn" | Withdrew |
| offerStatus = "pending_approval" | Needs approval |
| offerStatus = "sent" | Sent — awaiting candidate |
| offerStatus = "accepted" | Accepted |
| offerStatus = "expired" | Expired |
| onboardingStatus = "blocked" | Needs review |
| onboardingTaskStatus = "waiting" | Waiting on someone |
| onboardingTaskStatus = "blocked" | Blocked — needs attention |

Forbidden in primary text (allowed as small secondary debug text only):
- Raw enum values (`pending_approval`, etc.)
- Entity IDs, FK references
- Internal terms ("requisition", "FK", "payload", "mutation", "orgId")

Every workflow surfaces "What to do next":
- Job page with no candidates: **"Add a candidate"** primary button.
- Pipeline with all candidates in `interview`: **"Schedule next interview"** suggestion.
- Approved requisition with no opening: **"Post a job"** CTA.
- Accepted offer: **"Convert to employee"** primary action on the candidate card.
- New onboarding: first incomplete task is highlighted with **"Start here"**.

### 6.5 New shared primitives needed

Most pages reuse what Phase 8 shipped. Two new primitives are required:

1. **`KanbanBoard`** — drag-and-drop columns with cards. Used by the pipeline view. Generic over card payload. Phase 9D delivery.
2. **`TaskChecklist`** — vertical list of grouped tasks with status chips, due dates, assignee avatars, and a one-click toggle to complete. Used by per-employee onboarding view + cross-task list. Phase 9G delivery.

Optional / nice-to-have:
3. **`CandidateCard`** — pipeline kanban card. Could be inline in `KanbanBoard` if used only here; promote to a primitive only if the candidate-list view reuses it.
4. **`CalendarView`** — month/week calendar for interviews. If a third party works well (FullCalendar, etc.) we wrap rather than build.

These additions will be added to `docs/architecture/shared-ui-primitives-plan.md` when 9D / 9G start.

### 6.6 EmptyState usage

Every list and table page MUST follow the rule established in Phase 8J.2:
- `isLoading === true` → skeleton.
- `isLoading === false && error` → error banner + retry.
- `isLoading === false && rows.length === 0` → `<EmptyState />` from `apps/web/src/components/empty-state.tsx`.
- Never skeletons-as-empty.

---

## 7. RBAC and Security

### 7.1 Roles and access matrix

Uses the normalized role helpers introduced in Phase 8J.2 (`apps/web/src/lib/rbac.ts` and `packages/api/src/utils/role-helpers.ts`). Both files will gain three new helpers:

```ts
canManageRecruitment(role)   // HR, recruiter, owner/admin
canViewRecruitment(role)     // canManageRecruitment OR auditor OR hiring_manager (per-opening filtered)
canManageOnboarding(role)    // HR, owner/admin
canAccessTaskAsAssignee(role) // anyone the task is assigned to
```

| Capability | owner / tenant_owner | admin / tenant_admin | hr_admin | recruiter | hiring_manager* | manager | employee | auditor |
|---|---|---|---|---|---|---|---|---|
| Create requisition | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Approve requisition | ✓ | ✓ | ✓ | – | – | – | – | – |
| CRUD jobs | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| View jobs | ✓ | ✓ | ✓ | ✓ | own only | – | – | read |
| CRUD candidates | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| View candidates | ✓ | ✓ | ✓ | ✓ | own jobs | – | – | read |
| Move stage | ✓ | ✓ | ✓ | ✓ | own jobs (limited) | – | – | – |
| Schedule interview | ✓ | ✓ | ✓ | ✓ | own jobs | – | – | – |
| Submit feedback | ✓ | ✓ | ✓ | ✓ | if interviewer | if interviewer | if interviewer | – |
| View offer amounts | ✓ | ✓ | ✓ | – | – | – | – | – |
| Approve offer | ✓ | ✓ | ✓ | – | – | – | – | – |
| Convert candidate → employee | ✓ | ✓ | ✓ | – | – | – | – | – |
| CRUD onboarding templates | ✓ | ✓ | ✓ | – | – | – | – | – |
| Create onboarding instance | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Complete task (as assignee) | ✓ | ✓ | ✓ | ✓ | – | ✓ if assigned | ✓ if assigned | – |
| View onboarding reports | ✓ | ✓ | ✓ | – | – | – | – | read |

\* `hiring_manager` is NOT an org-level role string. It's derived from `job_opening.hiringManagerEmployeeId === currentUser.employeeId`. API enforces this scope; UI hides anything outside the manager's own openings.

### 7.2 Tenant scoping rules (per `lessons-learned.md` #46 systematic tenant-FK audit)

For every recruitment / onboarding procedure:
1. The first DB read uses `eq(table.organizationId, context.organizationId)` in the WHERE clause.
2. Any input FK (`jobOpeningId`, `applicationId`, `candidateId`, `offerId`, `interviewId`, `onboardingId`, `taskId`) is verified to belong to the same `organizationId` before any subsequent mutation.
3. DELETE / UPDATE WHERE clauses MUST include the org filter even after the verification (defence in depth — the Phase 8I-style "DELETE with only id" trap is the canonical failure mode).
4. JSONB-stored ID arrays (e.g. `interviewerEmployeeIds`) are validated as employee IDs in the same tenant before being written.

### 7.3 Privacy classification

| Sensitive field | Visibility floor |
|---|---|
| `candidate.dateOfBirth`, `gender`, `address` | HR / recruiter only — hidden from hiring_manager |
| `offer.baseAmount`, `variableAmount` | `canManagePayroll(role)` (HR / admin / owner / payroll_admin) |
| `interview_feedback.notes`, `concerns` | interviewer + HR + admin |
| `recruitment_note.body` | HR + recruiter + admin + author |
| `candidate_document.fileUrl` | tightly scoped — signed URLs only (Phase 9C) |
| `onboarding_document_request.uploadedFileUrl` | HR + admin + new hire (own) |

### 7.4 Audit

Audit events to emit (using existing `audit_log` table per `audit-documents-automation-spec.md`):
- requisition: created, approved, rejected, cancelled
- job_opening: created, opened (publishedAt set), closed, hiringManagerChanged
- candidate: created, status_changed (any → blocked), converted_to_employee
- application: stage_changed (with from/to)
- interview: scheduled, rescheduled, cancelled, completed
- offer: created, approved, sent, accepted, rejected, withdrawn, expired
- onboarding: created, completed, cancelled
- onboarding_task: status_changed (todo → completed / blocked)
- onboarding_document_request: uploaded, approved, rejected

**Critical**: every offer-status transition and every candidate-to-employee conversion produces an audit row. Document downloads are NOT audited at MVP (write traffic).

---

## 8. Candidate-to-Employee Conversion Flow

### 8.1 Trigger conditions

The "Convert to employee" CTA appears on a candidate detail / application page when ALL of:
- `application.stage = 'hired'`
- An accepted offer exists (`offer.status = 'accepted'` and `application.id === offer.applicationId`)
- `candidate.convertedEmployeeId IS NULL` (not already converted)
- Caller has `canManagePayroll(role)` (proxy for "can create employee records").

### 8.2 Conversion procedure (Phase 9H — `recruitment.candidates.convertToEmployee`)

All steps run in **one DB transaction**:

1. **Pre-flight verify** — tenant scoping on every input ID (candidateId, applicationId, offerId); confirm the trigger conditions above; reject with `BAD_REQUEST` if anything fails.
2. **Create `employee_profile`** — copy candidate name, email, phone, country. Mark `userId = null` (Better Auth user is created separately on first login invite).
3. **Create `employee_work_info`** — link the new employee to the offer's job opening's `jobPositionId`, `departmentId`, `workLocation`. `hireDate = offer.startDate` (or accepted-at date if startDate is null).
4. **Optional contract draft** — if the caller passes `createContractDraft: true`, insert a `contract` row in status `draft` using `offer.baseAmount`, `baseAmountFrequency`, `currency`, and the new `employeeId`. The HR team finalises the contract through the Contracts module.
5. **Optional onboarding instance** — if the caller passes `startOnboarding: true` with a `templateId`, create `employee_onboarding` + snapshot all `onboarding_template_task` rows into `onboarding_task` rows.
6. **Link back** — set `candidate.convertedEmployeeId = newEmployee.id`. This makes the candidate page show "Converted to employee →" link going forward.
7. **Audit events** — emit `candidate.converted_to_employee` and (if applicable) `contract.draft_created`, `onboarding.created`.
8. **Return** `{ employeeId, contractDraftId?, onboardingId? }`.

If any step fails, the transaction rolls back. The candidate stays at `application.stage = 'hired'`, the offer remains `accepted`, and the UI shows the error toast with the friendly message: **"Conversion failed — no records were created. Try again or contact support."**

### 8.3 Idempotency

`candidate.convertedEmployeeId` UNIQUE NULL-allowing constraint prevents double-conversion. If a retry hits an already-converted candidate, the API returns the existing `employeeId` with a 200 + flag `alreadyConverted: true` so the UI can navigate to the employee.

### 8.4 Reverse flow

There's no "un-convert" — once an employee record exists, undoing the conversion would orphan downstream data (contracts, attendance, payroll). To "fix" a wrong conversion: archive the candidate (`candidate.status = 'blocked'`), terminate the employee (HR Core flow), and document the reason.

---

## 9. Analytics and Reporting

### 9.1 Recruitment reports (Phase 9D dashboard + Phase 15 deeper analytics)

| Metric | Source | Notes |
|---|---|---|
| Open jobs | `count(job_opening) WHERE status='open'` | Top-line tile |
| Candidates in pipeline | `count(candidate_application) WHERE stage NOT IN ('hired','rejected','withdrawn')` | |
| Candidates by stage | grouped by `stage` | Stacked bar |
| Time-to-hire | `avg(application.outcomeAt - applied_at) WHERE stage='hired'` | Per job + org-wide |
| Source effectiveness | `candidate.source` × hired rate | Bar chart |
| Interview completion rate | `interview.status='completed' / total scheduled` | |
| Offer acceptance rate | `offer.status='accepted' / sent` | |
| Top rejection reasons | grouped `candidate_application.rejectedReason` | |
| Pipeline bottlenecks | median time in each stage | |
| Hiring manager workload | open candidates grouped by `job_opening.hiringManagerEmployeeId` | |

### 9.2 Onboarding reports

| Metric | Source | Notes |
|---|---|---|
| Onboardings in progress | `count WHERE status='in_progress'` | |
| Completion rate (last 90 days) | `completed / started` | |
| Overdue tasks | `task.dueAt < now() AND status NOT IN ('completed','skipped')` | |
| Documents pending | `document_request.status='requested'` | |
| Average onboarding time | `avg(completedAt - startedAt)` for completed in window | |
| Department completion | grouped by `employee_work_info.departmentId` | |
| Blockers by category | grouped `onboarding_task.category` where `status='blocked'` | |

### 9.3 Display rules (carried from 8J.1 audit fixes)

- Every metric tile shows units (`/100`, `%`, `days`, etc.).
- Every chart has a one-sentence "what this means" caption.
- Export buttons that aren't wired show "Coming soon" rather than being disabled-but-styled-as-active.
- Reports respect role visibility: hiring_manager sees only their own openings; auditor sees aggregates without candidate names.

---

## 10. Implementation Sequence

Mirrors the pattern from Phase 7 / 8 (A spec → B schema → C API → D UI → E QA per module).

| Phase | Deliverable | Estimated effort |
|---|---|---|
| **9A** | This spec. Done with this commit. | ~half day |
| **9B** | Recruitment DB schema + migration + seed data (5–10 candidates, 2–3 jobs, demo offers) | 1 day |
| **9C** | Recruitment oRPC router (~40 procedures: requisitions, jobs, candidates, applications, interviews, feedback, offers, documents, notes) | 2 days |
| **9D** | Recruitment UI — Overview / Jobs / Candidates / Pipeline / Interviews / Offers / Reports + `RecruitmentTabs` + new `KanbanBoard` primitive | 3 days |
| **9E** | Onboarding DB schema + migration + seed data (1 default template + 1 active onboarding) | 1 day |
| **9F** | Onboarding oRPC router (~25 procedures: templates, instances, tasks, documents, acknowledgements, activity) | 1.5 days |
| **9G** | Onboarding UI — Overview / Templates / Employees / Tasks / Documents + `OnboardingTabs` + `TaskChecklist` primitive | 2 days |
| **9H** | Candidate-to-employee conversion procedure (`recruitment.candidates.convertToEmployee`) + contract draft handoff + onboarding instance handoff. End-to-end browser verification. | 1 day |
| **9I** | QA/RBAC/security/usability pass + screenshot batch + audit-report follow-up | 1 day |

Total: ~12 working days for the full Recruitment + Onboarding stack at single-developer pace.

Parallelism: 9B/9C can run alongside 9E/9F if two streams are available. 9D depends on 9C, 9G depends on 9F. 9H depends on both 9D and 9G being functional.

---

## 11. Open Questions

These need decisions before code starts:

1. **Approval chain depth.** Phase 9 ships single-step approvals (one approver per offer / requisition). Do we ship the schema for multi-step approvals (the `offer_approval.sequence` column above) even though MVP won't use it, or strip it out and add it later? **Recommendation: ship the column; cost of adding a column later is real because of migration friction.**
2. **Hiring manager vs manager role.** Is `hiring_manager` ever an org-level role (someone whose primary job is recruiting line managers across the company), or is it always a per-opening assignment? **Recommendation: stay per-opening; add an org-level role only if a real customer asks for it.**
3. **Candidate de-dupe across openings.** A candidate applies to two openings — do we want a "candidate exists in tenant — link existing record?" prompt, or always create a new candidate? **Recommendation: unique by `(organizationId, email)` enforced at DB level; the UI offers a "link existing" flow when email collides.**
4. **Offer letter generation.** Do we generate the PDF (templated) or only accept an uploaded one? **Recommendation: accept uploaded only for MVP; templating is a Phase 14+ automation.**
5. **Candidate document download audit.** Skipped at MVP per #7.4 — confirm with the user before 9C lands.
6. **Onboarding default assignee resolution.** Template task has `defaultAssigneeRole: "manager"`. When the instance is created, which manager? Direct reporting manager from `employee_work_info`? Department head? **Recommendation: resolve to `employee_work_info.reportingManagerId`, fallback to department head if null, fallback to "needs assignment" task status.**
7. **Onboarding for non-recruitment hires.** Can HR start an onboarding for an existing employee (e.g. internal transfer)? **Recommendation: yes; `employee_onboarding.applicationId` is nullable for exactly this case.**
8. **Offer acceptance — manual or candidate-driven?** MVP is HR-recorded ("recruiter clicks Accepted in the UI"). Candidate self-acceptance via email link is a Phase 14+ automation.
9. **Resume file size cap.** 5 MB? 10 MB? Different orgs will want different. **Recommendation: 10 MB cap at MVP, set in API layer, surfaced as a friendly error.**
10. **Pipeline stage rename — global vs per-opening.** Decision 2.3 says per-opening. Should we also allow org-level overrides? **Recommendation: defer to Phase 14 — most users won't need it and we don't want to debug stage-name resolution precedence under load.**

---

## 12. Deferred / Out of Scope

Items NOT in Phase 9 (any phase):
- Public careers page / job board posting
- Candidate self-service portal
- Resume parsing / AI candidate summarisation
- Calendar integration (Google / O365)
- e-signature on offers
- Email templates and outbound email automation
- Skill zones / talent pools as standalone entity
- Recruitment assessment / survey templates
- Probation tracking (lives with PMS — Phase 13)
- Welcome email automation
- Onboarding self-service portal for new hires
- Gantt / task dependencies
- IT system integration (account provisioning)
- Document e-signature

Each of these has a likely future phase home; we'll spec them when they come up.

---

## 13. Acceptance Criteria for 9A

This spec is complete when:
- [x] All entities for Recruitment listed with columns, constraints, indexes, audit notes.
- [x] All entities for Onboarding listed with columns, constraints, indexes, audit notes.
- [x] All status enums defined with terminal states clearly marked.
- [x] UI routes + ModuleTabs + view modes + empty-state copy enumerated.
- [x] RBAC matrix maps every capability to every role.
- [x] Conversion procedure is described step-by-step with idempotency rules.
- [x] Analytics list maps each metric to a SQL-shaped source.
- [x] Implementation sequence (9B–9I) has rough effort estimates and parallelism notes.
- [x] Open questions captured with a recommendation for each.
- [x] `docs/architecture/modules/implementation-sequence.md` updated to reflect 9A done and 9B–9I queued.
- [x] `docs/architecture/shared-ui-primitives-plan.md` notes the new primitives (`KanbanBoard`, `TaskChecklist`) and when they land.
- [x] Quality gates green (baseline TS errors, baseline lint, build OK).

**Next phase: 9B — Recruitment DB schema + seed.**
