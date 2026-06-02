import { X } from "lucide-react";
import { useId, useState } from "react";

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
	const titleId = useId();
	const descId = useId();
	const noteId = useId();
	const noteMissing = note.trim() === "";

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

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor={noteId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
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
						className="btn btn-primary btn-sm"
						disabled={pending || noteMissing}
						onClick={() => onConfirm(note.trim())}
						type="button"
					>
						{pending ? "Saving…" : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
