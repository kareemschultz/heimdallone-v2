import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Link2, Search } from "lucide-react";
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
import { ProjectsTabs } from "@/features/projects/projects-tabs";
import type { ProjectRow } from "@/features/projects/types";
import { canViewProjects } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/projects/all")({
	component: ProjectsListPage,
});

const STATUS_OPTIONS = [
	{ value: "planning", label: "Planning" },
	{ value: "active", label: "Active" },
	{ value: "on_hold", label: "On hold" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "archived", label: "Archived" },
];
const HEALTH_OPTIONS = [
	{ value: "on_track", label: "On track" },
	{ value: "at_risk", label: "At risk" },
	{ value: "off_track", label: "Off track" },
	{ value: "completed", label: "Completed" },
	{ value: "no_data", label: "No data" },
];

function ProjectRowView({ p }: { p: ProjectRow }) {
	return (
		<tr>
			<td>
				<span className="pj-mono">{p.reference}</span>
			</td>
			<td>
				<span className="pj-name">{p.name}</span>
				<div className="pj-sub">{p.projectManagerName ?? "Unassigned"}</div>
			</td>
			<td>
				<Badge tone={projectStatusTone(p.status)}>
					{projectStatusLabel(p.status)}
				</Badge>
			</td>
			<td>
				<Badge tone={healthTone(p.health)}>{healthLabel(p.health)}</Badge>
			</td>
			<td>
				<Badge tone={priorityTone(p.priority)}>
					{priorityLabel(p.priority)}
				</Badge>
			</td>
			<td>
				{p.openTaskCount}/{p.taskCount}
				{p.overdueTaskCount > 0 ? (
					<span className="pj-overdue"> · {p.overdueTaskCount} overdue</span>
				) : null}
			</td>
			<td>{fmtDate(p.targetEndDate)}</td>
			<td>
				{p.hasCrossModuleLinks ? (
					<span className="pj-linkchip">
						<Link2 size={11} /> Linked
					</span>
				) : (
					"—"
				)}
			</td>
		</tr>
	);
}

function ProjectsListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewProjects(org.memberRole);
	const isEmployee = org.memberRole === "employee";
	// Employees see their own scoped project list; viewers/managers see the staff
	// queue. Recruiter / helpdesk_agent (no project AC) get a clean no-access state.
	const hasAccess = canView || isEmployee;

	const [status, setStatus] = useState("");
	const [health, setHealth] = useState("");
	const [search, setSearch] = useState("");

	const list = useQuery(
		orpc.projects.list.queryOptions({
			input: { includeArchived: true },
			enabled: hasAccess,
		})
	);

	if (!hasAccess) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Projects</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to projects", href: "/app/projects" }}
					description="Projects are available to HR, project managers, and team managers."
					icon={<FolderKanban size={28} />}
					title="You don't have access to projects"
				/>
			</div>
		);
	}

	const allRows = (list.data as ProjectRow[] | undefined) ?? [];
	const q = search.trim().toLowerCase();
	const rows = allRows.filter((p) => {
		if (status && p.status !== status) {
			return false;
		}
		if (health && p.health !== health) {
			return false;
		}
		if (
			q &&
			!(
				p.name.toLowerCase().includes(q) ||
				p.reference.toLowerCase().includes(q)
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
						<span>Projects</span>
					</div>
					<h1 className="page-title">
						{isEmployee ? "My projects" : "Projects"}
					</h1>
					<p className="page-sub">
						{rows.length} project{rows.length === 1 ? "" : "s"}
					</p>
				</div>
			</div>

			<ProjectsTabs />

			<div className="pj-toolbar">
				<div className="pj-search">
					<Search size={14} />
					<input
						aria-label="Search projects by name or reference"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search name or reference…"
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
				<select
					aria-label="Filter by health"
					onChange={(e) => setHealth(e.target.value)}
					value={health}
				>
					<option value="">All health states</option>
					{HEALTH_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</div>

			{list.isLoading ? <div className="pj-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load projects. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No projects match these filters."
					title="No projects yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Project</th>
							<th>Status</th>
							<th>Health</th>
							<th>Priority</th>
							<th>Tasks</th>
							<th>Target</th>
							<th>Linked</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => (
							<ProjectRowView key={p.id} p={p} />
						))}
					</tbody>
				</table>
			) : null}
		</div>
	);
}
