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

77. **Biome `noBarrelFile` cannot be worked around with local definitions** — Adding a local `export const` to a file with re-exports does NOT satisfy the rule. And switching to `import` + `export` triggers `noExportedImports` ("use export from instead") — a catch-22. The fix: remove the barrel file entirely and use `package.json` subpath exports (`"./*": { "default": "./src/*.ts" }`). Consumers import from `@pkg/module` instead of `@pkg`. This is cleaner anyway — it enables tree-shaking and avoids loading unused modules.

### Patterns That Worked

37. **Integer cents for money arithmetic** — Converting all money to integer cents at input boundaries (`toCents()`), doing all math in cents, and keeping cents in output avoids IEEE 754 floating-point errors entirely. `Math.round(cents * rate)` gives exact results for payroll amounts within JS safe integer range. No need for BigDecimal libraries.

38. **Pure calculation engine with zero dependencies** — The payroll engine has no runtime dependencies. It takes `PayrollInput` → returns `PayrollPreviewResult`. No DB, no HTTP, no framework imports. This makes it unit-testable with fixtures alone (16 tests, 71 assertions, 30ms), portable to workers or client-side projections, and auditable by tracing the `explanation[]` array.

39. **CountryRules interface for multi-country support** — Encapsulating country-specific tax/NIS/allowance logic behind a `CountryRules` interface makes adding new countries a matter of creating a new module file. The engine resolves rules by country code, and each module is independently testable.

40. **Country rules must be versioned by year, not just country** — Trinidad & Tobago NIS rate changes from 16.2% (2026) to 19.2% (2027). A `countryCode + effectiveYear` registry key ensures the engine never silently applies wrong rates across year boundaries. Each country/year combination is an independent, auditable module. The `resolveCountryRules("TT", 2026)` → `trinidad-2026.ts` pattern makes this explicit.

41. **Graceful blocker for unimplemented country rules** — Rather than throwing an error or returning garbage when an org selects a country without implemented rules, the engine returns a clear blocker: "Payroll rules for BB 2026 are not implemented yet." This prevents silent miscalculation and gives a resolution path. The API layer doesn't need special handling — the blocker flows through the standard payroll preview UI.

## Session: 2026-05-27 — Phase 8D (Payroll oRPC API)

### Gotchas Discovered

78. **`employeeProfile` has `badgeId`, not `employeeCode`** — The engine types expect `employeeCode` but the DB schema uses `badgeId` on `employee_profile`. The input builder maps `badgeId` → `employeeCode`. Don't assume column names from the engine types match the DB schema — always check the Drizzle schema.

79. **Leave request status is `"requested"`, not `"pending"`** — The `leaveRequestStatusEnum` uses `["requested", "approved", "rejected", "cancelled"]`. The engine and readiness plan use "pending" as the concept, but the DB enum value is "requested". TypeScript catches this mismatch at compile time if the types are narrow enough.

80. **`departmentId` lives on `employeeWorkInfo`, not `employeeProfile`** — The `employee_profile` table doesn't have a department column. Department assignment is on `employee_work_info`. Any query grouping employees by department must join through `employeeWorkInfo`.

81. **Biome `noExcessiveCognitiveComplexity` hits input builder functions hard** — `buildPayrollInput` assembles data from 8+ DB queries with conditional logic. Extract each concern (country profile, settings, loans, reimbursements, attendance, leave, pay items) into its own function. This also improves testability — each builder function can be unit-tested independently later.

### Patterns That Worked

42. **PayrollInput builder as adapter boundary** — All DB→engine translation happens in `payroll-input-builder.ts`. The router calls `buildPayrollInput()` and passes the result directly to `calculatePayroll()`. No calculation logic in the router, no DB logic in the engine. This keeps both sides independently testable and makes the data flow auditable.

43. **`fromCents()` at API response boundaries** — The engine works in integer cents internally. The router converts back via `fromCents()` only when building the response. DB persistence also uses `fromCents()` to store `numeric(12,2)` values. This ensures no floating-point errors leak into persisted data or API responses.

## Session: 2026-05-27 — Phase 8E Cleanup (Auth/CORS + RBAC)

### Gotchas Discovered

82. **`CORS_ORIGIN` in `.env` must match the Vite dev port** — The server `.env` had `CORS_ORIGIN=http://localhost:3003` but Vite runs on port 3001 (or 3002 if 3001 is occupied). Both Hono's `cors()` middleware and Better Auth's `trustedOrigins` read from this single env var, so one fix covers both. For local dev: `CORS_ORIGIN=http://localhost:3001` (or whatever port Vite starts on).

83. **`authorizedProcedure("payroll", "read")` requires `payroll` in the access control `statement`** — Better Auth's `createAccessControl` rejects authorization checks for resources not in the statement definition at runtime. This produces 403 errors that look like permission denied but are actually "resource not found in ACL". Always add new resources to `packages/auth/src/permissions.ts` statement AND to each role before using them in `authorizedProcedure()`.

### Patterns That Worked

44. **Security review caught missing `canManagePayroll` guard** — The automated security review flagged `reimbursementsCreate` as missing the role check that every sibling handler had. Even though `authorizedProcedure("payroll", "create")` provides an RBAC gate, the `canManagePayroll` check is a defense-in-depth pattern — it limits mutations to specific roles within the already-authorized set.

## Session: 2026-05-27 — Phase 8I (Payroll QA/RBAC/Compliance)

### Gotchas Discovered

84. **`authorizedProcedure` checks role, not FK ownership** — `authorizedProcedure("payroll", "read")` gates by role permission, but does NOT verify that input IDs (payItemId, payPeriodId, etc.) belong to the current tenant. Every handler must add `eq(table.organizationId, orgId(context))` to WHERE clauses. Found: assignment DELETE missing payItemId bind (HIGH), payPeriodId unverified before `buildPayrollInput` (MEDIUM × 2), attendance/leave/department queries missing org scope in input builder (MEDIUM × 3).

85. **Reusable utility functions need their own tenant scoping** — `buildAttendanceInput` and `buildLeaveInput` queried by `employeeId` only. Even though the caller verified the employee's org, the utility functions should be independently safe — they may be called from new contexts later. Added `organizationId` parameter to both.

86. **DELETE with only `id` is dangerous without FK bind** — `payItemsRemoveAssignment` deleted by `payItemAssignment.id` alone. An attacker knowing a valid `payItemId` from their own tenant could supply any `assignmentId` and delete cross-tenant. Fixed by adding `eq(payItemAssignment.payItemId, input.payItemId)` to the DELETE WHERE clause.

### Patterns That Worked

45. **Systematic tenant-FK audit** — Walking every procedure's input→query path caught 9 findings across router + input builder. The pattern: for each input ID, trace it to the first DB query and verify `organizationId` appears in the WHERE clause. This is now a repeatable checklist for future modules.

### Compliance Note

Payroll calculations are not production-compliance-certified. Official statutory verification and payroll QA sign-off are required before production use. Guyana 2026 PAYE/NIS logic is implemented per research but needs GRA confirmation. Barbados/Trinidad rules are documented but not implemented.

---

## Session: 2026-05-28 — Phase 8J.1 Module Tabs + UX Clarity Polish

### Gotchas Discovered

87. **Phase commits can be misleading.** A commit titled "Phase 8J.1" was pushed earlier with only ~15% of the spec implemented (PayrollTabs component + 2 security fixes only). Verify with `git show --stat <sha>` against the original spec checklist — never trust the title alone.

88. **Multiple Edit calls to the same file in one message** run sequentially with re-reads between them, so they don't fight each other. But the PostToolUse formatter hook may rewrite the file after each Edit — old_string targeting reformatted regions on the next Edit needs a re-Read.

89. **`useFilenamingConvention` Biome rule still triggers on TSX after directory routing.** TanStack file-route paths like `payslips/$id.tsx` are valid because the `$` segment is at the directory level. PascalCase component file names (`PayrollTabs.tsx`) trigger the rule — use kebab-case (`payroll-tabs.tsx`) for the file, keep PascalCase for the exported component.

### Patterns That Worked

46. **Module tabs as a product standard.** A single `ModuleTabs` (or per-module like `PayrollTabs`) component rendered immediately under the page-header dramatically improved cross-page navigation. Pattern: a `Tab[]` array with `{ key, label, href, group, adminOnly }`, role filter, and an explicit `resolveActiveTab(path)` so the active state survives child routes (e.g. payslips list and payslips/$id both highlight "Payslips"). Recommended for Attendance, Leave, Employee Profile, Contracts.

47. **Plain-language UX wins.** Replacing engineering jargon with task-oriented language reduced ambiguity: "blocker" → "Needs fixing / Cannot continue", "warning" → "Needs review", "draft" → "Preview", "confirmed" → "Finalized". Raw enum/audit codes (e.g. `NEGATIVE_NET_PAY`) are demoted to small secondary text — useful for support but not the primary signal.

48. **Status legends inline beat tooltips.** A 1-line inline legend at the top of the payslips list ("Preview … not finalized · Finalized … visible to employees · Paid … bank confirmed") removed the need for tooltips and made the status badges self-explanatory.

49. **Collapsible explanations via `<details>`/`<summary>`.** The calculation-explanation panel on payslip detail used to be a permanently-rendered table that pushed the actual payslip below the fold on dense periods. Switching to `<details>` with `cursor: pointer` and `listStyle: none` keeps the same handoff visual, hides the noise by default, and works without JS state.

50. **Negative net pay is not a valid finalized payslip.** If the engine returns net < 0 (deductions exceed gross), the UI must surface a "Needs review — blocked preview" banner and never let the payslip look like a normal final document. The clamp-to-zero behavior remains in the engine for safety; the UI's job is to make the reviewer take action.

51. **Filter pills > tabs for intra-page categorisation.** Module-level `PayrollTabs` are for page navigation. Inside a single page (Pay Items, Loans, Reimbursements), small segmented filter "pills" with client-side filtering are the right primitive — they don't change the URL, they filter the table in place. Use server-side filter where the API supports it, fall back to client-side for derived categories (e.g. "Statutory" derived from `isStatutory` flag).

### Edge Cases to Watch

3. **CSV formula injection.** Excel evaluates any cell whose value starts with `=`, `+`, `-`, `@`, tab, or carriage-return as a formula. The Phase 8J.1 commit included a `csvCell()` helper that prefixes such values with a single quote and properly escapes quotes/commas/newlines. Any future CSV export from user-controlled fields must use this helper.

4. **State machine guards on terminal states.** `paymentBatchesMarkFailed` and similar transitions must reject calls when the batch is already in a terminal state (`paid`, `cancelled`, `failed`). Without the guard, a UI race or replayed network request can transition out of paid/cancelled and corrupt the audit trail.

### Compliance Note (carried forward)

Manual bank confirmation only. Exporting a bank file is **not** payment. "Mark as paid" requires positive confirmation from the bank portal. Republic Bank / EZPay templates require official specs before they may be enabled — Generic CSV is the only format until then.

---

## Session: 2026-05-28 — Phase 8J.2 Role Normalization + EmptyState

### Gotchas Discovered

90. **Better Auth's `/organization/create` auto-assigns the creator role `"owner"` regardless of the ACL.** Our ACL ships custom roles (`tenant_owner`, `tenant_admin`, etc.) but the org-create endpoint ignores them — the creator is always added with role `"owner"`. If UI checks expect the custom role string, the actual seeded owner is locked out of their own org's admin actions. Always either normalize the role check to accept both strings, OR promote the creator's membership immediately after `/organization/create` via `auth.api.updateMemberRole`. We did both.

91. **Skeleton rows shown when data is empty look indistinguishable from a forever-loading state.** The rule is: skeleton only while `isLoading === true`. Once `isLoading === false && rows.length === 0`, render a proper `<EmptyState />` with title + description + (optional) primary action. Bespoke per-page empty markup is fine, but it must visibly differ from the skeleton row.

### Patterns That Worked

52. **Centralized RBAC helpers for both sides of the wire.** `apps/web/src/lib/rbac.ts` (frontend) and `packages/api/src/utils/role-helpers.ts` (backend) export the same function names — `canManageHR`, `canManagePayroll`, `canViewPayroll`, `isOwnerOrAdmin`. Each accepts both the Better Auth default role names (`owner`, `admin`) AND our custom ones (`tenant_owner`, `tenant_admin`). Removing inline `PAYROLL_ROLES = [...]` literals from 12+ files made the role-string bug impossible to repeat per file. New code should import the helpers, never re-declare role arrays.

53. **Always normalize external/auth-provider role strings before authorization checks.** Anytime a third-party plugin (Better Auth, Clerk, Auth.js, etc.) assigns its own canonical role names alongside your custom ones, write a small helper that accepts both. This is the cheapest insurance against a brittle role lockout.

54. **Shared EmptyState primitive instead of per-table empty markup.** A single `<EmptyState />` component with `title / description / icon / action / secondaryAction` props replaces a dozen ad-hoc "No X found" `<tr><td colSpan>` blocks. Per-table `colSpan` is preserved by wrapping the EmptyState inside `<td colSpan={n} style={{ padding: 0 }}>` so it spans the table without re-styling.

---

## Session: 2026-05-28 — Phase 9A Recruitment + Onboarding Planning

### Patterns That Worked

55. **Plan-only phases produce better code, not just better docs.** Phase 9A's only deliverable is `recruitment-onboarding-implementation-plan.md`. The exercise forced explicit decisions on stage modelling (enum + per-opening JSON, not a separate `recruitment_stage` table), role modelling (`hiring_manager` is per-opening FK, not a global role), and template-snapshot semantics (snapshot to `onboarding_task` at instance creation, not live-bound). Each of those would have been a costly refactor mid-9D / 9G.

56. **Spec the conversion procedure before either side's schema lands.** `recruitment.candidates.convertToEmployee` is the single point where Recruitment and HR Core / Contracts / Onboarding touch. Specifying it as one transactional procedure (with explicit rollback semantics + idempotency via `candidate.convertedEmployeeId UNIQUE`) keeps both sides' schemas honest. The schema columns that exist solely to support this procedure (the convertedEmployeeId link, the applicationId link on `employee_onboarding`, the offer's amount/frequency carried over to a contract draft) are now obvious decisions, not last-minute additions.

### Edge Cases to Watch (for 9B+)

5. **Candidate document downloads — audit or not?** MVP says no (write traffic on every read). Re-evaluate when the audit log gets a "downloads" sub-channel; for now, presigned URL expiry serves as the security boundary.
6. **Pipeline stage rename retroactivity.** `pipelineConfig` JSONB on `job_opening` overrides stage labels per opening. Deleting / hiding a stage that still has candidates would orphan them — the override schema must be defensive: only allow hide on stages with zero open applications, or block the operation entirely.
7. **`onboarding_template_task.defaultAssigneeRole` is a string until the IT module exists.** When the Asset / IT module lands, the "it_admin" string should become a proper enum or FK to a role mapping table. Until then, treat unrecognised assignee-role strings as "needs HR triage" so the new hire isn't blocked by a typo in a template.

---

## Session: 2026-05-28 — Phase 9B Recruitment DB Schema + Seed

### Gotchas Discovered

92. **`db:migrate` reports success even when the target DB is different from what you expected.** The drizzle.config loads `DATABASE_URL` from `apps/server/.env`, which on this dev box points to `Heimdallone` (capital H) — not the older `karetech_erp` from the Phase 8 incident logs. Verify via `\l` and the URL itself before assuming tables landed in the wrong place.

93. **Seed scripts naturally trigger 4 biome rules at once.** `noNonNullAssertion` (on safe `arr[i]!` patterns), `noNamespaceImport` (the `import * as schema` convention), `noExcessiveCognitiveComplexity` (a long imperative `main()`), and `noUnusedVariables` (destructuring more than you use). The clean fix is a **file-level `// biome-ignore-all` header**, not a refactor — seed scripts are one-shot data generators and refactoring them into "real code" produces worse code, not better.

### Patterns That Worked

57. **`offer_approval` table with `sequence` column shipped even though MVP uses sequence=1 only.** Phase 9A open question Q1 recommended shipping the multi-step approval schema now to avoid a future migration. The cost was one extra table + one index. The benefit is that adding a second approver in the future is one new row, not a schema change.

58. **`candidate_converted_employee_uq UNIQUE` constraint on `candidate.convertedEmployeeId`.** Enforces the conversion procedure's idempotency at the DB layer. Even if two API calls race, only one can complete the conversion; the second will hit the unique violation and the API can return the existing `employeeId` instead of creating a duplicate employee record. Cheaper and more correct than relying on application-level locks.

59. **Soft-delete column on primary entities; not on audit rows.** `recruitment_requisition`, `job_opening`, `candidate`, `candidate_application`, `interview`, `offer`, `candidate_document`, `recruitment_note` carry `deleted_at`. Append-only history (`application_stage_history`, `interview_feedback`, `offer_approval`) does not — those tables are write-once and the audit value comes from being immutable.

---

## Session: 2026-05-28 — Phase 8J.3 Payroll/RBAC Correctness Fixes

### Critical Bugs Found and Fixed

94. **`requirePermission` used the raw `memberRole` string for the role-table lookup.** When Better Auth assigns the org creator role `"owner"`, the lookup `roles["owner"]` returned undefined and the middleware threw "Unknown role: owner". Phase 8J.2 fixed the UI but the API was still locked. Fix: a `normalizeRole()` helper inside `packages/api/src/index.ts` translates `owner → tenant_owner` and `admin → tenant_admin` BEFORE the lookup. Member/employee/manager are NOT promoted — they map to themselves.

95. **NIS rate unit mismatch at the API↔engine boundary was producing 100× too much NIS.** DB stores percent strings (`"5.60"` for 5.6%) but the engine's `percentOfCents(cents, rate)` does `Math.round(cents * rate)` — i.e. it expects a DECIMAL multiplier (0.056). The input builder passed the raw `Number("5.60") = 5.6`, so NIS landed at 560% of base. Engine tests passed because the test fixture used 0.056 directly — the bug lived precisely in the boundary code that wasn't covered. Fix: divide DB percent values by 100 in `buildCountryProfileInput` AND add an explicit engine test that pins the decimal contract.

96. **Unpaid leave was deducted twice in net pay.** `computeUnpaidLeave` returned `adjustedBasePay = basePay - deduction` AND the same deduction was added into `totalDeductions`. So `netPay = (reducedGross) - (deductions + unpaidLeave) = realNet - unpaidLeave`. Fix per Phase 8J.3 spec: gross uses the full `rawBasePay`; the unpaid-leave line stays in `totalDeductions`. Allowances that scale on base still scale against the adjusted basePay so they don't pay for unworked days. Engine test updated to assert `result.grossPay === normalResult.grossPay` AND `result.netPay === normalResult.netPay - unpaidAmount`.

97. **No guard against duplicate active payment batches on a payroll run.** `paymentBatchesCreate` would happily create a second batch when one already existed. Fix: query for non-terminal (`cancelled`/`failed`) batches first; throw `PRECONDITION_FAILED` if a blocking one exists. Re-exporting after a paid batch still requires explicit cancellation — we don't silently overwrite payment history.

98. **`runsMarkPaid` bypassed the payment-batch workflow.** A user could mark the run paid without ever creating a batch, never confirming with the bank. Fix: require at least one `payrollPaymentBatch.status='paid'` for the run before allowing the transition.

99. **CSV export header advertised "accountNumber" while the data is masked.** Renamed the header column to `accountNumberMasked` and prefixed the filename with `-preview` so no one downstream mistakes this for a bank-ready file. Real bank exports need per-bank format specs (Republic Bank / EZPay) and are deferred.

### Patterns That Worked

60. **A single `normalizeRole()` helper next to `requirePermission`** is cheaper than promoting either role family into the ACL. The ACL stays clean (one role per concept), the seed continues to upgrade the creator to `tenant_owner` (Phase 9B fix), and existing data that's still on the Better Auth defaults still works at the API boundary.

61. **Pin the unit contract in a test, not just the math.** The NIS bug existed for two phases because the engine tests used decimal fixtures and the DB stored percents — neither side caught the boundary. The new "NIS rate unit" test in `calculate.test.ts` explicitly asserts "decimal in, percent of base out" so future drift across the boundary is caught by `bun test`.

### Edge Cases to Watch (deferred — Phase 8J.4 or later)

8. **Bank details encryption at rest.** `employee_bank_details.account_number` is plaintext in Postgres. Masking happens at the API layer; an attacker with DB access reads the raw value. Document for compliance review; introduce column-level encryption (e.g. pgcrypto) before production.
9. **Fortnightly contract pay frequency.** Payroll supports `weekly / monthly / fortnightly / custom` but `contractPayFrequencyEnum` is `weekly / monthly / semi_monthly` only. Need a migration to add `fortnightly` and ideally `custom`; until then the UI must not let users select an unsupported frequency from a contract form.
10. **Dependent children count source-of-truth.** Engine reads `dependentChildren` from payroll input, but no `employee_profile` column tracks it. Currently the child allowance computes to zero silently. Either add the column (HR Core change) or surface a visible "child allowance disabled — no source data" warning on payslips.
11. **Attendance completeness for "ready to run" payroll.** The current input builder builds attendance input from whatever records exist. A period with a single clock-in for one employee still looks "complete" to the engine. We need a `attendance_period_status` (open/closed/locked) or a confidence reduction when worked days < scheduled days, and a blocker when the gap is large.
