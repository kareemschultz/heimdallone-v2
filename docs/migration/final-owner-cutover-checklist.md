# Final Owner Cutover Checklist

The single short checklist to clear before approving the freeze. Detail lives in
[owner browser QA](./phase-21t-owner-browser-qa.md),
[prod config preflight](./phase-21u-production-config-preflight.md),
[freeze plan](./phase-21u-freeze-final-delta-plan.md),
[day-of packet](./phase-21u-day-of-command-packet.md),
[Pangolin flip](./phase-21w-pangolin-flip-checklist.md).

## A. Owner browser QA (via SSH tunnel)
```
ssh -L 3101:127.0.0.1:3101 -L 3100:127.0.0.1:3100 -L 3102:127.0.0.1:3102 karetech@kt-titan-01
```
- [ ] Tunnel opened
- [ ] http://127.0.0.1:3101 loads
- [ ] /login loads · http://127.0.0.1:3102/docs loads
- [ ] Platform owner login works
- [ ] Old v1 admin login works (retained)
- [ ] Tenant admin login works
- [ ] Employee login works
- [ ] Tenant switching works
- [ ] Employees page loads
- [ ] Attendance page loads
- [ ] Payroll page loads
- [ ] Finance / migration-status page loads
- [ ] Logout, then login again works
- [ ] No serious browser console errors
- [ ] No server/web log errors during QA

> Side-by-side caveat: in-browser data actions may not fully load until prod
> ingress routes same-origin `/rpc` → API (Pangolin item). SSR + login are testable.

## B. Production config ready (values from Infisical/host — never committed)
- [ ] `VITE_SERVER_URL=https://api.heimdallone.com`
- [ ] `BETTER_AUTH_URL=https://api.heimdallone.com`
- [ ] `CORS_ORIGIN=https://app.heimdallone.com`
- [ ] `PLATFORM_ADMIN_USER_ID=<Kareem migrated owner id>`
- [ ] `GOOGLE_CLIENT_ID` ready
- [ ] `GOOGLE_CLIENT_SECRET` ready
- [ ] Google OAuth callback URL added
- [ ] Pangolin `app.heimdallone.com/rpc` → API route planned/tested
- [ ] Pangolin `api.heimdallone.com` → API route planned/tested
- [ ] Pangolin `app.heimdallone.com` → web route planned/tested

## C. Cutover window readiness
- [ ] Users informed
- [ ] Downtime/freeze window approved
- [ ] Rollback plan understood (Pangolin back to v1; v1 DB untouched)
- [ ] v1 backup command ready
- [ ] v2 backup command ready
- [ ] Final ETL command ready
- [ ] Validation commands ready
- [ ] Biometric device cutover steps ready (Phase 21V)
- [ ] Pangolin flip steps ready (Phase 21W)

## D. Approval

Nothing in Phase 21U/V/W executes until you send the exact phrase:

> **Approve Phase 21U freeze**

**Do not execute the freeze, final production write-ETL, device registration, Gist
replacement, or Pangolin flip unless that phrase is sent.**
