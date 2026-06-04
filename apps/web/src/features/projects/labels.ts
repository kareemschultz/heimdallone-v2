// Plain-language labels + badge tones for the Projects UI (Phase 14D). No raw
// enum strings or internal IDs surface as primary text. Badges always carry text
// (never colour-only). The project / task / time_entry AC + projects router are
// the source of truth; these are presentation only.

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

// ── Project status ────────────────────────────────────────────────────────────
const PROJECT_STATUS_LABEL: Record<string, string> = {
	planning: "Planning",
	active: "Active",
	on_hold: "On hold",
	completed: "Completed",
	cancelled: "Cancelled",
	archived: "Archived",
};
const PROJECT_STATUS_TONE: Record<string, BadgeTone> = {
	planning: "info",
	active: "info",
	on_hold: "warning",
	completed: "success",
	cancelled: "neutral",
	archived: "neutral",
};
export function projectStatusLabel(status: string): string {
	return PROJECT_STATUS_LABEL[status] ?? status;
}
export function projectStatusTone(status: string): BadgeTone {
	return PROJECT_STATUS_TONE[status] ?? "neutral";
}

const PROJECT_TERMINAL = new Set(["completed", "cancelled", "archived"]);
export function isActiveProjectStatus(status: string): boolean {
	return !PROJECT_TERMINAL.has(status);
}

// ── Project health (derived server-side) ──────────────────────────────────────
const HEALTH_LABEL: Record<string, string> = {
	on_track: "On track",
	at_risk: "At risk",
	off_track: "Off track",
	completed: "Completed",
	no_data: "No data",
};
const HEALTH_TONE: Record<string, BadgeTone> = {
	on_track: "success",
	at_risk: "warning",
	off_track: "danger",
	completed: "neutral",
	no_data: "neutral",
};
export function healthLabel(health: string): string {
	return HEALTH_LABEL[health] ?? health;
}
export function healthTone(health: string): BadgeTone {
	return HEALTH_TONE[health] ?? "neutral";
}
export function isAtRiskHealth(health: string): boolean {
	return health === "at_risk" || health === "off_track";
}

// ── Task status ───────────────────────────────────────────────────────────────
const TASK_STATUS_LABEL: Record<string, string> = {
	todo: "To do",
	in_progress: "In progress",
	blocked: "Blocked",
	in_review: "In review",
	done: "Done",
	cancelled: "Cancelled",
};
const TASK_STATUS_TONE: Record<string, BadgeTone> = {
	todo: "neutral",
	in_progress: "info",
	blocked: "danger",
	in_review: "warning",
	done: "success",
	cancelled: "neutral",
};
export function taskStatusLabel(status: string): string {
	return TASK_STATUS_LABEL[status] ?? status;
}
export function taskStatusTone(status: string): BadgeTone {
	return TASK_STATUS_TONE[status] ?? "neutral";
}

// ── Milestone status ──────────────────────────────────────────────────────────
const MILESTONE_STATUS_LABEL: Record<string, string> = {
	planned: "Planned",
	in_progress: "In progress",
	at_risk: "At risk",
	completed: "Completed",
	missed: "Missed",
	cancelled: "Cancelled",
};
const MILESTONE_STATUS_TONE: Record<string, BadgeTone> = {
	planned: "neutral",
	in_progress: "info",
	at_risk: "warning",
	completed: "success",
	missed: "danger",
	cancelled: "neutral",
};
export function milestoneStatusLabel(status: string): string {
	return MILESTONE_STATUS_LABEL[status] ?? status;
}
export function milestoneStatusTone(status: string): BadgeTone {
	return MILESTONE_STATUS_TONE[status] ?? "neutral";
}

// ── Priority (shared shape/tones with helpdesk for consistency) ───────────────
const PRIORITY_LABEL: Record<string, string> = {
	low: "Low",
	normal: "Normal",
	high: "High",
	urgent: "Urgent",
};
const PRIORITY_TONE: Record<string, BadgeTone> = {
	low: "neutral",
	normal: "info",
	high: "warning",
	urgent: "danger",
};
export function priorityLabel(priority: string | null): string {
	return priority ? (PRIORITY_LABEL[priority] ?? priority) : "—";
}
export function priorityTone(priority: string | null): BadgeTone {
	return priority ? (PRIORITY_TONE[priority] ?? "neutral") : "neutral";
}

// ── Time-entry status ─────────────────────────────────────────────────────────
const TIME_STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
};
const TIME_STATUS_TONE: Record<string, BadgeTone> = {
	draft: "neutral",
	submitted: "info",
	approved: "success",
	rejected: "danger",
};
export function timeStatusLabel(status: string): string {
	return TIME_STATUS_LABEL[status] ?? status;
}
export function timeStatusTone(status: string): BadgeTone {
	return TIME_STATUS_TONE[status] ?? "neutral";
}

// ── Formatting helpers ────────────────────────────────────────────────────────
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

/** Minutes → "Hh Mm" plain duration. */
export function fmtMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) {
		return `${m}m`;
	}
	if (m === 0) {
		return `${h}h`;
	}
	return `${h}h ${m}m`;
}
