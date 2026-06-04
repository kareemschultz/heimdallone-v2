import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/projects.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	fmtMinutes,
	timeStatusLabel,
	timeStatusTone,
} from "@/features/projects/labels";
import { ProjectsTabs } from "@/features/projects/projects-tabs";
import type {
	ProjectRow,
	ProjectTimeEntryRow,
} from "@/features/projects/types";
import { canTrackProjectTime } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/projects/my-time")({
	component: MyTimePage,
});

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

function LogTimeDialog({
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
}) {
	const [projectId, setProjectId] = useState("");
	const [entryDate, setEntryDate] = useState(todayStr());
	const [hours, setHours] = useState("1");
	const [minutes, setMinutes] = useState("0");
	const [description, setDescription] = useState("");

	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const projectOptions = (projects.data as ProjectRow[] | undefined) ?? [];

	const create = useMutation({
		mutationFn: () => {
			const total = Number(hours) * 60 + Number(minutes);
			return client.projects.timeEntries.create({
				projectId,
				entryDate,
				minutes: total,
				description: description.trim() || undefined,
			});
		},
		onSuccess: () => {
			toast.success("Time logged");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not log time"),
	});

	const totalMinutes = Number(hours) * 60 + Number(minutes);

	return (
		<div className="pj-sheet-overlay">
			<div
				aria-labelledby="pj-log-time-title"
				aria-modal="true"
				className="pj-sheet"
				role="dialog"
			>
				<div className="pj-sheet-head">
					<h2 id="pj-log-time-title">Log time</h2>
					<button
						aria-label="Close"
						className="btn-icon"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="pj-sheet-body">
					<label className="pj-field" htmlFor="pj-time-project">
						<span>Project</span>
						<select
							id="pj-time-project"
							onChange={(e) => setProjectId(e.target.value)}
							value={projectId}
						>
							<option value="">Choose a project…</option>
							{projectOptions.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</label>
					<label className="pj-field" htmlFor="pj-time-date">
						<span>Date</span>
						<input
							id="pj-time-date"
							onChange={(e) => setEntryDate(e.target.value)}
							type="date"
							value={entryDate}
						/>
					</label>
					<div className="pj-field-row">
						<label className="pj-field" htmlFor="pj-time-hours">
							<span>Hours</span>
							<input
								id="pj-time-hours"
								min="0"
								onChange={(e) => setHours(e.target.value)}
								type="number"
								value={hours}
							/>
						</label>
						<label className="pj-field" htmlFor="pj-time-minutes">
							<span>Minutes</span>
							<input
								id="pj-time-minutes"
								max="59"
								min="0"
								onChange={(e) => setMinutes(e.target.value)}
								type="number"
								value={minutes}
							/>
						</label>
					</div>
					<label className="pj-field" htmlFor="pj-time-desc">
						<span>What did you work on? (optional)</span>
						<textarea
							id="pj-time-desc"
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							value={description}
						/>
					</label>
				</div>
				<div className="pj-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!projectId || totalMinutes < 1 || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Log time
					</button>
				</div>
			</div>
		</div>
	);
}

function MyTimePage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const hasAccess = canTrackProjectTime(role);
	const qc = useQueryClient();
	const [showLog, setShowLog] = useState(false);

	const entries = useQuery(
		orpc.projects.timeEntries.list.queryOptions({
			input: { mine: true, limit: 200 },
			enabled: hasAccess,
		})
	);

	const submit = useMutation({
		mutationFn: (id: string) => client.projects.timeEntries.submit({ id }),
		onSuccess: () => {
			toast.success("Submitted for approval");
			invalidateProjects(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not submit the entry"),
	});

	if (!hasAccess) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">My time</h1>
					</div>
				</div>
				<EmptyState
					description="Time tracking is for project team members."
					icon={<Clock size={28} />}
					title="You don't have any project time"
				/>
			</div>
		);
	}

	const rows = (entries.data as ProjectTimeEntryRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Projects</span>
					</div>
					<h1 className="page-title">My time</h1>
					<p className="page-sub">Log the time you spend on project work.</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setShowLog(true)}
					type="button"
				>
					Log time
				</button>
			</div>

			<ProjectsTabs />

			{entries.isLoading ? <div className="pj-skeleton" /> : null}
			{entries.isError ? (
				<EmptyState
					compact
					description="Could not load your time entries. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(entries.isLoading || entries.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="You haven't logged any project time yet."
					title="No time entries"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Project</th>
							<th>Task</th>
							<th>Time</th>
							<th>Status</th>
							<th aria-label="Actions" />
						</tr>
					</thead>
					<tbody>
						{rows.map((e) => (
							<tr key={e.id}>
								<td>{fmtDate(e.entryDate)}</td>
								<td>{e.projectName ?? "—"}</td>
								<td>{e.taskTitle ?? "—"}</td>
								<td>{fmtMinutes(e.minutes)}</td>
								<td>
									<Badge tone={timeStatusTone(e.status)}>
										{timeStatusLabel(e.status)}
									</Badge>
									{e.status === "rejected" && e.rejectionReason ? (
										<div className="pj-sub">{e.rejectionReason}</div>
									) : null}
								</td>
								<td>
									{e.status === "draft" ? (
										<button
											className="btn btn-sm"
											disabled={submit.isPending}
											onClick={() => submit.mutate(e.id)}
											type="button"
										>
											Submit
										</button>
									) : (
										"—"
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{showLog ? (
				<LogTimeDialog
					onClose={() => setShowLog(false)}
					onDone={() => {
						setShowLog(false);
						invalidateProjects(qc);
					}}
				/>
			) : null}
		</div>
	);
}
