# Payroll Implementation Plan

Phase 8A spec. The highest-risk module in Heimdallone — errors affect real money.

**Prerequisites complete**: HR Core (Phase 5), Contracts (Phase 6), Attendance (Phase 7B–7D), Leave (Phase 7E–7G), QA/security pass (Phase 7H).

---

## Table of Contents

1. [First-Version Scope](#first-version-scope)
2. [Proposed Entities](#proposed-entities)
3. [Payroll Input Contract](#payroll-input-contract)
4. [Guyana Payroll Logic Plan](#guyana-payroll-logic-plan)
5. [Payroll Calculation Order](#payroll-calculation-order)
6. [Payroll Blockers and Warnings](#payroll-blockers-and-warnings)
7. [Payroll UI Plan](#payroll-ui-plan)
8. [Analytics and Reporting](#analytics-and-reporting)
9. [RBAC and Security](#rbac-and-security)
10. [Implementation Sequence](#implementation-sequence)
11. [Open Questions](#open-questions)

---

## First-Version Scope

### Must Include (Phase 8)

| Feature | Phase | Notes |
|---------|-------|-------|
| Guyana country payroll profile (PAYE, NIS, personal allowance) | 8B | Pre-seeded from verified 2026 rates |
| Payroll settings (per-org) | 8B | Default currency, OT multipliers, work schedule config |
| Pay period setup | 8B | Weekly/fortnightly/semi-monthly/monthly/custom |
| Payroll setup checklist | 8E | Guided 6-step first-time setup |
| Pay item configuration (allowances + deductions) | 8B/8D | Fixed/percentage, taxable/pre-tax/post-tax, targeting |
| Pay item preset library | 8E | Common GY allowances/deductions as one-click templates |
| Payroll run wizard (period → employees → preview → generate) | 8F | Multi-step with preview before commit |
| Payslip preview (gross-to-net per employee) | 8F | Expandable line items, confidence checks |
| Gross-to-net breakdown with line-item explanation | 8C | Core engine: base → allowances → deductions → net |
| Draft payroll run → finalize → mark paid | 8D | Status lifecycle: draft → confirmed → paid |
| Employee payslip view (own payslips only) | 8G | Clean, printable, "how this was calculated" |
| Payroll blocker panel ("why is payroll blocked?") | 8F | Per-employee blockers with resolution links |
| Payroll warnings panel | 8F | Non-blocking issues (pending leave, variance) |
| Basic payroll reports (summary, period cost) | 8H | StatTile + table views |
| PDF payslip (individual) | 8G | Client-side @react-pdf/renderer |
| Payroll audit events | 8D | Every run/finalize/reverse logged |
| Loans with installment schedule | 8B/8D | Create loan, auto-deduct from payslip |
| Salary advance (type=advance) | 8B/8D | One-click request, deduct from next payroll |
| Reimbursement requests with approval | 8B/8D | Request → approve → add to payslip as one-time allowance |
| Reversal workflow (creates negated adjustment payslip) | 8D | Never delete finalized payslips |
| Live projected pay (basic — salaried + hourly) | 8F | Clearly labeled as "estimate, not final" |
| Overtime pay (day-type-based multipliers) | 8C | From approved attendance records by dayType |
| Unpaid leave deduction | 8C | From approved leave requests WHERE isPaid=false |
| Country profile template structure | 8B | GY seeded; TT/JM/BB as blank templates |

### Can Defer (Phase 9+)

| Feature | Defer To | Reason |
|---------|----------|--------|
| Bank file export (Republic Bank eZpay, etc.) | Phase 9 | Format-specific, needs bank specs |
| GRA PAYE Form 5 CSV | Phase 9 | Statutory report, needs format verification |
| NIS Schedule export | Phase 9 | Statutory report, needs format verification |
| Leave encashment | Phase 10+ | Needs payroll engine + leave balance integration |
| Final settlement (termination pay) | Phase 10+ | Needs offboarding module |
| Retroactive arrears (backdated salary changes) | Phase 10+ | Complex — recalculate historical payslips |
| Multi-country beyond template structure | Phase 9+ | TT/JM/BB rates need official verification |
| Batch PDF generation (100+ payslips) | Phase 10 | May need server-side queue |
| Accounting/GL integration | Phase 10+ | Needs accounting module |
| Gratuity engine | Phase 10+ | Multi-jurisdiction tiered formulas |
| Salary increase simulator ("what if") | Phase 10+ | UX feature, not core engine |
| Compensatory leave → payroll | Phase 10+ | Needs compensatory leave feature |

---

## Proposed Entities

### Money Precision Rules

All money fields use `numeric(12, 2)` for exact decimal arithmetic. Percentage rates use `numeric(5, 2)`. Round each line item to 2 decimal places individually. Calculate totals from rounded line items. Currency code is explicit text (ISO 4217), never assumed.

### 1. `country_payroll_profile`

**Purpose**: Per-org, per-country statutory rules. Seeded from templates but org-customizable.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | Org-scoped (not global) |
| countryCode | text | NOT NULL | ISO 3166-1 alpha-2 (GY, TT, JM, BB) |
| countryName | text | NOT NULL | "Guyana", "Trinidad and Tobago" |
| currency | text | NOT NULL | ISO 4217 (GYD, TTD, JMD) |
| taxBrackets | jsonb | NOT NULL | Array: `[{min, max, rate, fixedAmount}]` |
| personalAllowanceFormula | text | NOT NULL, default "standard" | "standard" = max(threshold, gross÷3); "fixed" = flat amount |
| personalAllowanceThreshold | numeric(12,2) | nullable | GY: $140,000/month |
| childAllowancePerChild | numeric(12,2) | nullable | GY: $10,000/child under 18 |
| overtimeAllowanceCap | numeric(12,2) | nullable | GY: $50,000/month (non-taxable statutory portion) |
| insurancePremiumCapFormula | text | nullable | GY: "min(premium, 10% gross, $50,000)" |
| insurancePremiumCapAmount | numeric(12,2) | nullable | GY: $50,000/month |
| employeeNISRate | numeric(5,2) | NOT NULL | GY: 5.6% |
| employerNISRate | numeric(5,2) | NOT NULL | GY: 8.4% |
| nisMaxEarnings | numeric(12,2) | nullable | GY: $280,000/month |
| effectiveYear | integer | NOT NULL | 2026 — versioned per year |
| isActive | boolean | NOT NULL, default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, countryCode, effectiveYear)
**Indexes**: (organizationId), (countryCode, effectiveYear)
**Tenant scope**: organizationId
**Archive**: isActive flag. Old years kept for historical payslip reference.
**Audit**: All changes logged — rate changes affect all future payslips.
**Deletion**: Never hard delete — deactivate. Historical payslips reference these rates.

### 2. `payroll_setting`

**Purpose**: Per-org payroll configuration — work schedule, OT policy, defaults.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, UNIQUE, NOT NULL | One per org |
| defaultCurrency | text | NOT NULL, default "GYD" | ISO 4217 |
| defaultPayFrequency | text | NOT NULL, default "monthly" | weekly/fortnightly/semi_monthly/monthly |
| weekdayOvertimeMultiplier | numeric(3,2) | NOT NULL, default 1.5 | Labour Act |
| saturdayMultiplier | numeric(3,2) | NOT NULL, default 1.5 | Employer policy |
| sundayMultiplier | numeric(3,2) | NOT NULL, default 2.0 | Labour Act |
| publicHolidayMultiplier | numeric(3,2) | NOT NULL, default 2.0 | Labour Act |
| nightShiftMultiplier | numeric(3,2) | NOT NULL, default 1.0 | Configurable |
| workDays | jsonb | NOT NULL, default [1,2,3,4,5] | Array of ISO weekday numbers (1=Mon, 7=Sun) |
| standardHoursPerDay | numeric(4,2) | NOT NULL, default 8.0 | |
| lunchDeductionMinutes | integer | NOT NULL, default 0 | 0 = no auto-deduction |
| minimumNetPayThreshold | numeric(12,2) | nullable | Warn if net pay falls below |
| autoGenerateEnabled | boolean | NOT NULL, default false | |
| autoGenerateDay | integer | nullable | Day of month (1–28) |
| setupChecklistCompleted | jsonb | NOT NULL, default {} | Tracks which setup steps are done |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId)
**Indexes**: (organizationId)
**Tenant scope**: organizationId
**Archive**: N/A — one per org, overwritten.
**Audit**: All changes logged.

### 3. `pay_period`

**Purpose**: Defines payroll period boundaries. One per org per pay cycle.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| name | text | NOT NULL | Auto-generated: "May 2026 Payroll" |
| startDate | date | NOT NULL | |
| endDate | date | NOT NULL | |
| frequency | text | NOT NULL | weekly/fortnightly/semi_monthly/monthly/custom |
| workingDays | integer | NOT NULL | Calculated: total days minus weekends, holidays, company leaves |
| expectedHours | numeric(8,2) | NOT NULL | workingDays × standardHoursPerDay |
| status | text | NOT NULL, default "open" | open/processing/closed |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, startDate, endDate)
**Indexes**: (organizationId, status), (organizationId, startDate)
**Status lifecycle**: open → processing (payroll run started) → closed (all payslips finalized)
**Tenant scope**: organizationId
**Audit**: Status transitions.
**Deletion**: Never delete closed periods. Open periods can be deleted if no payroll run exists.

### 4. `pay_item`

**Purpose**: Configurable allowance or deduction rule. The rule engine that targets pay items to employees.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| type | payItemTypeEnum | NOT NULL | allowance/deduction |
| category | text | NOT NULL, default "custom" | statutory/standard/custom — for UI grouping |
| title | text | NOT NULL | "Housing Allowance", "NIS Employee" |
| description | text | nullable | Helper text for non-technical users |
| isFixed | boolean | NOT NULL, default true | |
| fixedAmount | numeric(12,2) | nullable | If isFixed=true |
| basedOn | text | nullable | basic_pay/gross_pay/taxable_gross/attendance/overtime |
| rate | numeric(5,2) | nullable | Percentage (e.g., 5.6 for NIS) |
| isTaxable | boolean | NOT NULL, default true | For allowances: included in taxable gross? |
| isPreTax | boolean | NOT NULL, default false | For deductions: deducted before tax calc? |
| isTax | boolean | NOT NULL, default false | Is this the tax deduction itself (PAYE)? |
| isStatutory | boolean | NOT NULL, default false | Auto-created from country profile? |
| employerRate | numeric(5,2) | nullable | Employer contribution % (NIS employer) |
| includeAllActive | boolean | NOT NULL, default true | Apply to all active employees? |
| isConditionBased | boolean | NOT NULL, default false | |
| conditions | jsonb | nullable | Array: `[{field, operator, value}]` |
| oneTimeDate | date | nullable | For one-time allowances/deductions |
| hasMaxLimit | boolean | NOT NULL, default false | |
| maxAmount | numeric(12,2) | nullable | Cap amount |
| sortOrder | integer | NOT NULL, default 0 | Processing order |
| isActive | boolean | NOT NULL, default true | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId, type), (organizationId, isActive)
**Enum**: `payItemTypeEnum` — allowance, deduction
**Tenant scope**: organizationId
**Archive**: isActive flag. Never hard delete — historical payslips reference pay items.
**Audit**: All changes logged — changes affect future payslips.

### 5. `pay_item_assignment`

**Purpose**: Junction table for specific employee targeting or exclusion on a pay item.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| payItemId | text | FK → pay_item.id, cascade, NOT NULL | |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| isExcluded | boolean | NOT NULL, default false | false = specifically included, true = excluded |
| overrideAmount | numeric(12,2) | nullable | Employee-specific override |
| createdAt | timestamp | defaultNow | |

**Unique**: (payItemId, employeeId)
**Indexes**: (payItemId), (employeeId)
**Deletion**: Cascade with pay_item.

### 6. `payroll_run`

**Purpose**: A batch payroll generation event. Tracks the run itself, not individual payslips.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| payPeriodId | text | FK → pay_period.id, restrict, NOT NULL | |
| batchName | text | NOT NULL | "May 2026 Payroll — Run 1" |
| status | payrollRunStatusEnum | NOT NULL, default "draft" | draft/preview/confirmed/paid/reversed |
| employeeCount | integer | NOT NULL, default 0 | |
| totalGross | numeric(14,2) | NOT NULL, default 0 | |
| totalDeductions | numeric(14,2) | NOT NULL, default 0 | |
| totalNet | numeric(14,2) | NOT NULL, default 0 | |
| totalEmployerContributions | numeric(14,2) | NOT NULL, default 0 | NIS employer, etc. |
| currency | text | NOT NULL | ISO 4217 |
| blockerCount | integer | NOT NULL, default 0 | Employees that couldn't be processed |
| warningCount | integer | NOT NULL, default 0 | Employees with warnings |
| overrides | jsonb | nullable | `[{employeeId, overrideType, reason}]` |
| confirmedAt | timestamp | nullable | When finalized |
| confirmedBy | text | FK → user.id, nullable | |
| paidAt | timestamp | nullable | When marked paid |
| paidBy | text | FK → user.id, nullable | |
| reversedAt | timestamp | nullable | |
| reversedBy | text | FK → user.id, nullable | |
| reversalReason | text | nullable | |
| countryProfileId | text | FK → country_payroll_profile.id, nullable | Snapshot: which rates were used |
| generatedBy | text | FK → user.id, NOT NULL | Who initiated the run |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (organizationId, payPeriodId, batchName)
**Indexes**: (organizationId, status), (payPeriodId)
**Enum**: `payrollRunStatusEnum` — draft, preview, confirmed, paid, reversed
**Status lifecycle**: draft → preview → confirmed → paid. Reversed creates a new reversal run.
**Tenant scope**: organizationId
**Audit**: Every status transition, overrides, confirmation, payment, reversal.
**Deletion**: Never delete — reverse instead. Draft runs can be deleted.

### 7. `payslip`

**Purpose**: Individual employee compensation record for a period. The core payroll output.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| payrollRunId | text | FK → payroll_run.id, restrict, NOT NULL | |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| contractId | text | FK → contract.id, restrict, NOT NULL | Active contract at time of generation |
| periodStart | date | NOT NULL | |
| periodEnd | date | NOT NULL | |
| currency | text | NOT NULL | |
| contractWage | numeric(12,2) | NOT NULL | Wage from contract at generation time |
| wageType | text | NOT NULL | hourly/daily/monthly — snapshot |
| basicPay | numeric(12,2) | NOT NULL | After prorations/leave deductions |
| grossPay | numeric(12,2) | NOT NULL | basic + all allowances |
| taxableGross | numeric(12,2) | NOT NULL | gross - pre-tax deductions - personal allowance |
| totalDeductions | numeric(12,2) | NOT NULL | All deductions including tax |
| netPay | numeric(12,2) | NOT NULL | gross - totalDeductions |
| totalEmployerContributions | numeric(12,2) | NOT NULL, default 0 | NIS employer, etc. |
| workedDays | numeric(6,2) | NOT NULL | From attendance |
| workedHours | numeric(8,2) | NOT NULL | From attendance |
| overtimeHours | numeric(8,2) | NOT NULL, default 0 | From approved OT |
| paidLeaveDays | numeric(6,2) | NOT NULL, default 0 | |
| unpaidLeaveDays | numeric(6,2) | NOT NULL, default 0 | |
| holidayDays | integer | NOT NULL, default 0 | |
| status | payslipStatusEnum | NOT NULL, default "draft" | draft/confirmed/paid |
| isReversed | boolean | NOT NULL, default false | |
| reversalOfId | text | FK → payslip.id, nullable | Links reversal to original |
| explanation | jsonb | nullable | Human-readable calculation breakdown |
| blockers | jsonb | nullable | Any blockers at generation time |
| warnings | jsonb | nullable | Any warnings at generation time |
| sentToEmployee | boolean | NOT NULL, default false | |
| generatedAt | timestamp | defaultNow | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: (employeeId, periodStart, periodEnd, payrollRunId)
**Indexes**: (organizationId, status), (employeeId), (payrollRunId), (periodStart, periodEnd)
**Enum**: `payslipStatusEnum` — draft, confirmed, paid
**Status lifecycle**: draft → confirmed → paid. Reversals create new payslips with negative amounts.
**Tenant scope**: organizationId
**Sensitive**: Payslip data is highly confidential. Employee sees own only.
**Audit**: All status transitions. Draft edits allowed; confirmed payslips are immutable except via reversal.
**Deletion**: Never delete confirmed/paid payslips. Draft payslips can be deleted (cascade from payroll_run).

### 8. `payslip_line_item`

**Purpose**: Individual line item on a payslip. Normalized table (not JSON) for queryability and reporting.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| payslipId | text | FK → payslip.id, cascade, NOT NULL | |
| payItemId | text | FK → pay_item.id, nullable | null for computed items (base pay, tax) |
| type | payslipLineTypeEnum | NOT NULL | earning/deduction/tax/employer_contribution |
| category | text | NOT NULL | base_pay/allowance/overtime/statutory/pre_tax/post_tax/loan/reimbursement |
| title | text | NOT NULL | Human-readable: "Housing Allowance" |
| amount | numeric(12,2) | NOT NULL | Positive for earnings, positive for deductions (sign determined by type) |
| isEmployerContribution | boolean | NOT NULL, default false | |
| isTaxable | boolean | NOT NULL, default false | |
| explanation | text | nullable | "5.6% of gross ($407,000), capped at $15,680" |
| sortOrder | integer | NOT NULL, default 0 | Display order on payslip |
| createdAt | timestamp | defaultNow | |

**Indexes**: (payslipId), (payItemId)
**Enum**: `payslipLineTypeEnum` — earning, deduction, tax, employer_contribution
**Deletion**: Cascade with payslip.

### 9. `payroll_issue`

**Purpose**: Tracks blockers and warnings for each employee in a payroll run.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| payrollRunId | text | FK → payroll_run.id, cascade, NOT NULL | |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| severity | text | NOT NULL | blocker/warning |
| code | text | NOT NULL | NO_CONTRACT, MISSING_BANK, UNVALIDATED_ATTENDANCE, etc. |
| message | text | NOT NULL | Plain-language: "No active contract found for Maya Persaud" |
| resolution | text | nullable | "Create a contract to include them in payroll." |
| resolvedAt | timestamp | nullable | |
| resolvedBy | text | FK → user.id, nullable | |
| isOverridden | boolean | NOT NULL, default false | Admin chose to proceed despite issue |
| overriddenBy | text | FK → user.id, nullable | |
| overrideReason | text | nullable | |
| createdAt | timestamp | defaultNow | |

**Indexes**: (payrollRunId, severity), (employeeId)
**Deletion**: Cascade with payroll_run.

### 10. `loan`

**Purpose**: Employee loan or salary advance with installment tracking.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| type | loanTypeEnum | NOT NULL | loan/advance/fine |
| title | text | NOT NULL | "Emergency Loan — May 2026" |
| amount | numeric(12,2) | NOT NULL | Total loan amount |
| currency | text | NOT NULL | |
| providedDate | date | NOT NULL | |
| totalInstallments | integer | NOT NULL | |
| installmentAmount | numeric(12,2) | NOT NULL | Per-period deduction |
| installmentStartDate | date | NOT NULL | |
| paidInstallments | integer | NOT NULL, default 0 | Running count |
| remainingBalance | numeric(12,2) | NOT NULL | Updated after each payslip |
| status | loanStatusEnum | NOT NULL, default "active" | active/settled/written_off |
| settledAt | timestamp | nullable | |
| description | text | nullable | |
| approvedBy | text | FK → user.id, nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Unique**: none (employee can have multiple active loans)
**Indexes**: (organizationId), (employeeId, status)
**Enum**: `loanTypeEnum` — loan, advance, fine. `loanStatusEnum` — active, settled, written_off.
**Tenant scope**: organizationId
**Audit**: Creation, settlement, write-off.
**Deletion**: Never hard delete. Settle or write off.

### 11. `loan_installment`

**Purpose**: Individual installment in a loan schedule.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| loanId | text | FK → loan.id, cascade, NOT NULL | |
| sequenceNumber | integer | NOT NULL | 1, 2, 3... |
| dueDate | date | NOT NULL | |
| amount | numeric(12,2) | NOT NULL | |
| isPaid | boolean | NOT NULL, default false | |
| payslipId | text | FK → payslip.id, nullable | Links to payslip that deducted this |
| paidAt | timestamp | nullable | |
| createdAt | timestamp | defaultNow | |

**Unique**: (loanId, sequenceNumber)
**Indexes**: (loanId), (payslipId)
**Deletion**: Cascade with loan.

### 12. `reimbursement`

**Purpose**: Expense claim or reimbursement request.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK, cuid2 | |
| organizationId | text | FK → organization.id, NOT NULL | |
| employeeId | text | FK → employee_profile.id, restrict, NOT NULL | |
| type | reimbursementTypeEnum | NOT NULL | expense/leave_encash/bonus_encash |
| title | text | NOT NULL | |
| amount | numeric(12,2) | NOT NULL | |
| currency | text | NOT NULL | |
| reimbursementDate | date | NOT NULL | When to apply to payslip |
| attachmentUrl | text | nullable | |
| status | reimbursementStatusEnum | NOT NULL, default "requested" | requested/approved/rejected/paid |
| approvedBy | text | FK → user.id, nullable | |
| payslipId | text | FK → payslip.id, nullable | Links to payslip that included this |
| description | text | nullable | |
| createdAt | timestamp | defaultNow | |
| updatedAt | timestamp | defaultNow, $onUpdate | |

**Indexes**: (organizationId, status), (employeeId)
**Enum**: `reimbursementTypeEnum` — expense, leave_encash, bonus_encash. `reimbursementStatusEnum` — requested, approved, rejected, paid.
**Tenant scope**: organizationId
**Audit**: Status transitions.

### 13. `projected_pay_snapshot` (Deferred — Phase 9+)

Projected pay is calculated on-the-fly from current data, not stored. If caching becomes necessary for performance, this table will store periodic snapshots. For Phase 8, projections are computed live from attendance + leave + contract data.

### Entity Relationship Summary

```
country_payroll_profile ←── payroll_run.countryProfileId
payroll_setting ←── org config
pay_period ←── payroll_run.payPeriodId
pay_item ←── payslip_line_item.payItemId
pay_item_assignment ←── pay_item.id + employee_profile.id
payroll_run ←── pay_period + generated payslips
payslip ←── payroll_run + employee_profile + contract
payslip_line_item ←── payslip.id
payroll_issue ←── payroll_run + employee_profile
loan ←── employee_profile
loan_installment ←── loan + payslip (when paid)
reimbursement ←── employee_profile + payslip (when paid)

Cross-module reads (not foreign keys):
  payslip → attendance_record WHERE payrollStatus='approved' AND date in period
  payslip → leave_request WHERE status='approved' AND dates overlap period
  payslip → holiday WHERE date in period
  payslip → company_leave_day (for working days calculation)
  payslip → filing_status (from contract.filingStatusId)
```

---

## Payroll Input Contract

### PayrollInput

```typescript
interface PayrollInput {
  employee: {
    id: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    departmentId: string | null;
    departmentName: string | null;
  };

  contract: {
    id: string;
    baseSalary: number;       // numeric(12,2)
    wageType: "hourly" | "daily" | "monthly";
    payFrequency: "weekly" | "monthly" | "semi_monthly";
    salaryCurrency: string;   // ISO 4217
    filingStatusId: string | null;
    deductLeaveFromBasicPay: boolean;
  };

  period: {
    startDate: string;        // ISO date
    endDate: string;
    workingDays: number;      // Calculated from payroll_setting.workDays minus holidays/company leaves
    expectedHours: number;    // workingDays × standardHoursPerDay
  };

  attendance: {
    totalWorkedMinutes: number;
    totalApprovedOvertimeMinutes: number;
    overtimeByDayType: {
      weekday: number;        // minutes at 1.5× (or configured multiplier)
      saturday: number;       // minutes at configured multiplier
      sunday: number;         // minutes at 2×
      holiday: number;        // minutes at 2×
    };
    daysPresent: number;
    daysHalfDay: number;
    daysAbsent: number;
    daysHoliday: number;
    pendingItems: number;     // unvalidated + pending corrections
    isComplete: boolean;      // all days in period have records
  };

  leave: {
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    pendingLeaveDays: number;  // warning only — not deducted
  };

  holidays: {
    count: number;
    dates: string[];           // ISO dates
  };

  payItems: {
    allowances: PayItemInput[];
    deductions: PayItemInput[];
  };

  loans: {
    dueInstallments: LoanInstallmentInput[];
  };

  reimbursements: {
    approved: ReimbursementInput[];
  };

  countryProfile: {
    taxBrackets: TaxBracket[];
    personalAllowanceFormula: string;
    personalAllowanceThreshold: number;
    childAllowancePerChild: number;
    overtimeAllowanceCap: number;
    insurancePremiumCapAmount: number;
    employeeNISRate: number;
    employerNISRate: number;
    nisMaxEarnings: number;
    effectiveYear: number;
  };

  settings: {
    overtimeMultipliers: {
      weekday: number;
      saturday: number;
      sunday: number;
      publicHoliday: number;
      nightShift: number;
    };
    standardHoursPerDay: number;
    lunchDeductionMinutes: number;
    minimumNetPayThreshold: number | null;
  };
}

interface PayItemInput {
  payItemId: string;
  title: string;
  isFixed: boolean;
  fixedAmount: number | null;
  basedOn: string | null;
  rate: number | null;
  isTaxable: boolean;
  isPreTax: boolean;
  isTax: boolean;
  isStatutory: boolean;
  employerRate: number | null;
  maxAmount: number | null;
  overrideAmount: number | null;  // from pay_item_assignment
}

interface LoanInstallmentInput {
  loanId: string;
  installmentId: string;
  loanTitle: string;
  amount: number;
  sequenceNumber: number;
  totalInstallments: number;
}

interface ReimbursementInput {
  id: string;
  title: string;
  amount: number;
}

interface TaxBracket {
  min: number;
  max: number | null;         // null = no upper limit
  rate: number;               // decimal (0.25 = 25%)
  fixedAmount: number;        // fixed amount added at this bracket
}
```

### PayrollPreviewResult

```typescript
interface PayrollPreviewResult {
  employeeId: string;
  employeeName: string;
  isPayrollReady: boolean;

  basicPay: number;
  grossPay: number;
  taxableGross: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerContributions: number;

  lineItems: PayslipLineItemResult[];
  blockers: PayrollBlocker[];
  warnings: PayrollWarning[];
  explanation: CalculationExplanation[];

  confidence: "high" | "medium" | "low" | "cannot_estimate";
  isEstimate: boolean;        // always true for preview
}

interface PayslipLineItemResult {
  payItemId: string | null;
  type: "earning" | "deduction" | "tax" | "employer_contribution";
  category: string;
  title: string;
  amount: number;
  isTaxable: boolean;
  isEmployerContribution: boolean;
  explanation: string;
  sortOrder: number;
}
```

### PayrollRunResult

```typescript
interface PayrollRunResult {
  payrollRunId: string;
  batchName: string;
  status: "draft" | "preview" | "confirmed" | "paid";
  periodStart: string;
  periodEnd: string;
  currency: string;

  summary: {
    employeesProcessed: number;
    employeesBlocked: number;
    employeesWithWarnings: number;
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    totalEmployerContributions: number;
  };

  payslips: PayrollPreviewResult[];
  issues: PayrollIssue[];

  comparisonToPrevious: {
    grossDelta: number;
    grossDeltaPercent: number;
    netDelta: number;
    employeeCountDelta: number;
  } | null;
}
```

### PayrollBlocker

```typescript
interface PayrollBlocker {
  code: string;
  severity: "blocker";
  message: string;            // Plain-language: "No active contract found for Maya Persaud"
  resolution: string;         // "Create a contract to include them in payroll."
  resolutionLink: string;     // "/app/employees/{id}/contracts"
}
```

### PayrollWarning

```typescript
interface PayrollWarning {
  code: string;
  severity: "warning";
  message: string;
  suggestedAction: string;
}
```

### ProjectedPayResult

```typescript
interface ProjectedPayResult {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  isEstimate: true;           // always true
  confidence: "high" | "medium" | "low" | "cannot_estimate";
  confidenceReason: string;   // "Based on approved hours only — 85% of period complete"

  estimatedGross: number;
  estimatedDeductions: number;
  estimatedNet: number;

  breakdown: {
    basePay: number;
    overtimePay: number;
    allowances: number;
    deductions: number;
    tax: number;
    loanDeductions: number;
  };

  disclaimers: string[];      // ["This is not your final payslip", "Based on approved hours only"]
}
```

---

## Guyana Payroll Logic Plan

### PAYE (Pay As You Earn) Income Tax

| Rule | Value | Status |
|------|-------|--------|
| First bracket rate | 25% | ✅ Verified (GRA 2026) |
| First bracket ceiling (monthly) | GYD $280,000 | ✅ Verified (GRA 2026) |
| Second bracket rate | 35% | ✅ Verified (GRA 2026) |
| Second bracket floor (monthly) | > GYD $280,000 | ✅ Verified |
| Basis | Taxable gross pay (gross - pre-tax deductions - personal allowance) | ✅ Verified |

**Frequency scaling**: Monthly thresholds scale proportionally. Weekly = monthly ÷ 4.33. Fortnightly = monthly ÷ 2.17. Daily = monthly ÷ 21.67. Yearly = monthly × 12.

**Calculation**:
```
taxableIncome = grossPay - preTaxDeductions - personalAllowance
if taxableIncome <= 0: tax = 0
elif taxableIncome <= 280,000: tax = taxableIncome × 0.25
else: tax = 280,000 × 0.25 + (taxableIncome - 280,000) × 0.35
```

### NIS (National Insurance Scheme)

| Rule | Value | Status |
|------|-------|--------|
| Employee contribution rate | 5.6% | ✅ Verified (NIS) |
| Employer contribution rate | 8.4% | ✅ Verified (NIS) |
| Monthly earnings ceiling | GYD $280,000 | ✅ Verified |
| Max employee deduction (monthly) | GYD $15,680 | ✅ Verified (5.6% × $280,000) |
| Max employer contribution (monthly) | GYD $23,520 | ✅ Verified (8.4% × $280,000) |
| Basis | Gross pay (capped at ceiling) | ✅ Verified |
| Treatment | Pre-tax deduction | ✅ Verified |

**Calculation**:
```
nisBase = min(grossPay, nisMaxEarnings)
employeeNIS = nisBase × 0.056
employerNIS = nisBase × 0.084
```

### Personal Allowance

| Rule | Value | Status |
|------|-------|--------|
| Formula | max(GYD $140,000, gross ÷ 3) | ✅ Verified (GRA 2026) |
| Monthly threshold | GYD $140,000 | ✅ Verified (raised from $130,000 in 2026 budget) |
| Frequency scaling | Scales proportionally (weekly = $32,333) | ✅ Verified from gy-taxcalc |

**Note**: Personal allowance is NOT a deduction — it's a reduction to taxable income. It appears in the calculation between gross and taxable income.

### Child Allowance

| Rule | Value | Status |
|------|-------|--------|
| Amount per child | GYD $10,000/month per child under 18 | ✅ Verified (GRA 2026) |
| Limit | One parent per child only | ✅ Verified |
| Treatment | Reduces taxable income (not a deduction) | ✅ Verified |

**Implementation**: Requires employee profile field for `numberOfDependentChildren` (integer). This feeds into taxable income reduction alongside personal allowance.

**Note**: Child allowance needs a field on `employee_profile` or a dependent-tracking table. For Phase 8, add `dependentChildren` (integer, default 0) to employee_work_info or handle via a condition-based pay item.

### Overtime Allowance Cap

| Rule | Value | Status |
|------|-------|--------|
| Non-taxable statutory portion | GYD $50,000/month | ✅ Verified (GRA 2026) |
| Above cap | Taxable | ✅ Verified |
| Treatment | Overtime pay up to $50K is non-taxable; above is taxable | ✅ Verified |

**Implementation**: Overtime pay is split into two line items: "Overtime (non-taxable)" up to cap, "Overtime (taxable)" for the remainder.

### Insurance Premium Deduction

| Rule | Value | Status |
|------|-------|--------|
| Cap formula | min(premium, 10% of gross, GYD $50,000/month) | ✅ Verified (GRA 2026) |
| Annual cap | GYD $600,000 | ✅ Verified |
| Treatment | Pre-tax deduction | ✅ Verified |
| Applies to | Group life/health insurance premiums | ✅ Verified |

**Implementation**: Insurance is a pay_item (type=deduction, isPreTax=true). The cap logic is a special handler in the deduction calculator that applies the min(premium, 10%×gross, capAmount) formula.

### Employer-Configurable Items

| Item | Default | Status |
|------|---------|--------|
| Weekday OT rate | 1.5× | ✅ Verified (Labour Act) — configurable in payroll_setting |
| Sunday/rest day OT rate | 2.0× | ✅ Verified (Labour Act) — configurable |
| Public holiday OT rate | 2.0× | ✅ Verified (Labour Act) — configurable |
| Saturday OT rate | 1.5× | ⚠️ NOT statutory — employer policy only |
| Night shift differential | 1.0× | ⚠️ Employer-configurable, no statutory rate |
| Qualification allowances (ACCA $15K, Masters $22K, PhD $32K) | Per public-sector circulars | ⚠️ Public-sector only — model as configurable pay items |
| Gratuity | 22.5% of base (common) | ⚠️ NOT statutory — employer-specific |
| Credit union deductions | Various | ⚠️ Employer-configurable post-tax deduction |
| Housing/transport/meal allowances | Various | ⚠️ Employer-configurable |

### Deferred Rules

| Item | Status | Reason |
|------|--------|--------|
| Severance pay (1 week/year of service) | Deferred to Phase 10+ | Needs offboarding module |
| Maternity leave pay (70% via NIS for 13 weeks) | Deferred | NIS benefit, not employer-calculated |
| Minimum wage enforcement ($60,147/month estimate) | Needs verification | Verify 2026 minimum wage |
| Mid-period proration | Deferred | Complex — need spec for how to handle joins/terminations mid-period |
| Retroactive arrears | Deferred | Complex — need spec for recalculating historical payslips |

---

## Payroll Calculation Order

The payroll engine processes each employee independently, in this exact sequence:

```
 1. LOAD employee profile + active contract
    └─ If no active contract → BLOCKER: "No active contract"

 2. LOAD approved attendance records for period
    └─ Sum workedMinutes, overtimeMinutes by dayType
    └─ If hourly/daily employee has zero attendance → WARNING

 3. LOAD approved leave requests overlapping period
    └─ Separate paid vs unpaid leave days
    └─ Pending leave → WARNING (not deducted)

 4. COMPUTE base pay
    ├─ monthly: baseSalary from contract
    ├─ daily: dailyRate × daysWorked (present + half_day×0.5)
    └─ hourly: hourlyRate × (workedMinutes ÷ 60)

 5. COMPUTE unpaid leave deduction
    └─ unpaidLeaveDays × (monthlySalary ÷ workingDaysInPeriod)
    └─ Adjust basicPay = basePay - unpaidLeaveDeduction

 6. COMPUTE overtime pay
    ├─ weekdayOT = (weekdayOTMinutes ÷ 60) × hourlyRate × weekdayMultiplier
    ├─ saturdayOT = (saturdayOTMinutes ÷ 60) × hourlyRate × saturdayMultiplier
    ├─ sundayOT = (sundayOTMinutes ÷ 60) × hourlyRate × sundayMultiplier
    ├─ holidayOT = (holidayOTMinutes ÷ 60) × hourlyRate × holidayMultiplier
    └─ totalOT = sum of above
    └─ Split into non-taxable (up to cap) and taxable (above cap)

 7. ADD taxable allowances
    └─ For each matching pay_item WHERE type=allowance AND isTaxable=true:
       compute amount (fixed or percentage of basedOn)

 8. ADD non-taxable allowances
    └─ For each matching pay_item WHERE type=allowance AND isTaxable=false:
       compute amount

 9. COMPUTE grossPay = basicPay + totalOT + taxableAllowances + nonTaxableAllowances

10. APPLY pre-tax deductions
    └─ For each matching pay_item WHERE type=deduction AND isPreTax=true:
       compute amount (with cap logic for insurance)
    └─ Include NIS employee contribution (5.6% of gross, capped)

11. COMPUTE personal allowance
    └─ max(threshold, grossPay ÷ 3) — frequency-scaled

12. COMPUTE child allowance
    └─ childAllowancePerChild × dependentChildren — frequency-scaled

13. COMPUTE taxableGross = grossPay - preTaxDeductions - personalAllowance - childAllowance - nonTaxableAllowances - nonTaxableOT

14. COMPUTE tax (PAYE)
    └─ Apply tax brackets to taxableGross
    └─ Using filing_status brackets from contract

15. APPLY post-tax deductions
    └─ For each matching pay_item WHERE type=deduction AND isPreTax=false AND isTax=false:
       compute amount (union dues, savings, etc.)

16. APPLY loan installments
    └─ Sum all due installments for this period

17. ADD approved reimbursements
    └─ One-time additions to this payslip

18. COMPUTE totals
    ├─ totalDeductions = preTaxDeductions + tax + postTaxDeductions + loanInstallments
    ├─ netPay = grossPay - totalDeductions + reimbursements
    ├─ totalEmployerContributions = NIS employer + any employer-rate pay items
    └─ If netPay < 0 → BLOCKER: "Deductions exceed gross pay"
    └─ If netPay < minimumThreshold → WARNING

19. GENERATE line items
    └─ One PayslipLineItem per calculation component, with explanation text

20. FLAG blockers/warnings
    └─ Aggregate all issues found during calculation

21. RETURN PayrollPreviewResult
    └─ isEstimate = true until payroll is finalized
```

**Key rules**:
- Steps 1–3 are data loading. If any critical data is missing, stop and flag blocker.
- Steps 4–18 are pure calculation. No side effects.
- Step 19 generates the audit-ready breakdown.
- The engine NEVER writes to the database. The oRPC router handles persistence.

---

## Payroll Blockers and Warnings

### Blockers (PREVENT payroll processing)

| Code | Message | Resolution | Resolution Link |
|------|---------|------------|-----------------|
| `NO_CONTRACT` | "No active contract found for {name}." | "Create a contract to include them in payroll." | `/app/employees/{id}` → contracts tab |
| `MISSING_SALARY` | "{name}'s contract has no salary set." | "Update the contract with a base salary." | `/app/employees/{id}` → contracts tab |
| `MISSING_COUNTRY_PROFILE` | "No country payroll profile configured for {country}." | "Set up the country profile in payroll settings." | `/app/payroll/settings` |
| `MISSING_FILING_STATUS` | "{name}'s contract has no filing status." | "Assign a filing status to the contract." | `/app/employees/{id}` → contracts tab |
| `NEGATIVE_NET_PAY` | "{name}'s deductions (${amount}) exceed gross pay (${amount})." | "Review deductions and loan installments." | Payslip preview |
| `DUPLICATE_PAYSLIP` | "A payslip already exists for {name} for this period." | "Edit the existing payslip or delete the draft." | `/app/payroll/payslips` |
| `UNRESOLVED_ATTENDANCE_EXCEPTION` | "{name} has unresolved attendance exceptions on {dates}." | "Resolve missing clock-outs or pending corrections." | `/app/attendance` → filter by employee |
| `MISSING_CLOCK_OUT` | "{name} didn't clock out on {date}." | "Add a manual clock-out or submit a correction." | `/app/attendance` → filter by employee |
| `ABSENT_WITHOUT_LEAVE` | "{name} has no attendance and no approved leave for {dates}." | "Add attendance, submit leave, or mark as unpaid absence." | `/app/attendance` or `/app/leave` |

### Warnings (DO NOT block — flag for review)

| Code | Message | Suggested Action |
|------|---------|-----------------|
| `PENDING_LEAVE` | "{count} leave requests pending for {name}." | "Approve or reject before finalizing." |
| `PENDING_OVERTIME` | "{hours}h OT pending approval for {name}." | "OT excluded from payroll unless approved." |
| `UNVALIDATED_ATTENDANCE` | "{count} attendance days not validated for {name}." | "Hours may change after validation." |
| `UNUSUAL_VARIANCE` | "{name}'s gross changed by {percent}% from last period." | "Review for accuracy." |
| `MISSING_BANK_DETAILS` | "Bank details not set for {name}." | "Update bank info for salary transfer." |
| `NEW_EMPLOYEE_MID_PERIOD` | "{name} joined on {date} (mid-period)." | "Salary will be prorated." |
| `CONTRACT_CHANGED` | "{name}'s contract changed during this period." | "Review which contract applies." |
| `LOW_CONFIDENCE` | "Estimate confidence is low — several items need review." | "Validate attendance and approve leave first." |
| `LOAN_EXCEEDS_THRESHOLD` | "Loan installment (${amount}) brings net pay below ${threshold}." | "Review loan terms or adjust threshold." |

---

## Payroll UI Plan

### Route Map

| Route | Purpose | Primary View | Role |
|-------|---------|-------------|------|
| `/app/payroll` | Payroll command center | Dashboard with stat tiles, status cards, action buttons | payroll_admin, hr_admin, tenant_owner |
| `/app/payroll/run` | Pay run wizard | Multi-step: period → employees → preview → generate | payroll_admin |
| `/app/payroll/payslips` | Payslip list | DataTable with filters, bulk actions | payroll_admin, hr_admin |
| `/app/payroll/payslips/$id` | Payslip detail | Gross-to-net breakdown, line items, audit trail | payroll_admin, hr_admin, employee (own) |
| `/app/payroll/settings` | Payroll configuration | Setup checklist, country profiles, OT rates, work schedule | payroll_admin, tenant_owner |
| `/app/payroll/pay-items` | Pay item rules | DataTable of allowances/deductions, create/edit sheet | payroll_admin |
| `/app/payroll/loans` | Loan management | DataTable of active loans, installment schedule | payroll_admin, hr_admin |
| `/app/payroll/reimbursements` | Reimbursement queue | DataTable with approval actions | payroll_admin, hr_admin |
| `/app/payroll/reports` | Payroll reports | Charts, tables, export buttons | payroll_admin, hr_admin, auditor |
| Employee profile → Payroll tab | Employee's payslip history, loan balance | DataTable of own payslips + loan progress | employee (own), hr_admin, payroll_admin |

### Route Details

#### `/app/payroll` — Command Center Dashboard

**Purpose**: At-a-glance payroll health. Answers: "Is payroll ready? Who is blocked? What will this cost?"

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Atlas Shipping / Payroll                                │
│ Payroll                                                 │
│ "May 2026 payroll period · 84 employees"                │
│                                                         │
│ [Run Payroll]  [View Payslips]  [Settings]              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ TOTAL    │ │ TOTAL    │ │ BLOCKED  │ │ PERIOD   │   │
│ │ GROSS    │ │ NET      │ │ EMPLOYEES│ │ STATUS   │   │
│ │$4.2M GYD│ │$3.1M GYD│ │ 3        │ │ Open     │   │
│ │ ↑ 2.1%  │ │ ↑ 1.8%  │ │ ↓ from 5 │ │ 85% done │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                         │
│ ┌─ Payroll Readiness ─────────────────────────────────┐ │
│ │ ✅ 81 employees ready                               │ │
│ │ ⚠️ 5 employees with warnings                        │ │
│ │ ❌ 3 employees blocked [View blocked]               │ │
│ │                                                      │ │
│ │ Confidence checks:                                   │ │
│ │ ✅ All contracts active                              │ │
│ │ ✅ Attendance validated (98%)                        │ │
│ │ ⚠️ 2 pending leave requests                         │ │
│ │ ❌ 1 employee has no contract                       │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ Recent Payroll Runs ───────────────────────────────┐ │
│ │ April 2026 Payroll    Paid    $3.9M    82 employees │ │
│ │ March 2026 Payroll    Paid    $3.8M    80 employees │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Stat tiles**: Total Gross, Total Net, Blocked Employees, Period Status (uses handoff `.stat` CSS)
**Actions**: [Run Payroll] (primary), [View Payslips], [Settings]
**Readiness panel**: Confidence checks with green/amber/red indicators
**Recent runs**: Last 3 payroll runs with status badges
**Charts**: Cost trend (small line chart), department breakdown (bar)
**Helper text**: "This dashboard shows the current payroll period. Click 'Run Payroll' to start processing."
**Export**: None on dashboard — go to `/app/payroll/reports`

#### `/app/payroll/run` — Pay Run Wizard

**Purpose**: Multi-step payroll generation. Preview before commit.

**Steps**:

1. **Period** — Select or create pay period. Auto-suggests based on last period.
   - Date range picker, batch name (auto-generated), working days calculated
   - Helper: "Select the pay period for this run. Working days are calculated automatically."

2. **Employees** — Select who to include.
   - Options: All active, by department, individual selection
   - DataTable with checkbox selection, search, filter
   - Shows employee count, total expected cost

3. **Preview** — Per-employee gross-to-net with expandable line items.
   - Green rows: ready. Amber: warnings. Red: blocked.
   - Expandable row shows full line-item breakdown
   - Sticky summary bar: total gross / deductions / net
   - "Why Blocked?" panel below red rows with resolution links

4. **Pre-Finalization Review** — Summary before generating.
   - Total gross, total net, total deductions, employee count
   - Comparison to last period (delta amounts and %)
   - Confidence checks (all green = safe to proceed)
   - Any overrides applied (audited)

5. **Generate** — Creates draft payslips. Shows success summary.
   - "84 payslips generated as drafts. 3 employees were skipped."
   - [View Payslips] [Finalize] [Discard Draft]

**Lenses**: N/A (wizard, not list view)
**Helper text**: Prominent at each step
**Charts**: None in wizard — focus on clarity
**Role**: payroll_admin only

#### `/app/payroll/payslips` — Payslip List

**Purpose**: View and manage generated payslips.

**Lenses**: All | Drafts | Confirmed | Paid | My Payslips (employee view)
**Filters**: Period, Status, Department, Employee search
**Table columns**: Employee, Period, Gross, Deductions, Net, Status, Actions
**Bulk actions**: Bulk Confirm, Bulk Mark Paid (with review step)
**Actions per row**: View Detail, Confirm (if draft), Mark Paid (if confirmed), Reverse (if paid)
**Helper text**: "Payslips are generated as drafts. Confirm them after review, then mark as paid when salary is transferred."
**Export**: CSV download of filtered view
**Role**: payroll_admin sees all; employee sees own only

#### `/app/payroll/payslips/$id` — Payslip Detail

**Purpose**: Full gross-to-net breakdown for one employee.

**Layout**:
```
┌─────────────────────────────────────────────────┐
│ Maya Persaud — May 2026 Payslip                 │
│ Status: Draft / Confirmed / Paid [badge]        │
│                                                  │
│ ┌─ Gross-to-Net Breakdown ────────────────────┐ │
│ │ Base Salary (from active contract)  $342,000 │ │
│ │ + Housing Allowance (fixed)         + 50,000 │ │
│ │ + Transport Allowance (non-tax)     + 15,000 │ │
│ │ = Gross Pay                          $407,000│ │
│ │                                              │ │
│ │ − NIS (5.6% of $280K cap)          − 15,680 │ │
│ │ − Personal Allowance (⅓ gross)     −135,667 │ │
│ │ = Taxable Income                    $255,653 │ │
│ │                                              │ │
│ │ − PAYE (25% on $255,653)           − 63,913 │ │
│ │ − Loan Installment (4/12)           − 8,333 │ │
│ │ = Take-Home Pay                     $319,074 │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌─ How This Was Calculated ───────────────────┐ │
│ │ [expandable section with detailed notes]     │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌─ What Changed from Last Period ─────────────┐ │
│ │ Housing Allowance: ↑ $5,000 (rate updated)  │ │
│ │ OT hours: ↑ 4h (more weekend work)          │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [Download PDF]  [Confirm]  [Reverse]             │
└─────────────────────────────────────────────────┘
```

**Charts**: Gross-to-net waterfall chart (Recharts Bar)
**Export**: PDF download (individual payslip)
**Helper text**: Every line item has a tooltip explaining the calculation
**Role**: payroll_admin/hr_admin see all; employee sees own with simplified view

#### `/app/payroll/settings` — Configuration

**Purpose**: Payroll setup and configuration.

**Sections**:
1. **Setup Checklist** (for first-time setup) — 6 steps with progress tracking
2. **Country Profiles** — List of configured profiles, create/edit
3. **Work Schedule** — Work days, standard hours, lunch deduction
4. **Overtime Policy** — Multipliers per day type
5. **General** — Default currency, pay frequency, auto-generation

**Helper text**: Heavy — every field has tooltip explaining what it does
**Wizard**: Country profile and work schedule use wizard pattern
**Role**: payroll_admin, tenant_owner

#### `/app/payroll/pay-items` — Pay Item Rules

**Purpose**: Configure allowances and deductions.

**Lenses**: All | Allowances | Deductions | Statutory | Inactive
**Table columns**: Title, Type, Calculation (fixed/$X or %X of Y), Taxable, Employees, Status
**Actions**: Create (with preset library), Edit, Deactivate, Duplicate
**Sheet**: Full pay item configuration form (wizard for new, sheet for edit)
**Preset library**: One-click add from common GY allowances/deductions
**Helper text**: "Pay items define how allowances and deductions are calculated for each employee."
**Role**: payroll_admin

#### `/app/payroll/loans` — Loan Management

**Purpose**: Track employee loans, salary advances, and fines.

**Lenses**: Active | Settled | Written Off | All
**Table columns**: Employee, Type, Amount, Installment, Paid/Total, Remaining, Status
**Actions**: Create Loan, View Schedule, Settle, Write Off
**Detail view**: Full installment schedule with progress bar ("Installment 4 of 12 — 67% remaining")
**Helper text**: "Loan installments are automatically deducted from payslips."
**Role**: payroll_admin, hr_admin

#### `/app/payroll/reimbursements` — Reimbursement Queue

**Purpose**: Approve/reject expense claims.

**Lenses**: Pending | Approved | Rejected | Paid | All
**Table columns**: Employee, Type, Title, Amount, Date, Status, Actions
**Actions**: Approve, Reject, Mark as Paid
**Helper text**: "Approved reimbursements are added to the next payslip as a one-time allowance."
**Role**: payroll_admin, hr_admin (approve/reject); employee (create/view own)

#### `/app/payroll/reports` — Payroll Reports

**Purpose**: Analytics, charts, exports.

See [Analytics and Reporting](#analytics-and-reporting) section below.

---

## Analytics and Reporting

Extends the cross-module [analytics-reporting-plan.md](analytics-reporting-plan.md).

### Dashboard Widgets (on `/app/payroll`)

| Widget | Chart Type | Data Source |
|--------|-----------|-------------|
| **Period stat tiles** (4 tiles) | StatTile | Total gross, total net, blocked count, period status |
| Payroll readiness | Progress + checklist | payroll_issue counts by severity |
| Recent runs | Table | Last 3 payroll_run records |

### Report Page Widgets (`/app/payroll/reports`)

| Widget | Chart Type | Data Source |
|--------|-----------|-------------|
| **Period summary stat tiles** | StatTile | Gross, deductions, net, employer contributions, headcount |
| Cost by period (12-month trend) | Line | payslip totals by period |
| Gross vs Net trend | Stacked Area | payslip grossPay/netPay by period |
| Cost by department | Bar | payslip grossPay grouped by department |
| PAYE + NIS totals | StatTile | payslip_line_item WHERE category='statutory' |
| Allowances breakdown | Pie/Donut | payslip_line_item WHERE type='earning' grouped by title |
| Deductions breakdown | Pie/Donut | payslip_line_item WHERE type='deduction' grouped by title |
| Overtime cost trend | Line | payslip_line_item WHERE category='overtime' by period |
| Payroll blockers by type | Bar | payroll_issue grouped by code |
| Pay variance from previous period | Table | Per-employee delta from last period |
| Employee payslip waterfall | Waterfall Bar | Single payslip gross-to-net flow |

### Payslip Detail Charts

| Widget | Chart Type | Location |
|--------|-----------|----------|
| Gross-to-net waterfall | Waterfall Bar | `/app/payroll/payslips/$id` |
| Earnings vs deductions split | Donut | `/app/payroll/payslips/$id` |

### PDF Exports

| Document | Library | Trigger |
|----------|---------|---------|
| Individual payslip | @react-pdf/renderer | "Download PDF" on payslip detail |
| Payroll run summary | @react-pdf/renderer | "Export Summary" on reports page |
| CSV export (payslip list) | Client-side CSV | "Export CSV" on payslip list |

### oRPC Analytics Procedures (Phase 8H)

```
payroll.analytics.periodSummary     → { gross, net, deductions, employer, headcount }
payroll.analytics.costByPeriod      → [{ period, gross, net, deductions }]
payroll.analytics.costByDepartment  → [{ departmentId, name, gross, headcount }]
payroll.analytics.statutoryTotals   → { paye, nisEmployee, nisEmployer }
payroll.analytics.allowanceBreakdown → [{ title, total, count }]
payroll.analytics.deductionBreakdown → [{ title, total, count }]
payroll.analytics.blockerSummary    → [{ code, count }]
payroll.analytics.payVariance       → [{ employeeId, name, prevGross, currGross, delta }]
```

---

## RBAC and Security

### Role Permissions

| Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| View payroll dashboard | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View salary/pay data | ✅ | ✅ | ✅ | ✅ | ❌ | Own only | ✅ |
| Configure payroll settings | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Configure pay items | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Create draft payroll run | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Preview payroll | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Finalize/confirm payroll | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Mark payroll as paid | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Reverse payroll | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View own payslips | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export payroll reports | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View payroll analytics | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Create/manage loans | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Request reimbursement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Approve reimbursement | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View sensitive statutory data | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

### Security Rules

| Rule | Enforcement |
|------|-------------|
| Salary/pay visibility is server-side | `authorizedProcedure("payslip", "read")` — employee role gets `WHERE employeeId = self` filter applied server-side |
| Employee sees own payslips only | `scopedEmployeeIds()` returns self only for employee role |
| Manager does NOT see pay data | Manager role has no payslip:read permission by default |
| Auditor is read-only | No mutation permissions — only `:read` actions |
| Every FK input is tenant-verified | All payroll procedures verify `organizationId` on every input entity (lesson from Phase 7 IDOR fixes) |
| Payslip finalization is immutable | Confirmed payslips cannot be edited — only reversed via reversal workflow |
| Reversal creates audit trail | Reversal payslip stores `reversalOfId`, `reversalReason`, `reversedBy` |
| No cross-tenant leakage | Every query includes `WHERE organizationId = orgId(context)` |
| PDF exports are audited | Audit event emitted when payslip PDF is generated |
| Payroll exports are logged | payroll_export_log (future) tracks who exported what and when |
| No hardcoded rates | All statutory rates come from country_payroll_profile, versioned per year |
| Calculation is server-side | Gross-to-net runs on the server, not client — no manipulation possible |

---

## Implementation Sequence

| Sub-phase | Scope | Depends On | Estimated Size |
|-----------|-------|-----------|----------------|
| **8A** | Payroll spec finalization (this document) | Phase 7H | Docs only |
| **8B** | Payroll DB schema + migration + seed | 8A | ~500 lines schema, ~300 lines seed |
| **8C** | Payroll calculation engine (`packages/payroll-engine/`) | 8A | ~1500 lines pure logic |
| **8D** | Payroll oRPC API (~30 procedures) | 8B + 8C | ~1500 lines router |
| **8E** | Payroll settings + pay items UI | 8D | ~800 lines (settings page, pay item CRUD) |
| **8F** | Payroll run wizard + payslip preview | 8D | ~1200 lines (wizard steps, preview table) |
| **8G** | Employee payslip view + PDF export | 8D | ~600 lines (payslip detail, PDF template) |
| **8H** | Payroll analytics/reports | 8D | ~800 lines (charts, report tables) |
| **8I** | Payroll QA/RBAC/compliance pass | 8E–8H | Security review, browser verification |

**Rationale for this sequence**:
- 8B (schema) must come first — everything depends on tables existing.
- 8C (engine) is a pure calculation library with no DB dependency — it can be built and tested against fixture data immediately after 8A.
- 8D (API) connects the engine to the database. Must follow 8B + 8C.
- 8E (settings/pay-items) is the prerequisite UI for configuring payroll. Users need this before they can run payroll.
- 8F (wizard) is the core user flow — depends on 8E for configuration to exist.
- 8G (payslip view/PDF) follows wizard since payslips need to exist first.
- 8H (analytics) comes after payslips exist to query.
- 8I (QA) is the final pass across everything.

---

## Open Questions

1. **`dependentChildren` field**: Where should the number of dependent children live? Options: (a) add to `employee_work_info` as integer column, (b) create a `dependent` table for tracking dependents, (c) handle via condition-based pay item. Recommendation: (a) for Phase 8, migrate to (b) later.

2. **Payroll run vs pay period**: Is a pay period always 1:1 with a payroll run? Or can multiple runs exist for the same period (e.g., supplementary run for missed employees)? Recommendation: Allow multiple runs per period — the unique constraint is (organizationId, payPeriodId, batchName).

3. **Bigint cents vs numeric(12,2)**: The v1 codebase used bigint cents for all money. The current schema uses `numeric(12,2)` (Postgres exact decimal). Both avoid floating-point. `numeric(12,2)` is consistent with existing HR Core/Contracts/Attendance schemas. Recommendation: Keep `numeric(12,2)` for consistency.

4. **Insurance premium cap logic**: The formula `min(premium, 10% of gross, $50K/month)` is a three-way min. Should this be hardcoded in the GY rules, or modeled as a pay_item with a custom cap formula? Recommendation: Hardcode in GY rules (`rules-gy-2026.ts`) since the formula is statutory and unique to Guyana.

5. **Payslip line items: JSON vs normalized table?** The payroll-spec.md mentions both options. Recommendation: Normalized `payslip_line_item` table for queryability (enables analytics, reporting, and per-item auditing). Store a summary JSON in `payslip.explanation` for fast rendering.

6. **Filing status ownership**: Filing statuses are currently org-scoped (from contracts-implementation-plan.md). Should country profiles auto-create filing statuses? Recommendation: Yes — when creating a GY country profile, auto-seed a "GY Standard PAYE" filing status with the correct brackets.

7. **Pay frequency enum**: Current contract enum has `weekly`, `monthly`, `semi_monthly`. The payroll spec adds `fortnightly` and `custom`. Should the contract enum be extended? Recommendation: Add `fortnightly` to `contractPayFrequencyEnum`. Custom periods use pay_period.frequency = "custom" without changing the contract enum.

8. **OT rate source**: Overtime multipliers live on `payroll_setting` (per-org). But the country profile also defines statutory defaults. When does the org setting override the country default? Recommendation: Country profile provides defaults; payroll_setting overrides. Engine uses payroll_setting values, which are initialized from country profile on creation.

9. **Concurrent payroll runs**: Two admins click "Run Payroll" simultaneously. How to prevent? Recommendation: Unique constraint on (employeeId, periodStart, periodEnd, payrollRunId) prevents duplicate payslips. The UI should check for existing draft runs before creating a new one.

10. **Holiday pay for hourly/daily workers**: Are holidays paid for non-salaried employees? Recommendation: Configurable per org — add `paidHolidaysForHourly` boolean to payroll_setting. Default: true (Labour Act requires holiday pay).
