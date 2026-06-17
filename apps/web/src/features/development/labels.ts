// Development module — human labels (Phase Dev). No raw enums in the UI.

import type {
	CertExpiryState,
	CertStatus,
	EnrollmentStatus,
	ProgramStatus,
	SkillSource,
	TrainingDelivery,
} from "./types";

export const programStatusLabel: Record<ProgramStatus, string> = {
	draft: "Draft",
	active: "Active",
	archived: "Archived",
};

export const deliveryLabel: Record<TrainingDelivery, string> = {
	internal: "Internal",
	external: "External",
	online: "Online",
	in_person: "In person",
	blended: "Blended",
};

export const enrollmentStatusLabel: Record<EnrollmentStatus, string> = {
	enrolled: "Enrolled",
	in_progress: "In progress",
	completed: "Completed",
	failed: "Failed",
	withdrawn: "Withdrawn",
};

export const certStatusLabel: Record<CertStatus, string> = {
	active: "Active",
	revoked: "Revoked",
	superseded: "Superseded",
};

export const expiryStateLabel: Record<CertExpiryState, string> = {
	no_expiry: "No expiry",
	valid: "Valid",
	expiring_soon: "Expiring soon",
	expired: "Expired",
};

export const skillSourceLabel: Record<SkillSource, string> = {
	self: "Self-assessed",
	manager: "Manager-assessed",
	hr: "HR-assessed",
	import: "Imported",
};

export function expiryBadgeText(
	state: CertExpiryState,
	daysUntilExpiry: number | null,
	thresholdBucket: number | null
): string {
	if (state === "no_expiry") {
		return "No expiry";
	}
	if (state === "expired") {
		return daysUntilExpiry == null
			? "Expired"
			: `Expired ${Math.abs(daysUntilExpiry)}d ago`;
	}
	if (state === "expiring_soon") {
		const window = thresholdBucket ? `≤${thresholdBucket}d` : "Soon";
		return daysUntilExpiry == null
			? `Expiring (${window})`
			: `Expires in ${daysUntilExpiry}d`;
	}
	return "Valid";
}
