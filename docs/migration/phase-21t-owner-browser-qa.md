# Phase 21T — Owner Browser QA (side-by-side v2)

Hands-on browser QA of the v2 stack **while v1 stays live**. Read/test only — no
freeze, no Pangolin change, no cutover. Do this before approving the Phase 21U
freeze.

## Access (SSH tunnel from your local machine)

```
ssh -L 3101:127.0.0.1:3101 -L 3100:127.0.0.1:3100 -L 3102:127.0.0.1:3102 karetech@kt-titan-01
```

Then open in your browser:
- Web app: **http://127.0.0.1:3101**
- Login: **http://127.0.0.1:3101/login**
- Docs: **http://127.0.0.1:3102/docs**
- API health: **http://127.0.0.1:3100/health** (expect `{"status":"ok"}`)

> Known side-by-side limitation: the browser calls `window.location.origin/rpc`
> (i.e. `127.0.0.1:3101/rpc`), which this stack does not proxy to the API. So
> **server-rendered pages work, but in-browser data actions may not fully load**
> until production ingress routes `/rpc` → API. That routing is a Phase 21W item
> — note it, don't treat it as a v2 bug. (Server-side `/health`, `/`, `/login`,
> `/docs` and SSR redirects all work today.)

## Checklist

### Public / unauthenticated
- [ ] Landing `/` loads
- [ ] `/login` loads
- [ ] `/docs` loads
- [ ] No redirect to v1 / public domain
- [ ] No browser console errors
- [ ] No web/server container errors after loading (see "Logs" below)

### Login accounts (use your own credentials — never share/paste passwords here)
- [ ] Platform owner login (kareemschultz46@gmail.com)
- [ ] Old v1 admin login still works (retained, not demoted)
- [ ] Tenant owner/admin login
- [ ] Employee login
- [ ] Logout, then log in again
- [ ] Invalid login shows a friendly error (not a crash)

### Platform / tenant behavior
- [ ] Platform owner sees expected admin/platform features
- [ ] Tenant switching works
- [ ] Correct tenant data appears
- [ ] No cross-tenant data leakage
- [ ] Foreign Links tenant appears
- [ ] Netsurf tenant appears

### Core HR
- [ ] Employees page loads
- [ ] Employee detail loads
- [ ] Statutory info visible where expected
- [ ] Missing TIN/NIS shows as missing/null (NOT fabricated)
- [ ] The 6 no-login employees appear correctly (no fake emails)

### Time / attendance
- [ ] Attendance page loads + records visible
- [ ] Roster / work-schedule page loads (if surfaced)
- [ ] Biometric page loads (NO live device cutover, NO Gist change yet)

### Payroll / finance
- [ ] Payroll page loads
- [ ] Payslip/payroll records load (historical payslips immutable)
- [ ] Finance / GL page loads (if surfaced)
- [ ] Migration-status page loads (HR/admin)
- [ ] GL / trial-balance looks correct

### Auth / Google
- [ ] Google button visible **if configured** (currently NOT configured in
  side-by-side — see preflight). Do not test Google until the v2 OAuth callback
  is added.

### Logs during QA (run on the host, in another terminal)
```
docker logs --tail=200 heimdallone-v2-server
docker logs --tail=200 heimdallone-v2-web
docker logs --tail=200 heimdallone-v2-docs
```
- [ ] Server logs: no crashes
- [ ] Web logs: no SSR errors
- [ ] Docs logs: no errors
- [ ] No secrets printed
- [ ] No `karetech_erp` access from v2

## When done
If everything looks right, the data you saw is **as of the original load** and will
be refreshed by the Phase 21U freeze + final delta load. Approve the freeze with:
**"Approve Phase 21U freeze."**

Teardown (optional): `docker compose -f deploy/docker-compose.v2.yml --env-file deploy/.env.v2 down`.
