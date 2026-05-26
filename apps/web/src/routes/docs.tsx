import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Briefcase,
	Building,
	Check,
	Clock,
	Command,
	Database,
	FileText,
	GitBranch,
	Globe,
	Info,
	Moon,
	Play,
	Search,
	ShieldCheck,
	Sun,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

// Spotlight mouse-tracking handler for .cat-card elements
function useSpotlight() {
	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>) => {
			const rect = e.currentTarget.getBoundingClientRect();
			e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
			e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
		},
		[]
	);
	return handleMouseMove;
}

// Reveal-on-scroll using IntersectionObserver
function useRevealOnScroll() {
	const ref = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add("revealed");
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.08 }
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return ref;
}

// Code tab content (raw text for clipboard copy)
const CODE_TEXT: Record<string, string> = {
	ts: `// Compute a Guyana September pay run
import { Heimdallone } from "@heimdallone/sdk";

const hd = new Heimdallone({
  tenant: "atlas-shipping",
  apiKey: process.env.HEIMDALL_KEY,
});

const run = await hd.payroll.compute({
  country: "GY",
  period:  "2026-09",
  profile: "gy.v2026.1",
});

console.log(run.net);
// → { GYD: 184_720_400, employees: 728 }`,
	curl: `# Compute a pay run via REST
curl -X POST https://api.heimdallone.app/v1/payroll/compute \\
  -H "Authorization: Bearer $HEIMDALL_KEY" \\
  -H "X-Tenant: atlas-shipping" \\
  -H "Content-Type: application/json" \\
  -d '{
    "country": "GY",
    "period":  "2026-09",
    "profile": "gy.v2026.1"
  }'`,
	orpc: `// Type-safe oRPC call from TanStack Start
import { orpc } from "~/lib/orpc";

const { data: run } = await orpc.payroll.compute.$post({
  country: "GY",
  period:  "2026-09",
  profile: "gy.v2026.1",
});

// run is fully typed: PayRun<"GY">
run.employees.map(e => e.net);`,
};

function DocsPage() {
	const [activeTab, setActiveTab] = useState<"ts" | "curl" | "orpc">("ts");
	const [copied, setCopied] = useState(false);

	const spotlightMove = useSpotlight();

	const quickstartRef = useRevealOnScroll() as React.RefObject<HTMLElement>;
	const categoriesRef = useRevealOnScroll() as React.RefObject<HTMLElement>;
	const popularRef = useRevealOnScroll() as React.RefObject<HTMLElement>;
	const helpRef = useRevealOnScroll() as React.RefObject<HTMLElement>;

	const handleCopy = () => {
		const text = CODE_TEXT[activeTab] ?? "";
		navigator.clipboard?.writeText(text).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 1400);
	};

	return (
		<div>
			{/* Nav */}
			<nav className="m-nav" data-screen-label="Marketing Nav">
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
						<Link className="btn btn-primary" to="/app/dashboard">
							Get started <ArrowRight size={13} />
						</Link>
					</div>
				</div>
			</nav>

			{/* Hero */}
			<section className="docs-hero" data-screen-label="Docs Hero">
				<div className="container">
					<div className="eyebrow">Documentation</div>
					<h1>
						Everything you need
						<br />
						to run <em>Heimdallone</em>.
					</h1>
					<p>
						Guides, API references and integration patterns for operators,
						developers and finance teams.
					</p>

					<div className="docs-search-wrap">
						<span className="icon-l">
							<Search size={18} />
						</span>
						<input
							className="docs-search"
							placeholder="Search 184 articles, API endpoints, country profiles…"
							type="text"
						/>
						<span className="kbd">⌘K</span>
					</div>
					<div className="docs-search-tags">
						<button type="button">PAYE Guyana</button>
						<button type="button">Multi-tenancy</button>
						<button type="button">oRPC client</button>
						<button type="button">Horilla sync</button>
						<button type="button">NIS rates</button>
						<button type="button">Approval chains</button>
						<button type="button">Bank file (RBL)</button>
					</div>
				</div>
			</section>

			{/* Quick start */}
			<section
				className="reveal container"
				ref={quickstartRef as React.RefObject<HTMLElement>}
				style={{ paddingTop: "56px" }}
			>
				<div className="quickstart">
					<div className="quickstart-left">
						<div className="eyebrow">Quick start</div>
						<h3>Run your first pay run in 5 minutes</h3>
						<p>
							Spin up a sandbox tenant, import 12 sample employees from Horilla,
							and compute a Guyana September pay run end-to-end.
						</p>
						<div className="quickstart-steps">
							<div className="qs-step">
								<span className="num">1</span>
								<span className="txt">
									<strong>Create a workspace</strong>{" "}
									<span className="dim">
										— pick your countries (GY / TT / BB / JM…).
									</span>
								</span>
							</div>
							<div className="qs-step">
								<span className="num">2</span>
								<span className="txt">
									<strong>Connect Horilla</strong>{" "}
									<span className="dim">
										— paste your read-only Postgres URL.
									</span>
								</span>
							</div>
							<div className="qs-step">
								<span className="num">3</span>
								<span className="txt">
									<strong>Pin a country profile</strong>{" "}
									<span className="dim">
										— pick the gazetted version effective for the period.
									</span>
								</span>
							</div>
							<div className="qs-step">
								<span className="num">4</span>
								<span className="txt">
									<strong>Compute</strong>{" "}
									<span className="dim">
										— Heimdallone returns the gross-to-net breakdown per
										employee.
									</span>
								</span>
							</div>
							<div className="qs-step">
								<span className="num">5</span>
								<span className="txt">
									<strong>Approve &amp; commit</strong>{" "}
									<span className="dim">— audit ledger seals the run.</span>
								</span>
							</div>
						</div>
						<div style={{ marginTop: "28px", display: "flex", gap: "8px" }}>
							<a className="btn btn-primary" href="#">
								Open quick-start guide <ArrowRight size={13} />
							</a>
							<a className="btn btn-outline" href="#">
								SDK reference
							</a>
						</div>
					</div>

					<div className="quickstart-right">
						<div className="code-tabs">
							<button
								className={activeTab === "ts" ? "active" : ""}
								onClick={() => setActiveTab("ts")}
								type="button"
							>
								heimdallone.ts
							</button>
							<button
								className={activeTab === "curl" ? "active" : ""}
								onClick={() => setActiveTab("curl")}
								type="button"
							>
								curl
							</button>
							<button
								className={activeTab === "orpc" ? "active" : ""}
								onClick={() => setActiveTab("orpc")}
								type="button"
							>
								oRPC client
							</button>
							<button
								className="copy"
								onClick={handleCopy}
								style={copied ? { color: "var(--accent)" } : undefined}
								type="button"
							>
								{copied ? (
									<>
										<Check size={11} /> Copied
									</>
								) : (
									<>
										<FileText size={11} /> Copy
									</>
								)}
							</button>
						</div>

						{/* TypeScript panel */}
						<pre
							className="code-block"
							style={{ display: activeTab === "ts" ? "block" : "none" }}
						>
							<code>
								<span className="tok-comment">
									{"// Compute a Guyana September pay run"}
								</span>
								{"\n"}
								<span className="tok-keyword">import</span>
								{" { Heimdallone } "}
								<span className="tok-keyword">from</span>{" "}
								<span className="tok-string">{'"@heimdallone/sdk"'}</span>
								{";"}
								{"\n\n"}
								<span className="tok-keyword">const</span>
								{" hd = "}
								<span className="tok-keyword">new</span>{" "}
								<span className="tok-fn">Heimdallone</span>
								{"({"}
								{"\n"}
								{"  tenant: "}
								<span className="tok-string">{'"atlas-shipping"'}</span>
								{",\n"}
								{"  apiKey: process.env."}
								<span className="tok-prop">HEIMDALL_KEY</span>
								{",\n"}
								{"});"}
								{"\n\n"}
								<span className="tok-keyword">const</span>
								{" run = "}
								<span className="tok-keyword">await</span>
								{" hd.payroll."}
								<span className="tok-fn">compute</span>
								{"({"}
								{"\n"}
								{"  country: "}
								<span className="tok-string">{'"GY"'}</span>
								{",\n"}
								{"  period:  "}
								<span className="tok-string">{'"2026-09"'}</span>
								{",\n"}
								{"  profile: "}
								<span className="tok-string">{'"gy.v2026.1"'}</span>
								{",\n"}
								{"});"}
								{"\n\n"}
								<span className="tok-fn">console</span>
								{"."}
								<span className="tok-fn">log</span>
								{"(run."}
								<span className="tok-prop">net</span>
								{");\n"}
								<span className="tok-comment">
									{"// → { GYD: "}
									<span className="tok-num">184_720_400</span>
									{", employees: "}
									<span className="tok-num">728</span>
									{" }"}
								</span>
							</code>
						</pre>

						{/* curl panel */}
						<pre
							className="code-block"
							style={{ display: activeTab === "curl" ? "block" : "none" }}
						>
							<code>
								<span className="tok-comment">
									{"# Compute a pay run via REST"}
								</span>
								{"\n"}
								<span className="tok-fn">curl</span>
								{" -X POST https://api.heimdallone.app/v1/payroll/compute \\\n"}
								{"  -H "}
								<span className="tok-string">
									{'"Authorization: Bearer $HEIMDALL_KEY"'}
								</span>
								{" \\\n"}
								{"  -H "}
								<span className="tok-string">
									{'"X-Tenant: atlas-shipping"'}
								</span>
								{" \\\n"}
								{"  -H "}
								<span className="tok-string">
									{'"Content-Type: application/json"'}
								</span>
								{" \\\n"}
								{"  -d "}
								<span className="tok-string">
									{
										'\'{\n    "country": "GY",\n    "period":  "2026-09",\n    "profile": "gy.v2026.1"\n  }\''
									}
								</span>
							</code>
						</pre>

						{/* oRPC panel */}
						<pre
							className="code-block"
							style={{ display: activeTab === "orpc" ? "block" : "none" }}
						>
							<code>
								<span className="tok-comment">
									{"// Type-safe oRPC call from TanStack Start"}
								</span>
								{"\n"}
								<span className="tok-keyword">import</span>
								{" { orpc } "}
								<span className="tok-keyword">from</span>{" "}
								<span className="tok-string">{'"~/lib/orpc"'}</span>
								{";"}
								{"\n\n"}
								<span className="tok-keyword">const</span>
								{" { data: run } = "}
								<span className="tok-keyword">await</span>
								{" orpc.payroll.compute."}
								<span className="tok-fn">$post</span>
								{"({"}
								{"\n"}
								{"  country: "}
								<span className="tok-string">{'"GY"'}</span>
								{",\n"}
								{"  period:  "}
								<span className="tok-string">{'"2026-09"'}</span>
								{",\n"}
								{"  profile: "}
								<span className="tok-string">{'"gy.v2026.1"'}</span>
								{",\n"}
								{"});"}
								{"\n\n"}
								<span className="tok-comment">
									{'// run is fully typed: PayRun<"GY">'}
								</span>
								{"\n"}
								{"run."}
								<span className="tok-prop">employees</span>
								{"."}
								<span className="tok-fn">map</span>
								{"(e => e."}
								<span className="tok-prop">net</span>
								{");"}
							</code>
						</pre>
					</div>
				</div>
			</section>

			{/* Categories */}
			<section
				className="docs-section reveal container"
				ref={categoriesRef as React.RefObject<HTMLElement>}
			>
				<div className="docs-section-head">
					<div>
						<h2>Browse by topic</h2>
						<div className="sub">184 articles across 9 categories</div>
					</div>
					<a href="#">
						View all topics <ArrowRight size={12} />
					</a>
				</div>
				<div className="cat-grid">
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Play size={18} />
						</div>
						<div className="title">Getting started</div>
						<div className="desc">
							Workspace setup, importing from Horilla, your first pay run.
						</div>
						<div className="meta">
							<span>14 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Wallet size={18} />
						</div>
						<div className="title">Payroll engine</div>
						<div className="desc">
							Country profiles, effective-date logic, approval chains,
							reproducible runs.
						</div>
						<div className="meta">
							<span>38 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Globe size={18} />
						</div>
						<div className="title">Country profiles</div>
						<div className="desc">
							PAYE bands, NIS rates, statutory deductions for every supported
							jurisdiction.
						</div>
						<div className="meta">
							<span>42 articles · 7 countries</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Users size={18} />
						</div>
						<div className="title">HR &amp; people</div>
						<div className="desc">
							Employees, departments, contracts, leave, attendance, onboarding.
						</div>
						<div className="meta">
							<span>26 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<ShieldCheck size={18} />
						</div>
						<div className="title">Compliance &amp; audit</div>
						<div className="desc">
							Audit ledger, evidence packs, risk indicators, regulator-ready
							exports.
						</div>
						<div className="meta">
							<span>18 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Building size={18} />
						</div>
						<div className="title">Multi-tenancy</div>
						<div className="desc">
							Organization model, region defaults, role-scoped access,
							switching.
						</div>
						<div className="meta">
							<span>11 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#integrations"
						id="integrations"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<GitBranch size={18} />
						</div>
						<div className="title">Integrations</div>
						<div className="desc">
							Horilla bridge, Postgres connectors, bank files (RBL, RBC, NCB),
							SSO/SAML.
						</div>
						<div className="meta">
							<span>17 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Command size={18} />
						</div>
						<div className="title">API &amp; SDK</div>
						<div className="desc">
							oRPC client, REST endpoints, webhooks, rate limits, typed schemas.
						</div>
						<div className="meta">
							<span>14 articles · v0.4</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
					<a
						className="cat-card spotlight"
						href="#"
						onMouseMove={spotlightMove}
					>
						<div className="icon">
							<Zap size={18} />
						</div>
						<div className="title">Self-hosted</div>
						<div className="desc">
							Tauri builds, Postgres bring-your-own, Docker compose, air-gapped
							install.
						</div>
						<div className="meta">
							<span>4 articles</span>
							<span className="go">
								Explore <ArrowRight size={11} />
							</span>
						</div>
					</a>
				</div>
			</section>

			{/* Popular this week + Changelog */}
			<section
				className="docs-section reveal container"
				ref={popularRef as React.RefObject<HTMLElement>}
			>
				<div className="docs-cols">
					{/* Popular articles */}
					<div className="docs-list">
						<div className="docs-list-head">
							<h3>Popular this week</h3>
							<span className="badge">
								<span
									className="badge-dot"
									style={{ background: "var(--accent)" }}
								/>
								updated daily
							</span>
						</div>
						<a className="doc-row" href="#">
							<div className="icon">
								<Wallet size={13} />
							</div>
							<div>
								<div className="ttl">Computing a Guyana PAYE pay run</div>
								<div className="sub">
									Walk-through of NIS &amp; PAYE calculation against the
									effective profile.
								</div>
							</div>
							<div className="meta">
								6 min
								<br />
								read
							</div>
						</a>
						<a className="doc-row" href="#">
							<div className="icon">
								<GitBranch size={13} />
							</div>
							<div>
								<div className="ttl">Versioning country profiles safely</div>
								<div className="sub">
									Stage <span className="mono">v2026.2</span> while keeping{" "}
									<span className="mono">v2026.1</span> active.
								</div>
							</div>
							<div className="meta">
								8 min
								<br />
								read
							</div>
						</a>
						<a className="doc-row" href="#">
							<div className="icon">
								<Users size={13} />
							</div>
							<div>
								<div className="ttl">
									Multi-tenancy: scoping HR data per workspace
								</div>
								<div className="sub">
									Row-level security and SCIM-driven role assignment.
								</div>
							</div>
							<div className="meta">
								12 min
								<br />
								read
							</div>
						</a>
						<a className="doc-row" href="#">
							<div className="icon">
								<ShieldCheck size={13} />
							</div>
							<div>
								<div className="ttl">
									Audit ledger: exporting a SOC 2 evidence pack
								</div>
								<div className="sub">
									One-command export · auditor-friendly PDF + JSON.
								</div>
							</div>
							<div className="meta">
								5 min
								<br />
								read
							</div>
						</a>
						<a className="doc-row" href="#">
							<div className="icon">
								<Database size={13} />
							</div>
							<div>
								<div className="ttl">
									Connecting your existing Horilla deployment
								</div>
								<div className="sub">
									Read-only Postgres, projection refresh, conflict resolution.
								</div>
							</div>
							<div className="meta">
								9 min
								<br />
								read
							</div>
						</a>
						<a className="doc-row" href="#">
							<div className="icon">
								<Clock size={13} />
							</div>
							<div>
								<div className="ttl">Biometric ingest from ZKTeco devices</div>
								<div className="sub">
									Real-time stream · exception queue · idempotent replay.
								</div>
							</div>
							<div className="meta">
								7 min
								<br />
								read
							</div>
						</a>
					</div>

					{/* Changelog timeline */}
					<div className="changelog">
						<div className="docs-list-head">
							<h3>Changelog</h3>
							<a
								href="#"
								style={{ fontSize: "11.5px", color: "var(--accent)" }}
							>
								View all
							</a>
						</div>
						<div className="changelog-row">
							<div className="date">Sep 27</div>
							<div className="body">
								<div>
									<span className="tag new">New</span>
									<span className="ttl">Guyana profile v2026.2 staged</span>
								</div>
								<div className="desc">
									NIS rate change effective 1 Oct (5.6 → 6.0%) staged for
									review. No active runs affected.
								</div>
							</div>
						</div>
						<div className="changelog-row">
							<div className="date">Sep 24</div>
							<div className="body">
								<div>
									<span className="tag improve">Improved</span>
									<span className="ttl">Faster pay-run commit</span>
								</div>
								<div className="desc">
									Bulk-commit window cut from 8s → 2.4s on 1,500-employee runs.
									No schema change.
								</div>
							</div>
						</div>
						<div className="changelog-row">
							<div className="date">Sep 22</div>
							<div className="body">
								<div>
									<span className="tag new">New</span>
									<span className="ttl">
										Bank file: Republic Bank Trinidad (RBT)
									</span>
								</div>
								<div className="desc">
									Added native export for RBT format alongside RBL, RBC and NCB.
								</div>
							</div>
						</div>
						<div className="changelog-row">
							<div className="date">Sep 18</div>
							<div className="body">
								<div>
									<span className="tag fix">Fix</span>
									<span className="ttl">
										Effective-date split on mid-period hires
									</span>
								</div>
								<div className="desc">
									Resolved off-by-one in pro-rated NIS contributions when an
									employee starts on a Sunday.
								</div>
							</div>
						</div>
						<div className="changelog-row">
							<div className="date">Sep 15</div>
							<div className="body">
								<div>
									<span className="tag new">New</span>
									<span className="ttl">Jamaica TRN validation API</span>
								</div>
								<div className="desc">
									Validate Tax Registration Numbers at employee creation;
									surfaces blocking pay-run errors early.
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Help row */}
			<section
				className="docs-section reveal container"
				ref={helpRef as React.RefObject<HTMLElement>}
				style={{ paddingBottom: "96px" }}
			>
				<div className="docs-section-head">
					<div>
						<h2>Need help?</h2>
						<div className="sub">Skip the search — talk to a human.</div>
					</div>
				</div>
				<div className="help-row">
					<a className="help-card" href="#">
						<div className="icon">
							<Users size={16} />
						</div>
						<div className="ttl">Community</div>
						<div className="desc">
							Join 1,200 operators discussing payroll, multi-country setups, and
							HR ops.
						</div>
						<div className="cta">
							Open Discord <ArrowRight size={11} />
						</div>
					</a>
					<a className="help-card" href="#">
						<div className="icon">
							<Info size={16} />
						</div>
						<div className="ttl">Support</div>
						<div className="desc">
							Email, chat or open a ticket. 4-hour SLA on Growth, 1-hour on
							Enterprise.
						</div>
						<div className="cta">
							Open a ticket <ArrowRight size={11} />
						</div>
					</a>
					<a className="help-card" href="#">
						<div className="icon">
							<Briefcase size={16} />
						</div>
						<div className="ttl">Implementation</div>
						<div className="desc">
							Free white-glove migration from spreadsheets, Horilla-only, or
							other HRMS.
						</div>
						<div className="cta">
							Book a call <ArrowRight size={11} />
						</div>
					</a>
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
