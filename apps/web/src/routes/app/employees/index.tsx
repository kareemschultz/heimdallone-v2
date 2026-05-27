import { useQuery } from "@tanstack/react-query";
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
	Globe,
	Info,
	MoreHorizontal,
	Plus,
	Search,
	TrendingUp,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";

import "@/styles/employees.css";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/employees/")({
	component: EmployeesPage,
});

type Density = "comfortable" | "default" | "compact";
type DrawerTab = "overview" | "payroll" | "leave" | "docs" | "activity";
type StatusFilter = "All" | "Active" | "Archived";

interface EmployeeRow {
	badgeId: string | null;
	country: string | null;
	departmentName: string | null;
	email: string;
	firstName: string;
	id: string;
	isActive: boolean;
	jobPositionName: string | null;
	lastName: string | null;
	profileImageUrl: string | null;
	shiftName: string | null;
	workLocation: string | null;
	workTypeName: string | null;
}

function getInitials(first: string, last: string | null): string {
	return `${first.charAt(0)}${last ? last.charAt(0) : ""}`.toUpperCase();
}

function EmployeesPage() {
	const [density, setDensity] = useState<Density>("default");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [drawerEmployee, setDrawerEmployee] = useState<EmployeeRow | null>(
		null
	);
	const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 50;

	const isActive =
		statusFilter === "Archived"
			? false
			: statusFilter === "Active"
				? true
				: true;

	const { data, isLoading, isError, refetch } = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: {
				search: searchQuery || undefined,
				isActive: statusFilter === "Archived" ? false : true,
				page,
				pageSize,
			},
		})
	);

	const employees: EmployeeRow[] = (data?.data as EmployeeRow[]) ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / pageSize);

	const allSelected =
		selectedIds.size === employees.length && employees.length > 0;
	const selectedCount = selectedIds.size;

	function openDrawer(emp: EmployeeRow) {
		setDrawerEmployee(emp);
		setDrawerTab("overview");
		setDrawerOpen(true);
	}

	function closeDrawer() {
		setDrawerOpen(false);
	}

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			setSelectedIds(new Set(employees.map((e) => e.id)));
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
						{total} {statusFilter === "Archived" ? "archived" : "active"}{" "}
						employee{total === 1 ? "" : "s"}
					</p>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button className="btn btn-outline" type="button">
						<Download size={13} />
						Export
					</button>
					<Link className="btn btn-primary" to="/app/employees/create">
						<Plus size={13} />
						Add employee
					</Link>
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
						onChange={(e) => {
							setSearchQuery(e.target.value);
							setPage(1);
						}}
						placeholder="Search by name, badge, email…"
						value={searchQuery}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{(["All", "Active", "Archived"] as StatusFilter[]).map((s) => (
						<button
							className={statusFilter === s ? "active" : ""}
							key={s}
							onClick={() => {
								setStatusFilter(s);
								setPage(1);
							}}
							type="button"
						>
							{s}
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
			</div>

			{/* Employee table */}
			{isLoading && (
				<div className="emp-list" data-density={density}>
					<table>
						<thead>
							<tr>
								<th style={{ width: "40px" }} />
								<th>Employee</th>
								<th>Department</th>
								<th>Location</th>
								<th>Country</th>
								<th>Status</th>
								<th style={{ width: "100px" }} />
							</tr>
						</thead>
						<tbody>
							{Array.from({ length: 6 }).map((_, i) => (
								<tr key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<td key={j}>
											<div
												style={{
													height: 14,
													width: `${50 + Math.random() * 40}%`,
													borderRadius: 4,
													background: "var(--bg-3)",
													animation: "pulse 1.5s ease-in-out infinite",
												}}
											/>
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{isError && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "64px 24px",
						textAlign: "center",
					}}
				>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						Unable to load employees. Check your connection and try again.
					</p>
					<button
						className="btn btn-outline btn-sm"
						onClick={() => refetch()}
						type="button"
					>
						Retry
					</button>
				</div>
			)}

			{!(isLoading || isError) && employees.length === 0 && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "64px 24px",
						textAlign: "center",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 48,
							height: 48,
							borderRadius: 12,
							background: "var(--bg-3)",
							color: "var(--fg-3)",
						}}
					>
						<Users size={22} />
					</div>
					<h4
						style={{
							fontSize: "15px",
							fontWeight: 600,
							color: "var(--fg)",
						}}
					>
						{searchQuery
							? "No results"
							: statusFilter === "Archived"
								? "No archived employees"
								: "No employees yet"}
					</h4>
					<p
						style={{
							fontSize: "13px",
							color: "var(--fg-3)",
							maxWidth: 320,
						}}
					>
						{searchQuery
							? "No employees match your search. Try adjusting your query."
							: "Add your first team member to get started."}
					</p>
				</div>
			)}

			{!(isLoading || isError) && employees.length > 0 && (
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
								<th className="sortable">Employee</th>
								<th className="sortable">Department</th>
								<th className="sortable">Location</th>
								<th className="sortable">Country</th>
								<th className="sortable">Status</th>
								<th style={{ width: "100px" }} />
							</tr>
						</thead>
						<tbody>
							{employees.map((emp) => (
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
											onChange={(e) =>
												toggleSelectRow(emp.id, e.target.checked)
											}
											onClick={(e) => e.stopPropagation()}
											type="checkbox"
										/>
									</td>
									<td>
										<div className="emp-name">
											<div className="avatar-sm">
												{getInitials(emp.firstName, emp.lastName)}
											</div>
											<div>
												<div className="ttl">
													{emp.firstName} {emp.lastName ?? ""}
												</div>
												<div className="sub">
													{emp.badgeId ?? "—"} · {emp.jobPositionName ?? "—"}
												</div>
											</div>
										</div>
									</td>
									<td>
										<span style={{ color: "var(--fg-2)" }}>
											{emp.departmentName ?? "—"}
										</span>
									</td>
									<td>
										<span style={{ color: "var(--fg-2)" }}>
											{emp.workLocation ?? "—"}
										</span>
									</td>
									<td>
										{emp.country ? (
											<span className="cc-badge">
												<span style={{ fontSize: "11px" }}>{emp.country}</span>
												{emp.country}
											</span>
										) : (
											<span style={{ color: "var(--fg-4)" }}>—</span>
										)}
									</td>
									<td>
										<span
											className={`pill-status ${emp.isActive ? "active" : "archived"}`}
										>
											<span className="badge-dot" />
											{emp.isActive ? "Active" : "Archived"}
										</span>
									</td>
									<td>
										<div className="row-actions">
											<Link
												params={{ id: emp.id }}
												title="Open profile"
												to="/app/employees/$id"
											>
												<ExternalLink size={12} />
											</Link>
											<button title="More" type="button">
												<MoreHorizontal size={12} />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="pagination">
							<span>
								Showing{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
								</span>{" "}
								of{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{total}
								</span>
							</span>
							<div className="pager">
								<button
									className="icon"
									disabled={page <= 1}
									onClick={() => setPage(page - 1)}
									type="button"
								>
									<ChevronLeft size={12} />
								</button>
								<span
									className="mono"
									style={{
										padding: "0 8px",
										fontSize: "12px",
										color: "var(--fg-2)",
									}}
								>
									{page} / {totalPages}
								</span>
								<button
									className="icon"
									disabled={page >= totalPages}
									onClick={() => setPage(page + 1)}
									type="button"
								>
									<ChevronRight size={12} />
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Drawer backdrop */}
			<div
				className={`drawer-backdrop${drawerOpen ? "visible" : ""}`}
				onClick={closeDrawer}
			/>

			{/* Employee drawer */}
			<aside className={`drawer${drawerOpen ? "visible" : ""}`}>
				<div className="drawer-head">
					<div className="id-card">
						<div className="avatar-lg">
							{drawerEmployee
								? getInitials(drawerEmployee.firstName, drawerEmployee.lastName)
								: ""}
						</div>
						<div>
							<h2>
								{drawerEmployee?.firstName} {drawerEmployee?.lastName ?? ""}
							</h2>
							<div className="sub">
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{drawerEmployee?.badgeId ?? "—"}
								</span>
								<span style={{ color: "var(--fg-4)" }}>·</span>
								<span>
									{drawerEmployee
										? `${drawerEmployee.jobPositionName ?? "—"}, ${drawerEmployee.departmentName ?? "—"}`
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
								{ key: "docs", label: "Documents" },
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
					{drawerTab === "overview" && drawerEmployee && (
						<div className="tab-panel active">
							<div className="drawer-section">
								<div className="tiny">Employment</div>
								<div className="kv">
									<span className="kv-k">Status</span>
									<span className="kv-v">
										<span
											className={`pill-status ${drawerEmployee.isActive ? "active" : "archived"}`}
										>
											<span className="badge-dot" />
											{drawerEmployee.isActive ? "Active" : "Archived"}
										</span>
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Position</span>
									<span className="kv-v">
										{drawerEmployee.jobPositionName ?? "—"}
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Department</span>
									<span className="kv-v">
										{drawerEmployee.departmentName ?? "—"}
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Shift</span>
									<span className="kv-v">
										{drawerEmployee.shiftName ?? "—"}
									</span>
								</div>
								<div className="kv">
									<span className="kv-k">Work Type</span>
									<span className="kv-v">
										{drawerEmployee.workTypeName ?? "—"}
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
										{drawerEmployee.workLocation ?? "—"}
										{drawerEmployee.country
											? `, ${drawerEmployee.country}`
											: ""}
									</span>
								</div>
							</div>
						</div>
					)}

					{/* Other tabs — data not wired yet */}
					{drawerTab !== "overview" && (
						<div className="tab-panel active">
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 8,
									padding: "40px 20px",
									textAlign: "center",
								}}
							>
								<p
									style={{
										fontSize: "12.5px",
										color: "var(--fg-3)",
									}}
								>
									{drawerTab === "payroll"
										? "Payroll data will appear here once contracts are configured."
										: drawerTab === "leave"
											? "Leave balances will appear here once leave types are set up."
											: drawerTab === "docs"
												? "Documents will appear here."
												: "Activity history will appear here."}
								</p>
							</div>
						</div>
					)}
				</div>

				<div className="drawer-foot">
					<Link
						className="btn btn-outline"
						params={{ id: drawerEmployee?.id ?? "" }}
						style={{ flex: 1 }}
						to="/app/employees/$id"
					>
						Open full profile <ExternalLink size={13} />
					</Link>
				</div>
			</aside>
		</div>
	);
}
