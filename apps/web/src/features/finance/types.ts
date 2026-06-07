// Display-side mirrors of the finance router outputs (Phase 16C).

export interface CostSummary {
	currency: string;
	employeeCount: number;
	grossPay: number;
	netPay: number;
	payslipCount: number;
	scoped: boolean;
	totalCost: number;
	totalDeductions: number;
	totalEmployerContributions: number;
}

export interface DepartmentCostRow {
	departmentId: string | null;
	departmentName: string;
	employeeCount: number;
	grossPay: number;
	totalCost: number;
	totalEmployerContributions: number;
}

export interface CostTypeRow {
	amount: number;
	type: string;
}

export interface TrendRow {
	periodEnd: string;
	periodStart: string;
	totalCost: number;
}

export interface ProjectCostRow {
	contributorCount: number;
	estimatedCost: number;
	hours: number;
	projectId: string;
	projectName: string;
}

export interface ProjectCostingResult {
	currency?: string;
	isEstimate: boolean;
	method: string;
	projects: ProjectCostRow[];
}

export type BudgetScope = "organization" | "department" | "project";
export type BudgetCategory = "labour" | "total";

export interface BudgetRow {
	budgetedAmount: number;
	category: BudgetCategory;
	currency: string;
	id: string;
	label: string;
	notes: string | null;
	periodEnd: string;
	periodStart: string;
	scope: BudgetScope;
	scopeId: string | null;
}

export interface VarianceRow {
	actualCost: number;
	budget: BudgetRow;
	pctUsed: number | null;
	variance: number;
}
