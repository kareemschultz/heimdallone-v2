import { X } from "lucide-react";
import { useId, useState } from "react";

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
	const titleId = useId();
	const descId = useId();
	const fieldId = useId();
	const noteMissing = noteRequired && note.trim() === "";

	return (
		<div
			aria-describedby={descId}
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
					maxWidth: 440,
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
						{title}
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
				<p
					id={descId}
					style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
				>
					{description}
				</p>

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

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
				</div>
			</div>
		</div>
	);
}
