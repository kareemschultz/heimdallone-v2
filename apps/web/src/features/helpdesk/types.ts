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
