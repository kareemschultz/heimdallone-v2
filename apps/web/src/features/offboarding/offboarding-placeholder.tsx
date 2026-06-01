import type { ReactNode } from "react";

import "@/styles/offboarding.css";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";

interface OffboardingPlaceholderProps {
	/** Honest one-line description of what will live here. */
	description: string;
	icon?: ReactNode;
	/** Tab/section name, e.g. "Cases". */
	title: string;
}

// Honest "Coming later" shell for offboarding sections that ship in later
// Phase 10D checkpoints. Renders the tab strip so navigation stays consistent,
// then a labelled placeholder card — no fake action buttons.
export function OffboardingPlaceholder({
	title,
	description,
	icon,
}: OffboardingPlaceholderProps) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>{title}</span>
					</div>
					<h1 className="page-title">{title}</h1>
					<p className="page-sub">{description}</p>
				</div>
			</div>

			<OffboardingTabs />

			<div
				className="card card-pad"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 320,
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
							marginBottom: 12,
							color: "var(--fg-4)",
							background: "var(--bg-3)",
							borderRadius: 14,
						}}
					>
						{icon}
					</div>
				)}
				<div className="eyebrow" style={{ marginBottom: 8 }}>
					Coming later
				</div>
				<div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
					{title}
				</div>
				<p
					style={{
						maxWidth: 420,
						marginTop: 8,
						fontSize: 13.5,
						color: "var(--fg-3)",
					}}
				>
					{description} This section ships in a later Phase 10D checkpoint.
				</p>
			</div>
		</div>
	);
}
