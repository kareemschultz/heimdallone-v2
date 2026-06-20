import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Package, Plus, ShoppingCart } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
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
		<Modal
			footer={
				<>
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
				</>
			}
			icon={<ShoppingCart size={18} />}
			intro="Describe what you need and HR or IT will review your request."
			onClose={onClose}
			title="Request an asset"
		>
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
		</Modal>
	);
}

const custodyColumns: ColumnDef<CustodyRow, unknown>[] = [
	{
		accessorKey: "assetName",
		header: "Asset",
		cell: ({ row }) => row.original.assetName,
	},
	{
		accessorKey: "trackingId",
		header: "Tracking ID",
		cell: ({ row }) => (
			<span className="asset-mono">{row.original.trackingId}</span>
		),
	},
	{
		accessorKey: "categoryName",
		header: "Category",
		cell: ({ row }) => row.original.categoryName ?? "Uncategorised",
	},
	{
		accessorKey: "assetStatus",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={statusTone(row.original.assetStatus)}>
				{statusLabel(row.original.assetStatus)}
			</Badge>
		),
	},
	{
		accessorKey: "assignedAt",
		header: "Assigned",
		cell: ({ row }) => fmtDate(row.original.assignedAt),
	},
	{
		accessorKey: "returnDueDate",
		header: "Return due",
		cell: ({ row }) =>
			row.original.returnDueDate ? fmtDate(row.original.returnDueDate) : "—",
	},
];

function buildMyRequestColumns({
	cancelPending,
	onCancel,
}: {
	cancelPending: boolean;
	onCancel: (id: string) => void;
}): ColumnDef<MyRequestRow, unknown>[] {
	return [
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ row }) => row.original.description ?? "—",
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			cell: ({ row }) => row.original.categoryName ?? "Any",
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
			cell: ({ row }) =>
				row.original.status === "requested" ? (
					<button
						className="btn btn-sm"
						disabled={cancelPending}
						onClick={() => onCancel(row.original.id)}
						type="button"
					>
						Cancel
					</button>
				) : (
					<span className="asset-sub">
						{row.original.resolutionNote ?? "—"}
					</span>
				),
		},
	];
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
	const requestColumns = buildMyRequestColumns({
		cancelPending: cancel.isPending,
		onCancel: (id) => cancel.mutate(id),
	});

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
			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={custodyColumns}
					data={custodyRows as CustodyRow[]}
					emptyState={
						<EmptyState
							compact
							description="You don't have any company assets assigned right now."
							icon={<Package size={24} />}
							title="No assets assigned"
						/>
					}
					isError={custody.isError}
					isLoading={custody.isLoading}
				/>
			</div>

			<h3 className="asset-section-title">My requests</h3>
			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={requestColumns}
					data={reqRows as MyRequestRow[]}
					emptyState={
						<EmptyState
							compact
							description="You haven't requested any assets yet."
							title="No requests"
						/>
					}
					isError={requests.isError}
					isLoading={requests.isLoading}
				/>
			</div>

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
