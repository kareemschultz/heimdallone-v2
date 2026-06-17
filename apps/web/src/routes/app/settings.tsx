// biome-ignore-all lint/correctness/useHookAtTopLevel: `listHook` is a render-prop that SettingSection invokes as a hook at the top of its own render — the rule can't see through the prop indirection
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large multi-tab Organization Settings page; each tab section is independently simple
// biome-ignore-all lint/style/noNestedTernary: idiomatic loading/empty/data render branches across many tab sections; follow-up to extract to a shared <ListState> wrapper
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
	History,
	MapPin,
	Palette,
	Plus,
	Trash2,
	Undo,
	Users,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import {
	AVAILABLE_YEARS,
	fetchHolidays,
	type HolidaySuggestion,
	SUPPORTED_COUNTRIES,
} from "@/lib/holiday-providers";
import {
	canManageBranding,
	canManageGeofencing,
	canViewAuditLog,
	canViewGeofencing,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
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
	| "holidays"
	| "branding"
	| "workLocations"
	| "auditLog";

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
	const org = useContext(OrgCtx);
	const role = org.memberRole;

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
		// Settings Depth (Phase 22). Branding read is universal; Work Locations
		// follows the geofence view grant; Audit Log follows audit_log:read.
		{ key: "branding", label: "Branding", icon: <Palette size={13} /> },
		...(canViewGeofencing(role)
			? [
					{
						key: "workLocations" as const,
						label: "Work Locations",
						icon: <MapPin size={13} />,
					},
				]
			: []),
		...(canViewAuditLog(role)
			? [
					{
						key: "auditLog" as const,
						label: "Audit Log",
						icon: <History size={13} />,
					},
				]
			: []),
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
						role="tab"
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
						if (!item.id) {
							return;
						}
						await client.hrCore.departments.update({
							id: item.id,
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
						if (!item.id) {
							return;
						}
						await client.hrCore.workTypes.update({
							id: item.id,
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
						if (!item.id) {
							return;
						}
						await client.hrCore.employeeTypes.update({
							id: item.id,
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

			{tab === "branding" && (
				<BrandingSection canManage={canManageBranding(role)} />
			)}

			{tab === "workLocations" && (
				<WorkLocationsSection canManage={canManageGeofencing(role)} />
			)}

			{tab === "auditLog" && <AuditLogSection />}
		</div>
	);
}

// ─── Generic Setting Section ──────────────────────────────

function settingFieldExample(label: string): string {
	if (label === "Department") {
		return "Engineering";
	}
	if (label === "Work Type") {
		return "Remote";
	}
	return "Full-time";
}

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
			<div className="card-head-row">
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
						<label
							className="label"
							htmlFor="setting-name"
							style={{ marginBottom: 4 }}
						>
							Name
						</label>
						<input
							autoFocus
							className="input"
							id="setting-name"
							onChange={(e) => setFormName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSave();
								}
								if (e.key === "Escape") {
									cancelEdit();
								}
							}}
							placeholder={`e.g., ${settingFieldExample(label)}`}
							style={{ height: 34 }}
							value={formName}
						/>
					</div>
					{hasDescription && (
						<div style={{ flex: 1 }}>
							<label
								className="label"
								htmlFor="setting-desc"
								style={{ marginBottom: 4 }}
							>
								Description (optional)
							</label>
							<input
								className="input"
								id="setting-desc"
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
			{isLoading && (
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
			)}
			{!isLoading && items.length === 0 && (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No {plural.toLowerCase()} configured yet. Add your first{" "}
						{label.toLowerCase()} to get started.
					</p>
				</div>
			)}
			{!isLoading && items.length > 0 && (
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
			<div className="card-head-row">
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
						<label
							className="label"
							htmlFor="position-dept"
							style={{ marginBottom: 4 }}
						>
							Department
						</label>
						<select
							className="input"
							id="position-dept"
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
						<label
							className="label"
							htmlFor="position-name"
							style={{ marginBottom: 4 }}
						>
							Position name
						</label>
						<input
							autoFocus
							className="input"
							id="position-name"
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

			{isLoading && (
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
			)}
			{!isLoading && items.length === 0 && (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No positions configured yet. Create departments first, then add
						positions.
					</p>
				</div>
			)}
			{!isLoading && items.length > 0 && (
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
			<div className="card-head-row">
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
						<label
							className="label"
							htmlFor="role-position"
							style={{ marginBottom: 4 }}
						>
							Position
						</label>
						<select
							className="input"
							id="role-position"
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
						<label
							className="label"
							htmlFor="role-name"
							style={{ marginBottom: 4 }}
						>
							Role name
						</label>
						<input
							autoFocus
							className="input"
							id="role-name"
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

			{isLoading && (
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
			)}
			{!isLoading && items.length === 0 && (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No roles configured. Roles are optional — add them to specialize
						positions.
					</p>
				</div>
			)}
			{!isLoading && items.length > 0 && (
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
			<div className="card-head-row">
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
		if (!(editing?.name.trim() && editing?.startDate)) {
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
			<div className="card-head-row">
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
						<label
							className="label"
							htmlFor="holiday-name"
							style={{ marginBottom: 4 }}
						>
							Holiday name
						</label>
						<input
							autoFocus
							className="input"
							id="holiday-name"
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
						<label
							className="label"
							htmlFor="holiday-start"
							style={{ marginBottom: 4 }}
						>
							Starts
						</label>
						<input
							className="input"
							id="holiday-start"
							onChange={(e) =>
								setEditing({ ...editing, startDate: e.target.value })
							}
							style={{ height: 34 }}
							type="date"
							value={editing.startDate}
						/>
					</div>
					<div style={{ flex: "0 0 150px" }}>
						<label
							className="label"
							htmlFor="holiday-end"
							style={{ marginBottom: 4 }}
						>
							Ends (optional)
						</label>
						<input
							className="input"
							id="holiday-end"
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
					<label
						className="label"
						htmlFor="import-country"
						style={{ marginBottom: 4 }}
					>
						Choose country
					</label>
					<select
						className="input"
						id="import-country"
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
					<label
						className="label"
						htmlFor="import-year"
						style={{ marginBottom: 4 }}
					>
						Choose year
					</label>
					<select
						className="input"
						id="import-year"
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
										<tr
											key={`${s.date}-${s.name}`}
											style={{ opacity: isDup ? 0.5 : 1 }}
										>
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

// ─── Branding Section (Phase 22 / Settings Depth) ─────────

interface BrandingForm {
	addressLine1: string;
	addressLine2: string;
	addressLine3: string;
	brandColorHex: string;
	displayName: string;
	email: string;
	footerNote: string;
	logoUrl: string;
	payslipShowAttendance: boolean;
	payslipShowHours: boolean;
	payslipShowNis: boolean;
	payslipTemplate: "classic" | "modern" | "compact";
	phone: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Shared loading / error placeholder for the Settings Depth sections. Returns
// null when neither state applies (so the caller renders its real content),
// keeping the loading/error/empty branches out of nested JSX ternaries.
function ListStatePlaceholder({
	isLoading,
	isError,
	errorMessage,
}: {
	errorMessage: string;
	isError: boolean;
	isLoading: boolean;
}): React.ReactNode {
	if (isLoading) {
		return (
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
		);
	}
	if (isError) {
		return (
			<p
				style={{
					padding: "24px 0",
					color: "var(--danger)",
					fontSize: "13px",
					textAlign: "center",
				}}
			>
				{errorMessage}
			</p>
		);
	}
	return null;
}

const PAYSLIP_TEMPLATES: {
	key: "classic" | "modern" | "compact";
	label: string;
}[] = [
	{ key: "classic", label: "Classic" },
	{ key: "modern", label: "Modern" },
	{ key: "compact", label: "Compact" },
];

function BrandingSection({ canManage }: { canManage: boolean }) {
	const qc = useQueryClient();
	const { data, isLoading, isError } = useQuery(
		orpc.branding.get.queryOptions({ input: undefined })
	);
	const branding = data as
		| {
				addressLine1: string | null;
				addressLine2: string | null;
				addressLine3: string | null;
				brandColorHex: string | null;
				displayName: string | null;
				email: string | null;
				footerNote: string | null;
				logoUrl: string | null;
				logoDataUri: string | null;
				organizationName: string;
				payslipShowAttendance: boolean;
				payslipShowHours: boolean;
				payslipShowNis: boolean;
				payslipTemplate: "classic" | "modern" | "compact";
				phone: string | null;
				resolvedDisplayName: string;
		  }
		| undefined;

	const [form, setForm] = useState<BrandingForm | null>(null);
	const [saving, setSaving] = useState(false);

	// Initialise the editable form once data arrives (without an effect: derive
	// from a one-time seed keyed on the loaded row).
	const seeded = form !== null;
	if (branding && !seeded) {
		setForm({
			addressLine1: branding.addressLine1 ?? "",
			addressLine2: branding.addressLine2 ?? "",
			addressLine3: branding.addressLine3 ?? "",
			brandColorHex: branding.brandColorHex ?? "",
			displayName: branding.displayName ?? "",
			email: branding.email ?? "",
			footerNote: branding.footerNote ?? "",
			logoUrl: branding.logoUrl ?? "",
			payslipShowAttendance: branding.payslipShowAttendance,
			payslipShowHours: branding.payslipShowHours,
			payslipShowNis: branding.payslipShowNis,
			payslipTemplate: branding.payslipTemplate,
			phone: branding.phone ?? "",
		});
	}

	const save = async (patch: Partial<BrandingForm>) => {
		setSaving(true);
		try {
			await client.branding.update(
				patch as Parameters<typeof client.branding.update>[0]
			);
			qc.invalidateQueries();
			toast.success("Branding saved");
		} catch (err: unknown) {
			toast.error(
				err instanceof Error ? err.message : "Could not save branding"
			);
		} finally {
			setSaving(false);
		}
	};

	if (isLoading || !(branding && form)) {
		return (
			<div className="card card-pad">
				<div
					style={{
						padding: "40px 0",
						textAlign: "center",
						color: "var(--fg-3)",
						fontSize: "13px",
					}}
				>
					Loading branding…
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="card card-pad">
				<p style={{ color: "var(--danger)", fontSize: "13px" }}>
					Could not load branding. Please refresh.
				</p>
			</div>
		);
	}

	const previewColor =
		form.brandColorHex && HEX_COLOR_RE.test(form.brandColorHex)
			? form.brandColorHex
			: "var(--primary)";

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			{/* Company identity */}
			<div className="card card-pad">
				<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Company identity</h4>
				<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
					Shown in the app sidebar and on payslip / email headers. Falls back to
					your workspace name ({branding.organizationName}) when left blank.
				</p>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
						gap: 12,
						marginTop: 14,
					}}
				>
					<BrandingField
						label="Display name"
						onChange={(v) => setForm({ ...form, displayName: v })}
						placeholder={branding.organizationName}
						readOnly={!canManage}
						value={form.displayName}
					/>
					<BrandingField
						label="Phone"
						onChange={(v) => setForm({ ...form, phone: v })}
						readOnly={!canManage}
						value={form.phone}
					/>
					<BrandingField
						label="Email"
						onChange={(v) => setForm({ ...form, email: v })}
						readOnly={!canManage}
						value={form.email}
					/>
					<BrandingField
						label="Address line 1"
						onChange={(v) => setForm({ ...form, addressLine1: v })}
						readOnly={!canManage}
						value={form.addressLine1}
					/>
					<BrandingField
						label="Address line 2"
						onChange={(v) => setForm({ ...form, addressLine2: v })}
						readOnly={!canManage}
						value={form.addressLine2}
					/>
					<BrandingField
						label="Address line 3"
						onChange={(v) => setForm({ ...form, addressLine3: v })}
						readOnly={!canManage}
						value={form.addressLine3}
					/>
				</div>
				<div style={{ marginTop: 12 }}>
					<label className="label" htmlFor="branding-footer">
						Payslip footer note
					</label>
					<input
						className="input"
						disabled={!canManage}
						id="branding-footer"
						onChange={(e) => setForm({ ...form, footerNote: e.target.value })}
						placeholder="e.g., Thank you for your service."
						value={form.footerNote}
					/>
				</div>
				{canManage && (
					<div style={{ marginTop: 14 }}>
						<button
							className="btn btn-primary btn-sm"
							disabled={saving}
							onClick={() =>
								save({
									displayName: form.displayName,
									phone: form.phone,
									email: form.email,
									addressLine1: form.addressLine1,
									addressLine2: form.addressLine2,
									addressLine3: form.addressLine3,
									footerNote: form.footerNote,
								})
							}
							type="button"
						>
							<Check size={12} />
							Save details
						</button>
					</div>
				)}
			</div>

			{/* Logo */}
			<div className="card card-pad">
				<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Logo</h4>
				<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
					Paste a logo URL. Uploads are stored inline for now, so large logos
					should use a URL.
				</p>
				<div
					style={{
						display: "flex",
						gap: 16,
						alignItems: "flex-end",
						marginTop: 14,
					}}
				>
					<div style={{ flex: 1 }}>
						<label className="label" htmlFor="branding-logo-url">
							Logo URL
						</label>
						<input
							className="input"
							disabled={!canManage}
							id="branding-logo-url"
							onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
							placeholder="https://…/logo.png"
							value={form.logoUrl}
						/>
					</div>
					<div
						style={{
							width: 64,
							height: 64,
							borderRadius: 12,
							border: "1px solid var(--line)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
							background: "var(--bg-3)",
						}}
					>
						{form.logoUrl ? (
							// biome-ignore lint/correctness/useImageSize: logo preview is constrained by its fixed-size container (maxWidth/maxHeight), not intrinsic dimensions
							<img
								alt="Company logo preview"
								src={form.logoUrl}
								style={{ maxWidth: "100%", maxHeight: "100%" }}
							/>
						) : (
							<span style={{ color: "var(--fg-4)", fontSize: "11px" }}>
								No logo
							</span>
						)}
					</div>
				</div>
				{canManage && (
					<div style={{ marginTop: 14 }}>
						<button
							className="btn btn-primary btn-sm"
							disabled={saving}
							onClick={() => save({ logoUrl: form.logoUrl })}
							type="button"
						>
							<Check size={12} />
							Save logo
						</button>
					</div>
				)}
			</div>

			{/* Brand colour */}
			<div className="card card-pad">
				<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Brand colour</h4>
				<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
					A hex accent (e.g., #1f3a5f) applied to the sidebar accent and future
					payslip / email headers.
				</p>
				<div
					style={{
						display: "flex",
						gap: 12,
						alignItems: "flex-end",
						marginTop: 14,
					}}
				>
					<div>
						<label className="label" htmlFor="branding-color">
							Colour
						</label>
						<input
							aria-label="Brand colour picker"
							disabled={!canManage}
							id="branding-color"
							onChange={(e) =>
								setForm({ ...form, brandColorHex: e.target.value })
							}
							type="color"
							value={
								HEX_COLOR_RE.test(form.brandColorHex)
									? form.brandColorHex
									: "#1f3a5f"
							}
						/>
					</div>
					<div style={{ width: 140 }}>
						<label className="label" htmlFor="branding-color-hex">
							Hex
						</label>
						<input
							className="input"
							disabled={!canManage}
							id="branding-color-hex"
							onChange={(e) =>
								setForm({ ...form, brandColorHex: e.target.value })
							}
							placeholder="#1f3a5f"
							value={form.brandColorHex}
						/>
					</div>
					<div
						aria-hidden="true"
						style={{
							width: 80,
							height: 34,
							borderRadius: 8,
							background: previewColor,
							border: "1px solid var(--line)",
						}}
					/>
				</div>
				{canManage && (
					<div style={{ marginTop: 14 }}>
						<button
							className="btn btn-primary btn-sm"
							disabled={saving}
							onClick={() => save({ brandColorHex: form.brandColorHex })}
							type="button"
						>
							<Check size={12} />
							Save colour
						</button>
					</div>
				)}
			</div>

			{/* Payslip template + display settings */}
			<div className="card card-pad">
				<h4 style={{ fontSize: "15px", fontWeight: 600 }}>
					Payslip presentation
				</h4>
				<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
					Applies when payslips are generated. The preview below is a sample
					layout — not live employee data.
				</p>
				<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
					{PAYSLIP_TEMPLATES.map((t) => (
						<button
							aria-pressed={form.payslipTemplate === t.key}
							className={`btn btn-sm ${form.payslipTemplate === t.key ? "btn-primary" : "btn-outline"}`}
							disabled={!canManage}
							key={t.key}
							onClick={() => canManage && save({ payslipTemplate: t.key })}
							type="button"
						>
							{t.label}
						</button>
					))}
				</div>
				<div
					style={{
						marginTop: 14,
						padding: 16,
						borderRadius: 12,
						border: "1px dashed var(--line)",
						background: "var(--bg-3)",
						fontSize: "12px",
						color: "var(--fg-3)",
					}}
				>
					<strong style={{ color: "var(--fg-2)" }}>
						Sample payslip — {form.payslipTemplate}
					</strong>
					<div style={{ marginTop: 6 }}>
						{form.displayName || branding.organizationName} · Sample Employee ·
						Net pay (demo)
					</div>
				</div>
				<div
					style={{
						marginTop: 16,
						display: "flex",
						flexDirection: "column",
						gap: 10,
					}}
				>
					<BrandingToggle
						checked={form.payslipShowAttendance}
						disabled={!canManage}
						label="Show attendance summary"
						onChange={(v) => {
							setForm({ ...form, payslipShowAttendance: v });
							if (canManage) {
								save({ payslipShowAttendance: v });
							}
						}}
					/>
					<BrandingToggle
						checked={form.payslipShowHours}
						disabled={!canManage}
						label="Show hours worked"
						onChange={(v) => {
							setForm({ ...form, payslipShowHours: v });
							if (canManage) {
								save({ payslipShowHours: v });
							}
						}}
					/>
					<BrandingToggle
						checked={form.payslipShowNis}
						disabled={!canManage}
						label="Show NIS number (masked)"
						onChange={(v) => {
							setForm({ ...form, payslipShowNis: v });
							if (canManage) {
								save({ payslipShowNis: v });
							}
						}}
					/>
				</div>
			</div>
		</div>
	);
}

function BrandingField({
	label,
	value,
	placeholder,
	readOnly,
	onChange,
}: {
	label: string;
	onChange: (v: string) => void;
	placeholder?: string;
	readOnly?: boolean;
	value: string;
}) {
	const id = `branding-${label.replace(/\s+/g, "-").toLowerCase()}`;
	return (
		<div>
			<label className="label" htmlFor={id}>
				{label}
			</label>
			<input
				className="input"
				disabled={readOnly}
				id={id}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				value={value}
			/>
		</div>
	);
}

function BrandingToggle({
	label,
	checked,
	disabled,
	onChange,
}: {
	checked: boolean;
	disabled?: boolean;
	label: string;
	onChange: (v: boolean) => void;
}) {
	return (
		<label
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: "13px",
				color: "var(--fg-2)",
				cursor: disabled ? "default" : "pointer",
			}}
		>
			<input
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
				style={{ accentColor: "var(--accent)" }}
				type="checkbox"
			/>
			{label}
		</label>
	);
}

// ─── Work Locations Section (Phase 22 / Settings Depth) ───
// Surfaces the existing geofence_location table (NOT a new table). Create / edit
// / archive go through orpc.biometric.geofences.*.

interface WorkLocationForm {
	address: string;
	id?: string;
	latitude: string;
	locationType: "office" | "site" | "remote" | "warehouse" | "other";
	longitude: string;
	name: string;
	radiusMeters: string;
}

const LOCATION_TYPES: {
	key: "office" | "site" | "remote" | "warehouse" | "other";
	label: string;
}[] = [
	{ key: "office", label: "Office" },
	{ key: "site", label: "Site" },
	{ key: "remote", label: "Remote" },
	{ key: "warehouse", label: "Warehouse" },
	{ key: "other", label: "Other" },
];

const LOCATION_TYPE_LABEL: Record<string, string> = {
	office: "Office",
	site: "Site",
	remote: "Remote",
	warehouse: "Warehouse",
	other: "Other",
};

function WorkLocationsSection({ canManage }: { canManage: boolean }) {
	const qc = useQueryClient();
	const [showArchived, setShowArchived] = useState(false);
	const { data, isLoading, isError } = useQuery(
		orpc.biometric.geofences.list.queryOptions({
			input: { includeArchived: showArchived },
		})
	);
	const locations =
		(data as {
			address: string | null;
			deletedAt: string | null;
			id: string;
			isActive: boolean;
			latitude: string | null;
			locationType: string;
			longitude: string | null;
			name: string;
			radiusMeters: number;
		}[]) ?? [];

	const [editing, setEditing] = useState<WorkLocationForm | null>(null);
	const [saving, setSaving] = useState(false);
	const [confirmArchive, setConfirmArchive] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const startCreate = () =>
		setEditing({
			name: "",
			address: "",
			locationType: "office",
			latitude: "",
			longitude: "",
			radiusMeters: "200",
		});

	const startEdit = (loc: (typeof locations)[number]) =>
		setEditing({
			id: loc.id,
			name: loc.name,
			address: loc.address ?? "",
			locationType:
				(loc.locationType as WorkLocationForm["locationType"]) ?? "office",
			latitude: loc.latitude ?? "",
			longitude: loc.longitude ?? "",
			radiusMeters: String(loc.radiusMeters),
		});

	const handleSave = async () => {
		if (!editing?.name.trim()) {
			return;
		}
		const radius = Number(editing.radiusMeters) || 200;
		const lat = editing.latitude.trim() ? Number(editing.latitude) : undefined;
		const lon = editing.longitude.trim()
			? Number(editing.longitude)
			: undefined;
		setSaving(true);
		try {
			if (editing.id) {
				await client.biometric.geofences.update({
					id: editing.id,
					name: editing.name.trim(),
					address: editing.address.trim() || null,
					locationType: editing.locationType,
					radiusMeters: radius,
					...(lat === undefined ? {} : { latitude: lat }),
					...(lon === undefined ? {} : { longitude: lon }),
				});
				toast.success("Work location updated");
			} else {
				await client.biometric.geofences.create({
					name: editing.name.trim(),
					address: editing.address.trim() || undefined,
					locationType: editing.locationType,
					radiusMeters: radius,
					latitude: lat ?? 0,
					longitude: lon ?? 0,
				});
				toast.success("Work location created");
			}
			qc.invalidateQueries();
			setEditing(null);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Could not save");
		} finally {
			setSaving(false);
		}
	};

	const handleArchive = async () => {
		if (!confirmArchive) {
			return;
		}
		try {
			await client.biometric.geofences.archive({ id: confirmArchive.id });
			qc.invalidateQueries();
			toast.success("Work location archived");
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "Could not archive");
		}
		setConfirmArchive(null);
	};

	return (
		<div className="card card-pad">
			<div className="card-head-row">
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Work Locations</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						Named GPS work sites used for clock-in radius validation and device
						assignment. Employees clocking in outside the radius are flagged
						unless GPS enforcement is disabled.
					</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => setShowArchived((v) => !v)}
						style={showArchived ? { color: "var(--accent)" } : {}}
						type="button"
					>
						<Archive size={12} />
						{showArchived ? "Hide archived" : "Show archived"}
					</button>
					{canManage && (
						<button
							className="btn btn-primary btn-sm"
							onClick={startCreate}
							type="button"
						>
							<Plus size={12} />
							Add location
						</button>
					)}
				</div>
			</div>

			{editing && canManage && (
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
					<div style={{ flex: "1 1 160px" }}>
						<label className="label" htmlFor="wl-name">
							Name
						</label>
						<input
							autoFocus
							className="input"
							id="wl-name"
							onChange={(e) => setEditing({ ...editing, name: e.target.value })}
							placeholder="e.g., Head Office"
							style={{ height: 34 }}
							value={editing.name}
						/>
					</div>
					<div style={{ flex: "1 1 160px" }}>
						<label className="label" htmlFor="wl-address">
							Address
						</label>
						<input
							className="input"
							id="wl-address"
							onChange={(e) =>
								setEditing({ ...editing, address: e.target.value })
							}
							placeholder="Street, city"
							style={{ height: 34 }}
							value={editing.address}
						/>
					</div>
					<div style={{ flex: "0 0 130px" }}>
						<label className="label" htmlFor="wl-type">
							Type
						</label>
						<select
							className="input"
							id="wl-type"
							onChange={(e) =>
								setEditing({
									...editing,
									locationType: e.target
										.value as WorkLocationForm["locationType"],
								})
							}
							style={{ height: 34 }}
							value={editing.locationType}
						>
							{LOCATION_TYPES.map((t) => (
								<option key={t.key} value={t.key}>
									{t.label}
								</option>
							))}
						</select>
					</div>
					<div style={{ flex: "0 0 110px" }}>
						<label className="label" htmlFor="wl-lat">
							Latitude
						</label>
						<input
							className="input"
							id="wl-lat"
							onChange={(e) =>
								setEditing({ ...editing, latitude: e.target.value })
							}
							placeholder="6.8013"
							style={{ height: 34 }}
							value={editing.latitude}
						/>
					</div>
					<div style={{ flex: "0 0 110px" }}>
						<label className="label" htmlFor="wl-lon">
							Longitude
						</label>
						<input
							className="input"
							id="wl-lon"
							onChange={(e) =>
								setEditing({ ...editing, longitude: e.target.value })
							}
							placeholder="-58.1551"
							style={{ height: 34 }}
							value={editing.longitude}
						/>
					</div>
					<div style={{ flex: "0 0 100px" }}>
						<label className="label" htmlFor="wl-radius">
							Radius (m)
						</label>
						<input
							className="input"
							id="wl-radius"
							onChange={(e) =>
								setEditing({ ...editing, radiusMeters: e.target.value })
							}
							style={{ height: 34 }}
							type="number"
							value={editing.radiusMeters}
						/>
					</div>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving || !editing.name.trim()}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{editing.id ? "Save" : "Create"}
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

			<ListStatePlaceholder
				errorMessage="Could not load work locations. Please refresh."
				isError={isError}
				isLoading={isLoading}
			/>

			{!(isLoading || isError) && locations.length === 0 && (
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
						<MapPin size={22} />
					</div>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No work locations set up yet. Add a GPS site so attendance clock-ins
						can be validated.
					</p>
				</div>
			)}

			{!(isLoading || isError) && locations.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>Name</th>
							<th>Type</th>
							<th>Coordinates</th>
							<th style={{ width: 90 }}>Radius</th>
							<th style={{ width: 100 }}>Status</th>
							<th style={{ width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{locations.map((loc) => (
							<WorkLocationRow
								canManage={canManage}
								key={loc.id}
								loc={loc}
								onArchive={() =>
									setConfirmArchive({ id: loc.id, name: loc.name })
								}
								onEdit={() => startEdit(loc)}
							/>
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
							Existing punch records that reference this location are not
							affected. The site is hidden from new device assignments.
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

interface WorkLocationRowData {
	address: string | null;
	deletedAt: string | null;
	id: string;
	isActive: boolean;
	latitude: string | null;
	locationType: string;
	longitude: string | null;
	name: string;
	radiusMeters: number;
}

function WorkLocationRow({
	loc,
	canManage,
	onEdit,
	onArchive,
}: {
	canManage: boolean;
	loc: WorkLocationRowData;
	onArchive: () => void;
	onEdit: () => void;
}) {
	const archived = Boolean(loc.deletedAt) || !loc.isActive;
	const coords =
		loc.latitude && loc.longitude
			? `${loc.latitude}, ${loc.longitude}`
			: "No GPS coords set";
	return (
		<tr style={{ opacity: archived ? 0.55 : 1 }}>
			<td>
				<div style={{ fontWeight: 500 }}>{loc.name}</div>
				{loc.address && (
					<div style={{ fontSize: "12px", color: "var(--fg-3)" }}>
						{loc.address}
					</div>
				)}
			</td>
			<td style={{ color: "var(--fg-2)" }}>
				{LOCATION_TYPE_LABEL[loc.locationType] ?? loc.locationType}
			</td>
			<td className="mono" style={{ color: "var(--fg-2)" }}>
				{coords}
			</td>
			<td className="mono" style={{ color: "var(--fg-2)" }}>
				{loc.radiusMeters} m
			</td>
			<td>
				<span className={`pill-status ${archived ? "archived" : "active"}`}>
					<span className="badge-dot" />
					{archived ? "Archived" : "Active"}
				</span>
			</td>
			<td>
				{canManage && (
					<div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
						<button
							className="btn btn-ghost btn-sm"
							onClick={onEdit}
							title="Edit"
							type="button"
						>
							<Edit size={12} />
						</button>
						{!archived && (
							<button
								className="btn btn-ghost btn-sm"
								onClick={onArchive}
								style={{ color: "var(--danger)" }}
								title="Archive"
								type="button"
							>
								<Archive size={12} />
							</button>
						)}
					</div>
				)}
			</td>
		</tr>
	);
}

// ─── Audit Log Section (Phase 22 / Settings Depth) ────────
// Read-only viewer over the shared audit_event log via orpc.audit.*.

const AUDIT_ACTION_OPTIONS: { key: string; label: string }[] = [
	{ key: "", label: "All actions" },
	{ key: "create", label: "Created" },
	{ key: "update", label: "Updated" },
	{ key: "delete", label: "Deleted" },
	{ key: "archive", label: "Archived" },
	{ key: "restore", label: "Restored" },
];

interface AuditRow {
	actionLabel: string;
	actor: { email: string; name: string } | null;
	createdAt: string;
	entityId: string;
	entityLabel: string;
	id: string;
}

const AUDIT_PAGE_SIZE = 25;

function fmtAuditTime(value: string): string {
	try {
		return new Date(value).toLocaleString("en-GB", {
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return value;
	}
}

function AuditLogSection() {
	const [entityType, setEntityType] = useState("");
	const [action, setAction] = useState("");
	const [page, setPage] = useState(1);
	const [openId, setOpenId] = useState<string | null>(null);

	const { data, isLoading, isError } = useQuery(
		orpc.audit.list.queryOptions({
			input: {
				page,
				pageSize: AUDIT_PAGE_SIZE,
				...(entityType ? { entityType } : {}),
				...(action
					? {
							action: action as
								| "create"
								| "update"
								| "delete"
								| "archive"
								| "restore",
						}
					: {}),
			},
		})
	);

	const result = data as
		| { page: number; pageSize: number; rows: AuditRow[]; total: number }
		| undefined;
	const rows = result?.rows ?? [];
	const total = result?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

	return (
		<div className="card card-pad">
			<div className="card-head-row">
				<div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Audit Log</h4>
					<p style={{ fontSize: "12.5px", color: "var(--fg-3)", marginTop: 4 }}>
						A read-only record of who changed what across the workspace. Viewing
						this log is not itself recorded.
					</p>
				</div>
			</div>

			{/* Filters */}
			<div
				style={{
					display: "flex",
					gap: 8,
					flexWrap: "wrap",
					alignItems: "flex-end",
					marginBottom: 14,
				}}
			>
				<div style={{ flex: "0 0 160px" }}>
					<label className="label" htmlFor="audit-action">
						Action
					</label>
					<select
						className="input"
						id="audit-action"
						onChange={(e) => {
							setAction(e.target.value);
							setPage(1);
						}}
						style={{ height: 34 }}
						value={action}
					>
						{AUDIT_ACTION_OPTIONS.map((a) => (
							<option key={a.key} value={a.key}>
								{a.label}
							</option>
						))}
					</select>
				</div>
				<div style={{ flex: "1 1 200px" }}>
					<label className="label" htmlFor="audit-entity">
						Entity type
					</label>
					<input
						className="input"
						id="audit-entity"
						onChange={(e) => {
							setEntityType(e.target.value.trim());
							setPage(1);
						}}
						placeholder="e.g., tenant_branding, payslip"
						style={{ height: 34 }}
						value={entityType}
					/>
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
			) : isError ? (
				<p
					style={{
						padding: "24px 0",
						color: "var(--danger)",
						fontSize: "13px",
						textAlign: "center",
					}}
				>
					Could not load the audit log. Please refresh.
				</p>
			) : rows.length === 0 ? (
				<div style={{ padding: "40px 0", textAlign: "center" }}>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						No audit entries match these filters yet.
					</p>
				</div>
			) : (
				<>
					<table className="tbl">
						<thead>
							<tr>
								<th style={{ width: 170 }}>When</th>
								<th style={{ width: 110 }}>Action</th>
								<th>Entity</th>
								<th>Actor</th>
								<th style={{ width: 80 }} />
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td className="mono" style={{ color: "var(--fg-2)" }}>
										{fmtAuditTime(r.createdAt)}
									</td>
									<td>
										<span className="badge">{r.actionLabel}</span>
									</td>
									<td>
										<div style={{ fontWeight: 500 }}>{r.entityLabel}</div>
										<div
											className="mono"
											style={{ fontSize: "11px", color: "var(--fg-4)" }}
										>
											{r.entityId.slice(0, 12)}…
										</div>
									</td>
									<td style={{ color: "var(--fg-2)" }}>
										{r.actor ? (
											<>
												<div>{r.actor.name}</div>
												<div style={{ fontSize: "11px", color: "var(--fg-3)" }}>
													{r.actor.email}
												</div>
											</>
										) : (
											<span style={{ color: "var(--fg-4)" }}>System</span>
										)}
									</td>
									<td>
										<button
											className="btn btn-ghost btn-sm"
											onClick={() => setOpenId(r.id)}
											title="View details"
											type="button"
										>
											View
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginTop: 12,
						}}
					>
						<span style={{ fontSize: "12px", color: "var(--fg-3)" }}>
							{total} {total === 1 ? "entry" : "entries"} · page {page} of{" "}
							{totalPages}
						</span>
						<div style={{ display: "flex", gap: 8 }}>
							<button
								className="btn btn-outline btn-sm"
								disabled={page <= 1}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								type="button"
							>
								Previous
							</button>
							<button
								className="btn btn-outline btn-sm"
								disabled={page >= totalPages}
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								type="button"
							>
								Next
							</button>
						</div>
					</div>
				</>
			)}

			{openId && (
				<AuditDetailDrawer id={openId} onClose={() => setOpenId(null)} />
			)}
		</div>
	);
}

function AuditDetailDrawer({
	id,
	onClose,
}: {
	id: string;
	onClose: () => void;
}) {
	const [showRaw, setShowRaw] = useState(false);
	const { data, isLoading, isError } = useQuery(
		orpc.audit.getById.queryOptions({ input: { id } })
	);
	const entry = data as
		| {
				actionLabel: string;
				actor: { email: string; name: string } | null;
				changes:
					| { field: string; newValue: unknown; oldValue: unknown }[]
					| null;
				createdAt: string;
				entityId: string;
				entityLabel: string;
				metadata: Record<string, unknown> | null;
		  }
		| undefined;

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 200,
				display: "flex",
				justifyContent: "flex-end",
				background: "rgba(8,9,12,0.6)",
			}}
		>
			<button
				aria-label="Close"
				onClick={onClose}
				style={{
					position: "absolute",
					inset: 0,
					background: "transparent",
					border: "none",
					cursor: "default",
				}}
				type="button"
			/>
			<div
				style={{
					position: "relative",
					width: 460,
					maxWidth: "100%",
					height: "100%",
					background: "var(--bg-2)",
					borderLeft: "1px solid var(--line)",
					padding: 24,
					overflowY: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 16,
					}}
				>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Audit entry</h4>
					<button
						aria-label="Close drawer"
						className="btn btn-ghost btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={14} />
					</button>
				</div>

				{isLoading ? (
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>Loading…</p>
				) : isError || !entry ? (
					<p style={{ color: "var(--danger)", fontSize: "13px" }}>
						Could not load this entry.
					</p>
				) : (
					<>
						<dl style={{ display: "grid", gap: 8, marginBottom: 20 }}>
							<AuditDetailRow label="Action" value={entry.actionLabel} />
							<AuditDetailRow label="Entity" value={entry.entityLabel} />
							<AuditDetailRow label="Entity ID" mono value={entry.entityId} />
							<AuditDetailRow
								label="Actor"
								value={
									entry.actor
										? `${entry.actor.name} (${entry.actor.email})`
										: "System"
								}
							/>
							<AuditDetailRow
								label="When"
								value={fmtAuditTime(entry.createdAt)}
							/>
						</dl>

						<h5
							style={{
								fontSize: "13px",
								fontWeight: 600,
								marginBottom: 8,
							}}
						>
							Changes
						</h5>
						{entry.changes && entry.changes.length > 0 ? (
							<table className="tbl" style={{ marginBottom: 16 }}>
								<thead>
									<tr>
										<th>Field</th>
										<th>Before</th>
										<th>After</th>
									</tr>
								</thead>
								<tbody>
									{entry.changes.map((c) => (
										<tr key={c.field}>
											<td style={{ fontWeight: 500 }}>{c.field}</td>
											<td className="mono" style={{ color: "var(--fg-3)" }}>
												{formatAuditValue(c.oldValue)}
											</td>
											<td className="mono" style={{ color: "var(--fg-2)" }}>
												{formatAuditValue(c.newValue)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						) : (
							<p
								style={{
									fontSize: "12.5px",
									color: "var(--fg-3)",
									marginBottom: 16,
								}}
							>
								No field-level changes were recorded for this entry.
							</p>
						)}

						<button
							className="btn btn-ghost btn-sm"
							onClick={() => setShowRaw((v) => !v)}
							type="button"
						>
							{showRaw ? "Hide raw" : "Show raw"}
						</button>
						{showRaw && (
							<pre
								style={{
									marginTop: 8,
									padding: 12,
									background: "var(--bg-3)",
									borderRadius: 10,
									fontSize: "11px",
									overflowX: "auto",
									color: "var(--fg-2)",
								}}
							>
								{JSON.stringify(
									{ changes: entry.changes, metadata: entry.metadata },
									null,
									2
								)}
							</pre>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function formatAuditValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

function AuditDetailRow({
	label,
	value,
	mono,
}: {
	label: string;
	mono?: boolean;
	value: string;
}) {
	return (
		<div style={{ display: "flex", gap: 8 }}>
			<dt
				style={{
					width: 90,
					flexShrink: 0,
					fontSize: "12px",
					color: "var(--fg-3)",
				}}
			>
				{label}
			</dt>
			<dd
				className={mono ? "mono" : undefined}
				style={{ fontSize: "13px", color: "var(--fg)", wordBreak: "break-all" }}
			>
				{value}
			</dd>
		</div>
	);
}
