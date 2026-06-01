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

// ── Case task status (offboarding_task_status) ──
export const TASK_STATUS_LABEL: Record<string, string> = {
	todo: "To do",
	in_progress: "In progress",
	done: "Done",
	skipped: "Skipped",
	blocked: "Blocked",
};

export const TASK_STATUS_TONE: Record<string, string> = {
	todo: "badge",
	in_progress: "badge badge-info",
	done: "badge badge-success",
	skipped: "badge",
	blocked: "badge badge-warning",
};

const TASK_RESOLVED = new Set(["done", "skipped"]);

export function taskStatusLabel(value: string): string {
	return TASK_STATUS_LABEL[value] ?? value;
}

export function taskStatusTone(value: string): string {
	return TASK_STATUS_TONE[value] ?? "badge";
}

export function isTaskResolved(status: string): boolean {
	return TASK_RESOLVED.has(status);
}

// ── Asset return status (offboarding_asset_status) ──
export const ASSET_STATUS_LABEL: Record<string, string> = {
	pending: "Pending return",
	returned: "Returned",
	waived: "Waived",
};

export const ASSET_STATUS_TONE: Record<string, string> = {
	pending: "badge badge-warning",
	returned: "badge badge-success",
	waived: "badge",
};

export function assetStatusLabel(value: string): string {
	return ASSET_STATUS_LABEL[value] ?? value;
}

export function assetStatusTone(value: string): string {
	return ASSET_STATUS_TONE[value] ?? "badge";
}

// ── Access revocation status (offboarding_access_status) ──
export const ACCESS_STATUS_LABEL: Record<string, string> = {
	pending: "Pending",
	revoked: "Revoked",
	waived: "Waived",
};

export const ACCESS_STATUS_TONE: Record<string, string> = {
	pending: "badge badge-warning",
	revoked: "badge badge-success",
	waived: "badge",
};

export function accessStatusLabel(value: string): string {
	return ACCESS_STATUS_LABEL[value] ?? value;
}

export function accessStatusTone(value: string): string {
	return ACCESS_STATUS_TONE[value] ?? "badge";
}

// ── Document request status (offboarding_document_status) ──
export const DOC_STATUS_LABEL: Record<string, string> = {
	requested: "Requested",
	uploaded: "Uploaded",
	approved: "Approved",
	waived: "Waived",
};

export const DOC_STATUS_TONE: Record<string, string> = {
	requested: "badge",
	uploaded: "badge badge-info",
	approved: "badge badge-success",
	waived: "badge",
};

export function docStatusLabel(value: string): string {
	return DOC_STATUS_LABEL[value] ?? value;
}

export function docStatusTone(value: string): string {
	return DOC_STATUS_TONE[value] ?? "badge";
}

// Default assignee role on a template task. Stored as a free-text label
// ("hr" | "manager" | "employee" | "it" | "department_head"); render friendly.
export const ASSIGNEE_ROLE_LABEL: Record<string, string> = {
	hr: "HR team",
	hr_admin: "HR team",
	manager: "Manager",
	employee: "Employee",
	it: "IT/admin",
	it_admin: "IT/admin",
	department_head: "Department head",
};

export function assigneeRoleLabel(value: string | null | undefined): string {
	if (!value) {
		return "Unassigned";
	}
	return ASSIGNEE_ROLE_LABEL[value] ?? value;
}

// dueOffsetDays is relative to the case's last working day (LWD):
// negative = before LWD, 0 = on LWD, positive = after LWD.
export function dueOffsetLabel(days: number): string {
	if (days < 0) {
		const n = Math.abs(days);
		return `${n} day${n === 1 ? "" : "s"} before last working day`;
	}
	if (days === 0) {
		return "On last working day";
	}
	return `${days} day${days === 1 ? "" : "s"} after last working day`;
}
