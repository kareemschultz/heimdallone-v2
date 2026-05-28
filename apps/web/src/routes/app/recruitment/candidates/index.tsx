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

			{candidates.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading candidates…
				</div>
			)}

			{!candidates.isLoading && rows.length === 0 && (
				<div className="card card-pad">
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
				</div>
			)}

			{!candidates.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Status</th>
								<th>Added</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((c) => (
								<tr key={c.id}>
									<td>
										<Link
											params={{ id: c.id }}
											style={{
												fontWeight: 600,
												color: "var(--fg)",
												textDecoration: "none",
											}}
											to="/app/recruitment/candidates/$id"
										>
											{c.firstName} {c.lastName}
										</Link>
									</td>
									<td style={{ color: "var(--fg-2)" }}>{c.email}</td>
									<td>
										<span className={STATUS_TONE[c.status as CandidateStatus]}>
											{STATUS_LABEL[c.status as CandidateStatus] ?? c.status}
										</span>
									</td>
									<td style={{ color: "var(--fg-3)" }}>
										{new Date(c.createdAt).toLocaleDateString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
