# Payroll — Horilla Extraction

## Overview

Horilla's Payroll module handles the complete compensation lifecycle: contracts define base salary and wage type, allowances and deductions are configured as rules that apply to employees based on conditions, payslips are generated per period with gross-to-net calculations, and loans/reimbursements/encashments feed into payslips as one-time or recurring line items. Tax computation uses filing statuses and bracket-based or Python code logic.

## Horilla Files Inspected

- `payroll/models/models.py` (1926 lines) — FilingStatus, Contract, WorkRecord, Allowance, Deduction, Payslip, LoanAccount, Reimbursement, PayslipAutoGenerate, EncashmentGeneralSettings, PayrollGeneralSetting
- `payroll/models/tax_models.py` — Tax bracket definitions
- `payroll/views.py`, `payroll/forms.py`, `payroll/filters.py`
- OpenHRMS: `ohrms_loan/`, `ohrms_salary_advance/`, `hr_gratuity_settlement/`, `hr_insurance/`, `saudi_gosi/`, `uae_wps_report/`

## Important Models

### Contract

**Contract** — Employment agreement. Fields: contract_name, employee FK, contract_start_date, contract_end_date, wage_type (daily/monthly/hourly), pay_frequency (weekly/monthly/semi_monthly), wage (base salary amount), filing_status FK, contract_status (draft/active/expired/terminated), department FK, job_position FK, job_role FK, shift FK, work_type FK, notice_period_in_days, contract_document (file), deduct_leave_from_basic_pay, calculate_daily_leave_amount, deduction_for_one_leave_amount.

Key behaviors:
- Only one active contract per employee
- Only one draft contract per employee
- Auto-fills department/position/role/shift/work_type from employee work info if not specified
- Active contract syncs wage to employee's basic_salary
- Auto-expires if end_date < today

### Allowances & Deductions

**Allowance** — Pay additions. Highly configurable rule engine. Fields: title, one_time_date (for one-time allowances), include_active_employees (bool), specific_employees M2M, exclude_employees M2M, is_taxable, is_condition_based, field/condition/value (employee attribute conditions), is_fixed (bool), amount (if fixed), based_on (basic_pay/children/overtime/shift/work_type/attendance), rate (percentage), per_attendance_fixed_amount, per_children_fixed_amount, shift-specific amount, overtime hourly amount, work_type-specific amount, has_max_limit, maximum_amount, if_condition (conditional application based on pay-head ranges).

**Deduction** — Pay subtractions. Same rule engine as Allowance plus: is_tax (bool), is_pretax (bool), employer_rate (percentage), update_compensation (modify pay-head before other calculations). Based_on options include gross_pay, taxable_gross_pay, net_pay in addition to basic_pay.

Both support: condition-based targeting (filter employees by field/value), fixed or percentage amounts, max limits, one-time dates, employee inclusion/exclusion lists.

### Payslip

**Payslip** — Generated compensation record. Fields: group_name (batch name), reference, employee FK, start_date, end_date, pay_head_data (JSON — full calculation breakdown), contract_wage, basic_pay, gross_pay, deduction, net_pay, status (draft/review_ongoing/confirmed/paid), sent_to_employee (bool), installment_ids M2M (linked loan installments).

Status lifecycle: Draft → Review Ongoing → Confirmed → Paid.

### Loans

**LoanAccount** — Employee loan tracking. Fields: type (loan/advanced_salary/fine), title, employee FK, loan_amount, provided_date, installments (count), installment_start_date, installment_amount, settled (bool), settled_date. Each installment creates a Deduction record. Installment schedule: equal monthly payments starting from installment_start_date. Linked to Asset module (fine for damaged assets).

### Reimbursements

**Reimbursement** — Types: reimbursement (expense claim), bonus_encashment (cash out bonus points), leave_encashment (cash out leave days). Fields: title, type, employee FK, allowance_on (date to apply), amount, status (requested/approved/rejected), approved_by FK. On approval: creates a one-time Allowance targeting the specific employee. Leave encashment: deducts from AvailableLeave balance. Bonus encashment: deducts from BonusPoint.

### Tax

**FilingStatus** — Tax calculation method. Fields: filing_status (name), based_on (basic_pay/gross_pay/taxable_gross_pay), use_py (bool — use Python code for calculation), python_code (text). Linked to contracts.

### Auto-Generation

**PayslipAutoGenerate** — Configurable auto-generation on a specific day of the month. Fields: generate_day, auto_generate (bool), company FK.

## State Machine / Lifecycle

**Contract**: Draft → Active → Expired | Terminated. Only one active and one draft per employee.

**Payslip**: Draft → Review Ongoing → Confirmed → Paid. Each transition has different edit permissions.

**Reimbursement**: Requested → Approved | Rejected. Approved creates an Allowance record.

**LoanAccount**: Created → Active (installments being deducted via payslips) → Settled.

## Permissions and RBAC

- `change_reimbursement` — Can manage all reimbursements (non-holders can only create for self)
- Self-service: employees view own payslips, request reimbursements
- Payroll admin: full payslip management, allowance/deduction configuration
- HR admin: contract management
- Audit trail on payslip changes via HorillaAuditLog

## Gross-to-Net Calculation Flow

1. Get active contract → base wage (basic_pay)
2. Calculate daily rate: wage ÷ working_days_in_month
3. Deduct unpaid leave days: basic_pay -= leave_deduction_amount
4. Apply pre-tax deductions (is_pretax=true, not is_tax)
5. Calculate taxable_gross = basic_pay + taxable_allowances - pre_tax_deductions
6. Apply tax: based on filing_status brackets or Python code
7. Apply post-tax deductions
8. Apply update_compensation deductions (modify pay-heads before other deductions)
9. Net pay = gross_pay - total_deductions
10. Add non-taxable allowances to display (they're already in gross)

## Horilla UI → Backend Workflow Notes

### Payslip Generation
1. Select pay period (start/end date) + optional batch name
2. Select employees (all, by department, individual)
3. System generates payslips for each employee:
   - Fetches active contract
   - Applies all matching allowances/deductions
   - Calculates gross → tax → net
   - Stores full breakdown in pay_head_data JSON
4. Review generated payslips (status=draft)
5. Move to review_ongoing for manager review
6. Confirm (status=confirmed) — locks editing
7. Mark as paid (status=paid) — final state

### Allowance/Deduction Configuration
- List view showing all configured rules
- Complex form with conditional fields (is_fixed toggles amount vs based_on/rate)
- Employee targeting: all active, specific list, condition-based, with exclusions
- Preview: which employees would be affected

## Heimdallone-native Interpretation

### Drizzle Entity Candidates

- `contract` — employeeId FK, name, startDate, endDate, wageType (hourly/daily/monthly), payFrequency (weekly/monthly/semi_monthly), baseSalary, filingStatusId FK, status (draft/active/expired/terminated), departmentId, jobPositionId, shiftId, workTypeId, noticePeriodDays, documentUrl, deductLeaveFromBasicPay, dailyLeaveDeductionAmount
- `pay_item` — organizationId FK, type (allowance/deduction), title, isTaxable, isPreTax, isTax, isFixed, fixedAmount, basedOn, rate (percentage), employerRate, isConditionBased, conditions (JSON), includeAllActive, oneTimeDate, hasMaxLimit, maxAmount, isActive
- `pay_item_employee` — payItemId FK, employeeId FK, excluded (bool) — junction table for specific/excluded employees
- `payslip` — employeeId FK, periodStart, periodEnd, batchName, contractWage, basicPay, grossPay, totalDeductions, netPay, lineItems (JSON), status (draft/review/confirmed/paid), sentToEmployee, generatedBy FK
- `payslip_line_item` — payslipId FK, payItemId FK, type (allowance/deduction/tax), title, amount, isEmployerContribution — or stored in JSON within payslip
- `loan` — employeeId FK, type (loan/advance/fine), title, amount, providedDate, totalInstallments, installmentAmount, startDate, settledAt, status (active/settled)
- `loan_installment` — loanId FK, dueDate, amount, isPaid, payslipId FK (nullable)
- `reimbursement` — employeeId FK, type (expense/leave_encash/bonus_encash), title, amount, date, attachmentUrl, status (requested/approved/rejected), approvedBy FK, description
- `filing_status` — organizationId FK, name, basedOn, brackets (JSON array of {min, max, rate, fixedAmount}), usePythonCode, code
- `payroll_setting` — organizationId FK, noticePeriodDays, autoGenerateDay, autoGenerateEnabled, bonusPointAmount, leaveEncashmentAmount

### Proposed oRPC Routers

- `payroll.contracts` — CRUD + list with filters
- `payroll.payItems` — Allowance/deduction rule CRUD
- `payroll.payslips` — Generate, list, review, confirm, mark paid
- `payroll.payslips.preview` — Preview gross-to-net for an employee before generating
- `payroll.loans` — CRUD + settlement
- `payroll.reimbursements` — CRUD + approve/reject
- `payroll.filingStatuses` — Tax filing status CRUD
- `payroll.settings` — Payroll configuration
- `payroll.run` — Batch payslip generation mutation

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/payroll` — Payroll command center (dashboard)
- `/app/payroll/run` — Pay run wizard
- `/app/payroll/payslips` — Payslip list with filters
- `/app/payroll/payslips/$id` — Individual payslip detail
- `/app/payroll/contracts` — Contract management
- `/app/payroll/pay-items` — Allowances and deductions configuration
- `/app/payroll/loans` — Loan management
- `/app/payroll/reimbursements` — Reimbursement requests
- `/app/payroll/settings` — Payroll settings, filing statuses, tax brackets

### View Modes
- **Command center**: Dashboard with period summary cards, pending actions, recent payslips
- **Pay run wizard**: Multi-step (Select period → Select employees → Preview → Generate → Review)
- **Payslip table**: Filterable list with status badges
- **Payslip detail**: Full gross-to-net breakdown with line items
- **Contract table**: Employee contracts with status indicators
- **Pay item rules**: Configuration table for allowances/deductions

### Pay Run Wizard (Multi-Step)
1. **Period**: Select start/end date, batch name
2. **Employees**: Select all, by department, or individual (with filter)
3. **Preview**: Show gross-to-net preview for each employee with expandable line items
4. **Blocked**: Show employees that can't be processed (no active contract, missing data) with reasons
5. **Generate**: Create payslips, show success summary
6. **Review**: Link to payslip list filtered to this batch

### Status Badges
- Draft: gray `Draft`
- Review: amber `Under Review`
- Confirmed: blue `Confirmed`
- Paid: green `Paid`

### Forms
- **Contract**: Full form with conditional fields (wage type affects available fields)
- **Pay item**: Complex form with conditional sections (fixed vs percentage, condition-based targeting)
- **Payslip**: Read-only detail view with status actions
- Use TanStack Form for contract and pay item forms (complex conditional logic)

## Staff-Friendly UX Notes

### Plain-Language Labels
- Avoid: "FilingStatus", "is_pretax", "update_compensation", "pay_head_data"
- Use: "Tax Filing Method", "Pre-Tax Deduction", "Adjust Base Pay", "Pay Breakdown"

### First-Time User Experience
- Setup checklist: Create filing status → Configure allowances → Configure deductions → Create employee contracts → Run first payroll
- Empty payroll dashboard: "Set up your payroll by creating your first employee contract"

### Common Confusion Points
- Confusion: Difference between allowance "based_on basic_pay" and "fixed amount"
- Prevention: Toggle with clear label — "Fixed Amount: $500" vs "Percentage of Base Salary: 10%"
- Confusion: Why an employee has no payslip
- Prevention: "No active contract found" banner with link to create contract
- Confusion: Pre-tax vs post-tax deductions
- Prevention: Simple explanation — "Pre-tax: deducted before tax calculation. Post-tax: deducted after."

### "Why Is Payroll Blocked?" Panel
Show for each problematic employee:
- "No active contract" → link to create
- "Missing bank details" → link to employee bank tab
- "Leave balance discrepancy" → link to leave module
- "Attendance not validated for 3 days" → link to attendance approval

### Role-Specific Views
- Employee: Own payslips (read-only), own loan balance, reimbursement requests
- Manager: Team payslip summary, approve reimbursements
- Payroll admin: Full payroll management, pay run wizard, settings
- HR admin: Contract management, employee setup
- Auditor: Read-only payslip history, audit trail

## Dependencies

- **Employee** (P0) — Payslips belong to employees
- **Contract** (P0) — Base salary comes from active contract
- **Attendance** (P1) — Work records, overtime hours feed into allowance calculations
- **Leave** (P1) — Leave deductions from salary, leave encashment
- **HR Core** (P0) — Department/position for condition-based pay items

## Edge Cases and Risks

1. **Mid-month joining** — Employee joins on the 15th. Prorate salary calculation needed.
2. **Multiple contracts** — Only one active allowed, but transitioning between contracts mid-period.
3. **Retroactive changes** — Salary increase backdated 2 months. Must recalculate previous payslips.
4. **Currency handling** — Multi-currency for international employees. Exchange rate at payslip time.
5. **Rounding** — Cumulative rounding errors across line items. Round at the end, not per item.
6. **Loan with resignation** — Outstanding loan balance when employee leaves. Final settlement deduction.
7. **Tax bracket edge** — Amount falls exactly on bracket boundary. Inclusive/exclusive rules.
8. **Zero payslip** — All deductions exceed earnings. Net pay cannot be negative.

## Heimdallone Enhancements Over Horilla/OpenHRMS

1. **Pay run wizard** with preview before generation (Horilla generates directly)
2. **"Why blocked" panel** — Clear explanation for every employee that can't be processed
3. **Gross-to-net visual breakdown** — Waterfall chart showing base → allowances → deductions → net
4. **Approval chain timeline** — Visual status of multi-step approval
5. **Country profile system** — Pre-configured tax/deduction templates for Caribbean countries (GY, TT, JM)
6. **Payslip diff view** — Compare two payslips side-by-side (this month vs last month)
7. **Bulk actions with review** — Select payslips → review summary → confirm/pay all at once
8. **Employee payslip portal** — Clean, printable payslip view for employees
9. **Future: Bank file generation** — Generate bank payment files (ACH, CSV) for bulk salary transfer
10. **Audit trail** — Every payslip change tracked with who/when/what

## Priority

**P1** — Core operation. Highest complexity and highest stakes. Errors affect real money.
