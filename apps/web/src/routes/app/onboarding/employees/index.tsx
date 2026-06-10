import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useContext, useMemo, useState } from "react";

import "@/styles/onboarding.css";
import { EmptyState } from "@/components/empty-state";
import {
	isTaskResolved,
	ONBOARDING_STATUS_LABEL,
	ONBOARDING_STATUS_TONE,
} from "@/features/onboarding/labels";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";
import { StartOnboardingDialog } from "@/features/onboarding/start-onboarding-dialog";
import { canManageOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/onboarding/employees/")({
	component: EmployeeOnboardingListPage,
});

type OnboardingStatus =
	| "not_started"
	| "in_progress"
	| "blocked"
	| "completed"
	| "cancelled";

const FILTERS: { key: OnboardingStatus | "all"; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "in_progress", label: "In progress" },
	{ key: "not_started", label: "Not started" },
	{ key: "blocked", label: "Blocked" },
	{ key: "completed", label: "Completed" },
	{ key: "cancelled", label: "Cancelled" },
];

const JOIN_PAGE_SIZE = 100;

interface TaskRow {
	dueAt: string | null;
	status: string;
	titleSnapshot: string;
}

interface OnboardingRow {
	done: number;
	employeeId: string;
	employeeNameValue: string;
	id: string;
	nextTaskTitle: string | null;
	overdue: number;
	pct: number;
	progressLoading: boolean;
	skipped: number;
	startedAt: string | Date;
	status: string;
	templateId: string | null;
	templateNameValue: string;
	total: number;
}

const onboardingColumns: ColumnDef<OnboardingRow, unknown>[] = [
	{
		accessorKey: "employeeNameValue",
		header: "Employee",
		cell: ({ row }) => (
			<Link
				params={{ id: row.original.id }}
				style={{
					fontWeight: 600,
					color: "var(--fg)",
					textDecoration: "none",
				}}
				to="/app/onboarding/employees/$id"
			>
				{row.original.employeeNameValue}
			</Link>
		),
	},
	{
		accessorKey: "templateNameValue",
		header: "Template",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{row.original.templateNameValue}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status as OnboardingStatus;
			return (
				<>
					<span className={ONBOARDING_STATUS_TONE[status]}>
						{ONBOARDING_STATUS_LABEL[status] ?? status}
					</span>
					{row.original.overdue > 0 && (
						<span className="badge badge-warning" style={{ marginLeft: 6 }}>
							{row.original.overdue} overdue
						</span>
					)}
				</>
			);
		},
	},
	{
		accessorKey: "pct",
		header: "Progress",
		cell: ({ row }) => {
			const { progressLoading, pct, done, total, skipped } = row.original;
			if (progressLoading) {
				return <span style={{ color: "var(--fg-3)" }}>…</span>;
			}
			return (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 4,
						minWidth: 140,
					}}
				>
					<div className="ob-progress">
						<div className="ob-progress-fill" style={{ width: `${pct}%` }} />
					</div>
					<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
						{done}/{total} done
						{skipped > 0 ? ` · ${skipped} skipped` : ""}
					</span>
				</div>
			);
		},
	},
	{
		accessorKey: "nextTaskTitle",
		header: "Next task",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)", fontSize: 12.5 }}>
				{row.original.nextTaskTitle ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "startedAt",
		header: "Started",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{new Date(row.original.startedAt).toLocaleDateString()}
			</span>
		),
	},
];

function EmployeeOnboardingListPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageOnboarding(org.memberRole);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<OnboardingStatus | "all">("all");
	const [showStart, setShowStart] = useState(false);

	const onboardings = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page: 1,
				pageSize: 50,
			},
		})
	);
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	const rows = onboardings.data?.data ?? [];

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

	const templateName = useMemo(() => {
		const map = new Map<string, string>();
		for (const t of templates.data?.data ?? []) {
			map.set(t.id, t.name);
		}
		return map;
	}, [templates.data]);

	// Per-onboarding task summaries → real progress, next task, overdue count.
	const taskQueries = useQueries({
		queries: rows.map((o) =>
			orpc.onboarding.tasks.list.queryOptions({
				input: { onboardingId: o.id },
			})
		),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "onboarding";
			},
		});

	const tableRows: OnboardingRow[] = rows.map((o, i) => {
		const tasks = (taskQueries[i]?.data ?? []) as TaskRow[];
		const total = tasks.length;
		const done = tasks.filter((t) => t.status === "completed").length;
		const skipped = tasks.filter((t) => t.status === "skipped").length;
		const pct = total === 0 ? 0 : Math.round((done / total) * 100);
		const overdue = tasks.filter(
			(t) =>
				!isTaskResolved(t.status) &&
				t.dueAt &&
				new Date(t.dueAt).getTime() < Date.now()
		).length;
		const nextTask = tasks.find((t) => !isTaskResolved(t.status));
		return {
			id: o.id,
			employeeId: o.employeeId,
			templateId: o.templateId,
			status: o.status,
			startedAt: o.startedAt,
			employeeNameValue: employeeName.get(o.employeeId) ?? "Employee",
			templateNameValue: o.templateId
				? (templateName.get(o.templateId) ?? "—")
				: "—",
			progressLoading: taskQueries[i]?.isLoading ?? false,
			pct,
			done,
			total,
			skipped,
			overdue,
			nextTaskTitle: nextTask ? nextTask.titleSnapshot : null,
		};
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Employees</span>
					</div>
					<h1 className="page-title">Employee onboarding</h1>
					<p className="page-sub">
						Track each new hire's onboarding progress, blockers, documents, and
						next steps.
					</p>
				</div>
				{canManage && (
					<div className="page-actions">
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setShowStart(true)}
							type="button"
						>
							Start onboarding
						</button>
					</div>
				)}
			</div>

			<OnboardingTabs />

			<div
				style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}
			>
				{FILTERS.map((f) => (
					<button
						className={`filter-chip ${filter === f.key ? "active" : ""}`}
						key={f.key}
						onClick={() => setFilter(f.key)}
						type="button"
					>
						{f.label}
					</button>
				))}
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={onboardingColumns}
					data={tableRows}
					emptyState={
						<EmptyState
							description={
								filter === "all"
									? "Start onboarding for a new hire to see it here."
									: "No onboardings match this filter."
							}
							icon={<ClipboardList size={20} />}
							title={
								filter === "all"
									? "No onboardings yet"
									: "No matching onboardings"
							}
						/>
					}
					isError={onboardings.isError}
					isLoading={onboardings.isLoading}
				/>
			</div>

			{showStart && (
				<StartOnboardingDialog
					onClose={() => setShowStart(false)}
					onStarted={(newId) => {
						setShowStart(false);
						invalidate();
						navigate({
							params: { id: newId },
							to: "/app/onboarding/employees/$id",
						});
					}}
				/>
			)}
		</div>
	);
}
