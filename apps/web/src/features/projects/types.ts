// Shapes returned by the projects router (the columns the UI reads). The API
// resolves projectManagerName / assigneeName / employeeName and the derived
// health; budget is finance-redacted server-side (null + canViewBudget=false for
// roles without canViewProjectCosts). No raw ids surface as primary text.

export interface ProjectRow {
	budget: string | null;
	completedAt: string | Date | null;
	createdAt: string | Date | null;
	description: string | null;
	hasCrossModuleLinks: boolean;
	health: string;
	id: string;
	isArchived: boolean;
	linkedCustomerId: string | null;
	linkedDealId: string | null;
	name: string;
	openTaskCount: number;
	overdueTaskCount: number;
	priority: string | null;
	projectManagerEmployeeId: string | null;
	projectManagerName: string | null;
	reference: string;
	startDate: string | Date | null;
	status: string;
	targetEndDate: string | Date | null;
	taskCount: number;
}

export interface ProjectDetail extends ProjectRow {
	canViewBudget: boolean;
	memberCount: number;
	overdueMilestoneCount: number;
}

export interface ProjectTaskRow {
	assigneeEmployeeId: string | null;
	assigneeName: string | null;
	dueDate: string | Date | null;
	hasCrossModuleLinks: boolean;
	id: string;
	milestoneId: string | null;
	priority: string;
	projectId: string;
	projectName: string | null;
	projectReference: string | null;
	reference: string;
	status: string;
	title: string;
}

export interface ProjectMemberRow {
	allocationPercent: number | null;
	employeeId: string;
	employeeName: string | null;
	id: string;
	role: string;
}

export interface ProjectMilestoneRow {
	completedAt: string | Date | null;
	description: string | null;
	dueDate: string | Date | null;
	id: string;
	name: string;
	status: string;
}

export interface ProjectTimeEntryRow {
	approvedAt: string | Date | null;
	description: string | null;
	employeeId: string;
	employeeName: string | null;
	entryDate: string | Date | null;
	id: string;
	minutes: number;
	projectId: string;
	projectName: string | null;
	rejectionReason: string | null;
	status: string;
	taskId: string | null;
	taskTitle: string | null;
}

export interface ProjectLinkedEntity {
	id: string;
	kind: string;
	label: string | null;
}
