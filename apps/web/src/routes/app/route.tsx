import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useMatches,
} from "@tanstack/react-router";
import {
	BarChart3,
	Bell,
	Boxes,
	Briefcase,
	Calendar,
	CalendarClock,
	ChevronDown,
	ClipboardList,
	Clock,
	Command,
	Cpu,
	CreditCard,
	DatabaseBackup,
	FileText,
	FolderKanban,
	GitBranch,
	Globe,
	GraduationCap,
	Handshake,
	Info,
	Landmark,
	LayoutDashboard,
	LifeBuoy,
	LogOut,
	MapPin,
	Megaphone,
	Moon,
	Network,
	Package,
	PanelLeft,
	Receipt,
	Search,
	Settings,
	Shield,
	ShieldCheck,
	Sun,
	Target,
	User,
	UserCog,
	Users,
	Wallet,
	Wrench,
} from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	type CommandNavItem,
	CommandPalette,
} from "@/components/command-palette";
import { FirstLoginModal } from "@/features/migration/first-login-modal";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import {
	canManageHR,
	canUseGeofenceCheckIn,
	canViewBiometrics,
	canViewGeofencing,
	canViewInventory,
	canViewPayroll,
} from "@/lib/rbac";
import { client, orpc } from "@/utils/orpc";

interface OrgContext {
	memberRole: string;
	orgName: string;
	orgSlug: string;
	userEmail: string;
	userName: string;
}

export const OrgCtx = createContext<OrgContext>({
	orgName: "Workspace",
	orgSlug: "",
	memberRole: "employee",
	userName: "User",
	userEmail: "",
});

const EMPLOYEE_VISIBLE_KEYS = new Set([
	"overview",
	"contracts",
	// Self-service time: My timesheet + clock in/out/break (the attendance page is
	// server-scoped to the caller's own records for non-manage roles).
	"attendance",
	"leave",
	"roster",
	// Self-service pay: My payslips (the payslips page uses getOwn for employees).
	"my-payslips",
	"documents",
	"helpdesk",
	"projects",
	"performance",
	// Employees reach My disciplinary + My resignation via the Lifecycle landing.
	"lifecycle",
	"development",
	"settings",
]);
const MANAGER_VISIBLE_KEYS = new Set([
	"overview",
	"employees",
	"org-chart",
	"contracts",
	"attendance",
	"roster",
	"leave",
	// Managers see their own payslips via the self-service getOwn page.
	"my-payslips",
	"documents",
	"helpdesk",
	"projects",
	"performance",
	// Managers see scoped disciplinary/transfers/resignations for direct reports.
	"lifecycle",
	// Managers curate their team's training/certs/skills (scoped server-side).
	"development",
	// Managers can VIEW the executive dashboard but are department-scoped
	// server-side. canViewAnalytics includes "manager".
	"analytics",
	// Managers can VIEW Finance cost reports but are department-scoped server-side
	// (own + direct reports' departments). canViewFinance includes "manager".
	"finance",
	// Managers see CRM (team-scoped server-side). canViewCrm includes "manager".
	"crm",
	"settings",
]);

// Sales roles (Phase 17) — sales_admin / sales_rep see the CRM surface + the
// basics. Without an explicit set, isNavItemVisible would default unknown roles
// to see-all.
const SALES_VISIBLE_KEYS = new Set([
	"overview",
	"crm",
	"documents",
	"settings",
]);
const RECRUITER_VISIBLE_KEYS = new Set([
	"overview",
	"employees",
	"recruitment",
	"onboarding",
	"documents",
	// Recruiters get the catalogue + aggregate skill search (no individual rows).
	"development",
	"settings",
]);
const HELPDESK_VISIBLE_KEYS = new Set([
	"overview",
	"helpdesk",
	"documents",
	"settings",
]);

// Project managers are an Operations role — they see the operational modules they
// coordinate, NOT the finance/govern admin surfaces. (The Projects nav entry is
// added in Phase 14D and joins this set then.)
const PROJECT_MANAGER_VISIBLE_KEYS = new Set([
	"overview",
	"employees",
	"contracts",
	"attendance",
	"leave",
	"assets",
	"helpdesk",
	"projects",
	"crm",
	"documents",
	"settings",
]);

// Inventory roles (Phase INV) — inventory_manager / stock_officer are dedicated
// stock roles. Without an explicit set, isNavItemVisible would deny them every
// item (they're not covered by canViewPayroll). They see the stock surface plus
// the basics. The "inventory" key itself is gated by canViewInventory below.
const INVENTORY_VISIBLE_KEYS = new Set([
	"overview",
	"inventory",
	"documents",
	"settings",
]);

export const Route = createFileRoute("/app")({
	component: AppLayout,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

// Information architecture — Meridian 7-hub grouping. Group labels are
// display-only (rendered as nav-group-label); all role visibility + preview
// gating keys off each item's `key`, so regrouping never changes access.
export const NAV = [
	{
		group: "Workspace",
		items: [
			{
				key: "overview",
				label: "Overview",
				icon: LayoutDashboard,
				href: "/app",
			},
			{
				key: "announcements",
				label: "Announcements",
				icon: Megaphone,
				href: "/app/announcements",
			},
			{
				key: "surveys",
				label: "Surveys",
				icon: ClipboardList,
				href: "/app/surveys",
			},
		],
	},
	{
		group: "People",
		items: [
			{
				key: "employees",
				label: "Employees",
				icon: Users,
				href: "/app/employees",
			},
			{
				key: "org-chart",
				label: "Org chart",
				icon: Network,
				href: "/app/org-chart",
			},
			{
				key: "performance",
				label: "Performance",
				icon: Target,
				href: "/app/performance",
			},
			{
				key: "development",
				label: "Development",
				icon: GraduationCap,
				href: "/app/development",
			},
			{
				key: "lifecycle",
				label: "Lifecycle",
				icon: GitBranch,
				href: "/app/lifecycle",
			},
		],
	},
	{
		group: "Time & Attendance",
		items: [
			{
				key: "attendance",
				label: "Attendance",
				icon: Clock,
				href: "/app/attendance",
			},
			{
				key: "roster",
				label: "Roster",
				icon: CalendarClock,
				href: "/app/roster",
			},
			{
				key: "biometrics",
				label: "Time clocks",
				icon: Cpu,
				href: "/app/biometrics",
			},
			{
				key: "geofencing",
				label: "Geofencing",
				icon: MapPin,
				href: "/app/geofencing",
			},
			{
				key: "leave",
				label: "Leave",
				icon: Calendar,
				href: "/app/leave",
			},
		],
	},
	{
		group: "Pay & Finance",
		items: [
			{
				key: "payroll",
				label: "Payroll",
				icon: Wallet,
				href: "/app/payroll",
			},
			{
				// Self-service "My payslips" — distinct from the admin Payroll hub so
				// employees/managers reach their own slips without the admin surface.
				key: "my-payslips",
				label: "My payslips",
				icon: Receipt,
				href: "/app/payroll/payslips",
			},
			{
				key: "contracts",
				label: "Contracts",
				icon: FileText,
				href: "/app/contracts",
			},
			{
				key: "finance",
				label: "Finance",
				icon: Landmark,
				href: "/app/finance",
			},
			{
				key: "analytics",
				label: "Analytics",
				icon: BarChart3,
				href: "/app/analytics",
			},
		],
	},
	{
		group: "Operations",
		items: [
			{
				key: "projects",
				label: "Projects",
				icon: FolderKanban,
				href: "/app/projects",
			},
			{
				key: "helpdesk",
				label: "Helpdesk",
				icon: LifeBuoy,
				href: "/app/helpdesk",
			},
			{
				key: "assets",
				label: "Assets",
				icon: Package,
				href: "/app/assets",
			},
			{
				key: "inventory",
				label: "Inventory",
				icon: Boxes,
				href: "/app/inventory",
			},
		],
	},
	{
		group: "Growth",
		items: [
			{
				key: "crm",
				label: "CRM",
				icon: Handshake,
				href: "/app/crm",
			},
			{
				key: "clients",
				label: "Clients",
				icon: Briefcase,
				href: "/app/clients",
				preview: true,
			},
		],
	},
	{
		group: "Admin",
		items: [
			{
				key: "users",
				label: "Users & Access",
				icon: UserCog,
				href: "/app/users",
			},
			{
				key: "settings",
				label: "Settings",
				icon: Settings,
				href: "/app/settings",
			},
			{
				key: "billing",
				label: "Billing",
				icon: CreditCard,
				href: "/app/settings/billing",
			},
			{
				key: "setup",
				label: "Setup center",
				icon: Wrench,
				href: "/app/setup",
			},
			{
				key: "migration-status",
				label: "Migration status",
				icon: DatabaseBackup,
				href: "/app/migration-status",
			},
			{
				key: "countries",
				label: "Countries & Tax",
				icon: Globe,
				href: "/app/countries",
			},
			{
				key: "compliance",
				label: "Compliance",
				icon: ShieldCheck,
				href: "/app/compliance",
				preview: true,
			},
			{
				key: "documents",
				label: "Documents",
				icon: FileText,
				href: "/app/documents",
				preview: true,
			},
		],
	},
] as const;

// Union of every nav item shape (some carry an optional `preview` flag). Lets
// consumers flatten NAV across its heterogeneous groups without `item` widening
// to `unknown`.
export type NavItem = (typeof NAV)[number]["items"][number];

function ThemeToggle() {
	const [theme, setTheme] = useState("dark");

	useEffect(() => {
		const stored = document.documentElement.getAttribute("data-theme");
		if (stored) {
			setTheme(stored);
		}
	}, []);

	const toggle = (t: string) => {
		setTheme(t);
		document.documentElement.setAttribute("data-theme", t);
		try {
			localStorage.setItem("heimdall.theme", t);
		} catch {
			// localStorage may be unavailable (private mode); ignore persistence failure
		}
	};

	return (
		<div className="theme-toggle" data-theme-toggle="">
			<button
				className={theme === "dark" ? "active" : ""}
				onClick={() => toggle("dark")}
				title="Dark"
				type="button"
			>
				<Moon size={14} />
			</button>
			<button
				className={theme === "light" ? "active" : ""}
				onClick={() => toggle("light")}
				title="Light"
				type="button"
			>
				<Sun size={14} />
			</button>
		</div>
	);
}

function useCurrentNavKey(): string {
	const matches = useMatches();
	const lastMatch = matches.at(-1);
	const path = lastMatch?.pathname ?? "/app";
	if (path === "/app" || path === "/app/") {
		return "overview";
	}
	const segment = path.replace("/app/", "").split("/")[0];
	return segment || "overview";
}

// Preview/scaffold modules not backed by live data (sample/demo only). These are
// kept reachable for admin QA but hidden from normal tenant users so production
// navigation only advertises usable features. Gated to canManageHR like the
// migration cutover tool.
const PREVIEW_KEYS = new Set(["compliance", "documents", "clients"]);
// Company-wide member surfaces every role can reach (read/respond universal;
// audience is matched server-side). Announcements feed + Surveys feed.
const ALWAYS_VISIBLE_KEYS = new Set(["announcements", "surveys"]);

export function isNavItemVisible(key: string, role: string): boolean {
	// Migration status is an HR/admin cutover tool — restrict it to canManageHR
	// (owner/admin/hr_admin) BEFORE the canViewPayroll see-all branch, so payroll
	// and auditor don't see an entry that would only 403.
	if (ALWAYS_VISIBLE_KEYS.has(key)) {
		return true;
	}
	if (key === "migration-status") {
		return canManageHR(role);
	}
	// Users & Access (members + invitations) — owner/admin/hr_admin only. The
	// Better Auth `member` grant maps exactly to canManageHR; gate BEFORE the
	// canViewPayroll see-all branch so payroll/auditor don't see a 403-only entry.
	if (key === "users") {
		return canManageHR(role);
	}
	// Billing/subscription — owner/admin/hr_admin only (canManageHR). Gate BEFORE
	// the canViewPayroll see-all branch so payroll/auditor don't see a 403 entry.
	if (key === "billing") {
		return canManageHR(role);
	}
	// Preview/scaffold modules: admin-only (QA), hidden from everyone else.
	if (PREVIEW_KEYS.has(key)) {
		return canManageHR(role);
	}
	// Time clocks / biometric devices: HR/admin/manager/auditor/payroll only.
	if (key === "biometrics") {
		return canViewBiometrics(role);
	}
	// Geofencing: managers/HR who manage work sites, plus employees who check in.
	if (key === "geofencing") {
		return canViewGeofencing(role) || canUseGeofenceCheckIn(role);
	}
	// Setup center: admins (HR) and payroll managers who configure the tenant.
	if (key === "setup") {
		return canManageHR(role) || canViewPayroll(role);
	}
	// Inventory: gated by canViewInventory (admins/inventory_manager/stock_officer/
	// auditor) BEFORE the canViewPayroll see-all branch, so payroll managers — who
	// have NO inventory grant — don't see an entry that would only 403.
	if (key === "inventory") {
		return canViewInventory(role);
	}
	if (canViewPayroll(role)) {
		return true;
	}
	if (role === "inventory_manager" || role === "stock_officer") {
		return INVENTORY_VISIBLE_KEYS.has(key);
	}
	if (role === "employee") {
		return EMPLOYEE_VISIBLE_KEYS.has(key);
	}
	if (role === "manager") {
		return MANAGER_VISIBLE_KEYS.has(key);
	}
	if (role === "recruiter") {
		return RECRUITER_VISIBLE_KEYS.has(key);
	}
	if (role === "helpdesk_agent") {
		return HELPDESK_VISIBLE_KEYS.has(key);
	}
	if (role === "project_manager") {
		return PROJECT_MANAGER_VISIBLE_KEYS.has(key);
	}
	if (role === "sales_admin" || role === "sales_rep") {
		return SALES_VISIBLE_KEYS.has(key);
	}
	// Deny-by-default for any unrecognised/future role (the canViewPayroll
	// see-all branch above intentionally covers owner/admin/hr/payroll/auditor).
	return false;
}

function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
	const currentKey = useCurrentNavKey();
	const org = useContext(OrgCtx);
	const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
	// Real list of organizations this user belongs to (better-auth org plugin).
	// Drives the tenant switcher so every authorized workspace is selectable.
	const orgListQuery = authClient.useListOrganizations();
	const organizations = orgListQuery.data ?? [];
	const activeOrg = authClient.useActiveOrganization();
	const activeOrgId = activeOrg.data?.id ?? "";

	const switchOrg = async (organizationId: string) => {
		if (organizationId === activeOrgId) {
			setTenantMenuOpen(false);
			return;
		}
		setSwitchingOrgId(organizationId);
		try {
			await authClient.organization.setActive({ organizationId });
			// Hard reload to /app so every tenant-scoped query refetches cleanly.
			window.location.assign("/app");
		} catch {
			setSwitchingOrgId(null);
		}
	};
	// Settings Depth (Phase 22): the sidebar header consumes tenant branding for
	// display name + logo. Falls back to the org name + initials avatar when unset.
	const brandingQuery = useQuery(
		orpc.branding.get.queryOptions({ input: undefined })
	);
	const branding = brandingQuery.data as
		| { logoUrl: string | null; resolvedDisplayName: string }
		| undefined;
	const sidebarName = branding?.resolvedDisplayName || org.orgName;
	const sidebarLogoUrl = branding?.logoUrl ?? null;
	const initials = sidebarName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	const userInitials = org.userName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setTenantMenuOpen(false);
				setUserMenuOpen(false);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	return (
		<aside className="sidebar">
			{/* Tenant Switcher */}
			<div
				className="menu-root"
				style={{ borderBottom: "1px solid var(--line)" }}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: trigger wraps a nested avatar + multi-line labels (block content), so it stays a div with role + keyboard handlers rather than a <button>, which may not contain block content */}
				<div
					className="tenant-switcher"
					onClick={() => {
						setTenantMenuOpen(!tenantMenuOpen);
						setUserMenuOpen(false);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setTenantMenuOpen(!tenantMenuOpen);
							setUserMenuOpen(false);
						}
					}}
					role="button"
					tabIndex={0}
				>
					<div className="tenant-avatar">
						{sidebarLogoUrl ? (
							// biome-ignore lint/correctness/useImageSize: avatar logo is sized via its fixed-size container (100%/objectFit), not intrinsic width/height
							<img
								alt={`${sidebarName} logo`}
								src={sidebarLogoUrl}
								style={{
									width: "100%",
									height: "100%",
									objectFit: "cover",
									borderRadius: "inherit",
								}}
							/>
						) : (
							initials
						)}
					</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								fontWeight: 600,
								fontSize: "13.5px",
								letterSpacing: "-0.005em",
							}}
						>
							{sidebarName}
						</div>
						<div
							style={{
								fontSize: "11.5px",
								color: "var(--fg-3)",
								display: "flex",
								alignItems: "center",
								gap: "5px",
							}}
						>
							<span>{org.memberRole.replace(/_/g, " ")}</span>
						</div>
					</div>
					<ChevronDown size={14} style={{ color: "var(--fg-3)" }} />
				</div>
				<div
					className="menu"
					data-open={tenantMenuOpen ? "true" : "false"}
					data-side="bottom-start"
					style={{
						left: "14px",
						right: "14px",
						minWidth: 0,
						top: "calc(100% - 6px)",
					}}
				>
					<div className="menu-section">
						{organizations.length > 1 ? "Switch workspace" : "Workspace"}
					</div>
					{organizations.map((o) => {
						const isCurrent = o.id === activeOrgId;
						const oInitials = o.name
							.split(" ")
							.map((w) => w[0])
							.join("")
							.slice(0, 2)
							.toUpperCase();
						return (
							<button
								className="menu-item"
								disabled={switchingOrgId !== null}
								key={o.id}
								onClick={() => switchOrg(o.id)}
								type="button"
							>
								<span
									className="tenant-avatar"
									style={{
										width: "22px",
										height: "22px",
										borderRadius: "7px",
										fontSize: "10px",
									}}
								>
									{oInitials}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>{o.name}</span>
								{isCurrent ? <span className="menu-meta">current</span> : null}
								{switchingOrgId === o.id ? (
									<span className="menu-meta">switching…</span>
								) : null}
							</button>
						);
					})}
					<div className="menu-sep" />
					<Link
						className="menu-item"
						onClick={() => {
							setTenantMenuOpen(false);
							onNavigate?.();
						}}
						to="/app/settings"
					>
						<span className="menu-icon">
							<Settings size={14} />
						</span>
						<span>Workspace settings</span>
					</Link>
				</div>
			</div>

			{/* Nav Groups */}
			{NAV.map((group) => {
				const visibleItems = group.items.filter((item) =>
					isNavItemVisible(item.key, org.memberRole)
				);
				if (visibleItems.length === 0) {
					return null;
				}
				return (
					<div className="sidebar-section" key={group.group}>
						<div className="nav-group-label">{group.group}</div>
						{visibleItems.map((item) => (
							<Link
								className={`nav-item ${item.key === currentKey ? "active" : ""}`}
								key={item.key}
								onClick={() => onNavigate?.()}
								title={item.label}
								to={item.href}
							>
								<span className="nav-icon">
									<item.icon size={16} />
								</span>
								<span className="nav-label">{item.label}</span>
								{"preview" in item && item.preview ? (
									<span
										className="nav-preview-badge"
										style={{
											marginLeft: "auto",
											padding: "1px 6px",
											fontSize: "9px",
											fontWeight: 700,
											textTransform: "uppercase",
											letterSpacing: "0.05em",
											color: "var(--fg-3)",
											background: "var(--bg-3)",
											border: "1px solid var(--line)",
											borderRadius: "4px",
										}}
										title="Preview module — not backed by live data"
									>
										Preview
									</span>
								) : null}
							</Link>
						))}
					</div>
				);
			})}

			{/* User Menu */}
			<div
				className="menu-root"
				style={{ marginTop: "auto", borderTop: "1px solid var(--line)" }}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: trigger wraps a nested avatar + multi-line labels (block content), so it stays a div with role + keyboard handlers rather than a <button>, which may not contain block content */}
				<div
					onClick={() => {
						setUserMenuOpen(!userMenuOpen);
						setTenantMenuOpen(false);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setUserMenuOpen(!userMenuOpen);
							setTenantMenuOpen(false);
						}
					}}
					role="button"
					style={{
						padding: "14px 12px",
						display: "flex",
						alignItems: "center",
						gap: "10px",
						cursor: "pointer",
						transition: "background 120ms ease",
					}}
					tabIndex={0}
				>
					<div className="avatar" style={{ width: "30px", height: "30px" }}>
						{userInitials}
					</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontSize: "12.5px", fontWeight: 500 }}>
							{org.userName}
						</div>
						<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
							{org.memberRole.replace(/_/g, " ")} · {org.orgName.split(" ")[0]}
						</div>
					</div>
					<ChevronDown size={14} style={{ color: "var(--fg-3)" }} />
				</div>
				<div
					className="menu"
					data-open={userMenuOpen ? "true" : "false"}
					data-side="top-end"
					style={{
						left: "12px",
						right: "12px",
						minWidth: 0,
						bottom: "calc(100% - 4px)",
						transformOrigin: "bottom left",
					}}
				>
					<div
						style={{
							padding: "10px 10px 8px",
							borderBottom: "1px solid var(--line)",
							margin: "-2px -2px 4px",
						}}
					>
						<div style={{ fontSize: "12.5px", fontWeight: 500 }}>
							{org.userName}
						</div>
						<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
							{org.userEmail}
						</div>
					</div>
					<button
						className="menu-item"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<User size={14} />
						</span>{" "}
						Profile
					</button>
					<button
						className="menu-item"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Settings size={14} />
						</span>{" "}
						Account settings
					</button>
					<button
						className="menu-item"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Shield size={14} />
						</span>{" "}
						Security <span className="menu-meta">2FA on</span>
					</button>
					<div className="menu-sep" />
					<button
						className="menu-item"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Command size={14} />
						</span>{" "}
						Command palette{" "}
						<span className="menu-meta">
							<span className="kbd">⌘</span>
							<span className="kbd">K</span>
						</span>
					</button>
					<a
						className="menu-item"
						href="https://docs.heimdallone.com"
						onClick={() => setUserMenuOpen(false)}
						rel="noopener"
						target="_blank"
					>
						<span className="menu-icon">
							<Info size={14} />
						</span>{" "}
						Help &amp; docs
					</a>
					<div className="menu-sep" />
					<button
						className="menu-item danger"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<LogOut size={14} />
						</span>{" "}
						Sign out
					</button>
				</div>
			</div>
		</aside>
	);
}

function relativeTime(value: string | Date): string {
	const then = new Date(value).getTime();
	if (Number.isNaN(then)) {
		return "";
	}
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 60) {
		return "just now";
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes} min ago`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.round(hours / 24);
	if (days < 7) {
		return `${days}d ago`;
	}
	return new Date(value).toLocaleDateString();
}

function AppTopbar({
	onToggleSidebar,
	onOpenCommand,
}: {
	onOpenCommand: () => void;
	onToggleSidebar: () => void;
}) {
	const org = useContext(OrgCtx);
	const queryClient = useQueryClient();
	const [_theme, setTheme] = useState("dark");
	const [notifMenuOpen, setNotifMenuOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);

	const userInitials =
		org.userName
			.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() || "·";

	// Real per-user inbox (notifications subsystem, Phase 21D-F). No fake chrome.
	const unreadQuery = useQuery(orpc.notifications.unreadCount.queryOptions({}));
	const unreadCount = unreadQuery.data?.count ?? 0;
	const notifQuery = useQuery(
		orpc.notifications.list.queryOptions({ input: { limit: 8 } })
	);
	const notifications = notifQuery.data ?? [];
	const markAllRead = useMutation({
		mutationFn: () => client.notifications.markAllRead(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.notifications.key(),
			});
		},
	});

	useEffect(() => {
		const stored = document.documentElement.getAttribute("data-theme");
		if (stored) {
			setTheme(stored);
		}
	}, []);

	const closeAll = useCallback(() => {
		setNotifMenuOpen(false);
		setUserMenuOpen(false);
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				closeAll();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [closeAll]);

	return (
		<div className="topbar">
			<button
				aria-label="Toggle sidebar"
				className="sidebar-toggle"
				onClick={onToggleSidebar}
				title="Collapse / expand sidebar"
				type="button"
			>
				<PanelLeft size={16} />
			</button>
			<button className="cmd-trigger" onClick={onOpenCommand} type="button">
				<Search size={15} />
				<span>Find anyone, anything…</span>
				<span className="right">
					<span className="kbd">⌘</span>
					<span className="kbd">K</span>
				</span>
			</button>

			{/* Right side */}
			<div
				style={{
					marginLeft: "auto",
					display: "flex",
					alignItems: "center",
					gap: "6px",
				}}
			>
				<ThemeToggle />

				{/* Notifications */}
				<div className="menu-root">
					<button
						className="icon-btn"
						onClick={() => {
							setNotifMenuOpen(!notifMenuOpen);
							setUserMenuOpen(false);
						}}
						style={{ position: "relative" }}
						title="Notifications"
						type="button"
					>
						<Bell size={16} />
						{unreadCount > 0 ? (
							<span
								style={{
									position: "absolute",
									top: "7px",
									right: "7px",
									width: "6px",
									height: "6px",
									background: "var(--accent)",
									borderRadius: "50%",
									border: "1.5px solid var(--bg)",
								}}
							/>
						) : null}
					</button>
					<div
						className="menu menu-wide"
						data-open={notifMenuOpen ? "true" : "false"}
						data-side="bottom-end"
					>
						<div className="menu-header">
							<span className="ttl">Notifications</span>
							{unreadCount > 0 ? (
								<button
									className="clear"
									onClick={() => markAllRead.mutate()}
									style={{
										background: "none",
										border: 0,
										cursor: "pointer",
										font: "inherit",
										color: "inherit",
									}}
									type="button"
								>
									Mark all read
								</button>
							) : null}
						</div>
						{notifQuery.isError ? (
							<div className="menu-notif-item">
								<div>
									<div className="desc">
										Notifications are unavailable right now.
									</div>
								</div>
							</div>
						) : null}
						{!notifQuery.isError && notifications.length === 0 ? (
							<div className="menu-notif-item">
								<div>
									<div className="desc">
										{notifQuery.isLoading
											? "Loading…"
											: "You're all caught up."}
									</div>
								</div>
							</div>
						) : null}
						{notifications.length > 0
							? notifications.map((n) => (
									<div className="menu-notif-item" key={n.id}>
										<div className="icon info">
											<Bell size={13} />
										</div>
										<div>
											<div className="ttl">{n.title}</div>
											{n.body ? <div className="desc">{n.body}</div> : null}
											<div className="time">{relativeTime(n.createdAt)}</div>
										</div>
									</div>
								))
							: null}
						<div className="menu-sep" />
						<button
							className="menu-item"
							onClick={closeAll}
							style={{
								justifyContent: "center",
								color: "var(--accent)",
							}}
							type="button"
						>
							View all activity
						</button>
					</div>
				</div>

				<a
					className="icon-btn"
					href="https://docs.heimdallone.com"
					rel="noopener"
					target="_blank"
					title="Help & documentation"
				>
					<Info size={16} />
				</a>
				<div
					style={{
						width: "1px",
						height: "20px",
						background: "var(--line)",
						margin: "0 4px",
					}}
				/>

				{/* User Avatar */}
				<div className="menu-root">
					<button
						className="avatar"
						onClick={() => {
							setUserMenuOpen(!userMenuOpen);
							setNotifMenuOpen(false);
						}}
						style={{
							border: 0,
							cursor: "pointer",
							fontFamily: "inherit",
						}}
						title={org.userName}
						type="button"
					>
						{userInitials}
					</button>
					<div
						className="menu"
						data-open={userMenuOpen ? "true" : "false"}
						data-side="bottom-end"
					>
						<div
							style={{
								padding: "10px 10px 8px",
								borderBottom: "1px solid var(--line)",
								margin: "-2px -2px 4px",
							}}
						>
							<div style={{ fontSize: "12.5px", fontWeight: 500 }}>
								{org.userName}
							</div>
							<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
								{org.userEmail}
							</div>
						</div>
						<button className="menu-item" onClick={closeAll} type="button">
							<span className="menu-icon">
								<User size={14} />
							</span>{" "}
							Profile
						</button>
						<button className="menu-item" onClick={closeAll} type="button">
							<span className="menu-icon">
								<Settings size={14} />
							</span>{" "}
							Account settings
						</button>
						<button className="menu-item" onClick={closeAll} type="button">
							<span className="menu-icon">
								<Command size={14} />
							</span>{" "}
							Keyboard shortcuts{" "}
							<span className="menu-meta">
								<span className="kbd">?</span>
							</span>
						</button>
						<div className="menu-sep" />
						<button
							className="menu-item danger"
							onClick={closeAll}
							type="button"
						>
							<span className="menu-icon">
								<LogOut size={14} />
							</span>{" "}
							Sign out
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

const SIDEBAR_COLLAPSE_KEY = "hd-sidebar-collapsed";

function AppLayout() {
	const { session } = Route.useRouteContext();
	const activeOrg = authClient.useActiveOrganization();
	const [collapsed, setCollapsed] = useState(
		() =>
			typeof window !== "undefined" &&
			window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1"
	);
	const toggleCollapsed = () =>
		setCollapsed((prev) => {
			const next = !prev;
			window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
			return next;
		});
	// Mobile: the sidebar is an off-canvas drawer toggled by the topbar button.
	// On desktop the same button collapses the rail (existing behaviour).
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
	const handleToggleSidebar = () => {
		if (typeof window !== "undefined" && window.innerWidth <= 768) {
			setMobileNavOpen((prev) => !prev);
		} else {
			toggleCollapsed();
		}
	};
	const [orgCtx, setOrgCtx] = useState<OrgContext>({
		orgName: "Workspace",
		orgSlug: "",
		memberRole: "employee",
		userName: session?.user?.name ?? "User",
		userEmail: session?.user?.email ?? "",
	});
	const [cmdOpen, setCmdOpen] = useState(false);

	// Global ⌘K / Ctrl+K opens the command palette from anywhere in the app.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setCmdOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	const commandNavItems = useMemo<CommandNavItem[]>(() => {
		const out: CommandNavItem[] = [];
		for (const group of NAV) {
			for (const item of group.items) {
				if (isNavItemVisible(item.key, orgCtx.memberRole)) {
					out.push({
						key: item.key,
						label: item.label,
						group: group.group,
						href: item.href,
						icon: item.icon,
					});
				}
			}
		}
		return out;
	}, [orgCtx.memberRole]);

	useEffect(() => {
		if (activeOrg.data) {
			const member = activeOrg.data.members?.find(
				(m: { userId: string }) => m.userId === session?.user?.id
			);
			setOrgCtx({
				orgName: activeOrg.data.name ?? "Workspace",
				orgSlug: activeOrg.data.slug ?? "",
				memberRole: (member?.role as string) ?? "employee",
				userName: session?.user?.name ?? "User",
				userEmail: session?.user?.email ?? "",
			});
		}
	}, [activeOrg.data, session?.user]);

	return (
		<OrgCtx.Provider value={orgCtx}>
			<div
				className="app"
				data-collapsed={collapsed ? "true" : "false"}
				data-mobile-open={mobileNavOpen ? "true" : "false"}
			>
				<AppSidebar onNavigate={closeMobileNav} />
				{/* Mobile drawer backdrop — tap to dismiss the off-canvas sidebar. */}
				<button
					aria-label="Close navigation"
					className="sidebar-backdrop"
					onClick={closeMobileNav}
					tabIndex={-1}
					type="button"
				/>
				<main>
					<AppTopbar
						onOpenCommand={() => setCmdOpen(true)}
						onToggleSidebar={handleToggleSidebar}
					/>
					<FirstLoginModal />
					<Outlet />
				</main>
				<CommandPalette
					navItems={commandNavItems}
					onClose={() => setCmdOpen(false)}
					open={cmdOpen}
				/>
			</div>
		</OrgCtx.Provider>
	);
}
