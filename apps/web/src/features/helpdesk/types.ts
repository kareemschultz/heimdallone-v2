// Shape of a row returned by helpdesk.requests.list (the columns the UI reads).
// The API resolves requesterName / assigneeName / categoryName and the derived
// slaState; everything else is a plain request column. No raw ids are shown as
// primary text — ids here are used only for keys, link presence, and filtering.

export interface HelpdeskRequestRow {
	approvalRequired: boolean;
	approvalStatus: string;
	assignedToUserId: string | null;
	assigneeName: string | null;
	categoryId: string | null;
	categoryName: string | null;
	createdAt: string | Date | null;
	id: string;
	linkedAssetId: string | null;
	linkedAttendanceRecordId: string | null;
	linkedEntityId: string | null;
	linkedEntityType: string | null;
	linkedLeaveRequestId: string | null;
	linkedOffboardingCaseId: string | null;
	linkedPayrollRunId: string | null;
	linkedPayslipId: string | null;
	priority: string;
	reference: string;
	requesterEmployeeId: string;
	requesterName: string | null;
	slaState: string;
	status: string;
	targetEmployeeId: string | null;
	title: string;
	updatedAt: string | Date | null;
}

// A comment as returned by helpdesk.comments.list / requests.getById.comments.
// Internal notes are already redacted server-side for callers who may not see
// them — the array simply never contains them.
export interface HelpdeskComment {
	authorName: string | null;
	authorUserId: string | null;
	body: string;
	createdAt: string | Date | null;
	id: string;
	isInternal: boolean;
}

// A read-only cross-module link resolved for the detail view.
export interface HelpdeskLinkedEntity {
	id: string;
	kind: string;
	label: string | null;
}

// helpdesk.requests.getById — the request row plus resolved display names, the
// derived slaState, the (already-redacted) comments, the linked-entity refs, and
// a canViewInternalNotes flag the UI uses to decide whether to show the internal
// section header + form (the data is already gone for those who can't see it).
export interface HelpdeskRequestDetail extends HelpdeskRequestRow {
	approvalNote: string | null;
	approvedByName: string | null;
	assigneeName: string | null;
	canViewInternalNotes: boolean;
	closedAt: string | Date | null;
	comments: HelpdeskComment[];
	createdByName: string | null;
	description: string | null;
	firstRespondedAt: string | Date | null;
	firstResponseDueAt: string | Date | null;
	linkedEntities: HelpdeskLinkedEntity[];
	requesterName: string | null;
	resolutionDueAt: string | Date | null;
	resolutionNote: string | null;
	resolvedAt: string | Date | null;
	targetName: string | null;
}

/** True when the request carries any read-only cross-module link. */
export function hasLinkedContext(r: HelpdeskRequestRow): boolean {
	return Boolean(
		r.linkedAssetId ||
			r.linkedPayslipId ||
			r.linkedPayrollRunId ||
			r.linkedLeaveRequestId ||
			r.linkedAttendanceRecordId ||
			r.linkedOffboardingCaseId ||
			r.linkedEntityId
	);
}
