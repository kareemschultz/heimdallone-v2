import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Target } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { GoalFormDialog } from "@/features/performance/goal-form-dialog";
import {
	fmtDate,
	objectiveStatusLabel,
	objectiveStatusTone,
} from "@/features/performance/labels";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import type { ObjectiveRow } from "@/features/performance/types";
import { canCreateObjective, canViewPerformance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/goals/")({
	component: GoalsListPage,
});

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "active", label: "Active" },
	{ value: "on_track", label: "On track" },
	{ value: "at_risk", label: "At risk" },
	{ value: "behind", label: "Behind" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

const goalColumns: ColumnDef<ObjectiveRow, unknown>[] = [
	{
		accessorKey: "reference",
		header: "Reference",
		cell: ({ row }) => (
			<span className="pf-mono">{row.original.reference}</span>
		),
	},
	{
		accessorKey: "title",
		header: "Goal",
		cell: ({ row }) => (
			<>
				<Link
					className="pf-name pf-name-link"
					params={{ id: row.original.id }}
					to="/app/performance/goals/$id"
				>
					{row.original.title}
				</Link>
				<div className="pf-sub">{row.original.employeeName ?? "—"}</div>
			</>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={objectiveStatusTone(row.original.status)}>
				{objectiveStatusLabel(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "progressPercent",
		header: "Progress",
		cell: ({ row }) => (
			<div className="pf-progress">
				<div className="pf-progress-bar">
					<span
						className="pf-progress-fill tone-info"
						style={{ width: `${row.original.progressPercent}%` }}
					/>
				</div>
				<span className="pf-progress-val">{row.original.progressPercent}%</span>
			</div>
		),
	},
	{
		accessorKey: "dueDate",
		header: "Target date",
		cell: ({ row }) => fmtDate(row.original.dueDate),
	},
];

function GoalsListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewPerformance(org.memberRole);
	const canCreate = canCreateObjective(org.memberRole);

	const [status, setStatus] = useState("");
	const [search, setSearch] = useState("");
	const [showCreate, setShowCreate] = useState(false);

	const list = useQuery(
		orpc.performance.objectives.list.queryOptions({
			input: { includeArchived: true },
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Goals</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="The team goals view is available to HR, managers, and people leaders."
					icon={<Target size={28} />}
					title="You don't have access to the goals list"
				/>
			</div>
		);
	}

	const allRows = (list.data as ObjectiveRow[] | undefined) ?? [];
	const q = search.trim().toLowerCase();
	const rows = allRows.filter((o) => {
		if (status && o.status !== status) {
			return false;
		}
		if (
			q &&
			!(
				o.title.toLowerCase().includes(q) ||
				o.reference.toLowerCase().includes(q) ||
				(o.employeeName ?? "").toLowerCase().includes(q)
			)
		) {
			return false;
		}
		return true;
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Goals</h1>
					<p className="page-sub">
						{rows.length} goal{rows.length === 1 ? "" : "s"}
					</p>
				</div>
				{canCreate ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						New goal
					</button>
				) : null}
			</div>

			<PerformanceTabs />

			<div className="pf-toolbar">
				<div className="pf-search">
					<Search size={14} />
					<input
						aria-label="Search goals by title, reference, or person"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search goal, reference, or person…"
						value={search}
					/>
				</div>
				<select
					aria-label="Filter by status"
					onChange={(e) => setStatus(e.target.value)}
					value={status}
				>
					<option value="">All statuses</option>
					{STATUS_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={goalColumns}
					data={rows as ObjectiveRow[]}
					emptyState={
						<EmptyState
							compact
							description="No goals match these filters."
							title="No goals yet"
						/>
					}
					isError={list.isError}
					isLoading={list.isLoading}
				/>
			</div>

			{showCreate ? (
				<GoalFormDialog
					onClose={() => setShowCreate(false)}
					onDone={() => setShowCreate(false)}
				/>
			) : null}
		</div>
	);
}
