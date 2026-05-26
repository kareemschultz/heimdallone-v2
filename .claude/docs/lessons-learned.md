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
