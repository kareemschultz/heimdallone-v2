import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/performance")({
	component: PerformancePage,
});

function PerformancePage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Performance</h1>
					<p className="page-sub">Goals, reviews, and feedback cycles</p>
				</div>
			</div>
			<div
				className="card card-pad"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "400px",
					textAlign: "center",
				}}
			>
				<div className="eyebrow" style={{ marginBottom: "12px" }}>
					Coming Soon
				</div>
				<h3>Performance</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Goals, reviews, and feedback cycles. This module will be implemented
					in a future phase.
				</p>
			</div>
		</div>
	);
}
