import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	Calendar,
	Check,
	ChevronDown,
	Database,
	Download,
	FileText,
	Filter,
	Globe,
	Info,
	Key,
	Search,
	ShieldCheck,
	TrendingDown,
	TrendingUp,
	User,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { PreviewBanner } from "@/components/preview-banner";

export const Route = createFileRoute("/app/compliance")({
	component: CompliancePage,
});

type TabId = "all" | "approvals" | "payroll" | "hr" | "security" | "findings";

function CompliancePage() {
	const [activeTab, setActiveTab] = useState<TabId>("all");

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Atlas Shipping</span>
						<span className="sep">/</span>
						<span>Compliance</span>
					</div>
					<h1 className="page-title">Compliance &amp; audit ledger</h1>
					<p className="page-sub">
						Sample/demo data · example findings · illustrative audit ledger —
						not a live compliance record
					</p>
				</div>
				<div
					style={{
						display: "flex",
						gap: "8px",
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<button className="btn btn-outline" type="button">
						<Filter size={13} />
						Filter
					</button>
					<button
						className="btn btn-outline"
						disabled
						title="Preview only — not wired to a backend"
						type="button"
					>
						<Download size={13} />
						Export (preview)
					</button>
					<button
						className="btn btn-primary"
						disabled
						title="Preview only — not wired to a backend"
						type="button"
					>
						<ShieldCheck size={13} />
						Evidence pack (preview)
					</button>
				</div>
			</div>
			<PreviewBanner module="this compliance dashboard" />

			{/* KPI row */}
			<div className="kpi-row">
				<div className="kpi">
					<div className="l">
						Compliance score
						<span className="ic">
							<ShieldCheck size={12} />
						</span>
					</div>
					<div className="v" style={{ color: "var(--success)" }}>
						98
						<span style={{ fontSize: "14px", color: "var(--fg-3)" }}>/100</span>
					</div>
					<div className="sub">
						<span className="up">▲ +2</span> vs August · within SLA
					</div>
				</div>

				<div className="kpi">
					<div className="l">
						Open findings
						<span className="ic">
							<AlertTriangle size={12} />
						</span>
					</div>
					<div className="v">3</div>
					<div className="sub">
						<span className="danger">1 blocking</span> · 2 advisory · oldest 4d
					</div>
				</div>

				<div className="kpi">
					<div className="l">
						Events captured · 30d
						<span className="ic">
							<Activity size={12} />
						</span>
					</div>
					<div className="v">14,820</div>
					<div className="sub">payroll 38% · HR 24% · sec 18%</div>
				</div>

				<div className="kpi">
					<div className="l">
						Risk score
						<span className="ic">
							<TrendingDown size={12} />
						</span>
					</div>
					<div className="risk-meter">
						<span className="v" style={{ fontSize: "24px" }}>
							Low
						</span>
						<span
							style={{
								fontFamily: "'JetBrains Mono', monospace",
								fontSize: "13px",
								color: "var(--fg-3)",
							}}
						>
							14 / 100
						</span>
					</div>
					<div className="risk-bar">
						<div className="risk-bar-fill" />
						<div className="risk-bar-mark" style={{ left: "14%" }} />
					</div>
				</div>
			</div>

			<div className="comp-grid">
				{/* LEFT: event stream */}
				<div className="event-card">
					<div className="event-head">
						<div className="tabs tabs-pill" role="tablist">
							<button
								aria-selected={activeTab === "all"}
								className="tab"
								onClick={() => setActiveTab("all")}
								role="tab"
								type="button"
							>
								All <span className="count">14,820</span>
							</button>
							<button
								aria-selected={activeTab === "approvals"}
								className="tab"
								onClick={() => setActiveTab("approvals")}
								role="tab"
								type="button"
							>
								Approvals <span className="count">428</span>
							</button>
							<button
								aria-selected={activeTab === "payroll"}
								className="tab"
								onClick={() => setActiveTab("payroll")}
								role="tab"
								type="button"
							>
								Payroll <span className="count">5,612</span>
							</button>
							<button
								aria-selected={activeTab === "hr"}
								className="tab"
								onClick={() => setActiveTab("hr")}
								role="tab"
								type="button"
							>
								HR <span className="count">3,604</span>
							</button>
							<button
								aria-selected={activeTab === "security"}
								className="tab"
								onClick={() => setActiveTab("security")}
								role="tab"
								type="button"
							>
								Security <span className="count">182</span>
							</button>
							<button
								aria-selected={activeTab === "findings"}
								className="tab"
								onClick={() => setActiveTab("findings")}
								role="tab"
								type="button"
							>
								Findings <span className="count">3</span>
							</button>
						</div>
						<div
							style={{
								marginLeft: "auto",
								display: "flex",
								alignItems: "center",
								gap: "8px",
							}}
						>
							<button className="btn btn-ghost btn-sm" type="button">
								<Calendar size={11} />
								Last 30 days
								<ChevronDown size={11} />
							</button>
						</div>
					</div>

					<div className="event-filter">
						<div className="search-wrap">
							<span className="icon-l">
								<Search size={14} />
							</span>
							<input
								className="search"
								placeholder="Search events by actor, object, IP, run, payslip…"
							/>
						</div>
						<button className="filter-chip active" type="button">
							<Globe size={11} />
							Country <span className="v">GY · TT</span>
						</button>
						<button className="filter-chip" type="button">
							<User size={11} />
							Actor
						</button>
						<button className="filter-chip" type="button">
							<AlertTriangle size={11} />
							Severity
						</button>
					</div>

					<div className="event-list">
						{/* All events tab */}
						{activeTab === "all" && (
							<div>
								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										14:42:08
									</div>
									<div className="event-icon system">
										<Database size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">HR sync</span> ingested{" "}
											<span className="object">1,284 records</span> from Horilla
										</div>
										<div className="meta">
											tenant=atlas-shipping · checksum=8f2a1c4d ·
											ledger#2026-Q3-219
										</div>
									</div>
									<div>
										<span className="cat-pill">system</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										14:31:04
									</div>
									<div className="event-icon approval">
										<Check size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Sasha B.</span> verified{" "}
											<span className="object">GY pay run · September</span> ·
											finance
										</div>
										<div className="meta">
											step 3/5 · IP 198.51.100.42 · session sess_8f2a
										</div>
									</div>
									<div>
										<span className="cat-pill">approval</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										14:18:33
									</div>
									<div className="event-icon approval">
										<Check size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Lia Roberts</span> reviewed{" "}
											<span className="object">GY pay run · September</span> ·
											HR
										</div>
										<div className="meta">
											step 2/5 · IP 198.51.100.18 · session sess_e2bc
										</div>
									</div>
									<div>
										<span className="cat-pill">approval</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										14:08:12
									</div>
									<div className="event-icon payroll">
										<Wallet size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Maya Persaud</span> sealed{" "}
											<span className="object">BB pay run · September</span>
										</div>
										<div className="meta">
											BBD 412,600 · 88 employees · hash 4c2e9a8f · run_id
											pr_bb_2026_09
										</div>
									</div>
									<div>
										<span className="cat-pill">payroll</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										13:42:51
									</div>
									<div className="event-icon hr">
										<FileText size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Sasha B.</span> uploaded{" "}
											<span className="object">TRN document</span> for employee
											EMP-00302
										</div>
										<div className="meta">
											PDF · 184KB · sha-256: a8c4...d2f0
										</div>
									</div>
									<div>
										<span className="cat-pill">hr</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										13:30:08
									</div>
									<div className="event-icon payroll">
										<AlertTriangle size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">System</span> staged{" "}
											<span className="object">gy.v2026.2</span> — NIS rate
											change detected
										</div>
										<div className="meta">
											source: gazette/gy/2026-08-22 · effective 2026-10-01 ·
											5.6% → 6.0%
										</div>
									</div>
									<div>
										<span className="cat-pill">payroll</span>
									</div>
									<div className="sev med">advisory</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										11:18:42
									</div>
									<div className="event-icon hr">
										<Users size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Lia Roberts</span> created
											employee record{" "}
											<span className="object">EMP-00814 · Lia Roberts</span>
										</div>
										<div className="meta">
											department=HR · country=GY · contract=permanent ·
											joined=2026-09-27
										</div>
									</div>
									<div>
										<span className="cat-pill">hr</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 27</div>
										09:14:02
									</div>
									<div className="event-icon security">
										<Key size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Unknown actor</span> failed
											sign-in · IP <span className="object">203.0.113.42</span>{" "}
											· 4 attempts in 60s
										</div>
										<div className="meta">
											geo=Caracas, VE · auto-blocked · ip_block_id ipb_19f2
										</div>
									</div>
									<div>
										<span className="cat-pill">security</span>
									</div>
									<div className="sev high">high</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 26</div>
										23:00:00
									</div>
									<div className="event-icon system">
										<ShieldCheck size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Audit ledger</span> sealed daily
											batch <span className="object">ledger#2026-Q3-218</span>
										</div>
										<div className="meta">
											prev_hash 7e8d...c2a4 · this_hash 8f2a...1c4d · 2,148
											events
										</div>
									</div>
									<div>
										<span className="cat-pill">system</span>
									</div>
									<div className="sev low">info</div>
								</div>

								<div className="event-row">
									<div className="time">
										<div className="date">Sep 26</div>
										17:24:11
									</div>
									<div className="event-icon hr">
										<TrendingUp size={14} />
									</div>
									<div className="desc">
										<div>
											<span className="actor">Maya Persaud</span> updated salary
											for{" "}
											<span className="object">EMP-00302 · Shanice Powell</span>
										</div>
										<div className="meta">
											+8.4% retroactive · effective 2026-09-15 · justification
											attached (jus_28c1)
										</div>
									</div>
									<div>
										<span className="cat-pill">hr</span>
									</div>
									<div className="sev med">advisory</div>
								</div>
							</div>
						)}

						{/* Findings tab */}
						{activeTab === "findings" && (
							<div style={{ padding: "16px", display: "grid", gap: "10px" }}>
								<div className="finding crit">
									<div className="top">
										<div className="ic">
											<AlertTriangle size={14} />
										</div>
										<div>
											<div className="ttl">
												2 employees missing TRN · Jamaica
											</div>
											<div className="desc">
												Tax Registration Number missing for 2 employees in
												Jamaica. Blocks JM pay-run commit. Last reminder sent
												Mon 25 Sep.
											</div>
											<div className="meta">
												<span>finding#F-2026-024</span>
												<span className="dot">·</span>
												<span>opened 4d ago</span>
												<span className="dot">·</span>
												<span>owner hr@</span>
												<span className="dot">·</span>
												<span style={{ color: "var(--danger)" }}>blocking</span>
											</div>
										</div>
									</div>
									<div className="actions">
										<button className="btn btn-outline btn-sm" type="button">
											View employees
										</button>
										<button className="btn btn-ghost btn-sm" type="button">
											Snooze 24h
										</button>
										<button className="btn btn-primary btn-sm" type="button">
											Resolve
										</button>
									</div>
								</div>

								<div className="finding warn">
									<div className="top">
										<div className="ic">
											<AlertTriangle size={14} />
										</div>
										<div>
											<div className="ttl">
												NIS rate change advisory · Guyana
											</div>
											<div className="desc">
												New employer rate effective 2026-10-01. Profile
												gy.v2026.2 staged. Approve before next pay period to
												avoid mid-month split.
											</div>
											<div className="meta">
												<span>finding#F-2026-025</span>
												<span className="dot">·</span>
												<span>opened today</span>
												<span className="dot">·</span>
												<span>owner finance@</span>
												<span className="dot">·</span>
												<span style={{ color: "var(--warning)" }}>
													due in 3 days
												</span>
											</div>
										</div>
									</div>
									<div className="actions">
										<button className="btn btn-outline btn-sm" type="button">
											Review profile
										</button>
										<button className="btn btn-primary btn-sm" type="button">
											Approve
										</button>
									</div>
								</div>

								<div className="finding info">
									<div className="top">
										<div className="ic">
											<Info size={14} />
										</div>
										<div>
											<div className="ttl">14 contracts renew this quarter</div>
											<div className="desc">
												5 in Guyana, 6 in Trinidad &amp; Tobago, 3 in Barbados.
												Renewal pack ready. No action blocks payroll.
											</div>
											<div className="meta">
												<span>finding#F-2026-023</span>
												<span className="dot">·</span>
												<span>advance notice</span>
												<span className="dot">·</span>
												<span>owner hr@</span>
											</div>
										</div>
									</div>
									<div className="actions">
										<button className="btn btn-outline btn-sm" type="button">
											View contracts
										</button>
										<button className="btn btn-ghost btn-sm" type="button">
											Dismiss
										</button>
									</div>
								</div>
							</div>
						)}

						{activeTab === "approvals" && (
							<div
								style={{
									padding: "32px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: "13px",
								}}
							>
								428 approval events in this period. Filter chips above to narrow
								by actor or country.
							</div>
						)}

						{activeTab === "payroll" && (
							<div
								style={{
									padding: "32px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: "13px",
								}}
							>
								5,612 payroll events including computations, reconciliations and
								bank-file generations.
							</div>
						)}

						{activeTab === "hr" && (
							<div
								style={{
									padding: "32px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: "13px",
								}}
							>
								3,604 HR record events including hires, role changes, contract
								renewals, and offboarding.
							</div>
						)}

						{activeTab === "security" && (
							<div
								style={{
									padding: "32px",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: "13px",
								}}
							>
								182 security events including sign-ins, role changes, IP blocks
								and 2FA challenges.
							</div>
						)}
					</div>

					<div className="sealed-banner">
						<div className="left">
							<div className="seal-dot" />
							<span>
								Ledger continuously sealed · hash-chained · last seal{" "}
								<span className="mono">8f2a 1c4d</span> @{" "}
								<span className="mono">23:00 GYT</span>
							</span>
						</div>
						<span className="mono">Showing 10 of 14,820 events</span>
					</div>
				</div>

				{/* RIGHT: side column */}
				<div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
					{/* Evidence pack */}
					<div className="evidence-card">
						<div className="ic-lg">
							<ShieldCheck size={18} />
						</div>
						<div className="ttl">Auditor-ready evidence pack</div>
						<div className="desc">
							One-click export of every approval, computation, override and edit
							for the selected period — PDF + JSON, ready for SOC 2 evidence
							requests.
						</div>
						<div className="info-row">
							<span>
								<Calendar size={11} />
								Period <span className="mono">2026-09</span>
							</span>
							<span>
								<Activity size={11} />
								Events <span className="mono">14,820</span>
							</span>
							<span>
								<Globe size={11} />
								Countries <span className="mono">4</span>
							</span>
						</div>
						<button
							className="btn btn-primary btn-shimmer w-full"
							type="button"
						>
							<span>Generate evidence pack</span>
							<Download size={13} />
						</button>
					</div>

					{/* Document completeness */}
					<div className="side-card">
						<div className="head">
							<span className="ttl">Document completeness</span>
							<span className="badge">
								<span
									className="badge-dot"
									style={{ background: "var(--accent)" }}
								/>
								per country
							</span>
						</div>
						<div className="body">
							<div className="complete-row">
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span>GY</span>
									Guyana
								</span>
								<div className="pb">
									<div className="pb-fill" style={{ width: "99%" }} />
								</div>
								<span className="num">99%</span>
							</div>
							<div className="complete-row">
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span>TT</span>
									Trinidad &amp; Tobago
								</span>
								<div className="pb">
									<div className="pb-fill" style={{ width: "96%" }} />
								</div>
								<span className="num">96%</span>
							</div>
							<div className="complete-row">
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span>BB</span>
									Barbados
								</span>
								<div className="pb">
									<div className="pb-fill" style={{ width: "100%" }} />
								</div>
								<span className="num">100%</span>
							</div>
							<div className="complete-row">
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span>JM</span>
									Jamaica
								</span>
								<div className="pb">
									<div className="warn pb-fill" style={{ width: "87%" }} />
								</div>
								<span className="num">87%</span>
							</div>
							<div className="complete-row">
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span>US</span>
									United States
								</span>
								<div className="pb">
									<div className="pb-fill" style={{ width: "100%" }} />
								</div>
								<span className="num">100%</span>
							</div>
						</div>
					</div>

					{/* Event facets */}
					<div className="side-card">
						<div className="head">
							<span className="ttl">Categories · 30d</span>
							<button
								style={{
									padding: 0,
									fontSize: "11.5px",
									color: "var(--accent)",
									background: "none",
									border: "none",
									cursor: "pointer",
								}}
								type="button"
							>
								Reset
							</button>
						</div>
						<div className="body facets">
							<div className="facet-row">
								<span className="name">
									<span
										className="swatch"
										style={{ background: "var(--accent)" }}
									/>
									Payroll
								</span>
								<span className="ct">5,612</span>
							</div>
							<div className="facet-row">
								<span className="name">
									<span
										className="swatch"
										style={{ background: "var(--info)" }}
									/>
									HR records
								</span>
								<span className="ct">3,604</span>
							</div>
							<div className="facet-row">
								<span className="name">
									<span
										className="swatch"
										style={{ background: "var(--success)" }}
									/>
									Approvals
								</span>
								<span className="ct">428</span>
							</div>
							<div className="facet-row">
								<span className="name">
									<span
										className="swatch"
										style={{ background: "var(--danger)" }}
									/>
									Security
								</span>
								<span className="ct">182</span>
							</div>
							<div className="facet-row">
								<span className="name">
									<span
										className="swatch"
										style={{ background: "var(--fg-3)" }}
									/>
									System
								</span>
								<span className="ct">4,994</span>
							</div>
						</div>
					</div>

					{/* Top actors */}
					<div className="side-card">
						<div className="head">
							<span className="ttl">Top actors · 30d</span>
						</div>
						<div
							className="body"
							style={{ display: "flex", flexDirection: "column", gap: "8px" }}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									fontSize: "12.5px",
								}}
							>
								<div
									style={{
										width: "26px",
										height: "26px",
										borderRadius: "50%",
										background:
											"color-mix(in oklab, var(--accent) 30%, var(--bg-3))",
										color: "var(--fg)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "10px",
										fontWeight: "600",
									}}
								>
									MP
								</div>
								<div style={{ flex: 1 }}>
									<div>Maya Persaud</div>
									<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
										Ops Lead
									</div>
								</div>
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									2,148
								</span>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									fontSize: "12.5px",
								}}
							>
								<div
									style={{
										width: "26px",
										height: "26px",
										borderRadius: "50%",
										background: "var(--bg-3)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "10px",
										fontWeight: "600",
									}}
								>
									SB
								</div>
								<div style={{ flex: 1 }}>
									<div>Sasha B.</div>
									<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
										Finance Lead
									</div>
								</div>
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									1,724
								</span>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									fontSize: "12.5px",
								}}
							>
								<div
									style={{
										width: "26px",
										height: "26px",
										borderRadius: "50%",
										background: "var(--bg-3)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "10px",
										fontWeight: "600",
									}}
								>
									LR
								</div>
								<div style={{ flex: 1 }}>
									<div>Lia Roberts</div>
									<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
										Head of HR
									</div>
								</div>
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									1,386
								</span>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									fontSize: "12.5px",
								}}
							>
								<div
									style={{
										width: "26px",
										height: "26px",
										borderRadius: "50%",
										background: "var(--bg-3)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "10px",
										fontWeight: "600",
									}}
								>
									<Zap size={11} />
								</div>
								<div style={{ flex: 1 }}>
									<div>System</div>
									<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
										automated
									</div>
								</div>
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									4,994
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
