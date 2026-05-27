import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Activity,
	Archive,
	ArrowRight,
	ArrowUp,
	ArrowUpRight,
	Briefcase,
	Calendar,
	Check,
	Clock,
	Download,
	Edit,
	ExternalLink,
	FileText,
	Filter,
	Info,
	LayoutDashboard,
	LogOut,
	MoreHorizontal,
	Play,
	Plus,
	TrendingUp,
	Undo,
	User,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employee-profile.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const HR_ROLES = ["tenant_owner", "tenant_admin", "hr_admin"];
const BANK_ROLES = [...HR_ROLES, "payroll_admin"];

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

const ATT_DAYS = [
	"weekend",
	"full",
	"full",
	"late",
	"full",
	"full",
	"full",
	"weekend",
	"weekend",
	"full",
	"full",
	"full",
	"full",
	"full-2",
	"weekend",
	"weekend",
	"full",
	"full",
	"full",
	"full",
	"full",
	"weekend",
	"weekend",
	"full",
	"late",
	"full",
	"full",
	"full",
	"weekend",
	"weekend",
];

type EditSection = "personal" | "work" | "bank" | null;

function EmployeeProfilePage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const org = useContext(OrgCtx);
	const canEdit = HR_ROLES.includes(org.memberRole);
	const canEditBank = BANK_ROLES.includes(org.memberRole);
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

	const { data: docs } = useQuery(
		orpc.hrCore.employees.documents.list.queryOptions({
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
			input: { isActive: true, page: 1, pageSize: 200 },
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
									label: (
										<>
											Documents <span className="count">4</span>
										</>
									),
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
											{emp.email}
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
												? new Date(workInfo.joiningDate)
														.toISOString()
														.slice(0, 10)
												: "—"}
										</span>
									</div>
									<div className="kv">
										<span className="k">Salary</span>
										<span className="v">
											{workInfo?.basicSalary
												? `${Number(workInfo.basicSalary).toLocaleString()} ${workInfo.salaryCurrency}`
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
									<div className="l">Attendance · 30d</div>
									<div className="v">94.8%</div>
									<div className="delta up">
										<ArrowUp size={10} />
										+1.2pp · 2 late · 0 absent
									</div>
								</div>
								<div className="stat-card">
									<div className="l">Leave balance</div>
									<div className="v">
										15
										<span style={{ fontSize: "14px", color: "var(--fg-3)" }}>
											{" "}
											/ 18
										</span>
									</div>
									<div className="delta">3 days taken · FY 2026</div>
								</div>
								<div className="stat-card">
									<div className="l">Net pay · Sep</div>
									<div className="v" style={{ color: "var(--accent)" }}>
										265.0k
									</div>
									<div className="delta">GYD · gross 342.0k</div>
								</div>
								<div className="stat-card">
									<div className="l">Overtime · 30d</div>
									<div className="v">14.5 h</div>
									<div className="delta warn">+ 6.5h pending approval</div>
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
											<div>
												<span
													style={{
														fontSize: "11px",
														color: "var(--fg-3)",
														textTransform: "uppercase",
														letterSpacing: "0.05em",
													}}
												>
													Full days
												</span>
												<div
													className="mono"
													style={{
														fontSize: "16px",
														fontWeight: 600,
													}}
												>
													22
												</div>
											</div>
											<div>
												<span
													style={{
														fontSize: "11px",
														color: "var(--fg-3)",
														textTransform: "uppercase",
														letterSpacing: "0.05em",
													}}
												>
													Late
												</span>
												<div
													className="mono"
													style={{
														fontSize: "16px",
														fontWeight: 600,
														color: "var(--warning)",
													}}
												>
													2
												</div>
											</div>
											<div>
												<span
													style={{
														fontSize: "11px",
														color: "var(--fg-3)",
														textTransform: "uppercase",
														letterSpacing: "0.05em",
													}}
												>
													Absent
												</span>
												<div
													className="mono"
													style={{
														fontSize: "16px",
														fontWeight: 600,
														color: "var(--danger)",
													}}
												>
													0
												</div>
											</div>
											<div>
												<span
													style={{
														fontSize: "11px",
														color: "var(--fg-3)",
														textTransform: "uppercase",
														letterSpacing: "0.05em",
													}}
												>
													Leave
												</span>
												<div
													className="mono"
													style={{
														fontSize: "16px",
														fontWeight: 600,
													}}
												>
													3
												</div>
											</div>
											<div>
												<span
													style={{
														fontSize: "11px",
														color: "var(--fg-3)",
														textTransform: "uppercase",
														letterSpacing: "0.05em",
													}}
												>
													OT
												</span>
												<div
													className="mono"
													style={{
														fontSize: "16px",
														fontWeight: 600,
														color: "var(--accent)",
													}}
												>
													14.5h
												</div>
											</div>
										</div>
									</div>
									<div className="att-cal">
										{ATT_DAYS.map((day, i) => (
											<div className={`att-day ${day}`} key={i} />
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
											Leave
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
									<span className="ttl">Leave balances · FY 2026</span>
									<a
										href="#"
										style={{ fontSize: "11.5px", color: "var(--accent)" }}
									>
										Request leave
									</a>
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
									<div className="tl-wrap">
										<div className="tl-item">
											<div className="dot accent">
												<Check size={11} />
											</div>
											<div>
												<div className="desc">OT request · 8h approved</div>
												<div className="meta">
													Week 39 · approved by Maya Persaud
												</div>
											</div>
											<div className="time">Tue 14:18</div>
										</div>
										<div className="tl-item">
											<div className="dot success">
												<FileText size={11} />
											</div>
											<div>
												<div className="desc">
													Performance review filed · H1 2026
												</div>
												<div className="meta">
													Rated <strong>Exceeds expectations</strong> · reviewed
													by L. Roberts
												</div>
											</div>
											<div className="time">Jul 10</div>
										</div>
										<div className="tl-item">
											<div className="dot">
												<TrendingUp size={11} />
											</div>
											<div>
												<div className="desc">Salary adjustment · +8.4%</div>
												<div className="meta">
													From 315,500 → 342,000 GYD/mo · effective 2026-07-01
												</div>
											</div>
											<div className="time">Jul 1</div>
										</div>
										<div className="tl-item">
											<div className="dot">
												<Briefcase size={11} />
											</div>
											<div>
												<div className="desc">
													Promoted: Software Engineer → Senior Engineer
												</div>
												<div className="meta">
													Engineering · effective 2026-04-01
												</div>
											</div>
											<div className="time">Apr 1</div>
										</div>
										<div className="tl-item">
											<div className="dot">
												<Users size={11} />
											</div>
											<div>
												<div className="desc">
													Joined Atlas Shipping · Engineering
												</div>
												<div className="meta">
													Permanent contract · onboarding completed in 9 days
												</div>
											</div>
											<div className="time">Mar 18, '24</div>
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
							<span className="ttl">Documents · 4 on file</span>
							<button className="btn btn-primary btn-sm" type="button">
								<Plus size={12} />
								Upload
							</button>
						</div>
						<div className="widget-body">
							<div className="doc-row">
								<div className="ic">
									<FileText size={15} />
								</div>
								<div>
									<div className="ttl">Contract · Permanent (signed)</div>
									<div className="sub">
										PDF · 184 KB · uploaded 2024-03-18 by Lia Roberts
									</div>
								</div>
								<a>
									Open <ArrowUpRight size={11} />
								</a>
							</div>
							<div className="doc-row">
								<div className="ic">
									<FileText size={15} />
								</div>
								<div>
									<div className="ttl">National ID</div>
									<div className="sub">
										PDF · 320 KB · uploaded 2024-03-18 · verified
									</div>
								</div>
								<a>
									Open <ArrowUpRight size={11} />
								</a>
							</div>
							<div className="doc-row">
								<div className="ic">
									<FileText size={15} />
								</div>
								<div>
									<div className="ttl">Bank verification · Republic Bank</div>
									<div className="sub">PDF · 96 KB · uploaded 2024-04-02</div>
								</div>
								<a>
									Open <ArrowUpRight size={11} />
								</a>
							</div>
							<div className="doc-row">
								<div className="ic">
									<FileText size={15} />
								</div>
								<div>
									<div className="ttl">Performance review · H1 2026</div>
									<div className="sub">
										PDF · 244 KB · uploaded 2026-07-10 by Lia Roberts
									</div>
								</div>
								<a>
									Open <ArrowUpRight size={11} />
								</a>
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
							<div className="tl-wrap">
								<div className="tl-item">
									<div className="dot accent">
										<Check size={11} />
									</div>
									<div>
										<div className="desc">OT request · 8h approved</div>
										<div className="meta">Approved by Maya Persaud</div>
									</div>
									<div className="time">Tue 14:18</div>
								</div>
								<div className="tl-item">
									<div className="dot success">
										<FileText size={11} />
									</div>
									<div>
										<div className="desc">
											Performance review filed · H1 2026
										</div>
										<div className="meta">Rated Exceeds expectations</div>
									</div>
									<div className="time">Jul 10</div>
								</div>
								<div className="tl-item">
									<div className="dot">
										<TrendingUp size={11} />
									</div>
									<div>
										<div className="desc">
											Salary +8.4% · effective 2026-07-01
										</div>
										<div className="meta">From 315,500 → 342,000 GYD</div>
									</div>
									<div className="time">Jul 1</div>
								</div>
								<div className="tl-item">
									<div className="dot">
										<Briefcase size={11} />
									</div>
									<div>
										<div className="desc">
											Promotion · Software Engineer → Senior Engineer
										</div>
										<div className="meta">Engineering</div>
									</div>
									<div className="time">Apr 1</div>
								</div>
								<div className="tl-item">
									<div className="dot">
										<Calendar size={11} />
									</div>
									<div>
										<div className="desc">Annual leave · 3 days · approved</div>
										<div className="meta">21–23 May 2026</div>
									</div>
									<div className="time">May 18</div>
								</div>
								<div className="tl-item">
									<div className="dot">
										<Users size={11} />
									</div>
									<div>
										<div className="desc">Joined Atlas Shipping</div>
										<div className="meta">
											Engineering · onboarding completed in 9 days
										</div>
									</div>
									<div className="time">Mar 18, '24</div>
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

			{editSection === "work" && workInfo && (
				<EditSheet
					fields={[
						{
							key: "departmentId",
							label: "Department",
							value: workInfo.departmentId ?? "",
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
							value: workInfo.jobPositionId ?? "",
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
							value: workInfo.shiftId ?? "",
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
							value: workInfo.workTypeId ?? "",
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
							value: workInfo.employeeTypeId ?? "",
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
							value: workInfo.reportingManagerId ?? "",
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
							value: workInfo.workLocation ?? "",
						},
						{
							key: "joiningDate",
							label: "Joining Date",
							value: workInfo.joiningDate
								? new Date(workInfo.joiningDate).toISOString().slice(0, 10)
								: "",
							type: "date",
						},
						{
							key: "basicSalary",
							label: "Base Salary",
							value: workInfo.basicSalary ?? "",
						},
						{
							key: "salaryCurrency",
							label: "Currency",
							value: workInfo.salaryCurrency ?? "GYD",
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
