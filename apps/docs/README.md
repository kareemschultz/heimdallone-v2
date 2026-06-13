# @Heimdallone docs (`apps/docs`)

User-facing product documentation for Heimdallone v2, built with
[Fumadocs](https://fumadocs.dev) on TanStack Start. This is the long-term docs
system of record per the **Documentation Rule** (see `AGENTS.md`).

Isolated from the product app (`apps/web`) — it cannot break the product build.

## Commands

```bash
bun run -F docs dev      # local dev server
bun run -F docs build    # production build (must pass)
bun run -F docs lint     # biome (self-contained config)
```

## Structure

- `content/docs/**.mdx` — the documentation tree (module-based, role-aware).
- `content/docs/**/meta.json` — sidebar ordering / grouping.
- `src/components/tag.tsx` — the canonical status/role/domain tag set for MDX.

## Conventions

- Module-based, role-aware. Where a workflow differs by role, document each view.
- Use the `<Tag>` labels (Live / Preview / Beta / Migration / Admin / … ) consistently.
- Never present sample/demo data as live.
- When the product UI/workflow/RBAC changes, update the matching page here.

See `docs/architecture/fumadocs-adoption-plan.md` for the adoption path and roadmap.
