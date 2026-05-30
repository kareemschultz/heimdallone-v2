import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import {
	categoryLabel,
	isTaskResolved,
	TASK_STATUS_LABEL,
	TASK_STATUS_TONE,
} from "@/features/onboarding/labels";
import { client, orpc } from "@/utils/orpc";

export interface ChecklistTask {
	assigneeEmployeeId: string | null;
	category: string;
	descriptionSnapshot: string | null;
	dueAt: string | Date | null;
	id: string;
	// Only template tasks carry this today; instance snapshots don't store it,
	// so the badge renders only when a caller actually supplies the field.
	isRequired?: boolean;
	status: string;
	titleSnapshot: string;
}

interface TaskChecklistProps {
	canComplete: boolean;
	canManage: boolean;
	compact?: boolean;
	employeeName: Map<string, string>;
	emptyDescription?: string;
	emptyTitle?: string;
	isLoading: boolean;
	readonly?: boolean;
	tasks: ChecklistTask[];
}

function isOverdue(task: ChecklistTask): boolean {
	return (
		!isTaskResolved(task.status) &&
		task.dueAt !== null &&
		new Date(task.dueAt).getTime() < Date.now()
	);
}

function fmtDue(value: string | Date | null): string {
	if (!value) {
		return "No due date";
	}
	return new Date(value).toLocaleDateString();
}

function onboardingPredicate(queryKey: unknown): boolean {
	const path = Array.isArray(queryKey) ? queryKey[0] : null;
	return Array.isArray(path) && path[0] === "onboarding";
}

export function TaskChecklist({
	tasks,
	isLoading,
	employeeName,
	canComplete,
	canManage,
	compact = false,
	readonly = false,
	emptyTitle = "No tasks",
	emptyDescription = "There are no onboarding tasks yet.",
}: TaskChecklistProps) {
	const queryClient = useQueryClient();
	const [skipTarget, setSkipTarget] = useState<ChecklistTask | null>(null);
	const [reassignTarget, setReassignTarget] = useState<ChecklistTask | null>(
		null
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => onboardingPredicate(q.queryKey),
		});

	const completeMut = useMutation({
		mutationFn: (id: string) => client.onboarding.tasks.complete({ id }),
		onSuccess: async () => {
			await invalidate();
			toast.success("Task completed.");
		},
		onError: (err: Error) =>
			toast.error(`Could not complete task: ${err.message}`),
	});

	const skipMut = useMutation({
		mutationFn: (vars: { id: string; note: string }) =>
			client.onboarding.tasks.skip(vars),
		onSuccess: async () => {
			setSkipTarget(null);
			await invalidate();
			toast.success("Task skipped.");
		},
		onError: (err: Error) => toast.error(`Could not skip task: ${err.message}`),
	});

	const reassignMut = useMutation({
		mutationFn: (vars: { assigneeEmployeeId: string; id: string }) =>
			client.onboarding.tasks.reassign(vars),
		onSuccess: async () => {
			setReassignTarget(null);
			await invalidate();
			toast.success("Task reassigned.");
		},
		onError: (err: Error) =>
			toast.error(`Could not reassign task: ${err.message}`),
	});

	if (isLoading) {
		return (
			<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading tasks…</div>
		);
	}
	if (tasks.length === 0) {
		return (
			<EmptyState
				description={emptyDescription}
				icon={<ClipboardList size={20} />}
				title={emptyTitle}
			/>
		);
	}

	const showComplete = !readonly && canComplete;
	const showManageActions = !readonly && canManage;
	const showActions = showComplete || showManageActions;

	return (
		<>
			<table className="tbl">
				<thead>
					<tr>
						<th>Task</th>
						<th>Category</th>
						{!compact && <th>Assignee</th>}
						<th>Due</th>
						<th>Status</th>
						{showActions && <th aria-label="Actions" />}
					</tr>
				</thead>
				<tbody>
					{tasks.map((task) => (
						<ChecklistRow
							compact={compact}
							completing={
								completeMut.isPending && completeMut.variables === task.id
							}
							employeeName={employeeName}
							key={task.id}
							onComplete={(id) => completeMut.mutate(id)}
							onReassign={setReassignTarget}
							onSkip={setSkipTarget}
							showActions={showActions}
							showComplete={showComplete}
							showManageActions={showManageActions}
							task={task}
						/>
					))}
				</tbody>
			</table>

			{skipTarget && (
				<SkipDialog
					isPending={skipMut.isPending}
					onClose={() => setSkipTarget(null)}
					onConfirm={(note) => skipMut.mutate({ id: skipTarget.id, note })}
					taskTitle={skipTarget.titleSnapshot}
				/>
			)}

			{reassignTarget && (
				<ReassignDialog
					currentAssigneeId={reassignTarget.assigneeEmployeeId}
					isPending={reassignMut.isPending}
					onClose={() => setReassignTarget(null)}
					onSubmit={(assigneeEmployeeId) =>
						reassignMut.mutate({ id: reassignTarget.id, assigneeEmployeeId })
					}
					taskTitle={reassignTarget.titleSnapshot}
				/>
			)}
		</>
	);
}

interface ChecklistRowProps {
	compact: boolean;
	completing: boolean;
	employeeName: Map<string, string>;
	onComplete: (id: string) => void;
	onReassign: (task: ChecklistTask) => void;
	onSkip: (task: ChecklistTask) => void;
	showActions: boolean;
	showComplete: boolean;
	showManageActions: boolean;
	task: ChecklistTask;
}

function ChecklistRow({
	task,
	employeeName,
	compact,
	completing,
	showActions,
	showComplete,
	showManageActions,
	onComplete,
	onSkip,
	onReassign,
}: ChecklistRowProps) {
	const resolved = isTaskResolved(task.status);
	const overdue = isOverdue(task);
	const assignee = task.assigneeEmployeeId
		? (employeeName.get(task.assigneeEmployeeId) ?? "Assigned")
		: "Unassigned";

	return (
		<tr style={resolved ? { opacity: 0.72 } : undefined}>
			<td>
				<div style={{ fontWeight: 600, color: "var(--fg)" }}>
					{task.titleSnapshot}
					{typeof task.isRequired === "boolean" && (
						<span className="badge" style={{ marginLeft: 6 }}>
							{task.isRequired ? "Required" : "Optional"}
						</span>
					)}
				</div>
				{task.descriptionSnapshot && (
					<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
						{task.descriptionSnapshot}
					</div>
				)}
			</td>
			<td>
				<span className="badge">{categoryLabel(task.category)}</span>
			</td>
			{!compact && <td style={{ color: "var(--fg-2)" }}>{assignee}</td>}
			<td style={{ color: overdue ? "var(--danger, #c0392b)" : "var(--fg-3)" }}>
				{fmtDue(task.dueAt)}
				{overdue ? " · overdue" : ""}
			</td>
			<td>
				<span className={TASK_STATUS_TONE[task.status] ?? "badge"}>
					{TASK_STATUS_LABEL[task.status] ?? task.status}
				</span>
			</td>
			{showActions && (
				<td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
					{!resolved && showComplete && (
						<button
							className="btn btn-primary btn-sm"
							disabled={completing}
							onClick={() => onComplete(task.id)}
							style={{ marginLeft: 6 }}
							type="button"
						>
							{completing ? "…" : "Complete"}
						</button>
					)}
					{!resolved && showManageActions && (
						<button
							className="btn btn-sm"
							onClick={() => onSkip(task)}
							style={{ marginLeft: 6 }}
							type="button"
						>
							Skip
						</button>
					)}
					{showManageActions && (
						<button
							className="btn btn-sm"
							onClick={() => onReassign(task)}
							style={{ marginLeft: 6 }}
							type="button"
						>
							Reassign
						</button>
					)}
				</td>
			)}
		</tr>
	);
}

function DialogShell({
	titleId,
	descId,
	children,
}: {
	titleId: string;
	descId: string;
	children: React.ReactNode;
}) {
	return (
		<div
			aria-describedby={descId}
			aria-labelledby={titleId}
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
					maxWidth: 440,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				{children}
			</div>
		</div>
	);
}

function SkipDialog({
	taskTitle,
	isPending,
	onClose,
	onConfirm,
}: {
	isPending: boolean;
	onClose: () => void;
	onConfirm: (note: string) => void;
	taskTitle: string;
}) {
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();

	return (
		<DialogShell descId="skip-task-desc" titleId="skip-task-title">
			<h2 id="skip-task-title" style={{ fontSize: 15, fontWeight: 600 }}>
				Skip this task?
			</h2>
			<p
				id="skip-task-desc"
				style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
			>
				Skipped tasks stay in the history, but they no longer block onboarding.
			</p>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="skip-reason"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Reason for skipping “{taskTitle}”
				</label>
				<textarea
					className="input"
					id="skip-reason"
					onChange={(e) => setReason(e.target.value)}
					placeholder="e.g. Not applicable to this role"
					rows={3}
					style={{ width: "100%", resize: "vertical" }}
					value={reason}
				/>
			</div>
			<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
				<button
					className="btn btn-sm"
					disabled={isPending}
					onClick={onClose}
					type="button"
				>
					Back
				</button>
				<button
					className="btn btn-primary btn-sm"
					disabled={isPending || trimmed === ""}
					onClick={() => onConfirm(trimmed)}
					type="button"
				>
					{isPending ? "Skipping…" : "Skip task"}
				</button>
			</div>
		</DialogShell>
	);
}

function ReassignDialog({
	taskTitle,
	currentAssigneeId,
	isPending,
	onClose,
	onSubmit,
}: {
	currentAssigneeId: string | null;
	isPending: boolean;
	onClose: () => void;
	onSubmit: (assigneeEmployeeId: string) => void;
	taskTitle: string;
}) {
	const [selected, setSelected] = useState<string>(currentAssigneeId ?? "");
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const employeeRows = (employees.data?.data ?? []) as {
		firstName: string;
		id: string;
		lastName: string | null;
	}[];

	return (
		<DialogShell descId="reassign-desc" titleId="reassign-title">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<h2 id="reassign-title" style={{ fontSize: 15, fontWeight: 600 }}>
					Reassign task
				</h2>
				<button
					aria-label="Close"
					className="btn btn-sm"
					onClick={onClose}
					type="button"
				>
					<X size={14} />
				</button>
			</div>
			<p
				id="reassign-desc"
				style={{ color: "var(--fg-3)", fontSize: 12.5, margin: 0 }}
			>
				Choose who owns “{taskTitle}”.
			</p>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="reassign-employee"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Assignee
				</label>
				<select
					className="input"
					id="reassign-employee"
					onChange={(e) => setSelected(e.target.value)}
					style={{ width: "100%" }}
					value={selected}
				>
					<option value="">Select an employee…</option>
					{employeeRows.map((emp) => (
						<option key={emp.id} value={emp.id}>
							{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}
						</option>
					))}
				</select>
			</div>
			<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
				<button
					className="btn btn-sm"
					disabled={isPending}
					onClick={onClose}
					type="button"
				>
					Cancel
				</button>
				<button
					className="btn btn-primary btn-sm"
					disabled={isPending || selected === ""}
					onClick={() => onSubmit(selected)}
					type="button"
				>
					{isPending ? "Saving…" : "Save assignee"}
				</button>
			</div>
		</DialogShell>
	);
}
