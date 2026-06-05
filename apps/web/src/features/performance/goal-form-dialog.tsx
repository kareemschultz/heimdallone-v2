import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import { canManagePerformance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";
import type { ObjectiveRow } from "./types";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "active", label: "Active" },
	{ value: "on_track", label: "On track" },
	{ value: "at_risk", label: "At risk" },
	{ value: "behind", label: "Behind" },
];

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

export function GoalFormDialog({
	existing,
	onClose,
	onDone,
}: {
	existing?: ObjectiveRow;
	onClose: () => void;
	onDone: () => void;
}) {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const qc = useQueryClient();
	const isEdit = Boolean(existing);
	// HR / manager may pick the employee on create; an employee creates their own.
	const canPickEmployee = canManagePerformance(role) || role === "manager";

	const [title, setTitle] = useState(existing?.title ?? "");
	const [description, setDescription] = useState(existing?.description ?? "");
	const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? "");
	const [status, setStatus] = useState(existing?.status ?? "draft");
	const [dueDate, setDueDate] = useState(
		existing?.dueDate ? String(existing.dueDate).slice(0, 10) : ""
	);

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: canPickEmployee && !isEdit,
		})
	);
	const emps = ((employees.data as { data?: EmployeeOption[] } | undefined)
		?.data ?? []) as EmployeeOption[];

	const save = useMutation({
		mutationFn: () => {
			if (isEdit && existing) {
				return client.performance.objectives.update({
					id: existing.id,
					title: title.trim(),
					description: description.trim() || null,
					status: status as never,
					dueDate: dueDate || null,
				});
			}
			return client.performance.objectives.create({
				employeeId: canPickEmployee && employeeId ? employeeId : undefined,
				title: title.trim(),
				description: description.trim() || undefined,
				dueDate: dueDate || undefined,
			});
		},
		onSuccess: () => {
			toast.success(isEdit ? "Goal updated" : "Goal created");
			invalidatePerformance(qc);
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not save the goal"),
	});

	return (
		<div className="pf-sheet-overlay">
			<div
				aria-labelledby="pf-goal-form-title"
				aria-modal="true"
				className="pf-sheet"
				role="dialog"
			>
				<div className="pf-sheet-head">
					<h2 id="pf-goal-form-title">{isEdit ? "Edit goal" : "New goal"}</h2>
					<button
						aria-label="Close"
						className="btn-icon"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="pf-sheet-body">
					{canPickEmployee && !isEdit ? (
						<label className="pf-field" htmlFor="pf-goal-employee">
							<span>Whose goal is this?</span>
							<select
								id="pf-goal-employee"
								onChange={(e) => setEmployeeId(e.target.value)}
								value={employeeId}
							>
								<option value="">Me</option>
								{emps.map((e) => (
									<option key={e.id} value={e.id}>
										{e.firstName} {e.lastName ?? ""}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="pf-field" htmlFor="pf-goal-title">
						<span>Goal</span>
						<input
							id="pf-goal-title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="What do you want to achieve?"
							value={title}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-goal-desc">
						<span>Details (optional)</span>
						<textarea
							id="pf-goal-desc"
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							value={description}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-goal-due">
						<span>Target date (optional)</span>
						<input
							id="pf-goal-due"
							onChange={(e) => setDueDate(e.target.value)}
							type="date"
							value={dueDate}
						/>
					</label>
					{isEdit ? (
						<label className="pf-field" htmlFor="pf-goal-status">
							<span>Status</span>
							<select
								id="pf-goal-status"
								onChange={(e) => setStatus(e.target.value)}
								value={status}
							>
								{STATUS_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					) : null}
				</div>
				<div className="pf-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!title.trim() || save.isPending}
						onClick={() => save.mutate()}
						type="button"
					>
						{isEdit ? "Save goal" : "Create goal"}
					</button>
				</div>
			</div>
		</div>
	);
}
