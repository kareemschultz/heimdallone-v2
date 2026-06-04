import { useQuery } from "@tanstack/react-query";
import { Flag, ListTodo } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	milestoneStatusLabel,
	milestoneStatusTone,
	taskStatusLabel,
	taskStatusTone,
} from "@/features/projects/labels";
import type {
	ProjectMilestoneRow,
	ProjectTaskRow,
} from "@/features/projects/types";
import { orpc } from "@/utils/orpc";

interface TimelineItem {
	date: Date;
	id: string;
	kind: "milestone" | "task";
	label: string;
	status: string;
	title: string;
}

function toDate(value: string | Date | null): Date | null {
	if (!value) {
		return null;
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime()) ? null : d;
}

export function ProjectTimeline({ projectId }: { projectId: string }) {
	const milestones = useQuery(
		orpc.projects.milestones.list.queryOptions({ input: { projectId } })
	);
	const tasks = useQuery(
		orpc.projects.tasks.list.queryOptions({
			input: { projectId, limit: 200 },
		})
	);

	const milestoneRows =
		(milestones.data as ProjectMilestoneRow[] | undefined) ?? [];
	const taskRows = (tasks.data as ProjectTaskRow[] | undefined) ?? [];

	const items: TimelineItem[] = [];
	for (const m of milestoneRows) {
		const date = toDate(m.dueDate) ?? toDate(m.completedAt);
		if (date) {
			items.push({
				id: m.id,
				kind: "milestone",
				date,
				title: m.name,
				status: m.status,
				label: "Milestone",
			});
		}
	}
	for (const t of taskRows) {
		const date = toDate(t.dueDate);
		if (date) {
			items.push({
				id: t.id,
				kind: "task",
				date,
				title: t.title,
				status: t.status,
				label: "Task",
			});
		}
	}
	items.sort((a, b) => a.date.getTime() - b.date.getTime());

	const undatedCount = milestoneRows.length + taskRows.length - items.length;
	const loading = milestones.isLoading || tasks.isLoading;

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<span className="pj-section-title">Timeline</span>
				{undatedCount > 0 ? (
					<span className="pj-sub">
						{undatedCount} undated item(s) not shown
					</span>
				) : null}
			</div>

			{loading ? <div className="pj-skeleton" /> : null}
			{!loading && items.length === 0 ? (
				<EmptyState
					compact
					description="Add due dates to milestones or tasks to see them on the timeline."
					title="Nothing scheduled yet"
				/>
			) : null}

			{items.length > 0 ? (
				<div className="pj-timeline">
					{items.map((it) => (
						<div className="pj-timeline-item" key={`${it.kind}-${it.id}`}>
							<div className="pj-timeline-date">{fmtDate(it.date)}</div>
							<div className="pj-timeline-marker">
								{it.kind === "milestone" ? (
									<Flag size={13} />
								) : (
									<ListTodo size={13} />
								)}
							</div>
							<div className="pj-timeline-card">
								<div className="pj-timeline-card-top">
									<span className="pj-name">{it.title}</span>
									{it.kind === "milestone" ? (
										<Badge tone={milestoneStatusTone(it.status)}>
											{milestoneStatusLabel(it.status)}
										</Badge>
									) : (
										<Badge tone={taskStatusTone(it.status)}>
											{taskStatusLabel(it.status)}
										</Badge>
									)}
								</div>
								<span className="pj-sub">{it.label}</span>
							</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
