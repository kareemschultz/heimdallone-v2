import type {
	CertExpiryState,
	CertStatus,
	EnrollmentStatus,
	ProgramStatus,
} from "./types";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * A pill badge for the Development module. ALWAYS renders its text label (never
 * colour-only) so meaning is accessible without relying on the tone colour.
 */
export function DevBadge({
	tone,
	children,
}: {
	children: string;
	tone: BadgeTone;
}) {
	return <span className={`dv-badge tone-${tone}`}>{children}</span>;
}

export function programStatusTone(status: ProgramStatus): BadgeTone {
	if (status === "active") {
		return "success";
	}
	if (status === "archived") {
		return "neutral";
	}
	return "info";
}

export function enrollmentStatusTone(status: EnrollmentStatus): BadgeTone {
	if (status === "completed") {
		return "success";
	}
	if (status === "failed") {
		return "danger";
	}
	if (status === "withdrawn") {
		return "neutral";
	}
	if (status === "in_progress") {
		return "info";
	}
	return "neutral";
}

export function expiryStateTone(state: CertExpiryState): BadgeTone {
	if (state === "expired") {
		return "danger";
	}
	if (state === "expiring_soon") {
		return "warning";
	}
	if (state === "valid") {
		return "success";
	}
	return "neutral";
}

export function certStatusTone(status: CertStatus): BadgeTone {
	if (status === "active") {
		return "success";
	}
	if (status === "revoked") {
		return "danger";
	}
	return "neutral";
}
