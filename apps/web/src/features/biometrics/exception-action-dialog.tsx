import { AlertCircle } from "lucide-react";
import { useId, useState } from "react";

import { Modal } from "@/components/modal";

interface ExceptionActionDialogProps {
	confirmLabel: string;
	description: string;
	onClose: () => void;
	onConfirm: (note: string) => void;
	pending: boolean;
	title: string;
}

/**
 * Resolve / dismiss an attendance exception. A note is always required so the
 * audit trail explains why the exception was closed.
 */
export function ExceptionActionDialog({
	title,
	description,
	confirmLabel,
	pending,
	onConfirm,
	onClose,
}: ExceptionActionDialogProps) {
	const [note, setNote] = useState("");
	const noteId = useId();
	const noteMissing = note.trim() === "";

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending || noteMissing}
						onClick={() => onConfirm(note.trim())}
						type="button"
					>
						{pending ? "Saving…" : confirmLabel}
					</button>
				</>
			}
			icon={<AlertCircle size={18} />}
			intro={description}
			onClose={onClose}
			title={title}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label htmlFor={noteId} style={{ fontSize: 12, color: "var(--fg-3)" }}>
					Note *
				</label>
				<textarea
					className="input"
					id={noteId}
					onChange={(e) => setNote(e.target.value)}
					placeholder="Add a note explaining why this is resolved."
					rows={3}
					style={{ width: "100%", resize: "vertical" }}
					value={note}
				/>
			</div>
		</Modal>
	);
}
