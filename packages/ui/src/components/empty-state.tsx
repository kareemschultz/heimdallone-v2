import { cn } from "@Heimdallone/ui/lib/utils";

interface EmptyStateProps {
	action?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
	description?: string;
	icon?: React.ComponentType<{ size?: number; className?: string }>;
	title: string;
}

function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 py-16 text-center",
				className
			)}
		>
			{Icon && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 48,
						height: 48,
						borderRadius: 12,
						background: "var(--bg-3)",
						color: "var(--fg-3)",
					}}
				>
					<Icon size={22} />
				</div>
			)}
			<h4
				style={{
					fontSize: "15px",
					fontWeight: 600,
					color: "var(--fg)",
					letterSpacing: "-0.01em",
				}}
			>
				{title}
			</h4>
			{description && (
				<p
					style={{
						fontSize: "13px",
						color: "var(--fg-3)",
						maxWidth: 320,
						lineHeight: 1.5,
					}}
				>
					{description}
				</p>
			)}
			{action && (
				<button
					className="btn btn-primary"
					onClick={action.onClick}
					style={{ marginTop: 8 }}
					type="button"
				>
					{action.label}
				</button>
			)}
		</div>
	);
}

export type { EmptyStateProps };
export { EmptyState };
