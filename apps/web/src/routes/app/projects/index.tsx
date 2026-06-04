import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { useContext } from "react";

import "@/styles/projects.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	healthLabel,
	healthTone,
	projectStatusLabel,
	projectStatusTone,
} from "@/features/projects/labels";
import { ProjectsTabs } from "@/features/projects/projects-tabs";
import type { ProjectRow } from "@/features/projects/types";
import { canViewProjects } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/projects/")({
	component: ProjectsOverviewPage,
});

const ATTENTION_LIST_LIMIT = 5;

function AttentionGroup({
	head,
	items,
	renderBadge,
}: {
	head: string;
	items: ProjectRow[];
	renderBadge: (p: ProjectRow) => React.ReactNode;
}) {
	return (
		<div className="pj-attention-group">
			<div className="pj-attention-head">
				{head} ({items.length})
			</div>
			{items.length === 0 ? (
				<div className="pj-attention-empty">Nothing here right now.</div>
			) : (
				items.slice(0, ATTENTION_LIST_LIMIT).map((p) => (
					<div className="pj-attention-item" key={p.id}>
						<span className="pj-mono">{p.reference}</span>
						<span className="pj-name">{p.name}</span>
						<span className="pj-sub">
							{p.projectManagerName ?? "Unassigned"}
						</span>
						{renderBadge(p)}
					</div>
				))
			)}
		</div>
	);
}

// Employees reach Projects through the scoped project list (and, in 14G, the
// self-service My Tasks / My Time views). We render a landing that LINKS there
// rather than auto-redirecting — OrgCtx resolves the member role asynchronously
// (defaults to "employee" until the active membership loads), so a render-time
// redirect would also bounce viewers/admins on first paint (lesson #84).
function EmployeeLanding({ orgName }: { orgName: string }) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{orgName}</span>
						<span className="sep">/</span>
						<span>Projects</span>
					</div>
					<h1 className="page-title">Projects</h1>
					<p className="page-sub">The projects you're a part of.</p>
				</div>
			</div>
			<EmptyState
				action={{ label: "View my projects", href: "/app/projects/all" }}
				description="See the projects you're assigned to, their milestones, and the tasks coming your way."
				icon={<FolderKanban size={28} />}
				title="Your projects live here"
			/>
		</div>
	);
}

function ProjectsOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewProjects(org.memberRole);
	const isEmployee = org.memberRole === "employee";

	const projects = useQuery(
		orpc.projects.list.queryOptions({ input: {}, enabled: canView })
	);

	if (!canView) {
		if (isEmployee) {
			return <EmployeeLanding orgName={org.orgName} />;
		}
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Projects</h1>
					</div>
				</div>
				<EmptyState
					description="Projects are available to HR, project managers, and team managers."
					icon={<FolderKanban size={28} />}
					title="You don't have access to projects"
				/>
			</div>
		);
	}

	const rows = (projects.data as ProjectRow[] | undefined) ?? [];
	const active = rows.filter((p) => p.status === "active");
	const onHold = rows.filter((p) => p.status === "on_hold");
	const offTrack = rows.filter((p) => p.health === "off_track");
	const atRisk = rows.filter((p) => p.health === "at_risk");
	const withOverdueTasks = rows.filter((p) => p.overdueTaskCount > 0);
	const overdueTaskTotal = rows.reduce((sum, p) => sum + p.overdueTaskCount, 0);

	const tiles = [
		{ label: "Active", value: active.length, alert: false },
		{ label: "On hold", value: onHold.length, alert: false },
		{ label: "At risk", value: atRisk.length, alert: atRisk.length > 0 },
		{
			label: "Off track",
			value: offTrack.length,
			alert: offTrack.length > 0,
		},
		{
			label: "Overdue tasks",
			value: overdueTaskTotal,
			alert: overdueTaskTotal > 0,
		},
	];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Projects</span>
					</div>
					<h1 className="page-title">Projects</h1>
					<p className="page-sub">
						Plan and deliver work across your team — milestones, tasks, and
						time.
					</p>
				</div>
			</div>

			<ProjectsTabs />

			<div className="pj-tiles">
				{tiles.map((t) => (
					<div className={`pj-tile ${t.alert ? "alert" : ""}`} key={t.label}>
						<span className="pj-tile-val">{t.value}</span>
						<span className="pj-tile-lbl">{t.label}</span>
					</div>
				))}
			</div>

			{projects.isLoading ? <div className="pj-skeleton" /> : null}
			{projects.isError ? (
				<EmptyState
					compact
					description="Could not load the projects overview. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{projects.isLoading || projects.isError ? null : (
				<div className="pj-attention">
					<div className="pj-attention-title">Needs attention</div>
					<AttentionGroup
						head="Off track"
						items={offTrack}
						renderBadge={(p) => (
							<Badge tone={healthTone(p.health)}>{healthLabel(p.health)}</Badge>
						)}
					/>
					<AttentionGroup
						head="At risk"
						items={atRisk}
						renderBadge={(p) => (
							<Badge tone={healthTone(p.health)}>{healthLabel(p.health)}</Badge>
						)}
					/>
					<AttentionGroup
						head="On hold"
						items={onHold}
						renderBadge={(p) => (
							<Badge tone={projectStatusTone(p.status)}>
								{projectStatusLabel(p.status)}
							</Badge>
						)}
					/>
					<AttentionGroup
						head="Has overdue tasks"
						items={withOverdueTasks}
						renderBadge={(p) => (
							<Badge tone="danger">{`${p.overdueTaskCount} overdue`}</Badge>
						)}
					/>
				</div>
			)}

			<div className="pj-quicklinks">
				<Link className="pj-quicklink" to="/app/projects/all">
					<span className="pj-ql-title">All projects</span>
					<span className="pj-ql-sub">Browse, filter, and open a project</span>
				</Link>
			</div>
		</div>
	);
}
