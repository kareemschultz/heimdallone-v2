import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/finance/badge";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import { accountTypeLabel, glMoney } from "@/features/finance/gl-labels";
import type { GlTrialBalance } from "@/features/finance/gl-types";
import { canViewGL } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/trial-balance")({
	component: FinanceTrialBalancePage,
});

function FinanceTrialBalancePage() {
	const org = useContext(OrgCtx);
	const canView = canViewGL(org.memberRole);
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");

	const tb = useQuery(
		orpc.gl.journals.trialBalance.queryOptions({
			input: { from: from || undefined, to: to || undefined },
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
					description="The general ledger is available to administrators, payroll administrators, and auditors."
					icon={<Landmark size={28} />}
					title="You don't have access to the ledger"
				/>
			</div>
		);
	}

	const data = tb.data as GlTrialBalance | undefined;
	const rows = data?.rows ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Finance</span>
					</div>
					<h1 className="page-title">Trial balance</h1>
					<p className="page-sub">
						Posted journal totals per account. A balanced ledger has equal
						debits and credits.
					</p>
				</div>
			</div>

			<FinanceTabs />

			<div className="fn-toolbar">
				<label htmlFor="fn-tb-from">From</label>
				<input
					id="fn-tb-from"
					onChange={(e) => setFrom(e.target.value)}
					type="date"
					value={from}
				/>
				<label htmlFor="fn-tb-to">To</label>
				<input
					id="fn-tb-to"
					onChange={(e) => setTo(e.target.value)}
					type="date"
					value={to}
				/>
			</div>

			{tb.isLoading ? <div className="fn-skeleton" /> : null}
			{tb.isError ? (
				<EmptyState
					compact
					description="Could not load the trial balance. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{!(tb.isLoading || tb.isError) && data ? (
				<>
					<div className="fn-toolbar" style={{ justifyContent: "flex-end" }}>
						<Badge tone={data.balanced ? "success" : "danger"}>
							{data.balanced ? "Balanced" : "Out of balance"}
						</Badge>
					</div>
					{rows.length === 0 ? (
						<EmptyState
							compact
							description="No posted journals in this period yet."
							title="Nothing to show"
						/>
					) : (
						<table className="fn-table">
							<thead>
								<tr>
									<th>Code</th>
									<th>Account</th>
									<th>Type</th>
									<th className="num">Debit</th>
									<th className="num">Credit</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.accountId}>
										<td className="fn-mono">{r.accountCode}</td>
										<td className="fn-name">{r.accountName}</td>
										<td>{accountTypeLabel(r.accountType)}</td>
										<td className="num">
											{Number(r.totalDebit) ? glMoney(r.totalDebit) : ""}
										</td>
										<td className="num">
											{Number(r.totalCredit) ? glMoney(r.totalCredit) : ""}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<td colSpan={3}>
										<strong>Totals</strong>
									</td>
									<td className="num">
										<strong>{glMoney(data.totalDebit)}</strong>
									</td>
									<td className="num">
										<strong>{glMoney(data.totalCredit)}</strong>
									</td>
								</tr>
							</tfoot>
						</table>
					)}
				</>
			) : null}
		</div>
	);
}
