import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
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

const POINT_PRESETS = [5, 10, 25, 50];

// Recognition is a NON-MONETARY appreciation ledger. The form never mentions
// pay/bonus/currency; the points are a count. A manager may only recognise a
// direct report (the picker is the already-scoped employee list and the server
// re-checks); HR may recognise anyone.
export function AwardRecognitionForm({ onClose }: { onClose: () => void }) {
	const qc = useQueryClient();
	const [employeeId, setEmployeeId] = useState("");
	const [points, setPoints] = useState("10");
	const [reason, setReason] = useState("");

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = ((employees.data as { data?: EmployeeOption[] } | undefined)
		?.data ?? []) as EmployeeOption[];

	const award = useMutation({
		mutationFn: () =>
			client.performance.recognition.award({
				employeeId,
				points: Number(points) || 1,
				reason: reason.trim(),
			}),
		onSuccess: () => {
			toast.success("Recognition recorded");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not record the recognition"),
	});

	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!(employeeId && reason.trim()) || award.isPending}
						onClick={() => award.mutate()}
						type="button"
					>
						Give recognition
					</button>
				</>
			}
			icon={<Award size={18} />}
			onClose={onClose}
			title="Recognise someone"
		>
			<p className="pf-not-pay">
				Recognition points are an appreciation record only. They are not payroll
				or bonus pay.
			</p>
			<label className="pf-field" htmlFor="pf-award-employee">
				<span>Who would you like to recognise?</span>
				<select
					id="pf-award-employee"
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
			<div className="pf-field">
				<span>Points</span>
				<div className="pf-rating-row">
					{POINT_PRESETS.map((n) => (
						<button
							aria-pressed={points === String(n)}
							className={`pf-rating-pill ${points === String(n) ? "active" : ""}`}
							key={n}
							onClick={() => setPoints(String(n))}
							type="button"
						>
							{n}
						</button>
					))}
				</div>
			</div>
			<label className="pf-field" htmlFor="pf-award-reason">
				<span>What did they do?</span>
				<textarea
					id="pf-award-reason"
					onChange={(e) => setReason(e.target.value)}
					placeholder="e.g. Stepped up to cover the deployment over the weekend."
					rows={3}
					value={reason}
				/>
			</label>
		</Modal>
	);
}
