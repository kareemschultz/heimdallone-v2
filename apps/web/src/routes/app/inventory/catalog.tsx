import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/inventory.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/inventory/badge";
import { InventoryTabs } from "@/features/inventory/inventory-tabs";
import { formatMoneyCents, formatQty } from "@/features/inventory/labels";
import {
	ProductForm,
	type ProductFormValues,
} from "@/features/inventory/product-form";
import type {
	CategoryRow,
	ProductRow,
	ProductTypeRow,
} from "@/features/inventory/types";
import {
	canManageInventory,
	canManageInventoryCatalog,
	canViewInventory,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/inventory/catalog")({
	component: InventoryCatalogPage,
});

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("inventory"),
	});
}

function productColumns(
	canEdit: boolean,
	canArchive: boolean,
	onEdit: (p: ProductRow) => void,
	onArchive: (p: ProductRow) => void
): ColumnDef<ProductRow, unknown>[] {
	const columns: ColumnDef<ProductRow, unknown>[] = [
		{
			accessorKey: "name",
			header: "Product",
			cell: ({ row }) => (
				<span>
					<span className="inv-name">{row.original.name}</span>
					<br />
					<span className="inv-sub">
						{[row.original.sku, row.original.brand]
							.filter(Boolean)
							.join(" · ") || "—"}
					</span>
				</span>
			),
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			cell: ({ row }) => row.original.categoryName ?? "—",
		},
		{
			accessorKey: "typeName",
			header: "Type",
			cell: ({ row }) => row.original.typeName ?? "—",
		},
		{
			accessorKey: "unitPriceCents",
			header: "Unit price",
			cell: ({ row }) => (
				<span className="num">
					{formatMoneyCents(
						row.original.unitPriceCents,
						row.original.currencyCode ?? "GYD"
					)}
				</span>
			),
		},
		{
			accessorKey: "reorderLevel",
			header: "Reorder at",
			cell: ({ row }) => (
				<span className="num">{formatQty(row.original.reorderLevel ?? 0)}</span>
			),
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) =>
				row.original.isActive ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="neutral">Archived</Badge>
				),
		},
	];
	if (canEdit || canArchive) {
		columns.push({
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="inv-row-actions">
					{canEdit ? (
						<button
							className="inv-btn small"
							onClick={() => onEdit(row.original)}
							type="button"
						>
							Edit
						</button>
					) : null}
					{canArchive && row.original.isActive ? (
						<button
							className="inv-btn small danger"
							onClick={() => onArchive(row.original)}
							type="button"
						>
							Archive
						</button>
					) : null}
				</div>
			),
		});
	}
	return columns;
}

function InventoryCatalogPage() {
	const org = useContext(OrgCtx);
	const canView = canViewInventory(org.memberRole);
	const canEdit = canManageInventoryCatalog(org.memberRole);
	const canArchive = canManageInventory(org.memberRole);
	const qc = useQueryClient();

	const [search, setSearch] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [typeId, setTypeId] = useState("");
	const [activeOnly, setActiveOnly] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<ProductRow | null>(null);

	const categories = useQuery(
		orpc.inventory.categories.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const types = useQuery(
		orpc.inventory.productTypes.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const products = useQuery(
		orpc.inventory.products.list.queryOptions({
			input: {
				search: search || undefined,
				categoryId: categoryId || undefined,
				typeId: typeId || undefined,
				activeOnly,
			},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Inventory</h1>
				</div>
				<EmptyState
					description="Inventory is available to administrators, inventory managers, stock officers, and auditors."
					icon={<Boxes size={28} />}
					title="You don't have access to Inventory"
				/>
			</div>
		);
	}

	const rows = (products.data as ProductRow[] | undefined) ?? [];
	const categoryRows = (categories.data as CategoryRow[] | undefined) ?? [];
	const typeRows = (types.data as ProductTypeRow[] | undefined) ?? [];
	const typesForFilter = typeRows.filter(
		(t) => !categoryId || t.categoryId === categoryId
	);

	function openCreate() {
		setEditing(null);
		setDialogOpen(true);
	}
	function openEdit(p: ProductRow) {
		setEditing(p);
		setDialogOpen(true);
	}

	async function handleSubmit(values: ProductFormValues) {
		if (editing) {
			await client.inventory.products.update({
				id: editing.id,
				name: values.name,
				sku: values.sku,
				modelName: values.modelName,
				brand: values.brand,
				unitPriceCents: values.unitPriceCents,
				reorderLevel: values.reorderLevel,
			});
			toast.success("Product updated.");
		} else {
			await client.inventory.products.create({
				name: values.name,
				sku: values.sku ?? undefined,
				modelName: values.modelName ?? undefined,
				brand: values.brand ?? undefined,
				categoryId: values.categoryId,
				typeId: values.typeId,
				unitPriceCents: values.unitPriceCents ?? undefined,
				reorderLevel: values.reorderLevel,
			});
			toast.success("Product created.");
		}
		setDialogOpen(false);
		setEditing(null);
		invalidateInventory(qc);
	}

	async function handleArchive(p: ProductRow) {
		await client.inventory.products.archive({ id: p.id });
		toast.success("Product archived.");
		invalidateInventory(qc);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Inventory</span>
					</div>
					<h1 className="page-title">Catalogue</h1>
					<p className="page-sub">
						Products you track, with unit price and reorder level.
					</p>
				</div>
				{canEdit ? (
					<button
						className="inv-btn primary"
						onClick={openCreate}
						type="button"
					>
						New product
					</button>
				) : null}
			</div>

			<InventoryTabs />

			<div className="inv-toolbar">
				<input
					aria-label="Search products"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by name…"
					value={search}
				/>
				<select
					aria-label="Filter by category"
					onChange={(e) => {
						setCategoryId(e.target.value);
						setTypeId("");
					}}
					value={categoryId}
				>
					<option value="">All categories</option>
					{categoryRows.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by product type"
					onChange={(e) => setTypeId(e.target.value)}
					value={typeId}
				>
					<option value="">All types</option>
					{typesForFilter.map((t) => (
						<option key={t.id} value={t.id}>
							{t.name}
						</option>
					))}
				</select>
				<label htmlFor="inv-active-only">
					<input
						checked={activeOnly}
						id="inv-active-only"
						onChange={(e) => setActiveOnly(e.target.checked)}
						type="checkbox"
					/>{" "}
					Active only
				</label>
			</div>

			<DataTable
				columns={productColumns(canEdit, canArchive, openEdit, handleArchive)}
				data={rows}
				emptyState={
					<EmptyState
						compact
						description="No products match these filters."
						title="No products"
					/>
				}
				isError={products.isError}
				isLoading={products.isLoading}
			/>

			{dialogOpen ? (
				<ProductForm
					existing={editing}
					onCancel={() => {
						setDialogOpen(false);
						setEditing(null);
					}}
					onSubmit={handleSubmit}
				/>
			) : null}
		</div>
	);
}
