// Employee self-service onboarding ("My onboarding"). This is the new hire's
// own checklist — their progress, next step, tasks, documents, and policy
// acknowledgements. It only ever shows the signed-in employee's own data
// (server self-scope via employeeOnboarding.mine) and exposes ONLY the actions
// the API allows a new hire to take on their own record:
//   - tasks.complete            → "Complete"        (via TaskChecklist)
//   - documentRequests.markUploaded → "Mark as provided"
//   - acknowledgements.sign     → "Sign acknowledgement" (with confirmation)
// No HR/admin controls, no template management, no other employees, no real
// file upload, and no e-signature.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2,
	ClipboardList,
	FileText,
	PartyPopper,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import type {
	AckRow,
	DocRequestRow,
} from "@/features/onboarding/document-center";
import {
	categoryLabel,
	DOC_STATUS_LABEL,
	DOC_STATUS_TONE,
	isTaskResolved,
	ONBOARDING_STATUS_LABEL,
	ONBOARDING_STATUS_TONE,
} from "@/features/onboarding/labels";
import {
	type ChecklistTask,
	TaskChecklist,
} from "@/features/onboarding/task-checklist";
import { client, orpc } from "@/utils/orpc";

interface MyOnboardingRow {
	completedAt: string | Date | null;
	id: string;
	startedAt: string | Date | null;
	status: string;
	targetCompletionAt: string | Date | null;
}

// A document the new hire still has to act on, or a policy left to sign.
const DOC_NEEDS_ACTION = new Set(["requested", "rejected"]);

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

export function MyOnboarding() {
	const mine = useQuery(
		orpc.onboarding.employeeOnboarding.mine.queryOptions({ input: {} })
	);
	const onboardings = (mine.data ?? []) as MyOnboardingRow[];
	// Most recent first (server orders by startedAt desc); the newest record is
	// the one the new hire is working through.
	const active = onboardings.at(0);
	const onboardingId = active?.id ?? "";
	const hasActive = Boolean(active);

	const tasks = useQuery(
		orpc.onboarding.tasks.list.queryOptions({
			input: { onboardingId },
			enabled: hasActive,
		})
	);
	const docs = useQuery(
		orpc.onboarding.documentRequests.list.queryOptions({
			input: { onboardingId },
			enabled: hasActive,
		})
	);
	const acks = useQuery(
		orpc.onboarding.acknowledgements.list.queryOptions({
			input: { onboardingId },
			enabled: hasActive,
		})
	);

	const taskRows = (tasks.data ?? []) as ChecklistTask[];
	const docRows = (docs.data ?? []) as DocRequestRow[];
	const ackRows = (acks.data ?? []) as AckRow[];

	if (mine.isLoading) {
		return (
			<Shell>
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading your onboarding…
				</div>
			</Shell>
		);
	}

	if (!hasActive) {
		return (
			<Shell>
				<div className="card card-pad">
					<EmptyState
						description="No onboarding has been assigned to you yet. Ask HR if something looks wrong."
						icon={<ClipboardList size={20} />}
						title="Nothing to do right now"
					/>
				</div>
			</Shell>
		);
	}

	const totalTasks = taskRows.length;
	const doneTasks = taskRows.filter((t) => isTaskResolved(t.status)).length;
	const nextStep = pickNextStep(taskRows, docRows, ackRows);
	const allDone = nextStep === null;

	return (
		<Shell>
			<ProgressSummary
				allDone={allDone}
				doneTasks={doneTasks}
				status={active?.status ?? "in_progress"}
				targetDate={active?.targetCompletionAt ?? null}
				totalTasks={totalTasks}
			/>

			<NextStepPanel allDone={allDone} step={nextStep} />

			<Section
				icon={<ClipboardList size={16} />}
				subtitle="Things for you to do. Tick each one off as you go."
				title="Your tasks"
			>
				<TaskChecklist
					canComplete
					canManage={false}
					compact
					employeeName={EMPTY_NAMES}
					emptyDescription="You have no onboarding tasks right now."
					emptyTitle="No tasks yet"
					isLoading={tasks.isLoading}
					tasks={taskRows}
				/>
			</Section>

			<Section
				icon={<FileText size={16} />}
				subtitle="Documents HR has asked you for. File upload storage is coming later. HR can mark received documents."
				title="Your documents"
			>
				<EmployeeDocList isLoading={docs.isLoading} rows={docRows} />
			</Section>

			<Section
				icon={<ShieldCheck size={16} />}
				subtitle="Policies to read and accept."
				title="Your acknowledgements"
			>
				<EmployeeAckList isLoading={acks.isLoading} rows={ackRows} />
			</Section>

			<p style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 4 }}>
				Ask HR if something looks wrong.
			</p>
		</Shell>
	);
}

const EMPTY_NAMES = new Map<string, string>();

interface NextStep {
	detail: string;
	title: string;
}

function pickNextStep(
	taskRows: ChecklistTask[],
	docRows: DocRequestRow[],
	ackRows: AckRow[]
): NextStep | null {
	const nextTask = taskRows.find((t) => !isTaskResolved(t.status));
	if (nextTask) {
		return {
			title: nextTask.titleSnapshot,
			detail: `Task · ${categoryLabel(nextTask.category)}`,
		};
	}
	const nextDoc = docRows.find((d) => DOC_NEEDS_ACTION.has(d.status));
	if (nextDoc) {
		return {
			title: `Provide your ${nextDoc.documentType}`,
			detail:
				nextDoc.status === "rejected"
					? "Document · needs changes"
					: "Document · requested",
		};
	}
	const nextAck = ackRows.find((a) => !a.acknowledgedAt);
	if (nextAck) {
		return {
			title: `Sign the ${nextAck.policyName} policy`,
			detail: "Acknowledgement · not signed",
		};
	}
	return null;
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>My onboarding</span>
					</div>
					<h1 className="page-title">My onboarding</h1>
					<p className="page-sub">
						Complete your tasks, documents, and acknowledgements before your
						first days.
					</p>
				</div>
			</div>
			{children}
		</div>
	);
}

interface ProgressSummaryProps {
	allDone: boolean;
	doneTasks: number;
	status: string;
	targetDate: string | Date | null;
	totalTasks: number;
}

function ProgressSummary({
	allDone,
	doneTasks,
	status,
	targetDate,
	totalTasks,
}: ProgressSummaryProps) {
	const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
	const remaining = totalTasks - doneTasks;
	let message = "You're getting started.";
	if (allDone) {
		message = "You're all caught up — nice work!";
	} else if (remaining === 1) {
		message = "You're almost done.";
	} else if (doneTasks > 0) {
		message = "Nice progress — keep going.";
	}

	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					flexWrap: "wrap",
				}}
			>
				<div>
					<div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
						{message}
					</div>
					<div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>
						{doneTasks} of {totalTasks} tasks done
						{targetDate ? ` · finish by ${fmtDate(targetDate)}` : ""}
					</div>
				</div>
				<span className={ONBOARDING_STATUS_TONE[status] ?? "badge"}>
					{ONBOARDING_STATUS_LABEL[status] ?? status}
				</span>
			</div>
			<div
				aria-hidden="true"
				style={{
					marginTop: 12,
					height: 8,
					width: "100%",
					background: "var(--bg-3)",
					borderRadius: 999,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						height: "100%",
						width: `${pct}%`,
						background: "var(--accent, #2f6df6)",
						borderRadius: 999,
						transition: "width 200ms ease",
					}}
				/>
			</div>
		</div>
	);
}

function NextStepPanel({
	allDone,
	step,
}: {
	allDone: boolean;
	step: NextStep | null;
}) {
	if (allDone || !step) {
		return (
			<div
				className="card card-pad"
				style={{
					marginBottom: 14,
					display: "flex",
					alignItems: "center",
					gap: 12,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 36,
						height: 36,
						color: "var(--fg-2)",
						background: "var(--bg-3)",
						borderRadius: 10,
					}}
				>
					<PartyPopper size={18} />
				</div>
				<div>
					<div style={{ fontSize: 13.5, fontWeight: 600 }}>
						Nothing left to do
					</div>
					<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
						You've finished everything that needs your attention.
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className="card card-pad"
			style={{
				marginBottom: 14,
				display: "flex",
				alignItems: "center",
				gap: 12,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: 36,
					height: 36,
					color: "var(--accent, #2f6df6)",
					background: "var(--bg-3)",
					borderRadius: 10,
				}}
			>
				<CheckCircle2 size={18} />
			</div>
			<div>
				<div style={{ fontSize: 12, color: "var(--fg-3)" }}>Next step</div>
				<div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
					{step.title}
				</div>
				<div style={{ fontSize: 12, color: "var(--fg-3)" }}>{step.detail}</div>
			</div>
		</div>
	);
}

function Section({
	title,
	subtitle,
	icon,
	children,
}: {
	children: React.ReactNode;
	icon: React.ReactNode;
	subtitle: string;
	title: string;
}) {
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<span style={{ color: "var(--fg-2)" }}>{icon}</span>
				<h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h2>
			</div>
			<p style={{ fontSize: 12, color: "var(--fg-3)", margin: "4px 0 12px" }}>
				{subtitle}
			</p>
			{children}
		</div>
	);
}

// ── Documents (employee view) ────────────────────────────────────────

function EmployeeDocList({
	rows,
	isLoading,
}: {
	isLoading: boolean;
	rows: DocRequestRow[];
}) {
	const queryClient = useQueryClient();
	const provideMut = useMutation({
		mutationFn: (id: string) =>
			client.onboarding.documentRequests.markUploaded({ id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				predicate: (q) => onboardingPredicate(q.queryKey),
			});
			toast.success("Document marked as provided.");
		},
		onError: (err: Error) =>
			toast.error(`Could not update document: ${err.message}`),
	});

	if (isLoading) {
		return (
			<div style={{ color: "var(--fg-3)", fontSize: 13 }}>
				Loading documents…
			</div>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				description="HR hasn't requested any documents from you."
				icon={<FileText size={20} />}
				title="No documents requested"
			/>
		);
	}

	return (
		<table className="tbl">
			<thead>
				<tr>
					<th>Document</th>
					<th>Status</th>
					<th aria-label="Actions" />
				</tr>
			</thead>
			<tbody>
				{rows.map((doc) => {
					const needsAction = DOC_NEEDS_ACTION.has(doc.status);
					const pending =
						provideMut.isPending && provideMut.variables === doc.id;
					return (
						<tr key={doc.id}>
							<td>
								<div style={{ fontWeight: 600, color: "var(--fg)" }}>
									{doc.documentType}
								</div>
								{doc.status === "rejected" && doc.rejectionReason && (
									<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
										Needs changes: {doc.rejectionReason}
									</div>
								)}
							</td>
							<td>
								<span className={DOC_STATUS_TONE[doc.status] ?? "badge"}>
									{DOC_STATUS_LABEL[doc.status] ?? doc.status}
								</span>
							</td>
							<td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
								{needsAction ? (
									<button
										className="btn btn-primary btn-sm"
										disabled={pending}
										onClick={() => provideMut.mutate(doc.id)}
										type="button"
									>
										{pending ? "…" : "Mark as provided"}
									</button>
								) : (
									<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
										{doc.status === "uploaded"
											? "Waiting for HR review"
											: "All set"}
									</span>
								)}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

// ── Acknowledgements (employee view) ─────────────────────────────────

function EmployeeAckList({
	rows,
	isLoading,
}: {
	isLoading: boolean;
	rows: AckRow[];
}) {
	const queryClient = useQueryClient();
	const [confirmTarget, setConfirmTarget] = useState<AckRow | null>(null);
	const signMut = useMutation({
		mutationFn: (id: string) => client.onboarding.acknowledgements.sign({ id }),
		onSuccess: async () => {
			setConfirmTarget(null);
			await queryClient.invalidateQueries({
				predicate: (q) => onboardingPredicate(q.queryKey),
			});
			toast.success("Acknowledgement signed.");
		},
		onError: (err: Error) => {
			setConfirmTarget(null);
			toast.error(`Could not sign: ${err.message}`);
		},
	});

	if (isLoading) {
		return (
			<div style={{ color: "var(--fg-3)", fontSize: 13 }}>
				Loading acknowledgements…
			</div>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				description="There are no policies for you to sign right now."
				icon={<ShieldCheck size={20} />}
				title="No acknowledgements"
			/>
		);
	}

	return (
		<>
			<table className="tbl">
				<thead>
					<tr>
						<th>Policy</th>
						<th>Status</th>
						<th aria-label="Actions" />
					</tr>
				</thead>
				<tbody>
					{rows.map((ack) => {
						const signed = Boolean(ack.acknowledgedAt);
						return (
							<tr key={ack.id}>
								<td>
									<div style={{ fontWeight: 600, color: "var(--fg)" }}>
										{ack.policyName}
									</div>
									{ack.policyVersion && (
										<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
											Version {ack.policyVersion}
										</div>
									)}
								</td>
								<td>
									<span
										className={
											signed ? "badge badge-success" : "badge badge-warning"
										}
									>
										{signed ? "Signed" : "Not signed"}
									</span>
								</td>
								<td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
									{signed ? (
										<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
											Signed {fmtDate(ack.acknowledgedAt)}
										</span>
									) : (
										<button
											className="btn btn-primary btn-sm"
											onClick={() => setConfirmTarget(ack)}
											type="button"
										>
											Sign acknowledgement
										</button>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>

			{confirmTarget && (
				<SignDialog
					isPending={signMut.isPending}
					onClose={() => setConfirmTarget(null)}
					onConfirm={() => signMut.mutate(confirmTarget.id)}
					policyName={confirmTarget.policyName}
				/>
			)}
		</>
	);
}

function SignDialog({
	policyName,
	isPending,
	onClose,
	onConfirm,
}: {
	isPending: boolean;
	onClose: () => void;
	onConfirm: () => void;
	policyName: string;
}) {
	return (
		<div
			aria-describedby="sign-ack-desc"
			aria-labelledby="sign-ack-title"
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
				<h2 id="sign-ack-title" style={{ fontSize: 15, fontWeight: 600 }}>
					Sign acknowledgement?
				</h2>
				<p
					id="sign-ack-desc"
					style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
				>
					This records that you have read and accepted this policy
					{policyName ? `: ${policyName}` : ""}.
				</p>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={isPending}
						onClick={onConfirm}
						type="button"
					>
						{isPending ? "Signing…" : "Sign acknowledgement"}
					</button>
				</div>
			</div>
		</div>
	);
}
