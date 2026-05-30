import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

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
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 8,
					minHeight: 220,
				}}
			>
				<ClipboardList aria-hidden="true" size={28} />A combined task view
				across all new hires is coming soon. For now, open an employee's
				onboarding to manage their tasks.
			</div>
		</div>
	);
}
