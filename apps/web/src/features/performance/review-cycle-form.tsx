import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

const TYPE_OPTIONS = [
	{ value: "manager", label: "Manager review" },
	{ value: "self", label: "Self review" },
	{ value: "three_sixty", label: "360 review" },
	{ value: "upward", label: "Upward review" },
];

export function ReviewCycleForm({ onClose }: { onClose: () => void }) {
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState("manager");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [anonymous, setAnonymous] = useState(true);
	const [threshold, setThreshold] = useState("3");

	const create = useMutation({
		mutationFn: () =>
			client.performance.reviewCycles.create({
				name: name.trim(),
				description: description.trim() || undefined,
				type: type as never,
				startDate: startDate || undefined,
				endDate: endDate || undefined,
				isAnonymousPeers: anonymous,
				anonymityThreshold: Number(threshold) || 3,
			}),
		onSuccess: () => {
			toast.success("Review cycle created (draft)");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not create the cycle"),
	});

	const isThreeSixty = type === "three_sixty";

	return (
		<div className="pf-sheet-overlay">
			<div
				aria-labelledby="pf-cycle-form-title"
				aria-modal="true"
				className="pf-sheet"
				role="dialog"
			>
				<div className="pf-sheet-head">
					<h2 id="pf-cycle-form-title">New review cycle</h2>
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
					<label className="pf-field" htmlFor="pf-cycle-name">
						<span>Cycle name</span>
						<input
							id="pf-cycle-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Mid-year review 2026"
							value={name}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-cycle-desc">
						<span>Description (optional)</span>
						<textarea
							id="pf-cycle-desc"
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							value={description}
						/>
					</label>
					<label className="pf-field" htmlFor="pf-cycle-type">
						<span>Review type</span>
						<select
							id="pf-cycle-type"
							onChange={(e) => setType(e.target.value)}
							value={type}
						>
							{TYPE_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</label>
					<div className="pf-field-row">
						<label className="pf-field" htmlFor="pf-cycle-start">
							<span>Start date</span>
							<input
								id="pf-cycle-start"
								onChange={(e) => setStartDate(e.target.value)}
								type="date"
								value={startDate}
							/>
						</label>
						<label className="pf-field" htmlFor="pf-cycle-end">
							<span>End date</span>
							<input
								id="pf-cycle-end"
								onChange={(e) => setEndDate(e.target.value)}
								type="date"
								value={endDate}
							/>
						</label>
					</div>
					{isThreeSixty ? (
						<>
							<label className="pf-checkbox" htmlFor="pf-cycle-anon">
								<input
									checked={anonymous}
									id="pf-cycle-anon"
									onChange={(e) => setAnonymous(e.target.checked)}
									type="checkbox"
								/>
								<span>Keep peer feedback anonymous</span>
							</label>
							<label className="pf-field" htmlFor="pf-cycle-threshold">
								<span>Minimum peer responses before feedback is shown</span>
								<input
									id="pf-cycle-threshold"
									min="1"
									onChange={(e) => setThreshold(e.target.value)}
									type="number"
									value={threshold}
								/>
							</label>
							<p className="pf-form-hint">
								Peer feedback stays hidden until at least this many peers
								respond, then it is shown aggregated without names. Only HR can
								see who said what.
							</p>
						</>
					) : null}
				</div>
				<div className="pf-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!name.trim() || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Create cycle
					</button>
				</div>
			</div>
		</div>
	);
}
