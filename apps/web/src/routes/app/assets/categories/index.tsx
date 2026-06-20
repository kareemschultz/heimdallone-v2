import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Package, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { AssetsTabs } from "@/features/assets/assets-tabs";
import { canManageAssets, canViewAssets } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/categories/")({
	component: CategoriesPage,
});

interface CategoryRow {
	assetCount: number;
	description: string | null;
	id: string;
	name: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("assets"),
	});
}

function CategoryDialog({
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const create = useMutation({
		mutationFn: () =>
			client.assets.categories.create({
				name: name.trim(),
				description: description.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("Category created");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not create the category"),
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
						disabled={name.trim().length === 0 || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Create
					</button>
				</>
			}
			icon={<FolderOpen size={18} />}
			intro="Categories help you group and filter assets across the inventory."
			onClose={onClose}
			title="New category"
		>
			<label className="field" htmlFor="cat-name">
				<span>Name</span>
				<input
					id="cat-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Laptops"
					value={name}
				/>
			</label>
			<label className="field" htmlFor="cat-desc">
				<span>Description (optional)</span>
				<textarea
					id="cat-desc"
					onChange={(e) => setDescription(e.target.value)}
					rows={2}
					value={description}
				/>
			</label>
		</Modal>
	);
}

function buildCategoryColumns({
	canManage,
	archivePending,
	onArchive,
}: {
	archivePending: boolean;
	canManage: boolean;
	onArchive: (id: string) => void;
}): ColumnDef<CategoryRow, unknown>[] {
	const columns: ColumnDef<CategoryRow, unknown>[] = [
		{
			accessorKey: "name",
			header: "Category",
			cell: ({ row }) => (
				<>
					<div className="asset-name-link">{row.original.name}</div>
					{row.original.description ? (
						<div className="asset-sub">{row.original.description}</div>
					) : null}
				</>
			),
		},
		{
			accessorKey: "assetCount",
			header: "Assets",
			cell: ({ row }) => row.original.assetCount,
		},
	];
	if (canManage) {
		columns.push({
			accessorKey: "id",
			header: "",
			cell: ({ row }) => (
				<button
					className="btn btn-sm"
					disabled={archivePending}
					onClick={() => onArchive(row.original.id)}
					type="button"
				>
					Archive
				</button>
			),
		});
	}
	return columns;
}

function CategoriesPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canView = canViewAssets(org.memberRole);
	const canManage = canManageAssets(org.memberRole);
	const [showCreate, setShowCreate] = useState(false);

	const categories = useQuery(
		orpc.assets.categories.list.queryOptions({ input: {}, enabled: canView })
	);

	const archive = useMutation({
		mutationFn: (id: string) => client.assets.categories.archive({ id }),
		onSuccess: () => {
			toast.success("Category archived");
			invalidate(qc);
		},
		onError: () => toast.error("Could not archive the category"),
	});

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Asset categories</h1>
					</div>
				</div>
				<EmptyState
					description="Category management is available to HR and administrators."
					icon={<Package size={28} />}
					title="You don't have access to asset categories"
				/>
			</div>
		);
	}

	const rows = (categories.data ?? []) as CategoryRow[];
	const columns = buildCategoryColumns({
		canManage,
		archivePending: archive.isPending,
		onArchive: (id) => archive.mutate(id),
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
					<h1 className="page-title">Categories</h1>
					<p className="page-sub">Groupings for your assets.</p>
				</div>
				{canManage ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						New category
					</button>
				) : null}
			</div>

			<AssetsTabs />

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={columns}
					data={rows as CategoryRow[]}
					emptyState={
						<EmptyState
							compact
							description="Create a category to group your assets."
							title="No categories yet"
						/>
					}
					isError={categories.isError}
					isLoading={categories.isLoading}
				/>
			</div>

			{showCreate ? (
				<CategoryDialog
					onClose={() => setShowCreate(false)}
					onDone={() => {
						setShowCreate(false);
						invalidate(qc);
					}}
				/>
			) : null}
		</div>
	);
}
