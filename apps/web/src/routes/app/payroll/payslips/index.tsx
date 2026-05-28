import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, FileText, Search } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { PayrollTabs } from "@/features/payroll/payroll-tabs";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

const SK_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const SK_CELLS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6"];

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/payslips/")({
	component: PayslipsPage,
});

type StatusFilter = "all" | "draft" | "confirmed" | "paid";

function PayslipsPage() {
	const org = useContext(OrgCtx);
	const canManage = PAYROLL_ROLES.includes(org.memberRole);
	const isEmployee =
		org.memberRole === "employee" || org.memberRole === "manager";

	const [filter, setFilter] = useState<StatusFilter>("all");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);

	const adminQuery = useQuery({
		...orpc.payroll.payslips.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page,
				pageSize: 50,
			},
		}),
		enabled: canManage,
	});

	const ownQuery = useQuery({
		...orpc.payroll.payslips.getOwn.queryOptions({
			input: { page, pageSize: 50 },
		}),
		enabled: isEmployee,
	});

	const data = canManage ? adminQuery.data : ownQuery.data;
	const isLoading = canManage ? adminQuery.isLoading : ownQuery.isLoading;
	const slips = (data?.data ?? []) as Record<string, unknown>[];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / 50);

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
					<h1 className="page-title">
						{isEmployee ? "My payslips" : "Payslips"}
					</h1>
					<p className="page-sub">
						{isEmployee
							? "Payslips show your earnings, deductions, and net pay for each period."
							: "Payslips show the final breakdown of earnings, deductions, and net pay for every employee."}
					</p>
				</div>
			</div>

			<PayrollTabs />

			{canManage && (
				<div className="toolbar">
					<div className="search-wrap">
						<Search size={14} />
						<input
							className="search"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search payslips..."
							value={search}
						/>
					</div>
					<div className="toolbar-divider" />
					<div className="segmented">
						{(["all", "draft", "confirmed", "paid"] as const).map((f) => (
							<button
								className={`seg-btn ${filter === f ? "active" : ""}`}
								key={f}
								onClick={() => {
									setFilter(f);
									setPage(1);
								}}
								type="button"
							>
								{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
							</button>
						))}
					</div>
				</div>
			)}

			<div className="emp-table">
				<table>
					<thead>
						<tr>
							{canManage && <th>Employee</th>}
							<th>Period</th>
							<th style={{ textAlign: "right" }}>Gross</th>
							<th style={{ textAlign: "right" }}>Deductions</th>
							<th style={{ textAlign: "right" }}>Net pay</th>
							<th>Status</th>
							<th style={{ textAlign: "right" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{isLoading &&
							SK_ROWS.map((rk) => (
								<tr key={rk}>
									{SK_CELLS.map((ck) => (
										<td key={ck}>
											<div
												style={{
													height: 12,
													width: 80,
													background: "var(--bg-3)",
													borderRadius: 4,
												}}
											/>
										</td>
									))}
								</tr>
							))}
						{!isLoading && slips.length === 0 && (
							<tr>
								<td
									colSpan={canManage ? 7 : 6}
									style={{
										textAlign: "center",
										padding: 40,
										color: "var(--fg-3)",
									}}
								>
									<FileText
										size={28}
										style={{ marginBottom: 8, color: "var(--fg-4)" }}
									/>
									<div style={{ fontSize: 14, fontWeight: 500 }}>
										No payslips found
									</div>
									<div style={{ fontSize: 12.5, marginTop: 4 }}>
										{isEmployee
											? "Your payslips will appear here after payroll is confirmed."
											: "Run payroll to generate payslips."}
									</div>
								</td>
							</tr>
						)}
						{!isLoading &&
							slips.length > 0 &&
							slips.map((s) => (
								<tr key={s.id as string}>
									{canManage && (
										<td>
											<div style={{ fontWeight: 500 }}>
												{s.employeeId as string}
											</div>
											<div
												style={{
													fontSize: 11,
													color: "var(--fg-3)",
													marginTop: 1,
												}}
											>
												{s.wageType as string}
											</div>
										</td>
									)}
									<td>
										<div style={{ fontSize: 13 }}>
											{fmtDate(s.periodStart as string)} —{" "}
											{fmtDate(s.periodEnd as string)}
										</div>
									</td>
									<td className="num-cell">
										{s.currency as string} $
										{Number(s.grossPay).toLocaleString()}
									</td>
									<td className="num-cell neg">
										${Number(s.totalDeductions).toLocaleString()}
									</td>
									<td className="num-cell">
										${Number(s.netPay).toLocaleString()}
									</td>
									<td>
										<span
											className={`badge ${payslipBadge(s.status as string)}`}
											style={{ fontSize: 10 }}
										>
											{s.status as string}
										</span>
									</td>
									<td style={{ textAlign: "right" }}>
										<Link
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
												fontSize: 12,
												color: "var(--accent)",
												textDecoration: "none",
											}}
											to={`/app/payroll/payslips/${s.id as string}`}
										>
											<Eye size={13} />
											View
										</Link>
									</td>
								</tr>
							))}
					</tbody>
				</table>
			</div>

			{totalPages > 1 && (
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginTop: 14,
						fontSize: 13,
						color: "var(--fg-3)",
					}}
				>
					<span>
						Page {page} of {totalPages} ({total} payslips)
					</span>
					<div style={{ display: "flex", gap: 6 }}>
						{page > 1 && (
							<button
								className="btn btn-outline btn-xs"
								onClick={() => setPage(page - 1)}
								type="button"
							>
								Previous
							</button>
						)}
						{page < totalPages && (
							<button
								className="btn btn-outline btn-xs"
								onClick={() => setPage(page + 1)}
								type="button"
							>
								Next
							</button>
						)}
					</div>
				</div>
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
