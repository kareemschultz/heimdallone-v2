// Plain-language labels for offboarding enums. Never render the raw enum value
// as primary text. Mirrors the offboarding schema enums in
// packages/db/src/schema/offboarding.ts and the API status lifecycle.

export const CASE_STATUS_LABEL: Record<string, string> = {
	pending_approval: "Pending approval",
	approved: "Approved",
	active: "Active",
	in_clearance: "In clearance",
	pending_settlement: "Pending settlement",
	closed: "Closed",
	rejected: "Rejected",
	withdrawn: "Withdrawn",
	cancelled: "Cancelled",
};

export const CASE_STATUS_TONE: Record<string, string> = {
	pending_approval: "badge badge-warning",
	approved: "badge badge-info",
	active: "badge badge-info",
	in_clearance: "badge badge-info",
	pending_settlement: "badge badge-warning",
	closed: "badge badge-success",
	rejected: "badge badge-danger",
	withdrawn: "badge",
	cancelled: "badge",
};

export const EXIT_TYPE_LABEL: Record<string, string> = {
	resignation: "Resignation",
	termination: "Termination",
	retirement: "Retirement",
	contract_end: "Contract end",
	involuntary: "Involuntary exit",
};

export const CATEGORY_LABEL: Record<string, string> = {
	clearance: "Clearance",
	asset_return: "Asset return",
	access_revocation: "Access revocation",
	document: "Document",
	handoff: "Handover",
	exit_interview: "Exit interview",
	other: "Other",
};

export function caseStatusLabel(value: string): string {
	return CASE_STATUS_LABEL[value] ?? value;
}

export function caseStatusTone(value: string): string {
	return CASE_STATUS_TONE[value] ?? "badge";
}

export function exitTypeLabel(value: string): string {
	return EXIT_TYPE_LABEL[value] ?? value;
}

export function categoryLabel(value: string): string {
	return CATEGORY_LABEL[value] ?? value;
}
