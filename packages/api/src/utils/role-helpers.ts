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
