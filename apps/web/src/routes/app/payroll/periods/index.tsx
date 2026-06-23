import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PayrollTabs } from "@/features/payroll/payroll-tabs";
import { PAY_FREQUENCY_OPTIONS } from "@/lib/pay-frequency";
import { canManagePayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const SK_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const SK_CELLS = ["c0", "c1", "c2", "c3", "c4", "c5"];

export const Route = createFileRoute("/app/payroll/periods/")({
	component: PayPeriodsPage,
});

type StatusFilter = "open" | "processing" | "closed" | "all";

function statusBadgeClass(status: string): string {
	if (status === "open") {
		return "badge-success";
	}
	if (status === "processing") {
		return "badge-accent";
	}
	return "badge-outline";
}

function formatDate(d: string | Date | null | undefined): string {
	if (!d) {
		return "-";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function PayPeriodsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = canManagePayroll(org.memberRole);

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const { data, isLoading } = useQuery(
		orpc.payroll.payPeriods.list.queryOptions({
			input: {
				status:
					statusFilter === "all"
						? undefined
						: (statusFilter as "open" | "processing" | "closed"),
				page,
				pageSize: 50,
			},
		})
	);

	const periods = (data?.data ?? []) as Record<string, unknown>[];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / 50);

	if (!canManage) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>{org.orgName}</span>
							<span className="sep">/</span>
							<span>Payroll</span>
							<span className="sep">/</span>
							<span>Pay periods</span>
						</div>
						<h1 className="page-title">Pay periods</h1>
					</div>
				</div>
				<PayrollTabs />
				<EmptyState
					description="You do not have permission to manage pay periods. Contact a payroll administrator."
					icon={<CalendarRange size={20} />}
					title="Access restricted"
				/>
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
						<span>Pay periods</span>
					</div>
					<h1 className="page-title">Pay periods</h1>
					<p className="page-sub">
						Define the date ranges, frequencies, and working hours for each
						payroll cycle.
					</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setShowCreate(true)}
					type="button"
				>
					<Plus size={13} />
					Create pay period
				</button>
			</div>

			<PayrollTabs />

			<div className="toolbar">
				<div className="segmented">
					{(["open", "processing", "closed", "all"] as const).map((f) => (
						<button
							className={`seg-btn ${statusFilter === f ? "active" : ""}`}
							key={f}
							onClick={() => {
								setStatusFilter(f);
								setPage(1);
							}}
							type="button"
						>
							{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
						</button>
					))}
				</div>
			</div>

			<div className="emp-table">
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th>Frequency</th>
							<th>Start date</th>
							<th>End date</th>
							<th>Pay date</th>
							<th>Working days</th>
							<th>Status</th>
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
						{!isLoading && periods.length === 0 && (
							<tr>
								<td colSpan={7} style={{ padding: 0 }}>
									<EmptyState
										action={{
											label: "Create pay period",
											onClick: () => setShowCreate(true),
										}}
										description="No pay periods found. Create one to define the date range for a payroll run."
										icon={<CalendarRange size={20} />}
										title="No pay periods"
									/>
								</td>
							</tr>
						)}
						{!isLoading &&
							periods.map((period) => (
								<tr key={period.id as string}>
									<td>
										<div style={{ fontWeight: 500 }}>
											{period.name as string}
										</div>
									</td>
									<td>
										<span
											className="badge badge-outline"
											style={{ fontSize: 10 }}
										>
											{period.frequency as string}
										</span>
									</td>
									<td>{formatDate(period.startDate as string)}</td>
									<td>{formatDate(period.endDate as string)}</td>
									<td>{formatDate(period.payDate as string | null)}</td>
									<td>{period.workingDays as number}</td>
									<td>
										<span
											className={`badge ${statusBadgeClass(period.status as string)}`}
											style={{ fontSize: 10 }}
										>
											{period.status as string}
										</span>
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
						Page {page} of {totalPages} ({total} periods)
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
				<CreatePayPeriodDialog
					onClose={() => {
						setShowCreate(false);
						qc.invalidateQueries();
					}}
				/>
			)}
		</div>
	);
}

function CreatePayPeriodDialog({ onClose }: { onClose: () => void }) {
	const today = new Date().toISOString().split("T")[0] ?? "";

	const [name, setName] = useState("");
	const [startDate, setStartDate] = useState(today);
	const [endDate, setEndDate] = useState("");
	const [payDate, setPayDate] = useState("");
	const [frequency, setFrequency] = useState<string>(
		PAY_FREQUENCY_OPTIONS[0]?.value ?? "monthly"
	);
	const [workingDays, setWorkingDays] = useState("22");
	const [expectedHours, setExpectedHours] = useState("176");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSave() {
		setError(null);

		if (!name.trim()) {
			setError("Name is required.");
			return;
		}
		if (!startDate) {
			setError("Start date is required.");
			return;
		}
		if (!endDate) {
			setError("End date is required.");
			return;
		}
		if (new Date(endDate) <= new Date(startDate)) {
			setError("End date must be after start date.");
			return;
		}
		const days = Number(workingDays);
		if (!Number.isInteger(days) || days < 1) {
			setError("Working days must be a whole number greater than 0.");
			return;
		}
		if (!expectedHours.trim()) {
			setError("Expected hours is required.");
			return;
		}

		setBusy(true);
		try {
			await client.payroll.payPeriods.create({
				name: name.trim(),
				startDate,
				endDate,
				payDate: payDate || null,
				frequency,
				workingDays: days,
				expectedHours: expectedHours.trim(),
			});
			toast.success(`Pay period "${name.trim()}" created`);
			onClose();
		} catch (e) {
			setError(
				(e as { message?: string }).message ??
					"Could not create the pay period."
			);
			setBusy(false);
		}
	}

	return (
		<Modal
			footer={
				<>
					<button
						className="btn"
						disabled={busy}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={busy}
						onClick={handleSave}
						type="button"
					>
						{busy ? "Creating..." : "Create pay period"}
					</button>
				</>
			}
			icon={<CalendarRange size={18} />}
			intro="A pay period defines the date range and hours for a payroll run."
			onClose={onClose}
			title="New pay period"
		>
			<div className="fn-field">
				<label htmlFor="pp-name">Name</label>
				<input
					id="pp-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. January 2026 - Fortnightly 1"
					value={name}
				/>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-freq">Frequency</label>
				<select
					id="pp-freq"
					onChange={(e) => setFrequency(e.target.value)}
					value={frequency}
				>
					{PAY_FREQUENCY_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-start">Start date</label>
				<input
					id="pp-start"
					onChange={(e) => setStartDate(e.target.value)}
					type="date"
					value={startDate}
				/>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-end">End date</label>
				<input
					id="pp-end"
					onChange={(e) => setEndDate(e.target.value)}
					type="date"
					value={endDate}
				/>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-paydate">Pay date (optional)</label>
				<input
					id="pp-paydate"
					onChange={(e) => setPayDate(e.target.value)}
					type="date"
					value={payDate}
				/>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-days">Working days</label>
				<input
					id="pp-days"
					inputMode="numeric"
					min="1"
					onChange={(e) => setWorkingDays(e.target.value)}
					placeholder="22"
					type="number"
					value={workingDays}
				/>
			</div>

			<div className="fn-field">
				<label htmlFor="pp-hours">Expected hours</label>
				<input
					id="pp-hours"
					onChange={(e) => setExpectedHours(e.target.value)}
					placeholder="176"
					value={expectedHours}
				/>
			</div>

			{error ? (
				<p className="fn-sub" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
		</Modal>
	);
}
