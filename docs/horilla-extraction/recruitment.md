# Recruitment — Horilla Extraction

## Overview

Horilla's Recruitment module manages the full hiring pipeline: job openings (Recruitment), pipeline stages (Stage), candidates with profile/resume/survey data, interview scheduling, offer tracking, candidate ratings, skill zones (talent pools), and candidate-to-employee conversion. It supports both single-position and event-based (multi-position) recruitments.

## Horilla Files Inspected

- `recruitment/models.py` (1134 lines) — Recruitment, Stage, Candidate, RejectReason, RejectedCandidate, StageNote, RecruitmentSurvey, SurveyTemplate, QuestionOrdering, RecruitmentSurveyAnswer, SkillZone, SkillZoneCandidate, CandidateRating, InterviewSchedule, Resume, CandidateDocumentRequest, CandidateDocument, LinkedInAccount

## Important Models

**Recruitment** — Job opening. Fields: title, description, is_event_based (multi-position), closed, is_published (public job board), open_positions M2M (JobPosition), vacancy count, recruitment_managers M2M (Employee), survey_templates M2M, company FK, start_date, end_date, skills M2M, optional_profile_image, optional_resume, LinkedIn integration fields.

**Stage** — Pipeline stage within a recruitment. Fields: recruitment FK, stage_managers M2M, stage name, stage_type (initial/applied/test/interview/cancelled/hired), sequence. Auto-creates "Cancelled" stage when needed.

**Candidate** — Applicant profile. Fields: name, profile image, portfolio URL, recruitment FK, job_position FK, stage FK, converted_employee FK, schedule_date, email, mobile, resume (PDF), referral FK (Employee), address/country/dob/gender/source, start_onboard, hired (auto-set when reaching "hired" stage), canceled, converted, joining_date, sequence, offer_letter_status (not_sent/sent/accepted/rejected/joined), hired_date.

**InterviewSchedule** — Fields: candidate FK, employee M2M (interviewers), interview_date, interview_time, description, completed (bool).

**RecruitmentSurvey** — Assessment questions. Types: checkbox, options, multiple choice, text, number, percentage, date, textarea, file upload, rating. Linked to templates and recruitments.

**SkillZone** — Talent pool. Candidates can be added to skill zones for future consideration with a reason.

**CandidateRating** — Employee ratings for candidates (0-5). Unique per employee+candidate.

## State Machine / Lifecycle

**Candidate journey**: Applied → Initial → Test → Interview → Hired | Cancelled
- Movement between stages via stage_id update
- Reaching "hired" stage auto-sets `hired=True`
- Cancelled candidates move to auto-created "Cancelled" stage
- Post-hire: `start_onboard=True` triggers onboarding flow
- Conversion: candidate → employee record

**Offer Letter**: Not Sent → Sent → Accepted | Rejected → Joined

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/recruitment` — Active recruitments list
- `/app/recruitment/$id` — Pipeline kanban view for a recruitment
- `/app/recruitment/$id/candidates` — Candidate list view
- `/app/recruitment/$id/candidates/$candidateId` — Candidate detail
- `/app/recruitment/talent-pool` — Skill zones / talent pool

### View Modes
- **Recruitment list**: Card grid showing vacancy, filled, pipeline stage counts
- **Pipeline kanban**: Columns = stages, cards = candidates, drag to move between stages
- **Candidate list**: Table view with filters
- **Candidate detail**: Profile card with resume, interview history, ratings, survey answers, notes
- **Interview calendar**: Calendar showing scheduled interviews

### Data Table (Candidates)
- Columns: Name, Position, Stage (badge), Rating, Source, Applied Date, Interview Date, Offer Status
- Filters: Stage, Position, Source, Rating, Date range
- Row actions: Move to stage, Schedule interview, Rate, Add to talent pool, Reject
- Bulk actions: Bulk reject, Bulk move stage, Bulk email

### Forms
- **Candidate**: Profile form with resume upload, position selection
- **Interview**: Date/time picker, interviewer selection, description
- **Survey**: Dynamic form based on question template (multi-type questions)

## Staff-Friendly UX Notes

### Recruiter Workflow
- Dashboard shows: Open positions with fill rate, pending interviews, new applications
- Kanban drag-and-drop for stage movement with confirmation
- Quick-add candidate from pipeline view
- One-click interview scheduling from candidate card
- Email templates for offer/rejection pre-configured

### Common Confusion Points
- Confusion: Difference between "Recruitment" and "Job Opening"
- Prevention: Use "Job Opening" as the label, "Recruitment" is internal term
- Confusion: How to convert hired candidate to employee
- Prevention: "Create Employee" button appears when candidate reaches hired stage

## Proposed Drizzle Entities

- `job_opening` — organizationId, title, description, positionIds (JSON), vacancy, status (open/closed), startDate, endDate, isPublished
- `hiring_stage` — jobOpeningId FK, name, type, sequence, managerIds (JSON)
- `candidate` — jobOpeningId FK, stageId FK, name, email, phone, resumeUrl, profileUrl, source, status (active/hired/rejected/withdrawn), joinDate, referralEmployeeId
- `interview` — candidateId FK, interviewerIds (JSON), scheduledDate, scheduledTime, isCompleted, notes
- `candidate_rating` — candidateId FK, employeeId FK, rating (1-5)
- `candidate_note` — candidateId FK, stageId FK, authorId FK, content, isVisibleToCandidate

## Dependencies

- **HR Core** (P0) — Job positions, departments
- **Onboarding** (P2) — Hired candidates flow into onboarding
- **Employee** (P0) — Candidate-to-employee conversion

## Priority

**P2** — Important for hiring workflow but not needed for daily HR operations.
