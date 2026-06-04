import { Info } from "lucide-react";

/**
 * Banner shown on design-scaffold ("Preview") modules that are NOT backed by a
 * real API yet. Makes clear that any figures on the page are sample/demo data and
 * are not used for live compliance, payroll, audit, or reporting.
 */
export function PreviewBanner({ module }: { module?: string }) {
	return (
		<div
			role="note"
			style={{
				display: "flex",
				gap: 10,
				alignItems: "flex-start",
				padding: "10px 14px",
				marginBottom: 16,
				fontSize: 12.5,
				lineHeight: 1.5,
				color: "var(--fg-2)",
				background: "var(--warning-soft)",
				border: "1px solid var(--warning)",
				borderRadius: 10,
			}}
		>
			<Info
				aria-hidden="true"
				size={16}
				style={{ flexShrink: 0, marginTop: 1 }}
			/>
			<span>
				<strong>Preview module — design scaffold only.</strong> The data shown
				{module ? ` on ${module}` : ""} is sample/demo data and is{" "}
				<strong>not</strong> used for live compliance, payroll, audit, or
				reporting. This area is not yet connected to a backend.
			</span>
		</div>
	);
}
