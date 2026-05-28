import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	CheckCircle,
	Download,
	Eye,
	FileText,
	Plus,
	Send,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { PayrollTabs } from "@/features/payroll/payroll-tabs";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const SK_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const SK_CELLS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6"];

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/payments")({
	component: PaymentsPage,
});

function PaymentsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const [showCreate, setShowCreate] = useState(false);
	const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

	const { data, isLoading } = useQuery(
		orpc.payroll.paymentBatches.list.queryOptions({
			input: { page: 1, pageSize: 50 },
		})
	);

	const batches = (data?.data ?? []) as Record<string, unknown>[];

	if (!canManage) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Payment export</h1>
						<p className="page-sub">
							You don't have permission to manage payment exports.
						</p>
					</div>
				</div>
			</div>
		);
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
						<span>Payments</span>
					</div>
					<h1 className="page-title">Payment export</h1>
					<p className="page-sub">
						Create payment batches from confirmed payroll runs, export bank
						files, and track payment status.
					</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setShowCreate(true)}
					type="button"
				>
					<Plus size={13} />
					Create payment batch
				</button>
			</div>

			<PayrollTabs />

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
				<strong style={{ color: "var(--fg-2)" }}>How payments work:</strong>{" "}
				Exporting a bank file does not mean employees have been paid. Upload the
				file to your bank portal, then mark as submitted. Mark as paid only
				after your bank confirms processing. Republic Bank/EZPay templates
				require official bank file specs — use Generic CSV for now.
			</div>

			<div className="emp-table">
				<div className="emp-head">
					<span style={{ fontWeight: 600, fontSize: 14 }}>Payment batches</span>
				</div>
				<table>
					<thead>
						<tr>
							<th>Batch</th>
							<th>Employees</th>
							<th style={{ textAlign: "right" }}>Total</th>
							<th>Format</th>
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
						{!isLoading && batches.length === 0 && (
							<tr>
								<td
									colSpan={6}
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
										No payment batches yet
									</div>
									<div style={{ fontSize: 12.5, marginTop: 4 }}>
										Create a payment batch from a confirmed payroll run to get
										started.
									</div>
								</td>
							</tr>
						)}
						{!isLoading &&
							batches.length > 0 &&
							batches.map((b) => (
								<tr key={b.id as string}>
									<td>
										<div style={{ fontWeight: 500 }}>
											{(b.id as string).slice(0, 12)}...
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-3)",
												marginTop: 1,
											}}
										>
											{b.currency as string} · {fmtDate(b.createdAt as string)}
										</div>
									</td>
									<td>{b.totalEmployees as number}</td>
									<td className="num-cell">
										${Number(b.totalAmount).toLocaleString()}
									</td>
									<td>
										<span
											className="badge badge-outline"
											style={{ fontSize: 10 }}
										>
											{b.exportFormat as string}
										</span>
									</td>
									<td>
										<span
											className={`badge ${batchBadge(b.status as string)}`}
											style={{ fontSize: 10 }}
										>
											{b.status as string}
										</span>
									</td>
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
												onClick={() => setSelectedBatchId(b.id as string)}
												title="View details"
												type="button"
											>
												<Eye size={13} />
											</button>
											<BatchActions
												batch={b}
												onAction={() => qc.invalidateQueries()}
											/>
										</div>
									</td>
								</tr>
							))}
					</tbody>
				</table>
			</div>

			{showCreate && (
				<CreateBatchDialog
					onClose={() => {
						setShowCreate(false);
						qc.invalidateQueries();
					}}
				/>
			)}

			{selectedBatchId && (
				<BatchDetailPanel
					batchId={selectedBatchId}
					onClose={() => setSelectedBatchId(null)}
				/>
			)}
		</div>
	);
}

function BatchActions({
	batch,
	onAction,
}: {
	batch: Record<string, unknown>;
	onAction: () => void;
}) {
	const status = batch.status as string;

	async function handleTransition(
		action: string,
		method: (input: { id: string }) => Promise<unknown>
	) {
		try {
			await method({ id: batch.id as string });
			toast.success(`Batch ${action}`);
			onAction();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : `Failed to ${action}`);
		}
	}

	async function handleCsvDownload() {
		try {
			const result = (await client.payroll.paymentBatches.generateCsv({
				id: batch.id as string,
			})) as { csv: string; fileName: string };
			const blob = new Blob([result.csv], { type: "text/csv" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = result.fileName;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("CSV downloaded");
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to download CSV");
		}
	}

	return (
		<>
			{status === "draft" && (
				<button
					className="btn btn-ghost btn-xs"
					onClick={() =>
						handleTransition(
							"reviewed",
							client.payroll.paymentBatches.markReviewed
						)
					}
					title="Mark as reviewed"
					type="button"
				>
					<Check size={13} />
				</button>
			)}
			{status === "reviewed" && (
				<>
					<button
						className="btn btn-ghost btn-xs"
						onClick={handleCsvDownload}
						title="Download CSV"
						type="button"
					>
						<Download size={13} />
					</button>
					<button
						className="btn btn-ghost btn-xs"
						onClick={() =>
							handleTransition(
								"exported",
								client.payroll.paymentBatches.markExported
							)
						}
						title="Mark as exported"
						type="button"
					>
						<FileText size={13} />
					</button>
				</>
			)}
			{status === "exported" && (
				<button
					className="btn btn-ghost btn-xs"
					onClick={() =>
						handleTransition(
							"submitted",
							client.payroll.paymentBatches.markSubmitted
						)
					}
					title="Mark as submitted to bank"
					type="button"
				>
					<Send size={13} />
				</button>
			)}
			{status === "submitted" && (
				<button
					className="btn btn-ghost btn-xs"
					onClick={() =>
						handleTransition("paid", client.payroll.paymentBatches.markPaid)
					}
					style={{ color: "var(--success)" }}
					title="Mark as paid"
					type="button"
				>
					<CheckCircle size={13} />
				</button>
			)}
		</>
	);
}

function CreateBatchDialog({ onClose }: { onClose: () => void }) {
	const _org = useContext(OrgCtx);
	const [selectedRunId, setSelectedRunId] = useState("");
	const [saving, setSaving] = useState(false);

	const { data: runs } = useQuery(
		orpc.payroll.runs.list.queryOptions({
			input: { status: "confirmed", page: 1, pageSize: 20 },
		})
	);

	const confirmedRuns = (runs?.data ?? []) as Record<string, unknown>[];

	async function handleCreate() {
		if (!selectedRunId) {
			toast.error("Select a payroll run");
			return;
		}
		setSaving(true);
		try {
			await client.payroll.paymentBatches.create({
				payrollRunId: selectedRunId,
			});
			toast.success("Payment batch created");
			onClose();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to create batch");
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
					Create payment batch
				</h3>
				<div
					style={{
						fontSize: 12.5,
						color: "var(--fg-3)",
						marginBottom: 14,
						lineHeight: 1.6,
					}}
				>
					Select a confirmed payroll run to create a payment batch. Only
					confirmed runs can generate payment exports.
				</div>
				<div style={{ marginBottom: 16 }}>
					<span
						style={{
							display: "block",
							fontSize: 13,
							fontWeight: 500,
							marginBottom: 4,
						}}
					>
						Payroll run
					</span>
					{confirmedRuns.length === 0 ? (
						<div
							style={{
								padding: 16,
								textAlign: "center",
								color: "var(--fg-3)",
								fontSize: 13,
								background: "var(--bg-2)",
								borderRadius: 10,
							}}
						>
							No confirmed payroll runs available. Confirm a payroll run first.
						</div>
					) : (
						<select
							className="emp-search"
							onChange={(e) => setSelectedRunId(e.target.value)}
							style={{ width: "100%" }}
							value={selectedRunId}
						>
							<option value="">Select a run...</option>
							{confirmedRuns.map((r) => (
								<option key={r.id as string} value={r.id as string}>
									{r.batchName as string} — {r.employeeCount as number}{" "}
									employees · ${Number(r.totalNet).toLocaleString()} net
								</option>
							))}
						</select>
					)}
				</div>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button className="btn btn-outline" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!selectedRunId || saving}
						onClick={handleCreate}
						type="button"
					>
						{saving ? "Creating..." : "Create batch"}
					</button>
				</div>
			</div>
		</div>
	);
}

function BatchDetailPanel({
	batchId,
	onClose,
}: {
	batchId: string;
	onClose: () => void;
}) {
	const { data, isLoading } = useQuery(
		orpc.payroll.paymentBatches.getById.queryOptions({
			input: { id: batchId },
		})
	);

	const batch = data as Record<string, unknown> | undefined;
	const items = (batch?.items ?? []) as Record<string, unknown>[];

	const missingBank = items.filter((i) => !i.bankName).length;

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
				<span style={{ fontWeight: 600, fontSize: 14 }}>
					Payment batch detail
				</span>
				<button
					className="btn btn-ghost btn-xs"
					onClick={onClose}
					type="button"
				>
					<X size={13} /> Close
				</button>
			</div>

			{isLoading ? (
				<div style={{ padding: 20, color: "var(--fg-3)", textAlign: "center" }}>
					Loading...
				</div>
			) : (
				<>
					{batch && (
						<div
							style={{
								display: "flex",
								gap: 20,
								marginBottom: 14,
								fontSize: 12.5,
							}}
						>
							<div>
								<span style={{ color: "var(--fg-3)" }}>Status: </span>
								<span
									className={`badge ${batchBadge(batch.status as string)}`}
									style={{ fontSize: 10 }}
								>
									{batch.status as string}
								</span>
							</div>
							<div>
								<span style={{ color: "var(--fg-3)" }}>Total: </span>
								<strong>${Number(batch.totalAmount).toLocaleString()}</strong>
							</div>
							<div>
								<span style={{ color: "var(--fg-3)" }}>Employees: </span>
								<strong>{batch.totalEmployees as number}</strong>
							</div>
						</div>
					)}

					{missingBank > 0 && (
						<div
							style={{
								padding: "8px 12px",
								marginBottom: 12,
								background: "var(--warning-soft)",
								border: "1px solid var(--warning)",
								borderRadius: 8,
								fontSize: 12.5,
								color: "var(--warning)",
							}}
						>
							<AlertTriangle
								size={12}
								style={{ verticalAlign: -2, marginRight: 4 }}
							/>
							{missingBank} employee(s) missing bank details. Account numbers
							are masked in preview.
						</div>
					)}

					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr>
								<th style={thStyle}>Employee</th>
								<th style={thStyle}>Bank</th>
								<th style={thStyle}>Account</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
								<th style={thStyle}>Status</th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => (
								<tr
									key={item.id as string}
									style={{ borderTop: "1px solid var(--line)" }}
								>
									<td style={tdStyle}>
										<div style={{ fontWeight: 500 }}>
											{item.employeeName as string}
										</div>
									</td>
									<td style={{ ...tdStyle, color: "var(--fg-3)" }}>
										{(item.bankName as string) || (
											<span style={{ color: "var(--warning)" }}>Not set</span>
										)}
									</td>
									<td
										style={{
											...tdStyle,
											fontFamily: "'JetBrains Mono', monospace",
											fontSize: 12,
										}}
									>
										{(item.accountNumberMasked as string) || "—"}
									</td>
									<td
										style={{
											...tdStyle,
											textAlign: "right",
											fontFamily: "'JetBrains Mono', monospace",
										}}
									>
										${Number(item.amount).toLocaleString()}
									</td>
									<td style={tdStyle}>
										<span
											className={`badge ${paymentItemBadge(item.status as string)}`}
											style={{ fontSize: 10 }}
										>
											{item.status as string}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</div>
	);
}

const thStyle: React.CSSProperties = {
	padding: "6px 10px",
	fontSize: 10,
	fontWeight: 500,
	color: "var(--fg-3)",
	textAlign: "left",
	textTransform: "uppercase",
	letterSpacing: "0.06em",
};

const tdStyle: React.CSSProperties = {
	padding: "8px 10px",
	fontSize: 13,
};

function batchBadge(status: string): string {
	if (status === "paid") {
		return "badge-success";
	}
	if (status === "submitted") {
		return "badge-accent";
	}
	if (status === "exported") {
		return "badge-accent";
	}
	if (status === "reviewed") {
		return "badge-outline";
	}
	if (status === "failed") {
		return "badge-danger";
	}
	if (status === "partially_paid") {
		return "badge-warning";
	}
	if (status === "cancelled") {
		return "badge-outline";
	}
	return "badge-outline";
}

function paymentItemBadge(status: string): string {
	if (status === "paid") {
		return "badge-success";
	}
	if (status === "submitted") {
		return "badge-accent";
	}
	if (status === "exported") {
		return "badge-accent";
	}
	if (status === "failed") {
		return "badge-danger";
	}
	if (status === "skipped") {
		return "badge-warning";
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
