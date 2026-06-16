import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Moon, Sun, User } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

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
		} catch {
			// localStorage may be unavailable (private mode); persistence is best-effort.
		}
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

// Google "G" mark (kept inline so we don't pull in an icon dependency).
function GoogleMark({ size = 16 }: { size?: number }) {
	return (
		<svg
			aria-hidden="true"
			height={size}
			viewBox="0 0 18 18"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
				fill="#4285F4"
			/>
			<path
				d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
				fill="#34A853"
			/>
			<path
				d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
				fill="#FBBC05"
			/>
			<path
				d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				credentials: "include",
			});
			if (!res.ok) {
				setError("Incorrect email or password. Please try again.");
				setLoading(false);
				return;
			}
			window.location.href = "/app";
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	};

	const signInGoogle = async () => {
		setError(null);
		setGoogleLoading(true);
		try {
			// Absolute callback to THIS app origin. The auth server lives on a
			// different subdomain (api.), so a relative "/app" would resolve to
			// api./app (404). window.location.origin keeps it correct per host.
			const callbackURL = `${window.location.origin}/app`;
			const res = await fetch("/api/auth/sign-in/social", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL }),
				credentials: "include",
			});
			const data = await res.json();
			if (data?.url) {
				window.location.href = data.url;
				return;
			}
			setError("Could not start Google sign-in. Please try again.");
			setGoogleLoading(false);
		} catch {
			setError("Could not start Google sign-in. Please try again.");
			setGoogleLoading(false);
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
							Workforce operating system
						</div>
						<h1>
							One sign-in for your
							<br />
							entire <em>workforce</em>.
						</h1>
						<p>
							HR, payroll, attendance, leave, contracts and assets — one
							role-aware platform for every team, location and country you
							operate in.
						</p>

						<ul className="login-points">
							<li>Multi-tenant organisations with role-scoped access</li>
							<li>Country-aware payroll &amp; statutory rules</li>
							<li>Biometric attendance &amp; leave built in</li>
							<li>Audit trail on every action</li>
						</ul>
					</div>

					<div className="footer-row">
						<span>Secure by design · role-based access control</span>
					</div>
				</div>
			</aside>

			{/* RIGHT form */}
			<main className="login-right">
				<div className="login-form-wrap">
					<h2>Welcome back</h2>
					<p className="sub">Sign in to continue to Heimdallone.</p>

					<button
						className="sso-btn sso-btn-primary"
						disabled={googleLoading}
						onClick={signInGoogle}
						type="button"
					>
						<GoogleMark size={16} />
						{googleLoading ? "Redirecting…" : "Continue with Google"}
					</button>

					<div className="divider-or">or sign in with email</div>

					{error ? (
						<div className="login-error" role="alert">
							{error}
						</div>
					) : null}

					<form onSubmit={handleSubmit}>
						<div className="field">
							<label className="label" htmlFor="login-email">
								Work email
							</label>
							<div className="input-with-icon">
								<span className="icon-l">
									<User size={14} />
								</span>
								<input
									autoComplete="email"
									className="input"
									id="login-email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@company.com"
									required
									type="email"
									value={email}
								/>
							</div>
						</div>
						<div className="field">
							<label className="label" htmlFor="login-password">
								Password
							</label>
							<div className="input-with-icon">
								<span className="icon-l">
									<Lock size={14} />
								</span>
								<input
									autoComplete="current-password"
									className="input"
									id="login-password"
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

					<p className="legal">
						Trouble signing in? Contact your workspace administrator.
					</p>
				</div>

				<div className="footer-row">
					<ThemeToggle />
					<span className="mono">Heimdallone v2</span>
				</div>
			</main>
		</div>
	);
}
