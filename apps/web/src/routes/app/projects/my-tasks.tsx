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

function MyTasksPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const hasAccess = canTrackProjectTime(role);
	const [filter, setFilter] = useState("open");
	const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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

			{tasks.isLoading ? <div className="pj-skeleton" /> : null}
			{tasks.isError ? (
				<EmptyState
					compact
					description="Could not load your tasks. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(tasks.isLoading || tasks.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="Nothing matches this filter right now."
					title="No tasks here"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Task</th>
							<th>Project</th>
							<th>Status</th>
							<th>Priority</th>
							<th>Due</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((t) => (
							<tr key={t.id}>
								<td>
									<span className="pj-mono">{t.reference}</span>
								</td>
								<td>
									<button
										className="pj-name pj-name-link"
										onClick={() => setOpenTaskId(t.id)}
										type="button"
									>
										{t.title}
									</button>
								</td>
								<td>{t.projectName ?? "—"}</td>
								<td>
									<Badge tone={taskStatusTone(t.status)}>
										{taskStatusLabel(t.status)}
									</Badge>
								</td>
								<td>
									<Badge tone={priorityTone(t.priority)}>
										{priorityLabel(t.priority)}
									</Badge>
								</td>
								<td>{fmtDate(t.dueDate)}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{openTaskId ? (
				<TaskDetailSheet
					onClose={() => setOpenTaskId(null)}
					taskId={openTaskId}
				/>
			) : null}
		</div>
	);
}
