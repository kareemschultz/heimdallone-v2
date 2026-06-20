import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { Badge } from "@/features/helpdesk/badge";
import { approvalLabel, approvalTone } from "@/features/helpdesk/labels";
import { client } from "@/utils/orpc";

function invalidateHelpdesk(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("helpdesk"),
	});
}

function RejectDialog({
	pending,
	onClose,
	onConfirm,
}: {
	onClose: () => void;
	onConfirm: (reason: string) => void;
	pending: boolean;
}) {
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!trimmed || pending}
						onClick={() => onConfirm(trimmed)}
						type="button"
					>
						Reject request
					</button>
				</>
			}
			icon={<ShieldCheck size={18} />}
			intro="Your reason will be shared with the requester."
			onClose={onClose}
			title="Reject this request"
		>
			<label className="hd-field" htmlFor="hd-reject-reason">
				<span>Reason (shared with the requester)</span>
				<textarea
					id="hd-reject-reason"
					onChange={(e) => setReason(e.target.value)}
					placeholder="Explain why this can't be approved…"
					rows={3}
					value={reason}
				/>
			</label>
		</Modal>
	);
}

/**
 * Approval panel. Rendered only when the request needs approval. Approve / Reject
 * are shown when the decision is still pending AND the caller can approve
 * (`ticket:approve`, NOT `ticket:update`); the server enforces the finer
 * manager/payroll scope. Reject requires a reason. Everyone else just sees the
 * current approval state.
 */
export function ApprovalPanel({
	requestId,
	approvalRequired,
	approvalStatus,
	approvedByName,
	approvalNote,
	canApprove,
}: {
	approvalNote: string | null;
	approvalRequired: boolean;
	approvalStatus: string;
	approvedByName: string | null;
	canApprove: boolean;
	requestId: string;
}) {
	const qc = useQueryClient();
	const [showReject, setShowReject] = useState(false);

	const done = (msg: string) => {
		toast.success(msg);
		setShowReject(false);
		invalidateHelpdesk(qc);
	};
	const fail = (e: { message?: string }) =>
		toast.error(e?.message ?? "Could not record the decision");

	const approve = useMutation({
		mutationFn: () => client.helpdesk.requests.approve({ id: requestId }),
		onSuccess: () => done("Request approved"),
		onError: fail,
	});
	const reject = useMutation({
		mutationFn: (reason: string) =>
			client.helpdesk.requests.rejectApproval({ id: requestId, reason }),
		onSuccess: () => done("Request rejected"),
		onError: fail,
	});

	if (!approvalRequired) {
		return null;
	}

	const isPending = approvalStatus === "pending";
	const decidedBy = approvedByName;

	return (
		<div className="hd-approval">
			<div className="hd-approval-head">
				<span className="hd-section-title">Approval</span>
				<Badge tone={approvalTone(approvalStatus)}>
					{approvalLabel(approvalStatus)}
				</Badge>
			</div>
			{isPending ? (
				<p className="hd-approval-note">
					This request needs approval before the team acts on it.
				</p>
			) : (
				<p className="hd-approval-note">
					{approvalStatus === "approved" ? "Approved" : "Rejected"}
					{decidedBy ? ` by ${decidedBy}` : ""}
					{approvalNote ? ` — ${approvalNote}` : ""}
				</p>
			)}

			{isPending && canApprove ? (
				<div className="hd-actions">
					<button
						className="btn btn-primary"
						disabled={approve.isPending}
						onClick={() => approve.mutate()}
						type="button"
					>
						Approve
					</button>
					<button
						className="btn"
						disabled={reject.isPending}
						onClick={() => setShowReject(true)}
						type="button"
					>
						Reject
					</button>
				</div>
			) : null}

			{showReject ? (
				<RejectDialog
					onClose={() => setShowReject(false)}
					onConfirm={(reason) => reject.mutate(reason)}
					pending={reject.isPending}
				/>
			) : null}
		</div>
	);
}
