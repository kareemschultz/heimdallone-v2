import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { GoalFormDialog } from "@/features/performance/goal-form-dialog";
import { KeyResultList } from "@/features/performance/key-result-list";
import {
	fmtDate,
	isActiveObjective,
	objectiveStatusLabel,
	objectiveStatusTone,
	progressTone,
} from "@/features/performance/labels";
import type { ObjectiveDetail } from "@/features/performance/types";
import { canCompleteObjective, canUpdateObjective } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/goals/$id")({
	component: GoalDetailPage,
});

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

function GoalDetailPage() {
	const { id } = useParams({ from: "/app/performance/goals/$id" });
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const qc = useQueryClient();
	const canEdit = canUpdateObjective(role);
	const canComplete = canCompleteObjective(role);
	const [showEdit, setShowEdit] = useState(false);

	const goal = useQuery(
		orpc.performance.objectives.getById.queryOptions({ input: { id } })
	);

	const complete = useMutation({
		mutationFn: () => client.performance.objectives.complete({ id }),
		onSuccess: () => {
			toast.success("Goal marked complete");
			invalidatePerformance(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not complete the goal"),
	});

	const backLink = (
		<Link className="pf-back" to="/app/performance/goals">
			<ChevronLeft size={15} /> Goals
		</Link>
	);

	if (goal.isLoading) {
		return (
			<div className="page">
				{backLink}
				<div className="pf-skeleton" />
			</div>
		);
	}

	if (goal.isError || !goal.data) {
		return (
			<div className="page">
				{backLink}
				<EmptyState
					compact
					description="This goal could not be loaded, or you do not have access to it."
					title="Goal unavailable"
				/>
			</div>
		);
	}

	const o = goal.data as ObjectiveDetail;
	const showComplete = canComplete && isActiveObjective(o.status);

	return (
		<div className="page">
			{backLink}

			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<Link to="/app/performance/goals">Goals</Link>
						<span className="sep">/</span>
						<span>{o.reference}</span>
					</div>
					<h1 className="page-title">{o.title}</h1>
					<div className="pf-detail-badges">
						<Badge tone={objectiveStatusTone(o.status)}>
							{objectiveStatusLabel(o.status)}
						</Badge>
						<span className="pf-sub">{o.employeeName ?? "—"}</span>
					</div>
				</div>
				<div className="pf-actions">
					{canEdit ? (
						<button
							className="btn"
							onClick={() => setShowEdit(true)}
							type="button"
						>
							Edit goal
						</button>
					) : null}
					{showComplete ? (
						<button
							className="btn btn-primary"
							disabled={complete.isPending}
							onClick={() => complete.mutate()}
							type="button"
						>
							Mark complete
						</button>
					) : null}
				</div>
			</div>

			<div className="pf-summary">
				<div className="pf-goal-progress">
					<div className="pf-progress">
						<div className="pf-progress-bar">
							<span
								className={`pf-progress-fill tone-${progressTone(o.progressPercent)}`}
								style={{ width: `${o.progressPercent}%` }}
							/>
						</div>
						<span className="pf-progress-val">{o.progressPercent}%</span>
					</div>
				</div>
				<div className="pf-detail-grid">
					<div className="pf-detail-item">
						<span className="pf-k">Owner</span>
						<span className="pf-v">{o.employeeName ?? "—"}</span>
					</div>
					<div className="pf-detail-item">
						<span className="pf-k">Status</span>
						<span className="pf-v">{objectiveStatusLabel(o.status)}</span>
					</div>
					<div className="pf-detail-item">
						<span className="pf-k">Start date</span>
						<span className="pf-v">{fmtDate(o.startDate)}</span>
					</div>
					<div className="pf-detail-item">
						<span className="pf-k">Target date</span>
						<span className="pf-v">{fmtDate(o.dueDate)}</span>
					</div>
					{o.completedAt ? (
						<div className="pf-detail-item">
							<span className="pf-k">Completed</span>
							<span className="pf-v">{fmtDate(o.completedAt)}</span>
						</div>
					) : null}
				</div>
				{o.description ? (
					<div className="pf-goal-progress">
						<span className="pf-k">Details</span>
						<p className="pf-desc">{o.description}</p>
					</div>
				) : null}
			</div>

			<KeyResultList
				canEdit={canEdit}
				keyResults={o.keyResults}
				objectiveId={o.id}
			/>

			{showEdit ? (
				<GoalFormDialog
					existing={o}
					onClose={() => setShowEdit(false)}
					onDone={() => setShowEdit(false)}
				/>
			) : null}
		</div>
	);
}
