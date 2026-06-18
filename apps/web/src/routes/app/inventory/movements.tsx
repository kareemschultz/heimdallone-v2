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
import {
	formatQty,
	movementDirection,
	movementStatusLabel,
	movementStatusTone,
	movementTypeLabel,
} from "@/features/inventory/labels";
import {
	MovementForm,
	type MovementFormValues,
} from "@/features/inventory/movement-form";
import type { MovementRow, MovementStatus } from "@/features/inventory/types";
import {
	canApproveStockMovement,
	canCreateStockMovement,
	canViewInventory,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/inventory/movements")({
	component: InventoryMovementsPage,
});

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("inventory"),
	});
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return iso;
	}
}

function locationFlow(row: MovementRow): string {
	const from = row.sourceLocationName;
	const to = row.destinationLocationName;
	if (from && to) {
		return `${from} → ${to}`;
	}
	if (to) {
		return `→ ${to}`;
	}
	if (from) {
		return `${from} →`;
	}
	return "—";
}

function movementColumns(
	canApprove: boolean,
	canCancel: boolean,
	onApprove: (m: MovementRow) => void,
	onReject: (m: MovementRow) => void,
	onCancel: (m: MovementRow) => void
): ColumnDef<MovementRow, unknown>[] {
	const columns: ColumnDef<MovementRow, unknown>[] = [
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			accessorKey: "productName",
			header: "Product",
			cell: ({ row }) => (
				<span>
					<span className="inv-name">{row.original.productName ?? "—"}</span>
					<br />
					<span className="inv-sub">{row.original.productSku ?? ""}</span>
				</span>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => movementTypeLabel(row.original.type),
		},
		{
			accessorKey: "qty",
			header: "Qty",
			cell: ({ row }) => (
				<span
					className={`num inv-qty dir-${movementDirection(row.original.type)}`}
				>
					{formatQty(row.original.qty)}
				</span>
			),
		},
		{
			id: "flow",
			header: "Location",
			cell: ({ row }) => (
				<span className="inv-sub">{locationFlow(row.original)}</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge tone={movementStatusTone(row.original.status)}>
					{movementStatusLabel(row.original.status)}
				</Badge>
			),
		},
		{
			accessorKey: "reference",
			header: "Reference",
			cell: ({ row }) => row.original.reference ?? "—",
		},
	];
	if (canApprove || canCancel) {
		columns.push({
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const isPending =
					row.original.status === "pending" || row.original.status === "draft";
				if (!isPending) {
					return null;
				}
				return (
					<div className="inv-row-actions">
						{canApprove ? (
							<>
								<button
									className="inv-btn small primary"
									onClick={() => onApprove(row.original)}
									type="button"
								>
									Approve
								</button>
								<button
									className="inv-btn small danger"
									onClick={() => onReject(row.original)}
									type="button"
								>
									Reject
								</button>
							</>
						) : null}
						{canCancel ? (
							<button
								className="inv-btn small"
								onClick={() => onCancel(row.original)}
								type="button"
							>
								Cancel
							</button>
						) : null}
					</div>
				);
			},
		});
	}
	return columns;
}

const STATUS_FILTERS: MovementStatus[] = [
	"pending",
	"approved",
	"rejected",
	"cancelled",
	"draft",
];

function InventoryMovementsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewInventory(org.memberRole);
	const canApprove = canApproveStockMovement(org.memberRole);
	const canCreate = canCreateStockMovement(org.memberRole);
	const qc = useQueryClient();

	const [status, setStatus] = useState<MovementStatus | "">("");
	const [dialogOpen, setDialogOpen] = useState(false);

	const movements = useQuery(
		orpc.inventory.movements.list.queryOptions({
			input: { status: status || undefined },
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

	const rows = (movements.data as MovementRow[] | undefined) ?? [];

	async function handleCreate(values: MovementFormValues) {
		await client.inventory.movements.create({
			productId: values.productId,
			type: values.type,
			qty: values.qty,
			sourceLocationId: values.sourceLocationId ?? undefined,
			destinationLocationId: values.destinationLocationId ?? undefined,
			reason: values.reason ?? undefined,
			reference: values.reference ?? undefined,
			notes: values.notes ?? undefined,
		});
		toast.success("Movement recorded — awaiting approval.");
		setDialogOpen(false);
		invalidateInventory(qc);
	}

	async function runAction(fn: () => Promise<unknown>, successMessage: string) {
		try {
			await fn();
			toast.success(successMessage);
			invalidateInventory(qc);
		} catch (e) {
			toast.error(
				(e as { message?: string }).message ?? "Could not complete the action."
			);
		}
	}

	function handleApprove(m: MovementRow) {
		runAction(
			() => client.inventory.movements.approve({ id: m.id }),
			"Movement approved — stock updated."
		);
	}
	function handleReject(m: MovementRow) {
		runAction(
			() => client.inventory.movements.reject({ id: m.id }),
			"Movement rejected."
		);
	}
	function handleCancel(m: MovementRow) {
		runAction(
			() => client.inventory.movements.cancel({ id: m.id }),
			"Movement cancelled."
		);
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
					<h1 className="page-title">Movements</h1>
					<p className="page-sub">
						The stock ledger. Approving a movement is what changes stock levels.
					</p>
				</div>
				{canCreate ? (
					<button
						className="inv-btn primary"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						New movement
					</button>
				) : null}
			</div>

			<InventoryTabs />

			{canApprove ? (
				<div className="inv-note">
					You can approve movements, but not ones you created yourself — a
					different person must approve (separation of duties).
				</div>
			) : null}

			<div className="inv-toolbar">
				<select
					aria-label="Filter by status"
					onChange={(e) => setStatus(e.target.value as MovementStatus | "")}
					value={status}
				>
					<option value="">All statuses</option>
					{STATUS_FILTERS.map((s) => (
						<option key={s} value={s}>
							{movementStatusLabel(s)}
						</option>
					))}
				</select>
			</div>

			<DataTable
				columns={movementColumns(
					canApprove,
					canCreate,
					handleApprove,
					handleReject,
					handleCancel
				)}
				data={rows}
				emptyState={
					<EmptyState
						compact
						description="No movements match this filter."
						title="No movements"
					/>
				}
				isError={movements.isError}
				isLoading={movements.isLoading}
			/>

			{dialogOpen ? (
				<MovementForm
					onCancel={() => setDialogOpen(false)}
					onSubmit={handleCreate}
				/>
			) : null}
		</div>
	);
}
