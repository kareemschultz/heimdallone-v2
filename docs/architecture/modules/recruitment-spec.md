# Recruitment Module Specification

## Purpose

Manages the hiring pipeline: job openings, pipeline stages, candidates with profiles/resumes, interview scheduling, offer tracking, candidate ratings, skill zones (talent pools), and candidate-to-employee conversion.

## Source References

- `docs/horilla-extraction/recruitment.md` — Full extraction
- `docs/architecture/hr-core-schema-spec.md` — department, job_position

## Dependencies

- **HR Core** (P0) — department, job_position for job openings
- **Onboarding** (P2) — hired candidates flow into onboarding

## First Version Scope

- Job opening CRUD with vacancy count, start/end dates, published status
- Pipeline stages per opening (Initial → Applied → Test → Interview → Hired | Cancelled)
- Candidate CRUD (name, email, phone, resume, profile, source, stage tracking)
- Drag-and-drop kanban pipeline view
- Interview scheduling (candidate, interviewers, date/time)
- Candidate ratings (1-5 per evaluator)
- Stage notes with visibility control (internal vs candidate-visible)
- Offer status tracking (not sent → sent → accepted → rejected → joined)
- Candidate-to-employee conversion (create employee_profile from candidate data)

## Deferred Scope

- Skill zones / talent pools
- Survey/assessment templates
- LinkedIn integration
- Public job board / career page
- Candidate self-tracking portal
- Bulk candidate import (CSV)
- Email templates for candidates
- Interview feedback forms

## Proposed Entities

### `job_opening`
- **Key fields**: id, organizationId, title, description, positionIds (jsonb — FK array), vacancy (int), status (open/closed), isPublished (bool), startDate (date), endDate (nullable), managerId M2M (jsonb), createdAt, updatedAt
- **Audit**: Status changes, vacancy updates

### `hiring_stage`
- **Key fields**: id, jobOpeningId (FK), name, type (initial/applied/test/interview/cancelled/hired — pgEnum), sequence (int), managerIds (jsonb)
- **Unique**: (jobOpeningId, name)

### `candidate`
- **Key fields**: id, organizationId, jobOpeningId (FK), stageId (FK), name, email, phone, resumeUrl, profileImageUrl, source (application/referral/internal — pgEnum), gender, dateOfBirth, address, country, joinDate (nullable), status (active/hired/rejected/withdrawn — pgEnum), offerStatus (not_sent/sent/accepted/rejected/joined), convertedEmployeeId (FK → employee_profile, nullable)
- **Unique**: (email, jobOpeningId)
- **Audit**: Stage transitions, offer status changes

### `interview`
- **Key fields**: id, candidateId (FK), interviewerIds (jsonb), scheduledDate (date), scheduledTime (text), isCompleted (bool), notes, createdAt

### `candidate_rating`
- **Key fields**: id, candidateId (FK), employeeId (FK — rater), rating (int 1-5)
- **Unique**: (candidateId, employeeId)

### `candidate_note`
- **Key fields**: id, candidateId (FK), stageId (FK), authorId (FK), content, isVisibleToCandidate (bool), createdAt

## Proposed UI Routes

### `/app/recruitment` — Active openings list (card grid)
### `/app/recruitment/$id` — Pipeline kanban (drag-and-drop stages)
### `/app/recruitment/$id/candidates/$candidateId` — Candidate detail (profile, resume, ratings, interviews, notes)

**Primitives**: DataTable (candidate list), PageHeader, ActionMenu, EntitySheet (candidate preview), StatusBadge (stage type badges), ConfirmDialog (reject/hire)

## RBAC

Uses existing: `posting:create/read/publish/archive`, `applicant:create/read/update/convert`, `interview:create/read/update/complete`, `offer:create/read/extend/withdraw`.

## Staff-Friendly UX

- Kanban drag-and-drop with confirmation on hire/reject stage moves
- "Create Employee" button appears when candidate reaches hired stage
- Interview calendar view alongside pipeline
- Rating stars visible on candidate cards in pipeline

## Implementation Readiness

**Ready after HR Core**. Onboarding is optional — hired candidates can be converted directly to employees without onboarding flow.
