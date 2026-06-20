import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, MapPin } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/inventory.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Badge } from "@/features/inventory/badge";
import { InventoryTabs } from "@/features/inventory/inventory-tabs";
import { locationKindLabel } from "@/features/inventory/labels";
import type { LocationRow } from "@/features/inventory/types";
import { canManageInventory, canViewInventory } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/inventory/locations")({
	component: InventoryLocationsPage,
});

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("inventory"),
	});
}

function LocationDialog({
	existing,
	onCancel,
	onSubmit,
}: {
	existing: LocationRow | null;
	onCancel: () => void;
	onSubmit: (values: {
		name: string;
		kind: "office" | "bond";
		code: string | null;
	}) => Promise<void>;
}) {
	const [name, setName] = useState(existing?.name ?? "");
	const [kind, setKind] = useState<"office" | "bond">(
		existing?.kind ?? "office"
	);
	const [code, setCode] = useState(existing?.code ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isEdit = existing != null;

	async function handleSave() {
		setError(null);
		if (!name.trim()) {
			setError("A location name is required.");
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				name: name.trim(),
				kind,
				code: code.trim() || null,
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not save the location."
			);
			setBusy(false);
		}
	}

	return (
		<Modal
			footer={
				<>
					<button
						className="inv-btn"
						disabled={busy}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="inv-btn primary"
						disabled={busy}
						onClick={handleSave}
						type="button"
					>
						{busy ? "Saving…" : "Save"}
					</button>
				</>
			}
			icon={<MapPin size={18} />}
			intro="Locations are where stock physically lives — an office, a warehouse, or a customs bond."
			onClose={onCancel}
			title={isEdit ? "Edit location" : "New location"}
		>
			<div className="inv-field">
				<label htmlFor="inv-l-name">Name</label>
				<input
					id="inv-l-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Main Office"
					value={name}
				/>
			</div>

			{isEdit ? null : (
				<div className="inv-field">
					<label htmlFor="inv-l-kind">Kind</label>
					<select
						id="inv-l-kind"
						onChange={(e) => setKind(e.target.value as "office" | "bond")}
						value={kind}
					>
						<option value="office">Office / warehouse</option>
						<option value="bond">Customs bond</option>
					</select>
				</div>
			)}

			<div className="inv-field">
				<label htmlFor="inv-l-code">Code</label>
				<input
					id="inv-l-code"
					onChange={(e) => setCode(e.target.value)}
					placeholder="optional short code (e.g. OFF)"
					value={code}
				/>
			</div>

			{error ? (
				<p className="inv-sub" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
		</Modal>
	);
}

function locationColumns(
	canManage: boolean,
	onEdit: (l: LocationRow) => void,
	onArchive: (l: LocationRow) => void
): ColumnDef<LocationRow, unknown>[] {
	const columns: ColumnDef<LocationRow, unknown>[] = [
		{
			accessorKey: "name",
			header: "Location",
			cell: ({ row }) => <span className="inv-name">{row.original.name}</span>,
		},
		{
			accessorKey: "kind",
			header: "Kind",
			cell: ({ row }) => (
				<Badge tone={row.original.kind === "bond" ? "info" : "neutral"}>
					{locationKindLabel(row.original.kind)}
				</Badge>
			),
		},
		{
			accessorKey: "code",
			header: "Code",
			cell: ({ row }) => row.original.code ?? "—",
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
	if (canManage) {
		columns.push({
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="inv-row-actions">
					<button
						className="inv-btn small"
						onClick={() => onEdit(row.original)}
						type="button"
					>
						Edit
					</button>
					{row.original.isActive ? (
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

function InventoryLocationsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewInventory(org.memberRole);
	const canManage = canManageInventory(org.memberRole);
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<LocationRow | null>(null);

	const locations = useQuery(
		orpc.inventory.locations.list.queryOptions({
			input: undefined,
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

	const rows = (locations.data as LocationRow[] | undefined) ?? [];

	function openCreate() {
		setEditing(null);
		setDialogOpen(true);
	}
	function openEdit(l: LocationRow) {
		setEditing(l);
		setDialogOpen(true);
	}

	async function handleSubmit(values: {
		name: string;
		kind: "office" | "bond";
		code: string | null;
	}) {
		if (editing) {
			await client.inventory.locations.update({
				id: editing.id,
				name: values.name,
				code: values.code,
			});
			toast.success("Location updated.");
		} else {
			await client.inventory.locations.create({
				name: values.name,
				kind: values.kind,
				code: values.code ?? undefined,
			});
			toast.success("Location created.");
		}
		setDialogOpen(false);
		setEditing(null);
		invalidateInventory(qc);
	}

	async function handleArchive(l: LocationRow) {
		await client.inventory.locations.archive({ id: l.id });
		toast.success("Location archived.");
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
					<h1 className="page-title">Locations</h1>
					<p className="page-sub">Where your stock physically lives.</p>
				</div>
				{canManage ? (
					<button
						className="inv-btn primary"
						onClick={openCreate}
						type="button"
					>
						New location
					</button>
				) : null}
			</div>

			<InventoryTabs />

			<DataTable
				columns={locationColumns(canManage, openEdit, handleArchive)}
				data={rows}
				emptyState={
					<EmptyState
						compact
						description="Add a location to start tracking where stock lives."
						title="No locations yet"
					/>
				}
				isError={locations.isError}
				isLoading={locations.isLoading}
			/>

			{dialogOpen ? (
				<LocationDialog
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
