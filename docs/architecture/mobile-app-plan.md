# Heimdallone v2 Mobile App — Implementation Plan (Expo / React Native)

**Status:** `Preview` (plan / spec only — no app code written yet)
**Owner audience:** developer/operator record
**Last updated:** 2026-06-17
**Scope:** A separate Expo / React Native employee **self-service** app that reuses the existing
v2 oRPC API and Better Auth. This is the **largest single remaining product item** — a whole
app, not a web module.

> **SaaS Architecture Rule (STANDING OVERRIDE) applies.** The mobile app is a tenant-safe,
> role-scoped self-service client. It must work for every tenant, country, and role. **No
> hardcoded Netsurf / Foreign Links logic, no hardcoded org id, no hardcoded country.** v1's
> mobile app is the **intent source** (which features employees actually use on a phone), not a
> blueprint to clone — capture the features, not the bugs.

> **Documentation Rule.** When the mobile MVP ships, add a Fumadocs `mobile/` section
> (Getting Started / Sign-in / Payslips / Leave / Attendance & check-in / My Schedule /
> Announcements / Profile / Push notifications) with `Live`/`Preview` tags and per-role notes.

---

## 0. TL;DR — what already exists (this is NOT greenfield)

Three facts shrink this project dramatically:

1. **`apps/native` already exists in v2** — a `create-better-t-stack` scaffold:
   Expo SDK **56**, React **19.2**, RN **0.85**, expo-router (typed routes + React Compiler),
   **HeroUI Native + Uniwind (Tailwind v4)**, TanStack Query, `@gorhom/bottom-sheet`,
   `react-native-keyboard-controller`. It is **already wired to the real backend**:
   - `apps/native/lib/auth-client.ts` → `createAuthClient` with `expoClient({ scheme, storagePrefix, storage: SecureStore })`.
   - `apps/native/utils/orpc.ts` → `RPCLink` against `${EXPO_PUBLIC_SERVER_URL}/rpc`, **already
     injecting the Better Auth session via `authClient.getCookie()` as a `Cookie` header** and
     typed against `AppRouterClient` from `@Heimdallone/api/routers/index` (end-to-end types).
   - `apps/native/components/sign-in.tsx` / `sign-up.tsx` → working **email + password** flow.
   - `app.json` `scheme: "Heimdallone"` — **matches** the `trustedOrigins: ["Heimdallone://", "exp://"]`
     already configured in `packages/auth/src/index.ts`.

2. **The server is already mobile-ready.** `packages/auth/src/index.ts` already enables the
   Better Auth **`expo()`** server plugin, lists `"Heimdallone://"` / `"exp://"` /
   `"http://localhost:8081"` in `trustedOrigins`, supports **email+password and Google**, sets
   `activeOrganizationId` in a session `databaseHooks` on create, and runs the **organization**
   (multi-tenant) + **admin** plugins. `@better-auth/expo` is a catalog dependency
   (`better-auth 1.6.11`).

3. **Almost every self-service endpoint the app needs already exists.** Self-scoping is done
   **server-side** via `resolveCurrentEmployee(orgId, userId)` in
   `packages/api/src/utils/employee-scope.ts` (used by roster/helpdesk/biometric/payroll). The
   app does **not** need to look up "which employee am I" — it calls `*.getOwn` / `*.listMine` /
   `*.createSelf` / `clock.*` and the server resolves the caller's employee from the session.
   **One genuine gap:** there is no `hrCore.employees.getOwn` self-read, and `employees.list`/
   `getById` gate on `employee:read` which a plain employee typically lacks — so the **Profile**
   screen needs the single new self-read endpoint (see §5/§13). Everything else is reuse.

**Therefore the work is: grow `apps/native` from a boilerplate into the self-service product —
not build a new app, and (target) not add any new server endpoints.**

### Decision: keep `apps/native`, rename to `apps/mobile` (optional)

The scaffold lives at `apps/native` with package name `native`. v1's app was `apps/mobile`. Two
options:
- **(Recommended) Rename** `apps/native` → `apps/mobile`, package `@Heimdallone/mobile`, to match
  v1 convention and the prompt's framing. Pure rename + workspace glob already covers `apps/*`.
- **(Lower-risk) Keep `apps/native`** as-is to avoid churning the EAS project link and imports.

Either way it is **one app** in the `apps/*` workspace. The rest of this plan says "the mobile app".

---

## 1. v1 mobile app — feature intent (the source, not the design)

Enumerated from `/home/karetech/projects/heimdallone/apps/mobile`:

| Area | v1 implementation | Intent to carry forward |
|---|---|---|
| **Navigation** | `expo-router` v4 with route groups `(auth)` and `(app)`; `(app)` is a **bottom-tab** layout: Payslips · Attendance · Leave · Schedule. Manager was to get an extra "Approvals" tab. | Tab-based self-service shell; role-aware extra surfaces for managers. |
| **Auth** | Better Auth `expoClient` + `expo-secure-store`. Login was **email → 6-digit OTP** (`authClient.emailOtp.sendVerificationOtp` / `signIn.emailOtp`). Token persisted to SecureStore; `organization.setActive(firstOrg)` on login. | Secure-store session, active-org selection on login. **NOTE:** v2 server has **no email-OTP plugin** — see §3. |
| **API** | `@orpc/client` `RPCLink` typed to `AppRouterClient`, **Bearer token** from SecureStore on every fetch; `@orpc/tanstack-query` for caching. | Reuse `AppRouterClient` for end-to-end types. **NOTE:** v2 scaffold uses the **cookie** path (`getCookie()`), not Bearer — see §3/§4. |
| **Payslips** | `payslips/index.tsx` list + `payslips/[id].tsx` detail (`PayslipCard`). | Payslip list + detail. Use `payroll.payslips.getOwn`/`getOwnById` in v2. |
| **Attendance** | GPS **clock-in/out** (`use-attendance.ts`): foreground location, **reject `pos.mocked`** (anti-spoof layer 1), call `attendance.punches.recordBatch`; live clock; today's regular/OT/absence from `attendance.summary`. | Clock-in with GPS + mock-GPS rejection + day summary. **v2 has reshaped these endpoints** — see the API-drift note below and §5. v2 prefers `biometric.checkIns.createSelf` (geofence). |
| **Leave** | `leave/index.tsx` balance cards + request list (`useLeaveList`); `leave/request.tsx` create. Row-scoped server-side. | Leave balance + my requests + new request. |
| **Schedule** | `schedule/index.tsx` — today's shift + attendance stats from `attendance.summary.schedule` (incl. flexi, public-holiday 2× notice). | "My schedule" / roster. v2 has `roster.listMine`. |
| **Offline** | `offline-queue.ts` — **SQLite** punch queue (`expo-sqlite`): enqueue punches offline, `replayQueue()` on reconnect via `recordBatch`, **7-day offline lock**, stale-data banner, pending-count badge. | Offline-first **clock-in** (the one workflow that must survive no signal on a worksite). See §8. |
| **Push** | Header comment mentions registering an Expo push token; **not actually implemented**. | Real push via `expo-notifications` tied to the v2 `notification` table — see §7. |
| **Biometric lock** | `expo-local-authentication` declared (Face ID / fingerprint perms in `app.json`); used for app-unlock intent. | App-lock with device biometrics — see §10. |
| **Theming** | NativeWind v3 + Tailwind v3, brand-navy palette (`brand-950`, `#0f172a`, `#3d52ed`), emoji tab icons. | v2 scaffold uses **HeroUI Native + Uniwind (Tailwind v4)** instead — adopt the v2 Navy Corporate tokens, real icons. |
| **EAS** | `eas.json` with development/preview/production profiles; `EXPO_PUBLIC_API_URL` per env; Android APK internal dist; iOS submit placeholders. | Same release model — see §11. |

**Bugs/quirks NOT to carry:** v1 derived "my employee" by fetching `employees.list` page 1 and
taking row 0 — **fragile, and in v2 it will 403** (a plain employee lacks `employee:read`). v2's
self procedures resolve the caller server-side; the app should pass **no `employeeId`** for
self-service. v1's auth guard redirected straight to `/payslips` on a bare token check — v2 should
drive navigation off `authClient.useSession()` + active-org state.

**⚠ v1→v2 API drift (verified against `packages/api/src/routers/*`):**
- **`attendance.punches.recordBatch` no longer exists.** v2 splits clock-in into:
  `attendance.clock.{checkIn, checkOut, currentStatus}` — `tenantProcedure`, **self-resolving**
  (no `employeeId`; `checkIn` takes `{notes?}`) for the non-geofenced path; and
  `biometric.checkIns.{createSelf, previewSelf, listSelf}` for the **geofenced** path.
- **`attendance.summary` is now `attendance.summary.monthly`** and is **manager/HR-gated**
  (`attendance:read`). The employee's own clock state comes from `attendance.clock.currentStatus`,
  not a self summary. Day-level "my hours" for an employee must come from a self-scoped source
  (clock state + `roster.listMine`), not the manager summary.
- **No `hrCore.employees.getOwn`.** The Profile screen is the one place a small new self-read
  endpoint is justified (§13, open question on the gap).

---

## 2. Recommended Expo stack (align to the existing scaffold)

Keep what `apps/native` already pins; only add what the MVP needs.

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Expo SDK 56**, React 19.2, RN 0.85 (already pinned) | New Architecture on. React Compiler enabled in `app.json`. |
| Routing | **expo-router** (typed routes) | Move from the boilerplate `(drawer)/(tabs)` to a real `(auth)` / `(app)` split (see §6). |
| Server calls | **`@orpc/client` `RPCLink`** over `fetch`, **`@orpc/tanstack-query`**, typed to `AppRouterClient` | Already in `utils/orpc.ts`. **One client for the whole app — zero new server endpoints.** |
| Data/cache | **TanStack Query** (`@tanstack/react-query`) | `staleTime` ~5 min, `retry: 2` (mirror v1). Persist cache for offline reads (see §8). |
| Auth | **`@better-auth/expo` `expoClient` + `expo-secure-store`** | Already wired. `getCookie()` → `Cookie` header on oRPC fetch. |
| Styling | **HeroUI Native + Uniwind (Tailwind v4)** | Already in the scaffold. Do **not** reintroduce NativeWind v3. Map the **Navy Corporate** tokens from `packages/ui` into the Uniwind theme so mobile matches web. |
| Forms | **`@tanstack/react-form` + zod** | Already used in `sign-in.tsx`. Reuse zod input schemas conceptually from the routers (the oRPC types already carry them). |
| Icons | `@expo/vector-icons` (already present) | Replace v1 emoji tab icons. |
| Native modules to add | `expo-location` (GPS), `expo-local-authentication` (app lock), `expo-notifications` (push), `expo-sqlite` **or** TanStack Query persister (offline), `expo-haptics` (already present), `expo-constants`/`expo-linking` (already present) | Add via `npx expo install` so versions match SDK 56. |
| Build | **EAS Build + EAS Submit** | Profiles dev/preview/production (see §11). |

---

## 3. Auth flow on mobile

### What is already true
- Server: `expo()` plugin on; `trustedOrigins` includes `"Heimdallone://"`, `"exp://"`,
  `"http://localhost:8081"`; email+password and (conditionally) Google enabled; `crossSubDomainCookies`
  for `app.`/`api.` split in prod.
- Client: `expoClient({ scheme: "Heimdallone", storagePrefix: "Heimdallone", storage: SecureStore })`
  — handles session token storage in **encrypted SecureStore**, attaches the session to requests,
  and converts OAuth `callbackURL` relative paths into deep links.

### MVP sign-in methods
1. **Email + password** — already implemented in `components/sign-in.tsx` via
   `authClient.signIn.email(...)`. This is the MVP primary path (works for all tenants, no extra
   server plugin).
2. **Google** — `authClient.signIn.social({ provider: "google", callbackURL: "/" })`. The Expo
   plugin turns the relative `callbackURL` into the `Heimdallone://` deep link; the server already
   trusts that origin and the Google provider is already registered (reuse v1's registered
   `api.` Google callback — see lesson #97). Requires `expo-web-browser` (present) for the
   in-app browser handshake.

### Decision needed: email-OTP
v1 mobile signed in with **email OTP**. v2's server (`packages/auth/src/index.ts`) does **not**
load the `emailOTP` plugin. Options:
- **(MVP) Skip OTP** — ship email+password + Google only (both already work end-to-end). Lowest risk.
- **(Later) Add `emailOTP`** to the server plugin list (+ a send-email handler reusing the existing
  `sendEmail`/`emailLayout` in `packages/auth/src/email.ts`) if passwordless phone login is wanted.
  This is the **one** auth change that would touch the server; it's additive and tenant-safe.

### Active-organization (tenant) handling — see §4.

### Base URL cross-check
- Mobile points at the **API origin** via `EXPO_PUBLIC_SERVER_URL` (the scaffold's env name;
  v1 used `EXPO_PUBLIC_API_URL`). Both `authClient.baseURL` and the oRPC `RPCLink` url
  (`${SERVER_URL}/rpc`) derive from it. In prod this is `https://api.heimdallone.com`
  (the registered Better Auth + Google callback host).
- Deep-link scheme **`Heimdallone://`** must stay in lockstep with the server `trustedOrigins`.
  Any rename of the scheme requires editing `trustedOrigins` in `packages/auth/src/index.ts`.

### Navigation driven by session + org
- Root layout reads `authClient.useSession()`. No session → `(auth)/sign-in`. Session but **no
  active org / no employee profile** → an org-pick / "no access" screen. Session + active org →
  `(app)`. Do **not** hard-replace to a tab on a bare token check (v1 bug).
- Sign-out: `authClient.signOut()` (clears SecureStore) → back to `(auth)`.

---

## 4. Multi-tenancy (active organization) on mobile

The app must honor the same active-org model as web.

- On sign-in, the server's `session.create` hook seeds `activeOrganizationId` to the user's first
  membership. For users in **multiple** tenants the app must let them **switch**:
  - `authClient.organization.list()` → list memberships.
  - `authClient.organization.setActive({ organizationId })` → switch; then invalidate **all**
    TanStack Query caches (every self-service query is org-scoped server-side).
  - Persist the chosen org id in SecureStore so it survives relaunch (mirror v1's `ORG_KEY`).
- Role scoping is **server-enforced** (oRPC `authorizedProcedure` + `resolveCurrentEmployee`).
  The mobile UI only needs the role to **show/hide** affordances (e.g. a manager's "Approvals"
  surface). Read role from the active membership.
- **No cross-tenant leakage:** because the cookie carries `activeOrganizationId` and every
  procedure scopes by `orgId(context)`, the client never sends an org id in inputs. The org
  switcher is the only place the active org changes.

---

## 5. MVP self-service feature set → existing v2 routers

**Guardrail: build NO new server endpoints for the MVP — with exactly one documented exception**
(the Profile self-read, §13). Every other screen maps to an existing self-scoped procedure
(verified in `packages/api/src/routers/*` and confirmed by router enumeration).

| Screen | Existing procedure(s) | Self-scope | Notes |
|---|---|---|---|
| **Sign-in + tenant pick** | `authClient.signIn.email` / `signIn.social` · `organization.list` · `organization.setActive` | n/a | §3/§4. |
| **Dashboard / home** | compose: `notifications.unreadCount` + `communications.announcements.unreadCount` + `payroll.payslips.getOwn` (latest) + `leave.balances.list` + `roster.listMine` (today) + `attendance.clock.currentStatus` | all self-scoped | Pure client-side read aggregation; glanceable card grid (matches web's "real module cards" direction, lesson 21X). |
| **Payslips list** | `payroll.payslips.getOwn` (input `{page, pageSize}`; returns `{data, total}`; **confirmed/paid only**) | yes (`resolveCurrentEmployee`) | Replaces v1's `payslipsList`. |
| **Payslip detail** | `payroll.payslips.getOwnById` (`{id}`) | yes | Full Guyana breakdown already on the payslip; respect `payslip_correction` (show "corrected" if `supersededByCorrectionId`). |
| **(Optional) Projected pay** | `payroll.projectedPay.own` | yes | "Estimated next pay" card. |
| **Leave balance** | `leave.balances.list` (`employeeId?` — omit for self) | auto-scoped via `scopedEmployeeIds` | Balance cards. |
| **Leave — my requests** | `leave.requests.list` (omit `employeeId`) | auto-scoped | Employees see own; managers see reports (server decides). |
| **Leave — new request** | `leave.requests.create` (`{leaveTypeId, startDate, endDate, requestedDays, reason}`) | self (creator) | Server computes days (21G-D `countLeaveDays`); client `requestedDays` is advisory. |
| **Leave — cancel** | `leave.requests.cancel` (`{id}`) | self/owner | |
| **Clock-in (geofenced)** | **`biometric.checkIns.createSelf`** (+ `previewSelf` for a pre-punch geofence check, `listSelf` for history) | yes — "the punch ALWAYS belongs to the caller. No `employeeId` input." | **Preferred v2 path.** Optional `latitude/longitude/accuracyMeters/direction/mockLocationFlag`; server enforces arrangement policy + geofence + mock-GPS rejection. |
| **Clock-in/out (non-geofenced)** | `attendance.clock.checkIn` (`{notes?}`) · `checkOut` · `currentStatus` | yes (`tenantProcedure`, self-resolving) | Use when the employee's arrangement isn't geofence-bound. `currentStatus` drives the In/Out button state (replaces v1's lastPunchType-from-summary logic). |
| **My schedule / roster** | `roster.listMine` (`{from, to}`) (+ `roster.scheduleRules.resolve` for the shift rule) | yes | Per-date entries; today highlighted. |
| **Announcements feed** | `communications.announcements.feed` (`{limit?}`) · `markRead` (`{id}`) · `unreadCount` | self/audience-scoped (joins read-state for caller) | Employee-facing; `list/getById/create/...` are admin-only. |
| **Notifications inbox** | `notifications.list` (`{unreadOnly?, limit?}`) · `unreadCount` · `markRead` · `markAllRead` · `dismiss` | all self-scoped (`selfScope`) | Backs the push channel (§7). |
| **Profile** | **GAP** — needs new `hrCore.employees.getOwn` (read-only self profile). `employees.list`/`getById` gate on `employee:read` which a plain employee lacks; bank/TIN/NIS already masked server-side for non-payroll. | self | The **one** justified new endpoint; trivial (wrap `resolveCurrentEmployee` + the existing redaction). Read-only MVP; edit deferred. |
| **(Manager) approvals** | `leave.requests.approve`/`reject` · `roster.setApproval`/`approveRange` · (later) helpdesk/timesheet approvals | server role-gated | Show only when the active membership role is manager+. |

**Explicitly out of MVP** (exist server-side, defer to later phases): payroll loans/reimbursements
self-service, helpdesk requests, performance goals/1-on-1s, projects/tasks, CRM, finance,
documents. Mobile is **self-service first**; admin/finance stays on web.

---

## 6. App structure (target)

```
apps/native (or apps/mobile)
  app/
    _layout.tsx            # providers (QueryClient, HeroUI, GestureHandler, Keyboard) + session/org gate
    (auth)/
      _layout.tsx
      sign-in.tsx          # email+password + Google (exists, relocate from components/)
      org-pick.tsx         # multi-tenant chooser (post-login if >1 membership)
      no-access.tsx        # session but no employee profile in active org
    (app)/
      _layout.tsx          # bottom tabs: Home · Pay · Leave · Clock · More
      index.tsx            # Dashboard
      payslips/index.tsx
      payslips/[id].tsx
      leave/index.tsx
      leave/request.tsx
      attendance/index.tsx # geofence check-in + day summary + offline badge
      schedule/index.tsx   # roster.listMine
      announcements/index.tsx
      notifications/index.tsx
      profile/index.tsx
      (manager)/approvals  # role-gated, lazy
  lib/
    auth-client.ts         # exists
    org.ts                 # active-org state + switch + cache invalidation
    offline-queue.ts       # port v1 SQLite punch queue (or TanStack persister)
    biometric-lock.ts      # expo-local-authentication app lock
    push.ts                # expo-notifications registration + token sync
  utils/orpc.ts            # exists
  hooks/                   # useMe, usePayslips, useLeave, useRoster, useAnnouncements, useNotifications
  components/              # cards, tiles, badges (HeroUI Native), reuse Navy tokens
```

---

## 7. Push notifications (future channel on the existing `notification` table)

v2 already has a `notification` table + `notifications` router + a reusable `createNotification`
emit helper (`packages/api/src/utils/notifications.ts`) consumed by other modules (Phase 21F).
Push is an **added delivery channel**, not a new data model.

- **Client:** `expo-notifications` to request permission + get an **Expo push token**; a small
  server endpoint (the one justified new endpoint, deferred) to register the token against the
  user/device (e.g. `notifications.registerPushToken`). On token change, re-register.
- **Server delivery:** when `createNotification` writes a row, fan out to Expo Push (Expo's HTTP
  push service) for that user's registered device tokens. Keep it **best-effort** (never block the
  business write on push failure — same pattern as invite email).
- **Tap-through:** notification payload carries `entityType`/`entityId` (soft refs already on the
  table) → deep link into the right screen.
- **In-app:** the `notifications` inbox + `unreadCount` badge work today with zero push; push is
  the escalation layer. Ship inbox in MVP, push in a follow-up phase.

---

## 8. Offline considerations

The realistic offline need (from v1 intent) is **clock-in on a worksite with no signal**, not a
full offline CRUD app.

- **Offline clock-in queue (carry the v1 *pattern*, retarget the endpoint):** v1 replayed against
  `attendance.punches.recordBatch`, **which no longer exists in v2**. Port the `offline-queue.ts`
  mechanism — `expo-sqlite` table of pending punches with `device_timestamp`; **N-day offline
  lock** + **stale-data banner** + pending badge — but replay each queued punch through the v2
  self endpoints **one at a time in chronological order**: `biometric.checkIns.createSelf` for the
  geofenced arrangement, else `attendance.clock.checkIn`/`checkOut`. The biometric ingest pipeline
  is already idempotency-keyed (Phase 11 `idempotencyKey` UNIQUE), so replays/duplicates are safe.
  - **Decision (open question §13):** v2 has no batch self-punch endpoint. Either (a) replay
    sequentially via the per-punch self procedures (no server change, simplest), or (b) add a small
    `attendance.clock.recordBatch` self endpoint if sequential replay proves too chatty on poor
    links. Recommend (a) for MVP.
- **Offline reads:** persist TanStack Query cache (AsyncStorage/SQLite persister) so payslips,
  last roster, and leave balance render from cache when offline, with a "showing saved data" banner.
- **Conflict policy:** writes other than clock-in are **online-only** in MVP (leave requests,
  approvals) — simplest correct behavior; show a clear "you're offline" state.
- **Clock integrity:** keep v1's **mock-GPS rejection** on-device (defense layer 1); the server
  rejects `mockLocationFlag`/`isGpsMocked` (defense layer 2). Store `device_timestamp` and let the
  server apply clock-drift handling (the device-bridge precedent, Phase 21O).

---

## 9. Sharing `AppRouter` types across the monorepo

Already solved by the scaffold and proven by web:

- The app **type-only imports** `AppRouterClient` (and `AppRouter`) from
  `@Heimdallone/api/routers/index` — the exact pattern in `apps/native/utils/orpc.ts` and
  `apps/web/src/utils/orpc.ts`. No server code runs on device; only types cross the boundary.
- `@Heimdallone/api` is a `workspace:*` dependency of the mobile package; the root workspace glob
  `apps/*` + `packages/*` already includes it. oRPC gives **end-to-end type safety** for free.
- The app also imports `@Heimdallone/env/native` for env validation and may import
  `@Heimdallone/auth/permissions` (`ac`, `roles`) if the org client needs them (web does; the
  current native client omits them — add if role-aware UI needs the typed roles).
- **Metro/package-exports:** Expo SDK 53+ enables package exports in Metro by default — required
  for `@better-auth/expo` and the workspace packages. Do not disable `unstable_enablePackageExports`.
- **Turbo gate:** the mobile package should expose `check-types` (tsc) so it can later enter the
  root `check-types` gate (v1 stubbed this; v2 should wire a real tsc, mirroring the web→gate
  follow-up noted in CLAUDE.md). Keep it `continue-on-error` in CI until the baseline is clean.

---

## 10. Security

- **No token leakage:** the session lives only in **encrypted SecureStore** via the Expo plugin.
  Never log the cookie/token; never persist it to AsyncStorage/SQLite. The oRPC fetch attaches the
  cookie via `getCookie()` only (the scaffold already does this with `credentials: "omit"` on native).
- **Transport:** HTTPS only in prod (`https://api.heimdallone.com`); cleartext localhost only in dev.
- **Biometric app-lock (carry from v1):** `expo-local-authentication` — require Face ID /
  fingerprint to re-open the app after background/timeout (sensitive payroll data). Perms already
  declared in v1's `app.json` (`NSFaceIDUsageDescription`, `USE_BIOMETRIC`); re-declare in v2's
  `app.json` plugins.
- **Server-enforced authz only:** the UI hides affordances but never enforces access — every call
  is `authorizedProcedure` + self-scope server-side (no frontend-only security; SaaS rule).
- **Sensitive-field redaction is server-side:** bank account numbers are masked at the API for
  non-payroll roles (CLAUDE.md baseline); the app shows whatever the server returns.
- **Mock-GPS / spoofing:** two-layer rejection (§8). Geofence enforcement is server-side per the
  employee's work arrangement (`biometric.checkIns.createSelf` policy).
- **Deep-link safety:** only the registered `Heimdallone://` scheme is trusted; OAuth callbacks
  resolve through the Better Auth Expo plugin, not hand-rolled URL parsing.
- **No secrets in the bundle:** only `EXPO_PUBLIC_*` (public API URL) is bundled; no client
  secrets. Google is a redirect flow (no client secret on device).

---

## 11. Build & release (EAS)

Mirror v1's `eas.json` shape:

- **Profiles:**
  - `development` — `developmentClient: true`, internal dist, `EXPO_PUBLIC_SERVER_URL=http://<lan-ip>:3000`.
  - `preview` — internal dist, Android **APK**, channel `preview`, `EXPO_PUBLIC_SERVER_URL=https://api.heimdallone.com`.
  - `production` — `autoIncrement`, channel `production`, store-ready (AAB), prod env.
- **Distribution path:**
  - **MVP / pilot:** **internal distribution** (Android APK + iOS TestFlight / ad-hoc) to Netsurf
    & Foreign Links staff — fastest, no store review, matches the cutover audience.
  - **Later:** Google Play (internal → closed → production track via EAS Submit) and Apple App
    Store. `eas.json` already stubs `submit.production` for both stores (fill Apple Team ID / ASC
    App ID, Play service account).
- **OTA updates:** EAS Update on the matching channel for JS-only fixes between store builds.
- **EAS project:** reuse or create a fresh EAS project id in `app.json` `extra.eas.projectId`
  (v1 had one; v2 `apps/native` does not yet — create on first build).
- **CI:** an `.eas/workflows/` build pipeline (or call from existing CI) once the app stabilizes;
  keep mobile out of the **blocking** gates initially (informational `check-types`).

---

## 12. Phased build sequence

| Phase | Deliverable | Server change? |
|---|---|---|
| **M0 — Foundation** | Rename/confirm app; relocate `sign-in` into `(auth)`; build the session+org navigation gate; Navy Corporate Uniwind theme; `useMe` via session; env (`EXPO_PUBLIC_SERVER_URL`) per EAS profile. Verify a real authenticated oRPC call (e.g. `payslips.getOwn`) on device. | none |
| **M1 — Read self-service** | Dashboard, Payslips list+detail, Leave balance+my-requests, My schedule (`roster.listMine`), Announcements feed, Notifications inbox, Profile (read-only). | **one additive**: `hrCore.employees.getOwn` for Profile (the only MVP gap). |
| **M2 — Write self-service** | Leave request create/cancel; **clock-in** — geofenced (`biometric.checkIns.createSelf`, with `previewSelf`) or non-geofenced (`attendance.clock.checkIn/out`, button state from `clock.currentStatus`); mark announcements/notifications read. | none |
| **M3 — Offline + integrity** | Offline punch queue (SQLite) + replay + stale banner + offline-lock; mock-GPS rejection; TanStack Query cache persistence for offline reads. | none |
| **M4 — Manager surface** | Role-gated Approvals (leave approve/reject, roster approval). | none |
| **M5 — App-lock & polish** | `expo-local-authentication` lock; haptics; empty/loading/error states sweep; a11y pass; multi-tenant switcher polish. | none |
| **M6 — Push** | `expo-notifications` registration + tap-through; **server fan-out from `createNotification` to Expo Push** + token-register endpoint (the one justified new endpoint). | **additive** (`notifications.registerPushToken` + push fan-out) |
| **M7 — Release** | EAS preview internal build → pilot (Netsurf/Foreign Links) → store submit; Fumadocs `mobile/` section. | none |

Each phase ends with: real-device verification (or simulator), screenshots into
`docs/reviews/mobile-<phase>/`, and Fumadocs updates per the Documentation Rule.

---

## 13. Open questions

1. **OTP vs password vs Google for the MVP login?** Server has no `emailOTP` plugin today. Default
   recommendation: email+password + Google for MVP; add OTP only if the field workforce can't manage
   passwords. (Owner decision — it's the only auth change that touches the server.)
2. **`apps/native` vs `apps/mobile` rename** — adopt v1 naming, or keep the scaffold path?
3. **Phone-number identity?** Some field staff may not have email (the 6 no-login employees from
   migration, Phase 21L/21N). Do they get a login for mobile, or stay no-login? (Ties to the carried
   operator decision on missing emails.)
4. **Offline write scope** — clock-in only (recommended), or also queue leave requests?
5. **Geofence vs non-geofenced clock + offline replay** — online: `biometric.checkIns.createSelf`
   (geofenced) or `attendance.clock.checkIn/out` (non-geofenced) per arrangement. Offline: replay
   sequentially through those self procedures (no server change) **or** add a small
   `attendance.clock.recordBatch` self endpoint. Confirm the choice.
6. **Profile self-read gap** — confirm adding `hrCore.employees.getOwn` (the one new MVP endpoint),
   and which fields are employee-visible vs masked (bank/TIN/NIS already masked server-side).
7. **Push provider** — Expo Push service (simplest) vs FCM/APNs direct? Affects M6 + EAS credentials.
8. **iOS distribution timing** — Apple Developer account + TestFlight ready for the pilot, or
   Android-only first (v1's `eas.json` leaned Android APK)?
9. **Tablet / web targets** — RN-web is on in the scaffold; do we want a responsive web build, or
   phone-only (v1 disabled iPad)? Recommend phone-first.
10. **Profile editing** — read-only in MVP; when do we allow self-edit of contact info (which hr-core
    fields are employee-editable vs HR-only)?
11. **Versioning/OTA policy** — EAS Update channels vs forced store updates for breaking API changes
    (the web↔server generation-skew lesson #97 applies to mobile too).

---

## 14. Documentation audit

**Did this change require Fumadocs documentation updates?** Not yet — this is a plan/spec only, no
shipping feature. When the mobile MVP ships (M1+), a new Fumadocs **`mobile/`** section is required
(sign-in, each self-service screen, push, offline behavior, per-role notes, `Live`/`Preview` tags),
plus a cross-link from the existing module pages (Payroll/Leave/Time) noting the mobile self-service
entry points.
