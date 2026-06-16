import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Bell } from "lucide-react";
import { useContext } from "react";
import { orpc } from "@/utils/orpc";
import { isNavItemVisible, NAV, OrgCtx } from "./route";

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
	const unreadQuery = useQuery(orpc.notifications.unreadCount.queryOptions({}));
	const unread = unreadQuery.data?.count ?? 0;

	// Role-aware module cards: only the modules this user can actually open.
	// Reuses the sidebar's visibility rules so the overview never advertises a
	// section the user cannot access. Overview/Settings and preview-only modules
	// are excluded.
	const modules = NAV.flatMap((group) => group.items).filter(
		(item) =>
			item.key !== "overview" &&
			item.key !== "settings" &&
			!("preview" in item && item.preview) &&
			isNavItemVisible(item.key, org.memberRole)
	);

	const roleLabel = org.memberRole.replace(/_/g, " ");

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
				{unread > 0 ? (
					<div className="dash-unread" title="Unread notifications">
						<Bell size={15} />
						<span>
							{unread} unread notification{unread === 1 ? "" : "s"}
						</span>
					</div>
				) : null}
			</header>

			<section aria-label="Your modules" className="dash-grid">
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

			{isNavItemVisible("analytics", org.memberRole) ? (
				<Link className="dash-analytics" to="/app/analytics">
					<BarChart3 size={16} />
					<span>View full analytics &amp; reporting</span>
					<ArrowRight size={14} />
				</Link>
			) : null}
		</div>
	);
}
