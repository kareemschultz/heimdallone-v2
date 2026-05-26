# Payroll Engine Plan

Multi-country payroll is a core Heimdallone differentiator. The engine is country-profile-driven: each country's rules are isolated in a profile that plugs into the shared calculation pipeline.

Do not implement real statutory calculations until this plan has been reviewed and approved. The schema and pipeline structure can be built first with placeholder country profiles.

---

## Design Principle

The payroll engine is not a single monolithic calculator. It is a pipeline that delegates country-specific tax and statutory logic to country profiles. Country profiles are data-driven (database rows + optional TypeScript modules) — not hardcoded conditionals in the core engine.

```
Contract → Pay Period → Pay Run → [Country Profile] → Calculate → Review → Approve → Payslip → Export
```

---

## Entity Roles in the Pipeline

| Entity | Role |
|---|---|
| `contracts` | Defines an employee's salary, currency, pay period type, and linked country |
| `payroll_country_profiles` | Country-specific rule set: statutory rates, tax year, contribution caps |
| `payroll_tax_brackets` | Progressive income tax brackets for a country profile |
| `payroll_periods` | Named time period for a pay run (monthly Jan 2025, etc.) |
| `payroll_runs` | Batch computation record for a period + country combination |
| `payroll_payslips` | Individual computed payslip per employee in a run |
| `payroll_allowances` | Allowance definitions (taxable/non-taxable, fixed/percentage) |
| `payroll_deductions` | Deduction definitions (statutory/voluntary, pre-tax/post-tax) |

---

## Core Calculation Pipeline

Each step in the pipeline is a pure function. Steps are composable and independently testable.

```
Step 1: Gross Pay Calculation
  ├── Basic salary from contract
  ├── + Fixed allowances (recurring)
  ├── + Variable allowances (from input: overtime pay, commission)
  └── = Gross Pay

Step 2: Pre-Tax Deductions
  ├── Employee statutory contributions (NIS, NHT, etc. — country profile)
  ├── + Voluntary pre-tax deductions (pension, health insurance employee portion)
  └── = Taxable Income (Gross Pay − Pre-Tax Deductions)

Step 3: Income Tax Calculation
  ├── Apply country-specific allowances / personal allowances
  ├── Apply progressive tax brackets from payroll_tax_brackets
  ├── Apply filing status adjustments (if applicable)
  └── = Tax Withheld (PAYE)

Step 4: Post-Tax Deductions
  ├── Loan installment repayments
  ├── + Voluntary post-tax deductions
  └── = Post-Tax Deductions Total

Step 5: Employer Contributions (not deducted from employee — tracked separately)
  ├── Employer NIS contribution
  ├── + Other employer statutory contributions (country profile)
  └── = Total Employer Cost

Step 6: Net Pay
  └── Net Pay = Gross Pay − Pre-Tax Deductions − Tax Withheld − Post-Tax Deductions
```

Each step receives its country profile as input. The core engine does not contain country-specific logic.

---

## Country Profile Structure

A country profile (`payroll_country_profiles`) is a database record extended by an optional TypeScript module for complex country-specific rules.

### Database fields

| Field | Description |
|---|---|
| `id` | UUID |
| `organization_id` | Tenant FK |
| `country_code` | ISO 3166-1 alpha-2 (e.g. `GY`, `TT`, `BB`, `JM`) |
| `tax_year` | Year this profile applies to (e.g. `2025`) |
| `currency_code` | ISO 4217 (e.g. `GYD`, `TTD`, `BBD`, `JMD`) |
| `personal_allowance` | Annual personal allowance before tax applies |
| `statutory_rates` | JSONB — country-specific rates (NIS %, NHT %, Health Surcharge %) |
| `employer_rates` | JSONB — employer contribution rates |
| `contribution_caps` | JSONB — maximum insurable earnings ceilings |
| `active` | Boolean — is this the current profile for this country |

### Tax brackets (`payroll_tax_brackets`)

| Field | Description |
|---|---|
| `country_profile_id` | FK to `payroll_country_profiles.id` |
| `min_income` | Lower bound of bracket (annual, in country currency) |
| `max_income` | Upper bound (null = no ceiling) |
| `rate` | Tax rate as decimal (e.g. `0.28` for 28%) |

---

## Caribbean-First Country Profiles

These are the first four country profiles to implement. Rates listed here are indicative only — verify against current legislation before activating in production.

### Guyana (GY)

| Deduction | Employee Rate | Employer Rate | Notes |
|---|---|---|---|
| NIS (National Insurance Scheme) | ~5.6% | ~8.4% | Applied to insurable earnings up to ceiling |
| PAYE (Income Tax) | Progressive | — | Taxable income after NIS and personal allowance |

Tax structure: flat 28% on income above personal allowance (verify current rate).

### Trinidad & Tobago (TT)

| Deduction | Employee Rate | Employer Rate | Notes |
|---|---|---|---|
| NIS (National Insurance Scheme) | ~3.15% | ~5.85% | On weekly insurable wage |
| Health Surcharge | Fixed amount by income band | — | Weekly deduction by income tier |
| PAYE (Income Tax) | Progressive | — | After NIS, pension, and personal allowance |

Tax structure: tiered rates (verify current brackets).

### Barbados (BB)

| Deduction | Employee Rate | Employer Rate | Notes |
|---|---|---|---|
| NIS (National Insurance Scheme) | ~11.1% | ~11.1% | On insurable earnings |
| PAYE (Income Tax) | Progressive | — | After NIS and allowances |

Tax structure: progressive with personal allowance (verify current rates).

### Jamaica (JM)

| Deduction | Employee Rate | Employer Rate | Notes |
|---|---|---|---|
| NIS (National Insurance Scheme) | ~3% | ~3% | Up to earnings ceiling |
| NHT (National Housing Trust) | 2% | 3% | No ceiling |
| Education Tax | ~2.25% | ~3.5% | After NIS |
| PAYE (Income Tax) | Progressive | — | After statutory deductions and threshold |

Tax structure: personal income tax threshold (statutory exemption amount), then progressive rates above threshold (verify current rates).

---

## Pay Run Lifecycle

```
draft
  ↓ initiate
processing   ← calculation engine runs for each employee in scope
  ↓ complete
review       ← payroll admin reviews computed payslips
  ↓ approve
approved     ← immutable; payslips locked
  ↓ pay
paid         ← payment confirmed; bank file generated
```

Cancelled is a terminal state reachable from `draft`, `processing`, or `review` (not from `approved` or `paid`).

### Pay run scope

A pay run is scoped by:
- `organization_id` (tenant)
- `payroll_period_id` (the pay period)
- Country (via the country profile on employee contracts)

One pay run per country per period per organization. Employees on different country contracts are in different runs.

---

## Payslip Components

Each `payroll_payslips` record links to a set of computed line items stored as JSONB or in a `payroll_payslip_line_items` table (TBD at implementation time):

| Component type | Example |
|---|---|
| `earning` | Basic salary, housing allowance, transport allowance |
| `pre_tax_deduction` | NIS employee, pension employee |
| `tax` | PAYE |
| `post_tax_deduction` | Loan repayment |
| `employer_contribution` | NIS employer, NHT employer |

---

## Implementation Constraints

- Do not hardcode country rates in the TypeScript engine. Always read from `payroll_country_profiles` and `payroll_tax_brackets`.
- Country profile rates are immutable once a payroll run references them (snapshot at run time).
- Calculation functions must be pure: given the same inputs, produce the same output with no side effects.
- All monetary values stored as integers (cents / minor currency unit) to avoid floating-point errors. Display layer handles formatting.
- The calculation engine must be independently testable with mock country profiles and employee inputs.
- Do not ship country profiles with real statutory rates until rates have been verified against current legislation by a qualified advisor.

---

## Export Formats (Planned)

| Format | Use case |
|---|---|
| CSV payslip summary | HR review |
| PDF payslip per employee | Employee copy |
| Bank payment file | NACHA, BACS, local bank formats — format TBD per country |
| Accounting journal export | QuickBooks, Xero, Sage — format TBD per integration |

Export formats are planned for Phase 8 (core) and Phase 9 (multi-country). Do not implement until the pay run pipeline is working end-to-end.
