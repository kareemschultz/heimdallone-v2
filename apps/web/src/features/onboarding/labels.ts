// Plain-language labels for onboarding enums / role strings. Never render the
// raw enum/role value as primary text.

export const CATEGORY_LABEL: Record<string, string> = {
	document: "Document",
	equipment: "Equipment",
	policy: "Policy",
	training: "Training",
	introduction: "Introduction",
	other: "Other",
};

export const ASSIGNEE_ROLE_LABEL: Record<string, string> = {
	new_hire: "New hire",
	manager: "Manager",
	hr_admin: "HR team",
	hr: "HR team",
	it_admin: "IT/admin",
	it: "IT/admin",
	custom: "Custom",
};

export function categoryLabel(value: string): string {
	return CATEGORY_LABEL[value] ?? value;
}

export function assigneeRoleLabel(value: string | null | undefined): string {
	if (!value) {
		return "Unassigned";
	}
	return ASSIGNEE_ROLE_LABEL[value] ?? value;
}

export const ONBOARDING_STATUS_LABEL: Record<string, string> = {
	not_started: "Not started",
	in_progress: "In progress",
	blocked: "Blocked",
	completed: "Completed",
	cancelled: "Cancelled",
};

export const ONBOARDING_STATUS_TONE: Record<string, string> = {
	not_started: "badge",
	in_progress: "badge badge-info",
	blocked: "badge badge-warning",
	completed: "badge badge-success",
	cancelled: "badge",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
	todo: "To do",
	in_progress: "In progress",
	waiting: "Waiting",
	completed: "Completed",
	skipped: "Skipped",
	blocked: "Blocked",
};

export const TASK_STATUS_TONE: Record<string, string> = {
	todo: "badge",
	in_progress: "badge badge-info",
	waiting: "badge badge-info",
	completed: "badge badge-success",
	skipped: "badge",
	blocked: "badge badge-warning",
};

export const DOC_STATUS_LABEL: Record<string, string> = {
	requested: "Requested",
	uploaded: "Uploaded",
	approved: "Approved",
	rejected: "Rejected",
};

export const DOC_STATUS_TONE: Record<string, string> = {
	requested: "badge",
	uploaded: "badge badge-info",
	approved: "badge badge-success",
	rejected: "badge badge-warning",
};

const TASK_TERMINAL = new Set(["completed", "skipped"]);

export function isTaskResolved(status: string): boolean {
	return TASK_TERMINAL.has(status);
}
