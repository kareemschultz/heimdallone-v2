# Module Index — Horilla Extraction

## Priority Tiers

### P0 — Foundation (Must Have for MVP)

| Module | Horilla Source | Dependencies | Usability Risk | Notes |
|--------|---------------|--------------|----------------|-------|
| HR Core (Organization) | `base/` | None | Low | Company, Department, JobPosition, JobRole, WorkType, Shifts |
| HR Core (Employee) | `employee/` | Organization | Medium | Employee profiles, work info, bank details, reporting managers |
| Contracts | `payroll/models.py` (Contract) | Employee | Medium | Employment contracts with wage type, pay frequency, filing status |
| Documents | `horilla_documents/` | Employee | Low | Document requests, uploads, expiry tracking, approval |
| Audit | `horilla_audit/` | All | Low | Field-level change tracking, audit tags |

### P1 — Core Operations (Required for daily HR)

| Module | Horilla Source | Dependencies | Usability Risk | Notes |
|--------|---------------|--------------|----------------|-------|
| Attendance | `attendance/` | Employee, Shifts | High | Check-in/out, overtime, late/early, work records, validation |
| Leave | `leave/` | Employee, Attendance | High | Leave types, balances, requests, approvals, holidays, restrictions |
| Payroll | `payroll/` | Employee, Contract, Attendance, Leave | Very High | Allowances, deductions, tax, payslips, loans, reimbursements |

### P2 — Operational Excellence

| Module | Horilla Source | Dependencies | Usability Risk | Notes |
|--------|---------------|--------------|----------------|-------|
| Recruitment | `recruitment/` | Organization | Medium | Pipeline stages, candidates, interviews, surveys, skill zones |
| Onboarding | `onboarding/` | Recruitment, Employee | Medium | Stage-based task checklists for new hires |
| Offboarding | `offboarding/` | Employee, Payroll | Medium | Resignation, notice period, clearance, exit tasks |
| Biometric | `biometric/` | Attendance | High | Device registration, sync, employee mapping (ZKTeco, Anviz, COSEC, Dahua) |
| Geofencing | `geofencing/` | Attendance | Medium | Location-based check-in validation |

### P3 — Growth Features

| Module | Horilla Source | Dependencies | Usability Risk | Notes |
|--------|---------------|--------------|----------------|-------|
| Performance (PMS) | `pms/` | Employee | Medium | OKRs, 360 feedback, review cycles, bonus points |
| Assets | `asset/` | Employee | Low | Asset inventory, assignment, return, requests |
| Projects | `project/` | Employee | Low | Projects, tasks, stages, timesheets |
| Helpdesk | `helpdesk/` | Employee | Low | Tickets, FAQ, comments, assignments |
| Automations | `horilla_automations/` | All | Medium | Email/notification triggers on model events |
| Notifications | `notifications/` | All | Low | In-app notification system |

## Dependencies Graph

```
Organization (Company, Department, JobPosition, JobRole)
  └── Employee
       ├── Contract
       ├── Documents
       ├── Attendance ← Biometric, Geofencing
       │    └── WorkRecords
       ├── Leave ← Attendance (compensatory leave)
       ├── Payroll ← Contract, Attendance, Leave
       │    ├── Allowances/Deductions
       │    ├── Payslips
       │    └── Loans/Reimbursements
       ├── Recruitment → Onboarding → Employee (conversion)
       ├── Offboarding ← Payroll (final settlement)
       ├── Performance (PMS) ← Employee
       ├── Assets ← Employee
       ├── Projects ← Employee
       └── Helpdesk ← Employee
```

## Suggested Implementation Order

1. **HR Core** — Organization setup + Employee profiles + Work information
2. **Contracts** — Employment contracts with wage configuration
3. **Documents** — Document vault with expiry and approval
4. **Attendance** — Check-in/out, work records, overtime
5. **Leave** — Leave types, balances, requests, approvals
6. **Payroll** — Country profiles, pay runs, payslips, gross-to-net
7. **Audit** — Event stream, entity timeline, compliance
8. **Biometric + Geofencing** — Device integration, location validation
9. **Recruitment** — Pipeline, candidates, interviews
10. **Onboarding** — Staged task checklists
11. **Offboarding** — Resignation, clearance, exit
12. **Assets** — Inventory, assignment, custody
13. **Helpdesk** — Tickets, FAQ
14. **Performance** — OKRs, feedback cycles
15. **Projects** — Project/task management, timesheets
16. **Automations + Notifications** — Trigger-based emails, in-app notifications

## Usability Risk Assessment

| Risk Level | Modules | Why |
|------------|---------|-----|
| Very High | Payroll | Complex calculations, multi-country tax, approval chains, high-stakes errors |
| High | Attendance, Biometric | Multiple input sources, edge cases (midnight, missing checkout), device troubleshooting |
| High | Leave | Balance calculations, carry-forward, overlapping requests, restriction rules |
| Medium | Recruitment, Onboarding, Offboarding, PMS | Multi-step workflows with role-dependent views |
| Low | Documents, Assets, Helpdesk, Projects | Straightforward CRUD with approval flows |
