import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import { costTypeLabel, formatMoney } from "@/features/finance/labels";
import type { CostTypeRow, DepartmentCostRow } from "@/features/finance/types";
import { canExportFinance, canViewFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/costing")({
	component: FinanceCostingPage,
});

function downloadCsv(filename: string, csv: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function FinanceCostingPage() {
	const org = useContext(OrgCtx);
	const canView = canViewFinance(org.memberRole);
	const canExport = canExportFinance(org.memberRole);
	const year = new Date().getFullYear();
	const [from, setFrom] = useState(`${year}-01-01`);
	const [to, setTo] = useState(`${year}-12-31`);

	const byDept = useQuery(
		orpc.finance.costReports.byDepartment.queryOptions({
			input: { from, to },
			enabled: canView,
		})
	);
	const byType = useQuery(
		orpc.finance.costReports.byCostType.queryOptions({
			input: { from, to },
			enabled: canView,
		})
	);
	const summary = useQuery(
		orpc.finance.costReports.summary.queryOptions({
			input: { from, to },
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

	const deptRows = (byDept.data as DepartmentCostRow[] | undefined) ?? [];
	const typeRows = (byType.data as CostTypeRow[] | undefined) ?? [];
	const cur =
		(summary.data as { currency?: string } | undefined)?.currency ?? "GYD";

	async function handleExport() {
		const res = (await orpc.finance.export.costCsv.call({
			from,
			to,
			report: "byDepartment",
		})) as { filename: string; csv: string };
		downloadCsv(res.filename, res.csv);
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
					<h1 className="page-title">Cost by department</h1>
					<p className="page-sub">
						Generated payroll cost (gross + employer contributions) by
						department.
					</p>
				</div>
			</div>

			<FinanceTabs />

			<div className="fn-toolbar">
				<label htmlFor="fn-from">From</label>
				<input
					id="fn-from"
					onChange={(e) => setFrom(e.target.value)}
					type="date"
					value={from}
				/>
				<label htmlFor="fn-to">To</label>
				<input
					id="fn-to"
					onChange={(e) => setTo(e.target.value)}
					type="date"
					value={to}
				/>
				{canExport ? (
					<button className="fn-btn" onClick={handleExport} type="button">
						Export CSV
					</button>
				) : null}
			</div>

			{byDept.isLoading ? <div className="fn-skeleton" /> : null}
			<DeptSection
				cur={cur}
				isError={byDept.isError}
				isLoading={byDept.isLoading}
				rows={deptRows}
			/>

			<div className="fn-section">
				<div className="fn-section-title">By cost type</div>
				<CostTypeSection cur={cur} isError={byType.isError} rows={typeRows} />
			</div>
		</div>
	);
}

function DeptSection({
	rows,
	isLoading,
	isError,
	cur,
}: {
	rows: DepartmentCostRow[];
	isLoading: boolean;
	isError: boolean;
	cur: string;
}) {
	if (isLoading) {
		return null;
	}
	if (isError) {
		return (
			<EmptyState
				compact
				description="Could not load cost by department."
				title="Something went wrong"
			/>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description="No generated payroll cost in this period."
				title="No cost to show"
			/>
		);
	}
	return (
		<table className="fn-table">
			<thead>
				<tr>
					<th>Department</th>
					<th className="num">Employees</th>
					<th className="num">Gross</th>
					<th className="num">Employer contributions</th>
					<th className="num">Total cost</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={r.departmentId ?? "unassigned"}>
						<td className="fn-name">{r.departmentName}</td>
						<td className="num">{r.employeeCount}</td>
						<td className="num">{formatMoney(r.grossPay, cur)}</td>
						<td className="num">
							{formatMoney(r.totalEmployerContributions, cur)}
						</td>
						<td className="num">{formatMoney(r.totalCost, cur)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function CostTypeSection({
	rows,
	isError,
	cur,
}: {
	rows: CostTypeRow[];
	isError: boolean;
	cur: string;
}) {
	if (isError) {
		return (
			<EmptyState
				compact
				description="Could not load cost types."
				title="Something went wrong"
			/>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description="No payslip line items in this period."
				title="Nothing to show"
			/>
		);
	}
	return (
		<table className="fn-table">
			<thead>
				<tr>
					<th>Type</th>
					<th className="num">Amount</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={r.type}>
						<td>{costTypeLabel(r.type)}</td>
						<td className="num">{formatMoney(r.amount, cur)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
