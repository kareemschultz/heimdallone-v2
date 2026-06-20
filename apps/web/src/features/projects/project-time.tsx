import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	fmtMinutes,
	timeStatusLabel,
	timeStatusTone,
} from "@/features/projects/labels";
import type { ProjectTimeEntryRow } from "@/features/projects/types";
import { client, orpc } from "@/utils/orpc";

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

function RejectDialog({
	onClose,
	onConfirm,
	pending,
}: {
	onClose: () => void;
	onConfirm: (reason: string) => void;
	pending: boolean;
}) {
	const [reason, setReason] = useState("");
	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!reason.trim() || pending}
						onClick={() => onConfirm(reason.trim())}
						type="button"
					>
						Reject
					</button>
				</>
			}
			icon={<XCircle size={18} />}
			intro="The member will see your reason and can resubmit after making corrections."
			onClose={onClose}
			title="Reject time entry"
		>
			<label className="pj-field" htmlFor="pj-reject-reason">
				<span>Reason</span>
				<textarea
					id="pj-reject-reason"
					onChange={(e) => setReason(e.target.value)}
					placeholder="Tell them what to fix before resubmitting…"
					rows={3}
					value={reason}
				/>
			</label>
		</Modal>
	);
}

export function ProjectTime({
	projectId,
	canApprove,
}: {
	canApprove: boolean;
	projectId: string;
}) {
	const qc = useQueryClient();
	const [rejectId, setRejectId] = useState<string | null>(null);
	const entries = useQuery(
		orpc.projects.timeEntries.list.queryOptions({ input: { projectId } })
	);
	const rows = (entries.data as ProjectTimeEntryRow[] | undefined) ?? [];

	const approve = useMutation({
		mutationFn: (id: string) => client.projects.timeEntries.approve({ id }),
		onSuccess: () => {
			toast.success("Time approved");
			invalidateProjects(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not approve the entry"),
	});
	const reject = useMutation({
		mutationFn: (vars: { id: string; reason: string }) =>
			client.projects.timeEntries.reject(vars),
		onSuccess: () => {
			toast.success("Time rejected");
			setRejectId(null);
			invalidateProjects(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not reject the entry"),
	});

	const totalApproved = rows
		.filter((e) => e.status === "approved")
		.reduce((sum, e) => sum + e.minutes, 0);

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<span className="pj-section-title">Time entries</span>
				<span className="pj-sub">{fmtMinutes(totalApproved)} approved</span>
			</div>

			{entries.isLoading ? <div className="pj-skeleton" /> : null}
			{entries.isError ? (
				<EmptyState
					compact
					description="Could not load time entries. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(entries.isLoading || entries.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No time has been logged against this project yet."
					title="No time entries"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Member</th>
							<th>Task</th>
							<th>Time</th>
							<th>Status</th>
							{canApprove ? <th aria-label="Actions" /> : null}
						</tr>
					</thead>
					<tbody>
						{rows.map((e) => (
							<tr key={e.id}>
								<td>{fmtDate(e.entryDate)}</td>
								<td>{e.employeeName ?? "—"}</td>
								<td>{e.taskTitle ?? "—"}</td>
								<td>{fmtMinutes(e.minutes)}</td>
								<td>
									<Badge tone={timeStatusTone(e.status)}>
										{timeStatusLabel(e.status)}
									</Badge>
								</td>
								{canApprove ? (
									<td>
										{e.status === "submitted" ? (
											<div className="pj-actions">
												<button
													className="btn btn-sm btn-primary"
													disabled={approve.isPending}
													onClick={() => approve.mutate(e.id)}
													type="button"
												>
													Approve
												</button>
												<button
													className="btn btn-sm"
													onClick={() => setRejectId(e.id)}
													type="button"
												>
													Reject
												</button>
											</div>
										) : (
											"—"
										)}
									</td>
								) : null}
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{rejectId ? (
				<RejectDialog
					onClose={() => setRejectId(null)}
					onConfirm={(reason) => reject.mutate({ id: rejectId, reason })}
					pending={reject.isPending}
				/>
			) : null}
		</div>
	);
}
