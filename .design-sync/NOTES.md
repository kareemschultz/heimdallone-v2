# design-sync NOTES — @Heimdallone/ui → Heimdallone UI (claude.ai/design)

Project: `Heimdallone UI` (`1352be48-8503-44e4-9a0e-fc0c74e18758`). Shape: **package**
(source-distributed — NO `dist`/build; synth-entry from `src/`).

## Repo-specific gotchas (a re-sync must honor these)

- **Workspace self-symlink required.** The dts parser resolves the package via
  `node_modules/@Heimdallone/ui`, which bun does NOT create. Before building:
  `mkdir -p packages/ui/node_modules/@Heimdallone && ln -sfn ../../ packages/ui/node_modules/@Heimdallone/ui`.
  Run the converter with `--node-modules packages/ui/node_modules` (has react +
  @base-ui/react + the self-ref). Root `node_modules` lacks react — do NOT use it.
- **CSS must be COMPILED — this is the #1 re-sync risk.** The DS is Tailwind v4;
  `globals.css` is *source* (`@import "tailwindcss"` + `@theme` + `@source`), not
  utilities. `cfg.cssEntry` points at `packages/ui/.ds-compiled.css`, a **build
  artifact (gitignored)** that must be regenerated each sync, else previews ship
  unstyled. Regenerate with the standalone Tailwind CLI over the combined input
  `packages/ui/.ds-compile-input.css` (committed — imports globals + heimdall +
  scans the previews):
  ```sh
  (cd .ds-sync && npm i @tailwindcss/cli@4)   # if not staged
  (cd packages/ui && ../../.ds-sync/node_modules/.bin/tailwindcss \
     -i .ds-compile-input.css -o .ds-compiled.css)
  ```
- **Two token layers.** Components depend on BOTH `globals.css` (shadcn tokens:
  `--card`/`--background`/`--primary`) AND `apps/web/src/styles/heimdall.css`
  (the navy scale: `--bg`/`--bg-2`/`--fg`/`--line`/`--accent-soft`…). heimdall.css
  lives in **apps/web**, not the ui package — `.ds-compile-input.css` imports it
  by relative path. If heimdall.css moves, fix that import.
- **Dark-first DS.** Token defaults are dark navy. Authored previews wrap content
  in a `var(--bg)`/`var(--fg)` frame so "naked" components (DataTable, forms) are
  readable — the preview `<body>` is hard-white (converter default).
- **Fonts host-provided.** Inter + JetBrains Mono are loaded at runtime (Google
  Fonts) — not shipped. `cfg.runtimeFontPrefixes` suppresses `[FONT_MISSING]`;
  previews render in system fallback (acceptable; ship woff2 via `cfg.extraFonts`
  for exact-font fidelity later).
- **playwright** 1.59.1 (matches cached `chromium-1217`); installed in `.ds-sync`.

## Component scope (this sync)

- 58 exports (real components + shadcn compound sub-parts — all legitimate).
- **10 authored + graded good:** Button, Card, StatTile, DataTable, StatusBadge,
  EmptyState, PageHeader, Input, Checkbox, Skeleton.
- 48 floor cards (deliberate baseline; authorable on any re-sync).
- **PillStatus is intentionally floor-carded:** its `.pill-status` styling lives
  in app-level CSS (`apps/web/src/styles/{contracts,employees,leave,attendance}.css`),
  NOT the DS package — it cannot be styled from the bundle. Don't author it until
  that CSS moves into packages/ui.

## Known render warns (triaged — not regressions)

- `[RENDER_BLANK]`/thin on floor-card sub-parts (AlertDialog*, Sheet* fragments,
  CardFooter, etc.) — expected; they're unauthored typographic floor cards.

## Re-sync risks (watch-list)

- **`.ds-compiled.css` staleness** — if you forget to recompile, every preview is
  unstyled but validate still "passes" (CSS present, just wrong). Always recompile.
- **heimdall.css drift** — it's an app file the DS silently depends on; a token
  rename there changes component rendering with no error here.
- **dtsPropsFor empty** — synth-entry produced weak `[key:string]:unknown` props.
  Adding a real `packages/ui` build (tsc emit) would give the design agent real
  prop contracts; consider it.
- **Overlays (AlertDialog/Sheet/DropdownMenu/ConfirmDialog/EntitySheet/ActionMenu/
  Toaster) are floor cards** — they portal/need open-state; author with
  `cfg.overrides.<Name>={cardMode:"single",viewport:"WxH"}` when time allows.
