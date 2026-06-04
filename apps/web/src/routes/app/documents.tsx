import { createFileRoute } from "@tanstack/react-router";
import { PreviewBanner } from "@/components/preview-banner";

export const Route = createFileRoute("/app/documents")({
	component: DocumentsPage,
});

function DocumentsPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Documents</span>
					</div>
					<h1 className="page-title">Documents</h1>
					<p className="page-sub">Document workflows, requests, and storage</p>
				</div>
			</div>
			<PreviewBanner module="the Documents page" />
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
				<h3>Documents</h3>
				<p
					style={{
						maxWidth: "420px",
						marginTop: "8px",
						fontSize: "13.5px",
						color: "var(--fg-3)",
					}}
				>
					Document workflows, requests, and storage. This module will be
					implemented in a future phase.
				</p>
			</div>
		</div>
	);
}
