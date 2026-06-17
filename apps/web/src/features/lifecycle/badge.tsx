export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * A pill badge for the Lifecycle module. ALWAYS renders its text label (never
 * colour-only) so meaning is accessible without relying on the tone colour
 * (UI Rule — no colour-only badges).
 */
export function Badge({
	tone,
	children,
}: {
	children: string;
	tone: BadgeTone;
}) {
	return <span className={`lc-badge tone-${tone}`}>{children}</span>;
}

export function disciplinaryStatusTone(status: string): BadgeTone {
	if (status === "closed") {
		return "success";
	}
	if (status === "overturned" || status === "withdrawn") {
		return "neutral";
	}
	if (status === "action_taken" || status === "appealed") {
		return "warning";
	}
	return "info";
}

export function transferStatusTone(status: string): BadgeTone {
	if (status === "effective") {
		return "success";
	}
	if (status === "rejected" || status === "cancelled") {
		return "neutral";
	}
	if (status === "approved" || status === "scheduled") {
		return "info";
	}
	return "warning";
}

export function resignationStatusTone(status: string): BadgeTone {
	if (status === "handed_off") {
		return "success";
	}
	if (status === "withdrawn" || status === "rejected") {
		return "neutral";
	}
	if (status === "hr_approved" || status === "manager_approved") {
		return "info";
	}
	return "warning";
}
