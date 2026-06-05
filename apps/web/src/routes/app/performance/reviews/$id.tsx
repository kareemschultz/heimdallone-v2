import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { fmtDate } from "@/features/performance/labels";
import {
	cycleStatusLabel,
	cycleStatusTone,
	cycleTypeLabel,
} from "@/features/performance/review-labels";
import { ReviewResultsPanel } from "@/features/performance/review-results-panel";
import type {
	CycleRow,
	ReviewResults,
} from "@/features/performance/review-types";
import { canManageReviewCycles, canViewReviews } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/reviews/$id")({
	component: ReviewCycleDetailPage,
});

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

function ResultsViewer({ cycleId }: { cycleId: string }) {
	const [subjectId, setSubjectId] = useState("");
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = ((employees.data as { data?: EmployeeOption[] } | undefined)
		?.data ?? []) as EmployeeOption[];

	const results = useQuery(
		orpc.performance.reviewCycles.responses.results.queryOptions({
			input: { cycleId, subjectEmployeeId: subjectId },
			enabled: Boolean(subjectId),
		})
	);

	return (
		<div className="pf-panel">
			<div className="pf-panel-head">
				<span className="pf-section-title">Results</span>
			</div>
			<label className="pf-field" htmlFor="pf-results-subject">
				<span>View feedback for</span>
				<select
					id="pf-results-subject"
					onChange={(e) => setSubjectId(e.target.value)}
					value={subjectId}
				>
					<option value="">Choose an employee…</option>
					{emps.map((e) => (
						<option key={e.id} value={e.id}>
							{e.firstName} {e.lastName ?? ""}
						</option>
					))}
				</select>
			</label>
			{subjectId && results.isLoading ? <div className="pf-skeleton" /> : null}
			{subjectId && results.isError ? (
				<EmptyState
					compact
					description="You do not have access to these results, or they could not be loaded."
					title="Results unavailable"
				/>
			) : null}
			{subjectId && results.data ? (
				<ReviewResultsPanel
					results={results.data as unknown as ReviewResults}
				/>
			) : null}
		</div>
	);
}

function ReviewCycleDetailPage() {
	const { id } = useParams({ from: "/app/performance/reviews/$id" });
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = canManageReviewCycles(org.memberRole);
	const canView = canViewReviews(org.memberRole);

	const cycleQuery = useQuery(
		orpc.performance.reviewCycles.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	const activate = useMutation({
		mutationFn: () => client.performance.reviewCycles.activate({ id }),
		onSuccess: () => {
			toast.success("Cycle activated");
			invalidatePerformance(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not activate the cycle"),
	});
	const close = useMutation({
		mutationFn: () => client.performance.reviewCycles.close({ id }),
		onSuccess: () => {
			toast.success("Cycle closed");
			invalidatePerformance(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not close the cycle"),
	});

	const backLink = (
		<Link className="pf-back" to="/app/performance/reviews">
			<ChevronLeft size={15} /> Reviews
		</Link>
	);

	const rows = (cycleQuery.data as CycleRow[] | undefined) ?? [];
	const cycle = rows.find((c) => c.id === id);

	if (!canView) {
		return (
			<div className="page">
				{backLink}
				<EmptyState
					compact
					description="Review cycles are managed by HR and people leaders."
					title="No access"
				/>
			</div>
		);
	}

	if (cycleQuery.isLoading) {
		return (
			<div className="page">
				{backLink}
				<div className="pf-skeleton" />
			</div>
		);
	}

	if (!cycle) {
		return (
			<div className="page">
				{backLink}
				<EmptyState
					compact
					description="This review cycle could not be found, or you do not have access to it."
					title="Cycle unavailable"
				/>
			</div>
		);
	}

	return (
		<div className="page">
			{backLink}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<Link to="/app/performance/reviews">Reviews</Link>
						<span className="sep">/</span>
						<span>{cycle.reference}</span>
					</div>
					<h1 className="page-title">{cycle.name}</h1>
					<div className="pf-detail-badges">
						<Badge tone={cycleStatusTone(cycle.status)}>
							{cycleStatusLabel(cycle.status)}
						</Badge>
						<span className="pf-sub">{cycleTypeLabel(cycle.type)}</span>
					</div>
				</div>
				{canManage ? (
					<div className="pf-actions">
						{cycle.status === "draft" ? (
							<button
								className="btn btn-primary"
								disabled={activate.isPending}
								onClick={() => activate.mutate()}
								type="button"
							>
								Activate
							</button>
						) : null}
						{cycle.status === "active" ? (
							<button
								className="btn"
								disabled={close.isPending}
								onClick={() => close.mutate()}
								type="button"
							>
								Close cycle
							</button>
						) : null}
					</div>
				) : null}
			</div>

			<div className="pf-summary">
				<div className="pf-detail-grid">
					<div className="pf-detail-item">
						<span className="pf-k">Type</span>
						<span className="pf-v">{cycleTypeLabel(cycle.type)}</span>
					</div>
					<div className="pf-detail-item">
						<span className="pf-k">Window</span>
						<span className="pf-v">
							{fmtDate(cycle.startDate)} – {fmtDate(cycle.endDate)}
						</span>
					</div>
					<div className="pf-detail-item">
						<span className="pf-k">Peer anonymity</span>
						<span className="pf-v">
							{cycle.isAnonymousPeers
								? `Anonymous · min ${cycle.anonymityThreshold}`
								: "Named"}
						</span>
					</div>
				</div>
				{cycle.description ? (
					<div className="pf-goal-progress">
						<span className="pf-k">Description</span>
						<p className="pf-desc">{cycle.description}</p>
					</div>
				) : null}
			</div>

			<ResultsViewer cycleId={cycle.id} />
		</div>
	);
}
