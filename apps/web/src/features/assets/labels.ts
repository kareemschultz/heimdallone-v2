// Plain-language labels + badge tones for the Assets UI (Phase 12D). No raw enum
// strings or IDs surface as primary text.

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

const STATUS_LABEL: Record<string, string> = {
	available: "Available",
	in_use: "In use",
	retired: "Retired",
};
const STATUS_TONE: Record<string, BadgeTone> = {
	available: "success",
	in_use: "info",
	retired: "neutral",
};
export function statusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status;
}
export function statusTone(status: string): BadgeTone {
	return STATUS_TONE[status] ?? "neutral";
}

const CONDITION_LABEL: Record<string, string> = {
	healthy: "Healthy",
	minor_damage: "Minor damage",
	major_damage: "Major damage",
};
export function conditionLabel(condition: string | null): string {
	if (!condition) {
		return "—";
	}
	return CONDITION_LABEL[condition] ?? condition;
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
	requested: "Requested",
	approved: "Approved",
	rejected: "Rejected",
	cancelled: "Cancelled",
};
const REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
	requested: "warning",
	approved: "success",
	rejected: "danger",
	cancelled: "neutral",
};
export function requestStatusLabel(status: string): string {
	return REQUEST_STATUS_LABEL[status] ?? status;
}
export function requestStatusTone(status: string): BadgeTone {
	return REQUEST_STATUS_TONE[status] ?? "neutral";
}

/** Format a date-ish value for display; "—" when absent. */
export function fmtDate(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
}

/** Format a money string only when present (already redacted server-side). */
export function fmtCost(value: string | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}
	const n = Number(value);
	if (Number.isNaN(n)) {
		return "—";
	}
	return n.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}
