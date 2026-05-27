# Payroll Database Setup (Phase 8B)

## Tables Created

12 new payroll tables added (total: 45 tables in schema):

| Table | Purpose | Rows (seed) |
|-------|---------|-------------|
| `country_payroll_profile` | Per-org, per-country statutory rules (PAYE, NIS, allowances) | 1 |
| `payroll_setting` | Per-org payroll configuration (OT multipliers, work schedule) | 1 |
| `pay_period` | Payroll period boundaries (monthly, weekly, etc.) | 2 |
| `pay_item` | Configurable allowance/deduction rules | 8 |
| `pay_item_assignment` | Employee/department targeting for pay items | 6 |
| `payroll_run` | Batch payroll generation events | 0 |
| `payslip` | Individual employee payslips | 0 |
| `payslip_line_item` | Normalized line items per payslip | 0 |
| `payroll_issue` | Blockers/warnings per employee per run | 0 |
| `loan` | Employee loans and salary advances | 2 |
| `loan_installment` | Individual loan installment schedule | 13 |
| `reimbursement` | Expense claims and reimbursement requests | 3 |

10 pgEnum types created: `payroll_run_status`, `payslip_status`, `pay_item_type`, `payslip_line_type`, `loan_type`, `loan_status`, `loan_installment_status`, `reimbursement_type`, `reimbursement_status`, `payroll_issue_type`, `payroll_issue_status`, `pay_period_status`.

## Migration

| Migration | Description |
|-----------|-------------|
| `0005_mysterious_abomination.sql` | Payroll tables — 12 tables, 10 enums, indexes, constraints |
| `0006_mean_shen.sql` | Add UNIQUE constraint on `payroll_setting.organization_id` |

## Commands

```bash
# Generate migration (from packages/db/)
export $(grep -v '^#' ../../apps/server/.env | xargs)
bunx drizzle-kit generate

# Apply migration
bunx drizzle-kit migrate

# Run seed (from project root)
export $(grep -v '^#' apps/server/.env | xargs)
bun run scripts/seed-payroll.ts
```

## Seed Data Summary

| Entity | Count | Details |
|--------|-------|---------|
| Country profile | 1 | Guyana 2026 — PAYE 25%/35%, NIS 5.6%/8.4%, $280K ceiling |
| Payroll setting | 1 | Mon–Fri, 8h/day, 60min lunch, GY OT rates |
| Pay periods | 2 | April 2026 (closed), May 2026 (open) |
| Pay items | 8 | 3 statutory (PAYE, NIS employee, NIS employer), 3 standard (transport, meal, OT), 2 custom (insurance, credit union) |
| Assignments | 6 | Health insurance → 4 employees, credit union → 2 employees |
| Loans | 1 | $100K emergency loan, 12 installments, 1 paid |
| Salary advances | 1 | $50K advance, single installment pending |
| Loan installments | 13 | 12 for loan (1 deducted, 11 pending) + 1 for advance |
| Reimbursements | 3 | 1 approved, 1 requested, 1 paid |

## Notes

- `payroll_run`, `payslip`, `payslip_line_item`, and `payroll_issue` are intentionally empty — these will be populated by the payroll engine (Phase 8C) and API (Phase 8D).
- `payroll_setting` has a DB-level UNIQUE constraint on `organization_id` (`payroll_setting_org_uq`) — one setting row per tenant, enforced at the database level.
- All money fields use `numeric(12,2)` for exact decimal arithmetic.
- The `payslip_line_item` table is normalized (not JSON) for queryability and reporting.
- `pay_item_assignment` supports both employee-level and department-level targeting.
