# Phase 9I — Recruitment hardening & polish backlog

Refinement items deferred from Phase 9D (recruitment UI). None are rollbacks;
they tighten the module from "MVP" toward enterprise-SaaS polish. Captured from
the Phase 9D review after the `posting:update` permission bug (caught only by
live browser verification) confirmed the value of sequential, verified,
mutation-heavy delivery.

## 1. Permission/action audit — DONE (landed early)
`scripts/audit-permissions.ts` (`bun run audit:permissions`) scans every
`authorizedProcedure("resource","action")` and fails if the action isn't in the
access-control statement. **Make it a required QA gate before any module is
considered done.** Future enhancement: also assert each used action is granted
by ≥1 role (not just defined in the statement).

## 2. Expose job FK selectors after backend verification
`departmentId`, `jobPositionId`, `recruiterUserId` are stored on `job_opening`
but NOT server-verified, and `jobsUpdate` doesn't accept them — so they were
deliberately omitted from the job create/edit forms (only API-validated/scalar
fields are exposed today). To support real HR workflows:
- Add `verifyDepartment`, `verifyJobPosition`, `verifyRecruiterUser` helpers
  (org-scoped, `deletedAt IS NULL`) in the recruitment router.
- Accept these fields in `jobsCreate` **and** `jobsUpdate`, verifying each.
- Then expose Department / Job Position / Recruiter / (Hiring manager already
  verified) selectors in `JobFormDialog`, populated from tenant-scoped lists.

## 3. API denormalization for list display fields
The client-side join (entity list + applications + candidates + jobs, merged in
a `useMemo`) is now repeated across 5 pages (pipeline, interviews, offers,
candidate detail, job detail). Denormalize `candidate name` + `opening title`
(and where shown, email/phone-if-allowed, current stage, applied date) into
`interviews.list`, `offers.list`, `applications.list` so the UI stops resolving
IDs client-side. Job-detail candidate table already resolves names via a join
(QA pass) — replace with the denormalized fields when they land. Users should
never see raw IDs as primary text outside a debug/support view.

## 4. Dialog accessibility (SaaS-grade)
Dialogs use `role="dialog"` + `aria-modal` today. Add: `aria-labelledby` +
`aria-describedby`, Escape-to-close, focus trap (focus lands inside on open),
focus returns to the triggering control on close, and explicit label↔input
associations. Applies to `JobFormDialog`, `interview-actions` dialogs, the
pipeline Reject dialog, and the quick-view drawer.

## 5. Standardize detail-page tabs across modules
The Job-detail Overview/Settings tab pattern should become the cross-module
mental model. Typical set (not every page needs all): **Overview · Activity/
History · Documents · Settings.** Apply to Candidate detail, Offer detail,
Employee profile, Payroll settings, Contracts.

## 6. Readable activity/status history timelines
Settings tabs currently show an "Activity" placeholder. Audit events already
capture status transitions; surface a readable timeline (e.g. Draft → Opened →
Paused → Opened → Closed, with who/when/optional reason). Candidate stage
history already exists (`application_stage_history`); job status history should
get an explicit readable UI too.

## 7. Recruitment route-group no-access guard
A non-viewer (employee/payroll) reaching `/app/recruitment` by **direct URL**
currently mounts the Overview and fires queries that 403 (degraded UX; data is
safe — sidebar already hides recruitment for them). Add a route-group
`canViewRecruitment` guard that renders a clean "no access" state instead of
firing queries. Also confirm whether `manager` should have a recruitment
sidebar entry — they have scoped API view access today but no nav link.

## 8. Brand-new interview scheduling
Scheduling a *new* interview (vs. rescheduling an existing one) needs an
application + interviewer pickers, so it belongs on the pipeline/candidate flow
where an application is in context — not the interviews list. Add a "Schedule
interview" action on pipeline cards / candidate detail.
