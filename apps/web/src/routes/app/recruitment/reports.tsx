import { createFileRoute } from "@tanstack/react-router";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/reports")({
	component: RecruitmentReportsPage,
});

function RecruitmentReportsPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Reports</span>
					</div>
					<h1 className="page-title">Recruitment reports</h1>
					<p className="page-sub">
						Open jobs, candidates per stage, time-to-hire, offer acceptance.
					</p>
				</div>
			</div>
			<RecruitmentTabs />
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
				Reports will arrive in task #93.
			</div>
		</div>
	);
}
