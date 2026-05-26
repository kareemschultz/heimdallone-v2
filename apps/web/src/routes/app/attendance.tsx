import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/attendance")({
	component: AttendancePage,
});

function AttendancePage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Attendance</span>
					</div>
					<h1 className="page-title">Attendance</h1>
					<p className="page-sub">
						Biometric feed, exception queue, and time tracking
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
				<h3>Attendance</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Biometric feed, exception queue, and time tracking. This module will
					be implemented in a future phase.
				</p>
			</div>
		</div>
	);
}
