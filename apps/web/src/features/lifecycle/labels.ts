// Human-facing labels for lifecycle enums. NEVER render raw enum values — the UI
// Rule bans raw enums as user-facing labels.

export const DISCIPLINARY_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	explanation_requested: "Explanation requested",
	explained: "Explanation received",
	action_taken: "Action taken",
	appealed: "Appealed",
	closed: "Closed",
	overturned: "Overturned",
	withdrawn: "Withdrawn",
};

export const DISCIPLINARY_OUTCOME_LABELS: Record<string, string> = {
	none: "No outcome",
	verbal_warning: "Verbal warning",
	written_warning: "Written warning",
	final_warning: "Final warning",
	suspension: "Suspension",
	dismissal: "Dismissal",
	other: "Other",
};

export const TRANSFER_TYPE_LABELS: Record<string, string> = {
	department: "Department",
	position: "Position",
	role: "Role",
	location: "Location",
	manager: "Reporting manager",
	combined: "Combined",
};

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
	scheduled: "Scheduled",
	effective: "Effective",
	cancelled: "Cancelled",
};

export const RESIGNATION_REASON_LABELS: Record<string, string> = {
	resignation: "Resignation",
	retirement: "Retirement",
	end_of_contract: "End of contract",
	mutual: "Mutual agreement",
	other: "Other",
};

export const RESIGNATION_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	submitted: "Submitted",
	manager_approved: "Manager approved",
	hr_approved: "HR approved",
	handed_off: "Handed off to offboarding",
	withdrawn: "Withdrawn",
	rejected: "Rejected",
};

export const OFFBOARDING_STATUS_LABELS: Record<string, string> = {
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

export function labelFor(map: Record<string, string>, value: string): string {
	return map[value] ?? value;
}

export function formatDate(v: string | Date | null | undefined): string {
	if (!v) {
		return "—";
	}
	const d = typeof v === "string" ? new Date(v) : v;
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
}
