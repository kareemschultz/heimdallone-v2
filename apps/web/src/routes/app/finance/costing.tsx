import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
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

function deptColumns(cur: string): ColumnDef<DepartmentCostRow, unknown>[] {
	return [
		{
			accessorKey: "departmentName",
			header: "Department",
			cell: ({ row }) => (
				<span className="fn-name">{row.original.departmentName}</span>
			),
		},
		{
			accessorKey: "employeeCount",
			header: "Employees",
			cell: ({ row }) => (
				<span className="num">{row.original.employeeCount}</span>
			),
		},
		{
			accessorKey: "grossPay",
			header: "Gross",
			cell: ({ row }) => (
				<span className="num">{formatMoney(row.original.grossPay, cur)}</span>
			),
		},
		{
			accessorKey: "totalEmployerContributions",
			header: "Employer contributions",
			cell: ({ row }) => (
				<span className="num">
					{formatMoney(row.original.totalEmployerContributions, cur)}
				</span>
			),
		},
		{
			accessorKey: "totalCost",
			header: "Total cost",
			cell: ({ row }) => (
				<span className="num">{formatMoney(row.original.totalCost, cur)}</span>
			),
		},
	];
}

function costTypeColumns(cur: string): ColumnDef<CostTypeRow, unknown>[] {
	return [
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => costTypeLabel(row.original.type),
		},
		{
			accessorKey: "amount",
			header: "Amount",
			cell: ({ row }) => (
				<span className="num">{formatMoney(row.original.amount, cur)}</span>
			),
		},
	];
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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={deptColumns(cur)}
					data={deptRows}
					emptyState={
						<EmptyState
							compact
							description="No generated payroll cost in this period."
							title="No cost to show"
						/>
					}
					isError={byDept.isError}
					isLoading={byDept.isLoading}
				/>
			</div>

			<div className="fn-section">
				<div className="fn-section-title">By cost type</div>
				<div className="card" style={{ overflow: "hidden" }}>
					<DataTable
						columns={costTypeColumns(cur)}
						data={typeRows}
						emptyState={
							<EmptyState
								compact
								description="No payslip line items in this period."
								title="Nothing to show"
							/>
						}
						isError={byType.isError}
						isLoading={byType.isLoading}
					/>
				</div>
			</div>
		</div>
	);
}
