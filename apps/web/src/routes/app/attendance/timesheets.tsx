import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { useContext, useMemo, useState } from "react";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { canViewPayroll, isEmployee } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/attendance/timesheets")({
	component: TimesheetsPage,
});

type GroupBy = "none" | "week" | "fortnight" | "month";
type ScopeKind = "everyone" | "department" | "employee";

type TimesheetRow = {
	employeeId: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	bucketStart: string | null;
	totalWorkedMinutes: number;
	totalOvertimeMinutes: number;
	totalApprovedOtMinutes: number;
	totalPayableMinutes: number;
	daysPresent: number;
	daysHalfDay: number;
	daysAbsent: number;
	daysHoliday: number;
	totalLateMinutes: number;
	lateCount: number;
};

type DepartmentRow = { id: string; name: string };
type EmployeeRow = { id: string; firstName: string; lastName: string };
type PayPeriodRow = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
};

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
	{ value: "none", label: "Total" },
	{ value: "week", label: "Week" },
	{ value: "fortnight", label: "Fortnight" },
	{ value: "month", label: "Month" },
];

function hours(minutes: number): string {
	return (Number(minutes) / 60).toFixed(1);
}

function fullName(row: TimesheetRow): string {
	return `${row.employeeFirstName ?? ""} ${row.employeeLastName ?? ""}`.trim();
}

function downloadCsv(filename: string, csv: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function timesheetColumns(
	grouped: boolean
): ColumnDef<TimesheetRow, unknown>[] {
	const cols: ColumnDef<TimesheetRow, unknown>[] = [
		{
			id: "employee",
			header: "Employee",
			cell: ({ row }) => (
				<span className="fn-name">{fullName(row.original)}</span>
			),
		},
	];
	if (grouped) {
		cols.push({
			accessorKey: "bucketStart",
			header: "Period",
			cell: ({ row }) => (
				<span className="num">{row.original.bucketStart ?? "—"}</span>
			),
		});
	}
	cols.push(
		{
			accessorKey: "totalWorkedMinutes",
			header: "Worked hours",
			cell: ({ row }) => (
				<span className="num">{hours(row.original.totalWorkedMinutes)}</span>
			),
		},
		{
			accessorKey: "totalOvertimeMinutes",
			header: "Overtime hours",
			cell: ({ row }) => (
				<span className="num">{hours(row.original.totalOvertimeMinutes)}</span>
			),
		},
		{
			accessorKey: "daysPresent",
			header: "Days present",
			cell: ({ row }) => (
				<span className="num">{row.original.daysPresent}</span>
			),
		},
		{
			accessorKey: "daysAbsent",
			header: "Days absent",
			cell: ({ row }) => <span className="num">{row.original.daysAbsent}</span>,
		},
		{
			accessorKey: "totalLateMinutes",
			header: "Late (min)",
			cell: ({ row }) => (
				<span className="num">{row.original.totalLateMinutes}</span>
			),
		},
		{
			accessorKey: "lateCount",
			header: "Late count",
			cell: ({ row }) => <span className="num">{row.original.lateCount}</span>,
		}
	);
	return cols;
}

function TimesheetsPage() {
	const org = useContext(OrgCtx);
	const employeeOnly = isEmployee(org.memberRole);
	const canExport = canViewPayroll(org.memberRole);

	const year = new Date().getFullYear();
	const [from, setFrom] = useState(`${year}-01-01`);
	const [to, setTo] = useState(`${year}-12-31`);
	const [groupBy, setGroupBy] = useState<GroupBy>("none");
	const [scopeKind, setScopeKind] = useState<ScopeKind>("everyone");
	const [departmentId, setDepartmentId] = useState<string>("");
	const [employeeId, setEmployeeId] = useState<string>("");
	const [payPeriodId, setPayPeriodId] = useState<string>("");

	// Scope pickers and pay-period chooser are not shown to a pure employee — the
	// server self-scopes their data, so they only ever see their own timesheet.
	const showScope = !employeeOnly;

	const departments = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: {},
			enabled: showScope,
		})
	);
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: showScope,
		})
	);
	const payPeriods = useQuery(
		orpc.payroll.payPeriods.list.queryOptions({
			input: { page: 1, pageSize: 50 },
			enabled: showScope && canExport,
		})
	);

	const effectiveDepartmentId =
		showScope && scopeKind === "department" && departmentId
			? departmentId
			: undefined;
	const effectiveEmployeeId =
		showScope && scopeKind === "employee" && employeeId
			? employeeId
			: undefined;

	const queryInput = {
		startDate: from,
		endDate: to,
		groupBy,
		departmentId: effectiveDepartmentId,
		employeeId: effectiveEmployeeId,
	};

	const summary = useQuery(
		orpc.attendance.summary.range.queryOptions({ input: queryInput })
	);

	const rows = (summary.data as TimesheetRow[] | undefined) ?? [];
	const grouped = groupBy !== "none";
	const columns = useMemo(() => timesheetColumns(grouped), [grouped]);

	const totals = useMemo(
		() =>
			rows.reduce(
				(acc, r) => {
					acc.worked += Number(r.totalWorkedMinutes);
					acc.overtime += Number(r.totalOvertimeMinutes);
					acc.present += Number(r.daysPresent);
					acc.absent += Number(r.daysAbsent);
					acc.late += Number(r.totalLateMinutes);
					acc.lateCount += Number(r.lateCount);
					return acc;
				},
				{
					worked: 0,
					overtime: 0,
					present: 0,
					absent: 0,
					late: 0,
					lateCount: 0,
				}
			),
		[rows]
	);

	function applyPayPeriod(id: string) {
		setPayPeriodId(id);
		const list = (payPeriods.data as { data: PayPeriodRow[] } | undefined)
			?.data;
		const period = list?.find((p) => p.id === id);
		if (period) {
			setFrom(period.startDate.slice(0, 10));
			setTo(period.endDate.slice(0, 10));
		}
	}

	async function handleExport() {
		const res = (await orpc.attendance.summary.exportCsv.call(queryInput)) as {
			filename: string;
			csv: string;
		};
		downloadCsv(res.filename, res.csv);
	}

	const deptRows = (departments.data as DepartmentRow[] | undefined) ?? [];
	const empRows =
		(employees.data as { data: EmployeeRow[] } | undefined)?.data ?? [];
	const periodRows =
		(payPeriods.data as { data: PayPeriodRow[] } | undefined)?.data ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Time &amp; Attendance</span>
					</div>
					<h1 className="page-title">
						{employeeOnly ? "My timesheet" : "Timesheets"}
					</h1>
					<p className="page-sub">
						Hours worked per employee over a date range, optionally grouped by
						week, fortnight, or month.
					</p>
				</div>
			</div>

			<div className="fn-toolbar">
				{showScope ? (
					<>
						<label htmlFor="ts-scope">Scope</label>
						<select
							id="ts-scope"
							onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
							value={scopeKind}
						>
							<option value="everyone">Everyone</option>
							<option value="department">Department</option>
							<option value="employee">Employee</option>
						</select>

						{scopeKind === "department" ? (
							<select
								aria-label="Department"
								onChange={(e) => setDepartmentId(e.target.value)}
								value={departmentId}
							>
								<option value="">All departments</option>
								{deptRows.map((d) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						) : null}

						{scopeKind === "employee" ? (
							<select
								aria-label="Employee"
								onChange={(e) => setEmployeeId(e.target.value)}
								value={employeeId}
							>
								<option value="">Select employee</option>
								{empRows.map((emp) => (
									<option key={emp.id} value={emp.id}>
										{emp.firstName} {emp.lastName}
									</option>
								))}
							</select>
						) : null}
					</>
				) : null}

				{showScope && canExport && periodRows.length > 0 ? (
					<>
						<label htmlFor="ts-period">Pay period</label>
						<select
							id="ts-period"
							onChange={(e) => applyPayPeriod(e.target.value)}
							value={payPeriodId}
						>
							<option value="">Custom range</option>
							{periodRows.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</>
				) : null}

				<label htmlFor="ts-from">From</label>
				<input
					id="ts-from"
					onChange={(e) => {
						setFrom(e.target.value);
						setPayPeriodId("");
					}}
					type="date"
					value={from}
				/>
				<label htmlFor="ts-to">To</label>
				<input
					id="ts-to"
					onChange={(e) => {
						setTo(e.target.value);
						setPayPeriodId("");
					}}
					type="date"
					value={to}
				/>

				<label htmlFor="ts-group">Group by</label>
				<select
					id="ts-group"
					onChange={(e) => setGroupBy(e.target.value as GroupBy)}
					value={groupBy}
				>
					{GROUP_OPTIONS.map((g) => (
						<option key={g.value} value={g.value}>
							{g.label}
						</option>
					))}
				</select>

				{canExport ? (
					<button className="fn-btn" onClick={handleExport} type="button">
						Export CSV
					</button>
				) : null}
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={columns}
					data={rows}
					emptyState={
						<EmptyState
							compact
							description="No attendance records in this period."
							icon={<CalendarRange size={24} />}
							title="No hours to show"
						/>
					}
					isError={summary.isError}
					isLoading={summary.isLoading}
				/>
			</div>

			{rows.length > 0 ? (
				<div className="fn-section">
					<div className="fn-section-title">Totals</div>
					<div className="card" style={{ padding: "12px 16px" }}>
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: "24px",
								fontSize: "13px",
							}}
						>
							<span>
								Worked hours <strong>{hours(totals.worked)}</strong>
							</span>
							<span>
								Overtime hours <strong>{hours(totals.overtime)}</strong>
							</span>
							<span>
								Days present <strong>{totals.present}</strong>
							</span>
							<span>
								Days absent <strong>{totals.absent}</strong>
							</span>
							<span>
								Late (min) <strong>{totals.late}</strong>
							</span>
							<span>
								Late count <strong>{totals.lateCount}</strong>
							</span>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
