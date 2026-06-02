import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { NotePromptDialog } from "./offboarding-note-prompt-dialog";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

interface DocumentActionsProps {
	docId: string;
	status: string;
	title: string;
}

/**
 * Row actions for a document request. Lifecycle is requested → uploaded →
 * approved (or waived at any point before approval). File uploads themselves
 * are employee self-service (later checkpoint); here HR records receipt,
 * approval, or waiver.
 */
export function DocumentActions({
	docId,
	title,
	status,
}: DocumentActionsProps) {
	const invalidate = useInvalidateOffboarding();
	const [waiveOpen, setWaiveOpen] = useState(false);

	const uploadedMutation = useMutation({
		mutationFn: () => client.offboarding.documents.markUploaded({ id: docId }),
		onSuccess: () => {
			toast.success("Document marked received.");
			invalidate();
		},
		onError: (err: Error) => toast.error(`Could not update: ${err.message}`),
	});

	const approveMutation = useMutation({
		mutationFn: () => client.offboarding.documents.approve({ id: docId }),
		onSuccess: () => {
			toast.success("Document approved.");
			invalidate();
		},
		onError: (err: Error) => toast.error(`Could not approve: ${err.message}`),
	});

	const waiveMutation = useMutation({
		mutationFn: () => client.offboarding.documents.waive({ id: docId }),
		onSuccess: () => {
			toast.success("Document waived.");
			invalidate();
			setWaiveOpen(false);
		},
		onError: (err: Error) => toast.error(`Could not waive: ${err.message}`),
	});

	if (status === "approved" || status === "waived") {
		return <span style={{ color: "var(--fg-3)", fontSize: 12 }}>—</span>;
	}

	return (
		<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
			{status === "requested" && (
				<button
					className="btn btn-sm"
					disabled={uploadedMutation.isPending}
					onClick={() => uploadedMutation.mutate()}
					type="button"
				>
					Mark received
				</button>
			)}
			{status === "uploaded" && (
				<button
					className="btn btn-primary btn-sm"
					disabled={approveMutation.isPending}
					onClick={() => approveMutation.mutate()}
					type="button"
				>
					Approve
				</button>
			)}
			<button
				className="btn btn-sm"
				onClick={() => setWaiveOpen(true)}
				type="button"
			>
				Waive
			</button>
			{waiveOpen && (
				<NotePromptDialog
					confirmLabel="Waive document"
					description={`"${title}" will be recorded as waived — no longer required for clearance.`}
					onClose={() => setWaiveOpen(false)}
					onConfirm={() => waiveMutation.mutate()}
					pending={waiveMutation.isPending}
					pendingLabel="Waiving…"
					title="Waive this document?"
				/>
			)}
		</div>
	);
}

interface AddDocumentDialogProps {
	caseId: string;
	onClose: () => void;
}

/** HR dialog to request a clearance document on a case. */
export function AddDocumentDialog({ caseId, onClose }: AddDocumentDialogProps) {
	const invalidate = useInvalidateOffboarding();
	const [title, setTitle] = useState("");
	const [documentType, setDocumentType] = useState("");
	const titleId = useId();
	const titleFieldId = useId();
	const typeFieldId = useId();
	const missing = title.trim() === "" || documentType.trim() === "";

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.documents.create({
				caseId,
				title: title.trim(),
				documentType: documentType.trim(),
			}),
		onSuccess: () => {
			toast.success("Document requested.");
			invalidate();
			onClose();
		},
		onError: (err: Error) => toast.error(`Could not add: ${err.message}`),
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
						Request a document
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
						htmlFor={titleFieldId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Document name *
					</label>
					<input
						className="input"
						id={titleFieldId}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g. Signed exit acknowledgement"
						value={title}
					/>
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor={typeFieldId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Type *
					</label>
					<input
						className="input"
						id={typeFieldId}
						onChange={(e) => setDocumentType(e.target.value)}
						placeholder="e.g. Acknowledgement, NDA, Handover"
						value={documentType}
					/>
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
						{mutation.isPending ? "Adding…" : "Request document"}
					</button>
				</div>
			</div>
		</div>
	);
}
