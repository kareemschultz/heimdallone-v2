import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Calendar,
	Check,
	ChevronLeft,
	ChevronRight,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/leave.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const HR_ROLES = ["tenant_owner", "tenant_admin", "hr_admin"];
const APPROVAL_ROLES = [...HR_ROLES, "manager"];

export const Route = createFileRoute("/app/leave/")({
	component: LeavePage,
});

type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled";
type LeaveLens =
	| "My requests"
	| "Pending approval"
	| "Approved"
	| "Rejected"
	| "All";

interface LeaveRequestRow {
	createdAt: Date | string;
	description: string | null;
	employeeFirstName: string;
	employeeId: string;
	employeeLastName: string | null;
	endBreakdown: string;
	endDate: Date | string;
	id: string;
	leaveTypeColor: string;
	leaveTypeId: string;
	leaveTypeIsPaid: boolean;
	leaveTypeName: string;
	rejectReason: string | null;
	requestedDays: string;
	startBreakdown: string;
	startDate: Date | string;
	status: LeaveStatus;
}

interface BalanceRow {
	availableDays: string;
	carryForwardDays: string;
	employeeId: string;
	id: string;
	leaveTypeColor: string;
	leaveTypeId: string;
	leaveTypeIsPaid: boolean;
	leaveTypeName: string;
	usedDays: string;
}

interface LeaveTypeRow {
	color: string;
	id: string;
	isPaid: boolean;
	name: string;
}

interface UpcomingLeave {
	employeeFirstName: string;
	employeeLastName: string | null;
	endDate: Date | string;
	id: string;
	leaveTypeColor: string;
	leaveTypeName: string;
	requestedDays: string;
	startDate: Date | string;
}

function fmtDate(d: Date | null | string | undefined): string {
	if (!d) {
		return "—";
	}
	return new Date(d).toISOString().slice(0, 10);
}

function statusPillClass(s: LeaveStatus): string {
	if (s === "approved") {
		return "pill-status ls-approved";
	}
	if (s === "rejected") {
		return "pill-status ls-rejected";
	}
	if (s === "cancelled") {
		return "pill-status ls-cancelled";
	}
	return "pill-status ls-requested";
}

function statusLabel(s: LeaveStatus): string {
	if (s === "approved") {
		return "Approved";
	}
	if (s === "rejected") {
		return "Rejected";
	}
	if (s === "cancelled") {
		return "Cancelled";
	}
	return "Pending";
}

function lensToStatus(lens: LeaveLens): LeaveStatus | undefined {
	if (lens === "Pending approval") {
		return "requested";
	}
	if (lens === "Approved") {
		return "approved";
	}
	if (lens === "Rejected") {
		return "rejected";
	}
	return;
}

const LENSES: LeaveLens[] = [
	"My requests",
	"Pending approval",
	"Approved",
	"Rejected",
	"All",
];
const SKELETON_ROWS = ["sr0", "sr1", "sr2", "sr3"];
const SKELETON_CELLS = ["sc0", "sc1", "sc2", "sc3", "sc4", "sc5", "sc6"];

function LeavePage() {
	const org = useContext(OrgCtx);
	const canApprove = APPROVAL_ROLES.includes(org.memberRole);
	const isHR = HR_ROLES.includes(org.memberRole);

	const [lens, setLens] = useState<LeaveLens>("My requests");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 50;
	const [showRequest, setShowRequest] = useState(false);

	const statusFilter = lensToStatus(lens);
	const { data, isLoading, isError, refetch } = useQuery(
		orpc.leave.requests.list.queryOptions({
			input: { status: statusFilter, page, pageSize },
		})
	);

	const requests: LeaveRequestRow[] = (data?.data as LeaveRequestRow[]) ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / pageSize);

	const filtered = search
		? requests.filter((r) => {
				const name =
					`${r.employeeFirstName} ${r.employeeLastName ?? ""}`.toLowerCase();
				return name.includes(search.toLowerCase());
			})
		: requests;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Leave</span>
					</div>
					<h1 className="page-title">Leave</h1>
					<p className="page-sub">
						{total} request{total === 1 ? "" : "s"}
						{lens === "All" ? "" : ` · ${lens.toLowerCase()}`}
					</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setShowRequest(true)}
					type="button"
				>
					<Plus size={13} />
					Request time off
				</button>
			</div>

			<BalanceCards />

			<div className="toolbar">
				<div className="search-wrap">
					<Search className="icon-l" size={15} />
					<input
						className="search"
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
						placeholder="Search employee…"
						value={search}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{LENSES.map((l) => (
						<button
							className={`seg-btn${lens === l ? "active" : ""}`}
							key={l}
							onClick={() => {
								setLens(l);
								setPage(1);
							}}
							type="button"
						>
							{l}
						</button>
					))}
				</div>
			</div>

			<RequestsTable
				canApprove={canApprove}
				filtered={filtered}
				isError={isError}
				isHR={isHR}
				isLoading={isLoading}
				lens={lens}
				onRefetch={refetch}
				page={page}
				search={search}
				setPage={setPage}
				total={total}
				totalPages={totalPages}
			/>

			{(isHR || canApprove) && <UpcomingLeaveList />}

			{showRequest && <RequestSheet onClose={() => setShowRequest(false)} />}
		</div>
	);
}

function BalanceCards() {
	const { data, isLoading } = useQuery(
		orpc.leave.balances.list.queryOptions({ input: {} })
	);

	const balances: BalanceRow[] = (data as BalanceRow[]) ?? [];

	if (isLoading) {
		return (
			<div className="leave-balances">
				{[0, 1, 2].map((i) => (
					<div className="leave-bal-card" key={i}>
						<div
							style={{ height: 80, background: "var(--bg-3)", borderRadius: 6 }}
						/>
					</div>
				))}
			</div>
		);
	}

	if (balances.length === 0) {
		return (
			<div className="leave-helper">
				No leave balances assigned yet. Contact HR to set up your leave
				allocations.
			</div>
		);
	}

	return (
		<div className="leave-balances">
			{balances.map((b) => (
				<div className="leave-bal-card" key={b.id}>
					<div
						className="bal-stripe"
						style={{ background: b.leaveTypeColor }}
					/>
					<div className="bal-name">{b.leaveTypeName}</div>
					<div className="bal-days">{Number(b.availableDays).toFixed(1)}</div>
					<div className="bal-sub">
						{Number(b.usedDays) > 0
							? `${Number(b.usedDays).toFixed(1)} used`
							: "None used"}
						{Number(b.carryForwardDays) > 0
							? ` · ${Number(b.carryForwardDays).toFixed(1)} carry-forward`
							: ""}
					</div>
					<span className={`bal-tag ${b.leaveTypeIsPaid ? "paid" : "unpaid"}`}>
						{b.leaveTypeIsPaid ? "Paid" : "Unpaid"}
					</span>
				</div>
			))}
		</div>
	);
}

function RequestsTable({
	isLoading,
	isError,
	onRefetch,
	filtered,
	search,
	lens,
	canApprove,
	isHR,
	page,
	setPage,
	totalPages,
	total,
}: {
	isLoading: boolean;
	isError: boolean;
	onRefetch: () => void;
	filtered: LeaveRequestRow[];
	search: string;
	lens: LeaveLens;
	canApprove: boolean;
	isHR: boolean;
	page: number;
	setPage: (p: number) => void;
	totalPages: number;
	total: number;
}) {
	const qc = useQueryClient();
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState("");

	async function handleApprove(id: string) {
		try {
			await client.leave.requests.approve({ id });
			toast.success("Leave approved");
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Approval failed");
		}
	}

	async function handleReject(id: string) {
		if (!rejectReason.trim()) {
			toast.error("Please provide a reason.");
			return;
		}
		try {
			await client.leave.requests.reject({
				id,
				rejectReason: rejectReason.trim(),
			});
			toast.success("Leave rejected");
			setRejectingId(null);
			setRejectReason("");
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Rejection failed");
		}
	}

	async function handleCancel(id: string) {
		try {
			await client.leave.requests.cancel({ id });
			toast.success("Leave request cancelled");
			qc.invalidateQueries();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Cancel failed";
			if (msg.includes("Approved leave cannot")) {
				toast.error(
					"Approved leave cannot be cancelled here. Please contact HR."
				);
			} else {
				toast.error(msg);
			}
		}
	}

	if (isLoading) {
		return (
			<div className="emp-list">
				<table>
					<thead>
						<tr>
							{SKELETON_CELLS.map((k) => (
								<th key={k}>
									<div
										style={{
											height: 12,
											width: 60,
											background: "var(--bg-3)",
											borderRadius: 4,
										}}
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{SKELETON_ROWS.map((rk) => (
							<tr key={rk}>
								{SKELETON_CELLS.map((ck) => (
									<td key={ck}>
										<div
											style={{
												height: 12,
												width: "80%",
												background: "var(--bg-3)",
												borderRadius: 4,
											}}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	if (isError) {
		return (
			<div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>
				<p>Failed to load leave requests.</p>
				<button
					className="btn btn-outline btn-sm"
					onClick={onRefetch}
					style={{ marginTop: 12 }}
					type="button"
				>
					Retry
				</button>
			</div>
		);
	}

	if (filtered.length === 0) {
		return (
			<div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
				<Calendar size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
				<p style={{ fontSize: 15, fontWeight: 500 }}>
					{getEmptyTitle(search, lens)}
				</p>
				<p style={{ fontSize: 13, marginTop: 4, color: "var(--fg-4)" }}>
					{search
						? "Try adjusting your search."
						: "Leave requests will appear here."}
				</p>
			</div>
		);
	}

	return (
		<div className="emp-list">
			<table>
				<thead>
					<tr>
						<th>Employee</th>
						<th>Type</th>
						<th>Dates</th>
						<th>Days</th>
						<th>Status</th>
						<th>Reason</th>
						<th style={{ width: 120 }}>Actions</th>
					</tr>
				</thead>
				<tbody>
					{filtered.map((r) => (
						<RequestRow
							canApprove={canApprove}
							cancelReject={() => {
								setRejectingId(null);
								setRejectReason("");
							}}
							isHR={isHR}
							key={r.id}
							onApprove={handleApprove}
							onCancel={handleCancel}
							onReject={() => setRejectingId(r.id)}
							rejectingId={rejectingId}
							rejectReason={rejectReason}
							request={r}
							setRejectReason={setRejectReason}
							submitReject={handleReject}
						/>
					))}
				</tbody>
			</table>

			{totalPages > 1 && (
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "12px 0",
						fontSize: 13,
						color: "var(--fg-3)",
					}}
				>
					<span>
						Page {page} of {totalPages} ({total} requests)
					</span>
					<div style={{ display: "flex", gap: 6 }}>
						{page > 1 && (
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setPage(page - 1)}
								type="button"
							>
								<ChevronLeft size={14} /> Previous
							</button>
						)}
						{page < totalPages && (
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setPage(page + 1)}
								type="button"
							>
								Next <ChevronRight size={14} />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function RequestRow({
	request: r,
	canApprove,
	isHR,
	onApprove,
	onCancel,
	onReject,
	rejectingId,
	rejectReason,
	setRejectReason,
	submitReject,
	cancelReject,
}: {
	request: LeaveRequestRow;
	canApprove: boolean;
	isHR: boolean;
	onApprove: (id: string) => void;
	onCancel: (id: string) => void;
	onReject: () => void;
	rejectingId: string | null;
	rejectReason: string;
	setRejectReason: (v: string) => void;
	submitReject: (id: string) => void;
	cancelReject: () => void;
}) {
	const dateRange = `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}`;
	const breakdown = formatBreakdown(r.startBreakdown, r.endBreakdown);

	return (
		<tr>
			<td>
				<span style={{ fontWeight: 500, color: "var(--fg)" }}>
					{r.employeeFirstName} {r.employeeLastName ?? ""}
				</span>
			</td>
			<td>
				<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							background: r.leaveTypeColor,
							flexShrink: 0,
						}}
					/>
					{r.leaveTypeName}
				</span>
			</td>
			<td>
				<span style={{ fontSize: 13 }}>{dateRange}</span>
				{breakdown && (
					<span style={{ fontSize: 11, color: "var(--fg-4)", marginLeft: 6 }}>
						{breakdown}
					</span>
				)}
			</td>
			<td>{Number(r.requestedDays).toFixed(1)}</td>
			<td>
				<span className={statusPillClass(r.status)}>
					<span className="badge-dot" />
					{statusLabel(r.status)}
				</span>
			</td>
			<td
				style={{
					maxWidth: 180,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{r.rejectReason ?? r.description ?? "—"}
			</td>
			<td>
				<RequestActions
					canApprove={canApprove}
					cancelReject={cancelReject}
					isHR={isHR}
					onApprove={onApprove}
					onCancel={onCancel}
					onReject={onReject}
					rejectingId={rejectingId}
					rejectReason={rejectReason}
					request={r}
					setRejectReason={setRejectReason}
					submitReject={submitReject}
				/>
			</td>
		</tr>
	);
}

function RequestActions({
	request: r,
	canApprove,
	isHR,
	onApprove,
	onCancel,
	onReject,
	rejectingId,
	rejectReason,
	setRejectReason,
	submitReject,
	cancelReject,
}: {
	request: LeaveRequestRow;
	canApprove: boolean;
	isHR: boolean;
	onApprove: (id: string) => void;
	onCancel: (id: string) => void;
	onReject: () => void;
	rejectingId: string | null;
	rejectReason: string;
	setRejectReason: (v: string) => void;
	submitReject: (id: string) => void;
	cancelReject: () => void;
}) {
	if (rejectingId === r.id) {
		return (
			<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
				<input
					className="input"
					onChange={(e) => setRejectReason(e.target.value)}
					placeholder="Reason…"
					style={{ height: 28, fontSize: 11, flex: 1 }}
					value={rejectReason}
				/>
				<button
					className="btn btn-outline btn-sm"
					disabled={!rejectReason.trim()}
					onClick={() => submitReject(r.id)}
					style={{
						borderColor: "var(--danger)",
						color: "var(--danger)",
						padding: "2px 6px",
					}}
					type="button"
				>
					OK
				</button>
				<button
					className="btn btn-ghost btn-sm"
					onClick={cancelReject}
					style={{ padding: "2px 6px" }}
					type="button"
				>
					<X size={12} />
				</button>
			</div>
		);
	}

	if (r.status === "requested" && canApprove) {
		return (
			<div style={{ display: "flex", gap: 4 }}>
				<button
					className="btn btn-outline btn-sm"
					onClick={() => onApprove(r.id)}
					style={{ padding: "2px 8px" }}
					type="button"
				>
					<Check size={11} /> Approve
				</button>
				<button
					className="btn btn-outline btn-sm"
					onClick={onReject}
					style={{
						padding: "2px 8px",
						borderColor: "var(--danger)",
						color: "var(--danger)",
					}}
					type="button"
				>
					<X size={11} /> Reject
				</button>
			</div>
		);
	}

	if (r.status === "requested") {
		return (
			<button
				className="btn btn-ghost btn-sm"
				onClick={() => onCancel(r.id)}
				style={{ fontSize: 12 }}
				type="button"
			>
				Cancel
			</button>
		);
	}

	if (r.status === "approved" && isHR) {
		return (
			<button
				className="btn btn-ghost btn-sm"
				onClick={() => onCancel(r.id)}
				style={{ fontSize: 12, color: "var(--danger)" }}
				type="button"
			>
				Revoke
			</button>
		);
	}

	return null;
}

function getEmptyTitle(search: string, lens: LeaveLens): string {
	if (search) {
		return "No matching requests";
	}
	if (lens === "Pending approval") {
		return "No pending approvals";
	}
	if (lens === "Approved") {
		return "No approved requests";
	}
	if (lens === "Rejected") {
		return "No rejected requests";
	}
	return "No leave requests yet";
}

function formatBreakdown(start: string, end: string): string | null {
	if (start === "first_half") {
		return "(AM)";
	}
	if (start === "second_half") {
		return "(PM)";
	}
	if (end === "first_half") {
		return "(→ AM)";
	}
	if (end === "second_half") {
		return "(→ PM)";
	}
	return null;
}

function RequestSheet({ onClose }: { onClose: () => void }) {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();

	const { data: typesData } = useQuery(
		orpc.leave.types.list.queryOptions({ input: {} })
	);
	const leaveTypes: LeaveTypeRow[] = (typesData as LeaveTypeRow[]) ?? [];

	const { data: balData } = useQuery(
		orpc.leave.balances.list.queryOptions({ input: {} })
	);
	const balances: BalanceRow[] = (balData as BalanceRow[]) ?? [];

	const [typeId, setTypeId] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [startBd, setStartBd] = useState("full_day");
	const [endBd, setEndBd] = useState("full_day");
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);

	const selectedType = leaveTypes.find((t) => t.id === typeId);
	const selectedBalance = balances.find((b) => b.leaveTypeId === typeId);
	const availableDays = selectedBalance
		? Number(selectedBalance.availableDays) +
			Number(selectedBalance.carryForwardDays)
		: null;

	function estimateDays(): number {
		if (!(startDate && endDate)) {
			return 0;
		}
		const start = new Date(startDate);
		const end = new Date(endDate);
		if (end < start) {
			return 0;
		}
		let days = 0;
		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const dow = d.getDay();
			if (dow !== 0 && dow !== 6) {
				days++;
			}
		}
		if (startBd !== "full_day") {
			days -= 0.5;
		}
		if (endBd !== "full_day" && days > 0.5) {
			days -= 0.5;
		}
		return Math.max(0, days);
	}

	const estimated = estimateDays();
	const insufficientBalance =
		availableDays !== null && estimated > availableDays && selectedType?.isPaid;

	async function handleSubmit() {
		if (!(typeId && startDate && endDate)) {
			toast.error("Please fill in all required fields.");
			return;
		}
		if (estimated <= 0) {
			toast.error("Please select valid dates.");
			return;
		}

		setSaving(true);
		try {
			await client.leave.requests.create({
				leaveTypeId: typeId,
				startDate,
				endDate,
				startBreakdown: startBd as "full_day" | "first_half" | "second_half",
				endBreakdown: endBd as "full_day" | "first_half" | "second_half",
				requestedDays: estimated.toFixed(2),
				description: description || undefined,
			});
			toast.success("Leave request submitted");
			qc.invalidateQueries();
			onClose();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Request failed";
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	}

	if (leaveTypes.length === 0) {
		return (
			<>
				<button
					aria-label="Close"
					onClick={onClose}
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(8,9,12,0.6)",
						zIndex: 200,
						border: "none",
						cursor: "pointer",
					}}
					type="button"
				/>
				<div className="leave-sheet">
					<div className="leave-sheet-head">
						<h4>Request time off</h4>
						<button
							className="btn btn-ghost btn-sm"
							onClick={onClose}
							type="button"
						>
							<X size={16} />
						</button>
					</div>
					<div className="leave-sheet-body">
						<div className="leave-helper">
							Leave types have not been set up yet. Ask HR to configure leave
							types first.
						</div>
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<button
				aria-label="Close"
				onClick={onClose}
				style={{
					position: "fixed",
					inset: 0,
					background: "rgba(8,9,12,0.6)",
					zIndex: 200,
					border: "none",
					cursor: "pointer",
				}}
				type="button"
			/>
			<div className="leave-sheet">
				<div className="leave-sheet-head">
					<h4>Request time off</h4>
					<button
						className="btn btn-ghost btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="leave-sheet-body">
					<div className="leave-helper">
						Paid leave does not reduce your pay. Unpaid leave may affect future
						payroll.
					</div>

					<div style={{ marginBottom: 14 }}>
						<label className="label">
							Leave type <span style={{ color: "var(--danger)" }}>*</span>
						</label>
						<select
							className="input"
							onChange={(e) => setTypeId(e.target.value)}
							style={{ height: 34 }}
							value={typeId}
						>
							<option value="">Select leave type…</option>
							{leaveTypes.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name} {t.isPaid ? "(Paid)" : "(Unpaid)"}
								</option>
							))}
						</select>
						{selectedBalance && (
							<p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>
								Available: {Number(selectedBalance.availableDays).toFixed(1)}{" "}
								days
								{Number(selectedBalance.carryForwardDays) > 0
									? ` + ${Number(selectedBalance.carryForwardDays).toFixed(1)} carry-forward`
									: ""}
							</p>
						)}
					</div>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 10,
							marginBottom: 14,
						}}
					>
						<div>
							<label className="label">
								Starts <span style={{ color: "var(--danger)" }}>*</span>
							</label>
							<input
								className="input"
								onChange={(e) => setStartDate(e.target.value)}
								style={{ height: 34 }}
								type="date"
								value={startDate}
							/>
							<select
								className="input"
								onChange={(e) => setStartBd(e.target.value)}
								style={{ height: 30, marginTop: 6, fontSize: 12 }}
								value={startBd}
							>
								<option value="full_day">Full day</option>
								<option value="first_half">Morning only</option>
								<option value="second_half">Afternoon only</option>
							</select>
						</div>
						<div>
							<label className="label">
								Ends <span style={{ color: "var(--danger)" }}>*</span>
							</label>
							<input
								className="input"
								onChange={(e) => setEndDate(e.target.value)}
								style={{ height: 34 }}
								type="date"
								value={endDate}
							/>
							<select
								className="input"
								onChange={(e) => setEndBd(e.target.value)}
								style={{ height: 30, marginTop: 6, fontSize: 12 }}
								value={endBd}
							>
								<option value="full_day">Full day</option>
								<option value="first_half">Morning only</option>
								<option value="second_half">Afternoon only</option>
							</select>
						</div>
					</div>

					{estimated > 0 && (
						<div
							style={{
								padding: "10px 14px",
								borderRadius: 8,
								background: "var(--bg-2)",
								border: "1px solid var(--line)",
								marginBottom: 14,
							}}
						>
							<span style={{ fontSize: 13, fontWeight: 500 }}>
								{estimated.toFixed(1)} day{estimated === 1 ? "" : "s"} requested
							</span>
							<span
								style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: 8 }}
							>
								(excluding weekends)
							</span>
						</div>
					)}

					{insufficientBalance && (
						<div
							style={{
								padding: "10px 14px",
								borderRadius: 8,
								background: "var(--danger-soft)",
								color: "var(--danger)",
								fontSize: 12,
								marginBottom: 14,
							}}
						>
							You only have {availableDays?.toFixed(1)} days available but are
							requesting {estimated.toFixed(1)} days.
						</div>
					)}

					<div style={{ marginBottom: 14 }}>
						<label className="label">Reason</label>
						<textarea
							className="input"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional reason for your leave…"
							rows={3}
							style={{ resize: "vertical" }}
							value={description}
						/>
					</div>
				</div>
				<div className="leave-sheet-foot">
					<button
						className="btn btn-outline btn-sm"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={
							saving || !typeId || !startDate || !endDate || estimated <= 0
						}
						onClick={handleSubmit}
						type="button"
					>
						{saving ? "Submitting…" : "Submit request"}
					</button>
				</div>
			</div>
		</>
	);
}

function UpcomingLeaveList() {
	const today = new Date().toISOString().slice(0, 10);
	const thirtyDays = new Date(Date.now() + 30 * 86_400_000)
		.toISOString()
		.slice(0, 10);

	const { data } = useQuery(
		orpc.leave.calendar.queryOptions({
			input: { startDate: today, endDate: thirtyDays },
		})
	);

	const upcoming: UpcomingLeave[] = (data as UpcomingLeave[]) ?? [];

	if (upcoming.length === 0) {
		return null;
	}

	return (
		<div className="upcoming-leave">
			<h3>Upcoming approved leave (next 30 days)</h3>
			{upcoming.map((u) => (
				<div className="upcoming-item" key={u.id}>
					<span className="up-dot" style={{ background: u.leaveTypeColor }} />
					<span className="up-name">
						{u.employeeFirstName} {u.employeeLastName ?? ""}
					</span>
					<span className="up-dates">
						{fmtDate(u.startDate)} → {fmtDate(u.endDate)}
					</span>
					<span className="up-days">{Number(u.requestedDays).toFixed(1)}d</span>
				</div>
			))}

			<div className="leave-helper" style={{ marginTop: 12 }}>
				Approved paid leave does not reduce pay. Pending leave creates a payroll
				warning but does not affect pay yet.
			</div>
		</div>
	);
}
