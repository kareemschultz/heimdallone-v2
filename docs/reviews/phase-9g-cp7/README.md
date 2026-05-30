# Phase 9G Checkpoint 7 — Onboarding QA / RBAC / Browser Pass

Date: 2026-05-30. Closes Phase 9G (Onboarding UI) before Phase 9H (candidate→employee conversion).

## Summary

Full QA/RBAC/browser pass over the complete onboarding module. The module is
**clean**: static review found zero must-fix issues across 8 dimensions, and live
three-role browser verification confirmed every route renders and RBAC is enforced
at both the API and UI layers. Two small polish/correctness fixes were made (below).

## Bugs found & fixed

1. **Runtime crash on `/app/onboarding/tasks`** (`apps/web/src/routes/app/onboarding/tasks/index.tsx`).
   The page rendered `<ClipboardList size={20} />` in two places but never imported
   `ClipboardList` from `lucide-react`, so opening the Tasks tab threw
   "Element type is invalid (got: undefined)" and crashed the page. Fixed by adding
   the import. This slipped past CI because `bun run check-types` does not type-check
   the web app (turbo runs it only on web's deps) and Vite's build does not fail on
   undefined identifiers — the error is runtime-only. **Verified fixed in browser**
   (admin → "coming soon" empty state; employee → no-access state; no console errors).

2. **Copy accuracy** — two strings promised behavior the system doesn't have:
   - `tasks/index.tsx` empty state said "Task list will arrive in Phase 9G checkpoint 4"
     (CP4 already shipped) → now "A combined task view across all new hires is coming
     soon. For now, open an employee's onboarding to manage their tasks."
   - `documents/index.tsx` helper said documents could be "received, approved, rejected,
     or **waived**" — there is no `waived` status (`DOC_STATUS_LABEL` and the API only
     have requested/uploaded/approved/rejected) → now "received, approved, or rejected."

## Routes verified (all render, 0 console errors)

| Route | Result |
|---|---|
| /app/onboarding | Admin overview (tabs + 4 stat tiles + attention panel) |
| /app/onboarding/my | Employee self-service ("My onboarding"); admin sees empty state, no crash |
| /app/onboarding/templates | Template list (3 seeded), Create gated to managers |
| /app/onboarding/templates/$id | Detail (summary + ordered tasks + Edit/Archive); linked from list |
| /app/onboarding/employees | 5 onboardings, status filters, Start onboarding (gated) |
| /app/onboarding/employees/$id | Summary/Tasks/Documents/Acknowledgements/Activity; Complete/Cancel gated |
| /app/onboarding/documents | Document requests + Acknowledgements sub-tabs |
| /app/onboarding/tasks | "Coming soon" empty state (fixed; no longer crashes) |

## RBAC matrix (API observed; 404 = authorized-but-not-found, 403 = forbidden)

| Role | admin list | create | start | complete | skip | approve doc | reassign | sees only own |
|---|---|---|---|---|---|---|---|---|
| owner/admin/hr | 200 | 200 | 404 | 404 | 404 | 404 | 404 | n/a (manage all) |
| auditor | 200 (read) | 403 | 403 | 403 | 403 | 403 | 403 | read-only, 0 UI mutation buttons |
| manager | 200 (read) | 403 | 403 | 403 | 403 | 403 | 404 (allowed) | scoped |
| recruiter | 200 (read) | 403 | 404 (allowed) | 403 | 403 | 403 | 403 | scoped |
| employee | **403** | 403 | 403 | 403 | 403 | 403 | 403 | only via `mine` (200) |

Required negative tests — all pass:
- auditor `templates/create` → 403
- employee `employeeOnboarding/list` → 403
- employee `documentRequests/approve {id:nonexistent}` → **403** (auth before existence, not 404)
- employee `employeeOnboarding/mine` → 200 (self endpoint)

API auth confirmed: all 30 onboarding procedures pass through the `authorizedProcedure`
gate (protected → active-org → permission ACL), and read/mutation handlers add the
correct second layer (`canManageOnboarding`/`canViewOnboarding` role checks or
`assertCanViewOnboarding`/`assertCanActOnTask` per-record self-scope). No procedure
lacks an auth gate.

## Sign-acknowledgement dialog — verified end to end (CP6 gap closed)

CP6 could not exercise the live Sign dialog because the seeded employee's only ack was
already signed. For CP7 an unsigned test ack was created on the employee's onboarding:
employee → /app/onboarding/my → "Sign acknowledgement" → confirmation dialog (title
"Sign acknowledgement?", body "This records that you have read and accepted this
policy.") → signed → row flips to "Signed". Double-sign returns 409 CONFLICT
("This policy has already been acknowledged."). Full flow works.

## Quality gates

- `bun run check-types` → exit 0
- `bun run build` → exit 0
- `bun run audit:permissions` → exit 0 (45 pairs / 8 routers)
- `bun run check` (repo lint) → 225 errors / 1 warning = **unchanged accepted baseline**; the two changed files are clean (0 new lint findings)
- `ultracite check` on changed files → exit 0

## Screenshots (this directory)

Admin: overview, templates, template-detail, employees, employee-detail, documents, tasks.
Auditor: read-only documents. Employee: my-onboarding, sign-dialog, ack-signed.

## Remaining gaps / notes (not blockers)

- `/app/onboarding/tasks` is an intentional "coming soon" placeholder — a combined
  cross-onboarding task view is not built (out of CP7 scope; build later if desired).
- The app shell fires `employeeOnboarding/list` for employees, producing one expected
  (handled) 403 in the employee console — pre-existing, harmless, could be tidied later.
- **Leftover test data** (reset via `scripts/seed-onboarding.ts`): two now-signed
  acknowledgements remain on the employee's onboarding from the sign-dialog test
  ("CP7 Test Policy", "CP7 Test Policy 2 (dialog)"). No delete endpoint exists.

## Next

Phase 9H — candidate → employee conversion (transactional, idempotent via
`convertedEmployeeId`). The onboarding UI is verified end to end and ready.
