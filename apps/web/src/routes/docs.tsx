import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	ArrowUpRight,
	Clock,
	Database,
	FileText,
	Globe,
	Key,
	Moon,
	Search,
	Shield,
	Sun,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/docs")({
	component: DocsPage,
});

function HeimdallLogo({ size = 22 }: { size?: number }) {
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
		} catch {}
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

const CATEGORIES = [
	{
		icon: Zap,
		title: "Getting Started",
		desc: "Installation, first run, and quick start guide",
		count: 8,
	},
	{
		icon: Users,
		title: "Employee Management",
		desc: "Profiles, departments, roles, and employment lifecycle",
		count: 14,
	},
	{
		icon: Wallet,
		title: "Payroll",
		desc: "Pay runs, statutory deductions, multi-country configuration",
		count: 22,
	},
	{
		icon: Clock,
		title: "Attendance",
		desc: "Check-in/out, biometrics, geofencing, overtime",
		count: 11,
	},
	{
		icon: Globe,
		title: "Countries & Tax",
		desc: "Country profiles, PAYE, NIS, tax brackets",
		count: 7,
	},
	{
		icon: Shield,
		title: "Compliance",
		desc: "Audit ledger, evidence packs, hash chain, SOC 2",
		count: 9,
	},
	{
		icon: Key,
		title: "Authentication",
		desc: "Better Auth, SSO, SAML, passkeys, RBAC",
		count: 12,
	},
	{
		icon: Database,
		title: "API Reference",
		desc: "oRPC procedures, schemas, and type-safe clients",
		count: 18,
	},
	{
		icon: FileText,
		title: "Integrations",
		desc: "Horilla sync, accounting exports, webhooks",
		count: 6,
	},
];

const QUICK_TAGS = [
	"Quick start",
	"Payroll",
	"Attendance",
	"API",
	"Auth",
	"Countries",
	"Compliance",
];

function DocsPage() {
	return (
		<div>
			{/* Nav */}
			<nav className="m-nav">
				<div className="container m-nav-inner">
					<Link className="h-logo" to="/">
						<span className="h-logo-mark">
							<HeimdallLogo size={22} />
						</span>
						<span>Heimdallone</span>
					</Link>
					<div className="m-nav-links">
						<Link to="/">Product</Link>
						<a href="#">Features</a>
						<Link to="/pricing">Pricing</Link>
						<Link className="active" to="/docs">
							Docs
						</Link>
					</div>
					<div className="m-nav-actions">
						<ThemeToggle />
						<Link className="btn btn-ghost" to="/login">
							Sign in
						</Link>
						<Link className="btn btn-primary" to="/app">
							Get started <ArrowRight size={13} />
						</Link>
					</div>
				</div>
			</nav>

			{/* Hero */}
			<div className="m-page-hero">
				<div className="glow" />
				<div className="container" style={{ position: "relative", zIndex: 1 }}>
					<div className="eyebrow">Documentation</div>
					<h1>
						Learn to build with <em>Heimdallone</em>.
					</h1>
					<p>
						Guides, references, and examples for every module in the platform.
					</p>
					<div
						style={{
							maxWidth: "520px",
							margin: "32px auto 0",
							position: "relative",
						}}
					>
						<div
							style={{
								position: "absolute",
								top: "50%",
								left: "16px",
								transform: "translateY(-50%)",
								color: "var(--fg-4)",
							}}
						>
							<Search size={16} />
						</div>
						<input
							className="input"
							placeholder="Search documentation…"
							style={{
								paddingLeft: "40px",
								height: "44px",
								borderRadius: "99px",
								fontSize: "14px",
							}}
							type="text"
						/>
					</div>
					<div
						style={{
							display: "flex",
							gap: "6px",
							justifyContent: "center",
							marginTop: "16px",
							flexWrap: "wrap",
						}}
					>
						{QUICK_TAGS.map((tag) => (
							<button
								className="filter-chip"
								key={tag}
								style={{ height: "26px", fontSize: "11.5px" }}
								type="button"
							>
								{tag}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Categories Grid */}
			<section style={{ padding: "64px 0 96px" }}>
				<div className="container">
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(3, 1fr)",
							gap: "16px",
						}}
					>
						{CATEGORIES.map((cat) => (
							<div
								className="card card-pad spotlight"
								key={cat.title}
								style={{ cursor: "pointer" }}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "10px",
										marginBottom: "10px",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: "32px",
											height: "32px",
											background: "var(--accent-soft)",
											borderRadius: "9px",
											color: "var(--accent)",
										}}
									>
										<cat.icon size={16} />
									</div>
									<h4>{cat.title}</h4>
									<span className="badge" style={{ marginLeft: "auto" }}>
										<span className="mono">{cat.count}</span>
									</span>
								</div>
								<p
									style={{
										fontSize: "13px",
										lineHeight: 1.5,
										color: "var(--fg-2)",
									}}
								>
									{cat.desc}
								</p>
								<div
									style={{
										marginTop: "12px",
										fontSize: "12.5px",
										color: "var(--accent)",
										display: "flex",
										alignItems: "center",
										gap: "4px",
									}}
								>
									Browse docs <ArrowUpRight size={12} />
								</div>
							</div>
						))}
					</div>

					{/* Help row */}
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(3, 1fr)",
							gap: "16px",
							marginTop: "48px",
						}}
					>
						{[
							{
								title: "Community",
								desc: "Join the Discord for questions, feature requests, and discussion.",
								action: "Join Discord",
							},
							{
								title: "Support",
								desc: "Enterprise customers get priority support with guaranteed SLAs.",
								action: "Contact support",
							},
							{
								title: "Implementation",
								desc: "Need help migrating? Our team can guide the setup.",
								action: "Book a call",
							},
						].map((item) => (
							<div
								className="card card-pad"
								key={item.title}
								style={{ textAlign: "center" }}
							>
								<h4 style={{ marginBottom: "6px" }}>{item.title}</h4>
								<p
									style={{
										fontSize: "13px",
										color: "var(--fg-3)",
										marginBottom: "16px",
									}}
								>
									{item.desc}
								</p>
								<button className="btn btn-outline btn-sm" type="button">
									{item.action} <ArrowUpRight size={12} />
								</button>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="footer">
				<div className="container">
					<div className="footer-grid">
						<div className="footer-col">
							<Link className="h-logo" style={{ marginBottom: "16px" }} to="/">
								<span className="h-logo-mark">
									<HeimdallLogo size={22} />
								</span>
								<span>Heimdallone</span>
							</Link>
							<p
								style={{
									fontSize: "13px",
									color: "var(--fg-3)",
									maxWidth: "280px",
									lineHeight: 1.5,
								}}
							>
								The workforce command center for multi-country operations.
							</p>
						</div>
						<div className="footer-col">
							<h5>Product</h5>
							<a href="#">Features</a>
							<a href="#">Payroll</a>
							<a href="#">Compliance</a>
							<a href="#">Integrations</a>
						</div>
						<div className="footer-col">
							<h5>Solutions</h5>
							<a href="#">For operations</a>
							<a href="#">For finance</a>
							<a href="#">For HR leaders</a>
							<a href="#">Multi-tenant</a>
						</div>
						<div className="footer-col">
							<h5>Resources</h5>
							<Link to="/docs">Documentation</Link>
							<a href="#">Changelog</a>
							<a href="#">Status</a>
							<a href="#">Security</a>
						</div>
						<div className="footer-col">
							<h5>Company</h5>
							<a href="#">About</a>
							<a href="#">Careers</a>
							<a href="#">Contact</a>
							<a href="#">Privacy</a>
						</div>
					</div>
					<div className="footer-meta">
						<div>© 2026 Heimdallone. All rights reserved.</div>
						<div className="mono">v0.4.0-preview · build #1148</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
