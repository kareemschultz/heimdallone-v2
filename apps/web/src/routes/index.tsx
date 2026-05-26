import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
	component: MarketingLanding,
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

function MarketingLanding() {
	return (
		<div style={{ overflowX: "hidden" }}>
			{/* Marketing Nav */}
			<nav className="m-nav">
				<div className="container m-nav-inner">
					<Link className="h-logo" to="/">
						<span className="h-logo-mark">
							<HeimdallLogo size={22} />
						</span>
						<span>Heimdallone</span>
					</Link>
					<div className="m-nav-links">
						<a className="active" href="#features">
							Product
						</a>
						<a href="#features">Features</a>
						<a href="#payroll">Payroll</a>
						<Link to="/pricing">Pricing</Link>
						<Link to="/docs">Docs</Link>
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
			<section
				className="hero"
				style={{
					position: "relative",
					padding: "110px 0 60px",
					overflow: "hidden",
				}}
			>
				<div
					className="hero-bg"
					style={{
						position: "absolute",
						inset: 0,
						overflow: "hidden",
						pointerEvents: "none",
						background: "var(--bg)",
					}}
				>
					<div className="aurora" />
					<div
						className="bg-grid-anim"
						style={{ position: "absolute", inset: 0 }}
					/>
				</div>
				<div
					className="container"
					style={{ position: "relative", zIndex: 1, textAlign: "center" }}
				>
					<div className="eyebrow" style={{ marginBottom: "20px" }}>
						Workforce command center
					</div>
					<h1
						style={{
							fontSize: "clamp(48px, 7vw, 88px)",
							lineHeight: 0.98,
							letterSpacing: "-0.045em",
							fontWeight: 600,
							maxWidth: "900px",
							margin: "0 auto",
						}}
					>
						The operating system
						<br />
						for{" "}
						<em
							style={{
								fontFamily: '"Inter", serif',
								fontStyle: "italic",
								fontWeight: 500,
								color: "var(--accent)",
							}}
						>
							workforce
						</em>{" "}
						operations.
					</h1>
					<p
						style={{
							maxWidth: "620px",
							margin: "28px auto 0",
							fontSize: "18px",
							lineHeight: 1.45,
							color: "var(--fg-2)",
						}}
					>
						Multi-country payroll, attendance, compliance, and HR — unified in
						one command center. Caribbean-first. Audit-sealed. Always watching.
					</p>
					<div
						style={{
							display: "flex",
							gap: "12px",
							justifyContent: "center",
							marginTop: "36px",
						}}
					>
						<Link className="btn btn-primary btn-lg" to="/app">
							Start free trial <ArrowRight size={14} />
						</Link>
						<a className="btn btn-outline btn-lg" href="#features">
							See features
						</a>
					</div>
				</div>
			</section>

			{/* Stats strip */}
			<section
				style={{
					borderTop: "1px solid var(--line)",
					borderBottom: "1px solid var(--line)",
					padding: "40px 0",
				}}
			>
				<div
					className="container"
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(4, 1fr)",
						gap: "32px",
						textAlign: "center",
					}}
				>
					<div className="stat" style={{ alignItems: "center" }}>
						<div className="stat-value">7</div>
						<div className="stat-label">Countries supported</div>
					</div>
					<div className="stat" style={{ alignItems: "center" }}>
						<div className="stat-value">12,000+</div>
						<div className="stat-label">Employees managed</div>
					</div>
					<div className="stat" style={{ alignItems: "center" }}>
						<div className="stat-value">99.99%</div>
						<div className="stat-label">Uptime SLA</div>
					</div>
					<div className="stat" style={{ alignItems: "center" }}>
						<div className="stat-value">&lt;3s</div>
						<div className="stat-label">Payroll compute</div>
					</div>
				</div>
			</section>

			{/* Features Section */}
			<section className="section" id="features">
				<div className="container">
					<div className="section-eyebrow">Platform</div>
					<h2
						style={{
							fontSize: "clamp(36px, 5vw, 56px)",
							lineHeight: 1.02,
							letterSpacing: "-0.035em",
						}}
					>
						Everything you need to run
						<br />
						multi-country operations.
					</h2>
					<p className="section-sub">
						From payroll to compliance, attendance to recruitment — Heimdallone
						brings every workforce function into a single, auditable command
						center.
					</p>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(3, 1fr)",
							gap: "16px",
							marginTop: "56px",
						}}
					>
						{[
							{
								title: "Multi-country payroll",
								desc: "Caribbean-first engine with country-specific statutory deductions, NIS, PAYE, and employer contributions.",
							},
							{
								title: "Attendance & biometrics",
								desc: "Geofenced check-ins, biometric device integration, overtime tracking, and exception queues.",
							},
							{
								title: "Compliance & audit",
								desc: "Hash-chained event ledger, SOC 2 evidence packs, and real-time risk scoring.",
							},
							{
								title: "Employee management",
								desc: "Full lifecycle from recruitment through onboarding, performance, and offboarding.",
							},
							{
								title: "Leave management",
								desc: "Configurable leave types, team calendars, approval workflows, and statutory leave packs.",
							},
							{
								title: "Multi-tenant",
								desc: "Organization-scoped data isolation with role-based access and cross-tenant platform admin.",
							},
						].map((feat) => (
							<div
								className="card card-pad spotlight"
								key={feat.title}
								style={{ cursor: "default" }}
							>
								<h4 style={{ marginBottom: "8px" }}>{feat.title}</h4>
								<p
									style={{
										fontSize: "13.5px",
										lineHeight: 1.5,
										color: "var(--fg-2)",
									}}
								>
									{feat.desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section style={{ padding: "96px 0" }}>
				<div className="container" style={{ textAlign: "center" }}>
					<div
						className="card card-pad-lg"
						style={{
							maxWidth: "800px",
							margin: "0 auto",
							background:
								"linear-gradient(135deg, var(--accent-soft), var(--bg-1))",
							borderRadius: "28px",
						}}
					>
						<div className="eyebrow" style={{ marginBottom: "16px" }}>
							Ready to start?
						</div>
						<h2
							style={{
								fontSize: "36px",
								letterSpacing: "-0.032em",
								marginBottom: "12px",
							}}
						>
							Take control of your workforce.
						</h2>
						<p
							style={{
								maxWidth: "480px",
								margin: "0 auto 28px",
								fontSize: "16px",
								color: "var(--fg-2)",
							}}
						>
							Start your free trial today. No credit card required.
							Caribbean-first, but built for the world.
						</p>
						<Link className="btn btn-primary btn-lg" to="/app">
							Get started free <ArrowRight size={14} />
						</Link>
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
							<a href="#features">Features</a>
							<a href="#payroll">Payroll</a>
							<a href="#compliance">Compliance</a>
							<a href="#integrations">Integrations</a>
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
