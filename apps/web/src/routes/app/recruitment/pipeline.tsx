import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { GitPullRequestArrow, X } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/pipeline")({
	component: PipelinePage,
});

type ActiveStage = "new" | "screening" | "shortlisted" | "interview" | "offer";

type AnyStage = ActiveStage | "hired" | "rejected" | "withdrawn";

const ACTIVE_COLUMNS: KanbanColumn[] = [
	{ key: "new", label: "Just applied" },
	{ key: "screening", label: "Screening" },
	{ key: "shortlisted", label: "Shortlisted" },
	{ key: "interview", label: "Interviewing" },
	{ key: "offer", label: "Offer" },
];

const ACTIVE_STAGES: ActiveStage[] = [
	"new",
	"screening",
	"shortlisted",
	"interview",
	"offer",
];

const REJECT_REASONS: { key: string; label: string }[] = [
	{ key: "not_qualified", label: "Not qualified" },
	{ key: "position_filled", label: "Position filled" },
	{ key: "failed_interview", label: "Failed interview" },
	{ key: "failed_background_check", label: "Failed background check" },
	{ key: "salary_mismatch", label: "Salary mismatch" },
	{ key: "candidate_unresponsive", label: "Candidate unresponsive" },
	{ key: "other", label: "Other" },
];

interface PipelineCard {
	appliedAt: Date;
	candidateEmail: string;
	candidateName: string;
	id: string;
	stage: AnyStage;
}

// Forward unrestricted; backward only one stage at a time. Larger backward
// jumps require admin override + audit reason and are done via the API only.
function canMoveStage(
	_card: PipelineCard,
	fromStage: ActiveStage,
	toStage: ActiveStage
): { allowed: boolean; reason?: string } {
	const fromIndex = ACTIVE_STAGES.indexOf(fromStage);
	const toIndex = ACTIVE_STAGES.indexOf(toStage);
	if (toIndex > fromIndex) {
		return { allowed: true };
	}
	if (toIndex === fromIndex - 1) {
		return { allowed: true };
	}
	return {
		allowed: false,
		reason: "Move back one stage at a time.",
	};
}

function PipelinePage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const queryClient = useQueryClient();
	const [openingId, setOpeningId] = useState<string>("");
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState<string>("not_qualified");
	const [rejectFeedback, setRejectFeedback] = useState<string>("");

	const openings = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { status: "open", page: 1, pageSize: 50 },
		})
	);

	const applications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: openingId
				? { jobOpeningId: openingId, page: 1, pageSize: 100 }
				: { page: 1, pageSize: 1 },
			enabled: !!openingId,
		})
	);

	const candidates = useQuery(
		orpc.recruitment.candidates.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: !!openingId,
		})
	);

	const candidatesById = useMemo(() => {
		const map = new Map<
			string,
			{ firstName: string; lastName: string | null; email: string }
		>();
		for (const c of candidates.data?.data ?? []) {
			map.set(c.id, {
				firstName: c.firstName,
				lastName: c.lastName,
				email: c.email,
			});
		}
		return map;
	}, [candidates.data]);

	const cards: PipelineCard[] = useMemo(() => {
		const rows = applications.data?.data ?? [];
		return rows.map((a) => {
			const c = candidatesById.get(a.candidateId);
			const fullName = c
				? [c.firstName, c.lastName].filter(Boolean).join(" ")
				: "Candidate";
			return {
				id: a.id,
				stage: a.stage as AnyStage,
				candidateName: fullName,
				candidateEmail: c?.email ?? "",
				appliedAt: new Date(a.appliedAt),
			};
		});
	}, [applications.data, candidatesById]);

	const activeCards = cards.filter((c) =>
		(ACTIVE_STAGES as string[]).includes(c.stage)
	);
	const terminalCounts = {
		hired: cards.filter((c) => c.stage === "hired").length,
		rejected: cards.filter((c) => c.stage === "rejected").length,
		withdrawn: cards.filter((c) => c.stage === "withdrawn").length,
	};

	const invalidatePipeline = async () => {
		await queryClient.invalidateQueries({
			predicate: (q) => {
				const key = q.queryKey;
				if (!Array.isArray(key)) {
					return false;
				}
				const path = key[0];
				return Array.isArray(path) && path[0] === "recruitment";
			},
		});
	};

	const moveMutation = useMutation({
		mutationFn: (vars: { id: string; toStage: ActiveStage }) =>
			client.recruitment.applications.moveStage({
				id: vars.id,
				toStage: vars.toStage,
			}),
		onSuccess: async () => {
			await invalidatePipeline();
		},
		onError: (err: Error) => {
			toast.error(`Could not move candidate: ${err.message}`);
		},
	});

	const rejectMutation = useMutation({
		mutationFn: (vars: {
			id: string;
			reason: (typeof REJECT_REASONS)[number]["key"];
			feedback?: string;
		}) =>
			client.recruitment.applications.reject({
				id: vars.id,
				reason: vars.reason as
					| "not_qualified"
					| "position_filled"
					| "failed_interview"
					| "failed_background_check"
					| "salary_mismatch"
					| "candidate_unresponsive"
					| "other",
				feedback: vars.feedback || undefined,
			}),
		onSuccess: async () => {
			setRejectingId(null);
			setRejectFeedback("");
			setRejectReason("not_qualified");
			await invalidatePipeline();
			toast.success("Candidate rejected.");
		},
		onError: (err: Error) => {
			toast.error(`Could not reject: ${err.message}`);
		},
	});

	const openingList = openings.data?.data ?? [];
	const isLoading = applications.isLoading || candidates.isLoading;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Pipeline</span>
					</div>
					<h1 className="page-title">Pipeline</h1>
					<p className="page-sub">
						Drag candidates between stages, or use Move on each card.
					</p>
				</div>
			</div>

			<RecruitmentTabs />

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 10,
					alignItems: "center",
					marginBottom: 14,
				}}
			>
				<label
					htmlFor="pipeline-opening"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Showing pipeline for:
				</label>
				<select
					className="input"
					id="pipeline-opening"
					onChange={(e) => setOpeningId(e.target.value)}
					style={{ maxWidth: 320 }}
					value={openingId}
				>
					<option value="">Select an open job…</option>
					{openingList.map((o) => (
						<option key={o.id} value={o.id}>
							{o.title}
						</option>
					))}
				</select>
				{openingId && (
					<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
						Hired {terminalCounts.hired} · Rejected {terminalCounts.rejected} ·
						Withdrawn {terminalCounts.withdrawn}
					</span>
				)}
			</div>

			{!openingId && (
				<div className="card card-pad">
					<EmptyState
						description="Choose a job above to see its candidates by stage."
						icon={<GitPullRequestArrow size={20} />}
						title="Pick a job to view the pipeline"
					/>
				</div>
			)}

			{openingId && isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading pipeline…
				</div>
			)}

			{openingId && !isLoading && activeCards.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="No candidates are currently in the active stages for this job."
						icon={<GitPullRequestArrow size={20} />}
						title="No active candidates"
					/>
				</div>
			)}

			{openingId && !isLoading && activeCards.length > 0 && (
				<KanbanBoard<PipelineCard>
					canMove={(card, from, to) => {
						const verdict = canMoveStage(
							card,
							from as ActiveStage,
							to as ActiveStage
						);
						if (!verdict.allowed && verdict.reason) {
							toast.error(verdict.reason);
						}
						return verdict;
					}}
					cards={activeCards}
					columns={ACTIVE_COLUMNS}
					emptyColumnHint="Drop candidates here"
					getCardColumn={(c) => c.stage}
					getCardKey={(c) => c.id}
					onMove={async (id, _from, to) => {
						await moveMutation.mutateAsync({
							id,
							toStage: to as ActiveStage,
						});
					}}
					renderCard={(card) => (
						<div className="kanban-card">
							<div className="kanban-card-row">
								<span className="kanban-card-name">{card.candidateName}</span>
							</div>
							<div className="kanban-card-meta">{card.candidateEmail}</div>
							<div className="kanban-card-meta">
								Applied {card.appliedAt.toLocaleDateString()}
							</div>
							{canManage && (
								<div
									className="kanban-card-actions"
									onPointerDown={(e) => e.stopPropagation()}
								>
									<MoveMenu
										currentStage={card.stage as ActiveStage}
										onSelect={(to) => {
											const verdict = canMoveStage(
												card,
												card.stage as ActiveStage,
												to
											);
											if (!verdict.allowed) {
												if (verdict.reason) {
													toast.error(verdict.reason);
												}
												return;
											}
											moveMutation.mutate({ id: card.id, toStage: to });
										}}
									/>
									<button
										className="btn btn-sm"
										onClick={() => setRejectingId(card.id)}
										type="button"
									>
										Reject
									</button>
								</div>
							)}
						</div>
					)}
				/>
			)}

			{rejectingId && (
				<RejectDialog
					feedback={rejectFeedback}
					isSubmitting={rejectMutation.isPending}
					onCancel={() => setRejectingId(null)}
					onFeedbackChange={setRejectFeedback}
					onReasonChange={setRejectReason}
					onSubmit={() =>
						rejectMutation.mutate({
							id: rejectingId,
							reason: rejectReason,
							feedback: rejectFeedback,
						})
					}
					reason={rejectReason}
				/>
			)}
		</div>
	);
}

interface MoveMenuProps {
	currentStage: ActiveStage;
	onSelect: (to: ActiveStage) => void;
}

function MoveMenu({ currentStage, onSelect }: MoveMenuProps) {
	const targets = ACTIVE_COLUMNS.filter((c) => c.key !== currentStage);
	return (
		<details className="move-menu">
			<summary className="btn btn-sm">Move to ▾</summary>
			<div className="move-menu-list">
				{targets.map((c) => (
					<button
						className="move-menu-item"
						key={c.key}
						onClick={(e) => {
							e.preventDefault();
							(e.currentTarget.closest("details") as HTMLDetailsElement).open =
								false;
							onSelect(c.key as ActiveStage);
						}}
						type="button"
					>
						{c.label}
					</button>
				))}
			</div>
		</details>
	);
}

interface RejectDialogProps {
	feedback: string;
	isSubmitting: boolean;
	onCancel: () => void;
	onFeedbackChange: (f: string) => void;
	onReasonChange: (r: string) => void;
	onSubmit: () => void;
	reason: string;
}

function RejectDialog({
	reason,
	feedback,
	isSubmitting,
	onReasonChange,
	onFeedbackChange,
	onCancel,
	onSubmit,
}: RejectDialogProps) {
	return (
		<div
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
					maxWidth: 480,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<h2 style={{ fontSize: 15, fontWeight: 600 }}>Reject candidate</h2>
					<button
						aria-label="Close"
						className="btn btn-sm"
						onClick={onCancel}
						type="button"
					>
						<X size={14} />
					</button>
				</div>
				<div>
					<div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 6 }}>
						Reason
					</div>
					<select
						className="input"
						onChange={(e) => onReasonChange(e.target.value)}
						style={{ width: "100%" }}
						value={reason}
					>
						{REJECT_REASONS.map((r) => (
							<option key={r.key} value={r.key}>
								{r.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 6 }}>
						Internal note (optional)
					</div>
					<textarea
						className="input"
						onChange={(e) => onFeedbackChange(e.target.value)}
						placeholder="Visible only to recruiters and HR."
						rows={3}
						style={{ width: "100%", resize: "vertical" }}
						value={feedback}
					/>
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={isSubmitting}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={isSubmitting}
						onClick={onSubmit}
						type="button"
					>
						{isSubmitting ? "Rejecting…" : "Reject candidate"}
					</button>
				</div>
			</div>
		</div>
	);
}
