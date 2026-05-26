# Permission Matrix

Full resource × role matrix for Heimdallone RBAC. Informed by Horilla's Django `permission_required` patterns and HRMS industry best practices.

> Legend: ✓ = full access, R = read only, — = no access, scope note in parentheses

---

## 1. Organization Management

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| organization : update | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| organization : delete | ✓ | — | — | — | — | — | — | — | — |
| member : invite | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| member : update_role | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| member : remove | ✓ | ✓ | ✓ | — | — | — | — | — | — |

---

## 2. People

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| employee : create | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| employee : read | ✓ | ✓ | ✓ | R | R (team) | R (self) | R | — | — |
| employee : update | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| employee : terminate | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| resignation : create | ✓ | ✓ | ✓ | — | — | ✓ (self) | — | — | — |
| resignation : read | ✓ | ✓ | ✓ | R | R (team) | R (self) | R | — | — |
| resignation : approve | ✓ | ✓ | ✓ | — | R (team) | — | — | — | — |
| resignation : complete | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| resignation : withdraw | ✓ | ✓ | ✓ | — | — | ✓ (self) | — | — | — |
| transfer : submit | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| transfer : approve | ✓ | ✓ | — | — | — | — | — | — | — |
| transfer : execute | ✓ | ✓ | ✓ | — | — | — | — | — | — |

---

## 3. Payroll

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| payslip : draft | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| payslip : finalize | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| payslip : reverse | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| payslip : read | ✓ | ✓ | R | ✓ | — | R (self) | R | — | — |
| payroll_period : create | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| payroll_period : finalize | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| payroll_period : cancel | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| payroll_period : delete | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| advance : create | ✓ | ✓ | ✓ | — | — | ✓ (self) | — | — | — |
| advance : approve_hr | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| advance : approve_accounting | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| advance : disburse | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| loan : write_off | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| statutory_rules : read | ✓ | ✓ | R | R | — | — | R | — | — |
| statutory_rules : update | ✓ | — | — | — | — | — | — | — | — |

---

## 4. Time & Attendance

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| attendance : create | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| attendance : read | ✓ | ✓ | ✓ | R | R (team) | R (self) | R | — | — |
| attendance : correct | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| leave_request : create | ✓ | ✓ | ✓ | — | ✓ | ✓ (self) | — | — | — |
| leave_request : approve | ✓ | ✓ | ✓ | — | ✓ (team) | — | — | — | — |
| leave_request : reject | ✓ | ✓ | ✓ | — | ✓ (team) | — | — | — | — |
| leave_request : cancel | ✓ | ✓ | ✓ | — | — | ✓ (self) | — | — | — |
| holiday : create | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| holiday : read | ✓ | ✓ | ✓ | R | R | R | R | — | — |
| work_location : manage | ✓ | ✓ | ✓ | — | — | — | — | — | — |

---

## 5. Compliance & Accounting

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| audit_log : read | ✓ | ✓ | R | R | — | — | R | — | — |
| export : generate | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| journal : post | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| journal : reverse | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| journal : read | ✓ | ✓ | R | ✓ | — | — | R | — | — |
| account : create | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| account : read | ✓ | ✓ | R | ✓ | — | — | R | — | — |

---

## 6. Documents

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| document : create | ✓ | ✓ | ✓ | — | — | ✓ (self) | — | — | — |
| document : read | ✓ | ✓ | ✓ | R | R (team) | R (self) | R | — | — |
| document : update | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| document : archive | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| document : scan_expiring | ✓ | ✓ | ✓ | — | — | — | — | — | — |

---

## 7. Recruitment

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| posting : create | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| posting : read | ✓ | ✓ | ✓ | R | R | R | R | ✓ | — |
| posting : publish | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| applicant : create | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| applicant : read | ✓ | ✓ | ✓ | — | R | — | R | ✓ | — |
| applicant : update | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| applicant : convert | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| interview : create | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| interview : complete | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — |
| offer : extend | ✓ | ✓ | ✓ | — | — | — | — | — | — |

---

## 8. Performance

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| appraisal : create | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| appraisal : submit | ✓ | ✓ | ✓ | — | ✓ | ✓ (self) | — | — | — |
| appraisal : review | ✓ | ✓ | ✓ | — | ✓ (team) | — | — | — | — |
| appraisal : finalize | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| goal : create | ✓ | ✓ | ✓ | — | ✓ | ✓ (self) | — | — | — |
| goal : read | ✓ | ✓ | ✓ | R | ✓ (team) | R (self) | R | — | — |
| goal : complete | ✓ | ✓ | ✓ | — | ✓ (team) | ✓ (self) | — | — | — |

---

## 9. Assets & Helpdesk

| Resource : Action | tenant_owner | tenant_admin | hr_admin | payroll_admin | manager | employee | auditor | recruiter | helpdesk_agent |
|---|---|---|---|---|---|---|---|---|---|
| asset : create | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| asset : read | ✓ | ✓ | ✓ | R | R | R (own) | R | — | — |
| asset : assign | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| asset : return | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| asset : manage | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| ticket : create | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| ticket : read | ✓ | ✓ | ✓ | ✓ | ✓ (team) | R (self) | R | — | ✓ |
| ticket : assign | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ |
| ticket : resolve | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ |
| ticket : close | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ |

---

## 10. Scope Modifier Definitions

| Scope | Meaning | Enforcement point |
|-------|---------|-------------------|
| **(self)** | Only the user's own records (own payslips, own leave, own attendance) | `requireEmployeeScope` middleware injects `employeeId`; queries filter by it |
| **(team)** | Records of employees who report to this manager | API query filters by `reportingManagerId = currentEmployee.id` |
| **(dept)** | Records within the user's department | API query filters by department membership |
| **(country)** | Records within the user's assigned country profiles | API query filters by country assignment |
| **R** | Read-only (no create/update/delete actions) | AC role definition only grants `read` action |
| **—** | No access (resource not listed in role definition) | AC check rejects the request |

---

## 11. Approval Workflow Permissions

| Workflow | Submit | Approve | Apply/Execute | Horilla reference |
|----------|--------|---------|--------------|-------------------|
| Leave request | employee (self), manager | manager (team), hr_admin | Auto on approval | `leave.delete_leaverequest`, `leave_request_approve` |
| Overtime claim | employee, manager | manager, hr_admin | payroll_admin (in pay run) | `base.approve_shiftrequest` |
| Shift change | employee, manager | manager, hr_admin | Auto on approval | `base.approve_worktyperequest` |
| Resignation | employee (self) | hr_admin, tenant_owner | hr_admin (exit process) | `offboarding.change_resignationletter` |
| Transfer | hr_admin, manager | tenant_owner, tenant_admin | hr_admin | N/A (Heimdallone-native) |
| Payroll run | payroll_admin | payroll_admin, tenant_owner | payroll_admin (commits) | N/A |
| Salary advance | employee (self) | hr_admin (HR), payroll_admin (finance) | payroll_admin (disburses) | N/A |
| Expense claim | employee (self) | manager, hr_admin | payroll_admin (pays) | N/A |

---

## 12. Platform Admin Capabilities

Separate from tenant roles. Managed by Better Auth Admin plugin.

| Capability | platform_owner | platform_admin | Any tenant role |
|-----------|---------------|----------------|----------------|
| List all users across tenants | ✓ | ✓ | — |
| List all organizations | ✓ | ✓ | — |
| Impersonate any user | ✓ | ✓ | — |
| Impersonate other admins | ✓ | — | — |
| Ban/unban users | ✓ | ✓ | — |
| Force password reset | ✓ | ✓ | — |
| Create users directly | ✓ | ✓ | — |
| Delete users | ✓ | — | — |
| View cross-tenant audit | ✓ | ✓ | — |

---

## 13. Horilla Django Permission Cross-Reference

| Horilla Django Permission | Heimdallone Resource : Action |
|--------------------------|------------------------------|
| `employee.add_employee` | `employee:create` |
| `employee.change_employee` | `employee:update` |
| `employee.view_employee` | `employee:read` |
| `employee.delete_employee` | `employee:terminate` |
| `leave.add_leavetype` | `leave_request:create` (policy level) |
| `leave.delete_leaverequest` | `leave_request:cancel` |
| `base.approve_shiftrequest` | `attendance:correct` |
| `base.approve_worktyperequest` | `attendance:correct` |
| `base.add_company` | `organization:update` |
| `base.add_department` | (department CRUD — future resource) |
| `base.add_jobposition` | (job position CRUD — future resource) |
| `base.add_holiday` | `holiday:create` |
| `recruitment.add_recruitment` | `posting:create` |
| `recruitment.view_candidate` | `applicant:read` |
| `recruitment.change_candidate` | `applicant:update` |
| `recruitment.add_candidate` | `applicant:create` |
| `recruitment.add_stage` | `posting:create` (stage within pipeline) |
| `asset.add_asset` | `asset:create` |
| `asset.add_assetassignment` | `asset:assign` |
| `asset.view_assetcategory` | `asset:read` |
| `pms.add_employeeobjective` | `goal:create` |
| `pms.change_feedback` | `appraisal:review` |
| `helpdesk.change_ticket` | `ticket:update` |
| `helpdesk.create_tickettype` | `ticket:create` (type management) |
| `horilla_audit.view_audittag` | `audit_log:read` |
| `offboarding.add_offboarding` | `resignation:approve` (exit process) |
| `onboarding.view_onboardingcandidate` | `applicant:read` (onboarding context) |
| `biometric.add_biometricdevices` | `attendance:create` (device management) |
| `auth.add_group` | `member:update_role` (role management) |
