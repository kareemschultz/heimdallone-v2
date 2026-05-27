import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle,
	ChevronDown,
	Plus,
	Search,
	SkipForward,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const SK_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const SK_CELLS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/loans")({
	component: LoansPage,
});

type LoanFilter = "active" | "settled" | "written_off" | "all";

function LoansPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const [filter, setFilter] = useState<LoanFilter>("active");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

	const { data, isLoading } = useQuery(
		orpc.payroll.loans.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page,
				pageSize: 50,
			},
		})
	);

	const loans = data?.data ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / 50);

	async function handleSettle(id: string, title: string) {
		try {
			await client.payroll.loans.settle({ id });
			toast.success(`"${title}" settled`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to settle");
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Payroll</span>
						<span className="sep">/</span>
						<span>Loans &amp; advances</span>
					</div>
					<h1 className="page-title">Loans &amp; salary advances</h1>
					<p className="page-sub">
						Employee loans, salary advances, and installment tracking
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						Create loan
					</button>
				)}
			</div>

			<div className="toolbar">
				<div className="search-wrap">
					<Search size={14} />
					<input
						className="search"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search loans..."
						value={search}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{(["active", "settled", "all"] as const).map((f) => (
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

			<div
				style={{
					marginBottom: 14,
					padding: "10px 16px",
					background: "var(--bg-1)",
					border: "1px solid var(--line)",
					borderRadius: 12,
					fontSize: 12.5,
					color: "var(--fg-3)",
					lineHeight: 1.6,
				}}
			>
				<strong style={{ color: "var(--fg-2)" }}>How loans work:</strong> Loan
				deductions reduce net pay each period. Skipped installments should be
				reviewed by payroll admin. Settling a loan stops all future deductions.
			</div>

			<div className="emp-table">
				<table>
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th style={{ textAlign: "right" }}>Principal</th>
							<th style={{ textAlign: "right" }}>Remaining</th>
							<th style={{ textAlign: "right" }}>Installment</th>
							<th>Progress</th>
							<th>Status</th>
							{canManage && <th style={{ textAlign: "right" }}>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{isLoading &&
							SK_ROWS.map((rk) => (
								<tr key={rk}>
									{SK_CELLS.slice(0, canManage ? 8 : 7).map((ck) => (
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
						{!isLoading && loans.length === 0 && (
							<tr>
								<td
									colSpan={canManage ? 8 : 7}
									style={{
										textAlign: "center",
										padding: 40,
										color: "var(--fg-3)",
									}}
								>
									No loans found
								</td>
							</tr>
						)}
						{!isLoading &&
							loans.length > 0 &&
							loans.map((loan: Record<string, unknown>) => (
								<tr key={loan.id as string}>
									<td>
										<div style={{ fontWeight: 500 }}>
											{loan.title as string}
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-3)",
												marginTop: 1,
											}}
										>
											{loan.currency as string} · Started{" "}
											{formatDate(loan.providedDate as string)}
										</div>
									</td>
									<td>
										<span
											className={`badge ${(loan.type as string) === "advance" ? "badge-accent" : "badge-outline"}`}
											style={{ fontSize: 10 }}
										>
											{loan.type as string}
										</span>
									</td>
									<td className="num-cell">
										${Number(loan.amount).toLocaleString()}
									</td>
									<td className="num-cell">
										${Number(loan.remainingBalance).toLocaleString()}
									</td>
									<td className="num-cell">
										${Number(loan.installmentAmount).toLocaleString()}
									</td>
									<td>
										<div style={{ fontSize: 11, color: "var(--fg-3)" }}>
											{loan.paidInstallments as number}/
											{loan.totalInstallments as number} paid
										</div>
										<div
											style={{
												height: 4,
												background: "var(--bg-3)",
												borderRadius: 2,
												marginTop: 3,
											}}
										>
											<div
												style={{
													height: 4,
													background: "var(--accent)",
													borderRadius: 2,
													width: `${((loan.paidInstallments as number) / (loan.totalInstallments as number)) * 100}%`,
												}}
											/>
										</div>
									</td>
									<td>
										<span
											className={`badge ${(loan.status as string) === "active" ? "badge-success" : "badge-outline"}`}
											style={{ fontSize: 10 }}
										>
											{loan.status as string}
										</span>
									</td>
									{canManage && (
										<td style={{ textAlign: "right" }}>
											<div
												style={{
													display: "flex",
													gap: 4,
													justifyContent: "flex-end",
												}}
											>
												<button
													className="btn btn-ghost btn-xs"
													onClick={() =>
														setExpandedLoan(
															expandedLoan === (loan.id as string)
																? null
																: (loan.id as string)
														)
													}
													title="View installments"
													type="button"
												>
													<ChevronDown size={13} />
												</button>
												{(loan.status as string) === "active" && (
													<button
														className="btn btn-ghost btn-xs"
														onClick={() =>
															handleSettle(
																loan.id as string,
																loan.title as string
															)
														}
														title="Settle loan"
														type="button"
													>
														<CheckCircle size={13} />
													</button>
												)}
											</div>
										</td>
									)}
								</tr>
							))}
					</tbody>
				</table>
			</div>

			{expandedLoan && (
				<InstallmentsPanel
					loanId={expandedLoan}
					onClose={() => setExpandedLoan(null)}
				/>
			)}

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
						Page {page} of {totalPages} ({total} loans)
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

			{showCreate && (
				<CreateLoanDialog
					onClose={() => {
						setShowCreate(false);
						qc.invalidateQueries();
					}}
				/>
			)}
		</div>
	);
}

function InstallmentsPanel({
	loanId,
	onClose,
}: {
	loanId: string;
	onClose: () => void;
}) {
	const qc = useQueryClient();

	const { data: installments, isLoading } = useQuery(
		orpc.payroll.loans.listInstallments.queryOptions({ input: { loanId } })
	);

	async function handleSkip(installmentId: string, seq: number) {
		try {
			await client.payroll.loans.skipInstallment({ installmentId, loanId });
			toast.success(`Installment #${seq} skipped`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to skip");
		}
	}

	return (
		<div
			style={{
				marginTop: 14,
				background: "var(--bg-1)",
				border: "1px solid var(--line)",
				borderRadius: 14,
				padding: 16,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 12,
				}}
			>
				<span style={{ fontWeight: 600, fontSize: 14 }}>Installments</span>
				<button
					className="btn btn-ghost btn-xs"
					onClick={onClose}
					type="button"
				>
					Close
				</button>
			</div>
			{isLoading ? (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading...</div>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th
								style={{
									padding: "6px 10px",
									fontSize: 10,
									fontWeight: 500,
									color: "var(--fg-3)",
									textAlign: "left",
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								#
							</th>
							<th
								style={{
									padding: "6px 10px",
									fontSize: 10,
									fontWeight: 500,
									color: "var(--fg-3)",
									textAlign: "left",
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Due date
							</th>
							<th
								style={{
									padding: "6px 10px",
									fontSize: 10,
									fontWeight: 500,
									color: "var(--fg-3)",
									textAlign: "right",
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Amount
							</th>
							<th
								style={{
									padding: "6px 10px",
									fontSize: 10,
									fontWeight: 500,
									color: "var(--fg-3)",
									textAlign: "left",
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Status
							</th>
							<th
								style={{
									padding: "6px 10px",
									fontSize: 10,
									fontWeight: 500,
									color: "var(--fg-3)",
									textAlign: "right",
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{(installments ?? []).map((inst: Record<string, unknown>) => (
							<tr
								key={inst.id as string}
								style={{ borderTop: "1px solid var(--line)" }}
							>
								<td style={{ padding: "8px 10px", fontSize: 13 }}>
									{inst.sequenceNumber as number}
								</td>
								<td style={{ padding: "8px 10px", fontSize: 13 }}>
									{formatDate(inst.dueDate as string)}
								</td>
								<td
									style={{
										padding: "8px 10px",
										fontSize: 13,
										textAlign: "right",
										fontFamily: "'JetBrains Mono', monospace",
									}}
								>
									${Number(inst.amount).toLocaleString()}
								</td>
								<td style={{ padding: "8px 10px" }}>
									<span
										className={`badge ${installmentBadge(inst.status as string)}`}
										style={{ fontSize: 10 }}
									>
										{inst.status as string}
									</span>
								</td>
								<td style={{ padding: "8px 10px", textAlign: "right" }}>
									{(inst.status as string) === "pending" && (
										<button
											className="btn btn-ghost btn-xs"
											onClick={() =>
												handleSkip(
													inst.id as string,
													inst.sequenceNumber as number
												)
											}
											title="Skip installment"
											type="button"
										>
											<SkipForward size={12} />
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function CreateLoanDialog({ onClose }: { onClose: () => void }) {
	const [type, setType] = useState<"loan" | "advance" | "fine">("loan");
	const [employeeId, setEmployeeId] = useState("");
	const [title, setTitle] = useState("");
	const [amount, setAmount] = useState("");
	const [totalInstallments, setTotalInstallments] = useState("12");
	const [installmentAmount, setInstallmentAmount] = useState("");
	const [installmentStartDate, setInstallmentStartDate] = useState("");
	const [providedDate, setProvidedDate] = useState(
		new Date().toISOString().split("T")[0] ?? ""
	);
	const [saving, setSaving] = useState(false);

	async function handleSubmit() {
		if (
			!(
				employeeId.trim() &&
				title.trim() &&
				amount &&
				installmentAmount &&
				installmentStartDate
			)
		) {
			toast.error("Please fill all required fields");
			return;
		}
		setSaving(true);
		try {
			await client.payroll.loans.create({
				employeeId: employeeId.trim(),
				type,
				title: title.trim(),
				amount,
				totalInstallments: Number(totalInstallments),
				installmentAmount,
				installmentStartDate,
				providedDate,
			});
			toast.success(
				`${type === "advance" ? "Salary advance" : "Loan"} "${title}" created`
			);
			onClose();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to create");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
		>
			<div
				style={{
					background: "var(--bg)",
					border: "1px solid var(--line)",
					borderRadius: 18,
					padding: 24,
					width: 440,
					maxHeight: "80vh",
					overflow: "auto",
				}}
			>
				<h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
					Create loan or advance
				</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
					<FieldWrap label="Type">
						<select
							className="emp-search"
							onChange={(e) => setType(e.target.value as typeof type)}
							style={{ width: "100%" }}
							value={type}
						>
							<option value="loan">Loan</option>
							<option value="advance">Salary advance</option>
							<option value="fine">Fine/penalty</option>
						</select>
					</FieldWrap>
					<FieldWrap label="Employee ID">
						<input
							className="emp-search"
							onChange={(e) => setEmployeeId(e.target.value)}
							placeholder="Enter employee ID"
							style={{ width: "100%" }}
							value={employeeId}
						/>
					</FieldWrap>
					<FieldWrap label="Title">
						<input
							className="emp-search"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Emergency Loan"
							style={{ width: "100%" }}
							value={title}
						/>
					</FieldWrap>
					<FieldWrap label="Total amount">
						<input
							className="emp-search"
							onChange={(e) => setAmount(e.target.value)}
							placeholder="100000"
							style={{ width: "100%" }}
							type="number"
							value={amount}
						/>
					</FieldWrap>
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
					>
						<FieldWrap label="Installments">
							<input
								className="emp-search"
								min="1"
								onChange={(e) => setTotalInstallments(e.target.value)}
								style={{ width: "100%" }}
								type="number"
								value={totalInstallments}
							/>
						</FieldWrap>
						<FieldWrap label="Installment amount">
							<input
								className="emp-search"
								onChange={(e) => setInstallmentAmount(e.target.value)}
								placeholder="8334"
								style={{ width: "100%" }}
								type="number"
								value={installmentAmount}
							/>
						</FieldWrap>
					</div>
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
					>
						<FieldWrap label="Provided date">
							<input
								className="emp-search"
								onChange={(e) => setProvidedDate(e.target.value)}
								style={{ width: "100%" }}
								type="date"
								value={providedDate}
							/>
						</FieldWrap>
						<FieldWrap label="First installment date">
							<input
								className="emp-search"
								onChange={(e) => setInstallmentStartDate(e.target.value)}
								style={{ width: "100%" }}
								type="date"
								value={installmentStartDate}
							/>
						</FieldWrap>
					</div>
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						justifyContent: "flex-end",
						marginTop: 20,
					}}
				>
					<button className="btn btn-outline" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={saving}
						onClick={handleSubmit}
						type="button"
					>
						{saving ? "Creating..." : "Create"}
					</button>
				</div>
			</div>
		</div>
	);
}

function FieldWrap({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<span
				style={{
					display: "block",
					fontSize: 13,
					fontWeight: 500,
					marginBottom: 4,
				}}
			>
				{label}
			</span>
			{children}
		</div>
	);
}

function installmentBadge(status: string): string {
	if (status === "deducted") {
		return "badge-success";
	}
	if (status === "skipped") {
		return "badge-warning";
	}
	return "badge-outline";
}

function formatDate(d: string | Date): string {
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
