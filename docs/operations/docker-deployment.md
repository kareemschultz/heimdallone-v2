# v2 Docker Deployment

How the Heimdallone v2 app is containerized, built, and run side-by-side with the
live v1 stack. This is the operator/engineer record — not user-facing docs.

> No part of this stops v1, changes Pangolin, or touches `karetech_erp`. The v2
> containers run against the already-loaded `heimdallone_v2_prod` database on a
> dedicated network until the deliberate cutover flip.

## Images & base images

| Image | Dockerfile | Base (build → runtime) | Why |
| --- | --- | --- | --- |
| `heimdallone-v2-server` | `Dockerfile.server` | `oven/bun:1.3.12-slim` → `debian:trixie-slim` | Built as a single `bun build --compile` binary; the minimal glibc runtime carries only the binary + `ca-certificates` (TLS) + `curl` (healthcheck) + `libstdc++6`. No node_modules, no source. |
| `heimdallone-v2-web` | `Dockerfile.web` | `oven/bun:1.3.12-slim` → `oven/bun:1.3.12-slim` | TanStack Start → Nitro **node-server** `.output/` (deps inlined, self-contained). Runtime = bun-slim + `.output` + CA certs. |
| `heimdallone-v2-docs` | `Dockerfile.docs` | `oven/bun:1.3.12-slim` → `oven/bun:1.3.12-slim` | Same Nitro pattern (`NITRO_PRESET=node-server`); Fumadocs. Optional — not required for app cutover. |

**Base-image rationale.** `oven/bun:slim` (Debian/glibc) is the smallest *safe*
base: Alpine (musl) is avoided because the Bun runtime + native-adjacent deps are
not proven on musl; distroless is avoided because we need a working healthcheck +
TLS + easy debugging. The server runtime is `debian:trixie-slim` (glibc) because a
compiled Bun binary needs only libc + `libstdc++6` — no Bun toolchain — so this is
smaller than shipping the bun image while staying glibc-compatible (TLS, ICU
timezones, and `node-postgres` all verified).

## Image sizes (local builds)

- server: **283 MB** (compiled binary; no node_modules)
- web: **282 MB** (bun-slim base + ~7 MB `.output`)
- docs: **282 MB** (bun-slim base + `.output`)

The web/docs floor is the bun-slim base (~280 MB); the app payload is tiny. Going
below ~200 MB would require Alpine (unproven for this stack) — rejected per the
safety rule.

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
  dependency** (route is registered before all middleware). Container HEALTHCHECK
  uses `curl /health`.
- **web / docs** — HEALTHCHECK fetches `/`; docs also serves `/docs`. (Nitro has
  no dedicated health route; `/` is stable for docs.)

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

## Known issue (pre-cutover blocker, app-level — not Docker)

The **web** image builds and boots, but SSR of `/` currently returns 500
(`Route.update is undefined`) — a TanStack Start v1.167 + Nitro-beta production-SSR
bug. Proven app-level, not infra: the **docs** image uses the identical Nitro
node-server pattern and serves `/docs` → 200. This must be fixed before the web
container is cutover-ready; the server + docs images are ready.

## Secrets

Never baked into images (verified via `docker history` + filesystem scan). Runtime
secrets come only from `deploy/.env.v2` (gitignored) / Infisical / the host env.
The Dockerfiles copy build artifacts only — no `.env`, no source tree, no dumps.
