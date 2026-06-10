export interface ExecutiveSummary {
	activeContracts: number;
	activeProjects: number;
	atRiskProjects: number;
	currency: string;
	employerContributions: number;
	headcount: number;
	openDeals: number;
	openHelpdesk: number;
	overdueHelpdesk: number;
	payrollCost: number;
	pipelineValue: number;
	scoped: boolean;
}

export interface TrendBucket {
	count: number;
	period: string;
}

export interface PayrollTrendBucket {
	period: string;
	total: number;
}

export interface PipelineStageRow {
	count: number;
	stage: string;
	value: number;
}

export interface WorkforceMixRow {
	count: number;
	department: string;
}

export interface AttentionItem {
	count: number;
	label: string;
	source: string;
}
