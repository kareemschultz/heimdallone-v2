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
