# @Heimdallone/payroll-engine

Pure TypeScript payroll calculation engine. No database, no HTTP, no side effects.

## Architecture

The engine receives a typed `PayrollInput` and returns a typed `PayrollPreviewResult`. It has **zero runtime dependencies** — no Drizzle, no oRPC, no React, no Hono.

```
PayrollInput → calculatePayroll() → PayrollPreviewResult
                                      ├── lineItems[]
                                      ├── blockers[]
                                      ├── warnings[]
                                      └── explanation[]
```

The oRPC API layer (Phase 8D) will be the adapter that:
1. Loads data from the database
2. Constructs a `PayrollInput`
3. Calls `calculatePayroll()`
4. Persists the `PayrollPreviewResult`

## Country Rules

Country-specific tax/NIS/allowance logic is encapsulated in versioned modules implementing `CountryRules`:

- **Guyana 2026** (`src/countries/guyana-2026.ts`) — PAYE 25%/35%, NIS 5.6%/8.4%, personal allowance, child allowance, OT cap, insurance cap
- **Barbados 2026** — researched, deferred (PIT 12.5%/28.5%, NIS 11%/12.75%, Resilience Fund 0.25%)
- **Trinidad & Tobago 2026** — researched, deferred (PIT 25%/30%, NIS 16.2%, Health Surcharge)

Adding a new country: create `src/countries/{country}-{year}.ts` implementing `CountryRules`, register it in `src/countries/registry.ts`. The UI will need a country dropdown (Phase 8E). If a country/year is not registered, the engine returns a `MISSING_COUNTRY_PROFILE` blocker.

## Guyana 2026 Rules

| Rule | Value |
|------|-------|
| PAYE bracket 1 | 25% up to GYD $280,000/month |
| PAYE bracket 2 | 35% above GYD $280,000/month |
| NIS employee | 5.6% of gross (capped at $280K ceiling) |
| NIS employer | 8.4% of gross (capped at $280K ceiling) |
| Personal allowance | max($140,000, gross/3) |
| Child allowance | $10,000/month per child under 18 |
| OT non-taxable cap | $50,000/month |
| Insurance deduction cap | min(premium, 10% gross, $50,000) |

## Money Handling

All calculations use **integer cents** internally to avoid floating-point errors. Input values are converted via `toCents()` at boundaries, calculations stay in cents, output values remain in cents for the API layer to format.

Rounding: `Math.round()` at each calculation step (banker's rounding not required for GY payroll).

## Input/Output

See `src/types.ts` for the full type definitions. Import from subpaths:

```typescript
import { calculatePayroll } from "@Heimdallone/payroll-engine/calculate";
import { calculateProjectedPay } from "@Heimdallone/payroll-engine/projected-pay";
import type { PayrollInput, PayrollPreviewResult } from "@Heimdallone/payroll-engine/types";
import { toCents, fromCents } from "@Heimdallone/payroll-engine/money";
import { guyana2026 } from "@Heimdallone/payroll-engine/countries/guyana-2026";
```

Key types:
- `PayrollInput` — employee, contract, attendance, leave, pay items, loans, reimbursements, country profile, settings
- `PayrollPreviewResult` — all pay components, line items, blockers, warnings, explanation steps
- `ProjectedPayResult` — estimate with confidence level and disclaimers

## Calculation Order (17 steps)

1. Validate employee + contract → blockers if missing
2–3. (Data loading — done by API layer)
4. Compute base pay (monthly/daily/hourly)
5. Deduct unpaid leave
6. Compute overtime (split taxable/non-taxable)
7–8. Compute allowances (taxable/non-taxable)
9. Compute gross pay
10. Pre-tax deductions + NIS
11. Personal allowance
12. Child allowance
13. Compute taxable gross
14. Compute PAYE
15. Post-tax deductions
16. Loan installments
17. Reimbursements
18. Compute net pay + totals

## Blockers & Warnings

**Blockers** prevent payroll processing: `NO_CONTRACT`, `MISSING_SALARY`, `MISSING_COUNTRY_PROFILE`, `MISSING_FILING_STATUS`, `NEGATIVE_NET_PAY`, `DUPLICATE_PAYSLIP`, `MISSING_CLOCK_OUT`.

**Warnings** flag for review: `PENDING_LEAVE`, `UNVALIDATED_ATTENDANCE`, `LOW_CONFIDENCE`, `LOAN_EXCEEDS_THRESHOLD`.

## Running Tests

```bash
# From package directory
cd packages/payroll-engine && bun test

# From project root
bun test packages/payroll-engine
```

## Deferred Items

- Barbados 2026 rules module (researched, needs official verification)
- Trinidad & Tobago 2026 rules module (researched, needs official verification)
- Trinidad & Tobago 2027 rules module (NIS rate changes to 19.2%)
- Frequency scaling for weekly/fortnightly/semi-monthly pay periods
- Gratuity calculation
- Severance/final settlement
- Payslip PDF generation (Phase 8F)
- YTD accumulation across periods
- Previous period comparison (unusual variance warning)
