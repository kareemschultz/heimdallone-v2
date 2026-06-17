import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext } from "react";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { Badge, resignationStatusTone } from "@/features/lifecycle/badge";
import {
	formatDate,
	labelFor,
	RESIGNATION_REASON_LABELS,
	RESIGNATION_STATUS_LABELS,
} from "@/features/lifecycle/labels";
import { LifecycleTabs } from "@/features/lifecycle/lifecycle-tabs";
import type { ResignationRow } from "@/features/lifecycle/types";
import { canViewResignations } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/resignations/")({
	component: ResignationsListPage,
});

function ResignationsListPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;

	const resignationsQuery = useQuery(
		orpc.lifecycle.resignations.list.queryOptions({ input: {} })
	);
	const resignations = (resignationsQuery.data ?? []) as ResignationRow[];

	if (!canViewResignations(role)) {
		return (
			<div className="page">
				<EmptyState
					description="You do not have access to the resignations queue."
					title="No access"
				/>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Lifecycle</span>
						<span className="sep">/</span>
						<span>Resignations</span>
					</div>
					<h1 className="page-title">Resignations</h1>
					<p className="page-sub">
						Intent to leave — approval, then handoff to Offboarding.
					</p>
				</div>
			</div>

			<LifecycleTabs />

			{resignationsQuery.isLoading && <p className="lc-muted">Loading…</p>}
			{resignationsQuery.isError && (
				<p className="lc-error">Could not load resignations.</p>
			)}
			{!(resignationsQuery.isLoading || resignationsQuery.isError) &&
				resignations.length === 0 && (
					<EmptyState
						description="No resignations yet."
						title="Nothing to show"
					/>
				)}
			{resignations.length > 0 && (
				<table className="lc-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Employee</th>
							<th>Reason</th>
							<th>Requested last day</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{resignations.map((r) => (
							<tr key={r.id}>
								<td>
									<Link
										className="lc-name-link"
										params={{ id: r.id }}
										to="/app/lifecycle/resignations/$id"
									>
										{r.reference}
									</Link>
								</td>
								<td>{r.employeeName}</td>
								<td>{labelFor(RESIGNATION_REASON_LABELS, r.reasonCategory)}</td>
								<td>{formatDate(r.requestedLastWorkingDate)}</td>
								<td>
									<Badge tone={resignationStatusTone(r.status)}>
										{labelFor(RESIGNATION_STATUS_LABELS, r.status)}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
