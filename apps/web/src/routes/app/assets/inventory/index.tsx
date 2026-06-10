import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { AssetsTabs } from "@/features/assets/assets-tabs";
import {
	type BadgeTone,
	fmtCost,
	statusLabel,
	statusTone,
} from "@/features/assets/labels";
import { canViewAssetCosts, canViewAssets } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/inventory/")({
	component: InventoryPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`asset-badge tone-${tone}`}>{children}</span>;
}

interface AssetRow {
	categoryName: string | null;
	currentAssigneeName: string | null;
	id: string;
	lotNumber: string | null;
	name: string;
	purchaseCost: string | null;
	status: string;
	trackingId: string;
}

const PAGE_SIZE = 25;

const inventoryColumns: ColumnDef<AssetRow, unknown>[] = [
	{
		accessorKey: "name",
		header: "Asset",
		cell: ({ row }) => (
			<>
				<Link
					className="asset-name-link"
					params={{ id: row.original.id }}
					to="/app/assets/inventory/$id"
				>
					{row.original.name}
				</Link>
				{row.original.lotNumber ? (
					<div className="asset-sub">Lot {row.original.lotNumber}</div>
				) : null}
			</>
		),
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
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={statusTone(row.original.status)}>
				{statusLabel(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "currentAssigneeName",
		header: "Current holder",
		cell: ({ row }) => row.original.currentAssigneeName ?? "—",
	},
];

const costColumn: ColumnDef<AssetRow, unknown> = {
	accessorKey: "purchaseCost",
	header: "Purchase cost",
	cell: ({ row }) => fmtCost(row.original.purchaseCost),
};

function InventoryPage() {
	const org = useContext(OrgCtx);
	const canView = canViewAssets(org.memberRole);
	const showCost = canViewAssetCosts(org.memberRole);
	const [status, setStatus] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [assignedState, setAssignedState] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);

	const categories = useQuery(
		orpc.assets.categories.list.queryOptions({ input: {}, enabled: canView })
	);
	const list = useQuery(
		orpc.assets.list.queryOptions({
			input: {
				page,
				pageSize: PAGE_SIZE,
				status: status
					? (status as "available" | "in_use" | "retired")
					: undefined,
				categoryId: categoryId || undefined,
				assignedState: assignedState
					? (assignedState as "assigned" | "unassigned")
					: undefined,
				search: search.trim() || undefined,
			},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Assets</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "View my assets", href: "/app/assets/my" }}
					description="The asset inventory is available to HR and administrators. Your own assigned items are under “My assets”."
					icon={<Package size={28} />}
					title="You don't have access to the asset inventory"
				/>
			</div>
		);
	}

	const result = list.data as
		| { data: AssetRow[]; total: number; page: number }
		| undefined;
	const rows = result?.data ?? [];
	const total = result?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const cats = (categories.data ?? []) as { id: string; name: string }[];
	const columns = showCost
		? [...inventoryColumns, costColumn]
		: inventoryColumns;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Assets</span>
					</div>
					<h1 className="page-title">Inventory</h1>
					<p className="page-sub">
						{total} asset{total === 1 ? "" : "s"}
					</p>
				</div>
			</div>

			<AssetsTabs />

			<div className="asset-toolbar">
				<div className="asset-search">
					<Search size={14} />
					<input
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
						placeholder="Search name or tracking ID…"
						value={search}
					/>
				</div>
				<select
					onChange={(e) => {
						setStatus(e.target.value);
						setPage(1);
					}}
					value={status}
				>
					<option value="">All statuses</option>
					<option value="available">Available</option>
					<option value="in_use">In use</option>
					<option value="retired">Retired</option>
				</select>
				<select
					onChange={(e) => {
						setCategoryId(e.target.value);
						setPage(1);
					}}
					value={categoryId}
				>
					<option value="">All categories</option>
					{cats.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
				<select
					onChange={(e) => {
						setAssignedState(e.target.value);
						setPage(1);
					}}
					value={assignedState}
				>
					<option value="">Assigned & unassigned</option>
					<option value="assigned">Assigned</option>
					<option value="unassigned">Unassigned</option>
				</select>
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={columns}
					data={rows as AssetRow[]}
					emptyState={
						<EmptyState
							compact
							description="No assets match these filters."
							title="No assets"
						/>
					}
					isError={list.isError}
					isLoading={list.isLoading}
				/>
			</div>

			{totalPages > 1 ? (
				<div className="asset-pager">
					<button
						className="btn btn-sm"
						disabled={page <= 1}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						type="button"
					>
						<ChevronLeft size={14} /> Prev
					</button>
					<span>
						Page {page} of {totalPages}
					</span>
					<button
						className="btn btn-sm"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						type="button"
					>
						Next <ChevronRight size={14} />
					</button>
				</div>
			) : null}
		</div>
	);
}
