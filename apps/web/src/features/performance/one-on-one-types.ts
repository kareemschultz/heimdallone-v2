// Shapes from the performance.oneOnOnes procs. privateManagerNotes is the
// redaction-critical field: the LIST proc nulls it for anyone but HR + the
// owning manager; the GETBYID proc nulls it AND returns canViewPrivateNotes so
// the UI can hide the whole section. The UI never has the value to leak when it
// is withheld.

export interface OneOnOneRow {
	employeeId: string;
	employeeName: string | null;
	id: string;
	managerEmployeeId: string;
	managerName: string | null;
	privateManagerNotes: string | null;
	scheduledAt: string | Date | null;
	sharedNotes: string | null;
	status: string;
}

export interface OneOnOneDetail extends OneOnOneRow {
	canViewPrivateNotes: boolean;
}
