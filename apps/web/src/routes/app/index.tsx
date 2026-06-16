import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	BarChart3,
	Bell,
	CalendarClock,
	Users,
	Wrench,
} from "lucide-react";
import { useContext } from "react";
import { canManageHR, canViewPayroll } from "@/lib/rbac";
import { orpc } from "@/utils/orpc";
import { isNavItemVisible, NAV, type NavItem, OrgCtx } from "./route";

export const Route = createFileRoute("/app/")({
	component: DashboardPage,
});

// One-line description per module so the overview cards explain what each does
// (truthful, no fake metrics). Keyed by the nav item key.
const MODULE_BLURB: Record<string, string> = {
	employees: "People records, profiles, work info and documents.",
	attendance: "Clock-ins, biometric punches and timesheets.",
	leave: "Requests, balances, approvals and holidays.",
	payroll: "Runs, payslips and country-aware statutory rules.",
	contracts: "Employment contracts, terms and renewals.",
	assets: "Company asset inventory, assignments and requests.",
	helpdesk: "Internal requests, tickets and approvals.",
	projects: "Projects, tasks, milestones and time tracking.",
	performance: "Goals, reviews, one-on-ones and recognition.",
	analytics: "Executive dashboards across the workforce.",
	finance: "Costing, budgets and labour-cost reporting.",
	crm: "Leads, customers, deals and the sales pipeline.",
	recruitment: "Job openings, candidates and the hiring pipeline.",
	onboarding: "New-hire onboarding tasks and progress.",
};

function DashboardPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const isManagement = canManageHR(role) || canViewPayroll(role);

	const unreadQuery = useQuery(orpc.notifications.unreadCount.queryOptions({}));
	const unread = unreadQuery.data?.count ?? 0;

	// Org-wide operational stats — only for management roles (others can't list).
	const employeesQuery = useQuery({
		...orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 1 },
		}),
		enabled: isManagement,
	});
	const pendingLeaveQuery = useQuery({
		...orpc.leave.requests.list.queryOptions({
			input: { status: "requested", page: 1, pageSize: 1 },
		}),
		enabled: isManagement,
	});

	const activeEmployees = employeesQuery.data?.total ?? 0;
	const pendingLeave = pendingLeaveQuery.data?.total ?? 0;

	// Role-aware module cards: only modules this user can open.
	const modules = NAV.flatMap(
		(group) => group.items as readonly NavItem[]
	).filter(
		(item) =>
			item.key !== "overview" &&
			item.key !== "settings" &&
			!("preview" in item && item.preview) &&
			isNavItemVisible(item.key, role)
	);

	const roleLabel = role.replace(/_/g, " ");

	return (
		<div className="dash-wrap">
			<header className="dash-head">
				<div>
					<h1 className="page-title">Welcome back, {org.userName}</h1>
					<p className="dash-sub">
						{org.orgName}
						{roleLabel ? ` · ${roleLabel}` : ""}
					</p>
				</div>
			</header>

			<StatTileGrid>
				{isManagement ? (
					<StatTile
						hint="Currently active"
						icon={Users}
						isLoading={employeesQuery.isLoading}
						label="Active employees"
						value={activeEmployees}
					/>
				) : null}
				{isManagement ? (
					<StatTile
						hint="Awaiting approval"
						icon={CalendarClock}
						isLoading={pendingLeaveQuery.isLoading}
						label="Pending leave"
						tone={pendingLeave > 0 ? "warning" : undefined}
						value={pendingLeave}
					/>
				) : null}
				<StatTile
					hint={unread === 0 ? "All caught up" : "In your inbox"}
					icon={Bell}
					isLoading={unreadQuery.isLoading}
					label="Unread notifications"
					tone={unread > 0 ? "primary" : undefined}
					value={unread}
				/>
				{isManagement ? (
					<StatTile
						hint="Configure org, payroll, devices"
						icon={Wrench}
						label="Setup"
						onClick={() => {
							window.location.assign("/app/setup");
						}}
						value="Open"
					/>
				) : null}
			</StatTileGrid>

			<section
				aria-label="Your modules"
				className="dash-grid"
				style={{ marginTop: 22 }}
			>
				{modules.map((item) => (
					<Link className="dash-card card" key={item.key} to={item.href}>
						<span className="dash-card-icon">
							<item.icon size={18} />
						</span>
						<span className="dash-card-body">
							<span className="dash-card-title">{item.label}</span>
							<span className="dash-card-desc">
								{MODULE_BLURB[item.key] ?? "Open this module."}
							</span>
						</span>
						<ArrowRight className="dash-card-arrow" size={15} />
					</Link>
				))}
			</section>

			{isNavItemVisible("analytics", role) ? (
				<Link className="dash-analytics" to="/app/analytics">
					<BarChart3 size={16} />
					<span>View full analytics &amp; reporting</span>
					<ArrowRight size={14} />
				</Link>
			) : null}
		</div>
	);
}
