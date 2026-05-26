# Horilla HRMS Deep Extraction — Phase 4D

## Purpose

This directory contains the complete product-behavior extraction from Horilla HRMS and CybroOdoo/OpenHRMS, translated into Heimdallone-native recommendations. These docs are the blueprint for all future HRMS implementation in Heimdallone v2.

## Source Hierarchy

1. **Horilla** — Primary HRMS workflow, feature, and backend behavior reference
2. **OpenHRMS (CybroOdoo)** — Secondary comparison for feature gaps, regional payroll, and workflow inspiration
3. **shadcn/ui + Heimdallone design language** — How workflows are expressed in the frontend
4. **Heimdallone v2** — The only implementation target

## What Was Inspected

### Horilla (`.references/horilla-hr/`)

18 module directories, ~12,200 lines of model code, plus views, forms, filters, templates, and URL configurations across:

- `base/` — Company, Department, JobPosition, JobRole, WorkType, Shifts, Holidays, CompanyLeaves, Announcements
- `employee/` — Employee, WorkInformation, BankDetails, Notes, DisciplinaryAction, BonusPoints, Policies
- `attendance/` — AttendanceActivity, Attendance, OverTime, LateComeEarlyOut, ValidationConditions, GraceTime, WorkRecords
- `leave/` — LeaveType, AvailableLeave, LeaveRequest, LeaveAllocationRequest, Holidays, Restrictions, CompensatoryLeave
- `payroll/` — Contract, Allowance, Deduction, Payslip, LoanAccount, Reimbursement, FilingStatus, TaxBrackets
- `recruitment/` — Recruitment, Stage, Candidate, InterviewSchedule, Survey, SkillZone, CandidateRating
- `onboarding/` — OnboardingStage, OnboardingTask, CandidateStage, CandidateTask, OnboardingPortal
- `offboarding/` — Offboarding, OffboardingStage, OffboardingTask, OffboardingEmployee, ResignationLetter
- `pms/` — Period, Objective, KeyResult, EmployeeObjective, Feedback, Question, Answer, Meetings, BonusPointSetting
- `asset/` — AssetCategory, AssetLot, Asset, AssetAssignment, AssetRequest, AssetReport
- `helpdesk/` — TicketType, Ticket, Comment, Attachment, FAQ, FAQCategory, ClaimRequest
- `project/` — Project, ProjectStage, Task, TimeSheet
- `horilla_audit/` — AuditTag, HorillaAuditInfo, HorillaAuditLog (django-simple-history wrapper)
- `horilla_documents/` — DocumentRequest, Document (with expiry, status, format validation)
- `horilla_automations/` — MailAutomation with trigger conditions (on_create/update/delete)
- `notifications/` — Notification model (multi-language verb support)
- `biometric/` — BiometricDevices (ZKTeco, Anviz, COSEC, Dahua, eTimeOffice), BiometricEmployees
- `geofencing/` — GeoFencing model (lat/lon/radius per company)

### OpenHRMS (`.references/openhrms/`)

20+ modules inspected for regional/advanced concepts:

- `ohrms_loan/` — Employee loan lifecycle with installment tracking
- `ohrms_salary_advance/` — Salary advance request and payroll deduction
- `hr_gratuity_settlement/` — End-of-service gratuity calculation by service years
- `saudi_gosi/` — Saudi social insurance (GOSI) payroll integration
- `uae_wps_report/` — UAE Wage Protection System file generation
- `hr_insurance/` — Employee insurance tracking and payroll deduction
- `hr_disciplinary_tracking/` — Disciplinary action workflow (draft→explanation→action)
- `hr_reward_warning/` — Employee rewards and warnings
- `hr_custody/` — Property custody management (request→approve→return)
- `hr_employee_transfer/` — Inter-department/company employee transfers
- `attendance_regularization/` — Attendance correction requests
- `hrms_dashboard/` — HR analytics dashboard
- `oh_appraisal/` — Performance appraisal system
- Plus: `hr_resignation`, `employee_background`, `hr_multi_company`, `history_employee`

## How to Use These Docs

1. **Module docs** (`hr-core.md`, `attendance.md`, etc.) — Each covers one Horilla module with models, workflows, permissions, and Heimdallone-native recommendations
2. **module-index.md** — Priority-ordered list of all modules with dependencies
3. **openhrms-comparison.md** — Feature gap analysis between Horilla and OpenHRMS
4. **ui-pattern-library-recommendations.md** — Cross-module UI patterns for Heimdallone
5. **frontend-backend-workflows.md** — How screens connect to backend operations
6. **heimdallone-domain-roadmap.md** — Recommended implementation sequence

## Critical Rules

- **Do NOT copy Django/Odoo code** — Extract product behavior only
- **Do NOT copy Horilla UI templates** — Heimdallone has its own design language
- **Do NOT port Django models 1:1** — Translate to Drizzle/TypeScript natively
- **Heimdallone must be intuitive for non-technical staff** — Every recommendation prioritizes usability
- **Server-side enforcement is mandatory** — Frontend role-visibility is UX only, not security
