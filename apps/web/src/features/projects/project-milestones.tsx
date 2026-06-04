import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	milestoneStatusLabel,
	milestoneStatusTone,
} from "@/features/projects/labels";
import type { ProjectMilestoneRow } from "@/features/projects/types";
import { client, orpc } from "@/utils/orpc";

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

function AddMilestoneDialog({
	projectId,
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
	projectId: string;
}) {
	const [name, setName] = useState("");
	const [dueDate, setDueDate] = useState("");

	const add = useMutation({
		mutationFn: () =>
			client.projects.milestones.create({
				projectId,
				name: name.trim(),
				dueDate: dueDate || undefined,
			}),
		onSuccess: () => {
			toast.success("Milestone added");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not add the milestone"),
	});

	return (
		<div className="pj-sheet-overlay">
			<div
				aria-labelledby="pj-add-milestone-title"
				aria-modal="true"
				className="pj-sheet"
				role="dialog"
			>
				<div className="pj-sheet-head">
					<h2 id="pj-add-milestone-title">Add a milestone</h2>
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
					<label className="pj-field" htmlFor="pj-milestone-name">
						<span>Name</span>
						<input
							id="pj-milestone-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Site survey complete"
							value={name}
						/>
					</label>
					<label className="pj-field" htmlFor="pj-milestone-due">
						<span>Due date (optional)</span>
						<input
							id="pj-milestone-due"
							onChange={(e) => setDueDate(e.target.value)}
							type="date"
							value={dueDate}
						/>
					</label>
				</div>
				<div className="pj-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!name.trim() || add.isPending}
						onClick={() => add.mutate()}
						type="button"
					>
						Add milestone
					</button>
				</div>
			</div>
		</div>
	);
}

const TERMINAL_MILESTONE = new Set(["completed", "cancelled"]);

export function ProjectMilestones({
	projectId,
	canEdit,
}: {
	canEdit: boolean;
	projectId: string;
}) {
	const qc = useQueryClient();
	const [showAdd, setShowAdd] = useState(false);
	const milestones = useQuery(
		orpc.projects.milestones.list.queryOptions({ input: { projectId } })
	);
	const rows = (milestones.data as ProjectMilestoneRow[] | undefined) ?? [];

	const complete = useMutation({
		mutationFn: (id: string) => client.projects.milestones.complete({ id }),
		onSuccess: () => {
			toast.success("Milestone completed");
			invalidateProjects(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not update the milestone"),
	});

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<span className="pj-section-title">Milestones</span>
				{canEdit ? (
					<button
						className="btn btn-sm btn-primary"
						onClick={() => setShowAdd(true)}
						type="button"
					>
						Add milestone
					</button>
				) : null}
			</div>

			{milestones.isLoading ? <div className="pj-skeleton" /> : null}
			{!milestones.isLoading && rows.length === 0 ? (
				<EmptyState
					compact
					description="No milestones have been laid out for this project yet."
					title="No milestones"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Milestone</th>
							<th>Status</th>
							<th>Due</th>
							{canEdit ? <th aria-label="Actions" /> : null}
						</tr>
					</thead>
					<tbody>
						{rows.map((m) => (
							<tr key={m.id}>
								<td>
									<span className="pj-name">{m.name}</span>
									{m.description ? (
										<div className="pj-sub">{m.description}</div>
									) : null}
								</td>
								<td>
									<Badge tone={milestoneStatusTone(m.status)}>
										{milestoneStatusLabel(m.status)}
									</Badge>
								</td>
								<td>{fmtDate(m.dueDate)}</td>
								{canEdit ? (
									<td>
										{TERMINAL_MILESTONE.has(m.status) ? (
											"—"
										) : (
											<button
												className="btn btn-sm"
												disabled={complete.isPending}
												onClick={() => complete.mutate(m.id)}
												type="button"
											>
												Mark complete
											</button>
										)}
									</td>
								) : null}
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{showAdd ? (
				<AddMilestoneDialog
					onClose={() => setShowAdd(false)}
					onDone={() => {
						setShowAdd(false);
						invalidateProjects(qc);
					}}
					projectId={projectId}
				/>
			) : null}
		</div>
	);
}
