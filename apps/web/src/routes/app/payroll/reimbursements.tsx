import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Search, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const SK_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const SK_CELLS = ["c0", "c1", "c2", "c3", "c4", "c5"];

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/reimbursements")({
	component: ReimbursementsPage,
});

type ReimbFilter = "requested" | "approved" | "rejected" | "paid" | "all";

function ReimbursementsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const [filter, setFilter] = useState<ReimbFilter>("requested");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const { data, isLoading } = useQuery(
		orpc.payroll.reimbursements.list.queryOptions({
			input: {
				status: filter === "all" ? undefined : filter,
				page,
				pageSize: 50,
			},
		})
	);

	const rows = data?.data ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / 50);

	async function handleApprove(id: string, title: string) {
		try {
			await client.payroll.reimbursements.approve({ id });
			toast.success(`"${title}" approved`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to approve");
		}
	}

	async function handleReject(id: string, title: string) {
		try {
			await client.payroll.reimbursements.reject({ id });
			toast.success(`"${title}" rejected`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to reject");
		}
	}

	async function handleMarkPaid(id: string, title: string) {
		try {
			await client.payroll.reimbursements.markPaid({ id });
			toast.success(`"${title}" marked as paid`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to mark paid");
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
						<span>Reimbursements</span>
					</div>
					<h1 className="page-title">Reimbursements</h1>
					<p className="page-sub">
						Expense claims, leave encashment, and bonus payments
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						Create reimbursement
					</button>
				)}
			</div>

			<div className="toolbar">
				<div className="search-wrap">
					<Search size={14} />
					<input
						className="search"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search reimbursements..."
						value={search}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{(["requested", "approved", "paid", "rejected", "all"] as const).map(
						(f) => (
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
						)
					)}
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
				<strong style={{ color: "var(--fg-2)" }}>
					How reimbursements work:
				</strong>{" "}
				Reimbursements add to net pay but are not salary. Approved
				reimbursements are included in the next payroll run. Paid reimbursements
				have been disbursed.
			</div>

			<div className="emp-table">
				<table>
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th>Date</th>
							<th style={{ textAlign: "right" }}>Amount</th>
							<th>Status</th>
							{canManage && <th style={{ textAlign: "right" }}>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{isLoading &&
							SK_ROWS.map((rk) => (
								<tr key={rk}>
									{SK_CELLS.slice(0, canManage ? 6 : 5).map((ck) => (
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
						{!isLoading && rows.length === 0 && (
							<tr>
								<td
									colSpan={canManage ? 6 : 5}
									style={{
										textAlign: "center",
										padding: 40,
										color: "var(--fg-3)",
									}}
								>
									No reimbursements found
								</td>
							</tr>
						)}
						{!isLoading &&
							rows.length > 0 &&
							rows.map((row: Record<string, unknown>) => (
								<tr key={row.id as string}>
									<td>
										<div style={{ fontWeight: 500 }}>{row.title as string}</div>
										{row.description && (
											<div
												style={{
													fontSize: 11,
													color: "var(--fg-3)",
													marginTop: 1,
												}}
											>
												{row.description as string}
											</div>
										)}
									</td>
									<td>
										<span
											className="badge badge-outline"
											style={{ fontSize: 10 }}
										>
											{reimbursementTypeLabel(row.type as string)}
										</span>
									</td>
									<td style={{ fontSize: 13, color: "var(--fg-3)" }}>
										{formatDate(row.reimbursementDate as string)}
									</td>
									<td className="num-cell">
										{row.currency as string} $
										{Number(row.amount).toLocaleString()}
									</td>
									<td>
										<span
											className={`badge ${statusBadge(row.status as string)}`}
											style={{ fontSize: 10 }}
										>
											{row.status as string}
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
												{(row.status as string) === "requested" && (
													<>
														<button
															className="btn btn-ghost btn-xs"
															onClick={() =>
																handleApprove(
																	row.id as string,
																	row.title as string
																)
															}
															style={{ color: "var(--success)" }}
															title="Approve"
															type="button"
														>
															<Check size={13} />
														</button>
														<button
															className="btn btn-ghost btn-xs"
															onClick={() =>
																handleReject(
																	row.id as string,
																	row.title as string
																)
															}
															style={{ color: "var(--danger)" }}
															title="Reject"
															type="button"
														>
															<X size={13} />
														</button>
													</>
												)}
												{(row.status as string) === "approved" && (
													<button
														className="btn btn-ghost btn-xs"
														onClick={() =>
															handleMarkPaid(
																row.id as string,
																row.title as string
															)
														}
														title="Mark paid"
														type="button"
													>
														Mark paid
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
						Page {page} of {totalPages} ({total} items)
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
				<CreateReimbursementDialog
					onClose={() => {
						setShowCreate(false);
						qc.invalidateQueries();
					}}
				/>
			)}
		</div>
	);
}

function CreateReimbursementDialog({ onClose }: { onClose: () => void }) {
	const [type, setType] = useState<"expense" | "leave_encash" | "bonus_encash">(
		"expense"
	);
	const [employeeId, setEmployeeId] = useState("");
	const [title, setTitle] = useState("");
	const [amount, setAmount] = useState("");
	const [reimbursementDate, setReimbursementDate] = useState(
		new Date().toISOString().split("T")[0] ?? ""
	);
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);

	async function handleSubmit() {
		if (!(employeeId.trim() && title.trim() && amount)) {
			toast.error("Please fill all required fields");
			return;
		}
		setSaving(true);
		try {
			await client.payroll.reimbursements.create({
				employeeId: employeeId.trim(),
				type,
				title: title.trim(),
				amount,
				reimbursementDate,
				description: description || null,
			});
			toast.success(`Reimbursement "${title}" created`);
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
				}}
			>
				<h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
					Create reimbursement
				</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
					<FieldWrap label="Type">
						<select
							className="emp-search"
							onChange={(e) => setType(e.target.value as typeof type)}
							style={{ width: "100%" }}
							value={type}
						>
							<option value="expense">Expense claim</option>
							<option value="leave_encash">Leave encashment</option>
							<option value="bonus_encash">Bonus payment</option>
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
							placeholder="e.g. Office Supplies"
							style={{ width: "100%" }}
							value={title}
						/>
					</FieldWrap>
					<FieldWrap label="Amount">
						<input
							className="emp-search"
							onChange={(e) => setAmount(e.target.value)}
							placeholder="5000"
							style={{ width: "100%" }}
							type="number"
							value={amount}
						/>
					</FieldWrap>
					<FieldWrap label="Date">
						<input
							className="emp-search"
							onChange={(e) => setReimbursementDate(e.target.value)}
							style={{ width: "100%" }}
							type="date"
							value={reimbursementDate}
						/>
					</FieldWrap>
					<FieldWrap label="Description (optional)">
						<input
							className="emp-search"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Reason for reimbursement"
							style={{ width: "100%" }}
							value={description}
						/>
					</FieldWrap>
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

function reimbursementTypeLabel(type: string): string {
	if (type === "expense") {
		return "Expense";
	}
	if (type === "leave_encash") {
		return "Leave encash";
	}
	return "Bonus";
}

function statusBadge(status: string): string {
	if (status === "approved") {
		return "badge-success";
	}
	if (status === "paid") {
		return "badge-accent";
	}
	if (status === "rejected") {
		return "badge-danger";
	}
	return "badge-warning";
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
