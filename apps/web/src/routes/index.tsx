import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	ArrowRight,
	Briefcase,
	Building,
	Calendar,
	Clock,
	FileText,
	GitBranch,
	Globe,
	Moon,
	Shield,
	ShieldCheck,
	Sparkles,
	Sun,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
	component: MarketingLanding,
});

/* ─── Heimdall logo SVG ─── */
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

/* ─── Flag placeholder ─── */
function Flag({ cc }: { cc: string }) {
	return (
		<span className="flag" title={cc}>
			{cc}
		</span>
	);
}

/* ─── Country data ─── */
const COUNTRY_DATA: Record<
	string,
	{
		name: string;
		cur: string;
		gross: string;
		lines: [string, string][];
		net: string;
		contrib: string;
		note: string;
	}
> = {
	GY: {
		name: "Guyana",
		cur: "GYD",
		gross: "428,000.00",
		lines: [
			["Gross earnings", "428,000.00"],
			["PAYE (income tax)", "−72,800.00"],
			["NIS (employee)", "−23,540.00"],
			["Other deductions", "−4,000.00"],
		],
		net: "327,660.00",
		contrib: "Employer NIS 36,380.00",
		note: "September 2026 · NIS rate effective Jul 2025",
	},
	TT: {
		name: "Trinidad & Tobago",
		cur: "TTD",
		gross: "14,800.00",
		lines: [
			["Gross earnings", "14,800.00"],
			["PAYE", "−1,627.00"],
			["NIS (Class IX)", "−333.20"],
			["Health surcharge", "−33.00"],
		],
		net: "12,806.80",
		contrib: "Employer NIS 666.80",
		note: "September 2026 · NIS Class IX",
	},
	BB: {
		name: "Barbados",
		cur: "BBD",
		gross: "5,200.00",
		lines: [
			["Gross earnings", "5,200.00"],
			["PAYE (12.5% band)", "−420.00"],
			["NIS (employee 11.1%)", "−577.20"],
			["Health levy", "−52.00"],
		],
		net: "4,150.80",
		contrib: "Employer NIS 644.80",
		note: "September 2026 · Q3 contribution table",
	},
	JM: {
		name: "Jamaica",
		cur: "JMD",
		gross: "420,000.00",
		lines: [
			["Gross earnings", "420,000.00"],
			["PAYE", "−63,000.00"],
			["NIS (employee 3%)", "−4,500.00"],
			["NHT (employee 2%)", "−8,400.00"],
			["Ed tax (2.25%)", "−9,450.00"],
		],
		net: "334,650.00",
		contrib: "Employer NIS + NHT 16,800.00",
		note: "September 2026 · TAJ schedule v2026.1",
	},
	US: {
		name: "United States",
		cur: "USD",
		gross: "6,400.00",
		lines: [
			["Gross earnings", "6,400.00"],
			["Federal income tax", "−812.00"],
			["FICA (Social Sec)", "−396.80"],
			["FICA (Medicare)", "−92.80"],
			["State tax (FL)", "0.00"],
		],
		net: "5,098.40",
		contrib: "Employer FICA 489.60",
		note: "September 2026 · 2026 federal tables",
	},
	GB: {
		name: "United Kingdom",
		cur: "GBP",
		gross: "3,800.00",
		lines: [
			["Gross earnings", "3,800.00"],
			["PAYE (basic rate)", "−640.00"],
			["National Insurance", "−228.00"],
			["Workplace pension", "−190.00"],
		],
		net: "2,742.00",
		contrib: "Employer NI 437.00",
		note: "September 2026 · 2026/27 tax year",
	},
};

/* ─── Accent palette ─── */
const ACCENTS: Record<
	string,
	{ c: string; c2: string; ink: string; soft: string; ring: string }
> = {
	gold: {
		c: "#7986cb",
		c2: "#9aa4dd",
		ink: "#0a0d18",
		soft: "rgba(121,134,203,0.12)",
		ring: "rgba(121,134,203,0.30)",
	},
	violet: {
		c: "#7c5cff",
		c2: "#9b85ff",
		ink: "#fff",
		soft: "rgba(124,92,255,0.12)",
		ring: "rgba(124,92,255,0.30)",
	},
	green: {
		c: "#3ddc97",
		c2: "#5fe6ad",
		ink: "#0a1813",
		soft: "rgba(61,220,151,0.12)",
		ring: "rgba(61,220,151,0.30)",
	},
	blue: {
		c: "#4f8dff",
		c2: "#7aa9ff",
		ink: "#fff",
		soft: "rgba(79,141,255,0.12)",
		ring: "rgba(79,141,255,0.30)",
	},
};

/* ─── Spotlight effect via imperative listener (avoids JSX event-handler lint) ─── */
function useSpotlight<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const handler = (e: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const x = ((e.clientX - rect.left) / rect.width) * 100;
			const y = ((e.clientY - rect.top) / rect.height) * 100;
			el.style.setProperty("--mx", `${x}%`);
			el.style.setProperty("--my", `${y}%`);
		};
		el.addEventListener("mousemove", handler);
		return () => el.removeEventListener("mousemove", handler);
	}, []);
	return ref;
}

/* ─── Count-up animation ─── */
function animateCount(
	el: HTMLElement,
	end: number,
	duration: number,
	decimals: number,
	suffix: string
) {
	const start = performance.now();
	const step = (now: number) => {
		const progress = Math.min((now - start) / duration, 1);
		const eased = 1 - (1 - progress) ** 3;
		const value = eased * end;
		el.textContent = `${value.toFixed(decimals)}${suffix}`;
		if (progress < 1) {
			requestAnimationFrame(step);
		}
	};
	requestAnimationFrame(step);
}

/* ════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════ */
function MarketingLanding() {
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [heroVariant, setHeroVariant] = useState<
		"centered" | "split" | "editorial"
	>("centered");
	const [activeCountry, setActiveCountry] = useState("GY");
	const [accentKey, setAccentKey] = useState("gold");
	const [tweakVisible, setTweakVisible] = useState(false);

	/* Spotlight refs — one per bento card */
	const spotlightLg = useSpotlight<HTMLFieldSetElement>();
	const spotlightMd1 = useSpotlight<HTMLFieldSetElement>();
	const spotlightSm1 = useSpotlight<HTMLFieldSetElement>();
	const spotlightSm2 = useSpotlight<HTMLFieldSetElement>();
	const spotlightSm3 = useSpotlight<HTMLFieldSetElement>();
	const spotlightMd2 = useSpotlight<HTMLFieldSetElement>();
	const spotlightMd3 = useSpotlight<HTMLFieldSetElement>();

	/* Count-up refs */
	const countRefs = useRef<(HTMLSpanElement | null)[]>([]);
	const countAnimated = useRef(false);

	/* ── Init theme from storage / DOM ── */
	useEffect(() => {
		try {
			const stored = localStorage.getItem("heimdall.theme") as
				| "dark"
				| "light"
				| null;
			if (stored) {
				setTheme(stored);
				document.documentElement.setAttribute("data-theme", stored);
			} else {
				const attr = document.documentElement.getAttribute("data-theme") as
					| "dark"
					| "light"
					| null;
				if (attr) {
					setTheme(attr);
				}
			}
		} catch {
			// localStorage unavailable (private browsing, etc.)
		}
	}, []);

	/* ── Accent applier (stable ref, defined before the init effect) ── */
	const applyAccent = useCallback((key: string) => {
		const a = ACCENTS[key];
		if (!a) {
			return;
		}
		const r = document.documentElement;
		r.style.setProperty("--accent", a.c);
		r.style.setProperty("--accent-2", a.c2);
		r.style.setProperty("--accent-ink", a.ink);
		r.style.setProperty("--accent-soft", a.soft);
		r.style.setProperty("--accent-ring", a.ring);
		try {
			localStorage.setItem("heimdall.accent", key);
		} catch {
			// localStorage unavailable
		}
	}, []);

	/* ── Init accent from storage ── */
	useEffect(() => {
		try {
			const stored = localStorage.getItem("heimdall.accent");
			if (stored && ACCENTS[stored]) {
				applyAccent(stored);
				setAccentKey(stored);
			}
		} catch {
			// localStorage unavailable
		}
	}, [applyAccent]);

	/* ── Reveal on scroll ── */
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
			{ threshold: 0.12 }
		);
		for (const el of revealEls) {
			io.observe(el);
		}
		return () => io.disconnect();
	}, []);

	/* ── Count-up on scroll (editorial strip) ── */
	useEffect(() => {
		if (heroVariant !== "editorial") {
			countAnimated.current = false;
			return;
		}
		const targets = countRefs.current.filter(Boolean) as HTMLSpanElement[];
		if (!targets.length) {
			return;
		}

		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && !countAnimated.current) {
						countAnimated.current = true;
						for (const el of targets) {
							const end = Number(el.dataset.end ?? 0);
							const duration = Number(el.dataset.duration ?? 1000);
							const decimals = Number(el.dataset.decimals ?? 0);
							const suffix = el.dataset.suffix ?? "";
							animateCount(el, end, duration, decimals, suffix);
						}
						io.disconnect();
					}
				}
			},
			{ threshold: 0.5 }
		);
		if (targets[0]) {
			io.observe(targets[0]);
		}
		return () => io.disconnect();
	}, [heroVariant]);

	/* ── postMessage tweak strip ── */
	useEffect(() => {
		const handler = (e: MessageEvent) => {
			if (e.data?.type === "__activate_edit_mode") {
				setTweakVisible(true);
			}
			if (e.data?.type === "__deactivate_edit_mode") {
				setTweakVisible(false);
			}
		};
		window.addEventListener("message", handler);
		window.parent.postMessage({ type: "__edit_mode_available" }, "*");
		return () => window.removeEventListener("message", handler);
	}, []);

	/* ── Theme toggle ── */
	const toggleTheme = (t: "dark" | "light") => {
		setTheme(t);
		document.documentElement.setAttribute("data-theme", t);
		try {
			localStorage.setItem("heimdall.theme", t);
		} catch {
			// localStorage unavailable
		}
	};

	/* ── Accent handler ── */
	const handleAccent = (key: string) => {
		setAccentKey(key);
		applyAccent(key);
	};

	/* ── Country card renderer ── */
	const countryData = COUNTRY_DATA[activeCountry];

	/* ════════════════ JSX ════════════════ */
	return (
		<div style={{ overflowX: "hidden" }}>
			{/* ═══════════ NAV ═══════════ */}
			<nav className="m-nav">
				<div className="container m-nav-inner">
					<Link className="h-logo" to="/">
						<span className="h-logo-mark">
							<HeimdallLogo size={22} />
						</span>
						<span>Heimdallone</span>
					</Link>
					<div className="m-nav-links">
						<a href="#features">Product</a>
						<a href="#features">Features</a>
						<a href="#payroll">Payroll</a>
						<Link to="/pricing">Pricing</Link>
						<Link to="/docs">Docs</Link>
					</div>
					<div className="m-nav-actions">
						<div className="theme-toggle" data-theme-toggle="">
							<button
								className={theme === "dark" ? "active" : ""}
								onClick={() => toggleTheme("dark")}
								title="Dark"
								type="button"
							>
								<Moon size={14} />
							</button>
							<button
								className={theme === "light" ? "active" : ""}
								onClick={() => toggleTheme("light")}
								title="Light"
								type="button"
							>
								<Sun size={14} />
							</button>
						</div>
						<Link className="btn btn-ghost" to="/login">
							Sign in
						</Link>
						<Link className="btn btn-primary" to="/app">
							Get started <ArrowRight size={13} />
						</Link>
					</div>
				</div>
			</nav>

			{/* ═══════════ HERO ═══════════ */}
			<section className="hero" data-variant={heroVariant}>
				<div className="hero-bg">
					<div className="aurora-host">
						<div className="aurora" />
					</div>
				</div>

				<div className="hero-inner container">
					{/* Eyebrow pill */}
					<div className="hero-eyebrow">
						<span className="pill">New</span>
						<span>
							Pay-run engine for the Caribbean — now in private preview
						</span>
						<ArrowRight size={12} style={{ color: "var(--fg-3)" }} />
					</div>

					{/* Headline */}
					<h1>
						The workforce
						<br />
						<span className="accent-italic">command center</span>
						{" for"}
						<br />
						multi-country teams.
					</h1>

					{/* Sub */}
					<p className="hero-sub">
						Heimdallone unifies HR, payroll, attendance and compliance across
						every country you operate in — with the speed and clarity of modern
						software.
					</p>

					{/* CTAs */}
					<div className="hero-cta">
						<Link className="btn btn-primary btn-lg" to="/app">
							Open the dashboard
							<ArrowRight size={14} />
						</Link>
						<a className="btn btn-outline btn-lg" href="#features">
							See the product
						</a>
					</div>

					{/* Editorial stat strip (hidden in centered/split) */}
					<div className="hero-strip">
						<div className="strip-item">
							<div className="stat-value">
								<span
									className="count-up mono"
									data-decimals="0"
									data-duration="900"
									data-end="7"
									ref={(el) => {
										countRefs.current[0] = el;
									}}
								>
									0
								</span>
							</div>
							<div className="label">country tax engines built-in</div>
						</div>
						<div className="strip-item">
							<div className="stat-value">
								<span
									className="count-up mono"
									data-decimals="0"
									data-duration="1500"
									data-end="12000"
									data-suffix="+"
									ref={(el) => {
										countRefs.current[1] = el;
									}}
								>
									0
								</span>
							</div>
							<div className="label">payslips processed per run</div>
						</div>
						<div className="strip-item">
							<div className="stat-value">
								<span
									className="count-up mono"
									data-decimals="2"
									data-duration="1500"
									data-end="99.99"
									data-suffix="%"
									ref={(el) => {
										countRefs.current[2] = el;
									}}
								>
									0
								</span>
							</div>
							<div className="label">calculation accuracy SLA</div>
						</div>
						<div className="strip-item">
							<div className="stat-value">
								{"<"}
								<span
									className="count-up mono"
									data-decimals="0"
									data-duration="900"
									data-end="3"
									ref={(el) => {
										countRefs.current[3] = el;
									}}
								>
									0
								</span>
								s
							</div>
							<div className="label">to commit a full pay run</div>
						</div>
					</div>

					{/* Split variant right-side mockup */}
					<div className="hero-right">
						<div className="hero-preview" style={{ marginTop: 0 }}>
							<div className="preview-chrome">
								<span className="preview-dot" />
								<span className="preview-dot" />
								<span className="preview-dot" />
								<span
									className="mono"
									style={{
										color: "var(--fg-4)",
										fontSize: 11,
										marginLeft: 12,
									}}
								>
									heimdallone.app / payroll
								</span>
							</div>
							<div className="preview-body">
								<div className="mini-dash">
									<div className="mini-tile">
										<div className="lbl">Employees</div>
										<div className="val">1,284</div>
									</div>
									<div className="mini-tile">
										<div className="lbl">Today on duty</div>
										<div className="val">1,196</div>
									</div>
									<div className="mini-tile">
										<div className="lbl">Pay run</div>
										<div
											className="val"
											style={{ fontSize: 16, color: "var(--accent)" }}
										>
											Ready
										</div>
									</div>
									<div className="mini-tile">
										<div className="lbl">Open alerts</div>
										<div className="val">3</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Centered hero product preview (hidden in split) */}
				<div
					className="container"
					id="hero-preview-wrap"
					style={{ display: heroVariant === "split" ? "none" : undefined }}
				>
					<div className="hero-preview">
						<div className="preview-chrome">
							<span className="preview-dot" />
							<span className="preview-dot" />
							<span className="preview-dot" />
							<span
								className="mono"
								style={{ color: "var(--fg-4)", fontSize: 11, marginLeft: 12 }}
							>
								heimdallone.app / overview
							</span>
							<span className="badge badge-success ml-auto">
								<span className="badge-dot" />
								Live
							</span>
						</div>
						<div className="preview-body">
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "200px 1fr",
									gap: 22,
								}}
							>
								{/* Sidebar nav mock */}
								<div
									style={{ display: "flex", flexDirection: "column", gap: 4 }}
								>
									<div
										style={{
											fontSize: 11,
											color: "var(--fg-3)",
											padding: "4px 10px",
											letterSpacing: "0.06em",
											textTransform: "uppercase",
										}}
									>
										Workspaces
									</div>
									<div
										style={{
											display: "flex",
											gap: 8,
											alignItems: "center",
											padding: "6px 10px",
											background: "var(--bg-3)",
											borderRadius: 6,
											fontSize: 12.5,
										}}
									>
										<span
											className="tenant-avatar"
											style={{
												width: 18,
												height: 18,
												fontSize: 9,
												borderRadius: 4,
											}}
										>
											AS
										</span>
										Atlas Shipping
									</div>
									<div
										style={{
											fontSize: 11,
											color: "var(--fg-3)",
											padding: "12px 10px 4px",
											letterSpacing: "0.06em",
											textTransform: "uppercase",
										}}
									>
										Navigation
									</div>
									<div
										style={{
											fontSize: 12.5,
											color: "var(--fg-2)",
											padding: "5px 10px",
										}}
									>
										Overview
									</div>
									<div
										style={{
											fontSize: 12.5,
											color: "var(--fg)",
											padding: "5px 10px",
											background: "var(--bg-3)",
											borderRadius: 6,
										}}
									>
										Payroll
									</div>
									<div
										style={{
											fontSize: 12.5,
											color: "var(--fg-2)",
											padding: "5px 10px",
										}}
									>
										Attendance
									</div>
									<div
										style={{
											fontSize: 12.5,
											color: "var(--fg-2)",
											padding: "5px 10px",
										}}
									>
										Compliance
									</div>
								</div>

								{/* Main content mock */}
								<div>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "flex-start",
											marginBottom: 14,
										}}
									>
										<div>
											<div
												style={{
													fontSize: 11,
													color: "var(--fg-3)",
													letterSpacing: "0.06em",
													textTransform: "uppercase",
												}}
											>
												Active pay run · GY · September
											</div>
											<div
												style={{
													fontSize: 22,
													fontWeight: 600,
													letterSpacing: "-0.02em",
													marginTop: 4,
												}}
											>
												GYD 184,720,400.00
											</div>
										</div>
										<span className="badge badge-accent">
											<span className="badge-dot" />
											Ready for approval
										</span>
									</div>
									<div className="mini-dash">
										<div className="mini-tile">
											<div className="lbl">Employees</div>
											<div className="val">1,284</div>
										</div>
										<div className="mini-tile">
											<div className="lbl">Today on duty</div>
											<div className="val">1,196</div>
										</div>
										<div className="mini-tile">
											<div className="lbl">Pay run</div>
											<div
												className="val"
												style={{ fontSize: 16, color: "var(--accent)" }}
											>
												Ready
											</div>
										</div>
										<div className="mini-tile">
											<div className="lbl">Open alerts</div>
											<div className="val">3</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ═══════════ LOGO MARQUEE ═══════════ */}
			<section className="logos">
				<div className="container">
					<div className="logos-label">
						Trusted by operations teams across the region
					</div>
					<div className="marquee">
						<div className="marquee-track">
							{/* Set 1 */}
							<div className="logo-placeholder">
								<Zap size={18} />
								Atlas Shipping
							</div>
							<div className="logo-placeholder">
								<Building size={18} />
								Mahaica Group
							</div>
							<div className="logo-placeholder">
								<Globe size={18} />
								Bridgetown Ltd
							</div>
							<div className="logo-placeholder">
								<Briefcase size={18} />
								Kingston &amp; Co
							</div>
							<div className="logo-placeholder">
								<Sparkles size={18} />
								Demerara Works
							</div>
							<div className="logo-placeholder">
								<Shield size={18} />
								Trident Capital
							</div>
							<div className="logo-placeholder">
								<Activity size={18} />
								Spiceland Coöp
							</div>
							<div className="logo-placeholder">
								<GitBranch size={18} />
								Port Mourant
							</div>
							{/* Set 2 — duplicate for seamless loop */}
							<div className="logo-placeholder">
								<Zap size={18} />
								Atlas Shipping
							</div>
							<div className="logo-placeholder">
								<Building size={18} />
								Mahaica Group
							</div>
							<div className="logo-placeholder">
								<Globe size={18} />
								Bridgetown Ltd
							</div>
							<div className="logo-placeholder">
								<Briefcase size={18} />
								Kingston &amp; Co
							</div>
							<div className="logo-placeholder">
								<Sparkles size={18} />
								Demerara Works
							</div>
							<div className="logo-placeholder">
								<Shield size={18} />
								Trident Capital
							</div>
							<div className="logo-placeholder">
								<Activity size={18} />
								Spiceland Coöp
							</div>
							<div className="logo-placeholder">
								<GitBranch size={18} />
								Port Mourant
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ═══════════ BENTO FEATURES ═══════════ */}
			<section className="section reveal" id="features">
				<div className="container">
					<div className="section-eyebrow">
						Built for the work that runs your company
					</div>
					<h2>
						Everything operations needs — without the spreadsheets in the
						cracks.
					</h2>

					<div className="bento">
						{/* b-lg: Multi-country payroll engine */}
						<fieldset
							className="bento-card b-lg spotlight beam-host"
							ref={spotlightLg}
							style={{ display: "flex", flexDirection: "column" }}
						>
							<div className="bento-icon">
								<Wallet size={18} />
							</div>
							<div className="bento-title">Multi-country payroll engine</div>
							<div className="bento-desc">
								Per-country tax rules, statutory deductions and employer
								contributions — versioned, auditable, and ready for the next
								gazette.
							</div>
							<div style={{ marginTop: "auto" }}>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(7, 1fr)",
										gap: 8,
										paddingTop: 28,
									}}
								>
									{(["GY", "TT", "BB", "JM", "US", "CA", "GB"] as const).map(
										(cc) => (
											<div
												className="cc-badge"
												key={cc}
												style={{ justifyContent: "center" }}
											>
												<Flag cc={cc} />
												{cc === "GB" ? "UK" : cc}
											</div>
										)
									)}
								</div>
							</div>
						</fieldset>

						{/* b-md: Audit-grade compliance trail */}
						<fieldset
							className="bento-card b-md spotlight beam-host"
							ref={spotlightMd1}
							style={{ display: "flex", flexDirection: "column" }}
						>
							<div className="bento-icon">
								<ShieldCheck size={18} />
							</div>
							<div className="bento-title">Audit-grade compliance trail</div>
							<div className="bento-desc">
								Every approval, edit and pay-run mutation captured with
								operator, timestamp, and country jurisdiction. Export to PDF in
								one click.
							</div>
							<div
								style={{
									marginTop: "auto",
									paddingTop: 20,
									display: "flex",
									flexDirection: "column",
									gap: 6,
								}}
							>
								<div
									style={{
										display: "flex",
										gap: 10,
										alignItems: "center",
										fontSize: 12,
										color: "var(--fg-3)",
									}}
								>
									<span
										className="badge badge-success"
										style={{ height: 18, padding: "0 6px" }}
									>
										approved
									</span>
									<span className="mono" style={{ color: "var(--fg-4)" }}>
										14:32:08
									</span>
									Pay run · TT · August
								</div>
								<div
									style={{
										display: "flex",
										gap: 10,
										alignItems: "center",
										fontSize: 12,
										color: "var(--fg-3)",
									}}
								>
									<span
										className="badge badge-warning"
										style={{ height: 18, padding: "0 6px" }}
									>
										flagged
									</span>
									<span className="mono" style={{ color: "var(--fg-4)" }}>
										14:31:54
									</span>
									NIS rate change · GY
								</div>
								<div
									style={{
										display: "flex",
										gap: 10,
										alignItems: "center",
										fontSize: 12,
										color: "var(--fg-3)",
									}}
								>
									<span
										className="badge"
										style={{ height: 18, padding: "0 6px" }}
									>
										edit
									</span>
									<span className="mono" style={{ color: "var(--fg-4)" }}>
										14:28:12
									</span>
									Employee record · M. Persaud
								</div>
							</div>
						</fieldset>

						{/* b-sm: HR core */}
						<fieldset className="bento-card b-sm spotlight" ref={spotlightSm1}>
							<div className="bento-icon">
								<Users size={18} />
							</div>
							<div className="bento-title">HR core</div>
							<div className="bento-desc">
								Employees, departments, contracts, documents — all the way to
								offboarding.
							</div>
						</fieldset>

						{/* b-sm: Attendance & biometric */}
						<fieldset className="bento-card b-sm spotlight" ref={spotlightSm2}>
							<div className="bento-icon">
								<Clock size={18} />
							</div>
							<div className="bento-title">Attendance &amp; biometric</div>
							<div className="bento-desc">
								Live device feeds, exception queues, overtime — without
								spreadsheets.
							</div>
						</fieldset>

						{/* b-sm: Leave & holidays */}
						<fieldset className="bento-card b-sm spotlight" ref={spotlightSm3}>
							<div className="bento-icon">
								<Calendar size={18} />
							</div>
							<div className="bento-title">Leave &amp; holidays</div>
							<div className="bento-desc">
								Country-aware holidays. Multi-step approvals. Liability
								tracking.
							</div>
						</fieldset>

						{/* b-md: Multi-tenancy */}
						<fieldset className="bento-card b-md spotlight" ref={spotlightMd2}>
							<div className="bento-icon">
								<Building size={18} />
							</div>
							<div className="bento-title">
								Multi-tenancy that doesn't get in the way
							</div>
							<div className="bento-desc">
								One sign-in across all your organizations. Role-scoped data.
								Region defaults that just inherit. Switch tenants in a
								keystroke.
							</div>
						</fieldset>

						{/* b-md: Executive analytics */}
						<fieldset className="bento-card b-md spotlight" ref={spotlightMd3}>
							<div className="bento-icon">
								<Activity size={18} />
							</div>
							<div className="bento-title">Executive analytics, by default</div>
							<div className="bento-desc">
								Headcount, payroll cost, leave liability, attendance health and
								turnover risk — without a BI team or a quarter's wait.
							</div>
						</fieldset>
					</div>
				</div>
			</section>

			{/* ═══════════ MULTI-COUNTRY PAYROLL ═══════════ */}
			<section
				className="section reveal"
				id="payroll"
				style={{ borderTop: "1px solid var(--line)" }}
			>
				<div className="container">
					<div className="section-eyebrow">Multi-country payroll</div>
					<h2>One pay run. Seven jurisdictions. Zero exports to Excel.</h2>
					<p className="section-sub">
						Switch country, switch effective date, see the exact gross-to-net
						breakdown your local statutes require. Every line item is sourced
						from a versioned country profile.
					</p>

					<div className="payroll-feature">
						{/* Left: feature callouts */}
						<div>
							<div
								style={{ display: "flex", flexDirection: "column", gap: 20 }}
							>
								<div>
									<h4
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
										}}
									>
										<span className="bento-icon" style={{ marginBottom: 0 }}>
											<Globe size={16} />
										</span>
										Country profiles, not country forks
									</h4>
									<p style={{ marginTop: 6, color: "var(--fg-3)" }}>
										Tax bands, NIS, PAYE, statutory leave and employer
										contributions live as versioned profiles — not hard-coded
										logic. Update once, applied to the next pay period.
									</p>
								</div>
								<div>
									<h4
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
										}}
									>
										<span className="bento-icon" style={{ marginBottom: 0 }}>
											<GitBranch size={16} />
										</span>
										Effective-date logic, built in
									</h4>
									<p style={{ marginTop: 6, color: "var(--fg-3)" }}>
										Mid-period rate changes split automatically. No more
										pro-rating in spreadsheets at 9pm on the last day of the
										month.
									</p>
								</div>
								<div>
									<h4
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
										}}
									>
										<span className="bento-icon" style={{ marginBottom: 0 }}>
											<FileText size={16} />
										</span>
										Payslips that pass an audit
									</h4>
									<p style={{ marginTop: 6, color: "var(--fg-3)" }}>
										Localized statutory references, deductions broken out by
										line, employer contributions clearly separated. Export PDF
										or push to employee portal.
									</p>
								</div>
							</div>
						</div>

						{/* Right: country card with interactive tabs */}
						<div className="country-card">
							<div className="country-tabs">
								{(
									[
										{ cc: "GY", label: "Guyana" },
										{ cc: "TT", label: "Trinidad & Tobago" },
										{ cc: "BB", label: "Barbados" },
										{ cc: "JM", label: "Jamaica" },
										{ cc: "US", label: "US" },
										{ cc: "GB", label: "UK" },
									] as const
								).map(({ cc, label }) => (
									<button
										className={
											activeCountry === cc
												? "country-tab active"
												: "country-tab"
										}
										key={cc}
										onClick={() => setActiveCountry(cc)}
										type="button"
									>
										<Flag cc={cc} />
										{label}
									</button>
								))}
							</div>

							<div className="country-body">
								{/* Country header */}
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "flex-start",
										marginBottom: 14,
									}}
								>
									<div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-3)",
												letterSpacing: "0.06em",
												textTransform: "uppercase",
											}}
										>
											{countryData.name} · gross
										</div>
										<div
											className="mono"
											style={{
												fontSize: 28,
												fontWeight: 600,
												letterSpacing: "-0.025em",
											}}
										>
											{countryData.cur} {countryData.gross}
										</div>
									</div>
									<span className="badge">
										<span
											className="badge-dot"
											style={{ background: "var(--accent)" }}
										/>
										{countryData.cur}
									</span>
								</div>

								{/* Line items */}
								{countryData.lines.map(([key, val]) => (
									<div className="country-row" key={key}>
										<span className="muted">{key}</span>
										<span className="v">{val}</span>
									</div>
								))}

								{/* Net pay total */}
								<div className="country-total">
									<div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-3)",
												letterSpacing: "0.06em",
												textTransform: "uppercase",
											}}
										>
											Net pay
										</div>
										<div
											className="mono"
											style={{
												fontSize: 22,
												fontWeight: 600,
												color: "var(--accent)",
												marginTop: 4,
											}}
										>
											{countryData.cur} {countryData.net}
										</div>
									</div>
									<div style={{ textAlign: "right" }}>
										<div style={{ fontSize: 11, color: "var(--fg-3)" }}>
											{countryData.contrib}
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-4)",
												marginTop: 4,
											}}
										>
											{countryData.note}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ═══════════ COMPLIANCE ═══════════ */}
			<section
				className="section reveal"
				id="compliance"
				style={{
					background: "var(--bg-1)",
					borderTop: "1px solid var(--line)",
					borderBottom: "1px solid var(--line)",
				}}
			>
				<div className="container">
					<div className="section-eyebrow">Compliance &amp; audit</div>
					<h2>Operations you can defend in writing.</h2>
					<p className="section-sub">
						Every change is captured. Every payroll is reproducible. Auditors
						get one URL.
					</p>

					<div className="grid-3">
						<div className="step-card">
							<div className="step-num">01</div>
							<h4>Immutable event log</h4>
							<p>
								Every approval, override and edit is captured with operator, IP,
								jurisdiction and reason. Never overwritten.
							</p>
						</div>
						<div className="step-card">
							<div className="step-num">02</div>
							<h4>Reproducible pay runs</h4>
							<p>
								Re-run any historical period against its exact country profile
								version. Differences are explained, never hidden.
							</p>
						</div>
						<div className="step-card">
							<div className="step-num">03</div>
							<h4>Risk indicators, surfaced</h4>
							<p>
								Missing documents, expired contracts, attendance anomalies and
								approval breaks — surfaced before they become findings.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* ═══════════ CTA ═══════════ */}
			<section className="container">
				<div className="cta">
					<div className="cta-inner">
						<h2>Run payroll like you run your company.</h2>
						<p>
							Heimdallone is in private preview. Operations teams running across
							two or more countries get priority access.
						</p>
						<div className="cta-actions">
							<Link className="btn btn-primary btn-lg btn-shimmer" to="/login">
								<span>Request preview</span>
								<span>
									<ArrowRight size={14} />
								</span>
							</Link>
							<Link className="btn btn-outline btn-lg" to="/app">
								View live demo
							</Link>
						</div>
					</div>
				</div>
			</section>

			{/* ═══════════ FOOTER ═══════════ */}
			<footer className="footer">
				<div className="container">
					<div className="footer-grid">
						<div className="footer-col">
							<Link
								className="h-logo"
								style={{ marginBottom: 16, display: "inline-flex" }}
								to="/"
							>
								<span className="h-logo-mark">
									<HeimdallLogo size={22} />
								</span>
								<span>Heimdallone</span>
							</Link>
							<p
								style={{
									fontSize: 13,
									color: "var(--fg-3)",
									maxWidth: 280,
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
							<Link to="/pricing">Pricing</Link>
						</div>
						<div className="footer-col">
							<h5>Solutions</h5>
							<a href="/">For operations</a>
							<a href="/">For finance</a>
							<a href="/">For HR leaders</a>
							<a href="/">Multi-tenant</a>
						</div>
						<div className="footer-col">
							<h5>Resources</h5>
							<Link to="/docs">Documentation</Link>
							<Link to="/docs">Changelog</Link>
							<a href="/">Status</a>
							<a href="/">Security</a>
						</div>
						<div className="footer-col">
							<h5>Company</h5>
							<a href="/">About</a>
							<a href="/">Careers</a>
							<a href="/">Contact</a>
							<a href="/">Privacy</a>
						</div>
					</div>
					<div className="footer-meta">
						<div>© 2026 Heimdallone. All rights reserved.</div>
						<div className="mono">v0.4.0-preview · build #1148</div>
					</div>
				</div>
			</footer>

			{/* ═══════════ TWEAK STRIP ═══════════ */}
			<div className={tweakVisible ? "tweak-strip visible" : "tweak-strip"}>
				<span className="tweak-label">Hero</span>
				<div className="seg">
					{(["centered", "split", "editorial"] as const).map((v) => (
						<button
							className={heroVariant === v ? "active" : ""}
							key={v}
							onClick={() => {
								setHeroVariant(v);
								countAnimated.current = false;
							}}
							type="button"
						>
							{v.charAt(0).toUpperCase() + v.slice(1)}
						</button>
					))}
				</div>
				<div className="tweak-sep" />
				<span className="tweak-label">Accent</span>
				<div className="seg">
					<button
						className={accentKey === "gold" ? "active" : ""}
						onClick={() => handleAccent("gold")}
						style={{ background: "#7986cb", color: "#0a0d18" }}
						type="button"
					>
						Navy
					</button>
					<button
						className={accentKey === "violet" ? "active" : ""}
						onClick={() => handleAccent("violet")}
						style={{
							background: "rgba(124,92,255,0.18)",
							color: "#b8a0ff",
						}}
						type="button"
					>
						Violet
					</button>
					<button
						className={accentKey === "green" ? "active" : ""}
						onClick={() => handleAccent("green")}
						style={{
							background: "rgba(61,220,151,0.18)",
							color: "#3ddc97",
						}}
						type="button"
					>
						Green
					</button>
					<button
						className={accentKey === "blue" ? "active" : ""}
						onClick={() => handleAccent("blue")}
						style={{
							background: "rgba(96,165,250,0.18)",
							color: "#60a5fa",
						}}
						type="button"
					>
						Blue
					</button>
				</div>
			</div>
		</div>
	);
}
