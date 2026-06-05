import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, Target } from "lucide-react";
import { useContext } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import {
	isActiveObjective,
	isAtRiskObjective,
	objectiveStatusLabel,
	objectiveStatusTone,
} from "@/features/performance/labels";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import type {
	ObjectiveRow,
	RecognitionRow,
} from "@/features/performance/types";
import {
	canCreateObjective,
	canViewPerformance,
	canViewRecognition,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/")({
	component: PerformanceOverviewPage,
});

const ATTENTION_LIST_LIMIT = 5;
const RECOGNITION_PREVIEW_LIMIT = 4;

function isOverdue(o: ObjectiveRow): boolean {
	if (!(o.dueDate && isActiveObjective(o.status))) {
		return false;
	}
	const due = new Date(o.dueDate);
	return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function AttentionGroup({
	head,
	items,
}: {
	head: string;
	items: ObjectiveRow[];
}) {
	return (
		<div className="pf-attention-group">
			<div className="pf-attention-head">
				{head} ({items.length})
			</div>
			{items.length === 0 ? (
				<div className="pf-attention-empty">Nothing here right now.</div>
			) : (
				items.slice(0, ATTENTION_LIST_LIMIT).map((o) => (
					<div className="pf-attention-item" key={o.id}>
						<span className="pf-mono">{o.reference}</span>
						<Link
							className="pf-name pf-name-link"
							params={{ id: o.id }}
							to="/app/performance/goals/$id"
						>
							{o.title}
						</Link>
						<span className="pf-sub">{o.employeeName ?? "—"}</span>
						<Badge tone={objectiveStatusTone(o.status)}>
							{objectiveStatusLabel(o.status)}
						</Badge>
					</div>
				))
			)}
		</div>
	);
}

// Recognition points are an appreciation ledger, NOT pay. This widget is
// strictly read-only (no award affordance lands until a later checkpoint) and
// carries explicit "not payroll" copy so it can never be mistaken for a bonus.
function RecognitionPreview() {
	const recognition = useQuery(
		orpc.performance.recognition.list.queryOptions({ input: {} })
	);
	const rows = (recognition.data as RecognitionRow[] | undefined) ?? [];
	// Surface a load failure rather than letting it read as "no recognition"
	// (error ≠ healthy empty). Loading / genuinely-empty stay quiet — this is an
	// optional preview widget.
	if (recognition.isError) {
		return (
			<div className="pf-panel">
				<div className="pf-panel-head">
					<span className="pf-section-title">
						<Award size={14} /> Recent recognition
					</span>
				</div>
				<EmptyState
					compact
					description="Recognition could not be loaded right now. Please try again."
					title="Something went wrong"
				/>
			</div>
		);
	}
	if (recognition.isLoading || rows.length === 0) {
		return null;
	}
	return (
		<div className="pf-panel">
			<div className="pf-panel-head">
				<span className="pf-section-title">
					<Award size={14} /> Recent recognition
				</span>
			</div>
			<p className="pf-not-pay">
				Recognition points are appreciation records only. They are not payroll
				or bonus pay.
			</p>
			{rows.slice(0, RECOGNITION_PREVIEW_LIMIT).map((r) => (
				<div className="pf-attention-item" key={r.id}>
					<span className="pf-name">{r.employeeName ?? "—"}</span>
					<span className="pf-sub">{r.reason ?? "Recognised"}</span>
					<Badge tone="info">{`${r.points} points`}</Badge>
				</div>
			))}
		</div>
	);
}

// Employees reach Performance through My goals only. We render a landing that
// LINKS there rather than auto-redirecting — OrgCtx resolves the member role
// asynchronously (defaults to "employee" until the active membership loads), so
// a render-time redirect would also bounce viewers/admins on first paint
// (lesson #84).
function EmployeeLanding({ orgName }: { orgName: string }) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Performance</h1>
					<p className="page-sub">Your goals and progress.</p>
				</div>
			</div>
			<EmptyState
				action={{ label: "View my goals", href: "/app/performance/my-goals" }}
				description="Set goals, track key results, and see how your work is progressing."
				icon={<Target size={28} />}
				title="Your goals live here"
			/>
		</div>
	);
}

function PerformanceOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewPerformance(org.memberRole);
	const canOwn = canCreateObjective(org.memberRole);

	const objectives = useQuery(
		orpc.performance.objectives.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		if (canOwn) {
			return <EmployeeLanding orgName={org.orgName} />;
		}
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Performance</h1>
					</div>
				</div>
				<EmptyState
					description="Performance is available to HR, team managers, and people leaders."
					icon={<Target size={28} />}
					title="You don't have access to performance"
				/>
			</div>
		);
	}

	const rows = (objectives.data as ObjectiveRow[] | undefined) ?? [];
	const active = rows.filter((o) => isActiveObjective(o.status));
	const atRisk = rows.filter((o) => isAtRiskObjective(o.status));
	const completed = rows.filter((o) => o.status === "completed");
	const overdue = rows.filter(isOverdue);

	const tiles = [
		{ label: "Active", value: active.length, alert: false },
		{ label: "At risk", value: atRisk.length, alert: atRisk.length > 0 },
		{ label: "Completed", value: completed.length, alert: false },
		{ label: "Overdue", value: overdue.length, alert: overdue.length > 0 },
	];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Performance</h1>
					<p className="page-sub">
						Goals and progress across your team — objectives, key results, and
						recognition.
					</p>
				</div>
			</div>

			<PerformanceTabs />

			<div className="pf-tiles">
				{tiles.map((t) => (
					<div className={`pf-tile ${t.alert ? "alert" : ""}`} key={t.label}>
						<span className="pf-tile-val">{t.value}</span>
						<span className="pf-tile-lbl">{t.label}</span>
					</div>
				))}
			</div>

			{objectives.isLoading ? <div className="pf-skeleton" /> : null}
			{objectives.isError ? (
				<EmptyState
					compact
					description="Could not load the performance overview. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{objectives.isLoading || objectives.isError ? null : (
				<div className="pf-attention">
					<div className="pf-attention-title">Needs attention</div>
					<AttentionGroup head="At risk" items={atRisk} />
					<AttentionGroup head="Overdue" items={overdue} />
				</div>
			)}

			{canViewRecognition(org.memberRole) ? <RecognitionPreview /> : null}

			<div className="pf-quicklinks">
				<Link className="pf-quicklink" to="/app/performance/goals">
					<span className="pf-ql-title">All goals</span>
					<span className="pf-ql-sub">Browse, filter, and open a goal</span>
				</Link>
			</div>
		</div>
	);
}
