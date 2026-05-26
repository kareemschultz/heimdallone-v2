import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/onboarding")({
	component: OnboardingPage,
});

function OnboardingPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
					</div>
					<h1 className="page-title">Onboarding</h1>
					<p className="page-sub">New hire workflows and task tracking</p>
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
				<h3>Onboarding</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					New hire workflows and task tracking. This module will be implemented
					in a future phase.
				</p>
			</div>
		</div>
	);
}
