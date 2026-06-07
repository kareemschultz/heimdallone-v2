import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/finance/badge";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import {
	budgetScopeLabel,
	formatMoney,
	varianceLabel,
	varianceTone,
} from "@/features/finance/labels";
import type { VarianceRow } from "@/features/finance/types";
import { canViewFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/variance")({
	component: FinanceVariancePage,
});

const FULL_BAR = 100;

function FinanceVariancePage() {
	const org = useContext(OrgCtx);
	const canView = canViewFinance(org.memberRole);
	const year = new Date().getFullYear();
	const range = { from: `${year}-01-01`, to: `${year}-12-31` };

	const variance = useQuery(
		orpc.finance.budgets.variance.queryOptions({
			input: range,
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Finance</h1>
				</div>
				<EmptyState
					description="Finance reporting is available to payroll administrators, auditors, and team managers."
					icon={<Landmark size={28} />}
					title="You don't have access to Finance"
				/>
			</div>
		);
	}

	const rows = (variance.data as VarianceRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Finance</span>
					</div>
					<h1 className="page-title">Budget vs actual</h1>
					<p className="page-sub">
						Generated labour cost against each budget for {year}.
					</p>
				</div>
			</div>

			<FinanceTabs />

			<div className="fn-note">
				Actual cost is generated payroll cost (gross + employer contributions)
				over each budget's own period. Project budgets compare against estimated
				project labour cost.
			</div>

			{variance.isLoading ? <div className="fn-skeleton" /> : null}
			{variance.isError ? (
				<EmptyState
					compact
					description="Could not load budget variance. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{!(variance.isLoading || variance.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No budgets overlap this period. Create a budget to track variance."
					icon={<Landmark size={26} />}
					title="Nothing to compare yet"
				/>
			) : null}

			{!(variance.isLoading || variance.isError) && rows.length > 0 ? (
				<table className="fn-table">
					<thead>
						<tr>
							<th>Budget</th>
							<th>Scope</th>
							<th className="num">Budgeted</th>
							<th className="num">Actual</th>
							<th className="num">Variance</th>
							<th>Used</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((v) => {
							const pct = v.pctUsed ?? 0;
							const over = v.variance < 0;
							return (
								<tr key={v.budget.id}>
									<td className="fn-name">{v.budget.label}</td>
									<td>{budgetScopeLabel(v.budget.scope)}</td>
									<td className="num">
										{formatMoney(v.budget.budgetedAmount, v.budget.currency)}
									</td>
									<td className="num">
										{formatMoney(v.actualCost, v.budget.currency)}
									</td>
									<td className="num">
										{formatMoney(Math.abs(v.variance), v.budget.currency)}
									</td>
									<td>
										<div className="fn-bar-track">
											<div
												className={`fn-bar-fill ${over ? "over" : ""}`}
												style={{ width: `${Math.min(pct, FULL_BAR)}%` }}
											/>
										</div>
										<span className="fn-sub">
											{v.pctUsed === null ? "—" : `${v.pctUsed}%`}
										</span>
									</td>
									<td>
										<Badge tone={varianceTone(v.variance)}>
											{varianceLabel(v.variance)}
										</Badge>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			) : null}
		</div>
	);
}
