import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import {
	JobFormDialog,
	type JobFormInitial,
} from "@/features/recruitment/job-form-dialog";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

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

type TransitionKey = "publish" | "pause" | "close" | "cancel";

const TRANSITION_META: Record<
	TransitionKey,
	{ label: string; helper: string; primary: boolean }
> = {
	publish: {
		label: "Open job",
		helper: "Opening a job makes it available in the recruitment pipeline.",
		primary: true,
	},
	pause: {
		label: "Pause job",
		helper: "Pausing keeps the job but stops active hiring.",
		primary: false,
	},
	close: {
		label: "Close job",
		helper: "Closing means hiring is complete.",
		primary: false,
	},
	cancel: {
		label: "Cancel job",
		helper: "Cancelling means this job is no longer needed.",
		primary: false,
	},
};

// Mirror of the API's allowed transitions (the API remains the source of
// truth and re-checks every transition). closed / cancelled are terminal.
function availableTransitions(status: JobStatus): TransitionKey[] {
	switch (status) {
		case "draft":
			return ["publish", "close", "cancel"];
		case "open":
			return ["pause", "close", "cancel"];
		case "paused":
			return ["publish", "close", "cancel"];
		default:
			return [];
	}
}

function toDateInput(value: string | null | undefined): string {
	if (!value) {
		return "";
	}
	return String(value).slice(0, 10);
}

function JobDetailPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const { id } = Route.useParams();
	const queryClient = useQueryClient();

	const [tab, setTab] = useState<"overview" | "settings">("overview");
	const [showEdit, setShowEdit] = useState(false);
	const [pendingTransition, setPendingTransition] =
		useState<TransitionKey | null>(null);

	const job = useQuery(
		orpc.recruitment.jobs.get.queryOptions({ input: { id } })
	);
	const applications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { jobOpeningId: id, page: 1, pageSize: 50 },
		})
	);

	const status = (job.data?.status ?? "draft") as JobStatus;
	const isTerminal = status === "closed" || status === "cancelled";

	const invalidateRecruitment = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "recruitment";
			},
		});

	const transitionMutation = useMutation({
		mutationFn: (key: TransitionKey) => {
			const fns = {
				publish: client.recruitment.jobs.publish,
				pause: client.recruitment.jobs.pause,
				close: client.recruitment.jobs.close,
				cancel: client.recruitment.jobs.cancel,
			};
			return fns[key]({ id });
		},
		onSuccess: async () => {
			setPendingTransition(null);
			await invalidateRecruitment();
			toast.success("Job updated.");
		},
		onError: (err: Error) => {
			setPendingTransition(null);
			toast.error(`Could not update the job: ${err.message}`);
		},
	});

	const editInitial: Partial<JobFormInitial> | undefined = job.data
		? {
				title: job.data.title,
				description: job.data.description ?? "",
				employmentType: job.data.employmentType ?? "",
				workLocation: job.data.workLocation ?? "",
				vacancyCount: job.data.vacancyCount,
				startDate: toDateInput(job.data.startDate),
				endDate: toDateInput(job.data.endDate),
			}
		: undefined;

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
				{canManage && job.data && (
					<div className="page-actions">
						<button
							className="btn btn-outline btn-sm"
							disabled={isTerminal}
							onClick={() => setShowEdit(true)}
							title={
								isTerminal
									? "Closed or cancelled jobs cannot be edited."
									: undefined
							}
							type="button"
						>
							Edit
						</button>
					</div>
				)}
			</div>

			<RecruitmentTabs />

			<div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
				<button
					className={`filter-chip ${tab === "overview" ? "active" : ""}`}
					onClick={() => setTab("overview")}
					type="button"
				>
					Overview
				</button>
				<button
					className={`filter-chip ${tab === "settings" ? "active" : ""}`}
					onClick={() => setTab("settings")}
					type="button"
				>
					Settings
				</button>
			</div>

			{tab === "overview" ? (
				<OverviewTab applications={applications} job={job.data} />
			) : (
				<SettingsTab
					canManage={canManage}
					isPending={transitionMutation.isPending}
					job={job.data}
					onTransition={(key) => setPendingTransition(key)}
					status={status}
				/>
			)}

			{showEdit && editInitial && (
				<JobFormDialog
					initial={editInitial}
					jobId={id}
					mode="edit"
					onClose={() => setShowEdit(false)}
					onSaved={() => {
						setShowEdit(false);
						invalidateRecruitment().catch(() => {
							// query errors surface via the global query-error toast
						});
					}}
				/>
			)}

			{pendingTransition && (
				<ConfirmDialog
					confirmLabel={TRANSITION_META[pendingTransition].label}
					helper={TRANSITION_META[pendingTransition].helper}
					isPending={transitionMutation.isPending}
					onCancel={() => setPendingTransition(null)}
					onConfirm={() => transitionMutation.mutate(pendingTransition)}
					title={TRANSITION_META[pendingTransition].label}
				/>
			)}
		</div>
	);
}

function OverviewTab({
	job,
	applications,
}: {
	job:
		| {
				employmentType: string | null;
				workLocation: string | null;
				publishedAt: string | Date | null;
				closedAt: string | Date | null;
				description: string | null;
		  }
		| undefined;
	applications: ReturnType<
		typeof useQuery<{ data: ApplicationRow[]; total: number; page: number }>
	>;
}) {
	const apps = applications.data?.data ?? [];
	return (
		<div
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
												style={{ color: "var(--fg)", textDecoration: "none" }}
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
							value={job?.employmentType ?? "—"}
						/>
						<DetailRow label="Work location" value={job?.workLocation ?? "—"} />
						<DetailRow
							label="Opens"
							value={
								job?.publishedAt
									? new Date(job.publishedAt).toLocaleDateString()
									: "Not yet posted"
							}
						/>
						<DetailRow
							label="Closes"
							value={
								job?.closedAt
									? new Date(job.closedAt).toLocaleDateString()
									: "Open-ended"
							}
						/>
					</dl>
				</div>

				{job?.description && (
					<div
						className="card card-pad"
						style={{ marginTop: 16, whiteSpace: "pre-wrap" }}
					>
						<div className="eyebrow" style={{ marginBottom: 10 }}>
							Description
						</div>
						<div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
							{job.description}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function SettingsTab({
	job,
	status,
	canManage,
	isPending,
	onTransition,
}: {
	job: { vacancyCount: number; employmentType: string | null } | undefined;
	status: JobStatus;
	canManage: boolean;
	isPending: boolean;
	onTransition: (key: TransitionKey) => void;
}) {
	if (!job) {
		return (
			<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
				Loading…
			</div>
		);
	}
	const transitions = availableTransitions(status);
	return (
		<div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 10 }}>
					Status
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<span className={STATUS_TONE[status]}>{STATUS_LABEL[status]}</span>
					<span style={{ color: "var(--fg-3)", fontSize: 12.5 }}>
						{status === "closed" || status === "cancelled"
							? "This job is no longer active."
							: "Use the controls below to change the job's status."}
					</span>
				</div>
				{canManage && transitions.length > 0 && (
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: 8,
							marginTop: 14,
						}}
					>
						{transitions.map((key) => (
							<button
								className={`btn btn-sm ${
									TRANSITION_META[key].primary ? "btn-primary" : "btn-outline"
								}`}
								disabled={isPending}
								key={key}
								onClick={() => onTransition(key)}
								type="button"
							>
								{TRANSITION_META[key].label}
							</button>
						))}
					</div>
				)}
				{!canManage && (
					<p style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 12 }}>
						You have read-only access to this job.
					</p>
				)}
			</div>

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 10 }}>
					Hiring pipeline
				</div>
				<p style={{ color: "var(--fg-3)", fontSize: 13 }}>
					Custom stages are planned. This job currently uses the default hiring
					pipeline (Just applied → Screening → Shortlisted → Interviewing →
					Offer).
				</p>
			</div>

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 10 }}>
					Activity
				</div>
				<p style={{ color: "var(--fg-3)", fontSize: 13 }}>
					A full status history will appear here in a later update.
				</p>
			</div>
		</div>
	);
}

interface ApplicationRow {
	appliedAt: string | Date;
	candidateId: string;
	id: string;
	stage: string;
}

function ConfirmDialog({
	title,
	helper,
	confirmLabel,
	isPending,
	onCancel,
	onConfirm,
}: {
	title: string;
	helper: string;
	confirmLabel: string;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div
			aria-modal="true"
			role="dialog"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				zIndex: 60,
			}}
		>
			<div
				className="card card-pad"
				style={{
					width: "100%",
					maxWidth: 420,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
				<p style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}>
					{helper}
				</p>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={isPending}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={isPending}
						onClick={onConfirm}
						type="button"
					>
						{isPending ? "Working…" : confirmLabel}
					</button>
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
