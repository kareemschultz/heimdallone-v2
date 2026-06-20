import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";

function invalidateHelpdesk(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("helpdesk"),
	});
}

const TERMINAL = new Set(["closed", "cancelled"]);

function ConfirmDialog({
	title,
	body,
	confirmLabel,
	pending,
	onClose,
	onConfirm,
}: {
	body: string;
	confirmLabel: string;
	onClose: () => void;
	onConfirm: () => void;
	pending: boolean;
	title: string;
}) {
	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={pending}
						onClick={onConfirm}
						type="button"
					>
						{confirmLabel}
					</button>
				</>
			}
			icon={<AlertTriangle size={18} />}
			intro={body}
			onClose={onClose}
			title={title}
		>
			{null}
		</Modal>
	);
}

function ResolveDialog({
	pending,
	onClose,
	onConfirm,
}: {
	onClose: () => void;
	onConfirm: (note: string) => void;
	pending: boolean;
}) {
	const [note, setNote] = useState("");
	const trimmed = note.trim();
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
						Resolve request
					</button>
				</>
			}
			icon={<CheckCircle size={18} />}
			intro="Add a note describing how this request was resolved."
			onClose={onClose}
			title="Resolve request"
		>
			<label className="hd-field" htmlFor="hd-resolve-note">
				<span>Resolution note</span>
				<textarea
					id="hd-resolve-note"
					onChange={(e) => setNote(e.target.value)}
					placeholder="Briefly describe how this was resolved…"
					rows={3}
					value={note}
				/>
			</label>
		</Modal>
	);
}

type Dialog = "resolve" | "close" | "cancel" | "reopen" | null;

type WorkingStatus =
	| "open"
	| "in_progress"
	| "waiting_on_employee"
	| "waiting_on_approval";

// Friendly forward transitions an agent can take on an active request. These are
// low-stakes and reversible, so they fire directly (no dialog); the server
// rejects any move out of a terminal/resolved state.
const PROGRESS: { value: WorkingStatus; label: string }[] = [
	{ value: "in_progress", label: "Start work" },
	{ value: "waiting_on_employee", label: "Waiting on employee" },
	{ value: "waiting_on_approval", label: "Send for approval" },
];

/**
 * Status controls. Only API-supported transitions are surfaced, and only the
 * ones valid for the current status + role. The server re-checks every call, so
 * hidden buttons are a convenience, not the security boundary.
 *   - resolve / close / reopen → canManage (helpdesk/HR)
 *   - cancel → the requester (employee on their own request) or canManage
 */
export function RequestStatusActions({
	requestId,
	status,
	canManage,
	canCancel,
}: {
	canCancel: boolean;
	canManage: boolean;
	requestId: string;
	status: string;
}) {
	const qc = useQueryClient();
	const [dialog, setDialog] = useState<Dialog>(null);
	const close = () => setDialog(null);

	const done = (msg: string) => {
		toast.success(msg);
		close();
		invalidateHelpdesk(qc);
	};
	const fail = (e: { message?: string }) =>
		toast.error(e?.message ?? "Could not update the request");

	const resolve = useMutation({
		mutationFn: (note: string) =>
			client.helpdesk.requests.resolve({ id: requestId, resolutionNote: note }),
		onSuccess: () => done("Request resolved"),
		onError: fail,
	});
	const closeReq = useMutation({
		mutationFn: () => client.helpdesk.requests.close({ id: requestId }),
		onSuccess: () => done("Request closed"),
		onError: fail,
	});
	const cancelReq = useMutation({
		mutationFn: () => client.helpdesk.requests.cancel({ id: requestId }),
		onSuccess: () => done("Request cancelled"),
		onError: fail,
	});
	const reopen = useMutation({
		mutationFn: () => client.helpdesk.requests.reopen({ id: requestId }),
		onSuccess: () => done("Request reopened"),
		onError: fail,
	});
	const changeStatus = useMutation({
		mutationFn: (s: WorkingStatus) =>
			client.helpdesk.requests.changeStatus({ id: requestId, status: s }),
		onSuccess: () => done("Status updated"),
		onError: fail,
	});

	const isTerminal = TERMINAL.has(status);
	const isResolved = status === "resolved";
	const isActive = !(isTerminal || isResolved);

	const showResolve = canManage && isActive;
	const showClose = canManage && !isTerminal; // resolved → closed allowed
	const showReopen = canManage && (isResolved || status === "closed");
	const showCancel = canCancel && isActive;

	if (!(showResolve || showClose || showReopen || showCancel)) {
		return null;
	}

	const progressTargets =
		canManage && isActive ? PROGRESS.filter((p) => p.value !== status) : [];

	return (
		<div className="hd-actions">
			{progressTargets.map((p) => (
				<button
					className="btn"
					disabled={changeStatus.isPending}
					key={p.value}
					onClick={() => changeStatus.mutate(p.value)}
					type="button"
				>
					{p.label}
				</button>
			))}
			{showResolve ? (
				<button
					className="btn btn-primary"
					onClick={() => setDialog("resolve")}
					type="button"
				>
					Resolve
				</button>
			) : null}
			{showClose ? (
				<button
					className="btn"
					onClick={() => setDialog("close")}
					type="button"
				>
					Close
				</button>
			) : null}
			{showReopen ? (
				<button
					className="btn"
					onClick={() => setDialog("reopen")}
					type="button"
				>
					Reopen
				</button>
			) : null}
			{showCancel ? (
				<button
					className="btn"
					onClick={() => setDialog("cancel")}
					type="button"
				>
					Cancel request
				</button>
			) : null}

			{dialog === "resolve" ? (
				<ResolveDialog
					onClose={close}
					onConfirm={(note) => resolve.mutate(note)}
					pending={resolve.isPending}
				/>
			) : null}
			{dialog === "close" ? (
				<ConfirmDialog
					body="Closing marks this request as done. You can reopen it later if needed."
					confirmLabel="Close request"
					onClose={close}
					onConfirm={() => closeReq.mutate()}
					pending={closeReq.isPending}
					title="Close request"
				/>
			) : null}
			{dialog === "reopen" ? (
				<ConfirmDialog
					body="Reopening puts this request back into the active queue."
					confirmLabel="Reopen request"
					onClose={close}
					onConfirm={() => reopen.mutate()}
					pending={reopen.isPending}
					title="Reopen request"
				/>
			) : null}
			{dialog === "cancel" ? (
				<ConfirmDialog
					body="Cancelling withdraws this request. This can't be undone."
					confirmLabel="Cancel request"
					onClose={close}
					onConfirm={() => cancelReq.mutate()}
					pending={cancelReq.isPending}
					title="Cancel request"
				/>
			) : null}
		</div>
	);
}
