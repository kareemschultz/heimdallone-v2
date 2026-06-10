import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { fmtDate } from "@/features/performance/labels";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import { ReviewCycleForm } from "@/features/performance/review-cycle-form";
import {
	cycleStatusLabel,
	cycleStatusTone,
	cycleTypeLabel,
} from "@/features/performance/review-labels";
import type { CycleRow } from "@/features/performance/review-types";
import { canManageReviewCycles, canViewReviews } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/reviews/")({
	component: ReviewsListPage,
});

const cycleColumns: ColumnDef<CycleRow, unknown>[] = [
	{
		accessorKey: "reference",
		header: "Reference",
		cell: ({ row }) => (
			<span className="pf-mono">{row.original.reference}</span>
		),
	},
	{
		accessorKey: "name",
		header: "Cycle",
		cell: ({ row }) => (
			<Link
				className="pf-name pf-name-link"
				params={{ id: row.original.id }}
				to="/app/performance/reviews/$id"
			>
				{row.original.name}
			</Link>
		),
	},
	{
		accessorKey: "type",
		header: "Type",
		cell: ({ row }) => cycleTypeLabel(row.original.type),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={cycleStatusTone(row.original.status)}>
				{cycleStatusLabel(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "startDate",
		header: "Window",
		cell: ({ row }) => (
			<>
				{fmtDate(row.original.startDate)} – {fmtDate(row.original.endDate)}
			</>
		),
	},
];

function ReviewsListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewReviews(org.memberRole);
	const canManage = canManageReviewCycles(org.memberRole);
	const [showCreate, setShowCreate] = useState(false);

	const list = useQuery(
		orpc.performance.reviewCycles.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Reviews</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="Review cycles are managed by HR and people leaders. Your own review tasks appear under My reviews."
					icon={<ClipboardList size={28} />}
					title="You don't have access to review cycles"
				/>
			</div>
		);
	}

	const rows = (list.data as CycleRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">Reviews</h1>
					<p className="page-sub">
						{rows.length} review cycle{rows.length === 1 ? "" : "s"}
					</p>
				</div>
				{canManage ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						New cycle
					</button>
				) : null}
			</div>

			<PerformanceTabs />

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={cycleColumns}
					data={rows as CycleRow[]}
					emptyState={
						<EmptyState
							compact
							description="No review cycles yet. Create one to start collecting feedback."
							title="No cycles yet"
						/>
					}
					isError={list.isError}
					isLoading={list.isLoading}
				/>
			</div>

			{showCreate ? (
				<ReviewCycleForm onClose={() => setShowCreate(false)} />
			) : null}
		</div>
	);
}
