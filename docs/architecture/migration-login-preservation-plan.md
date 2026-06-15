# Phase 21N — Migration Login Preservation & First-Login Onboarding (spec)

**Status:** 21N-A spec (docs-only) · **Audience:** developer/operator · **Date:** 2026-06-15

Supersedes the Phase 21M "no-login is fine" stance. Owner directive (2026-06-15):
**preserve logins and access wherever possible; true no-login only when explicitly
intended; no fake emails; no insecure password migration.** Plus a first-login
post-migration onboarding modal, migration-aware user state, and an HR/admin
migration-status report.

> Hard rules (unchanged, still in force): no v1 writes · no production v2 writes
> until explicit cutover approval · no fake placeholder emails in production · no
> insecure password migration · no DNS cutover · no freeze without owner approval.
> GRA remains the payroll source of truth.

---

## 1. Why this exists (grounded findings)

Two real defects in the current write-ETL, both confirmed against live v1
(`karetech_erp`, read-only) and the v2 schema:

1. **Roles are flattened.** `run-write-etl.ts:129` inserts
   `mapMember(oid, u.id, "employee")` for every user. But v1 `member.role` is
   `employee`×13, **`owner`×8, `admin`×4**. The ETL would erase 12 elevated tenant
   roles.
2. **Real logins are dropped to no-login.** The ETL derives users from
   *employees that have both a linked user and an email* (`run-write-etl.ts:122`,
   `filter((e) => e.user)`), then counts the rest as "no-login." But v1 holds a
   full Better Auth identity graph: **`account` = `credential`×13 (all with
   password hashes) + `google`×10**, and a `member` row per user with its role.
   The employee-centric derivation loses that fidelity.

**Both v1 and v2 are Better Auth apps with the identical `user` / `member` /
`account` / `session` model.** This makes faithful preservation straightforward:
copy the identity rows, scoped per tenant, instead of reconstructing them.

### 1.1 Platform owner vs. tenant owner (owner clarification)

These are two different concepts and must never be conflated:

| Concept | v2 storage | Who |
| --- | --- | --- |
| **Super admin / platform owner** (cross-tenant; switches Foreign Links ↔ Netsurf; platform-wide powers) | `PLATFORM_ADMIN_USER_ID` env → admin plugin `adminUserIds` (`packages/auth/src/index.ts:73`) | **`kareemschultz46@gmail.com`** (owner-decided) |
| **Tenant owner** (full control of ONE org) | `member.role = 'tenant_owner'` (`packages/auth/src/permissions.ts:244`) | per-tenant business owners (v1 `member.role='owner'` ×8) |

**Grounded correction (verified against live v1, 2026-06-15):** v1's single
`user.role='admin'` is **NOT** `kareemschultz` — it's a separate **credential**
account (owner of netsurf only). `kareemschultz46@gmail.com` has `user.role=null`
but is an **owner member of BOTH tenants** via a **Google** account — i.e. the
cross-tenant tenant-owner. So:

- The **super admin** is set by the operator: `PLATFORM_ADMIN_USER_ID` = the v2
  user id of `kareemschultz` (preserved from v1; surfaced as a
  `platform_owner_candidate` notice — the only elevated member of >1 tenant). Org
  switching already works via their dual `tenant_owner` membership; the admin-plugin
  grant adds platform-wide powers.
- The v1 `user.role='admin'` credential account's platform role must be **reviewed**
  — the owner wants **only their account** as super admin. The ETL preserves
  `user.role` verbatim (faithful), so at cutover either demote that account's role
  or configure the admin plugin's `adminUserIds` as the sole super-admin source.

The ETL maps tenant roles into `member.role` and must **not** turn the platform
owner into an extra tenant role beyond what v1 already has. Platform power comes
from the admin plugin (by user id), outside tenancy.

---

## 2. Role mapping (v1 → v2)

v1 only uses three `member.role` values today, so the map is small and explicit.
Anything unrecognised maps to `employee` (least privilege) and is reported.

| v1 `member.role` | v2 `member.role` | Notes |
| --- | --- | --- |
| `owner` | `tenant_owner` | full org control (ownerAc) |
| `admin` | `tenant_admin` | org admin (adminAc) |
| `employee` | `employee` | default |
| *(anything else)* | `employee` | logged in the missing/odd-role report; never silently elevated |

The other nine v2 roles (`hr_admin`, `payroll_admin`, `manager`, `auditor`,
`recruiter`, `helpdesk_agent`, `project_manager`, `sales_admin`, `sales_rep`)
have **no v1 equivalent** and are assigned post-cutover by the tenant owner via
the member-management UI. We do not invent them during migration.

v1 `user.role = 'admin'` (platform) → captured into a PII-safe report and used to
set `PLATFORM_ADMIN_USER_ID` for v2; **not** written as a tenant member role.

---

## 3. Password / credential preservation (no weakening)

| v1 `account.provider_id` | Count | v2 handling |
| --- | --- | --- |
| `credential` | 13 (all with a password hash) | **Copy the `account` row verbatim** — both apps are Better Auth, so the scrypt hash format and verifier match. No reset, no plaintext, no weakening. |
| `google` | 10 (no password) | **Copy the `account` row** (providerId `google`, accountId = Google `sub`) so Google sign-in resolves to the same user. Requires the v2 Google provider to be built + the v2 redirect URI added to the reused v1 OAuth client. |

**Fallback (secure):** if any account cannot be safely carried (unknown hash
format, or a Google user that v2 will not allow Google for — see §3.1), that user
is migrated **without** a usable credential and flagged for a Better Auth
**reset/invite** flow at first contact. We never downgrade the verifier or
fabricate a password.

### 3.1 Google policy (owner-decided 2026-06-15) — allowed like v1

**Superseded the earlier "owner-only" idea.** Google sign-in is allowed **like v1,
not owner-only**:

- **Preserve ALL v1 Google `account` rows** for migrated (tenant-member) users —
  the ETL copies every member's `account` rows verbatim (8 of v1's 10 Google
  accounts belong to tenant members and migrate; 2 belong to orphan users with no
  membership → orphan report, not migrated).
- **Do not delete or disable non-owner Google logins.** Other employees who used
  Google in v1 keep Google in v2.
- Reuse the **existing v1 Google OAuth client**; add the v2 redirect/callback URL
  to it before cutover. The client secret is **Infisical/config, never ETL data,
  never committed/printed**.
- **Account linking:** preserve existing links by provider + account id; do **not**
  auto-link arbitrary accounts by email. New post-cutover Google sign-ups follow
  the product's tenant invitation / approval rules (no uncontrolled public tenant
  access).
- **`kareemschultz46@gmail.com` is the super admin / platform owner** — see §5
  (set via `PLATFORM_ADMIN_USER_ID`, not by Google-scope restriction).

---

## 4. No-login policy (revised)

No-login is **no longer the preferred final state**. Rules:

- If v1 has a login identity for the person, **preserve it** (user + member +
  account).
- If v1 is missing an email but the employee **should** have portal access,
  collect/assign a **real** email before production cutover. **Never** fabricate
  `@migrated.invalid` placeholders.
- Keep `email = null` / no-login **only** for employees who genuinely should not
  have system access (e.g. field staff with no portal need).
- Produce a **PII-safe missing-login report** (counts + opaque ids + tenant slug,
  never names/emails) for owner/HR completion.

---

## 5. Migration-aware user state (new columns)

Add to the `user` table (Better Auth core; plain audit/state fields we write from
the ETL and our own oRPC — no Better Auth `additionalFields` needed unless we want
them in the session payload):

| Column | Type | Meaning |
| --- | --- | --- |
| `migrated_from_v1` | boolean, default false, not null | true for any user created by the migration ETL |
| `first_login_after_migration_at` | timestamptz null | stamped on the first authenticated request after migration |
| `migration_notice_acknowledged_at` | timestamptz null | stamped when the user acknowledges the first-login modal |
| `profile_review_completed_at` | timestamptz null | stamped when the user marks their profile review done (best-effort) |

Migration number: next free (current head is `0025_many_warstar`) → **`0026`**.
Additive only; backfill nothing (defaults). No rename. No new AC resource or role
→ **audit stays 161/21**.

---

## 6. First-login post-migration modal (web)

Mount a global, **required** modal in the authed shell (`apps/web/src/routes/app/
route.tsx`, between `<AppTopbar>` and `<Outlet/>`; real session already wired in
21F-H6). Shown when the current user is `migrated_from_v1 = true` and
`migration_notice_acknowledged_at IS NULL`.

Content (per owner directive): you've moved to Heimdallone v2 · your account/
profile was migrated · review & update your details · confirm email, phone,
emergency contact, address, and (where allowed) TIN/NIS/statutory info · review
new features · report any incorrect payroll/leave/attendance data to HR · you may
need to set/reset your password depending on the final auth approach.

Behaviour: **dismissible only after acknowledgement** — built on the base
`AlertDialog` (`packages/ui/src/components/alert-dialog.tsx`) with `onOpenChange`
no-op, no overlay/Escape close, no Cancel button; the single primary action calls
the acknowledge mutation, then the modal closes and (optionally) deep-links to the
user's own profile (`/app/employees/$id` via `resolveCurrentEmployee`).

### API (new tiny router `migration`)

- `migration.me.status` (self) → `{ migratedFromV1, needsNotice, firstLoginAt,
  acknowledgedAt, profileReviewCompletedAt, employeeId }`. Stamps
  `first_login_after_migration_at` on first read if null.
- `migration.me.acknowledge` (self) → sets `migration_notice_acknowledged_at`.
- `migration.me.markProfileReviewed` (self) → sets `profile_review_completed_at`.

All self-scoped to `actorId(context)`; no AC resource needed (operates on the
caller's own `user` row) — keeps audit at 161/21. Profile edits reuse the existing
`hrCore.employees.workInfo.update` / `statutory.update` (already gated).

---

## 7. HR/admin migration-status report

Route `/app/migration-status` (gated `canManageHR` = owner/admin/hr_admin;
mirrors the analytics page pattern). Lists, per the owner directive:

- migrated users with login preserved,
- employees missing a login email,
- employees intentionally no-login,
- employees pending profile review,
- employees who acknowledged the migration notice.

`migration.admin.report` procedure: org-scoped join of `employee_profile` ↔
`user`, returns counts + rows (name shown **in-app to authorised HR only**; the
*file/report exports* stay PII-safe per the migration hard rules). Reuses
`canManageHR`; tenant-scoped by `organizationId`.

---

## 8. ETL changes (scratch-only; no v1/prod writes)

`scripts/migration/write-etl/` + `v1-source.ts`:

1. **Load identities directly from v1** (read-only): `user` (id, name, email,
   email_verified, role), `member` (org, user, role), `account` (full row incl.
   password hash + provider). Scope per tenant via `member.organization_id`.
2. **mapMember** uses the v1→v2 role map (§2), not a hardcoded `"employee"`.
3. **mapAccount** (new) copies credential/google rows faithfully (§3).
4. **mapUser** sets `migrated_from_v1 = true`; preserves `email_verified`.
5. **Platform admin**: detect `user.role = 'admin'`, emit to the PII-safe report +
   the `PLATFORM_ADMIN_USER_ID` recommendation; **do not** elevate as a tenant
   member.
6. **Missing-login report**: PII-safe list of employees with no usable login that
   *might* need one (counts + opaque ids + tenant slug).
7. **No fake emails**: keep the 21L-B null-email path; never synthesise.

Stays behind the existing guards (`assertScratchTarget`, `assertWriteConfirmed`,
`assertNotProduction`, `USE_V1_SOURCE`). Source rows staged in
`migration_source_*` (lossless). New transformer unit tests for `mapMember` role
map, `mapAccount`, platform-admin detection, and the no-login/missing-login paths.

---

## 9. Docs (Fumadocs) — land with the feature

- **migration-cutover.mdx** — update the no-login section to the new policy
  (preserve logins; planned first-login modal marked **Preview** until built).
- **freeze-checklist.mdx** — decision table row + a "logins & access" pre-freeze
  check; smoke tests include migrated credential + Google login.
- **NEW employee first-login experience** page (lands with the modal, 21N-D).
- **NEW no-login employee policy** page (lands with §4).
- **NEW admin checklist: missing emails/logins** page (lands with the report,
  21N-E).
- **NEW profile / statutory review process** page (lands with the modal flow).

---

## 10. Phase sequence

- **21N-A** — this spec (docs-only). ✅
- **21N-B** — schema: migration `0026` adds the 4 `user` columns; verify on an
  ephemeral Postgres (never dev/prod); `migration:reconcile` must stay 46/46.
- **21N-C** — ETL: role map + `mapAccount` + platform-admin detection +
  missing-login report + transformer tests; scratch rehearsal.
- **21N-D** — first-login modal + `migration.me.*` router.
- **21N-E** — HR/admin migration-status report (API + UI).
- **21N-F** — Fumadocs pages (§9).
- **21N-G** — full scratch dress rehearsal + QA; refresh the 21M go/no-go.

Regression guards every phase: `check-types` 3/3 · `build` 3/3 · `audit` 161/21 ·
`verify:core` green · `migration:test-transformers` · live `migration:reconcile`
**READY 46/46**.

---

## 11. Decisions captured / still open

- ✅ Reuse v1's Google OAuth client; add the v2 redirect URI to it before cutover
  (owner). Secret stays in Infisical/config — never ETL data, never committed.
- ✅ **Google sign-in allowed LIKE v1 (NOT owner-only)** — preserve all v1 Google
  `account` rows for tenant members; don't disable non-owner Google logins (§3.1).
- ✅ **Super admin / platform owner = `kareemschultz46@gmail.com`** (the
  cross-tenant Google owner; NOT v1's credential `user.role='admin'`). Set
  `PLATFORM_ADMIN_USER_ID` to their v2 user id (§1.1, §5).
- ✅ Google login is **not** a freeze blocker; bootstrap email/password +
  `PLATFORM_ADMIN_USER_ID` first.
- ⏳ Demote v1's credential `user.role='admin'` so ONLY the owner's account is
  super admin (operator, at cutover — §1.1).
- ⏳ Which no-login employees should get a real email/login before cutover (HR).
- ⏳ Whether the 2 orphan Google users (no tenant membership) should get a
  membership or stay unmigrated (orphan report; owner/HR).
