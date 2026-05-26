import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Briefcase,
	Building,
	Calendar,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Database,
	Download,
	ExternalLink,
	FileText,
	Filter,
	GitBranch,
	Globe,
	Info,
	MoreHorizontal,
	Play,
	Plus,
	Search,
	TrendingUp,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";

import "@/styles/employees.css";

export const Route = createFileRoute("/app/employees/")({
	component: EmployeesPage,
});

type Density = "comfortable" | "default" | "compact";
type DrawerTab = "overview" | "payroll" | "leave" | "docs" | "activity";
type StatusFilter = "All" | "Active" | "On leave" | "Onboarding" | "Archived";

interface Employee {
	cc: string;
	dept: string;
	id: string;
	initials: string;
	loc: string;
	manager: string;
	name: string;
	online: boolean;
	role: string;
	src: string;
	status: "active" | "probation" | "notice" | "contract";
}

const EMPLOYEES: Employee[] = [
	{
		id: "EMP-00128",
		name: "Maya Persaud",
		role: "Ops Lead",
		dept: "Operations",
		loc: "Georgetown",
		cc: "GY",
		status: "active",
		manager: "—",
		src: "horilla",
		online: true,
		initials: "MP",
	},
	{
		id: "EMP-00214",
		name: "Rohan Gopaul",
		role: "Senior Engineer",
		dept: "Engineering",
		loc: "Georgetown",
		cc: "GY",
		status: "active",
		manager: "Persaud, M.",
		src: "horilla",
		online: true,
		initials: "RG",
	},
	{
		id: "EMP-00302",
		name: "Shanice Powell",
		role: "Finance Manager",
		dept: "Finance",
		loc: "Bridgetown",
		cc: "BB",
		status: "active",
		manager: "Roberts, L.",
		src: "horilla",
		online: false,
		initials: "SP",
	},
	{
		id: "EMP-00417",
		name: "Devon Ali",
		role: "Yard Operator",
		dept: "Operations",
		loc: "Mahaica",
		cc: "GY",
		status: "probation",
		manager: "Persaud, M.",
		src: "horilla",
		online: true,
		initials: "DA",
	},
	{
		id: "EMP-00504",
		name: "Kareena Ramnath",
		role: "HR Generalist",
		dept: "HR",
		loc: "Georgetown",
		cc: "GY",
		status: "active",
		manager: "Roberts, L.",
		src: "horilla",
		online: true,
		initials: "KR",
	},
	{
		id: "EMP-00611",
		name: "Jaden Sealey",
		role: "Logistics Lead",
		dept: "Operations",
		loc: "Port of Spain",
		cc: "TT",
		status: "active",
		manager: "Persaud, M.",
		src: "horilla",
		online: false,
		initials: "JS",
	},
	{
		id: "EMP-00702",
		name: "Aisha Khan",
		role: "Software Engineer",
		dept: "Engineering",
		loc: "Georgetown",
		cc: "GY",
		status: "active",
		manager: "Persaud, M.",
		src: "horilla",
		online: true,
		initials: "AK",
	},
	{
		id: "EMP-00814",
		name: "Lia Roberts",
		role: "Head of HR",
		dept: "HR",
		loc: "Georgetown",
		cc: "GY",
		status: "active",
		manager: "—",
		src: "horilla",
		online: true,
		initials: "LR",
	},
	{
		id: "EMP-00904",
		name: "Marcus Hines",
		role: "Account Manager",
		dept: "Sales",
		loc: "Kingston",
		cc: "JM",
		status: "active",
		manager: "Khan, T.",
		src: "horilla",
		online: false,
		initials: "MH",
	},
	{
		id: "EMP-01023",
		name: "Trish Khan",
		role: "Sales Lead, JM",
		dept: "Sales",
		loc: "Kingston",
		cc: "JM",
		status: "active",
		manager: "—",
		src: "horilla",
		online: true,
		initials: "TK",
	},
	{
		id: "EMP-01104",
		name: "Nadia Singh",
		role: "Compliance Officer",
		dept: "Compliance",
		loc: "Port of Spain",
		cc: "TT",
		status: "notice",
		manager: "Roberts, L.",
		src: "stale",
		online: false,
		initials: "NS",
	},
	{
		id: "EMP-01211",
		name: "Eli Pierre",
		role: "Junior Engineer",
		dept: "Engineering",
		loc: "Georgetown",
		cc: "GY",
		status: "probation",
		manager: "Gopaul, R.",
		src: "horilla",
		online: true,
		initials: "EP",
	},
];

const STATUS_LABELS: Record<Employee["status"], string> = {
	active: "Active",
	probation: "Probation",
	notice: "Notice",
	contract: "Contract",
};

function EmployeesPage() {
	const [density, setDensity] = useState<Density>("default");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
	const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
	const [searchQuery, setSearchQuery] = useState("");

	const allSelected =
		selectedIds.size === EMPLOYEES.length && EMPLOYEES.length > 0;
	const selectedCount = selectedIds.size;

	function openDrawer(emp: Employee) {
		setDrawerEmployee(emp);
		setDrawerTab("overview");
		setDrawerOpen(true);
	}

	function closeDrawer() {
		setDrawerOpen(false);
	}

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			setSelectedIds(new Set(EMPLOYEES.map((e) => e.id)));
		} else {
			setSelectedIds(new Set());
		}
	}

	function toggleSelectRow(id: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) {
			next.add(id);
		} else {
			next.delete(id);
		}
		setSelectedIds(next);
	}

	function clearSelection() {
		setSelectedIds(new Set());
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				closeDrawer();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<div className="page">
			{/* Page header */}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Atlas Shipping</span>
						<span className="sep">/</span>
						<span>Employees</span>
					</div>
					<h1 className="page-title">Employees</h1>
					<p className="page-sub">
						1,284 active · 14 on leave · 6 onboarding this week
					</p>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button className="btn btn-outline" type="button">
						<Download size={13} />
						Export
					</button>
					<div className="menu-root">
						<button className="btn btn-outline" type="button">
							<ExternalLink size={13} />
							Import <ChevronDown size={12} />
						</button>
						<div className="menu" data-side="bottom-end">
							<button className="menu-item" type="button">
								<span className="menu-icon">
									<Database size={14} />
								</span>
								Sync from Horilla
							</button>
							<button className="menu-item" type="button">
								<span className="menu-icon">
									<FileText size={14} />
								</span>
								Upload CSV
							</button>
							<button className="menu-item" type="button">
								<span className="menu-icon">
									<GitBranch size={14} />
								</span>
								Import via API
							</button>
						</div>
					</div>
					<button className="btn btn-primary" type="button">
						<Plus size={13} />
						Add employee
					</button>
				</div>
			</div>

			{/* Bulk action bar */}
			<div className={`bulk-bar${selectedCount > 0 ? "visible" : ""}`}>
				<span className="count">
					<b>{selectedCount}</b> selected
				</span>
				<div className="toolbar-divider" />
				<button className="btn btn-ghost btn-sm" type="button">
					<ExternalLink size={11} />
					Move department
				</button>
				<button className="btn btn-ghost btn-sm" type="button">
					<FileText size={11} />
					Send document
				</button>
				<button className="btn btn-ghost btn-sm" type="button">
					<Wallet size={11} />
					Add to pay run
				</button>
				<div className="toolbar-divider" />
				<button
					className="btn btn-ghost btn-sm"
					style={{ color: "var(--danger)" }}
					type="button"
				>
					<X size={11} />
					Archive
				</button>
				<button
					className="btn btn-outline btn-sm"
					onClick={clearSelection}
					type="button"
				>
					Clear
				</button>
			</div>

			{/* Toolbar */}
			<div className="toolbar">
				<div className="search-wrap">
					<Search className="icon-l" size={15} />
					<input
						className="search"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search by name, ID, email, department…"
						value={searchQuery}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{(
						[
							"All",
							"Active",
							"On leave",
							"Onboarding",
							"Archived",
						] as StatusFilter[]
					).map((s) => (
						<button
							className={statusFilter === s ? "active" : ""}
							key={s}
							onClick={() => setStatusFilter(s)}
							type="button"
						>
							{s === "All" ? (
								<>
									All <span style={{ opacity: 0.7 }}>·</span>{" "}
									<span className="mono" style={{ fontSize: "11px" }}>
										1,284
									</span>
								</>
							) : (
								s
							)}
						</button>
					))}
				</div>
				<div className="toolbar-divider" />
				<div className="density-pills">
					{(
						[
							{ key: "comfortable" as Density, label: "Comfy" },
							{ key: "default" as Density, label: "Default" },
							{ key: "compact" as Density, label: "Compact" },
						] as { key: Density; label: string }[]
					).map(({ key, label }) => (
						<button
							className={density === key ? "active" : ""}
							key={key}
							onClick={() => setDensity(key)}
							type="button"
						>
							{label}
						</button>
					))}
				</div>
				<div className="menu-root" style={{ marginLeft: "auto" }}>
					<button className="btn btn-ghost btn-sm" type="button">
						<Filter size={12} />
						Columns
					</button>
					<div className="menu" data-side="bottom-end">
						<div className="menu-section">Toggle columns</div>
						<button className="menu-item" type="button">
							<span className="menu-icon">
								<Check size={13} style={{ color: "var(--accent)" }} />
							</span>
							Department
						</button>
						<button className="menu-item" type="button">
							<span className="menu-icon">
								<Check size={13} style={{ color: "var(--accent)" }} />
							</span>
							Location
						</button>
						<button className="menu-item" type="button">
							<span className="menu-icon">
								<Check size={13} style={{ color: "var(--accent)" }} />
							</span>
							Country / payroll
						</button>
						<button className="menu-item" type="button">
							<span className="menu-icon">
								<Check size={13} style={{ color: "var(--accent)" }} />
							</span>
							Status
						</button>
						<button className="menu-item" type="button">
							<span className="menu-icon" />
							Manager
						</button>
						<button className="menu-item" type="button">
							<span className="menu-icon" />
							Joined date
						</button>
					</div>
				</div>
			</div>

			{/* Filter chip bar */}
			<div className="filter-row">
				<button className="filter-chip active" type="button">
					<Globe size={11} />
					Country <span className="v">GY · TT · BB · JM</span>
				</button>
				<button className="filter-chip" type="button">
					<Building size={11} />
					Department
				</button>
				<button className="filter-chip" type="button">
					<Briefcase size={11} />
					Employment
				</button>
				<button className="filter-chip active" type="button">
					<Users size={11} />
					Manager <span className="v">Persaud, M.</span>
				</button>
				<button className="filter-chip" type="button">
					<Calendar size={11} />
					Joined
				</button>
				<button className="filter-chip" type="button">
					<Plus size={11} />
					Add filter
				</button>
				<div className="meta">
					<span>
						Showing{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							1 – 12
						</span>{" "}
						of{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							1,284
						</span>
					</span>
					<span className="badge">
						<span
							className="badge-dot"
							style={{ background: "var(--success)" }}
						/>
						Synced 14:42
					</span>
				</div>
			</div>

			{/* Employee table */}
			<div className="emp-list" data-density={density}>
				<table>
					<thead>
						<tr>
							<th style={{ width: "40px", paddingRight: 0 }}>
								<input
									checked={allSelected}
									className="checkbox"
									onChange={(e) => toggleSelectAll(e.target.checked)}
									type="checkbox"
								/>
							</th>
							<th className="sortable">
								Employee <span className="sort-ind">▼</span>
							</th>
							<th className="sortable">Department</th>
							<th className="sortable">Location</th>
							<th className="sortable">Country</th>
							<th className="sortable">Status</th>
							<th className="sortable" style={{ textAlign: "right" }}>
								Manager
							</th>
							<th>Source</th>
							<th style={{ width: "100px" }} />
						</tr>
					</thead>
					<tbody>
						{EMPLOYEES.map((emp) => (
							<tr
								className={selectedIds.has(emp.id) ? "selected" : ""}
								key={emp.id}
								onClick={(e) => {
									if ((e.target as HTMLElement).closest("input,button,a")) {
										return;
									}
									openDrawer(emp);
								}}
								style={{ cursor: "pointer" }}
							>
								<td style={{ paddingRight: 0 }}>
									<input
										checked={selectedIds.has(emp.id)}
										className="checkbox row-cb"
										onChange={(e) => toggleSelectRow(emp.id, e.target.checked)}
										onClick={(e) => e.stopPropagation()}
										type="checkbox"
									/>
								</td>
								<td>
									<div className="emp-name">
										<div className={`avatar-sm${emp.online ? "online" : ""}`}>
											{emp.initials}
										</div>
										<div>
											<div className="ttl">{emp.name}</div>
											<div className="sub">
												{emp.id} · {emp.role}
											</div>
										</div>
									</div>
								</td>
								<td>
									<span style={{ color: "var(--fg-2)" }}>{emp.dept}</span>
								</td>
								<td>
									<span style={{ color: "var(--fg-2)" }}>{emp.loc}</span>
								</td>
								<td>
									<span className="cc-badge">
										<span style={{ fontSize: "11px" }}>{emp.cc}</span>
										{emp.cc}
									</span>
								</td>
								<td>
									<span className={`pill-status ${emp.status}`}>
										{emp.status === "active" && <span className="badge-dot" />}
										{STATUS_LABELS[emp.status]}
									</span>
								</td>
								<td
									style={{
										textAlign: "right",
										color: "var(--fg-3)",
										fontSize: "12px",
									}}
								>
									{emp.manager}
								</td>
								<td>
									<span
										className={`source-tag${emp.src === "stale" ? "stale" : ""}`}
									>
										<span className="dot" />
										{emp.src === "stale" ? "horilla · stale" : "horilla"}
									</span>
								</td>
								<td>
									<div className="row-actions">
										<button title="Open profile" type="button">
											<ExternalLink size={12} />
										</button>
										<button title="Message" type="button">
											<Info size={12} />
										</button>
										<button title="More" type="button">
											<MoreHorizontal size={12} />
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="pagination">
					<span>
						Showing{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							1–12
						</span>{" "}
						of{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							1,284
						</span>
					</span>
					<div className="pager">
						<button className="icon" type="button">
							<ChevronLeft size={12} />
						</button>
						<button className="active" type="button">
							1
						</button>
						<button type="button">2</button>
						<button type="button">3</button>
						<button type="button">4</button>
						<span style={{ color: "var(--fg-4)", padding: "0 4px" }}>…</span>
						<button type="button">107</button>
						<button className="icon" type="button">
							<ChevronRight size={12} />
						</button>
					</div>
				</div>
			</div>

			{/* Drawer backdrop */}
			<div
				className={`drawer-backdrop${drawerOpen ? "visible" : ""}`}
				onClick={closeDrawer}
			/>

			{/* Employee drawer */}
			<aside className={`drawer${drawerOpen ? "visible" : ""}`}>
				<div className="drawer-head">
					<div className="id-card">
						<div className="avatar-lg">{drawerEmployee?.initials ?? ""}</div>
						<div>
							<h2>{drawerEmployee?.name ?? ""}</h2>
							<div className="sub">
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{drawerEmployee?.id ?? ""}
								</span>
								<span style={{ color: "var(--fg-4)" }}>·</span>
								<span>
									{drawerEmployee
										? `${drawerEmployee.role}, ${drawerEmployee.dept}`
										: ""}
								</span>
							</div>
						</div>
					</div>
					<button className="icon-btn" onClick={closeDrawer} type="button">
						<X size={14} />
					</button>
				</div>

				<div className="drawer-body">
					<div className="tabs" style={{ marginBottom: "20px" }}>
						{(
							[
								{ key: "overview", label: "Overview" },
								{ key: "payroll", label: "Payroll" },
								{ key: "leave", label: "Leave" },
								{
									key: "docs",
									label: (
										<>
											Documents <span className="count">4</span>
										</>
									),
								},
								{ key: "activity", label: "Activity" },
							] as { key: DrawerTab; label: React.ReactNode }[]
						).map(({ key, label }) => (
							<button
								aria-selected={drawerTab === key}
								className="tab"
								key={key}
								onClick={() => setDrawerTab(key)}
								type="button"
							>
								{label}
							</button>
						))}
					</div>

					{/* Overview tab */}
					{drawerTab === "overview" && (
						<div className="tab-panel active">
							<div className="drawer-section">
								<div className="tiny">Employment</div>
								<div className="kv">
									<span className="kv-k">Status</span>
									<span className="kv-v">
										<span className="pill-status active">
											<span className="badge-dot" />
											Active
										</span>
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Joined</span>
									<span className="kv-v">2024-03-18</span>
								</div>
								<div className="kv">
									<span className="kv-k">Contract</span>
									<span className="kv-v">Permanent</span>
								</div>
								<div className="kv">
									<span className="kv-k">Manager</span>
									<span
										className="kv-v"
										style={{
											fontFamily: "inherit",
											color: "var(--fg)",
										}}
									>
										Maya Persaud
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Location</span>
									<span
										className="kv-v"
										style={{
											fontFamily: "inherit",
											color: "var(--fg)",
										}}
									>
										Georgetown, GY
									</span>
								</div>
							</div>

							<div className="drawer-section">
								<div className="tiny">This period at a glance</div>
								<div className="drawer-stats">
									<div className="drawer-stat">
										<div className="l">Attendance</div>
										<div className="v">94.8%</div>
										<div className="sub-v">2 late · 0 absent</div>
									</div>
									<div className="drawer-stat">
										<div className="l">Leave taken</div>
										<div className="v">3 / 18</div>
										<div className="sub-v">15 remaining</div>
									</div>
									<div className="drawer-stat">
										<div className="l">Net pay</div>
										<div className="v" style={{ color: "var(--accent)" }}>
											265k
										</div>
										<div className="sub-v">GYD · Sep</div>
									</div>
								</div>
							</div>

							<div className="drawer-section">
								<div className="tiny">Country &amp; tax</div>
								<div className="kv">
									<span className="kv-k">Country</span>
									<span
										className="kv-v"
										style={{
											fontFamily: "inherit",
											color: "var(--fg)",
											display: "inline-flex",
											alignItems: "center",
											gap: "8px",
										}}
									>
										<span style={{ fontSize: "11px" }}>GY</span>
										Guyana
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">PAYE band</span>
									<span className="kv-v">28% bracket</span>
								</div>
								<div className="kv">
									<span className="kv-k">NIS #</span>
									<span className="kv-v">GY-NIS-9482-1147</span>
								</div>
								<div className="kv">
									<span className="kv-k">Profile</span>
									<span className="kv-v">gy.v2026.1</span>
								</div>
							</div>

							<div className="drawer-section">
								<div className="tiny">Source</div>
								<div
									style={{
										background: "var(--bg-2)",
										border: "1px solid var(--line)",
										borderRadius: "11px",
										padding: "12px 14px",
										display: "flex",
										alignItems: "center",
										gap: "12px",
									}}
								>
									<div
										style={{
											width: "32px",
											height: "32px",
											borderRadius: "9px",
											background: "var(--success-soft)",
											color: "var(--success)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Database size={16} />
									</div>
									<div style={{ flex: 1 }}>
										<div
											style={{
												fontSize: "12.5px",
												fontWeight: 500,
											}}
										>
											Synced from Horilla HRMS
										</div>
										<div
											style={{
												fontSize: "11px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Last update{" "}
											<span className="mono" style={{ color: "var(--fg-2)" }}>
												2026-09-27 14:42:08
											</span>
										</div>
									</div>
									<a
										href="#"
										style={{
											color: "var(--accent)",
											fontSize: "12px",
											display: "inline-flex",
											alignItems: "center",
											gap: "4px",
										}}
									>
										Open <ArrowUpRight size={11} />
									</a>
								</div>
							</div>
						</div>
					)}

					{/* Payroll tab */}
					{drawerTab === "payroll" && (
						<div className="tab-panel active">
							<div className="drawer-section">
								<div className="tiny">Latest pay run · GY · September 2026</div>
								<div className="kv">
									<span className="kv-k">Gross</span>
									<span className="kv-v">342,000.00</span>
								</div>
								<div className="kv">
									<span className="kv-k">PAYE</span>
									<span className="kv-v" style={{ color: "var(--fg-3)" }}>
										−58,140.00
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">NIS (employee)</span>
									<span className="kv-v" style={{ color: "var(--fg-3)" }}>
										−18,810.00
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Other deductions</span>
									<span className="kv-v" style={{ color: "var(--fg-3)" }}>
										0.00
									</span>
								</div>
								<div
									className="kv"
									style={{
										borderTop: "1px solid var(--line)",
										paddingTop: "12px",
										marginTop: "4px",
									}}
								>
									<span className="kv-k" style={{ color: "var(--fg)" }}>
										Net pay
									</span>
									<span
										className="kv-v"
										style={{
											color: "var(--accent)",
											fontSize: "16px",
										}}
									>
										265,050.00
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Employer NIS</span>
									<span className="kv-v" style={{ color: "var(--fg-3)" }}>
										19,152.00
									</span>
								</div>
							</div>
							<button className="btn btn-outline w-full" type="button">
								View payslip <ExternalLink size={12} />
							</button>
						</div>
					)}

					{/* Leave tab */}
					{drawerTab === "leave" && (
						<div className="tab-panel active">
							<div className="drawer-section">
								<div className="tiny">Balances · FY 2026</div>
								<div className="kv">
									<span className="kv-k">Annual</span>
									<span className="kv-v">15 / 18 days</span>
								</div>
								<div className="kv">
									<span className="kv-k">Sick</span>
									<span className="kv-v">12 / 14 days</span>
								</div>
								<div className="kv">
									<span className="kv-k">Compassionate</span>
									<span className="kv-v">3 / 3 days</span>
								</div>
							</div>
							<div className="drawer-section">
								<div className="tiny">Upcoming</div>
								<div
									style={{
										background: "var(--bg-2)",
										border: "1px solid var(--line)",
										borderRadius: "11px",
										padding: "12px 14px",
									}}
								>
									<div
										style={{
											fontSize: "13px",
											fontWeight: 500,
										}}
									>
										Annual leave · 4 days
									</div>
									<div
										style={{
											fontSize: "11.5px",
											color: "var(--fg-3)",
											marginTop: "4px",
										}}
									>
										2–5 October · awaiting your approval
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Docs tab */}
					{drawerTab === "docs" && (
						<div className="tab-panel active">
							<div className="drawer-section">
								<div className="tiny">On file (4)</div>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "8px",
									}}
								>
									{[
										{
											name: "Contract · Permanent (signed)",
											meta: "PDF · 184 KB · 2024-03-18",
										},
										{
											name: "National ID",
											meta: "PDF · 320 KB · 2024-03-18",
										},
										{
											name: "Bank verification · Republic Bank",
											meta: "PDF · 96 KB · 2024-04-02",
										},
										{
											name: "Performance review · H1 2026",
											meta: "PDF · 244 KB · 2026-07-10",
										},
									].map((doc) => (
										<div
											key={doc.name}
											style={{
												background: "var(--bg-2)",
												border: "1px solid var(--line)",
												borderRadius: "11px",
												padding: "11px 13px",
												display: "flex",
												alignItems: "center",
												gap: "12px",
											}}
										>
											<FileText size={16} style={{ color: "var(--fg-3)" }} />
											<div style={{ flex: 1 }}>
												<div style={{ fontSize: "13px" }}>{doc.name}</div>
												<div
													style={{
														fontSize: "11.5px",
														color: "var(--fg-3)",
													}}
												>
													{doc.meta}
												</div>
											</div>
											<a
												style={{
													color: "var(--accent)",
													fontSize: "11.5px",
												}}
											>
												Open
											</a>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{/* Activity tab */}
					{drawerTab === "activity" && (
						<div className="tab-panel active">
							<div
								className="timeline"
								style={{
									position: "relative",
									display: "flex",
									flexDirection: "column",
								}}
							>
								<div
									style={{
										position: "absolute",
										left: "11px",
										top: "12px",
										bottom: "12px",
										width: "1px",
										background: "var(--line)",
									}}
								/>
								{[
									{
										icon: <Check size={11} />,
										border: "var(--accent)",
										color: "var(--accent)",
										text: "OT request · 8h · approved by Maya Persaud",
										time: "Tue 14:18",
									},
									{
										icon: <FileText size={11} />,
										border: "var(--line)",
										color: "var(--fg-3)",
										text: "Performance review filed · H1 2026",
										time: "Jul 10",
									},
									{
										icon: <TrendingUp size={11} />,
										border: "var(--line)",
										color: "var(--fg-3)",
										text: "Salary increase · +8.4% · effective 2026-07-01",
										time: "Jul 1",
									},
									{
										icon: <Users size={11} />,
										border: "var(--line)",
										color: "var(--fg-3)",
										text: "Joined Engineering team",
										time: "Mar 18, '24",
									},
								].map((item, i) => (
									<div
										key={i}
										style={{
											display: "grid",
											gridTemplateColumns: "22px 1fr auto",
											gap: "12px",
											alignItems: "center",
											padding: "10px 0",
											fontSize: "12.5px",
											position: "relative",
											zIndex: 1,
										}}
									>
										<div
											style={{
												width: "22px",
												height: "22px",
												borderRadius: "50%",
												background: "var(--bg-1)",
												border: `1px solid ${item.border}`,
												color: item.color,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											{item.icon}
										</div>
										<div>{item.text}</div>
										<div
											className="mono"
											style={{
												fontSize: "11px",
												color: "var(--fg-4)",
											}}
										>
											{item.time}
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="drawer-foot">
					<Link
						className="btn btn-outline"
						params={{ id: drawerEmployee?.id ?? "EMP-00214" }}
						style={{ flex: 1 }}
						to="/app/employees/$id"
					>
						Open full profile <ExternalLink size={13} />
					</Link>
					<button className="btn btn-primary" type="button">
						<Play size={13} />
						Send message
					</button>
				</div>
			</aside>
		</div>
	);
}
