import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/templates/$id")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const { id } = Route.useParams();
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/onboarding/templates"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Templates
						</Link>
						<span className="sep">/</span>
						<span style={{ fontFamily: "var(--font-mono, monospace)" }}>
							{id.slice(0, 8)}…
						</span>
					</div>
					<h1 className="page-title">Template</h1>
					<p className="page-sub">Template detail and ordered tasks.</p>
				</div>
			</div>
			<OnboardingTabs />
			<div
				className="card card-pad"
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 240,
					color: "var(--fg-3)",
				}}
			>
				Template detail will arrive in Phase 9G checkpoint 2.
			</div>
		</div>
	);
}
