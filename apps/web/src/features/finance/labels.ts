export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

// payslip_line_item.type buckets surfaced by costReports.byCostType.
const COST_TYPE_LABELS: Record<string, string> = {
	earning: "Earnings",
	deduction: "Deductions",
	tax: "Tax",
	employer_contribution: "Employer contributions",
};

export function costTypeLabel(type: string): string {
	return COST_TYPE_LABELS[type] ?? type;
}

const BUDGET_SCOPE_LABELS: Record<string, string> = {
	organization: "Organization",
	department: "Department",
	project: "Project",
};

export function budgetScopeLabel(scope: string): string {
	return BUDGET_SCOPE_LABELS[scope] ?? scope;
}

const BUDGET_CATEGORY_LABELS: Record<string, string> = {
	labour: "Labour",
	total: "Total",
};

export function budgetCategoryLabel(category: string): string {
	return BUDGET_CATEGORY_LABELS[category] ?? category;
}

// Variance: under budget is good (success), at/over is a warning/danger.
export function varianceTone(variance: number): BadgeTone {
	if (variance < 0) {
		return "danger";
	}
	if (variance === 0) {
		// Exactly on budget is neutral, not a warning (matches the "On budget" label).
		return "neutral";
	}
	return "success";
}

export function varianceLabel(variance: number): string {
	if (variance < 0) {
		return "Over budget";
	}
	if (variance === 0) {
		return "On budget";
	}
	return "Under budget";
}

// Money formatter — groups thousands, 0 decimals for large roll-ups.
export function formatMoney(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(amount);
	} catch {
		// Unknown currency code → fall back to a plain grouped number + code.
		return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
	}
}

export function formatHours(hours: number): string {
	return `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
}
