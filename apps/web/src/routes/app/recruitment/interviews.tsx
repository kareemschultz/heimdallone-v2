import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useContext, useMemo, useState } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { InterviewActions } from "@/features/recruitment/interview-actions";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment, canViewRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/interviews")({
	component: InterviewsPage,
});

type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no_show";

const STATUS_FILTERS: { key: InterviewStatus | "all"; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "scheduled", label: "Scheduled" },
	{ key: "completed", label: "Completed" },
	{ key: "cancelled", label: "Cancelled" },
	{ key: "no_show", label: "No-show" },
];

const STATUS_LABEL: Record<InterviewStatus, string> = {
	scheduled: "Scheduled",
	completed: "Completed",
	cancelled: "Cancelled",
	no_show: "No-show",
};

const STATUS_TONE: Record<InterviewStatus, string> = {
	scheduled: "badge badge-info",
	completed: "badge badge-success",
	cancelled: "badge",
	no_show: "badge badge-warning",
};

const PAGE_SIZE = 50;
const JOIN_PAGE_SIZE = 100;

function formatWhen(value: Date): string {
	return value.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function InterviewsPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const canView = canViewRecruitment(org.memberRole);
	const [filter, setFilter] = useState<InterviewStatus | "all">("all");

	const interviews = useQuery(
		orpc.recruitment.interviews.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page: 1,
				pageSize: PAGE_SIZE,
			},
		})
	);

	// interviews.list returns raw rows; join candidate + opening client-side.
	// TODO(9I): denormalize candidate name + opening title into interviews.list.
	const applications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	const candidates = useQuery(
		orpc.recruitment.candidates.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	const jobs = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	// Resolve interviewer employee IDs → names for the feedback dialogs.
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	const employeesById = useMemo(() => {
		const map = new Map<string, string>();
		for (const e of employees.data?.data ?? []) {
			map.set(e.id, [e.firstName, e.lastName].filter(Boolean).join(" "));
		}
		return map;
	}, [employees.data]);

	const applicationsById = useMemo(() => {
		const map = new Map<
			string,
			{ candidateId: string; jobOpeningId: string }
		>();
		for (const a of applications.data?.data ?? []) {
			map.set(a.id, {
				candidateId: a.candidateId,
				jobOpeningId: a.jobOpeningId,
			});
		}
		return map;
	}, [applications.data]);

	const candidateNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of candidates.data?.data ?? []) {
			map.set(c.id, [c.firstName, c.lastName].filter(Boolean).join(" "));
		}
		return map;
	}, [candidates.data]);

	const jobTitleById = useMemo(() => {
		const map = new Map<string, string>();
		for (const j of jobs.data?.data ?? []) {
			map.set(j.id, j.title);
		}
		return map;
	}, [jobs.data]);

	const rows = useMemo(
		() =>
			(interviews.data?.data ?? []).map((iv) => {
				const app = applicationsById.get(iv.applicationId);
				const candidateName = app
					? (candidateNameById.get(app.candidateId) ?? "Candidate")
					: "Candidate";
				const openingTitle = app
					? (jobTitleById.get(app.jobOpeningId) ?? "—")
					: "—";
				const interviewerEmployeeIds = Array.isArray(iv.interviewerEmployeeIds)
					? (iv.interviewerEmployeeIds as string[])
					: [];
				return {
					id: iv.id,
					when: new Date(iv.scheduledStart),
					candidateName,
					openingTitle,
					interviewType: iv.interviewType,
					interviewerEmployeeIds,
					interviewerCount: interviewerEmployeeIds.length,
					status: iv.status as InterviewStatus,
				};
			}),
		[interviews.data, applicationsById, candidateNameById, jobTitleById]
	);

	const isLoading = interviews.isLoading;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Interviews</span>
					</div>
					<h1 className="page-title">Interviews</h1>
					<p className="page-sub">
						Scheduled and past interviews. Calendar view is coming later.
					</p>
				</div>
			</div>

			<RecruitmentTabs />

			<div
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

			{isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading interviews…
				</div>
			)}

			{!isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description={
							filter === "all"
								? "Once interviews are scheduled from the pipeline, they'll appear here."
								: "No interviews match this filter."
						}
						icon={<CalendarClock size={20} />}
						title={
							filter === "all" ? "No interviews yet" : "No matching interviews"
						}
					/>
				</div>
			)}

			{!isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>When</th>
								<th>Candidate</th>
								<th>Opening</th>
								<th>Type</th>
								<th>Interviewers</th>
								<th>Status</th>
								{canView && <th style={{ textAlign: "right" }}>Actions</th>}
							</tr>
						</thead>
						<tbody>
							{rows.map((iv) => (
								<tr key={iv.id}>
									<td style={{ whiteSpace: "nowrap", color: "var(--fg)" }}>
										{formatWhen(iv.when)}
									</td>
									<td style={{ fontWeight: 600, color: "var(--fg)" }}>
										{iv.candidateName}
									</td>
									<td style={{ color: "var(--fg-2)" }}>{iv.openingTitle}</td>
									<td style={{ color: "var(--fg-2)" }}>
										{iv.interviewType || "—"}
									</td>
									<td style={{ color: "var(--fg-3)" }}>
										{iv.interviewerCount}
									</td>
									<td>
										<span className={STATUS_TONE[iv.status]}>
											{STATUS_LABEL[iv.status] ?? iv.status}
										</span>
									</td>
									{canView && (
										<td style={{ textAlign: "right" }}>
											<InterviewActions
												canManage={canManage}
												canView={canView}
												employeesById={employeesById}
												interview={{
													id: iv.id,
													status: iv.status,
													interviewerEmployeeIds: iv.interviewerEmployeeIds,
													scheduledStart: iv.when,
												}}
											/>
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
