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

### Employer-Configurable Policy Features

> Added Phase 6E (2026-05-27). Some payroll rules are not statutory but per-employer policy. The payroll engine must allow businesses to configure these.

#### Overtime Rate Configuration

Not all overtime rates are statutory. Employers need to define:

| Setting | Description | Default |
|---------|-------------|---------|
| weekdayOvertimeMultiplier | Rate for hours beyond minimum on a scheduled weekday | 1.5× (Labour Act) |
| saturdayMultiplier | Rate for Saturday work when Saturday is NOT a scheduled workday | 1.5× (employer policy, not statutory) |
| sundayMultiplier | Rate for Sunday/rest day work | 2.0× (Labour Act) |
| publicHolidayMultiplier | Rate for public holiday work | 2.0× (Labour Act) |
| nightShiftMultiplier | Rate for overnight shifts (if applicable) | 1.0× (configurable) |

**Implementation**: These multipliers live on `payroll_setting` (per-org) with statutory defaults from the country payroll profile. Employers can override. The attendance processor uses these when classifying day types for payroll aggregation.

#### Qualification Allowance Configuration

Qualification allowances (ACCA, Masters, PhD) are public-sector salary supplements, not statutory deductions. Private employers may replicate them:

- Modeled as `pay_item` entries with type=allowance, isConditionBased=true
- Condition: employee qualification matches (future `employee_qualification` table or JSON field)
- Amount: configurable per qualification level
- Taxability: configurable (public-sector ones are typically non-taxable)
- **Setup wizard hint**: "Some employers offer additional pay for professional qualifications. Set these up as allowance pay items."

#### Gratuity Configuration

No statutory gratuity in Guyana. Employers define their own rules:

- Modeled as `gratuity_rule` entity (future Phase 10+)
- Configuration: accrual rate (% of base salary), payout frequency (6-monthly, annually, on termination)
- Service eligibility: minimum years of service before gratuity applies
- Formula types: fraction of salary × years (simple), or tiered by service bands
- **Setup wizard hint**: "Gratuity is an employer benefit, not a legal requirement. Configure your gratuity policy here."

#### Severance Pay (Statutory)

Governed by Termination of Employment and Severance Pay Act:
- 1 week of pay per year of continuous service for the first 5 years
- May vary for longer service (verify specific Act provisions)
- Triggered by redundancy/retrenchment, not voluntary resignation
- Modeled as part of final settlement calculation (Phase 10+)

### Robust Employer Policy Configuration (Wizards + Defaults + Dropdowns)

> The payroll system must cater for all kinds of businesses — from a 5-person shop to a 500-person enterprise. Every configurable setting should have smart defaults, dropdown presets, and custom options.

#### Work Schedule Wizard

Step-by-step setup for employer work schedule:

1. **What days do your employees work?**
   - Dropdown presets:
     - "Monday to Friday (standard)" ← default
     - "Monday to Saturday (6-day)"
     - "Monday to Saturday (alternating Saturdays)"
     - "Rotating shifts (custom)"
     - "Custom schedule"
   - Shows calendar preview of selected pattern

2. **What are your standard work hours?**
   - Dropdown presets:
     - "8:00 AM – 4:00 PM (8 hours)" ← default
     - "8:00 AM – 5:00 PM (9 hours with 1 hour lunch)"
     - "7:00 AM – 3:00 PM (8 hours)"
     - "Custom hours"
   - Lunch break: "Deduct lunch automatically?" → Yes/No → duration

3. **How do you handle overtime?**
   - Dropdown presets:
     - "Guyana Labour Act (1.5× weekday, 2× Sunday/holiday)" ← default for GY
     - "Flat 1.5× all overtime"
     - "Flat 2× all overtime"
     - "No overtime pay (salaried only)"
     - "Custom rates"
   - If custom: editable table with day type → multiplier

4. **Saturday premium policy?**
   - If Mon-Fri schedule: "Saturday is a non-scheduled day. Workers receive 1.5× by default."
   - If Mon-Sat schedule: "Saturday is a regular workday. No premium unless overtime."
   - "Custom Saturday rate" option
   - Helper text: "Saturday overtime rates are per employer policy, not statutory."

5. **Review & Save** — summary card before saving

#### Pay Item Preset Library

Pre-built pay item templates that employers can add with one click:

**Common Allowances (dropdown + "Add Custom"):**
- Housing Allowance (fixed, taxable)
- Transport Allowance (fixed, non-taxable)
- Meal Allowance (fixed, taxable)
- Duty Allowance (fixed, taxable)
- Uniform Allowance (fixed, non-taxable)
- Acting Allowance (fixed, taxable)
- Station Allowance (fixed, non-taxable)
- Qualification Allowance (condition-based, non-taxable) — with sub-presets: ACCA, Masters, PhD
- Overtime Pay (attendance-based, taxable) — auto-calculated from approved OT hours
- Custom Allowance → free-form

**Common Deductions (dropdown + "Add Custom"):**
- NIS Employee Contribution (statutory, pre-tax) — auto-configured from country profile
- PAYE Income Tax (statutory, tax) — auto-configured from country profile
- Health Insurance (pre-tax, capped)
- Life Insurance (pre-tax)
- Union Dues (post-tax)
- Loan Repayment (post-tax) — auto-linked from loans module
- Credit Union Deduction (post-tax)
- Savings Scheme (post-tax)
- Custom Deduction → free-form

Each preset shows: name, type, default amount, taxability, with "Customize" option to modify before adding.

#### Country Profile Presets

Pre-configured country payroll profiles with all statutory rates:

| Country | Presets Included | Status |
|---------|-----------------|--------|
| Guyana (GY) | PAYE 25%/35%, NIS 5.6%/8.4%, personal allowance formula, child allowance, insurance cap, OT allowance cap | ✅ Verified (2026) |
| Trinidad & Tobago (TT) | PAYE brackets, NIS rates, health surcharge | ⬜ To verify |
| Jamaica (JM) | PAYE brackets, NIS/NHT rates, education tax | ⬜ To verify |
| Barbados (BB) | PAYE brackets, NIS rates | ⬜ To verify |
| Custom | Blank template — employer enters all rates | Always available |

**Wizard**: "Select your country" → auto-fills all statutory rates → "Review and customize" → Save

#### Business Type Templates

One-click payroll templates for common business types:

| Template | Work Schedule | Pay Frequency | Wage Type | OT Policy | Key Features |
|----------|--------------|---------------|-----------|-----------|-------------|
| **Office/Professional** | Mon-Fri 8-4 | Monthly | Salary | Standard (1.5×/2×) | Standard salaried setup |
| **Retail/Shop** | Mon-Sat 8-4 | Fortnightly | Hourly | Custom (Saturday regular) | Hourly with Saturday regular |
| **Construction/Field** | Mon-Fri 7-3 | Weekly | Daily | Standard + Saturday 1.5× | Daily rate with weekly pay |
| **Security/24-7** | Rotating shifts | Monthly | Hourly | Custom night differential | Shift-based with night premium |
| **Government/Public** | Mon-Fri 8-4 | Monthly | Salary | Standard + qualification allowances | Standard + qualification + gratuity |
| **Custom** | Manual setup | Manual | Manual | Manual | Full configuration wizard |

**Wizard**: "What type of business are you?" → dropdown → auto-configures schedule, pay items, OT policy → "Customize" → Save

#### Gratuity Policy Wizard

For employers who offer gratuity:

1. **Do you offer gratuity?** — Yes / No
2. **Gratuity accrual rate?**
   - Dropdown presets:
     - "22.5% of base salary (common public sector)" ← default
     - "15% of base salary"
     - "Custom percentage"
   - Or fixed amount per month
3. **Payout frequency?**
   - Dropdown: "Every 6 months" / "Annually" / "On termination only" / "Custom"
4. **Minimum service for eligibility?**
   - Dropdown: "None" / "1 year" / "2 years" / "Custom"
5. **Review & Save**

#### Insurance Deduction Wizard

1. **Does your company offer group insurance?** — Yes / No
2. **Insurance provider presets:**
   - Dropdown: "Assuria" / "GTM Insurance" / "Caribbean Alliance" / "CLICO" / "Custom"
3. **Coverage tiers:**
   - Employee only: $X/month
   - Employee + One: $X/month
   - Family: $X/month
   - Custom amounts
4. **Tax treatment:**
   - "Deducted before tax (pre-tax)" ← default
   - "Deducted after tax (post-tax)"
   - Cap: auto-filled from country profile (GY: min of premium, 10% gross, $50K/month)
5. **Review & Save**

#### Design Principle: Defaults + Dropdowns + Custom

Every configurable payroll setting follows this pattern:
1. **Smart default** — pre-filled with the most common option for the selected country/business type
2. **Dropdown presets** — 3-5 common options covering 90% of use cases
3. **"Custom" option** — always available as the last dropdown item for full flexibility
4. **Helper text** — explains what the setting does and when to change it
5. **"Reset to default"** — one-click return to the recommended setting

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

---

## Payroll Product Direction and Ease-of-Use Requirements

> Added Phase 6E (2026-05-27). Payroll is the highest-stakes module in the entire platform — errors affect real money. Every screen must be designed for non-technical users.

### Design Principles

1. **Payroll must be designed for non-technical users** — payroll clerks, office managers, and small business owners who previously used spreadsheets or manual methods.
2. **Every screen needs helper text by default** — tooltips on every non-obvious field, inline examples, "what is this?" links.
3. **Payroll terms must be explained in plain language** — "Take-Home Pay" not "Net Pay", "Base Salary" not "Contract Wage", "Tax Filing Method" not "Filing Status".
4. **Progressive disclosure** — advanced settings hidden behind "Show more" or accordion panels. Default view shows only what 80% of users need.
5. **Preview before commit** — every irreversible action (finalize, mark paid) shows a full preview with ability to go back.
6. **Audit everything** — every payroll run, every change, every reversal is logged with who/when/what.

### Setup & Configuration

#### Payroll Setup Checklist

When an org first accesses payroll, show a guided checklist:

1. ☐ **Configure country payroll profile** — Select country, verify tax brackets, NIS rates
2. ☐ **Set up filing statuses** — Define tax calculation methods (e.g., "GY Standard PAYE")
3. ☐ **Create pay items** — Configure allowances (housing, transport, duty) and deductions (insurance, union dues)
4. ☐ **Verify employee contracts** — Ensure all employees have active contracts with salary, wage type, pay frequency
5. ☐ **Set payroll preferences** — Default currency, pay period, notification settings
6. ☐ **Run test payroll** — Generate a draft payroll for the current period, review, then discard

Each step links to the relevant settings page. Progress is tracked per-org. Incomplete steps show warnings on the payroll dashboard.

#### Country Payroll Profile Wizard

Step-by-step setup for a new country profile:

1. **Select country** — dropdown with Caribbean countries first (GY, TT, JM, BB, BS, BZ, SR, AG, DM, GD, KN, LC, VC)
2. **Tax brackets** — editable table with min/max/rate/fixed columns. Pre-filled from known rates (e.g., GY 2026: 25%/35%)
3. **Social insurance** — employee rate, employer rate, ceiling. Pre-filled (e.g., GY NIS: 5.6%/8.4%, ceiling GYD 280K/month)
4. **Other statutory deductions** — configurable list (e.g., education tax in Jamaica)
5. **Review & save** — summary card showing all configured rates before saving

Helper text: "These rates determine how tax and social insurance are calculated for employees in {country}. You can update them when rates change (e.g., after a national budget announcement)."

#### Pay Item Setup Wizard

Guided flow for creating allowances and deductions:

1. **What type?** — Allowance (adds to pay) or Deduction (subtracts from pay)
2. **How is it calculated?** — Fixed amount or Percentage of [base pay / gross pay / taxable gross]
3. **Who does it apply to?** — All active employees / Specific employees / Condition-based (department, position, etc.)
4. **Is it taxable?** — Yes/No with explanation: "Taxable allowances increase the amount used to calculate income tax"
5. **Is it pre-tax or post-tax?** (for deductions) — With explanation: "Pre-tax deductions reduce your taxable income. Post-tax deductions come out of your take-home pay."
6. **Review** — Summary card before saving

### Payroll Run Experience

#### Payroll Run Wizard

Multi-step guided flow:

1. **Select period** — Start date, end date, batch name (auto-suggested: "May 2026 Payroll")
2. **Select employees** — All active, by department, or individual selection with filter/search
3. **Preview** — Per-employee gross-to-net preview with expandable line items
   - Green rows: ready to process
   - Amber rows: warnings (unusual changes from last period)
   - Red rows: blocked (cannot process)
4. **"Why is payroll blocked?" panel** — For each blocked employee:
   - "No active contract" → [Create Contract] button
   - "Bank details not set" → [Update Bank Info] button
   - "3 attendance days not validated" → [Validate Attendance] button
   - "2 leave requests pending approval" → [Approve/Reject] button
   - "Loan installment exceeds net pay" → [Review Loan] button
5. **Generate** — Creates draft payslips, shows success summary
6. **Review** — Link to payslip list filtered to this batch

#### Pre-Finalization Review Screen

Before finalizing, show:
- Total gross payroll for the period
- Total deductions (itemized: tax, NIS, loans, other)
- Total net payroll
- Number of employees processed
- Number of employees skipped (with reasons)
- Comparison to last period (total and per-employee delta)
- **Payroll confidence checks**:
  - ✅ "All employees have active contracts"
  - ✅ "All attendance records are validated"
  - ⚠️ "2 employees have unusual salary changes (>20% from last period)" → [Review]
  - ❌ "1 employee has negative net pay" → [Must resolve before finalize]
- **Issue list** — every warning/error that should be reviewed before finalizing

#### Gross-to-Net Explanation Panel

On every payslip detail view, show a step-by-step breakdown:

```
Base Salary (from active contract)                    $342,000.00
+ Housing Allowance (fixed, taxable)                  + $50,000.00
+ Transport Allowance (fixed, non-taxable)            + $15,000.00
= Gross Pay                                           $407,000.00
- NIS (5.6% of gross, capped at $280K)               - $15,680.00
- Personal Allowance (max of $140K or ⅓ gross)        - $140,000.00
= Taxable Income                                      $251,320.00
- Income Tax (25% on first $280K)                     - $62,830.00
- Loan Installment (Emergency Loan, 4 of 12)          - $8,333.00
= Take-Home Pay                                       $320,157.00
```

Each line item has a tooltip explaining the calculation source.

#### "What Changed from Last Pay?" Explanation

Side-by-side comparison showing:
- Items that increased (green arrow ↑)
- Items that decreased (red arrow ↓)
- New items added (blue "New" badge)
- Items removed (gray strikethrough)

Example: "Your housing allowance increased by $5,000 because HR updated the allowance rate on May 15."

### Employee Payslip Experience

#### Payslip View (Employee Self-Service)

- Clean, printable layout with company logo
- Gross-to-net breakdown (simplified version of the admin view)
- "How this was calculated" expandable section
- Download PDF button
- Year-to-date summary (total gross, total tax, total NIS, total net)
- "Questions about your payslip?" → link to HR/helpdesk

#### Mobile-Friendly Payslip

- Responsive layout optimized for phone screens
- Key numbers prominent: Gross, Deductions, Take-Home
- Swipe between months
- Pull-to-refresh for latest payslip

### Role-Specific Views

| Role | Dashboard | Actions | Visibility |
|------|-----------|---------|------------|
| payroll_admin | Full payroll command center | Run payroll, configure pay items, finalize, reverse, export | All employees, all salary data |
| hr_admin | Employee contracts, pay item overview | Create/edit contracts, manage employees | All employees, salary data |
| employee | Own payslips, loan balance, reimbursement status | Request reimbursement, view payslip, download PDF | Own data only |
| auditor | Payroll audit trail, payslip history | Read-only access to all payroll data | All data, no mutations |
| tenant_owner / tenant_admin | Executive payroll summary | All payroll actions | All data |
| manager | Team payroll summary (future) | Approve reimbursements (future) | Direct reports only |

### Finalization and Reversal Strategy

- **Draft → Confirmed**: Locks payslip for editing. Requires `payslip:finalize` permission.
- **Confirmed → Paid**: Final state. Records payment date. Irreversible in normal flow.
- **Reversal**: Creates a negated adjustment payslip (not a delete). Original payslip stays in history. Reversal payslip has negative amounts. Both linked via `reversalOf` reference. Requires `payslip:reverse` permission and audit reason.
- **Never delete finalized payslips** — always reverse. This maintains audit integrity.

### Export/Download Flows

- **Bank file export** — Generate bank-specific salary file (Republic Bank eZpay, etc.)
- **GRA PAYE Form 5** — Monthly tax return CSV
- **NIS schedule** — Employee/employer contribution report
- **Payslip PDF** — Individual or bulk download
- **Payroll summary CSV** — Period summary for accounting

All exports show a preview/validation step before download.

### Plain-Language Error Examples

| Technical | User-Friendly |
|-----------|---------------|
| `CONSTRAINT_VIOLATION: unique(employeeId, periodStart)` | "A payslip already exists for Maya Persaud for this pay period. You can edit the existing one or run payroll for a different period." |
| `NET_PAY_NEGATIVE` | "Maya's deductions ($180,000) exceed her gross pay ($150,000). Review her loan installments or allowances before finalizing." |
| `MISSING_CONTRACT` | "No active contract found for Raj Singh. Create a contract to include them in this payroll run." |
| `UNVALIDATED_ATTENDANCE` | "3 attendance records for Maya haven't been confirmed by a manager yet. Validate them or exclude Maya from this run." |

### Guided Correction Flows

When payroll is blocked:
1. Show the specific issue with a plain-language explanation
2. Offer a direct link to the resolution screen (e.g., "Go to Maya's contract" → opens contract create sheet)
3. After resolution, offer a "Re-check" button that re-validates
4. Track resolution status so the user can see what's been fixed

### Validation Warnings Before Finalization

Before allowing finalization, check and warn:
- Any employee with >20% change in gross from last period
- Any employee with zero worked hours (if wage type is hourly/daily)
- Any employee with pending leave requests overlapping the period
- Any loan installment that would bring net pay below a configurable minimum
- Any new pay items added since last period that affect >10 employees
- Missing bank details for any employee in the run

---

## Live Projected Pay

> Added Phase 6E (2026-05-27). Future functionality — not implemented until Phase 8+.

### Purpose

Give employees and payroll admins visibility into expected compensation before the pay period ends and before payroll is finalized. Inspired by v1's "Live Pay" feature.

### Employee-Facing Projected Pay

#### Hourly Employees
- See projected pay based on hours clocked so far
- "Hours worked: 72 of 80 expected | Estimated gross: $28,800"
- Updates as new attendance records are approved
- Shows approved hours vs pending hours separately

#### Salaried Employees
- See expected pay summary (fixed, less predictable changes)
- "Expected base: $342,000 | Pending deductions: $15,680 NIS + $62,830 PAYE"
- Highlights if any deductions are unusual

#### Daily Workers
- Day-rate projection based on days worked
- "Days worked: 18 of 22 | Estimated gross: $90,000"

### Payroll Admin Projected View

- See projected total payroll cost for the period
- Per-employee projected gross, deductions, net
- Identify employees with projected issues early
- "Estimated payroll: $4.2M (based on 85% of period complete)"

### Pay Period Types Supported

| Period | Calculation |
|--------|-------------|
| Weekly | Rate × days/hours worked in the week |
| Fortnightly | Rate × days/hours worked in the fortnight |
| Semi-monthly | Rate × days/hours worked in the half-month |
| Monthly | Fixed salary (minus leave deductions) or rate × days/hours |
| Yearly | Prorated from annual salary |
| Custom | User-defined period dates |

### Projected Components

- **Estimated gross pay** — based on rate × worked time (or fixed for salaried)
- **Estimated overtime** — approved OT hours × OT rate (unapproved OT excluded)
- **Estimated unpaid absence deduction** — from unapproved absences
- **Estimated paid/unpaid leave impact** — approved leave deducted, pending leave shown as warning
- **Estimated allowances and deductions** — if configured (fixed amounts calculated, attendance-based estimated)
- **Expected hours vs worked hours** — from shift schedule vs attendance records
- **Approved hours vs pending hours** — only approved hours feed projection

### Dependencies

- **Contract** — wage type (hourly/daily/monthly) and rate from active contract
- **Contract pay frequency** — determines period boundaries
- **Attendance/work records** — hours/days worked feeds hourly/daily projection
- **Leave** — approved leave reduces projected worked days
- **Holiday/company leave** — excluded from expected working days
- **Country payroll profile** — tax brackets for PAYE projection

### UX Requirements

#### Clear Labeling

Every projected pay screen must include:
- **"Estimated pay so far"** — header for the projection section
- **"This is not your final payslip"** — prominent disclaimer
- **"Based on approved hours only"** — clarifies pending time is excluded
- **"Pending overtime is not included yet"** — if OT is pending approval
- **"This estimate may change before payroll is finalized"** — footer disclaimer
- **"How this was calculated"** — expandable breakdown

#### When Estimate Cannot Be Calculated

Show a clear explanation:
- "We cannot estimate pay yet because this employee has no active contract"
- "Some attendance records need review before this estimate is complete"
- "This employee's wage type is hourly but no attendance records exist for this period yet"
- "Leave balance is being recalculated — estimate temporarily unavailable"

#### Separate Views

- **Employee view**: simplified, shows own projected pay with explanations
- **Payroll admin view**: full table of all employees with projected amounts, filterable, sortable

#### Must Never Be Treated as Finalized

- Projection data is clearly labeled as "estimate" in the UI and API responses
- Projection responses include `isEstimate: true` flag
- Projection amounts excluded from export/download flows
- No "finalize" or "confirm" actions on projections

#### Must Update Automatically

- When attendance records are approved, projection recalculates
- When leave is approved/rejected, projection updates
- When corrections are approved, projection adjusts
- Real-time or near-real-time (within 60 seconds of data change)

---

## Guyana Payroll Reference: gy-taxcalc

> Added Phase 6E (2026-05-27). Based on inspection of [gy-taxcalc](https://github.com/kareemschultz/gy-taxcalc) — an internal reference tool for Guyana tax calculations.

### Features Found

| Feature | Description | Heimdallone Relevance |
|---------|-------------|----------------------|
| **Income tax calculator** | Gross-to-net across 5 payment frequencies (daily/weekly/fortnightly/monthly/yearly) | Core payroll engine — same calculation flow |
| **Two-band PAYE** | 25% on first GYD $280K, 35% above | GY country payroll profile — verify against GRA before production |
| **NIS calculation** | 5.6% employee / 8.4% employer, ceiling GYD $280K/month | GY statutory deduction — verify with NIS before production |
| **Personal allowance** | max(GYD $140K, gross ÷ 3) | Tax bracket logic — must implement correctly |
| **Child deductions** | GYD $10K per child under 18 | Allowance pay item — per-child multiplier |
| **Overtime allowance cap** | GYD $50K non-taxable statutory portion | Non-taxable allowance threshold |
| **Insurance premium deduction** | Capped at min(premium, 10% of gross, GYD $50K) | Pre-tax deduction with complex cap rule |
| **Qualification allowances** | ACCA ($15K), Masters ($22K), PhD ($32K) per month — non-taxable | Non-taxable allowance types |
| **Gratuity** | 22.5% of monthly base, paid every 6 months | Gratuity engine — verify rate with employer agreements |
| **Vacation allowance** | Annual vacation pay (one-time) | One-time allowance pay item |
| **Salary increase simulator** | Model salary changes and see impact on tax/net | Future feature — "what if" scenario tool |
| **Scenario comparison** | Compare current vs proposed salary side-by-side | Future feature — pay change preview |
| **Real-time result preview** | Auto-calculates on input change (300ms debounce) | UX pattern — apply to payroll preview |
| **Position presets** | 13 government positions with pre-filled salary + allowances | Salary template inspiration |
| **Dark mode default** | CSS custom properties, dark-first design | Matches Heimdallone design system |
| **Mobile sticky result bar** | Key metrics fixed at top/bottom on mobile | Mobile payslip UX inspiration |
| **PDF export** | Professional report with name, summary, breakdown | Payslip PDF generation pattern |
| **Charts** | 11+ visualizations (waterfall, doughnut, gauge, timeline) | Payroll analytics dashboard ideas |

### Payment Frequency Handling

gy-taxcalc handles frequency conversion rigorously:

| Frequency | Periods/Year | Monthly Factor | Personal Allowance |
|-----------|-------------|---------------|-------------------|
| Daily | 260 | 1/21.67 | GYD $6,460 |
| Weekly | 52 | 1/4.33 | GYD $32,333 |
| Fortnightly | 26 | 1/2.17 | GYD $64,516 |
| Monthly | 12 | 1 | GYD $140,000 |
| Yearly | 1 | 12 | GYD $1,680,000 |

**Heimdallone must support all 5 frequencies** (plus semi-monthly and custom periods). Frequency-specific thresholds must be calculated from the monthly base, not hardcoded.

### What Should Be Reused Conceptually

1. **Frequency-aware threshold conversion** — all tax brackets and statutory limits scale by payment frequency
2. **Allowance classification** — separate taxable vs non-taxable, with qualification-specific allowances
3. **Insurance premium cap logic** — min(premium, 10% of gross, statutory max)
4. **Gratuity accrual pattern** — monthly accrual + periodic payout
5. **Real-time preview UX** — auto-calculate on input change with debounce
6. **Position preset concept** — salary templates for common roles (adapt as contract templates)
7. **Salary increase simulator** — "what if I raise this employee's salary to X?"
8. **PDF export layout** — professional payslip format with company branding
9. **Chart visualizations** — waterfall (gross→net), doughnut (breakdown), cumulative earnings

### What Should Be Redesigned for Heimdallone

1. **Not single-page app** — Heimdallone uses TanStack Router with proper routes
2. **Not client-side only** — all calculations happen server-side for auditability
3. **Not hardcoded rates** — rates come from country payroll profile (editable per org)
4. **Not vanilla JS** — TypeScript with strict types and Drizzle ORM
5. **Multi-employee** — gy-taxcalc is single-employee; Heimdallone is batch payroll
6. **Multi-country** — gy-taxcalc is GY only; Heimdallone is Caribbean-first with extension
7. **Audit trail** — every calculation is logged, not ephemeral
8. **Role-based access** — employee vs admin views, salary masking

### What Requires Official Verification Before Production

| Item | Source to Verify | Status | Notes |
|------|-----------------|--------|-------|
| PAYE brackets (25%/35%, GYD $280K monthly threshold) | [GRA 2026 Notice](https://www.gra.gov.gy/notice-to-employers-employees-self-employed-persons-revised-personal-allowance-and-deductions-for-income-tax-2026/) | ✅ Verified (2026-05-27) | 2026 budget raised from $260K to $280K |
| NIS rates (5.6% employee / 8.4% employer, $280K ceiling) | [NIS Contributions](https://www.nis.org.gy/information_on_contributions) | ✅ Verified | Ceiling $280K/month, max employee deduction $15,680/month |
| Personal allowance (max of $140K/month or ⅓ gross) | [GRA 2026 Notice](https://www.gra.gov.gy/notice-to-employers-employees-self-employed-persons-revised-personal-allowance-and-deductions-for-income-tax-2026/) | ✅ Verified | 2026 budget raised from $130K to $140K |
| Child allowance ($10K/child under 18) | GRA 2026 Notice | ✅ Verified | One parent per child only |
| Overtime allowance cap ($50K/month) | GRA 2026 Notice | ✅ Verified | Non-taxable statutory OT portion |
| Insurance premium cap (min of premium, 10% gross, $50K/month) | GRA 2026 Notice | ✅ Verified | $600K annual cap |
| Qualification allowances (ACCA $15K, Masters $22K, PhD $32K) | Public service circular | ⚠️ Public-sector only | Not statutory deductions — employer-configurable allowances |
| Gratuity rate (22.5%) | — | ⚠️ Not statutory | Employer-specific; no Guyana gratuity statute. Severance = 1 week/year (Termination Act) |
| Weekday OT (1.5×) | [Labour Ministry](https://labour.gov.gy/wp-content/uploads/2024/07/Overtime-Leave-1.pdf) | ✅ Verified | Labour Act |
| Sunday/public holiday OT (2×) | Labour Ministry | ✅ Verified | Labour Act |
| Saturday OT rate | — | ⚠️ Not statutory | No distinct Saturday rate in Labour Act. Per employer policy or collective agreement only. |
| Minimum wage (private sector) | — | ℹ️ ~$60,147/month (2025) | Verify for 2026 |
| Annual leave (12 working days after 1 year) | Labour Act | ✅ Verified | Statutory minimum |
| Maternity leave (13 weeks, 70% via NIS) | Labour Act / NIS | ✅ Verified | Extendable 13 more weeks for complications |
| Public holidays (15 in 2026) | Gazette | ✅ Verified | Including lunar holiday estimates |

**Key finding (2026-05-27):** All core rates in our spec are confirmed for 2026. Three clarifications needed:
1. Saturday OT is NOT statutory — it's per employer work schedule configuration, not a Labour Act rate.
2. Qualification allowances are public-sector salary supplements, not universal tax deductions — model as configurable employer allowances.
3. Gratuity is employer-specific — Guyana has no statutory gratuity. Severance pay (redundancy) is governed by the Termination Act: 1 week per year of service.

**Critical**: Even verified rates must be re-confirmed annually (post-budget). The payroll engine must support versioned rates per country+year.

### Mapping to Heimdallone Entities

| gy-taxcalc Concept | Heimdallone Entity | Phase |
|--------------------|--------------------|-------|
| Tax brackets | `country_payroll_profile.taxBrackets` | Phase 8 |
| NIS rates | `country_payroll_profile.employeeNISRate/employerNISRate` | Phase 8 |
| Allowances (taxable/non-taxable) | `pay_item` (type=allowance, isTaxable) | Phase 8 |
| Insurance premium | `pay_item` (type=deduction, isPreTax, with maxAmount) | Phase 8 |
| Child deduction | `pay_item` (condition-based on employee children count) | Phase 8 |
| Qualification allowance | `pay_item` (condition-based on employee qualifications) | Phase 8+ |
| Gratuity | `gratuity_rule` (future entity) | Phase 10+ |
| Position presets | Contract templates / salary structure templates | Phase 8+ |
| Salary simulator | "What if" projection tool | Phase 10+ |

### UX Ideas to Carry Forward

1. **Sticky result bar** on mobile payslip — gross/deductions/net always visible
2. **Collapsible sections** — quick start (essential) + expandable (advanced)
3. **Auto-calculate on change** — 300ms debounce, only if valid input
4. **Position/template presets** — one-click salary configuration
5. **Scenario comparison** — current vs proposed side-by-side
6. **Chart-rich analytics** — not just tables, visual breakdowns
7. **PDF-ready layout** — design payslip view to export cleanly

---

## HeimdallOne v1 Feature Inspiration

> Added Phase 6E (2026-05-27). Based on inspection of old v1 codebase at `.references/old-heimdallone/`. This is a historical reference for feature intent — NOT a trusted implementation source.

### Packages/Docs Inspected

| Component | Location | Lines | Key Findings |
|-----------|----------|-------|-------------|
| Payroll Engine | `packages/payroll-engine/src/` | ~6.7K | Gross computer, accrual engine, correction service, versioned GY rules |
| Attendance Processor | `packages/attendance-processor/src/` | ~12K | Day classification, shift pairing, break auto-deduction |
| Gratuity Engine | `packages/payroll-engine/src/gratuity/` | ~1.7K | Multi-jurisdiction tiered/fraction formulas (GY/BB/JM/TT) |
| DB Schema | `packages/db/src/schema/` | ~5.6K | 15 schema files covering payroll, attendance, leave, compensation |
| Payroll Router | `packages/api/src/routers/payroll.ts` | ~2K+ | Run period, compute, finalize, reverse, export |
| Leave Router | `packages/api/src/routers/leave.ts` | ~19K | Request workflow, balance reconciliation |
| Loans Router | `packages/api/src/routers/loans.ts` | ~27K | Dual-approval, amortization, write-off, GL journal entries |
| Exports | `packages/exports/src/guyana/` | ~2K | Republic Bank eZpay, GRA Form 5, NIS Schedule |
| Admin Frontend | `apps/admin/src/` | — | Live pay, payroll run, statutory reports, attendance roster |
| Mobile App | `apps/mobile/app/` | — | Clock-in, leave balance, payslip list |
| Compliance Docs | `docs/compliance/` | 5 files | Guyana payroll, tax engine, GRA PAYE |
| HR Docs | `docs/hr/` | 25 files | Leave, payroll, recruitment, training, benefits |

### Concepts Worth Carrying Forward

#### Payroll Engine Architecture
1. **Three-tier gross computation** — separate gross computer from tax engine from payslip generator
2. **Versioned statutory rules** — immutable snapshots per country+year (e.g., `rules-gy-2026.ts`)
3. **Bigint cents throughout** — no floating-point in payroll; banker's rounding at display only
4. **Correction via reversal** — finalized payslips are immutable; corrections create negated adjustment payslips
5. **Live pay accrual** — mid-period earnings preview for hourly/daily workers (exact NIS, projected PAYE)

#### Attendance Processing
6. **Day classification priority chain** — public holiday > Sunday > non-scheduled Saturday > weekday
7. **Labour Act multipliers** — 1.5× weekday OT, 1.5× Saturday (non-scheduled), 2× Sunday, 2× public holiday
8. **Break auto-deduction** — configurable lunch deduction (e.g., "deduct 60 min if worked > 6 hours")
9. **Shift window clipping** — start clipping (always) + end clipping (configurable) to prevent unbounded OT
10. **Logical shift date** — attribute punches to the shift start date, not calendar date (critical for overnight shifts)

#### Loan Lifecycle
11. **Dual-approval workflow** — HR approval + Accounting approval before disbursement
12. **Amortization preview** — show full installment schedule before approval
13. **GL journal entries** — every loan operation posts balanced accounting entries
14. **Write-off path** — owner-only, creates Bad Debt expense journal

#### Export Formats
15. **Republic Bank eZpay** — pipe-delimited salary file (routing, account, type, name, amount)
16. **GRA PAYE Form 5** — monthly tax return CSV
17. **NIS Schedule** — employee/employer contribution report
18. **Payslip PDF** — on-demand render, employee self-service download

#### Frontend Patterns
19. **Live pay dashboard** — real-time accrual cards with 60s refresh, pulsing indicator
20. **Multi-stage payroll run** — compute draft → review diffs → approve → finalize → export
21. **Device health dashboard** — last-seen heartbeat, punch count, color-coded status
22. **Manager action items inbox** — pending corrections, OT approvals, leave requests
23. **Offline-first mobile** — SQLite punch queue, sync on reconnect

### Concepts to Avoid

| v1 Pattern | Why to Avoid | v2 Approach |
|-----------|-------------|-------------|
| 19K+ line router files | Unmaintainable, hard to test, hard to review | Modular routers with focused procedures |
| Non-transactional finalization | Period can get stuck in "processing" state | Atomic transactions with rollback |
| Hardcoded device types | Only supports K40 via Pi bridge | Pluggable device adapter pattern |
| API key shown once, unrecoverable | Bad UX — lose the key, must regenerate | Encrypted storage with reveal-once + rotate |
| Separate salary structure entity | Adds complexity over contract-based salary | Keep salary on contract, add templates later |
| No helper text | Users confused by payroll terminology | Mandatory tooltips and inline explanations |

### Bugs/UX Risks Noticed

1. **`logicalShiftDate` NULL handling** — 5 punch insert sites initially omitted this column, causing overnight shift punches to be invisible to payroll
2. **Active SSA scope bug** — queries using only `isNull(toDate)` missed fixed-term contracts with future end dates
3. **Saturday classification ambiguity** — Mon–Fri vs Mon–Sat employers pay Saturday differently; misconfigured schedule = over/under-pay
4. **Non-transactional finalization** — period status can get stuck in "processing" if finalization fails mid-batch
5. **No review step before finalization** — payroll could be finalized without human review of draft payslips
6. **No guided correction flows** — blocked payroll required manual investigation with no inline guidance
7. **Minimal employee-facing explanation** — payslips showed numbers without "how this was calculated" context

### Phase Mapping

| v1 Feature | v2 Phase | Notes |
|-----------|----------|-------|
| Attendance processing, punch pairing | Phase 7 | Day classification, shift attribution |
| Leave requests, balance tracking | Phase 7 | Request/approve workflow, balance management |
| Live pay accrual | Phase 8 | Projected pay for hourly/daily workers |
| Payroll engine (gross→tax→net) | Phase 8 | Core payroll calculation |
| Pay items (allowances/deductions) | Phase 8 | Rule-based pay configuration |
| Payslip generation + finalization | Phase 8 | Batch payroll run with preview |
| Loans + salary advances | Phase 8 | Employee loan lifecycle |
| Bank file export (Republic Bank) | Phase 8 | eZpay salary file |
| GRA Form 5 + NIS Schedule | Phase 8 | Statutory reporting |
| Gratuity engine | Phase 10+ | Multi-jurisdiction gratuity |
| K40 biometric integration | Phase 11 | Device bridge + punch import |
| Mobile attendance + payslips | Phase 11+ | Expo app employee self-service |

### Old v1 Risks to Avoid

1. **Confusing flows** — no guided setup, no "why is this blocked" panels, no resolution links
2. **Lack of helper text** — payroll screens assumed domain expertise; no tooltips or inline explanations
3. **Brittle calculations** — some edge cases (overnight shifts, Saturday classification) caused silent miscalculation
4. **Unclear payroll states** — distinction between "draft" and "processing" and "finalized" not visually clear
5. **No estimate/finalized distinction** — live pay projections could be confused with actual payslips
6. **Insufficient review/approval steps** — payroll could be finalized in one click without review
7. **Poor employee-facing explanation** — payslips showed amounts but not how they were calculated
8. **Weak auditability in some areas** — not all payroll operations had comprehensive audit logs
9. **Monolithic router files** — 19K+ line router files that are hard to maintain or debug
10. **Non-transactional state changes** — finalization could partially complete, leaving data in inconsistent state

---

## Horilla/OpenHRMS Workflow Integration

> Added Phase 6E (2026-05-27). Cross-references Phase 4D extraction docs.

### Horilla Ideas Carried Forward

| Feature | Source | Status in v2 Spec |
|---------|--------|-------------------|
| Contract lifecycle (draft→active→expired→terminated) | `payroll.md` | ✅ Implemented (Phase 6) |
| One active + one draft constraint | `payroll.md` | ✅ Implemented |
| Pay item rule engine (fixed/percentage, condition-based) | `payroll.md` | ✅ In spec, Phase 8 |
| Pay item employee targeting (include/exclude lists) | `payroll.md` | ✅ In spec |
| Payslip lifecycle (draft→review→confirmed→paid) | `payroll.md` | ✅ In spec |
| Loan with installment schedule | `payroll.md` | ✅ In spec |
| Reimbursement → one-time allowance | `payroll.md` | ✅ In spec |
| Filing status with bracket-based tax | `payroll.md` | ✅ Implemented (schema) |
| Attendance activity (multiple events/day) | `attendance.md` | ✅ In spec |
| Overtime = worked - minimum from shift | `attendance.md` | ✅ In spec |
| Grace time for late/early detection | `attendance.md` | ✅ In spec |
| Attendance validation by manager | `attendance.md` | ✅ In spec |
| Correction request workflow | `attendance.md` | ✅ In spec |
| Monthly overtime account aggregation | `attendance.md` | ✅ In spec |
| Leave type with accrual/reset/carry-forward | `leave.md` | ✅ In spec |
| Half-day leave (first half/second half) | `leave.md` | ✅ In spec |
| Holiday exclusion from leave count | `leave.md` | ✅ In spec |
| Multi-level approval chain | `leave.md` | ✅ In spec |
| Leave restriction periods | `leave.md` | ✅ In spec |

### OpenHRMS Ideas Carried Forward

| Feature | Source | Status in v2 Spec |
|---------|--------|-------------------|
| Employee loans with installment lifecycle | `openhrms-comparison.md` | ✅ In spec |
| Salary advance (one-click request) | `openhrms-comparison.md` | ✅ In spec (as loan type=advance) |
| Overtime rate types (weekday/weekend/holiday) | `openhrms-comparison.md` | ✅ Added to attendance spec |
| Attendance regularization with categories | `openhrms-comparison.md` | ✅ Enhanced correction workflow |
| Employee update request approval | `openhrms-comparison.md` | ⬜ Deferred to Phase 9+ |
| Transfer workflow | `openhrms-comparison.md` | ⬜ Deferred to Phase 10+ |
| Disciplinary tracking | `openhrms-comparison.md` | ⬜ Deferred to Phase 10+ |

### Gaps Heimdallone Should Improve Over Horilla/OpenHRMS

1. **Pay run wizard with preview** — Horilla generates payslips directly; we add a preview step
2. **"Why blocked" panel** — neither Horilla nor OpenHRMS explains why an employee can't be processed
3. **Gross-to-net visual breakdown** — neither provides a waterfall chart or step-by-step explanation
4. **Employee-facing payslip explanation** — Horilla shows numbers only; we explain calculations
5. **Country profile system** — pre-configured templates for Caribbean countries (neither has this)
6. **Payslip comparison** — "what changed from last month" diff view
7. **Mobile-first employee experience** — Horilla has limited mobile; we prioritize it
8. **Guided setup checklist** — neither walks through initial payroll configuration
9. **Helper text everywhere** — neither provides inline explanations for payroll terminology
10. **Non-technical-user design** — both assume HR/payroll expertise; we design for first-time users

### Ideas to Defer

| Feature | Source | Defer To | Reason |
|---------|--------|----------|--------|
| Compensatory leave (worked holiday → leave credit) | Horilla leave | Phase 8+ | Needs attendance records |
| Leave encashment (cash out leave days) | Horilla/OpenHRMS | Phase 10+ | Needs payroll engine |
| Bonus point encashment | Horilla reimbursement | Phase 12+ | Needs performance module |
| Payroll accounting (GL journal entries) | Horilla/v1 | Phase 10+ | Needs accounting module |
| Insurance tracking | OpenHRMS | Phase 10+ | Low Caribbean priority |
| GOSI/WPS | OpenHRMS | Never | Region-specific (UAE/Saudi) |
| Employee transfer workflow | OpenHRMS | Phase 10+ | Nice-to-have, not critical |

---

## Future Payroll Engine Architecture

> Added Phase 6E (2026-05-27). Recommended modular architecture for Phase 8 implementation.

### Recommended Packages/Modules

```
packages/payroll-engine/
├── src/
│   ├── rules/                    # Country/year-versioned statutory rules
│   │   ├── registry.ts           # Rule registry: load rules by country+year
│   │   ├── guyana/
│   │   │   └── rules-2026.ts     # GY 2026: PAYE brackets, NIS rates, allowances
│   │   ├── trinidad/
│   │   │   └── rules-2026.ts     # TT 2026 (future)
│   │   └── types.ts              # StatutoryRules interface
│   │
│   ├── gross-computer.ts         # Converts attendance + compensation → gross pay
│   ├── taxable-income.ts         # Applies pre-tax deductions, calculates taxable income
│   ├── statutory-deductions.ts   # NIS, PAYE, other statutory calculations
│   ├── allowance-deduction.ts    # Applies configured pay items
│   ├── loan-deduction.ts         # Pulls due loan installments
│   ├── net-calculator.ts         # Final gross - deductions = net
│   ├── payslip-generator.ts      # Assembles payslip with full line-item breakdown
│   ├── explanation.ts            # Generates human-readable calculation breakdown
│   ├── projection.ts             # Live projected pay (estimates, not finalized)
│   │
│   ├── gratuity/                 # Gratuity/severance calculations
│   │   ├── calculator.ts
│   │   └── rules/                # Per-country gratuity rules
│   │
│   ├── lifecycle/                # Payroll run lifecycle
│   │   ├── run.ts                # Orchestrates full payroll run
│   │   ├── finalize.ts           # Locks payslips, posts to audit
│   │   ├── reverse.ts            # Creates reversal payslip
│   │   └── validate.ts           # Pre-run validation checks
│   │
│   ├── export/                   # Export generators
│   │   ├── types.ts              # IBankFileGenerator, IReportGenerator interfaces
│   │   ├── republic-bank.ts      # Republic Bank eZpay format
│   │   ├── gra-form5.ts          # GRA PAYE Form 5
│   │   ├── nis-schedule.ts       # NIS contribution schedule
│   │   └── payslip-pdf.ts        # PDF payslip generator
│   │
│   └── types.ts                  # Shared types: PayslipInput, GrossBreakdown, etc.
```

### Architecture Principles

The payroll engine MUST be:

| Principle | Requirement |
|-----------|-------------|
| **Versioned by country/year** | Statutory rules are immutable snapshots. A payslip generated in May 2026 always uses May 2026 rules, even if rates change in June. |
| **Auditable** | Every calculation step is logged. Finalized payslips store the rule version used. |
| **Test-heavy** | Each calculation module has comprehensive unit tests with known-answer fixtures. Edge cases (bracket boundaries, rounding, zero net) are explicitly tested. |
| **Deterministic** | Same inputs → same outputs. No floating-point — use integer cents (bigint) or `numeric(12,2)`. |
| **Previewable** | Draft payslips can be generated without side effects. Preview mode calculates but doesn't persist or trigger downstream actions. |
| **Explainable** | Every line item on a payslip has a human-readable explanation of how it was calculated and why. |
| **Multi-country extensible** | Adding a new country means adding a `rules-{country}-{year}.ts` file and seeding a country profile. No changes to the core engine. |
| **Safe around rounding** | Round each line item to 2 decimal places individually. Calculate totals from rounded values. Never accumulate rounding errors across line items. |
| **Separated from UI** | The payroll engine is a pure calculation library. No React, no HTTP, no database queries. It receives typed inputs and returns typed outputs. The oRPC router is the adapter between DB/API and the engine. |
| **Validated against official sources** | Before production: every rate, bracket, formula verified against official government documents (GRA, NIS, Labour Act). |
| **Resilient to missing data** | Missing attendance → skip hourly calculation, flag as "incomplete". Missing leave → calculate without leave deduction, flag as "estimated". Never crash on missing data — explain what's missing. |
| **Estimate vs finalized** | Projections and drafts are clearly marked as estimates. Only finalized payslips are canonical. The engine knows the difference and communicates it in outputs. |

### Pay Period Engine

Handles period boundary calculations:

- Given a pay frequency (weekly/fortnightly/semi-monthly/monthly/custom), calculate period start and end dates
- Map an arbitrary date to its containing period
- Calculate working days in a period (excluding holidays, company leave days)
- Calculate expected hours in a period (from shift schedules)
- Support period rollover (what happens when an employee's contract changes mid-period)

### Explanation Engine

Generates human-readable breakdowns:

- For each payslip line item: "Housing Allowance — Fixed amount of $50,000 configured by HR on 2026-03-15"
- For tax calculations: "Income tax calculated using GY 2026 PAYE brackets: 25% on first $280,000, 35% on remainder"
- For deductions: "NIS contribution: 5.6% of gross pay ($407,000) = $22,792, capped at $15,680 (ceiling: $280,000)"
- For blocked items: "Cannot calculate — no approved attendance records for May 16–20"

---

## Quality-of-Life Requirements

> Added Phase 6E (2026-05-27). Applies to all payroll screens.

### Payroll-Specific QoL

- **Saved views** — "Current Period", "Pending Review", "Finalized", "My Payslips"
- **Smart filters** — department, status, period, employee search
- **Contextual empty states** — "No payslips yet. Run your first payroll to get started." with action button
- **Role-specific dashboards** — payroll admin sees command center; employee sees own payslips
- **Bulk actions with review step** — select payslips → review summary → confirm/pay all
- **Sticky summary panel** — period totals (gross, deductions, net) always visible during payroll run
- **Guided setup checklist** — step-by-step payroll configuration for new orgs
- **Tooltips** — on every non-obvious field (wage type, filing status, pre-tax vs post-tax)
- **Inline examples** — "e.g., Housing Allowance: $50,000/month" next to pay item fields
- **"Learn more" helper links** — link to documentation for complex concepts (tax brackets, NIS)
- **Preview before commit** — draft payslip preview before finalization
- **Undo/reversal** — reversal workflow for finalized payslips (creates negated adjustment)
- **Export-ready views** — payslip list, payroll summary, bank file, tax return
- **Mobile-friendly employee views** — payslip detail optimized for phone screens
- **Searchable history** — search payslips by employee, period, amount
- **Audit timelines** — per-payslip history showing all changes (who/when/what)
- **Issue queues** — "3 issues need attention before finalizing" with inline resolution
- **Blocked item explanations** — "Maya Persaud cannot be processed because..." with fix links
- **Status badges** — consistent colors: Draft (gray), Review (amber), Confirmed (blue), Paid (green)
- **Notification hooks** — "Payroll finalized" notification to payroll admin (future Phase 14)
