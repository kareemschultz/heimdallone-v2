import { useState } from "react";

/**
 * A small comment composer. The submit is disabled while the body is empty or a
 * request is pending. `internal` only changes the styling + copy — the caller
 * decides which mutation to call (public vs internal) and whether to render this
 * form at all (an employee never gets the internal variant).
 */
export function CommentForm({
	id,
	label,
	placeholder,
	submitLabel,
	hint,
	pending,
	internal = false,
	onSubmit,
}: {
	hint?: string;
	id: string;
	internal?: boolean;
	label: string;
	onSubmit: (body: string) => void;
	pending: boolean;
	placeholder: string;
	submitLabel: string;
}) {
	const [body, setBody] = useState("");
	const trimmed = body.trim();

	const submit = () => {
		if (!trimmed || pending) {
			return;
		}
		onSubmit(trimmed);
		setBody("");
	};

	return (
		<div className={`hd-comment-form ${internal ? "internal" : ""}`}>
			<label className="hd-form-hint" htmlFor={id}>
				{label}
			</label>
			<textarea
				id={id}
				onChange={(e) => setBody(e.target.value)}
				placeholder={placeholder}
				rows={3}
				value={body}
			/>
			<div className="hd-comment-form-foot">
				{hint ? <span className="hd-form-hint">{hint}</span> : null}
				<button
					className="btn btn-primary btn-sm"
					disabled={!trimmed || pending}
					onClick={submit}
					type="button"
				>
					{submitLabel}
				</button>
			</div>
		</div>
	);
}
