import { createFileRoute } from "@tanstack/react-router";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/offers/")({
	component: OffersListPage,
});

function OffersListPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Offers</span>
					</div>
					<h1 className="page-title">Offers</h1>
					<p className="page-sub">Drafted, sent, and resolved offers.</p>
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
				Offers list will arrive in task #92.
			</div>
		</div>
	);
}
