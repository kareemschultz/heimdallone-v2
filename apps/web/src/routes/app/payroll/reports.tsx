import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	BarChart3,
	DollarSign,
	Download,
	FileText,
	TrendingDown,
	TrendingUp,
	Users,
} from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
	"auditor",
];

export const Route = createFileRoute("/app/payroll/reports")({
	component: PayrollReportsPage,
});

function PayrollReportsPage() {
	const org = useContext(OrgCtx);
	const canView = PAYROLL_ROLES.includes(org.memberRole);

	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

	const { data: dashboard } = useQuery({
		...orpc.payroll.reports.dashboardSummary.queryOptions({}),
		enabled: canView,
	});

	const { data: runs } = useQuery({
		...orpc.payroll.runs.list.queryOptions({
			input: { page: 1, pageSize: 10 },
		}),
		enabled: canView,
	});

	const latestRunId =
		selectedRunId ??
		((runs?.data?.[0] as Record<string, unknown> | undefined)?.id as
			| string
			| undefined);

	const { data: deptCosts } = useQuery({
		...orpc.payroll.reports.costByDepartment.queryOptions({
			input: { payrollRunId: latestRunId ?? "" },
		}),
		enabled: canView && !!latestRunId,
	});

	const { data: blockerSummary } = useQuery({
		...orpc.payroll.reports.blockersSummary.queryOptions({
			input: { payrollRunId: latestRunId ?? "" },
		}),
		enabled: canView && !!latestRunId,
	});

	const { data: payslips } = useQuery({
		...orpc.payroll.payslips.list.queryOptions({
			input: {
				payrollRunId: latestRunId ?? undefined,
				page: 1,
				pageSize: 100,
			},
		}),
		enabled: canView && !!latestRunId,
	});

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Payroll reports</h1>
						<p className="page-sub">
							You don't have permission to view payroll reports.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const latestRun = dashboard?.latestRun as Record<string, unknown> | null;
	const allRuns = (runs?.data ?? []) as Record<string, unknown>[];
	const slips = (payslips?.data ?? []) as Record<string, unknown>[];
	const depts = (deptCosts ?? []) as Record<string, unknown>[];
	const blockers = (blockerSummary ?? []) as Record<string, unknown>[];

	const totals = computeTotals(latestRun, slips);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Payroll</span>
						<span className="sep">/</span>
						<span>Reports</span>
					</div>
					<h1 className="page-title">Payroll reports</h1>
					<p className="page-sub">
						Use reports to understand payroll cost, blockers, and department
						totals across payroll runs.
					</p>
				</div>
			</div>

			<RunSelector
				allRuns={allRuns}
				latestRunId={latestRunId}
				onSelect={setSelectedRunId}
				selectedRunId={selectedRunId}
			/>

			{/* Summary metrics */}
			<div className="sum-row" style={{ marginBottom: 18 }}>
				<MetricCard
					accent
					delta={`${totals.employeeCount} employees`}
					icon={<DollarSign size={14} />}
					label="Total gross"
					value={`$${totals.totalGross.toLocaleString()}`}
				/>
				<MetricCard
					delta="After all deductions"
					icon={<TrendingUp size={14} />}
					label="Total net"
					value={`$${totals.totalNet.toLocaleString()}`}
				/>
				<MetricCard
					delta="PAYE + NIS + other"
					icon={<TrendingDown size={14} />}
					label="Total deductions"
					value={`$${totals.totalDeductions.toLocaleString()}`}
				/>
				<MetricCard
					delta={`${dashboard?.totalRuns ?? 0} total runs`}
					icon={<Users size={14} />}
					label="Employees"
					value={String(totals.employeeCount)}
				/>
			</div>

			<div className="payroll-grid">
				<div className="left-col">
					{/* Payslip status distribution */}
					<div className="emp-table">
						<div className="emp-head">
							<span style={{ fontWeight: 600, fontSize: 14 }}>
								Payslip status
							</span>
						</div>
						<div style={{ padding: 16 }}>
							{slips.length === 0 && (
								<div
									style={{
										textAlign: "center",
										padding: 20,
										color: "var(--fg-3)",
										fontSize: 13,
									}}
								>
									No payslips for this run yet. Run payroll to see results.
								</div>
							)}
							{slips.length > 0 && (
								<PayslipStatusChart total={slips.length} totals={totals} />
							)}
						</div>
					</div>

					<DepartmentCostTable depts={depts} />

					<IssuesSummaryTable issues={blockers} />
				</div>

				<div className="right-col">
					<RecentRunsList runs={allRuns} />

					{/* Quick stats */}
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Organization overview</span>
						</div>
						<div className="side-body">
							<div className="fact-row">
								<span className="k">Total runs</span>
								<span className="v">{dashboard?.totalRuns ?? 0}</span>
							</div>
							<div className="fact-row">
								<span className="k">Open periods</span>
								<span className="v">{dashboard?.openPeriods ?? 0}</span>
							</div>
							<div className="fact-row">
								<span className="k">Active loans</span>
								<span className="v">{dashboard?.activeLoans ?? 0}</span>
							</div>
							<div className="fact-row">
								<span className="k">Pending reimbursements</span>
								<span className="v">
									{dashboard?.pendingReimbursements ?? 0}
								</span>
							</div>
						</div>
					</div>

					{/* Export placeholders */}
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Export &amp; reports</span>
						</div>
						<div className="side-body">
							<ExportPlaceholder
								icon={<Download size={14} />}
								label="Export CSV"
								note="Planned for Phase 8K"
							/>
							<ExportPlaceholder
								icon={<FileText size={14} />}
								label="Payroll summary PDF"
								note="Planned for Phase 8K"
							/>
							<ExportPlaceholder
								icon={<FileText size={14} />}
								label="Statutory reports"
								note="Planned for Phase 8K"
							/>
							<ExportPlaceholder
								icon={<DollarSign size={14} />}
								label="Bank export"
								note="Planned for Phase 8K"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MetricCard({
	label,
	value,
	delta,
	icon,
	accent,
}: {
	label: string;
	value: string;
	delta: string;
	icon: React.ReactNode;
	accent?: boolean;
}) {
	return (
		<div className={`sum-card ${accent ? "accent" : ""}`}>
			<span className="lbl">
				{icon}
				<span style={{ marginLeft: 6 }}>{label}</span>
			</span>
			<span className="val">{value}</span>
			<span className="delta">{delta}</span>
		</div>
	);
}

function StatusBar({
	total,
	draft,
	confirmed,
	paid,
}: {
	total: number;
	draft: number;
	confirmed: number;
	paid: number;
}) {
	const draftPct = (draft / total) * 100;
	const confirmedPct = (confirmed / total) * 100;
	const paidPct = (paid / total) * 100;

	return (
		<div
			style={{
				display: "flex",
				height: 10,
				borderRadius: 5,
				overflow: "hidden",
				background: "var(--bg-3)",
			}}
		>
			{draftPct > 0 && (
				<div
					style={{
						width: `${draftPct}%`,
						background: "var(--fg-4)",
					}}
				/>
			)}
			{confirmedPct > 0 && (
				<div
					style={{
						width: `${confirmedPct}%`,
						background: "var(--success)",
					}}
				/>
			)}
			{paidPct > 0 && (
				<div
					style={{
						width: `${paidPct}%`,
						background: "var(--accent)",
					}}
				/>
			)}
		</div>
	);
}

function StatusLegend({
	color,
	label,
	count,
}: {
	color: string;
	label: string;
	count: number;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
			<div
				style={{
					width: 8,
					height: 8,
					borderRadius: 2,
					background: color,
				}}
			/>
			<span style={{ color: "var(--fg-3)" }}>
				{label}: <strong style={{ color: "var(--fg)" }}>{count}</strong>
			</span>
		</div>
	);
}

function ExportPlaceholder({
	icon,
	label,
	note,
}: {
	icon: React.ReactNode;
	label: string;
	note: string;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "8px 0",
				borderBottom: "1px dashed var(--line)",
				opacity: 0.5,
			}}
		>
			<div style={{ color: "var(--fg-3)" }}>{icon}</div>
			<div style={{ flex: 1 }}>
				<div style={{ fontSize: 13 }}>{label}</div>
				<div style={{ fontSize: 11, color: "var(--fg-4)" }}>{note}</div>
			</div>
		</div>
	);
}

function humanizeCode(code: string): string {
	const map: Record<string, string> = {
		NO_CONTRACT: "No active contract",
		MISSING_SALARY: "Missing salary",
		MISSING_COUNTRY_PROFILE: "Missing country profile",
		MISSING_FILING_STATUS: "Missing filing status",
		NEGATIVE_NET_PAY: "Deductions exceed gross pay",
		DUPLICATE_PAYSLIP: "Duplicate payslip",
		MISSING_CLOCK_OUT: "Missing clock-out",
		ABSENT_WITHOUT_LEAVE: "Absent without leave",
		PENDING_LEAVE: "Pending leave requests",
		UNVALIDATED_ATTENDANCE: "Unvalidated attendance",
		LOW_CONFIDENCE: "Low confidence estimate",
		LOAN_EXCEEDS_THRESHOLD: "Loan exceeds threshold",
	};
	return map[code] ?? code.replace(/_/g, " ").toLowerCase();
}

function PayslipStatusChart({
	totals,
	total,
}: {
	totals: ReturnType<typeof computeTotals>;
	total: number;
}) {
	return (
		<>
			<StatusBar
				confirmed={totals.confirmedCount}
				draft={totals.draftCount}
				paid={totals.paidCount}
				total={total}
			/>
			<div
				style={{
					display: "flex",
					gap: 20,
					marginTop: 12,
					fontSize: 12.5,
				}}
			>
				<StatusLegend
					color="var(--fg-4)"
					count={totals.draftCount}
					label="Draft"
				/>
				<StatusLegend
					color="var(--success)"
					count={totals.confirmedCount}
					label="Confirmed"
				/>
				<StatusLegend
					color="var(--accent)"
					count={totals.paidCount}
					label="Paid"
				/>
			</div>
		</>
	);
}

function RunSelector({
	allRuns,
	selectedRunId,
	latestRunId,
	onSelect,
}: {
	allRuns: Record<string, unknown>[];
	selectedRunId: string | null;
	latestRunId: string | undefined;
	onSelect: (id: string | null) => void;
}) {
	if (allRuns.length === 0) {
		return null;
	}
	return (
		<div
			style={{
				marginBottom: 14,
				display: "flex",
				alignItems: "center",
				gap: 10,
			}}
		>
			<span style={{ fontSize: 13, color: "var(--fg-3)" }}>
				Showing data for:
			</span>
			<select
				className="emp-search"
				onChange={(e) => onSelect(e.target.value || null)}
				style={{ width: 280 }}
				value={selectedRunId ?? latestRunId ?? ""}
			>
				{allRuns.map((r) => (
					<option key={r.id as string} value={r.id as string}>
						{r.batchName as string} ({r.status as string})
					</option>
				))}
			</select>
		</div>
	);
}

function RecentRunsList({ runs }: { runs: Record<string, unknown>[] }) {
	return (
		<div className="side-card">
			<div className="side-head">
				<span className="ttl">Recent payroll runs</span>
			</div>
			<div className="side-body">
				{runs.length === 0 && (
					<div
						style={{
							textAlign: "center",
							padding: 16,
							color: "var(--fg-3)",
							fontSize: 13,
						}}
					>
						No payroll runs yet.
					</div>
				)}
				{runs.length > 0 &&
					runs.slice(0, 5).map((r) => (
						<div className="ck-item" key={r.id as string}>
							<div className={`ck-tick ${runStatusClass(r.status as string)}`}>
								{runStatusIcon(r.status as string)}
							</div>
							<div className="ck-body">
								<div className="ttl">{r.batchName as string}</div>
								<div className="sub">
									{r.status as string} · {r.employeeCount as number} employees ·
									${Number(r.totalNet).toLocaleString()} net
								</div>
							</div>
						</div>
					))}
			</div>
		</div>
	);
}

function runStatusIcon(status: string) {
	if (status === "paid") {
		return <DollarSign size={10} />;
	}
	return <BarChart3 size={10} />;
}

function DepartmentCostTable({ depts }: { depts: Record<string, unknown>[] }) {
	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>
					Cost by department
				</span>
			</div>
			{depts.length === 0 ? (
				<div
					style={{
						padding: 24,
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: 13,
					}}
				>
					No department data available for this run.
				</div>
			) : (
				<table>
					<thead>
						<tr>
							<th>Department</th>
							<th style={{ textAlign: "right" }}>Gross</th>
							<th style={{ textAlign: "right" }}>Net</th>
							<th style={{ textAlign: "right" }}>Employees</th>
						</tr>
					</thead>
					<tbody>
						{depts.map((d) => (
							<tr key={(d.departmentId as string) ?? "unassigned"}>
								<td style={{ fontWeight: 500 }}>
									{(d.departmentName as string) ?? "Unassigned"}
								</td>
								<td className="num-cell">
									${Number(d.totalGross).toLocaleString()}
								</td>
								<td className="num-cell">
									${Number(d.totalNet).toLocaleString()}
								</td>
								<td className="num-cell">{d.employeeCount as number}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function IssuesSummaryTable({ issues }: { issues: Record<string, unknown>[] }) {
	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>Issues summary</span>
			</div>
			{issues.length === 0 ? (
				<div
					style={{
						padding: 24,
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: 13,
					}}
				>
					No blockers or warnings for this run.
				</div>
			) : (
				<table>
					<thead>
						<tr>
							<th>Issue</th>
							<th>Type</th>
							<th style={{ textAlign: "right" }}>Count</th>
						</tr>
					</thead>
					<tbody>
						{issues.map((b) => (
							<tr key={b.code as string}>
								<td>
									<div style={{ fontWeight: 500 }}>
										{humanizeCode(b.code as string)}
									</div>
									<div
										style={{
											fontSize: 11,
											color: "var(--fg-3)",
											marginTop: 1,
										}}
									>
										{b.code as string}
									</div>
								</td>
								<td>
									<span
										className={`badge ${issueBadge(b.issueType as string)}`}
										style={{ fontSize: 10 }}
									>
										{b.issueType as string}
									</span>
								</td>
								<td className="num-cell">{b.total as number}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function issueBadge(issueType: string): string {
	if (issueType === "blocker") {
		return "badge-danger";
	}
	return "badge-warning";
}

function computeTotals(
	latestRun: Record<string, unknown> | null,
	slips: Record<string, unknown>[]
) {
	return {
		totalGross: latestRun ? Number(latestRun.totalGross) : 0,
		totalNet: latestRun ? Number(latestRun.totalNet) : 0,
		totalDeductions: latestRun
			? Number(latestRun.totalGross) - Number(latestRun.totalNet)
			: 0,
		employeeCount: latestRun ? (latestRun.employeeCount as number) : 0,
		draftCount: slips.filter((s) => s.status === "draft").length,
		confirmedCount: slips.filter((s) => s.status === "confirmed").length,
		paidCount: slips.filter((s) => s.status === "paid").length,
	};
}

function runStatusClass(status: string): string {
	if (status === "paid") {
		return "done";
	}
	if (status === "confirmed") {
		return "done";
	}
	if (status === "preview") {
		return "warn";
	}
	return "todo";
}
