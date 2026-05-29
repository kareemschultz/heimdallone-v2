import { createFileRoute } from "@tanstack/react-router";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/templates/")({
	component: TemplatesListPage,
});

function TemplatesListPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Templates</span>
					</div>
					<h1 className="page-title">Templates</h1>
					<p className="page-sub">Reusable onboarding checklists.</p>
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
				Templates UI will arrive in Phase 9G checkpoint 2.
			</div>
		</div>
	);
}
