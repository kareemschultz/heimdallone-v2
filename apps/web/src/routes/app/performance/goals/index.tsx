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

function GoalRowView({ o }: { o: ObjectiveRow }) {
	return (
		<tr>
			<td>
				<span className="pf-mono">{o.reference}</span>
			</td>
			<td>
				<Link
					className="pf-name pf-name-link"
					params={{ id: o.id }}
					to="/app/performance/goals/$id"
				>
					{o.title}
				</Link>
				<div className="pf-sub">{o.employeeName ?? "—"}</div>
			</td>
			<td>
				<Badge tone={objectiveStatusTone(o.status)}>
					{objectiveStatusLabel(o.status)}
				</Badge>
			</td>
			<td>
				<div className="pf-progress">
					<div className="pf-progress-bar">
						<span
							className="pf-progress-fill tone-info"
							style={{ width: `${o.progressPercent}%` }}
						/>
					</div>
					<span className="pf-progress-val">{o.progressPercent}%</span>
				</div>
			</td>
			<td>{fmtDate(o.dueDate)}</td>
		</tr>
	);
}

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

			{list.isLoading ? <div className="pf-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load goals. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No goals match these filters."
					title="No goals yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pf-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Goal</th>
							<th>Status</th>
							<th>Progress</th>
							<th>Target date</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((o) => (
							<GoalRowView key={o.id} o={o} />
						))}
					</tbody>
				</table>
			) : null}

			{showCreate ? (
				<GoalFormDialog
					onClose={() => setShowCreate(false)}
					onDone={() => setShowCreate(false)}
				/>
			) : null}
		</div>
	);
}
