import { cn } from "@Heimdallone/ui/lib/utils";

type BadgeVariant =
	| "default"
	| "success"
	| "warning"
	| "danger"
	| "info"
	| "accent";

interface StatusBadgeProps {
	children: React.ReactNode;
	className?: string;
	dot?: boolean;
	variant?: BadgeVariant;
}

function StatusBadge({
	variant = "default",
	dot = false,
	children,
	className,
}: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"badge",
				variant !== "default" && `badge-${variant}`,
				className
			)}
		>
			{dot && <span className="badge-dot" />}
			{children}
		</span>
	);
}

type PillStatusVariant =
	| "active"
	| "probation"
	| "notice"
	| "contract"
	| "archived";

interface PillStatusProps {
	children: React.ReactNode;
	className?: string;
	status: PillStatusVariant;
}

function PillStatus({ status, children, className }: PillStatusProps) {
	return (
		<span className={cn("pill-status", status, className)}>
			<span className="badge-dot" />
			{children}
		</span>
	);
}

export type {
	BadgeVariant,
	PillStatusProps,
	PillStatusVariant,
	StatusBadgeProps,
};
export { PillStatus, StatusBadge };
