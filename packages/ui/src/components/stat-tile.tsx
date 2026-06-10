import { cn } from "@Heimdallone/ui/lib/utils";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

type StatTone = "default" | "primary" | "success" | "warning" | "danger";
type DeltaDirection = "up" | "down" | "neutral";

const TONE_COLOR: Record<StatTone, string> = {
	default: "var(--fg)",
	primary: "var(--primary)",
	success: "var(--success)",
	warning: "var(--warning)",
	danger: "var(--danger)",
};

const TONE_ICON_BG: Record<StatTone, string> = {
	default: "var(--bg-3)",
	primary: "var(--accent-soft)",
	success: "var(--success-soft)",
	warning: "var(--warning-soft)",
	danger: "var(--danger-soft)",
};

const DELTA_COLOR: Record<DeltaDirection, string> = {
	up: "var(--success)",
	down: "var(--danger)",
	neutral: "var(--fg-3)",
};

interface StatTileDelta {
	/** Direction drives arrow + colour; the consumer decides semantics. */
	direction?: DeltaDirection;
	/** Trailing context, e.g. "vs last month". */
	label?: string;
	value: string;
}

interface StatTileProps {
	className?: string;
	delta?: StatTileDelta;
	/** Small muted line under the value. */
	hint?: string;
	icon?: React.ComponentType<{ size?: number }>;
	isLoading?: boolean;
	label: string;
	/** Makes the whole tile an accessible button. */
	onClick?: () => void;
	tone?: StatTone;
	value: React.ReactNode;
}

function DeltaChip({ delta }: { delta: StatTileDelta }) {
	const direction = delta.direction ?? "neutral";
	const color = DELTA_COLOR[direction];
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 3,
				fontSize: "12px",
				fontWeight: 600,
				color,
				fontVariantNumeric: "tabular-nums",
			}}
		>
			{direction === "up" && <TrendingUp size={13} />}
			{direction === "down" && <TrendingDown size={13} />}
			{direction === "neutral" && <Minus size={13} />}
			{delta.value}
			{delta.label && (
				<span style={{ color: "var(--fg-3)", fontWeight: 400 }}>
					{delta.label}
				</span>
			)}
		</span>
	);
}

function StatTileBody({
	icon: Icon,
	label,
	value,
	hint,
	delta,
	tone = "default",
	isLoading,
}: Omit<StatTileProps, "className" | "onClick">) {
	if (isLoading) {
		return (
			<>
				<div
					className="skeleton"
					style={{ height: 12, width: "55%", borderRadius: 4 }}
				/>
				<div
					className="skeleton"
					style={{ height: 26, width: "40%", borderRadius: 4, marginTop: 12 }}
				/>
			</>
		);
	}
	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
				}}
			>
				<span
					style={{
						fontSize: "12px",
						fontWeight: 500,
						color: "var(--fg-3)",
						letterSpacing: "0.01em",
					}}
				>
					{label}
				</span>
				{Icon && (
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 30,
							height: 30,
							borderRadius: 8,
							background: TONE_ICON_BG[tone],
							color: TONE_COLOR[tone],
							flexShrink: 0,
						}}
					>
						<Icon size={16} />
					</span>
				)}
			</div>
			<div
				style={{
					fontSize: "26px",
					fontWeight: 650,
					lineHeight: 1.1,
					letterSpacing: "-0.02em",
					color: TONE_COLOR[tone],
					fontVariantNumeric: "tabular-nums",
					marginTop: 10,
				}}
			>
				{value}
			</div>
			{(delta || hint) && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginTop: 6,
						flexWrap: "wrap",
					}}
				>
					{delta && <DeltaChip delta={delta} />}
					{hint && (
						<span style={{ fontSize: "12px", color: "var(--fg-3)" }}>
							{hint}
						</span>
					)}
				</div>
			)}
		</>
	);
}

function StatTile({ className, onClick, ...body }: StatTileProps) {
	const baseStyle: React.CSSProperties = {
		display: "flex",
		flexDirection: "column",
		padding: "16px 18px",
		background: "var(--bg-1)",
		border: "1px solid var(--line)",
		borderRadius: "var(--radius)",
		textAlign: "left",
		width: "100%",
	};

	if (onClick) {
		return (
			<button
				className={cn("stat-tile stat-tile-interactive", className)}
				onClick={onClick}
				style={{ ...baseStyle, cursor: "pointer" }}
				type="button"
			>
				<StatTileBody {...body} />
			</button>
		);
	}

	return (
		<div className={cn("stat-tile", className)} style={baseStyle}>
			<StatTileBody {...body} />
		</div>
	);
}

/** Responsive auto-fit grid for a row of StatTiles. */
function StatTileGrid({
	children,
	min = 180,
	className,
}: {
	children: React.ReactNode;
	className?: string;
	min?: number;
}) {
	return (
		<div
			className={cn("stat-tile-grid", className)}
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
				gap: 12,
			}}
		>
			{children}
		</div>
	);
}

export type { DeltaDirection, StatTileDelta, StatTileProps, StatTone };
export { StatTile, StatTileGrid };
