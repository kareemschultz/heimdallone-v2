import { useMutation } from "@tanstack/react-query";
import { ShieldOff } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";
import { NotePromptDialog } from "./offboarding-note-prompt-dialog";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

interface AccessActionsProps {
	accessId: string;
	status: string;
	system: string;
}

/** Row actions for an access item: mark revoked, or waive (with note). */
export function AccessActions({
	accessId,
	system,
	status,
}: AccessActionsProps) {
	const invalidate = useInvalidateOffboarding();
	const [waiveOpen, setWaiveOpen] = useState(false);
	const [revokeOpen, setRevokeOpen] = useState(false);

	const revokeMutation = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.access.markRevoked({
				id: accessId,
				note: note === "" ? undefined : note,
			}),
		onSuccess: () => {
			toast.success("Access marked revoked.");
			invalidate();
			setRevokeOpen(false);
		},
		onError: (err: Error) => toast.error(`Could not update: ${err.message}`),
	});

	const waiveMutation = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.access.waive({
				id: accessId,
				note: note === "" ? undefined : note,
			}),
		onSuccess: () => {
			toast.success("Access revocation waived.");
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
				onClick={() => setRevokeOpen(true)}
				type="button"
			>
				Mark revoked
			</button>
			<button
				className="btn btn-sm"
				onClick={() => setWaiveOpen(true)}
				type="button"
			>
				Waive
			</button>
			{revokeOpen && (
				<NotePromptDialog
					confirmLabel="Mark revoked"
					description="Only mark access as revoked after the account has been disabled outside Heimdallone. This records the confirmation, it does not disable any account."
					noteLabel="Note"
					notePlaceholder="Optional confirmation detail"
					onClose={() => setRevokeOpen(false)}
					onConfirm={(note) => revokeMutation.mutate(note)}
					pending={revokeMutation.isPending}
					pendingLabel="Saving…"
					title={`Confirm "${system}" access removed?`}
				/>
			)}
			{waiveOpen && (
				<NotePromptDialog
					confirmLabel="Waive"
					description={`"${system}" will be recorded as waived — no revocation required.`}
					noteLabel="Reason"
					notePlaceholder="Why is removal not required?"
					onClose={() => setWaiveOpen(false)}
					onConfirm={(note) => waiveMutation.mutate(note)}
					pending={waiveMutation.isPending}
					pendingLabel="Waiving…"
					title="Waive this access item?"
				/>
			)}
		</div>
	);
}

interface AddAccessDialogProps {
	caseId: string;
	onClose: () => void;
}

/** HR dialog to add a system/account access-removal item to a case. */
export function AddAccessDialog({ caseId, onClose }: AddAccessDialogProps) {
	const invalidate = useInvalidateOffboarding();
	const [system, setSystem] = useState("");
	const [description, setDescription] = useState("");
	const [scheduled, setScheduled] = useState("");
	const systemFieldId = useId();
	const descFieldId = useId();
	const dateFieldId = useId();
	const missing = system.trim() === "";

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.access.create({
				caseId,
				system: system.trim(),
				description: description.trim() === "" ? undefined : description.trim(),
				scheduledRevokeAt: scheduled === "" ? undefined : scheduled,
			}),
		onSuccess: () => {
			toast.success("Access item added.");
			invalidate();
			onClose();
		},
		onError: (err: Error) => toast.error(`Could not add: ${err.message}`),
	});

	return (
		<Modal
			footer={
				<>
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
						{mutation.isPending ? "Adding…" : "Add item"}
					</button>
				</>
			}
			icon={<ShieldOff size={18} />}
			intro="Track a system or account that must be disabled. Disabling happens outside Heimdallone; this records it for clearance."
			onClose={onClose}
			title="Add an access item"
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor={systemFieldId}
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					System / account *
				</label>
				<input
					className="input"
					id={systemFieldId}
					onChange={(e) => setSystem(e.target.value)}
					placeholder="e.g. Email, VPN, Payroll portal"
					value={system}
				/>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor={descFieldId}
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Notes
				</label>
				<input
					className="input"
					id={descFieldId}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Optional detail"
					value={description}
				/>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor={dateFieldId}
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Scheduled removal
				</label>
				<input
					className="input"
					id={dateFieldId}
					onChange={(e) => setScheduled(e.target.value)}
					type="date"
					value={scheduled}
				/>
			</div>
		</Modal>
	);
}
