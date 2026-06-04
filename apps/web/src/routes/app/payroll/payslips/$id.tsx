import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useContext } from "react";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { PayrollTabs } from "@/features/payroll/payroll-tabs";
import { canManagePayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/payroll/payslips/$id")({
	component: PayslipDetailPage,
});

function PayslipDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const canManage = canManagePayroll(org.memberRole);
	const isEmployee = org.memberRole === "employee";

	const adminQuery = useQuery({
		...orpc.payroll.payslips.getById.queryOptions({ input: { id } }),
		enabled: canManage,
	});

	const ownQuery = useQuery({
		...orpc.payroll.payslips.getOwnById.queryOptions({ input: { id } }),
		enabled: isEmployee,
	});

	const slip = (canManage ? adminQuery.data : ownQuery.data) as
		| Record<string, unknown>
		| undefined;
	const isLoading = canManage ? adminQuery.isLoading : ownQuery.isLoading;

	const lineItems = (slip?.lineItems ?? []) as Record<string, unknown>[];
	const explanations = (slip?.explanation ?? []) as Record<string, unknown>[];

	const earnings = lineItems.filter((li) => li.type === "earning");
	const deductions = lineItems.filter(
		(li) => li.type === "deduction" || li.type === "tax"
	);
	const employerContribs = lineItems.filter(
		(li) => li.type === "employer_contribution"
	);

	if (isLoading) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>{org.orgName}</span>
							<span className="sep">/</span>
							<span>Payroll</span>
							<span className="sep">/</span>
							<span>Payslips</span>
						</div>
						<h1 className="page-title">Payslip</h1>
					</div>
				</div>
				<div style={{ padding: 40, textAlign: "center", color: "var(--fg-3)" }}>
					Loading payslip...
				</div>
			</div>
		);
	}

	if (!slip) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Payslip not found</h1>
						<p className="page-sub">
							This payslip may not exist or you may not have permission to view
							it.
						</p>
					</div>
				</div>
				<Link
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						color: "var(--accent)",
						textDecoration: "none",
						fontSize: 13,
					}}
					to="/app/payroll/payslips"
				>
					<ArrowLeft size={13} />
					Back to payslips
				</Link>
			</div>
		);
	}

	const isDraft = slip.status === "draft";
	const netPayValue = Number(slip.netPay ?? 0);
	const isNegativeNet = Number.isFinite(netPayValue) && netPayValue < 0;
	const friendlyStatus = ((): string => {
		if (slip.status === "draft") {
			return "Preview";
		}
		if (slip.status === "confirmed") {
			return "Finalized";
		}
		if (slip.status === "paid") {
			return "Paid";
		}
		return String(slip.status ?? "");
	})();

	return (
		<div className="page">
			<div className="page-header" style={{ marginBottom: 10 }}>
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Payroll</span>
						<span className="sep">/</span>
						<span>Payslips</span>
						<span className="sep">/</span>
						<span>Detail</span>
					</div>
					<h1 className="page-title">Payslip</h1>
					<p className="page-sub">
						{fmtDate(slip.periodStart as string)} —{" "}
						{fmtDate(slip.periodEnd as string)} ·{" "}
						<span
							className={`badge ${payslipBadge(slip.status as string)}`}
							style={{ fontSize: 10 }}
						>
							{friendlyStatus}
						</span>
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<Link className="btn btn-outline" to="/app/payroll/payslips">
						<ArrowLeft size={13} />
						Back
					</Link>
					<button
						className="btn btn-outline"
						onClick={() => globalThis.print()}
						type="button"
					>
						<Printer size={13} />
						Print / Save as PDF
					</button>
				</div>
			</div>

			<div className="no-print">
				<PayrollTabs />
			</div>

			<div
				className="no-print"
				style={{
					marginBottom: 14,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "8px 14px",
					background: "var(--bg-1)",
					border: "1px solid var(--line)",
					borderRadius: 10,
				}}
			>
				<div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
					Template: <strong style={{ color: "var(--fg-2)" }}>Classic</strong>
					<span style={{ marginLeft: 8, fontSize: 10, color: "var(--fg-4)" }}>
						Modern, Compact, Detailed, Statutory — coming later
					</span>
				</div>
				<div style={{ fontSize: 11, color: "var(--fg-4)" }}>
					Use Print / Save as PDF to save a copy
				</div>
			</div>

			{isDraft && (
				<div
					style={{
						marginBottom: 14,
						padding: "10px 16px",
						background: "var(--accent-soft)",
						border: "1px solid var(--accent)",
						borderRadius: 12,
						fontSize: 12.5,
						color: "var(--fg-2)",
					}}
				>
					<strong>Preview only</strong> — This payslip is not finalized. Final
					payslip is created only after payroll is confirmed.
				</div>
			)}

			{isNegativeNet && (
				<div
					className="no-print"
					style={{
						marginBottom: 14,
						padding: "12px 16px",
						background: "var(--warning-soft)",
						border: "1px solid var(--warning)",
						borderRadius: 12,
						fontSize: 12.5,
						color: "var(--fg-2)",
						lineHeight: 1.6,
					}}
				>
					<strong style={{ color: "var(--warning)" }}>
						Needs review — blocked preview
					</strong>
					<div style={{ marginTop: 4 }}>
						Deductions on this payslip are larger than gross pay, which would
						result in a negative net. This is not a valid finalized payslip — a
						payroll administrator must review and adjust loans, deductions, or
						hours before confirming.
					</div>
				</div>
			)}

			{/* Print-safe payslip layout */}
			<div className="payslip-print" id="payslip-print">
				<div className="payslip-header">
					<div className="payslip-company">
						<div className="payslip-logo-placeholder">
							{org.orgName.charAt(0)}
						</div>
						<div>
							<div className="payslip-company-name">{org.orgName}</div>
							<div className="payslip-company-sub">Payslip</div>
						</div>
					</div>
					<div className="payslip-meta">
						<div className="payslip-meta-row">
							<span className="k">Period</span>
							<span className="v">
								{fmtDate(slip.periodStart as string)} —{" "}
								{fmtDate(slip.periodEnd as string)}
							</span>
						</div>
						<div className="payslip-meta-row">
							<span className="k">Currency</span>
							<span className="v">{slip.currency as string}</span>
						</div>
						<div className="payslip-meta-row">
							<span className="k">Status</span>
							<span className="v">{slip.status as string}</span>
						</div>
					</div>
				</div>

				<div className="payslip-employee-bar">
					<div>
						<span className="payslip-emp-label">Employee</span>
						<span className="payslip-emp-value">
							{slip.employeeId as string}
						</span>
					</div>
					<div>
						<span className="payslip-emp-label">Wage type</span>
						<span className="payslip-emp-value">{slip.wageType as string}</span>
					</div>
					<div>
						<span className="payslip-emp-label">Contract salary</span>
						<span className="payslip-emp-value">
							${Number(slip.contractWage).toLocaleString()}
						</span>
					</div>
				</div>

				<div className="payslip-sections">
					<div className="payslip-section">
						<div className="payslip-section-title">Earnings</div>
						{earnings.map((li) => (
							<div className="payslip-line" key={li.id as string}>
								<div className="payslip-line-left">
									<span className="payslip-line-title">
										{li.title as string}
									</span>
									{Boolean(li.explanation) && (
										<span className="payslip-line-sub">
											{li.explanation as string}
										</span>
									)}
								</div>
								<span className="payslip-line-amount">
									${Number(li.amount).toLocaleString()}
								</span>
							</div>
						))}
						<div className="payslip-subtotal">
							<span>Gross pay</span>
							<span>${Number(slip.grossPay).toLocaleString()}</span>
						</div>
					</div>

					<div className="payslip-section">
						<div className="payslip-section-title">Deductions &amp; tax</div>
						{deductions.map((li) => (
							<div className="payslip-line" key={li.id as string}>
								<div className="payslip-line-left">
									<span className="payslip-line-title">
										{li.title as string}
									</span>
									{Boolean(li.explanation) && (
										<span className="payslip-line-sub">
											{li.explanation as string}
										</span>
									)}
								</div>
								<span className="payslip-line-amount neg">
									${Number(li.amount).toLocaleString()}
								</span>
							</div>
						))}
						<div className="payslip-subtotal">
							<span>Total deductions</span>
							<span className="neg">
								-${Number(slip.totalDeductions).toLocaleString()}
							</span>
						</div>
					</div>

					{employerContribs.length > 0 && (
						<div className="payslip-section">
							<div className="payslip-section-title">
								Employer contributions
							</div>
							<div
								style={{
									fontSize: 11.5,
									color: "var(--fg-3)",
									marginBottom: 8,
								}}
							>
								Shown for transparency — not deducted from your pay.
							</div>
							{employerContribs.map((li) => (
								<div className="payslip-line" key={li.id as string}>
									<div className="payslip-line-left">
										<span className="payslip-line-title">
											{li.title as string}
										</span>
									</div>
									<span className="payslip-line-amount">
										${Number(li.amount).toLocaleString()}
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="payslip-net">
					<span className="payslip-net-label">Net pay</span>
					<span className="payslip-net-value">
						{slip.currency as string} ${Number(slip.netPay).toLocaleString()}
					</span>
				</div>

				<div className="payslip-hours">
					<div>
						<span className="k">Worked days</span>
						<span className="v">{slip.workedDays as string}</span>
					</div>
					<div>
						<span className="k">Worked hours</span>
						<span className="v">{Number(slip.workedHours).toFixed(1)}h</span>
					</div>
					<div>
						<span className="k">Overtime</span>
						<span className="v">{Number(slip.overtimeHours).toFixed(1)}h</span>
					</div>
					<div>
						<span className="k">Paid leave</span>
						<span className="v">{slip.paidLeaveDays as string} days</span>
					</div>
					<div>
						<span className="k">Unpaid leave</span>
						<span className="v">{slip.unpaidLeaveDays as string} days</span>
					</div>
				</div>

				<div className="payslip-footer">
					<span>
						Generated {fmtDate(slip.generatedAt as string)} · {org.orgName} ·
						Powered by Heimdallone
					</span>
					<span>This payslip is generated from approved payroll data.</span>
				</div>
			</div>

			{/* Calculation explanation — screen only, not printed, collapsible */}
			{explanations.length > 0 && (
				<details className="emp-table no-print" style={{ marginTop: 14 }}>
					<summary
						className="emp-head"
						style={{
							cursor: "pointer",
							listStyle: "none",
							userSelect: "none",
						}}
					>
						<span style={{ fontWeight: 600, fontSize: 14 }}>
							How this was calculated
						</span>
						<span style={{ fontSize: 11, color: "var(--fg-3)" }}>
							{explanations.length} step{explanations.length === 1 ? "" : "s"} —
							click to expand
						</span>
					</summary>
					<div style={{ padding: 16 }}>
						{explanations.map((e) => (
							<div className="fact-row" key={e.step as number}>
								<span className="k">
									Step {e.step as number}: {e.label as string}
								</span>
								<span className="v">${Number(e.result).toLocaleString()}</span>
							</div>
						))}
					</div>
				</details>
			)}
		</div>
	);
}

function payslipBadge(status: string): string {
	if (status === "confirmed") {
		return "badge-success";
	}
	if (status === "paid") {
		return "badge-accent";
	}
	return "badge-outline";
}

function fmtDate(d: string | Date): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}
