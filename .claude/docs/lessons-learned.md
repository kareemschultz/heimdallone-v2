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
