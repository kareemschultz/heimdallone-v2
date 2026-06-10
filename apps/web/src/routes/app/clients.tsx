import { createFileRoute, Link } from "@tanstack/react-router";
import { PreviewBanner } from "@/components/preview-banner";

export const Route = createFileRoute("/app/clients")({
	component: ClientsPage,
});

function ClientsPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Clients</span>
					</div>
					<h1 className="page-title">Client Portal</h1>
					<p className="page-sub">
						Planned external client-facing portal — distinct from CRM
					</p>
				</div>
			</div>
			<PreviewBanner module="the Clients page" />
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
					Planned
				</div>
				<h3>Client Portal</h3>
				<p
					style={{
						maxWidth: "460px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					A planned external-facing portal for shared-services clients. For
					internal customer, lead, and deal management, the{" "}
					<Link
						style={{ color: "var(--accent)", textDecoration: "underline" }}
						to="/app/crm/customers"
					>
						CRM module
					</Link>{" "}
					is already live.
				</p>
			</div>
		</div>
	);
}
