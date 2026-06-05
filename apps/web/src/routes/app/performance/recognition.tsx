import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { AwardRecognitionForm } from "@/features/performance/award-recognition-form";
import { Badge } from "@/features/performance/badge";
import { fmtDate } from "@/features/performance/labels";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import {
	type RecognitionRow,
	recognitionSourceLabel,
} from "@/features/performance/types";
import { canAwardRecognition, canViewRecognition } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/recognition")({
	component: RecognitionPage,
});

function RecognitionPage() {
	const org = useContext(OrgCtx);
	const canView = canViewRecognition(org.memberRole);
	const canAward = canAwardRecognition(org.memberRole);
	const [showAward, setShowAward] = useState(false);

	const list = useQuery(
		orpc.performance.recognition.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Recognition</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="Recognition is visible to your team and people leaders."
					icon={<Award size={28} />}
					title="You don't have access to recognition"
				/>
			</div>
		);
	}

	const rows = (list.data as RecognitionRow[] | undefined) ?? [];
	const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Recognition</h1>
					<p className="page-sub">
						{rows.length} recognition{rows.length === 1 ? "" : "s"} ·{" "}
						{totalPoints} points
					</p>
				</div>
				{canAward ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowAward(true)}
						type="button"
					>
						Recognise someone
					</button>
				) : null}
			</div>

			<PerformanceTabs />

			<p className="pf-not-pay">
				Recognition points are an appreciation record only. They are not payroll
				or bonus pay.
			</p>

			{list.isLoading ? <div className="pf-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load recognition. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No recognition yet. Be the first to recognise a teammate."
					title="No recognition yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="pf-cards">
					{rows.map((r) => (
						<div className="pf-card" key={r.id}>
							<div className="pf-card-top">
								<span className="pf-name">{r.employeeName ?? "—"}</span>
								<Badge tone="info">{`${r.points} points`}</Badge>
							</div>
							<p className="pf-desc">{r.reason ?? "Recognised."}</p>
							<div className="pf-card-meta">
								<span className="pf-sub">
									{recognitionSourceLabel(r.source)}
									{r.awardedByName ? ` · by ${r.awardedByName}` : ""}
								</span>
								<span className="pf-sub">{fmtDate(r.createdAt)}</span>
							</div>
						</div>
					))}
				</div>
			) : null}

			{showAward ? (
				<AwardRecognitionForm onClose={() => setShowAward(false)} />
			) : null}
		</div>
	);
}
