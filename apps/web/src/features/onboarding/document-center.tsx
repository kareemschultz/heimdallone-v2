// Documents + acknowledgements UI for onboarding. Shared between the global
// "Onboarding documents" page and the employee onboarding detail page.
//
// Only actions the Phase 9F API actually supports are exposed:
//   - documentRequests.markUploaded → "Mark as received" (requested docs)
//   - documentRequests.approve      → "Approve"  (uploaded docs, HR only)
//   - documentRequests.reject       → "Reject"   (uploaded docs, HR only; reason required)
//   - acknowledgements.sign         → "Mark as signed" (unsigned acks; HR sign-on-record)
// There is NO real file storage and NO e-signature: "Mark as received" records
// receipt against a placeholder URL on the server. Real upload arrives later.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import {
	DOC_STATUS_LABEL,
	DOC_STATUS_TONE,
} from "@/features/onboarding/labels";
import { client } from "@/utils/orpc";

export interface DocRequestRow {
	createdAt: string | Date;
	documentType: string;
	id: string;
	onboardingId: string;
	rejectionReason?: string | null;
	status: string;
	uploadedAt: string | Date | null;
}

export interface AckRow {
	acknowledgedAt: string | Date | null;
	id: string;
	onboardingId: string;
	policyName: string;
	policyVersion: string | null;
}

export interface OnboardingMeta {
	employeeName: string;
	templateName: string;
}

const DOC_RESOLVED = new Set(["approved", "rejected"]);

function fmtDate(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	return new Date(value).toLocaleDateString();
}

function onboardingPredicate(queryKey: unknown): boolean {
	const path = Array.isArray(queryKey) ? queryKey[0] : null;
	return Array.isArray(path) && path[0] === "onboarding";
}

// ── Document requests ────────────────────────────────────────────────

interface DocumentRequestTableProps {
	canManage: boolean;
	emptyDescription?: string;
	isLoading: boolean;
	meta?: Map<string, OnboardingMeta>;
	readonly?: boolean;
	rows: DocRequestRow[];
	showContext?: boolean;
}

export function DocumentRequestTable({
	rows,
	isLoading,
	canManage,
	meta,
	showContext = false,
	readonly = false,
	emptyDescription = "No document requests yet.",
}: DocumentRequestTableProps) {
	const queryClient = useQueryClient();
	const [rejectTarget, setRejectTarget] = useState<DocRequestRow | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => onboardingPredicate(q.queryKey),
		});

	const receiveMut = useMutation({
		mutationFn: (id: string) =>
			client.onboarding.documentRequests.markUploaded({ id }),
		onSuccess: async () => {
			await invalidate();
			toast.success("Document marked as received.");
		},
		onError: (err: Error) =>
			toast.error(`Could not update document: ${err.message}`),
	});

	const approveMut = useMutation({
		mutationFn: (id: string) =>
			client.onboarding.documentRequests.approve({ id }),
		onSuccess: async () => {
			await invalidate();
			toast.success("Document approved.");
		},
		onError: (err: Error) =>
			toast.error(`Could not approve document: ${err.message}`),
	});

	const rejectMut = useMutation({
		mutationFn: (vars: { id: string; reason: string }) =>
			client.onboarding.documentRequests.reject(vars),
		onSuccess: async () => {
			setRejectTarget(null);
			await invalidate();
			toast.success("Document rejected.");
		},
		onError: (err: Error) =>
			toast.error(`Could not reject document: ${err.message}`),
	});

	if (isLoading) {
		return <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>;
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description={emptyDescription}
				icon={<FileText size={20} />}
				title="No documents"
			/>
		);
	}

	const showActions = !readonly && canManage;

	return (
		<>
			<table className="tbl">
				<thead>
					<tr>
						{showContext && <th>Employee</th>}
						{showContext && <th>Onboarding</th>}
						<th>Document</th>
						<th>Status</th>
						<th>Requested</th>
						<th>Received</th>
						{showActions && <th aria-label="Actions" />}
					</tr>
				</thead>
				<tbody>
					{rows.map((doc) => {
						const m = meta?.get(doc.onboardingId);
						const resolved = DOC_RESOLVED.has(doc.status);
						return (
							<tr key={doc.id}>
								{showContext && (
									<td style={{ color: "var(--fg-2)" }}>
										{m?.employeeName ?? "—"}
									</td>
								)}
								{showContext && (
									<td style={{ color: "var(--fg-3)" }}>
										{m?.templateName ?? "—"}
									</td>
								)}
								<td style={{ fontWeight: 600, color: "var(--fg)" }}>
									{doc.documentType}
								</td>
								<td>
									<span className={DOC_STATUS_TONE[doc.status] ?? "badge"}>
										{DOC_STATUS_LABEL[doc.status] ?? doc.status}
									</span>
									{doc.status === "rejected" && doc.rejectionReason && (
										<div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
											{doc.rejectionReason}
										</div>
									)}
								</td>
								<td style={{ color: "var(--fg-3)" }}>
									{fmtDate(doc.createdAt)}
								</td>
								<td style={{ color: "var(--fg-3)" }}>
									{fmtDate(doc.uploadedAt)}
								</td>
								{showActions && (
									<td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
										{doc.status === "requested" && (
											<button
												className="btn btn-sm"
												disabled={receiveMut.isPending}
												onClick={() => receiveMut.mutate(doc.id)}
												type="button"
											>
												Mark as received
											</button>
										)}
										{doc.status === "uploaded" && (
											<>
												<button
													className="btn btn-primary btn-sm"
													disabled={approveMut.isPending}
													onClick={() => approveMut.mutate(doc.id)}
													style={{ marginLeft: 6 }}
													type="button"
												>
													Approve
												</button>
												<button
													className="btn btn-sm"
													onClick={() => setRejectTarget(doc)}
													style={{ marginLeft: 6 }}
													type="button"
												>
													Reject
												</button>
											</>
										)}
										{resolved && (
											<span style={{ color: "var(--fg-4)", fontSize: 12 }}>
												No action needed
											</span>
										)}
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>

			{rejectTarget && (
				<RejectDialog
					documentType={rejectTarget.documentType}
					isPending={rejectMut.isPending}
					onClose={() => setRejectTarget(null)}
					onConfirm={(reason) =>
						rejectMut.mutate({ id: rejectTarget.id, reason })
					}
				/>
			)}
		</>
	);
}

// ── Acknowledgements ─────────────────────────────────────────────────

interface AcknowledgementTableProps {
	canManage: boolean;
	emptyDescription?: string;
	isLoading: boolean;
	meta?: Map<string, OnboardingMeta>;
	readonly?: boolean;
	rows: AckRow[];
	showContext?: boolean;
}

export function AcknowledgementTable({
	rows,
	isLoading,
	canManage,
	meta,
	showContext = false,
	readonly = false,
	emptyDescription = "No policy acknowledgements yet.",
}: AcknowledgementTableProps) {
	const queryClient = useQueryClient();

	const signMut = useMutation({
		mutationFn: (id: string) => client.onboarding.acknowledgements.sign({ id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				predicate: (q) => onboardingPredicate(q.queryKey),
			});
			toast.success("Acknowledgement signed.");
		},
		onError: (err: Error) => toast.error(`Could not sign: ${err.message}`),
	});

	if (isLoading) {
		return <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>;
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				compact
				description={emptyDescription}
				icon={<FileCheck2 size={20} />}
				title="No acknowledgements"
			/>
		);
	}

	const showActions = !readonly && canManage;

	return (
		<table className="tbl">
			<thead>
				<tr>
					{showContext && <th>Employee</th>}
					{showContext && <th>Onboarding</th>}
					<th>Policy</th>
					<th>Status</th>
					<th>Signed</th>
					{showActions && <th aria-label="Actions" />}
				</tr>
			</thead>
			<tbody>
				{rows.map((ack) => {
					const m = meta?.get(ack.onboardingId);
					const signed = ack.acknowledgedAt !== null;
					return (
						<tr key={ack.id}>
							{showContext && (
								<td style={{ color: "var(--fg-2)" }}>
									{m?.employeeName ?? "—"}
								</td>
							)}
							{showContext && (
								<td style={{ color: "var(--fg-3)" }}>
									{m?.templateName ?? "—"}
								</td>
							)}
							<td style={{ fontWeight: 600, color: "var(--fg)" }}>
								{ack.policyName}
								{ack.policyVersion && (
									<span style={{ color: "var(--fg-3)", fontWeight: 400 }}>
										{" "}
										· v{ack.policyVersion}
									</span>
								)}
							</td>
							<td>
								<span className={signed ? "badge badge-success" : "badge"}>
									{signed ? "Signed" : "Not signed"}
								</span>
							</td>
							<td style={{ color: "var(--fg-3)" }}>
								{fmtDate(ack.acknowledgedAt)}
							</td>
							{showActions && (
								<td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
									{signed ? (
										<span style={{ color: "var(--fg-4)", fontSize: 12 }}>
											No action needed
										</span>
									) : (
										<button
											className="btn btn-primary btn-sm"
											disabled={signMut.isPending}
											onClick={() => signMut.mutate(ack.id)}
											type="button"
										>
											Mark as signed
										</button>
									)}
								</td>
							)}
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

// ── Reject dialog ────────────────────────────────────────────────────

function RejectDialog({
	documentType,
	isPending,
	onClose,
	onConfirm,
}: {
	documentType: string;
	isPending: boolean;
	onClose: () => void;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();

	return (
		<DialogShell descId="reject-doc-desc" titleId="reject-doc-title">
			<h2 id="reject-doc-title" style={{ fontSize: 15, fontWeight: 600 }}>
				Reject this document?
			</h2>
			<p
				id="reject-doc-desc"
				style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
			>
				The new hire will be asked to provide “{documentType}” again. Give a
				short reason so they know what to fix.
			</p>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="reject-doc-reason"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Reason for rejecting
				</label>
				<textarea
					className="input"
					id="reject-doc-reason"
					onChange={(e) => setReason(e.target.value)}
					placeholder="e.g. Document was illegible — please re-upload."
					rows={3}
					style={{ width: "100%", resize: "vertical" }}
					value={reason}
				/>
			</div>
			<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
				<button
					className="btn btn-sm"
					disabled={isPending}
					onClick={onClose}
					type="button"
				>
					Back
				</button>
				<button
					className="btn btn-primary btn-sm"
					disabled={isPending || trimmed === ""}
					onClick={() => onConfirm(trimmed)}
					type="button"
				>
					{isPending ? "Rejecting…" : "Reject document"}
				</button>
			</div>
		</DialogShell>
	);
}

function DialogShell({
	titleId,
	descId,
	children,
}: {
	children: ReactNode;
	descId: string;
	titleId: string;
}) {
	return (
		<div
			aria-describedby={descId}
			aria-labelledby={titleId}
			aria-modal="true"
			role="dialog"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				zIndex: 60,
			}}
		>
			<div
				className="card card-pad"
				style={{
					width: "100%",
					maxWidth: 440,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				{children}
			</div>
		</div>
	);
}
