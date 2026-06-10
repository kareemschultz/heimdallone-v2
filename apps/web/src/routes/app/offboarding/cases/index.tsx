import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/offboarding.css";
import { EmptyState } from "@/components/empty-state";
import {
	caseStatusLabel,
	caseStatusTone,
	exitTypeLabel,
	isTaskResolved,
} from "@/features/offboarding/labels";
import { OffboardingCreateCaseDialog } from "@/features/offboarding/offboarding-create-case-dialog";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";
import { canManageOffboarding, canViewOffboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/offboarding/cases/")({
	component: CasesListPage,
});

type StatusFilter =
	| "all"
	| "pending_approval"
	| "active"
	| "in_clearance"
	| "pending_settlement"
	| "closed";

const FILTERS: { key: StatusFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "pending_approval", label: "Pending approval" },
	{ key: "active", label: "Active" },
	{ key: "in_clearance", label: "In clearance" },
	{ key: "pending_settlement", label: "Pending settlement" },
	{ key: "closed", label: "Closed" },
];

function employeeName(emp: { firstName: string; lastName: string | null }) {
	return `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ""}`;
}

interface CaseRow {
	employee: string;
	exitType: string;
	id: string;
	lastWorkingDay: string | null;
	progress: string;
	status: string;
}

const caseColumns: ColumnDef<CaseRow, unknown>[] = [
	{
		accessorKey: "employee",
		header: "Employee",
		cell: ({ row }) => (
			<Link
				params={{ id: row.original.id }}
				style={{
					fontWeight: 600,
					color: "var(--fg)",
					textDecoration: "none",
				}}
				to="/app/offboarding/cases/$id"
			>
				{row.original.employee}
			</Link>
		),
	},
	{
		accessorKey: "exitType",
		header: "Exit type",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{exitTypeLabel(row.original.exitType)}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className={caseStatusTone(row.original.status)}>
				{caseStatusLabel(row.original.status)}
			</span>
		),
	},
	{
		accessorKey: "lastWorkingDay",
		header: "Last working day",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{row.original.lastWorkingDay
					? new Date(row.original.lastWorkingDay).toLocaleDateString()
					: "Not set"}
			</span>
		),
	},
	{
		accessorKey: "progress",
		header: "Clearance progress",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>{row.original.progress}</span>
		),
	},
	{
		accessorKey: "id",
		header: "",
		cell: ({ row }) => (
			<div style={{ textAlign: "right" }}>
				<Link
					className="btn btn-sm"
					params={{ id: row.original.id }}
					to="/app/offboarding/cases/$id"
				>
					View
				</Link>
			</div>
		),
	},
];

function CasesListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewOffboarding(org.memberRole);

	if (!canView) {
		return <CasesNoAccess />;
	}
	return <CasesDashboard canManage={canManageOffboarding(org.memberRole)} />;
}

function CasesNoAccess() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>Cases</span>
					</div>
					<h1 className="page-title">Offboarding cases</h1>
					<p className="page-sub">Track employee exits.</p>
				</div>
			</div>
			<div className="card card-pad">
				<EmptyState
					description="Offboarding case management is available to HR and administrators."
					icon={<LogOut size={20} />}
					title="You don't have access to offboarding cases"
				/>
			</div>
		</div>
	);
}

function CasesDashboard({ canManage }: { canManage: boolean }) {
	const navigate = useNavigate();
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [showCreate, setShowCreate] = useState(false);

	const cases = useQuery(
		orpc.offboarding.cases.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page: 1,
				pageSize: 100,
			},
		})
	);

	// Resolve employee names (active + inactive — closed cases reference
	// employees who are now inactive). Limited to 100 each; denormalize into
	// cases.list in a later hardening pass for larger orgs.
	const activeEmployees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const inactiveEmployees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: false, page: 1, pageSize: 100 },
		})
	);

	const nameById = new Map<string, string>();
	for (const emp of [
		...(activeEmployees.data?.data ?? []),
		...(inactiveEmployees.data?.data ?? []),
	]) {
		nameById.set(emp.id, employeeName(emp));
	}

	// cases.list returns Record<string, unknown>[] (API redactCase is generically
	// typed); cast to the fields the list renders.
	const rows = (cases.data?.data ?? []) as Array<{
		id: string;
		employeeId: string;
		exitType: string;
		lastWorkingDay: string | null;
		status: string;
	}>;

	// Per-case clearance progress (count of resolved tasks). Fetched up front so
	// the DataTable cell stays a pure render (hooks can't run per-row in a cell).
	const taskQueries = useQueries({
		queries: rows.map((c) =>
			orpc.offboarding.tasks.list.queryOptions({ input: { caseId: c.id } })
		),
	});

	const tableRows: CaseRow[] = rows.map((c, i) => {
		const q = taskQueries[i];
		const taskRows = q?.data ?? [];
		const total = taskRows.length;
		const done = taskRows.filter((t) => isTaskResolved(t.status)).length;

		let progress = "—";
		if (q?.isLoading) {
			progress = "…";
		} else if (total > 0) {
			progress = `${done}/${total} done`;
		}

		return {
			id: c.id,
			employee: nameById.get(c.employeeId) ?? "Employee",
			exitType: c.exitType,
			lastWorkingDay: c.lastWorkingDay,
			status: c.status,
			progress,
		};
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>Cases</span>
					</div>
					<h1 className="page-title">Offboarding cases</h1>
					<p className="page-sub">
						Track employee exits, clearance progress, access removal, and final
						readiness.
					</p>
				</div>
				{canManage && (
					<div className="page-actions">
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setShowCreate(true)}
							type="button"
						>
							Create case
						</button>
					</div>
				)}
			</div>

			<OffboardingTabs />

			<div className="ob-filter-row" style={{ marginBottom: 14 }}>
				{FILTERS.map((f) => (
					<button
						className={`ob-filter-pill ${filter === f.key ? "active" : ""}`}
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
					columns={caseColumns}
					data={tableRows}
					emptyState={
						<EmptyState
							description="When an employee resigns or is offboarded, their case shows up here."
							icon={<LogOut size={20} />}
							title="No offboarding cases"
						/>
					}
					isError={cases.isError}
					isLoading={cases.isLoading}
				/>
			</div>

			{showCreate && (
				<OffboardingCreateCaseDialog
					onClose={() => setShowCreate(false)}
					onCreated={(id) => {
						setShowCreate(false);
						navigate({ params: { id }, to: "/app/offboarding/cases/$id" });
					}}
				/>
			)}
		</div>
	);
}
