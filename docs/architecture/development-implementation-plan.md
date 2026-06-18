# Development Module — Implementation Plan (Phase "A" Spec)

> **Status:** `Preview` spec — design only, no code yet.
> **Module:** Development (Learning & Growth) — **Training programs + Certifications + Skills matrix**.
> **Tags:** `HR` · `Employee` · `Manager` · `Auditor` · `Self-Service` · `Tenant Configurable` · `Effective Dated` (certifications) · `Requires Setup`.
> **Next migration number:** `0028` (latest committed is `0027_sharp_terrax`).
> **Audit baseline before this module:** `161/21`. This module adds **one** AC resource (`development`) consumed by one router → expected `audit ≈ 163/22` after the C phase (one new resource, +N pairs).

---

## 0. Where this fits

Development is an **HR-owned, employee-participated** module: HR/managers curate the training catalogue, certification types, and skills catalogue (the *definitions*); employees participate (enroll in training, hold certifications, self-assess/get-assessed on skills). It mirrors the **Performance/PMS** shape almost exactly:

- HR/admin **owns** the definitions; employees are **first-class participants** with self-service views.
- Managers see their **direct reports** (handler-scoped, server-side IDOR gate).
- Auditors are **read-only**.
- The module **owns its own data** and **links read-only** to neighbours — it never mutates Performance, Recruitment, or HR-core.

It is the natural sibling to Performance: a goal in Performance may say "complete X training" or "reach skill level Y"; Development holds the actual learning records. Those are **read-only seams**, not duplication (see §9).

### SaaS Architecture Rule compliance (standing override)

The v1 Netsurf app proves the *need* (internal LMS-light, ACCA/CGA/vendor cert expiry at 90/60/30/7-day thresholds, a "who knows X at level ≥ N" skills search). It does **not** define the product. Everything here is generalized:

- **No hardcoded cert names** (ACCA/CGA/AWS are *sample data*, not enum values). Certification types are tenant-defined rows.
- **No hardcoded proficiency ladder.** Skill proficiency levels are a per-skill ordered list (a tenant can use Beginner→Expert, or 1→5, or Novice→Master). The *ordinal* is what search compares, the *label* is what users see.
- **No hardcoded expiry windows.** The 90/60/30/7-day reminder cadence is a **tenant-configurable default list** with a sensible factory default; a certification type may also carry its own validity period.
- **Multi-tenant, multi-department, multi-location, RBAC-scoped, soft-archived, audited, importable/exportable** — every table is `orgRef()`-scoped.

### v1 bugs/quirks deliberately NOT cloned

1. **Expiry stored as a flag.** v1 surfaces "expiring" via a scan that can drift from reality. v2 **derives** expiry status (`valid` / `expiring_soon` / `expired`) **at read time** from `expiryDate` vs `now` + the threshold list — never stored as a column (same discipline as Helpdesk SLA state and Projects health). The only stored fields are `issueDate` / `expiryDate`.
2. **Skill proficiency as free text.** v1 mostly relies on a label string. v2 stores **both** an ordinal (for fast, correct `level ≥ N` queries) **and** the label (for display), with the ordered label list living on the skill type — so "who knows React at level ≥ 2" is an index hit, not a string compare.
3. **Enrollment/attempt fields scattered.** v2 models a clean enrollment lifecycle (`enrolled → in_progress → completed / failed / withdrawn`) with `attemptsUsed` bounded by the program's `maxAttempts`, and `scorePercent` checked against `passingScorePercent` server-side.
4. **Cross-module write creep.** v1 occasionally writes back to HR records. v2 **never** writes a foreign table; Performance/Recruitment links are read-only.

---

## 1. Module scope

### 1.1 Training programs + enrollments

- A **training program** (course): name, description, internal vs external, duration hours, optional passing score, max attempts, status (`draft`/`active`/`archived`), optional category.
- Optional **program modules** (ordered lessons within a program) — kept minimal in MVP; a program may have zero modules and still be enrollable.
- An **enrollment**: an employee enrolled in a program; lifecycle `enrolled → in_progress → completed | failed | withdrawn`; `scorePercent`, `attemptsUsed`, `completedAt`. Pass/fail derived against `program.passingScorePercent` on completion (server-enforced).
- **Self-service:** an employee can enroll themselves in an `active` program (if the tenant allows self-enrollment) and see "My training". HR/managers can enroll/assign reports.

### 1.2 Certifications (issue/expiry tracking + reminders)

- A **certification type** (definition): name, issuing body, whether it requires renewal, default validity period (months), optional per-type reminder thresholds (else tenant default).
- An **employee certification** (a held credential): links employee → certification type, `issueDate`, `expiryDate` (nullable for non-expiring), `credentialId`, optional document link (soft ref to the Documents module), status.
- **Expiry is DERIVED at read time** — never a stored flag:
  - `expired` if `expiryDate < now`
  - `expiring_soon` if `expiryDate` within the largest configured threshold (e.g. ≤ 90 days)
  - `valid` otherwise / `no_expiry` if `expiryDate` is null.
- The read model exposes `daysUntilExpiry` and which threshold bucket it falls in (90/60/30/7) so the UI can badge it and an "Action items" / notifications feed can surface it.
- **Optional:** a server-side scan procedure (or a scheduled job, post-MVP) that **emits notifications** via the existing `notifications` emit helper (`packages/api/src/utils/notifications.ts`) when a cert crosses a threshold. Reminders are a *read-derived* surface first; proactive notification emission is a fast-follow that reuses the existing inbox — it does **not** invent a new delivery table.

### 1.3 Skills matrix (catalogue + per-employee levels)

- A **skill category** (group): e.g. Technical, Language, Soft Skills. `name`, `sortOrder`.
- A **skill type** (a named skill): `name`, optional `description`, belongs to a category, carries an **ordered list of proficiency level labels** (`jsonb`, min 2). The index of a label in this list is its **ordinal**.
- An **employee skill**: employee → skill type, the chosen `proficiencyLevel` label **plus** the cached `proficiencyOrdinal` (denormalized from the type's list at write time, for index-fast search), optional `assessedByUserId`, `assessedAt`, optional note.
- **The matrix view:** rows = employees (scoped), columns = skill types, cells = level. Plus a **"who knows X at level ≥ N"** search that hits a `(skillTypeId, proficiencyOrdinal)` index.
- **Self-service:** an employee can record/propose their own skills (tenant-configurable: self-assessment allowed or HR/manager-assessed only); HR/managers assess reports.

---

## 2. RBAC — one new AC resource

### 2.1 Why a new resource (and not an existing one)

I checked `packages/auth/src/permissions.ts` for a fitting existing resource. `goal`/`appraisal`/`recognition` are Performance-owned; `document` is the file store; there is **no** training/certification/skill resource. Performance's `appraisal`/`goal` model people-*evaluation*, not learning *records*, so reusing them would conflate two domains and pollute Performance's RBAC. **A new `development` resource is correct.**

### 2.2 The resource

Add to `statement` in `permissions.ts`:

```ts
// Development (Phase "Dev"B) — Training + Certifications + Skills matrix.
// HR owns the catalogue/definitions + assesses; employees self-serve their own
// training/certs/skills. `read` = view the catalogue + (handler-scoped) records;
// `manage` = curate programs/cert-types/skill-catalogue + enroll/assess anyone +
// record any employee's cert; `enroll_self` = self-service enroll in an active
// program; `record_self` = self-assess a skill / record own certification (the
// asset:request precedent — self-service gated by an action staff actually hold,
// never sitting behind a manage-only gate).
development: ["read", "manage", "enroll_self", "record_self"],
```

> **Finer-grained on purpose.** A single `[read, manage]` pair would force self-service behind `manage` (the offboarding `documents.markUploaded` dead-branch lesson — a self-service handler must never sit behind a manage-only gate). Splitting out `enroll_self` + `record_self` lets an employee enroll/self-assess **without** holding the curation grant. This mirrors the `asset:request` and `ticket:create` precedents.

### 2.3 Grants per role

| Role | development grant | Meaning |
|---|---|---|
| `tenant_owner` / `tenant_admin` | `read, manage, enroll_self, record_self` | full |
| `hr_admin` | `read, manage, enroll_self, record_self` | full (curate + assess) |
| `manager` | `read, enroll_self, record_self` | view team (scoped) + self-serve; **may enroll/assess reports** is handled by the handler treating manager `manage`-like actions on their own reports — see note below |
| `employee` | `read, enroll_self, record_self` | view catalogue + own records; self-enroll; self-assess (if tenant allows) |
| `auditor` | `read` | read-only oversight |
| `payroll_admin` | `read` | read-only (training/cert can affect allowances downstream — read context) |
| `recruiter` | `read` | read-only (candidate→hire skill context; see §9) |
| `helpdesk_agent` / `project_manager` / `sales_admin` / `sales_rep` | *(none)* | no entry |

> **Manager assessing reports.** Two clean options — pick one in the B phase and document it:
> **(A)** give `manager` the `manage` action too, and the handler narrows manager `manage` to *direct reports only* (mirrors helpdesk `canApproveHelpdeskRequest` manager scope); or
> **(B)** keep manager at `read + self`, and a manager assesses reports via the same `record_self`-style self/scope path. **Recommendation: (A)** — managers genuinely curate their team's skills/training, and the direct-report narrowing is already a proven server pattern (`getDirectReportIds`). If (A), manager grant becomes `read, manage, enroll_self, record_self` and the handler enforces report-scope on every `manage` write.

### 2.4 RBAC helpers (byte-aligned both files)

Add to **both** `packages/api/src/utils/role-helpers.ts` and `apps/web/src/lib/rbac.ts` (keep byte-identical — lesson #88: align to the **actual AC grant**, not prose):

```ts
// Development (Phase Dev) — Training + Certifications + Skills.
export function canManageDevelopment(role: MemberRole): boolean {
  return canManageHR(role) || role === "manager"; // (A) — manager scoped server-side
}
export function canViewDevelopment(role: MemberRole): boolean {
  return (
    canManageDevelopment(role) ||
    role === "auditor" ||
    role === "payroll_admin" ||
    role === "recruiter" ||
    role === "employee"
  );
}
// Self-service: any participating staff enroll themselves / record own cert+skill.
export function canEnrollSelf(role: MemberRole): boolean {
  return canManageHR(role) || role === "manager" || role === "employee";
}
export function canRecordOwnSkill(role: MemberRole): boolean {
  return canEnrollSelf(role);
}
// Whether a viewer sees ALL employees (HR/auditor/payroll) or is scoped to own +
// direct reports (manager) / themselves (employee). Recruiter sees catalogue +
// aggregate skill availability, NOT individual employee records (see §9).
export function seesAllDevelopment(role: MemberRole): boolean {
  return canManageHR(role) || role === "auditor" || role === "payroll_admin";
}
```

> Final helper set must be reconciled against the chosen manager option (A/B) in the B phase, then verified by `bun run audit:permissions`.

---

## 3. Drizzle schema (`packages/db/src/schema/development.ts`)

All tables `orgRef()`-scoped, `cuid()` PK, `...timestamps`, soft-archive (`deletedAt` / `isArchived`) where appropriate — following `performance.ts` exactly. Imports: `user` from `./auth`; `cuid, employeeProfile, orgRef, timestamps` from `./hr-core`. Optional soft links: `applicant` from `./recruitment` (read-only seam, SET NULL) — see §9.

### 3.1 Enums

```ts
export const trainingProgramStatusEnum = pgEnum("training_program_status", [
  "draft", "active", "archived",
]);

export const trainingDeliveryEnum = pgEnum("training_delivery", [
  "internal", "external", "online", "in_person", "blended",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "enrolled", "in_progress", "completed", "failed", "withdrawn",
]);

export const certificationStatusEnum = pgEnum("certification_status", [
  "active", "revoked", "superseded",
  // NOTE: "expired" is NOT a value here — expiry is DERIVED at read time.
]);

export const skillAssessmentSourceEnum = pgEnum("skill_assessment_source", [
  "self", "manager", "hr", "import",
]);
```

> Derived-at-read certification expiry buckets are a **const tuple** (like `OBJECTIVE_HEALTH_STATES`), not an enum/column:
> ```ts
> export const CERT_EXPIRY_STATES = ["no_expiry", "valid", "expiring_soon", "expired"] as const;
> export type CertExpiryState = (typeof CERT_EXPIRY_STATES)[number];
> ```

### 3.2 Tables

**`training_program`** — the course definition.
| column | type | notes |
|---|---|---|
| `id` | `cuid()` | PK |
| `organizationId` | `orgRef()` | tenant scope |
| `reference` | `text` notNull | `TRN-000001`; `(org, reference)` partial-unique where not deleted |
| `name` | `text` notNull | |
| `description` | `text` | |
| `categoryId` | `text` → `training_category.id` SET NULL | optional |
| `delivery` | `trainingDeliveryEnum` default `internal` | |
| `durationHours` | `numeric(7,2)` | |
| `passingScorePercent` | `integer` | nullable (not all programs are scored) |
| `maxAttempts` | `integer` default `1` notNull | bounds `enrollment.attemptsUsed` |
| `allowSelfEnroll` | `boolean` default `true` notNull | tenant/program toggle for `enroll_self` |
| `status` | `trainingProgramStatusEnum` default `draft` | |
| `isArchived` | `boolean` default false | |
| `...timestamps`, `deletedAt` | | |

Indexes: `(org)`, `(org, status)`, partial-unique `(org, reference)`.

**`training_category`** — optional grouping for programs. `id`, `organizationId`, `name`, `sortOrder int`, `...timestamps`, `deletedAt`. Partial-unique `(org, name)`.

**`training_module`** *(optional, can defer to a later sub-phase)* — ordered lessons inside a program. `id`, `organizationId`, `programId` → `training_program.id` ON DELETE CASCADE, `title`, `content text`, `displayOrder int default 0`, `...timestamps`. Index `(programId)`.

**`training_enrollment`** — the employee↔program record (the heart of training).
| column | type | notes |
|---|---|---|
| `id` | `cuid()` | PK |
| `organizationId` | `orgRef()` | |
| `programId` | `text` → `training_program.id` ON DELETE RESTRICT | preserve history |
| `employeeId` | `text` → `employeeProfile.id` ON DELETE RESTRICT | |
| `status` | `enrollmentStatusEnum` default `enrolled` notNull | lifecycle |
| `enrolledByUserId` | `text` → `user.id` SET NULL | who enrolled (self vs HR/manager) |
| `scorePercent` | `integer` | nullable until completion |
| `attemptsUsed` | `integer` default `0` notNull | ≤ program.maxAttempts (server-enforced) |
| `startedAt` / `completedAt` | `timestamp` | |
| `note` | `text` | |
| `...timestamps` | | |

Indexes: `(org)`, `(org, employeeId)`, `(org, programId)`, `(programId)`. Unique `(programId, employeeId)` **only if** re-enrollment is disallowed — **recommend NOT unique** (allow re-enrollment after `withdrawn`/`failed`); enforce "one active enrollment per (program, employee)" in the handler instead, so history is preserved.

**`certification_type`** — the credential definition.
| column | type | notes |
|---|---|---|
| `id` `cuid()`, `organizationId` `orgRef()` | | |
| `name` `text` notNull | | |
| `issuingBody` `text` | | |
| `requiresRenewal` `boolean` default true notNull | | |
| `defaultValidityMonths` `integer` | nullable; used to suggest `expiryDate` on issue | |
| `reminderThresholdDays` `jsonb` | nullable; per-type override of the tenant default `[90,60,30,7]` | |
| `isArchived` `boolean`, `...timestamps`, `deletedAt` | | |

Partial-unique `(org, name)`.

**`employee_certification`** — a held credential.
| column | type | notes |
|---|---|---|
| `id` `cuid()`, `organizationId` `orgRef()` | | |
| `certificationTypeId` `text` → `certification_type.id` ON DELETE RESTRICT | | |
| `employeeId` `text` → `employeeProfile.id` ON DELETE RESTRICT | | |
| `credentialId` `text` | the cert's external number | |
| `issueDate` `date({mode:"date"})` | | |
| `expiryDate` `date({mode:"date"})` | **nullable** (non-expiring). Expiry state DERIVED from this. | |
| `documentId` `text` | **soft ref** to a Documents row (NO FK — module may be off); tenant-verified on write | |
| `status` `certificationStatusEnum` default `active` notNull | NOT a place for "expired" | |
| `recordedByUserId` `text` → `user.id` SET NULL | | |
| `note` `text`, `...timestamps`, `deletedAt` | | |

Indexes: `(org)`, `(org, employeeId)`, `(org, expiryDate)` (drives the expiry scan), `(certificationTypeId)`.

**`skill_category`** — `id`, `organizationId`, `name`, `sortOrder int default 0`, `...timestamps`, `deletedAt`. Partial-unique `(org, name)`.

**`skill_type`** — a named skill with its ordered ladder.
| column | type | notes |
|---|---|---|
| `id` `cuid()`, `organizationId` `orgRef()` | | |
| `categoryId` `text` → `skill_category.id` ON DELETE RESTRICT | | |
| `name` `text` notNull | | |
| `description` `text` | | |
| `proficiencyLevels` `jsonb` notNull | **ordered** `string[]`, min 2. Index in array = ordinal. | |
| `isArchived` `boolean`, `...timestamps`, `deletedAt` | | |

Partial-unique `(org, name)`.

**`employee_skill`** — per-employee level.
| column | type | notes |
|---|---|---|
| `id` `cuid()`, `organizationId` `orgRef()` | | |
| `skillTypeId` `text` → `skill_type.id` ON DELETE RESTRICT | | |
| `employeeId` `text` → `employeeProfile.id` ON DELETE RESTRICT | | |
| `proficiencyLevel` `text` notNull | the chosen label | |
| `proficiencyOrdinal` `integer` notNull | denormalized from the type's list at write; the search key | |
| `source` `skillAssessmentSourceEnum` default `self` notNull | self/manager/hr/import |
| `assessedByUserId` `text` → `user.id` SET NULL | | |
| `assessedAt` `timestamp` | | |
| `note` `text`, `...timestamps` | | |
| *(optional read-only seam)* `linkedApplicantId` `text` → `applicant.id` SET NULL | recruitment provenance, read-only — see §9 | |

Indexes: `(org)`, `(org, employeeId)`, **`(skillTypeId, proficiencyOrdinal)`** ← the "who knows X at level ≥ N" index. Unique `(employeeId, skillTypeId)` where not deleted (one current level per skill; history via audit_event, not duplicate rows).

### 3.3 Relations

Intra-module only (Drizzle `relations`), mirroring `performance.ts`: program→category/modules/enrollments; enrollment→program/employee; certificationType→certifications; employeeCertification→type/employee; skillCategory→skillTypes; skillType→category/employeeSkills; employeeSkill→skillType/employee. Cross-module links stay plain FKs / soft refs (no relation).

### 3.4 Wire-up

Add `export * from "./development";` to the schema barrel and register tables in the Drizzle config so migration `0028` is generated. Migration must be **purely additive** (new tables + enums; no alters to existing tables).

---

## 4. oRPC router (`packages/api/src/routers/development.ts`)

Pattern: copy the **Performance** router skeleton (`authorizedProcedure`, `orgId/actorId/role` helpers, `employeeNameMap`, `seesAll*` + `coveredEmployeeIds` scope, per-id `verify*` tenant-checks, `createAuditEvent`, `MAX_REFERENCE_ATTEMPTS`, `LIST_LIMIT`). **Two-layer authz on every proc:** the AC gate (`development:read|manage|enroll_self|record_self`) **plus** a handler-level scope/IDOR check.

> **CENTRAL GUARDRAIL:** every `db.insert/update/delete` targets a `*development table* + audit_event` only — **zero** writes to `employee*`, `performance*`, `recruitment*`, `document`, `payroll*`. `documentId` and `linkedApplicantId` are tenant-verified SELECT-only and resolved read-only; never written to the foreign table.

### 4.1 Training

| proc | gate | purpose / key rules |
|---|---|---|
| `programs.list` | read | catalogue; filter status/category; `LIST_LIMIT` |
| `programs.getById` | read | one program (+ modules) |
| `programs.create` | manage | mints `TRN-` reference (max+1 retry, `MAX_REFERENCE_ATTEMPTS`) |
| `programs.update` | manage | edit; status transitions |
| `programs.archive` | manage | soft-archive (status→archived / isArchived) |
| `programs.modules.{add,update,remove}` | manage | optional, if `training_module` shipped |
| `enrollments.list` | read | **scoped**: HR/auditor/payroll all; manager own+reports; employee self |
| `enrollments.listMine` | read (self) | employee's own enrollments (explicit self-scope, like projects `listMine`) |
| `enrollments.enroll` | manage | HR/manager enroll an employee (manager → reports only); blocks dup *active* enrollment; program must be `active` |
| `enrollments.enrollSelf` | enroll_self | caller enrolls **themselves**; only if `program.allowSelfEnroll && status==active`; server forces `employeeId = caller`, `enrolledByUserId = caller` |
| `enrollments.updateProgress` | manage **or** self (own only) | set `in_progress`, bump `attemptsUsed` (≤ maxAttempts, else 409), record `scorePercent` |
| `enrollments.complete` | manage **or** self (own only) | sets `completedAt`; **derives pass/fail server-side**: if `passingScorePercent` set and `scorePercent < it` → `failed`, else `completed`; enforces `attemptsUsed ≤ maxAttempts` |
| `enrollments.withdraw` | manage **or** self (own only) | → `withdrawn` |

### 4.2 Certifications

| proc | gate | purpose / key rules |
|---|---|---|
| `certifications.types.list` | read | definitions |
| `certifications.types.{create,update,archive}` | manage | curate types |
| `certifications.list` | read | **scoped**; each row carries the **derived** `expiryState` + `daysUntilExpiry` + `thresholdBucket` (computed at read, NOT stored) |
| `certifications.listMine` | read (self) | own credentials |
| `certifications.record` | manage | HR records an employee's cert (manager → reports); suggests `expiryDate` from `type.defaultValidityMonths` if omitted; tenant-verifies `documentId` |
| `certifications.recordSelf` | record_self | employee records **own** cert (forces `employeeId = caller`) |
| `certifications.update` | manage **or** self (own only) | edit dates/credentialId/status |
| `certifications.revoke` | manage | status → revoked |
| `certifications.scanExpiring` | read | returns counts + items per threshold bucket (90/60/30/7) over the **scoped** set; **derived**, idempotent, no writes. **Optional** `emit:true` (manage-gated) fans the bucket into the existing notifications inbox via `createNotifications` — never a new table |

> **Expiry derivation lives in one pure helper** (`utils/cert-expiry.ts`, db-free, unit-tested): `deriveCertExpiry(expiryDate, now, thresholds) → { state, daysUntilExpiry, bucket }`. Reused by `list`, `listMine`, `scanExpiring` so the badge and the scan never disagree.

### 4.3 Skills

| proc | gate | purpose / key rules |
|---|---|---|
| `skills.categories.{list,create,update,archive}` | read / manage | catalogue groups |
| `skills.types.list` | read | skill definitions (with `proficiencyLevels`) |
| `skills.types.{create,update,archive}` | manage | min 2 levels; on level-list edit, **do not** silently break existing ordinals (warn / recompute — see open Q) |
| `skills.employee.list` | read | **scoped** matrix rows; HR/auditor all, manager own+reports, employee self |
| `skills.employee.listMine` | read (self) | own skills |
| `skills.employee.assess` | manage | HR/manager assess an employee (manager → reports); computes `proficiencyOrdinal` from the type's list; `source=manager|hr` |
| `skills.employee.assessSelf` | record_self | caller self-assesses (forces `employeeId=caller`, `source=self`) — only if tenant allows self-assessment |
| `skills.employee.remove` | manage **or** self (own) | drop a skill |
| `skills.employee.search` | read | **"who knows X at level ≥ N"** — input `{ skillTypeId, minProficiencyOrdinal }`; hits the `(skillTypeId, proficiencyOrdinal)` index; result set is **scoped** (HR/auditor all employees; manager own+reports; employee→self only; **recruiter → aggregate count only, no individual names**, see §9) |

### 4.4 Activity / audit

No `development_activity` table — the Activity surface reads the shared `audit_event` log (Projects 14H / Performance 15C precedent). Every mutating proc calls `createAuditEvent` with the development entity type.

### 4.5 Redaction

No private-notes field in MVP (no privacy surface like 1-on-1 private notes). The **only** redaction is **scope-based** (an employee/manager simply never receives rows outside their scope — enforced server-side, not UI). `documentId` resolution must respect the Documents module's own visibility (resolve read-only; if the caller can't see the doc, return the id/name only, not contents).

---

## 5. UI routes (`apps/web/src/routes/app/development/*`)

Conventions: copy the **Performance** feature folder shape — `features/development/{labels,badge,types,development-tabs}.tsx` + `styles/development.css` (prefix `dv-`, `:focus-visible` rings — lesson #86), shared `StatTile`/`StatTileGrid`, `DataTable`, `EmptyState`, `PageHeader`. Sidebar entry **"Development"** (icon `GraduationCap`, **Operate** group), visible to HR/manager/employee/auditor/payroll/recruiter per `canViewDevelopment`; hidden from helpdesk/PM/sales. Badges carry **text**, never colour-only. No raw ids/enums as labels. Honest loading/empty/**error** states (lesson 13H — error ≠ healthy empty desk).

| route | screen | who |
|---|---|---|
| `/app/development/` | **Overview** — StatTiles (active programs · enrollments in progress · **certs expiring ≤90d** · skills assessed) + "Needs attention" (expiring/expired certs, failed enrollments, unassessed reports) + quick-links. Employee → a *landing that LINKS to* the self tabs (NOT a render-time redirect — lesson #84) | scoped |
| `/app/development/training` | **Training catalogue** — program list/filter; New program (manage); enroll/assign (manage) | view all/scoped |
| `/app/development/training/$id` | **Program detail** — summary + modules + enrolled-employees table (scoped) + enroll button | scoped |
| `/app/development/my-training` | **My training** (self-service) — own enrollments + "Browse & enroll" (self-enroll in active programs) + progress/score/attempts | employee+ |
| `/app/development/certifications` | **Certifications** — held creds table with **derived expiry badges** (Valid/Expiring 90·60·30·7/Expired) + "Expiring soon" panel; cert-types admin (manage); Record cert (manage) | view all/scoped |
| `/app/development/my-certifications` | **My certifications** (self-service) — own creds + Record own cert + expiry badges | employee+ |
| `/app/development/skills` | **Skills matrix** — category/type catalogue (manage) + employee×skill grid (scoped) + **"who knows X at level ≥ N"** search + Assess (manage) | view all/scoped |
| `/app/development/my-skills` | **My skills** (self-service) — own skills + Self-assess (if tenant allows) | employee+ |

**Tabs** (`DevelopmentTabs`): Overview / Training / Certifications / Skills for `canViewDevelopment`; **My training / My certifications / My skills** for self-service roles. A pure employee sees **only** the "My …" tabs (mirrors Performance: employee sees only My-goals/My-reviews/etc).

**Self-service vs HR management.** Catalogue/admin actions (create program, cert-type, skill-type, assess anyone, record anyone's cert) are gated `canManageDevelopment` and server-re-checked + report-scoped for managers. Self tabs are gated `canEnrollSelf`/`canRecordOwnSkill`. Auditor sees the management surface fully **read-only** (no New/Edit/Assess/Record affordances).

### Fumadocs (Documentation Rule — standing override)

A feature is not complete until docs are updated. The QA phase must add `apps/docs` pages under a **Development / Learning & Growth** section: what it does · roles (Admin/HR/Manager/Employee/Auditor tabs) · training enroll/complete workflow · certification expiry meanings (derived, with the 90/60/30/7 badges) · skills matrix + search · self-service vs management · tenant config (self-enroll, self-assess, reminder thresholds, proficiency ladders) · `Requires Setup` (skill categories/levels) · migration notes. Tag with `HR` `Employee` `Manager` `Auditor` `Tenant Configurable` `Self-Service` `Requires Setup`.

---

## 6. Build sequence

- **Dev-B — Schema + migration `0028` + seed.** `schema/development.ts` (tables/enums/relations) → generate migration `0028` (purely additive, applied to dev + verified on ephemeral Postgres) → `development:[read,manage,enroll_self,record_self]` AC resource + grants in `permissions.ts` → byte-aligned RBAC helpers (both files) → idempotent seed (sample categories/levels, 2-3 programs, a few enrollments across statuses, cert types + held creds spanning valid/expiring/expired/no-expiry, a small skills matrix). `verify-development-db.ts` proving constraint catalog + the `(skillTypeId, proficiencyOrdinal)` index + derived-not-stored expiry (no expiry-flag column). Gates: `check-types`, `build`, `audit:permissions` (expect rise), DB-verify.
- **Dev-C — API.** `routers/development.ts` (all §4 procs) + `utils/cert-expiry.ts` pure helper (unit-tested) + register in `index.ts`. Two-layer authz, scope/IDOR, guardrail (grep-prove zero foreign writes), tenant-verified soft refs. `verify-development-api.ts` (admin full; employee self-scope; manager report-scope vs non-report FORBIDDEN; auditor read-only; recruiter aggregate-only search; self-enroll only on allow-self-enroll active program; complete derives pass/fail; attempts cap 409; expiry derivation matches helper). Restart `apps/server` (lesson #76 — `--hot` doesn't cross `packages/api`). audit rises.
- **Dev-D — Overview + Training UI** (catalogue, program detail, my-training).
- **Dev-E — Certifications UI** (held creds + derived expiry badges + types admin + my-certifications + scanExpiring panel).
- **Dev-F — Skills UI** (matrix grid + catalogue admin + search + my-skills). Optional notifications emission wired here.
- **Dev-I — QA / RBAC / security / a11y + Fumadocs.** Parallel read-only review agents (security/RBAC/IDOR/cross-module guardrail + UI/a11y/copy/data). Browser-verify all roles with screenshots. Prove: scope IDOR, zero foreign writes, derived expiry never stored, self-service never behind manage-gate, recruiter no individual-record leak. Update Fumadocs. Gates all green.

---

## 7. Cross-module seams (read-only, NOT duplication)

1. **Performance (goals).** A Performance objective/key-result may *reference* "complete training X" or "reach skill level Y". Development holds the actual record; Performance reads it. The seam is **one-directional and read-only**: Performance may add a soft/FK link **from** a key result **to** a Development record in a *future* Performance phase (it already has the `linkedProjectTaskId` precedent). Development does **not** write Performance. No data is duplicated — Performance shows progress *by reading* the enrollment/skill row.
2. **Recruitment (candidate skills).** A candidate's assessed skills (Recruitment) are the *intent* behind a new hire's initial skills. The optional `employee_skill.linkedApplicantId` soft FK (SET NULL) records that provenance **read-only** when HR seeds a new hire's skills from their applicant record. Development never mutates Recruitment; the recruiter role gets **read** + **aggregate** skills search (count of who-knows-X, no individual employee names) so they can answer "do we already have this skill in-house?" without breaching employee record privacy.
3. **Documents.** `employee_certification.documentId` is a **soft ref** (no FK; module may be off-tenant) to a stored certificate file — tenant-verified on write, resolved read-only on read, subject to the Documents module's own visibility.
4. **Notifications.** Cert-expiry reminders **reuse** the existing per-user inbox via `createNotifications` — no new delivery table.
5. **Payroll / Finance.** Out of scope. If a tenant later pays a certification allowance, that is a Finance/Payroll *read* of the certification ledger (the recognition-points→bonus precedent) — Development never writes pay.

---

## 8. Verification checklist (per the SaaS Verification Rule)

- Tenant isolation on every proc (org filter + AC gate).
- RBAC alignment (`audit:permissions`), byte-aligned helpers.
- Manager scope = own + direct reports (IDOR-proven both ways).
- Employee self-scope (own records only; self-enroll/self-assess forced to caller).
- Auditor read-only (no affordances, no writes).
- Recruiter → catalogue + aggregate skill counts, **no** individual employee records.
- No cross-module mutation (grep-proven: writes only to `*development* + audit_event`).
- Derived expiry: **no** stored expiry-flag column; badge == scan == helper.
- Self-service never behind a manage-only gate.
- No production write during seed dry-runs; idempotent seed.
- Quality gates: `check-types` 3/3, `build` 3/3, `audit:permissions` (new baseline), `check` (≤ lint baseline), DB-verify + API-verify green, docs build.

---

## 9. Open questions (with recommendations)

1. **Manager `manage` vs read-only?** → **Recommend (A):** grant manager `manage` and narrow to direct reports in the handler. Managers genuinely curate team training/skills; the report-scope pattern is proven (`getDirectReportIds`).
2. **Self-assessment on/off?** Some tenants want HR-only skill assessment. → **Recommend** a tenant setting `allowSkillSelfAssessment` (default **true**); `assessSelf` checks it; a self-assessed skill is flagged `source=self` so the matrix can visually distinguish self vs validated.
3. **Re-enrollment uniqueness?** → **Recommend NOT** a DB unique on `(programId, employeeId)`; allow re-enroll after withdrawn/failed (preserves attempt history); handler blocks a *second active* enrollment.
4. **Editing a skill type's proficiency ladder after employees are assessed.** Reordering/removing a level would invalidate cached ordinals. → **Recommend:** on level-list edit, **recompute** affected `employee_skill.proficiencyOrdinal` in the same transaction by matching the stored `proficiencyLevel` label; if a held label was *deleted*, block the edit (409) with a clear message. Never silently drift ordinals.
5. **Reminder cadence config home.** Per-type override (`certification_type.reminderThresholdDays`) **and** a tenant default. → **Recommend** a tenant setting `certReminderThresholdDays` default `[90,60,30,7]`, overridable per cert type. The derived state always uses the resolved (type-or-tenant) list.
6. **Proactive reminder emission — read-derived only, or scheduled job?** → **Recommend** MVP = read-derived (`scanExpiring` + badges); the optional manage-gated `emit:true` fan-out is the bridge; a scheduled job that emits daily is a documented fast-follow (reuses the same helper, no new table).
7. **Training modules in MVP?** → **Recommend** ship the `training_module` table but keep the UI minimal (list/add); a program with zero modules is still enrollable. Full LMS content (quizzes, SCORM) is explicitly out of scope.
8. **External/online training catalogue (third-party providers).** → **Recommend** `trainingDeliveryEnum` covers internal/external/online; a `provider` text field on the program is enough for MVP. No third-party LMS integration in this phase.

---

## 10. Audit question (Documentation Rule)

**"Did this change require Fumadocs documentation updates?"** — **Yes.** This is a spec ("A") phase, so no UI shipped yet; the **Dev-I** QA phase must add the Development section to `apps/docs` before the module is marked complete. This plan records that requirement.
