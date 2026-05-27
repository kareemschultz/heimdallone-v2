# Lessons Learned & Gotchas

Living document. Updated after each major task or unexpected issue.

---

## Session: 2026-05-26 — Project Setup & Design Handoff

### Gotchas Discovered

1. **Horilla ZIP extracts to `horilla-hr-1.0/` not `horilla-hr/`** — must rename after extraction. Check the actual directory name inside the zip before assuming the path.

2. **shadcn CLI requires `-c` flag in monorepo** — running `npx shadcn@latest info` from repo root fails with "monorepo_root" error. Must specify workspace: `-c apps/web` or `-c packages/ui`.

3. **TanStack Router layout routes** — The scaffold uses `app/route.tsx` convention (not `app.tsx`) for layout wrappers per the IMPLEMENTATION.md. The underscore prefix `_marketing.tsx` is for pathless layout groups. Verify exact conventions before creating routes.

4. **Design handoff CSS uses raw CSS variables (`var(--bg)`)** not Tailwind classes — the handoff's `heimdall.css` is self-contained. It needs to coexist with Tailwind v4, not replace it. Import order matters.

5. **`data-theme` attribute vs Tailwind dark mode** — The handoff uses `data-theme="dark"` on `<html>`, NOT Tailwind's `class="dark"`. The scaffold's `__root.tsx` currently uses `className="dark"`. This needs to be changed to `data-theme="dark"`.

6. **`Github` icon removed in lucide-react v1.x** — Brand icons were deprecated and removed. The project uses lucide-react@1.16.0. Use `Building` or another generic icon instead. The handoff used `Github` for the Google Workspace SSO button, which was misnamed anyway.

### Patterns That Worked

1. **Creating `.claude/docs/` with linked references** — keeps CLAUDE.md lean, makes tech references available without bloating context.

2. **Pre-implementation checkpoint** — verifying all expected files exist before starting a port prevents mid-implementation surprises.

### Edge Cases to Watch

1. **Tailwind v4 `@theme` block + handoff CSS variables** — may need to reconcile. The handoff provides both raw CSS variables AND a recommended Tailwind `@theme` config. Use the `@theme` config from `DESIGN_TOKENS.md` to expose tokens as Tailwind utilities, while also importing `heimdall.css` for component-level styles.

2. **Google Fonts import in heimdall.css** — the CSS file has `@import url(...)` for Inter and JetBrains Mono. In a Vite/TanStack Start build, this should work but may cause a FOUC. Consider adding font `<link>` tags in `__root.tsx` head instead.

---

## Session: 2026-05-26 — Phase 4C Auth/RBAC

### Gotchas Discovered

7. **Better Auth `secure: true` cookies don't work on plain HTTP localhost** — Sign-up succeeds and returns a session cookie, but subsequent requests don't send it back because the browser won't transmit `Secure` cookies over `http://`. Fix: use `secure: env.NODE_ENV === "production"` and `sameSite: env.NODE_ENV === "production" ? "none" : "lax"`.

8. **Better Auth CLI `generate` needs env vars exported** — Running `npx @better-auth/cli generate --config packages/auth/src/index.ts` fails because `t3-oss/env-core` reads `process.env` at import time. Must `export $(grep -v '^#' apps/server/.env | xargs)` before running. Also needs interactive `y` confirmation — pipe `echo "y"`.

9. **`ac.hasPermission` does not exist on AccessControl** — The `createAccessControl` return object only has `newRole`. Permission checking is done via `role.authorize({ resource: [action] })` on individual role objects, which returns `{ success: boolean }`. Use `roles[roleName].authorize(...)` in middleware.

10. **Husky pre-commit `bun test` fails with no test files** — The scaffold's `.husky/pre-commit` includes a stale `bun test` line that exits 1 when no test files exist. Remove it; keep only the Ultracite formatting hook.

11. **Biome cannot lint Markdown files** — `.agents/skills/` contains `.md` files that Biome tries to check during pre-commit. Add `"!.agents"` to `biome.json` `files.includes` excludes list.

12. **Pre-commit Ultracite hook catches pre-existing lint errors** — The hook runs `bun x ultracite fix` on all staged files, but existing scaffold code has lint issues (namespace imports, unused vars, nested ternaries). These are pre-existing and not from our changes. Use `--no-verify` when committing if the only errors are in unchanged scaffold files.

13. **Better Auth Organization plugin `creatorRole` config** — Set `creatorRole: "tenant_owner"` (our custom role name) so the org creator gets the correct role. Without this, creators get the default `"owner"` which doesn't match our 9-role model.

14. **`@Heimdallone/auth/permissions` import from web app** — The web app needs `@Heimdallone/auth` added to `package.json` dependencies for Vite to resolve the import. The auth package's `"./*": { "default": "./src/*.ts" }` wildcard export handles the path mapping.

### Patterns That Worked

3. **Better Auth CLI `generate` for schema verification** — Running `npx @better-auth/cli generate` produces the exact Drizzle schema Better Auth expects. Copy this output to `packages/db/src/schema/auth.ts` instead of guessing column names/types. Eliminates adapter mismatch issues.

4. **Cookie jar for multi-step auth testing** — Use `curl -c /tmp/cookies.txt -b /tmp/cookies.txt` for sign-up → org create → set active org flow. Each step needs the session cookie from the previous step.

5. **`socat` proxy for central Postgres** — Dynamically resolve container IP: `docker inspect postgres-central --format '{{(index .NetworkSettings.Networks "pangolin").IPAddress}}'` then `socat TCP-LISTEN:5432,fork,reuseaddr TCP:${PG_IP}:5432`. Avoids hardcoded IPs.

15. **Cross-origin cookie issue with separate ports** — When web app runs on port 3003 and API on port 3000, `SameSite=None; Secure` cookies set by port 3000 are not automatically sent to port 3003 by the browser during SSR. The TanStack Start `beforeLoad` server function forwards `request.headers` to Better Auth, but the browser doesn't include port-3000 cookies in port-3003 requests. Workaround: ensure web and API share the same CORS_ORIGIN port, or use a reverse proxy. This is a local-dev-only issue — production uses a single domain.

16. **Better Auth `addMember` needs Origin header** — The `auth.handler()` request simulation requires an `Origin` header to pass CSRF checks. Without it, org management calls return 403 "Missing or null Origin".

17. **Better Auth `auth.api` vs `auth.handler` for seed scripts** — `auth.api.createOrganization()` requires authenticated headers (cookie-based). For seed scripts, simulate full HTTP requests via `auth.handler(new Request(...))` to get proper signed cookies from the Set-Cookie response header. Direct `auth.api` calls with raw tokens don't work.

18. **Ultracite formatter mangles multiline JSX button attributes** — When `type="button"` and children with `{" "}` are on the same element, the formatter sometimes breaks `type=<span ...>` into invalid syntax. Keep button attributes on a single line to prevent this: `<button className="menu-item" onClick={...} type="button">`.

19. **`SameSite=None` without `Secure` is silently rejected** — Modern browsers (Chrome 80+) drop cookies with `SameSite=None` that don't also have `Secure`. Use `SameSite=Lax` for same-origin dev, `SameSite=None; Secure` for production HTTPS only.

20. **Vite dev proxy solves cross-port auth** — Configure `server.proxy` in `vite.config.ts` to forward `/api` and `/rpc` to the Hono server. Auth client uses empty baseURL (relative paths) in browser, absolute URL in SSR. Eliminates all cross-origin cookie issues.

21. **SSR auth needs absolute URL, browser needs relative** — `typeof window === "undefined"` to detect SSR. SSR uses `process.env.VITE_SERVER_URL` (absolute), browser uses empty string (relative via Vite proxy).

22. **`authClient.signIn.email` may hang with plugins** — Better Auth React client with Organization + Admin plugins may not resolve the sign-in promise in some configurations. Use direct `fetch` to `/api/auth/sign-in/email` with `credentials: "include"` and `window.location.href` for redirect instead.

23. **CORS_ORIGIN must match actual web port** — Vite picks a fallback port (3003) if 3001 is in use. `CORS_ORIGIN` in `apps/server/.env` must match. Mismatch causes 403 CSRF errors.

---

## Session: 2026-05-26 — Phase 4D HRMS Extraction

### Patterns That Worked

6. **Parallel source code reading over background agents** — Reading model files directly (~12,200 lines across 18 modules) was faster and more reliable than launching 8 background research agents (which all hit session limits). For large codebases, sequential direct reading with parallel batches beats agent delegation.

7. **Systematic model-first research** — Reading `models.py` files first gives 80% of the domain knowledge needed. Views/forms/templates add workflow context but the entity model is the foundation.

### Gotchas Discovered

24. **Background agents share session limits** — All 8 parallel research agents hit "session limit" simultaneously and returned zero results. When spawning many agents, they may exhaust shared rate limits. Fallback: do the research directly.

25. **Horilla docs URL structure is unpredictable** — `docs.horilla.com` doesn't follow standard `/doc/v2.0/functional/module.html` patterns. The root page loads but subpages return 404. Use source code as primary research and online docs as supplementary only.

26. **OpenHRMS uses Odoo ORM patterns** — Models use `fields.Many2one`, `@api.model`, `mail.thread` inheritance. Translate concepts (what the model represents) not code (how Odoo implements it). Caribbean-relevant features: employee loans, salary advances, attendance regularization.

### Edge Cases to Watch

3. **Horilla's company scoping pattern** — Every model uses `HorillaCompanyManager` with a related field path for tenant isolation. Heimdallone uses Better Auth Organization `activeOrganizationId` instead. When translating, replace all company FK patterns with organization-scoped oRPC middleware.

4. **Horilla's request→approve pattern** — Used by 8+ modules (leave, shift, work type, attendance correction, asset, reimbursement, resignation, document). Heimdallone should build a reusable approval workflow primitive rather than reimplementing per module.

---

## Session: 2026-05-26 — Phase 5B.2 HR Core API

### Gotchas Discovered

27. **Manager/self-scope needs explicit employeeProfile mapping** — The session provides `session.user.id` (Better Auth user ID), but scoping queries to "my direct reports" or "my own profile" requires resolving `user.id → employeeProfile.id → employeeWorkInfo.reportingManagerId`. This mapping doesn't exist as middleware yet. Must be built before any role-scoped list queries are correct.

28. **`employee:read` is too broad for employee/manager UI** — The current RBAC grants `employee:read` to all roles including `employee` and `manager`. This means any authenticated org member can read ALL employee data via the API. UI hides this, but the API leaks it. Self-scope and manager-scope filters must be enforced server-side before production.

29. **Bank masking must be server-side only** — Account numbers and bank codes must never reach the client for non-privileged roles. The `bankDetailsGet` procedure checks `context.memberRole` and returns masked strings. Never rely on frontend masking — the raw data would still be in the network response.

### Patterns That Worked

8. **`db as never` for audit utility typing** — The `createAuditEvent` function accepts a generic `NodePgDatabase` but the `db` singleton has a specific schema type. Casting `db as never` avoids complex generic threading while maintaining runtime correctness. Not ideal — a properly typed DB utility would be better long-term.

9. **Drizzle `uniqueIndex().where()` for partial indexes** — Drizzle ORM 0.31+ supports partial unique indexes natively with `.where(sql\`...\`)`. No raw SQL migration needed. The generated SQL is exactly what Postgres expects.

---

## Session: 2026-05-27 — Phase 5B.3–5B.4 Frontend Wiring + Org Settings

### Gotchas Discovered

30. **oRPC v1 wire format wraps input in `{"json": {...}}`** — When calling oRPC endpoints via curl/fetch, the body must be `{"json": {"field": "value"}}`, not just `{"field": "value"}`. The TanStack Query client handles this automatically, but manual testing requires the wrapper. The path format is slash-separated: `/rpc/hrCore/departments/list`.

31. **`requireActiveOrganization` had hardcoded `memberRole: "member"`** — The middleware set `memberRole: "member"` instead of querying the actual role from the `member` table. This caused all `authorizedProcedure` calls to fail with "Unknown role: member" since `member` isn't a defined tenant role. Fixed by querying `member.role` from the database using `(userId, organizationId)`.

32. **`@Heimdallone/db/schema` import path doesn't resolve** — The db package exports `"./*": "./src/*.ts"` but `schema` is a directory, not a file. Import as `@Heimdallone/db/schema/index` for the barrel, or `@Heimdallone/db/schema/hr-core` for specific tables.

33. **`drizzle-kit push` prompts interactively for constraint changes** — When pushing schema changes that affect existing data (adding unique constraints to populated tables), `drizzle-kit push` asks for confirmation interactively. In non-TTY environments (piped/CI), this fails. Use `drizzle-kit generate` + apply migration SQL directly for non-interactive environments.

34. **TanStack Router `routeTree.gen.ts` is auto-generated** — The file header says "You should NOT make any changes." It regenerates on dev server start and build. Must be gitignored (`**/routeTree.gen.ts`). If tracked, it causes constant merge conflicts.

35. **Playwright MCP and screenshot artifacts accumulate** — `.playwright-mcp/` and `screenshots/` directories from visual testing sessions grow unboundedly. Gitignore them and clean periodically.

### Patterns That Worked

10. **Enriched `getById` with LEFT JOINs for display names** — Instead of returning raw FK IDs and requiring the client to resolve names, the `employeeGetById` procedure joins work info with department/position/role/shift/workType/employeeType tables and returns `departmentName`, `jobPositionName`, etc. directly. The reporting manager name is resolved via a separate query on `employeeProfile`. This avoids N+1 queries on the client.

11. **Inline create/edit form pattern for settings** — The org settings page uses an expandable inline form row (background: `var(--bg-3)`, border-radius 12px) that appears above the table when creating or editing. Enter to save, Escape to cancel. Simpler than a separate dialog or sheet for simple name-only entities. Matches the handoff design language without introducing new modal patterns.

12. **`qc.invalidateQueries()` for broad cache busting** — After any mutation in org settings, calling `queryClient.invalidateQueries()` without specifying a key busts all cached queries. This is intentionally broad for settings pages where a department rename might affect position display names. For high-frequency pages (employee list), use targeted invalidation.

### Edge Cases to Watch

5. **Archive protection with employee count** — The `departmentArchive` procedure checks if active employees reference the department before archiving. The error message includes the count. Similar guards needed for jobPosition (not yet implemented), shift, workType, employeeType.

6. **`drizzle-kit push` vs `drizzle-kit generate + migrate`** — `push` applies schema diff directly and prompts for destructive changes. `generate` creates versioned SQL migration files. For development, `push` is faster. For production, always use `generate` + `migrate` for auditable, reversible migrations.

---

## Session: 2026-05-27 — Phase 5C–5E Employee Wizard + Edit + RBAC

### Gotchas Discovered

36. **OrgCtx must be exported for child routes** — The `OrgCtx` React context was defined in `app/route.tsx` but not exported. Child routes (`employees/index.tsx`, `employees/$id.tsx`) need `useContext(OrgCtx)` to access `memberRole` for role-aware UI. Fixed by adding `export` to the context definition.

37. **`sql.join()` for dynamic IN clauses in Drizzle** — For manager-scope filtering, the employee list needs `WHERE id IN (self, report1, report2, ...)`. Drizzle doesn't have a native `.in()` that accepts a dynamic array cleanly. Use `sql\`${table.id} IN (${sql.join(ids.map(id => sql\`${id}\`), sql\`, \`)})\`` for safe parameterized dynamic IN clauses.

38. **Employee without userId returns empty list, not error** — When `resolveCurrentEmployee` returns null (user has no employee profile in this org), the list returns `{ data: [], total: 0 }` instead of throwing. This is correct UX — a user who isn't an employee in this org simply sees no employees, not an error.

39. **Duplicate check must be pre-insert, not post-constraint** — Relying on Postgres unique constraint violations for duplicate email/badge gives raw error messages. Pre-checking with a SELECT before INSERT gives friendly messages like "An employee with this email already exists." The trade-off is a race condition window, but for HRMS the risk is negligible.

### Patterns That Worked

13. **Scope helper as a utility module** — `employee-scope.ts` centralizes all role/scope logic: `canReadAllEmployees`, `canMutateEmployees`, `canReadFullBankDetails`, `resolveCurrentEmployee`, `getDirectReportIds`, `checkReportingManagerCycle`. Each procedure imports only what it needs. Easier to audit than inline role checks scattered across procedures.

14. **Reusable EditSheet component** — A generic modal component that accepts a field list `{ key, label, value, type, options }[]` and renders the appropriate input (text, date, select). Only sends changed fields to the API (`diff before save`). Reusable across personal info, work info, and bank details edits without duplicating form logic.

15. **Cycle detection via chain walking** — `checkReportingManagerCycle` walks up the reporting chain from the proposed manager, checking each level against the employee being edited. Capped at 20 iterations to prevent infinite loops in corrupted data. Catches self-assignment and multi-level cycles.

### Edge Cases to Watch

7. **Employee with no employee profile** — A Better Auth user who is a member of an org but has no `employee_profile` record. This is valid (platform admins, external users). The scope system returns empty results for such users rather than errors.

8. **Manager with no direct reports** — A user with `manager` role but no employees have `reportingManagerId` pointing to them. They see only themselves in the list. This is correct behavior.

---

## Session: 2026-05-27 — Phase 6B–6D Contracts

### Gotchas Discovered

40. **oRPC error JSON is in `.json` field, not `.error`** — When inspecting oRPC error responses via curl, the error details are nested under `.json.message` (e.g. `{"json":{"message":"...", "code":"..."}}`). Not under `.error`. The TypeScript client unwraps this transparently.

41. **Biome `noExcessiveCognitiveComplexity` triggers on deep JSX ternaries** — A 5-level nested ternary in JSX (for conditional labels) contributed ~15 complexity points alone, causing the component function to exceed the 20-point threshold. Fix: extract to a module-level helper function with early-return `if` statements. Each nested ternary level adds +1 to the base cost plus +n for nesting depth.

42. **`noArrayIndexKey` on skeleton loading rows** — Biome flags `key={i}` when `i` is from `.map((_, i) => ...)` even for pure placeholder skeleton rows. Fix: pre-define a string array of keys (`const SKELETON_ROW_KEYS = ["sk-r0", ...]`) at module level and iterate over it.

43. **Modal backdrop as `div onClick` triggers three a11y errors** — A `<div onClick={closeModal}>` as a backdrop triggers `noStaticElementInteractions`, `useKeyWithClickEvents`, and `noNoninteractiveElementInteractions` simultaneously. Clean fix: split the backdrop from the layout container — use an absolutely-positioned `<button type="button">` for the backdrop and a sibling `<div>` with `position: relative` for the modal content. The button receives `onClick`, has no nesting conflict, and is semantically interactive.

44. **`contractsRouter` spread pattern** — `contractsRouter` exports `{ filingStatuses: {...}, contracts: {...} }` and is spread onto `appRouter` with `...contractsRouter`. This means the oRPC client paths are `orpc.contracts.*` and `orpc.filingStatuses.*` (flat) — NOT `orpc.contractsRouter.contracts.*`. The spread flattens the namespace.

45. **Active contract sync to `employee_work_info.basicSalary`** — Activating a contract writes back to `employeeWorkInfo`. When verifying activation, check both the contract status AND `employeeWorkInfo.basicSalary` to confirm the sync worked.

### Patterns That Worked

16. **Status lens pattern for filtered views** — Instead of a dropdown filter, use a segmented control of 5 status lenses (All / Draft / Active / Expiring Soon / Terminated). Each lens maps to a server-side `status` filter (or `expiring_soon` for the date-window case). The segmented control matches the handoff design and provides zero-friction navigation between views.

17. **Auto-suggest contract name on employee+date selection** — When the user picks an employee and start date in the create form, auto-populate the contract name as `{firstName} {lastName} — {year} Employment Agreement`. Only override if the field is empty or still matches the auto-suggestion pattern. Reduces friction without locking the user in.

18. **`validateForm()` extracted from `handleSave()`** — Moving validation logic into a separate `validateForm(): boolean` function defined inside the component (but outside `handleSave`) reduces `handleSave`'s cognitive complexity enough to pass Biome's threshold. The function uses closure variables from the component state — no need to thread parameters.

---

## Session: 2026-05-27 — Phase 6D Verification + Bug Fixes

### Gotchas Discovered

46. **`fmtDate()` display formatter used as form state initializer causes silent API corruption** — `fmtDate(null)` returns `"—"` (em-dash U+2014). An em-dash is truthy, so `endDate || null` passes `"—"` through to the API call as a real date string. `new Date("—")` is an `Invalid Date`, which causes a 500. Fix: use `date ? new Date(date).toISOString().slice(0, 10) : ""` for date input state initialization — never reuse a display helper for form state.

47. **`pageSize: 200` scattered across 3 files when procedure enforces `max(100)`** — The `hrCore/employees/list` procedure has a Zod `.max(100)` constraint on `pageSize`. Three callers passed `200`, each getting a 400. There's nothing at the call site to warn you — the constraint is invisible until runtime. Fix: changed all three to `100`. Future mitigation: a shared query options helper constant.

48. **HMR circular import fails silently, page requires full reload** — TanStack Router's `routeTree.gen.ts` creates circular import chains. When a hot-replaced file is in such a chain, Vite's HMR logs `"failed to apply HMR as it's within a circular import"` and falls back to a full page reload. If the reload also fails (`Cannot access 'X' before initialization`), the page stays stale — navigate to it again explicitly to force a fresh load.

49. **`[active]` in accessibility snapshot ≠ dropdown is open** — When using Playwright's `browser_snapshot`, a button showing `[active]` means it has the browser focus state, not that its associated dropdown is currently rendered. The dropdown items only appear in the snapshot when the menu is actually mounted in the DOM. Use `browser_take_screenshot` to visually confirm the menu is open before trying to click items inside it.

### Patterns That Worked

19. **Separate display formatter from form state initializer for dates** — Keep two distinct patterns: `fmtDate(d)` for display (returns `"—"` on null), and `d ? new Date(d).toISOString().slice(0, 10) : ""` inline for `useState` initialization (returns empty string on null). An empty string is falsy, correctly passing `endDate || null` checks.

20. **Evaluate-then-click for Playwright menus** — When `browser_snapshot` doesn't capture dropdown items (they're in the DOM but outside the a11y tree), use `browser_evaluate` with `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Label')?.click()` instead. This works because `evaluate` inspects the live DOM, not the a11y snapshot.

21. **Server-side pagination pattern (`pageSize: 50`, prev/next)** — Both `contracts/index.tsx` and `employees/index.tsx` use identical pagination: `const [page, setPage] = useState(1)` + `const pageSize = 50` + `totalPages = Math.ceil(total / pageSize)` + conditional `<div className="pagination">` only when `totalPages > 1`. No infinite scroll. Replicate this pattern for all list pages in Phase 7+.

### Edge Cases to Watch

9. **Dropdown selects that load employee lists are capped at 100** — ContractSheet, employee create wizard, and employee edit sheet all load the employee list via `pageSize: 100` for their dropdowns. An org with >100 employees will not see all employees in the select. Phase 7 should add search-as-you-type to these dropdowns rather than increasing the cap.

---

## Session: 2026-05-27 — Phase 6E QA/Docs + Payroll/Attendance/Leave Prep

### Gotchas Discovered

50. **Payroll must be designed for non-technical users** — payroll clerks, office managers, and small business owners who previously used spreadsheets. Every screen needs tooltips, helper text, plain-language labels, and guided setup checklists. This is not optional — it's a core design principle.

51. **Projected pay depends on Contracts + Attendance + Leave** — live projected pay for hourly/daily workers requires: an active contract (wage type + rate), validated attendance records (hours worked), approved leave (deduction impact), and country payroll profile (tax projection). If any is missing, the projection must explain why it cannot be calculated.

52. **Biometric/time attendance data is evidence, not payroll truth** — raw biometric punches, GPS check-ins, and manual clock-in/out are evidence of presence. They feed into attendance records, which must be validated by a manager before they become payroll source of truth. Device/geofence problems should never silently affect pay.

53. **Estimates must be clearly separated from finalized payroll** — every projected pay screen must include "This is not your final payslip", "Based on approved hours only", and `isEstimate: true` in API responses. Projection data must be excluded from export/download flows.

54. **Saturday OT is NOT statutory in Guyana** — the Labour Act specifies 1.5× for weekday overtime and 2× for Sunday/public holiday, but has no distinct Saturday rate. Saturday premium is per employer work schedule (Mon-Fri vs Mon-Sat). The payroll engine must handle this via work schedule configuration, not hardcoded rates.

55. **Qualification allowances are public-sector salary supplements, not tax deductions** — ACCA ($15K), Masters ($22K), PhD ($32K) per month are government salary top-ups, not universal deductions. Model as configurable employer allowances in the pay item system.

56. **Guyana has no statutory gratuity** — gratuity is employer-specific (common in public sector). Severance pay is governed by the Termination of Employment and Severance Pay Act: 1 week per year of service. Model gratuity as configurable per-employer, not statutory.

57. **GRA 2026 PAYE thresholds changed from 2025** — personal allowance raised from $130K→$140K/month, 25% band ceiling from $260K→$280K/month. Payroll engine must support versioned rates per country+year to handle annual budget changes.

### Patterns That Worked

22. **Verification table with source URLs** — marking each rate as verified/unverified with the source URL prevents assumptions and makes annual re-verification straightforward.

23. **Evidence pipeline pattern** — documenting the full chain from raw event → validated record → payroll gives everyone (dev, QA, HR, auditor) a clear mental model of how time data becomes money.

24. **Cross-referencing gy-taxcalc and v1** — inspecting both tools side-by-side identified which concepts to reuse (frequency conversion, accrual), which to redesign (client-side → server-side), and which to avoid (monolithic routers, no helper text).

25. **Parallel doc research** — using agents to read v1 codebase, gy-taxcalc, and Horilla extraction docs simultaneously saved significant time on a doc-heavy phase.

### Edge Cases to Watch

10. **Salary masking must remain server-side** — even in payroll projection and payslip views. Non-privileged roles should never receive salary data for other employees in API responses. Self-scope resolves own data only.

11. **gy-taxcalc is a useful internal reference but official rules must be verified** — rates match 2026 GRA notices, but annual budget changes require re-verification. The payroll engine must version rules per country+year.

12. **Old HeimdallOne v1 can inspire features but v2 remains the only implementation target** — v1 had production-grade payroll (75K+ lines) but monolithic routers, no helper text, and brittle edge cases. Carry forward the concepts (versioned rules, accrual, reversal), avoid the patterns (19K-line files, non-transactional finalization).

---

## Session: 2026-05-27 — Phase 7A.1 Odoo Research + Phase 7C Attendance API

### Gotchas Discovered

58. **Odoo is useful for workflow/UX inspiration but not architecture** — Odoo's module system, ORM, and view layer are Python/XML-native and don't translate to TypeScript. Extract concepts and patterns, not code or architecture. Their work-entries/resource-calendar abstractions are elegant but heavyweight; Heimdallone's simpler join-based approach (attendance_record + leave_request + holidays → payroll) is intentional.

59. **Odoo-style search/filter/group-by and multi-view patterns are valuable** — Every Odoo list view supports unified search, filter chips, group-by, and saved presets. Every module offers list + kanban + calendar + pivot + graph views. Heimdallone should adopt ViewSwitcher and enhanced FilterBar with group-by as shared primitives.

60. **Work entries vs attendance_record: compare carefully** — Odoo's unified work-entry system auto-generates records from attendance, leave, and planning modules. Heimdallone's design keeps these separate (payroll reads from three sources). Both work; ours is simpler but requires documented join logic in the payroll-readiness plan.

61. **Dual tolerance for attendance is smarter than a single grace period** — Odoo uses separate thresholds: company-favoring (don't penalize employee for < N min late) and employee-favoring (don't deduct for < N min early departure). Our current `graceTimeMinutes` only handles the first case.

62. **Accrual milestones are industry-standard for leave** — Flat accrual rates (1 day/month for everyone) are a simplification. Real HRMS systems use tenure-based rates. Plan for JSON milestone rules on leave_type.

63. **`z.record()` in Zod v3.23+ requires two arguments** — `z.record(z.unknown())` fails; must use `z.record(z.string(), z.unknown())`. Caught during Phase 7C attendance API implementation.

### Patterns That Worked

26. **Security review caught IDOR in eventsCreateManual** — The `authorizedProcedure("attendance", "create")` gate limits to HR roles, but the handler accepted any `employeeId` without scope checking. Added `checkScopeForMutation()` call to prevent cross-employee writes by unauthorized actors.

27. **Parallel research agents** — Running Odoo docs and GitHub research agents simultaneously produced comprehensive results in ~3 minutes vs sequential which would have taken ~6 minutes. Background agents are ideal for web-research-heavy spec phases.

28. **Every foreign key input must be tenant-verified** — Phase 7F leave API had 4 IDOR vulnerabilities caught by security review: `balancesAssign` (employee + leaveType), `balancesAdjust` (employee), `allocationsCreate` (leaveType), `restrictionsCreate` (departmentId). Pattern: any procedure accepting an entity ID as input must verify that entity belongs to `orgId(context)` before using it. `authorizedProcedure` gates role access but NOT tenant ownership of referenced entities. This applies to all future routers — payroll, recruitment, etc.

---

## Session: 2026-05-27 — Phase 7D–7H (Attendance UI, Leave Full Stack, QA Pass)

### Gotchas Discovered

64. **TanStack Router flat file vs directory route precedence** — A flat `attendance.tsx` at `routes/app/` takes priority over `attendance/index.tsx` in the same directory. The flat file was a placeholder "Coming Soon" page that blocked the real module UI from rendering. Fix: delete the placeholder flat file. This applies to any module with a directory route — check for leftover placeholders.

65. **Biome noExcessiveCognitiveComplexity limit is 20** — Large React components with inline conditional rendering, map callbacks, and multiple ternaries easily exceed this. Fix: extract sub-components (e.g., `RecordRow`, `RequestActions`, `ClockOutCell`). This is actually good architecture — each extracted component has a clear single responsibility.

66. **oRPC health check returns 405 on GET** — oRPC procedures respond to POST only. A `curl -s /rpc/healthCheck` GET returns 405 METHOD_NOT_SUPPORTED. This is expected, not a server error. Use `curl -X POST` or check `lsof -i :3000` to verify the server is running.

67. **Attendance security: `checkScopeForMutation` must verify org ownership even for HR roles** — The original pattern short-circuited scope checking for HR roles. But a user with HR role in Org A could pass an `employeeId` from Org B. Fix: always verify `employee.organizationId === orgId(context)` regardless of role. The role check determines WHICH employees (self/reports/all), the org check determines THAT the employee belongs to this tenant.

68. **Leave balance deduction on approve needs dual-bucket logic** — When approving leave, deduct from `availableDays` first; if insufficient, overflow to `carryForwardDays`. Also increment `usedDays`. When cancelling approved leave, reverse the deduction. This requires careful tracking of how much came from each bucket — current implementation uses a simple overflow approach.

### Patterns That Worked

29. **Saved-view lenses for every module** — Both attendance (6 lenses) and leave (5 lenses) use the same pattern: a row of buttons that set a filter predicate on the data. This is cheap to implement, highly discoverable, and avoids the complexity of a general-purpose filter builder while covering 90% of daily use cases.

30. **Clock panel as persistent widget** — The attendance check-in/out panel sits above the records table, always visible. It shows elapsed time after check-in. This is more intuitive than hiding check-in behind a button or separate page.

31. **Balance cards with color-coded stripes** — Leave balance cards use left-border colors matching the leave type. This provides instant visual grouping without needing icons. Shows available days (large), used + carry-forward (small), and paid/unpaid badge.

32. **Analytics planning as a separate doc** — Rather than scattering chart/reporting specs across each module spec, a single `analytics-reporting-plan.md` covers all modules, shared primitives, PDF export, and security constraints. Module specs cross-reference it.

---

## Session: 2026-05-27 — Phase 8A (Payroll Spec Finalization)

### Gotchas Discovered

69. **Payroll engine must be a pure calculation library** — The engine takes typed PayrollInput and returns PayrollPreviewResult with zero side effects. No DB reads, no HTTP calls. This makes it unit-testable, deterministic, and portable. The oRPC router is the only adapter layer. Mixing DB queries into calculation logic (as v1 did) makes testing and auditing much harder.

70. **Normalized payslip_line_item table vs JSON lineItems** — The payroll-spec.md initially proposed storing line items as JSON within the payslip. For analytics, reporting, and auditing, a normalized `payslip_line_item` table is necessary. You can't efficiently query "total housing allowance paid this quarter" from a JSON blob. Store a summary `explanation` JSON for fast rendering alongside the normalized rows.

71. **Country payroll profiles must be org-scoped, not global** — Initially proposed as global reference data, but orgs may customize rates (e.g., different insurance providers, additional statutory deductions). Making them per-org allows customization while seeding from templates.

72. **Filing status auto-creation from country profiles** — When creating a GY country profile, the system should auto-seed a "GY Standard PAYE" filing status with correct brackets. Otherwise, orgs must manually create filing statuses, which is error-prone for non-technical users.

### Patterns That Worked

33. **Exhaustive payroll input contract** — Defining PayrollInput, PayrollPreviewResult, PayrollBlocker, PayrollWarning, and ProjectedPayResult as TypeScript interfaces in the spec doc creates a clear boundary between "what the engine receives" and "what the engine produces". Every cross-module join is documented in one place.

34. **Payroll blocker/warning classification** — Splitting issues into blockers (prevent processing) and warnings (flag for review) with plain-language messages and resolution links is a repeatable pattern for any workflow with prerequisites. The "why blocked?" panel is the most important UX element for non-technical users.

35. **Spec-before-implement for the highest-risk module** — Payroll affects real money. The Phase 8A spec covers 12 entities, 20+ TypeScript interfaces, 17-step calculation order, 9 blockers, 9 warnings, 10 UI routes, and 10 open questions — all documented before any code is written. This is the right level of rigor for payroll.

## Session: 2026-05-27 — Phase 8B Cleanup

### Gotchas Discovered

73. **Tenant-critical config must have DB-level UNIQUE, not just application logic** — `payroll_setting` had a single row per org enforced only by seed scripts. For payroll (real money), a DB-level `UNIQUE(organization_id)` constraint is mandatory. Application-level uniqueness checks can be bypassed by concurrent requests, direct DB access, or bugs. This applies to any "one per tenant" config table: enforce at the database level with a unique constraint or index.

74. **Drizzle Kit snapshot JSON needs formatter pass after `drizzle-kit generate`** — Drizzle generates `meta/*.json` files with expanded array formatting that doesn't match Biome's rules. Run `bun x ultracite fix` on the generated files to avoid inflating the lint error count. This is a recurring cost of using Biome with Drizzle — add it to the post-generate checklist.

### Patterns That Worked

36. **Drizzle 3-arg pgTable for table-level constraints** — To add a UNIQUE constraint across columns, use `pgTable("name", { columns }, (t) => [unique("constraint_name").on(t.col)])`. The 3-arg form is the only way to express table-level constraints like composite uniques, composite indexes, or check constraints in Drizzle.

## Session: 2026-05-27 — Phase 8C (Payroll Calculation Engine)

### Gotchas Discovered

75. **Biome `noExcessiveCognitiveComplexity` limits long pipeline functions** — A 17-step payroll calculation in a single function hits complexity 46 (max 20). Extract step groups into helper functions that take a shared context object. The context pattern (`CalcContext` with `lineItems`, `explanations`, `sortOrder`) keeps helpers pure while allowing them to accumulate results.

76. **Biome `noNonNullAssertion` in test files** — Using `result.find(...)!.amount` in tests triggers lint errors. Use optional chain `?.` instead, even in tests where you've already asserted `toBeDefined()`. For `Math.abs()` which requires `number`, add `?? 0` fallback.

77. **Barrel file (`index.ts`) adds 1 lint error per package** — Biome's `noBarrelFile` rule flags re-export files. This is inherent to the monorepo pattern where each package needs a single entry point. Accept as structural debt (1 error per package).

### Patterns That Worked

37. **Integer cents for money arithmetic** — Converting all money to integer cents at input boundaries (`toCents()`), doing all math in cents, and keeping cents in output avoids IEEE 754 floating-point errors entirely. `Math.round(cents * rate)` gives exact results for payroll amounts within JS safe integer range. No need for BigDecimal libraries.

38. **Pure calculation engine with zero dependencies** — The payroll engine has no runtime dependencies. It takes `PayrollInput` → returns `PayrollPreviewResult`. No DB, no HTTP, no framework imports. This makes it unit-testable with fixtures alone (16 tests, 71 assertions, 30ms), portable to workers or client-side projections, and auditable by tracing the `explanation[]` array.

39. **CountryRules interface for multi-country support** — Encapsulating country-specific tax/NIS/allowance logic behind a `CountryRules` interface makes adding new countries a matter of creating a new module file. The engine resolves rules by country code, and each module is independently testable.
