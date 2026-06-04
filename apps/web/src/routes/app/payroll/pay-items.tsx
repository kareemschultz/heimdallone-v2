import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, FileText, Plus, Search, UserPlus } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { EmptyState } from "@/components/empty-state";
import { PayrollTabs } from "@/features/payroll/payroll-tabs";
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

export const Route = createFileRoute("/app/payroll/pay-items")({
	component: PayItemsPage,
});

type PayItemType = "allowance" | "deduction";
type ViewMode =
	| "all"
	| "earnings"
	| "allowance"
	| "deduction"
	| "statutory"
	| "employer";

function taxTimingLabel(item: Record<string, unknown>): string {
	if ((item.type as string) !== "deduction") {
		return "—";
	}
	if (item.isPreTax as boolean) {
		return "Pre-tax";
	}
	return "Post-tax";
}

function amountOrRateCell(item: Record<string, unknown>): string {
	if ((item.isFixed as boolean) && item.fixedAmount) {
		return `$${Number(item.fixedAmount).toLocaleString()}`;
	}
	if (item.rate) {
		return `${Number(item.rate) * 100}%`;
	}
	return "—";
}

function matchesViewMode(
	item: Record<string, unknown>,
	mode: ViewMode
): boolean {
	if (mode === "all") {
		return true;
	}
	const category = String(item.category ?? "").toLowerCase();
	const itemType = String(item.type ?? "").toLowerCase();
	const isStatutory = Boolean(item.isStatutory);
	const isEmployerContribution = Boolean(item.isEmployerContribution);
	if (mode === "earnings") {
		return (
			category === "earning" ||
			(itemType === "allowance" && !isStatutory && category !== "allowance")
		);
	}
	if (mode === "allowance") {
		return itemType === "allowance" && !isStatutory;
	}
	if (mode === "deduction") {
		return itemType === "deduction" && !isStatutory;
	}
	if (mode === "statutory") {
		return isStatutory;
	}
	if (mode === "employer") {
		return isEmployerContribution || category === "employer_contribution";
	}
	return true;
}

function PayItemsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const [viewMode, setViewMode] = useState<ViewMode>("all");
	const [search, setSearch] = useState("");
	const [showCreate, setShowCreate] = useState(false);
	const [showAssign, setShowAssign] = useState<string | null>(null);

	const serverType =
		viewMode === "allowance" || viewMode === "deduction" ? viewMode : undefined;

	const { data: items, isLoading } = useQuery(
		orpc.payroll.payItems.list.queryOptions({
			input: {
				type: serverType,
				includeInactive: true,
			},
		})
	);

	const filtered = ((items ?? []) as Record<string, unknown>[])
		.filter((item) =>
			String(item.title ?? "")
				.toLowerCase()
				.includes(search.toLowerCase())
		)
		.filter((item) => matchesViewMode(item, viewMode));

	async function handleArchive(id: string, title: string) {
		try {
			await client.payroll.payItems.archive({ id });
			toast.success(`"${title}" archived`);
			qc.invalidateQueries();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to archive");
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
						<span>Pay items</span>
					</div>
					<h1 className="page-title">Pay items</h1>
					<p className="page-sub">
						Pay items are allowances, deductions, and statutory items used in
						every payroll calculation.
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						Add pay item
					</button>
				)}
			</div>

			<PayrollTabs />

			<div className="toolbar">
				<div className="search-wrap">
					<Search size={14} />
					<input
						className="search"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search pay items..."
						value={search}
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					{(
						[
							"all",
							"earnings",
							"allowance",
							"deduction",
							"statutory",
							"employer",
						] as const
					).map((mode) => (
						<button
							className={`seg-btn ${viewMode === mode ? "active" : ""}`}
							key={mode}
							onClick={() => setViewMode(mode)}
							type="button"
						>
							{mode === "all" && "All"}
							{mode === "earnings" && "Earnings"}
							{mode === "allowance" && "Allowances"}
							{mode === "deduction" && "Deductions"}
							{mode === "statutory" && "Statutory"}
							{mode === "employer" && "Employer Contributions"}
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
				<strong style={{ color: "var(--fg-2)" }}>How pay items work:</strong>{" "}
				Taxable allowances increase taxable income. Non-taxable allowances add
				to pay but are not taxed. Pre-tax deductions reduce taxable income
				before PAYE. Post-tax deductions are taken after PAYE.
			</div>

			<div className="emp-table">
				<table>
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th>Method</th>
							<th>Taxable</th>
							<th>Pre/Post tax</th>
							<th style={{ textAlign: "right" }}>Amount/Rate</th>
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
						{!isLoading && filtered.length === 0 && (
							<tr>
								<td colSpan={canManage ? 8 : 7} style={{ padding: 0 }}>
									<EmptyState
										action={
											canManage
												? {
														label: "Add pay item",
														onClick: () => setShowCreate(true),
													}
												: undefined
										}
										description="Create allowances, deductions, and statutory items before running payroll."
										icon={<FileText size={20} />}
										title="No pay items yet"
									/>
								</td>
							</tr>
						)}
						{!isLoading &&
							filtered.length > 0 &&
							filtered.map((item: Record<string, unknown>) => (
								<tr
									key={item.id as string}
									style={{ opacity: (item.isActive as boolean) ? 1 : 0.5 }}
								>
									<td>
										<div style={{ fontWeight: 500 }}>
											{item.title as string}
										</div>
										{Boolean(item.isStatutory) && (
											<span
												className="badge badge-outline"
												style={{ fontSize: 9, marginTop: 2 }}
											>
												Statutory
											</span>
										)}
									</td>
									<td>
										<span
											className={`badge ${(item.type as string) === "allowance" ? "badge-success" : "badge-warning"}`}
											style={{ fontSize: 10 }}
										>
											{item.type as string}
										</span>
									</td>
									<td style={{ fontSize: 12, color: "var(--fg-3)" }}>
										{(item.isFixed as boolean)
											? "Fixed amount"
											: `${Number(item.rate ?? 0) * 100}% of ${(item.basedOn as string) ?? "basic"}`}
									</td>
									<td>{(item.isTaxable as boolean) ? "Yes" : "No"}</td>
									<td>{taxTimingLabel(item)}</td>
									<td className="num-cell">{amountOrRateCell(item)}</td>
									<td>
										<span
											className={`badge ${(item.isActive as boolean) ? "badge-success" : "badge-outline"}`}
											style={{ fontSize: 10 }}
										>
											{(item.isActive as boolean) ? "Active" : "Archived"}
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
													onClick={() => setShowAssign(item.id as string)}
													title="Assign to employee"
													type="button"
												>
													<UserPlus size={13} />
												</button>
												{(item.isActive as boolean) && (
													<button
														className="btn btn-ghost btn-xs"
														onClick={() =>
															handleArchive(
																item.id as string,
																item.title as string
															)
														}
														title="Archive"
														type="button"
													>
														<Archive size={13} />
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

			{showCreate && (
				<CreatePayItemDialog
					onClose={() => {
						setShowCreate(false);
						qc.invalidateQueries();
					}}
				/>
			)}
			{showAssign && (
				<AssignPayItemDialog
					onClose={() => {
						setShowAssign(null);
						qc.invalidateQueries();
					}}
					payItemId={showAssign}
				/>
			)}
		</div>
	);
}

function CreatePayItemDialog({ onClose }: { onClose: () => void }) {
	const [type, setType] = useState<PayItemType>("allowance");
	const [title, setTitle] = useState("");
	const [isFixed, setIsFixed] = useState(true);
	const [fixedAmount, setFixedAmount] = useState("");
	const [rate, setRate] = useState("");
	const [basedOn, setBasedOn] = useState("basic");
	const [isTaxable, setIsTaxable] = useState(true);
	const [isPreTax, setIsPreTax] = useState(false);
	const [saving, setSaving] = useState(false);

	async function handleSubmit() {
		if (!title.trim()) {
			toast.error("Title is required");
			return;
		}
		setSaving(true);
		try {
			await client.payroll.payItems.create({
				type,
				title: title.trim(),
				isFixed,
				fixedAmount: isFixed ? fixedAmount : null,
				rate: isFixed ? null : rate,
				basedOn: isFixed ? null : basedOn,
				isTaxable,
				isPreTax: type === "deduction" ? isPreTax : false,
			});
			toast.success(`Pay item "${title}" created`);
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
					Create pay item
				</h3>

				<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
					<FieldWrap label="Type">
						<select
							className="emp-search"
							onChange={(e) => setType(e.target.value as PayItemType)}
							style={{ width: "100%" }}
							value={type}
						>
							<option value="allowance">Allowance — adds to pay</option>
							<option value="deduction">Deduction — reduces pay</option>
						</select>
					</FieldWrap>

					<FieldWrap label="Title">
						<input
							className="emp-search"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Transport Allowance"
							style={{ width: "100%" }}
							value={title}
						/>
					</FieldWrap>

					<FieldWrap label="Calculation method">
						<div style={{ display: "flex", gap: 8 }}>
							<label
								style={{
									display: "flex",
									gap: 6,
									alignItems: "center",
									fontSize: 13,
								}}
							>
								<input
									checked={isFixed}
									onChange={() => setIsFixed(true)}
									type="radio"
								/>{" "}
								Fixed amount
							</label>
							<label
								style={{
									display: "flex",
									gap: 6,
									alignItems: "center",
									fontSize: 13,
								}}
							>
								<input
									checked={!isFixed}
									onChange={() => setIsFixed(false)}
									type="radio"
								/>{" "}
								Percentage
							</label>
						</div>
					</FieldWrap>

					{isFixed ? (
						<FieldWrap label="Amount">
							<input
								className="emp-search"
								onChange={(e) => setFixedAmount(e.target.value)}
								placeholder="0.00"
								style={{ width: "100%" }}
								type="number"
								value={fixedAmount}
							/>
						</FieldWrap>
					) : (
						<>
							<FieldWrap label="Rate (decimal, e.g. 0.05 = 5%)">
								<input
									className="emp-search"
									onChange={(e) => setRate(e.target.value)}
									placeholder="0.05"
									step="0.01"
									style={{ width: "100%" }}
									type="number"
									value={rate}
								/>
							</FieldWrap>
							<FieldWrap label="Based on">
								<select
									className="emp-search"
									onChange={(e) => setBasedOn(e.target.value)}
									style={{ width: "100%" }}
									value={basedOn}
								>
									<option value="basic">Basic pay</option>
									<option value="gross">Gross pay</option>
								</select>
							</FieldWrap>
						</>
					)}

					<FieldWrap label="Taxable">
						<label
							style={{
								display: "flex",
								gap: 6,
								alignItems: "center",
								fontSize: 13,
							}}
						>
							<input
								checked={isTaxable}
								onChange={(e) => setIsTaxable(e.target.checked)}
								type="checkbox"
							/>
							This {type} is subject to income tax
						</label>
					</FieldWrap>

					{type === "deduction" && (
						<FieldWrap label="Tax timing">
							<div style={{ display: "flex", gap: 8 }}>
								<label
									style={{
										display: "flex",
										gap: 6,
										alignItems: "center",
										fontSize: 13,
									}}
								>
									<input
										checked={isPreTax}
										onChange={() => setIsPreTax(true)}
										type="radio"
									/>{" "}
									Pre-tax (reduces taxable income)
								</label>
								<label
									style={{
										display: "flex",
										gap: 6,
										alignItems: "center",
										fontSize: 13,
									}}
								>
									<input
										checked={!isPreTax}
										onChange={() => setIsPreTax(false)}
										type="radio"
									/>{" "}
									Post-tax (after PAYE)
								</label>
							</div>
						</FieldWrap>
					)}
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
						{saving ? "Creating..." : "Create pay item"}
					</button>
				</div>
			</div>
		</div>
	);
}

function AssignPayItemDialog({
	payItemId,
	onClose,
}: {
	payItemId: string;
	onClose: () => void;
}) {
	const [employeeId, setEmployeeId] = useState("");
	const [overrideAmount, setOverrideAmount] = useState("");
	const [saving, setSaving] = useState(false);

	async function handleAssign() {
		if (!employeeId.trim()) {
			toast.error("Select an employee");
			return;
		}
		setSaving(true);
		try {
			await client.payroll.payItems.assignToEmployee({
				payItemId,
				employeeId: employeeId.trim(),
				overrideAmount: overrideAmount || null,
			});
			toast.success("Pay item assigned to employee");
			onClose();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to assign");
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
					width: 400,
				}}
			>
				<h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
					Assign pay item
				</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
					<FieldWrap label="Employee ID">
						<input
							className="emp-search"
							onChange={(e) => setEmployeeId(e.target.value)}
							placeholder="Enter employee ID"
							style={{ width: "100%" }}
							value={employeeId}
						/>
					</FieldWrap>
					<FieldWrap label="Override amount (optional)">
						<input
							className="emp-search"
							onChange={(e) => setOverrideAmount(e.target.value)}
							placeholder="Leave blank to use default"
							style={{ width: "100%" }}
							type="number"
							value={overrideAmount}
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
						onClick={handleAssign}
						type="button"
					>
						{saving ? "Assigning..." : "Assign"}
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
			<div
				style={{
					display: "block",
					fontSize: 13,
					fontWeight: 500,
					marginBottom: 4,
				}}
			>
				{label}
			</div>
			{children}
		</div>
	);
}
