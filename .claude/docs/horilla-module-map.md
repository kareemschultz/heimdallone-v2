# Horilla Module → Heimdallone Concept Map

> Quick reference. Full analysis in `docs/product/horilla-reference-map.md`.

| Horilla Module | Heimdallone Domain | Priority | Key Models |
|---------------|-------------------|----------|------------|
| `base/` | Platform core | P0 | Company, Department, JobPosition, JobRole, WorkType, EmployeeType, Shift |
| `employee/` | Employee/HR core | P0 | Employee, EmployeeWorkInformation, EmployeeBankDetails |
| `attendance/` | Attendance & time | P0 | Attendance, AttendanceActivity, AttendanceOverTime, AttendanceValidationCondition |
| `leave/` | Leave management | P0 | LeaveType, AvailableLeave, LeaveRequest, LeaveAllocationRequest, Holiday, CompanyLeave |
| `payroll/` | Payroll engine | P0 | Contract, Allowance, Deduction, Payslip, LoanAccount, Reimbursement, FilingStatus, TaxBracket |
| `biometric/` | Biometric devices | P1 | BiometricDevices, BiometricAttendance, COSECAttendance |
| `geofencing/` | Geofence zones | P1 | GeofenceSetup (lat/lng/radius) |
| `recruitment/` | Recruitment pipeline | P1 | Recruitment, Candidate, Stage, StageNote, RecruitmentSurvey |
| `onboarding/` | Onboarding flows | P1 | OnboardingStage, OnboardingTask, CandidateStage, CandidateTask |
| `offboarding/` | Offboarding flows | P1 | Offboarding, OffboardingStage, OffboardingTask, OffboardingEmployee |
| `horilla_documents/` | Document management | P1 | Document, DocumentRequest |
| `notifications/` | Notification system | P1 | Notification preferences, delivery |
| `pms/` | Performance mgmt | P2 | EmployeeObjective, KeyResult, Feedback, Period, Question |
| `asset/` | Asset management | P2 | Asset, AssetCategory, AssetRequest, AssetAssignment |
| `project/` | Projects & tasks | P2 | Project, Task, TimeTracker |
| `helpdesk/` | Helpdesk/tickets | P2 | Ticket, TicketType, DepartmentManager, FAQCategory |
| `horilla_audit/` | Audit trail | P0 | AuditTag, AccountAudit, HistoryTrackingFields |
| `horilla_automations/` | Automation rules | P2 | MailAutomation conditions/templates |

**Principle:** Heimdallone-native naming. Do NOT copy Django table names or architecture.
