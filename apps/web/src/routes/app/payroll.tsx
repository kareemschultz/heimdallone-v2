import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowUp,
	Briefcase,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Download,
	ExternalLink,
	FileText,
	Globe,
	Info,
	Lock,
	MoreHorizontal,
	Play,
	Plus,
	ShieldCheck,
	User,
	Users,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/payroll")({
	component: PayrollPage,
});

const COUNTRIES = {
	GY: {
		name: "Guyana",
		cc: "GY",
		cur: "GYD",
		emp: 728,
		profile: "gy.v2026.1",
		eff: "2025-07-01",
		status: "ready",
	},
	TT: {
		name: "Trinidad & Tobago",
		cc: "TT",
		cur: "TTD",
		emp: 312,
		profile: "tt.v2026.1",
		eff: "2026-01-01",
		status: "action",
	},
	BB: {
		name: "Barbados",
		cc: "BB",
		cur: "BBD",
		emp: 88,
		profile: "bb.v2026.1",
		eff: "2025-09-01",
		status: "sealed",
	},
	JM: {
		name: "Jamaica",
		cc: "JM",
		cur: "JMD",
		emp: 96,
		profile: "jm.v2026.1",
		eff: "2026-04-01",
		status: "action",
	},
	US: {
		name: "United States",
		cc: "US",
		cur: "USD",
		emp: 28,
		profile: "us.v2026.1",
		eff: "2026-01-01",
		status: "sealed",
	},
	CA: {
		name: "Canada",
		cc: "CA",
		cur: "CAD",
		emp: 18,
		profile: "ca.v2026.1",
		eff: "2026-01-01",
		status: "queued",
	},
	GB: {
		name: "United Kingdom",
		cc: "GB",
		cur: "GBP",
		emp: 14,
		profile: "gb.v2026.1",
		eff: "2026-04-06",
		status: "queued",
	},
} as const;

type CountryCode = keyof typeof COUNTRIES;

function PayrollPage() {
	const [activeCountry, setActiveCountry] = useState<CountryCode>("GY");
	const [activeTab, setActiveTab] = useState("preview");
	const [exportMenuOpen, setExportMenuOpen] = useState(false);

	const country = COUNTRIES[activeCountry];

	const stripDotClass = (status: string) => {
		if (status === "ready") {
			return "pill-dot ready";
		}
		if (status === "action") {
			return "pill-dot action";
		}
		if (status === "sealed") {
			return "pill-dot sealed";
		}
		return "pill-dot";
	};

	return (
		<div className="page">
			{/* Page header */}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Atlas Shipping</span>
						<span className="sep">/</span>
						<span>Payroll</span>
						<span className="sep">/</span>
						<span>September 2026</span>
					</div>
					<h1 className="page-title">Payroll command center</h1>
					<p className="page-sub">
						Period 01–30 Sep 2026 · 5 runs · Cut-off Fri 29 Sep · 09:00 GYT
					</p>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button className="btn btn-outline" type="button">
						<Download size={13} />
						Export
					</button>
					<button className="btn btn-outline" type="button">
						<ExternalLink size={13} />
						Open ledger
					</button>
					<button className="btn btn-primary" type="button">
						<Play size={13} />
						Recompute
					</button>
				</div>
			</div>

			{/* Run banner with active country */}
			<div className="runbar">
				<div className="left">
					<div className="country-mark">
						<span className="flag" title={country.cc}>
							{country.cc}
						</span>
					</div>
					<div>
						<h2>{country.name} · September 2026</h2>
						<div className="sub">
							<span className="mono">{country.cur}</span>
							<span className="sep">·</span>
							<span>{country.emp} employees</span>
							<span className="sep">·</span>
							<span>
								Profile{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{country.profile}
								</span>
							</span>
							<span className="sep">·</span>
							<span>
								Effective{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{country.eff}
								</span>
							</span>
						</div>
					</div>
				</div>
				<div className="right">
					<span
						className="badge badge-accent"
						style={{ height: "28px", padding: "0 12px" }}
					>
						<span className="badge-dot" />
						Ready for approval · 96%
					</span>
					<button className="btn btn-primary" type="button">
						<ShieldCheck size={14} />
						Approve &amp; commit
					</button>
				</div>
			</div>

			{/* Country strip */}
			<div className="country-strip">
				{(
					[
						["GY", "Guyana"],
						["TT", "Trinidad & Tobago"],
						["BB", "Barbados"],
						["JM", "Jamaica"],
					] as [CountryCode, string][]
				).map(([cc, label]) => (
					<button
						className={activeCountry === cc ? "active" : ""}
						data-cc={cc}
						key={cc}
						onClick={() => setActiveCountry(cc)}
						type="button"
					>
						<span className="flag" title={cc}>
							{cc}
						</span>
						{label} <span className={stripDotClass(COUNTRIES[cc].status)} />
					</button>
				))}
				<div className="sep" />
				{(
					[
						["US", "United States"],
						["CA", "Canada"],
						["GB", "United Kingdom"],
					] as [CountryCode, string][]
				).map(([cc, label]) => (
					<button
						className={activeCountry === cc ? "active" : ""}
						data-cc={cc}
						key={cc}
						onClick={() => setActiveCountry(cc)}
						type="button"
					>
						<span className="flag" title={cc}>
							{cc}
						</span>
						{label} <span className={stripDotClass(COUNTRIES[cc].status)} />
					</button>
				))}
				<div className="total">
					All runs total · <b>USD 1.84M</b>
				</div>
			</div>

			{/* Main grid */}
			<div className="payroll-grid">
				{/* LEFT */}
				<div className="left-col">
					{/* Summary cards */}
					<div className="sum-row">
						<div className="sum-card">
							<div className="lbl">Gross earnings</div>
							<div className="val">GYD 204.8M</div>
							<div className="delta">
								204,820,000 · <span className="up">▲ 1.8%</span> vs August
							</div>
						</div>
						<div className="sum-card">
							<div className="lbl">Statutory deductions</div>
							<div className="val">GYD 33.0M</div>
							<div className="delta">PAYE 24.6M · NIS 8.4M</div>
						</div>
						<div className="sum-card">
							<div className="lbl">Employer contributions</div>
							<div className="val">GYD 12.9M</div>
							<div className="delta">NIS 12.9M (5.6%)</div>
						</div>
						<div className="sum-card accent">
							<div className="lbl">Net to pay</div>
							<div className="val">GYD 184.7M</div>
							<div className="delta">
								728 employees · avg{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									253,747
								</span>
							</div>
						</div>
					</div>

					{/* Employees table */}
					<div className="emp-table">
						<div
							className="emp-head"
							style={{
								borderBottom: "1px solid var(--line)",
								padding: "6px 8px 6px 14px",
							}}
						>
							<div
								className="tabs"
								role="tablist"
								style={{ borderBottom: "0", gap: "0" }}
							>
								<button
									aria-selected={activeTab === "preview"}
									className={`tab${activeTab === "preview" ? "active" : ""}`}
									onClick={() => setActiveTab("preview")}
									role="tab"
									type="button"
								>
									Gross-to-net
								</button>
								<button
									aria-selected={activeTab === "changes"}
									className={`tab${activeTab === "changes" ? "active" : ""}`}
									onClick={() => setActiveTab("changes")}
									role="tab"
									type="button"
								>
									Changes <span className="count">12</span>
								</button>
								<button
									aria-selected={activeTab === "flagged"}
									className={`tab${activeTab === "flagged" ? "active" : ""}`}
									onClick={() => setActiveTab("flagged")}
									role="tab"
									type="button"
								>
									Flagged <span className="count">4</span>
								</button>
								<button
									aria-selected={activeTab === "overtime"}
									className={`tab${activeTab === "overtime" ? "active" : ""}`}
									onClick={() => setActiveTab("overtime")}
									role="tab"
									type="button"
								>
									Overtime <span className="count">14</span>
								</button>
							</div>
							<div
								style={{ display: "flex", gap: "8px", alignItems: "center" }}
							>
								<input className="emp-search" placeholder="Search employees…" />
								<div className="menu-root">
									<button
										className="btn btn-sm btn-outline"
										onClick={() => setExportMenuOpen(!exportMenuOpen)}
										type="button"
									>
										<MoreHorizontal size={12} />
									</button>
									<div
										className="menu"
										data-open={exportMenuOpen ? "true" : "false"}
										data-side="bottom-end"
									>
										<button
											className="menu-item"
											onClick={() => setExportMenuOpen(false)}
											type="button"
										>
											<span className="menu-icon">
												<Download size={14} />
											</span>
											Export CSV
										</button>
										<button
											className="menu-item"
											onClick={() => setExportMenuOpen(false)}
											type="button"
										>
											<span className="menu-icon">
												<Download size={14} />
											</span>
											Export PDF payslips
										</button>
										<button
											className="menu-item"
											onClick={() => setExportMenuOpen(false)}
											type="button"
										>
											<span className="menu-icon">
												<FileText size={14} />
											</span>
											Bank file (RBL)
										</button>
										<div className="menu-sep" />
										<button
											className="menu-item"
											onClick={() => setExportMenuOpen(false)}
											type="button"
										>
											<span className="menu-icon">
												<ExternalLink size={14} />
											</span>
											Send to ledger
										</button>
									</div>
								</div>
							</div>
						</div>

						{/* Filter chip row */}
						<div
							className="filter-bar"
							style={{
								padding: "12px 14px",
								borderBottom: "1px solid var(--line)",
								background: "var(--bg-1)",
							}}
						>
							<button className="filter-chip active" type="button">
								<Users size={11} />
								Department <span className="v">All</span>
							</button>
							<button className="filter-chip" type="button">
								<Briefcase size={11} />
								Location
							</button>
							<button className="filter-chip" type="button">
								<Briefcase size={11} />
								Employment <span className="v">Permanent</span>
							</button>
							<button className="filter-chip active" type="button">
								<AlertTriangle size={11} />
								Status <span className="v">Has changes</span>
							</button>
							<button className="filter-chip" type="button">
								<Globe size={11} />
								Tax band
							</button>
							<button
								className="filter-chip"
								style={{ borderStyle: "solid", color: "var(--fg-3)" }}
								type="button"
							>
								<Plus size={11} />
								Add filter
							</button>
							<span
								style={{
									marginLeft: "auto",
									fontSize: "11.5px",
									color: "var(--fg-3)",
								}}
							>
								Showing{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									7 / 728
								</span>
							</span>
						</div>

						{/* Gross-to-net tab panel */}
						<div
							className={`tab-panel${activeTab === "preview" ? "active" : ""}`}
							style={{ display: activeTab === "preview" ? undefined : "none" }}
						>
							<table>
								<thead>
									<tr>
										<th>Employee</th>
										<th>Department</th>
										<th style={{ textAlign: "right" }}>Gross</th>
										<th style={{ textAlign: "right" }}>PAYE</th>
										<th style={{ textAlign: "right" }}>NIS</th>
										<th style={{ textAlign: "right" }}>Other</th>
										<th style={{ textAlign: "right" }}>Net</th>
										<th style={{ width: "40px" }} />
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>
											<div className="emp-name">
												<div
													className="avatar-xs"
													style={{
														background:
															"color-mix(in oklab, var(--accent) 30%, var(--bg-3))",
														color: "var(--fg)",
													}}
												>
													MP
												</div>
												<div>
													<div>Maya Persaud</div>
													<div className="sub">EMP-00128 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Operations</span>
										</td>
										<td className="num-cell">428,000.00</td>
										<td className="num-cell neg">−72,800.00</td>
										<td className="num-cell neg">−23,540.00</td>
										<td className="num-cell neg">−4,000.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											327,660.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr>
										<td>
											<div className="emp-name">
												<div className="avatar-xs">RG</div>
												<div>
													<div>Rohan Gopaul</div>
													<div className="sub">EMP-00214 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Engineering</span>
										</td>
										<td className="num-cell">342,000.00</td>
										<td className="num-cell neg">−58,140.00</td>
										<td className="num-cell neg">−18,810.00</td>
										<td className="num-cell neg">0.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											265,050.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr className="row-flag">
										<td>
											<div className="emp-name">
												<div className="avatar-xs">SP</div>
												<div>
													<div>
														Shanice Powell
														<span
															className="badge badge-warning"
															style={{
																height: "18px",
																padding: "0 6px",
																fontSize: "10px",
																marginLeft: "6px",
															}}
														>
															retro
														</span>
													</div>
													<div className="sub">EMP-00302 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Finance</span>
										</td>
										<td className="num-cell">385,400.00</td>
										<td className="num-cell neg">−65,518.00</td>
										<td className="num-cell neg">−21,197.00</td>
										<td className="num-cell neg">−8,200.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											290,485.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr>
										<td>
											<div className="emp-name">
												<div className="avatar-xs">DA</div>
												<div>
													<div>Devon Ali</div>
													<div className="sub">EMP-00417 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Operations</span>
										</td>
										<td className="num-cell">298,500.00</td>
										<td className="num-cell neg">−50,745.00</td>
										<td className="num-cell neg">−16,418.00</td>
										<td className="num-cell neg">−2,500.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											228,837.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr>
										<td>
											<div className="emp-name">
												<div className="avatar-xs">JS</div>
												<div>
													<div>Jaden Sealey</div>
													<div className="sub">EMP-00611 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Operations</span>
										</td>
										<td className="num-cell">264,000.00</td>
										<td className="num-cell neg">−44,880.00</td>
										<td className="num-cell neg">−14,520.00</td>
										<td className="num-cell neg">0.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											204,600.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr>
										<td>
											<div className="emp-name">
												<div className="avatar-xs">AK</div>
												<div>
													<div>
														Aisha Khan
														<span
															className="badge"
															style={{
																height: "18px",
																padding: "0 6px",
																fontSize: "10px",
																marginLeft: "6px",
															}}
														>
															OT +6.5h
														</span>
													</div>
													<div className="sub">EMP-00702 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">Engineering</span>
										</td>
										<td className="num-cell">312,800.00</td>
										<td className="num-cell neg">−53,176.00</td>
										<td className="num-cell neg">−17,204.00</td>
										<td className="num-cell neg">0.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											242,420.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
									<tr>
										<td>
											<div className="emp-name">
												<div className="avatar-xs">LR</div>
												<div>
													<div>Lia Roberts</div>
													<div className="sub">EMP-00814 · GY</div>
												</div>
											</div>
										</td>
										<td>
											<span className="dim">HR</span>
										</td>
										<td className="num-cell">218,000.00</td>
										<td className="num-cell neg">−37,060.00</td>
										<td className="num-cell neg">−11,990.00</td>
										<td className="num-cell neg">0.00</td>
										<td className="num-cell" style={{ fontWeight: 600 }}>
											168,950.00
										</td>
										<td>
											<ChevronRight
												size={14}
												style={{ color: "var(--fg-4)" }}
											/>
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						{/* Changes tab panel */}
						<div
							className={`tab-panel${activeTab === "changes" ? "active" : ""}`}
							style={{ display: activeTab === "changes" ? undefined : "none" }}
						>
							<div style={{ padding: "18px" }}>
								<div
									style={{
										fontSize: "12.5px",
										color: "var(--fg-2)",
										marginBottom: "14px",
									}}
								>
									12 employees with this-period changes vs. last period.
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--info-soft)",
											color: "var(--info)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<ArrowUp size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Shanice Powell · Salary increase{" "}
											<span className="mono dim">+8.4%</span>
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Effective 2026-09-15 · retro adjustment 8,200 GYD
										</div>
									</div>
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--accent-soft)",
											color: "var(--accent)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Clock size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Aisha Khan · 6.5 hours overtime added
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Week 39 · Engineering · approved by Maya Persaud
										</div>
									</div>
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--warning-soft)",
											color: "var(--warning)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<User size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											3 new joiners · pro-rated from 2026-09-16
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Lia Roberts (HR) · Devon Ali (Ops) · Jaden Sealey (Ops)
										</div>
									</div>
								</div>
								<div style={{ textAlign: "center", padding: "16px 0" }}>
									<button className="btn btn-ghost btn-sm" type="button">
										Show 9 more changes
										<ChevronDown size={11} />
									</button>
								</div>
							</div>
						</div>

						{/* Flagged tab panel */}
						<div
							className={`tab-panel${activeTab === "flagged" ? "active" : ""}`}
							style={{ display: activeTab === "flagged" ? undefined : "none" }}
						>
							<div style={{ padding: "18px" }}>
								<div
									style={{
										fontSize: "12.5px",
										color: "var(--fg-2)",
										marginBottom: "14px",
									}}
								>
									4 employees need review before commit.
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--warning-soft)",
											color: "var(--warning)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<AlertTriangle size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Shanice Powell · retroactive change crosses fiscal
											boundary
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Variance +12.4% vs August · awaiting Finance sign-off
										</div>
									</div>
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--warning-soft)",
											color: "var(--warning)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Info size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											Devon Ali · IBAN not validated
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Republic Bank · update required before bank file
											generation
										</div>
									</div>
								</div>
								<div
									className="alert-item"
									style={{
										padding: "10px 12px",
										borderRadius: "11px",
										background: "var(--bg-2)",
										marginBottom: "8px",
									}}
								>
									<div
										className="alert-icon"
										style={{
											background: "var(--warning-soft)",
											color: "var(--warning)",
											width: "24px",
											height: "24px",
											borderRadius: "8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<AlertTriangle size={13} />
									</div>
									<div>
										<div style={{ fontSize: "13px", fontWeight: 500 }}>
											2 employees · TRN missing (Jamaica run)
										</div>
										<div
											style={{
												fontSize: "11.5px",
												color: "var(--fg-3)",
												marginTop: "2px",
											}}
										>
											Blocks Jamaica commit · HR notified Mon 25 Sep
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Overtime tab panel */}
						<div
							className={`tab-panel${activeTab === "overtime" ? "active" : ""}`}
							style={{ display: activeTab === "overtime" ? undefined : "none" }}
						>
							<div style={{ padding: "18px" }}>
								<div
									style={{
										fontSize: "12.5px",
										color: "var(--fg-2)",
										marginBottom: "14px",
									}}
								>
									14 approved overtime entries this period · 78.5 hours total ·
									1.4% of payroll.
								</div>
								<table style={{ width: "100%" }}>
									<thead>
										<tr>
											<th>Employee</th>
											<th>Department</th>
											<th style={{ textAlign: "right" }}>Hours</th>
											<th style={{ textAlign: "right" }}>Rate</th>
											<th style={{ textAlign: "right" }}>Cost</th>
											<th>Approved by</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>
												<div className="emp-name">
													<div className="avatar-xs">AK</div>
													<div>Aisha Khan</div>
												</div>
											</td>
											<td>
												<span className="dim">Engineering</span>
											</td>
											<td className="num-cell">6.5</td>
											<td className="num-cell">1.5×</td>
											<td className="num-cell" style={{ fontWeight: 600 }}>
												28,400.00
											</td>
											<td>
												<span className="dim">M. Persaud</span>
											</td>
										</tr>
										<tr>
											<td>
												<div className="emp-name">
													<div className="avatar-xs">RG</div>
													<div>Rohan Gopaul</div>
												</div>
											</td>
											<td>
												<span className="dim">Engineering</span>
											</td>
											<td className="num-cell">8.0</td>
											<td className="num-cell">1.5×</td>
											<td className="num-cell" style={{ fontWeight: 600 }}>
												32,800.00
											</td>
											<td>
												<span className="dim">M. Persaud</span>
											</td>
										</tr>
										<tr>
											<td>
												<div className="emp-name">
													<div className="avatar-xs">DA</div>
													<div>Devon Ali</div>
												</div>
											</td>
											<td>
												<span className="dim">Operations</span>
											</td>
											<td className="num-cell">12.0</td>
											<td className="num-cell">1.5×</td>
											<td className="num-cell" style={{ fontWeight: 600 }}>
												38,400.00
											</td>
											<td>
												<span className="dim">M. Persaud</span>
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>

						{/* Table footer / pagination */}
						<div
							style={{
								padding: "10px 18px",
								borderTop: "1px solid var(--line)",
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								fontSize: "12px",
								color: "var(--fg-3)",
							}}
						>
							<span>Showing 7 of 728 employees</span>
							<div
								style={{ display: "flex", alignItems: "center", gap: "8px" }}
							>
								<button className="btn btn-sm btn-ghost" type="button">
									<ChevronLeft size={12} />
								</button>
								<span className="mono">1 / 105</span>
								<button className="btn btn-sm btn-ghost" type="button">
									<ChevronRight size={12} />
								</button>
							</div>
						</div>
					</div>

					{/* Approval chain */}
					<div className="approval-chain">
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "flex-start",
							}}
						>
							<div>
								<div style={{ fontSize: "13.5px", fontWeight: 600 }}>
									Approval chain
								</div>
								<div
									className="dim"
									style={{ fontSize: "12px", marginTop: "4px" }}
								>
									Two-step approval policy · GY pay runs
								</div>
							</div>
							<div style={{ fontSize: "11.5px", color: "var(--fg-3)" }}>
								Locked at commit · cannot be edited
							</div>
						</div>
						<div className="chain">
							<div className="chain-step done">
								<div className="chain-dot">
									<Check size={11} />
								</div>
								<div className="step-title">Computed</div>
								<div className="step-meta">system · 14:02 GYT</div>
							</div>
							<div className="chain-step done">
								<div className="chain-dot">
									<Check size={11} />
								</div>
								<div className="step-title">Reviewed · HR</div>
								<div className="step-meta">Lia Roberts · 14:18</div>
							</div>
							<div className="chain-step done">
								<div className="chain-dot">
									<Check size={11} />
								</div>
								<div className="step-title">Verified · Finance</div>
								<div className="step-meta">Sasha B. · 14:31</div>
							</div>
							<div className="chain-step current">
								<div className="chain-dot">
									<User size={11} />
								</div>
								<div className="step-title">Approve · Ops Lead</div>
								<div className="step-meta">you · pending</div>
							</div>
							<div className="chain-step">
								<div className="chain-dot">
									<Lock size={11} />
								</div>
								<div className="step-title">Commit &amp; seal</div>
								<div className="step-meta">automated</div>
							</div>
							<div className="chain-step">
								<div className="chain-dot">
									<Download size={11} />
								</div>
								<div className="step-title">Disburse</div>
								<div className="step-meta">Fri 29 · 09:00</div>
							</div>
						</div>
					</div>
				</div>

				{/* RIGHT side column */}
				<div className="right-col">
					{/* Readiness checklist */}
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Readiness · 12 of 12</span>
							<span className="badge badge-accent" style={{ height: "20px" }}>
								<span className="badge-dot" />
								96%
							</span>
						</div>
						<div className="side-body">
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">All employees attached</div>
									<div className="sub">728/728 · synced from Horilla</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">Attendance reconciled</div>
									<div className="sub">98.4 % · 3 exceptions resolved</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">Overtime approved</div>
									<div className="sub">14 entries · all signed off</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">Country profile applied</div>
									<div className="sub">
										<span className="mono">gy.v2026.1</span> · NIS 5.6/5.6
									</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick warn">
									<AlertTriangle size={9} />
								</div>
								<div className="ck-body">
									<div className="ttl">Bank file format</div>
									<div className="sub">
										Republic Bank · validate IBAN 4 holdouts
									</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">Variance check</div>
									<div className="sub">+1.8% vs Aug · within ±5%</div>
								</div>
							</div>
							<div className="ck-item">
								<div className="ck-tick done">
									<Check size={10} />
								</div>
								<div className="ck-body">
									<div className="ttl">Compliance sign-off</div>
									<div className="sub">No outstanding findings</div>
								</div>
							</div>
						</div>
					</div>

					{/* Statutory deductions */}
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Statutory deductions</span>
							<span className="mono dim" style={{ fontSize: "11px" }}>
								GYD
							</span>
						</div>
						<div className="side-body">
							<div className="donut-wrap">
								<div className="donut">
									<svg aria-hidden="true" viewBox="0 0 36 36">
										<circle
											cx="18"
											cy="18"
											fill="none"
											r="14.5"
											stroke="var(--bg-3)"
											strokeWidth="4"
										/>
										{/* PAYE 74.5% */}
										<circle
											cx="18"
											cy="18"
											fill="none"
											r="14.5"
											stroke="var(--accent)"
											strokeDasharray="91"
											strokeDashoffset="23"
											strokeLinecap="butt"
											strokeWidth="4"
										/>
										{/* NIS 25.5% */}
										<circle
											cx="18"
											cy="18"
											fill="none"
											r="14.5"
											stroke="var(--info)"
											strokeDasharray="23 91"
											strokeDashoffset="-68"
											strokeWidth="4"
										/>
									</svg>
									<div className="donut-center">
										<div className="v">33.0M</div>
										<div className="l">total</div>
									</div>
								</div>
								<div
									style={{
										flex: 1,
										minWidth: 0,
										display: "flex",
										flexDirection: "column",
										gap: "8px",
									}}
								>
									<div
										className="ded-row"
										style={{ border: "0", padding: "0" }}
									>
										<div className="ded-name">
											<div
												className="ded-swatch"
												style={{ background: "var(--accent)" }}
											/>
											PAYE
										</div>
										<div style={{ textAlign: "right" }}>
											<div className="ded-val">24.6M</div>
											<div className="ded-sub">74.5%</div>
										</div>
									</div>
									<div
										className="ded-row"
										style={{ border: "0", padding: "0" }}
									>
										<div className="ded-name">
											<div
												className="ded-swatch"
												style={{ background: "var(--info)" }}
											/>
											NIS
										</div>
										<div style={{ textAlign: "right" }}>
											<div className="ded-val">8.4M</div>
											<div className="ded-sub">25.5%</div>
										</div>
									</div>
								</div>
							</div>
							<div className="ded-row">
								<div className="ded-name dim">Employer NIS (matched)</div>
								<div className="ded-val">12.9M</div>
							</div>
							<div className="ded-row">
								<div className="ded-name dim">Reconciled to GRA</div>
								<div className="ded-val" style={{ color: "var(--success)" }}>
									✓ matches
								</div>
							</div>
						</div>
					</div>

					{/* Country profile */}
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Country profile · GY</span>
							<button
								className="btn btn-ghost btn-sm"
								style={{ fontSize: "11px" }}
								type="button"
							>
								<ExternalLink size={11} />
								View
							</button>
						</div>
						<div className="side-body">
							<div className="fact-row">
								<span className="k">Profile version</span>
								<span className="v">gy.v2026.1</span>
							</div>
							<div className="fact-row">
								<span className="k">Effective</span>
								<span className="v">2025-07-01 →</span>
							</div>
							<div className="fact-row">
								<span className="k">NIS · employee</span>
								<span className="v">5.6%</span>
							</div>
							<div className="fact-row">
								<span className="k">NIS · employer</span>
								<span className="v">5.6%</span>
							</div>
							<div className="fact-row">
								<span className="k">Personal threshold</span>
								<span className="v">130,000 / mo</span>
							</div>

							<div
								className="tiny"
								style={{ marginTop: "14px", marginBottom: "4px" }}
							>
								PAYE bands · monthly
							</div>
							<div className="bands">
								<div className="band-row">
									<div className="l">0 – 130,000</div>
									<div className="r">0%</div>
								</div>
								<div className="band-row">
									<div className="l">130,001 – 260,000</div>
									<div className="r">28%</div>
								</div>
								<div className="band-row hi">
									<div className="l">260,001 +</div>
									<div className="r">40%</div>
								</div>
							</div>

							<div
								style={{
									marginTop: "12px",
									padding: "10px 12px",
									background: "var(--warning-soft)",
									borderRadius: "8px",
									fontSize: "11.5px",
									display: "flex",
									gap: "8px",
									alignItems: "flex-start",
								}}
							>
								<AlertTriangle
									size={13}
									style={{ color: "var(--warning)", marginTop: "1px" }}
								/>
								<span>
									<span style={{ color: "var(--fg)" }}>gy.v2026.2 staged</span>{" "}
									— NIS rate to 6.0/6.0 effective{" "}
									<span className="mono">2026-10-01</span>.
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Page footer / audit */}
			<div className="page-foot">
				<span>
					Last computation:{" "}
					<span className="mono">2026-09-27 14:02:18 GYT</span> by system ·
					checksum <span className="mono">8f2a · 1c4d</span>
				</span>
				<span className="mono">Audit ledger sealed · ledger#2026-Q3-218</span>
			</div>
		</div>
	);
}
