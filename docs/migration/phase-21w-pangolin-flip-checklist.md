# Phase 21W — Pangolin Flip Checklist (PLAN ONLY)

The public switch. **DO NOT FLIP** until Phase 21U (freeze + delta load) and 21V
(device) are done and the owner approves. v1 stays the source of truth until this
flip; rollback is instant (point Pangolin back to v1).

## Current state
- Pangolin/Traefik routes `app.heimdallone.com` (+ `api.heimdallone.com`) → the
  **v1** containers (`heimdallone-server`/`-web`/`-nginx`, `karetech_erp`).
- v2 containers (`heimdallone-v2-*`) run side-by-side on a private network, **not**
  on the pangolin network, reachable only on localhost `3100/3101/3102`.

## Future state
- `app.heimdallone.com` → **v2 web** (`heimdallone-v2-web`)
- `api.heimdallone.com` → **v2 server** (`heimdallone-v2-server`)
- `app.heimdallone.com/rpc` → **v2 server/API** (browser uses same-origin `/rpc`)

## Pre-flip preconditions
- [ ] Phase 21U complete (v2 == frozen v1, validated READY 46/46)
- [ ] Phase 21V complete (device registered, Pi/Gist switched)
- [ ] v2 stack restarted with **production** env (VITE_SERVER_URL/BETTER_AUTH_URL/
  CORS_ORIGIN/PLATFORM_ADMIN_USER_ID/Google = production values)
- [ ] v2 containers joined to the pangolin network
- [ ] Owner approves the flip

## Flip steps (in Pangolin admin / Traefik config)
1. Attach `heimdallone-v2-web` + `heimdallone-v2-server` to the pangolin network.
2. Repoint the `app.heimdallone.com` resource target → `heimdallone-v2-web`.
3. Repoint `api.heimdallone.com` → `heimdallone-v2-server`.
4. Ensure `app.heimdallone.com/rpc` (and `/api/auth`) → `heimdallone-v2-server`.
5. Save/apply; let Traefik re-resolve.

## Post-flip smoke (public URLs)
- [ ] `https://app.heimdallone.com` loads (v2)
- [ ] `https://app.heimdallone.com/login` loads
- [ ] `https://api.heimdallone.com/health` → 200
- [ ] `/rpc` reaches the API (a data action in the browser succeeds)
- [ ] Login + session works (credential + Google)
- [ ] Tenant switch works (platform owner)
- [ ] Employees page loads
- [ ] Attendance page loads
- [ ] Payroll page loads
- [ ] First-login welcome modal appears for a migrated user

## Rollback (instant)
- Point Pangolin `app.`/`api.` resources **back to the v1 containers**.
- **Do not alter the v1 DB** (`karetech_erp`) — it stayed live/frozen, intact.
- v1 remains fully available until the Phase 21Y archive.
- Capture evidence, fix, re-attempt — no DB restore needed (v1 and v2 use separate
  databases).

> After a clean flip: Phase 21X monitoring (first payroll cycle, auth, GL, backups),
> then Phase 21Y archive/cleanup of v1 (retain read-only as fallback).
