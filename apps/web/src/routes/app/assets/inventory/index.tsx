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

			{list.isLoading ? <div className="asset-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load the asset inventory. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No assets match these filters."
					title="No assets"
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
							<th>Current holder</th>
							{showCost ? <th>Purchase cost</th> : null}
						</tr>
					</thead>
					<tbody>
						{rows.map((a) => (
							<tr key={a.id}>
								<td>
									<Link
										className="asset-name-link"
										params={{ id: a.id }}
										to="/app/assets/inventory/$id"
									>
										{a.name}
									</Link>
									{a.lotNumber ? (
										<div className="asset-sub">Lot {a.lotNumber}</div>
									) : null}
								</td>
								<td>
									<span className="asset-mono">{a.trackingId}</span>
								</td>
								<td>{a.categoryName ?? "Uncategorised"}</td>
								<td>
									<Badge tone={statusTone(a.status)}>
										{statusLabel(a.status)}
									</Badge>
								</td>
								<td>{a.currentAssigneeName ?? "—"}</td>
								{showCost ? <td>{fmtCost(a.purchaseCost)}</td> : null}
							</tr>
						))}
					</tbody>
				</table>
			) : null}

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
