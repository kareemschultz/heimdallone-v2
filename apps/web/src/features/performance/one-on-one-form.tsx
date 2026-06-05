import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

// Create a 1-on-1. The employee picker is scoped by the SERVER (a manager may
// only record one for a direct report; HR for anyone) — this list is the
// already-scoped hrCore.employees.list, and the server re-checks on write.
export function OneOnOneForm({ onClose }: { onClose: () => void }) {
	const qc = useQueryClient();
	const [employeeId, setEmployeeId] = useState("");
	const [scheduledAt, setScheduledAt] = useState("");
	const [sharedNotes, setSharedNotes] = useState("");
	const [privateNotes, setPrivateNotes] = useState("");

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = ((employees.data as { data?: EmployeeOption[] } | undefined)
		?.data ?? []) as EmployeeOption[];

	const create = useMutation({
		mutationFn: () =>
			client.performance.oneOnOnes.create({
				employeeId,
				scheduledAt: scheduledAt || undefined,
				sharedNotes: sharedNotes.trim() || undefined,
				privateManagerNotes: privateNotes.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("1-on-1 scheduled");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not create the 1-on-1"),
	});

	return (
		<div className="pf-sheet-overlay">
			<div
				aria-labelledby="pf-1on1-form-title"
				aria-modal="true"
				className="pf-sheet"
				role="dialog"
			>
				<div className="pf-sheet-head">
					<h2 id="pf-1on1-form-title">New 1-on-1</h2>
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
					<label className="pf-field" htmlFor="pf-1on1-employee">
						<span>With</span>
						<select
							id="pf-1on1-employee"
							onChange={(e) => setEmployeeId(e.target.value)}
							value={employeeId}
						>
							<option value="">Choose a team member…</option>
							{emps.map((e) => (
								<option key={e.id} value={e.id}>
									{e.firstName} {e.lastName ?? ""}
								</option>
							))}
						</select>
					</label>
					<label className="pf-field" htmlFor="pf-1on1-when">
						<span>When</span>
						<input
							id="pf-1on1-when"
							onChange={(e) => setScheduledAt(e.target.value)}
							type="datetime-local"
							value={scheduledAt}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-1on1-shared">
						<span>Shared notes (visible to you both)</span>
						<textarea
							id="pf-1on1-shared"
							onChange={(e) => setSharedNotes(e.target.value)}
							placeholder="Agenda, talking points, agreed actions…"
							rows={3}
							value={sharedNotes}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-1on1-private">
						<span>Private notes (only you and HR can see these)</span>
						<textarea
							id="pf-1on1-private"
							onChange={(e) => setPrivateNotes(e.target.value)}
							placeholder="Your private reflections — never shown to the employee."
							rows={3}
							value={privateNotes}
						/>
					</label>
				</div>
				<div className="pf-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!employeeId || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Schedule 1-on-1
					</button>
				</div>
			</div>
		</div>
	);
}
