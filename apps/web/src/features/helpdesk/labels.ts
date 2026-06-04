// Plain-language labels + badge tones for the Helpdesk UI (Phase 13D). No raw
// enum strings or internal IDs surface as primary text. Badges always carry text
// (never colour-only). The `ticket` AC + helpdesk router are the source of truth;
// these are presentation only.

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

// ── Request status ──────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
	new: "New",
	open: "Open",
	in_progress: "In progress",
	waiting_on_employee: "Waiting on employee",
	waiting_on_approval: "Waiting on approval",
	resolved: "Resolved",
	closed: "Closed",
	cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, BadgeTone> = {
	new: "info",
	open: "info",
	in_progress: "info",
	waiting_on_employee: "warning",
	waiting_on_approval: "warning",
	resolved: "success",
	closed: "neutral",
	cancelled: "neutral",
};
export function statusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status;
}
export function statusTone(status: string): BadgeTone {
	return STATUS_TONE[status] ?? "neutral";
}

// Statuses that are still "live" (not resolved/closed/cancelled). Used for the
// overview "needs attention" derivations.
const TERMINAL_STATUSES = new Set(["resolved", "closed", "cancelled"]);
export function isActiveStatus(status: string): boolean {
	return !TERMINAL_STATUSES.has(status);
}

// ── Priority ────────────────────────────────────────────────────────────────
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
export function priorityLabel(priority: string): string {
	return PRIORITY_LABEL[priority] ?? priority;
}
export function priorityTone(priority: string): BadgeTone {
	return PRIORITY_TONE[priority] ?? "neutral";
}

// ── SLA state (derived server-side, displayed read-only) ────────────────────
const SLA_LABEL: Record<string, string> = {
	not_applicable: "No SLA",
	on_track: "On track",
	due_soon: "Due soon",
	overdue: "Overdue",
	breached: "Breached",
};
const SLA_TONE: Record<string, BadgeTone> = {
	not_applicable: "neutral",
	on_track: "success",
	due_soon: "warning",
	overdue: "danger",
	breached: "danger",
};
export function slaLabel(state: string): string {
	return SLA_LABEL[state] ?? state;
}
export function slaTone(state: string): BadgeTone {
	return SLA_TONE[state] ?? "neutral";
}
export function isAtRiskSla(state: string | null | undefined): boolean {
	return state === "overdue" || state === "breached";
}

// ── Approval status ─────────────────────────────────────────────────────────
const APPROVAL_LABEL: Record<string, string> = {
	none: "No approval needed",
	pending: "Waiting for approval",
	approved: "Approved",
	rejected: "Rejected",
};
const APPROVAL_TONE: Record<string, BadgeTone> = {
	none: "neutral",
	pending: "warning",
	approved: "success",
	rejected: "danger",
};
export function approvalLabel(status: string): string {
	return APPROVAL_LABEL[status] ?? status;
}
export function approvalTone(status: string): BadgeTone {
	return APPROVAL_TONE[status] ?? "neutral";
}

// ── Category key (fallback friendly names; the row's category name wins) ─────
const CATEGORY_KEY_LABEL: Record<string, string> = {
	hr: "HR",
	payroll: "Payroll",
	attendance: "Attendance",
	leave: "Leave",
	documents: "Documents",
	assets: "Assets",
	it: "IT",
	facilities: "Facilities",
	finance: "Finance",
	general: "General",
	custom: "Other",
};
export function categoryKeyLabel(key: string): string {
	return CATEGORY_KEY_LABEL[key] ?? key;
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
