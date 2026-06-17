import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarDays,
	CalendarRange,
	Check,
	ChevronLeft,
	ChevronRight,
	List,
	Plus,
	Trash2,
} from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import "@/styles/roster.css";
import { EmptyState } from "@/components/empty-state";
import {
	canApproveRoster,
	canManageRoster,
	canViewRoster,
	seesAllRoster,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/roster/")({
	component: RosterPage,
});

type RosterView = "calendar" | "list" | "timeline";
type OverrideType = "none" | "custom_hours" | "day_off" | "swap";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_OPTIONS = [
	{ value: 1, label: "Mon" },
	{ value: 2, label: "Tue" },
	{ value: 3, label: "Wed" },
	{ value: 4, label: "Thu" },
	{ value: 5, label: "Fri" },
	{ value: 6, label: "Sat" },
	{ value: 0, label: "Sun" },
];

interface RosterEntry {
	customEndMinutes: number | null;
	customStartMinutes: number | null;
	date: string | Date;
	employeeFirstName?: string | null;
	employeeId?: string;
	employeeLastName?: string | null;
	id: string;
	isApproved: boolean;
	note: string | null;
	overrideType: OverrideType;
	shiftId: string | null;
	shiftName: string | null;
}

interface EmployeeRow {
	firstName: string;
	id: string;
	lastName?: string | null;
}

interface ShiftRow {
	id: string;
	name: string;
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function dateOnly(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// roster API `date` is a date column; orpc revives it as a Date, but a plain
// string may also flow through — normalize either to a calendar YYYY-MM-DD.
function keyDate(d: string | Date): string {
	return typeof d === "string" ? d.slice(0, 10) : isoDate(d);
}

function mondayOf(d: Date): Date {
	const date = dateOnly(d);
	const dow = date.getDay();
	date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
	return date;
}

function addDays(d: Date, n: number): Date {
	const date = dateOnly(d);
	date.setDate(date.getDate() + n);
	return date;
}

function fmtTime(min: number | null): string {
	if (min === null || min === undefined) {
		return "";
	}
	return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function parseTime(value: string): number | null {
	if (!value) {
		return null;
	}
	const [h, m] = value.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) {
		return null;
	}
	return h * 60 + m;
}

function weekLabel(monday: Date): string {
	const end = addDays(monday, 6);
	const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
	return `${monday.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

function entryLabel(e: RosterEntry): string {
	if (e.overrideType === "day_off") {
		return "Day off";
	}
	if (e.shiftName) {
		return e.shiftName;
	}
	if (e.overrideType === "custom_hours") {
		return "Custom";
	}
	return "Scheduled";
}

interface DialogState {
	customEnd: string;
	customStart: string;
	date: string;
	employeeId: string;
	id?: string;
	isApproved: boolean;
	note: string;
	overrideType: OverrideType;
	shiftId: string;
}

function RosterPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canManage = canManageRoster(role);
	const canApprove = canApproveRoster(role);
	const selfOnly = !(seesAllRoster(role) || canManage);
	const qc = useQueryClient();

	const [view, setView] = useState<RosterView>("calendar");
	const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
	const [dialog, setDialog] = useState<DialogState | null>(null);
	const [bulkOpen, setBulkOpen] = useState(false);

	const weekDays = useMemo(
		() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
		[weekStart]
	);
	const from = isoDate(weekDays[0]);
	const to = isoDate(weekDays[6]);
	const todayIso = isoDate(new Date());

	const entriesQuery = useQuery(
		selfOnly
			? orpc.roster.listMine.queryOptions({ input: { from, to } })
			: orpc.roster.list.queryOptions({ input: { from, to } })
	);
	const shiftsQuery = useQuery(orpc.roster.shifts.queryOptions({}));
	const employeesQuery = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 200 },
		})
	);

	const entries = (entriesQuery.data ?? []) as RosterEntry[];
	const shifts = (shiftsQuery.data ?? []) as ShiftRow[];
	const employees = selfOnly
		? []
		: (((employeesQuery.data as { data?: EmployeeRow[] } | undefined)?.data ??
				[]) as EmployeeRow[]);

	// Map[employeeId|"me"][isoDate] -> entry
	const byKey = useMemo(() => {
		const map = new Map<string, RosterEntry>();
		for (const e of entries) {
			const empKey = selfOnly ? "me" : (e.employeeId ?? "");
			map.set(`${empKey}|${keyDate(e.date)}`, e);
		}
		return map;
	}, [entries, selfOnly]);

	// Rows for grid/timeline. Self → single "me" row. Otherwise active employees,
	// unioned with anyone who already has an entry this week (in-scope by definition).
	const rows: { id: string; name: string }[] = useMemo(() => {
		if (selfOnly) {
			return [{ id: "me", name: "My schedule" }];
		}
		const seen = new Map<string, string>();
		for (const emp of employees) {
			seen.set(
				emp.id,
				`${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ""}`
			);
		}
		for (const e of entries) {
			if (e.employeeId && !seen.has(e.employeeId)) {
				seen.set(
					e.employeeId,
					`${e.employeeFirstName ?? ""}${e.employeeLastName ? ` ${e.employeeLastName}` : ""}`.trim() ||
						"Employee"
				);
			}
		}
		return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
	}, [selfOnly, employees, entries]);

	const invalidate = () => qc.invalidateQueries();

	const openCreate = (employeeId?: string, date?: string) => {
		setDialog({
			employeeId: employeeId ?? "",
			date: date ?? todayIso,
			shiftId: "",
			overrideType: "none",
			customStart: "",
			customEnd: "",
			note: "",
			isApproved: false,
		});
	};

	const openEdit = (e: RosterEntry) => {
		setDialog({
			id: e.id,
			employeeId: e.employeeId ?? "",
			date: keyDate(e.date),
			shiftId: e.shiftId ?? "",
			overrideType: e.overrideType,
			customStart: fmtTime(e.customStartMinutes),
			customEnd: fmtTime(e.customEndMinutes),
			note: e.note ?? "",
			isApproved: e.isApproved,
		});
	};

	const toggleApproval = async (e: RosterEntry) => {
		try {
			await client.roster.setApproval({ id: e.id, approve: !e.isApproved });
			toast.success(e.isApproved ? "Approval cleared." : "Schedule approved.");
			invalidate();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not update.");
		}
	};

	if (!canViewRoster(role)) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Roster & Schedule</h1>
				</div>
				<EmptyState
					description="You don't have access to schedules."
					icon={<CalendarDays size={32} />}
					title="No access"
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
						<span>Roster</span>
					</div>
					<h1 className="page-title">
						{selfOnly ? "My schedule" : "Roster & Schedule"}
					</h1>
					<p className="page-sub">
						{selfOnly
							? "Your assigned shifts for the week."
							: "Assign shifts, manage day-offs and approve the weekly schedule."}
					</p>
				</div>
				{canManage && (
					<div style={{ display: "flex", gap: 8 }}>
						<button
							className="btn btn-outline"
							onClick={() => setBulkOpen(true)}
							type="button"
						>
							<CalendarRange size={14} />
							Bulk assign
						</button>
						<button
							className="btn btn-primary"
							onClick={() => openCreate()}
							type="button"
						>
							<Plus size={14} />
							Assign shift
						</button>
					</div>
				)}
			</div>

			<div className="rst-toolbar">
				<div className="rst-week-nav">
					<button
						aria-label="Previous week"
						className="btn btn-ghost btn-sm"
						onClick={() => setWeekStart(addDays(weekStart, -7))}
						type="button"
					>
						<ChevronLeft size={15} />
					</button>
					<span className="rst-week-label">{weekLabel(weekStart)}</span>
					<button
						aria-label="Next week"
						className="btn btn-ghost btn-sm"
						onClick={() => setWeekStart(addDays(weekStart, 7))}
						type="button"
					>
						<ChevronRight size={15} />
					</button>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => setWeekStart(mondayOf(new Date()))}
						type="button"
					>
						Today
					</button>
				</div>
				<div className="rst-spacer" />
				<div className="segmented" role="tablist">
					<button
						aria-selected={view === "calendar"}
						className="seg"
						onClick={() => setView("calendar")}
						role="tab"
						type="button"
					>
						<CalendarDays size={13} /> Calendar
					</button>
					<button
						aria-selected={view === "list"}
						className="seg"
						onClick={() => setView("list")}
						role="tab"
						type="button"
					>
						<List size={13} /> List
					</button>
					<button
						aria-selected={view === "timeline"}
						className="seg"
						onClick={() => setView("timeline")}
						role="tab"
						type="button"
					>
						<CalendarRange size={13} /> Timeline
					</button>
				</div>
			</div>

			{entriesQuery.isLoading && <p className="page-sub">Loading schedule…</p>}
			{entriesQuery.isError && (
				<p className="page-sub" style={{ color: "var(--danger)" }}>
					Could not load the schedule. Try again.
				</p>
			)}

			{!(entriesQuery.isLoading || entriesQuery.isError) && (
				<>
					{view === "calendar" && (
						<CalendarView
							byKey={byKey}
							canManage={canManage}
							onCellClick={(empId, date) => {
								const existing = byKey.get(`${empId}|${date}`);
								if (existing) {
									openEdit(existing);
								} else if (canManage) {
									openCreate(empId === "me" ? "" : empId, date);
								}
							}}
							rows={rows}
							todayIso={todayIso}
							weekDays={weekDays}
						/>
					)}
					{view === "timeline" && (
						<TimelineView byKey={byKey} rows={rows} weekDays={weekDays} />
					)}
					{view === "list" && (
						<ListView
							canApprove={canApprove}
							canManage={canManage}
							entries={entries}
							onApprove={toggleApproval}
							onEdit={openEdit}
							selfOnly={selfOnly}
						/>
					)}
				</>
			)}

			{dialog && (
				<EntryDialog
					canApprove={canApprove}
					employees={employees}
					onApprove={toggleApproval}
					onClose={() => setDialog(null)}
					onSaved={() => {
						setDialog(null);
						invalidate();
					}}
					selfOnly={selfOnly}
					shifts={shifts}
					state={dialog}
				/>
			)}

			{bulkOpen && (
				<BulkAssignDialog
					employees={employees}
					onClose={() => setBulkOpen(false)}
					onSaved={() => {
						setBulkOpen(false);
						invalidate();
					}}
					shifts={shifts}
				/>
			)}
		</div>
	);
}

function CalendarView({
	rows,
	weekDays,
	byKey,
	todayIso,
	canManage,
	onCellClick,
}: {
	rows: { id: string; name: string }[];
	weekDays: Date[];
	byKey: Map<string, RosterEntry>;
	todayIso: string;
	canManage: boolean;
	onCellClick: (empId: string, date: string) => void;
}) {
	if (rows.length === 0) {
		return (
			<EmptyState
				description="Add active employees in Settings to build a roster."
				icon={<CalendarDays size={28} />}
				title="No employees to schedule"
			/>
		);
	}
	return (
		<div className="card" style={{ padding: 0 }}>
			<div className="rst-grid-wrap">
				<table className="rst-grid">
					<thead>
						<tr>
							<th className="rst-emp-col">Employee</th>
							{weekDays.map((d, i) => (
								<th
									className={isoDate(d) === todayIso ? "rst-today" : ""}
									key={isoDate(d)}
								>
									{DAY_LABELS[i]}
									<br />
									{d.getDate()}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id}>
								<td className="rst-emp-col">{row.name}</td>
								{weekDays.map((d) => {
									const iso = isoDate(d);
									const entry = byKey.get(`${row.id}|${iso}`);
									return (
										<td className="rst-cell" key={iso}>
											<button
												className="rst-cell-btn"
												disabled={!(entry || canManage)}
												onClick={() => onCellClick(row.id, iso)}
												type="button"
											>
												{entry ? (
													<>
														<span
															className={`rst-chip${entry.overrideType === "day_off" ? "rst-off" : ""}`}
														>
															{entryLabel(entry)}
															<span
																className={`rst-approve-dot ${entry.isApproved ? "ok" : "pending"}`}
															/>
														</span>
														{entry.overrideType === "custom_hours" &&
															entry.customStartMinutes !== null && (
																<span className="rst-cell-time">
																	{fmtTime(entry.customStartMinutes)}–
																	{fmtTime(entry.customEndMinutes)}
																</span>
															)}
													</>
												) : (
													canManage && <span className="rst-cell-empty">+</span>
												)}
											</button>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function TimelineView({
	rows,
	weekDays,
	byKey,
}: {
	rows: { id: string; name: string }[];
	weekDays: Date[];
	byKey: Map<string, RosterEntry>;
}) {
	if (rows.length === 0) {
		return (
			<EmptyState
				description="Add active employees in Settings to build a roster."
				icon={<CalendarRange size={28} />}
				title="No employees to schedule"
			/>
		);
	}
	return (
		<div className="card card-pad">
			{rows.map((row) => (
				<div className="rst-timeline-row" key={row.id}>
					<div className="rst-timeline-emp">{row.name}</div>
					<div className="rst-timeline-strip">
						{weekDays.map((d) => {
							const entry = byKey.get(`${row.id}|${isoDate(d)}`);
							const on = entry && entry.overrideType !== "day_off";
							return (
								<div
									className={`rst-timeline-day${on ? "on" : ""}`}
									key={isoDate(d)}
									title={entry ? entryLabel(entry) : "Off"}
								>
									{entry ? entryLabel(entry) : ""}
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

function ListView({
	entries,
	selfOnly,
	canManage,
	canApprove,
	onEdit,
	onApprove,
}: {
	entries: RosterEntry[];
	selfOnly: boolean;
	canManage: boolean;
	canApprove: boolean;
	onEdit: (e: RosterEntry) => void;
	onApprove: (e: RosterEntry) => void;
}) {
	if (entries.length === 0) {
		return (
			<EmptyState
				description="No shifts are scheduled for this week."
				icon={<List size={28} />}
				title="Nothing scheduled"
			/>
		);
	}
	return (
		<div className="card card-pad">
			<div className="table-wrap">
				<table className="tbl">
					<thead>
						<tr>
							{!selfOnly && <th>Employee</th>}
							<th>Date</th>
							<th>Shift</th>
							<th>Hours</th>
							<th>Status</th>
							<th>Note</th>
							{(canManage || canApprove) && <th aria-label="Actions" />}
						</tr>
					</thead>
					<tbody>
						{entries.map((e) => (
							<tr key={e.id}>
								{!selfOnly && (
									<td>
										{`${e.employeeFirstName ?? ""}${e.employeeLastName ? ` ${e.employeeLastName}` : ""}`.trim() ||
											"—"}
									</td>
								)}
								<td>
									{new Date(`${keyDate(e.date)}T00:00:00`).toLocaleDateString(
										undefined,
										{
											weekday: "short",
											day: "numeric",
											month: "short",
										}
									)}
								</td>
								<td>{entryLabel(e)}</td>
								<td>
									{e.overrideType === "custom_hours" &&
									e.customStartMinutes !== null
										? `${fmtTime(e.customStartMinutes)}–${fmtTime(e.customEndMinutes)}`
										: "—"}
								</td>
								<td>
									<span
										className={`badge ${e.isApproved ? "badge-success" : "badge-warning"}`}
									>
										{e.isApproved ? "Approved" : "Pending"}
									</span>
								</td>
								<td style={{ color: "var(--fg-3)" }}>{e.note || "—"}</td>
								{(canManage || canApprove) && (
									<td style={{ textAlign: "right" }}>
										<div
											style={{
												display: "flex",
												gap: 6,
												justifyContent: "flex-end",
											}}
										>
											{canApprove && (
												<button
													className="btn btn-ghost btn-sm"
													onClick={() => onApprove(e)}
													type="button"
												>
													<Check size={13} />
													{e.isApproved ? "Unapprove" : "Approve"}
												</button>
											)}
											{canManage && (
												<button
													className="btn btn-outline btn-sm"
													onClick={() => onEdit(e)}
													type="button"
												>
													Edit
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
		</div>
	);
}

function EntryDialog({
	state,
	shifts,
	employees,
	selfOnly,
	canApprove,
	onClose,
	onSaved,
	onApprove,
}: {
	state: DialogState;
	shifts: ShiftRow[];
	employees: EmployeeRow[];
	selfOnly: boolean;
	canApprove: boolean;
	onClose: () => void;
	onSaved: () => void;
	onApprove: (e: RosterEntry) => void;
}) {
	const [form, setForm] = useState<DialogState>(state);
	const [saving, setSaving] = useState(false);
	const [confirmingRemove, setConfirmingRemove] = useState(false);
	const isEdit = !!form.id;

	const set = <K extends keyof DialogState>(k: K, v: DialogState[K]) =>
		setForm((f) => ({ ...f, [k]: v }));

	const save = async () => {
		if (!((form.employeeId || selfOnly) && form.date)) {
			toast.error("Pick an employee and date.");
			return;
		}
		setSaving(true);
		const payload = {
			shiftId: form.shiftId || null,
			overrideType: form.overrideType,
			customStartMinutes:
				form.overrideType === "custom_hours"
					? parseTime(form.customStart)
					: null,
			customEndMinutes:
				form.overrideType === "custom_hours" ? parseTime(form.customEnd) : null,
			note: form.note || null,
		};
		try {
			if (isEdit && form.id) {
				await client.roster.update({ id: form.id, ...payload });
				toast.success("Schedule updated.");
			} else {
				await client.roster.create({
					employeeId: form.employeeId,
					date: form.date,
					...payload,
				});
				toast.success("Shift assigned.");
			}
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save.");
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!form.id) {
			return;
		}
		try {
			await client.roster.remove({ id: form.id });
			toast.success("Removed.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not remove.");
		}
	};

	return (
		<div className="rst-dialog-backdrop">
			<div
				aria-labelledby="rst-dialog-title"
				className="rst-dialog"
				role="dialog"
			>
				<h2 id="rst-dialog-title">
					{isEdit ? "Edit schedule" : "Assign shift"}
				</h2>

				{!selfOnly && (
					<div className="rst-form-field">
						<label htmlFor="rst-emp">Employee</label>
						<select
							disabled={isEdit}
							id="rst-emp"
							onChange={(e) => set("employeeId", e.target.value)}
							value={form.employeeId}
						>
							<option value="">Select employee…</option>
							{employees.map((emp) => (
								<option key={emp.id} value={emp.id}>
									{emp.firstName}
									{emp.lastName ? ` ${emp.lastName}` : ""}
								</option>
							))}
						</select>
					</div>
				)}

				<div className="rst-form-field">
					<label htmlFor="rst-date">Date</label>
					<input
						disabled={isEdit}
						id="rst-date"
						onChange={(e) => set("date", e.target.value)}
						type="date"
						value={form.date}
					/>
				</div>

				<div className="rst-form-field">
					<label htmlFor="rst-type">Type</label>
					<select
						id="rst-type"
						onChange={(e) =>
							set("overrideType", e.target.value as OverrideType)
						}
						value={form.overrideType}
					>
						<option value="none">Regular shift</option>
						<option value="custom_hours">Custom hours</option>
						<option value="day_off">Day off</option>
						<option value="swap">Swap</option>
					</select>
				</div>

				{form.overrideType !== "day_off" && (
					<div className="rst-form-field">
						<label htmlFor="rst-shift">Shift</label>
						<select
							id="rst-shift"
							onChange={(e) => set("shiftId", e.target.value)}
							value={form.shiftId}
						>
							<option value="">No shift / unspecified</option>
							{shifts.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</div>
				)}

				{form.overrideType === "custom_hours" && (
					<div className="rst-form-row">
						<div className="rst-form-field">
							<label htmlFor="rst-start">Start</label>
							<input
								id="rst-start"
								onChange={(e) => set("customStart", e.target.value)}
								type="time"
								value={form.customStart}
							/>
						</div>
						<div className="rst-form-field">
							<label htmlFor="rst-end">End</label>
							<input
								id="rst-end"
								onChange={(e) => set("customEnd", e.target.value)}
								type="time"
								value={form.customEnd}
							/>
						</div>
					</div>
				)}

				<div className="rst-form-field">
					<label htmlFor="rst-note">Note</label>
					<input
						id="rst-note"
						onChange={(e) => set("note", e.target.value)}
						placeholder="Optional"
						value={form.note}
					/>
				</div>

				<div className="rst-dialog-actions">
					<div>
						{isEdit &&
							(confirmingRemove ? (
								<button
									className="btn btn-ghost btn-sm"
									onClick={remove}
									style={{ color: "var(--danger)" }}
									type="button"
								>
									<Trash2 size={13} />
									Confirm remove
								</button>
							) : (
								<button
									className="btn btn-ghost btn-sm"
									onClick={() => setConfirmingRemove(true)}
									type="button"
								>
									<Trash2 size={13} />
									Remove
								</button>
							))}
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						{isEdit && canApprove && form.id && (
							<button
								className="btn btn-outline"
								onClick={() =>
									onApprove({
										id: form.id as string,
										date: form.date,
										shiftId: form.shiftId || null,
										shiftName: null,
										overrideType: form.overrideType,
										customStartMinutes: null,
										customEndMinutes: null,
										note: form.note,
										isApproved: form.isApproved,
									})
								}
								type="button"
							>
								<Check size={14} />
								{form.isApproved ? "Unapprove" : "Approve"}
							</button>
						)}
						<button className="btn btn-ghost" onClick={onClose} type="button">
							Cancel
						</button>
						<button
							className="btn btn-primary"
							disabled={saving}
							onClick={save}
							type="button"
						>
							{saving ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function BulkAssignDialog({
	shifts,
	employees,
	onClose,
	onSaved,
}: {
	shifts: ShiftRow[];
	employees: EmployeeRow[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [employeeId, setEmployeeId] = useState("");
	const [shiftId, setShiftId] = useState("");
	const [from, setFrom] = useState(isoDate(new Date()));
	const [to, setTo] = useState(isoDate(addDays(new Date(), 13)));
	const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
	const [saving, setSaving] = useState(false);

	const toggleDay = (d: number) =>
		setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

	const save = async () => {
		if (!(employeeId && shiftId)) {
			toast.error("Pick an employee and a shift.");
			return;
		}
		setSaving(true);
		try {
			await client.roster.bulkAssign({
				employeeId,
				shiftId,
				from,
				to,
				weekdays: weekdays.length === 7 ? undefined : weekdays,
				skipExisting: true,
			});
			toast.success("Shifts assigned across the range.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not assign.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rst-dialog-backdrop">
			<div
				aria-labelledby="rst-bulk-title"
				className="rst-dialog"
				role="dialog"
			>
				<h2 id="rst-bulk-title">Bulk assign shifts</h2>
				<p className="page-sub" style={{ marginTop: 0 }}>
					Assign one shift to an employee across a date range. Existing days are
					skipped.
				</p>
				<div className="rst-form-field">
					<label htmlFor="rst-bulk-emp">Employee</label>
					<select
						id="rst-bulk-emp"
						onChange={(e) => setEmployeeId(e.target.value)}
						value={employeeId}
					>
						<option value="">Select employee…</option>
						{employees.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{emp.firstName}
								{emp.lastName ? ` ${emp.lastName}` : ""}
							</option>
						))}
					</select>
				</div>
				<div className="rst-form-field">
					<label htmlFor="rst-bulk-shift">Shift</label>
					<select
						id="rst-bulk-shift"
						onChange={(e) => setShiftId(e.target.value)}
						value={shiftId}
					>
						<option value="">Select shift…</option>
						{shifts.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</div>
				<div className="rst-form-row">
					<div className="rst-form-field">
						<label htmlFor="rst-bulk-from">From</label>
						<input
							id="rst-bulk-from"
							onChange={(e) => setFrom(e.target.value)}
							type="date"
							value={from}
						/>
					</div>
					<div className="rst-form-field">
						<label htmlFor="rst-bulk-to">To</label>
						<input
							id="rst-bulk-to"
							onChange={(e) => setTo(e.target.value)}
							type="date"
							value={to}
						/>
					</div>
				</div>
				<div className="rst-form-field">
					<span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-2)" }}>
						Days of week
					</span>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
						{WEEKDAY_OPTIONS.map((d) => (
							<button
								className={`btn btn-sm ${weekdays.includes(d.value) ? "btn-primary" : "btn-outline"}`}
								key={d.value}
								onClick={() => toggleDay(d.value)}
								type="button"
							>
								{d.label}
							</button>
						))}
					</div>
				</div>
				<div
					className="rst-dialog-actions"
					style={{ justifyContent: "flex-end" }}
				>
					<button className="btn btn-ghost" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={saving}
						onClick={save}
						type="button"
					>
						{saving ? "Assigning…" : "Assign"}
					</button>
				</div>
			</div>
		</div>
	);
}
