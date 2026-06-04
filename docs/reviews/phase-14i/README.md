# Phase 14I — Projects QA / RBAC / security pass (closes Phase 14)

Two read-only review agents swept the Projects module (mirrors the 13H pattern):
a security/RBAC/IDOR/redaction review of the router + helpers, and an
integration-boundary + data-integrity + UI/a11y review.

## Headline guardrail — HELD

The **coordination-layer guardrail holds**: every `db.insert/update/delete` in
`packages/api/src/routers/projects.ts` targets a `project*` table only
(`project`, `project_member`, `project_milestone`, `project_task`,
`project_task_comment`, `project_time_entry`). A grep for writes to
`asset` / `helpdesk_request` / `payslip` / `payroll_run` / `attendance_record` /
`leave_request` / `employee_profile` / `user` / `member` / `audit_event` returns
**NONE**. Cross-module link ids are tenant-verified SELECT-only on write and
resolved read-only on read (asset name / helpdesk reference only); CRM links are
plain text. **Zero cross-module mutation.**

## Review verdicts

- **Security/RBAC:** no critical/high findings. Tenant isolation (every id
  tenant-verified with `organizationId`), two-layer authz (AC gate + handler
  scope on every row), finance/internal-note redaction (server-side in both
  `list` and `getById`), the `getDirectReportIds(me.id, oid)` hardening (13H),
  and employee self-service boundaries are all correctly implemented.
- **Integration/data/UI:** guardrail holds; only LOW-severity polish.

## Findings + resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | MEDIUM | `project_manager` is org-wide (`seesAllProjects` includes it), contradicting its AC comment that promised project-scoped access | **Clarified intent in `permissions.ts`:** `project_manager` is the org-wide *projects-manager tier* (like `hr_admin` for HR); per-*project* leadership is the separate, scoped `project_member.role='lead'`. Scoping the role itself is deferred (would require every PM to be an employee + member). Comment corrected. |
| 2 | LOW | `tasksAssign`/`tasksUnassign` had no terminal-state guard | Added a `TASK_TERMINAL` PRECONDITION_FAILED guard to `tasksAssign` (can't reassign a closed task); verify assertion added (now 71/71). |
| 3 | LOW | 4 panel lists (`project-people`, `project-milestones`, `project-time`, `my-time`) rendered the empty state guarded only by `!isLoading` — a fetch error fell through to "No X" instead of an error state (13H "error ≠ healthy empty" lesson) | Added an `isError` branch to all four. |
| 4 | LOW | Stale `membersAdd` comment ("reactivate…") didn't match the CONFLICT-on-active-duplicate behaviour | Comment corrected. |
| 5 | LOW (accepted) | A manager who is a *member* of a project can approve time on it for non-reports (project-scoped approval, wider than "team time" wording) | **Intentional** — project-scoped approval is the model; documented, not changed. |

No UI-only redaction, no cross-tenant IDOR, no missing-scope-check, no
`getDirectReportIds` without `oid` — all clean.

## Gates (final, Phase 14 close)

check-types **3/3** · build **2/2** · audit:permissions **109/14** ·
verify-projects-api **71/71** · web tsc **7** (baseline, 0 new) · root lint **205**
(≤ 212 baseline) · ultracite clean on all touched files.

**PHASE 14 PROJECTS + TASKS / TIMELINES — COMPLETE** (14A spec → 14B DB → 14C API
→ 14D overview/list → 14E detail/members/milestones → 14F tasks/Kanban →
14G My-Tasks/My-Time/timesheet → 14H timeline/activity → 14I QA).
