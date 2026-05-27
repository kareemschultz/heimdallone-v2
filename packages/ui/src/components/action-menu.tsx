import { cn } from "@Heimdallone/ui/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ActionMenuItem {
	disabled?: boolean;
	icon?: React.ReactNode;
	label: string;
	onClick: () => void;
	shortcut?: string;
	variant?: "default" | "danger";
}

interface ActionMenuSection {
	items: ActionMenuItem[];
	title?: string;
}

interface ActionMenuProps {
	align?: "bottom-end" | "bottom-start" | "top-end";
	className?: string;
	sections: ActionMenuSection[];
	trigger?: React.ReactNode;
}

function ActionMenu({
	sections,
	trigger,
	align = "bottom-end",
	className,
}: ActionMenuProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) {
			return;
		}
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				close();
			}
		};
		const handleClickOutside = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				close();
			}
		};
		document.addEventListener("keydown", handleEscape);
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [open, close]);

	useEffect(() => {
		if (!(open && menuRef.current)) {
			return;
		}
		const firstItem = menuRef.current.querySelector<HTMLButtonElement>(
			"button.menu-item:not([disabled])"
		);
		firstItem?.focus();
	}, [open]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!menuRef.current) {
			return;
		}
		const items = Array.from(
			menuRef.current.querySelectorAll<HTMLButtonElement>(
				"button.menu-item:not([disabled])"
			)
		);
		const currentIndex = items.indexOf(
			document.activeElement as HTMLButtonElement
		);

		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = items[(currentIndex + 1) % items.length];
			next?.focus();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			const prev = items[(currentIndex - 1 + items.length) % items.length];
			prev?.focus();
		}
	};

	return (
		<div className={cn("menu-root", className)} ref={rootRef}>
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className="btn btn-ghost btn-sm"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				{trigger ?? <MoreHorizontal size={15} />}
			</button>
			<div
				aria-hidden={!open}
				className="menu"
				data-open={open ? "true" : undefined}
				data-side={align}
				onKeyDown={handleKeyDown}
				ref={menuRef}
				role="menu"
			>
				{sections.map((section, si) => (
					<div key={si}>
						{si > 0 && <div className="menu-sep" />}
						{section.title && (
							<div className="menu-section">{section.title}</div>
						)}
						{section.items.map((item) => (
							<button
								className={cn(
									"menu-item",
									item.variant === "danger" && "danger"
								)}
								disabled={item.disabled}
								key={item.label}
								onClick={() => {
									item.onClick();
									close();
								}}
								role="menuitem"
								tabIndex={-1}
								type="button"
							>
								{item.icon && <span className="menu-icon">{item.icon}</span>}
								{item.label}
								{item.shortcut && (
									<span className="menu-meta">{item.shortcut}</span>
								)}
							</button>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export type { ActionMenuItem, ActionMenuProps, ActionMenuSection };
export { ActionMenu };
