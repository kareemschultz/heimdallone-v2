import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useContext } from "react";

import "@/styles/inventory.css";
import { EmptyState } from "@/components/empty-state";
import { InventoryTabs } from "@/features/inventory/inventory-tabs";
import { formatMoneyCents, formatQty } from "@/features/inventory/labels";
import type { BalanceRow, InventorySummary } from "@/features/inventory/types";
import { canViewInventory } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/inventory/")({
	component: InventoryOverviewPage,
});

interface LowStockItem {
	productId: string;
	productName: string;
	qty: number;
	reorderLevel: number;
}

// Aggregate per-(product, location) balances into per-product on-hand and flag
// the ones at or below their reorder level.
function lowStockFrom(rows: BalanceRow[]): LowStockItem[] {
	const byProduct = new Map<string, LowStockItem>();
	for (const r of rows) {
		const existing = byProduct.get(r.productId);
		if (existing) {
			existing.qty += r.qty;
		} else {
			byProduct.set(r.productId, {
				productId: r.productId,
				productName: r.productName ?? "Unknown product",
				qty: r.qty,
				reorderLevel: r.reorderLevel ?? 0,
			});
		}
	}
	return Array.from(byProduct.values())
		.filter((p) => p.reorderLevel > 0 && p.qty <= p.reorderLevel)
		.sort((a, b) => a.qty - b.qty);
}

function InventoryOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewInventory(org.memberRole);

	const summary = useQuery(
		orpc.inventory.balances.summary.queryOptions({ enabled: canView })
	);
	const balances = useQuery(
		orpc.inventory.balances.list.queryOptions({
			input: undefined,
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Inventory</h1>
					</div>
				</div>
				<EmptyState
					description="Inventory is available to administrators, inventory managers, stock officers, and auditors."
					icon={<Boxes size={28} />}
					title="You don't have access to Inventory"
				/>
			</div>
		);
	}

	const data = summary.data as InventorySummary | undefined;
	const balanceRows = (balances.data as BalanceRow[] | undefined) ?? [];
	const lowStock = lowStockFrom(balanceRows);

	const tiles = data
		? [
				{ label: "Active products", value: formatQty(data.productCount) },
				{ label: "Units on hand", value: formatQty(data.onHandUnits) },
				{
					label: "Stock value",
					value: formatMoneyCents(data.stockValueCents),
				},
				{
					label: "Low stock",
					value: formatQty(data.lowStockCount),
					tone: data.lowStockCount > 0 ? ("warning" as const) : undefined,
				},
				{
					label: "Pending approval",
					value: formatQty(data.pendingMovements),
					tone: data.pendingMovements > 0 ? ("warning" as const) : undefined,
				},
			]
		: [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Inventory</span>
					</div>
					<h1 className="page-title">Inventory</h1>
					<p className="page-sub">
						Stock levels, the movement ledger, and the catalogue.
					</p>
				</div>
			</div>

			<InventoryTabs />

			{summary.isLoading ? <div className="inv-skeleton" /> : null}
			{summary.isError ? (
				<EmptyState
					compact
					description="Could not load the stock summary. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{summary.isLoading || summary.isError ? null : (
				<StatTileGrid className="inv-tiles" min={180}>
					{tiles.map((t) => (
						<StatTile
							key={t.label}
							label={t.label}
							tone={t.tone}
							value={t.value}
						/>
					))}
				</StatTileGrid>
			)}

			<div className="inv-section">
				<div className="inv-section-title">Needs attention</div>
				{balances.isError ? (
					<EmptyState
						compact
						description="Could not load stock balances."
						title="Something went wrong"
					/>
				) : null}
				{!balances.isError &&
				lowStock.length === 0 &&
				(data?.pendingMovements ?? 0) === 0 ? (
					<EmptyState
						compact
						description="No low-stock items and no movements waiting for approval."
						title="Everything looks healthy"
					/>
				) : (
					<div className="inv-attention">
						{(data?.pendingMovements ?? 0) > 0 ? (
							<Link className="inv-attn-row" to="/app/inventory/movements">
								<span>
									<span className="inv-attn-main">
										{formatQty(data?.pendingMovements ?? 0)} movement(s)
										awaiting approval
									</span>
									<br />
									<span className="inv-attn-sub">
										Review and approve pending stock movements
									</span>
								</span>
								<span className="inv-badge tone-warning">Review</span>
							</Link>
						) : null}
						{lowStock.map((p) => (
							<Link
								className="inv-attn-row"
								key={p.productId}
								to="/app/inventory/catalog"
							>
								<span>
									<span className="inv-attn-main">{p.productName}</span>
									<br />
									<span className="inv-attn-sub">
										{formatQty(p.qty)} on hand · reorder at{" "}
										{formatQty(p.reorderLevel)}
									</span>
								</span>
								<span className="inv-badge tone-danger">Low stock</span>
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="inv-section">
				<div className="inv-section-title">On-hand by location</div>
				{balanceRows.length === 0 ? (
					<EmptyState
						compact
						description="No stock recorded yet. Record an approved stock movement to build balances."
						title="No balances yet"
					/>
				) : (
					<table className="inv-table">
						<thead>
							<tr>
								<th>Product</th>
								<th>Location</th>
								<th className="num">On hand</th>
								<th className="num">Reserved</th>
							</tr>
						</thead>
						<tbody>
							{balanceRows.map((r) => (
								<tr key={`${r.productId}_${r.locationId}`}>
									<td className="inv-name">{r.productName ?? "—"}</td>
									<td>{r.locationName ?? "—"}</td>
									<td className="num">{formatQty(r.qty)}</td>
									<td className="num">{formatQty(r.reserved)}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
