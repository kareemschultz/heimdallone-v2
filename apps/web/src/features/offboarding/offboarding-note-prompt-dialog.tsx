import { useId, useState } from "react";

import { Modal } from "@/components/modal";

interface NotePromptDialogProps {
	confirmLabel: string;
	/** Renders the confirm button with the danger tone. */
	danger?: boolean;
	description: string;
	/** Label for the note field. Omit to render a confirm-only dialog. */
	noteLabel?: string;
	notePlaceholder?: string;
	/** When true, the confirm button stays disabled until a note is entered. */
	noteRequired?: boolean;
	onClose: () => void;
	onConfirm: (note: string) => void;
	pending: boolean;
	pendingLabel: string;
	title: string;
}

/**
 * Small reusable modal for offboarding actions that need a confirmation and an
 * optional (or required) free-text note: skip / block a task, waive an asset,
 * reject / cancel / close a case, etc. Centralising it keeps each row-action
 * component flat and well under the cognitive-complexity ceiling.
 */
export function NotePromptDialog({
	title,
	description,
	noteLabel,
	notePlaceholder,
	noteRequired = false,
	confirmLabel,
	pendingLabel,
	danger = false,
	pending,
	onConfirm,
	onClose,
}: NotePromptDialogProps) {
	const [note, setNote] = useState("");
	const fieldId = useId();
	const noteMissing = noteRequired && note.trim() === "";

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
						className={danger ? "btn btn-sm" : "btn btn-primary btn-sm"}
						disabled={pending || noteMissing}
						onClick={() => onConfirm(note.trim())}
						style={
							danger
								? { color: "#fff", background: "var(--danger, #c0392b)" }
								: undefined
						}
						type="button"
					>
						{pending ? pendingLabel : confirmLabel}
					</button>
				</>
			}
			intro={description}
			onClose={onClose}
			title={title}
		>
			{noteLabel && (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor={fieldId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						{noteLabel} {noteRequired ? "*" : "(optional)"}
					</label>
					<textarea
						className="input"
						id={fieldId}
						onChange={(e) => setNote(e.target.value)}
						placeholder={notePlaceholder}
						rows={3}
						style={{ width: "100%", resize: "vertical" }}
						value={note}
					/>
				</div>
			)}
		</Modal>
	);
}
