import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	priorityLabel,
	priorityTone,
	taskStatusLabel,
	taskStatusTone,
} from "@/features/projects/labels";
import type {
	ProjectTaskComment,
	ProjectTaskDetail,
} from "@/features/projects/types";
import {
	canAssignProjectTasks,
	canManageProjects,
	canTrackProjectTime,
	canViewProjectInternalNotes,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

const STATUS_OPTIONS = [
	{ value: "todo", label: "To do" },
	{ value: "in_progress", label: "In progress" },
	{ value: "blocked", label: "Blocked" },
	{ value: "in_review", label: "In review" },
	{ value: "done", label: "Done" },
	{ value: "cancelled", label: "Cancelled" },
];

function CommentBox({
	id,
	label,
	placeholder,
	internal,
	pending,
	onSubmit,
}: {
	id: string;
	internal?: boolean;
	label: string;
	onSubmit: (body: string) => void;
	pending: boolean;
	placeholder: string;
}) {
	const [body, setBody] = useState("");
	const trimmed = body.trim();
	const submit = () => {
		if (!trimmed || pending) {
			return;
		}
		onSubmit(trimmed);
		setBody("");
	};
	return (
		<div className={`pj-comment-form ${internal ? "internal" : ""}`}>
			<label className="pj-form-hint" htmlFor={id}>
				{label}
			</label>
			<textarea
				id={id}
				onChange={(e) => setBody(e.target.value)}
				placeholder={placeholder}
				rows={2}
				value={body}
			/>
			<div className="pj-comment-form-foot">
				<button
					className="btn btn-primary btn-sm"
					disabled={!trimmed || pending}
					onClick={submit}
					type="button"
				>
					{internal ? "Add internal note" : "Comment"}
				</button>
			</div>
		</div>
	);
}

function CommentThread({
	title,
	comments,
	emptyText,
	internal,
	form,
}: {
	comments: ProjectTaskComment[];
	emptyText: string;
	form: React.ReactNode;
	internal?: boolean;
	title: string;
}) {
	return (
		<div className="pj-comments">
			<div className="pj-section-title">{title}</div>
			{comments.length === 0 ? (
				<p className="pj-form-hint">{emptyText}</p>
			) : (
				comments.map((c) => (
					<div
						className={`pj-comment ${internal ? "internal" : ""}`}
						key={c.id}
					>
						<div className="pj-comment-head">
							<span className="pj-comment-author">
								{c.authorName ?? "Someone"}
							</span>
							<span className="pj-comment-meta">{fmtDate(c.createdAt)}</span>
						</div>
						<div className="pj-comment-body">{c.body}</div>
					</div>
				))
			)}
			{form}
		</div>
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a detail sheet that composes many independently role-gated sections (summary, linked context, status/assign actions, public + internal comment threads); the branches are flat and independent, not tangled control flow
export function TaskDetailSheet({
	taskId,
	onClose,
}: {
	onClose: () => void;
	taskId: string;
}) {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const qc = useQueryClient();

	const detail = useQuery(
		orpc.projects.tasks.getById.queryOptions({
			input: { id: taskId },
			retry: false,
		})
	);
	const comments = useQuery(
		orpc.projects.tasks.comments.list.queryOptions({ input: { taskId } })
	);

	const t = detail.data as ProjectTaskDetail | undefined;
	const rows = (comments.data as ProjectTaskComment[] | undefined) ?? [];

	const canComment = canTrackProjectTime(role);
	const canAddInternal = canManageProjects(role);
	const canSeeInternal = canViewProjectInternalNotes(role);
	const canAssign = canAssignProjectTasks(role);
	// task:change_status holders (managing / manager / employee). The server
	// enforces that an employee may only change a task assigned to them.
	const canChangeStatus = canTrackProjectTime(role);

	const done = (msg: string) => {
		toast.success(msg);
		invalidateProjects(qc);
	};
	const fail = (e: { message?: string }) =>
		toast.error(e?.message ?? "Could not update the task");

	const changeStatus = useMutation({
		mutationFn: (status: string) =>
			client.projects.tasks.changeStatus({
				id: taskId,
				status: status as
					| "todo"
					| "in_progress"
					| "blocked"
					| "in_review"
					| "done"
					| "cancelled",
			}),
		onSuccess: () => done("Status updated"),
		onError: fail,
	});
	const unassign = useMutation({
		mutationFn: () => client.projects.tasks.unassign({ id: taskId }),
		onSuccess: () => done("Task unassigned"),
		onError: fail,
	});
	const addPublic = useMutation({
		mutationFn: (body: string) =>
			client.projects.tasks.comments.create({ taskId, body }),
		onSuccess: () => done("Comment added"),
		onError: fail,
	});
	const addInternal = useMutation({
		mutationFn: (body: string) =>
			client.projects.tasks.comments.createInternal({ taskId, body }),
		onSuccess: () => done("Internal note added"),
		onError: fail,
	});

	const publicComments = rows.filter((c) => !c.isInternal);
	const internalComments = rows.filter((c) => c.isInternal);

	return (
		<div className="pj-sheet-overlay">
			<div
				aria-labelledby="pj-task-sheet-title"
				aria-modal="true"
				className="pj-sheet pj-sheet-wide"
				role="dialog"
			>
				<div className="pj-sheet-head">
					<h2 id="pj-task-sheet-title">{t ? t.title : "Task"}</h2>
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
					{detail.isLoading || !t ? <div className="pj-skeleton" /> : null}
					{detail.isError ? (
						<p className="pj-desc">This task is not available to you.</p>
					) : null}

					{t ? (
						<>
							<div className="pj-detail-badges">
								<span className="pj-mono">{t.reference}</span>
								<Badge tone={taskStatusTone(t.status)}>
									{taskStatusLabel(t.status)}
								</Badge>
								<Badge tone={priorityTone(t.priority)}>
									{priorityLabel(t.priority)}
								</Badge>
							</div>

							<div className="pj-sum-grid">
								<div>
									<span className="pj-k">Assignee</span>
									<span>{t.assigneeName ?? "Unassigned"}</span>
								</div>
								<div>
									<span className="pj-k">Due</span>
									<span>{fmtDate(t.dueDate)}</span>
								</div>
							</div>

							{t.description ? (
								<p className="pj-desc">{t.description}</p>
							) : null}

							{t.linked.length > 0 ? (
								<div className="pj-linked-panel">
									<div className="pj-linked-note">
										Linked records (context only — managed in their own module).
									</div>
									{t.linked.map((l) => (
										<div className="pj-linked-item" key={`${l.kind}-${l.id}`}>
											<span className="pj-linked-kind">{l.kind}</span>
											<span className="pj-mono">{l.label ?? l.id}</span>
										</div>
									))}
								</div>
							) : null}

							{canChangeStatus || canAssign ? (
								<div className="pj-actions">
									{canChangeStatus ? (
										<label className="pj-field" htmlFor="pj-task-status">
											<span>Change status</span>
											<select
												id="pj-task-status"
												onChange={(e) => changeStatus.mutate(e.target.value)}
												value={t.status}
											>
												{STATUS_OPTIONS.map((o) => (
													<option key={o.value} value={o.value}>
														{o.label}
													</option>
												))}
											</select>
										</label>
									) : null}
									{canAssign && t.assigneeEmployeeId ? (
										<button
											className="btn btn-sm"
											disabled={unassign.isPending}
											onClick={() => unassign.mutate()}
											type="button"
										>
											Unassign
										</button>
									) : null}
								</div>
							) : null}

							<CommentThread
								comments={publicComments}
								emptyText="No comments yet."
								form={
									canComment ? (
										<CommentBox
											id="pj-public-comment"
											label="Add a comment"
											onSubmit={(b) => addPublic.mutate(b)}
											pending={addPublic.isPending}
											placeholder="Share an update…"
										/>
									) : null
								}
								title="Comments"
							/>

							{canSeeInternal ? (
								<CommentThread
									comments={internalComments}
									emptyText="No internal notes."
									form={
										canAddInternal ? (
											<CommentBox
												id="pj-internal-comment"
												internal
												label="Add an internal note (not shown to the assignee)"
												onSubmit={(b) => addInternal.mutate(b)}
												pending={addInternal.isPending}
												placeholder="Private note for the project team…"
											/>
										) : null
									}
									internal
									title="Internal notes"
								/>
							) : null}
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}
