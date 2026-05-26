import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/leave")({
	component: LeavePage,
});

function LeavePage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Leave Management</span>
					</div>
					<h1 className="page-title">Leave Management</h1>
					<p className="page-sub">
						Team calendar, approvals, and leave balances
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
				<h3>Leave Management</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Team calendar, approvals, and leave balances. This module will be
					implemented in a future phase.
				</p>
			</div>
		</div>
	);
}
