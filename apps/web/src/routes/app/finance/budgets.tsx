import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { BudgetForm } from "@/features/finance/budget-form";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import {
	budgetCategoryLabel,
	budgetScopeLabel,
	formatMoney,
} from "@/features/finance/labels";
import type { BudgetRow } from "@/features/finance/types";
import { canManageBudgets, canViewFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/budgets")({
	component: FinanceBudgetsPage,
});

function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("finance"),
	});
}

function FinanceBudgetsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewFinance(org.memberRole);
	const canManage = canManageBudgets(org.memberRole);
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<BudgetRow | null>(null);

	const budgets = useQuery(
		orpc.finance.budgets.list.queryOptions({ input: {}, enabled: canView })
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

	const rows = (budgets.data as BudgetRow[] | undefined) ?? [];

	function openCreate() {
		setEditing(null);
		setDialogOpen(true);
	}
	function openEdit(b: BudgetRow) {
		setEditing(b);
		setDialogOpen(true);
	}

	async function handleSubmit(
		input: Parameters<typeof client.finance.budgets.create>[0]
	) {
		if (editing) {
			await client.finance.budgets.update({ ...input, id: editing.id });
			toast.success("Budget updated.");
		} else {
			await client.finance.budgets.create(input);
			toast.success("Budget created.");
		}
		setDialogOpen(false);
		setEditing(null);
		invalidateFinance(qc);
	}

	async function handleRemove(b: BudgetRow) {
		await client.finance.budgets.remove({ id: b.id });
		toast.success("Budget removed.");
		invalidateFinance(qc);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Finance</span>
					</div>
					<h1 className="page-title">Budgets</h1>
					<p className="page-sub">
						Labour budgets by organization, department, or project.
					</p>
				</div>
				{canManage ? (
					<button className="fn-btn primary" onClick={openCreate} type="button">
						New budget
					</button>
				) : null}
			</div>

			<FinanceTabs />

			{budgets.isLoading ? <div className="fn-skeleton" /> : null}
			{budgets.isError ? (
				<EmptyState
					compact
					description="Could not load budgets. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{!(budgets.isLoading || budgets.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description={
						canManage
							? "Create your first budget to track labour cost against a target."
							: "No budgets have been set up yet."
					}
					icon={<Landmark size={26} />}
					title="No budgets yet"
				/>
			) : null}

			{!(budgets.isLoading || budgets.isError) && rows.length > 0 ? (
				<table className="fn-table">
					<thead>
						<tr>
							<th>Label</th>
							<th>Scope</th>
							<th>Category</th>
							<th>Period</th>
							<th className="num">Budget</th>
							{canManage ? <th /> : null}
						</tr>
					</thead>
					<tbody>
						{rows.map((b) => (
							<tr key={b.id}>
								<td className="fn-name">{b.label}</td>
								<td>{budgetScopeLabel(b.scope)}</td>
								<td>{budgetCategoryLabel(b.category)}</td>
								<td>
									{b.periodStart} → {b.periodEnd}
								</td>
								<td className="num">
									{formatMoney(b.budgetedAmount, b.currency)}
								</td>
								{canManage ? (
									<td>
										<div className="fn-row-actions">
											<button
												className="fn-btn"
												onClick={() => openEdit(b)}
												type="button"
											>
												Edit
											</button>
											<button
												className="fn-btn danger"
												onClick={() => handleRemove(b)}
												type="button"
											>
												Remove
											</button>
										</div>
									</td>
								) : null}
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{dialogOpen ? (
				<BudgetForm
					existing={editing}
					onCancel={() => {
						setDialogOpen(false);
						setEditing(null);
					}}
					onSubmit={handleSubmit}
				/>
			) : null}
		</div>
	);
}
