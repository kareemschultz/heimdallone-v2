# Payroll Module Specification

## Purpose

Full compensation engine: contracts define base salary, allowances and deductions are configurable rule-based pay items, payslips are generated per period with gross-to-net calculations, loans/advances/reimbursements feed into payslips, and tax computation uses filing statuses with bracket-based or per-country logic. Caribbean-first multi-country support.

## Source References

- `docs/horilla-extraction/payroll.md` — Full Horilla extraction (Contract, Allowance, Deduction, Payslip, Loan, Reimbursement)
- `docs/horilla-extraction/openhrms-comparison.md` — Loans, salary advance, gratuity, GOSI, WPS, insurance
- `docs/architecture/modules/contracts-spec.md` — Contract entity (prerequisite)

## Dependencies

- **HR Core** (P0) — employee_profile, shift, department
- **Contracts** (P0) — active contract provides base salary, wage type, filing status
- **Attendance** (P1) — work records, overtime hours feed into allowance calculations
- **Leave** (P1) — leave deductions from salary, leave encashment

## First Version Scope

### Core payroll
- Pay item configuration (allowances + deductions as rules)
- Pay item targeting (all employees, specific list, condition-based, with exclusions)
- Fixed amount and percentage-based pay items
- Pre-tax vs post-tax deduction distinction
- Tax calculation via filing status brackets
- Payslip generation wizard (select period → employees → preview → generate)
- Payslip lifecycle (draft → review → confirmed → paid)
- Gross-to-net calculation with full line-item breakdown
- Employee payslip portal (view own payslips)

### Loans & advances
- Employee loan creation with installment schedule
- Salary advance requests
- Monthly installment deduction from payslip
- Loan settlement tracking

### Reimbursements
- Expense reimbursement requests with attachment
- Approval workflow (requested → approved → rejected)
- Approved reimbursements create one-time allowances on payslip

### Caribbean-first
- Country payroll profiles (GY, TT, JM — statutory deductions, NIS rates, PAYE brackets)
- Employer contribution tracking (NIS employer portion)
- Multi-currency (GYD, TTD, JMD, USD, BBD)

## Deferred Scope

- Leave encashment (needs leave balance integration)
- Bonus point encashment
- Payroll accounting integration (journal entries, GL)
- Bank file generation (ACH, CSV for bulk salary transfer)
- WPS/GOSI (UAE/Saudi — not needed for Caribbean)
- Gratuity/severance calculation
- Insurance tracking
- Payroll analytics/reports
- Retroactive salary changes (arrears)
- Mid-month proration (complex — needs careful spec)

## Proposed Entities

### `country_payroll_profile`
- **Purpose**: Per-country statutory rules (tax brackets, social insurance rates)
- **Key fields**: id, countryCode (text, ISO 3166-1 alpha-2), countryName, currency (ISO 4217), taxBrackets (jsonb — [{min, max, rate, fixedAmount}]), employeeNISRate (numeric), employerNISRate (numeric), nisMaxEarnings (numeric, nullable), otherStatutoryRules (jsonb), isActive, createdAt, updatedAt
- **Not org-scoped** — global reference data, or org-scoped if orgs customize rates
- **Open question**: Global vs per-org. Recommend **per-org** to allow customization, seeded from templates.

### `pay_item`
- **Purpose**: Configurable allowance or deduction rule
- **Key fields**: id, organizationId, type (allowance/deduction — pgEnum), title, isFixed (bool), fixedAmount (numeric 12,2, nullable), basedOn (basic_pay/gross_pay/taxable_gross_pay/net_pay/attendance/overtime, nullable), rate (numeric 5,2, nullable — percentage), isTaxable (bool, default true — for allowances), isPreTax (bool, default false — for deductions), isTax (bool, default false), employerRate (numeric 5,2, nullable — employer contribution %), isConditionBased (bool), conditions (jsonb — [{field, operator, value}]), includeAllActive (bool), oneTimeDate (date, nullable), hasMaxLimit (bool), maxAmount (numeric, nullable), isActive, createdAt, updatedAt
- **Audit**: Changes tracked
- **Complex**: This is the most complex entity — the rule engine that targets pay items to employees

### `pay_item_employee`
- **Purpose**: Junction table for specific/excluded employee targeting
- **Key fields**: id, payItemId (FK), employeeId (FK), isExcluded (bool, default false)

### `payslip`
- **Purpose**: Generated compensation record for a period
- **Key fields**: id, organizationId, employeeId (FK), periodStart (date), periodEnd (date), batchName (text, nullable), contractWage (numeric 12,2), basicPay (numeric 12,2), grossPay (numeric 12,2), totalDeductions (numeric 12,2), netPay (numeric 12,2), lineItems (jsonb — [{payItemId, title, type, amount, isEmployerContribution}]), status (draft/review/confirmed/paid — pgEnum), currency (text), sentToEmployee (bool, default false), generatedBy (FK user), createdAt, updatedAt
- **Unique**: (employeeId, periodStart, periodEnd) — prevent duplicate payslips
- **Audit**: Status transitions, any edits in draft state
- **Sensitive**: Payslip data is highly sensitive. Employee sees own only.

### `loan`
- **Purpose**: Employee loan or salary advance with installment tracking
- **Key fields**: id, organizationId, employeeId (FK), type (loan/advance/fine — pgEnum), title, amount (numeric 12,2), currency, providedDate (date), totalInstallments (int), installmentAmount (numeric 12,2), installmentStartDate (date), settledAt (timestamp, nullable), status (active/settled — pgEnum), description, createdAt, updatedAt
- **Audit**: Creation, settlement
- **Delete**: Never hard delete — settle or write off

### `loan_installment`
- **Purpose**: Individual loan installment tracking
- **Key fields**: id, loanId (FK), dueDate (date), amount (numeric 12,2), isPaid (bool), payslipId (FK, nullable — links to payslip that deducted this), paidAt (timestamp, nullable)

### `reimbursement`
- **Purpose**: Expense claim or encashment request
- **Key fields**: id, organizationId, employeeId (FK), type (expense/leave_encash/bonus_encash — pgEnum), title, amount (numeric 12,2), currency, date (date — when to apply), attachmentUrl (nullable), status (requested/approved/rejected — pgEnum), approvedBy (FK user, nullable), description, createdAt, updatedAt
- **Audit**: Status transitions
- **Approval creates one-time pay_item allowance targeting the employee**

### `payroll_setting`
- **Purpose**: Per-org payroll configuration
- **Key fields**: id, organizationId (unique), defaultCurrency, defaultNoticePeriodDays (int, default 30), autoGenerateEnabled (bool, default false), autoGenerateDay (int 1-28), bonusPointEncashmentAmount (numeric, nullable), leaveEncashmentAmount (numeric, nullable), createdAt, updatedAt

## Gross-to-Net Calculation (Conceptual)

```
1. Get active contract → baseSalary (wage), wageType, filingStatus
2. If wageType = monthly → basicPay = wage
   If wageType = daily → basicPay = wage × workingDaysInPeriod
   If wageType = hourly → basicPay = wage × workedHoursInPeriod (from attendance)
3. Calculate leave deductions: unpaid leave days × (basicPay / workingDays)
   Adjust basicPay
4. Apply all matching allowances → sum = totalAllowances
   GrossPay = basicPay + totalAllowances
5. Apply pre-tax deductions → sum = preTaxDeductions
   TaxableGross = grossPay - preTaxDeductions
6. Apply tax (from filing status brackets or country profile)
   Tax = calculateTax(taxableGross, filingStatus.brackets)
7. Apply post-tax deductions → sum = postTaxDeductions
8. Apply loan installments due in this period → sum = loanDeductions
9. TotalDeductions = preTaxDeductions + tax + postTaxDeductions + loanDeductions
10. NetPay = grossPay - totalDeductions
11. Store full lineItems breakdown in payslip JSON
```

### "Why Payroll Is Blocked" — UX Pattern

For each employee that cannot be processed, show:

| Block | Message | Resolution |
|-------|---------|------------|
| No active contract | "No active contract found for Maya Persaud" | → Create contract |
| Missing bank details | "Bank details not set" | → Update bank info |
| Unvalidated attendance | "3 attendance days not validated" | → Validate attendance |
| Pending leave requests | "2 leave requests pending approval" | → Approve/reject |
| Outstanding loan conflict | "Loan installment exceeds net pay" | → Review loan terms |

### Rounding/Precision

- All money fields: `numeric(12, 2)` — exact decimal arithmetic
- Round each line item to 2 decimal places individually
- Calculate totals from rounded line items (not from pre-rounded intermediates)
- Currency display: 2 decimal places always (e.g., "342,000.00 GYD")
- Percentage rates stored as `numeric(5, 2)` (max 999.99%)

## Proposed oRPC Routers

### `payroll`

| Procedure | Permission | Notes |
|-----------|-----------|-------|
| countryProfiles.list | statutory_rules:read | Global/org country profiles |
| countryProfiles.upsert | statutory_rules:update | Admin configures tax brackets |
| payItems.list | payslip:read | All pay item rules |
| payItems.create/update/archive | payslip:draft | Manage allowance/deduction rules |
| payslips.generate | payslip:draft | Batch generate for period + employees |
| payslips.preview | payslip:draft | Preview gross-to-net before generating |
| payslips.list | payslip:read | HR: all. Employee: self only. |
| payslips.getById | payslip:read + access | Full line-item breakdown |
| payslips.confirm | payslip:finalize | Lock for editing |
| payslips.markPaid | payslip:finalize | Final state |
| payslips.reverse | payslip:reverse | Unlock confirmed payslip (rare) |
| loans.list/create/settle | loan:* | Loan management |
| loans.installments | loan:read | Installment schedule |
| reimbursements.list/create | advance:create | Employee self-service |
| reimbursements.approve/reject | advance:approve_hr | HR/manager approval |
| settings.get/update | payslip:draft | Payroll config |

## Proposed UI Routes

### `/app/payroll`
- **Purpose**: Payroll command center dashboard
- **Cards**: Current period status, employees processed, total payroll cost, pending actions
- **Actions**: [Run Payroll] [View Payslips]

### `/app/payroll/run`
- **Purpose**: Multi-step pay run wizard
- **Steps**: Period → Employees → Preview (with blocked list) → Generate → Summary
- **Wizard uses**: WizardForm, DataTable (employee selection), StatusBadge (blocked indicators)

### `/app/payroll/payslips`
- **Purpose**: Payslip list
- **DataTable columns**: Employee, Period, Gross, Deductions, Net, Status (badge), Actions
- **Filters**: Period, Status, Department
- **Bulk actions**: Bulk confirm, Bulk mark paid

### `/app/payroll/payslips/$id`
- **Purpose**: Individual payslip detail — full gross-to-net breakdown

### `/app/payroll/loans`
- **Purpose**: Loan management table

### `/app/payroll/reimbursements`
- **Purpose**: Reimbursement request queue with approval

### `/app/payroll/settings`
- **Purpose**: Pay items, country profiles, payroll config

## RBAC

Uses existing permissions: `payslip:draft/finalize/reverse/read`, `loan:*`, `advance:*`, `statutory_rules:read/update`.

## Staff-Friendly UX

- **Pay run wizard** with preview before generation — staff sees exactly what will happen
- **Gross-to-net waterfall chart** on payslip detail — visual flow from base to net
- **"Why blocked" panel** lists every employee that can't be processed with resolution links
- **Employee payslip portal** — clean, printable view with company logo
- **Loan progress bar** — "Installment 4 of 12 — 67% remaining"
- **Reimbursement status** — "Your expense claim was approved. It will appear in your October payslip."
- **Plain labels**: "Base Salary" not "Contract Wage", "Take-Home Pay" not "Net Pay"

## Risks and Edge Cases

1. **Rounding accumulation** — Sum of rounded line items ≠ rounded sum. Round last.
2. **Zero/negative net pay** — Deductions exceed earnings. Prevent negative, show warning.
3. **Mid-month joining** — Prorate salary based on working days (deferred).
4. **Currency mismatch** — Employee in TTD, allowance in GYD. All payslip items must use same currency.
5. **Retroactive changes** — Salary increase backdated. Requires arrears calculation (deferred).
6. **Tax bracket edge** — Amount exactly on bracket boundary. Use inclusive lower, exclusive upper.
7. **Concurrent payslip generation** — Two admins run payroll simultaneously. Use unique constraint.
8. **Loan with resignation** — Outstanding balance must be deducted from final settlement.

## Implementation Readiness

**Needs HR Core + Contracts + Attendance (partial) + Leave (partial)**. Attendance provides worked hours for hourly-wage calculation. Leave provides deduction days. Can start with monthly-wage-only payroll without attendance/leave integration.
