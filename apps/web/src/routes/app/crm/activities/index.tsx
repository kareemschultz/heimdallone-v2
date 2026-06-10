import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useContext } from "react";
import { toast } from "sonner";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { CrmTabs } from "@/features/crm/crm-tabs";
import { activityTypeLabel } from "@/features/crm/labels";
import type { ActivityRow } from "@/features/crm/types";
import { canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/activities/")({
	component: CrmActivitiesPage,
});

function fmt(d: string | null): string {
	return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

function buildActivityColumns(
	onComplete: (actId: string) => void
): ColumnDef<ActivityRow, unknown>[] {
	return [
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => <>{activityTypeLabel(row.original.type)}</>,
		},
		{
			accessorKey: "subject",
			header: "Subject",
			cell: ({ row }) => (
				<span className="crm-name">
					{row.original.subject}
					{row.original.isOverdue ? (
						<span className="crm-badge tone-danger" style={{ marginLeft: 8 }}>
							Overdue
						</span>
					) : null}
				</span>
			),
		},
		{
			accessorKey: "dueAt",
			header: "Due",
			cell: ({ row }) => <>{fmt(row.original.dueAt)}</>,
		},
		{
			accessorKey: "assigneeName",
			header: "Assignee",
			cell: ({ row }) => <>{row.original.assigneeName ?? "Unassigned"}</>,
		},
		{
			accessorKey: "id",
			header: "",
			cell: ({ row }) => (
				<button
					className="crm-btn"
					onClick={() => onComplete(row.original.id)}
					type="button"
				>
					Mark done
				</button>
			),
		},
	];
}

function CrmActivitiesPage() {
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const qc = useQueryClient();

	const activities = useQuery(
		orpc.crm.activities.list.queryOptions({
			input: { openOnly: true },
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">CRM</h1>
				</div>
				<EmptyState
					description="CRM is available to the sales team, managers, and finance."
					icon={<Handshake size={28} />}
					title="You don't have access to CRM"
				/>
			</div>
		);
	}

	const rows = (activities.data as ActivityRow[] | undefined) ?? [];

	async function complete(actId: string) {
		try {
			await client.crm.activities.complete({ id: actId });
			toast.success("Marked done.");
			qc.invalidateQueries({
				predicate: (q) => String(q.queryKey[0] ?? "").includes("crm"),
			});
		} catch (e) {
			toast.error((e as { message?: string }).message ?? "Could not complete.");
		}
	}

	const activityColumns = buildActivityColumns(complete);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Activities</span>
					</div>
					<h1 className="page-title">Activities</h1>
					<p className="page-sub">Your open follow-ups and tasks.</p>
				</div>
			</div>

			<CrmTabs />

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={activityColumns}
					data={rows as ActivityRow[]}
					emptyState={
						<EmptyState
							compact
							description="Nothing open — you're all caught up."
							icon={<Handshake size={26} />}
							title="No open activities"
						/>
					}
					isError={activities.isError}
					isLoading={activities.isLoading}
				/>
			</div>
		</div>
	);
}
