# Biometric + Geofencing API + Processor — Phase 11C

API layer + punch processor for the Biometric/Geofencing module. **No UI yet**
(11D). Builds on the 11B schema. Native ZKTeco TCP pull and ADMS push are
**deferred** — the MVP integration surface is CSV/file import + an authenticated
API-ingest endpoint + the source-agnostic processor.

## Files

- `packages/api/src/routers/biometric.ts` — the `biometric` oRPC router.
- `packages/api/src/utils/attendance-adapters.ts` — device adapter/provider model.
- `packages/api/src/utils/biometric-processor.ts` — punch → event → record processor.
- `packages/api/src/utils/geofence.ts` — great-circle distance + work-site resolution.
- `packages/api/src/utils/attendance-recalc.ts` — shared recalc (extracted from
  the attendance router so processor + router share one implementation).
- `packages/auth/src/permissions.ts` — 4 new AC resources + grants.
- `packages/api/src/utils/role-helpers.ts` + `apps/web/src/lib/rbac.ts` — 6 helpers.
- `scripts/verify-biometric-api.ts` — processor/adapter/geofence verification.

## Device adapter / provider model

The pipeline is **vendor-agnostic**. A device's `(vendor, mode)` resolves to an
adapter (`attendance-adapters.ts`). Adapters normalize imported rows into
`NormalizedPunch[]`; the processor never branches on vendor.

| providerKey | vendor | live status | notes |
|---|---|---|---|
| `generic_csv` | generic | supported (file) | canonical CSV import |
| `generic_excel` | generic | supported (file) | Excel exported as CSV/TSV |
| `generic_api` | generic | supported (live) | the `/ingest` endpoint |
| `zkteco_tcp` | zkteco | **planned** | native TCP pull not built; use agent→ingest or CSV |
| `zkteco_adms` | zkteco | **planned** | ADMS/iClock push receiver not built |
| `ngteco_cloud` | ngteco | **planned** | cloud API needs vendor verification + prod secrets; manual export works |
| `ngteco_app` | ngteco | supported (file) | NGTeco app export upload |
| `ngteco_kseries` | ngteco | supported (file) | K-series WiFi/TCP/USB → file import |

`AttendanceDeviceAdapter` interface: `providerKey`, `displayName`, `vendor`,
`status`, `supportedModes`, `capabilities`, `parseImportRows(text)`,
`validateDeviceConfig(config)`, `getConnectionStatus()`. `getAdapter(key)` /
`listAdapters()` are the registry. Planned adapters report
`getConnectionStatus().live === false` — **we never fake live sync.**

**NGTeco reality (documented):** many small-business NGTeco cloud/app clocks do
not expose a public local/cloud API. Supported paths are manual CSV/Excel app
export, USB export (K-series), and periodic file import. A live cloud adapter is
gated behind official-API + production secret storage.

## AC resources (added to `permissions.ts`) — audit:permissions 62→73

| Resource | Actions | Granted to |
|---|---|---|
| `attendance_device` | read, manage, sync | owner/admin/hr: all; manager/auditor/payroll: read |
| `attendance_punch` | read, process, import | owner/admin/hr: all; manager/auditor/payroll: read |
| `geofence` | read, manage, check_in | owner/admin/hr: all; manager/payroll/employee: read+check_in; auditor: read |
| `attendance_exception` | read, resolve | owner/admin/hr: read+resolve; manager: read+resolve (scoped); auditor/payroll: read |

RBAC helpers (backend + frontend mirror): `canManageBiometrics`,
`canViewBiometrics`, `canManageGeofencing`, `canViewGeofencing`,
`canUseGeofenceCheckIn`, `canReviewAttendanceExceptions`.

**Self-service note:** `checkIns.createSelf` uses `authorizedProcedure("geofence",
"check_in")` — a dedicated action the **employee role holds** — with per-employee
self-scope inside the handler. It is auditable and reachable (not behind a
manage-only gate — the offboarding `documents.markUploaded` trap is avoided).

## Router (`biometric`)

- **devices** — `list` / `getById` (secrets stripped; adapter status attached) /
  `create` (returns a one-time `ingestApiKey` for api_ingest devices) / `update` /
  `rotateIngestKey` / `archive` / `testConnection` (honest adapter status, no real
  network call) / `adapters` (registry listing).
- **mappings** — `list` / `create` (unique `(device, deviceUserId)`) / `delete`.
- **syncRuns** — `list` / `getById`.
- **punches** — `list` (status filter; manager-scoped) / `importRows` (parse via
  adapter → stage punches with idempotency keys → sync-run summary; optional
  `process=true`).
- **processor** — `run` (processes all pending org punches).
- **ingest** — `submit` (**public, device-auth**): `deviceId` + `apiKey` (verified
  against `apiKeyHash`); org derived from the device; rejects biometric-template
  payloads; row-count capped; dedup by idempotency key; never logs/returns secrets.
- **geofences** — `list` / `getById` / `create` / `update` / `archive`.
- **assignments** — `list` / `create` / `delete` (employee/department/org scope).
- **checkIns** — `createSelf` (self-scoped GPS clock-in; server-side great-circle;
  soft-block-outside-with-reason; creates a check-in + a staged mobile punch +
  exceptions for outside/low-accuracy/mock-location) / `listSelf`.
- **exceptions** — `list` / `getById` / `acknowledge` / `resolve` / `dismiss`
  (resolve/dismiss require a note; manager-scoped).

## Punch processor (`processPendingPunches(orgId)`)

Source-agnostic, idempotent. For each `pending`/`unmapped` punch:
1. resolve employee via `attendance_device_employee_map` (stable `deviceUserId`);
2. unmapped → mark `unmapped` + open `unmapped_punch` **blocker** exception;
3. ensure the daily `attendance_record` stub exists;
4. `in`/unknown → new `attendance_event` (`source` = biometric/mobile/import);
   `out` → close the latest open event (or `out_of_window` warning if none);
5. `recalculateRecord(...)` (shared util);
6. post-pass: `missing_clock_out` blockers for prior-day open events;
   `clock_drift` info exceptions for devices over the drift threshold.

**Invariants:** raw punches are never paid; payroll reads approved
`attendance_record` only; re-running creates **no** duplicate events (processed
punches carry `createdAttendanceEventId` and are skipped). `unmapped` punches are
re-examined each run so a later mapping resolves them.

## Privacy / security

- **No biometric templates.** Ingest/import reject any payload key resembling a
  template (`containsBiometricTemplate`). Only punch events + verification METHOD.
- **No plaintext secrets returned.** `apiKeyHash` (hash) and `credentialRef`
  (encrypted-secret pointer) are stripped from every device response
  (`publicDevice`). The ingest key is shown once on create/rotate, never stored
  plaintext, never logged.
- **Tenant-scoped everything** via `verify*` helpers; manager lateral scope on
  punches/exceptions; auditor read-only.
- **Rate limiting** on the public `/ingest` endpoint is **deferred** (documented);
  payload row-count is capped (`MAX_INGEST_ROWS = 5000`).
- **GPS retention** enforcement (scrub raw lat/lon after `gpsRetentionDays`) is
  **deferred to 11G**; the columns + `coordsPurgedAt` exist.

## Verification (observed — `scripts/verify-biometric-api.ts`)

All checks pass: adapter parsing (generic CSV + NGTeco Title-Case headers; planned
adapters report `live=false`); great-circle math + inside/outside/low-accuracy/
unverified evaluation; privacy guard (rejects fingerprint-template payload);
processor end-to-end on seeded data (5 processed, 1 quarantined unmapped, biometric
`attendance_event` rows created, Maya's record = 452 worked minutes); processor
**idempotent** (no new events on re-run; 0 processed second time); open
`unmapped_punch` blocker exception present.

Gates: check-types 3/3, web build ✓, ultracite **224/1/2 baseline unchanged**,
**audit:permissions 73 pairs / 10 routers PASS**.

**Deferred to 11D browser pass / live RPC:** RBAC 403 matrix, ingest API-key auth
round-trip, check-in self-scope, secret-stripping in live responses.

## Next

**Phase 11D — Biometric devices UI** (`/app/biometrics` overview + devices
list/detail with secrets masked + sync-runs + punches; CSV upload; convert the
flat `biometrics.tsx` stub to a folder route).

## Work arrangement (Phase 11G CP1)

Per-employee `work_arrangement` (`employee_work_info.work_arrangement`, migration
0013): `onsite` / `hybrid` / `remote` / `field` / `exempt`. `utils/geofence.ts`
exposes `resolveEmployeeArrangement(employeeId)` and `arrangementPolicy(a)`:

| arrangement | geofence enforced | raises exception when away | GPS required |
|---|---|---|---|
| onsite | yes | **yes** | yes |
| hybrid | yes | no | yes |
| remote | no | no | no |
| field | no | no | no |
| exempt | no | no | no |

`checkIns.createSelf` / `previewSelf` consult the policy: GPS is optional for
non-onsite arrangements (check-in allowed with no coordinates), and
`outside_geofence` / `low_gps_accuracy` exceptions are raised **only for onsite**
workers. This is the payroll-safety prerequisite — a remote/field/exempt worker is
never flagged "outside" and therefore never blocks payroll for being away from a
physical site. `mock_location` is still flagged for everyone (fraud signal). The
mobile check-in screen renders a friendly "Remote work check-in" for non-onsite
arrangements instead of an "outside" warning.

## Payroll readiness from attendance exceptions (Phase 11G CP2)

Open biometric/geofence/attendance exceptions now flow into payroll
readiness/preview as **blockers and warnings**, so unresolved attendance issues
can never silently reduce or inflate pay — they surface before a run can be
finalized. The payroll calculation/tax logic is unchanged; this is purely a
readiness/gating layer.

**Builder** (`packages/api/src/utils/payroll-input-builder.ts`):
`buildAttendanceInput` augments the per-employee `AttendanceInput` with an
exception review (`buildExceptionReview`). Exceptions have no own date column, so
each is period-scoped via its linked punch (`punchTime`) → event (`eventDate`) →
geofence check-in (`capturedAt`), falling back to `createdAt`, and kept only if it
falls in `[periodStart, periodEnd]`. Open/`in_review` exceptions are tallied by
severity into `openExceptionBlockers` / `openExceptionWarnings` (info ignored),
with `exceptionSummary` (plain-language type labels) and `unprocessedPunches`
(pending/error `attendance_punch` rows in the period, `deletedAt IS NULL`).
`buildPayrollInput` also plumbs `flags.blockPayrollOnOpenExceptions` from
`attendance_setting.block_payroll_on_open_exceptions` (default **true**).

**Engine** (`packages/payroll-engine/src/blockers.ts`, pure — no DB):

| code | severity | emitted when |
|---|---|---|
| `UNRESOLVED_ATTENDANCE_EXCEPTION` | blocker | `openExceptionBlockers > 0` **and** `blockPayrollOnOpenExceptions !== false` |
| `ATTENDANCE_EXCEPTION_REVIEW` | warning | `openExceptionWarnings > 0`, **plus** downgraded blockers when the org disabled hard-blocking |
| `UNPROCESSED_PUNCHES_FOR_PERIOD` | warning | `unprocessedPunches > 0` |

When `block_payroll_on_open_exceptions` is **off**, blocker-severity exceptions
downgrade to the `ATTENDANCE_EXCEPTION_REVIEW` warning (they never disappear).

**Persistence + gate**: `runs.preview` already persists `payroll_issue` rows from
the detected blockers/warnings and sets `blockerCount`. `runs.confirm` now gates on
a **live count of open blocker `payroll_issue` rows** (not the cached
`blockerCount`), so resolving/overriding an issue is reflected immediately and a
run with an unresolved exception throws `PRECONDITION_FAILED` ("Cannot confirm: N
unresolved blocker(s).").

**UI** (`apps/web/src/routes/app/payroll/run.tsx`): the three codes have
plain-language labels in `ISSUE_CODE_LABELS` ("Unresolved attendance exception",
"Attendance exception needs review", "Unprocessed punches in this pay period"). The
preview note reads: "Raw device punches do not go directly to payroll; payroll uses
processed attendance after review."

### Verification (`scripts/verify-biometric-payroll-readiness.ts`)

All 11 DB-backed checks pass: rohan's open `missing_clock_out` → 1 blocker + flag
true + engine emits `UNRESOLVED_ATTENDANCE_EXCEPTION`; policy-off → no blocker +
`ATTENDANCE_EXCEPTION_REVIEW`; maya's `low_gps_accuracy` → 1 warning +
`ATTENDANCE_EXCEPTION_REVIEW`; devon's pending mobile punch →
`UNPROCESSED_PUNCHES_FOR_PERIOD`; resolved exception no longer blocks (then
restored). Worked minutes are read from `attendance_record` throughout — exceptions
never change them.

**Browser pass** (owner, May 2026 Payroll preview): blocker "Unresolved attendance
exception — Rohan Gopaul has 1 unresolved attendance exception(s) (missing
clock-out)" rendered under "cannot continue"; warnings "1 attendance exception(s)
need review for Maya Persaud (GPS accuracy)" and "N unprocessed punch(es) in this
pay period"; persisted `payroll_issue` rows = `UNRESOLVED_ATTENDANCE_EXCEPTION`×1
(blocker), `ATTENDANCE_EXCEPTION_REVIEW`×1, `UNPROCESSED_PUNCHES_FOR_PERIOD`×5
(warnings); `runs.confirm` → 412 "Cannot confirm: 5 unresolved blocker(s)"; 0 app
console errors. Screenshot: `docs/reviews/phase-11g-cp2/`.

**RBAC** (live): employee (Rohan) → run page denied; auditor → run page denied +
`runs.confirm` 403 "Missing permission: payroll:update"; payroll_admin + owner →
readiness/preview allowed. No raw GPS coordinates, device payloads, or secrets
appear in any payroll surface.

Gates: check-types 3/3, payroll-engine 18/18, build ✓, web tsc 26 baseline,
ultracite **223/1/2 baseline unchanged**, audit:permissions 73 pairs / 10 routers.

## Live / projected pay hardening (Phase 11G CP3)

Projected pay is an **estimate** of current/selected-period pay for employees +
payroll admins — never finalization. It reuses the existing pure engine
(`calculatePayroll`) and the CP2 attendance/exception signals to express a
**confidence level** so an estimate never looks more trustworthy than its data.
No tax/rate formula changed.

**Engine** (pure, `packages/payroll-engine/`):

- `confidence.ts` (new) — single source of truth for confidence, used by BOTH
  `calculate.ts` and `projected-pay.ts` (the logic used to be duplicated and had
  silently gone stale w.r.t. the CP2 exception fields). `deriveConfidence(input,
  blockerCount)`: `cannot_estimate` when blockers > 0; else `low` when any review
  signal (`openExceptionWarnings` + `unprocessedPunches` + `pendingItems` +
  `pendingLeaveDays`) > 0; else `medium` when attendance incomplete; else `high`.
  `confidenceLabel()` maps the 4-value enum → 3 plain labels: **High confidence**
  / **Needs review** / **Cannot finalize yet**. `buildConfidenceReasons()`
  emits plain-language reasons (e.g. "1 device punch(es) not yet processed into
  attendance").
- `calculateProjectedPay()` now returns the richer `ProjectedPayResult`:
  `confidenceLabel`, `confidenceReasons[]`, `warnings[]`, `blockers[]`,
  `payType`/`payFrequency`, `hours{regularHours, overtimeHours}`, `days{workedDays,
  absentDays, approvedLeaveDays, unpaidLeaveDays}`, `attendanceComplete`, plus the
  existing gross/net/deductions/breakdown. `disclaimers[0]` is always the not-final
  guardrail. Per-wage-type base pay is unchanged: monthly = full salary (**paid
  leave does not reduce it**; unpaid leave does), daily = rate × days, hourly =
  rate × worked-hours; overtime from approved OT minutes only. `calculatedAt` is
  **not** in the engine (it is `Date`-free) — the API stamps it.

**API** (`routers/payroll.ts`):

- `projectedPay.forEmployee` (admin, `payroll:read` + `canManagePayroll`) and
  `projectedPay.own` (any member, self-scoped via `resolveCurrentEmployee` — cannot
  pass an `employeeId`). `payPeriodId` is now **optional**; omitted →
  `resolveProjectionPeriod` picks the period covering today, else the latest open
  period, else the most recent. Both stamp `calculatedAt` (ISO) and return
  `periodId/periodName/periodStatus`. `own` **strips `resolutionLink`** from
  blockers (admin exception-queue links never reach an employee payload).
- `runs.preview` now tallies a `confidenceCounts {high, needsReview,
  cannotFinalize}` rollup from the per-employee calc result (no extra
  computation) for the admin run-preview indicator.

**UI** (minimal, additive):

- Employee **"Estimated pay this period"** card
  (`features/payroll/estimated-pay-card.tsx`) on `/app/payroll/payslips` for
  employee/manager: confidence badge, estimated net/gross, regular/overtime hours,
  days worked, paid/unpaid leave, "What might still change" reasons, the estimate
  guardrail, and "Updated <time>". Self-fetches `projectedPay.own` (current period);
  errors render nothing (additive, never blocks the payslip table).
- Admin **"Projected pay confidence"** indicator in the run-preview review step
  (`run.tsx`): `N High confidence · N Needs review · N Cannot finalize yet`.

### Verification (`scripts/verify-live-pay-projection.ts`)

13 DB-backed checks pass: rohan open `missing_clock_out` → "Cannot finalize yet" +
blocker; maya `low_gps_accuracy` → "Needs review" + warning; devon pending punch →
"Needs review" + reason "not yet processed"; remote worker (kareena) not blocked by
location; resolving the exception improves confidence (then restored); policy-off
downgrades the blocker to a review warning; projection always `isEstimate` + carries
the not-final disclaimer; pay type/frequency exposed. Hourly/daily projection is
covered by `projected-pay.test.ts` (no hourly/daily contract seeded — **limitation
logged**; "shift" has no wage-type enum and is modelled as daily). Engine unit
tests: `projected-pay.test.ts` (9 cases — high/needs-review/cannot-finalize,
hourly, paid-leave-not-reduced, unpaid-leave-reduces, policy-off downgrade).

**Browser pass** (0 app console errors): employee `employee@` (→ Rohan profile,
open exception) card = "Cannot finalize yet" with reasons + guardrail; manager
`manager@` (→ Andre) card = "Needs review" (unvalidated attendance only); admin run
preview shows "0 High confidence · 7 Needs review · 3 Cannot finalize yet". Own
payload confirmed to carry **no `resolutionLink`** (employee leak-prevention).
Throwaway preview run cleaned up; biometric reseeded. Screenshots:
`docs/reviews/phase-11g-cp3/`.

**RBAC** (live): auditor → `projectedPay.forEmployee` 403 FORBIDDEN; `own` is
self-scoped (200, returns only the caller's projection). A true "High confidence"
state is not reachable in seed data (every employee has unvalidated attendance) —
documented, not faked.

Gates: check-types 3/3, payroll-engine **27/27**, build ✓, web tsc 26 baseline,
ultracite **223/1/2 baseline unchanged**, audit:permissions 73 pairs / 10 routers.

## GPS retention scrub + source labels + integration verify (Phase 11G CP4 — closes 11G)

Privacy hardening + the full-chain integration proof that closes Phase 11G. No
migration (the schema already had nullable `geofence_check_in.latitude/longitude`
+ `coordsPurgedAt`, and `attendance_setting.gps_retention_days` default 90), no
new sync protocol, no tax/rate change.

**GPS retention scrub** (`scripts/scrub-geofence-gps.ts`): after the per-org
retention window precise coordinates are removed while audit value is preserved.
- `geofence_check_in`: NULL `latitude`/`longitude`, stamp `coordsPurgedAt`. KEEPS
  `status` (verdict), `employeeId`, `organizationId`, `matchedWorkSiteId`,
  `distanceMeters`, `accuracyMeters`, `reason`, `capturedAt`.
- `attendance_event`: NULL `locationLat`/`locationLon` (exact coords too; no
  `coordsPurgedAt` column — null is the scrubbed marker). KEEPS `source`,
  `deviceId`, times, duration.
- **DRY-RUN by default**; `--apply` performs writes; `--org=<id>` optional filter.
  Recent rows (inside the window) are never touched. Prints eligible / skipped-
  recent / already-scrubbed counts. Retention from `attendance_setting`
  (default 90).

**Attendance source labels + needs-review** (`routers/attendance.ts`
`recordsList` → `enrichRecordsSourceReview`): each daily record is enriched with a
`source` key (derived from its linked `attendance_event` rows: single source →
that source; multiple → `mixed`; none → `none`) and a `needsReview` flag (any
open/`in_review` exception on that employee+date, scoped via record link or
linked punch/event/check-in date). The UI (`routes/app/attendance/index.tsx`) maps
the key through `SOURCE_LABELS` to plain text — "Manual entry" / "Biometric
device" / "Mobile GPS check-in" / "File import" / "Admin adjustment" / "Mixed
sources" / "Source unavailable" — never a raw enum/ID, and shows a "Needs review"
badge. No raw GPS coordinates are returned in the records payload.

### Verification

`scripts/verify-biometric-geofence-attendance-payroll-integration.ts` — 22/22 full
chain: (A) raw-punch safety (unprocessed punch is a warning, worked minutes from
records); (C) exceptions (blocker + non-blocker present, remote worker has no
outside_geofence); (D) readiness (rohan blocker, policy-off downgrade, resolve
clears); (E) projection (Cannot-finalize / estimate / Needs-review); (F) privacy
(no template column; synthetic old check-in scrubbed → coords null + coordsPurgedAt
stamped + verdict/distance/accuracy/time preserved; org-wide invariant: no purged
row retains coords); (B, last) processor links punch→event + second run idempotent
(processed=0, exceptionsCreated=0). Read-only assertions run on pristine seed
**before** the mutating processor run (see lessons-learned #79).

Scrub script proof (observed): dry-run on a synthetic 200-day-old check-in →
`eligible=1, scrubbed=0`; `--apply` → scrubbed 1, `latitude/longitude=null`,
`coordsPurgedAt` set, verdict/distance/accuracy/time preserved; a 3-day-old row
left untouched; re-run dry-run → `eligible=0`. Existing verifiers still pass
(work-arrangement, payroll-readiness, live-pay-projection).

**Browser pass** (0 app console errors): attendance page shows the Source column +
plain labels (after processing seeded punches: Devon=Mobile GPS check-in,
Maya/Rohan=Biometric device, Kareena=Mobile GPS check-in) + "Needs review" badges;
records payload carries **no lat/lon**; employee estimated-pay card still renders
("Cannot finalize yet"); geofence check-in page renders with no raw coordinates.
Screenshots: `docs/reviews/phase-11g-cp4/`.

**RBAC** (live): employee → global `biometric.exceptions.list` **403**,
`biometric.punches.list` **403**, own projection 200 with no `resolutionLink`;
auditor → attendance read 200, `records.validate` **403** (read-only). No raw GPS,
biometric templates, or device secrets exposed to employees.

Gates: check-types 3/3, payroll-engine 27/27, build ✓, web tsc 26 baseline (0
touched-file errors), ultracite 223/1/2 unchanged, audit:permissions 73/10.

**Phase 11G COMPLETE** (CP1 work-arrangement → CP2 payroll readiness → CP3 live
projection → CP4 scrub + source labels + integration). Next: **Phase 11H** —
module-wide QA/RBAC/security/browser pass to close Phase 11.

## QA / RBAC / security pass (Phase 11H — closes Phase 11)

Three parallel read-only audits (security/RBAC, UX/a11y, integration/correctness)
then sequential fixes for confirmed defects only.

**Behaviour-affecting fixes:**
- `payslipsList` now leftJoins `employeeProfile` (returns `employeeFirstName`/
  `employeeLastName` via `getTableColumns(payslip)`) so the payslips table and the
  run-preview review table render employee NAMES instead of a raw cuid.
- Public `ingest.submit` rejects punches from non-`active` devices (was id + key +
  deletedAt only) → a deactivated device can no longer ingest.
- `containsBiometricTemplate` now **recurses** into nested objects/arrays — a
  template hidden under e.g. `meta.fingerprintData` (allowed by the ingest
  `.passthrough()`) is now rejected, not just top-level keys.
- `buildExceptionReview` period scoping compares on **date granularity**
  (`formatDate(when)` vs the period's date keys). Previously date-mode period
  bounds (local midnight) vs a timestamp `when` dropped a same-day exception after
  00:00 on the last day (and edge of the first day) from payroll readiness. See
  lessons-learned #80.

**UI-label fixes:** raw `wageType` enum → `wageTypeLabel` (run + payslips); raw
correction status enum → `correctionStatusLabel`; biometrics overview
"Geofencing (coming soon)" `<a>` (full reload + wrong label) → `<Link>` "Geofencing".

**Documented hardening backlog (NOT changed in a QA pass):** manager visibility of
org-wide `mappings.list` / `assignments.list` (A1/A2 — `canViewBiometrics`
intentionally grants managers device-view; low, employee names only); processor
`applyInPunch`/`applyOutPunch` non-transactional partial-failure double-create
window (C-D1 — wrap event-insert + punch-update in `db.transaction`); unmapped
punches (`employeeId NULL`) surface in the org exception queue but not per-employee
readiness (C-D2); `duplicate_punch` exception type is dead — duplicates are dropped
at ingest by `idempotencyKey` (C-D3); `attendance_event` GPS scrub uses
date-granularity cutoff (C-D5, privacy-safe ≤1-day over-scrub).

**RBAC matrix (live RPC):**

| role | devices/geofence create | punches/exceptions list | records.validate | projectedPay.own | runs.confirm |
|---|---|---|---|---|---|
| payroll_admin | 403 / 403 | 200 / 200 | 403 | 404 (no profile) | reached (manage) |
| manager | 403 / 403 | 200 / 200 (scoped) | 403 | 200 | 403 |
| auditor | 403 / 403 | 200 / 200 (read) | 403 | 200 | 403 |
| employee | 403 / 403 | **403 / 403** | 403 | 200 (own, no resolutionLink) | 403 |

Public ingest: bad key **401**; nested biometric-template payload **rejected**
(proven); inactive device **403**. Auditor exception queue shows no action buttons
("Resolved"/"Dismissed" are status-filter chips, not mutations). Employee hitting a
global biometrics page gets a "You don't have access to device management" state.

**Security/privacy:** no biometric-template columns or material stored/accepted
(recursion-proven); `apiKeyHash`/`credentialRef` never returned; no raw GPS to
employees; no raw enums/internal IDs as primary UI; ZKTeco TCP/ADMS + NGTeco-cloud
remain clearly "Planned" with no fake Sync; device detail leaks no secrets.

**Scripts:** verify-work-arrangement ✓, verify-biometric-payroll-readiness ✓,
verify-live-pay-projection ✓, verify-biometric-geofence-attendance-payroll-
integration 22/22 ✓, scrub dry-run 0-eligible ✓.

Gates: check-types 3/3, payroll-engine 27/27, build ✓, web tsc 26 baseline (0 new),
ultracite 223/1/2 unchanged, audit:permissions 73/10. 12 screenshots
`docs/reviews/phase-11h/`, 0 app console errors.

**PHASE 11 (Biometric + Geofencing) COMPLETE.** Next: Phase 12 Assets.
