import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,

	organization: ["update", "delete"],
	member: ["create", "update", "delete", "invite", "update_role", "remove"],
	onboarding: [
		"read",
		"create",
		"update",
		"archive",
		"start",
		"assign",
		"complete",
		"skip",
		"approve_document",
		"sign_acknowledgement",
	],

	employee: ["create", "read", "update", "terminate"],
	resignation: ["create", "read", "approve", "complete", "withdraw"],
	transfer: ["create", "read", "submit", "approve", "execute", "cancel"],

	payroll: ["create", "read", "update", "delete"],
	payslip: ["draft", "finalize", "reverse", "read"],
	payroll_period: ["create", "read", "finalize", "cancel", "delete"],
	advance: ["create", "read", "approve_hr", "approve_accounting", "disburse"],
	loan: [
		"create",
		"read",
		"approve_hr",
		"approve_accounting",
		"disburse",
		"write_off",
	],

	attendance: ["create", "read", "correct"],
	attendance_device: ["read", "manage", "sync"],
	attendance_punch: ["read", "process", "import"],
	geofence: ["read", "manage", "check_in"],
	attendance_exception: ["read", "resolve"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	// Phase 7I — statutory/company leave policy library. "adopt" snapshots a
	// system template into an org-owned policy. Entitlement source is labour
	// law / NIS, NOT GRA (GRA only governs payroll/PAYE treatment of leave pay).
	leave_policy: ["read", "create", "update", "adopt", "activate", "archive"],

	audit_log: ["read"],
	export: ["generate"],

	document: ["create", "read", "update", "archive", "scan_expiring"],

	journal: ["post", "reverse", "read"],
	account: ["create", "read", "update", "archive"],

	statutory_rules: ["read", "update"],

	posting: ["create", "read", "update", "publish", "archive"],
	applicant: ["create", "read", "update", "convert"],
	interview: ["create", "read", "update", "complete"],
	offer: ["create", "read", "extend", "withdraw"],

	appraisal: ["create", "read", "submit", "review", "finalize", "manage"],
	goal: ["create", "read", "update", "complete"],

	// "request" (Phase 12C) is the employee/manager self-service action for
	// asking HR for an asset. It is deliberately separate from "create" (which
	// mints an asset row) so self-service can be gated by an action staff
	// actually hold — see the offboarding documents.markUploaded dead-branch
	// lesson (a self-service handler must never sit behind a manage-only gate).
	asset: [
		"create",
		"read",
		"assign",
		"return",
		"write_off",
		"manage",
		"request",
	],

	ticket: ["create", "read", "update", "assign", "resolve", "close", "approve"],

	// Projects + Tasks / Timelines (Phase 14B). Coordination layer — links to
	// other modules, never owns their rules. `view_costs` / `view_internal_notes`
	// gate finance + private data server-side (redaction, like assets purchaseCost
	// + helpdesk internal notes). time_entry is reporting-only (no payroll write).
	project: [
		"create",
		"read",
		"update",
		"archive",
		"manage_members",
		"view_costs",
		"view_internal_notes",
	],
	task: [
		"create",
		"read",
		"update",
		"assign",
		"change_status",
		"comment",
		"view_internal_notes",
	],
	time_entry: ["create", "read", "update", "submit", "approve", "view_costs"],

	offboarding: [
		"create",
		"read",
		"update",
		"approve",
		"reject",
		"cancel",
		"start",
		"close",
		"complete_task",
		"manage_assets",
		"manage_access",
		"manage_documents",
		"manage_interview",
		"read_settlement",
	],
} as const;

export const ac = createAccessControl(statement);

// Biometric + Geofencing (Phase 11C) — the full managing grant for
// owner/admin/hr_admin. Spread into those role blocks.
const MANAGE_BIOMETRIC = {
	attendance_device: ["read", "manage", "sync"],
	attendance_punch: ["read", "process", "import"],
	geofence: ["read", "manage", "check_in"],
	attendance_exception: ["read", "resolve"],
} as const;

// Projects full-grant arrays (Phase 14B) — spread into role blocks.
const FULL_PROJECT = [
	"create",
	"read",
	"update",
	"archive",
	"manage_members",
	"view_costs",
	"view_internal_notes",
] as const;
const FULL_TASK = [
	"create",
	"read",
	"update",
	"assign",
	"change_status",
	"comment",
	"view_internal_notes",
] as const;
const FULL_TIME_ENTRY = [
	"create",
	"read",
	"update",
	"submit",
	"approve",
	"view_costs",
] as const;

const FULL_OFFBOARDING = [
	"create",
	"read",
	"update",
	"approve",
	"reject",
	"cancel",
	"start",
	"close",
	"complete_task",
	"manage_assets",
	"manage_access",
	"manage_documents",
	"manage_interview",
	"read_settlement",
] as const;

export const tenant_owner = ac.newRole({
	...ownerAc.statements,
	member: ["create", "update", "delete", "invite", "update_role", "remove"],
	onboarding: [
		"read",
		"create",
		"update",
		"archive",
		"start",
		"assign",
		"complete",
		"skip",
		"approve_document",
		"sign_acknowledgement",
	],
	employee: ["create", "read", "update", "terminate"],
	resignation: ["create", "read", "approve", "complete", "withdraw"],
	transfer: ["create", "read", "submit", "approve", "execute", "cancel"],
	payroll: ["create", "read", "update", "delete"],
	payslip: ["draft", "finalize", "reverse", "read"],
	payroll_period: ["create", "read", "finalize", "cancel", "delete"],
	advance: ["create", "read", "approve_hr", "approve_accounting", "disburse"],
	loan: [
		"create",
		"read",
		"approve_hr",
		"approve_accounting",
		"disburse",
		"write_off",
	],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	leave_policy: ["read", "create", "update", "adopt", "activate", "archive"],
	audit_log: ["read"],
	export: ["generate"],
	document: ["create", "read", "update", "archive", "scan_expiring"],
	journal: ["post", "reverse", "read"],
	account: ["create", "read", "update", "archive"],
	statutory_rules: ["read", "update"],
	posting: ["create", "read", "update", "publish", "archive"],
	applicant: ["create", "read", "update", "convert"],
	interview: ["create", "read", "update", "complete"],
	offer: ["create", "read", "extend", "withdraw"],
	appraisal: ["create", "read", "submit", "review", "finalize", "manage"],
	goal: ["create", "read", "update", "complete"],
	asset: [
		"create",
		"read",
		"assign",
		"return",
		"write_off",
		"manage",
		"request",
	],
	ticket: ["create", "read", "update", "assign", "resolve", "close", "approve"],
	offboarding: FULL_OFFBOARDING,
	project: FULL_PROJECT,
	task: FULL_TASK,
	time_entry: FULL_TIME_ENTRY,
	...MANAGE_BIOMETRIC,
});

export const tenant_admin = ac.newRole({
	...adminAc.statements,
	member: ["create", "update", "delete", "invite", "update_role", "remove"],
	onboarding: [
		"read",
		"create",
		"update",
		"archive",
		"start",
		"assign",
		"complete",
		"skip",
		"approve_document",
		"sign_acknowledgement",
	],
	employee: ["create", "read", "update", "terminate"],
	resignation: ["create", "read", "approve", "complete", "withdraw"],
	transfer: ["create", "read", "submit", "approve", "execute", "cancel"],
	payroll: ["create", "read", "update", "delete"],
	payslip: ["draft", "finalize", "reverse", "read"],
	payroll_period: ["create", "read", "finalize", "cancel", "delete"],
	advance: ["create", "read", "approve_hr", "approve_accounting", "disburse"],
	loan: [
		"create",
		"read",
		"approve_hr",
		"approve_accounting",
		"disburse",
		"write_off",
	],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	leave_policy: ["read", "create", "update", "adopt", "activate", "archive"],
	audit_log: ["read"],
	export: ["generate"],
	document: ["create", "read", "update", "archive", "scan_expiring"],
	journal: ["post", "reverse", "read"],
	account: ["create", "read", "update", "archive"],
	statutory_rules: ["read"],
	posting: ["create", "read", "update", "publish", "archive"],
	applicant: ["create", "read", "update", "convert"],
	interview: ["create", "read", "update", "complete"],
	offer: ["create", "read", "extend", "withdraw"],
	appraisal: ["create", "read", "submit", "review", "finalize", "manage"],
	goal: ["create", "read", "update", "complete"],
	asset: [
		"create",
		"read",
		"assign",
		"return",
		"write_off",
		"manage",
		"request",
	],
	ticket: ["create", "read", "update", "assign", "resolve", "close", "approve"],
	offboarding: FULL_OFFBOARDING,
	project: FULL_PROJECT,
	task: FULL_TASK,
	time_entry: FULL_TIME_ENTRY,
	...MANAGE_BIOMETRIC,
});

export const hr_admin = ac.newRole({
	...adminAc.statements,
	member: ["create", "update", "delete", "invite", "update_role", "remove"],
	onboarding: [
		"read",
		"create",
		"update",
		"archive",
		"start",
		"assign",
		"complete",
		"skip",
		"approve_document",
		"sign_acknowledgement",
	],
	employee: ["create", "read", "update", "terminate"],
	resignation: ["create", "read", "approve", "complete", "withdraw"],
	transfer: ["create", "read", "submit", "approve", "execute", "cancel"],
	payroll: ["create", "read", "update"],
	payslip: ["draft", "read"],
	payroll_period: ["create", "read"],
	advance: ["create", "read", "approve_hr"],
	loan: ["create", "read", "approve_hr"],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	leave_policy: ["read", "create", "update", "adopt", "activate", "archive"],
	audit_log: ["read"],
	export: ["generate"],
	document: ["create", "read", "update", "archive", "scan_expiring"],
	journal: ["read"],
	account: ["read"],
	statutory_rules: ["read"],
	posting: ["create", "read", "update", "publish", "archive"],
	applicant: ["create", "read", "update", "convert"],
	interview: ["create", "read", "update", "complete"],
	offer: ["create", "read", "extend", "withdraw"],
	appraisal: ["create", "read", "review", "finalize", "manage"],
	goal: ["create", "read", "update"],
	asset: ["create", "read", "assign", "return", "manage", "request"],
	ticket: ["create", "read", "update", "assign", "resolve", "close", "approve"],
	offboarding: FULL_OFFBOARDING,
	project: FULL_PROJECT,
	task: FULL_TASK,
	time_entry: ["read", "approve", "view_costs"],
	...MANAGE_BIOMETRIC,
});

export const payroll_admin = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	resignation: ["read", "complete"],
	payroll: ["create", "read", "update", "delete"],
	payslip: ["draft", "finalize", "reverse", "read"],
	payroll_period: ["create", "read", "finalize", "cancel", "delete"],
	advance: ["read", "approve_accounting", "disburse"],
	loan: ["read", "approve_accounting", "disburse", "write_off"],
	attendance: ["read"],
	attendance_device: ["read"],
	attendance_punch: ["read"],
	geofence: ["read", "check_in"],
	attendance_exception: ["read"],
	leave_request: ["read"],
	holiday: ["read"],
	work_location: ["read"],
	leave_policy: ["read"],
	audit_log: ["read"],
	export: ["generate"],
	document: ["read"],
	journal: ["post", "reverse", "read"],
	account: ["create", "read", "update", "archive"],
	statutory_rules: ["read"],
	posting: ["read"],
	applicant: ["read"],
	interview: ["read"],
	offer: ["read"],
	appraisal: ["read"],
	goal: ["read"],
	asset: ["read", "request"],
	ticket: ["read", "approve"],
	offboarding: ["read", "read_settlement"],
	// Finance sees project/time cost summaries; approves time for costing. No
	// task workflow.
	project: ["read", "view_costs"],
	task: ["read"],
	time_entry: ["read", "approve", "view_costs"],
});

export const manager = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	resignation: ["read", "approve"],
	payslip: ["read"],
	payroll_period: ["read"],
	attendance: ["read"],
	attendance_device: ["read"],
	attendance_punch: ["read"],
	geofence: ["read", "check_in"],
	attendance_exception: ["read", "resolve"],
	leave_request: ["create", "read", "approve", "reject"],
	holiday: ["read"],
	work_location: ["read"],
	leave_policy: ["read"],
	document: ["read"],
	asset: ["read", "request"],
	appraisal: ["read", "submit", "review"],
	goal: ["create", "read", "update"],
	posting: ["read"],
	applicant: ["read"],
	interview: ["read", "update", "complete"],
	onboarding: ["read", "complete", "skip", "assign"],
	ticket: ["create", "read", "approve"],
	offboarding: ["read", "approve", "complete_task"],
	// Manager: reads team projects; manages/assigns team tasks; approves team time
	// (server scopes to own + direct reports).
	project: ["read"],
	task: ["read", "update", "assign", "change_status", "comment"],
	time_entry: ["read", "approve"],
});

export const employee = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	resignation: ["create", "read", "withdraw"],
	onboarding: ["read", "complete", "sign_acknowledgement"],
	payslip: ["read"],
	payroll_period: ["read"],
	advance: ["create", "read"],
	loan: ["create", "read"],
	attendance: ["read"],
	geofence: ["read", "check_in"],
	leave_request: ["create", "read", "cancel"],
	holiday: ["read"],
	work_location: ["read"],
	document: ["create", "read"],
	asset: ["read", "request"],
	appraisal: ["read", "submit"],
	goal: ["create", "read", "update", "complete"],
	posting: ["read"],
	ticket: ["create", "read"],
	// Employee self-service: read member projects; update/complete OWN assigned
	// tasks; comment public; log + submit OWN time (server enforces self-scope).
	project: ["read"],
	task: ["read", "update", "change_status", "comment"],
	time_entry: ["create", "read", "update", "submit"],
});

export const auditor = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	resignation: ["read"],
	transfer: ["read"],
	onboarding: ["read"],
	payroll: ["read"],
	attendance_device: ["read"],
	attendance_punch: ["read"],
	geofence: ["read"],
	attendance_exception: ["read"],
	payslip: ["read"],
	payroll_period: ["read"],
	advance: ["read"],
	loan: ["read"],
	attendance: ["read"],
	leave_request: ["read"],
	holiday: ["read"],
	work_location: ["read"],
	leave_policy: ["read"],
	audit_log: ["read"],
	export: ["generate"],
	document: ["read"],
	journal: ["read"],
	account: ["read"],
	statutory_rules: ["read"],
	posting: ["read"],
	applicant: ["read"],
	interview: ["read"],
	offer: ["read"],
	appraisal: ["read"],
	goal: ["read"],
	asset: ["read"],
	ticket: ["read"],
	offboarding: ["read", "read_settlement"],
	// Read-only across projects incl. costs + internal notes (audit access).
	project: ["read", "view_costs", "view_internal_notes"],
	task: ["read", "view_internal_notes"],
	time_entry: ["read", "view_costs"],
});

export const recruiter = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	posting: ["create", "read", "update", "publish", "archive"],
	applicant: ["create", "read", "update", "convert"],
	interview: ["create", "read", "update", "complete"],
	offer: ["create", "read", "extend", "withdraw"],
	onboarding: ["read", "start"],
	document: ["read"],
	// Recruiters are staff too: they may self-request company property and see
	// their own custody (read), but not the asset inventory (canViewAssets=false).
	asset: ["read", "request"],
});

export const helpdesk_agent = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	ticket: ["create", "read", "update", "assign", "resolve", "close", "approve"],
	document: ["read"],
});

// Projects-manager role (Phase 14B). This is the org-wide PROJECTS administrator
// tier — it manages every project in the org (create/edit/archive, members,
// tasks, milestones) and approves project time, the same way hr_admin is the
// org-wide HR tier. Per-PROJECT leadership is a separate, scoped concept carried
// by `project_member.role = 'lead'`, NOT by this role. NOT granted view_costs
// (finance/audit hold that), so project budgets are redacted for this role even
// though it sees internal notes. (14I review confirmed the handler's
// `seesAllProjects` intentionally includes this role; scoping it to lead/member
// projects would require every projects-manager to also be an employee + member,
// which is deferred — the lead/member split above already covers project-level
// scope.)
export const project_manager = ac.newRole({
	...memberAc.statements,
	employee: ["read"],
	document: ["read"],
	project: [
		"create",
		"read",
		"update",
		"archive",
		"manage_members",
		"view_internal_notes",
	],
	task: FULL_TASK,
	time_entry: ["create", "read", "update", "submit", "approve"],
});

export const roles = {
	tenant_owner,
	tenant_admin,
	hr_admin,
	payroll_admin,
	manager,
	employee,
	auditor,
	recruiter,
	helpdesk_agent,
	project_manager,
} as const;

export type TenantRole = keyof typeof roles;
