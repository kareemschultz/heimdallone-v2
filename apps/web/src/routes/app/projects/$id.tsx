import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/projects.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	healthLabel,
	healthTone,
	priorityLabel,
	priorityTone,
	projectStatusLabel,
	projectStatusTone,
} from "@/features/projects/labels";
import { ProjectMilestones } from "@/features/projects/project-milestones";
import { ProjectPeople } from "@/features/projects/project-people";
import { ProjectTasks } from "@/features/projects/project-tasks";
import { ProjectTime } from "@/features/projects/project-time";
import type { ProjectDetail } from "@/features/projects/types";
import {
	canApproveProjectTime,
	canEditProject,
	canManageProjectMembers,
	canManageProjects,
	canTrackProjectTime,
	canViewProjectInternalNotes,
	canViewProjects,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/projects/$id")({
	component: ProjectDetailPage,
});

type DetailTab = "summary" | "tasks" | "time" | "people" | "milestones";

function SummaryRow({ k, children }: { children: string; k: string }) {
	return (
		<div>
			<span className="pj-k">{k}</span>
			<span>{children}</span>
		</div>
	);
}

function ProjectSummary({
	p,
	canViewInternal,
}: {
	canViewInternal: boolean;
	p: ProjectDetail;
}) {
	return (
		<div className="pj-summary">
			<div className="pj-sum-grid">
				<SummaryRow k="Project manager">
					{p.projectManagerName ?? "Unassigned"}
				</SummaryRow>
				<SummaryRow k="Status">{projectStatusLabel(p.status)}</SummaryRow>
				<SummaryRow k="Health">{healthLabel(p.health)}</SummaryRow>
				<SummaryRow k="Priority">{priorityLabel(p.priority)}</SummaryRow>
				<SummaryRow k="Start">{fmtDate(p.startDate)}</SummaryRow>
				<SummaryRow k="Target">{fmtDate(p.targetEndDate)}</SummaryRow>
				<SummaryRow k="Members">{String(p.memberCount)}</SummaryRow>
				<SummaryRow k="Tasks">
					{`${p.openTaskCount} open / ${p.taskCount} total`}
				</SummaryRow>
				{p.overdueTaskCount > 0 ? (
					<SummaryRow k="Overdue tasks">
						{String(p.overdueTaskCount)}
					</SummaryRow>
				) : null}
				{p.canViewBudget && p.budget ? (
					<SummaryRow k="Budget">{p.budget}</SummaryRow>
				) : null}
			</div>

			{p.description ? <p className="pj-desc">{p.description}</p> : null}

			{p.linkedCustomerId || p.linkedDealId ? (
				<div className="pj-linked-panel">
					<div className="pj-linked-note">
						Linked CRM records (context only — CRM is a future module).
					</div>
					{p.linkedCustomerId ? (
						<div className="pj-linked-item">
							<span className="pj-linked-kind">Customer</span>
							<span className="pj-mono">{p.linkedCustomerId}</span>
						</div>
					) : null}
					{p.linkedDealId ? (
						<div className="pj-linked-item">
							<span className="pj-linked-kind">Deal</span>
							<span className="pj-mono">{p.linkedDealId}</span>
						</div>
					) : null}
				</div>
			) : null}

			{canViewInternal && p.internalNote ? (
				<div className="pj-resolution">Internal note: {p.internalNote}</div>
			) : null}
		</div>
	);
}

function ProjectDetailPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const { id } = Route.useParams();
	const isViewer = canViewProjects(role);
	const canLoad = isViewer || role === "employee";
	const [tab, setTab] = useState<DetailTab>("summary");

	const detail = useQuery(
		orpc.projects.getById.queryOptions({
			input: { id },
			enabled: canLoad,
			retry: false,
		})
	);

	if (!canLoad) {
		return (
			<div className="page">
				<EmptyState
					description="Projects are available to HR, project managers, and team managers."
					title="You don't have access to this project"
				/>
			</div>
		);
	}
	if (detail.isError) {
		return (
			<div className="page">
				<Link className="pj-back" to="/app/projects/all">
					<ArrowLeft size={14} /> Back to projects
				</Link>
				<EmptyState
					compact
					description="This project is not available to you."
					title="Project not found"
				/>
			</div>
		);
	}

	const p = detail.data as ProjectDetail | undefined;
	const canEdit = canEditProject(role);
	const canMembers = canManageProjectMembers(role);
	const canViewInternal = canViewProjectInternalNotes(role);

	const canCreateTask = canManageProjects(role);
	const canDragTask = canTrackProjectTime(role);
	const canApproveTime = canApproveProjectTime(role);
	const tabs: { key: DetailTab; label: string }[] = [
		{ key: "summary", label: "Summary" },
		{ key: "tasks", label: "Tasks" },
		{ key: "time", label: "Time" },
		{ key: "people", label: "People" },
		{ key: "milestones", label: "Milestones" },
	];

	return (
		<div className="page">
			<Link className="pj-back" to="/app/projects/all">
				<ArrowLeft size={14} /> Back to projects
			</Link>

			{detail.isLoading || !p ? (
				<div className="pj-skeleton" style={{ height: 120 }} />
			) : (
				<>
					<div className="page-header">
						<div>
							<span className="pj-ref">{p.reference}</span>
							<h1 className="page-title">{p.name}</h1>
							<div className="pj-detail-badges">
								<Badge tone={projectStatusTone(p.status)}>
									{projectStatusLabel(p.status)}
								</Badge>
								<Badge tone={healthTone(p.health)}>
									{healthLabel(p.health)}
								</Badge>
								<Badge tone={priorityTone(p.priority)}>
									{priorityLabel(p.priority)}
								</Badge>
							</div>
						</div>
					</div>

					<div className="pj-tabs">
						{tabs.map((t) => (
							<button
								className={`pj-tab ${tab === t.key ? "active" : ""}`}
								key={t.key}
								onClick={() => setTab(t.key)}
								type="button"
							>
								{t.label}
							</button>
						))}
					</div>

					{tab === "summary" ? (
						<ProjectSummary canViewInternal={canViewInternal} p={p} />
					) : null}
					{tab === "tasks" ? (
						<ProjectTasks
							canCreate={canCreateTask}
							canDrag={canDragTask}
							projectId={p.id}
						/>
					) : null}
					{tab === "time" ? (
						<ProjectTime canApprove={canApproveTime} projectId={p.id} />
					) : null}
					{tab === "people" ? (
						<ProjectPeople canManageMembers={canMembers} projectId={p.id} />
					) : null}
					{tab === "milestones" ? (
						<ProjectMilestones canEdit={canEdit} projectId={p.id} />
					) : null}
				</>
			)}
		</div>
	);
}
