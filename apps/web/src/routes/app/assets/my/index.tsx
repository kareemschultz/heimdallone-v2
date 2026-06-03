import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Package, Plus, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import {
	type BadgeTone,
	fmtDate,
	requestStatusLabel,
	requestStatusTone,
	statusLabel,
	statusTone,
} from "@/features/assets/labels";
import { canRequestAsset } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/my/")({
	component: MyAssetsPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`asset-badge tone-${tone}`}>{children}</span>;
}

interface CustodyRow {
	assetName: string;
	assetStatus: string;
	assignedAt: string | Date;
	categoryName: string | null;
	id: string;
	returnDueDate: string | Date | null;
	trackingId: string;
}

interface MyRequestRow {
	categoryName: string | null;
	createdAt: string | Date;
	description: string | null;
	id: string;
	resolutionNote: string | null;
	status: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("assets"),
	});
}

function RequestDialog({
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
}) {
	const [description, setDescription] = useState("");
	const create = useMutation({
		mutationFn: () =>
			client.assets.requests.createSelf({
				description: description.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("Request submitted");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not submit your request"),
	});
	return (
		<div className="asset-sheet-overlay">
			<div aria-modal="true" className="asset-sheet" role="dialog">
				<div className="asset-sheet-head">
					<h2>Request an asset</h2>
					<button
						aria-label="Close"
						className="btn-icon"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="asset-sheet-body">
					<label className="field" htmlFor="req-desc">
						<span>What do you need?</span>
						<textarea
							id="req-desc"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="e.g. A laptop for remote work, or a replacement charger"
							rows={3}
							value={description}
						/>
					</label>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={description.trim().length === 0 || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Submit request
					</button>
				</div>
			</div>
		</div>
	);
}

function MyAssetsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canRequest = canRequestAsset(org.memberRole);
	const [showRequest, setShowRequest] = useState(false);

	const custody = useQuery(
		orpc.assets.assignments.listMine.queryOptions({ input: {} })
	);
	const requests = useQuery(
		orpc.assets.requests.list.queryOptions({ input: { page: 1, pageSize: 50 } })
	);

	const cancel = useMutation({
		mutationFn: (id: string) => client.assets.requests.cancel({ id }),
		onSuccess: () => {
			toast.success("Request cancelled");
			invalidate(qc);
		},
		onError: () => toast.error("Could not cancel the request"),
	});

	const custodyRows = (custody.data ?? []) as CustodyRow[];
	const reqResult = requests.data as { data: MyRequestRow[] } | undefined;
	const reqRows = reqResult?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>My assets</span>
					</div>
					<h1 className="page-title">My assets</h1>
					<p className="page-sub">Items assigned to you, and your requests.</p>
				</div>
				{canRequest ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowRequest(true)}
						type="button"
					>
						<Plus size={13} />
						Request an asset
					</button>
				) : null}
			</div>

			<h3 className="asset-section-title">Currently assigned to me</h3>
			{custody.isLoading ? <div className="asset-skeleton" /> : null}
			{!custody.isLoading && custodyRows.length === 0 ? (
				<EmptyState
					compact
					description="You don't have any company assets assigned right now."
					icon={<Package size={24} />}
					title="No assets assigned"
				/>
			) : null}
			{custodyRows.length > 0 ? (
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
						{custodyRows.map((c) => (
							<tr key={c.id}>
								<td>{c.assetName}</td>
								<td>
									<span className="asset-mono">{c.trackingId}</span>
								</td>
								<td>{c.categoryName ?? "Uncategorised"}</td>
								<td>
									<Badge tone={statusTone(c.assetStatus)}>
										{statusLabel(c.assetStatus)}
									</Badge>
								</td>
								<td>{fmtDate(c.assignedAt)}</td>
								<td>{c.returnDueDate ? fmtDate(c.returnDueDate) : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			<h3 className="asset-section-title">My requests</h3>
			{requests.isLoading ? <div className="asset-skeleton" /> : null}
			{!requests.isLoading && reqRows.length === 0 ? (
				<EmptyState
					compact
					description="You haven't requested any assets yet."
					title="No requests"
				/>
			) : null}
			{reqRows.length > 0 ? (
				<table className="asset-table">
					<thead>
						<tr>
							<th>Description</th>
							<th>Category</th>
							<th>Requested</th>
							<th>Status</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{reqRows.map((r) => (
							<tr key={r.id}>
								<td>{r.description ?? "—"}</td>
								<td>{r.categoryName ?? "Any"}</td>
								<td>{fmtDate(r.createdAt)}</td>
								<td>
									<Badge tone={requestStatusTone(r.status)}>
										{requestStatusLabel(r.status)}
									</Badge>
								</td>
								<td>
									{r.status === "requested" ? (
										<button
											className="btn btn-sm"
											disabled={cancel.isPending}
											onClick={() => cancel.mutate(r.id)}
											type="button"
										>
											Cancel
										</button>
									) : (
										<span className="asset-sub">{r.resolutionNote ?? "—"}</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{showRequest ? (
				<RequestDialog
					onClose={() => setShowRequest(false)}
					onDone={() => {
						setShowRequest(false);
						invalidate(qc);
					}}
				/>
			) : null}
		</div>
	);
}
