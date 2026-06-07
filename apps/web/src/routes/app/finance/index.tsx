import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import { formatMoney } from "@/features/finance/labels";
import type { CostSummary, TrendRow } from "@/features/finance/types";
import { canViewFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/")({
	component: FinanceOverviewPage,
});

function currentYearRange(): { from: string; to: string } {
	const year = new Date().getFullYear();
	return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// Cross-links to the Finance-relevant surfaces that live in the Payroll module.
// Finance LINKS to them — it does not re-implement payment batches / loans /
// reimbursements.
const PAYROLL_LINKS = [
	{
		href: "/app/payroll/payments" as const,
		title: "Payment batches & bank export",
		sub: "Generate and track bank payment files (managed in Payroll)",
	},
	{
		href: "/app/payroll/loans" as const,
		title: "Loans & advances",
		sub: "Employee loans, advances, and installments (managed in Payroll)",
	},
	{
		href: "/app/payroll/reimbursements" as const,
		title: "Expenses & reimbursements",
		sub: "Expense claims and reimbursements (managed in Payroll)",
	},
];

function TrendSection({
	rows,
	isError,
	currency,
}: {
	rows: TrendRow[];
	isError: boolean;
	currency: string;
}) {
	if (isError) {
		return (
			<EmptyState
				compact
				description="Could not load the trend."
				title="Something went wrong"
			/>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description="No generated payroll in this period yet."
				title="No cost to show"
			/>
		);
	}
	return (
		<table className="fn-table">
			<thead>
				<tr>
					<th>Period</th>
					<th className="num">Total cost</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={`${r.periodStart}_${r.periodEnd}`}>
						<td>
							{r.periodStart} → {r.periodEnd}
						</td>
						<td className="num">{formatMoney(r.totalCost, currency)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function FinanceOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewFinance(org.memberRole);
	const range = currentYearRange();

	const summary = useQuery(
		orpc.finance.costReports.summary.queryOptions({
			input: range,
			enabled: canView,
		})
	);
	const trend = useQuery(
		orpc.finance.costReports.trend.queryOptions({
			input: range,
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Finance</h1>
					</div>
				</div>
				<EmptyState
					description="Finance reporting is available to payroll administrators, auditors, and team managers."
					icon={<Landmark size={28} />}
					title="You don't have access to Finance"
				/>
			</div>
		);
	}

	const data = summary.data as CostSummary | undefined;
	const trendRows = (trend.data as TrendRow[] | undefined) ?? [];
	const currency = data?.currency ?? "GYD";

	const tiles = data
		? [
				{
					label: "Total labour cost",
					value: formatMoney(data.totalCost, currency),
				},
				{ label: "Gross pay", value: formatMoney(data.grossPay, currency) },
				{
					label: "Employer contributions",
					value: formatMoney(data.totalEmployerContributions, currency),
				},
				{ label: "Employees costed", value: String(data.employeeCount) },
				{ label: "Payslips", value: String(data.payslipCount) },
			]
		: [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Finance</span>
					</div>
					<h1 className="page-title">Finance</h1>
					<p className="page-sub">
						Labour cost, project costing, and budgets —{" "}
						{new Date().getFullYear()} to date.
					</p>
				</div>
			</div>

			<FinanceTabs />

			<div className="fn-note">
				Figures show <strong>generated payroll cost</strong> (gross + employer
				contributions) for the period, not cash already disbursed.
				{data?.scoped ? " You're seeing only your team's departments." : ""}
			</div>

			{summary.isLoading ? <div className="fn-skeleton" /> : null}
			{summary.isError ? (
				<EmptyState
					compact
					description="Could not load the cost summary. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{summary.isLoading || summary.isError ? null : (
				<div className="fn-tiles">
					{tiles.map((t) => (
						<div className="fn-tile" key={t.label}>
							<span className="fn-tile-val">{t.value}</span>
							<span className="fn-tile-lbl">{t.label}</span>
						</div>
					))}
				</div>
			)}

			<div className="fn-section">
				<div className="fn-section-title">Cost by pay period</div>
				<TrendSection
					currency={currency}
					isError={trend.isError}
					rows={trendRows}
				/>
			</div>

			<div className="fn-section">
				<div className="fn-section-title">Managed in Payroll</div>
				<div className="fn-quicklinks">
					{PAYROLL_LINKS.map((l) => (
						<Link className="fn-quicklink" key={l.href} to={l.href}>
							<span className="fn-ql-title">{l.title}</span>
							<span className="fn-ql-sub">{l.sub}</span>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
