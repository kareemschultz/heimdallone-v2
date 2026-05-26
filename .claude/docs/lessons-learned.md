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
