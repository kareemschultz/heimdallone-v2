import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import {
	isOpenRequest,
	relationshipLabel,
	requestStatusLabel,
	requestStatusTone,
} from "@/features/performance/review-labels";
import { ReviewResponseForm } from "@/features/performance/review-response-form";
import { ReviewResultsPanel } from "@/features/performance/review-results-panel";
import type {
	CycleRow,
	ReviewRequestRow,
	ReviewResults,
} from "@/features/performance/review-types";
import { canSubmitReview } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/my-reviews")({
	component: MyReviewsPage,
});

// "Feedback about me" — renders the caller's OWN results (the subject defaults to
// the caller server-side). The peer block arrives hidden/aggregated for a regular
// subject; raw (named) is only ever returned to HR, so a subject can never see a
// peer's identity here.
function FeedbackAboutMe({ cycles }: { cycles: CycleRow[] }) {
	const [cycleId, setCycleId] = useState("");
	const results = useQuery(
		orpc.performance.reviewCycles.responses.results.queryOptions({
			input: { cycleId },
			enabled: Boolean(cycleId),
		})
	);

	if (cycles.length === 0) {
		return null;
	}

	return (
		<div className="pf-panel">
			<div className="pf-panel-head">
				<span className="pf-section-title">Feedback about me</span>
			</div>
			<label className="pf-field" htmlFor="pf-myfeedback-cycle">
				<span>Choose a cycle</span>
				<select
					id="pf-myfeedback-cycle"
					onChange={(e) => setCycleId(e.target.value)}
					value={cycleId}
				>
					<option value="">Choose a review cycle…</option>
					{cycles.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</label>
			{cycleId && results.isLoading ? <div className="pf-skeleton" /> : null}
			{cycleId && results.isError ? (
				<EmptyState
					compact
					description="There is no feedback for you in this cycle yet."
					title="Nothing to show"
				/>
			) : null}
			{cycleId && results.data ? (
				<ReviewResultsPanel
					results={results.data as unknown as ReviewResults}
				/>
			) : null}
		</div>
	);
}

function MyReviewsPage() {
	const org = useContext(OrgCtx);
	const canDo = canSubmitReview(org.memberRole);
	const [active, setActive] = useState<ReviewRequestRow | null>(null);

	const assigned = useQuery(
		orpc.performance.reviewCycles.requests.assignedToMe.queryOptions({
			input: {},
			enabled: canDo,
		})
	);
	const cycles = useQuery(
		orpc.performance.reviewCycles.list.queryOptions({
			input: {},
			enabled: canDo,
		})
	);

	if (!canDo) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">My reviews</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="Review tasks are assigned to participants in a cycle."
					icon={<ClipboardList size={28} />}
					title="No review tasks for you"
				/>
			</div>
		);
	}

	const requests = (assigned.data as ReviewRequestRow[] | undefined) ?? [];
	const open = requests.filter((r) => isOpenRequest(r.status));
	const done = requests.filter((r) => !isOpenRequest(r.status));
	const cycleRows = (cycles.data as CycleRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">My reviews</h1>
					<p className="page-sub">Reviews you have been asked to complete.</p>
				</div>
			</div>

			<PerformanceTabs />

			<div className="pf-panel">
				<div className="pf-panel-head">
					<span className="pf-section-title">To complete</span>
				</div>
				{assigned.isLoading ? <div className="pf-skeleton" /> : null}
				{assigned.isError ? (
					<EmptyState
						compact
						description="Could not load your review tasks. Try again."
						title="Something went wrong"
					/>
				) : null}
				{!(assigned.isLoading || assigned.isError) && open.length === 0 ? (
					<EmptyState
						compact
						description="You have no reviews to complete right now."
						title="All caught up"
					/>
				) : null}
				{open.map((r) => (
					<div className="pf-card" key={r.id}>
						<div className="pf-card-top">
							<span className="pf-name">{r.subjectName ?? "—"}</span>
							<Badge tone="info">{relationshipLabel(r.relationship)}</Badge>
						</div>
						<div className="pf-card-meta">
							<Badge tone={requestStatusTone(r.status)}>
								{requestStatusLabel(r.status)}
							</Badge>
							<button
								className="btn btn-sm btn-primary"
								onClick={() => setActive(r)}
								type="button"
							>
								Give feedback
							</button>
						</div>
					</div>
				))}
			</div>

			{done.length > 0 ? (
				<div className="pf-panel">
					<div className="pf-panel-head">
						<span className="pf-section-title">Completed</span>
					</div>
					{done.map((r) => (
						<div className="pf-card" key={r.id}>
							<div className="pf-card-top">
								<span className="pf-name">{r.subjectName ?? "—"}</span>
								<Badge tone={requestStatusTone(r.status)}>
									{requestStatusLabel(r.status)}
								</Badge>
							</div>
						</div>
					))}
				</div>
			) : null}

			<FeedbackAboutMe cycles={cycleRows} />

			{active ? (
				<ReviewResponseForm onClose={() => setActive(null)} request={active} />
			) : null}
		</div>
	);
}
