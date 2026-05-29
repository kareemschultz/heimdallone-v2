import { createFileRoute } from "@tanstack/react-router";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/documents/")({
	component: OnboardingDocumentsPage,
});

function OnboardingDocumentsPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Documents</span>
					</div>
					<h1 className="page-title">Documents</h1>
					<p className="page-sub">Document requests across onboardings.</p>
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
				Documents UI will arrive in Phase 9G checkpoint 5.
			</div>
		</div>
	);
}
