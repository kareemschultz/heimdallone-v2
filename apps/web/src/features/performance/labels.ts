// Plain-language labels + badge tones for the Performance UI (Phase 15D). No raw
// enum strings or internal IDs surface as primary text. Badges always carry text
// (never colour-only). The goal / appraisal / recognition AC + performance router
// are the source of truth; these are presentation only.

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

// ── Objective (goal) status ────────────────────────────────────────────────────
const OBJECTIVE_STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	active: "Active",
	on_track: "On track",
	at_risk: "At risk",
	behind: "Behind",
	completed: "Completed",
	cancelled: "Cancelled",
};
const OBJECTIVE_STATUS_TONE: Record<string, BadgeTone> = {
	draft: "neutral",
	active: "info",
	on_track: "success",
	at_risk: "warning",
	behind: "danger",
	completed: "success",
	cancelled: "neutral",
};
export function objectiveStatusLabel(status: string): string {
	return OBJECTIVE_STATUS_LABEL[status] ?? status;
}
export function objectiveStatusTone(status: string): BadgeTone {
	return OBJECTIVE_STATUS_TONE[status] ?? "neutral";
}

const OBJECTIVE_TERMINAL = new Set(["completed", "cancelled"]);
export function isActiveObjective(status: string): boolean {
	return !OBJECTIVE_TERMINAL.has(status);
}
export function isAtRiskObjective(status: string): boolean {
	return status === "at_risk" || status === "behind";
}

// ── Key-result status ───────────────────────────────────────────────────────────
const KR_STATUS_LABEL: Record<string, string> = {
	not_started: "Not started",
	on_track: "On track",
	at_risk: "At risk",
	done: "Done",
};
const KR_STATUS_TONE: Record<string, BadgeTone> = {
	not_started: "neutral",
	on_track: "info",
	at_risk: "warning",
	done: "success",
};
export function keyResultStatusLabel(status: string): string {
	return KR_STATUS_LABEL[status] ?? status;
}
export function keyResultStatusTone(status: string): BadgeTone {
	return KR_STATUS_TONE[status] ?? "neutral";
}

const KR_TYPE_LABEL: Record<string, string> = {
	percentage: "Percentage",
	number: "Number",
	currency: "Amount",
	boolean: "Yes / No",
};
export function keyResultTypeLabel(type: string): string {
	return KR_TYPE_LABEL[type] ?? type;
}

// ── Linked project-task status (read-only context only) ─────────────────────────
const TASK_STATUS_LABEL: Record<string, string> = {
	todo: "To do",
	in_progress: "In progress",
	blocked: "Blocked",
	in_review: "In review",
	done: "Done",
	cancelled: "Cancelled",
};
export function linkedTaskStatusLabel(status: string): string {
	return TASK_STATUS_LABEL[status] ?? status;
}

// ── Formatting helpers ──────────────────────────────────────────────────────────
export function fmtDate(value: string | Date | null): string {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) {
		return "—";
	}
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Format a key-result value by its progress type. */
export function fmtKrValue(value: string | number, type: string): string {
	const n = typeof value === "string" ? Number(value) : value;
	if (Number.isNaN(n)) {
		return String(value);
	}
	if (type === "boolean") {
		return n >= 100 ? "Yes" : "No";
	}
	if (type === "percentage") {
		return `${Math.round(n)}%`;
	}
	if (type === "currency") {
		return n.toLocaleString();
	}
	return String(n);
}

export function progressTone(percent: number): BadgeTone {
	if (percent >= 100) {
		return "success";
	}
	if (percent >= 60) {
		return "info";
	}
	if (percent >= 30) {
		return "warning";
	}
	return "danger";
}
