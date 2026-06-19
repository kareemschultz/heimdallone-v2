import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Shared centered, contextual modal — the single source of truth for the app's
 * create / edit / detail dialogs. Plain presentational overlay (matches the
 * codebase's conditional-mount dialog pattern — no extra deps): the parent
 * renders `<Modal …>` only when open, so `open` defaults to true and dismissal
 * calls `onClose`. Escape and a full-screen backdrop button both close it;
 * focus moves to the dialog on mount. Styling lives in heimdall.css
 * (`.hd-modal*`).
 */
export function Modal({
	open = true,
	onClose,
	icon,
	title,
	subtitle,
	intro,
	footer,
	wide = false,
	children,
}: {
	children: ReactNode;
	footer?: ReactNode;
	icon?: ReactNode;
	intro?: ReactNode;
	onClose: () => void;
	open?: boolean;
	subtitle?: string;
	title: string;
	wide?: boolean;
}) {
	const titleId = useId();
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		dialogRef.current?.focus();
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<>
			<button
				aria-label="Close dialog"
				className="hd-modal-overlay"
				onClick={onClose}
				type="button"
			/>
			<div
				aria-labelledby={titleId}
				aria-modal="true"
				className={wide ? "hd-modal hd-modal-wide" : "hd-modal"}
				ref={dialogRef}
				role="dialog"
				tabIndex={-1}
			>
				<div className="hd-modal-head">
					{icon ? <span className="hd-modal-icon">{icon}</span> : null}
					<div className="hd-modal-titles">
						<h2 className="hd-modal-title" id={titleId}>
							{title}
						</h2>
						{subtitle ? <p className="hd-modal-sub">{subtitle}</p> : null}
					</div>
					<button
						aria-label="Close"
						className="hd-modal-close"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				{intro ? <div className="hd-modal-intro">{intro}</div> : null}
				<div className="hd-modal-body">{children}</div>
				{footer ? <div className="hd-modal-foot">{footer}</div> : null}
			</div>
		</>
	);
}
