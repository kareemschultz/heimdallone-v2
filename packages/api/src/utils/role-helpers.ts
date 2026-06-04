// Server-side mirror of apps/web/src/lib/rbac.ts. Keep these in sync.
// See docs/reviews/phase-8j1-screenshot-ux-audit.md Finding #1.

export type MemberRole = string;

const OWNER_ROLES = new Set(["owner", "tenant_owner"]);
const ADMIN_ROLES = new Set(["admin", "tenant_admin"]);

export function isTenantOwner(role: MemberRole): boolean {
	return OWNER_ROLES.has(role);
}

export function isTenantAdmin(role: MemberRole): boolean {
	return ADMIN_ROLES.has(role);
}

export function isOwnerOrAdmin(role: MemberRole): boolean {
	return isTenantOwner(role) || isTenantAdmin(role);
}

export function canManageHR(role: MemberRole): boolean {
	return isOwnerOrAdmin(role) || role === "hr_admin";
}

export function canManagePayroll(role: MemberRole): boolean {
	return canManageHR(role) || role === "payroll_admin";
}

export function canViewPayroll(role: MemberRole): boolean {
	return canManagePayroll(role) || role === "auditor";
}

// Recruitment (Phase 9C)
export function canManageRecruitment(role: MemberRole): boolean {
	return canManageHR(role) || role === "recruiter";
}

export function canViewRecruitment(role: MemberRole): boolean {
	return canManageRecruitment(role) || role === "auditor" || role === "manager";
}

// Onboarding (Phase 9F)
export function canManageOnboarding(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewOnboarding(role: MemberRole): boolean {
	return (
		canManageOnboarding(role) ||
		role === "manager" ||
		role === "auditor" ||
		role === "recruiter"
	);
}

// Offboarding (Phase 10C)
export function canManageOffboarding(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewOffboarding(role: MemberRole): boolean {
	return (
		canManageOffboarding(role) ||
		role === "manager" ||
		role === "auditor" ||
		role === "payroll_admin"
	);
}

export function canReadOffboardingSettlement(role: MemberRole): boolean {
	return (
		canManageOffboarding(role) || role === "payroll_admin" || role === "auditor"
	);
}

// Biometric + Geofencing (Phase 11C). Device/site/sync management is HR-level;
// viewing extends to manager (scoped)/auditor/payroll. Geofence check-in is a
// self-service action for any attendance-taking staff (NOT manage-gated).
export function canManageBiometrics(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewBiometrics(role: MemberRole): boolean {
	return (
		canManageBiometrics(role) ||
		role === "manager" ||
		role === "auditor" ||
		role === "payroll_admin"
	);
}

export function canManageGeofencing(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewGeofencing(role: MemberRole): boolean {
	return (
		canManageGeofencing(role) ||
		role === "manager" ||
		role === "auditor" ||
		role === "payroll_admin"
	);
}

export function canUseGeofenceCheckIn(role: MemberRole): boolean {
	return canManagePayroll(role) || role === "manager" || role === "employee";
}

export function canReviewAttendanceExceptions(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager";
}

// Assets (Phase 12C). Mirror of apps/web/src/lib/rbac.ts — keep byte-aligned.
// The `asset` AC grants in permissions.ts are the source of truth; these helpers
// gate the handler-level re-check and (in rbac.ts) UI affordances.
//
// Managing assets (create/edit/assign/return/retire) is HR-level. Viewing the
// inventory extends to manager (direct-report scoped server-side)/auditor/
// payroll_admin. Requesting an asset is self-service for any staff role that
// holds asset:request (everyone except auditor/helpdesk). Seeing purchaseCost is
// finance/audit only — redacted server-side for everyone else.
export function canManageAssets(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewAssets(role: MemberRole): boolean {
	return (
		canManageAssets(role) ||
		role === "manager" ||
		role === "auditor" ||
		role === "payroll_admin"
	);
}

export function canAssignAssets(role: MemberRole): boolean {
	return canManageAssets(role);
}

export function canReturnAssets(role: MemberRole): boolean {
	return canManageAssets(role);
}

export function canRequestAsset(role: MemberRole): boolean {
	return (
		canManageAssets(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "employee" ||
		role === "recruiter"
	);
}

export function canViewAssetCosts(role: MemberRole): boolean {
	return (
		canManageAssets(role) || role === "payroll_admin" || role === "auditor"
	);
}

// Leave Policy Engine (Phase 7I). Mirror of apps/web/src/lib/rbac.ts — keep
// byte-aligned. Managing statutory/company leave policies (adopt/create/edit/
// activate) is HR-level; viewing extends to manager/payroll_admin/auditor.
// Seeing the payroll-treatment column is payroll-capable + auditor only. The
// employee "why this balance?" surface is gated by leave_request:read (self),
// NOT these helpers. AC grants in permissions.ts are the source of truth.
export function canManageLeavePolicy(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewLeavePolicy(role: MemberRole): boolean {
	return (
		canManageLeavePolicy(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "auditor"
	);
}

export function canViewLeavePayrollTreatment(role: MemberRole): boolean {
	return canManagePayroll(role) || role === "auditor";
}

// Helpdesk / Requests (Phase 13C). Mirror of apps/web/src/lib/rbac.ts — keep
// byte-aligned. The `ticket` AC grants in permissions.ts are the SOURCE OF TRUTH;
// these helpers gate the handler-level re-check (and, in rbac.ts, UI affordances).
//
// Managing the desk — triage / edit / assign / resolve / close / categories — is
// HR-level or the dedicated helpdesk_agent. Viewing extends to manager (own +
// direct-report scoped server-side) / payroll_admin / auditor. Creating a request
// is self-service for any role holding ticket:create. Approving is HR / manager
// (scoped) / payroll_admin. Internal notes are visible ONLY to agents/HR and
// (read-only) auditors — NEVER the requesting employee or a plain manager; the
// redaction is enforced server-side, not just in the UI.
export function canManageHelpdesk(role: MemberRole): boolean {
	return canManageHR(role) || role === "helpdesk_agent";
}

export function canViewHelpdesk(role: MemberRole): boolean {
	return (
		canManageHelpdesk(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "auditor"
	);
}

export function canAssignHelpdesk(role: MemberRole): boolean {
	return canManageHelpdesk(role);
}

export function canResolveHelpdesk(role: MemberRole): boolean {
	return canManageHelpdesk(role);
}

export function canApproveHelpdeskRequest(role: MemberRole): boolean {
	return (
		canManageHelpdesk(role) || role === "manager" || role === "payroll_admin"
	);
}

export function canViewHelpdeskInternalNotes(role: MemberRole): boolean {
	return canManageHelpdesk(role) || role === "auditor";
}

export function canCreateHelpdeskRequest(role: MemberRole): boolean {
	return canManageHelpdesk(role) || role === "manager" || role === "employee";
}

// Projects + Tasks / Timelines (Phase 14C). Mirror of apps/web/src/lib/rbac.ts —
// keep byte-aligned. The project / task / time_entry AC grants in permissions.ts
// are the SOURCE OF TRUTH; these helpers gate the handler-level re-check (and, in
// rbac.ts, UI affordances). CENTRAL GUARDRAIL: Projects is the coordination layer
// — it links to Assets / Helpdesk / CRM / Payroll / Attendance for context and
// NEVER mutates them.
//
// Managing projects (create / edit / archive / members / milestones / tasks) is
// HR-level or the dedicated project_manager (server-scoped to the projects they
// lead / belong to). Viewing the management surface extends to manager (own +
// direct-report scoped server-side) / payroll_admin / auditor — NOT plain
// employees, who reach Projects only through self-service (member projects, own
// tasks, own time), mirroring the helpdesk canViewHelpdesk vs createSelf split.
//
// Budget / cost is finance-redacted: canViewProjectCosts matches the AC
// `view_costs` grant (finance + audit only) and deliberately EXCLUDES
// project_manager and manager — they run delivery, not the books. Task internal
// notes are visible to the managing roles + auditor only, redacted server-side
// for everyone else.
export function canManageProjects(role: MemberRole): boolean {
	return canManageHR(role) || role === "project_manager";
}

export function canViewProjects(role: MemberRole): boolean {
	return (
		canManageProjects(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "auditor"
	);
}

export function canCreateProject(role: MemberRole): boolean {
	return canManageProjects(role);
}

export function canEditProject(role: MemberRole): boolean {
	return canManageProjects(role);
}

export function canArchiveProject(role: MemberRole): boolean {
	return canManageProjects(role);
}

export function canManageProjectMembers(role: MemberRole): boolean {
	return canManageProjects(role);
}

export function canAssignProjectTasks(role: MemberRole): boolean {
	return canManageProjects(role) || role === "manager";
}

// Self-service time logging — any delivery staff logs their OWN time; the server
// enforces self-scope on create/update/submit.
export function canTrackProjectTime(role: MemberRole): boolean {
	return canManageProjects(role) || role === "manager" || role === "employee";
}

export function canApproveProjectTime(role: MemberRole): boolean {
	return (
		canManageProjects(role) || role === "manager" || role === "payroll_admin"
	);
}

// Finance redaction gate (matches the AC `view_costs` grant — owner/admin/hr +
// payroll_admin + auditor; NOT project_manager/manager/employee).
export function canViewProjectCosts(role: MemberRole): boolean {
	return canManageHR(role) || role === "payroll_admin" || role === "auditor";
}

export function canViewProjectInternalNotes(role: MemberRole): boolean {
	return canManageProjects(role) || role === "auditor";
}

// Performance / PMS (Phase 15C). Mirror of apps/web/src/lib/rbac.ts — keep
// byte-aligned. The goal / appraisal / recognition AC grants in permissions.ts
// are the SOURCE OF TRUTH; these helpers gate the handler-level re-check (and, in
// rbac.ts, UI affordances). They are aligned to the ACTUAL grants (lesson #88),
// not the spec prose.
//
// Managing PMS (review cycles, templates, finalize) is HR-level. Employees are
// first-class participants: own goals, own review responses, own recognition.
// Managers see their direct reports (scoped server-side). Two HIGHEST-RISK
// redactions live in the handler: one_on_one.privateManagerNotes is returned ONLY
// to HR + the owning manager (never the employee, never auditor); peer review
// responses are anonymised + threshold-gated for the subject.
//
// Grant realities worth noting (NOT bugs — aligned to the reviewed matrix):
//   - goal:complete is held by owner/admin + employee only; hr_admin/manager
//     complete a report's goal via objectives.update(status), not .complete.
//   - appraisal:submit is held by owner/admin + manager + employee; an hr_admin
//     acting as a reviewer uses their manage grant elsewhere (edge case).
export function canManagePerformance(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canViewPerformance(role: MemberRole): boolean {
	return (
		canManagePerformance(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "auditor"
	);
}

export function canCreateObjective(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager" || role === "employee";
}

export function canUpdateObjective(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager" || role === "employee";
}

// goal:complete grant = owner/admin + employee (NOT hr_admin/manager).
export function canCompleteObjective(role: MemberRole): boolean {
	return isOwnerOrAdmin(role) || role === "employee";
}

export function canViewReviews(role: MemberRole): boolean {
	return canViewPerformance(role);
}

export function canManageReviewCycles(role: MemberRole): boolean {
	return canManageHR(role);
}

// appraisal:submit grant = owner/admin + manager + employee.
export function canSubmitReview(role: MemberRole): boolean {
	return isOwnerOrAdmin(role) || role === "manager" || role === "employee";
}

export function canReviewPerformance(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager";
}

export function canFinalizeReview(role: MemberRole): boolean {
	return canManageHR(role);
}

export function canAwardRecognition(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager";
}

export function canViewRecognition(role: MemberRole): boolean {
	return (
		canManageHR(role) ||
		role === "manager" ||
		role === "payroll_admin" ||
		role === "employee" ||
		role === "auditor"
	);
}

// Who may see one_on_one.privateManagerNotes at the ROLE level — HR + manager.
// The handler ADDITIONALLY scopes a manager to the 1-on-1s they own; an auditor
// is deliberately EXCLUDED (read-only does not extend to private manager notes).
export function canViewPrivatePerformanceNotes(role: MemberRole): boolean {
	return canManageHR(role) || role === "manager";
}
