# Production Completion Pass — Backlog modules + Next-Phase-Plan A–I (2026-06-18)

Live v2 (`app.heimdallone.com`). One overnight pass: finished the remaining
backlog modules AND worked the owner's "production completion" plan (Phases A–I).
Deployed coherently at **`sha-702a76f`** (web+server+docs one SHA). All prod
writes backed up first; v1 rollback (`sha-d03e5b4`) preserved; no v1/`karetech_erp`
writes; no secrets printed/committed.

## Backlog modules shipped (all deployed in `sha-702a76f`)

- **Inventory** (earlier, `sha-fca9c99`) — ledger-backed stock (StockHub port,
  multi-tenantised). Migration 0031.
- **Org chart** (`364fc16`) — `hrCore.employees.orgChart` (reuses `employee:read`,
  audit unchanged) + recursive tree UI; see-all roles get the org, managers get
  their subtree (server-side BFS). **Also fixed 13 pre-existing latent
  check-types errors** (cache-masked `.returning()` null-strictness in
  lifecycle/communications/attendance-device-compat) → check-types genuinely 3/3.
- **GL UI / Finance-depth** (`7ad872b`) — Chart of Accounts / Journals (post,
  reverse, balance-checked create) / Trial Balance as Finance tabs over the
  existing `gl` router; gated `canViewGL`/`canManageGL`/`canReverseGL`. UI-only.
- **Surveys** (`603599c`) — schema (4 tables, migration 0032) + `survey` AC
  resource (audit 196/29 → **202/30**) + `surveys` router + Feed/Manage UI +
  Fumadocs. **Anonymity enforced server-side** (respondentUserId NULL when
  anonymous; results aggregate-only; partial-unique one-response-per-identified-user).

## Next-Phase-Plan A–I

| Phase | Status | Evidence |
| --- | --- | --- |
| **A — Security closeout** | ✅ DONE | QA user `banned`, 0 credentials, 0 sessions (leaked password has nothing to verify against = invalid); password string absent from tracked files AND full git history; `.qa-cred` gitignored; create-qa-user.ts never hardcodes the password. |
| **B — Users & Access** | ✅ verified (code) | `/app/users` + `accept-invitation/$id` routes exist (built 21X); admin-gated. Browser flow QA deferred — SSR won't serve in this sandbox (build passes 3/3; infra, not feature, limit). |
| **C — Roster** | ✅ verified (code) | `/app/roster` route exists; nav present. Browser QA deferred (same SSR limit). |
| **D — Pi attendance sync** | ⛔ BLOCKED (operator) | Endpoint live (`api.heimdallone.com/health` 200). Prod v2 has **0 devices registered, 941 punches** (cutover load). Re-pointing the on-site Pi (10.241.1.109) + registering the device are physical/remote operator steps — see `phase-21v-pi-attendance-sync-operator-packet.md`. Until done, v1 remains the live attendance sink (Phase H). |
| **E — QA audit** | ✅ DONE | `/app/*` routes clean of fake data (21X cleanup held); fake data was confined to the apex marketing landing → fixed in F. Preview modules `PreviewBanner`-gated. `settings.tsx` "Net pay (demo)" is a labelled payslip-template preview, not live data. |
| **F — Apex marketing** | ✅ DONE (deployed) | Removed the fake "Trusted by" logo marquee (8 invented companies); hero preview "Atlas Shipping" (dev seed org) → "Your company"; dead "View live demo" CTA → "Sign in". **Served HTML now has 0 fake refs.** Mobile already responsive (marketing.css @media). |
| **G — Preview modules** | ✅ DECIDED | Keep Compliance/Documents/Clients as **admin-only preview** (PREVIEW_KEYS gating + PreviewBanner sample-data labelling) — meets "no fake data presented as live; honest; admin-only if unfinished". Countries & Tax is live (real GY profile, 21X). No change needed. |
| **H — Final delta decision** | ✅ DECIDED | v2 is the operational source of truth (all HR/payroll/leave/contracts migrated + reconciled 46/46; users on v2). The ONLY still-changing v1 data is **attendance punches** the Pi posts to v1 until Phase D. Decision: monitor-only except attendance; one-time attendance delta at Pi cutover; keep v1 rollback; **no archive** (Phase I). |
| **I — v1 archive plan** | ✅ PLAN written | `phase-21i-v1-archive-plan.md` — plan only, not executed; owner approval + clean monitoring window + Phase D required first. |

## Gates at ship (`sha-702a76f`)

check-types **3/3** · build **3/3** (web+server+docs) · audit:permissions **202/30**
· lint **140 errors / 602 files** (≤ 212 ceiling; new module files all per-file
clean, 0 added) · web-tsc: new module files 0 errors (pre-existing
development/nitro baseline untouched).

## Deploy + smoke evidence

- Prod backups before each write: `backups/heimdallone_v2_prod_pre-inventory_*.dump`
  (0031), `…_pre-surveys_*.dump` (0032).
- Migrations on `heimdallone_v2_prod`: 0031 (inventory) + 0032 (surveys) → journal 33.
- Coherent images web+server+docs all `sha-702a76f`.
- Smoke: `app.heimdallone.com/` 307 · `/login` 200 · `api.heimdallone.com/health`
  200 · apex served HTML 0 fake refs · server logs no errors.
- Disk reclaimed to 85% (builder-cache prune); v1 rollback images intact.

## Carried / operator items

- **Phase D** (operator): register the prod biometric device in v2 + re-point the
  Pi to `/rpc/biometric/ingest/submit` (keep v1 rollback; prove dedupe). External.
- **Browser QA** of Users/Roster/new modules (owner) — SSR won't serve in this
  sandbox; deployed build serves fine in prod.
- **v1 archive** — plan ready (Phase I), pending monitoring window + owner approval.

## Hard rules held

NO v1 DB / `karetech_erp` writes · NO secrets printed or committed · v2 backed up
before every prod write · coherent image tags (one SHA) · v1 rollback preserved ·
no dirty deploy · no fake production data.
