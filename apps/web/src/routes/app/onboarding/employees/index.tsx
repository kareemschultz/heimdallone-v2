import { createFileRoute } from "@tanstack/react-router";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/employees/")({
	component: EmployeeOnboardingListPage,
});

function EmployeeOnboardingListPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Employees</span>
					</div>
					<h1 className="page-title">Employee onboarding</h1>
					<p className="page-sub">
						Who is onboarding right now and how far along.
					</p>
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
				Employee onboarding list will arrive in Phase 9G checkpoint 3.
			</div>
		</div>
	);
}
