import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	Building,
	Fingerprint,
	Key,
	Lock,
	Moon,
	Sun,
	User,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: LoginPage,
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
				data-theme="dark"
				onClick={() => toggle("dark")}
				title="Dark"
				type="button"
			>
				<Moon size={14} />
			</button>
			<button
				className={theme === "light" ? "active" : ""}
				data-theme="light"
				onClick={() => toggle("light")}
				title="Light"
				type="button"
			>
				<Sun size={14} />
			</button>
		</div>
	);
}

function LoginPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const res = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				credentials: "include",
			});
			if (!res.ok) {
				setLoading(false);
				return;
			}
			window.location.href = "/app";
		} catch {
			setLoading(false);
		}
	};

	return (
		<div className="login-grid">
			{/* LEFT visual */}
			<aside className="login-left">
				<div className="login-left-inner">
					<Link className="h-logo" style={{ fontSize: "16px" }} to="/">
						<span className="h-logo-mark">
							<HeimdallLogo size={24} />
						</span>
						<span>Heimdallone</span>
					</Link>

					<div className="login-hero">
						<div className="eyebrow" style={{ marginBottom: "16px" }}>
							Workforce command center
						</div>
						<h1>
							Sign in to run
							<br />
							your <em>operations</em>.
						</h1>
						<p>
							One sign-in for every tenant. Role-scoped data, country-aware
							defaults, audit trail on every action.
						</p>

						<div className="status-card">
							<div className="status-row">
								<span className="l">
									<span className="ok-dot" />
									Payroll engine
								</span>
								<span className="v">Operational</span>
							</div>
							<div className="status-row">
								<span className="l">
									<span className="ok-dot" />
									Attendance ingest
								</span>
								<span className="v">Operational</span>
							</div>
							<div className="status-row">
								<span className="l">
									<span
										className="ok-dot"
										style={{
											background: "var(--warning)",
											boxShadow: "0 0 0 3px var(--warning-soft)",
										}}
									/>
									JM tax tables
								</span>
								<span className="v">v2026.1 staged</span>
							</div>
							<div className="status-row">
								<span className="l">
									<span className="ok-dot" />
									Audit ledger
								</span>
								<span className="v">Sealed · 14:42</span>
							</div>
						</div>
					</div>

					<div className="footer-row">
						<span>SOC 2 Type II · ISO 27001</span>
						<span className="mono">status.heimdallone.app</span>
					</div>
				</div>
			</aside>

			{/* RIGHT form */}
			<main className="login-right">
				<div className="login-right-top">
					<div />
					<div className="right-link">
						New here? <a href="#">Request access →</a>
					</div>
				</div>

				<div className="login-form-wrap">
					<h2>Welcome back</h2>
					<p className="sub">Sign in to continue to Heimdallone.</p>

					<div className="org-hint">
						<div className="tenant-avatar">AS</div>
						<div>
							<div className="org-name">Atlas Shipping</div>
							<div className="org-sub">
								atlas-shipping.heimdallone.app · GY · TT
							</div>
						</div>
						<div className="switch">Switch</div>
					</div>

					<form onSubmit={handleSubmit}>
						<div className="field">
							<label className="label">Work email</label>
							<div className="input-with-icon">
								<span className="icon-l">
									<User size={14} />
								</span>
								<input
									autoComplete="email"
									className="input"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@atlas-shipping.com"
									required
									type="email"
									value={email}
								/>
							</div>
						</div>
						<div className="field">
							<div className="field-row">
								<label className="label">Password</label>
								<a href="#">Forgot?</a>
							</div>
							<div className="input-with-icon">
								<span className="icon-l">
									<Lock size={14} />
								</span>
								<input
									autoComplete="current-password"
									className="input"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									required
									type="password"
									value={password}
								/>
							</div>
						</div>

						<button
							className="btn btn-primary login-btn"
							disabled={loading}
							type="submit"
						>
							{loading ? "Signing in…" : "Sign in"} <ArrowRight size={14} />
						</button>
					</form>

					<div className="divider-or">or continue with</div>

					<div className="sso-row">
						<button className="sso-btn" type="button">
							<Key size={14} />
							SSO
						</button>
						<button className="sso-btn" type="button">
							<Building size={14} />
							Google Workspace
						</button>
						<button className="sso-btn" type="button">
							<Fingerprint size={14} />
							Passkey
						</button>
					</div>

					<p className="legal">
						By continuing you agree to the <a href="#">Terms</a> and{" "}
						<a href="#">Privacy Policy</a>.
					</p>
				</div>

				<div className="footer-row">
					<ThemeToggle />
					<span className="mono">v0.4.0-preview</span>
				</div>
			</main>
		</div>
	);
}
