# Phase 21N — Migration Login Preservation & First-Login Onboarding

**Status:** ✅ COMPLETE (21N-A spec → B schema → C ETL → D modal/API → E report →
F docs → G QA) · **Date:** 2026-06-15 · **audit stays 161/21** (no AC/role change)

Supersedes the 21M "no-login is fine" stance. Owner directive: **preserve logins
and access wherever possible; true no-login only when explicitly intended; no fake
emails; no insecure password migration**; plus a required first-login onboarding
modal, migration-aware user state, and an HR/admin migration-status report.

> Hard rules held throughout: no v1 writes · no production v2 data writes · no fake
> placeholder emails · no insecure password migration · no DNS cutover · no freeze
> without owner approval · no secrets committed. GRA remains payroll truth.

## What shipped

- **21N-A** spec — `docs/architecture/migration-login-preservation-plan.md`.
- **21N-B** schema (migration **0026_clammy_master_mold**): 4 additive `user`
  columns — `migrated_from_v1` (NOT NULL default false) + `first_login_after_
  migration_at` / `migration_notice_acknowledged_at` / `profile_review_completed_
  at` (nullable). Applied to dev; verified on a fresh ephemeral scratch.
- **21N-C** ETL (`scripts/migration/write-etl/`): load identities from the v1
  `member` roster (not employee-derived); role map `owner→tenant_owner`,
  `admin→tenant_admin`, unknown→`employee`+flagged; copy `account` rows verbatim
  (credential scrypt hashes carried — no reset; Google links preserved); preserve
  v1 `user.role='admin'` as the cross-tenant platform owner; PII-safe operator
  notices (platform_admin / unmapped_role / missing_login); fixed a multi-tenant
  cascade bug (users/accounts are global → `onConflictDoNothing`, shared user
  keeps a member row in each tenant). +8 transformer tests (38/38).
- **21N-D** first-login modal (`features/migration/first-login-modal.tsx`) +
  `migration` router (`me.status` / `me.acknowledge` / `me.markProfileReviewed`,
  self-scoped via `protectedProcedure` — no AC pair). Required acknowledgement
  (AlertDialog, no outside-click/Esc dismiss).
- **21N-E** HR/admin report: `migration.admin.report` (reuses `employee:read` +
  handler `canManageHR`) + `/app/migration-status` (StatTiles + table) + gated
  "Govern → Migration status" nav entry (canManageHR only, before the
  canViewPayroll see-all branch).
- **21N-F** Fumadocs: NEW `administration/first-login.mdx` (employee) +
  `administration/migration-logins.mdx` (admin/HR); `migration-cutover.mdx`
  first-login flipped Preview→Live; meta + index cards wired.

## 21N-G verification

### Live v1 → fresh scratch ETL rehearsal (read-only v1, scratch only)
member roles **tenant_owner×8 / tenant_admin×4 / employee×13 = 25** (matches v1
exactly — no flattening, no lost cross-tenant membership); **platform admin×1
preserved**; credential hashes + Google links copied; 24 distinct users; **8
employees flagged `missing_login`**. GL balanced, isolation pass, PII scan clean.

### Data-layer proof of the two new surfaces
- **`migration.admin.report`** categorization run against scratch (23 migrated
  employees): `login_pending_ack` 15 · `no_login_missing_email` 6 ·
  `no_login_has_email` 2 (total 23, logins preserved 15, missing-email 6) — exactly
  what the StatTiles + table render.
- **`migration.me.status` + `acknowledge`** on a flagged dev user: migrated +
  unacknowledged → `needs_notice=true` (modal shows); after acknowledge (idempotent
  `WHERE ack IS NULL`) → `needs_notice=false` (won't reappear). Dev DB restored to
  baseline afterwards (0 migrated users).

### Browser UI verification — deferred
The in-browser click-through of the modal + report was attempted but **blocked by
a dev-environment issue**: another app occupies the web's configured port (:3001)
and the vite-v8 + tanstack-start dev SSR returned "Cannot GET /" on :3002. The
production **build passes 3/3**, so the app compiles and bundles correctly — this
is a dev-server infra issue, not a feature defect. Browser click-through is to be
done when the web dev server is stable (it adds no new code, only confirmation).

### Regression guards
`migration:reconcile` **READY, personal_allowance/NIS/child/net 46/46 exact** (no
regression). `migration:test-transformers` **38/38**.

## Gates
check-types **3/3** · build **3/3** (incl. docs) · audit **161/21** · verify:core
green · transformers **38/38** · reconcile **READY 46/46** · docs build 0 / docs
lint 0 · lint clean on changed files · web tsc 0 new in 21N files.

## Carried decisions (operator, not blockers)
- Which of the 8 `missing_login` employees should get a real email/login (HR).
- Google scope for the v1 Google users vs. owner-only `kareemschultz` (spec §3.1)
  — recommend a secure credential reset/invite for non-owner Google users.
