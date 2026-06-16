# v2 Docker Deployment

How the Heimdallone v2 app is containerized, built, and run side-by-side with the
live v1 stack. This is the operator/engineer record — not user-facing docs.

> No part of this stops v1, changes Pangolin, or touches `karetech_erp`. The v2
> containers run against the already-loaded `heimdallone_v2_prod` database on a
> dedicated network until the deliberate cutover flip.

## Images & base images

| Image | Dockerfile | Base (build → runtime) | Why |
| --- | --- | --- | --- |
| `heimdallone-v2-server` | `Dockerfile.server` | `oven/bun:1.3.12-slim` → `gcr.io/distroless/cc-debian12:nonroot` | Single `bun build --compile` binary on distroless/cc (glibc + libgcc + libstdc++ + ca-certs, no OS/shell). No node_modules, no source. |
| `heimdallone-v2-web` | `Dockerfile.web` | `oven/bun:1.3.12-slim` → `oven/bun:1.3.12-alpine` | TanStack Start → Nitro **bun preset** `.output/` (deps inlined, self-contained). Alpine runtime is safe — runtime is pure JS; native build tools stay in the glibc build stage. |
| `heimdallone-v2-docs` | `Dockerfile.docs` | `oven/bun:1.3.12-slim` → `oven/bun:1.3.12-alpine` | Same Nitro bun-preset pattern; Fumadocs. Optional — not required for app cutover. |

**Base-image rationale (smallest *safe*, proven by smoke test).**
- **Server** is a glibc-linked compiled Bun binary → it **cannot** run on Alpine (musl). `distroless/cc` is the smallest glibc base that still has libstdc++ + ca-certs; verified `/health` 200 + TLS + ICU timezones + node-postgres.
- **Web/docs** runtimes are the self-contained Nitro `.output` (pure JS) + Bun, so **Alpine (musl) is safe** — the native build tools (`@tailwindcss/oxide`, `lightningcss`) run only in the glibc *build* stage. Verified `/` and `/docs` 200 + TLS + tz.

## Image sizes (local builds, optimized)

- server: **179 MB** (distroless/cc + compiled binary; no node_modules, no shell)
- web: **165 MB** (bun:alpine + ~7 MB `.output`)
- docs: **164 MB** (bun:alpine + `.output`)

Web/docs floor: the Bun runtime binary itself is ~120 MB, so **sub-100 MB is not
reachable while shipping a JS runtime** — ~164 MB is the optimized floor for a
`bun:alpine` runtime. (Down from ~282 MB on bun-slim.) Server dropped 283 → 179 MB
by moving to distroless/cc.

## Build (CI → GHCR)

`.github/workflows/docker-images.yml`:
- Runs gates first (`check-types`, `build`, `audit:permissions`).
- Builds all three images with BuildKit GHA cache.
- **Pushes to GHCR only on a manual `workflow_dispatch` with `push=true`** — push
  to master / PR only *builds* (validates). No automatic deploy, no SSH, no
  Pangolin change.
- Tags: `sha-<short>`, branch, and `latest` on master.
- Images: `ghcr.io/kareemschultz/heimdallone-v2-{server,web,docs}`.

Pull a specific build:
```
docker pull ghcr.io/kareemschultz/heimdallone-v2-server:sha-<short>
```

## Healthchecks

- **server** — `GET /health` returns `{"status":"ok"}` (200) with **no DB
  dependency** (route registered before all middleware). The distroless image has
  **no in-image HEALTHCHECK** (no shell/curl) — probe `/health` **externally**
  (compose/orchestrator/Pangolin), as the v1 deploy already does against
  `https://api.heimdallone.com/health`.
- **web / docs** — in-image HEALTHCHECK fetches `/` via `bun -e` (alpine ships
  bun); docs also serves `/docs`.

## Run side-by-side (does not touch v1)

```
cp deploy/.env.v2.example deploy/.env.v2     # fill REAL values (gitignored)
export TAG=sha-<short>
docker compose -f deploy/docker-compose.v2.yml --env-file deploy/.env.v2 up -d
```
- Containers: `heimdallone-v2-{server,web,docs}` on the `heimdallone-v2` network
  (NOT joined to pangolin).
- Host ports: server `127.0.0.1:3100`, web `3101`, docs `3102` — no collision with
  v1 (which publishes no host ports).

### Verify v2 is talking to heimdallone_v2_prod
```
curl -fsS http://127.0.0.1:3100/health        # {"status":"ok"}
# then exercise an authenticated RPC and confirm it returns the migrated tenants.
```

## Keeping v1 live while v2 is tested

v1 keeps serving `app.heimdallone.com` via Pangolin the entire time. The v2 stack
is reachable only on localhost ports for smoke testing. **Flip Pangolin only at the
manual cutover gate** (point the `app.heimdallone.com` / `api.heimdallone.com`
resources at the `heimdallone-v2-*` containers).

## Rollback

- Before flip: just `docker compose -f deploy/docker-compose.v2.yml down` — v1 is
  untouched.
- After flip: point Pangolin back at the v1 containers (instant); the v2 stack can
  keep running or be stopped. No DB restore needed because v1 still uses
  `karetech_erp` and v2 uses `heimdallone_v2_prod` (separate databases).

## Resolved: web production SSR (`Route.update is undefined`)

The web image previously 500'd on `/` in production SSR. **Root cause: duplicate
TanStack/React versions** in the lockfile (`@tanstack/router-core` 1.171.6 **and**
1.171.13, plus duplicate `react-router`/`react-start`/`react`/`react-dom`). Nitro
bundled both `router-core` copies, so a `Route` created by one was consumed by the
other → `Route.update` undefined. **Fix:** pinned single versions via `overrides`
in the root `package.json` (router-core 1.171.13, react-router 1.170.15,
react-start 1.168.25, react/react-dom 19.2.7) + the official vite plugin order
(`tanstackStart()` → `nitro({preset:"bun"})` → `viteReact()`). Web now serves
`/` → 200 in the container. Keep `overrides` aligned when bumping TanStack.

## Secrets

Never baked into images (verified via `docker history` + filesystem scan). Runtime
secrets come only from `deploy/.env.v2` (gitignored) / Infisical / the host env.
The Dockerfiles copy build artifacts only — no `.env`, no source tree, no dumps.
