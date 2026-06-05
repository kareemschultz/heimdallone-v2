import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { GoalFormDialog } from "@/features/performance/goal-form-dialog";
import {
	fmtDate,
	isActiveObjective,
	objectiveStatusLabel,
	objectiveStatusTone,
	progressTone,
} from "@/features/performance/labels";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import type { ObjectiveRow } from "@/features/performance/types";
import { canCompleteObjective, canCreateObjective } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/my-goals")({
	component: MyGoalsPage,
});

const FILTERS = [
	{ key: "active", label: "Active" },
	{ key: "completed", label: "Completed" },
	{ key: "all", label: "All" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(o: ObjectiveRow, filter: FilterKey): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "completed") {
		return o.status === "completed";
	}
	return isActiveObjective(o.status);
}

function MyGoalCard({
	o,
	canComplete,
	onComplete,
	completing,
}: {
	canComplete: boolean;
	completing: boolean;
	o: ObjectiveRow;
	onComplete: (id: string) => void;
}) {
	const showComplete = canComplete && isActiveObjective(o.status);
	return (
		<div className="pf-card">
			<div className="pf-card-top">
				<Link
					className="pf-card-title pf-name-link"
					params={{ id: o.id }}
					to="/app/performance/goals/$id"
				>
					{o.title}
				</Link>
				<Badge tone={objectiveStatusTone(o.status)}>
					{objectiveStatusLabel(o.status)}
				</Badge>
			</div>
			<div className="pf-progress">
				<div className="pf-progress-bar">
					<span
						className={`pf-progress-fill tone-${progressTone(o.progressPercent)}`}
						style={{ width: `${o.progressPercent}%` }}
					/>
				</div>
				<span className="pf-progress-val">{o.progressPercent}%</span>
			</div>
			<div className="pf-card-meta">
				<span className="pf-sub">Target {fmtDate(o.dueDate)}</span>
				{showComplete ? (
					<button
						className="btn btn-sm"
						disabled={completing}
						onClick={() => onComplete(o.id)}
						type="button"
					>
						Mark complete
					</button>
				) : null}
			</div>
		</div>
	);
}

function MyGoalsPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const qc = useQueryClient();
	const canOwn = canCreateObjective(role);
	const canComplete = canCompleteObjective(role);

	const [filter, setFilter] = useState<FilterKey>("active");
	const [showCreate, setShowCreate] = useState(false);

	const list = useQuery(
		orpc.performance.objectives.list.queryOptions({
			input: { mine: true, includeArchived: true },
			enabled: canOwn,
		})
	);

	const complete = useMutation({
		mutationFn: (id: string) => client.performance.objectives.complete({ id }),
		onSuccess: () => {
			toast.success("Goal marked complete");
			qc.invalidateQueries({
				predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
			});
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not complete the goal"),
	});

	if (!canOwn) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">My goals</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="Goal ownership is available to employees, managers, and HR."
					icon={<Target size={28} />}
					title="No goals to show"
				/>
			</div>
		);
	}

	const allRows = (list.data as ObjectiveRow[] | undefined) ?? [];
	const rows = allRows.filter((o) => matchesFilter(o, filter));

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">My goals</h1>
					<p className="page-sub">Your own goals and progress.</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setShowCreate(true)}
					type="button"
				>
					New goal
				</button>
			</div>

			<PerformanceTabs />

			<div className="pf-filter-pills">
				{FILTERS.map((f) => (
					<button
						className={`pf-pill ${filter === f.key ? "active" : ""}`}
						key={f.key}
						onClick={() => setFilter(f.key)}
						type="button"
					>
						{f.label}
					</button>
				))}
			</div>

			{list.isLoading ? <div className="pf-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load your goals. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="You have no goals in this view. Create one to get started."
					title="No goals yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="pf-cards">
					{rows.map((o) => (
						<MyGoalCard
							canComplete={canComplete}
							completing={complete.isPending}
							key={o.id}
							o={o}
							onComplete={(id) => complete.mutate(id)}
						/>
					))}
				</div>
			) : null}

			{showCreate ? (
				<GoalFormDialog
					onClose={() => setShowCreate(false)}
					onDone={() => setShowCreate(false)}
				/>
			) : null}
		</div>
	);
}
