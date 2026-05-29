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
