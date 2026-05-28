import { createFileRoute } from "@tanstack/react-router";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/pipeline")({
	component: PipelinePage,
});

function PipelinePage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Pipeline</span>
					</div>
					<h1 className="page-title">Pipeline</h1>
					<p className="page-sub">
						Drag candidates between stages, or use the Move menu on each card.
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
				Pipeline kanban (with @dnd-kit) will arrive in task #90.
			</div>
		</div>
	);
}
