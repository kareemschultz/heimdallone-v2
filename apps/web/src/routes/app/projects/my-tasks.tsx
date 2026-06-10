import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/projects.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	priorityLabel,
	priorityTone,
	taskStatusLabel,
	taskStatusTone,
} from "@/features/projects/labels";
import { ProjectsTabs } from "@/features/projects/projects-tabs";
import { TaskDetailSheet } from "@/features/projects/task-detail-sheet";
import type { ProjectTaskRow } from "@/features/projects/types";
import { canTrackProjectTime } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/projects/my-tasks")({
	component: MyTasksPage,
});

const FILTERS = [
	{ key: "open", label: "Open" },
	{ key: "in_review", label: "In review" },
	{ key: "done", label: "Done" },
	{ key: "all", label: "All" },
];

const DONE = new Set(["done", "cancelled"]);

function makeTaskColumns(
	onOpen: (id: string) => void
): ColumnDef<ProjectTaskRow, unknown>[] {
	return [
		{
			accessorKey: "reference",
			header: "Reference",
			cell: ({ row }) => (
				<span className="pj-mono">{row.original.reference}</span>
			),
		},
		{
			accessorKey: "title",
			header: "Task",
			cell: ({ row }) => (
				<button
					className="pj-name pj-name-link"
					onClick={() => onOpen(row.original.id)}
					type="button"
				>
					{row.original.title}
				</button>
			),
		},
		{
			accessorKey: "projectName",
			header: "Project",
			cell: ({ row }) => row.original.projectName ?? "—",
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge tone={taskStatusTone(row.original.status)}>
					{taskStatusLabel(row.original.status)}
				</Badge>
			),
		},
		{
			accessorKey: "priority",
			header: "Priority",
			cell: ({ row }) => (
				<Badge tone={priorityTone(row.original.priority)}>
					{priorityLabel(row.original.priority)}
				</Badge>
			),
		},
		{
			accessorKey: "dueDate",
			header: "Due",
			cell: ({ row }) => fmtDate(row.original.dueDate),
		},
	];
}

function MyTasksPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const hasAccess = canTrackProjectTime(role);
	const [filter, setFilter] = useState("open");
	const [openTaskId, setOpenTaskId] = useState<string | null>(null);
	const taskColumns = makeTaskColumns(setOpenTaskId);

	const tasks = useQuery(
		orpc.projects.tasks.list.queryOptions({
			input: { mine: true, limit: 200 },
			enabled: hasAccess,
		})
	);

	if (!hasAccess) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">My tasks</h1>
					</div>
				</div>
				<EmptyState
					description="Tasks are assigned to project team members."
					icon={<FolderKanban size={28} />}
					title="You don't have any project tasks"
				/>
			</div>
		);
	}

	const allRows = (tasks.data as ProjectTaskRow[] | undefined) ?? [];
	const rows = allRows.filter((t) => {
		if (filter === "all") {
			return true;
		}
		if (filter === "open") {
			return !DONE.has(t.status) && t.status !== "in_review";
		}
		return t.status === filter;
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Projects</span>
					</div>
					<h1 className="page-title">My tasks</h1>
					<p className="page-sub">
						The tasks assigned to you across all projects.
					</p>
				</div>
			</div>

			<ProjectsTabs />

			<div className="pj-filter-pills">
				{FILTERS.map((f) => (
					<button
						className={`pj-pill ${filter === f.key ? "active" : ""}`}
						key={f.key}
						onClick={() => setFilter(f.key)}
						type="button"
					>
						{f.label}
					</button>
				))}
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={taskColumns}
					data={rows as ProjectTaskRow[]}
					emptyState={
						<EmptyState
							compact
							description="Nothing matches this filter right now."
							title="No tasks here"
						/>
					}
					isError={tasks.isError}
					isLoading={tasks.isLoading}
				/>
			</div>

			{openTaskId ? (
				<TaskDetailSheet
					onClose={() => setOpenTaskId(null)}
					taskId={openTaskId}
				/>
			) : null}
		</div>
	);
}
