import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { NotePromptDialog } from "./offboarding-note-prompt-dialog";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

interface AssetActionsProps {
	assetDescription: string;
	assetId: string;
	status: string;
}

/** Row actions for an asset return: mark returned, or waive (with note). */
export function AssetActions({
	assetId,
	assetDescription,
	status,
}: AssetActionsProps) {
	const invalidate = useInvalidateOffboarding();
	const [waiveOpen, setWaiveOpen] = useState(false);

	const returnMutation = useMutation({
		mutationFn: () => client.offboarding.assets.markReturned({ id: assetId }),
		onSuccess: () => {
			toast.success("Asset marked returned.");
			invalidate();
		},
		onError: (err: Error) => toast.error(`Could not update: ${err.message}`),
	});

	const waiveMutation = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.assets.waive({
				id: assetId,
				note: note === "" ? undefined : note,
			}),
		onSuccess: () => {
			toast.success("Asset return waived.");
			invalidate();
			setWaiveOpen(false);
		},
		onError: (err: Error) => toast.error(`Could not waive: ${err.message}`),
	});

	if (status !== "pending") {
		return <span style={{ color: "var(--fg-3)", fontSize: 12 }}>—</span>;
	}

	return (
		<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
			<button
				className="btn btn-primary btn-sm"
				disabled={returnMutation.isPending}
				onClick={() => returnMutation.mutate()}
				type="button"
			>
				Mark returned
			</button>
			<button
				className="btn btn-sm"
				onClick={() => setWaiveOpen(true)}
				type="button"
			>
				Waive
			</button>
			{waiveOpen && (
				<NotePromptDialog
					confirmLabel="Waive return"
					description={`"${assetDescription}" will be recorded as waived — no return expected.`}
					noteLabel="Reason"
					notePlaceholder="Why is the return being waived?"
					onClose={() => setWaiveOpen(false)}
					onConfirm={(note) => waiveMutation.mutate(note)}
					pending={waiveMutation.isPending}
					pendingLabel="Waiving…"
					title="Waive this asset return?"
				/>
			)}
		</div>
	);
}

interface AddAssetDialogProps {
	caseId: string;
	onClose: () => void;
}

/** HR dialog to add a free-text asset record to a case. */
export function AddAssetDialog({ caseId, onClose }: AddAssetDialogProps) {
	const invalidate = useInvalidateOffboarding();
	const [description, setDescription] = useState("");
	const [tag, setTag] = useState("");
	const [expected, setExpected] = useState("");
	const titleId = useId();
	const descFieldId = useId();
	const tagFieldId = useId();
	const dateFieldId = useId();
	const missing = description.trim() === "";

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.assets.create({
				caseId,
				assetDescription: description.trim(),
				assetTag: tag.trim() === "" ? undefined : tag.trim(),
				expectedReturnDate: expected === "" ? undefined : expected,
			}),
		onSuccess: () => {
			toast.success("Asset added.");
			invalidate();
			onClose();
		},
		onError: (err: Error) => toast.error(`Could not add asset: ${err.message}`),
	});

	return (
		<div
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
					maxWidth: 460,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<h2 id={titleId} style={{ fontSize: 15, fontWeight: 600 }}>
						Add an asset to recover
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

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor={descFieldId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Asset *
					</label>
					<input
						className="input"
						id={descFieldId}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="e.g. Company laptop"
						value={description}
					/>
				</div>
				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							gap: 4,
						}}
					>
						<label
							htmlFor={tagFieldId}
							style={{ fontSize: 12, color: "var(--fg-3)" }}
						>
							Asset tag
						</label>
						<input
							className="input"
							id={tagFieldId}
							onChange={(e) => setTag(e.target.value)}
							placeholder="Serial / tag"
							value={tag}
						/>
					</div>
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							gap: 4,
						}}
					>
						<label
							htmlFor={dateFieldId}
							style={{ fontSize: 12, color: "var(--fg-3)" }}
						>
							Expected return
						</label>
						<input
							className="input"
							id={dateFieldId}
							onChange={(e) => setExpected(e.target.value)}
							type="date"
							value={expected}
						/>
					</div>
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={mutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={mutation.isPending || missing}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Adding…" : "Add asset"}
					</button>
				</div>
			</div>
		</div>
	);
}
