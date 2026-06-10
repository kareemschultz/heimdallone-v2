import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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

const projectColumns: ColumnDef<ProjectRow, unknown>[] = [
	{
		accessorKey: "reference",
		header: "Reference",
		cell: ({ row }) => (
			<span className="pj-mono">{row.original.reference}</span>
		),
	},
	{
		accessorKey: "name",
		header: "Project",
		cell: ({ row }) => (
			<>
				<Link
					className="pj-name pj-name-link"
					params={{ id: row.original.id }}
					to="/app/projects/$id"
				>
					{row.original.name}
				</Link>
				<div className="pj-sub">
					{row.original.projectManagerName ?? "Unassigned"}
				</div>
			</>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={projectStatusTone(row.original.status)}>
				{projectStatusLabel(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "health",
		header: "Health",
		cell: ({ row }) => (
			<Badge tone={healthTone(row.original.health)}>
				{healthLabel(row.original.health)}
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
		accessorKey: "taskCount",
		header: "Tasks",
		cell: ({ row }) => (
			<>
				{row.original.openTaskCount}/{row.original.taskCount}
				{row.original.overdueTaskCount > 0 ? (
					<span className="pj-overdue">
						{" "}
						· {row.original.overdueTaskCount} overdue
					</span>
				) : null}
			</>
		),
	},
	{
		accessorKey: "targetEndDate",
		header: "Target",
		cell: ({ row }) => fmtDate(row.original.targetEndDate),
	},
	{
		accessorKey: "hasCrossModuleLinks",
		header: "Linked",
		cell: ({ row }) =>
			row.original.hasCrossModuleLinks ? (
				<span className="pj-linkchip">
					<Link2 size={11} /> Linked
				</span>
			) : (
				"—"
			),
	},
];

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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={projectColumns}
					data={rows as ProjectRow[]}
					emptyState={
						<EmptyState
							compact
							description="No projects match these filters."
							title="No projects yet"
						/>
					}
					isError={list.isError}
					isLoading={list.isLoading}
				/>
			</div>
		</div>
	);
}
