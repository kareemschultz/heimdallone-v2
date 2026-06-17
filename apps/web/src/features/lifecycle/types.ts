// Client-side shapes for the lifecycle module list/detail endpoints.

export interface DisciplinaryRecordRow {
	categoryId: string | null;
	createdAt: string | Date;
	employeeId: string;
	employeeName: string;
	id: string;
	incidentDate: string | Date;
	reference: string;
	status: string;
}

export interface TransferRow {
	createdAt: string | Date;
	effectiveFrom: string | Date;
	employeeId: string;
	employeeName: string;
	id: string;
	reference: string;
	status: string;
	transferType: string;
}

export interface ResignationRow {
	createdAt: string | Date;
	employeeId: string;
	employeeName: string;
	id: string;
	offboardingCaseId: string | null;
	reasonCategory: string;
	reference: string;
	requestedLastWorkingDate: string | Date;
	status: string;
}

export interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

export interface CategoryOption {
	id: string;
	name: string;
}

export interface ActionOption {
	id: string;
	name: string;
	severityLevel: number;
}
