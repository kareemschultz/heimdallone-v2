import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useMatches,
} from "@tanstack/react-router";
import {
	AlertTriangle,
	Bell,
	Briefcase,
	Calendar,
	Check,
	ChevronDown,
	Clock,
	Command,
	ExternalLink,
	FileText,
	Globe,
	Info,
	LayoutDashboard,
	LogOut,
	Moon,
	Package,
	Play,
	Plus,
	Search,
	Settings,
	Shield,
	ShieldCheck,
	Sun,
	User,
	Users,
	Wallet,
} from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { canViewPayroll } from "@/lib/rbac";

interface OrgContext {
	memberRole: string;
	orgName: string;
	orgSlug: string;
	userEmail: string;
	userName: string;
}

export const OrgCtx = createContext<OrgContext>({
	orgName: "Atlas Shipping",
	orgSlug: "atlas-shipping",
	memberRole: "employee",
	userName: "User",
	userEmail: "",
});

const EMPLOYEE_VISIBLE_KEYS = new Set([
	"overview",
	"contracts",
	"leave",
	"documents",
	"settings",
]);
const MANAGER_VISIBLE_KEYS = new Set([
	"overview",
	"employees",
	"contracts",
	"attendance",
	"leave",
	"documents",
	"settings",
]);
const RECRUITER_VISIBLE_KEYS = new Set([
	"overview",
	"employees",
	"recruitment",
	"onboarding",
	"documents",
	"settings",
]);
const HELPDESK_VISIBLE_KEYS = new Set([
	"overview",
	"helpdesk",
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

const NAV = [
	{
		group: "Operate",
		items: [
			{
				key: "overview",
				label: "Overview",
				icon: LayoutDashboard,
				href: "/app",
			},
			{
				key: "employees",
				label: "Employees",
				icon: Users,
				href: "/app/employees",
				meta: "1,284",
			},
			{
				key: "attendance",
				label: "Attendance",
				icon: Clock,
				href: "/app/attendance",
			},
			{
				key: "leave",
				label: "Leave",
				icon: Calendar,
				href: "/app/leave",
				meta: "12",
			},
			{
				key: "payroll",
				label: "Payroll",
				icon: Wallet,
				href: "/app/payroll",
				meta: "●",
				metaAccent: true,
			},
			{
				key: "contracts",
				label: "Contracts",
				icon: FileText,
				href: "/app/contracts",
			},
			{
				key: "assets",
				label: "Assets",
				icon: Package,
				href: "/app/assets",
			},
		],
	},
	{
		group: "Govern",
		items: [
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
				meta: "3",
			},
			{
				key: "documents",
				label: "Documents",
				icon: FileText,
				href: "/app/documents",
			},
			{
				key: "clients",
				label: "Clients",
				icon: Briefcase,
				href: "/app/clients",
			},
		],
	},
	{
		group: "Workspace",
		items: [
			{
				key: "settings",
				label: "Settings",
				icon: Settings,
				href: "/app/settings",
			},
		],
	},
] as const;

function _HeimdallLogo({ size = 22 }: { size?: number }) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height={size}
			viewBox="0 0 32 32"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect fill="currentColor" height="26" rx="1" width="4.2" x="4" y="3" />
			<rect fill="currentColor" height="26" rx="1" width="4.2" x="23.8" y="3" />
			<path
				d="M6 16 Q16 9 26 16 Q16 23 6 16 Z"
				fill="currentColor"
				opacity="0.95"
			/>
			<ellipse cx="16" cy="16" fill="var(--bg, #0a0d12)" rx="3.2" ry="3.2" />
			<circle cx="16" cy="16" fill="currentColor" r="1.4" />
		</svg>
	);
}

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

function isNavItemVisible(key: string, role: string): boolean {
	if (canViewPayroll(role)) {
		return true;
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
	return true;
}

function AppSidebar() {
	const currentKey = useCurrentNavKey();
	const org = useContext(OrgCtx);
	const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const initials = org.orgName
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
					<div className="tenant-avatar">{initials}</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								fontWeight: 600,
								fontSize: "13.5px",
								letterSpacing: "-0.005em",
							}}
						>
							{org.orgName}
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
							<span>GY</span>
							<span>TT</span>
							<span>BB</span>
							<span style={{ color: "var(--fg-4)" }}>+ 2 more</span>
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
					<div className="menu-section">Switch workspace</div>
					<button
						className="menu-item"
						onClick={() => setTenantMenuOpen(false)}
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
							AS
						</span>
						<span style={{ flex: 1 }}>Atlas Shipping</span>
						<span className="menu-meta">current</span>
					</button>
					<button
						className="menu-item"
						onClick={() => setTenantMenuOpen(false)}
						type="button"
					>
						<span
							className="tenant-avatar"
							style={{
								width: "22px",
								height: "22px",
								borderRadius: "7px",
								fontSize: "10px",
								background: "linear-gradient(135deg, #4f8dff, #7aa9ff)",
								color: "#fff",
							}}
						>
							MG
						</span>
						<span style={{ flex: 1 }}>Mahaica Group</span>
						<span className="menu-meta">328 emp</span>
					</button>
					<button
						className="menu-item"
						onClick={() => setTenantMenuOpen(false)}
						type="button"
					>
						<span
							className="tenant-avatar"
							style={{
								width: "22px",
								height: "22px",
								borderRadius: "7px",
								fontSize: "10px",
								background: "linear-gradient(135deg, #3ddc97, #5fe6ad)",
								color: "#0a1813",
							}}
						>
							TC
						</span>
						<span style={{ flex: 1 }}>Trident Capital</span>
						<span className="menu-meta">84 emp</span>
					</button>
					<div className="menu-sep" />
					<button
						className="menu-item"
						onClick={() => setTenantMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Plus size={14} />
						</span>
						<span>Create workspace</span>
					</button>
					<button
						className="menu-item"
						onClick={() => setTenantMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Settings size={14} />
						</span>
						<span>Workspace settings</span>
					</button>
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
								to={item.href}
							>
								<span className="nav-icon">
									<item.icon size={16} />
								</span>
								<span>{item.label}</span>
								{item.meta && (
									<span
										className="nav-meta"
										style={
											"metaAccent" in item && item.metaAccent
												? { color: "var(--accent)" }
												: undefined
										}
									>
										{item.meta}
									</span>
								)}
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
					<button
						className="menu-item"
						onClick={() => setUserMenuOpen(false)}
						type="button"
					>
						<span className="menu-icon">
							<Info size={14} />
						</span>{" "}
						Help &amp; docs
					</button>
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

function AppTopbar() {
	const [_theme, setTheme] = useState("dark");
	const [syncMenuOpen, setSyncMenuOpen] = useState(false);
	const [notifMenuOpen, setNotifMenuOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);

	useEffect(() => {
		const stored = document.documentElement.getAttribute("data-theme");
		if (stored) {
			setTheme(stored);
		}
	}, []);

	const _toggleTheme = (t: string) => {
		setTheme(t);
		document.documentElement.setAttribute("data-theme", t);
		try {
			localStorage.setItem("heimdall.theme", t);
		} catch {
			// localStorage may be unavailable (private mode); ignore persistence failure
		}
	};

	const closeAll = useCallback(() => {
		setSyncMenuOpen(false);
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
			<button className="cmd-trigger" type="button">
				<Search size={15} />
				<span>Find anyone, anything…</span>
				<span className="right">
					<span className="kbd">⌘</span>
					<span className="kbd">K</span>
				</span>
			</button>

			{/* HR Sync Badge */}
			<div
				className="menu-root"
				style={{ display: "flex", alignItems: "center", gap: "6px" }}
			>
				<button
					className="badge badge-success"
					onClick={() => {
						setSyncMenuOpen(!syncMenuOpen);
						setNotifMenuOpen(false);
						setUserMenuOpen(false);
					}}
					style={{
						border: 0,
						cursor: "pointer",
						fontFamily: "inherit",
						height: "26px",
						padding: "0 10px",
					}}
					title="Last HR data sync — sample data only in this demo build. Click for details."
					type="button"
				>
					<span className="badge-dot" />
					Last HR sync · 14:42
				</button>
				<div
					className="menu"
					data-open={syncMenuOpen ? "true" : "false"}
					data-side="bottom-start"
					style={{ minWidth: "280px" }}
				>
					<div className="menu-section">Horilla HRMS sync</div>
					<div style={{ padding: "8px 10px" }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								fontSize: "12.5px",
							}}
						>
							<span style={{ color: "var(--fg-2)" }}>Status</span>
							<span className="badge badge-success" style={{ height: "18px" }}>
								<span className="badge-dot" />
								Operational
							</span>
						</div>
						<div className="kv" style={{ padding: "6px 0" }}>
							<span className="kv-k">Last full sync</span>
							<span className="kv-v">14:42:08</span>
						</div>
						<div className="kv" style={{ padding: "6px 0" }}>
							<span className="kv-k">Records ingested</span>
							<span className="kv-v">1,284</span>
						</div>
						<div className="kv" style={{ padding: "6px 0" }}>
							<span className="kv-k">Next sync</span>
							<span className="kv-v">15:00</span>
						</div>
					</div>
					<div className="menu-sep" />
					<button className="menu-item" onClick={closeAll} type="button">
						<span className="menu-icon">
							<Play size={14} />
						</span>{" "}
						Sync now
					</button>
					<button className="menu-item" onClick={closeAll} type="button">
						<span className="menu-icon">
							<ExternalLink size={14} />
						</span>{" "}
						Open Horilla admin
					</button>
				</div>
			</div>

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
							setSyncMenuOpen(false);
							setUserMenuOpen(false);
						}}
						style={{ position: "relative" }}
						title="Notifications"
						type="button"
					>
						<Bell size={16} />
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
					</button>
					<div
						className="menu menu-wide"
						data-open={notifMenuOpen ? "true" : "false"}
						data-side="bottom-end"
					>
						<div className="menu-header">
							<span className="ttl">Notifications</span>
							<span className="clear">Mark all read</span>
						</div>
						<div className="menu-notif-item">
							<div className="icon warn">
								<AlertTriangle size={13} />
							</div>
							<div>
								<div className="ttl">NIS rate change · Guyana</div>
								<div className="desc">
									Profile gy.v2026.2 staged. Effective 1 Oct.
								</div>
								<div className="time">12 min ago</div>
							</div>
						</div>
						<div className="menu-notif-item">
							<div className="icon info">
								<Info size={13} />
							</div>
							<div>
								<div className="ttl">14 contracts renew this quarter</div>
								<div className="desc">Renewal pack ready for review.</div>
								<div className="time">38 min ago</div>
							</div>
						</div>
						<div className="menu-notif-item">
							<div className="icon success">
								<Check size={13} />
							</div>
							<div>
								<div className="ttl">Barbados pay run sealed</div>
								<div className="desc">BBD 412,600 · 88 employees · by you</div>
								<div className="time">14:08</div>
							</div>
						</div>
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

				<button className="icon-btn" title="Help" type="button">
					<Info size={16} />
				</button>
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
							setSyncMenuOpen(false);
							setNotifMenuOpen(false);
						}}
						style={{
							border: 0,
							cursor: "pointer",
							fontFamily: "inherit",
						}}
						title="Maya Persaud"
						type="button"
					>
						MP
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
								Maya Persaud
							</div>
							<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
								maya@atlas-shipping.com
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

function AppLayout() {
	const { session } = Route.useRouteContext();
	const activeOrg = authClient.useActiveOrganization();
	const [orgCtx, setOrgCtx] = useState<OrgContext>({
		orgName: "Atlas Shipping",
		orgSlug: "atlas-shipping",
		memberRole: "employee",
		userName: session?.user?.name ?? "User",
		userEmail: session?.user?.email ?? "",
	});

	useEffect(() => {
		if (activeOrg.data) {
			const member = activeOrg.data.members?.find(
				(m: { userId: string }) => m.userId === session?.user?.id
			);
			setOrgCtx({
				orgName: activeOrg.data.name ?? "Atlas Shipping",
				orgSlug: activeOrg.data.slug ?? "atlas-shipping",
				memberRole: (member?.role as string) ?? "employee",
				userName: session?.user?.name ?? "User",
				userEmail: session?.user?.email ?? "",
			});
		}
	}, [activeOrg.data, session?.user]);

	return (
		<OrgCtx.Provider value={orgCtx}>
			<div className="app">
				<AppSidebar />
				<main>
					<AppTopbar />
					<Outlet />
				</main>
			</div>
		</OrgCtx.Provider>
	);
}
