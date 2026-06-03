import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/assets.css";
import { EmptyState } from "@/components/empty-state";
import {
	type BadgeTone,
	conditionLabel,
	fmtCost,
	fmtDate,
	statusLabel,
	statusTone,
} from "@/features/assets/labels";
import {
	canAssignAssets,
	canManageAssets,
	canReturnAssets,
	canViewAssetCosts,
	canViewAssets,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/inventory/$id")({
	component: AssetDetailPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`asset-badge tone-${tone}`}>{children}</span>;
}

interface AssetDetail {
	categoryName: string | null;
	currentAssigneeId: string | null;
	currentAssigneeName: string | null;
	description: string | null;
	expiryDate: string | Date | null;
	id: string;
	lotNumber: string | null;
	name: string;
	purchaseCost: string | null;
	purchaseDate: string | Date | null;
	status: string;
	trackingId: string;
}

interface AssignmentRow {
	assignedAt: string | Date;
	assignedToName: string | null;
	id: string;
	notes: string | null;
	returnCondition: string | null;
	returnedAt: string | Date | null;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("assets"),
	});
}

function AssignDialog({
	assetId,
	onClose,
	onDone,
}: {
	assetId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [assignedToId, setAssignedToId] = useState("");
	const [returnDueDate, setReturnDueDate] = useState("");
	const [notes, setNotes] = useState("");
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = ((employees.data as { data?: unknown[] } | undefined)?.data ??
		[]) as { firstName: string; id: string; lastName: string | null }[];
	const assign = useMutation({
		mutationFn: () =>
			client.assets.assignments.assign({
				assetId,
				assignedToId,
				returnDueDate: returnDueDate || undefined,
				notes: notes.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("Asset assigned");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not assign the asset"),
	});

	return (
		<div className="asset-sheet-overlay">
			<div
				aria-labelledby="assign-title"
				aria-modal="true"
				className="asset-sheet"
				role="dialog"
			>
				<div className="asset-sheet-head">
					<h2 id="assign-title">Assign asset</h2>
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
					<label className="field" htmlFor="assign-emp">
						<span>Assign to</span>
						<select
							id="assign-emp"
							onChange={(e) => setAssignedToId(e.target.value)}
							value={assignedToId}
						>
							<option value="">Select an employee…</option>
							{emps.map((e) => (
								<option key={e.id} value={e.id}>
									{e.firstName} {e.lastName ?? ""}
								</option>
							))}
						</select>
					</label>
					<label className="field" htmlFor="assign-due">
						<span>Return due date (optional)</span>
						<input
							id="assign-due"
							onChange={(e) => setReturnDueDate(e.target.value)}
							type="date"
							value={returnDueDate}
						/>
					</label>
					<label className="field" htmlFor="assign-notes">
						<span>Note (optional)</span>
						<textarea
							id="assign-notes"
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
							value={notes}
						/>
					</label>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!assignedToId || assign.isPending}
						onClick={() => assign.mutate()}
						type="button"
					>
						Assign
					</button>
				</div>
			</div>
		</div>
	);
}

function ReturnDialog({
	assignmentId,
	onClose,
	onDone,
}: {
	assignmentId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [returnCondition, setReturnCondition] = useState("healthy");
	const [notes, setNotes] = useState("");
	const ret = useMutation({
		mutationFn: () =>
			client.assets.assignments.return({
				assignmentId,
				returnCondition: returnCondition as
					| "healthy"
					| "minor_damage"
					| "major_damage",
				notes: notes.trim() || undefined,
			}),
		onSuccess: (r: { assetStatus?: string }) => {
			toast.success(
				r?.assetStatus === "retired"
					? "Returned — asset retired (major damage)"
					: "Asset returned"
			);
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not return the asset"),
	});

	return (
		<div className="asset-sheet-overlay">
			<div
				aria-labelledby="return-title"
				aria-modal="true"
				className="asset-sheet"
				role="dialog"
			>
				<div className="asset-sheet-head">
					<h2 id="return-title">Return asset</h2>
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
					<label className="field" htmlFor="return-cond">
						<span>Condition on return</span>
						<select
							id="return-cond"
							onChange={(e) => setReturnCondition(e.target.value)}
							value={returnCondition}
						>
							<option value="healthy">Healthy — back to available</option>
							<option value="minor_damage">
								Minor damage — back to available
							</option>
							<option value="major_damage">
								Major damage — will retire the asset
							</option>
						</select>
					</label>
					{returnCondition === "major_damage" ? (
						<p className="asset-warn-note">
							A major-damage return retires this asset so it can't be
							reassigned.
						</p>
					) : null}
					<label className="field" htmlFor="return-notes">
						<span>Note (optional)</span>
						<textarea
							id="return-notes"
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
							value={notes}
						/>
					</label>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={ret.isPending}
						onClick={() => ret.mutate()}
						type="button"
					>
						Confirm return
					</button>
				</div>
			</div>
		</div>
	);
}

function AssetSummary({ a, showCost }: { a: AssetDetail; showCost: boolean }) {
	return (
		<div className="asset-summary">
			<div className="asset-sum-grid">
				<div>
					<span className="asset-k">Tracking ID</span>
					<span className="asset-mono">{a.trackingId}</span>
				</div>
				<div>
					<span className="asset-k">Category</span>
					<span>{a.categoryName ?? "Uncategorised"}</span>
				</div>
				<div>
					<span className="asset-k">Current holder</span>
					<span>{a.currentAssigneeName ?? "Unassigned"}</span>
				</div>
				<div>
					<span className="asset-k">Purchase date</span>
					<span>{fmtDate(a.purchaseDate)}</span>
				</div>
				{showCost ? (
					<div>
						<span className="asset-k">Purchase cost</span>
						<span>{fmtCost(a.purchaseCost)}</span>
					</div>
				) : null}
				<div>
					<span className="asset-k">Expiry / warranty</span>
					<span>{fmtDate(a.expiryDate)}</span>
				</div>
				{a.lotNumber ? (
					<div>
						<span className="asset-k">Lot number</span>
						<span>{a.lotNumber}</span>
					</div>
				) : null}
			</div>
			{a.description ? <p className="asset-desc">{a.description}</p> : null}
		</div>
	);
}

function HistoryTable({ rows }: { rows: AssignmentRow[] }) {
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description="This asset has never been assigned."
				title="No assignment history"
			/>
		);
	}
	return (
		<table className="asset-table">
			<thead>
				<tr>
					<th>Assignee</th>
					<th>Assigned</th>
					<th>Returned</th>
					<th>Condition</th>
					<th>Note</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={r.id}>
						<td>{r.assignedToName ?? "—"}</td>
						<td>{fmtDate(r.assignedAt)}</td>
						<td>{r.returnedAt ? fmtDate(r.returnedAt) : "Open"}</td>
						<td>{conditionLabel(r.returnCondition)}</td>
						<td>{r.notes ?? "—"}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

type DialogKind = "assign" | "return" | "retire";

function DetailActions({
	a,
	hasOpenAssignment,
	role,
	onAction,
}: {
	a: AssetDetail;
	hasOpenAssignment: boolean;
	onAction: (d: DialogKind) => void;
	role: string;
}) {
	return (
		<div className="asset-actions">
			{a.status === "available" && canAssignAssets(role) ? (
				<button
					className="btn btn-primary"
					onClick={() => onAction("assign")}
					type="button"
				>
					Assign
				</button>
			) : null}
			{a.status === "in_use" && hasOpenAssignment && canReturnAssets(role) ? (
				<button
					className="btn"
					onClick={() => onAction("return")}
					type="button"
				>
					Return
				</button>
			) : null}
			{a.status === "retired" ? null : (
				<button
					className="btn"
					onClick={() => onAction("retire")}
					type="button"
				>
					Retire
				</button>
			)}
		</div>
	);
}

function RetireConfirmDialog({
	assetName,
	pending,
	onClose,
	onConfirm,
}: {
	assetName: string;
	onClose: () => void;
	onConfirm: () => void;
	pending: boolean;
}) {
	return (
		<div className="asset-sheet-overlay">
			<div aria-modal="true" className="asset-sheet" role="dialog">
				<div className="asset-sheet-head">
					<h2>Retire asset</h2>
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
					<p className="asset-desc">
						Retiring marks “{assetName}” as end-of-life. It must have no open
						assignment and can't be reassigned afterwards.
					</p>
				</div>
				<div className="asset-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={pending}
						onClick={onConfirm}
						type="button"
					>
						Retire asset
					</button>
				</div>
			</div>
		</div>
	);
}

function AssetDetailPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canView = canViewAssets(org.memberRole);
	const canManage = canManageAssets(org.memberRole);
	const showCost = canViewAssetCosts(org.memberRole);
	const { id } = Route.useParams();
	const [dialog, setDialog] = useState<"assign" | "return" | "retire" | null>(
		null
	);

	const asset = useQuery(
		orpc.assets.getById.queryOptions({
			input: { id },
			enabled: canView,
			retry: false,
		})
	);
	const history = useQuery(
		orpc.assets.assignments.listByAsset.queryOptions({
			input: { assetId: id },
			enabled: canView,
		})
	);

	const retire = useMutation({
		mutationFn: () => client.assets.retire({ id }),
		onSuccess: () => {
			toast.success("Asset retired");
			setDialog(null);
			invalidate(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not retire the asset"),
	});

	if (!canView) {
		return (
			<div className="page">
				<EmptyState
					description="The asset inventory is available to HR and administrators."
					title="You don't have access to assets"
				/>
			</div>
		);
	}
	if (asset.isError) {
		return (
			<div className="page">
				<Link className="asset-back" to="/app/assets/inventory">
					<ArrowLeft size={14} /> Back to inventory
				</Link>
				<EmptyState
					compact
					description="This asset is not available."
					title="Asset not found"
				/>
			</div>
		);
	}

	const a = asset.data as AssetDetail | undefined;
	const rows = (history.data ?? []) as AssignmentRow[];
	const openAssignment = rows.find((r) => r.returnedAt === null) ?? null;

	return (
		<div className="page">
			<Link className="asset-back" to="/app/assets/inventory">
				<ArrowLeft size={14} /> Back to inventory
			</Link>

			{asset.isLoading || !a ? (
				<div className="asset-skeleton" style={{ height: 120 }} />
			) : (
				<>
					<div className="page-header">
						<div>
							<h1 className="page-title">{a.name}</h1>
							<div className="asset-detail-badges">
								<Badge tone={statusTone(a.status)}>
									{statusLabel(a.status)}
								</Badge>
							</div>
						</div>
						{canManage ? (
							<DetailActions
								a={a}
								hasOpenAssignment={openAssignment !== null}
								onAction={setDialog}
								role={org.memberRole}
							/>
						) : null}
					</div>

					<AssetSummary a={a} showCost={showCost} />

					<h3 className="asset-section-title">Assignment history</h3>
					<HistoryTable rows={rows} />
				</>
			)}

			{dialog === "assign" && a ? (
				<AssignDialog
					assetId={a.id}
					onClose={() => setDialog(null)}
					onDone={() => {
						setDialog(null);
						invalidate(qc);
					}}
				/>
			) : null}
			{dialog === "return" && openAssignment ? (
				<ReturnDialog
					assignmentId={openAssignment.id}
					onClose={() => setDialog(null)}
					onDone={() => {
						setDialog(null);
						invalidate(qc);
					}}
				/>
			) : null}
			{dialog === "retire" && a ? (
				<RetireConfirmDialog
					assetName={a.name}
					onClose={() => setDialog(null)}
					onConfirm={() => retire.mutate()}
					pending={retire.isPending}
				/>
			) : null}
		</div>
	);
}
