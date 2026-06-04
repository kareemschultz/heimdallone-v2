// Centralized role helpers. See docs/reviews/phase-8j1-screenshot-ux-audit.md
// Finding #1. Better Auth's organization plugin auto-creates the org creator's
// membership with role "owner" (its default), while our seed and ACL use the
// custom name "tenant_owner". These helpers accept both so existing seeds and
// new ones work without breaking RBAC.

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

export function isEmployee(role: MemberRole): boolean {
	return role === "employee";
}

export function isManager(role: MemberRole): boolean {
	return role === "manager";
}

// Recruitment (Phase 9C)
// Recruiters and HR can create/update; admins + owner inherit via canManageHR.
export function canManageRecruitment(role: MemberRole): boolean {
	return canManageHR(role) || role === "recruiter";
}

// Hiring managers can VIEW their own opening's data (the per-opening filter is
// enforced server-side); auditors can view aggregates.
export function canViewRecruitment(role: MemberRole): boolean {
	return canManageRecruitment(role) || role === "auditor" || role === "manager";
}

// Onboarding (Phase 9F). Employee self-service (own tasks/acks) is enforced
// server-side via self-scope, not via canViewOnboarding.
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

// Offboarding (Phase 10C). Employee self-service uses the resignation resource
// server-side; canViewOffboarding governs HR/manager/auditor access.
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

// Biometric + Geofencing (Phase 11C). Mirror of role-helpers.ts. Device/site/sync
// management is HR-level; viewing extends to manager (scoped)/auditor/payroll.
// Geofence check-in is a self-service action for attendance-taking staff (the API
// enforces per-employee self-scope; it is NOT manage-gated).
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

// Assets (Phase 12C). Mirror of packages/api/src/utils/role-helpers.ts — keep
// byte-aligned. The `asset` AC grants in permissions.ts are the source of truth;
// these gate UI affordances only (the API re-checks every call server-side).
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

// Leave Policy Engine (Phase 7I). Mirror of packages/api/src/utils/role-helpers.ts
// — keep byte-aligned. Managing statutory/company leave policies (adopt/create/
// edit/activate) is HR-level; viewing extends to manager/payroll_admin/auditor.
// Seeing the payroll-treatment column is payroll-capable + auditor only. The
// employee "why this balance?" surface is gated by leave_request:read (self),
// NOT these helpers (the API enforces self-scope server-side).
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

// Helpdesk / Requests (Phase 13C). Mirror of packages/api/src/utils/role-helpers.ts
// — keep byte-aligned. The `ticket` AC grants in permissions.ts are the source of
// truth; these gate UI affordances only (the API re-checks every call server-side).
//
// Managing the desk (triage/edit/assign/resolve/close/categories) is HR-level or
// the dedicated helpdesk_agent. Viewing extends to manager (own + direct-report
// scoped server-side)/payroll_admin/auditor. Creating a request is self-service for
// any role holding ticket:create. Approving is HR/manager(scoped)/payroll_admin.
// Internal notes are agents/HR + read-only auditor only — NEVER the requesting
// employee or a plain manager (redaction is enforced server-side).
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

// Projects + Tasks / Timelines (Phase 14C). Mirror of
// packages/api/src/utils/role-helpers.ts — keep byte-aligned. Projects is the
// coordination layer (links, never mutates other modules). Managing is HR-level
// or project_manager; viewing the management surface extends to manager /
// payroll_admin / auditor (employees reach Projects via self-service only).
// Budget is finance-redacted (canViewProjectCosts = finance + audit, NOT
// project_manager/manager); task internal notes are managing-roles + auditor only.
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

export function canTrackProjectTime(role: MemberRole): boolean {
	return canManageProjects(role) || role === "manager" || role === "employee";
}

export function canApproveProjectTime(role: MemberRole): boolean {
	return (
		canManageProjects(role) || role === "manager" || role === "payroll_admin"
	);
}

export function canViewProjectCosts(role: MemberRole): boolean {
	return canManageHR(role) || role === "payroll_admin" || role === "auditor";
}

export function canViewProjectInternalNotes(role: MemberRole): boolean {
	return canManageProjects(role) || role === "auditor";
}
