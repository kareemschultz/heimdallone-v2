import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	ArrowRight,
	Banknote,
	BarChart3,
	Bell,
	CalendarClock,
	Clock,
	LayoutDashboard,
	Search,
	Settings,
	Users,
	Wrench,
} from "lucide-react";

export const Route = createFileRoute("/preview")({
	component: PreviewDashboard,
});

interface NavLink {
	active?: boolean;
	icon: LucideIcon;
	label: string;
}
interface NavGroup {
	group: string;
	items: NavLink[];
}

const NAV: NavGroup[] = [
	{
		group: "Overview",
		items: [
			{ label: "Dashboard", icon: LayoutDashboard, active: true },
			{ label: "Analytics", icon: BarChart3 },
		],
	},
	{
		group: "People",
		items: [
			{ label: "Employees", icon: Users },
			{ label: "Attendance", icon: Clock },
			{ label: "Leave", icon: CalendarClock },
			{ label: "Payroll", icon: Banknote },
		],
	},
];

const MODULES = [
	{
		label: "Employees",
		icon: Users,
		desc: "People records, profiles, work info and documents.",
	},
	{
		label: "Attendance",
		icon: Clock,
		desc: "Clock-ins, biometric punches and timesheets.",
	},
	{
		label: "Leave",
		icon: CalendarClock,
		desc: "Requests, balances, approvals and holidays.",
	},
	{
		label: "Payroll",
		icon: Banknote,
		desc: "Runs, payslips and country-aware statutory rules.",
	},
	{
		label: "Analytics",
		icon: BarChart3,
		desc: "Executive dashboards across the workforce.",
	},
	{ label: "Setup", icon: Wrench, desc: "Configure org, payroll and devices." },
];

function PreviewDashboard() {
	return (
		<div className="app" data-collapsed="false">
			<aside className="sidebar">
				<div
					className="menu-root"
					style={{ borderBottom: "1px solid var(--line)" }}
				>
					<div className="tenant-switcher">
						<div className="tenant-avatar">AC</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontWeight: 600, fontSize: "13.5px" }}>
								Acme Corp
							</div>
							<div style={{ fontSize: "11.5px", color: "var(--fg-3)" }}>
								Administrator
							</div>
						</div>
					</div>
				</div>
				{NAV.map((group) => (
					<div className="sidebar-section" key={group.group}>
						<div className="nav-group-label">{group.group}</div>
						{group.items.map((item) => (
							<button
								className={`nav-item ${item.active ? "active" : ""}`}
								key={item.label}
								type="button"
							>
								<span className="nav-icon">
									<item.icon size={16} />
								</span>
								<span className="nav-label">{item.label}</span>
							</button>
						))}
					</div>
				))}
			</aside>

			<main>
				<div className="topbar">
					<button className="cmd-trigger" type="button">
						<Search size={15} />
						<span>Search anything…</span>
						<kbd className="kbd">⌘K</kbd>
					</button>
					<div className="right">
						<button className="icon-btn" type="button">
							<Bell size={18} />
						</button>
						<button className="icon-btn" type="button">
							<Settings size={18} />
						</button>
						<div className="avatar" style={{ width: "30px", height: "30px" }}>
							AS
						</div>
					</div>
				</div>

				<div className="dash-wrap">
					<header className="dash-head">
						<div>
							<h1 className="page-title">Welcome back, Amara</h1>
							<p className="dash-sub">Acme Corp · Administrator</p>
						</div>
					</header>

					<StatTileGrid>
						<StatTile
							hint="Currently active"
							icon={Users}
							label="Active employees"
							value={248}
						/>
						<StatTile
							hint="Awaiting approval"
							icon={CalendarClock}
							label="Pending leave"
							tone="warning"
							value={6}
						/>
						<StatTile
							hint="In your inbox"
							icon={Bell}
							label="Unread notifications"
							tone="primary"
							value={3}
						/>
						<StatTile
							hint="Configure org, payroll, devices"
							icon={Wrench}
							label="Setup"
							value="Open"
						/>
					</StatTileGrid>

					<section
						aria-label="Your modules"
						className="dash-grid"
						style={{ marginTop: 22 }}
					>
						{MODULES.map((item) => (
							<button className="dash-card card" key={item.label} type="button">
								<span className="dash-card-icon">
									<item.icon size={18} />
								</span>
								<span className="dash-card-body">
									<span className="dash-card-title">{item.label}</span>
									<span className="dash-card-desc">{item.desc}</span>
								</span>
								<ArrowRight className="dash-card-arrow" size={15} />
							</button>
						))}
					</section>
				</div>
			</main>
		</div>
	);
}
