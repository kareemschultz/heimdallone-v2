import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Package, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { AssetsTabs } from "@/features/assets/assets-tabs";
import {
	type BadgeTone,
	fmtDate,
	requestStatusLabel,
	requestStatusTone,
} from "@/features/assets/labels";
import { canAssignAssets, canManageAssets, canViewAssets } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/requests/")({
	component: RequestsPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`asset-badge tone-${tone}`}>{children}</span>;
}

interface RequestRow {
	categoryName: string | null;
	createdAt: string | Date;
	description: string | null;
	employeeName: string | null;
	id: string;
	resolutionNote: string | null;
	status: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("assets"),
	});
}

function RejectDialog({
	requestId,
	onClose,
	onDone,
}: {
	requestId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [reason, setReason] = useState("");
	const reject = useMutation({
		mutationFn: () =>
			client.assets.requests.reject({ id: requestId, reason: reason.trim() }),
		onSuccess: () => {
			toast.success("Request rejected");
			onDone();
		},
		onError: () => toast.error("Could not reject the request"),
	});
	return (
		<div className="asset-sheet-overlay">
			<div aria-modal="true" className="asset-sheet" role="dialog">
				<div className="asset-sheet-head">
					<h2>Reject request</h2>
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
					<label className="field" htmlFor="reject-reason">
						<span>Reason (required)</span>
						<textarea
							id="reject-reason"
							onChange={(e) => setReason(e.target.value)}
							placeholder="Why is this request being rejected?"
							rows={3}
							value={reason}
						/>
					</label>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={reason.trim().length === 0 || reject.isPending}
						onClick={() => reject.mutate()}
						type="button"
					>
						Reject
					</button>
				</div>
			</div>
		</div>
	);
}

function FulfillDialog({
	requestId,
	onClose,
	onDone,
}: {
	requestId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [assetId, setAssetId] = useState("");
	const available = useQuery(
		orpc.assets.list.queryOptions({
			input: { page: 1, pageSize: 100, status: "available" },
		})
	);
	const assets = ((available.data as { data?: unknown[] } | undefined)?.data ??
		[]) as { id: string; name: string; trackingId: string }[];
	const fulfill = useMutation({
		mutationFn: () =>
			client.assets.requests.fulfill({ id: requestId, assetId }),
		onSuccess: () => {
			toast.success("Request fulfilled — asset assigned");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not fulfil the request"),
	});
	return (
		<div className="asset-sheet-overlay">
			<div aria-modal="true" className="asset-sheet" role="dialog">
				<div className="asset-sheet-head">
					<h2>Fulfil request</h2>
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
					<label className="field" htmlFor="fulfill-asset">
						<span>Assign an available asset</span>
						<select
							id="fulfill-asset"
							onChange={(e) => setAssetId(e.target.value)}
							value={assetId}
						>
							<option value="">Select an available asset…</option>
							{assets.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name} ({a.trackingId})
								</option>
							))}
						</select>
					</label>
					<p className="asset-desc">
						This assigns the asset to the requester and marks the request
						fulfilled.
					</p>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!assetId || fulfill.isPending}
						onClick={() => fulfill.mutate()}
						type="button"
					>
						Fulfil & assign
					</button>
				</div>
			</div>
		</div>
	);
}

function RequestRowActions({
	row,
	canManage,
	canAssign,
	onApprove,
	onReject,
	onFulfill,
}: {
	canAssign: boolean;
	canManage: boolean;
	onApprove: (id: string) => void;
	onFulfill: (id: string) => void;
	onReject: (id: string) => void;
	row: RequestRow;
}) {
	if (row.status === "requested") {
		return (
			<>
				{canManage ? (
					<button
						className="btn btn-sm"
						onClick={() => onApprove(row.id)}
						type="button"
					>
						Approve
					</button>
				) : null}
				{canAssign ? (
					<button
						className="btn btn-sm"
						onClick={() => onFulfill(row.id)}
						type="button"
					>
						Fulfil
					</button>
				) : null}
				{canManage ? (
					<button
						className="btn btn-sm"
						onClick={() => onReject(row.id)}
						type="button"
					>
						Reject
					</button>
				) : null}
			</>
		);
	}
	if (row.status === "approved" && canAssign) {
		return (
			<button
				className="btn btn-sm"
				onClick={() => onFulfill(row.id)}
				type="button"
			>
				Fulfil
			</button>
		);
	}
	return <span className="asset-sub">{row.resolutionNote ?? "—"}</span>;
}

function RequestsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canView = canViewAssets(org.memberRole);
	const canManage = canManageAssets(org.memberRole);
	const canAssign = canAssignAssets(org.memberRole);
	const [reject, setReject] = useState<string | null>(null);
	const [fulfill, setFulfill] = useState<string | null>(null);

	const list = useQuery(
		orpc.assets.requests.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: canView,
		})
	);

	const approve = useMutation({
		mutationFn: (id: string) => client.assets.requests.approve({ id }),
		onSuccess: () => {
			toast.success("Request approved");
			invalidate(qc);
		},
		onError: () => toast.error("Could not approve the request"),
	});

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Asset requests</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "View my assets", href: "/app/assets/my" }}
					description="The request queue is available to HR and administrators."
					icon={<Package size={28} />}
					title="You don't have access to the request queue"
				/>
			</div>
		);
	}

	const result = list.data as { data: RequestRow[]; total: number } | undefined;
	const rows = result?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Assets</span>
					</div>
					<h1 className="page-title">Requests</h1>
					<p className="page-sub">{rows.length} request(s)</p>
				</div>
			</div>

			<AssetsTabs />

			{list.isLoading ? <div className="asset-skeleton" /> : null}
			{!list.isLoading && rows.length === 0 ? (
				<EmptyState
					compact
					description="No asset requests yet."
					title="No requests"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="asset-table">
					<thead>
						<tr>
							<th>Requester</th>
							<th>Category</th>
							<th>Description</th>
							<th>Requested</th>
							<th>Status</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td>{r.employeeName ?? "—"}</td>
								<td>{r.categoryName ?? "Any"}</td>
								<td>{r.description ?? "—"}</td>
								<td>{fmtDate(r.createdAt)}</td>
								<td>
									<Badge tone={requestStatusTone(r.status)}>
										{requestStatusLabel(r.status)}
									</Badge>
								</td>
								<td className="asset-row-actions">
									<RequestRowActions
										canAssign={canAssign}
										canManage={canManage}
										onApprove={(id) => approve.mutate(id)}
										onFulfill={setFulfill}
										onReject={setReject}
										row={r}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{reject ? (
				<RejectDialog
					onClose={() => setReject(null)}
					onDone={() => {
						setReject(null);
						invalidate(qc);
					}}
					requestId={reject}
				/>
			) : null}
			{fulfill ? (
				<FulfillDialog
					onClose={() => setFulfill(null)}
					onDone={() => {
						setFulfill(null);
						invalidate(qc);
					}}
					requestId={fulfill}
				/>
			) : null}
		</div>
	);
}
