import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Package, PackageCheck, XCircle } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
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
		<Modal
			footer={
				<>
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
				</>
			}
			icon={<XCircle size={18} />}
			intro="Your reason will be shown to the employee who made the request."
			onClose={onClose}
			title="Reject request"
		>
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
		</Modal>
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
		<Modal
			footer={
				<>
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
				</>
			}
			icon={<PackageCheck size={18} />}
			intro="Selecting an asset assigns it to the requester and marks this request fulfilled."
			onClose={onClose}
			title="Fulfil request"
		>
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
				This assigns the asset to the requester and marks the request fulfilled.
			</p>
		</Modal>
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

function buildRequestColumns({
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
}): ColumnDef<RequestRow, unknown>[] {
	return [
		{
			accessorKey: "employeeName",
			header: "Requester",
			cell: ({ row }) => row.original.employeeName ?? "—",
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			cell: ({ row }) => row.original.categoryName ?? "Any",
		},
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ row }) => row.original.description ?? "—",
		},
		{
			accessorKey: "createdAt",
			header: "Requested",
			cell: ({ row }) => fmtDate(row.original.createdAt),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge tone={requestStatusTone(row.original.status)}>
					{requestStatusLabel(row.original.status)}
				</Badge>
			),
		},
		{
			accessorKey: "id",
			header: "",
			cell: ({ row }) => (
				<span className="asset-row-actions">
					<RequestRowActions
						canAssign={canAssign}
						canManage={canManage}
						onApprove={onApprove}
						onFulfill={onFulfill}
						onReject={onReject}
						row={row.original}
					/>
				</span>
			),
		},
	];
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
	const columns = buildRequestColumns({
		canManage,
		canAssign,
		onApprove: (id) => approve.mutate(id),
		onFulfill: setFulfill,
		onReject: setReject,
	});

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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={columns}
					data={rows as RequestRow[]}
					emptyState={
						<EmptyState
							compact
							description="No asset requests yet."
							title="No requests"
						/>
					}
					isError={list.isError}
					isLoading={list.isLoading}
				/>
			</div>

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
