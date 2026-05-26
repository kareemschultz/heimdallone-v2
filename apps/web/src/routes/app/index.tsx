import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	ArrowUp,
	ArrowUpRight,
	Calendar,
	Check,
	ChevronDown,
	Clock,
	Database,
	FileText,
	Info,
	MoreHorizontal,
	Plus,
	ShieldCheck,
	User,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/")({
	component: DashboardPage,
});

const ATTEND_PATTERN = [
	0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4, 3, 2, 4, 4, 4, 4, 3, 2, 1, 1, 0, 0,
];
const ATTEND_DAYS = 5;

const HC_MONTHS = [
	"Oct",
	"Nov",
	"Dec",
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
];
const HC_HEIGHTS = [62, 65, 64, 70, 72, 70, 78, 82, 86, 88, 92, 100];

type Layout = "balanced" | "command" | "briefing";

function DashboardPage() {
	const [layout, setLayout] = useState<Layout>("balanced");
	const [activityTab, setActivityTab] = useState<
		"all" | "you" | "approvals" | "system"
	>("all");

	return (
		<div className="page dash" data-layout={layout}>
			{/* Page header */}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Atlas Shipping</span>
						<span className="sep">/</span>
						<span>Overview</span>
					</div>
					<h1 className="page-title">Good afternoon, Maya.</h1>
					<p className="page-sub">
						Tuesday, 27 September 2026 · 14:42 GYT · 1,196 of 1,284 on duty
					</p>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button className="date-pill" type="button">
						<Calendar size={13} />
						Last 30 days
						<ChevronDown size={12} />
					</button>
					<div className="layout-pills">
						{(["balanced", "command", "briefing"] as const).map((v) => (
							<button
								className={layout === v ? "active" : ""}
								data-layout={v}
								key={v}
								onClick={() => setLayout(v)}
								type="button"
							>
								{v.charAt(0).toUpperCase() + v.slice(1)}
							</button>
						))}
					</div>
					<button className="btn btn-primary" type="button">
						<Plus size={13} />
						Quick action
					</button>
				</div>
			</div>

			{/* KPI row (balanced + command variants) */}
			<div className="kpi-row">
				<div className="kpi">
					<div className="kpi-head">
						<span className="kpi-label">Headcount</span>
						<span className="kpi-icon">
							<Users size={14} />
						</span>
					</div>
					<div className="kpi-value tabular">1,284</div>
					<div className="kpi-meta">
						<span className="stat-delta up">
							<ArrowUp size={11} />
							+24
						</span>
						<span className="dim">this quarter</span>
					</div>
				</div>
				<div className="kpi">
					<div className="kpi-head">
						<span className="kpi-label">On duty today</span>
						<span className="kpi-icon">
							<Clock size={14} />
						</span>
					</div>
					<div className="kpi-value tabular">
						1,196
						<span style={{ fontSize: "16px", color: "var(--fg-3)" }}>
							/ 1,284
						</span>
					</div>
					<div className="kpi-meta">
						<span
							className="badge badge-success"
							style={{ height: "18px", padding: "0 6px", fontSize: "10.5px" }}
						>
							93.1%
						</span>
						<span className="dim">28 late · 14 absent · 46 leave</span>
					</div>
				</div>
				<div className="kpi">
					<div className="kpi-head">
						<span className="kpi-label">Open approvals</span>
						<span className="kpi-icon">
							<Check size={14} />
						</span>
					</div>
					<div className="kpi-value tabular">12</div>
					<div className="kpi-meta">
						<span style={{ color: "var(--warning)" }}>4 leave</span>
						<span className="dim">· 5 OT · 3 contract</span>
					</div>
				</div>
				<div className="kpi">
					<div className="kpi-head">
						<span className="kpi-label">Compliance score</span>
						<span className="kpi-icon">
							<ShieldCheck size={14} />
						</span>
					</div>
					<div
						className="kpi-value tabular"
						style={{ color: "var(--success)" }}
					>
						98
						<span style={{ fontSize: "16px", color: "var(--fg-3)" }}>/100</span>
					</div>
					<div className="kpi-meta">
						<span className="stat-delta up">
							<ArrowUp size={11} />
							+2
						</span>
						<span className="dim">vs last month</span>
					</div>
				</div>
			</div>

			{/* Layout grid */}
			<div className="layout-grid">
				{/* BRIEFING variant hero */}
				<div className="briefing-hero">
					<div>
						<div className="eyebrow">Today's briefing</div>
						<h2
							style={{
								fontSize: "36px",
								lineHeight: 1.05,
								marginTop: "8px",
								maxWidth: "580px",
								letterSpacing: "-0.03em",
							}}
						>
							Two pay runs ready to commit. Three compliance items to clear
							before Friday.
						</h2>
						<p
							style={{
								marginTop: "16px",
								maxWidth: "540px",
								color: "var(--fg-2)",
								fontSize: "15px",
							}}
						>
							GY September is at 96% readiness. TT August has one outstanding
							NIS reconciliation. Attendance for the week is on track at 93.1% —
							above your 90% threshold.
						</p>
						<div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
							<Link className="btn btn-primary" to="/app/payroll">
								Open payroll
								<ArrowRight size={13} />
							</Link>
							<button className="btn btn-outline" type="button">
								Review compliance
							</button>
						</div>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: "12px",
							position: "relative",
							zIndex: 1,
						}}
					>
						<div
							className="card card-pad"
							style={{ background: "var(--bg-2)" }}
						>
							<div className="tiny">Headcount</div>
							<div className="stat-value" style={{ marginTop: "6px" }}>
								1,284
							</div>
							<div className="stat-delta up" style={{ marginTop: "6px" }}>
								<ArrowUp size={11} />
								+24 QoQ
							</div>
						</div>
						<div
							className="card card-pad"
							style={{ background: "var(--bg-2)" }}
						>
							<div className="tiny">Pay-run total</div>
							<div
								className="stat-value"
								style={{ marginTop: "6px", color: "var(--accent)" }}
							>
								USD 1.84M
							</div>
							<div
								className="dim"
								style={{ marginTop: "6px", fontSize: "11.5px" }}
							>
								Across 7 countries
							</div>
						</div>
						<div
							className="card card-pad"
							style={{ background: "var(--bg-2)" }}
						>
							<div className="tiny">Leave liability</div>
							<div className="stat-value" style={{ marginTop: "6px" }}>
								USD 412k
							</div>
							<div
								className="dim"
								style={{ marginTop: "6px", fontSize: "11.5px" }}
							>
								~ 8.4 days/employee
							</div>
						</div>
						<div
							className="card card-pad"
							style={{ background: "var(--bg-2)" }}
						>
							<div className="tiny">Turnover risk</div>
							<div
								className="stat-value"
								style={{ marginTop: "6px", color: "var(--warning)" }}
							>
								Low
							</div>
							<div
								className="dim"
								style={{ marginTop: "6px", fontSize: "11.5px" }}
							>
								3 watchlist · 0 critical
							</div>
						</div>
					</div>
				</div>

				{/* Command variant uses left-col / right-col wrappers */}
				<div className="left-col" data-only="command" />

				{/* ----- Payroll readiness ----- */}
				<section className="widget w-payroll">
					<div className="widget-head">
						<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
							<span className="widget-title">Payroll readiness</span>
							<span className="badge badge-accent">
								<span className="badge-dot" />2 ready
							</span>
						</div>
						<Link className="btn btn-ghost btn-sm" to="/app/payroll">
							Open
							<ArrowUpRight size={11} />
						</Link>
					</div>
					<div className="widget-body" style={{ padding: "4px 18px 6px" }}>
						<div className="payrun-row">
							<span className="flag" title="GY">
								GY
							</span>
							<div className="country-name">
								<span>Guyana</span>
								<span className="dim">GYD</span>
							</div>
							<div className="progress-cell">
								<div className="pbar">
									<div className="pbar-fill" style={{ width: "96%" }} />
								</div>
								<span className="pct">96% · 12 of 12 checks</span>
							</div>
							<span className="amount tabular">184,720,400</span>
							<span
								className="badge badge-accent"
								style={{ justifySelf: "end" }}
							>
								<span className="badge-dot" />
								Ready
							</span>
							<button className="btn btn-sm btn-outline" type="button">
								Approve
							</button>
						</div>
						<div className="payrun-row">
							<span className="flag" title="TT">
								TT
							</span>
							<div className="country-name">
								<span>Trinidad &amp; Tobago</span>
								<span className="dim">TTD</span>
							</div>
							<div className="progress-cell">
								<div className="pbar">
									<div className="pbar-fill warning" style={{ width: "78%" }} />
								</div>
								<span className="pct">78% · NIS reconciliation pending</span>
							</div>
							<span className="amount tabular">2,140,820</span>
							<span
								className="badge badge-warning"
								style={{ justifySelf: "end" }}
							>
								<span className="badge-dot" />
								Review
							</span>
							<button className="btn btn-sm btn-outline" type="button">
								Open
							</button>
						</div>
						<div className="payrun-row">
							<span className="flag" title="BB">
								BB
							</span>
							<div className="country-name">
								<span>Barbados</span>
								<span className="dim">BBD</span>
							</div>
							<div className="progress-cell">
								<div className="pbar">
									<div className="pbar-fill" style={{ width: "100%" }} />
								</div>
								<span className="pct">100% · Approved 14:08</span>
							</div>
							<span className="amount tabular">412,600</span>
							<span
								className="badge badge-success"
								style={{ justifySelf: "end" }}
							>
								<span className="badge-dot" />
								Sealed
							</span>
							<button className="btn btn-sm btn-ghost" type="button">
								View
							</button>
						</div>
						<div className="payrun-row">
							<span className="flag" title="JM">
								JM
							</span>
							<div className="country-name">
								<span>Jamaica</span>
								<span className="dim">JMD</span>
							</div>
							<div className="progress-cell">
								<div className="pbar">
									<div className="pbar-fill" style={{ width: "84%" }} />
								</div>
								<span className="pct">84% · 2 employees missing TRN</span>
							</div>
							<span className="amount tabular">38,420,000</span>
							<span
								className="badge badge-warning"
								style={{ justifySelf: "end" }}
							>
								<span className="badge-dot" />
								Action
							</span>
							<button className="btn btn-sm btn-outline" type="button">
								Resolve
							</button>
						</div>
						<div className="payrun-row">
							<span className="flag" title="US">
								US
							</span>
							<div className="country-name">
								<span>United States</span>
								<span className="dim">USD</span>
							</div>
							<div className="progress-cell">
								<div className="pbar">
									<div className="pbar-fill" style={{ width: "100%" }} />
								</div>
								<span className="pct">100% · Committed Mon 14:22</span>
							</div>
							<span className="amount tabular">186,200</span>
							<span
								className="badge badge-success"
								style={{ justifySelf: "end" }}
							>
								<span className="badge-dot" />
								Sealed
							</span>
							<button className="btn btn-sm btn-ghost" type="button">
								View
							</button>
						</div>
					</div>
					<div className="widget-foot">
						<span>
							Next commit window:{" "}
							<span className="mono" style={{ color: "var(--fg-2)" }}>
								Fri 29 Sep · 09:00 GYT
							</span>
						</span>
						<span className="mono">Total · USD 1.84M equiv.</span>
					</div>
				</section>

				{/* ----- Compliance alerts ----- */}
				<section className="widget w-alerts">
					<div className="widget-head">
						<span className="widget-title">Compliance &amp; risk</span>
						<span className="badge">
							<span
								className="badge-dot"
								style={{ background: "var(--warning)" }}
							/>
							3 open
						</span>
					</div>
					<div className="widget-body" style={{ paddingTop: "4px" }}>
						<div className="alert-item">
							<div className="alert-icon warn">
								<AlertTriangle size={13} />
							</div>
							<div>
								<div className="alert-title">NIS rate change · Guyana</div>
								<div className="alert-desc">
									New employer rate effective 1 Oct. Profile{" "}
									<span className="mono">v2026.2</span> staged for review.
								</div>
								<div className="alert-meta">due in 3 days · finance@</div>
							</div>
						</div>
						<div className="alert-item">
							<div className="alert-icon danger">
								<AlertTriangle size={13} />
							</div>
							<div>
								<div className="alert-title">
									2 employees missing TRN · Jamaica
								</div>
								<div className="alert-desc">
									Blocks payroll commit. Last reminder sent Mon.
								</div>
								<div className="alert-meta">blocking · hr@</div>
							</div>
						</div>
						<div className="alert-item">
							<div className="alert-icon info">
								<Info size={13} />
							</div>
							<div>
								<div className="alert-title">
									14 contracts renew this quarter
								</div>
								<div className="alert-desc">
									5 in GY, 6 in TT, 3 in BB. Renewal pack ready.
								</div>
								<div className="alert-meta">advance notice · hr@</div>
							</div>
						</div>
					</div>
					<div className="widget-foot">
						<a href="#" style={{ color: "var(--accent)" }}>
							All compliance items
							<ArrowRight size={11} />
						</a>
					</div>
				</section>

				{/* ----- Attendance pulse ----- */}
				<section className="widget w-attend">
					<div className="widget-head">
						<span className="widget-title">Attendance pulse · today</span>
						<div className="segmented" style={{ padding: "2px" }}>
							<button
								className="active"
								style={{ height: "22px", padding: "0 8px", fontSize: "11px" }}
								type="button"
							>
								Day
							</button>
							<button
								style={{ height: "22px", padding: "0 8px", fontSize: "11px" }}
								type="button"
							>
								Week
							</button>
						</div>
					</div>
					<div className="widget-body">
						<div
							style={{
								display: "flex",
								alignItems: "baseline",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div className="stat-value">93.1%</div>
								<div className="kpi-meta">
									<span className="stat-delta up">
										<ArrowUp size={10} />
										1.4pp
									</span>
									<span className="dim">vs 7-day</span>
								</div>
							</div>
							<div style={{ textAlign: "right", fontSize: "11.5px" }}>
								<div style={{ color: "var(--fg-3)" }}>1,196 / 1,284</div>
								<div style={{ color: "var(--warning)", marginTop: "4px" }}>
									28 late · 14 absent
								</div>
							</div>
						</div>
						<div className="attend-grid">
							{Array.from({ length: ATTEND_DAYS }, (_, d) =>
								Array.from({ length: 24 }, (_, h) => {
									const lvl = ATTEND_PATTERN[h];
									const lvlClass = lvl === 0 ? "" : `l${lvl}`;
									const anomaly =
										d === 2 && h === 14
											? "warn"
											: d === 4 && h === 11
												? "danger"
												: "";
									return (
										<div
											className={`attend-cell ${lvlClass} ${anomaly}`.trim()}
											key={`${d}-${h}`}
										/>
									);
								})
							)}
						</div>
						<div className="legend">
							<span>00:00</span>
							<div
								style={{
									flex: 1,
									display: "flex",
									gap: "3px",
									justifyContent: "center",
								}}
							>
								<div className="legend-swatch attend-cell" />
								<div className="legend-swatch attend-cell l1" />
								<div className="legend-swatch attend-cell l2" />
								<div className="legend-swatch attend-cell l3" />
								<div className="legend-swatch attend-cell l4" />
							</div>
							<span>23:00</span>
						</div>
					</div>
				</section>

				{/* ----- Approval queue ----- */}
				<section className="widget w-approvals">
					<div className="widget-head">
						<span className="widget-title">Your approval queue</span>
						<span className="badge badge-accent">12</span>
					</div>
					<div className="widget-body" style={{ paddingTop: "4px" }}>
						<div className="approval-item">
							<div className="avatar-sm">RG</div>
							<div>
								<div>
									<span style={{ fontWeight: 500 }}>Rohan Gopaul</span>
									{" · Leave · 4 days"}
								</div>
								<div className="meta">Annual · 2–5 Oct · Mahaica yard</div>
							</div>
							<div className="actions">
								<button className="deny" title="Deny" type="button">
									<X size={12} />
								</button>
								<button className="approve" title="Approve" type="button">
									<Check size={12} />
								</button>
							</div>
						</div>
						<div className="approval-item">
							<div className="avatar-sm">AK</div>
							<div>
								<div>
									<span style={{ fontWeight: 500 }}>Aisha Khan</span>
									{" · Overtime · 6.5h"}
								</div>
								<div className="meta">Engineering · Mon 26 Sep</div>
							</div>
							<div className="actions">
								<button className="deny" type="button">
									<X size={12} />
								</button>
								<button className="approve" type="button">
									<Check size={12} />
								</button>
							</div>
						</div>
						<div className="approval-item">
							<div className="avatar-sm">JS</div>
							<div>
								<div>
									<span style={{ fontWeight: 500 }}>Jaden Sealey</span>
									{" · Contract renewal"}
								</div>
								<div className="meta">Operations · expires 14 Oct</div>
							</div>
							<div className="actions">
								<button className="deny" type="button">
									<X size={12} />
								</button>
								<button className="approve" type="button">
									<Check size={12} />
								</button>
							</div>
						</div>
						<div className="approval-item">
							<div className="avatar-sm">SP</div>
							<div>
								<div>
									<span style={{ fontWeight: 500 }}>Shanice Powell</span>
									{" · Leave · 2 days"}
								</div>
								<div className="meta">Sick · medical attached</div>
							</div>
							<div className="actions">
								<button className="deny" type="button">
									<X size={12} />
								</button>
								<button className="approve" type="button">
									<Check size={12} />
								</button>
							</div>
						</div>
					</div>
					<div className="widget-foot">
						<a href="#" style={{ color: "var(--accent)" }}>
							Open queue
							<ArrowRight size={11} />
						</a>
						<span className="mono">avg approval · 2h 14m</span>
					</div>
				</section>

				{/* ----- Activity ----- */}
				<section className="widget w-activity" data-tab-scope="">
					<div className="widget-head">
						<div className="tabs tabs-pill" data-tabs="activity">
							<button
								aria-selected={activityTab === "all"}
								className="tab"
								data-tab="all"
								onClick={() => setActivityTab("all")}
								type="button"
							>
								All <span className="count">14</span>
							</button>
							<button
								aria-selected={activityTab === "you"}
								className="tab"
								data-tab="you"
								onClick={() => setActivityTab("you")}
								type="button"
							>
								You
							</button>
							<button
								aria-selected={activityTab === "approvals"}
								className="tab"
								data-tab="approvals"
								onClick={() => setActivityTab("approvals")}
								type="button"
							>
								Approvals <span className="count">3</span>
							</button>
							<button
								aria-selected={activityTab === "system"}
								className="tab"
								data-tab="system"
								onClick={() => setActivityTab("system")}
								type="button"
							>
								System
							</button>
						</div>
						<button
							className="icon-btn"
							style={{ width: "28px", height: "28px" }}
							title="More"
							type="button"
						>
							<MoreHorizontal size={14} />
						</button>
					</div>
					<div className="widget-body" style={{ paddingTop: "4px" }}>
						{activityTab === "all" && (
							<div className="tab-panel active" data-tab-panel="all">
								<div className="timeline">
									<div className="tl-item">
										<div className="tl-dot accent">
											<Check size={11} />
										</div>
										<div>
											<span className="tl-actor">You</span>
											{" approved BB pay run · BBD 412,600"}
										</div>
										<div className="tl-time">14:08</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<FileText size={11} />
										</div>
										<div>
											<span className="tl-actor">Sasha B.</span>
											{" uploaded TRN docs for 1 employee"}
										</div>
										<div className="tl-time">13:42</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<AlertTriangle size={11} />
										</div>
										<div>
											<span className="tl-actor">System</span>
											{" flagged NIS rate change · GY"}
										</div>
										<div className="tl-time">13:30</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<Users size={11} />
										</div>
										<div>
											<span className="tl-actor">Lia Roberts</span>
											{" joined Engineering · TT"}
										</div>
										<div className="tl-time">11:18</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<Database size={11} />
										</div>
										<div>
											<span className="tl-actor">HR sync</span>
											{" ingested 1,284 records from Horilla"}
										</div>
										<div className="tl-time">06:00</div>
									</div>
								</div>
							</div>
						)}
						{activityTab === "you" && (
							<div className="tab-panel active" data-tab-panel="you">
								<div className="timeline">
									<div className="tl-item">
										<div className="tl-dot accent">
											<Check size={11} />
										</div>
										<div>Approved BB pay run · BBD 412,600</div>
										<div className="tl-time">14:08</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<FileText size={11} />
										</div>
										<div>Commented on Aisha Khan's OT request</div>
										<div className="tl-time">11:24</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<Check size={11} />
										</div>
										<div>Approved Mahaica yard leave roster</div>
										<div className="tl-time">Mon 17:02</div>
									</div>
								</div>
							</div>
						)}
						{activityTab === "approvals" && (
							<div className="tab-panel active" data-tab-panel="approvals">
								<div className="timeline">
									<div className="tl-item">
										<div className="tl-dot accent">
											<Check size={11} />
										</div>
										<div>
											<span className="tl-actor">You</span>
											{" approved BB pay run"}
										</div>
										<div className="tl-time">14:08</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<User size={11} />
										</div>
										<div>
											<span className="tl-actor">Sasha B.</span>
											{" reviewed GY pay run · finance"}
										</div>
										<div className="tl-time">14:31</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<User size={11} />
										</div>
										<div>
											<span className="tl-actor">Lia Roberts</span>
											{" reviewed GY pay run · HR"}
										</div>
										<div className="tl-time">14:18</div>
									</div>
								</div>
							</div>
						)}
						{activityTab === "system" && (
							<div className="tab-panel active" data-tab-panel="system">
								<div className="timeline">
									<div className="tl-item">
										<div className="tl-dot">
											<AlertTriangle size={11} />
										</div>
										<div>NIS rate change detected · GY</div>
										<div className="tl-time">13:30</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<Database size={11} />
										</div>
										<div>HR sync ingested 1,284 records</div>
										<div className="tl-time">06:00</div>
									</div>
									<div className="tl-item">
										<div className="tl-dot">
											<ShieldCheck size={11} />
										</div>
										<div>Audit ledger sealed · ledger#218</div>
										<div className="tl-time">Mon 23:00</div>
									</div>
								</div>
							</div>
						)}
					</div>
					<div className="widget-foot">
						<a href="#" style={{ color: "var(--accent)" }}>
							Audit ledger
							<ArrowRight size={11} />
						</a>
						<span className="mono">sealed · 14:42</span>
					</div>
				</section>

				{/* ----- Headcount trend ----- */}
				<section className="widget w-headcount">
					<div className="widget-head">
						<span className="widget-title">Headcount trend</span>
						<div className="segmented">
							<button className="active" type="button">
								12m
							</button>
							<button type="button">YTD</button>
							<button type="button">All</button>
						</div>
					</div>
					<div className="widget-body">
						<div
							style={{
								display: "flex",
								alignItems: "baseline",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div className="stat-value">1,284</div>
								<div className="kpi-meta">
									<span className="stat-delta up">
										<ArrowUp size={10} />
										+9.8%
									</span>
									<span className="dim">YoY · 116 net</span>
								</div>
							</div>
							<div
								style={{
									textAlign: "right",
									fontSize: "11.5px",
									color: "var(--fg-3)",
								}}
							>
								<div>GY 728 · TT 312 · BB 88</div>
								<div style={{ marginTop: "4px" }}>
									JM 96 · US 28 · CA 18 · UK 14
								</div>
							</div>
						</div>
						<div className="chart">
							{HC_HEIGHTS.map((h, i) => (
								<div
									className={`bar ${i === HC_HEIGHTS.length - 1 ? "fill" : "fill-soft"}`}
									key={HC_MONTHS[i]}
									style={{ height: `${h}%` }}
								/>
							))}
						</div>
						<div className="chart-axis">
							{HC_MONTHS.map((m) => (
								<div key={m}>{m}</div>
							))}
						</div>
					</div>
				</section>

				{/* ----- Payroll cost ----- */}
				<section className="widget w-cost">
					<div className="widget-head">
						<span className="widget-title">Total payroll cost</span>
						<div className="segmented">
							<button type="button">Gross</button>
							<button className="active" type="button">
								Loaded
							</button>
						</div>
					</div>
					<div className="widget-body">
						<div
							style={{
								display: "flex",
								alignItems: "baseline",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div className="stat-value">USD 1.84M</div>
								<div className="kpi-meta">
									<span className="stat-delta up">
										<ArrowUp size={10} />
										+3.2%
									</span>
									<span className="dim">vs Aug</span>
								</div>
							</div>
							<div
								style={{
									textAlign: "right",
									fontSize: "11.5px",
									color: "var(--fg-3)",
								}}
							>
								<div>Gross USD 1.62M</div>
								<div>Employer contrib USD 218k</div>
							</div>
						</div>
						<div className="cost-area">
							<svg preserveAspectRatio="none" viewBox="0 0 400 120">
								<defs>
									<linearGradient id="costGrad" x1="0" x2="0" y1="0" y2="1">
										<stop
											offset="0%"
											stopColor="var(--accent)"
											stopOpacity="0.5"
										/>
										<stop
											offset="100%"
											stopColor="var(--accent)"
											stopOpacity="0"
										/>
									</linearGradient>
								</defs>
								<path
									d="M 0,90 L 33,80 L 66,82 L 99,72 L 132,70 L 165,68 L 198,58 L 231,62 L 264,50 L 297,52 L 330,42 L 363,38 L 396,32 L 400,32 L 400,120 L 0,120 Z"
									fill="url(#costGrad)"
								/>
								<path
									d="M 0,90 L 33,80 L 66,82 L 99,72 L 132,70 L 165,68 L 198,58 L 231,62 L 264,50 L 297,52 L 330,42 L 363,38 L 396,32"
									fill="none"
									stroke="var(--accent)"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="1.5"
								/>
							</svg>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
