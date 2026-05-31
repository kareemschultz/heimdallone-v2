# Offboarding DB Setup — Phase 10B

**Migration:** `0010_tricky_jimmy_woo.sql`
**Schema file:** `packages/db/src/schema/offboarding.ts`
**Seed script:** `scripts/seed-offboarding.ts`

---

## Tables Created (9)

| Table | Description | Rows in seed |
|-------|-------------|-------------|
| `offboarding_template` | Reusable clearance task lists | 3 |
| `offboarding_template_task` | Task definitions per template | 23 |
| `offboarding_case` | Master record per exit event | 4 |
| `offboarding_task` | Snapshotted task instance per case | 23 |
| `offboarding_asset_return` | Equipment return tracking | 5 |
| `offboarding_access_revocation` | System access removal tracking | 8 |
| `offboarding_document_request` | Clearance document collection | 6 |
| `offboarding_exit_interview` | Optional exit interview per case | 2 |
| `offboarding_activity` | Immutable audit trail per case | 12 |

---

## Enums Created (7)

| Enum | Values |
|------|--------|
| `offboarding_case_status` | `pending_approval`, `approved`, `active`, `in_clearance`, `pending_settlement`, `closed`, `rejected`, `withdrawn`, `cancelled` |
| `offboarding_exit_type` | `resignation`, `termination`, `retirement`, `contract_end`, `involuntary` |
| `offboarding_category` | `clearance`, `asset_return`, `access_revocation`, `document`, `handoff`, `exit_interview`, `other` |
| `offboarding_task_status` | `todo`, `in_progress`, `done`, `skipped`, `blocked` |
| `offboarding_asset_status` | `pending`, `returned`, `waived` |
| `offboarding_access_status` | `pending`, `revoked`, `waived` |
| `offboarding_document_status` | `requested`, `uploaded`, `approved`, `waived` |

---

## Key Constraints

- **One active case per employee:** Partial unique index `ob_case_employee_active_uq` on `(organizationId, employeeId)` where `status NOT IN ('closed','cancelled','rejected','withdrawn') AND deletedAt IS NULL`. Historical closed cases are not constrained.
- **One exit interview per case:** Partial unique index `ob_exit_interview_case_uq` on `(caseId)` where `deletedAt IS NULL`.
- **One template name per org:** Partial unique index on `(organizationId, name)` where `deletedAt IS NULL`.

---

## `dueOffsetDays` Convention

Template task `dueOffsetDays` is relative to `lastWorkingDay`:
- Negative = days **before** LWD (e.g. `-5` = 5 days before last day)
- Zero = **on** LWD (same day as exit)
- Positive = days **after** LWD (e.g. `+3` = 3 days after for HR wrap-up)

Computing absolute due date: `dueAt = lastWorkingDay + dueOffsetDays`

---

## `employeeProfile.isActive` Rule

**Not changed by schema or seed.** The `isActive = false` flag is set only by the API `offboarding.cases.close` procedure (Phase 10C). Seeded cases in `closed` status do NOT flip `isActive` — that would require the full API layer.

---

## Seed Data (Atlas Shipping)

Requires: `seed-dev.ts` + `seed-hr-core.ts` run first.

### Templates

| Name | Exit Type | Tasks |
|------|-----------|-------|
| Standard resignation offboarding | resignation | 10 |
| Involuntary termination offboarding | involuntary | 6 |
| Contract end offboarding | contract_end | 7 |

### Cases

| # | Exit Type | Status | Notes |
|---|-----------|--------|-------|
| 1 | resignation | `pending_approval` | Submitted 3 days ago; LWD ~25 days out |
| 2 | termination | `in_clearance` | Redundancy; LWD in 3 days; some tasks done |
| 3 | contract_end | `pending_settlement` | LWD was 2 days ago; exit interview recorded |
| 4 | resignation | `closed` | Historical — ~60 days ago; fully complete |

### Supporting rows per case

| Case | Tasks | Assets | Access | Docs | Interview | Activities |
|------|-------|--------|--------|------|-----------|-----------|
| 1 (pending) | 0 | 0 | 0 | 0 | — | 1 |
| 2 (clearance) | 6 | 2 | 3 | 2 | — | 3 |
| 3 (settlement) | 7 | 1 | 2 | 2 | ✓ | 4 |
| 4 (closed) | 10 | 2 | 3 | 2 | ✓ | 4 |

---

## Run Commands

```bash
# Generate migration (already done)
bun run --cwd packages/db db:generate

# Apply migration
bun run --cwd packages/db db:migrate

# Seed Atlas Shipping offboarding data
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-offboarding.ts
```

---

## Deviations from Phase 10A Spec

None. All 9 entities and 7 enums from the spec are implemented as specified.

- `contractId` is a nullable `text` column (no FK enforced) since the contracts schema is in a separate file and a text reference is sufficient for Phase 10C API use.
- `assetId` is a nullable `text` column reserved for Phase 12 FK wiring.
- Activity table has no `updatedAt`/`deletedAt` — rows are append-only (per spec §3.9).
