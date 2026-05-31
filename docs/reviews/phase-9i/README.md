# Phase 9I — Recruitment + Onboarding Hardening QA Review

**Date:** 2026-05-31  
**Base commit:** 1b98772 (Phase 9H complete)  
**Scope:** Recruitment + Onboarding modules audit, a11y fixes, docs

---

## Quality Gates

| Gate | Result |
|------|--------|
| `bun run check-types` | PASS — 0 new errors in changed files |
| `bun run build` | PASS — 4.92s |
| `bun run check` | PASS — 225/1 baseline unchanged |
| `bun run audit:permissions` | PASS — 46 pairs / 8 routers |
| Lint on changed files | PASS — 0 new errors |

---

## Issues Found and Fixed

### A11y: Missing `aria-labelledby`/`aria-describedby` on 4 dialogs (HIGH)

**Files fixed:**
- `apps/web/src/routes/app/recruitment/jobs/$id.tsx` — job transition confirm dialog
- `apps/web/src/routes/app/recruitment/pipeline.tsx` — reject candidate dialog
- `apps/web/src/features/recruitment/job-form-dialog.tsx` — create/edit job form
- `apps/web/src/features/recruitment/interview-actions.tsx` — `DialogShell` base component

**Fix applied to each:** Added `aria-labelledby` + `aria-describedby` to `role="dialog"` div; added matching `id` to `<h2>` heading and description `<p>`.

All 12 existing dialogs across recruitment+onboarding now have correct ARIA attributes.

---

## Audits: Clean

### URL/XSS Audit
- All `target="_blank"` links already had `rel="noopener noreferrer"` — grep triggered on the separate-line pattern, not a real issue.
- All DB-sourced URLs (linkedinUrl, resumeUrl, portfolioUrl, letterUrl, fileUrl) go through `safeHttpUrl()` before being rendered as hrefs.
- No `dangerouslySetInnerHTML` in recruitment or onboarding modules.

### Tenant-FK Audit
- Every input FK in `recruitment.ts` is passed through a `verify*` helper before use (verifyCandidate, verifyApplication, verifyJobOpening, verifyOffer, verifyInterview).
- Every input FK in `onboarding.ts` is verified via verifyTemplate / verifyOnboarding / verifyEmployee before use.
- All DB queries include `organizationId` in WHERE clause as defense in depth.
- Employee self-scope guard: `getByEmployeeId` checks `me.id === input.employeeId` when caller can't `canViewOnboarding`.

### RBAC Matrix

**Recruitment:**
| Role | Can manage | Can view | Convert |
|------|-----------|---------|---------|
| owner/admin/hr_admin | ✓ | ✓ | ✓ |
| recruiter | ✓ | ✓ | ✓ |
| auditor | ✗ | ✓ | ✗ |
| manager | ✗ | scoped | ✗ |
| employee | ✗ | ✗ | ✗ |

**Onboarding:**
| Role | Can manage | Can view | Employee self |
|------|-----------|---------|--------------|
| owner/admin/hr_admin | ✓ | ✓ | — |
| recruiter | ✗ | ✓ (read+start) | — |
| auditor | ✗ | ✓ | — |
| manager | ✗ | ✓ | — |
| employee | ✗ | ✗ | own only |

### Sensitive Data
- Offer compensation (baseAmount, variableAmount) redacted for non-`canManagePayroll` roles — verified in offers/$id.tsx.
- Candidate DOB/gender/address redacted for non-`canManageRecruitment` roles via `redactCandidateSensitive`.
- Recruitment notes/documents 403 for non-recruiter/HR roles (graceful EmptyState, retry: false).

### Conversion Verification (from Phase 9H)
- Accepted-offer required — backend returns PRECONDITION_FAILED if absent.
- Idempotency — candidate.convertedEmployeeId set once; second attempt returns CONFLICT.
- Application stage advances to "hired"; stage history + recruitment note written.
- Onboarding snapshot atomic with employee creation in single transaction.
- Auditor has no convert button; direct RPC → 403.

---

## Route Audit

### Recruitment
| Route | Status |
|-------|--------|
| `/app/recruitment` (overview) | ✓ Live — 4 stat tiles + attention panel |
| `/app/recruitment/jobs` | ✓ Live — filters, create, pagination |
| `/app/recruitment/jobs/$id` | ✓ Live — overview+settings tabs, transitions |
| `/app/recruitment/candidates` | ✓ Live — filters, search |
| `/app/recruitment/candidates/$id` | ✓ Live — 5 tabs + convert UI |
| `/app/recruitment/pipeline` | ✓ Live — kanban DnD + move-menu |
| `/app/recruitment/interviews` | ✓ Live — filters + actions |
| `/app/recruitment/offers` | ✓ Live — status filters, compensation gating |
| `/app/recruitment/offers/$id` | ✓ Live — detail + lifecycle actions |
| `/app/recruitment/reports` | ✓ Live — stat tiles, pipeline bars |

### Onboarding
| Route | Status |
|-------|--------|
| `/app/onboarding` (overview) | ✓ Live — status tiles + attention panel |
| `/app/onboarding` (employee view) | ✓ Live — MyOnboarding self-service |
| `/app/onboarding/templates` | ✓ Live — list + create |
| `/app/onboarding/templates/$id` | ✓ Live — tasks, edit, archive |
| `/app/onboarding/employees` | ✓ Live — list, progress, filters |
| `/app/onboarding/employees/$id` | ✓ Live — tasks/docs/acks/activity |
| `/app/onboarding/documents` | ✓ Live — cross-onboarding doc list |
| `/app/onboarding/tasks` | ⏳ Deferred — honest "coming soon" placeholder |

---

## Remaining Backlogs (Phase 9I Confirmed Deferred)

1. **Draft contract on conversion** — no contract schema table in current codebase; accepted offer → draft contract is a Phase 10/Contracts integration task.
2. **Aggregate task view** (`/app/onboarding/tasks`) — cross-hire task list deferred; honest coming-soon copy in place.
3. **Calendar view on interviews** — helper text says "coming later"; list view is fully functional.
4. **API denormalization** — candidate/opening names joined client-side in 5 pages (interviews, applications, offers, pipeline, onboarding). Documented in phase-9i-hardening-backlog.md.
5. **Brand-new interview scheduling** — on pipeline/candidate flow; deferred to 9I hardening backlog.
6. **Real file upload storage** — explicit "coming later" copy in documents and employee onboarding pages.
7. **Cheyenne Phillips test data** — remains as useful converted-candidate demo data; clearly seeded, not sensitive.

---

## Browser Verification (0 new console errors)

All screenshots saved in `docs/reviews/phase-9i/`:
- `01-recruitment-overview.png` — admin recruitment overview
- `02-jobs-list.png` — jobs list
- `03-candidate-converted-state.png` — Cheyenne Phillips converted link
- `04-pipeline.png` — kanban pipeline
- `05-interviews.png` — interviews list
- `06-offers.png` — offers (Cheyenne offer shows Accepted)
- `07-recruitment-reports.png` — reports
- `08-onboarding-overview.png` — onboarding dashboard
- `09-onboarding-templates.png` — templates list
- `10-onboarding-employee-detail.png` — Cheyenne's new onboarding (in progress)
- `11-onboarding-documents.png` — global documents view
- `12-auditor-recruitment-readonly.png` — auditor: no manage actions
- `13-auditor-onboarding-readonly.png` — auditor: read-only onboarding
- `14-employee-self-service-onboarding.png` — employee: self-service view, 0 console errors
