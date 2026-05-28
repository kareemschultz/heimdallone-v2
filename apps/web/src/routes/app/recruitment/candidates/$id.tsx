import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/candidates/$id")({
	component: CandidateDetailPage,
});

function CandidateDetailPage() {
	const { id } = Route.useParams();

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/recruitment/candidates"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Candidates
						</Link>
						<span className="sep">/</span>
						<span style={{ fontFamily: "var(--font-mono, monospace)" }}>
							{id.slice(0, 8)}…
						</span>
					</div>
					<h1 className="page-title">Candidate</h1>
					<p className="page-sub">
						Profile, applications, interviews, notes and documents.
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
				Candidate detail (5 tabs) will arrive in task #89.
			</div>
		</div>
	);
}
