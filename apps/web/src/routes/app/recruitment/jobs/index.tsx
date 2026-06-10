import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { JobFormDialog } from "@/features/recruitment/job-form-dialog";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/jobs/")({
	component: JobsListPage,
});

type JobStatus = "draft" | "open" | "paused" | "closed" | "cancelled";

const STATUS_FILTERS: { key: JobStatus | "all"; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "draft", label: "Draft" },
	{ key: "open", label: "Open" },
	{ key: "paused", label: "Paused" },
	{ key: "closed", label: "Closed" },
	{ key: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<JobStatus, string> = {
	draft: "Draft",
	open: "Open",
	paused: "Paused",
	closed: "Closed",
	cancelled: "Cancelled",
};

const STATUS_TONE: Record<JobStatus, string> = {
	draft: "badge",
	open: "badge badge-success",
	paused: "badge badge-warning",
	closed: "badge",
	cancelled: "badge badge-muted",
};

interface JobRow {
	employmentType?: string | null;
	id: string;
	publishedAt?: string | Date | null;
	status: string;
	title: string;
	vacancyCount: number;
	workLocation?: string | null;
}

const jobColumns: ColumnDef<JobRow, unknown>[] = [
	{
		accessorKey: "title",
		header: "Title",
		cell: ({ row }) => (
			<Link
				params={{ id: row.original.id }}
				style={{
					fontWeight: 600,
					color: "var(--fg)",
					textDecoration: "none",
				}}
				to="/app/recruitment/jobs/$id"
			>
				{row.original.title}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className={STATUS_TONE[row.original.status as JobStatus]}>
				{STATUS_LABEL[row.original.status as JobStatus] ?? row.original.status}
			</span>
		),
	},
	{
		accessorKey: "vacancyCount",
		header: "Vacancies",
		cell: ({ row }) => (
			<span style={{ textAlign: "right", display: "block" }}>
				{row.original.vacancyCount}
			</span>
		),
	},
	{
		accessorKey: "workLocation",
		header: "Work location",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{row.original.workLocation ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "employmentType",
		header: "Employment type",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{row.original.employmentType ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "publishedAt",
		header: "Opened",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{row.original.publishedAt
					? new Date(row.original.publishedAt).toLocaleDateString()
					: "—"}
			</span>
		),
	},
];

function JobsListPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<JobStatus | "all">("all");
	const [showCreate, setShowCreate] = useState(false);

	const jobs = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page: 1,
				pageSize: 50,
			},
		})
	);

	const rows = jobs.data?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Jobs</span>
					</div>
					<h1 className="page-title">Jobs</h1>
					<p className="page-sub">
						Posted jobs and drafts. Open jobs accept new candidates.
					</p>
				</div>
				{canManage && (
					<div className="page-actions">
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setShowCreate(true)}
							type="button"
						>
							New job
						</button>
					</div>
				)}
			</div>

			<RecruitmentTabs />

			<div
				className="filter-row"
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					marginBottom: 14,
				}}
			>
				{STATUS_FILTERS.map((f) => (
					<button
						className={`filter-chip ${filter === f.key ? "active" : ""}`}
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
					columns={jobColumns}
					data={rows as JobRow[]}
					emptyState={
						<EmptyState
							description={
								filter === "all"
									? "Create your first job to start collecting candidates."
									: `No jobs with status “${filter}”.`
							}
							icon={<Briefcase size={20} />}
							title={
								filter === "all" ? "No jobs yet" : "No jobs match this filter"
							}
						/>
					}
					isError={jobs.isError}
					isLoading={jobs.isLoading}
				/>
			</div>

			{showCreate && (
				<JobFormDialog
					mode="create"
					onClose={() => setShowCreate(false)}
					onSaved={(newId) => {
						setShowCreate(false);
						queryClient.invalidateQueries({
							predicate: (q) => {
								const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
								return Array.isArray(path) && path[0] === "recruitment";
							},
						});
						navigate({
							params: { id: newId },
							to: "/app/recruitment/jobs/$id",
						});
					}}
				/>
			)}
		</div>
	);
}
