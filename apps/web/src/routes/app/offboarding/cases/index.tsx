import { useQuery } from "@tanstack/react-query";
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

			{cases.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading cases…
				</div>
			)}

			{!cases.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="When an employee resigns or is offboarded, their case shows up here."
						icon={<LogOut size={20} />}
						title="No offboarding cases"
					/>
				</div>
			)}

			{!cases.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>Employee</th>
								<th>Exit type</th>
								<th>Status</th>
								<th>Last working day</th>
								<th>Clearance progress</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{rows.map((c) => (
								<CaseRow
									caseId={c.id}
									employee={nameById.get(c.employeeId) ?? "Employee"}
									exitType={c.exitType}
									key={c.id}
									lastWorkingDay={c.lastWorkingDay}
									status={c.status}
								/>
							))}
						</tbody>
					</table>
				</div>
			)}

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

interface CaseRowProps {
	caseId: string;
	employee: string;
	exitType: string;
	lastWorkingDay: string | null;
	status: string;
}

function CaseRow({
	caseId,
	employee,
	exitType,
	lastWorkingDay,
	status,
}: CaseRowProps) {
	const tasks = useQuery(
		orpc.offboarding.tasks.list.queryOptions({ input: { caseId } })
	);
	const taskRows = tasks.data ?? [];
	const total = taskRows.length;
	const done = taskRows.filter((t) => isTaskResolved(t.status)).length;

	let progress = "—";
	if (tasks.isLoading) {
		progress = "…";
	} else if (total > 0) {
		progress = `${done}/${total} done`;
	}

	return (
		<tr>
			<td>
				<Link
					params={{ id: caseId }}
					style={{
						fontWeight: 600,
						color: "var(--fg)",
						textDecoration: "none",
					}}
					to="/app/offboarding/cases/$id"
				>
					{employee}
				</Link>
			</td>
			<td style={{ color: "var(--fg-2)" }}>{exitTypeLabel(exitType)}</td>
			<td>
				<span className={caseStatusTone(status)}>
					{caseStatusLabel(status)}
				</span>
			</td>
			<td style={{ color: "var(--fg-3)" }}>
				{lastWorkingDay
					? new Date(lastWorkingDay).toLocaleDateString()
					: "Not set"}
			</td>
			<td style={{ color: "var(--fg-2)" }}>{progress}</td>
			<td style={{ textAlign: "right" }}>
				<Link
					className="btn btn-sm"
					params={{ id: caseId }}
					to="/app/offboarding/cases/$id"
				>
					View
				</Link>
			</td>
		</tr>
	);
}
