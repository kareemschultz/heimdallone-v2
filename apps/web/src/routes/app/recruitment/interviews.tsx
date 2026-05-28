import { createFileRoute } from "@tanstack/react-router";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/interviews")({
	component: InterviewsPage,
});

function InterviewsPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Interviews</span>
					</div>
					<h1 className="page-title">Interviews</h1>
					<p className="page-sub">
						Scheduled and past interviews. Calendar view is deferred.
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
				Interviews list will arrive in task #91.
			</div>
		</div>
	);
}
