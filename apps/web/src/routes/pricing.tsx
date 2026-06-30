import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Moon, Sun, X } from "lucide-react";
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

const FAQS = [
	{
		q: "What counts as an employee for billing?",
		a: "Anyone with an active employment record in the period — including contractors and part-timers if you're paying them through Heimdallone. Inactive, archived, and offboarded employees never count, even if their historical records remain.",
	},
	{
		q: "Can we add country tax engines as we expand?",
		a: "Yes. Each plan includes a soft cap on countries, but you can add additional country profiles à la carte. New jurisdictions take effect on the next pay period and inherit your existing approval policy.",
	},
	{
		q: "Does the price include payroll tax calculation?",
		a: "Yes. Every plan ships with the country tax engines included for that tier — PAYE bands, NIS rates, statutory deductions and employer contributions — versioned and updated as gazettes are published.",
	},
	{
		q: "Do we keep our existing Horilla deployment?",
		a: "Yes. Heimdallone reads from and writes to your existing Horilla HRMS. Self-hosted plans run entirely inside your VPC. There's no migration or data export needed.",
	},
	{
		q: "What happens at renewal?",
		a: "Annual plans renew at the same per-employee rate unless we notify you of a change at least 60 days before renewal. Month-to-month plans can be cancelled any time and you only pay for the current period.",
	},
	{
		q: "Is there a free trial?",
		a: "Yes — 14 days, no credit card required, full Growth feature set. After trial, your data is preserved for 60 days while you decide. Self-hosted trials are scoped per deployment; reach out for details.",
	},
];

function PricingPage() {
	const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
	const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());

	const toggleFaq = (i: number) => {
		setOpenFaqs((prev) => {
			const next = new Set(prev);
			if (next.has(i)) {
				next.delete(i);
			} else {
				next.add(i);
			}
			return next;
		});
	};

	const starterPrice = billing === "monthly" ? "6" : "5";
	const growthPrice = billing === "monthly" ? "14" : "11";

	useEffect(() => {
		const revealEls = document.querySelectorAll<HTMLElement>(".reveal");
		if (!revealEls.length) {
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add("in");
						io.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.15 }
		);
		for (const el of revealEls) {
			io.observe(el);
		}
		return () => io.disconnect();
	}, []);

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
						<a href="#">Payroll</a>
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
			<section className="m-page-hero">
				<div className="glow" />
				<div className="container" style={{ position: "relative", zIndex: 1 }}>
					<div className="eyebrow">Pricing</div>
					<h1>
						Built for the work that <em>scales</em> with you.
					</h1>
					<p>
						Transparent plans across every country you operate in. Start small,
						expand without re-platforming.
					</p>
					<div className="billing-toggle">
						<button
							className={billing === "monthly" ? "active" : ""}
							onClick={() => setBilling("monthly")}
							type="button"
						>
							Monthly
						</button>
						<button
							className={billing === "annual" ? "active" : ""}
							onClick={() => setBilling("annual")}
							type="button"
						>
							Annual <span className="save-pill">−20%</span>
						</button>
					</div>
				</div>
			</section>

			{/* Plans */}
			<section className="section" style={{ paddingTop: "56px" }}>
				<div className="container">
					<div className="plans">
						{/* Starter */}
						<div className="plan">
							<div className="plan-head">
								<span className="plan-name">Starter</span>
								<span className="plan-desc">
									For single-country teams getting out of spreadsheets.
								</span>
							</div>
							<div className="plan-price">
								<span className="cur">$</span>
								<span className="num">{starterPrice}</span>
								<span className="per">/ employee / mo</span>
							</div>
							<Link className="btn btn-outline plan-cta" to="/login">
								Start free trial
							</Link>
							<div className="plan-features">
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										Up to <span className="v">50</span> employees
									</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										<span className="v">1</span> country tax engine
									</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>HR core · attendance · leave</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Single-step approvals</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Standard payslips &amp; CSV exports</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Email support · 24h SLA</span>
								</div>
							</div>
						</div>

						{/* Growth (featured) */}
						<div className="plan featured beam-host beam-always">
							<span className="badge-strip">Most popular</span>
							<div className="plan-head">
								<span className="plan-name" style={{ color: "var(--accent)" }}>
									Growth
								</span>
								<span className="plan-desc">
									Multi-country operations with serious payroll needs.
								</span>
							</div>
							<div className="plan-price">
								<span className="cur">$</span>
								<span className="num">{growthPrice}</span>
								<span className="per">/ employee / mo</span>
							</div>
							<Link
								className="btn btn-primary plan-cta btn-shimmer"
								to="/login"
							>
								<span>Start free trial</span>
							</Link>
							<div className="plan-features">
								<div className="group-label">Everything in Starter, plus</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										Up to <span className="v">1,500</span> employees
									</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										<span className="v">Up to 4</span> country tax engines
									</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Multi-step approval chains</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Audit ledger &amp; reproducible runs</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Bank file exports (RBL, RBC, NCB)</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Biometric ingest &amp; exception queue</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Inventory management</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Bonded warehouse &amp; customs tracking</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Warehouse management</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										Chat support · <span className="v">4h</span> SLA
									</span>
								</div>
							</div>
						</div>

						{/* Enterprise */}
						<div className="plan">
							<div className="plan-head">
								<span className="plan-name">Enterprise</span>
								<span className="plan-desc">
									For groups with multiple legal entities and complex
									governance.
								</span>
							</div>
							<div className="plan-price custom">
								<span className="num">Custom</span>
							</div>
							<a className="btn btn-outline plan-cta" href="#">
								Talk to sales
							</a>
							<div className="plan-features">
								<div className="group-label">Everything in Growth, plus</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Unlimited employees &amp; countries</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Multi-entity consolidation</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>SSO · SAML · SCIM · enterprise IDP</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Role-based access controls (RBAC)</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Custom country profiles</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Dedicated CSM &amp; private channel</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>
										Custom SLA · <span className="v">99.99%</span> uptime
									</span>
								</div>
							</div>
						</div>

						{/* Self-hosted */}
						<div className="plan">
							<div className="plan-head">
								<span className="plan-name">Self-hosted</span>
								<span className="plan-desc">
									Bring-your-own infra. Same product, in your VPC, against your
									Horilla.
								</span>
							</div>
							<div className="plan-price custom">
								<span className="num">Contact</span>
							</div>
							<a className="btn btn-outline plan-cta" href="#">
								Request deployment
							</a>
							<div className="plan-features">
								<div className="group-label">
									Built for regulated environments
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Runs against your Postgres + Horilla</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Tauri desktop &amp; mobile builds</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Air-gapped friendly</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>BYO secrets / KMS / HSM</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Source-available license terms</span>
								</div>
								<div className="plan-feat">
									<span className="ck">
										<Check size={14} />
									</span>
									<span>Annual security review</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Comparison table */}
			<section className="reveal container">
				<div style={{ textAlign: "center", marginBottom: "24px" }}>
					<div className="section-eyebrow" style={{ marginBottom: "12px" }}>
						Side-by-side
					</div>
					<h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", margin: "0 auto" }}>
						Compare what's included
					</h2>
				</div>
				<div className="compare-wrap">
					<table>
						<thead>
							<tr>
								<th>Feature</th>
								<th>Starter</th>
								<th className="col-featured">Growth</th>
								<th>Enterprise</th>
								<th>Self-hosted</th>
							</tr>
						</thead>
						<tbody>
							<tr className="section-row">
								<td colSpan={5}>HR core</td>
							</tr>
							<tr>
								<td className="feat">Employees included</td>
								<td>Up to 50</td>
								<td className="col-featured">Up to 1,500</td>
								<td>Unlimited</td>
								<td>Unlimited</td>
							</tr>
							<tr>
								<td className="feat">Departments &amp; positions</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
							</tr>
							<tr>
								<td className="feat">Documents &amp; e-signatures</td>
								<td>Basic</td>
								<td>Advanced</td>
								<td>+ Custom workflows</td>
								<td>+ Custom workflows</td>
							</tr>
							<tr>
								<td className="feat">Onboarding flows</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td>+ Templates</td>
								<td>+ Templates</td>
							</tr>

							<tr className="section-row">
								<td colSpan={5}>Payroll</td>
							</tr>
							<tr>
								<td className="feat">
									Country tax engines
									<div className="feat-meta">
										GY · TT · BB · JM · US · CA · UK
									</div>
								</td>
								<td>1</td>
								<td className="col-featured">Up to 4</td>
								<td>Unlimited</td>
								<td>Unlimited</td>
							</tr>
							<tr>
								<td className="feat">Effective-date logic</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
							</tr>
							<tr>
								<td className="feat">Approval chains</td>
								<td>Single-step</td>
								<td className="col-featured">Multi-step</td>
								<td>Custom</td>
								<td>Custom</td>
							</tr>
							<tr>
								<td className="feat">Bank file exports</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td>+ Custom formats</td>
								<td>+ Custom formats</td>
							</tr>
							<tr>
								<td className="feat">Reproducible historical runs</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
							</tr>

							<tr className="section-row">
								<td colSpan={5}>Compliance &amp; audit</td>
							</tr>
							<tr>
								<td className="feat">Audit ledger</td>
								<td>30 days</td>
								<td className="col-featured">7 years</td>
								<td>Configurable</td>
								<td>Configurable</td>
							</tr>
							<tr>
								<td className="feat">Risk indicators</td>
								<td>Basic</td>
								<td>Advanced</td>
								<td>+ Custom rules</td>
								<td>+ Custom rules</td>
							</tr>
							<tr>
								<td className="feat">SOC 2 evidence pack</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
							</tr>

							<tr className="section-row">
								<td colSpan={5}>Identity &amp; access</td>
							</tr>
							<tr>
								<td className="feat">SSO / SAML</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td>Google · Microsoft</td>
								<td>Any IDP</td>
								<td>Any IDP</td>
							</tr>
							<tr>
								<td className="feat">SCIM provisioning</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-off center">
									<X size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
								<td className="ck-on center">
									<Check size={16} />
								</td>
							</tr>
							<tr>
								<td className="feat">Custom roles &amp; RBAC</td>
								<td>3 roles</td>
								<td>10 roles</td>
								<td>Unlimited</td>
								<td>Unlimited</td>
							</tr>

							<tr className="section-row">
								<td colSpan={5}>Support &amp; deployment</td>
							</tr>
							<tr>
								<td className="feat">Support channel</td>
								<td>Email</td>
								<td>Chat + Email</td>
								<td>Dedicated CSM</td>
								<td>Dedicated CSM</td>
							</tr>
							<tr>
								<td className="feat">Response SLA</td>
								<td>24h</td>
								<td className="col-featured">4h</td>
								<td>1h custom</td>
								<td>1h custom</td>
							</tr>
							<tr>
								<td className="feat">Deployment</td>
								<td>Hosted</td>
								<td>Hosted</td>
								<td>Hosted or VPC</td>
								<td>Your infra</td>
							</tr>
							<tr>
								<td className="feat">Uptime SLA</td>
								<td>99.9%</td>
								<td>99.95%</td>
								<td>99.99%</td>
								<td>Self-managed</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			{/* FAQ */}
			<section className="section reveal" style={{ paddingTop: 0 }}>
				<div className="container">
					<div
						style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto" }}
					>
						<div className="section-eyebrow">FAQ</div>
						<h2
							style={{ fontSize: "clamp(32px, 4vw, 44px)", margin: "0 auto" }}
						>
							Common questions, answered.
						</h2>
					</div>
					<div className="faq-grid">
						{FAQS.map((faq, i) => (
							<details
								className="faq-item"
								key={faq.q}
								onClick={(e) => {
									e.preventDefault();
									toggleFaq(i);
								}}
								open={openFaqs.has(i) || undefined}
							>
								<summary>{faq.q}</summary>
								{openFaqs.has(i) && <p>{faq.a}</p>}
							</details>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="container">
				<div className="cta">
					<div className="cta-inner">
						<h2>Ready to run payroll the way it should be?</h2>
						<p>
							Spin up a sandbox tenant, import a sample roster, and see your
							first pay run computed in under five minutes.
						</p>
						<div className="cta-actions">
							<Link className="btn btn-primary btn-lg btn-shimmer" to="/login">
								<span>Start free trial</span> <ArrowRight size={14} />
							</Link>
							<Link className="btn btn-outline btn-lg" to="/docs">
								Read the docs
							</Link>
						</div>
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
