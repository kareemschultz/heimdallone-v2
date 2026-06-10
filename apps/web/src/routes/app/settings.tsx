import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Archive,
	Briefcase,
	Building,
	CalendarDays,
	Check,
	Clock,
	Edit,
	Plus,
	Trash2,
	Undo,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	AVAILABLE_YEARS,
	fetchHolidays,
	type HolidaySuggestion,
	SUPPORTED_COUNTRIES,
} from "@/lib/holiday-providers";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/settings")({
	component: OrganizationSettingsPage,
});

type SettingsTab =
	| "departments"
	| "positions"
	| "roles"
	| "workTypes"
	| "employeeTypes"
	| "shifts"
	| "holidays";

interface EditingItem {
	departmentId?: string;
	description?: string;
	id?: string;
	jobPositionId?: string;
	name: string;
}

function OrganizationSettingsPage() {
	const [tab, setTab] = useState<SettingsTab>("departments");
	const [editing, setEditing] = useState<EditingItem | null>(null);
	const [showArchived, setShowArchived] = useState(false);
	const [confirmArchive, setConfirmArchive] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const qc = useQueryClient();

	const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
		{ key: "departments", label: "Departments", icon: <Building size={13} /> },
		{ key: "positions", label: "Positions", icon: <Briefcase size={13} /> },
		{ key: "roles", label: "Roles", icon: <Users size={13} /> },
		{ key: "workTypes", label: "Work Types", icon: <Briefcase size={13} /> },
		{
			key: "employeeTypes",
			label: "Employment Types",
			icon: <Users size={13} />,
		},
		{ key: "shifts", label: "Shifts", icon: <Clock size={13} /> },
		{ key: "holidays", label: "Holidays", icon: <CalendarDays size={13} /> },
	];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Settings</span>
					</div>
					<h1 className="page-title">Organization Settings</h1>
					<p className="page-sub">
						Configure departments, positions, shifts, and other organization
						structure. These settings are used when adding employees.
					</p>
				</div>
			</div>

			<div className="tabs" style={{ marginBottom: 20 }}>
				{tabs.map(({ key, label, icon }) => (
					<button
						aria-selected={tab === key}
						className="tab"
						key={key}
						onClick={() => {
							setTab(key);
							setEditing(null);
						}}
						type="button"
					>
						{icon}
						{label}
					</button>
				))}
			</div>

			{tab === "departments" && (
				<SettingSection
					confirmArchive={confirmArchive}
					editing={editing}
					hasDescription
					label="Department"
					listHook={() =>
						useQuery(
							orpc.hrCore.departments.list.queryOptions({
								input: { includeArchived: showArchived },
							})
						)
					}
					onArchive={async (id) => {
						await client.hrCore.departments.archive({ id });
						qc.invalidateQueries();
						toast.success("Department archived");
					}}
					onConfirmArchive={setConfirmArchive}
					onCreate={async (item) => {
						await client.hrCore.departments.create({
							name: item.name,
							description: item.description,
						});
						qc.invalidateQueries();
						toast.success("Department created");
					}}
					onEdit={setEditing}
					onUpdate={async (item) => {
						await client.hrCore.departments.update({
							id: item.id!,
							name: item.name,
							description: item.description,
						});
						qc.invalidateQueries();
						toast.success("Department updated");
					}}
					plural="Departments"
					setConfirmArchive={setConfirmArchive}
					showArchived={showArchived}
					toggleArchived={() => setShowArchived((v) => !v)}
				/>
			)}

			{tab === "positions" && (
				<PositionSection
					editing={editing}
					onEdit={setEditing}
					showArchived={showArchived}
					toggleArchived={() => setShowArchived((v) => !v)}
				/>
			)}

			{tab === "roles" && (
				<RoleSection
					editing={editing}
					onEdit={setEditing}
					showArchived={showArchived}
					toggleArchived={() => setShowArchived((v) => !v)}
				/>
			)}

			{tab === "workTypes" && (
				<SettingSection
					confirmArchive={confirmArchive}
					editing={editing}
					label="Work Type"
					listHook={() =>
						useQuery(
							orpc.hrCore.workTypes.list.queryOptions({
								input: { includeArchived: showArchived },
							})
						)
					}
					onArchive={async (id) => {
						await client.hrCore.workTypes.archive({ id });
						qc.invalidateQueries();
						toast.success("Work type archived");
					}}
					onConfirmArchive={setConfirmArchive}
					onCreate={async (item) => {
						await client.hrCore.workTypes.create({ name: item.name });
						qc.invalidateQueries();
						toast.success("Work type created");
					}}
					onEdit={setEditing}
					onUpdate={async (item) => {
						await client.hrCore.workTypes.update({
							id: item.id!,
							name: item.name,
						});
						qc.invalidateQueries();
						toast.success("Work type updated");
					}}
					plural="Work Types"
					setConfirmArchive={setConfirmArchive}
					showArchived={showArchived}
					toggleArchived={() => setShowArchived((v) => !v)}
				/>
			)}

			{tab === "employeeTypes" && (
				<SettingSection
					confirmArchive={confirmArchive}
					editing={editing}
					label="Employment Type"
					listHook={() =>
						useQuery(
							orpc.hrCore.employeeTypes.list.queryOptions({
								input: { includeArchived: showArchived },
							})
						)
					}
					onArchive={async (id) => {
						await client.hrCore.employeeTypes.archive({ id });
						qc.invalidateQueries();
						toast.success("Employment type archived");
					}}
					onConfirmArchive={setConfirmArchive}
					onCreate={async (item) => {
						await client.hrCore.employeeTypes.create({ name: item.name });
						qc.invalidateQueries();
						toast.success("Employment type created");
					}}
					onEdit={setEditing}
					onUpdate={async (item) => {
						await client.hrCore.employeeTypes.update({
							id: item.id!,
							name: item.name,
						});
						qc.invalidateQueries();
						toast.success("Employment type updated");
					}}
					plural="Employment Types"
					setConfirmArchive={setConfirmArchive}
					showArchived={showArchived}
					toggleArchived={() => setShowArchived((v) => !v)}
				/>
			)}

			{tab === "shifts" && <ShiftSection />}

			{tab === "holidays" && <HolidaySection />}
		</div>
	);
}

// ─── Generic Setting Section ──────────────────────────────

function SettingSection({
	label,
	plural,
	hasDescription,
	listHook,
	onCreate,
	onUpdate,
	onArchive,
	editing,
	onEdit,
	showArchived,
	toggleArchived,
	confirmArchive,
	onConfirmArchive,
	setConfirmArchive,
}: {
	label: string;
	plural: string;
	hasDescription?: boolean;
	listHook: () => ReturnType<typeof useQuery>;
	onCreate: (item: EditingItem) => Promise<void>;
	onUpdate: (item: EditingItem) => Promise<void>;
	onArchive: (id: string) => Promise<void>;
	editing: EditingItem | null;
	onEdit: (item: EditingItem | null) => void;
	showArchived: boolean;
	toggleArchived: () => void;
	confirmArchive: { id: string; name: string } | null;
	onConfirmArchive: (item: { id: string; name: string } | null) => void;
	setConfirmArchive: (item: { id: string; name: string } | null) => void;
}) {
	const { data, isLoading } = listHook();
	const items =
		(data as {
			id: string;
			name: string;
			description?: string;
			isActive: boolean;
		}[]) ?? [];
	const [formName, setFormName] = useState("");
	const [formDesc, setFormDesc] = useState("");
	const [saving, setSaving] = useState(false);

	const startCreate = () => {
		setFormName("");
		setFormDesc("");
		onEdit({ name: "" });
	};
	const startEdit = (item: {
		id: string;
		name: string;
		description?: string | null;
	}) => {
		setFormName(item.name);
		setFormDesc(item.description ?? "");
		onEdit({
			id: item.id,
			name: item.name,
			description: item.description ?? "",
		});
	};
	const cancelEdit = () => onEdit(null);

	const handleSave = async () => {
		if (!formName.trim()) {
			return;
		}
		setSaving(true);
		try {
			if (editing?.id) {
				await onUpdate({
					id: editing.id,
					name: formName.trim(),
					description: formDesc.trim() || undefined,
				});
			} else {
				await onCreate({
					name: formName.trim(),
					description: formDesc.trim() || undefined,
				});
			}
			onEdit(null);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Something went wrong";
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	};

	const handleArchive = async () => {
		if (!confirmArchive) {
			return;
		}
		try {
			await onArchive(confirmArchive.id);
			setConfirmArchive(null);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Cannot archive";
			toast.error(msg);
			setConfirmArchive(null);
		}
	};

	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>{plural}</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						{label}s define your organization structure. Archived{" "}
						{label.toLowerCase()}s are hidden from dropdowns but preserved for
						historical records.
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className={`btn btn-ghost btn-sm${showArchived ? "active" : ""}`}
						onClick={toggleArchived}
						style={showArchived ? { color: "var(--accent)" } : {}}
						type="button"
					>
						<Archive size={12} />
						{showArchived ? "Hide archived" : "Show archived"}
					</button>
					<button
						className="btn btn-primary btn-sm"
						onClick={startCreate}
						type="button"
					>
						<Plus size={12} />
						Add {label.toLowerCase()}
					</button>
				</div>
			</div>

			{/* Inline create/edit form */}
			{editing && (
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						padding: "12px 14px",
						marginBottom: 12,
						background: "var(--bg-3)",
						borderRadius: 12,
						border: "1px solid var(--line)",
					}}
				>
					<div style={{ flex: 1 }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Name
						</label>
						<input
							autoFocus
							className="input"
							onChange={(e) => setFormName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSave();
								}
								if (e.key === "Escape") {
									cancelEdit();
								}
							}}
							placeholder={`e.g., ${label === "Department" ? "Engineering" : label === "Work Type" ? "Remote" : "Full-time"}`}
							style={{ height: 34 }}
							value={formName}
						/>
					</div>
					{hasDescription && (
						<div style={{ flex: 1 }}>
							<label className="label" style={{ marginBottom: 4 }}>
								Description (optional)
							</label>
							<input
								className="input"
								onChange={(e) => setFormDesc(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleSave();
									}
									if (e.key === "Escape") {
										cancelEdit();
									}
								}}
								placeholder="Brief description"
								style={{ height: 34 }}
								value={formDesc}
							/>
						</div>
					)}
					<button
						className="btn btn-primary btn-sm"
						disabled={saving || !formName.trim()}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{editing.id ? "Save" : "Create"}
					</button>
					<button
						className="btn btn-ghost btn-sm"
						onClick={cancelEdit}
						type="button"
					>
						<X size={12} />
					</button>
				</div>
			)}

			{/* Table */}
			{isLoading ? (
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading…
				</div>
			) : items.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No {plural.toLowerCase()} configured yet. Add your first{" "}
						{label.toLowerCase()} to get started.
					</p>
				</div>
			) : (
				<table className="tbl">
					<thead>
						<tr>
							<th>Name</th>
							{hasDescription && <th>Description</th>}
							<th style={{ width: 100 }}>Status</th>
							<th style={{ width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{items.map((item) => (
							<tr key={item.id}>
								<td style={{ fontWeight: 500 }}>{item.name}</td>
								{hasDescription && (
									<td style={{ color: "var(--fg-3)", fontSize: "12.5px" }}>
										{item.description || "—"}
									</td>
								)}
								<td>
									<span
										className={`pill-status ${item.isActive ? "active" : "archived"}`}
									>
										<span className="badge-dot" />
										{item.isActive ? "Active" : "Archived"}
									</span>
								</td>
								<td>
									<div
										style={{
											display: "flex",
											gap: 4,
											justifyContent: "flex-end",
										}}
									>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => startEdit(item)}
											title="Edit"
											type="button"
										>
											<Edit size={12} />
										</button>
										{item.isActive ? (
											<button
												className="btn btn-ghost btn-sm"
												onClick={() =>
													onConfirmArchive({ id: item.id, name: item.name })
												}
												style={{ color: "var(--danger)" }}
												title="Archive"
												type="button"
											>
												<Archive size={12} />
											</button>
										) : (
											<button
												className="btn btn-ghost btn-sm"
												onClick={() => onArchive(item.id)}
												style={{ color: "var(--success)" }}
												title="Restore"
												type="button"
											>
												<Undo size={12} />
											</button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{/* Archive confirm */}
			{confirmArchive && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 200,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(8,9,12,0.6)",
					}}
				>
					<div
						style={{
							background: "var(--bg-2)",
							border: "1px solid var(--line)",
							borderRadius: 16,
							padding: "24px",
							maxWidth: 400,
							width: "100%",
						}}
					>
						<h4 style={{ marginBottom: 8 }}>Archive {confirmArchive.name}?</h4>
						<p
							style={{
								fontSize: "13px",
								color: "var(--fg-3)",
								marginBottom: 20,
							}}
						>
							Archived {label.toLowerCase()}s are hidden from dropdowns when
							adding employees, but preserved for historical records. You can
							restore it later.
						</p>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setConfirmArchive(null)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-sm"
								onClick={handleArchive}
								style={{
									background: "var(--danger-soft)",
									color: "var(--danger)",
								}}
								type="button"
							>
								Archive
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Position Section (needs department selector) ─────────

function PositionSection({
	editing,
	onEdit,
	showArchived,
	toggleArchived,
}: {
	editing: EditingItem | null;
	onEdit: (item: EditingItem | null) => void;
	showArchived: boolean;
	toggleArchived: () => void;
}) {
	const qc = useQueryClient();
	const { data: depts } = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data, isLoading } = useQuery(
		orpc.hrCore.jobPositions.list.queryOptions({
			input: { includeArchived: showArchived },
		})
	);
	const items =
		(data as {
			id: string;
			name: string;
			departmentId: string;
			description?: string | null;
			isActive: boolean;
		}[]) ?? [];
	const departments = (depts as { id: string; name: string }[]) ?? [];
	const deptMap = new Map(departments.map((d) => [d.id, d.name]));

	const [formName, setFormName] = useState("");
	const [formDept, setFormDept] = useState("");
	const [saving, setSaving] = useState(false);
	const [confirmArchive, setConfirmArchive] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const startCreate = () => {
		setFormName("");
		setFormDept(departments[0]?.id ?? "");
		onEdit({ name: "" });
	};
	const startEdit = (item: {
		id: string;
		name: string;
		departmentId: string;
	}) => {
		setFormName(item.name);
		setFormDept(item.departmentId);
		onEdit({ id: item.id, name: item.name, departmentId: item.departmentId });
	};

	const handleSave = async () => {
		if (!(formName.trim() && formDept)) {
			return;
		}
		setSaving(true);
		try {
			if (editing?.id) {
				await client.hrCore.jobPositions.update({
					id: editing.id,
					name: formName.trim(),
				});
			} else {
				await client.hrCore.jobPositions.create({
					departmentId: formDept,
					name: formName.trim(),
				});
			}
			qc.invalidateQueries();
			toast.success(editing?.id ? "Position updated" : "Position created");
			onEdit(null);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Job Positions</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						Positions are roles within departments (e.g., "Senior Engineer" in
						Engineering).
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className={`btn btn-ghost btn-sm${showArchived ? "active" : ""}`}
						onClick={toggleArchived}
						style={showArchived ? { color: "var(--accent)" } : {}}
						type="button"
					>
						<Archive size={12} />
						{showArchived ? "Hide archived" : "Show archived"}
					</button>
					<button
						className="btn btn-primary btn-sm"
						onClick={startCreate}
						type="button"
					>
						<Plus size={12} />
						Add position
					</button>
				</div>
			</div>

			{editing && (
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						padding: "12px 14px",
						marginBottom: 12,
						background: "var(--bg-3)",
						borderRadius: 12,
						border: "1px solid var(--line)",
					}}
				>
					<div style={{ flex: 1 }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Department
						</label>
						<select
							className="input"
							onChange={(e) => setFormDept(e.target.value)}
							style={{ height: 34 }}
							value={formDept}
						>
							<option value="">Select department…</option>
							{departments.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
					<div style={{ flex: 1 }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Position name
						</label>
						<input
							autoFocus
							className="input"
							onChange={(e) => setFormName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSave();
								}
								if (e.key === "Escape") {
									onEdit(null);
								}
							}}
							placeholder="e.g., Senior Engineer"
							style={{ height: 34 }}
							value={formName}
						/>
					</div>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving || !formName.trim() || !formDept}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{editing.id ? "Save" : "Create"}
					</button>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => onEdit(null)}
						type="button"
					>
						<X size={12} />
					</button>
				</div>
			)}

			{isLoading ? (
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading…
				</div>
			) : items.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No positions configured yet. Create departments first, then add
						positions.
					</p>
				</div>
			) : (
				<table className="tbl">
					<thead>
						<tr>
							<th>Position</th>
							<th>Department</th>
							<th style={{ width: 100 }}>Status</th>
							<th style={{ width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{items.map((item) => (
							<tr key={item.id}>
								<td style={{ fontWeight: 500 }}>{item.name}</td>
								<td style={{ color: "var(--fg-2)" }}>
									{deptMap.get(item.departmentId) ?? "—"}
								</td>
								<td>
									<span
										className={`pill-status ${item.isActive ? "active" : "archived"}`}
									>
										<span className="badge-dot" />
										{item.isActive ? "Active" : "Archived"}
									</span>
								</td>
								<td>
									<div
										style={{
											display: "flex",
											gap: 4,
											justifyContent: "flex-end",
										}}
									>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => startEdit(item)}
											title="Edit"
											type="button"
										>
											<Edit size={12} />
										</button>
										{item.isActive && (
											<button
												className="btn btn-ghost btn-sm"
												onClick={() =>
													setConfirmArchive({ id: item.id, name: item.name })
												}
												style={{ color: "var(--danger)" }}
												title="Archive"
												type="button"
											>
												<Archive size={12} />
											</button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{confirmArchive && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 200,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(8,9,12,0.6)",
					}}
				>
					<div
						style={{
							background: "var(--bg-2)",
							border: "1px solid var(--line)",
							borderRadius: 16,
							padding: 24,
							maxWidth: 400,
							width: "100%",
						}}
					>
						<h4 style={{ marginBottom: 8 }}>Archive {confirmArchive.name}?</h4>
						<p
							style={{
								fontSize: "13px",
								color: "var(--fg-3)",
								marginBottom: 20,
							}}
						>
							Archived positions are hidden from dropdowns but preserved for
							historical records.
						</p>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setConfirmArchive(null)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-sm"
								onClick={async () => {
									try {
										await client.hrCore.jobPositions.archive({
											id: confirmArchive.id,
										});
										qc.invalidateQueries();
										toast.success("Position archived");
									} catch (err: unknown) {
										toast.error(
											err instanceof Error ? err.message : "Cannot archive"
										);
									}
									setConfirmArchive(null);
								}}
								style={{
									background: "var(--danger-soft)",
									color: "var(--danger)",
								}}
								type="button"
							>
								Archive
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Role Section (needs position selector) ───────────────

function RoleSection({
	editing,
	onEdit,
	showArchived,
	toggleArchived,
}: {
	editing: EditingItem | null;
	onEdit: (item: EditingItem | null) => void;
	showArchived: boolean;
	toggleArchived: () => void;
}) {
	const qc = useQueryClient();
	const { data: positions } = useQuery(
		orpc.hrCore.jobPositions.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data, isLoading } = useQuery(
		orpc.hrCore.jobRoles.list.queryOptions({
			input: { includeArchived: showArchived },
		})
	);
	const items =
		(data as {
			id: string;
			name: string;
			jobPositionId: string;
			isActive: boolean;
		}[]) ?? [];
	const positionList = (positions as { id: string; name: string }[]) ?? [];
	const posMap = new Map(positionList.map((p) => [p.id, p.name]));

	const [formName, setFormName] = useState("");
	const [formPos, setFormPos] = useState("");
	const [saving, setSaving] = useState(false);

	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Job Roles</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						Roles are optional specializations within a position (e.g.,
						"Backend" within "Senior Engineer").
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className={`btn btn-ghost btn-sm${showArchived ? "active" : ""}`}
						onClick={toggleArchived}
						style={showArchived ? { color: "var(--accent)" } : {}}
						type="button"
					>
						<Archive size={12} />
						{showArchived ? "Hide archived" : "Show archived"}
					</button>
					<button
						className="btn btn-primary btn-sm"
						onClick={() => {
							setFormName("");
							setFormPos(positionList[0]?.id ?? "");
							onEdit({ name: "" });
						}}
						type="button"
					>
						<Plus size={12} />
						Add role
					</button>
				</div>
			</div>

			{editing && (
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						padding: "12px 14px",
						marginBottom: 12,
						background: "var(--bg-3)",
						borderRadius: 12,
						border: "1px solid var(--line)",
					}}
				>
					<div style={{ flex: 1 }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Position
						</label>
						<select
							className="input"
							onChange={(e) => setFormPos(e.target.value)}
							style={{ height: 34 }}
							value={formPos}
						>
							<option value="">Select position…</option>
							{positionList.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</div>
					<div style={{ flex: 1 }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Role name
						</label>
						<input
							autoFocus
							className="input"
							onChange={(e) => setFormName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && formName.trim() && formPos) {
									(async () => {
										setSaving(true);
										try {
											if (editing.id) {
												await client.hrCore.jobRoles.update({
													id: editing.id,
													name: formName.trim(),
												});
											} else {
												await client.hrCore.jobRoles.create({
													jobPositionId: formPos,
													name: formName.trim(),
												});
											}
											qc.invalidateQueries();
											toast.success(
												editing.id ? "Role updated" : "Role created"
											);
											onEdit(null);
										} catch (err: unknown) {
											toast.error(err instanceof Error ? err.message : "Error");
										} finally {
											setSaving(false);
										}
									})();
								}
								if (e.key === "Escape") {
									onEdit(null);
								}
							}}
							placeholder="e.g., Backend"
							style={{ height: 34 }}
							value={formName}
						/>
					</div>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving || !formName.trim() || !formPos}
						onClick={async () => {
							setSaving(true);
							try {
								if (editing.id) {
									await client.hrCore.jobRoles.update({
										id: editing.id,
										name: formName.trim(),
									});
								} else {
									await client.hrCore.jobRoles.create({
										jobPositionId: formPos,
										name: formName.trim(),
									});
								}
								qc.invalidateQueries();
								toast.success(editing.id ? "Role updated" : "Role created");
								onEdit(null);
							} catch (err: unknown) {
								toast.error(err instanceof Error ? err.message : "Error");
							} finally {
								setSaving(false);
							}
						}}
						type="button"
					>
						<Check size={12} />
						{editing.id ? "Save" : "Create"}
					</button>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => onEdit(null)}
						type="button"
					>
						<X size={12} />
					</button>
				</div>
			)}

			{isLoading ? (
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading…
				</div>
			) : items.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No roles configured. Roles are optional — add them to specialize
						positions.
					</p>
				</div>
			) : (
				<table className="tbl">
					<thead>
						<tr>
							<th>Role</th>
							<th>Position</th>
							<th style={{ width: 100 }}>Status</th>
							<th style={{ width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{items.map((item) => (
							<tr key={item.id}>
								<td style={{ fontWeight: 500 }}>{item.name}</td>
								<td style={{ color: "var(--fg-2)" }}>
									{posMap.get(item.jobPositionId) ?? "—"}
								</td>
								<td>
									<span
										className={`pill-status ${item.isActive ? "active" : "archived"}`}
									>
										<span className="badge-dot" />
										{item.isActive ? "Active" : "Archived"}
									</span>
								</td>
								<td>
									<div
										style={{
											display: "flex",
											gap: 4,
											justifyContent: "flex-end",
										}}
									>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => {
												setFormName(item.name);
												setFormPos(item.jobPositionId);
												onEdit({ id: item.id, name: item.name });
											}}
											title="Edit"
											type="button"
										>
											<Edit size={12} />
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

// ─── Shift Section ────────────────────────────────────────

function ShiftSection() {
	const { data, isLoading } = useQuery(
		orpc.hrCore.shifts.list.queryOptions({ input: { includeArchived: false } })
	);
	const shifts =
		(data as {
			id: string;
			name: string;
			weeklyFullTimeMinutes: number;
			isActive: boolean;
		}[]) ?? [];

	const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
	const { data: shiftDetail } = useQuery(
		orpc.hrCore.shifts.getById.queryOptions({
			input: { id: selectedShiftId ?? "" },
		})
	);

	const detail = shiftDetail as
		| {
				id: string;
				name: string;
				schedules: {
					dayOfWeek: number;
					startTime: string;
					endTime: string;
					minimumWorkMinutes: number;
					isNightShift: boolean;
				}[];
		  }
		| undefined;

	const dayNames = [
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
		"Sunday",
	];

	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Shifts</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						Shifts define when employees work. Each shift has a weekly schedule
						with start and end times per day.
					</p>
				</div>
			</div>

			{isLoading ? (
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading…
				</div>
			) : shifts.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No shifts configured yet.
					</p>
				</div>
			) : (
				<div style={{ display: "flex", gap: 16 }}>
					<div style={{ minWidth: 200 }}>
						{shifts.map((s) => (
							<button
								key={s.id}
								onClick={() => setSelectedShiftId(s.id)}
								style={{
									display: "block",
									width: "100%",
									padding: "10px 14px",
									textAlign: "left",
									border: "none",
									background:
										selectedShiftId === s.id ? "var(--bg-3)" : "transparent",
									borderRadius: 10,
									cursor: "pointer",
									fontSize: "13px",
									fontWeight: selectedShiftId === s.id ? 600 : 400,
									color: selectedShiftId === s.id ? "var(--fg)" : "var(--fg-2)",
									fontFamily: "inherit",
								}}
								type="button"
							>
								{s.name}
								<span
									style={{
										display: "block",
										fontSize: "11px",
										color: "var(--fg-3)",
										marginTop: 2,
									}}
								>
									{Math.round(s.weeklyFullTimeMinutes / 60)}h/week
								</span>
							</button>
						))}
					</div>

					<div style={{ flex: 1 }}>
						{selectedShiftId ? (
							detail?.schedules ? (
								<table className="tbl">
									<thead>
										<tr>
											<th>Day</th>
											<th>Start</th>
											<th>End</th>
											<th>Min Hours</th>
											<th>Night Shift</th>
										</tr>
									</thead>
									<tbody>
										{detail.schedules.map((sc) => (
											<tr key={sc.dayOfWeek}>
												<td style={{ fontWeight: 500 }}>
													{dayNames[sc.dayOfWeek] ?? `Day ${sc.dayOfWeek}`}
												</td>
												<td className="mono" style={{ color: "var(--fg-2)" }}>
													{sc.startTime}
												</td>
												<td className="mono" style={{ color: "var(--fg-2)" }}>
													{sc.endTime}
												</td>
												<td className="mono" style={{ color: "var(--fg-2)" }}>
													{Math.floor(sc.minimumWorkMinutes / 60)}h{" "}
													{sc.minimumWorkMinutes % 60}m
												</td>
												<td>
													{sc.isNightShift ? (
														<span className="badge badge-info">Night</span>
													) : (
														<span style={{ color: "var(--fg-4)" }}>—</span>
													)}
												</td>
											</tr>
										))}
										{detail.schedules.length === 0 && (
											<tr>
												<td
													colSpan={5}
													style={{ textAlign: "center", color: "var(--fg-3)" }}
												>
													No schedule configured for this shift.
												</td>
											</tr>
										)}
									</tbody>
								</table>
							) : (
								<div
									style={{
										padding: "40px 0",
										textAlign: "center",
										color: "var(--fg-3)",
										fontSize: "13px",
									}}
								>
									Loading schedule…
								</div>
							)
						) : (
							<div
								style={{
									padding: "40px 0",
									textAlign: "center",
									color: "var(--fg-3)",
									fontSize: "13px",
								}}
							>
								Select a shift to view its schedule.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Holiday Section (with country import) ────────────────

interface HolidayForm {
	endDate: string;
	id?: string;
	isRecurring: boolean;
	name: string;
	startDate: string;
}

function HolidaySection() {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery(
		orpc.hrCore.holidays.list.queryOptions({ input: {} })
	);
	// The API returns Date objects; this section treats holiday dates as date
	// strings (runtime-safe — new Date() accepts both). Cast via unknown per TS.
	const holidays =
		(data as unknown as {
			id: string;
			name: string;
			startDate: string;
			endDate: string | null;
			isRecurring: boolean;
		}[]) ?? [];

	const [editing, setEditing] = useState<HolidayForm | null>(null);
	const [saving, setSaving] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [showImport, setShowImport] = useState(false);

	const startCreate = () => {
		setEditing({ name: "", startDate: "", endDate: "", isRecurring: false });
	};

	const startEdit = (h: {
		id: string;
		name: string;
		startDate: string;
		endDate: string | null;
		isRecurring: boolean;
	}) => {
		const fmt = (d: string | null) => {
			if (!d) {
				return "";
			}
			try {
				return new Date(d).toISOString().slice(0, 10);
			} catch {
				return "";
			}
		};
		setEditing({
			id: h.id,
			name: h.name,
			startDate: fmt(h.startDate),
			endDate: fmt(h.endDate),
			isRecurring: h.isRecurring,
		});
	};

	const handleSave = async () => {
		if (!(editing && editing.name.trim() && editing.startDate)) {
			return;
		}
		if (editing.endDate && editing.endDate < editing.startDate) {
			toast.error("End date cannot be before start date.");
			return;
		}
		setSaving(true);
		try {
			if (editing.id) {
				await client.hrCore.holidays.update({
					id: editing.id,
					name: editing.name.trim(),
					startDate: editing.startDate,
					endDate: editing.endDate || undefined,
					isRecurring: editing.isRecurring,
				});
				toast.success("Holiday updated");
			} else {
				await client.hrCore.holidays.create({
					name: editing.name.trim(),
					startDate: editing.startDate,
					endDate: editing.endDate || undefined,
					isRecurring: editing.isRecurring,
				});
				toast.success("Holiday added");
			}
			qc.invalidateQueries();
			setEditing(null);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!confirmDelete) {
			return;
		}
		try {
			await client.hrCore.holidays.delete({ id: confirmDelete.id });
			qc.invalidateQueries();
			toast.success("Holiday removed");
			setConfirmDelete(null);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Could not delete");
			setConfirmDelete(null);
		}
	};

	const fmtDisplay = (d: string | null) => {
		if (!d) {
			return "—";
		}
		try {
			return new Date(d).toLocaleDateString("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
		} catch {
			return d;
		}
	};

	const existingDates = new Set(
		holidays.map((h) => {
			try {
				return new Date(h.startDate).toISOString().slice(0, 10);
			} catch {
				return "";
			}
		})
	);

	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Holidays</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						Public holidays affect leave calculations, attendance records, and
						payroll. Recurring holidays repeat every year automatically.
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className="btn btn-outline btn-sm"
						onClick={() => setShowImport(!showImport)}
						type="button"
					>
						<CalendarDays size={12} />
						{showImport ? "Close import" : "Import holidays"}
					</button>
					<button
						className="btn btn-primary btn-sm"
						onClick={startCreate}
						type="button"
					>
						<Plus size={12} />
						Add holiday
					</button>
				</div>
			</div>

			{showImport && (
				<HolidayImportPanel
					existingDates={existingDates}
					onComplete={() => {
						qc.invalidateQueries();
						setShowImport(false);
					}}
				/>
			)}

			{editing && (
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						flexWrap: "wrap",
						padding: "12px 14px",
						marginBottom: 12,
						background: "var(--bg-3)",
						borderRadius: 12,
						border: "1px solid var(--line)",
					}}
				>
					<div style={{ flex: "1 1 180px" }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Holiday name
						</label>
						<input
							autoFocus
							className="input"
							onChange={(e) => setEditing({ ...editing, name: e.target.value })}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSave();
								}
								if (e.key === "Escape") {
									setEditing(null);
								}
							}}
							placeholder="e.g., Independence Day"
							style={{ height: 34 }}
							value={editing.name}
						/>
					</div>
					<div style={{ flex: "0 0 150px" }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Starts
						</label>
						<input
							className="input"
							onChange={(e) =>
								setEditing({ ...editing, startDate: e.target.value })
							}
							style={{ height: 34 }}
							type="date"
							value={editing.startDate}
						/>
					</div>
					<div style={{ flex: "0 0 150px" }}>
						<label className="label" style={{ marginBottom: 4 }}>
							Ends (optional)
						</label>
						<input
							className="input"
							onChange={(e) =>
								setEditing({ ...editing, endDate: e.target.value })
							}
							style={{ height: 34 }}
							type="date"
							value={editing.endDate}
						/>
					</div>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontSize: "12.5px",
							color: "var(--fg-2)",
							cursor: "pointer",
							paddingBottom: 6,
						}}
					>
						<input
							checked={editing.isRecurring}
							onChange={(e) =>
								setEditing({ ...editing, isRecurring: e.target.checked })
							}
							style={{ accentColor: "var(--accent)" }}
							type="checkbox"
						/>
						Repeats every year
					</label>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving || !editing.name.trim() || !editing.startDate}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{editing.id ? "Save" : "Add"}
					</button>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => setEditing(null)}
						type="button"
					>
						<X size={12} />
					</button>
				</div>
			)}

			{isLoading ? (
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading…
				</div>
			) : holidays.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 48,
							height: 48,
							borderRadius: 12,
							background: "var(--bg-3)",
							color: "var(--fg-3)",
							margin: "0 auto 12px",
						}}
					>
						<CalendarDays size={22} />
					</div>
					<h4
						style={{
							fontSize: "15px",
							fontWeight: 600,
							color: "var(--fg)",
							marginBottom: 4,
						}}
					>
						No holidays set up yet
					</h4>
					<p
						style={{
							color: "var(--fg-3)",
							fontSize: "13px",
							maxWidth: 360,
							margin: "0 auto",
						}}
					>
						Add public holidays manually or import them for your country so time
						off, attendance, and payroll can calculate correctly.
					</p>
				</div>
			) : (
				<table className="tbl">
					<thead>
						<tr>
							<th>Holiday</th>
							<th>Start Date</th>
							<th>End Date</th>
							<th style={{ width: 100 }}>Recurring</th>
							<th style={{ width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{holidays.map((h) => (
							<tr key={h.id}>
								<td style={{ fontWeight: 500 }}>{h.name}</td>
								<td className="mono" style={{ color: "var(--fg-2)" }}>
									{fmtDisplay(h.startDate)}
								</td>
								<td className="mono" style={{ color: "var(--fg-2)" }}>
									{fmtDisplay(h.endDate)}
								</td>
								<td>
									{h.isRecurring ? (
										<span className="badge badge-accent">
											<span className="badge-dot" />
											Yearly
										</span>
									) : (
										<span style={{ color: "var(--fg-4)", fontSize: "12px" }}>
											One-time
										</span>
									)}
								</td>
								<td>
									<div
										style={{
											display: "flex",
											gap: 4,
											justifyContent: "flex-end",
										}}
									>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => startEdit(h)}
											title="Edit"
											type="button"
										>
											<Edit size={12} />
										</button>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() =>
												setConfirmDelete({ id: h.id, name: h.name })
											}
											style={{ color: "var(--danger)" }}
											title="Delete"
											type="button"
										>
											<Trash2 size={12} />
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{confirmDelete && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 200,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(8,9,12,0.6)",
					}}
				>
					<div
						style={{
							background: "var(--bg-2)",
							border: "1px solid var(--line)",
							borderRadius: 16,
							padding: "24px",
							maxWidth: 400,
							width: "100%",
						}}
					>
						<h4 style={{ marginBottom: 8 }}>Remove {confirmDelete.name}?</h4>
						<p
							style={{
								fontSize: "13px",
								color: "var(--fg-3)",
								marginBottom: 20,
							}}
						>
							This holiday will be permanently removed. Future leave and
							attendance calculations will no longer account for it.
						</p>
						<div
							style={{
								display: "flex",
								gap: 8,
								justifyContent: "flex-end",
							}}
						>
							<button
								className="btn btn-outline btn-sm"
								onClick={() => setConfirmDelete(null)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-sm"
								onClick={handleDelete}
								style={{
									background: "var(--danger-soft)",
									color: "var(--danger)",
								}}
								type="button"
							>
								Remove holiday
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Holiday Import Panel ─────────────────────────────────

function HolidayImportPanel({
	existingDates,
	onComplete,
}: {
	existingDates: Set<string>;
	onComplete: () => void;
}) {
	const currentYear = new Date().getFullYear();
	const [country, setCountry] = useState("");
	const [year, setYear] = useState(currentYear);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [importing, setImporting] = useState(false);

	const [suggestions, setSuggestions] = useState<HolidaySuggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const [nagerFailed, setNagerFailed] = useState(false);

	const countryInfo = SUPPORTED_COUNTRIES.find((c) => c.code === country);

	const loadHolidays = async (cc: string, yr: number) => {
		if (!cc) {
			return;
		}
		setLoading(true);
		setSuggestions([]);
		setSelected(new Set());
		setNagerFailed(false);
		try {
			const result = await fetchHolidays(cc, yr);
			setSuggestions(result.holidays);
			setNagerFailed(result.nagerFailed);
		} catch {
			setNagerFailed(true);
		} finally {
			setLoading(false);
		}
	};

	const toggleSelect = (idx: number) => {
		const next = new Set(selected);
		if (next.has(idx)) {
			next.delete(idx);
		} else {
			next.add(idx);
		}
		setSelected(next);
	};

	const selectAll = () => {
		const next = new Set<number>();
		for (const [i, s] of suggestions.entries()) {
			if (!existingDates.has(s.date)) {
				next.add(i);
			}
		}
		setSelected(next);
	};

	const handleImport = async () => {
		if (selected.size === 0) {
			return;
		}
		setImporting(true);
		let imported = 0;
		let skipped = 0;
		for (const idx of selected) {
			const s = suggestions[idx];
			if (!s || existingDates.has(s.date)) {
				skipped++;
				continue;
			}
			try {
				await client.hrCore.holidays.create({
					name: s.name,
					startDate: s.date,
					endDate: s.endDate,
					isRecurring: s.isRecurring,
				});
				imported++;
			} catch {
				skipped++;
			}
		}
		setImporting(false);
		if (imported > 0) {
			toast.success(`${imported} holiday${imported > 1 ? "s" : ""} imported`);
		}
		if (skipped > 0) {
			toast.info(`${skipped} skipped (already exist or failed)`);
		}
		onComplete();
	};

	return (
		<div
			style={{
				marginBottom: 16,
				padding: "16px",
				background: "var(--bg-3)",
				borderRadius: 12,
				border: "1px solid var(--line)",
			}}
		>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: 4 }}>
				Import public holidays
			</div>
			<p style={{ fontSize: "12px", color: "var(--fg-3)", marginBottom: 12 }}>
				Choose a country and year to load suggested holidays. Review and select
				which ones to import. Imported holidays can be edited or removed
				afterward.
			</p>

			<div
				style={{
					display: "flex",
					gap: 8,
					alignItems: "flex-end",
					flexWrap: "wrap",
					marginBottom: 16,
				}}
			>
				<div style={{ flex: "1 1 200px" }}>
					<label className="label" style={{ marginBottom: 4 }}>
						Choose country
					</label>
					<select
						className="input"
						onChange={(e) => {
							const cc = e.target.value;
							setCountry(cc);
							if (cc) {
								loadHolidays(cc, year);
							}
						}}
						style={{ height: 34 }}
						value={country}
					>
						<option value="">Select a country…</option>
						{SUPPORTED_COUNTRIES.map((c) => (
							<option key={c.code} value={c.code}>
								{c.flag} {c.name}
							</option>
						))}
					</select>
				</div>
				<div style={{ flex: "0 0 120px" }}>
					<label className="label" style={{ marginBottom: 4 }}>
						Choose year
					</label>
					<select
						className="input"
						onChange={(e) => {
							const yr = Number(e.target.value);
							setYear(yr);
							if (country) {
								loadHolidays(country, yr);
							}
						}}
						style={{ height: 34 }}
						value={year}
					>
						{AVAILABLE_YEARS.map((y) => (
							<option key={y} value={y}>
								{y}
							</option>
						))}
					</select>
				</div>
			</div>

			{loading && (
				<div
					style={{
						padding: "24px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading holidays for {countryInfo?.name ?? country}…
				</div>
			)}

			{nagerFailed && !loading && (
				<div
					style={{
						padding: "12px 14px",
						marginBottom: 12,
						background: "var(--warning-soft)",
						borderRadius: 10,
						fontSize: "12.5px",
						color: "var(--warning)",
					}}
				>
					Could not load holidays from the public calendar. Showing locally
					known holidays only. You can also add holidays manually.
				</div>
			)}

			{!loading && country && suggestions.length === 0 && (
				<p
					style={{
						fontSize: "12.5px",
						color: "var(--fg-3)",
						padding: "16px 0",
					}}
				>
					No holiday data available for {countryInfo?.name ?? country} in {year}
					. Try a different year, or add holidays manually.
				</p>
			)}

			{suggestions.length > 0 && (
				<>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 8,
						}}
					>
						<span style={{ fontSize: "12px", color: "var(--fg-3)" }}>
							{suggestions.length} holidays found · {selected.size} selected
						</span>
						<button
							className="btn btn-ghost btn-sm"
							onClick={selectAll}
							type="button"
						>
							Select all new
						</button>
					</div>
					<div
						style={{
							maxHeight: 320,
							overflowY: "auto",
							border: "1px solid var(--line)",
							borderRadius: 10,
							background: "var(--bg-2)",
						}}
					>
						<table className="tbl">
							<thead>
								<tr>
									<th style={{ width: 36 }} />
									<th>Holiday</th>
									<th>Date</th>
									<th style={{ width: 90 }}>Status</th>
								</tr>
							</thead>
							<tbody>
								{suggestions.map((s, i) => {
									const isDup = existingDates.has(s.date);
									return (
										<tr key={i} style={{ opacity: isDup ? 0.5 : 1 }}>
											<td style={{ paddingRight: 0 }}>
												<input
													checked={selected.has(i)}
													disabled={isDup}
													onChange={() => toggleSelect(i)}
													style={{
														accentColor: "var(--accent)",
													}}
													type="checkbox"
												/>
											</td>
											<td style={{ fontWeight: 500 }}>{s.name}</td>
											<td
												className="mono"
												style={{
													color: "var(--fg-2)",
													fontSize: "12px",
												}}
											>
												{s.date}
											</td>
											<td>
												{isDup ? (
													<span
														className="badge"
														style={{
															fontSize: "11px",
														}}
													>
														Already added
													</span>
												) : s.isRecurring ? (
													<span
														style={{
															fontSize: "11px",
															color: "var(--fg-3)",
														}}
													>
														Yearly
													</span>
												) : (
													<span
														style={{
															fontSize: "11px",
															color: "var(--fg-4)",
														}}
													>
														One-time
													</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							gap: 8,
							marginTop: 12,
						}}
					>
						<button
							className="btn btn-outline btn-sm"
							onClick={() => {
								setCountry("");
								setSelected(new Set());
							}}
							type="button"
						>
							Cancel
						</button>
						<button
							className="btn btn-primary btn-sm"
							disabled={importing || selected.size === 0}
							onClick={handleImport}
							type="button"
						>
							<Check size={12} />
							{importing
								? "Importing…"
								: `Import ${selected.size} holiday${selected.size === 1 ? "" : "s"}`}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
