import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	FileText,
	MoreHorizontal,
	Play,
	Plus,
	Search,
	X,
	XCircle,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/contracts.css";
import {
	PAY_FREQUENCY_OPTIONS,
	type PayFrequency,
	payFrequencyLabel,
} from "@/lib/pay-frequency";
import { canManageHR, canManagePayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/contracts/")({
	component: ContractsPage,
});

type ContractStatus = "draft" | "active" | "expired" | "terminated";
type StatusLens = "All" | "Draft" | "Active" | "Expiring Soon" | "Terminated";

interface ContractRow {
	baseSalary: string | null;
	contractName: string;
	createdAt: Date;
	deductLeaveFromBasicPay: boolean;
	documentUrl: string | null;
	employeeBadgeId: string | null;
	employeeFirstName: string;
	employeeId: string;
	employeeLastName: string | null;
	endDate: Date | null;
	filingStatusId: string | null;
	id: string;
	notes: string | null;
	noticePeriodDays: number;
	payFrequency: PayFrequency;
	salaryCurrency: string;
	startDate: Date;
	status: ContractStatus;
	updatedAt: Date;
	wageType: "daily" | "monthly" | "hourly";
}

interface FilingStatusRow {
	basedOn: string;
	id: string;
	isActive: boolean;
	name: string;
}

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

const WAGE_TYPE_LABELS: Record<string, string> = {
	monthly: "Monthly",
	daily: "Daily",
	hourly: "Hourly",
};

function fmtDate(d: Date | null | string | undefined): string {
	if (!d) {
		return "—";
	}
	return new Date(d).toISOString().slice(0, 10);
}

function fmtSalary(s: string | null, currency: string): string {
	if (s === null) {
		return "—";
	}
	return `${Number(s).toLocaleString()} ${currency}`;
}

function statusLensToFilter(
	lens: StatusLens
): ContractStatus | "expiring_soon" | undefined {
	if (lens === "Draft") {
		return "draft";
	}
	if (lens === "Active") {
		return "active";
	}
	if (lens === "Expiring Soon") {
		return "expiring_soon";
	}
	if (lens === "Terminated") {
		return "terminated";
	}
	return;
}

function contractStatusPillClass(status: ContractStatus): string {
	if (status === "active") {
		return "pill-status cs-active";
	}
	if (status === "draft") {
		return "pill-status cs-draft";
	}
	if (status === "expired") {
		return "pill-status cs-expired";
	}
	return "pill-status cs-terminated";
}

function contractStatusLabel(status: ContractStatus): string {
	if (status === "active") {
		return "Active";
	}
	if (status === "draft") {
		return "Draft";
	}
	if (status === "expired") {
		return "Expired";
	}
	return "Terminated";
}

const SALARY_REGEX = /^\d+(\.\d{1,2})?$/;

function getEmptyStateTitle(search: string, lens: StatusLens): string {
	if (search) {
		return "No results";
	}
	if (lens === "Draft") {
		return "No draft contracts";
	}
	if (lens === "Active") {
		return "No active contracts";
	}
	if (lens === "Expiring Soon") {
		return "No contracts expiring in the next 30 days";
	}
	if (lens === "Terminated") {
		return "No terminated contracts";
	}
	return "No contracts yet";
}

function getEmptyStateDesc(
	search: string,
	lens: StatusLens,
	canEdit: boolean
): string {
	if (search) {
		return "Try adjusting your search query.";
	}
	if (lens === "All" && canEdit) {
		return "Create an employee contract to define their compensation terms.";
	}
	return "Contracts will appear here once created.";
}

function getSaveLabel(saving: boolean, isEdit: boolean): string {
	if (saving) {
		return "Saving…";
	}
	if (isEdit) {
		return "Save changes";
	}
	return "Create draft";
}

const SKELETON_ROW_KEYS = ["sk-r0", "sk-r1", "sk-r2", "sk-r3", "sk-r4"];
const SKELETON_CELL_KEYS = [
	"sk-c0",
	"sk-c1",
	"sk-c2",
	"sk-c3",
	"sk-c4",
	"sk-c5",
	"sk-c6",
	"sk-c7",
	"sk-c8",
];

// ─── Main page ───────────────────────────────────────────────

function ContractsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canEdit = canManageHR(org.memberRole);
	const canSeeSalary = canManagePayroll(org.memberRole);

	const [lens, setLens] = useState<StatusLens>("All");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 50;

	const [showCreate, setShowCreate] = useState(false);
	const [editingContract, setEditingContract] = useState<ContractRow | null>(
		null
	);
	const [activatingContract, setActivatingContract] =
		useState<ContractRow | null>(null);
	const [terminatingContract, setTerminatingContract] =
		useState<ContractRow | null>(null);

	const statusFilter = statusLensToFilter(lens);

	const { data, isLoading, isError, refetch } = useQuery(
		orpc.contracts.list.queryOptions({
			input: {
				status: statusFilter,
				search: search || undefined,
				page,
				pageSize,
			},
		})
	);

	const contracts: ContractRow[] = (data?.data as ContractRow[]) ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / pageSize);

	function openEdit(c: ContractRow) {
		setEditingContract(c);
	}

	function closeSheet() {
		setShowCreate(false);
		setEditingContract(null);
	}

	function afterMutation() {
		qc.invalidateQueries();
		closeSheet();
	}

	const LENSES: StatusLens[] = [
		"All",
		"Draft",
		"Active",
		"Expiring Soon",
		"Terminated",
	];

	return (
		<div className="page">
			{/* Page header */}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Contracts</span>
					</div>
					<h1 className="page-title">Contracts</h1>
					<p className="page-sub">
						{total} contract{total === 1 ? "" : "s"}{" "}
						{lens === "All" ? "" : `· ${lens.toLowerCase()}`}
					</p>
				</div>
				{canEdit && (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						New contract
					</button>
				)}
			</div>

			{/* Toolbar */}
			<div className="toolbar">
				<div className="search-wrap">
					<Search className="icon-l" size={15} />
					<input
						className="search"
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
						placeholder="Search by name or employee…"
						value={search}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{LENSES.map((l) => (
						<button
							className={lens === l ? "active" : ""}
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

			{/* Loading skeleton */}
			{isLoading && (
				<div className="emp-list">
					<table>
						<thead>
							<tr>
								<th>Employee</th>
								<th>Contract</th>
								<th>Status</th>
								<th>Type</th>
								<th>Pay Schedule</th>
								{canSeeSalary && <th>Base Salary</th>}
								<th>Start</th>
								<th>End</th>
								<th style={{ width: 80 }} />
							</tr>
						</thead>
						<tbody>
							{SKELETON_ROW_KEYS.map((rowKey) => (
								<tr key={rowKey}>
									{SKELETON_CELL_KEYS.slice(0, canSeeSalary ? 9 : 8).map(
										(cellKey) => (
											<td key={cellKey}>
												<div
													style={{
														height: 14,
														borderRadius: 4,
														background: "var(--bg-3)",
														animation: "pulse 1.5s ease-in-out infinite",
													}}
												/>
											</td>
										)
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Error */}
			{isError && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "64px 24px",
						textAlign: "center",
					}}
				>
					<p style={{ color: "var(--fg-3)", fontSize: "13px" }}>
						Unable to load contracts. Check your connection and try again.
					</p>
					<button
						className="btn btn-outline btn-sm"
						onClick={() => refetch()}
						type="button"
					>
						Retry
					</button>
				</div>
			)}

			{/* Empty state */}
			{!(isLoading || isError) && contracts.length === 0 && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "64px 24px",
						textAlign: "center",
					}}
				>
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
						}}
					>
						<FileText size={22} />
					</div>
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>
						{getEmptyStateTitle(search, lens)}
					</h4>
					<p style={{ fontSize: "13px", color: "var(--fg-3)", maxWidth: 340 }}>
						{getEmptyStateDesc(search, lens, canEdit)}
					</p>
					{lens === "All" && canEdit && !search && (
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setShowCreate(true)}
							type="button"
						>
							<Plus size={12} />
							New contract
						</button>
					)}
				</div>
			)}

			{/* Table */}
			{!(isLoading || isError) && contracts.length > 0 && (
				<div className="emp-list">
					<table>
						<thead>
							<tr>
								<th className="sortable">Employee</th>
								<th className="sortable">Contract</th>
								<th>Status</th>
								<th>Type</th>
								<th>Pay Schedule</th>
								{canSeeSalary && <th className="sortable">Base Salary</th>}
								<th>Start</th>
								<th>End</th>
								<th style={{ width: 80 }} />
							</tr>
						</thead>
						<tbody>
							{contracts.map((c) => (
								<ContractTableRow
									canEdit={canEdit}
									canSeeSalary={canSeeSalary}
									contract={c}
									key={c.id}
									onActivate={() => setActivatingContract(c)}
									onEdit={() => openEdit(c)}
									onTerminate={() => setTerminatingContract(c)}
								/>
							))}
						</tbody>
					</table>

					{totalPages > 1 && (
						<div className="pagination">
							<span>
								Showing{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
								</span>{" "}
								of{" "}
								<span className="mono" style={{ color: "var(--fg-2)" }}>
									{total}
								</span>
							</span>
							<div className="pager">
								<button
									className="icon"
									disabled={page <= 1}
									onClick={() => setPage(page - 1)}
									type="button"
								>
									<ChevronLeft size={12} />
								</button>
								<span
									className="mono"
									style={{
										padding: "0 8px",
										fontSize: "12px",
										color: "var(--fg-2)",
									}}
								>
									{page} / {totalPages}
								</span>
								<button
									className="icon"
									disabled={page >= totalPages}
									onClick={() => setPage(page + 1)}
									type="button"
								>
									<ChevronRight size={12} />
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Modals */}
			{(showCreate || editingContract !== null) && (
				<ContractSheet
					initialData={editingContract}
					onClose={closeSheet}
					onSaved={afterMutation}
				/>
			)}

			{activatingContract !== null && (
				<ActivateDialog
					contract={activatingContract}
					onClose={() => setActivatingContract(null)}
					onDone={() => {
						qc.invalidateQueries();
						setActivatingContract(null);
					}}
				/>
			)}

			{terminatingContract !== null && (
				<TerminateDialog
					contract={terminatingContract}
					onClose={() => setTerminatingContract(null)}
					onDone={() => {
						qc.invalidateQueries();
						setTerminatingContract(null);
					}}
				/>
			)}
		</div>
	);
}

// ─── Table row ───────────────────────────────────────────────

function ContractTableRow({
	contract: c,
	canEdit,
	canSeeSalary,
	onEdit,
	onActivate,
	onTerminate,
}: {
	contract: ContractRow;
	canEdit: boolean;
	canSeeSalary: boolean;
	onEdit: () => void;
	onActivate: () => void;
	onTerminate: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<tr>
			<td>
				<div className="emp-name">
					<div className="avatar-sm">
						{c.employeeFirstName.charAt(0)}
						{c.employeeLastName?.charAt(0) ?? ""}
					</div>
					<div>
						<div className="ttl">
							{c.employeeFirstName} {c.employeeLastName ?? ""}
						</div>
						<div className="sub">{c.employeeBadgeId ?? "—"}</div>
					</div>
				</div>
			</td>
			<td>
				<span
					style={{
						fontSize: "13px",
						fontWeight: 500,
						color: "var(--fg)",
					}}
				>
					{c.contractName}
				</span>
			</td>
			<td>
				<span className={contractStatusPillClass(c.status)}>
					{c.status === "active" && <span className="badge-dot" />}
					{contractStatusLabel(c.status)}
				</span>
			</td>
			<td>
				<span style={{ color: "var(--fg-2)", fontSize: "12.5px" }}>
					{WAGE_TYPE_LABELS[c.wageType] ?? c.wageType}
				</span>
			</td>
			<td>
				<span style={{ color: "var(--fg-2)", fontSize: "12.5px" }}>
					{payFrequencyLabel(c.payFrequency)}
				</span>
			</td>
			{canSeeSalary && (
				<td>
					<span
						className="mono"
						style={{ fontSize: "12.5px", color: "var(--fg)" }}
					>
						{fmtSalary(c.baseSalary, c.salaryCurrency)}
					</span>
				</td>
			)}
			<td>
				<span
					className="mono"
					style={{ fontSize: "12px", color: "var(--fg-2)" }}
				>
					{fmtDate(c.startDate)}
				</span>
			</td>
			<td>
				<span
					className="mono"
					style={{ fontSize: "12px", color: "var(--fg-3)" }}
				>
					{fmtDate(c.endDate)}
				</span>
			</td>
			<td>
				<div className="row-actions">
					<Link
						params={{ id: c.employeeId }}
						title="View employee profile"
						to="/app/employees/$id"
					>
						<ExternalLink size={12} />
					</Link>
					{canEdit && (
						<div style={{ position: "relative" }}>
							<button
								onClick={() => setMenuOpen(!menuOpen)}
								title="More actions"
								type="button"
							>
								<MoreHorizontal size={12} />
							</button>
							{menuOpen && (
								<>
									<button
										aria-label="Close menu"
										onClick={() => setMenuOpen(false)}
										onKeyDown={() => setMenuOpen(false)}
										style={{
											position: "fixed",
											inset: 0,
											zIndex: 10,
											background: "transparent",
											border: "none",
											cursor: "default",
											padding: 0,
										}}
										type="button"
									/>
									<div
										className="menu"
										data-open="true"
										style={{
											position: "absolute",
											right: 0,
											top: "calc(100% + 4px)",
											zIndex: 11,
											minWidth: 160,
										}}
									>
										{c.status === "draft" && (
											<>
												<button
													className="menu-item"
													onClick={() => {
														setMenuOpen(false);
														onEdit();
													}}
													type="button"
												>
													Edit draft
												</button>
												<button
													className="menu-item"
													onClick={() => {
														setMenuOpen(false);
														onActivate();
													}}
													type="button"
												>
													<span className="menu-icon">
														<Play size={13} />
													</span>
													Activate
												</button>
											</>
										)}
										{c.status === "active" && (
											<button
												className="menu-item danger"
												onClick={() => {
													setMenuOpen(false);
													onTerminate();
												}}
												type="button"
											>
												<span className="menu-icon">
													<XCircle size={13} />
												</span>
												Terminate
											</button>
										)}
										{c.status !== "draft" && c.status !== "active" && (
											<div
												style={{
													padding: "8px 10px",
													fontSize: "12px",
													color: "var(--fg-4)",
												}}
											>
												No actions available
											</div>
										)}
									</div>
								</>
							)}
						</div>
					)}
				</div>
			</td>
		</tr>
	);
}

// ─── Contract Sheet (create / edit) ─────────────────────────

function ContractSheet({
	initialData,
	onClose,
	onSaved,
}: {
	initialData: ContractRow | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const isEdit = initialData !== null;

	const { data: employeesData } = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const { data: filingStatusesData } = useQuery(
		orpc.filingStatuses.list.queryOptions({ input: { includeArchived: false } })
	);

	const employees: EmployeeOption[] =
		(
			employeesData as
				| {
						data: { id: string; firstName: string; lastName: string | null }[];
				  }
				| undefined
		)?.data ?? [];
	const filingStatuses: FilingStatusRow[] =
		(filingStatusesData as FilingStatusRow[] | undefined) ?? [];

	const [saving, setSaving] = useState(false);
	const [employeeId, setEmployeeId] = useState(initialData?.employeeId ?? "");
	const [contractName, setContractName] = useState(
		initialData?.contractName ?? ""
	);
	const [startDate, setStartDate] = useState(
		initialData?.startDate
			? new Date(initialData.startDate).toISOString().slice(0, 10)
			: ""
	);
	const [endDate, setEndDate] = useState(
		initialData?.endDate
			? new Date(initialData.endDate).toISOString().slice(0, 10)
			: ""
	);
	const [wageType, setWageType] = useState<"daily" | "monthly" | "hourly">(
		initialData?.wageType ?? "monthly"
	);
	const [payFrequency, setPayFrequency] = useState<PayFrequency>(
		initialData?.payFrequency ?? "monthly"
	);
	const [baseSalary, setBaseSalary] = useState(initialData?.baseSalary ?? "");
	const [salaryCurrency, setSalaryCurrency] = useState(
		initialData?.salaryCurrency ?? "GYD"
	);
	const [filingStatusId, setFilingStatusId] = useState(
		initialData?.filingStatusId ?? ""
	);
	const [noticePeriodDays, setNoticePeriodDays] = useState(
		String(initialData?.noticePeriodDays ?? 30)
	);
	const [notes, setNotes] = useState(initialData?.notes ?? "");

	function handleEmployeeChange(id: string) {
		setEmployeeId(id);
		if (!isEdit && id) {
			const emp = employees.find((e) => e.id === id);
			if (emp) {
				const year = startDate
					? new Date(startDate).getFullYear()
					: new Date().getFullYear();
				const suggested = `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ""} — ${year} Employment Agreement`;
				if (!contractName || contractName.endsWith("Employment Agreement")) {
					setContractName(suggested);
				}
			}
		}
	}

	function handleStartDateChange(val: string) {
		setStartDate(val);
		if (!isEdit && employeeId && val) {
			const emp = employees.find((e) => e.id === employeeId);
			if (emp) {
				const year = new Date(val).getFullYear();
				const suggested = `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ""} — ${year} Employment Agreement`;
				if (!contractName || contractName.endsWith("Employment Agreement")) {
					setContractName(suggested);
				}
			}
		}
	}

	function validateForm(): boolean {
		if (!contractName.trim()) {
			toast.error("Contract name is required");
			return false;
		}
		if (!(isEdit || employeeId)) {
			toast.error("Select an employee");
			return false;
		}
		if (!startDate) {
			toast.error("Start date is required");
			return false;
		}
		if (!(baseSalary && SALARY_REGEX.test(baseSalary))) {
			toast.error("Enter a valid base salary (e.g. 450000 or 450000.00)");
			return false;
		}
		return true;
	}

	async function handleSave() {
		if (!validateForm()) {
			return;
		}
		setSaving(true);
		try {
			if (isEdit) {
				await client.contracts.update({
					id: initialData.id,
					contractName: contractName.trim(),
					startDate,
					endDate: endDate || null,
					wageType,
					payFrequency,
					baseSalary,
					salaryCurrency,
					filingStatusId: filingStatusId || null,
					noticePeriodDays: Number(noticePeriodDays) || 30,
					notes: notes.trim() || null,
				});
				toast.success("Contract updated");
			} else {
				await client.contracts.create({
					employeeId,
					contractName: contractName.trim(),
					startDate,
					endDate: endDate || null,
					wageType,
					payFrequency,
					baseSalary,
					salaryCurrency,
					filingStatusId: filingStatusId || undefined,
					noticePeriodDays: Number(noticePeriodDays) || 30,
					notes: notes.trim() || null,
				});
				toast.success("Draft contract created");
			}
			onSaved();
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Failed to save contract";
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 200,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<button
				aria-label="Close"
				onClick={onClose}
				style={{
					position: "absolute",
					inset: 0,
					background: "rgba(8,9,12,0.6)",
					border: "none",
					cursor: "default",
				}}
				type="button"
			/>
			<div className="contract-sheet" style={{ position: "relative" }}>
				<div className="contract-sheet-head">
					<div>
						<h4 style={{ fontSize: "15px", fontWeight: 600 }}>
							{isEdit ? "Edit Contract" : "New Contract"}
						</h4>
						{isEdit && (
							<p
								style={{ fontSize: "12px", color: "var(--fg-3)", marginTop: 2 }}
							>
								Only draft contracts can be edited.
							</p>
						)}
					</div>
					<button
						className="btn btn-ghost btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={14} />
					</button>
				</div>

				<div className="contract-sheet-body">
					{/* Employee (create only) */}
					{!isEdit && (
						<div style={{ marginBottom: 14 }}>
							<label
								className="label"
								htmlFor="cs-employee"
								style={{ marginBottom: 4 }}
							>
								Employee <span style={{ color: "var(--danger)" }}>*</span>
							</label>
							<select
								className="input"
								id="cs-employee"
								onChange={(e) => handleEmployeeChange(e.target.value)}
								style={{ height: 34 }}
								value={employeeId}
							>
								<option value="">Select employee…</option>
								{employees.map((e) => (
									<option key={e.id} value={e.id}>
										{e.firstName} {e.lastName ?? ""}
									</option>
								))}
							</select>
						</div>
					)}

					{/* Contract name */}
					<div style={{ marginBottom: 14 }}>
						<label
							className="label"
							htmlFor="cs-contract-name"
							style={{ marginBottom: 4 }}
						>
							Contract Name <span style={{ color: "var(--danger)" }}>*</span>
						</label>
						<input
							className="input"
							id="cs-contract-name"
							onChange={(e) => setContractName(e.target.value)}
							placeholder="e.g. 2026 Employment Agreement"
							style={{ height: 34 }}
							type="text"
							value={contractName}
						/>
					</div>

					{/* Dates */}
					<div className="field-group">
						<div>
							<label
								className="label"
								htmlFor="cs-start-date"
								style={{ marginBottom: 4 }}
							>
								Start Date <span style={{ color: "var(--danger)" }}>*</span>
							</label>
							<input
								className="input"
								id="cs-start-date"
								onChange={(e) => handleStartDateChange(e.target.value)}
								style={{ height: 34 }}
								type="date"
								value={startDate}
							/>
						</div>
						<div>
							<label
								className="label"
								htmlFor="cs-end-date"
								style={{ marginBottom: 4 }}
							>
								End Date{" "}
								<span style={{ color: "var(--fg-4)", fontWeight: 400 }}>
									(optional)
								</span>
							</label>
							<input
								className="input"
								id="cs-end-date"
								onChange={(e) => setEndDate(e.target.value)}
								style={{ height: 34 }}
								type="date"
								value={endDate}
							/>
						</div>
					</div>

					{/* Compensation section */}
					<div className="field-section">
						<div className="section-label">Compensation</div>
						<div className="field-group">
							<div>
								<label
									className="label"
									htmlFor="cs-wage-type"
									style={{ marginBottom: 4 }}
								>
									Contract Type
								</label>
								<select
									className="input"
									id="cs-wage-type"
									onChange={(e) =>
										setWageType(
											e.target.value as "daily" | "monthly" | "hourly"
										)
									}
									style={{ height: 34 }}
									value={wageType}
								>
									<option value="monthly">Monthly salary</option>
									<option value="daily">Daily rate</option>
									<option value="hourly">Hourly rate</option>
								</select>
							</div>
							<div>
								<label
									className="label"
									htmlFor="cs-pay-freq"
									style={{ marginBottom: 4 }}
								>
									Pay Schedule
								</label>
								<select
									className="input"
									id="cs-pay-freq"
									onChange={(e) =>
										setPayFrequency(e.target.value as PayFrequency)
									}
									style={{ height: 34 }}
									value={payFrequency}
								>
									{PAY_FREQUENCY_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
						</div>
						<div className="field-group">
							<div>
								<label
									className="label"
									htmlFor="cs-base-salary"
									style={{ marginBottom: 4 }}
								>
									Base Salary <span style={{ color: "var(--danger)" }}>*</span>
								</label>
								<input
									className="input"
									id="cs-base-salary"
									inputMode="decimal"
									onChange={(e) => setBaseSalary(e.target.value)}
									placeholder="e.g. 450000"
									style={{ height: 34 }}
									type="text"
									value={baseSalary}
								/>
							</div>
							<div>
								<label
									className="label"
									htmlFor="cs-currency"
									style={{ marginBottom: 4 }}
								>
									Currency
								</label>
								<select
									className="input"
									id="cs-currency"
									onChange={(e) => setSalaryCurrency(e.target.value)}
									style={{ height: 34 }}
									value={salaryCurrency}
								>
									<option value="GYD">GYD</option>
									<option value="TTD">TTD</option>
									<option value="JMD">JMD</option>
									<option value="BBD">BBD</option>
									<option value="USD">USD</option>
								</select>
							</div>
						</div>
					</div>

					{/* Terms section */}
					<div className="field-section">
						<div className="section-label">Terms</div>
						<div className="field-group">
							<div>
								<label
									className="label"
									htmlFor="cs-filing-status"
									style={{ marginBottom: 4 }}
								>
									Filing Method
								</label>
								<select
									className="input"
									id="cs-filing-status"
									onChange={(e) => setFilingStatusId(e.target.value)}
									style={{ height: 34 }}
									value={filingStatusId}
								>
									<option value="">None</option>
									{filingStatuses.map((fs) => (
										<option key={fs.id} value={fs.id}>
											{fs.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									className="label"
									htmlFor="cs-notice-period"
									style={{ marginBottom: 4 }}
								>
									Notice Period (days)
								</label>
								<input
									className="input"
									id="cs-notice-period"
									min="0"
									onChange={(e) => setNoticePeriodDays(e.target.value)}
									style={{ height: 34 }}
									type="number"
									value={noticePeriodDays}
								/>
							</div>
						</div>
						<div className="field-group full">
							<div>
								<label
									className="label"
									htmlFor="cs-notes"
									style={{ marginBottom: 4 }}
								>
									Notes{" "}
									<span style={{ color: "var(--fg-4)", fontWeight: 400 }}>
										(optional)
									</span>
								</label>
								<textarea
									className="input"
									id="cs-notes"
									onChange={(e) => setNotes(e.target.value)}
									placeholder="Any additional notes or context…"
									style={{ height: 76, resize: "vertical", paddingTop: 8 }}
									value={notes}
								/>
							</div>
						</div>
					</div>
				</div>

				<div className="contract-sheet-foot">
					<button
						className="btn btn-outline btn-sm"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving}
						onClick={handleSave}
						type="button"
					>
						<Check size={12} />
						{getSaveLabel(saving, isEdit)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Activate dialog ─────────────────────────────────────────

function ActivateDialog({
	contract,
	onClose,
	onDone,
}: {
	contract: ContractRow;
	onClose: () => void;
	onDone: () => void;
}) {
	const [saving, setSaving] = useState(false);

	async function handleActivate() {
		setSaving(true);
		try {
			await client.contracts.activate({ id: contract.id });
			toast.success("Contract activated — salary record updated");
			onDone();
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Failed to activate contract";
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	}

	const employeeName =
		`${contract.employeeFirstName} ${contract.employeeLastName ?? ""}`.trim();

	return (
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
			<div className="confirm-dialog">
				<h4>Activate contract?</h4>
				<p className="desc">
					This will make{" "}
					<strong style={{ color: "var(--fg)" }}>{employeeName}</strong>'s
					contract active and update their salary record. Any previous active
					contract must be terminated first.
				</p>
				<div className="contract-info">
					<div className="row">
						<span className="k">Contract</span>
						<span className="v">{contract.contractName}</span>
					</div>
					{contract.baseSalary !== null && (
						<div className="row">
							<span className="k">Base Salary</span>
							<span className="v" style={{ color: "var(--accent)" }}>
								{fmtSalary(contract.baseSalary, contract.salaryCurrency)}
							</span>
						</div>
					)}
					<div className="row">
						<span className="k">Effective</span>
						<span className="v">{fmtDate(contract.startDate)}</span>
					</div>
					<div className="row">
						<span className="k">Pay Schedule</span>
						<span className="v">
							{WAGE_TYPE_LABELS[contract.wageType]} ·{" "}
							{payFrequencyLabel(contract.payFrequency)}
						</span>
					</div>
				</div>
				<div className="dialog-actions">
					<button
						className="btn btn-outline btn-sm"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={saving}
						onClick={handleActivate}
						type="button"
					>
						<Play size={12} />
						{saving ? "Activating…" : "Activate contract"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Terminate dialog ─────────────────────────────────────────

function TerminateDialog({
	contract,
	onClose,
	onDone,
}: {
	contract: ContractRow;
	onClose: () => void;
	onDone: () => void;
}) {
	const [reason, setReason] = useState("");
	const [saving, setSaving] = useState(false);

	async function handleTerminate() {
		setSaving(true);
		try {
			await client.contracts.terminate({
				id: contract.id,
				reason: reason.trim() || undefined,
			});
			toast.success("Contract terminated");
			onDone();
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Failed to terminate contract";
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	}

	return (
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
			<div className="confirm-dialog">
				<h4>Terminate contract?</h4>
				<p className="desc">
					This will end{" "}
					<strong style={{ color: "var(--fg)" }}>
						{contract.contractName}
					</strong>{" "}
					immediately. The employee will have no active contract until a new one
					is activated. Terminated contracts are kept for historical records.
				</p>
				<div className="contract-info">
					<div className="row">
						<span className="k">Employee</span>
						<span className="v">
							{contract.employeeFirstName} {contract.employeeLastName ?? ""}
						</span>
					</div>
					<div className="row">
						<span className="k">Started</span>
						<span className="v">{fmtDate(contract.startDate)}</span>
					</div>
				</div>
				<div style={{ marginBottom: 20 }}>
					<label
						className="label"
						htmlFor="td-reason"
						style={{ marginBottom: 4 }}
					>
						Reason{" "}
						<span style={{ color: "var(--fg-4)", fontWeight: 400 }}>
							(optional)
						</span>
					</label>
					<textarea
						className="input"
						id="td-reason"
						onChange={(e) => setReason(e.target.value)}
						placeholder="Why is this contract being terminated?"
						style={{ height: 76, resize: "vertical", paddingTop: 8 }}
						value={reason}
					/>
				</div>
				<div className="dialog-actions">
					<button
						className="btn btn-outline btn-sm"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-sm"
						disabled={saving}
						onClick={handleTerminate}
						style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
						type="button"
					>
						<XCircle size={12} />
						{saving ? "Terminating…" : "Terminate contract"}
					</button>
				</div>
			</div>
		</div>
	);
}
