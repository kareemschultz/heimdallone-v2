import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { NotePromptDialog } from "./offboarding-note-prompt-dialog";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

type CaseDialog = "reject" | "cancel" | "close";

const TERMINAL = new Set(["closed", "cancelled", "rejected", "withdrawn"]);

interface CaseStatusActionsProps {
	caseId: string;
	status: string;
}

/**
 * HR status-transition controls for the case header. Each button maps to one
 * server procedure; the API enforces the legal source status with
 * PRECONDITION_FAILED, so the UI only needs to surface the right next steps.
 * Destructive transitions (reject / cancel / close) require confirmation —
 * close is the only action that deactivates the employee.
 */
export function CaseStatusActions({ caseId, status }: CaseStatusActionsProps) {
	const invalidate = useInvalidateOffboarding();
	const [dialog, setDialog] = useState<CaseDialog | null>(null);

	const ok = (message: string) => () => {
		toast.success(message);
		invalidate();
		setDialog(null);
	};
	const fail = (err: Error) => toast.error(err.message);

	const approve = useMutation({
		mutationFn: () => client.offboarding.cases.approve({ id: caseId }),
		onSuccess: ok("Resignation approved. Offboarding is now active."),
		onError: fail,
	});
	const reject = useMutation({
		mutationFn: (reason: string) =>
			client.offboarding.cases.reject({
				id: caseId,
				reason: reason === "" ? undefined : reason,
			}),
		onSuccess: ok("Resignation rejected."),
		onError: fail,
	});
	const toClearance = useMutation({
		mutationFn: () => client.offboarding.cases.moveToClearance({ id: caseId }),
		onSuccess: ok("Case moved to clearance."),
		onError: fail,
	});
	const toSettlement = useMutation({
		mutationFn: () =>
			client.offboarding.cases.markPendingSettlement({ id: caseId }),
		onSuccess: ok("Clearance complete. Awaiting final settlement."),
		onError: fail,
	});
	const cancel = useMutation({
		mutationFn: (reason: string) =>
			client.offboarding.cases.cancel({
				id: caseId,
				reason: reason === "" ? undefined : reason,
			}),
		onSuccess: ok("Case cancelled."),
		onError: fail,
	});
	const close = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.cases.close({
				id: caseId,
				note: note === "" ? undefined : note,
			}),
		onSuccess: ok("Case closed. Employee deactivated."),
		onError: fail,
	});

	const isTerminal = TERMINAL.has(status);
	const canClose = status === "in_clearance" || status === "pending_settlement";

	return (
		<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
			{status === "pending_approval" && (
				<>
					<button
						className="btn btn-primary btn-sm"
						disabled={approve.isPending}
						onClick={() => approve.mutate()}
						type="button"
					>
						Approve
					</button>
					<button
						className="btn btn-sm"
						onClick={() => setDialog("reject")}
						type="button"
					>
						Reject
					</button>
				</>
			)}
			{status === "active" && (
				<button
					className="btn btn-primary btn-sm"
					disabled={toClearance.isPending}
					onClick={() => toClearance.mutate()}
					type="button"
				>
					Move to clearance
				</button>
			)}
			{status === "in_clearance" && (
				<button
					className="btn btn-sm"
					disabled={toSettlement.isPending}
					onClick={() => toSettlement.mutate()}
					type="button"
				>
					Mark clearance complete
				</button>
			)}
			{canClose && (
				<button
					className="btn btn-primary btn-sm"
					onClick={() => setDialog("close")}
					type="button"
				>
					Close case
				</button>
			)}
			{!isTerminal && (
				<button
					className="btn btn-sm"
					onClick={() => setDialog("cancel")}
					style={{ color: "var(--danger, #c0392b)" }}
					type="button"
				>
					Cancel case
				</button>
			)}

			{dialog === "reject" && (
				<NotePromptDialog
					confirmLabel="Reject resignation"
					danger
					description="The employee will see this resignation was not approved."
					noteLabel="Reason"
					notePlaceholder="Why is it being rejected?"
					onClose={() => setDialog(null)}
					onConfirm={(note) => reject.mutate(note)}
					pending={reject.isPending}
					pendingLabel="Rejecting…"
					title="Reject this resignation?"
				/>
			)}
			{dialog === "cancel" && (
				<NotePromptDialog
					confirmLabel="Cancel case"
					danger
					description="The offboarding case will be cancelled. The employee stays active."
					noteLabel="Reason"
					notePlaceholder="Why is the case being cancelled?"
					onClose={() => setDialog(null)}
					onConfirm={(note) => cancel.mutate(note)}
					pending={cancel.isPending}
					pendingLabel="Cancelling…"
					title="Cancel this offboarding case?"
				/>
			)}
			{dialog === "close" && (
				<NotePromptDialog
					confirmLabel="Close & deactivate"
					danger
					description="This closes the case and deactivates the employee. This is the only action that sets the employee inactive — make sure clearance is genuinely complete."
					noteLabel="Closing note"
					notePlaceholder="Optional note for the record"
					onClose={() => setDialog(null)}
					onConfirm={(note) => close.mutate(note)}
					pending={close.isPending}
					pendingLabel="Closing…"
					title="Close this offboarding case?"
				/>
			)}
		</div>
	);
}
