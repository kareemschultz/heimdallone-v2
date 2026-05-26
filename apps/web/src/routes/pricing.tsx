import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/pricing")({
	component: PricingPage,
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

const PLANS = [
	{
		name: "Starter",
		price: "$49",
		desc: "For small teams getting started",
		features: [
			"Up to 50 employees",
			"1 country",
			"Email support",
			"Basic payroll",
			"Attendance tracking",
		],
	},
	{
		name: "Growth",
		price: "$149",
		desc: "For growing multi-country teams",
		popular: true,
		features: [
			"Up to 500 employees",
			"4 countries",
			"Priority support",
			"Full payroll engine",
			"Compliance & audit",
			"Biometric integration",
			"Custom workflows",
		],
	},
	{
		name: "Enterprise",
		price: "Custom",
		desc: "For large-scale operations",
		features: [
			"Unlimited employees",
			"Unlimited countries",
			"Dedicated support",
			"Full platform access",
			"SLA guarantee",
			"SSO & SAML",
			"Custom integrations",
			"On-prem option",
		],
	},
	{
		name: "Self-hosted",
		price: "$299/mo",
		desc: "Run on your infrastructure",
		features: [
			"Unlimited employees",
			"Unlimited countries",
			"Source access",
			"Full platform",
			"Your data, your servers",
			"Community support",
		],
	},
];

function PricingPage() {
	const [annual, setAnnual] = useState(false);

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
						<Link className="active" to="/pricing">
							Pricing
						</Link>
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
			<div className="m-page-hero">
				<div className="glow" />
				<div className="container" style={{ position: "relative", zIndex: 1 }}>
					<div className="eyebrow">Pricing</div>
					<h1>
						Simple, transparent <em>pricing</em>.
					</h1>
					<p>
						Start free. Scale as you grow. No hidden fees, no per-payroll
						charges.
					</p>
					<div style={{ marginTop: "28px" }}>
						<div className="segmented">
							<button
								className={annual ? "" : "active"}
								onClick={() => setAnnual(false)}
								type="button"
							>
								Monthly
							</button>
							<button
								className={annual ? "active" : ""}
								onClick={() => setAnnual(true)}
								type="button"
							>
								Annual (save 20%)
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Plans */}
			<section style={{ padding: "64px 0 96px" }}>
				<div className="container">
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(4, 1fr)",
							gap: "16px",
						}}
					>
						{PLANS.map((plan) => (
							<div
								className={`card card-pad ${plan.popular ? "beam-host beam-always" : ""}`}
								key={plan.name}
								style={{ display: "flex", flexDirection: "column" }}
							>
								{plan.popular && (
									<div
										className="badge badge-accent"
										style={{ alignSelf: "flex-start", marginBottom: "12px" }}
									>
										Most popular
									</div>
								)}
								<h3 style={{ marginBottom: "4px" }}>{plan.name}</h3>
								<p
									style={{
										fontSize: "13px",
										color: "var(--fg-3)",
										marginBottom: "16px",
									}}
								>
									{plan.desc}
								</p>
								<div
									style={{
										fontFamily: '"JetBrains Mono", monospace',
										fontSize: "32px",
										fontWeight: 600,
										letterSpacing: "-0.025em",
										marginBottom: "4px",
									}}
								>
									{plan.price}
								</div>
								{plan.price !== "Custom" && (
									<div
										style={{
											fontSize: "12px",
											color: "var(--fg-3)",
											marginBottom: "20px",
										}}
									>
										per month{annual ? ", billed annually" : ""}
									</div>
								)}
								{plan.price === "Custom" && (
									<div
										style={{
											fontSize: "12px",
											color: "var(--fg-3)",
											marginBottom: "20px",
										}}
									>
										tailored to your needs
									</div>
								)}
								<button
									className={`btn ${plan.popular ? "btn-primary" : "btn-outline"}`}
									style={{ width: "100%", marginBottom: "20px" }}
									type="button"
								>
									{plan.price === "Custom"
										? "Contact sales"
										: "Start free trial"}
								</button>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "8px",
									}}
								>
									{plan.features.map((f) => (
										<div
											key={f}
											style={{
												display: "flex",
												gap: "8px",
												alignItems: "center",
												fontSize: "13px",
												color: "var(--fg-2)",
											}}
										>
											<Check
												size={14}
												style={{ color: "var(--success)", flexShrink: 0 }}
											/>
											{f}
										</div>
									))}
								</div>
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
