import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/candidates/")({
	component: CandidatesListPage,
});

type CandidateStatus = "active" | "inactive_pool" | "blocked";

const STATUS_FILTERS: { key: CandidateStatus | "all"; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "active", label: "Active" },
	{ key: "inactive_pool", label: "Talent pool" },
	{ key: "blocked", label: "Blocked" },
];

const STATUS_LABEL: Record<CandidateStatus, string> = {
	active: "Active",
	inactive_pool: "Talent pool",
	blocked: "Blocked",
};

const STATUS_TONE: Record<CandidateStatus, string> = {
	active: "badge badge-success",
	inactive_pool: "badge",
	blocked: "badge badge-warning",
};

interface CandidateRow {
	createdAt: string | Date;
	email: string;
	firstName: string;
	id: string;
	lastName?: string | null;
	status: string;
}

const candidateColumns: ColumnDef<CandidateRow, unknown>[] = [
	{
		accessorKey: "firstName",
		header: "Name",
		cell: ({ row }) => (
			<Link
				params={{ id: row.original.id }}
				style={{
					fontWeight: 600,
					color: "var(--fg)",
					textDecoration: "none",
				}}
				to="/app/recruitment/candidates/$id"
			>
				{row.original.firstName} {row.original.lastName}
			</Link>
		),
	},
	{
		accessorKey: "email",
		header: "Email",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>{row.original.email}</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status as CandidateStatus;
			return (
				<span className={STATUS_TONE[status] ?? "badge"}>
					{STATUS_LABEL[status] ?? row.original.status}
				</span>
			);
		},
	},
	{
		accessorKey: "createdAt",
		header: "Added",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{new Date(row.original.createdAt).toLocaleDateString()}
			</span>
		),
	},
];

function CandidatesListPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const [filter, setFilter] = useState<CandidateStatus | "all">("all");
	const [search, setSearch] = useState("");

	const candidates = useQuery(
		orpc.recruitment.candidates.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				search: search.trim() || undefined,
				page: 1,
				pageSize: 50,
			},
		})
	);

	const rows = candidates.data?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Candidates</span>
					</div>
					<h1 className="page-title">Candidates</h1>
					<p className="page-sub">
						All people who have entered the hiring pipeline.
					</p>
				</div>
				{canManage && (
					<div className="page-actions">
						<button className="btn btn-primary btn-sm" disabled type="button">
							Add candidate
						</button>
					</div>
				)}
			</div>

			<RecruitmentTabs />

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 10,
					alignItems: "center",
					marginBottom: 14,
				}}
			>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
				<input
					className="input"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search name or email"
					style={{ maxWidth: 260 }}
					type="search"
					value={search}
				/>
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={candidateColumns}
					data={rows as CandidateRow[]}
					emptyState={
						<EmptyState
							description={
								search.trim()
									? "No candidates match your search."
									: "Once candidates apply or are added, they'll appear here."
							}
							icon={<Users size={20} />}
							title={
								search.trim() ? "No matching candidates" : "No candidates yet"
							}
						/>
					}
					isError={candidates.isError}
					isLoading={candidates.isLoading}
				/>
			</div>
		</div>
	);
}
