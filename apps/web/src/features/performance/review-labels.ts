// Plain-language labels + tones for the Review-cycle UI (Phase 15E). The 15C
// `performance.reviewCycles` procs are the source of truth; these are
// presentation only. Peer-review anonymity is enforced SERVER-SIDE (the results
// proc returns hidden/aggregated/raw modes) — the UI only renders what it is
// given and NEVER reconstructs a hidden identity.

import type { BadgeTone } from "./labels";

const CYCLE_STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	active: "Active",
	closed: "Closed",
	cancelled: "Cancelled",
};
const CYCLE_STATUS_TONE: Record<string, BadgeTone> = {
	draft: "neutral",
	active: "success",
	closed: "info",
	cancelled: "neutral",
};
export function cycleStatusLabel(status: string): string {
	return CYCLE_STATUS_LABEL[status] ?? status;
}
export function cycleStatusTone(status: string): BadgeTone {
	return CYCLE_STATUS_TONE[status] ?? "neutral";
}

const CYCLE_TYPE_LABEL: Record<string, string> = {
	self: "Self review",
	manager: "Manager review",
	three_sixty: "360 review",
	upward: "Upward review",
};
export function cycleTypeLabel(type: string): string {
	return CYCLE_TYPE_LABEL[type] ?? type;
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
	pending: "Not started",
	in_progress: "In progress",
	submitted: "Submitted",
	declined: "Declined",
};
const REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
	pending: "neutral",
	in_progress: "warning",
	submitted: "success",
	declined: "neutral",
};
export function requestStatusLabel(status: string): string {
	return REQUEST_STATUS_LABEL[status] ?? status;
}
export function requestStatusTone(status: string): BadgeTone {
	return REQUEST_STATUS_TONE[status] ?? "neutral";
}

const RELATIONSHIP_LABEL: Record<string, string> = {
	self: "Self",
	manager: "Manager",
	peer: "Peer",
	report: "Direct report",
};
export function relationshipLabel(relationship: string): string {
	return RELATIONSHIP_LABEL[relationship] ?? relationship;
}

export function isOpenRequest(status: string): boolean {
	return status === "pending" || status === "in_progress";
}
