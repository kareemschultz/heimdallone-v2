import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { Badge, resignationStatusTone } from "@/features/lifecycle/badge";
import {
	formatDate,
	labelFor,
	OFFBOARDING_STATUS_LABELS,
	RESIGNATION_REASON_LABELS,
	RESIGNATION_STATUS_LABELS,
} from "@/features/lifecycle/labels";
import { canApproveResignation, canManageResignations } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/resignations/$id")({
	component: ResignationDetailPage,
});

interface OffboardingSummary {
	id: string;
	lastWorkingDay: string | Date | null;
	status: string;
}

interface ResignationDetail {
	employeeName: string;
	id: string;
	noticeStartDate: string | Date | null;
	offboardingCaseId: string | null;
	offboardingSummary: OffboardingSummary | null;
	reasonCategory: string;
	reasonNotes: string | null;
	reference: string;
	rejectionReason: string | null;
	requestedLastWorkingDate: string | Date;
	status: string;
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="lc-field">
			<span className="lc-field-lbl">{label}</span>
			<span className="lc-field-val">{value}</span>
		</div>
	);
}

function ResignationDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canManage = canManageResignations(role);
	const canApprove = canApproveResignation(role);
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [rejectReason, setRejectReason] = useState("");

	const resignationQuery = useQuery(
		orpc.lifecycle.resignations.getById.queryOptions({ input: { id } })
	);
	const resignation = resignationQuery.data as ResignationDetail | undefined;

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

	if (resignationQuery.isLoading) {
		return (
			<div className="page">
				<p className="lc-muted">Loading…</p>
			</div>
		);
	}
	if (resignationQuery.isError || !resignation) {
		return (
			<div className="page">
				<EmptyState
					description="This resignation is unavailable or you do not have access."
					title="Resignation unavailable"
				/>
			</div>
		);
	}

	const status = resignation.status;
	const summary = resignation.offboardingSummary;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Lifecycle</span>
						<span className="sep">/</span>
						<span>Resignations</span>
						<span className="sep">/</span>
						<span>{resignation.reference}</span>
					</div>
					<h1 className="page-title">
						{resignation.reference}{" "}
						<Badge tone={resignationStatusTone(status)}>
							{labelFor(RESIGNATION_STATUS_LABELS, status)}
						</Badge>
					</h1>
				</div>
			</div>

			<div className="lc-detail-grid">
				<Field label="Employee" value={resignation.employeeName} />
				<Field
					label="Reason"
					value={labelFor(
						RESIGNATION_REASON_LABELS,
						resignation.reasonCategory
					)}
				/>
				<Field
					label="Requested last day"
					value={formatDate(resignation.requestedLastWorkingDate)}
				/>
				<Field
					label="Notice start"
					value={formatDate(resignation.noticeStartDate)}
				/>
			</div>

			{resignation.reasonNotes && (
				<div className="lc-section">
					<div className="lc-section-title">Notes</div>
					<p className="lc-field-val">{resignation.reasonNotes}</p>
				</div>
			)}

			{resignation.rejectionReason && (
				<div className="lc-section">
					<div className="lc-section-title">Rejection reason</div>
					<p className="lc-field-val">{resignation.rejectionReason}</p>
				</div>
			)}

			{/* Read-only offboarding link panel — Offboarding owns the exit execution. */}
			{summary && (
				<div className="lc-offboarding-panel">
					<div className="lc-section-title">Offboarding (read-only)</div>
					<p className="lc-muted">
						This resignation has been handed off. Clearance, asset return, and
						settlement live in Offboarding.
					</p>
					<div className="lc-detail-grid">
						<Field
							label="Case status"
							value={labelFor(OFFBOARDING_STATUS_LABELS, summary.status)}
						/>
						<Field
							label="Last working day"
							value={formatDate(summary.lastWorkingDay)}
						/>
					</div>
					<Link className="lc-name-link" to="/app/offboarding">
						Open Offboarding →
					</Link>
				</div>
			)}

			<div className="lc-section">
				<div className="lc-section-title">Workflow</div>
				<div className="lc-actions">
					{canApprove && status === "submitted" && (
						<button
							className="lc-btn"
							disabled={busy}
							onClick={() =>
								run(
									() => client.lifecycle.resignations.approveManager({ id }),
									"Manager approved."
								)
							}
							type="button"
						>
							Approve (manager)
						</button>
					)}
					{canManage &&
						(status === "submitted" || status === "manager_approved") && (
							<button
								className="lc-btn primary"
								disabled={busy}
								onClick={() =>
									run(
										() => client.lifecycle.resignations.approveHr({ id }),
										"HR approved."
									)
								}
								type="button"
							>
								Approve (HR)
							</button>
						)}
					{canManage && status === "hr_approved" && (
						<button
							className="lc-btn primary"
							disabled={busy}
							onClick={() =>
								run(
									() =>
										client.lifecycle.resignations.handoffToOffboarding({ id }),
									"Handed off to Offboarding."
								)
							}
							type="button"
						>
							Hand off to Offboarding
						</button>
					)}
				</div>

				{canApprove &&
					(status === "submitted" || status === "manager_approved") && (
						<div className="lc-form-field">
							<label htmlFor="res-reject">Reject with reason</label>
							<textarea
								id="res-reject"
								onChange={(e) => setRejectReason(e.target.value)}
								value={rejectReason}
							/>
							<button
								className="lc-btn"
								disabled={busy || !rejectReason.trim()}
								onClick={() =>
									run(async () => {
										await client.lifecycle.resignations.reject({
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
