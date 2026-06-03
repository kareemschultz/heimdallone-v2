import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";
import { type BadgeTone, fmtDate, statusLabel, statusTone } from "./labels";

interface CustodyRow {
	assetName: string;
	assetStatus: string;
	assignedAt: string | Date;
	categoryName: string | null;
	id: string;
	returnDueDate: string | Date | null;
	trackingId: string;
}

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`asset-badge tone-${tone}`}>{children}</span>;
}

const CUSTODY_NOTE =
	"Asset returns are tracked in Assets. Offboarding clearance remains manual/read-only in this version.";

/**
 * Read-only live Assets custody for an employee. Used on the offboarding case
 * detail so HR/auditor can see what physically must come back, alongside the
 * free-text offboarding asset-return checklist. No mutations, no write-back into
 * offboarding; never exposes purchaseCost (the API custody read omits it).
 *
 * Callers must already be authorized to view this employee's custody — the API
 * self-scopes (HR/auditor/payroll any; manager direct-reports). If the caller is
 * not authorized the query 403s and the panel degrades to a quiet note.
 */
export function AssetCustodyPanel({ employeeId }: { employeeId: string }) {
	const custody = useQuery(
		orpc.assets.assignments.listByEmployee.queryOptions({
			input: { employeeId },
			enabled: Boolean(employeeId),
			retry: false,
		})
	);

	const rows = (custody.data ?? []) as CustodyRow[];

	return (
		<section className="card card-pad" style={{ marginTop: 16 }}>
			<div className="asset-custody-head">
				<h3 className="asset-section-title" style={{ margin: 0 }}>
					Currently held assets (live)
				</h3>
				<Package size={15} />
			</div>
			<p className="asset-sub" style={{ marginBottom: 12 }}>
				{CUSTODY_NOTE}
			</p>

			{custody.isLoading ? <div className="asset-skeleton" /> : null}

			{custody.isError ? (
				<p className="asset-sub">Live asset custody is not available here.</p>
			) : null}

			{!(custody.isLoading || custody.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="This employee has no assets currently assigned in the Assets module."
					title="No assets in custody"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="asset-table">
					<thead>
						<tr>
							<th>Asset</th>
							<th>Tracking ID</th>
							<th>Category</th>
							<th>Status</th>
							<th>Assigned</th>
							<th>Return due</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td>{r.assetName}</td>
								<td>
									<span className="asset-mono">{r.trackingId}</span>
								</td>
								<td>{r.categoryName ?? "Uncategorised"}</td>
								<td>
									<Badge tone={statusTone(r.assetStatus)}>
										{statusLabel(r.assetStatus)}
									</Badge>
								</td>
								<td>{fmtDate(r.assignedAt)}</td>
								<td>{r.returnDueDate ? fmtDate(r.returnDueDate) : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}
		</section>
	);
}
