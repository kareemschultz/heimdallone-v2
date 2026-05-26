# OpenHRMS Comparison — Feature Gap Analysis

## Overview

This document compares CybroOdoo/OpenHRMS modules against Horilla coverage, identifying features that Heimdallone should consider adopting. OpenHRMS builds on Odoo's HR framework and provides regional payroll, legal, and advanced HR concepts not found in Horilla.

## Module-by-Module Comparison

### A. Regional Payroll & Legal

#### Employee Loans (`ohrms_loan`)
- **Concept**: Employee loan lifecycle with auto-generated installment schedule
- **Workflow**: Draft → Submitted → Approved → Active (installments deducted from payslips) → Refused | Canceled
- **Key fields**: Employee, loan amount, installments count, payment start date, auto-computed installment lines with paid status, balance tracking
- **Horilla coverage**: Yes — `LoanAccount` model with similar installment tracking
- **Heimdallone relevance**: **Now** — Caribbean employees frequently use salary advances and loans
- **Enhancement**: Better installment visualization, payment progress bar, integration with final settlement

#### Salary Advance (`ohrms_salary_advance`)
- **Concept**: Employee requests portion of salary in advance of pay date
- **Workflow**: Draft → Submitted → Approved (creates payroll deduction) → Refused | Canceled
- **Horilla coverage**: Partial — `LoanAccount` has type "advanced_salary" but less structured
- **Heimdallone relevance**: **Now** — Very common in Caribbean HR
- **Enhancement**: Simple one-click request from employee dashboard, auto-deduct from next payroll

#### Gratuity/End-of-Service Settlement (`hr_gratuity_settlement`)
- **Concept**: End-of-service payment calculated by service years and configuration tiers
- **Configuration**: Service year ranges with percentage/daily wage multipliers (e.g., 0-5 years: 50% of daily wage × working days × years, 5+ years: 100%)
- **Horilla coverage**: No direct equivalent
- **Heimdallone relevance**: **Later** — Relevant for GCC-deployed Caribbean workers; some Caribbean countries have gratuity laws
- **Caribbean note**: Guyana and Trinidad have severance/termination pay rules that could use similar calculation logic

#### Saudi GOSI (`saudi_gosi`)
- **Concept**: Saudi social insurance calculation (employer + employee contributions)
- **Horilla coverage**: No
- **Heimdallone relevance**: **Not needed** initially — No Saudi deployment planned. But the pattern (statutory contribution as percentage of salary) is reusable for NIS (National Insurance Scheme) in GY/TT/JM.

#### UAE WPS (`uae_wps_report`, `ent_uae_wps_report`)
- **Concept**: Generate Wage Protection System file for UAE Central Bank compliance
- **Horilla coverage**: No
- **Heimdallone relevance**: **Not needed** — UAE-specific. But bank file generation pattern useful for local banks.

#### Insurance (`hr_insurance`)
- **Concept**: Employee insurance policies with payroll deduction. Fields: policy name, amount, company, employee, date range, insurance company.
- **Horilla coverage**: No
- **Heimdallone relevance**: **Later** — Group insurance tracking, payroll deduction integration
- **Caribbean relevance**: Medium — Some employers provide health insurance

### B. Employee Lifecycle

#### Employee Transfer (`hr_employee_transfer`)
- **Concept**: Formal transfer between departments/companies with effective date and contract update
- **Horilla coverage**: No formal transfer model — just edit work info
- **Heimdallone relevance**: **Later** — Useful for multi-location orgs, creates audit trail for transfers
- **Enhancement**: Transfer request → approval → auto-update work info + create audit event

#### Employee Update Requests (`hr_employee_updation`)
- **Concept**: Employees request changes to their own profile (address, bank details, etc.) that require HR approval
- **Horilla coverage**: No — employees either edit directly or can't edit
- **Heimdallone relevance**: **Now** — Critical for data integrity. Employee submits change → HR approves → data updated
- **Caribbean relevance**: High — Important for compliance, especially bank detail changes

#### Background Checks (`employee_background`)
- **Concept**: Track background verification status per employee
- **Horilla coverage**: No
- **Heimdallone relevance**: **Maybe** — Low priority, could be a simple status field + document upload

#### Employee History (`history_employee`)
- **Concept**: Track all changes to employee records over time
- **Horilla coverage**: Yes — via HorillaAuditLog on EmployeeWorkInformation
- **Heimdallone relevance**: **Now** — Already planned via audit_event table

#### Multi-Company (`hr_multi_company`)
- **Concept**: Manage employees across multiple companies
- **Horilla coverage**: Yes — HorillaCompanyManager provides company-scoped queries
- **Heimdallone relevance**: **Now** — Already implemented via Better Auth Organization (multi-tenant)

### C. HR Operations

#### Overtime Management (`ohrms_overtime`)
- **Concept**: Overtime request workflow with type-based rates (working day, public holiday, weekend)
- **Horilla coverage**: Yes — AttendanceOverTime with approval workflow
- **Heimdallone relevance**: **Now** — Overtime with different rate types is important for payroll accuracy

#### Shift Management (`hr_employee_shift`)
- **Concept**: Employee shift assignment and scheduling
- **Horilla coverage**: Yes — EmployeeShift, ShiftSchedule, ShiftRequest, RotatingShift
- **Heimdallone relevance**: **Now** — Already covered in HR Core extraction

#### Attendance Regularization (`attendance_regularization`)
- **Concept**: Employee requests correction of attendance records with approval workflow. Categories of regularization (forgot to check in, system error, etc.)
- **Workflow**: Draft → Requested → Approved (creates HR attendance record) | Rejected
- **Horilla coverage**: Partial — Attendance has is_validate_request but no separate regularization entity with categories
- **Heimdallone relevance**: **Now** — Attendance corrections with categories are more user-friendly than raw record editing
- **Enhancement**: "I forgot to check in" button on employee dashboard with pre-filled category

#### Disciplinary Tracking (`hr_disciplinary_tracking`)
- **Concept**: Formal disciplinary process: Draft → Waiting Explanation (employee explains) → Waiting Action (manager decides) → Action Validated | Cancelled
- **Key addition**: Employee must provide written explanation before action is taken
- **Horilla coverage**: Yes — DisciplinaryAction with Actiontype (warning/suspension/dismissal) and login blocking
- **Heimdallone relevance**: **Later** — Important for compliance but can start with simpler version
- **Enhancement**: Combine Horilla's approach (action types + login blocking) with OpenHRMS's structured workflow (explanation step)

#### Reward/Warning (`hr_reward_warning`)
- **Concept**: Formal reward and warning announcements for employees
- **Horilla coverage**: Partial — Announcements exist, BonusPoints exist, but no formal reward/warning model
- **Heimdallone relevance**: **Later** — Nice to have for formal HR processes

#### Lawsuit/Legal Case Management (`oh_hr_lawsuit_management`)
- **Concept**: Track legal cases involving employees
- **Horilla coverage**: No
- **Heimdallone relevance**: **Maybe** — Low priority. Could be a simple case tracker.

### D. Platform

#### HRMS Dashboard (`hrms_dashboard`)
- **Concept**: Executive HR analytics dashboard with charts (headcount, gender, department distribution, leave/attendance stats)
- **Horilla coverage**: Yes — Dashboard module exists
- **Heimdallone relevance**: **Now** — Already have design handoff for dashboard, will implement with real data
- **Enhancement**: Role-specific dashboard widgets (employee vs manager vs HR vs exec)

## Summary: Priority Recommendations

| Feature | Priority | Why |
|---------|----------|-----|
| Employee Update Requests | Now | Data integrity, self-service |
| Salary Advance | Now | Common in Caribbean |
| Attendance Regularization | Now | User-friendly correction flow |
| Employee Loans | Now | Already in Horilla, enhance |
| Overtime Rate Types | Now | Accurate payroll |
| Multi-Company | Now | Already via Better Auth |
| Employee History | Now | Already via audit |
| Transfer Workflow | Later | Audit trail for moves |
| Disciplinary Process | Later | Compliance |
| Gratuity/Severance | Later | Caribbean termination pay |
| Insurance | Later | Group insurance tracking |
| Reward/Warning | Later | Formal HR process |
| Background Checks | Maybe | Simple status tracking |
| Lawsuit Management | Maybe | Low priority |
| Saudi GOSI | Not needed | Region-specific |
| UAE WPS | Not needed | Region-specific |
