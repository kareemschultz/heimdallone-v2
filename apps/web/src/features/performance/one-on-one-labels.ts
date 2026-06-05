// Labels for the 1-on-1 UI (Phase 15F). privateManagerNotes are redacted
// SERVER-SIDE (the detail proc returns canViewPrivateNotes) — these are
// presentation only.

import type { BadgeTone } from "./labels";

const STATUS_LABEL: Record<string, string> = {
	scheduled: "Scheduled",
	completed: "Completed",
	cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, BadgeTone> = {
	scheduled: "info",
	completed: "success",
	cancelled: "neutral",
};
export function oneOnOneStatusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status;
}
export function oneOnOneStatusTone(status: string): BadgeTone {
	return STATUS_TONE[status] ?? "neutral";
}

export function fmtDateTime(value: string | Date | null): string {
	if (!value) {
		return "Not scheduled";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) {
		return "Not scheduled";
	}
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
