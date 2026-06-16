# v2 Docker Image Optimization — decisions & rationale

Why the v2 images are built the way they are, what was tried, what was rejected,
and the before/after numbers. Pairs with [docker-deployment.md](./docker-deployment.md)
(how to build/run) — this doc is the *why*.

## Method (applied to every image)

1. Build → 2. **Smoke test** (a running container must return 200, not just build)
→ 3. Measure size → 4. Inspect contents/layers → 5. Shrink safely → 6. Rebuild &
re-smoke → 7. Record before/after. A base/runtime change is only accepted if the
smoke test passes (`/health` or `/` → 200, TLS works, ICU timezone correct,
non-root, no secrets in `docker history`/filesystem).

> Guiding rule: **smallest *safe* image, not smallest theoretical.** Reliability
> (Bun, TLS, timezone, native deps, SSR, healthcheck) beats a fragile minimal image.

## Before → after

| Image | First working build | Optimized | How |
| --- | --- | --- | --- |
| server | 1.76 GB → 283 MB | **179 MB** | all-workspace `node_modules` (1.76 GB) → `bun build --compile` single binary (283 MB on debian-slim) → distroless/cc runtime (179 MB) |
| web | 282 MB | **165 MB** | bun-slim runtime → bun:alpine runtime |
| docs | 282 MB | **164 MB** | bun-slim runtime → bun:alpine runtime |

## Decisions & why

### Server: compiled binary on distroless/cc (glibc)
- `tsdown` bundles only the workspace code and leaves npm deps external, so a naive
  runtime needed `node_modules`. A root `bun install --production` pulls **every**
  workspace's deps (web/native/docs) → **1.76 GB**. Rejected.
- `bun build --compile` bundles workspace code **and** all npm deps **and** the Bun
  runtime into one binary → **no node_modules, no source**. This is the team's
  existing `compile` intent.
- The binary is **glibc-linked → cannot run on Alpine (musl)**. Smallest safe glibc
  base = `gcr.io/distroless/cc-debian12` (glibc + libgcc + libstdc++ + ca-certs, no
  OS/shell). Verified: `/health` 200, TLS, ICU tz, node-postgres, non-root (65532).
- **Distroless trap:** no shell/curl → **no in-image HEALTHCHECK**. `/health` is
  probed externally (compose/orchestrator/Pangolin), matching how the v1 deploy
  checks `https://api.heimdallone.com/health`.

### Web/docs: Nitro self-contained `.output` on bun:alpine (musl)
- TanStack Start/Fumadocs → Nitro **bun preset** emits a self-contained `.output`
  (deps inlined) → the runtime needs only Bun + `.output`, **no node_modules**.
- The runtime is **pure JS**, so **Alpine (musl) is safe** — the native build tools
  (`@tailwindcss/oxide`, `lightningcss`) run only in the glibc **build** stage.
  Verified: `/` and `/docs` 200, TLS (apk ca-certificates), tz, non-root (bun).
- **Size floor:** the Bun runtime binary is ~120 MB, so a Bun-runtime image **cannot
  go sub-100 MB**. ~164 MB is the optimized floor for `bun:alpine`; chasing <100 MB
  was abandoned as mathematically impossible without dropping the runtime.

### Cross-cutting techniques applied
- **Multi-stage builds** — build deps/tools never reach the runtime stage.
- **Layer-cache ordering** — copy manifests first (`COPY --parents package.json
  bun.lock turbo.json apps/*/package.json packages/*/package.json`) → `bun install`
  → `COPY . .` → build, so a source-only change keeps the install layer **CACHED**
  (verified with `--progress=plain`).
- **`.dockerignore`** — excludes `.git/.claude/.references/node_modules/.env*/
  backups/dumps/internal-docs/screenshots`; keeps app assets (PNG/SVG).
- **`HUSKY=0` + `bun install --ignore-scripts`** — neutralizes the husky `prepare`
  failure in Docker (no `.git`; husky absent under `--production`). Verified nothing
  needs a real postinstall — *enabling* scripts instead broke the build (a `docs`
  workspace postinstall errors in-image) and wasn't the fix anyway.
- **No `rm -rf` cleanup anti-pattern** — runtime stages `COPY --from=build` only the
  artifact; junk is never copied in the first place. apt/apk cleanup is combined in
  the same `RUN` layer.
- **Copy artifacts only** — no source tree, no `.env`, no dumps in any runtime image
  (proven via `docker history` + filesystem scan; `/var/backups` is the empty OS dir).

### Rejected approaches & why
- **node:22 / node:22-slim runtime** — 329 MB–1.1 GB; bigger than our bases.
- **Alpine for the server** — the compiled binary is glibc; musl can't load it.
- **`bun install --production` for the server** — pulls all workspaces (1.76 GB).
- **Dropping `--ignore-scripts`** — breaks on the `docs` postinstall; unnecessary.
- **scratch base** — no glibc/ICU/certs for Bun; not viable.
- **Docker Slim** — only a post-smoke experiment, not adopted (compile + distroless
  already hit the floor).

## The SSR fix that unblocked the web image

The web image built but 500'd on `/` (`Route.update is undefined`) due to **duplicate
TanStack/React versions** in the lockfile (Nitro bundled two `@tanstack/router-core`
copies). Fixed by pinning single versions via root `package.json` `overrides` +
the official vite plugin order. Full write-up: lessons-learned **#96** and the
"Resolved" section of [docker-deployment.md](./docker-deployment.md).
