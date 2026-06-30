import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Activity,
	Archive,
	ArrowRight,
	Briefcase,
	Calendar,
	Check,
	Clock,
	Download,
	Edit,
	ExternalLink,
	FileText,
	Filter,
	LayoutDashboard,
	Plus,
	Undo,
	Wallet,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employee-profile.css";
import "@/styles/contracts.css";
import { type PayFrequency, payFrequencyLabel } from "@/lib/pay-frequency";
import { canManageHR, canManagePayroll, canViewPayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/employees/$id")({
	component: EmployeeProfilePage,
});

type ProfileTab =
	| "overview"
	| "attendance"
	| "leave"
	| "payroll"
	| "documents"
	| "activity";

const HEATMAP_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Money values arrive as numeric strings (e.g. "265000.00"). */
function formatMoneyValue(value: string | null | undefined): string {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	const n = Number(value);
	return Number.isFinite(n) ? n.toLocaleString() : "—";
}

const SHORT_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function shortMonthYear(d: Date): string {
	return `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type AttendanceDay = {
	date: string;
	cls: string;
	label: string;
};

type AttendanceRecordRow = {
	date: string | Date;
	status: string | null;
	lateMinutes: number | null;
};

/** Build the last-N-days heatmap from real attendance records (oldest→newest). */
function buildHeatmap(
	records: AttendanceRecordRow[],
	today: Date
): AttendanceDay[] {
	const byDate = new Map<string, AttendanceRecordRow>();
	for (const r of records) {
		byDate.set(toYmd(new Date(r.date)), r);
	}
	const todayYmd = toYmd(today);
	const days: AttendanceDay[] = [];
	for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
		const d = new Date(today.getTime() - i * MS_PER_DAY);
		const ymd = toYmd(d);
		const rec = byDate.get(ymd);
		const isWeekend = d.getDay() === 0 || d.getDay() === 6;
		let cls = "";
		let label = "No record";
		if (ymd > todayYmd) {
			cls = "future";
			label = "Upcoming";
		} else if (rec) {
			if (rec.status === "absent") {
				cls = "absent";
				label = "Absent";
			} else if (rec.status === "present" && (rec.lateMinutes ?? 0) > 0) {
				cls = "late";
				label = "Late";
			} else if (rec.status === "present") {
				cls = "full";
				label = "Present";
			} else if (rec.status === "half_day") {
				cls = "full-2";
				label = "Half day";
			} else if (rec.status === "holiday") {
				cls = "weekend";
				label = "Holiday";
			}
		} else if (isWeekend) {
			cls = "weekend";
			label = "Weekend";
		}
		days.push({ date: ymd, cls, label });
	}
	return days;
}

type EditSection = "personal" | "work" | "bank" | null;

function EmployeeProfilePage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const org = useContext(OrgCtx);
	const canEdit = canManageHR(org.memberRole);
	const canEditBank = canManagePayroll(org.memberRole);
	const [profileTab, setProfileTab] = useState<ProfileTab>("overview");
	const [editSection, setEditSection] = useState<EditSection>(null);
	const [confirmArchive, setConfirmArchive] = useState(false);
	const [saving, setSaving] = useState(false);

	const {
		data: emp,
		isLoading,
		isError,
	} = useQuery(orpc.hrCore.employees.getById.queryOptions({ input: { id } }));

	const { data: bankDetails } = useQuery(
		orpc.hrCore.employees.bankDetails.get.queryOptions({
			input: { employeeId: id },
		})
	);

	const { data: depts } = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: positions } = useQuery(
		orpc.hrCore.jobPositions.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: shifts } = useQuery(
		orpc.hrCore.shifts.list.queryOptions({ input: { includeArchived: false } })
	);
	const { data: workTypes } = useQuery(
		orpc.hrCore.workTypes.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: empTypes } = useQuery(
		orpc.hrCore.employeeTypes.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: empListData } = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);

	const { data: contractsData } = useQuery(
		orpc.contracts.getByEmployeeId.queryOptions({ input: { employeeId: id } })
	);

	// --- Live Overview dashboard data (replaces former hardcoded mock stats) ---
	const canSeePay = canViewPayroll(org.memberRole);
	const today = new Date();
	const heatmapStart = new Date(
		today.getTime() - (HEATMAP_DAYS - 1) * MS_PER_DAY
	);

	const {
		data: payslipPage,
		isLoading: payslipLoading,
		isError: payslipError,
	} = useQuery({
		...orpc.payroll.payslips.list.queryOptions({
			input: { employeeId: id, page: 1, pageSize: 1 },
		}),
		enabled: canSeePay,
	});

	const {
		data: attSummary,
		isLoading: attSummaryLoading,
		isError: attSummaryError,
	} = useQuery(
		orpc.attendance.summary.monthly.queryOptions({
			input: {
				employeeId: id,
				month: today.getMonth() + 1,
				year: today.getFullYear(),
			},
		})
	);

	const {
		data: leaveBalances,
		isLoading: leaveLoading,
		isError: leaveError,
	} = useQuery(
		orpc.leave.balances.list.queryOptions({ input: { employeeId: id } })
	);

	const { data: attRecords } = useQuery(
		orpc.attendance.records.list.queryOptions({
			input: {
				employeeId: id,
				startDate: toYmd(heatmapStart),
				endDate: toYmd(today),
				page: 1,
				pageSize: 50,
			},
		})
	);

	const handleArchive = async () => {
		setSaving(true);
		try {
			await client.hrCore.employees.archive({ id });
			qc.invalidateQueries();
			toast.success("Employee archived");
			setConfirmArchive(false);
			navigate({ to: "/app/employees" });
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Cannot archive");
			setConfirmArchive(false);
		} finally {
			setSaving(false);
		}
	};

	const handleRestore = async () => {
		setSaving(true);
		try {
			await client.hrCore.employees.restore({ id });
			qc.invalidateQueries();
			toast.success("Employee restored");
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Cannot restore");
		} finally {
			setSaving(false);
		}
	};

	const workInfo = emp?.workInfo ?? null;
	const editableWorkInfo = workInfo ?? {
		basicSalary: null,
		departmentId: null,
		employeeTypeId: null,
		joiningDate: null,
		jobPositionId: null,
		reportingManagerId: null,
		salaryCurrency: "GYD",
		shiftId: null,
		workLocation: null,
		workTypeId: null,
	};

	if (isLoading) {
		return (
			<div className="page" data-tab-scope>
				<div className="crumbs">
					<span>
						<Link style={{ color: "var(--fg-3)" }} to="/app/employees">
							Employees
						</Link>
					</span>
					<span className="sep">/</span>
					<span>Loading…</span>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "80px 24px",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading employee profile…
				</div>
			</div>
		);
	}

	if (isError || !emp) {
		return (
			<div className="page" data-tab-scope>
				<div className="crumbs">
					<span>
						<Link style={{ color: "var(--fg-3)" }} to="/app/employees">
							Employees
						</Link>
					</span>
					<span className="sep">/</span>
					<span>Not found</span>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "80px 24px",
						textAlign: "center",
					}}
				>
					<h4
						style={{
							fontSize: "15px",
							fontWeight: 600,
							color: "var(--fg)",
						}}
					>
						Employee not found
					</h4>
					<p style={{ fontSize: "13px", color: "var(--fg-3)" }}>
						This employee may have been archived or doesn't exist.
					</p>
					<Link className="btn btn-outline btn-sm" to="/app/employees">
						Back to employees
					</Link>
				</div>
			</div>
		);
	}

	const fullName = `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ""}`;
	const initials =
		`${emp.firstName.charAt(0)}${emp.lastName ? emp.lastName.charAt(0) : ""}`.toUpperCase();

	// --- Derived Overview values from live queries ---
	const EM_DASH = "—";
	const attRow =
		attSummary?.find((r) => r.employeeId === id) ?? attSummary?.[0] ?? null;
	const attHasData = !(attSummaryLoading || attSummaryError) && attRow !== null;

	const daysPresent = attRow?.daysPresent ?? 0;
	const daysAbsent = attRow?.daysAbsent ?? 0;
	const daysHoliday = attRow?.daysHoliday ?? 0;
	const lateCount = attRow?.lateCount ?? 0;
	const approvedOtMinutes = attRow?.totalApprovedOtMinutes ?? 0;
	const rawOtMinutes = attRow?.totalOvertimeMinutes ?? 0;
	const pendingOtMinutes = Math.max(0, rawOtMinutes - approvedOtMinutes);

	const attendanceDenominator = daysPresent + daysAbsent;
	const attendancePct =
		attendanceDenominator > 0
			? Math.round((daysPresent / attendanceDenominator) * 1000) / 10
			: null;

	const otHours = approvedOtMinutes / 60;
	const pendingOtHours = pendingOtMinutes / 60;

	const latestPayslip = payslipPage?.data?.[0] ?? null;

	// Leave balance card + widget: prefer an annual-type balance, else aggregate.
	const annualBalance =
		leaveBalances?.find((b) => /annual/i.test(b.leaveTypeName ?? "")) ?? null;
	const leaveCardAvailable = annualBalance
		? Number(annualBalance.availableDays)
		: (leaveBalances ?? []).reduce(
				(sum, b) => sum + Number(b.availableDays),
				0
			);
	const leaveCardUsed = annualBalance
		? Number(annualBalance.usedDays)
		: (leaveBalances ?? []).reduce((sum, b) => sum + Number(b.usedDays), 0);
	const leaveCardTotal = leaveCardAvailable + leaveCardUsed;
	const hasLeaveData = (leaveBalances?.length ?? 0) > 0;

	const heatmap = buildHeatmap(
		(attRecords?.data ?? []) as AttendanceRecordRow[],
		today
	);

	return (
		<div className="page" data-tab-scope>
			<div className="crumbs">
				<span>
					<Link style={{ color: "var(--fg-3)" }} to="/app/employees">
						Employees
					</Link>
				</span>
				<span className="sep">/</span>
				<span>{fullName}</span>
			</div>

			{/* Profile header */}
			<div className="profile-head">
				<div className="profile-cover" />
				<div className="profile-id">
					<div className="profile-avatar">{initials}</div>
					<div className="profile-meta">
						<h1>{fullName}</h1>
						<div className="sub">
							<span style={{ color: "var(--fg-2)" }}>
								{[workInfo?.jobPositionName, workInfo?.departmentName]
									.filter(Boolean)
									.join(" · ") || "Employee"}
							</span>
							<span className="sep">·</span>
							<span className="mono" style={{ color: "var(--fg-3)" }}>
								{emp.badgeId ?? "—"}
							</span>
							<span className="sep">·</span>
							{emp.country && (
								<span className="cc-badge" style={{ height: "22px" }}>
									<span style={{ fontSize: "11px" }}>{emp.country}</span>
									{emp.country}
								</span>
							)}
							<span
								className={`pill-status ${emp.isActive ? "active" : "archived"}`}
								style={{
									height: "22px",
									display: "inline-flex",
									alignItems: "center",
									gap: "6px",
									padding: "0 9px",
									borderRadius: "99px",
									fontSize: "11px",
									background: emp.isActive
										? "var(--success-soft)"
										: "var(--bg-3)",
									color: emp.isActive ? "var(--success)" : "var(--fg-3)",
								}}
							>
								<span className="badge-dot" />
								{emp.isActive ? "Active" : "Archived"}
							</span>
							<span className="badge" style={{ height: "22px", gap: "6px" }}>
								<span
									className="badge-dot"
									style={{ background: "var(--success)" }}
								/>
								Synced 14:42
							</span>
						</div>
					</div>
					<div className="profile-actions">
						{canEdit && (
							<>
								<button
									className="btn btn-outline btn-sm"
									onClick={() => setEditSection("personal")}
									type="button"
								>
									<Edit size={12} />
									Edit profile
								</button>
								<button
									className="btn btn-outline btn-sm"
									onClick={() => setEditSection("work")}
									type="button"
								>
									<Briefcase size={12} />
									Edit work info
								</button>
							</>
						)}
						{canEdit &&
							(emp.isActive ? (
								<button
									className="btn btn-outline btn-sm"
									onClick={() => setConfirmArchive(true)}
									style={{ color: "var(--danger)" }}
									type="button"
								>
									<Archive size={12} />
									Archive
								</button>
							) : (
								<button
									className="btn btn-outline btn-sm"
									onClick={handleRestore}
									style={{ color: "var(--success)" }}
									type="button"
								>
									<Undo size={12} />
									Restore
								</button>
							))}
					</div>
				</div>
				<div className="profile-tabs">
					<div className="tabs" style={{ borderBottom: 0 }}>
						{(
							[
								{
									key: "overview",
									icon: <LayoutDashboard size={13} />,
									label: "Overview",
								},
								{
									key: "attendance",
									icon: <Clock size={13} />,
									label: "Attendance",
								},
								{
									key: "leave",
									icon: <Calendar size={13} />,
									label: "Leave",
								},
								{
									key: "payroll",
									icon: <Wallet size={13} />,
									label: (
										<>
											Payroll <span className="count">9</span>
										</>
									),
								},
								{
									key: "documents",
									icon: <FileText size={13} />,
									label: "Documents",
								},
								{
									key: "activity",
									icon: <Activity size={13} />,
									label: "Activity",
								},
							] as {
								key: ProfileTab;
								icon: React.ReactNode;
								label: React.ReactNode;
							}[]
						).map(({ key, icon, label }) => (
							<button
								aria-selected={profileTab === key}
								className="tab"
								key={key}
								onClick={() => setProfileTab(key)}
								type="button"
							>
								{icon}
								{label}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Tab: Overview */}
			{profileTab === "overview" && (
				<div className="tab-panel active">
					<div className="profile-grid">
						{/* LEFT: identity card */}
						<div className="left">
							<div className="side-card">
								<div className="head">
									<span className="ttl">Identity</span>
									<button
										className="icon-btn"
										style={{ width: "26px", height: "26px" }}
										type="button"
									>
										<ExternalLink size={13} />
									</button>
								</div>
								<div className="body field-list">
									<div className="kv">
										<span className="k">Employee ID</span>
										<span className="v">{emp.badgeId ?? "—"}</span>
									</div>
									<div className="kv">
										<span className="k">Email</span>
										<span className="v" style={{ fontSize: "11.5px" }}>
											{emp.email ?? "— (no login)"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Phone</span>
										<span className="v">{emp.phone ?? "—"}</span>
									</div>
									<div className="kv">
										<span className="k">Gender</span>
										<span className="v">
											{emp.gender
												? emp.gender.charAt(0).toUpperCase() +
													emp.gender.slice(1)
												: "—"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Date of birth</span>
										<span className="v">
											{emp.dateOfBirth
												? new Date(emp.dateOfBirth).toISOString().slice(0, 10)
												: "—"}
										</span>
									</div>
								</div>
							</div>

							<div className="side-card">
								<div className="head">
									<span className="ttl">Employment</span>
								</div>
								<div className="body field-list">
									<div className="kv">
										<span className="k">Position</span>
										<span className="v plain">
											{workInfo?.jobPositionName ?? "Not assigned"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Department</span>
										<span className="v plain">
											{workInfo?.departmentName ?? "Not assigned"}
										</span>
									</div>
									{workInfo?.jobRoleName && (
										<div className="kv">
											<span className="k">Specialization</span>
											<span className="v plain">{workInfo.jobRoleName}</span>
										</div>
									)}
									<div className="kv">
										<span className="k">Reports To</span>
										<span className="v plain">
											{workInfo?.reportingManagerName ?? "Not assigned"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Location</span>
										<span className="v plain">
											{workInfo?.workLocation ?? "—"}
											{emp.country ? `, ${emp.country}` : ""}
										</span>
									</div>
									{workInfo?.employeeTypeName && (
										<div className="kv">
											<span className="k">Employment Type</span>
											<span className="v plain">
												{workInfo.employeeTypeName}
											</span>
										</div>
									)}
									<div className="kv">
										<span className="k">Work Arrangement</span>
										<span className="v plain">
											{workInfo?.workTypeName ?? "Not assigned"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Shift</span>
										<span className="v plain">
											{workInfo?.shiftName ?? "Not assigned"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Joined</span>
										<span className="v">
											{workInfo?.joiningDate
												? new Date(editableWorkInfo.joiningDate)
														.toISOString()
														.slice(0, 10)
												: "—"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Salary</span>
										<span className="v">
											{workInfo?.basicSalary
												? `${Number(editableWorkInfo.basicSalary).toLocaleString()} ${editableWorkInfo.salaryCurrency}`
												: "—"}
										</span>
									</div>
								</div>
							</div>

							<div className="side-card">
								<div className="head">
									<span className="ttl">Banking</span>
									{canEditBank && (
										<button
											className="icon-btn"
											onClick={() => setEditSection("bank")}
											style={{ width: 26, height: 26 }}
											title="Edit bank details"
											type="button"
										>
											<Edit size={13} />
										</button>
									)}
								</div>
								<div className="body field-list">
									{bankDetails ? (
										<>
											<div className="kv">
												<span className="k">Currency</span>
												<span className="v">
													{workInfo?.salaryCurrency ?? "GYD"}
												</span>
											</div>
											<div className="kv">
												<span className="k">Bank</span>
												<span className="v plain">{bankDetails.bankName}</span>
											</div>
											<div className="kv">
												<span className="k">Account</span>
												<span className="v">{bankDetails.accountNumber}</span>
											</div>
											{bankDetails.branch && (
												<div className="kv">
													<span className="k">Branch</span>
													<span className="v plain">{bankDetails.branch}</span>
												</div>
											)}
											{bankDetails.bankCode1 && (
												<div className="kv">
													<span className="k">Bank Code</span>
													<span className="v">{bankDetails.bankCode1}</span>
												</div>
											)}
										</>
									) : (
										<div
											style={{
												fontSize: "12.5px",
												color: "var(--fg-3)",
												padding: "8px 0",
											}}
										>
											No bank details configured.
										</div>
									)}
								</div>
							</div>
						</div>

						{/* RIGHT: dashboard widgets */}
						<div className="right">
							<div className="stat-row">
								<div className="stat-card">
									<div className="l">Attendance · {shortMonthYear(today)}</div>
									<div className="v">
										{attSummaryLoading ||
										attSummaryError ||
										attendancePct === null
											? EM_DASH
											: `${attendancePct}%`}
									</div>
									<div className="delta">
										{attSummaryLoading || attSummaryError
											? "No data"
											: `${lateCount} late · ${daysAbsent} absent`}
									</div>
								</div>
								<div className="stat-card">
									<div className="l">Leave balance</div>
									<div className="v">
										{leaveLoading || leaveError || !hasLeaveData ? (
											EM_DASH
										) : (
											<>
												{leaveCardAvailable}
												<span
													style={{ fontSize: "14px", color: "var(--fg-3)" }}
												>
													{" "}
													/ {leaveCardTotal}
												</span>
											</>
										)}
									</div>
									<div className="delta">
										{leaveLoading || leaveError || !hasLeaveData
											? "No balances"
											: `${leaveCardUsed} days taken${
													annualBalance ? "" : " · all types"
												}`}
									</div>
								</div>
								{canSeePay && (
									<div className="stat-card">
										<div className="l">
											Net pay
											{latestPayslip
												? ` · ${shortMonthYear(new Date(latestPayslip.periodEnd))}`
												: ""}
										</div>
										<div className="v" style={{ color: "var(--accent)" }}>
											{payslipLoading || payslipError || !latestPayslip
												? EM_DASH
												: formatMoneyValue(latestPayslip.netPay)}
										</div>
										<div className="delta">
											{payslipLoading || payslipError
												? "No data"
												: latestPayslip
													? `${latestPayslip.currency} · gross ${formatMoneyValue(
															latestPayslip.grossPay
														)}`
													: "No payslips yet"}
										</div>
									</div>
								)}
								<div className="stat-card">
									<div className="l">Overtime · {shortMonthYear(today)}</div>
									<div className="v">
										{attSummaryLoading || attSummaryError
											? EM_DASH
											: `${otHours.toFixed(1)} h`}
									</div>
									<div className={pendingOtHours > 0 ? "delta warn" : "delta"}>
										{attSummaryLoading || attSummaryError
											? "No data"
											: pendingOtHours > 0
												? `+ ${pendingOtHours.toFixed(1)}h pending approval`
												: "Approved this month"}
									</div>
								</div>
							</div>

							{/* Attendance widget */}
							<div className="widget">
								<div className="widget-head">
									<span className="ttl">Attendance · last 30 days</span>
									<div className="segmented" style={{ height: "auto" }}>
										<button
											className="active"
											style={{
												height: "24px",
												padding: "0 8px",
												fontSize: "11px",
											}}
											type="button"
										>
											30d
										</button>
										<button
											style={{
												height: "24px",
												padding: "0 8px",
												fontSize: "11px",
											}}
											type="button"
										>
											90d
										</button>
										<button
											style={{
												height: "24px",
												padding: "0 8px",
												fontSize: "11px",
											}}
											type="button"
										>
											YTD
										</button>
									</div>
								</div>
								<div className="widget-body">
									<div
										style={{
											display: "flex",
											alignItems: "baseline",
											justifyContent: "space-between",
											flexWrap: "wrap",
											gap: "8px",
										}}
									>
										<div
											style={{
												display: "flex",
												gap: "18px",
												flexWrap: "wrap",
											}}
										>
											{[
												{
													label: "Full days",
													value: attHasData ? String(daysPresent) : EM_DASH,
													color: undefined,
												},
												{
													label: "Late",
													value: attHasData ? String(lateCount) : EM_DASH,
													color: "var(--warning)",
												},
												{
													label: "Absent",
													value: attHasData ? String(daysAbsent) : EM_DASH,
													color: "var(--danger)",
												},
												{
													label: "Holiday",
													value: attHasData ? String(daysHoliday) : EM_DASH,
													color: undefined,
												},
												{
													label: "OT",
													value: attHasData
														? `${otHours.toFixed(1)}h`
														: EM_DASH,
													color: "var(--accent)",
												},
											].map((stat) => (
												<div key={stat.label}>
													<span
														style={{
															fontSize: "11px",
															color: "var(--fg-3)",
															textTransform: "uppercase",
															letterSpacing: "0.05em",
														}}
													>
														{stat.label}
													</span>
													<div
														className="mono"
														style={{
															fontSize: "16px",
															fontWeight: 600,
															color: stat.color,
														}}
													>
														{stat.value}
													</div>
												</div>
											))}
										</div>
									</div>
									<div className="att-cal">
										{heatmap.map((day) => (
											<div
												className={`att-day ${day.cls}`.trim()}
												key={day.date}
												title={`${day.date} · ${day.label}`}
											/>
										))}
									</div>
									<div
										style={{
											display: "flex",
											gap: "14px",
											marginTop: "14px",
											fontSize: "11px",
											color: "var(--fg-3)",
										}}
									>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "5px",
											}}
										>
											<span
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "3px",
													background: "var(--accent)",
												}}
											/>
											Full
										</span>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "5px",
											}}
										>
											<span
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "3px",
													background: "var(--warning)",
												}}
											/>
											Late
										</span>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "5px",
											}}
										>
											<span
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "3px",
													background: "var(--danger)",
												}}
											/>
											Absent
										</span>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "5px",
											}}
										>
											<span
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "3px",
													background: "var(--bg-3)",
												}}
											/>
											No record
										</span>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "5px",
											}}
										>
											<span
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "3px",
													background: "var(--bg-2)",
												}}
											/>
											Weekend
										</span>
									</div>
								</div>
							</div>

							{/* Leave widget */}
							<div className="widget">
								<div className="widget-head">
									<span className="ttl">Leave balances</span>
									<Link
										style={{ fontSize: "11.5px", color: "var(--accent)" }}
										to="/app/leave"
									>
										View leave
									</Link>
								</div>
								<div className="widget-body">
									{leaveLoading && (
										<div
											style={{
												fontSize: "12.5px",
												color: "var(--fg-3)",
												padding: "8px 0",
											}}
										>
											Loading leave balances…
										</div>
									)}
									{!leaveLoading && leaveError && (
										<div
											style={{
												fontSize: "12.5px",
												color: "var(--fg-3)",
												padding: "8px 0",
											}}
										>
											Couldn't load leave balances.
										</div>
									)}
									{!(leaveLoading || leaveError || hasLeaveData) && (
										<div
											style={{
												fontSize: "12.5px",
												color: "var(--fg-3)",
												padding: "8px 0",
											}}
										>
											No leave balances configured.
										</div>
									)}
									{!(leaveLoading || leaveError) &&
										hasLeaveData &&
										(leaveBalances ?? []).map((bal) => {
											const used = Number(bal.usedDays);
											const available = Number(bal.availableDays);
											const total = used + available;
											const pct =
												total > 0
													? Math.min(100, Math.max(0, (used / total) * 100))
													: 0;
											return (
												<div className="leave-row" key={bal.id}>
													<span className="lbl">{bal.leaveTypeName}</span>
													<div className="pbar">
														<div
															className="pbar-fill"
															style={{ width: `${pct}%` }}
														/>
													</div>
													<span className="nums">
														{used} / {total} used
													</span>
												</div>
											);
										})}
								</div>
							</div>

							{/* Activity widget */}
							<div className="widget">
								<div className="widget-head">
									<span className="ttl">Recent activity</span>
									<button className="btn btn-ghost btn-sm" type="button">
										View all
										<ArrowRight size={11} />
									</button>
								</div>
								<div className="widget-body">
									<div
										style={{
											padding: "28px 16px",
											textAlign: "center",
											color: "var(--fg-3)",
											fontSize: 12.5,
										}}
									>
										<Check size={18} style={{ opacity: 0.5 }} />
										<div style={{ marginTop: 6 }}>
											No recent activity for this employee yet.
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Tab: Attendance */}
			{profileTab === "attendance" && (
				<div className="tab-panel active">
					<div className="widget">
						<div className="widget-head">
							<span className="ttl">Time activity log · September 2026</span>
							<div style={{ display: "flex", gap: "6px" }}>
								<button className="btn btn-ghost btn-sm" type="button">
									<Filter size={11} />
									Filter
								</button>
								<button className="btn btn-ghost btn-sm" type="button">
									<Download size={11} />
									Export
								</button>
							</div>
						</div>
						<div className="widget-body" style={{ padding: 0 }}>
							<table className="pay-list">
								<thead>
									<tr>
										<th>Date</th>
										<th>Day</th>
										<th>Check in</th>
										<th>Check out</th>
										<th style={{ textAlign: "right" }}>Hours</th>
										<th>Source</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td className="mono">2026-09-27</td>
										<td>Mon</td>
										<td className="mono">07:48</td>
										<td className="mono">17:32</td>
										<td className="num">9h 44m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--success)",
														display: "inline-block",
													}}
												/>
												ZK-DEV-GT-01
											</span>
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												OT 1.7h
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-26</td>
										<td>Sun</td>
										<td>—</td>
										<td>—</td>
										<td className="num" style={{ color: "var(--fg-4)" }}>
											—
										</td>
										<td>
											<span
												style={{
													color: "var(--fg-4)",
													fontSize: "11px",
												}}
											>
												weekend
											</span>
										</td>
										<td>
											<span
												className="pill-status"
												style={{ background: "var(--bg-3)" }}
											>
												Weekend
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-25</td>
										<td>Fri</td>
										<td className="mono">08:02</td>
										<td className="mono">17:14</td>
										<td className="num">9h 12m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--success)",
														display: "inline-block",
													}}
												/>
												ZK-DEV-GT-01
											</span>
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												OT 1.2h
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-24</td>
										<td>Thu</td>
										<td className="mono">08:24</td>
										<td className="mono">17:00</td>
										<td className="num">8h 36m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--warning)",
														display: "inline-block",
													}}
												/>
												manual
											</span>
										</td>
										<td>
											<span
												className="pill-status notice"
												style={{
													background: "var(--warning-soft)",
													color: "var(--warning)",
												}}
											>
												Late · 24m
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-23</td>
										<td>Wed</td>
										<td className="mono">07:56</td>
										<td className="mono">16:58</td>
										<td className="num">9h 02m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--success)",
														display: "inline-block",
													}}
												/>
												ZK-DEV-GT-01
											</span>
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Full
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-22</td>
										<td>Tue</td>
										<td className="mono">07:50</td>
										<td className="mono">17:18</td>
										<td className="num">9h 28m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--success)",
														display: "inline-block",
													}}
												/>
												ZK-DEV-GT-01
											</span>
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												OT 1.5h
											</span>
										</td>
									</tr>
									<tr>
										<td className="mono">2026-09-21</td>
										<td>Mon</td>
										<td className="mono">07:44</td>
										<td className="mono">17:00</td>
										<td className="num">9h 16m</td>
										<td>
											<span
												className="source-tag"
												style={{ color: "var(--fg-3)" }}
											>
												<span
													style={{
														width: "5px",
														height: "5px",
														borderRadius: "50%",
														background: "var(--success)",
														display: "inline-block",
													}}
												/>
												ZK-DEV-GT-01
											</span>
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Full
											</span>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			{/* Tab: Leave */}
			{profileTab === "leave" && (
				<div className="tab-panel active">
					<div
						className="profile-grid"
						style={{ gridTemplateColumns: "1fr 1fr" }}
					>
						<div className="widget">
							<div className="widget-head">
								<span className="ttl">Balances · FY 2026</span>
							</div>
							<div className="widget-body">
								<div className="leave-row">
									<span className="lbl">Annual</span>
									<div className="pbar">
										<div className="pbar-fill" style={{ width: "16.6%" }} />
									</div>
									<span className="nums">3 / 18 used</span>
								</div>
								<div className="leave-row">
									<span className="lbl">Sick</span>
									<div className="pbar">
										<div
											className="pbar-fill warning"
											style={{ width: "14.3%" }}
										/>
									</div>
									<span className="nums">2 / 14 used</span>
								</div>
								<div className="leave-row">
									<span className="lbl">Compassionate</span>
									<div className="pbar">
										<div className="pbar-fill" style={{ width: "0%" }} />
									</div>
									<span className="nums">0 / 3 used</span>
								</div>
								<div className="leave-row">
									<span className="lbl">Study</span>
									<div className="pbar">
										<div className="pbar-fill" style={{ width: "40%" }} />
									</div>
									<span className="nums">2 / 5 used</span>
								</div>
							</div>
						</div>
						<div className="widget">
							<div className="widget-head">
								<span className="ttl">Recent requests</span>
								<a
									href="#"
									style={{ fontSize: "11.5px", color: "var(--accent)" }}
								>
									Request leave
								</a>
							</div>
							<div className="widget-body">
								<div
									className="leave-row"
									style={{ gridTemplateColumns: "1fr auto" }}
								>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Annual leave · 4 days
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "3px",
											}}
										>
											2–5 October · awaiting approval
										</div>
									</div>
									<span className="pill-status notice">Pending</span>
								</div>
								<div
									className="leave-row"
									style={{ gridTemplateColumns: "1fr auto" }}
								>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Sick leave · 1 day
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "3px",
											}}
										>
											14 Aug · medical attached
										</div>
									</div>
									<span className="pill-status active">
										<span className="badge-dot" />
										Approved
									</span>
								</div>
								<div
									className="leave-row"
									style={{ gridTemplateColumns: "1fr auto" }}
								>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Annual leave · 3 days
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "3px",
											}}
										>
											21–23 May
										</div>
									</div>
									<span className="pill-status active">
										<span className="badge-dot" />
										Approved
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Tab: Payroll */}
			{profileTab === "payroll" && (
				<div className="tab-panel active">
					<ContractSection
						canSeeSalary={canManagePayroll(org.memberRole)}
						contracts={
							(contractsData as ContractHistoryItem[] | undefined) ?? []
						}
						employeeId={id}
						isHr={canEdit}
					/>
					<div className="widget">
						<div className="widget-head">
							<span className="ttl">Pay-run history · 9 runs</span>
							<div className="segmented">
								<button className="active" type="button">
									12m
								</button>
								<button type="button">YTD</button>
								<button type="button">All</button>
							</div>
						</div>
						<div className="widget-body" style={{ padding: 0 }}>
							<table className="pay-list">
								<thead>
									<tr>
										<th>Period</th>
										<th>Country</th>
										<th style={{ textAlign: "right" }}>Gross</th>
										<th style={{ textAlign: "right" }}>PAYE</th>
										<th style={{ textAlign: "right" }}>NIS</th>
										<th style={{ textAlign: "right" }}>Other</th>
										<th style={{ textAlign: "right" }}>Net</th>
										<th>Status</th>
										<th />
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>
											<strong>September 2026</strong>
										</td>
										<td>
											<span className="cc-badge" style={{ height: "22px" }}>
												<span style={{ fontSize: "11px" }}>GY</span>
												GY
											</span>
										</td>
										<td className="num">342,000.00</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−58,140.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−18,810.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											0.00
										</td>
										<td
											className="num"
											style={{
												fontWeight: 600,
												color: "var(--accent)",
											}}
										>
											265,050.00
										</td>
										<td>
											<span className="pill-status notice">Ready</span>
										</td>
										<td>
											<a
												href="#"
												style={{
													color: "var(--accent)",
													fontSize: "12px",
												}}
											>
												Payslip
											</a>
										</td>
									</tr>
									<tr>
										<td>August 2026</td>
										<td>
											<span className="cc-badge" style={{ height: "22px" }}>
												<span style={{ fontSize: "11px" }}>GY</span>
												GY
											</span>
										</td>
										<td className="num">342,000.00</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−58,140.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−18,810.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											0.00
										</td>
										<td className="num" style={{ fontWeight: 600 }}>
											265,050.00
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Sealed
											</span>
										</td>
										<td>
											<a
												href="#"
												style={{
													color: "var(--accent)",
													fontSize: "12px",
												}}
											>
												Payslip
											</a>
										</td>
									</tr>
									<tr>
										<td>July 2026</td>
										<td>
											<span className="cc-badge" style={{ height: "22px" }}>
												<span style={{ fontSize: "11px" }}>GY</span>
												GY
											</span>
										</td>
										<td className="num">342,000.00</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−58,140.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−18,810.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−2,500.00
										</td>
										<td className="num" style={{ fontWeight: 600 }}>
											262,550.00
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Sealed
											</span>
										</td>
										<td>
											<a
												href="#"
												style={{
													color: "var(--accent)",
													fontSize: "12px",
												}}
											>
												Payslip
											</a>
										</td>
									</tr>
									<tr>
										<td>June 2026</td>
										<td>
											<span className="cc-badge" style={{ height: "22px" }}>
												<span style={{ fontSize: "11px" }}>GY</span>
												GY
											</span>
										</td>
										<td className="num">315,500.00</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−51,870.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−17,353.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											0.00
										</td>
										<td className="num" style={{ fontWeight: 600 }}>
											246,277.00
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Sealed
											</span>
										</td>
										<td>
											<a
												href="#"
												style={{
													color: "var(--accent)",
													fontSize: "12px",
												}}
											>
												Payslip
											</a>
										</td>
									</tr>
									<tr>
										<td>May 2026</td>
										<td>
											<span className="cc-badge" style={{ height: "22px" }}>
												<span style={{ fontSize: "11px" }}>GY</span>
												GY
											</span>
										</td>
										<td className="num">315,500.00</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−51,870.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											−17,353.00
										</td>
										<td className="num" style={{ color: "var(--fg-3)" }}>
											0.00
										</td>
										<td className="num" style={{ fontWeight: 600 }}>
											246,277.00
										</td>
										<td>
											<span className="pill-status active">
												<span className="badge-dot" />
												Sealed
											</span>
										</td>
										<td>
											<a
												href="#"
												style={{
													color: "var(--accent)",
													fontSize: "12px",
												}}
											>
												Payslip
											</a>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			{/* Tab: Documents */}
			{profileTab === "documents" && (
				<div className="tab-panel active">
					<div className="widget">
						<div className="widget-head">
							<span className="ttl">Documents</span>
							<button className="btn btn-primary btn-sm" type="button">
								<Plus size={12} />
								Upload
							</button>
						</div>
						<div className="widget-body">
							<div
								style={{
									padding: "32px 16px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: 13,
								}}
							>
								<FileText size={20} style={{ opacity: 0.5 }} />
								<div style={{ marginTop: 8, fontWeight: 600 }}>
									No documents on file
								</div>
								<div style={{ marginTop: 4 }}>
									Upload contracts, ID and other records for this employee.
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Tab: Activity */}
			{profileTab === "activity" && (
				<div className="tab-panel active">
					<div className="widget">
						<div className="widget-head">
							<span className="ttl">Full activity history</span>
							<button className="btn btn-ghost btn-sm" type="button">
								<Filter size={11} />
								Filter
							</button>
						</div>
						<div className="widget-body">
							<div
								style={{
									padding: "32px 16px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: 13,
								}}
							>
								<Check size={20} style={{ opacity: 0.5 }} />
								<div style={{ marginTop: 8, fontWeight: 600 }}>
									No activity recorded yet
								</div>
								<div style={{ marginTop: 4 }}>
									Approvals, payroll and profile changes for this employee will
									appear here.
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Edit sheets */}
			{editSection === "personal" && emp && (
				<EditSheet
					fields={[
						{
							key: "firstName",
							label: "First name",
							value: emp.firstName,
							required: true,
						},
						{ key: "lastName", label: "Last name", value: emp.lastName ?? "" },
						{ key: "phone", label: "Phone", value: emp.phone ?? "" },
						{ key: "badgeId", label: "Badge ID", value: emp.badgeId ?? "" },
						{
							key: "dateOfBirth",
							label: "Date of birth",
							value: emp.dateOfBirth
								? new Date(emp.dateOfBirth).toISOString().slice(0, 10)
								: "",
							type: "date",
						},
						{
							key: "gender",
							label: "Gender",
							value: emp.gender ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not specified" },
								{ v: "male", l: "Male" },
								{ v: "female", l: "Female" },
								{ v: "other", l: "Other" },
							],
						},
						{ key: "country", label: "Country", value: emp.country ?? "" },
						{ key: "city", label: "City", value: emp.city ?? "" },
						{ key: "address", label: "Address", value: emp.address ?? "" },
					]}
					onClose={() => setEditSection(null)}
					onSave={async (fields) => {
						await client.hrCore.employees.update({ id, ...fields });
						qc.invalidateQueries();
						toast.success("Personal information updated");
						setEditSection(null);
					}}
					title="Edit Personal Information"
				/>
			)}

			{editSection === "work" && (
				<EditSheet
					fields={[
						{
							key: "departmentId",
							label: "Department",
							value: editableWorkInfo.departmentId ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not assigned" },
								...((depts ?? []) as { id: string; name: string }[]).map(
									(d) => ({ v: d.id, l: d.name })
								),
							],
						},
						{
							key: "jobPositionId",
							label: "Position",
							value: editableWorkInfo.jobPositionId ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not assigned" },
								...((positions ?? []) as { id: string; name: string }[]).map(
									(p) => ({ v: p.id, l: p.name })
								),
							],
						},
						{
							key: "shiftId",
							label: "Shift",
							value: editableWorkInfo.shiftId ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not assigned" },
								...((shifts ?? []) as { id: string; name: string }[]).map(
									(s) => ({ v: s.id, l: s.name })
								),
							],
						},
						{
							key: "workTypeId",
							label: "Work Arrangement",
							value: editableWorkInfo.workTypeId ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not assigned" },
								...((workTypes ?? []) as { id: string; name: string }[]).map(
									(w) => ({ v: w.id, l: w.name })
								),
							],
						},
						{
							key: "employeeTypeId",
							label: "Employment Type",
							value: editableWorkInfo.employeeTypeId ?? "",
							type: "select",
							options: [
								{ v: "", l: "Not assigned" },
								...((empTypes ?? []) as { id: string; name: string }[]).map(
									(t) => ({ v: t.id, l: t.name })
								),
							],
						},
						{
							key: "reportingManagerId",
							label: "Reports To",
							value: editableWorkInfo.reportingManagerId ?? "",
							type: "select",
							options: [
								{ v: "", l: "No manager" },
								...(
									(
										empListData as {
											data: {
												id: string;
												firstName: string;
												lastName: string | null;
											}[];
										}
									)?.data ?? []
								)
									.filter((m) => m.id !== id)
									.map((m) => ({
										v: m.id,
										l: `${m.firstName} ${m.lastName ?? ""}`,
									})),
							],
						},
						{
							key: "workLocation",
							label: "Location",
							value: editableWorkInfo.workLocation ?? "",
						},
						{
							key: "joiningDate",
							label: "Joining Date",
							value: editableWorkInfo.joiningDate
								? new Date(editableWorkInfo.joiningDate)
										.toISOString()
										.slice(0, 10)
								: "",
							type: "date",
						},
						{
							key: "basicSalary",
							label: "Base Salary",
							value: editableWorkInfo.basicSalary ?? "",
						},
						{
							key: "salaryCurrency",
							label: "Currency",
							value: editableWorkInfo.salaryCurrency ?? "GYD",
							type: "select",
							options: [
								{ v: "GYD", l: "GYD" },
								{ v: "TTD", l: "TTD" },
								{ v: "JMD", l: "JMD" },
								{ v: "USD", l: "USD" },
							],
						},
					]}
					onClose={() => setEditSection(null)}
					onSave={async (fields) => {
						await client.hrCore.employees.workInfo.update({
							employeeId: id,
							...fields,
						});
						qc.invalidateQueries();
						toast.success("Work information updated");
						setEditSection(null);
					}}
					title="Edit Work Information"
				/>
			)}

			{editSection === "bank" && (
				<EditSheet
					fields={[
						{
							key: "bankName",
							label: "Bank Name",
							value:
								(bankDetails as { bankName?: string } | null)?.bankName ?? "",
							required: true,
						},
						{
							key: "accountNumber",
							label: "Account Number",
							value:
								(bankDetails as { accountNumber?: string } | null)
									?.accountNumber ?? "",
							required: true,
						},
						{
							key: "branch",
							label: "Branch",
							value:
								(bankDetails as { branch?: string | null } | null)?.branch ??
								"",
						},
						{
							key: "bankCode1",
							label: "Bank Code",
							value:
								(bankDetails as { bankCode1?: string | null } | null)
									?.bankCode1 ?? "",
						},
					]}
					onClose={() => setEditSection(null)}
					onSave={async (fields) => {
						if (!(fields.bankName && fields.accountNumber)) {
							toast.error("Bank name and account number are required");
							return;
						}
						await client.hrCore.employees.bankDetails.update({
							employeeId: id,
							bankName: fields.bankName,
							accountNumber: fields.accountNumber,
							branch: fields.branch || undefined,
							bankCode1: fields.bankCode1 || undefined,
						});
						qc.invalidateQueries();
						toast.success("Bank details updated");
						setEditSection(null);
					}}
					subtitle="Bank details are visible only to authorized HR and payroll staff."
					title="Edit Bank Details"
				/>
			)}

			{/* Archive confirmation */}
			{confirmArchive && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 200,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(8,9,12,0.6)",
					}}
				>
					<div
						style={{
							background: "var(--bg-2)",
							border: "1px solid var(--line)",
							borderRadius: 16,
							padding: 24,
							maxWidth: 420,
							width: "100%",
						}}
					>
						<h4 style={{ marginBottom: 8 }}>Archive {fullName}?</h4>
						<p
							style={{
								fontSize: "13px",
								color: "var(--fg-3)",
								marginBottom: 20,
							}}
						>
							Archived employees are hidden from active lists but kept for
							historical records. You can restore them later.
						</p>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setConfirmArchive(false)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-sm"
								disabled={saving}
								onClick={handleArchive}
								style={{
									background: "var(--danger-soft)",
									color: "var(--danger)",
								}}
								type="button"
							>
								{saving ? "Archiving…" : "Archive employee"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Contract Section (payroll tab) ──────────────────────

interface ContractHistoryItem {
	baseSalary: string | null;
	contractName: string;
	endDate: Date | null;
	id: string;
	payFrequency: PayFrequency;
	salaryCurrency: string;
	startDate: Date;
	status: "draft" | "active" | "expired" | "terminated";
	wageType: "daily" | "monthly" | "hourly";
}

const CONTRACT_STATUS_CLASS: Record<string, string> = {
	active: "pill-status cs-active",
	draft: "pill-status cs-draft",
	expired: "pill-status cs-expired",
	terminated: "pill-status cs-terminated",
};

function fmtContractDate(d: Date | null | string | undefined): string {
	if (!d) {
		return "—";
	}
	return new Date(d).toISOString().slice(0, 10);
}

function ContractSection({
	contracts,
	canSeeSalary,
	isHr,
}: {
	contracts: ContractHistoryItem[];
	canSeeSalary: boolean;
	isHr: boolean;
	employeeId: string;
}) {
	const active = contracts.find((c) => c.status === "active");
	const history = contracts.filter((c) => c !== active);

	return (
		<div className="widget" style={{ marginBottom: 20 }}>
			<div className="widget-head">
				<span className="ttl">Contract</span>
				{isHr && (
					<Link
						className="btn btn-ghost btn-sm"
						search={{}}
						to="/app/contracts"
					>
						Manage contracts
						<ExternalLink size={11} />
					</Link>
				)}
			</div>
			<div className="widget-body">
				{contracts.length === 0 ? (
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--fg-3)",
							padding: "8px 0",
						}}
					>
						No contracts on file.{" "}
						{isHr && (
							<Link
								search={{}}
								style={{ color: "var(--accent)" }}
								to="/app/contracts"
							>
								Create one →
							</Link>
						)}
					</div>
				) : (
					<>
						{active && (
							<div
								style={{
									background: "var(--bg-3)",
									borderRadius: 10,
									padding: "12px 14px",
									marginBottom: history.length > 0 ? 16 : 0,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "flex-start",
										justifyContent: "space-between",
										gap: 12,
										marginBottom: 8,
									}}
								>
									<div>
										<div
											style={{
												fontSize: "13px",
												fontWeight: 600,
												color: "var(--fg)",
												marginBottom: 2,
											}}
										>
											{active.contractName}
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												display: "flex",
												gap: 8,
												flexWrap: "wrap",
											}}
										>
											<span>
												{active.wageType === "monthly"
													? "Monthly salary"
													: active.wageType === "daily"
														? "Daily rate"
														: "Hourly rate"}
											</span>
											<span>·</span>
											<span>
												Paid{" "}
												{payFrequencyLabel(active.payFrequency).toLowerCase()}
											</span>
											<span>·</span>
											<span>From {fmtContractDate(active.startDate)}</span>
											{active.endDate && (
												<>
													<span>·</span>
													<span>Until {fmtContractDate(active.endDate)}</span>
												</>
											)}
										</div>
									</div>
									<div style={{ flexShrink: 0, textAlign: "right" }}>
										{canSeeSalary && active.baseSalary ? (
											<div
												className="mono"
												style={{
													fontSize: "16px",
													fontWeight: 700,
													color: "var(--accent)",
												}}
											>
												{Number(active.baseSalary).toLocaleString()}
											</div>
										) : null}
										{canSeeSalary && active.baseSalary && (
											<div
												style={{
													fontSize: "11px",
													color: "var(--fg-3)",
													marginTop: 1,
												}}
											>
												{active.salaryCurrency} / mo
											</div>
										)}
										<span
											className="pill-status cs-active"
											style={{ marginTop: 6 }}
										>
											<span className="badge-dot" />
											Active
										</span>
									</div>
								</div>
							</div>
						)}

						{history.length > 0 && (
							<>
								<div
									style={{
										fontSize: "10.5px",
										fontWeight: 500,
										color: "var(--fg-4)",
										textTransform: "uppercase",
										letterSpacing: "0.06em",
										marginBottom: 8,
									}}
								>
									History
								</div>
								<div className="contract-history">
									{history.map((c) => (
										<div className="contract-card" key={c.id}>
											<div className="cc-meta">
												<div className="cc-name">{c.contractName}</div>
												<div className="cc-sub">
													<span>{fmtContractDate(c.startDate)}</span>
													{c.endDate && (
														<>
															<span>→</span>
															<span>{fmtContractDate(c.endDate)}</span>
														</>
													)}
												</div>
											</div>
											{canSeeSalary && c.baseSalary && (
												<span className="cc-salary">
													{Number(c.baseSalary).toLocaleString()}{" "}
													<span
														style={{
															fontSize: "11px",
															color: "var(--fg-3)",
															fontWeight: 400,
														}}
													>
														{c.salaryCurrency}
													</span>
												</span>
											)}
											<span
												className={
													CONTRACT_STATUS_CLASS[c.status] ?? "pill-status"
												}
											>
												{c.status.charAt(0).toUpperCase() + c.status.slice(1)}
											</span>
										</div>
									))}
								</div>
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
}

// ─── Edit Sheet Component ─────────────────────────────────

interface EditField {
	key: string;
	label: string;
	options?: { v: string; l: string }[];
	required?: boolean;
	type?: "text" | "date" | "select";
	value: string;
}

function EditSheet({
	title,
	subtitle,
	fields,
	onClose,
	onSave,
}: {
	title: string;
	subtitle?: string;
	fields: EditField[];
	onClose: () => void;
	onSave: (values: Record<string, string>) => Promise<void>;
}) {
	const [values, setValues] = useState<Record<string, string>>(
		Object.fromEntries(fields.map((f) => [f.key, f.value]))
	);
	const [saving, setSaving] = useState(false);

	const set = (key: string, val: string) =>
		setValues((v) => ({ ...v, [key]: val }));

	const handleSave = async () => {
		for (const f of fields) {
			if (f.required && !values[f.key]?.trim()) {
				toast.error(`${f.label} is required`);
				return;
			}
		}
		setSaving(true);
		try {
			const changed: Record<string, string> = {};
			for (const f of fields) {
				if (values[f.key] !== f.value) {
					changed[f.key] = values[f.key] ?? "";
				}
			}
			if (Object.keys(changed).length === 0) {
				onClose();
				return;
			}
			await onSave(changed);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Update failed");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 200,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(8,9,12,0.6)",
			}}
		>
			<div
				style={{
					background: "var(--bg-1)",
					border: "1px solid var(--line)",
					borderRadius: 16,
					padding: 0,
					maxWidth: 520,
					width: "100%",
					maxHeight: "80vh",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "16px 20px",
						borderBottom: "1px solid var(--line)",
					}}
				>
					<div>
						<h4 style={{ fontSize: "15px", fontWeight: 600 }}>{title}</h4>
						{subtitle && (
							<p
								style={{ fontSize: "12px", color: "var(--fg-3)", marginTop: 2 }}
							>
								{subtitle}
							</p>
						)}
					</div>
					<button
						className="btn btn-ghost btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={14} />
					</button>
				</div>
				<div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
					{fields.map((f) => (
						<div key={f.key} style={{ marginBottom: 14 }}>
							<label className="label" style={{ marginBottom: 4 }}>
								{f.label}
								{f.required && (
									<span style={{ color: "var(--danger)", marginLeft: 2 }}>
										*
									</span>
								)}
							</label>
							{f.type === "select" && f.options ? (
								<select
									className="input"
									onChange={(e) => set(f.key, e.target.value)}
									style={{ height: 34 }}
									value={values[f.key] ?? ""}
								>
									{f.options.map((o) => (
										<option key={o.v} value={o.v}>
											{o.l}
										</option>
									))}
								</select>
							) : (
								<input
									className="input"
									onChange={(e) => set(f.key, e.target.value)}
									style={{ height: 34 }}
									type={f.type === "date" ? "date" : "text"}
									value={values[f.key] ?? ""}
								/>
							)}
						</div>
					))}
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						justifyContent: "flex-end",
						padding: "14px 20px",
						borderTop: "1px solid var(--line)",
					}}
				>
					<button
						className="btn btn-outline btn-sm"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{saving ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>
		</div>
	);
}
