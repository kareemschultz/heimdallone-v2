import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import "@/styles/onboarding.css";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";

export const Route = createFileRoute("/app/onboarding/employees/$id")({
	component: EmployeeOnboardingDetailPage,
});

function EmployeeOnboardingDetailPage() {
	const { id } = Route.useParams();
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/onboarding/employees"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Employee onboarding
						</Link>
						<span className="sep">/</span>
						<span style={{ fontFamily: "var(--font-mono, monospace)" }}>
							{id.slice(0, 8)}…
						</span>
					</div>
					<h1 className="page-title">Onboarding</h1>
					<p className="page-sub">
						Tasks, documents, acknowledgements, activity.
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
				Onboarding detail will arrive in Phase 9G checkpoint 3.
			</div>
		</div>
	);
}
