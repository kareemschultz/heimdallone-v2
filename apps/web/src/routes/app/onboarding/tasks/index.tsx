import { createFileRoute } from "@tanstack/react-router";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/tasks/")({
	component: OnboardingTasksPage,
});

function OnboardingTasksPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Tasks</span>
					</div>
					<h1 className="page-title">Tasks</h1>
					<p className="page-sub">Onboarding tasks across all new hires.</p>
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
				Task list will arrive in Phase 9G checkpoint 4.
			</div>
		</div>
	);
}
