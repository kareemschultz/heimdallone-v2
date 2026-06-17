import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { Badge, transferStatusTone } from "@/features/lifecycle/badge";
import {
	formatDate,
	labelFor,
	TRANSFER_STATUS_LABELS,
	TRANSFER_TYPE_LABELS,
} from "@/features/lifecycle/labels";
import { canManageTransfers, canProposeTransfer } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/transfers/$id")({
	component: TransferDetailPage,
});

interface TransferDetail {
	effectiveFrom: string | Date;
	employeeName: string;
	fromWorkLocation: string | null;
	id: string;
	reason: string | null;
	reference: string;
	rejectionReason: string | null;
	status: string;
	toWorkLocation: string | null;
	transferType: string;
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="lc-field">
			<span className="lc-field-lbl">{label}</span>
			<span className="lc-field-val">{value}</span>
		</div>
	);
}

function TransferDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canManage = canManageTransfers(role);
	const canPropose = canProposeTransfer(role);
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [rejectReason, setRejectReason] = useState("");

	const transferQuery = useQuery(
		orpc.lifecycle.transfers.getById.queryOptions({ input: { id } })
	);
	const transfer = transferQuery.data as TransferDetail | undefined;

	const run = async (fn: () => Promise<unknown>, ok: string) => {
		setBusy(true);
		try {
			await fn();
			toast.success(ok);
			qc.invalidateQueries();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		} finally {
			setBusy(false);
		}
	};

	if (transferQuery.isLoading) {
		return (
			<div className="page">
				<p className="lc-muted">Loading…</p>
			</div>
		);
	}
	if (transferQuery.isError || !transfer) {
		return (
			<div className="page">
				<EmptyState
					description="This transfer is unavailable or you do not have access."
					title="Transfer unavailable"
				/>
			</div>
		);
	}

	const status = transfer.status;
	const canSubmit = canPropose && status === "draft";
	const canCancel =
		canPropose &&
		["draft", "submitted", "approved", "scheduled"].includes(status);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Lifecycle</span>
						<span className="sep">/</span>
						<span>Transfers</span>
						<span className="sep">/</span>
						<span>{transfer.reference}</span>
					</div>
					<h1 className="page-title">
						{transfer.reference}{" "}
						<Badge tone={transferStatusTone(status)}>
							{labelFor(TRANSFER_STATUS_LABELS, status)}
						</Badge>
					</h1>
				</div>
			</div>

			<div className="lc-detail-grid">
				<Field label="Employee" value={transfer.employeeName} />
				<Field
					label="Type"
					value={labelFor(TRANSFER_TYPE_LABELS, transfer.transferType)}
				/>
				<Field
					label="Effective from"
					value={formatDate(transfer.effectiveFrom)}
				/>
				<Field
					label="From work location"
					value={transfer.fromWorkLocation ?? "—"}
				/>
				<Field
					label="To work location"
					value={transfer.toWorkLocation ?? "Unchanged"}
				/>
				<Field label="Reason" value={transfer.reason ?? "—"} />
			</div>

			{transfer.rejectionReason && (
				<div className="lc-section">
					<div className="lc-section-title">Rejection reason</div>
					<p className="lc-field-val">{transfer.rejectionReason}</p>
				</div>
			)}

			<div className="lc-section">
				<div className="lc-section-title">Workflow</div>
				<p className="lc-muted">
					An approved transfer with an effective date today or in the past
					executes immediately; a future-dated one activates on its effective
					date.
				</p>
				<div className="lc-actions">
					{canSubmit && (
						<button
							className="lc-btn primary"
							disabled={busy}
							onClick={() =>
								run(
									() => client.lifecycle.transfers.submit({ id }),
									"Submitted for approval."
								)
							}
							type="button"
						>
							Submit
						</button>
					)}
					{canManage && status === "submitted" && (
						<button
							className="lc-btn primary"
							disabled={busy}
							onClick={() =>
								run(
									() => client.lifecycle.transfers.approve({ id }),
									"Approved."
								)
							}
							type="button"
						>
							Approve
						</button>
					)}
					{canManage && status === "scheduled" && (
						<button
							className="lc-btn"
							disabled={busy}
							onClick={() =>
								run(
									() => client.lifecycle.transfers.execute({ id }),
									"Executed."
								)
							}
							type="button"
						>
							Execute now
						</button>
					)}
					{canCancel && (
						<button
							className="lc-btn"
							disabled={busy}
							onClick={() =>
								run(
									() => client.lifecycle.transfers.cancel({ id }),
									"Cancelled."
								)
							}
							type="button"
						>
							Cancel
						</button>
					)}
				</div>

				{canManage && (status === "submitted" || status === "draft") && (
					<div className="lc-form-field">
						<label htmlFor="trf-reject">Reject with reason</label>
						<textarea
							id="trf-reject"
							onChange={(e) => setRejectReason(e.target.value)}
							value={rejectReason}
						/>
						<button
							className="lc-btn"
							disabled={busy || !rejectReason.trim()}
							onClick={() =>
								run(async () => {
									await client.lifecycle.transfers.reject({
										id,
										rejectionReason: rejectReason.trim(),
									});
									setRejectReason("");
								}, "Rejected.")
							}
							type="button"
						>
							Reject
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
