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
	// Lifecycle (Phase Lifecycle-B) — disciplinary case tracking. `resignation`
	// and `transfer` (above) ALREADY existed but were UNCONSUMED; the lifecycle
	// router is their first consumer. `disciplinary` is NEW. Least-privilege
	// actions map to the case lifecycle so employee self-service (explain/appeal
	// on their OWN record) sits behind actions the subject actually holds:
	//   read   — view records/categories/actions (handler-scoped)
	//   create — open a record + manage the category/action catalogues (HR)
	//   explain— submit the employee explanation (employee on own + HR)
	//   act    — request explanation + record the final action (HR)
	//   appeal — submit an appeal (employee on own)
	//   close  — resolve/overturn an appeal, terminal close (HR)
	//   manage — archive catalogue entries (HR)
	disciplinary: [
		"read",
		"create",
		"explain",
		"act",
		"appeal",
		"close",
		"manage",
	],

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

	// Finance (Phase 16B) — costing + budgeting COORDINATION layer. Reads
	// payroll/projects/contracts read-only; OWNS only finance_budget. `read` =
	// cost reports + budgets view; `manage_budget` = budget CRUD; `export` =
	// cost CSV. First consumer = the 16C finance router → audit 121/15 → ~124/16.
	// journal/account stay UNCONSUMED (accounting/GL integration deferred).
	finance: ["read", "manage_budget", "export"],

	// Analytics (Phase 18B) — cross-module executive aggregation. Read-only;
	// OWNS no table. `read` = exec dashboard/KPIs; `export` = summary CSV.
	// First consumer = the 18C analytics router → audit 147/17 → ~149/18.
	analytics: ["read", "export"],

	// Notifications (Phase 21D-F) — a per-user in-app inbox held by EVERY member
	// (granted to all roles). `read` = list own inbox / unread count; `manage` =
	// mark read / dismiss OWN notifications. The handler always self-scopes to the
	// caller; creation is a server-side helper (other modules emit), not a user
	// action, so there is no `create` action here.
	notification: ["read", "manage"],

	attendance: ["create", "read", "correct"],
	attendance_device: ["read", "manage", "sync"],
	attendance_punch: ["read", "process", "import"],
	geofence: ["read", "manage", "check_in"],
	attendance_exception: ["read", "resolve"],
	// Roster (Phase 21D-D) — per-date shift scheduling that FEEDS attendance/
	// payroll. `read` = view the roster (handler scopes employees to own/team/org);
	// `manage` = create/edit/remove + bulk pattern assignment; `approve` = approve/
	// unapprove a rostered day. First consumed by the 21D `roster` router.
	roster: ["read", "manage", "approve"],
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
	// Performance / PMS (Phase 15B). `appraisal` + `goal` already existed (above)
	// but were UNCONSUMED — the Phase 15C `performance` router is the first to use
	// them. `recognition` is the NEW resource for the PMS-owned recognition-points
	// ledger (non-monetary; award is HR/manager, everyone reads their own).
	recognition: ["read", "award"],

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

	// CRM (Phase 17B) — Lead → Customer → Deal coordination layer. New resources
	// consumed first by the 17C `crm` router (audit rises then; 16B/15B/14B
	// precedent — unconsumed at the DB phase). `convert` (lead→customer+contact+
	// deal), `advance_stage`/`handoff` (deal), `manage` (pipeline settings), and
	// `read_private` (private sales notes — the redaction surface) are
	// least-privilege actions split out from generic update.
	crm_customer: ["create", "read", "update", "archive"],
	crm_contact: ["create", "read", "update", "archive"],
	crm_lead: ["create", "read", "update", "archive", "convert"],
	crm_deal: ["create", "read", "update", "archive", "advance_stage", "handoff"],
	crm_pipeline: ["read", "manage"],
	crm_activity: ["create", "read", "update", "archive"],
	crm_note: ["create", "read", "update", "archive", "read_private"],
} as const;

export const ac = createAccessControl(statement);

// CRM full-grant arrays (Phase 17B) — spread into the sales-admin/owner blocks.
const FULL_CRM = {
	crm_customer: ["create", "read", "update", "archive"],
	crm_contact: ["create", "read", "update", "archive"],
	crm_lead: ["create", "read", "update", "archive", "convert"],
	crm_deal: ["create", "read", "update", "archive", "advance_stage", "handoff"],
	crm_pipeline: ["read", "manage"],
	crm_activity: ["create", "read", "update", "archive"],
	crm_note: ["create", "read", "update", "archive", "read_private"],
} as const;

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

// Lifecycle (Phase Lifecycle-B) — full grants spread into the HR-level role
// blocks (owner/admin/hr_admin). disciplinary catalogue + lifecycle actions,
// plus the full transfer + resignation grants those roles already hold.
const FULL_DISCIPLINARY = [
	"read",
	"create",
	"explain",
	"act",
	"appeal",
	"close",
	"manage",
] as const;

export const tenant_owner = ac.newRole({
	...ownerAc.statements,
	notification: ["read", "manage"],
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
	disciplinary: FULL_DISCIPLINARY,
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
	finance: ["read", "manage_budget", "export"],
	analytics: ["read", "export"],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	roster: ["read", "manage", "approve"],
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
	recognition: ["read", "award"],
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
	...FULL_CRM,
});

export const tenant_admin = ac.newRole({
	...adminAc.statements,
	notification: ["read", "manage"],
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
	disciplinary: FULL_DISCIPLINARY,
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
	finance: ["read", "manage_budget", "export"],
	analytics: ["read", "export"],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	roster: ["read", "manage", "approve"],
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
	recognition: ["read", "award"],
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
	...FULL_CRM,
});

export const hr_admin = ac.newRole({
	...adminAc.statements,
	notification: ["read", "manage"],
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
	disciplinary: FULL_DISCIPLINARY,
	payroll: ["create", "read", "update"],
	payslip: ["draft", "read"],
	payroll_period: ["create", "read"],
	advance: ["create", "read", "approve_hr"],
	loan: ["create", "read", "approve_hr"],
	finance: ["read", "manage_budget", "export"],
	analytics: ["read", "export"],
	attendance: ["create", "read", "correct"],
	leave_request: ["create", "read", "approve", "reject", "cancel"],
	holiday: ["create", "read", "update", "archive"],
	work_location: ["read", "manage"],
	roster: ["read", "manage", "approve"],
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
	recognition: ["read", "award"],
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
	notification: ["read", "manage"],
	employee: ["read"],
	resignation: ["read", "complete"],
	payroll: ["create", "read", "update", "delete"],
	payslip: ["draft", "finalize", "reverse", "read"],
	payroll_period: ["create", "read", "finalize", "cancel", "delete"],
	advance: ["read", "approve_accounting", "disburse"],
	loan: ["read", "approve_accounting", "disburse", "write_off"],
	// Payroll reads the roster (it feeds pay) but does not edit/approve it.
	roster: ["read"],
	finance: ["read", "manage_budget", "export"],
	analytics: ["read", "export"],
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
	recognition: ["read"],
	asset: ["read", "request"],
	ticket: ["read", "approve"],
	offboarding: ["read", "read_settlement"],
	// Finance sees project/time cost summaries; approves time for costing. No
	// task workflow.
	project: ["read", "view_costs"],
	task: ["read"],
	time_entry: ["read", "approve", "view_costs"],
	crm_customer: ["read"],
	crm_contact: ["read"],
	crm_deal: ["read"],
	crm_activity: ["read"],
	crm_note: ["read"],
	crm_pipeline: ["read"],
});

export const manager = ac.newRole({
	...memberAc.statements,
	notification: ["read", "manage"],
	employee: ["read"],
	resignation: ["read", "approve"],
	// Lifecycle: managers may PROPOSE a transfer for a direct report (create/
	// submit/cancel) — approval + execute stay HR-only. Disciplinary is read-only
	// for managers (direct reports, handler-scoped); internal notes are redacted.
	transfer: ["read", "create", "submit", "cancel"],
	disciplinary: ["read"],
	// Managers roster their own team; the handler scopes to direct reports.
	roster: ["read", "manage", "approve"],
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
	recognition: ["read", "award"],
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
	finance: ["read"],
	analytics: ["read"],
	crm_customer: ["read"],
	crm_contact: ["read"],
	crm_lead: ["read"],
	crm_deal: ["read"],
	crm_activity: ["create", "read"],
	crm_note: ["read"],
	crm_pipeline: ["read"],
});

export const employee = ac.newRole({
	...memberAc.statements,
	notification: ["read", "manage"],
	employee: ["read"],
	resignation: ["create", "read", "withdraw"],
	// Lifecycle self-service: an employee reads, explains, and appeals their OWN
	// disciplinary record (handler self-scopes; internal notes are redacted).
	disciplinary: ["read", "explain", "appeal"],
	// Employees see their OWN roster (handler self-scopes); cannot edit/approve.
	roster: ["read"],
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
	recognition: ["read"],
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
	notification: ["read", "manage"],
	employee: ["read"],
	resignation: ["read"],
	transfer: ["read"],
	// Read-only lifecycle oversight (internal notes still redacted server-side).
	disciplinary: ["read"],
	// Read-only oversight of the roster.
	roster: ["read"],
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
	finance: ["read", "export"],
	analytics: ["read", "export"],
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
	recognition: ["read"],
	asset: ["read"],
	ticket: ["read"],
	offboarding: ["read", "read_settlement"],
	// Read-only across projects incl. costs + internal notes (audit access).
	project: ["read", "view_costs", "view_internal_notes"],
	task: ["read", "view_internal_notes"],
	time_entry: ["read", "view_costs"],
	crm_customer: ["read"],
	crm_contact: ["read"],
	crm_lead: ["read"],
	crm_deal: ["read"],
	crm_activity: ["read"],
	crm_note: ["read"],
	crm_pipeline: ["read"],
});

export const recruiter = ac.newRole({
	...memberAc.statements,
	notification: ["read", "manage"],
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
	notification: ["read", "manage"],
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
	notification: ["read", "manage"],
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
	crm_customer: ["read"],
	crm_deal: ["read", "handoff"],
	crm_activity: ["create", "read"],
	crm_note: ["read"],
	crm_pipeline: ["read"],
});

// CRM admin (Phase 17B) — the org-wide sales/CRM administrator: full pipeline +
// all leads/customers/deals + settings + private notes. The CRM analogue of
// hr_admin / payroll_admin / project_manager.
export const sales_admin = ac.newRole({
	...memberAc.statements,
	notification: ["read", "manage"],
	employee: ["read"],
	document: ["read"],
	...FULL_CRM,
});

// CRM rep (Phase 17B) — owns/works their OWN leads & deals (handler enforces the
// owner/team lateral scope; the grant is the ceiling). No pipeline settings, but
// may read private notes they author/own (handler-scoped).
export const sales_rep = ac.newRole({
	...memberAc.statements,
	notification: ["read", "manage"],
	employee: ["read"],
	document: ["read"],
	crm_customer: ["create", "read", "update"],
	crm_contact: ["create", "read", "update"],
	crm_lead: ["create", "read", "update", "convert"],
	crm_deal: ["create", "read", "update", "advance_stage", "handoff"],
	crm_activity: ["create", "read", "update"],
	crm_note: ["create", "read", "read_private"],
	crm_pipeline: ["read"],
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
	sales_admin,
	sales_rep,
} as const;

export type TenantRole = keyof typeof roles;
