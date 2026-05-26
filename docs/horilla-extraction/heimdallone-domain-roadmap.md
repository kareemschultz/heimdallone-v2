# Heimdallone Domain Roadmap — Implementation Sequence

## Recommended Implementation Order

Based on dependency analysis, usability risk, and business priority from the Horilla/OpenHRMS extraction.

### Phase 5 — HR Core Foundation

**Goal**: Employee management with full profile, organizational structure, and document management.

**Entities**: organization (existing), department, job_position, job_role, work_type, employee_type, shift, shift_schedule, employee_profile, employee_work_info, employee_bank_details, holiday, company_leave_day, employee_document, document_request, audit_event

**Routes**: `/app/employees`, `/app/employees/$id`, `/app/employees/create`, `/app/settings/organization`, `/app/settings/holidays`, `/app/documents`

**Key features**:
- Employee CRUD with create wizard
- Employee profile with tabbed detail view
- Department/Position/Role hierarchy
- Shift configuration with weekly schedules
- Document upload, expiry tracking, approval
- Audit event logging on all changes
- Employee self-service profile view

**Risk**: Medium — straightforward data modeling but employee create wizard requires good UX

### Phase 6 — Contracts

**Goal**: Employment contracts linking employees to compensation terms.

**Entities**: contract, filing_status

**Routes**: `/app/payroll/contracts`

**Key features**:
- Contract CRUD with status lifecycle (draft → active → expired → terminated)
- One active contract per employee enforcement
- Contract-to-work-info sync (active contract updates basic salary)
- Filing status configuration for future tax calculations

**Risk**: Low — well-defined CRUD with simple validation

### Phase 7 — Attendance

**Goal**: Employee time tracking with check-in/out, overtime, and work records.

**Entities**: attendance_event, attendance_record, overtime_account, late_early_record, attendance_correction_request, attendance_setting, work_record

**Routes**: `/app/attendance`, `/app/attendance/calendar`, `/app/attendance/exceptions`, `/app/attendance/overtime`

**Key features**:
- Check-in/check-out flow (manual first, biometric later)
- Daily attendance summary computation
- Overtime calculation and approval workflow
- Late come / early out detection
- Attendance validation by manager/HR
- Monthly hour accounts
- Correction request workflow

**Risk**: High — complex calculations, edge cases (midnight crossover, missing checkout), real-time timer UX

### Phase 8 — Leave

**Goal**: Leave type configuration, balance management, and request/approval workflow.

**Entities**: leave_type, leave_balance, leave_request, leave_request_approval, leave_allocation_request, leave_restriction, public_holiday

**Routes**: `/app/leave`, `/app/leave/calendar`, `/app/leave/approvals`, `/app/leave/settings`, `/app/leave/balances`

**Key features**:
- Leave type configuration (accrual, reset, carry-forward)
- Employee balance tracking with forecasting
- Leave request with half-day support
- Multi-level approval workflow
- Team calendar view
- Holiday/company leave exclusion from counts
- Leave restrictions by department/date range

**Risk**: High — balance calculations, carry-forward logic, overlapping request validation

### Phase 9 — Payroll

**Goal**: Full payroll engine with allowances, deductions, tax, payslip generation, loans, reimbursements.

**Entities**: pay_item, pay_item_employee, payslip, payslip_line_item, loan, loan_installment, reimbursement, payroll_setting

**Routes**: `/app/payroll`, `/app/payroll/run`, `/app/payroll/payslips`, `/app/payroll/payslips/$id`, `/app/payroll/pay-items`, `/app/payroll/loans`, `/app/payroll/reimbursements`, `/app/payroll/settings`

**Key features**:
- Pay item rule engine (allowances + deductions)
- Payslip generation wizard (select period → employees → preview → generate)
- Gross-to-net calculation
- Tax calculation (bracket-based)
- Multi-status payslip lifecycle
- Loan management with installment tracking
- Reimbursement request and approval
- Employee payslip portal

**Risk**: Very High — complex calculations, high-stakes errors, multi-country tax rules

### Phase 10 — Recruitment

**Goal**: Hiring pipeline with candidates, stages, interviews, and candidate-to-employee conversion.

**Entities**: job_opening, hiring_stage, candidate, interview, candidate_rating, candidate_note

**Routes**: `/app/recruitment`, `/app/recruitment/$id`, `/app/recruitment/$id/candidates/$candidateId`

**Key features**:
- Kanban pipeline view
- Candidate profile with resume, survey answers, ratings
- Interview scheduling
- Offer tracking
- Candidate-to-employee conversion

**Risk**: Medium — well-understood pattern (kanban), moderate data complexity

### Phase 11 — Onboarding & Offboarding

**Goal**: Structured checklists for new hire integration and employee exit.

**Entities**: onboarding_template, onboarding_instance, onboarding_task_instance, resignation_request, offboarding_pipeline, offboarding_stage, offboarding_employee, offboarding_task_instance, exit_interview

**Routes**: `/app/onboarding`, `/app/offboarding`, `/app/offboarding/resignations`

### Phase 12 — Biometric & Geofencing

**Entities**: biometric_device, biometric_employee_mapping, biometric_sync_log, raw_punch_event, work_site, employee_work_site, check_in_location_log

### Phase 13 — Assets, Projects, Helpdesk

### Phase 14 — Performance (PMS)

### Phase 15 — Automations & Advanced

---

## Shared Primitives to Build First (Pre-Phase 5)

Before any module implementation, build these reusable UI primitives:

1. **DataTable** — shadcn Table + TanStack Table wrapper with standard features
2. **StatusBadge** — Semantic color badge component
3. **ApprovalQueue** — Request list with approve/reject pattern
4. **EntitySheet** — Side panel for quick view/edit
5. **WizardForm** — Multi-step form with TanStack Form
6. **EmptyState** — Consistent empty state component
7. **AuditTimeline** — Activity feed component
8. **ConfirmDialog** — Confirmation for destructive actions
9. **FilterBar** — Faceted filter component with saved views

## Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Payroll calculations | Rounding errors, incorrect tax | Extensive test suite with known-good calculation fixtures |
| Multi-country compliance | Different tax/labor laws per country | Country profile system with pluggable rules |
| Leave balance integrity | Race conditions on concurrent approvals | Database-level constraints, optimistic locking |
| Attendance edge cases | Midnight crossover, timezone, missing checkout | Comprehensive edge case tests, auto-recovery flows |
| Data migration | Moving from v1 or other systems | Import wizard with validation preview |

## First Live Module Recommendation

**HR Core (Employee Management)** should go live first because:
1. Zero dependency on other modules
2. All subsequent modules need employees
3. Moderate complexity — good for establishing patterns
4. Visible to all users — validates the design system and UX approach
5. Import capability allows migrating existing employee data

## Biggest Usability Risks

1. **Payroll**: Most complex workflow, highest error stakes, most confusing for non-technical payroll clerks
2. **Leave balance calculations**: Carry-forward, accrual, reset — confusing even for HR
3. **Attendance corrections**: Multiple paths to fix data, easy to create inconsistencies
4. **Shift management**: Rotating shifts with multiple work types — complex for schedulers
5. **Multi-level approvals**: Employees not knowing where their request is in the chain

## Recommended Staff-Friendly UX Improvements (Top 10)

1. **Setup wizards** for first-time configuration of each module
2. **"Why is this blocked?" explanations** for every validation error and blocked action
3. **Progressive disclosure** — show simple views first, advanced options on demand
4. **Role-tailored dashboards** — each role sees what matters to them
5. **Guided workflows** (wizards) for complex multi-step operations
6. **Contextual help tooltips** on every non-obvious field
7. **Smart defaults** — pre-fill forms based on context and recent entries
8. **Undo for non-destructive actions** — recently archived? One-click restore
9. **Batch operation review** — always preview before bulk changes
10. **Notification center** — never miss a pending approval or overdue task
