// Friendly empty state for tables/lists that returned zero rows.
// Pair rule: render a skeleton while isLoading === true; once loading is false
// AND the result is empty, render <EmptyState />. Never use skeleton rows as
// a permanent empty-data display. See docs/reviews/phase-8j1-screenshot-ux-audit.md #3.

import type React from "react";

export interface EmptyStateAction {
	href?: string;
	label: string;
	onClick?: () => void;
}

export interface EmptyStateProps {
	action?: EmptyStateAction;
	compact?: boolean;
	description?: string;
	icon?: React.ReactNode;
	secondaryAction?: EmptyStateAction;
	title: string;
}

export function EmptyState({
	title,
	description,
	icon,
	action,
	secondaryAction,
	compact = false,
}: EmptyStateProps) {
	return (
		<div
			role="status"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
				padding: compact ? "24px 16px" : "44px 24px",
				color: "var(--fg-3)",
				textAlign: "center",
			}}
		>
			{icon && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 48,
						height: 48,
						marginBottom: 4,
						color: "var(--fg-4)",
						background: "var(--bg-3)",
						borderRadius: 14,
					}}
				>
					{icon}
				</div>
			)}
			<div
				style={{
					fontSize: 14,
					fontWeight: 600,
					color: "var(--fg)",
				}}
			>
				{title}
			</div>
			{description && (
				<div
					style={{
						maxWidth: 380,
						fontSize: 12.5,
						lineHeight: 1.5,
						color: "var(--fg-3)",
					}}
				>
					{description}
				</div>
			)}
			{(action || secondaryAction) && (
				<div
					style={{
						display: "flex",
						gap: 8,
						marginTop: 8,
					}}
				>
					{action &&
						(action.href ? (
							<a className="btn btn-primary btn-sm" href={action.href}>
								{action.label}
							</a>
						) : (
							<button
								className="btn btn-primary btn-sm"
								onClick={action.onClick}
								type="button"
							>
								{action.label}
							</button>
						))}
					{secondaryAction &&
						(secondaryAction.href ? (
							<a className="btn btn-outline btn-sm" href={secondaryAction.href}>
								{secondaryAction.label}
							</a>
						) : (
							<button
								className="btn btn-outline btn-sm"
								onClick={secondaryAction.onClick}
								type="button"
							>
								{secondaryAction.label}
							</button>
						))}
				</div>
			)}
		</div>
	);
}
