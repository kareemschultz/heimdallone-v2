import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import "@/styles/onboarding.css";
import {
	AcknowledgementTable,
	type AckRow,
	type DocRequestRow,
	DocumentRequestTable,
} from "@/features/onboarding/document-center";
import {
	isTaskResolved,
	ONBOARDING_STATUS_LABEL,
	ONBOARDING_STATUS_TONE,
} from "@/features/onboarding/labels";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";
import { TaskChecklist } from "@/features/onboarding/task-checklist";
import { canManageOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/onboarding/employees/$id")({
	component: EmployeeOnboardingDetailPage,
});

type OnboardingStatus =
	| "not_started"
	| "in_progress"
	| "blocked"
	| "completed"
	| "cancelled";

function fmtDate(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	return new Date(value).toLocaleDateString();
}

function useOnboardingDetail(id: string) {
	const onboarding = useQuery(
		orpc.onboarding.employeeOnboarding.getById.queryOptions({ input: { id } })
	);
	const tasks = useQuery(
		orpc.onboarding.tasks.list.queryOptions({ input: { onboardingId: id } })
	);
	const docs = useQuery(
		orpc.onboarding.documentRequests.list.queryOptions({
			input: { onboardingId: id },
		})
	);
	const acks = useQuery(
		orpc.onboarding.acknowledgements.list.queryOptions({
			input: { onboardingId: id },
		})
	);
	const activity = useQuery(
		orpc.onboarding.activity.list.queryOptions({ input: { onboardingId: id } })
	);
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);

	const employeeName = useMemo(() => {
		const map = new Map<string, string>();
		for (const e of (employees.data?.data ?? []) as {
			id: string;
			firstName: string;
			lastName: string | null;
		}[]) {
			map.set(e.id, [e.firstName, e.lastName].filter(Boolean).join(" "));
		}
		return map;
	}, [employees.data]);

	const o = onboarding.data;
	const taskRows = tasks.data ?? [];
	const total = taskRows.length;
	const done = taskRows.filter((t) => t.status === "completed").length;
	const pct = total === 0 ? 0 : Math.round((done / total) * 100);
	const status = (o?.status ?? "in_progress") as OnboardingStatus;
	const isTerminal = status === "completed" || status === "cancelled";
	const nextTask = taskRows.find((t) => !isTaskResolved(t.status));
	const templateLabel = o?.templateId
		? (templates.data?.data.find((t) => t.id === o.templateId)?.name ?? "—")
		: "—";

	return {
		onboarding,
		tasks,
		docs,
		acks,
		activity,
		employeeName,
		o,
		taskRows,
		total,
		done,
		pct,
		status,
		isTerminal,
		nextTask,
		templateLabel,
	};
}

function EmployeeOnboardingDetailPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageOnboarding(org.memberRole);
	const { id } = Route.useParams();
	const queryClient = useQueryClient();
	const [confirm, setConfirm] = useState<"cancel" | "complete" | null>(null);

	const {
		onboarding,
		tasks,
		docs,
		acks,
		activity,
		employeeName,
		o,
		taskRows,
		total,
		done,
		pct,
		status,
		isTerminal,
		nextTask,
		templateLabel,
	} = useOnboardingDetail(id);

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "onboarding";
			},
		});

	const lifecycle = useMutation({
		mutationFn: (kind: "cancel" | "complete") =>
			kind === "cancel"
				? client.onboarding.employeeOnboarding.cancel({ id })
				: client.onboarding.employeeOnboarding.complete({ id }),
		onSuccess: async () => {
			setConfirm(null);
			await invalidate();
			toast.success("Onboarding updated.");
		},
		onError: (err: Error) => {
			toast.error(`Could not update: ${err.message}`);
		},
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/onboarding/employees"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Employee onboarding
						</Link>
						<span className="sep">/</span>
						<span>
							{o ? (employeeName.get(o.employeeId) ?? "Employee") : "…"}
						</span>
					</div>
					<h1 className="page-title">
						{o ? (employeeName.get(o.employeeId) ?? "Onboarding") : "Loading…"}
					</h1>
					{o && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginTop: 6,
							}}
						>
							<span className={ONBOARDING_STATUS_TONE[status]}>
								{ONBOARDING_STATUS_LABEL[status] ?? status}
							</span>
							<span style={{ color: "var(--fg-3)", fontSize: 12.5 }}>
								{templateLabel} · {done}/{total} tasks done ({pct}%)
							</span>
						</div>
					)}
				</div>
				{canManage && o && !isTerminal && (
					<div className="page-actions" style={{ display: "flex", gap: 8 }}>
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setConfirm("complete")}
							type="button"
						>
							Complete
						</button>
						<button
							className="btn btn-sm"
							onClick={() => setConfirm("cancel")}
							type="button"
						>
							Cancel onboarding
						</button>
					</div>
				)}
			</div>

			<OnboardingTabs />

			{onboarding.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading…
				</div>
			)}

			{o && (
				<>
					<NextStepPanel nextTask={nextTask?.titleSnapshot} status={status} />

					<SummaryCard
						completedAt={o.completedAt}
						employee={employeeName.get(o.employeeId) ?? "Employee"}
						pct={pct}
						startedAt={o.startedAt}
						status={status}
						template={templateLabel}
					/>

					<SectionCard title="Tasks">
						<TaskChecklist
							canComplete={canManage}
							canManage={canManage}
							employeeName={employeeName}
							emptyDescription="No tasks were copied into this onboarding."
							emptyTitle="No tasks"
							isLoading={tasks.isLoading}
							tasks={taskRows}
						/>
					</SectionCard>

					<SectionCard title="Document requests">
						<DocumentRequestTable
							canManage={canManage}
							emptyDescription="No document requests for this onboarding."
							isLoading={docs.isLoading}
							rows={(docs.data ?? []) as DocRequestRow[]}
						/>
						<Muted style={{ marginTop: 8 }}>
							File upload storage is coming later. HR can mark a document as
							received, then approve or reject it.
						</Muted>
					</SectionCard>

					<SectionCard title="Acknowledgements">
						<AcknowledgementTable
							canManage={canManage}
							emptyDescription="No policy acknowledgements for this onboarding."
							isLoading={acks.isLoading}
							rows={(acks.data ?? []) as AckRow[]}
						/>
					</SectionCard>

					<ActivitySection
						activity={activity.data ?? []}
						isLoading={activity.isLoading}
					/>
				</>
			)}

			{confirm && (
				<ConfirmDialog
					confirmLabel={confirm === "cancel" ? "Cancel onboarding" : "Complete"}
					helper={
						confirm === "cancel"
							? "Cancel only if this onboarding will not continue."
							: "Mark this onboarding complete once all tasks are handled."
					}
					isPending={lifecycle.isPending}
					onCancel={() => setConfirm(null)}
					onConfirm={() => lifecycle.mutate(confirm)}
					title={
						confirm === "cancel"
							? "Cancel this onboarding?"
							: "Complete this onboarding?"
					}
				/>
			)}
		</div>
	);
}

function NextStepPanel({
	status,
	nextTask,
}: {
	status: OnboardingStatus;
	nextTask: string | undefined;
}) {
	let message = "All tasks are handled.";
	if (status === "cancelled") {
		message = "This onboarding was cancelled.";
	} else if (status === "completed") {
		message = "This onboarding is complete.";
	} else if (status === "blocked") {
		message = "A task is blocked — clear it so onboarding can continue.";
	} else if (nextTask) {
		message = `Next up: ${nextTask}`;
	}
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div className="eyebrow" style={{ marginBottom: 6 }}>
				What to do next
			</div>
			<div style={{ fontSize: 13.5, color: "var(--fg)" }}>{message}</div>
		</div>
	);
}

function SummaryCard({
	employee,
	template,
	status,
	startedAt,
	completedAt,
	pct,
}: {
	employee: string;
	template: string;
	status: OnboardingStatus;
	startedAt: string | Date;
	completedAt: string | Date | null;
	pct: number;
}) {
	return (
		<div
			className="card card-pad"
			style={{ marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}
		>
			<Field label="Employee" value={employee} />
			<Field label="Template" value={template} />
			<Field
				label="Status"
				value={
					<span className={ONBOARDING_STATUS_TONE[status]}>
						{ONBOARDING_STATUS_LABEL[status] ?? status}
					</span>
				}
			/>
			<Field label="Started" value={fmtDate(startedAt)} />
			<Field label="Completed" value={fmtDate(completedAt)} />
			<Field label="Progress" value={`${pct}%`} />
		</div>
	);
}

interface ActivityRow {
	createdAt: string | Date;
	id: string;
	summary: string;
}

function ActivitySection({
	activity,
	isLoading,
}: {
	activity: ActivityRow[];
	isLoading: boolean;
}) {
	return (
		<SectionCard title="Activity">
			{isLoading && <Muted>Loading…</Muted>}
			{!isLoading && activity.length === 0 && <Muted>No activity yet.</Muted>}
			{!isLoading && activity.length > 0 && (
				<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
					{activity.map((a) => (
						<li
							key={a.id}
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 16,
								padding: "8px 0",
								borderBottom: "1px solid var(--line)",
								fontSize: 13,
							}}
						>
							<span style={{ color: "var(--fg)" }}>{a.summary}</span>
							<span
								style={{
									color: "var(--fg-3)",
									whiteSpace: "nowrap",
									fontSize: 12,
								}}
							>
								{new Date(a.createdAt).toLocaleString()}
							</span>
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}

function SectionCard({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div className="eyebrow" style={{ marginBottom: 10 }}>
				{title}
			</div>
			{children}
		</div>
	);
}

function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{label}</span>
			<span style={{ fontSize: 13.5, color: "var(--fg)" }}>{value}</span>
		</div>
	);
}

function Muted({
	children,
	style,
}: {
	children: ReactNode;
	style?: React.CSSProperties;
}) {
	return (
		<div style={{ color: "var(--fg-3)", fontSize: 13, ...style }}>
			{children}
		</div>
	);
}

function ConfirmDialog({
	title,
	helper,
	confirmLabel,
	isPending,
	onCancel,
	onConfirm,
}: {
	title: string;
	helper: string;
	confirmLabel: string;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div
			aria-describedby="ob-confirm-desc"
			aria-labelledby="ob-confirm-title"
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
					maxWidth: 420,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<h2 id="ob-confirm-title" style={{ fontSize: 15, fontWeight: 600 }}>
					{title}
				</h2>
				<p
					id="ob-confirm-desc"
					style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
				>
					{helper}
				</p>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={isPending}
						onClick={onCancel}
						type="button"
					>
						Back
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={isPending}
						onClick={onConfirm}
						type="button"
					>
						{isPending ? "Working…" : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
