import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import { formatHours, formatMoney } from "@/features/finance/labels";
import type {
	ProjectCostingResult,
	ProjectCostRow,
} from "@/features/finance/types";
import { canExportFinance, canViewFinance, seesAllFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/projects")({
	component: FinanceProjectCostingPage,
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

function projectCostColumns(cur: string): ColumnDef<ProjectCostRow, unknown>[] {
	return [
		{
			accessorKey: "projectName",
			header: "Project",
			cell: ({ row }) => (
				<Link
					className="fn-name-link"
					params={{ id: row.original.projectId }}
					to="/app/projects/$id"
				>
					{row.original.projectName}
				</Link>
			),
		},
		{
			accessorKey: "hours",
			header: "Hours",
			cell: ({ row }) => (
				<span className="num">{formatHours(row.original.hours)}</span>
			),
		},
		{
			accessorKey: "contributorCount",
			header: "Contributors",
			cell: ({ row }) => (
				<span className="num">{row.original.contributorCount}</span>
			),
		},
		{
			accessorKey: "estimatedCost",
			header: "Estimated cost",
			cell: ({ row }) => (
				<span className="num">
					{formatMoney(row.original.estimatedCost, cur)}
				</span>
			),
		},
	];
}

function FinanceProjectCostingPage() {
	const org = useContext(OrgCtx);
	const canView = canViewFinance(org.memberRole);
	const seesAll = seesAllFinance(org.memberRole);
	const canExport = canExportFinance(org.memberRole);
	const year = new Date().getFullYear();
	const [from, setFrom] = useState(`${year}-01-01`);
	const [to, setTo] = useState(`${year}-12-31`);

	const costing = useQuery(
		orpc.finance.costReports.projectCosting.queryOptions({
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

	const data = costing.data as ProjectCostingResult | undefined;
	const rows = data?.projects ?? [];
	const cur = data?.currency ?? "GYD";

	async function handleExport() {
		const res = (await orpc.finance.export.costCsv.call({
			from,
			to,
			report: "projectCosting",
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
					<h1 className="page-title">Project costing</h1>
					<p className="page-sub">
						Labour cost of project work, from approved time entries.
					</p>
				</div>
			</div>

			<FinanceTabs />

			<div className="fn-note">
				<strong>Estimate.</strong>{" "}
				{data?.method ??
					"Approved project hours × an hourly rate derived from each contributor's active contract (not payslip allocation)."}
			</div>

			{seesAll ? null : (
				<EmptyState
					compact
					description="Project costing is available to payroll administrators and auditors."
					title="Not available for your role"
				/>
			)}

			{seesAll ? (
				<>
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
							columns={projectCostColumns(cur)}
							data={rows}
							emptyState={
								<EmptyState
									compact
									description="No approved project time in this period."
									title="No project cost to show"
								/>
							}
							isError={costing.isError}
							isLoading={costing.isLoading}
						/>
					</div>
				</>
			) : null}
		</div>
	);
}
