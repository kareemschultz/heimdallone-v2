import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/geofencing")({
	component: GeofencingPage,
});

function GeofencingPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Geofencing</span>
					</div>
					<h1 className="page-title">Geofencing</h1>
					<p className="page-sub">
						Zone definitions and location-based check-ins
					</p>
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
				<h3>Geofencing</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Zone definitions and location-based check-ins. This module will be
					implemented in a future phase.
				</p>
			</div>
		</div>
	);
}
