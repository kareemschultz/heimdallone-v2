import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	Banknote,
	Check,
	Clock,
	CreditCard,
	FileText,
	Globe,
	ReceiptText,
	Settings,
	Wallet,
} from "lucide-react";
import { useContext } from "react";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/")({
	component: PayrollDashboard,
});

function PayrollDashboard() {
	const org = useContext(OrgCtx);
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const { data: settings } = useQuery(
		orpc.payroll.settings.get.queryOptions({})
	);

	const { data: profiles } = useQuery(
		orpc.payroll.settings.listCountryProfiles.queryOptions({})
	);

	const { data: periods } = useQuery(
		orpc.payroll.payPeriods.list.queryOptions({
			input: { page: 1, pageSize: 5 },
		})
	);

	const { data: dashboard } = useQuery(
		orpc.payroll.reports.dashboardSummary.queryOptions({})
	);

	const activeProfile = profiles?.find(
		(p: { isActive: boolean }) => p.isActive
	);
	const openPeriods =
		periods?.data?.filter((p: { status: string }) => p.status === "open") ?? [];

	const checklist = buildChecklist(
		settings,
		activeProfile,
		openPeriods,
		dashboard
	);
	const completedSteps = checklist.filter((c) => c.status === "done").length;
	const totalSteps = checklist.length;
	const readinessPercent = Math.round((completedSteps / totalSteps) * 100);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Payroll</span>
					</div>
					<h1 className="page-title">Payroll setup</h1>
					<p className="page-sub">
						Start here to check if payroll is ready. Configure settings, pay
						items, and review your setup checklist.
					</p>
				</div>
			</div>

			<div className="sum-row" style={{ marginBottom: 18 }}>
				<div className={`sum-card ${readinessPercent >= 80 ? "accent" : ""}`}>
					<span className="lbl">Readiness</span>
					<span className="val">{readinessPercent}%</span>
					<span className="delta">
						{completedSteps} of {totalSteps} steps complete
					</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Open periods</span>
					<span className="val">{dashboard?.openPeriods ?? 0}</span>
					<span className="delta">Ready for payroll runs</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Active loans</span>
					<span className="val">{dashboard?.activeLoans ?? 0}</span>
					<span className="delta">Being deducted from pay</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Pending reimbursements</span>
					<span className="val">{dashboard?.pendingReimbursements ?? 0}</span>
					<span className="delta">Awaiting approval</span>
				</div>
			</div>

			<div className="payroll-grid">
				<div className="left-col">
					{activeProfile ? (
						<div className="runbar">
							<div className="left">
								<div className="country-mark">
									<Globe size={20} />
								</div>
								<div>
									<h2>
										{activeProfile.countryName} {activeProfile.effectiveYear}
									</h2>
									<div className="sub">
										<span className="mono">{activeProfile.currency}</span>
										<span className="sep">·</span>
										<span>PAYE + NIS configured</span>
										<span className="sep">·</span>
										<span>
											Profile{" "}
											<span className="mono" style={{ color: "var(--fg-2)" }}>
												{activeProfile.countryCode}.v
												{activeProfile.effectiveYear}
											</span>
										</span>
									</div>
								</div>
							</div>
							<div className="right">
								<span
									className="badge badge-success"
									style={{ height: 28, padding: "0 12px" }}
								>
									<span className="badge-dot" />
									Active
								</span>
							</div>
						</div>
					) : (
						<div className="runbar">
							<div className="left">
								<div className="country-mark">
									<AlertTriangle size={20} />
								</div>
								<div>
									<h2>No country profile configured</h2>
									<div className="sub">
										<span>Set up a country payroll profile to get started</span>
									</div>
								</div>
							</div>
						</div>
					)}

					<div className="emp-table">
						<div className="emp-head">
							<span style={{ fontWeight: 600, fontSize: 14 }}>
								Quick access
							</span>
						</div>
						<div style={{ padding: 4 }}>
							{canManage && (
								<>
									<NavRow
										href="/app/payroll/settings"
										icon={<Settings size={16} />}
										label="Payroll settings"
										sub="Currency, overtime, work schedule"
									/>
									<NavRow
										href="/app/payroll/pay-items"
										icon={<FileText size={16} />}
										label="Pay items"
										sub="Allowances, deductions, tax items"
									/>
									<NavRow
										href="/app/payroll/loans"
										icon={<CreditCard size={16} />}
										label="Loans & advances"
										sub="Employee loans, salary advances"
									/>
									<NavRow
										href="/app/payroll/reimbursements"
										icon={<ReceiptText size={16} />}
										label="Reimbursements"
										sub="Expense claims, leave encashment"
									/>
								</>
							)}
							<NavRow
								href="/app/payroll/run"
								icon={<Wallet size={16} />}
								label="Run payroll"
								sub="Preview and finalize payroll"
							/>
							<NavRow
								href="/app/payroll/payslips"
								icon={<Banknote size={16} />}
								label="Payslips"
								sub="Employee payslips and history"
							/>
							<NavRow
								disabled
								href="/app/payroll"
								icon={<Clock size={16} />}
								label="Bank export"
								note="Coming in Phase 8K"
								sub="Payment batch and bank file export"
							/>
						</div>
					</div>
				</div>

				<div className="right-col">
					<div className="side-card">
						<div className="side-head">
							<span className="ttl">Setup checklist</span>
							<span style={{ fontSize: 11, color: "var(--fg-3)" }}>
								{completedSteps}/{totalSteps}
							</span>
						</div>
						<div className="side-body">
							{readinessPercent >= 80 ? (
								<div
									style={{
										padding: "8px 0 12px",
										fontSize: 12.5,
										color: "var(--success)",
									}}
								>
									<Check
										size={12}
										style={{ verticalAlign: -2, marginRight: 4 }}
									/>
									Ready to run payroll
								</div>
							) : (
								<div
									style={{
										padding: "8px 0 12px",
										fontSize: 12.5,
										color: "var(--warning)",
									}}
								>
									<AlertTriangle
										size={12}
										style={{ verticalAlign: -2, marginRight: 4 }}
									/>
									Complete required items before running payroll
								</div>
							)}
							{checklist.map((item) => (
								<div className="ck-item" key={item.key}>
									<div className={`ck-tick ${item.status}`}>
										{item.status === "done" && <Check size={10} />}
										{item.status === "warn" && <AlertTriangle size={10} />}
									</div>
									<div className="ck-body">
										<div className="ttl">
											{item.title}
											<span
												style={{
													marginLeft: 6,
													fontSize: 9,
													padding: "1px 5px",
													borderRadius: 4,
													background: item.required
														? "var(--accent-soft)"
														: "var(--bg-3)",
													color: item.required
														? "var(--accent)"
														: "var(--fg-4)",
												}}
											>
												{item.required ? "Required" : "Optional"}
											</span>
										</div>
										<div className="sub">{item.description}</div>
										{item.status !== "done" && (
											<div
												className="sub"
												style={{ marginTop: 2, fontStyle: "italic" }}
											>
												{item.why}
												{item.href && (
													<Link
														style={{
															marginLeft: 6,
															color: "var(--accent)",
															textDecoration: "none",
															fontSize: 11,
														}}
														to={item.href}
													>
														Fix →
													</Link>
												)}
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					{settings && (
						<div className="side-card">
							<div className="side-head">
								<span className="ttl">Payroll settings</span>
							</div>
							<div className="side-body">
								<div className="fact-row">
									<span className="k">Currency</span>
									<span className="v">{settings.defaultCurrency}</span>
								</div>
								<div className="fact-row">
									<span className="k">Pay frequency</span>
									<span className="v">{settings.defaultPayFrequency}</span>
								</div>
								<div className="fact-row">
									<span className="k">Work hours/day</span>
									<span className="v">{settings.standardHoursPerDay}h</span>
								</div>
								<div className="fact-row">
									<span className="k">Weekday OT</span>
									<span className="v">
										{settings.weekdayOvertimeMultiplier}×
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Sunday OT</span>
									<span className="v">{settings.sundayMultiplier}×</span>
								</div>
							</div>
						</div>
					)}

					{activeProfile && (
						<div className="side-card">
							<div className="side-head">
								<span className="ttl">
									{activeProfile.countryName} tax rules
								</span>
							</div>
							<div className="side-body">
								<div className="fact-row">
									<span className="k">Employee NIS</span>
									<span className="v">{activeProfile.employeeNISRate}%</span>
								</div>
								<div className="fact-row">
									<span className="k">Employer NIS</span>
									<span className="v">{activeProfile.employerNISRate}%</span>
								</div>
								<div className="fact-row">
									<span className="k">Personal allowance</span>
									<span className="v">
										$
										{Number(
											activeProfile.personalAllowanceThreshold ?? 0
										).toLocaleString()}
									</span>
								</div>
								<div className="bands">
									{(
										activeProfile.taxBrackets as Array<{
											min: number;
											max: number | null;
											rate: number;
										}>
									)?.map((b, i) => (
										<div
											className={`band-row ${i > 0 ? "hi" : ""}`}
											key={b.min}
										>
											<span className="l">
												{b.max
													? `Up to $${b.max.toLocaleString()}`
													: `Above $${b.min.toLocaleString()}`}
											</span>
											<span className="r">{(b.rate * 100).toFixed(0)}%</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				<div
					style={{
						marginTop: 14,
						padding: "12px 16px",
						background: "var(--bg-1)",
						border: "1px solid var(--line)",
						borderRadius: 12,
						fontSize: 12,
						color: "var(--fg-4)",
						lineHeight: 1.6,
					}}
				>
					Payroll calculations use Guyana 2026 rules based on researched
					guidance. Official statutory verification is required before
					production use. Barbados and Trinidad rules are documented but not yet
					implemented. Bank export templates require official bank file
					specifications.
				</div>
			</div>
		</div>
	);
}

function NavRow({
	icon,
	label,
	sub,
	href,
	disabled,
	note,
}: {
	icon: React.ReactNode;
	label: string;
	sub: string;
	href: string;
	disabled?: boolean;
	note?: string;
}) {
	const content = (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 14,
				padding: "12px 14px",
				borderBottom: "1px solid var(--line)",
				cursor: disabled ? "default" : "pointer",
				opacity: disabled ? 0.5 : 1,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: 34,
					height: 34,
					background: "var(--bg-3)",
					borderRadius: 10,
					color: "var(--fg-2)",
				}}
			>
				{icon}
			</div>
			<div style={{ flex: 1 }}>
				<div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
				<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 1 }}>
					{note ? <em>{note}</em> : sub}
				</div>
			</div>
			{!disabled && <ArrowRight size={14} style={{ color: "var(--fg-4)" }} />}
		</div>
	);

	if (disabled) {
		return content;
	}
	return (
		<Link style={{ textDecoration: "none", color: "inherit" }} to={href}>
			{content}
		</Link>
	);
}

interface ChecklistItem {
	description: string;
	href?: string;
	key: string;
	required: boolean;
	status: "done" | "warn" | "todo";
	title: string;
	why: string;
}

function buildChecklist(
	settings: unknown,
	profile: unknown,
	openPeriods: unknown[],
	dashboard: { totalRuns?: number } | undefined
): ChecklistItem[] {
	return [
		{
			key: "profile",
			title: "Country payroll profile",
			description: profile
				? "Configured"
				: "Set up PAYE, NIS, and allowance rules",
			status: profile ? "done" : "todo",
			required: true,
			href: "/app/payroll/settings",
			why: "Tax and NIS rules determine how payroll is calculated.",
		},
		{
			key: "settings",
			title: "Payroll settings",
			description: settings
				? "Configured"
				: "Set currency, overtime, and work schedule",
			status: settings ? "done" : "todo",
			required: true,
			href: "/app/payroll/settings",
			why: "Overtime rates and work schedule affect pay calculations.",
		},
		{
			key: "period",
			title: "Pay period",
			description:
				openPeriods.length > 0
					? `${openPeriods.length} open`
					: "Create a pay period",
			status: openPeriods.length > 0 ? "done" : "todo",
			required: true,
			href: "/app/payroll/settings",
			why: "A pay period defines the date range for each payroll run.",
		},
		{
			key: "payitems",
			title: "Pay items",
			description: "PAYE, NIS, allowances, deductions",
			status: settings ? "done" : "todo",
			required: true,
			href: "/app/payroll/pay-items",
			why: "Pay items control which allowances and deductions apply.",
		},
		{
			key: "employees",
			title: "Employees with contracts",
			description: "Active contracts required for payroll",
			status: "done",
			required: true,
			href: "/app/employees",
			why: "Each employee needs an active contract with salary details.",
		},
		{
			key: "attendance",
			title: "Attendance configured",
			description: "Attendance records feed payroll hours",
			status: "done",
			required: false,
			href: "/app/attendance",
			why: "Attendance data determines worked hours and overtime.",
		},
		{
			key: "leave",
			title: "Leave types configured",
			description: "Leave affects payroll deductions",
			status: "done",
			required: false,
			href: "/app/leave",
			why: "Unpaid leave reduces pay; paid leave keeps salary intact.",
		},
		{
			key: "run",
			title: "First payroll run",
			description: dashboard?.totalRuns
				? "Completed"
				: "Preview payroll to verify setup",
			status: (dashboard?.totalRuns ?? 0) > 0 ? "done" : "todo",
			required: false,
			href: "/app/payroll/run",
			why: "Run a preview to verify your payroll setup is correct.",
		},
	];
}
