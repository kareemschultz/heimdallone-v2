import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";

export const Route = createFileRoute("/app/recruitment/offers/$id")({
	component: OfferDetailPage,
});

function OfferDetailPage() {
	const { id } = Route.useParams();

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/recruitment/offers"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Offers
						</Link>
						<span className="sep">/</span>
						<span style={{ fontFamily: "var(--font-mono, monospace)" }}>
							{id.slice(0, 8)}…
						</span>
					</div>
					<h1 className="page-title">Offer</h1>
					<p className="page-sub">Offer details, approvals, status timeline.</p>
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
				Offer detail will arrive in task #92.
			</div>
		</div>
	);
}
