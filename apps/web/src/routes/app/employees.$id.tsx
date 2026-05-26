import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/employees/$id")({
	component: EmployeeProfilePage,
});

function EmployeeProfilePage() {
	const { id } = Route.useParams();

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Employees</span>
						<span className="sep">/</span>
						<span>{id}</span>
					</div>
					<h1 className="page-title">Employee Profile</h1>
					<p className="page-sub">Detailed employee view</p>
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
					People
				</div>
				<h3>Employee Profile</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Detailed employee view. This module will be implemented in a future
					phase.
				</p>
			</div>
		</div>
	);
}
