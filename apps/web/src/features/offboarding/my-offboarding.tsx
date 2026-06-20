import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import "@/styles/offboarding.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { client, orpc } from "@/utils/orpc";
import { caseStatusLabel, caseStatusTone, exitTypeLabel } from "./labels";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

// getMyCase returns the caller's latest case (redacted) or null. Terminal
// statuses mean the employee may start a fresh resignation.
const TERMINAL = new Set(["rejected", "withdrawn", "cancelled", "closed"]);

interface MyCaseView {
	exitReason: string | null;
	exitType: string;
	id: string;
	lastWorkingDay: string | Date | null;
	noticePeriodDays: number | null;
	status: string;
}

function fmtDate(value: string | Date | null | undefined): string {
	return value ? new Date(value).toLocaleDateString() : "Not set";
}

export function MyOffboarding() {
	const myCaseQ = useQuery(
		// Don't retry: roles without resignation access get a 403 that won't change,
		// so the "not available" state should show immediately.
		orpc.offboarding.cases.getMyCase.queryOptions({ input: {}, retry: false })
	);
	const c = myCaseQ.data as MyCaseView | null | undefined;
	const hasOpenCase = c != null && !TERMINAL.has(c.status);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>My offboarding</span>
					</div>
					<h1 className="page-title">My offboarding</h1>
					<p className="page-sub">
						Submit a resignation and track your own exit.
					</p>
				</div>
			</div>

			{myCaseQ.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading…
				</div>
			)}

			{!myCaseQ.isLoading && myCaseQ.isError && (
				<div className="card card-pad">
					<EmptyState
						description="Resignation self-service isn't available for your role. Speak to HR about your offboarding."
						title="Not available"
					/>
				</div>
			)}

			{!(myCaseQ.isLoading || myCaseQ.isError) && c && (
				<MyCaseCard caseRow={c} />
			)}

			{!(myCaseQ.isLoading || myCaseQ.isError || hasOpenCase) && (
				<ResignationForm hadPriorCase={c != null} />
			)}
		</div>
	);
}

function MyCaseCard({ caseRow }: { caseRow: MyCaseView }) {
	const invalidate = useInvalidateOffboarding();
	const queryClient = useQueryClient();
	const [withdrawing, setWithdrawing] = useState(false);

	const withdrawMutation = useMutation({
		mutationFn: () => client.offboarding.cases.withdraw({ id: caseRow.id }),
		onSuccess: () => {
			toast.success("Resignation withdrawn.");
			invalidate();
			queryClient.invalidateQueries({
				predicate: (q) => {
					const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
					return Array.isArray(path) && path[0] === "offboarding";
				},
			});
			setWithdrawing(false);
		},
		onError: (err: Error) => toast.error(`Could not withdraw: ${err.message}`),
	});

	const canWithdraw = caseRow.status === "pending_approval";
	const statusMessage = explainStatus(caseRow.status);

	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 16,
					flexWrap: "wrap",
				}}
			>
				<div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
					<Field label="Type" value={exitTypeLabel(caseRow.exitType)} />
					<Field
						label="Status"
						value={
							<span className={caseStatusTone(caseRow.status)}>
								{caseStatusLabel(caseRow.status)}
							</span>
						}
					/>
					<Field
						label="Last working day"
						value={fmtDate(caseRow.lastWorkingDay)}
					/>
					<Field
						label="Notice period"
						value={
							caseRow.noticePeriodDays == null
								? "—"
								: `${caseRow.noticePeriodDays} days`
						}
					/>
					{caseRow.exitReason && (
						<Field label="Your reason" value={caseRow.exitReason} />
					)}
				</div>
				{canWithdraw && (
					<button
						className="btn btn-sm"
						disabled={withdrawMutation.isPending}
						onClick={() => setWithdrawing(true)}
						type="button"
					>
						Withdraw
					</button>
				)}
			</div>
			<p style={{ color: "var(--fg-3)", fontSize: 13, margin: "14px 0 0" }}>
				{statusMessage}
			</p>

			{withdrawing && (
				<WithdrawDialog
					onClose={() => setWithdrawing(false)}
					onConfirm={() => withdrawMutation.mutate()}
					pending={withdrawMutation.isPending}
				/>
			)}
		</div>
	);
}

function explainStatus(status: string): string {
	switch (status) {
		case "pending_approval":
			return "Your resignation has been submitted and is waiting for HR or your manager to review it. You can withdraw it while it is still pending.";
		case "approved":
		case "active":
			return "Your resignation has been accepted. HR is preparing your clearance — they will be in touch about returning equipment and final steps.";
		case "in_clearance":
			return "Your clearance is underway. HR and IT are completing the final steps for your exit.";
		case "pending_settlement":
			return "Clearance is complete. Your final settlement is being prepared.";
		case "closed":
			return "Your offboarding is complete. Thank you for your time with the company.";
		case "rejected":
			return "Your previous resignation was not approved. You can submit a new one below if you still wish to resign.";
		case "withdrawn":
			return "You withdrew your previous resignation. You can submit a new one below if you change your mind.";
		case "cancelled":
			return "Your previous offboarding case was cancelled. You can submit a new resignation below if needed.";
		default:
			return "";
	}
}

function ResignationForm({ hadPriorCase }: { hadPriorCase: boolean }) {
	const invalidate = useInvalidateOffboarding();
	const [lastWorkingDay, setLastWorkingDay] = useState("");
	const [noticePeriodDays, setNoticePeriodDays] = useState("");
	const [reason, setReason] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const lwdId = useId();
	const noticeId = useId();
	const reasonId = useId();

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.cases.submitResignation({
				lastWorkingDay: lastWorkingDay === "" ? undefined : lastWorkingDay,
				noticePeriodDays:
					noticePeriodDays === "" ? undefined : Number(noticePeriodDays),
				exitReason: reason.trim() === "" ? undefined : reason.trim(),
			}),
		onSuccess: () => {
			toast.success("Resignation submitted. HR will review it.");
			invalidate();
			setConfirmOpen(false);
		},
		onError: (err: Error) => toast.error(`Could not submit: ${err.message}`),
	});

	return (
		<div className="card card-pad">
			<div className="eyebrow" style={{ marginBottom: 6 }}>
				{hadPriorCase ? "Submit a new resignation" : "Submit your resignation"}
			</div>
			<p style={{ color: "var(--fg-3)", fontSize: 13, margin: "0 0 16px" }}>
				This sends your resignation to HR for review. Nothing is final until
				they approve it, and you can withdraw it while it is still pending.
			</p>

			<div
				style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}
			>
				<div
					style={{
						flex: 1,
						minWidth: 180,
						display: "flex",
						flexDirection: "column",
						gap: 4,
					}}
				>
					<label htmlFor={lwdId} style={{ fontSize: 12, color: "var(--fg-3)" }}>
						Proposed last working day
					</label>
					<input
						className="input"
						id={lwdId}
						onChange={(e) => setLastWorkingDay(e.target.value)}
						type="date"
						value={lastWorkingDay}
					/>
				</div>
				<div
					style={{
						flex: 1,
						minWidth: 180,
						display: "flex",
						flexDirection: "column",
						gap: 4,
					}}
				>
					<label
						htmlFor={noticeId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Notice period (days)
					</label>
					<input
						className="input"
						id={noticeId}
						min={0}
						onChange={(e) => setNoticePeriodDays(e.target.value)}
						placeholder="e.g. 30"
						type="number"
						value={noticePeriodDays}
					/>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 4,
					marginBottom: 16,
				}}
			>
				<label
					htmlFor={reasonId}
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Reason (optional)
				</label>
				<textarea
					className="input"
					id={reasonId}
					onChange={(e) => setReason(e.target.value)}
					placeholder="Share anything you'd like HR to know."
					rows={3}
					style={{ resize: "vertical" }}
					value={reason}
				/>
			</div>

			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<button
					className="btn btn-primary btn-sm"
					onClick={() => setConfirmOpen(true)}
					type="button"
				>
					Submit resignation
				</button>
			</div>

			{confirmOpen && (
				<ConfirmSubmitDialog
					lastWorkingDay={lastWorkingDay}
					onClose={() => setConfirmOpen(false)}
					onConfirm={() => mutation.mutate()}
					pending={mutation.isPending}
				/>
			)}
		</div>
	);
}

function ConfirmSubmitDialog({
	lastWorkingDay,
	onConfirm,
	onClose,
	pending,
}: {
	lastWorkingDay: string;
	onConfirm: () => void;
	onClose: () => void;
	pending: boolean;
}) {
	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending}
						onClick={onConfirm}
						type="button"
					>
						{pending ? "Submitting…" : "Submit resignation"}
					</button>
				</>
			}
			icon={<LogOut size={18} />}
			intro={
				<>
					This notifies HR that you intend to resign
					{lastWorkingDay
						? `, with a proposed last working day of ${fmtDate(lastWorkingDay)}`
						: ""}
					. You can withdraw it while it is still pending approval.
				</>
			}
			onClose={onClose}
			title="Submit your resignation?"
		>
			{null}
		</Modal>
	);
}

function WithdrawDialog({
	onConfirm,
	onClose,
	pending,
}: {
	onConfirm: () => void;
	onClose: () => void;
	pending: boolean;
}) {
	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Keep it
					</button>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onConfirm}
						style={{ color: "var(--danger, #c0392b)" }}
						type="button"
					>
						{pending ? "Withdrawing…" : "Withdraw resignation"}
					</button>
				</>
			}
			icon={<RotateCcw size={18} />}
			intro="Your resignation will be cancelled and HR will be notified. You can submit a new one later if you change your mind."
			onClose={onClose}
			title="Withdraw your resignation?"
		>
			{null}
		</Modal>
	);
}

// ── small shared presentational bits ──
function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 120,
			}}
		>
			<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{label}</span>
			<span style={{ fontSize: 13.5, color: "var(--fg)" }}>{value}</span>
		</div>
	);
}
