import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";
import { Badge } from "./badge";
import { KeyResultProgressDialog } from "./key-result-progress-dialog";
import {
	fmtKrValue,
	keyResultStatusLabel,
	keyResultStatusTone,
	linkedTaskStatusLabel,
	progressTone,
} from "./labels";
import { type KeyResultRow, krProgressPercent } from "./types";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

function AddKeyResultDialog({
	objectiveId,
	onClose,
}: {
	objectiveId: string;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [title, setTitle] = useState("");
	const [type, setType] = useState("percentage");
	const [target, setTarget] = useState("100");

	const add = useMutation({
		mutationFn: () =>
			client.performance.objectives.keyResults.add({
				objectiveId,
				title: title.trim(),
				progressType: type as never,
				targetValue: Number(target),
			}),
		onSuccess: () => {
			toast.success("Key result added");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not add the key result"),
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
						disabled={!title.trim() || add.isPending}
						onClick={() => add.mutate()}
						type="button"
					>
						Add key result
					</button>
				</>
			}
			icon={<Target size={18} />}
			intro="A key result is a measurable outcome that shows progress toward the goal."
			onClose={onClose}
			title="Add a key result"
		>
			<label className="pf-field" htmlFor="pf-kr-title">
				<span>How will you measure success?</span>
				<input
					id="pf-kr-title"
					onChange={(e) => setTitle(e.target.value)}
					placeholder="e.g. Complete onboarding for 5 new hires"
					value={title}
				/>
			</label>
			<label className="pf-field" htmlFor="pf-kr-type">
				<span>Measured as</span>
				<select
					id="pf-kr-type"
					onChange={(e) => setType(e.target.value)}
					value={type}
				>
					<option value="percentage">Percentage</option>
					<option value="number">Number</option>
					<option value="currency">Amount</option>
					<option value="boolean">Yes / No</option>
				</select>
			</label>
			<label className="pf-field" htmlFor="pf-kr-target">
				<span>Target</span>
				<input
					id="pf-kr-target"
					onChange={(e) => setTarget(e.target.value)}
					type="number"
					value={target}
				/>
			</label>
		</Modal>
	);
}

export function KeyResultList({
	objectiveId,
	keyResults,
	canEdit,
}: {
	canEdit: boolean;
	keyResults: KeyResultRow[];
	objectiveId: string;
}) {
	const qc = useQueryClient();
	const [showAdd, setShowAdd] = useState(false);
	const [progressKr, setProgressKr] = useState<KeyResultRow | null>(null);

	const remove = useMutation({
		mutationFn: (id: string) =>
			client.performance.objectives.keyResults.remove({ id }),
		onSuccess: () => {
			toast.success("Key result removed");
			invalidatePerformance(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not remove the key result"),
	});

	return (
		<div className="pf-panel">
			<div className="pf-panel-head">
				<span className="pf-section-title">Key results</span>
				{canEdit ? (
					<button
						className="btn btn-sm btn-primary"
						onClick={() => setShowAdd(true)}
						type="button"
					>
						Add key result
					</button>
				) : null}
			</div>

			{keyResults.length === 0 ? (
				<EmptyState
					compact
					description="Add a measurable key result so progress can be tracked."
					title="No key results yet"
				/>
			) : null}

			{keyResults.map((kr) => {
				const pct = krProgressPercent(kr);
				return (
					<div className="pf-kr" key={kr.id}>
						<div className="pf-kr-top">
							<span className="pf-name">{kr.title}</span>
							<Badge tone={keyResultStatusTone(kr.status)}>
								{keyResultStatusLabel(kr.status)}
							</Badge>
						</div>
						<div className="pf-progress">
							<div className="pf-progress-bar">
								<span
									className={`pf-progress-fill tone-${progressTone(pct)}`}
									style={{ width: `${pct}%` }}
								/>
							</div>
							<span className="pf-progress-val">{pct}%</span>
						</div>
						<div className="pf-kr-meta">
							<span className="pf-sub">
								{fmtKrValue(kr.currentValue, kr.progressType)} /{" "}
								{fmtKrValue(kr.targetValue, kr.progressType)}
							</span>
							{kr.linkedTask ? (
								<span
									className="pf-linkchip"
									title="Read-only context from Projects"
								>
									<Link2 size={11} /> {kr.linkedTask.title} ·{" "}
									{linkedTaskStatusLabel(kr.linkedTask.status)}
								</span>
							) : null}
							{canEdit ? (
								<span className="pf-kr-actions">
									<button
										className="btn btn-sm"
										onClick={() => setProgressKr(kr)}
										type="button"
									>
										Update progress
									</button>
									<button
										className="btn btn-sm"
										disabled={remove.isPending}
										onClick={() => remove.mutate(kr.id)}
										type="button"
									>
										Remove
									</button>
								</span>
							) : null}
						</div>
					</div>
				);
			})}

			{showAdd ? (
				<AddKeyResultDialog
					objectiveId={objectiveId}
					onClose={() => setShowAdd(false)}
				/>
			) : null}
			{progressKr ? (
				<KeyResultProgressDialog
					kr={progressKr}
					onClose={() => setProgressKr(null)}
				/>
			) : null}
		</div>
	);
}
