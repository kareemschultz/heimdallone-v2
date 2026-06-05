import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { keyResultTypeLabel } from "./labels";
import type { KeyResultRow } from "./types";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

const STATUS_OPTIONS = [
	{ value: "not_started", label: "Not started" },
	{ value: "on_track", label: "On track" },
	{ value: "at_risk", label: "At risk" },
	{ value: "done", label: "Done" },
];

export function KeyResultProgressDialog({
	kr,
	onClose,
}: {
	kr: KeyResultRow;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [current, setCurrent] = useState(String(kr.currentValue));
	const [status, setStatus] = useState(kr.status);

	const update = useMutation({
		mutationFn: () =>
			client.performance.objectives.keyResults.updateProgress({
				id: kr.id,
				currentValue: Number(current),
				status: status as never,
			}),
		onSuccess: () => {
			toast.success("Progress updated");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not update progress"),
	});

	return (
		<div className="pf-sheet-overlay">
			<div
				aria-labelledby="pf-kr-progress-title"
				aria-modal="true"
				className="pf-sheet"
				role="dialog"
			>
				<div className="pf-sheet-head">
					<h2 id="pf-kr-progress-title">Update progress</h2>
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
					<p className="pf-desc">{kr.title}</p>
					<label className="pf-field" htmlFor="pf-kr-current">
						<span>Current value ({keyResultTypeLabel(kr.progressType)})</span>
						<input
							id="pf-kr-current"
							onChange={(e) => setCurrent(e.target.value)}
							type="number"
							value={current}
						/>
					</label>
					<p className="pf-sub">
						Target: {kr.targetValue} · Start: {kr.startValue}
					</p>
					<label className="pf-field" htmlFor="pf-kr-status">
						<span>Status</span>
						<select
							id="pf-kr-status"
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
				</div>
				<div className="pf-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={update.isPending}
						onClick={() => update.mutate()}
						type="button"
					>
						Save progress
					</button>
				</div>
			</div>
		</div>
	);
}
