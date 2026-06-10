import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
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

interface InterviewRow {
	candidateName: string;
	id: string;
	interviewerCount: number;
	interviewerEmployeeIds: string[];
	interviewType: string;
	openingTitle: string;
	status: InterviewStatus;
	when: Date;
}

const interviewBaseColumns: ColumnDef<InterviewRow, unknown>[] = [
	{
		accessorKey: "when",
		header: "When",
		cell: ({ row }) => (
			<span style={{ whiteSpace: "nowrap", color: "var(--fg)" }}>
				{formatWhen(row.original.when)}
			</span>
		),
	},
	{
		accessorKey: "candidateName",
		header: "Candidate",
		cell: ({ row }) => (
			<span style={{ fontWeight: 600, color: "var(--fg)" }}>
				{row.original.candidateName}
			</span>
		),
	},
	{
		accessorKey: "openingTitle",
		header: "Opening",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>{row.original.openingTitle}</span>
		),
	},
	{
		accessorKey: "interviewType",
		header: "Type",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{row.original.interviewType || "—"}
			</span>
		),
	},
	{
		accessorKey: "interviewerCount",
		header: "Interviewers",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{row.original.interviewerCount}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className={STATUS_TONE[row.original.status]}>
				{STATUS_LABEL[row.original.status] ?? row.original.status}
			</span>
		),
	},
];

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

	const columns = useMemo<ColumnDef<InterviewRow, unknown>[]>(() => {
		if (!canView) {
			return interviewBaseColumns;
		}
		return [
			...interviewBaseColumns,
			{
				accessorKey: "id",
				header: "Actions",
				id: "actions",
				cell: ({ row }) => (
					<div style={{ textAlign: "right" }}>
						<InterviewActions
							canManage={canManage}
							canView={canView}
							employeesById={employeesById}
							interview={{
								id: row.original.id,
								status: row.original.status,
								interviewerEmployeeIds: row.original.interviewerEmployeeIds,
								scheduledStart: row.original.when,
							}}
						/>
					</div>
				),
			},
		];
	}, [canView, canManage, employeesById]);

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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={columns}
					data={rows as InterviewRow[]}
					emptyState={
						<EmptyState
							description={
								filter === "all"
									? "Once interviews are scheduled from the pipeline, they'll appear here."
									: "No interviews match this filter."
							}
							icon={<CalendarClock size={20} />}
							title={
								filter === "all"
									? "No interviews yet"
									: "No matching interviews"
							}
						/>
					}
					isError={interviews.isError}
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
}
