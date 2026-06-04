import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { Badge } from "@/features/projects/badge";
import {
	fmtDate,
	priorityLabel,
	priorityTone,
	taskStatusLabel,
	taskStatusTone,
} from "@/features/projects/labels";
import { TaskDetailSheet } from "@/features/projects/task-detail-sheet";
import type { ProjectTaskRow } from "@/features/projects/types";
import { client, orpc } from "@/utils/orpc";

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

// Board columns = the working task states; `cancelled` is excluded from the board
// (it shows in the list view, which carries every status).
const BOARD_COLUMNS: KanbanColumn[] = [
	{ key: "todo", label: "To do" },
	{ key: "in_progress", label: "In progress" },
	{ key: "blocked", label: "Blocked" },
	{ key: "in_review", label: "In review" },
	{ key: "done", label: "Done" },
];

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

function NewTaskDialog({
	projectId,
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
	projectId: string;
}) {
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("normal");
	const [assigneeId, setAssigneeId] = useState("");
	const [dueDate, setDueDate] = useState("");
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = ((employees.data as { data?: EmployeeOption[] } | undefined)
		?.data ?? []) as EmployeeOption[];

	const create = useMutation({
		mutationFn: () =>
			client.projects.tasks.create({
				projectId,
				title: title.trim(),
				priority: priority as "low" | "normal" | "high" | "urgent",
				assigneeEmployeeId: assigneeId || undefined,
				dueDate: dueDate || undefined,
			}),
		onSuccess: () => {
			toast.success("Task created");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not create the task"),
	});

	return (
		<div className="pj-sheet-overlay">
			<div
				aria-labelledby="pj-new-task-title"
				aria-modal="true"
				className="pj-sheet"
				role="dialog"
			>
				<div className="pj-sheet-head">
					<h2 id="pj-new-task-title">New task</h2>
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
					<label className="pj-field" htmlFor="pj-task-title">
						<span>Title</span>
						<input
							id="pj-task-title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="What needs doing?"
							value={title}
						/>
					</label>
					<label className="pj-field" htmlFor="pj-task-priority">
						<span>Priority</span>
						<select
							id="pj-task-priority"
							onChange={(e) => setPriority(e.target.value)}
							value={priority}
						>
							<option value="low">Low</option>
							<option value="normal">Normal</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</label>
					<label className="pj-field" htmlFor="pj-task-assignee">
						<span>Assign to (optional)</span>
						<select
							id="pj-task-assignee"
							onChange={(e) => setAssigneeId(e.target.value)}
							value={assigneeId}
						>
							<option value="">Unassigned</option>
							{emps.map((e) => (
								<option key={e.id} value={e.id}>
									{e.firstName} {e.lastName ?? ""}
								</option>
							))}
						</select>
					</label>
					<label className="pj-field" htmlFor="pj-task-due">
						<span>Due date (optional)</span>
						<input
							id="pj-task-due"
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
						disabled={!title.trim() || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Create task
					</button>
				</div>
			</div>
		</div>
	);
}

function TaskCard({ t }: { t: ProjectTaskRow }) {
	return (
		<div className="pj-kanban-card">
			<span className="pj-mono">{t.reference}</span>
			<div className="pj-kanban-title">{t.title}</div>
			<div className="pj-kanban-meta">
				<Badge tone={priorityTone(t.priority)}>
					{priorityLabel(t.priority)}
				</Badge>
				<span className="pj-sub">{t.assigneeName ?? "Unassigned"}</span>
				{t.hasCrossModuleLinks ? <Link2 size={11} /> : null}
			</div>
		</div>
	);
}

export function ProjectTasks({
	projectId,
	canCreate,
	canDrag,
}: {
	canCreate: boolean;
	canDrag: boolean;
	projectId: string;
}) {
	const qc = useQueryClient();
	const [view, setView] = useState<"board" | "list">("board");
	const [showNew, setShowNew] = useState(false);
	const [openTaskId, setOpenTaskId] = useState<string | null>(null);

	const tasks = useQuery(
		orpc.projects.tasks.list.queryOptions({ input: { projectId, limit: 200 } })
	);
	const rows = (tasks.data as ProjectTaskRow[] | undefined) ?? [];

	const changeStatus = useMutation({
		mutationFn: (vars: { id: string; status: string }) =>
			client.projects.tasks.changeStatus({
				id: vars.id,
				status: vars.status as
					| "todo"
					| "in_progress"
					| "blocked"
					| "in_review"
					| "done"
					| "cancelled",
			}),
		onSuccess: () => invalidateProjects(qc),
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not move the task"),
	});

	// Drag is enabled for roles holding task:change_status (managing / manager /
	// employee). The SERVER is the boundary — an employee may only move a task
	// assigned to them; a rejected move surfaces a toast and the card snaps back
	// (the board re-renders from the unchanged query until a success refetch).
	const canMove = () => ({ allowed: canDrag });

	const boardCards = rows.filter((t) => t.status !== "cancelled");

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<div className="pj-viewtoggle">
					<button
						className={`pj-toggle ${view === "board" ? "active" : ""}`}
						onClick={() => setView("board")}
						type="button"
					>
						Board
					</button>
					<button
						className={`pj-toggle ${view === "list" ? "active" : ""}`}
						onClick={() => setView("list")}
						type="button"
					>
						List
					</button>
				</div>
				{canCreate ? (
					<button
						className="btn btn-sm btn-primary"
						onClick={() => setShowNew(true)}
						type="button"
					>
						New task
					</button>
				) : null}
			</div>

			{tasks.isLoading ? <div className="pj-skeleton" /> : null}
			{!tasks.isLoading && rows.length === 0 ? (
				<EmptyState
					compact
					description="No tasks have been added to this project yet."
					title="No tasks"
				/>
			) : null}

			{!tasks.isLoading && rows.length > 0 && view === "board" ? (
				<KanbanBoard
					canMove={canMove}
					cards={boardCards}
					columns={BOARD_COLUMNS}
					emptyColumnHint="No tasks"
					getCardColumn={(t) => t.status}
					getCardKey={(t) => t.id}
					onMove={(cardKey, _from, toColumn) =>
						changeStatus
							.mutateAsync({ id: cardKey, status: toColumn })
							.then(() => undefined)
					}
					renderCard={(t) => (
						<button
							className="pj-kanban-card-btn"
							onClick={() => setOpenTaskId(t.id)}
							type="button"
						>
							<TaskCard t={t} />
						</button>
					)}
				/>
			) : null}

			{!tasks.isLoading && rows.length > 0 && view === "list" ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Task</th>
							<th>Status</th>
							<th>Priority</th>
							<th>Assignee</th>
							<th>Due</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((t) => (
							<tr key={t.id}>
								<td>
									<span className="pj-mono">{t.reference}</span>
								</td>
								<td>
									<button
										className="pj-name pj-name-link"
										onClick={() => setOpenTaskId(t.id)}
										type="button"
									>
										{t.title}
									</button>
								</td>
								<td>
									<Badge tone={taskStatusTone(t.status)}>
										{taskStatusLabel(t.status)}
									</Badge>
								</td>
								<td>
									<Badge tone={priorityTone(t.priority)}>
										{priorityLabel(t.priority)}
									</Badge>
								</td>
								<td>{t.assigneeName ?? "Unassigned"}</td>
								<td>{fmtDate(t.dueDate)}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{showNew ? (
				<NewTaskDialog
					onClose={() => setShowNew(false)}
					onDone={() => {
						setShowNew(false);
						invalidateProjects(qc);
					}}
					projectId={projectId}
				/>
			) : null}

			{openTaskId ? (
				<TaskDetailSheet
					onClose={() => setOpenTaskId(null)}
					taskId={openTaskId}
				/>
			) : null}
		</div>
	);
}
