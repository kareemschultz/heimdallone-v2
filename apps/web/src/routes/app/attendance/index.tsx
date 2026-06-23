import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	ChevronLeft,
	ChevronRight,
	Clock,
	Eye,
	Lock,
	Search,
	ThumbsUp,
	X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/attendance.css";
import { canManageHR, canManagePayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

function canCorrectAttendance(role: string): boolean {
	return canManageHR(role) || role === "manager";
}

export const Route = createFileRoute("/app/attendance/")({
	component: AttendancePage,
});

type AttLens =
	| "All"
	| "Today"
	| "Pending validation"
	| "Pending OT"
	| "Payroll approved"
	| "Exceptions";

type AttStatus = "present" | "half_day" | "absent" | "holiday" | "conflict";
type PayrollStatus = "pending" | "approved" | "payroll_locked";

interface AttRecord {
	approvedOvertimeMinutes: number;
	breakDeductedMinutes: number;
	date: Date | string;
	dayType: string;
	earlyLeaveMinutes: number;
	employeeFirstName: string;
	employeeId: string;
	employeeLastName: string | null;
	firstClockIn: string | null;
	id: string;
	isHoliday: boolean;
	isOvertimeApproved: boolean;
	isValidated: boolean;
	lastClockOut: string | null;
	lateMinutes: number;
	minimumMinutes: number;
	needsReview?: boolean;
	notes: string | null;
	overtimeMinutes: number;
	payableMinutes: number;
	payrollStatus: PayrollStatus;
	// Phase 11G CP4: derived source key + needs-review flag from the API.
	source?: string;
	status: AttStatus;
	workedMinutes: number;
}

// Plain-language labels for the attendance source key (never show the raw enum).
const SOURCE_LABELS: Record<string, string> = {
	manual: "Manual entry",
	biometric: "Biometric device",
	mobile: "Mobile GPS check-in",
	import: "File import",
	admin: "Admin adjustment",
	mixed: "Mixed sources",
	none: "Source unavailable",
};

function sourceLabel(key: string | undefined): string {
	return SOURCE_LABELS[key ?? "none"] ?? "Source unavailable";
}

interface AttEvent {
	clockIn: Date | string;
	clockOut: Date | string | null;
	durationMinutes: number | null;
	id: string;
	notes: string | null;
	source: string;
}

interface CorrectionRow {
	attendanceRecordId: string | null;
	category: string;
	createdAt: Date | string;
	employeeFirstName: string;
	employeeId: string;
	employeeLastName: string | null;
	id: string;
	reason: string;
	requestedChanges: unknown;
	reviewNote: string | null;
	status: string;
}

function fmtDate(d: Date | null | string | undefined): string {
	if (!d) {
		return "—";
	}
	return new Date(d).toISOString().slice(0, 10);
}

function fmtTime(t: string | null | undefined): string {
	if (!t) {
		return "—";
	}
	const [h, m] = t.split(":");
	const hour = Number(h);
	const ampm = hour >= 12 ? "PM" : "AM";
	const h12 = hour % 12 || 12;
	return `${h12}:${m} ${ampm}`;
}

function fmtDuration(minutes: number | null | undefined): string {
	if (!minutes || minutes <= 0) {
		return "—";
	}
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) {
		return `${m}m`;
	}
	return `${h}h ${m}m`;
}

function statusPillClass(status: AttStatus): string {
	if (status === "present") {
		return "pill-status as-present";
	}
	if (status === "half_day") {
		return "pill-status as-half-day";
	}
	if (status === "absent") {
		return "pill-status as-absent";
	}
	if (status === "holiday") {
		return "pill-status as-holiday";
	}
	return "pill-status as-conflict";
}

function statusLabel(status: AttStatus): string {
	if (status === "present") {
		return "Present";
	}
	if (status === "half_day") {
		return "Half Day";
	}
	if (status === "absent") {
		return "Absent";
	}
	if (status === "holiday") {
		return "Holiday";
	}
	return "Needs Review";
}

function payrollPillClass(ps: PayrollStatus): string {
	if (ps === "approved") {
		return "pill-status ps-approved";
	}
	if (ps === "payroll_locked") {
		return "pill-status ps-locked";
	}
	return "pill-status ps-pending";
}

function payrollLabel(ps: PayrollStatus): string {
	if (ps === "approved") {
		return "Payroll-ready";
	}
	if (ps === "payroll_locked") {
		return "Locked";
	}
	return "Pending";
}

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

function getEmptyTitle(search: string, lens: AttLens): string {
	if (search) {
		return "No matching records";
	}
	if (lens === "Today") {
		return "No attendance records for today";
	}
	if (lens === "Exceptions") {
		return "No exceptions found";
	}
	return "No attendance records";
}

function correctionStatusLabel(status: string): string {
	if (status === "approved") {
		return "Approved";
	}
	if (status === "rejected") {
		return "Rejected";
	}
	return "Pending";
}

function correctionPillClass(status: string): string {
	if (status === "approved") {
		return "ps-approved";
	}
	if (status === "rejected") {
		return "as-absent";
	}
	return "ps-pending";
}

function ClockOutCell({ record }: { record: AttRecord }) {
	if (record.lastClockOut) {
		return <>{fmtTime(record.lastClockOut)}</>;
	}
	if (record.status === "conflict") {
		return (
			<span style={{ color: "var(--danger)", fontSize: 12 }}>
				<AlertTriangle size={11} style={{ marginRight: 3 }} />
				Missing
			</span>
		);
	}
	return <>{"—"}</>;
}

function LateEarlyCell({ record }: { record: AttRecord }) {
	if (record.lateMinutes > 0) {
		return (
			<span style={{ color: "var(--warning)", fontSize: 12 }}>
				{record.lateMinutes}m late
			</span>
		);
	}
	if (record.earlyLeaveMinutes > 0) {
		return (
			<span style={{ color: "var(--warning)", fontSize: 12 }}>
				{record.earlyLeaveMinutes}m early
			</span>
		);
	}
	return <>{"—"}</>;
}

function lensToParams(lens: AttLens): {
	startDate?: string;
	endDate?: string;
	isValidated?: boolean;
	payrollStatus?: PayrollStatus;
	status?: AttStatus;
} {
	if (lens === "Today") {
		return { startDate: todayISO(), endDate: todayISO() };
	}
	if (lens === "Pending validation") {
		return { isValidated: false };
	}
	if (lens === "Pending OT") {
		return { isValidated: true };
	}
	if (lens === "Payroll approved") {
		return { payrollStatus: "approved" };
	}
	if (lens === "Exceptions") {
		return { status: "conflict" };
	}
	return {};
}

const LENSES: AttLens[] = [
	"All",
	"Today",
	"Pending validation",
	"Pending OT",
	"Payroll approved",
	"Exceptions",
];

const SKELETON_ROW_KEYS = ["sk0", "sk1", "sk2", "sk3", "sk4"];
const SKELETON_CELL_KEYS = [
	"c0",
	"c1",
	"c2",
	"c3",
	"c4",
	"c5",
	"c6",
	"c7",
	"c8",
	"c9",
	"c10",
];

function AttendancePage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canEdit = canCorrectAttendance(org.memberRole);
	const canPayroll = canManagePayroll(org.memberRole);

	const [lens, setLens] = useState<AttLens>("All");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 50;
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [detailRecord, setDetailRecord] = useState<AttRecord | null>(null);
	const [showCorrections, setShowCorrections] = useState(false);

	const lensParams = lensToParams(lens);
	const { data, isLoading, isError, refetch } = useQuery(
		orpc.attendance.records.list.queryOptions({
			input: {
				...lensParams,
				page,
				pageSize,
			},
		})
	);

	const records: AttRecord[] = (data?.data as AttRecord[]) ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / pageSize);

	const filtered = search
		? records.filter((r) => {
				const name =
					`${r.employeeFirstName} ${r.employeeLastName ?? ""}`.toLowerCase();
				return name.includes(search.toLowerCase());
			})
		: records;

	function toggleSelect(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function selectAll() {
		if (selectedIds.size === filtered.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(filtered.map((r) => r.id)));
		}
	}

	async function handleValidate() {
		const ids = [...selectedIds];
		if (ids.length === 0) {
			return;
		}
		try {
			const result = await client.attendance.records.validate({ ids });
			toast.success(`${result.validated} record(s) confirmed`);
			setSelectedIds(new Set());
			qc.invalidateQueries();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Failed to confirm";
			toast.error(msg);
		}
	}

	async function handleApproveOT() {
		const ids = [...selectedIds];
		if (ids.length === 0) {
			return;
		}
		try {
			const result = await client.attendance.records.approveOvertime({
				ids,
			});
			toast.success(`${result.approved} overtime record(s) approved`);
			setSelectedIds(new Set());
			qc.invalidateQueries();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Failed to approve";
			toast.error(msg);
		}
	}

	async function handleApprovePayroll() {
		const ids = [...selectedIds];
		if (ids.length === 0) {
			return;
		}
		try {
			const result = await client.attendance.records.approvePayroll({
				ids,
			});
			toast.success(`${result.approved} record(s) marked payroll-ready`);
			setSelectedIds(new Set());
			qc.invalidateQueries();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Failed to approve";
			toast.error(msg);
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Attendance</span>
					</div>
					<h1 className="page-title">
						{canEdit || canPayroll ? "Attendance" : "My timesheet"}
					</h1>
					<p className="page-sub">
						{canEdit || canPayroll
							? `${total} record${total === 1 ? "" : "s"}${lens === "All" ? "" : ` · ${lens.toLowerCase()}`}`
							: "Clock in, take breaks, and see your hours"}
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					{canEdit && (
						<button
							className="btn btn-outline btn-sm"
							onClick={() => setShowCorrections(!showCorrections)}
							type="button"
						>
							{showCorrections ? "Records" : "Corrections"}
						</button>
					)}
				</div>
			</div>

			<ClockPanel memberRole={org.memberRole} />

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
								setSelectedIds(new Set());
							}}
							type="button"
						>
							{l}
						</button>
					))}
				</div>
			</div>

			<BulkActionBar
				canEdit={canEdit}
				canPayroll={canPayroll}
				count={selectedIds.size}
				onApproveOT={handleApproveOT}
				onApprovePayroll={handleApprovePayroll}
				onValidate={handleValidate}
			/>

			{showCorrections ? (
				<CorrectionsView memberRole={org.memberRole} />
			) : (
				<RecordsTable
					canEdit={canEdit}
					filtered={filtered}
					isError={isError}
					isLoading={isLoading}
					lens={lens}
					onDetailRecord={setDetailRecord}
					onRefetch={refetch}
					onSelectAll={selectAll}
					onToggleSelect={toggleSelect}
					page={page}
					search={search}
					selectedIds={selectedIds}
					setPage={setPage}
					total={total}
					totalPages={totalPages}
				/>
			)}

			{detailRecord && (
				<RecordDetailDrawer
					memberRole={org.memberRole}
					onClose={() => setDetailRecord(null)}
					record={detailRecord}
				/>
			)}
		</div>
	);
}

function RecordsTable({
	isLoading,
	isError,
	onRefetch,
	filtered,
	search,
	lens,
	canEdit,
	selectedIds,
	onSelectAll,
	onToggleSelect,
	onDetailRecord,
	page,
	setPage,
	totalPages,
	total,
}: {
	isLoading: boolean;
	isError: boolean;
	onRefetch: () => void;
	filtered: AttRecord[];
	search: string;
	lens: AttLens;
	canEdit: boolean;
	selectedIds: Set<string>;
	onSelectAll: () => void;
	onToggleSelect: (id: string) => void;
	onDetailRecord: (r: AttRecord) => void;
	page: number;
	setPage: (p: number) => void;
	totalPages: number;
	total: number;
}) {
	if (isLoading) {
		return (
			<div className="emp-list">
				<table>
					<thead>
						<tr>
							{SKELETON_CELL_KEYS.map((k) => (
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
						{SKELETON_ROW_KEYS.map((rk) => (
							<tr key={rk}>
								{SKELETON_CELL_KEYS.map((ck) => (
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
				<p>Failed to load attendance records.</p>
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
				<Clock size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
				<p style={{ fontSize: 15, fontWeight: 500 }}>
					{getEmptyTitle(search, lens)}
				</p>
				<p style={{ fontSize: 13, marginTop: 4, color: "var(--fg-4)" }}>
					{search
						? "Try adjusting your search."
						: "Records will appear as employees check in."}
				</p>
			</div>
		);
	}

	return (
		<div className="emp-list">
			<table>
				<thead>
					<tr>
						{canEdit && (
							<th style={{ width: 32 }}>
								<input
									checked={
										selectedIds.size === filtered.length && filtered.length > 0
									}
									onChange={onSelectAll}
									type="checkbox"
								/>
							</th>
						)}
						<th>Employee</th>
						<th>Date</th>
						<th>In</th>
						<th>Out</th>
						<th>Worked</th>
						<th>OT</th>
						<th>Late</th>
						<th>Source</th>
						<th>Status</th>
						<th>Payroll</th>
						<th style={{ width: 48 }} />
					</tr>
				</thead>
				<tbody>
					{filtered.map((r) => (
						<tr key={r.id}>
							{canEdit && (
								<td>
									<input
										checked={selectedIds.has(r.id)}
										onChange={() => onToggleSelect(r.id)}
										type="checkbox"
									/>
								</td>
							)}
							<td>
								<span
									style={{
										fontWeight: 500,
										color: "var(--fg)",
									}}
								>
									{r.employeeFirstName} {r.employeeLastName ?? ""}
								</span>
							</td>
							<td>{fmtDate(r.date)}</td>
							<td>{fmtTime(r.firstClockIn)}</td>
							<td>
								<ClockOutCell record={r} />
							</td>
							<td>{fmtDuration(r.workedMinutes)}</td>
							<td>
								{r.overtimeMinutes > 0 ? (
									<span
										style={{
											color: r.isOvertimeApproved
												? "var(--success)"
												: "var(--warning)",
										}}
									>
										{fmtDuration(r.overtimeMinutes)}
										{r.isOvertimeApproved ? " ✓" : ""}
									</span>
								) : (
									"—"
								)}
							</td>
							<td>
								<LateEarlyCell record={r} />
							</td>
							<td>
								<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
									{sourceLabel(r.source)}
								</span>
							</td>
							<td>
								<span className={statusPillClass(r.status)}>
									<span className="badge-dot" />
									{statusLabel(r.status)}
								</span>
								{r.needsReview && (
									<span
										className="badge badge-warning"
										style={{ fontSize: 9, marginLeft: 6 }}
										title="An open attendance exception is linked to this record"
									>
										Needs review
									</span>
								)}
							</td>
							<td>
								<span className={payrollPillClass(r.payrollStatus)}>
									{payrollLabel(r.payrollStatus)}
								</span>
							</td>
							<td>
								<button
									className="btn btn-ghost btn-sm"
									onClick={() => onDetailRecord(r)}
									style={{
										padding: "4px 6px",
									}}
									title="View details"
									type="button"
								>
									<Eye size={14} />
								</button>
							</td>
						</tr>
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
						Page {page} of {totalPages} ({total} records)
					</span>
					<div
						style={{
							display: "flex",
							gap: 6,
						}}
					>
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

function BulkActionBar({
	count,
	canEdit,
	canPayroll,
	onValidate,
	onApproveOT,
	onApprovePayroll,
}: {
	count: number;
	canEdit: boolean;
	canPayroll: boolean;
	onValidate: () => void;
	onApproveOT: () => void;
	onApprovePayroll: () => void;
}) {
	if (count === 0 || !canEdit) {
		return null;
	}

	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				padding: "8px 0",
				alignItems: "center",
			}}
		>
			<span style={{ fontSize: 13, color: "var(--fg-3)" }}>
				{count} selected
			</span>
			<button
				className="btn btn-outline btn-sm"
				onClick={onValidate}
				type="button"
			>
				<Check size={12} /> Confirm hours
			</button>
			<button
				className="btn btn-outline btn-sm"
				onClick={onApproveOT}
				type="button"
			>
				<ThumbsUp size={12} /> Approve OT
			</button>
			{canPayroll && (
				<button
					className="btn btn-outline btn-sm"
					onClick={onApprovePayroll}
					type="button"
				>
					<Lock size={12} /> Mark payroll-ready
				</button>
			)}
		</div>
	);
}

function clockDotState(onBreak: boolean, isClockedIn: boolean): string {
	if (onBreak) {
		return "break";
	}
	return isClockedIn ? "in" : "out";
}

function ClockStatusLabel({
	isClockedIn,
	onBreak,
	isEmployee,
	clockInTime,
}: {
	isClockedIn: boolean;
	onBreak: boolean;
	isEmployee: boolean;
	clockInTime: string | null;
}) {
	if (!isClockedIn) {
		return <>You have not checked in today</>;
	}
	if (onBreak) {
		return (
			<>
				<strong>On break</strong>
				{isEmployee ? " — break time is unpaid" : ""}
			</>
		);
	}
	return (
		<>
			<strong>Checked in</strong> since{" "}
			{clockInTime
				? new Date(clockInTime).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
						hour12: true,
					})
				: "—"}
		</>
	);
}

function ClockPanel({ memberRole }: { memberRole: string }) {
	const { data, isLoading, refetch } = useQuery(
		orpc.attendance.clock.currentStatus.queryOptions({
			input: undefined as never,
		})
	);

	const [elapsed, setElapsed] = useState("");

	const isClockedIn = data?.isClockedIn ?? false;
	const onBreak = (data as { onBreak?: boolean })?.onBreak ?? false;
	const clockInTime = data?.clockInTime ?? null;
	const todayBreakMinutes =
		(data as { todayBreakMinutes?: number })?.todayBreakMinutes ?? 0;

	useEffect(() => {
		if (!(isClockedIn && clockInTime)) {
			setElapsed("");
			return;
		}
		function update() {
			const start = new Date(clockInTime as string).getTime();
			const diff = Math.floor((Date.now() - start) / 60_000);
			const h = Math.floor(diff / 60);
			const m = diff % 60;
			setElapsed(`${h}h ${m}m`);
		}
		update();
		const timer = setInterval(update, 60_000);
		return () => clearInterval(timer);
	}, [isClockedIn, clockInTime]);

	async function handleCheckIn() {
		try {
			await client.attendance.clock.checkIn({});
			toast.success("Checked in successfully");
			refetch();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Check-in failed";
			if (msg.includes("already have an open")) {
				toast.error("You already have an open check-in. Clock out first.");
			} else if (msg.includes("don't have an employee")) {
				toast.error(
					"No employee profile found. Contact your HR administrator."
				);
			} else {
				toast.error(msg);
			}
		}
	}

	async function handleCheckOut() {
		try {
			await client.attendance.clock.checkOut({});
			toast.success("Checked out successfully");
			refetch();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Check-out failed";
			if (msg.includes("No open clock-in")) {
				toast.error("No open check-in found for today. Clock in first.");
			} else {
				toast.error(msg);
			}
		}
	}

	async function handleBreakStart() {
		try {
			await client.attendance.clock.breakStart({});
			toast.success("Break started");
			refetch();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Could not start break";
			toast.error(msg);
		}
	}

	async function handleBreakEnd() {
		try {
			const result = await client.attendance.clock.breakEnd({});
			const dur = (result as { durationMinutes?: number }).durationMinutes ?? 0;
			toast.success(`Break ended — ${dur}m recorded as unpaid break`);
			refetch();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Could not end break";
			toast.error(msg);
		}
	}

	// Role-aware label: employees see "My timesheet" rather than management copy.
	const isEmployee = !(
		canCorrectAttendance(memberRole) || canManagePayroll(memberRole)
	);

	if (isLoading) {
		return (
			<div className="clock-panel">
				<div
					style={{
						height: 14,
						width: 200,
						background: "var(--bg-3)",
						borderRadius: 4,
					}}
				/>
			</div>
		);
	}

	return (
		<div className="clock-panel">
			<div className="clock-status">
				<div className={`clock-dot ${clockDotState(onBreak, isClockedIn)}`} />
				<div>
					<div className="clock-label">
						<ClockStatusLabel
							clockInTime={clockInTime}
							isClockedIn={isClockedIn}
							isEmployee={isEmployee}
							onBreak={onBreak}
						/>
					</div>
					{isClockedIn && !onBreak && elapsed && (
						<div className="clock-elapsed">{elapsed} elapsed</div>
					)}
					{todayBreakMinutes > 0 && (
						<div className="clock-elapsed" style={{ color: "var(--fg-3)" }}>
							{todayBreakMinutes}m break deducted today
						</div>
					)}
				</div>
			</div>
			<div style={{ display: "flex", gap: 8 }}>
				{isClockedIn ? (
					<>
						{onBreak ? (
							<button
								className="btn btn-primary btn-sm"
								onClick={handleBreakEnd}
								type="button"
							>
								<Clock size={13} />
								End break
							</button>
						) : (
							<button
								className="btn btn-outline btn-sm"
								onClick={handleBreakStart}
								type="button"
							>
								<Clock size={13} />
								Start break
							</button>
						)}
						<button
							className="btn btn-outline btn-sm"
							onClick={handleCheckOut}
							type="button"
						>
							<Clock size={13} />
							Check out
						</button>
					</>
				) : (
					<button
						className="btn btn-primary btn-sm"
						onClick={handleCheckIn}
						type="button"
					>
						<Clock size={13} />
						Check in
					</button>
				)}
			</div>
		</div>
	);
}

function RecordDetailDrawer({
	record,
	onClose,
	memberRole,
}: {
	record: AttRecord;
	onClose: () => void;
	memberRole: string;
}) {
	const qc = useQueryClient();
	const { data } = useQuery(
		orpc.attendance.records.getById.queryOptions({
			input: { id: record.id },
		})
	);

	const events: AttEvent[] =
		((data as { events?: AttEvent[] })?.events as AttEvent[]) ?? [];

	async function handleValidateSingle() {
		try {
			await client.attendance.records.validate({ ids: [record.id] });
			toast.success("Hours confirmed");
			qc.invalidateQueries();
			onClose();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed");
		}
	}

	async function handleApproveOTSingle() {
		try {
			await client.attendance.records.approveOvertime({
				ids: [record.id],
			});
			toast.success("Overtime approved");
			qc.invalidateQueries();
			onClose();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed");
		}
	}

	const canAct = canCorrectAttendance(memberRole);

	return (
		<div className="att-detail">
			<button
				aria-label="Close detail drawer"
				className="backdrop"
				onClick={onClose}
				type="button"
			/>
			<div className="drawer">
				<div className="drawer-head">
					<h4>
						{record.employeeFirstName} {record.employeeLastName ?? ""} —{" "}
						{fmtDate(record.date)}
					</h4>
					<button
						className="btn btn-ghost btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="drawer-body">
					<div className="info-row">
						<span className="k">Status</span>
						<span className="v">
							<span className={statusPillClass(record.status)}>
								<span className="badge-dot" />
								{statusLabel(record.status)}
							</span>
						</span>
					</div>
					<div className="info-row">
						<span className="k">Payroll status</span>
						<span className="v">
							<span className={payrollPillClass(record.payrollStatus)}>
								{payrollLabel(record.payrollStatus)}
							</span>
						</span>
					</div>
					<div className="info-row">
						<span className="k">Clock in</span>
						<span className="v">{fmtTime(record.firstClockIn)}</span>
					</div>
					<div className="info-row">
						<span className="k">Clock out</span>
						<span className="v">
							{record.lastClockOut ? fmtTime(record.lastClockOut) : "Missing"}
						</span>
					</div>
					<div className="info-row">
						<span className="k">Worked</span>
						<span className="v">{fmtDuration(record.workedMinutes)}</span>
					</div>
					<div className="info-row">
						<span className="k">Payable</span>
						<span className="v">{fmtDuration(record.payableMinutes)}</span>
					</div>
					<div className="info-row">
						<span className="k">Minimum required</span>
						<span className="v">{fmtDuration(record.minimumMinutes)}</span>
					</div>
					<div className="info-row">
						<span className="k">Overtime</span>
						<span className="v">
							{record.overtimeMinutes > 0
								? `${fmtDuration(record.overtimeMinutes)}${record.isOvertimeApproved ? " (approved)" : " (pending)"}`
								: "—"}
						</span>
					</div>
					{record.lateMinutes > 0 && (
						<div className="info-row">
							<span className="k">Late</span>
							<span className="v">{record.lateMinutes}m</span>
						</div>
					)}
					{record.earlyLeaveMinutes > 0 && (
						<div className="info-row">
							<span className="k">Early departure</span>
							<span className="v">{record.earlyLeaveMinutes}m</span>
						</div>
					)}
					{record.breakDeductedMinutes > 0 && (
						<div className="info-row">
							<span className="k">Break deducted</span>
							<span className="v">{record.breakDeductedMinutes}m</span>
						</div>
					)}
					<div className="info-row">
						<span className="k">Day type</span>
						<span className="v">
							{record.dayType.charAt(0).toUpperCase() + record.dayType.slice(1)}
						</span>
					</div>
					<div className="info-row">
						<span className="k">Hours confirmed</span>
						<span className="v">{record.isValidated ? "Yes" : "No"}</span>
					</div>
					{record.notes && (
						<div className="info-row">
							<span className="k">Notes</span>
							<span className="v">{record.notes}</span>
						</div>
					)}

					{events.length > 0 && (
						<div className="events-list">
							<h5>Clock events ({events.length})</h5>
							{events.map((ev) => (
								<div className="event-item" key={ev.id}>
									<span className="ev-time">
										{new Date(ev.clockIn).toLocaleTimeString("en-US", {
											hour: "numeric",
											minute: "2-digit",
											hour12: true,
										})}
									</span>
									<span>→</span>
									<span className="ev-time">
										{ev.clockOut
											? new Date(ev.clockOut).toLocaleTimeString("en-US", {
													hour: "numeric",
													minute: "2-digit",
													hour12: true,
												})
											: "Open"}
									</span>
									<span className="ev-source">{sourceLabel(ev.source)}</span>
									<span className="ev-dur">
										{ev.durationMinutes ? fmtDuration(ev.durationMinutes) : "—"}
									</span>
								</div>
							))}
						</div>
					)}

					<div className="att-helper">
						Approved attendance records are used for future payroll
						calculations. Overtime must be approved before it appears in
						projected pay.
					</div>

					{canAct && record.payrollStatus !== "payroll_locked" && (
						<div
							style={{
								display: "flex",
								gap: 8,
								marginTop: 16,
							}}
						>
							{!record.isValidated && (
								<button
									className="btn btn-outline btn-sm"
									onClick={handleValidateSingle}
									type="button"
								>
									<Check size={12} />
									Confirm hours
								</button>
							)}
							{record.overtimeMinutes > 0 && !record.isOvertimeApproved && (
								<button
									className="btn btn-outline btn-sm"
									onClick={handleApproveOTSingle}
									type="button"
								>
									<ThumbsUp size={12} />
									Approve OT
								</button>
							)}
						</div>
					)}

					{record.payrollStatus === "payroll_locked" && (
						<div
							className="att-helper"
							style={{
								background: "var(--accent-soft)",
								color: "var(--accent)",
								marginTop: 12,
							}}
						>
							<Lock
								size={12}
								style={{
									marginRight: 4,
									verticalAlign: "middle",
								}}
							/>
							This record is locked for payroll and cannot be edited.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function CorrectionsView({ memberRole }: { memberRole: string }) {
	const qc = useQueryClient();
	const canReview = canCorrectAttendance(memberRole);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectNote, setRejectNote] = useState("");

	const [statusFilter, setStatusFilter] = useState<
		"pending" | "approved" | "rejected" | undefined
	>("pending");

	const { data, isLoading } = useQuery(
		orpc.attendance.corrections.list.queryOptions({
			input: {
				status: statusFilter,
				page: 1,
				pageSize: 50,
			},
		})
	);

	const corrections: CorrectionRow[] = (data?.data as CorrectionRow[]) ?? [];

	async function handleApprove(id: string) {
		try {
			await client.attendance.corrections.approve({ id });
			toast.success("Correction approved");
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed");
		}
	}

	async function handleReject(id: string) {
		if (!rejectNote.trim()) {
			toast.error("Please provide a reason for rejection.");
			return;
		}
		try {
			await client.attendance.corrections.reject({
				id,
				reviewNote: rejectNote.trim(),
			});
			toast.success("Correction rejected");
			setRejectingId(null);
			setRejectNote("");
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed");
		}
	}

	const CATEGORY_LABELS: Record<string, string> = {
		forgot_clock_in: "Forgot to clock in",
		forgot_clock_out: "Forgot to clock out",
		wrong_time: "Wrong time recorded",
		system_error: "System error",
		other: "Other",
	};

	return (
		<div>
			<div
				style={{
					display: "flex",
					gap: 8,
					marginBottom: 16,
				}}
			>
				{([undefined, "pending", "approved", "rejected"] as const).map((s) => (
					<button
						className={`seg-btn${statusFilter === s ? "active" : ""}`}
						key={s ?? "all"}
						onClick={() =>
							setStatusFilter(
								s as "pending" | "approved" | "rejected" | undefined
							)
						}
						type="button"
					>
						{s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
					</button>
				))}
			</div>

			{isLoading && (
				<p style={{ color: "var(--fg-3)", padding: 20 }}>Loading…</p>
			)}

			{!isLoading && corrections.length === 0 && (
				<div
					style={{
						textAlign: "center",
						padding: 40,
						color: "var(--fg-3)",
					}}
				>
					<p style={{ fontSize: 14 }}>
						No correction requests
						{statusFilter ? ` (${statusFilter})` : ""} waiting for review.
					</p>
				</div>
			)}

			{!isLoading &&
				corrections.map((c) => (
					<div
						key={c.id}
						style={{
							padding: "14px 16px",
							borderRadius: 10,
							background: "var(--bg-2)",
							border: "1px solid var(--line)",
							marginBottom: 8,
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 6,
							}}
						>
							<span
								style={{
									fontWeight: 500,
									fontSize: 14,
								}}
							>
								{c.employeeFirstName} {c.employeeLastName ?? ""}
							</span>
							<span className={`pill-status ${correctionPillClass(c.status)}`}>
								{correctionStatusLabel(c.status)}
							</span>
						</div>
						<div
							style={{
								fontSize: 13,
								color: "var(--fg-2)",
								marginBottom: 4,
							}}
						>
							{CATEGORY_LABELS[c.category] ?? c.category}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--fg-3)",
							}}
						>
							{c.reason}
						</div>
						{c.reviewNote && (
							<div
								style={{
									fontSize: 12,
									color: "var(--fg-4)",
									marginTop: 4,
									fontStyle: "italic",
								}}
							>
								Review: {c.reviewNote}
							</div>
						)}
						{canReview && c.status === "pending" && (
							<div
								style={{
									display: "flex",
									gap: 8,
									marginTop: 10,
								}}
							>
								<button
									className="btn btn-outline btn-sm"
									onClick={() => handleApprove(c.id)}
									type="button"
								>
									<Check size={12} />
									Approve
								</button>
								{rejectingId === c.id ? (
									<>
										<input
											className="input"
											onChange={(e) => setRejectNote(e.target.value)}
											placeholder="Reason for rejection…"
											style={{ height: 30, fontSize: 12, flex: 1 }}
											value={rejectNote}
										/>
										<button
											className="btn btn-outline btn-sm"
											disabled={!rejectNote.trim()}
											onClick={() => handleReject(c.id)}
											style={{
												borderColor: "var(--danger)",
												color: "var(--danger)",
											}}
											type="button"
										>
											Confirm
										</button>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => {
												setRejectingId(null);
												setRejectNote("");
											}}
											type="button"
										>
											Cancel
										</button>
									</>
								) : (
									<button
										className="btn btn-outline btn-sm"
										onClick={() => setRejectingId(c.id)}
										style={{
											borderColor: "var(--danger)",
											color: "var(--danger)",
										}}
										type="button"
									>
										<X size={12} />
										Reject
									</button>
								)}
							</div>
						)}
					</div>
				))}
		</div>
	);
}
