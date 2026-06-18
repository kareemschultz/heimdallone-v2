# Settings Depth — Implementation Plan (Phase 22A spec)

**Status:** Spec / "A" phase (docs-only). No code, no migrations in this document.
**Scope:** The three highest-value Settings gaps surfaced by v1 — **Branding**, **Work Locations**, and an **Audit-log viewer** — designed as tenant-safe, configurable SaaS capabilities.
**Migrations are serialized.** Latest committed migration is `0027_sharp_terrax`. The only new migration this plan introduces is `0028_*` (Branding schema). Work Locations and the Audit viewer require **no new tables**.

> **SaaS Architecture Rule (standing override):** every capability below is tenant-scoped, role-aware, effective-history-preserving, and free of any Netsurf / Foreign Links hardcoding. v1 (`apps/admin/.../settings/branding.tsx`, `work-locations.tsx`, `audit-log.tsx`) is the **intent source**, not a clone target. v1 bugs and quirks are explicitly corrected below.

---

## 0. Context & key findings (grounded in the v2 codebase)

| Concern | v1 intent | v2 today | This plan |
| --- | --- | --- | --- |
| **Branding** | `organization.updateBranding` writes name/address/phone/email/footer/logo (file→base64 OR URL)/brandColor/payslipTemplate/3 payslip display toggles. Used in sidebar, PDF payslip header, emails. | **Does NOT exist.** `organization` table has only `name`, `slug`, `logo` (text), `metadata` (text). Sidebar reads `activeOrg.data.name`. No PDF generator exists. | New `tenant_branding` 1:1 satellite table + `branding` router + new Settings tab. Logo accepts a **URL (MVP)** + optional small data-URI; file-storage seam flagged. |
| **Work Locations** | `work_location` table (name/address/lat/lon/radius/type) + `workLocations` router; geo-fences for clock-in + device assignment. | **Already exists** as `geofence_location` (Phase 11, `packages/db/src/schema/biometric.ts`) with `name/address/latitude/longitude/radiusMeters/accuracyThresholdMeters/allowOutsideWithReason/isActive/deletedAt`, referenced by `attendance_device.workSiteId`, `geofence_assignment`, `geofence_check_in`. A full router exists in `biometric.ts` (`geofencesList/getById/create/update`, gated `geofence:read|manage`). | **Do NOT create a new table or router.** Surface the existing `geofence_location` as a "Work Locations" Settings tab. Add the missing `locationType` column + (optional) `archive`/`list-includes-archived` parity, all on the existing table. AC = the existing `work_location` resource (already in `permissions.ts`) **or** reuse `geofence`. See §2 for the resolved decision. |
| **Audit-log viewer** | Read-only paginated table over `audit_logs` with action/entity/date filters + before/after JSON drawer. | `audit_event` table exists (`hr-core.ts`) with `entityType/entityId/action(enum)/actorId/changes(jsonb)/metadata(jsonb)/createdAt` and indexes on `(org,entityType,entityId)`, `(org,createdAt)`, `(actorId)`. **No router lists it** (projects/performance read it only for per-module activity tabs). `audit_log:read` AC already exists. | New read-only `audit` router (`list` + `getById`) over the existing table. **No new table.** New Settings tab. Humanized labels for `entityType`/`action`/actor. |

**Three structural facts that shape the whole plan:**

1. **`work_location` and `audit_log` AC resources already exist** in `packages/auth/src/permissions.ts` (lines 76 and 82) and are already granted across roles, but **neither is consumed by any router**. Wiring them is the same "unconsumed-resource-first-consumer" pattern as 13B/14B/15B/16B — so the permission **audit count rises** when these routers ship (the spec budgets +1 router each; see §5).
2. **No PDF/payslip generator exists in v2 yet.** Branding therefore stores the fields the future payslip/email renderer will read, and is consumed **immediately** only by the app shell (sidebar logo/name/accent). Payslip/email consumption is a documented forward seam, not a deliverable of this phase.
3. **No file-storage subsystem exists in v2.** Logo upload is therefore a **URL field (MVP)** plus an optional bounded data-URI, with object-storage flagged as a follow-up (§6, open questions).

---

## 1. Branding (`Live`, `Admin`, `Tenant Configurable`)

### 1.1 Intent (from v1)
Per-tenant identity (display name, address lines, phone, email, payslip footer note), a logo, a brand accent colour, a payslip template choice, and payslip display toggles (attendance/hours/NIS). Used in the sidebar, on PDF payslip headers, and in emails.

### 1.2 v2 design decisions (corrections to v1)
- **Separate satellite table, not org columns.** v1 piggy-backed branding onto the org row via `metadata`/ad-hoc columns. v2 introduces a dedicated `tenant_branding` table keyed 1:1 to `organization` (FK, `onDelete: cascade`). Keeps the Better-Auth-owned `organization` table clean and lets branding evolve without touching auth schema.
- **Logo: URL-first, bounded data-URI optional.** v1 stored arbitrary base64 in the DB. v2 stores a `logoUrl` (preferred) and an **optional** `logoDataUri` capped server-side (e.g. ≤ 256 KB, validated MIME `png|svg+xml|jpeg|webp`) so we don't bloat rows. The real fix (object storage) is a flagged follow-up.
- **Colour stored as validated hex** (`#rrggbb`, server-validated). The app maps it to the existing `--primary` token at runtime via `color-mix` (consistent with the navy Corporate theme swap, commit `61fbe09`); branding never ships raw inline colours into security-sensitive surfaces.
- **Payslip template + display toggles are stored now, consumed later.** They are honest forward config; the Settings UI labels them clearly ("Applies when payslips are generated").
- **Everything effective-immediately + audited.** Each save writes an `audit_event` (entityType `tenant_branding`).

### 1.3 Schema — new table `tenant_branding` (migration `0028_*`)
`packages/db/src/schema/` — add `tenant-branding.ts` (or fold into an existing settings schema file; follow the per-domain file convention).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `cuid()` | PK |
| `organizationId` | `orgRef()` **unique** | 1:1 with `organization`; unique index enforces single row per tenant |
| `displayName` | `text` nullable | Falls back to `organization.name` when null |
| `addressLine1/2/3` | `text` nullable | Payslip/email header |
| `phone` | `text` nullable | |
| `email` | `text` nullable | server-validated email when present |
| `footerNote` | `text` nullable | Printed on payslip PDFs |
| `logoUrl` | `text` nullable | Preferred logo source |
| `logoDataUri` | `text` nullable | Optional, **server-capped size + MIME-validated** |
| `brandColorHex` | `text` nullable | `#rrggbb`, server-validated; null → theme default |
| `payslipTemplate` | `text` (enum-like) | `classic` \| `modern` \| `compact`; default `classic` |
| `payslipShowAttendance` | `boolean` default `true` | |
| `payslipShowHours` | `boolean` default `false` | |
| `payslipShowNis` | `boolean` default `false` | NIS shown **masked** by the renderer; never plaintext |
| `...timestamps` | | `createdAt`/`updatedAt` |

- **Indexes:** `unique(organizationId)`.
- **Enum:** `payslip_template` pgEnum (`classic/modern/compact`) — preferred over a free text column for tenant-safe validation.
- **No new audit_action values needed** (`create`/`update` cover it).

### 1.4 AC resource & grants
Add a new resource to `permissions.ts`:
```
branding: ["read", "manage"]
```
Grants (mirror the HR-config shape):
- `tenant_owner`, `tenant_admin`, `hr_admin` → `["read", "manage"]`
- `payroll_admin` → `["read"]` (payroll needs the payslip-template/toggles context; read-only)
- `manager`, `employee`, `auditor` → `["read"]` (logo/name/colour are visible org chrome; auditor read for completeness)
- `recruiter`, `helpdesk_agent`, `project_manager`, `sales_admin`, `sales_rep` → `["read"]`

> Rationale: branding (logo/name/accent) is non-sensitive org chrome every member already sees in the sidebar; **only `manage` is admin/HR-gated.** `read` being broad keeps the app shell honest without a 403.

### 1.5 RBAC helpers (server `role-helpers.ts` ⇄ web `rbac.ts`, byte-aligned)
```
canManageBranding(role)  = canManageHR(role)              // owner/admin/hr_admin
canViewBranding(role)    = true                           // every member reads org chrome
```
Keep both files identical (the standing mirror rule; lesson re: server↔web drift).

### 1.6 oRPC procedures — new router `branding`
File `packages/api/src/routers/branding.ts`, registered in the root router.

| Procedure | AC gate | Input | Behaviour |
| --- | --- | --- | --- |
| `get` | `branding:read` | none | Returns the tenant's branding row (or a defaults object derived from `organization.name` if no row yet). Self-tenant only (`tenantProcedure` org scope). |
| `update` | `branding:manage` | partial branding fields (Zod) | Upsert by `organizationId` (insert-or-update). Validates hex, email, MIME + size of `logoDataUri`, template enum. Writes `audit_event` (`tenant_branding`, `create`/`update` + `diffChanges`). |

- **`update` is a single upsert** rather than v1's five separate mutations — simpler, one audit row per save, fewer round-trips. The UI may still call it per-card; each call patches only the supplied fields.
- **Verification script** `scripts/verify-branding-api.ts`: admin upsert round-trip; non-HR `update` → FORBIDDEN; employee `get` → OK (read is broad); hex/email/MIME rejection; upsert idempotency; tenant isolation (org A cannot read/write org B).

### 1.7 UI
**Surface:** add a **"Branding"** tab to the existing tabbed `apps/web/src/routes/app/settings.tsx` (extend the `SettingsTab` union + `tabs` array; icon `Palette`). Tab is rendered for everyone (read), but **all inputs/save buttons are gated `canManageBranding`** (read-only preview otherwise).

**Cards (port v1 intent, navy Corporate theme, shared primitives):**
1. **Company identity** — display name, 3 address lines, phone, email, footer note → one "Save details" action.
2. **Logo** — URL input + optional file picker (reads to a bounded data-URI client-side, shows the cap), live preview, "Clear uploaded file". Honest copy: "Uploads are stored inline for now; large logos should use a URL."
3. **Brand colour** — `<input type="color">` + hex field (validated) + live preview strip.
4. **PDF payslip preview + template selector** — mock preview (clearly a **sample/demo** mock, not live data — per the docs rule on fake data) + classic/modern/compact tabs. Copy: "Applies when payslips are generated."
5. **Payslip display settings** — three toggles (attendance/hours/masked-NIS) with auto-save.

**States:** loading skeleton, error (not a healthy-empty), saved toast. **a11y:** labels on every input, `:focus-visible` rings, hex picker has `aria-label`.

**App-shell consumption (this phase):** sidebar header reads `branding.get` for logo + display name; accent maps to `--primary` via `color-mix`. Falls back to `organization.name` + theme default when unset.

---

## 2. Work Locations (`Live`, `Admin`, `Tenant Configurable`, `Requires Setup`)

### 2.1 Intent (from v1)
Named GPS geo-fences (name, address, lat/lon, radius, type) used for clock-in radius validation and device assignment, with create/edit (sheet) and archive (confirm dialog).

### 2.2 The critical de-duplication decision
**v2 already owns this concept as `geofence_location` (Phase 11).** It carries name/address/latitude/longitude/radiusMeters + extra v2 fields (`accuracyThresholdMeters`, `allowOutsideWithReason`, `isActive`, `deletedAt`, `notes`) and is wired into `attendance_device.workSiteId`, `geofence_assignment`, and `geofence_check_in`. A working router already exists in `biometric.ts` (`geofencesList/getById/create/update`, gated `geofence:read|manage`).

> **Decision: surface the existing table; do not create a `work_location` table or a parallel router.** Creating a second locations table would split the source of truth and orphan the existing device/check-in references — a direct violation of the module + migration rules.

**The one gap vs v1:** v1 has a `locationType` (`office/site/remote/warehouse/other`); `geofence_location` does not.

**Resolved design:**
- **Schema (migration — fold into `0028_*` or a sibling `0029_*` if Branding ships separately):** add `locationType` (new `work_location_type` pgEnum: `office/site/remote/warehouse/other`, default `office`) to `geofence_location`. Add nothing else. Existing rows backfill to `office`.
- **AC:** **reuse the existing `geofence` resource** for the manage/read gates (the table, router, and all references are already `geofence`-gated and consumed). The standalone `work_location` AC resource currently in `permissions.ts` is **left unconsumed and documented as deprecated-in-favour-of-`geofence`** in a code comment (removing it is a separate, riskier change — keep this phase additive). This keeps the permission audit budget unchanged for Work Locations (no new first-consumer router). *Alternative considered & rejected: routing Work Locations through `work_location` AC — rejected because it would double-gate the same rows under two resources and require re-gating device/check-in code.*
- **Router:** extend the existing biometric geofence procedures rather than add a router:
  - `geofencesList` → accept an `includeArchived` flag (parity with HR-config lists; default false, returns `isActive`/`deletedAt`-aware rows).
  - add `geofencesArchive` (soft-delete via `deletedAt`/`isActive`, gated `geofence:manage`, audited) — v1 has archive; v2's create/update exist but archive is the missing verb.
  - `geofencesCreate`/`geofencesUpdate` → accept the new `locationType`.
- **No new RBAC helpers** beyond the existing `canManageGeofencing`/`canViewGeofencing` (already mirrored server↔web). Document in those helpers' comments that they also gate "Work Locations".

### 2.3 UI
Add a **"Work Locations"** tab to `app/settings.tsx` (icon `MapPin`), gated visible to `canViewGeofencing`; create/edit/archive gated `canManageGeofencing`.

- **List** (table / shared `DataTable`): name + address, type badge (icon per type), coordinates (mono, "No GPS coords set" when null), radius (`N m`), actions (edit, archive). `includeArchived` toggle.
- **Create/Edit** (sheet or inline form matching the existing settings pattern): name (required), address, type select, lat/lon (numeric, optional), radius (default 200, min 1 max 50 000). Copy: "Employees clocking in outside this radius will be flagged unless GPS enforcement is disabled."
- **Archive** confirm dialog: "Existing punch records that reference this location are not affected." (Soft-delete; `deletedAt`.)
- Cross-link note in the Biometric/Devices module docs: devices assign to these locations via `workSiteId`.

> **No fake data.** If a tenant has no locations, show the existing empty state, not seeded demo rows.

---

## 3. Audit-log viewer (`Live`, `Admin`, `Auditor`, `Security`)

### 3.1 Intent (from v1)
Read-only paginated table over the audit log with action/entity/date filters and a drawer showing full before/after JSON. Server-authorized via `audit_log:read` (owner/admin/hr_admin/payroll_admin/auditor).

### 3.2 v2 design — read over the existing `audit_event`, NO new table
The `audit_event` table already stores `entityType`, `entityId`, `action` (enum: create/update/delete/archive/restore), `actorId`, `changes` (jsonb `{field,oldValue,newValue}[]`), `metadata` (jsonb), `createdAt`, with indexes on `(org,entityType,entityId)`, `(org,createdAt)`, `(actorId)`. The new viewer is **pure read aggregation** (the same guardrail as the analytics router: **zero writes, owns no table**).

### 3.3 AC & grants
The `audit_log` resource already exists with `["read"]` and is granted to `tenant_owner`, `tenant_admin`, `hr_admin`, `payroll_admin`, **`auditor`**. This router is its **first consumer** (so it consumes the existing pair; +1 router in the audit count, no new AC pair). No grant changes needed — but **confirm the grant matches the requirement** (admin + auditor): it does, and is broader (HR/payroll too), which is acceptable for an oversight log.

### 3.4 RBAC helpers (server ⇄ web, byte-aligned)
```
canViewAuditLog(role) = canManagePayroll(role) || role === "auditor"
```
(= owner/admin/hr_admin/payroll_admin/auditor — byte-aligned to the `audit_log:read` grant, NOT spec prose, per lesson #88.)

### 3.5 oRPC procedures — new router `audit`
File `packages/api/src/routers/audit.ts`.

| Procedure | AC gate | Input | Behaviour |
| --- | --- | --- | --- |
| `list` | `audit_log:read` | `{ entityType?, action?, actorId?, dateFrom?, dateTo?, page=1, pageSize≤100 }` | Tenant-scoped (`organizationId = ctx org`) query of `audit_event`, newest-first, paginated. Filters: `entityType` exact, `action` enum, `actorId`, `createdAt` range. Resolves `actorId → {name,email}` via a user map. Returns rows + total. **Read-only; emits no audit_event** (viewing the log is not itself a logged mutation). |
| `getById` | `audit_log:read` | `{ id }` | One tenant-scoped row with full `changes` + `metadata` JSON for the drawer. IDOR-guarded (org match or NOT_FOUND). |

- **Guardrail:** grep-provable zero `db.insert/update/delete`. Owns no table. Tenant isolation on every path.
- **Humanization is a pure helper** (server-returned labels or a shared web label map): `entityType` → friendly noun (`tenant_branding` → "Branding", `geofence_location` → "Work location", `payslip` → "Payslip", `employee_profile` → "Employee", …); `action` → "Created/Updated/Deleted/Archived/Restored"; actor name + relative time. **Never raw enums/IDs as user-facing labels** (UI rule).
- **Verification** `scripts/verify-audit-api.ts`: admin + auditor `list` OK; employee/manager/recruiter `list` → FORBIDDEN; filters (entityType/action/actor/date) narrow correctly; tenant isolation (org A cannot see org B rows); `getById` IDOR → NOT_FOUND across tenants; pagination bounds (pageSize cap).

### 3.6 UI
Add an **"Audit Log"** tab to `app/settings.tsx` (icon `Shield`/`History`), gated `canViewAuditLog` (clean no-access state otherwise; tab hidden for non-viewers).

- **Filter bar:** action category select (humanized; built from the 5 enum actions + "All"), entity-type select/search (humanized list of known entity types + free text), actor picker (optional), date range. *(v1's `action`-prefix string filter is replaced by the real `action` enum + `entityType` — cleaner and index-backed.)*
- **Table** (`DataTable`): When (mono timestamp), Action (badge — carries text, never colour-only), Entity (humanized type + short id), Actor (name/email or "system"), chevron → drawer.
- **Drawer:** action/entity/actor/when + a structured **before/after / changes** view rendered from `changes[]` (and `metadata` when present) — readable rows, not just a raw `<pre>` dump (improvement over v1's raw JSON; raw JSON available as a collapsible "Show raw").
- **States:** loading skeleton rows, empty ("No audit entries match these filters yet."), error.

---

## 4. Documentation (Fumadocs — required by the standing Documentation Rule)
- `administration/branding.mdx` — what it is, who can manage (`Admin`/`HR`), the cards/workflows, logo URL-vs-upload caveat, payslip-template "applies later" note, tags `Live`/`Admin`/`Tenant Configurable`.
- `administration/work-locations.mdx` — that these are the geo-fences used for clock-in + device assignment; create/edit/archive; effect on attendance flagging; cross-link to `time/biometric-devices.mdx`. Tags `Live`/`Admin`/`Requires Setup`/`Tenant Configurable`.
- `administration/audit-log.mdx` — read-only oversight log; who can view (`Admin`/`Auditor`); filters; how to read a change entry; that viewing is not itself logged. Tags `Live`/`Admin`/`Auditor`/`Security`.
- Update the Administration index `meta.json` + Cards.

---

## 5. Permission-audit budget (`bun run audit:permissions`)
- **Branding:** +1 new AC resource (`branding:[read,manage]`) consumed by the new `branding` router → **+1 router, +2 pairs**.
- **Work Locations:** reuses `geofence` (already consumed) → **no change**.
- **Audit viewer:** consumes the **existing** `audit_log` resource as first consumer → **+1 router, no new pair** (13B `ticket:approve` precedent).
- Net expectation: the audit total rises by the branding pairs + the two newly-consumed routers. The implementing "B/C" phases must record the exact before→after (current baseline = **161/21**) and treat it as expected, not a regression.

---

## 6. Build sequence
1. **22B — Branding schema + migration `0028`** (`tenant_branding` table + `payslip_template` enum + `work_location_type` enum + `geofence_location.locationType` column; one migration, additive, backfill `office`). DB verify script. Apply to dev only; verify on an ephemeral throwaway DB first (lesson re: schema verification).
2. **22C — Branding AC + router + RBAC helpers** (`branding` resource + grants; `branding` router get/update upsert; `canManageBranding`/`canViewBranding` mirrored). `verify-branding-api`. Restart `apps/server` (—hot doesn't cross `packages/api`, lesson #76).
3. **22D — Work Locations API parity** (add `locationType` to create/update, `includeArchived` to list, new `geofencesArchive`; document `work_location` AC as deprecated-in-favour-of-`geofence`). Extend the biometric verify script.
4. **22E — Audit viewer AC-wire + router** (`audit` router list/getById; `canViewAuditLog` mirrored; humanization helper). `verify-audit-api`.
5. **22F — UI: three new Settings tabs** (Branding, Work Locations, Audit Log) in `app/settings.tsx`; app-shell sidebar consumes `branding.get`. Browser-verify the role matrix (admin manage; auditor sees audit-log read-only; employee read-only branding + no audit/work-loc-manage).
6. **22G — Fumadocs** (three Administration pages + index).
7. **22I — QA** (parallel read-only review agents: tenant isolation, zero-write guardrail on audit router, RBAC byte-alignment, IDOR on `getById`, no fake data, a11y/`:focus-visible`). Gates: `check-types` 3/3, `build` 3/3, `audit:permissions` (new baseline), lint clean on changed files, web tsc 0 new.

---

## 7. Open questions & recommendations
1. **Logo storage.** MVP = URL + bounded data-URI. **Recommendation:** add an object-storage seam (S3/R2) in a later phase and migrate `logoDataUri` → a stored object URL; keep `logoUrl` as the canonical field so the swap is transparent. Flag clearly in docs that uploads are inline for now.
2. **`work_location` AC resource fate.** It exists but is unconsumed; this plan routes Work Locations through `geofence`. **Recommendation:** leave `work_location` in `permissions.ts` with a deprecation comment this phase; remove it in a dedicated cleanup once we confirm nothing else references it (avoid a drive-by AC removal that perturbs the audit count).
3. **Brand colour → theme application.** Should `brandColorHex` override `--primary` app-wide, or only payslip/email + a sidebar accent? **Recommendation:** sidebar accent + payslip/email only this phase (full app-wide theming risks contrast/a11y regressions on the navy Corporate base). Validate contrast before any app-wide application.
4. **Payslip template + toggles with no renderer.** Stored now, consumed when the payslip PDF generator lands. **Recommendation:** ship the config + the "applies when payslips are generated" copy; do not fake a live preview with real employee data (sample/demo mock only, clearly labelled).
5. **Audit retention / volume.** `audit_event` grows unbounded. **Recommendation:** the viewer paginates (≤100/page) and is index-backed; a retention/archival policy is a separate ops concern (note in `docs/operations`).
6. **Effective-dating.** Branding is "current state" (not historically resolved), which is correct — but every change is audited, so history is reconstructable from `audit_event`. No effective-dating columns needed.

---

## 8. Future Settings gaps (noted, NOT in this phase)
From v1's `settings/` and the broader product surface, deferred to later phases:
- **Public holidays** — *already implemented in v2* (the Holidays tab in `app/settings.tsx` + `hrCore.holidays.*` with country import). No work needed.
- **Onboarding templates** — onboarding exists; a template-library Settings surface is a later HR phase.
- **Billing / subscription** — SaaS billing (Stripe) is its own phase, not a settings-depth item.
- **Statutory rates / salary structures / payroll components** — payroll already owns effective-dated country rules (Phase 21D-G); a tenant-facing read/preview Settings surface is a payroll-UI follow-up.
- **Notification preferences / channels** — the notifications inbox exists (21D-F); per-user channel preferences are a notifications follow-up.
- **API keys / integrations / SSO config** — platform/admin hardening, separate phase.
