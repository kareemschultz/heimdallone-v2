import { createFileRoute } from "@tanstack/react-router";
import { PreviewBanner } from "@/components/preview-banner";

export const Route = createFileRoute("/app/countries")({
	component: CountriesPage,
});

function CountriesPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Countries & Tax</span>
					</div>
					<h1 className="page-title">Countries & Tax</h1>
					<p className="page-sub">
						Country profiles, tax tables, and statutory rules
					</p>
				</div>
			</div>
			<PreviewBanner module="the Countries & Tax page" />
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
				<h3>Countries & Tax</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Country profiles, tax tables, and statutory rules. This module will be
					implemented in a future phase.
				</p>
			</div>
		</div>
	);
}
