import { cn } from "@Heimdallone/ui/lib/utils";

interface PageHeaderProps {
	actions?: React.ReactNode;
	badge?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
	description?: string;
	title: string;
}

function PageHeader({
	title,
	description,
	badge,
	actions,
	children,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn("head", className)}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 16,
				marginBottom: 20,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<h3>{title}</h3>
					{badge}
				</div>
				{description && (
					<p style={{ fontSize: "13px", color: "var(--fg-3)", margin: 0 }}>
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{actions}
				</div>
			)}
			{children}
		</div>
	);
}

export type { PageHeaderProps };
export { PageHeader };
