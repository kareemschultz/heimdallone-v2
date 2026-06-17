import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { LifecycleTabs } from "@/features/lifecycle/lifecycle-tabs";
import type { EmployeeOption, TransferRow } from "@/features/lifecycle/types";
import { canProposeTransfer, canViewTransfers } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/transfers/")({
	component: TransfersListPage,
});

const TRANSFER_TYPES = [
	"department",
	"position",
	"role",
	"location",
	"manager",
	"combined",
] as const;

function TransfersListPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canPropose = canProposeTransfer(role);
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);

	const transfersQuery = useQuery(
		orpc.lifecycle.transfers.list.queryOptions({ input: {} })
	);
	const transfers = (transfersQuery.data ?? []) as TransferRow[];

	if (!canViewTransfers(role)) {
		return (
			<div className="page">
				<EmptyState
					description="You do not have access to transfers."
					title="No access"
				/>
			</div>
		);
	}

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
					</div>
					<h1 className="page-title">Transfers</h1>
					<p className="page-sub">
						Past-due transfers execute on approval; future-dated ones activate
						on their effective date.
					</p>
				</div>
				{canPropose && (
					<button
						className="lc-btn primary"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						New transfer
					</button>
				)}
			</div>

			<LifecycleTabs />

			{transfersQuery.isLoading && <p className="lc-muted">Loading…</p>}
			{transfersQuery.isError && (
				<p className="lc-error">Could not load transfers.</p>
			)}
			{!(transfersQuery.isLoading || transfersQuery.isError) &&
				transfers.length === 0 && (
					<EmptyState description="No transfers yet." title="Nothing to show" />
				)}
			{transfers.length > 0 && (
				<table className="lc-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Employee</th>
							<th>Type</th>
							<th>Effective from</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{transfers.map((t) => (
							<tr key={t.id}>
								<td>
									<Link
										className="lc-name-link"
										params={{ id: t.id }}
										to="/app/lifecycle/transfers/$id"
									>
										{t.reference}
									</Link>
								</td>
								<td>{t.employeeName}</td>
								<td>{labelFor(TRANSFER_TYPE_LABELS, t.transferType)}</td>
								<td>{formatDate(t.effectiveFrom)}</td>
								<td>
									<Badge tone={transferStatusTone(t.status)}>
										{labelFor(TRANSFER_STATUS_LABELS, t.status)}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{dialogOpen && (
				<NewTransferDialog
					onClose={() => setDialogOpen(false)}
					onSaved={() => {
						setDialogOpen(false);
						qc.invalidateQueries();
					}}
				/>
			)}
		</div>
	);
}

function NewTransferDialog({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: () => void;
}) {
	const [employeeId, setEmployeeId] = useState("");
	const [transferType, setTransferType] =
		useState<(typeof TRANSFER_TYPES)[number]>("department");
	const [effectiveFrom, setEffectiveFrom] = useState("");
	const [toWorkLocation, setToWorkLocation] = useState("");
	const [reason, setReason] = useState("");
	const [saving, setSaving] = useState(false);

	const employeesQuery = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const employees = (employeesQuery.data?.data ?? []) as EmployeeOption[];

	const save = async () => {
		if (!(employeeId && effectiveFrom)) {
			toast.error("Employee and effective date are required.");
			return;
		}
		if (!toWorkLocation.trim()) {
			toast.error(
				"Enter at least one destination change (e.g. work location)."
			);
			return;
		}
		setSaving(true);
		try {
			await client.lifecycle.transfers.create({
				employeeId,
				transferType,
				effectiveFrom,
				toWorkLocation: toWorkLocation.trim() || null,
				reason: reason.trim() || null,
			});
			toast.success("Transfer created as a draft.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="lc-dialog-backdrop">
			<div
				aria-labelledby="trf-dialog-title"
				className="lc-dialog"
				role="dialog"
			>
				<h2 id="trf-dialog-title">New transfer</h2>
				<p className="lc-muted">
					A transfer writes an effective-dated history record — it never
					overwrites the employee's current details.
				</p>
				<div className="lc-form-field">
					<label htmlFor="trf-emp">Employee</label>
					<select
						id="trf-emp"
						onChange={(e) => setEmployeeId(e.target.value)}
						value={employeeId}
					>
						<option value="">Select…</option>
						{employees.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}
							</option>
						))}
					</select>
				</div>
				<div className="lc-form-field">
					<label htmlFor="trf-type">Type</label>
					<select
						id="trf-type"
						onChange={(e) =>
							setTransferType(e.target.value as (typeof TRANSFER_TYPES)[number])
						}
						value={transferType}
					>
						{TRANSFER_TYPES.map((t) => (
							<option key={t} value={t}>
								{labelFor(TRANSFER_TYPE_LABELS, t)}
							</option>
						))}
					</select>
				</div>
				<div className="lc-form-field">
					<label htmlFor="trf-date">Effective from</label>
					<input
						id="trf-date"
						onChange={(e) => setEffectiveFrom(e.target.value)}
						type="date"
						value={effectiveFrom}
					/>
				</div>
				<div className="lc-form-field">
					<label htmlFor="trf-loc">New work location</label>
					<input
						id="trf-loc"
						onChange={(e) => setToWorkLocation(e.target.value)}
						value={toWorkLocation}
					/>
				</div>
				<div className="lc-form-field">
					<label htmlFor="trf-reason">Reason</label>
					<textarea
						id="trf-reason"
						onChange={(e) => setReason(e.target.value)}
						value={reason}
					/>
				</div>
				<div className="lc-dialog-actions">
					<button className="lc-btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="lc-btn primary"
						disabled={saving}
						onClick={save}
						type="button"
					>
						{saving ? "Saving…" : "Create draft"}
					</button>
				</div>
			</div>
		</div>
	);
}
