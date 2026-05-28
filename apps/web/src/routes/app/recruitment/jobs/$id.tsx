import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { useContext } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/jobs/$id")({
	component: JobDetailPage,
});

type JobStatus = "draft" | "open" | "paused" | "closed" | "cancelled";

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

const STAGE_LABEL: Record<string, string> = {
	new: "Just applied",
	screening: "Screening",
	shortlisted: "Shortlisted",
	interview: "In interviews",
	offer: "Offer stage",
	hired: "Hired",
	rejected: "Not selected",
	withdrawn: "Withdrew",
};

function JobDetailPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const { id } = Route.useParams();

	const job = useQuery(
		orpc.recruitment.jobs.get.queryOptions({ input: { id } })
	);

	const applications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { jobOpeningId: id, page: 1, pageSize: 50 },
		})
	);

	const status = (job.data?.status ?? "draft") as JobStatus;
	const apps = applications.data?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/recruitment/jobs"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Jobs
						</Link>
						<span className="sep">/</span>
						<span>{job.data?.title ?? "Job"}</span>
					</div>
					<h1 className="page-title">{job.data?.title ?? "Loading…"}</h1>
					{job.data && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginTop: 6,
							}}
						>
							<span className={STATUS_TONE[status]}>
								{STATUS_LABEL[status]}
							</span>
							<span style={{ color: "var(--fg-3)", fontSize: 12.5 }}>
								{job.data.vacancyCount} vacancy
								{job.data.vacancyCount === 1 ? "" : "ies"}
								{job.data.workLocation ? ` · ${job.data.workLocation}` : ""}
							</span>
						</div>
					)}
				</div>
				{canManage && (
					<div className="page-actions">
						<button className="btn btn-outline btn-sm" disabled type="button">
							Edit
						</button>
					</div>
				)}
			</div>

			<RecruitmentTabs />

			<div
				className="grid"
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
					gap: 16,
				}}
			>
				<div>
					<div className="card card-pad" style={{ marginBottom: 16 }}>
						<div className="eyebrow" style={{ marginBottom: 10 }}>
							Candidates on this job
						</div>
						{applications.isLoading && (
							<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
						)}
						{!applications.isLoading && apps.length === 0 && (
							<EmptyState
								action={{
									href: "/app/recruitment/candidates",
									label: "Add a candidate",
								}}
								compact
								description="When candidates apply or are added, they'll appear here."
								icon={<Users size={20} />}
								title="No candidates have applied yet"
							/>
						)}
						{!applications.isLoading && apps.length > 0 && (
							<table className="tbl">
								<thead>
									<tr>
										<th>Candidate</th>
										<th>Stage</th>
										<th>Applied</th>
									</tr>
								</thead>
								<tbody>
									{apps.map((app) => (
										<tr key={app.id}>
											<td style={{ fontWeight: 600 }}>
												<Link
													params={{ id: app.candidateId }}
													style={{
														color: "var(--fg)",
														textDecoration: "none",
													}}
													to="/app/recruitment/candidates/$id"
												>
													{app.candidateId.slice(0, 8)}…
												</Link>
											</td>
											<td>
												<span className="badge">
													{STAGE_LABEL[app.stage] ?? app.stage}
												</span>
											</td>
											<td style={{ color: "var(--fg-3)" }}>
												{new Date(app.appliedAt).toLocaleDateString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>

				<div>
					<div className="card card-pad">
						<div className="eyebrow" style={{ marginBottom: 10 }}>
							Job details
						</div>
						<dl
							style={{
								display: "grid",
								gridTemplateColumns: "1fr",
								gap: 10,
								margin: 0,
							}}
						>
							<DetailRow
								label="Employment type"
								value={job.data?.employmentType ?? "—"}
							/>
							<DetailRow
								label="Work location"
								value={job.data?.workLocation ?? "—"}
							/>
							<DetailRow
								label="Opens"
								value={
									job.data?.publishedAt
										? new Date(job.data.publishedAt).toLocaleDateString()
										: "Not yet posted"
								}
							/>
							<DetailRow
								label="Closes"
								value={
									job.data?.closedAt
										? new Date(job.data.closedAt).toLocaleDateString()
										: "Open-ended"
								}
							/>
						</dl>
					</div>

					{job.data?.description && (
						<div
							className="card card-pad"
							style={{ marginTop: 16, whiteSpace: "pre-wrap" }}
						>
							<div className="eyebrow" style={{ marginBottom: 10 }}>
								Description
							</div>
							<div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
								{job.data.description}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "120px 1fr",
				gap: 8,
				fontSize: 13,
			}}
		>
			<dt style={{ color: "var(--fg-3)" }}>{label}</dt>
			<dd style={{ margin: 0, color: "var(--fg)" }}>{value}</dd>
		</div>
	);
}
