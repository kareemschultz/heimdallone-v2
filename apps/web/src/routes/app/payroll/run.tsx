import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	CheckCircle,
	Clock,
	Eye,
	Play,
	ShieldCheck,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/run")({
	component: PayrollRunWizard,
});

type WizardStep =
	| "period"
	| "readiness"
	| "preview"
	| "review"
	| "detail"
	| "finalize";

const STEPS: { key: WizardStep; label: string; num: number }[] = [
	{ key: "period", label: "Select period", num: 1 },
	{ key: "readiness", label: "Readiness", num: 2 },
	{ key: "preview", label: "Generate preview", num: 3 },
	{ key: "review", label: "Review payslips", num: 4 },
	{ key: "finalize", label: "Confirm", num: 5 },
];

function PayrollRunWizard() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const [step, setStep] = useState<WizardStep>("period");
	const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
	const [runId, setRunId] = useState<string | null>(null);
	const [previewResult, setPreviewResult] = useState<PreviewSummary | null>(
		null
	);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
		null
	);
	const [generating, setGenerating] = useState(false);
	const [confirming, setConfirming] = useState(false);

	if (!canManage) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Payroll run</h1>
						<p className="page-sub">
							You don't have permission to run payroll.
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
						<span>Run payroll</span>
					</div>
					<h1 className="page-title">Run payroll</h1>
					<p className="page-sub">
						Preview payroll first — nothing is finalized until you confirm.
						Review every employee before proceeding.
					</p>
				</div>
			</div>

			<StepIndicator currentStep={step} />

			{step === "period" && (
				<PeriodStep
					onNext={(periodId) => {
						setSelectedPeriodId(periodId);
						setStep("readiness");
					}}
					selectedPeriodId={selectedPeriodId}
				/>
			)}

			{step === "readiness" && selectedPeriodId && (
				<ReadinessStep
					generating={generating}
					onBack={() => setStep("period")}
					onNext={async () => {
						setGenerating(true);
						try {
							const draft = await client.payroll.runs.createDraft({
								payPeriodId: selectedPeriodId,
								batchName: `Payroll ${new Date().toISOString().split("T")[0]}`,
							});
							setRunId(draft.id);
							const result = await client.payroll.runs.preview({
								id: draft.id,
							});
							setPreviewResult(result as PreviewSummary);
							setStep("review");
							qc.invalidateQueries();
						} catch (e: unknown) {
							toast.error(
								e instanceof Error ? e.message : "Failed to generate preview"
							);
						} finally {
							setGenerating(false);
						}
					}}
					periodId={selectedPeriodId}
				/>
			)}

			{step === "review" && runId && previewResult && (
				<ReviewStep
					onBack={() => setStep("readiness")}
					onFinalize={() => setStep("finalize")}
					onViewDetail={(empId) => {
						setSelectedEmployeeId(empId);
						setStep("detail");
					}}
					previewResult={previewResult}
					runId={runId}
				/>
			)}

			{step === "detail" && runId && selectedEmployeeId && (
				<PayslipDetailStep
					employeeId={selectedEmployeeId}
					onBack={() => {
						setSelectedEmployeeId(null);
						setStep("review");
					}}
					runId={runId}
				/>
			)}

			{step === "finalize" && runId && previewResult && (
				<FinalizeStep
					confirming={confirming}
					onBack={() => setStep("review")}
					onConfirm={async () => {
						setConfirming(true);
						try {
							await client.payroll.runs.confirm({ id: runId });
							toast.success("Payroll confirmed successfully");
							qc.invalidateQueries();
							setStep("finalize");
						} catch (e: unknown) {
							toast.error(e instanceof Error ? e.message : "Failed to confirm");
						} finally {
							setConfirming(false);
						}
					}}
					previewResult={previewResult}
					runId={runId}
				/>
			)}
		</div>
	);
}

interface PreviewSummary {
	blockerCount: number;
	employeeCount: number;
	id: string;
	totalDeductions: number;
	totalGross: number;
	totalNet: number;
	warningCount: number;
}

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
	const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
	return (
		<div className="approval-chain" style={{ marginBottom: 18 }}>
			<div className="chain">
				{STEPS.map((s, i) => {
					let cls = "chain-step";
					if (i < currentIdx) {
						cls += " done";
					}
					if (i === currentIdx) {
						cls += " current";
					}
					return (
						<div className={cls} key={s.key}>
							<div className="chain-dot">
								{i < currentIdx ? <Check size={10} /> : s.num}
							</div>
							<span className="step-title">{s.label}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function PeriodStep({
	selectedPeriodId,
	onNext,
}: {
	selectedPeriodId: string | null;
	onNext: (periodId: string) => void;
}) {
	const [selected, setSelected] = useState<string | null>(selectedPeriodId);

	const { data, isLoading } = useQuery(
		orpc.payroll.payPeriods.list.queryOptions({
			input: { status: "open", page: 1, pageSize: 20 },
		})
	);

	const periods = data?.data ?? [];

	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>
					Select a pay period
				</span>
			</div>
			<div style={{ padding: 16 }}>
				{isLoading && (
					<div
						style={{ color: "var(--fg-3)", padding: 20, textAlign: "center" }}
					>
						Loading pay periods...
					</div>
				)}
				{!isLoading && periods.length === 0 && (
					<div
						style={{
							padding: 40,
							textAlign: "center",
							color: "var(--fg-3)",
						}}
					>
						<Clock
							size={32}
							style={{ marginBottom: 8, color: "var(--fg-4)" }}
						/>
						<div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
							No open pay periods
						</div>
						<div style={{ fontSize: 12.5 }}>
							Create a pay period in Payroll Settings before running payroll.
						</div>
					</div>
				)}
				{!isLoading &&
					periods.length > 0 &&
					periods.map((p: Record<string, unknown>) => (
						<button
							key={p.id as string}
							onClick={() => setSelected(p.id as string)}
							style={{
								display: "flex",
								width: "100%",
								alignItems: "center",
								gap: 14,
								padding: "14px 16px",
								marginBottom: 6,
								background:
									selected === p.id ? "var(--accent-soft)" : "var(--bg-2)",
								border:
									selected === p.id
										? "1px solid var(--accent)"
										: "1px solid var(--line)",
								borderRadius: 12,
								cursor: "pointer",
								textAlign: "left",
								fontFamily: "inherit",
								fontSize: 13,
								color: "var(--fg)",
							}}
							type="button"
						>
							<div style={{ flex: 1 }}>
								<div style={{ fontWeight: 500 }}>{p.name as string}</div>
								<div
									style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}
								>
									{fmtDate(p.startDate as string)} —{" "}
									{fmtDate(p.endDate as string)} · {p.frequency as string} ·{" "}
									{p.workingDays as number} working days
								</div>
							</div>
							{selected === p.id && (
								<CheckCircle size={18} style={{ color: "var(--accent)" }} />
							)}
						</button>
					))}
			</div>
			{selected && (
				<div
					style={{
						padding: "12px 16px",
						borderTop: "1px solid var(--line)",
						display: "flex",
						justifyContent: "flex-end",
					}}
				>
					<button
						className="btn btn-primary"
						onClick={() => onNext(selected)}
						type="button"
					>
						Continue
						<ArrowRight size={13} />
					</button>
				</div>
			)}
		</div>
	);
}

function ReadinessStep({
	onBack,
	onNext,
	generating,
}: {
	onBack: () => void;
	onNext: () => void;
	generating: boolean;
}) {
	const { data: settings } = useQuery(
		orpc.payroll.settings.get.queryOptions({})
	);
	const { data: profiles } = useQuery(
		orpc.payroll.settings.listCountryProfiles.queryOptions({})
	);
	const activeProfile = profiles?.find(
		(p: { isActive: boolean }) => p.isActive
	);

	const checks = [
		{
			label: "Country payroll profile",
			ok: !!activeProfile,
			detail: activeProfile
				? `${(activeProfile as Record<string, unknown>).countryName} ${(activeProfile as Record<string, unknown>).effectiveYear}`
				: "Not configured",
		},
		{
			label: "Payroll settings",
			ok: !!settings,
			detail: settings ? "Configured" : "Not configured",
		},
		{
			label: "Pay items",
			ok: !!settings,
			detail: "PAYE, NIS, allowances configured",
		},
	];

	const allReady = checks.every((c) => c.ok);

	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>Payroll readiness</span>
				<span
					className={`badge ${allReady ? "badge-success" : "badge-warning"}`}
					style={{ fontSize: 10 }}
				>
					{allReady ? "Ready" : "Needs review"}
				</span>
			</div>
			<div style={{ padding: 16 }}>
				{checks.map((c) => (
					<div className="ck-item" key={c.label}>
						<div className={`ck-tick ${c.ok ? "done" : "warn"}`}>
							{c.ok ? <Check size={10} /> : <AlertTriangle size={10} />}
						</div>
						<div className="ck-body">
							<div className="ttl">{c.label}</div>
							<div className="sub">{c.detail}</div>
						</div>
					</div>
				))}
				<div
					style={{
						marginTop: 16,
						padding: 12,
						background: "var(--bg-2)",
						borderRadius: 10,
						fontSize: 12.5,
						color: "var(--fg-3)",
						lineHeight: 1.6,
					}}
				>
					Generating a preview will calculate payroll for all active employees.
					This does not finalize payroll — you can review and make changes
					before confirming.
				</div>
			</div>
			<div
				style={{
					padding: "12px 16px",
					borderTop: "1px solid var(--line)",
					display: "flex",
					justifyContent: "space-between",
				}}
			>
				<button className="btn btn-outline" onClick={onBack} type="button">
					<ArrowLeft size={13} />
					Back
				</button>
				<button
					className="btn btn-primary"
					disabled={generating}
					onClick={onNext}
					type="button"
				>
					{generating ? (
						<>Generating preview...</>
					) : (
						<>
							<Play size={13} />
							Generate preview
						</>
					)}
				</button>
			</div>
		</div>
	);
}

function ReviewStep({
	runId,
	previewResult,
	onBack,
	onViewDetail,
	onFinalize,
}: {
	runId: string;
	previewResult: PreviewSummary;
	onBack: () => void;
	onViewDetail: (empId: string) => void;
	onFinalize: () => void;
}) {
	const { data: payslips } = useQuery(
		orpc.payroll.payslips.list.queryOptions({
			input: { payrollRunId: runId, page: 1, pageSize: 100 },
		})
	);

	const { data: issues } = useQuery(
		orpc.payroll.issues.list.queryOptions({
			input: { payrollRunId: runId },
		})
	);

	const slips = (payslips?.data ?? []) as Record<string, unknown>[];
	const blockers = ((issues ?? []) as Record<string, unknown>[]).filter(
		(i) => i.issueType === "blocker"
	);
	const warnings = ((issues ?? []) as Record<string, unknown>[]).filter(
		(i) => i.issueType === "warning"
	);

	return (
		<>
			<div className="sum-row" style={{ marginBottom: 14 }}>
				<div className="sum-card accent">
					<span className="lbl">Employees</span>
					<span className="val">{previewResult.employeeCount}</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Total gross</span>
					<span className="val">
						${previewResult.totalGross.toLocaleString()}
					</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Total deductions</span>
					<span className="val">
						${previewResult.totalDeductions.toLocaleString()}
					</span>
				</div>
				<div className="sum-card">
					<span className="lbl">Total net</span>
					<span className="val">
						${previewResult.totalNet.toLocaleString()}
					</span>
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
				}}
			>
				<strong style={{ color: "var(--accent)" }}>Preview only</strong> — This
				is not finalized. Review each employee's payslip before confirming.
			</div>

			{blockers.length > 0 && (
				<div
					style={{
						marginBottom: 14,
						padding: 16,
						background: "var(--danger-soft)",
						border: "1px solid var(--danger)",
						borderRadius: 12,
					}}
				>
					<div
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--danger)",
							marginBottom: 8,
						}}
					>
						<AlertTriangle
							size={14}
							style={{ verticalAlign: -2, marginRight: 6 }}
						/>
						{blockers.length} blocker(s) — cannot finalize
					</div>
					{blockers.map((b) => (
						<div
							key={b.id as string}
							style={{
								fontSize: 12.5,
								padding: "6px 0",
								borderBottom: "1px dashed var(--line)",
							}}
						>
							<strong>{b.code as string}:</strong> {b.message as string}
							{b.resolution && (
								<span style={{ color: "var(--fg-3)" }}>
									{" "}
									— {b.resolution as string}
								</span>
							)}
						</div>
					))}
				</div>
			)}

			{warnings.length > 0 && (
				<div
					style={{
						marginBottom: 14,
						padding: 16,
						background: "var(--warning-soft)",
						border: "1px solid var(--warning)",
						borderRadius: 12,
					}}
				>
					<div
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--warning)",
							marginBottom: 8,
						}}
					>
						<AlertTriangle
							size={14}
							style={{ verticalAlign: -2, marginRight: 6 }}
						/>
						{warnings.length} warning(s) — review recommended
					</div>
					{warnings.map((w) => (
						<div
							key={w.id as string}
							style={{
								fontSize: 12.5,
								padding: "6px 0",
								borderBottom: "1px dashed var(--line)",
							}}
						>
							{w.message as string}
						</div>
					))}
				</div>
			)}

			<div className="emp-table">
				<div className="emp-head">
					<span style={{ fontWeight: 600, fontSize: 14 }}>
						Employee payslip previews
					</span>
					<span style={{ fontSize: 11, color: "var(--fg-3)" }}>
						{slips.length} employees
					</span>
				</div>
				<table>
					<thead>
						<tr>
							<th>Employee</th>
							<th style={{ textAlign: "right" }}>Gross</th>
							<th style={{ textAlign: "right" }}>Deductions</th>
							<th style={{ textAlign: "right" }}>Net pay</th>
							<th>Status</th>
							<th style={{ textAlign: "right" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{slips.map((s) => {
							const hasBlocker = (s.blockers as unknown[])?.length > 0;
							return (
								<tr
									className={hasBlocker ? "row-flag" : ""}
									key={s.id as string}
								>
									<td>
										<div style={{ fontWeight: 500 }}>
											{s.employeeId as string}
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--fg-3)",
												marginTop: 1,
											}}
										>
											{s.wageType as string} · {s.currency as string}
										</div>
									</td>
									<td className="num-cell">
										${Number(s.grossPay).toLocaleString()}
									</td>
									<td className="num-cell neg">
										${Number(s.totalDeductions).toLocaleString()}
									</td>
									<td className="num-cell">
										${Number(s.netPay).toLocaleString()}
									</td>
									<td>
										{hasBlocker ? (
											<span
												className="badge badge-danger"
												style={{ fontSize: 10 }}
											>
												Blocked
											</span>
										) : (
											<span
												className="badge badge-success"
												style={{ fontSize: 10 }}
											>
												Ready
											</span>
										)}
									</td>
									<td style={{ textAlign: "right" }}>
										<button
											className="btn btn-ghost btn-xs"
											onClick={() => onViewDetail(s.employeeId as string)}
											title="View payslip detail"
											type="button"
										>
											<Eye size={13} />
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<div
				style={{
					padding: "14px 0",
					display: "flex",
					justifyContent: "space-between",
					marginTop: 14,
				}}
			>
				<button className="btn btn-outline" onClick={onBack} type="button">
					<ArrowLeft size={13} />
					Back
				</button>
				<button
					className="btn btn-primary"
					disabled={previewResult.blockerCount > 0}
					onClick={onFinalize}
					title={
						previewResult.blockerCount > 0
							? "Resolve all blockers before confirming"
							: "Proceed to confirmation"
					}
					type="button"
				>
					<ShieldCheck size={13} />
					{previewResult.blockerCount > 0
						? `${previewResult.blockerCount} blocker(s) — cannot confirm`
						: "Proceed to confirm"}
				</button>
			</div>
		</>
	);
}

function PayslipDetailStep({
	runId,
	employeeId,
	onBack,
}: {
	runId: string;
	employeeId: string;
	onBack: () => void;
}) {
	const { data: payslips } = useQuery(
		orpc.payroll.payslips.list.queryOptions({
			input: { payrollRunId: runId, employeeId, page: 1, pageSize: 1 },
		})
	);

	const payslipRow = (payslips?.data ?? [])[0] as
		| Record<string, unknown>
		| undefined;
	const payslipId = payslipRow?.id as string | undefined;

	const { data: detail } = useQuery({
		...orpc.payroll.payslips.getById.queryOptions({
			input: { id: payslipId ?? "" },
		}),
		enabled: !!payslipId,
	});

	const slip = detail as Record<string, unknown> | undefined;
	const lineItems = (slip?.lineItems ?? []) as Record<string, unknown>[];
	const explanations = (slip?.explanation ?? []) as Record<string, unknown>[];

	return (
		<div>
			<button
				className="btn btn-outline"
				onClick={onBack}
				style={{ marginBottom: 14 }}
				type="button"
			>
				<ArrowLeft size={13} />
				Back to review
			</button>

			{slip ? (
				<div className="payroll-grid">
					<div className="left-col">
						<div
							style={{
								padding: "10px 16px",
								marginBottom: 14,
								background: "var(--accent-soft)",
								border: "1px solid var(--accent)",
								borderRadius: 12,
								fontSize: 12.5,
								color: "var(--fg-2)",
							}}
						>
							Preview only — this is not a finalized payslip. Final payslip is
							created only after payroll is confirmed.
						</div>

						<div className="emp-table">
							<div className="emp-head">
								<span style={{ fontWeight: 600, fontSize: 14 }}>
									Payslip line items
								</span>
							</div>
							<table>
								<thead>
									<tr>
										<th>Item</th>
										<th>Category</th>
										<th>Taxable</th>
										<th style={{ textAlign: "right" }}>Amount</th>
									</tr>
								</thead>
								<tbody>
									{lineItems.map((li) => (
										<tr key={li.id as string}>
											<td>
												<div style={{ fontWeight: 500 }}>
													{li.title as string}
												</div>
												{li.explanation && (
													<div
														style={{
															fontSize: 11,
															color: "var(--fg-3)",
															marginTop: 1,
														}}
													>
														{li.explanation as string}
													</div>
												)}
											</td>
											<td style={{ fontSize: 12, color: "var(--fg-3)" }}>
												{li.category as string}
											</td>
											<td>{(li.isTaxable as boolean) ? "Yes" : "No"}</td>
											<td
												className={`num-cell ${Number(li.amount) < 0 ? "neg" : ""}`}
											>
												${Number(li.amount).toLocaleString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{explanations.length > 0 && (
							<div className="emp-table" style={{ marginTop: 14 }}>
								<div className="emp-head">
									<span style={{ fontWeight: 600, fontSize: 14 }}>
										How this was calculated
									</span>
								</div>
								<div style={{ padding: 16 }}>
									{explanations.map((e) => (
										<div className="fact-row" key={e.step as number}>
											<span className="k">
												Step {e.step as number}: {e.label as string}
											</span>
											<span className="v">
												${Number(e.result).toLocaleString()}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="right-col">
						<div className="side-card">
							<div className="side-head">
								<span className="ttl">Pay summary</span>
							</div>
							<div className="side-body">
								<div className="fact-row">
									<span className="k">Period</span>
									<span className="v">
										{fmtDate(slip.periodStart as string)} —{" "}
										{fmtDate(slip.periodEnd as string)}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Wage type</span>
									<span className="v">{slip.wageType as string}</span>
								</div>
								<div className="fact-row">
									<span className="k">Currency</span>
									<span className="v">{slip.currency as string}</span>
								</div>
								<div
									style={{
										height: 1,
										background: "var(--line)",
										margin: "8px 0",
									}}
								/>
								<div className="fact-row">
									<span className="k">Basic pay</span>
									<span className="v">
										${Number(slip.basicPay).toLocaleString()}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Gross pay</span>
									<span className="v">
										${Number(slip.grossPay).toLocaleString()}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Taxable gross</span>
									<span className="v">
										${Number(slip.taxableGross).toLocaleString()}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Total deductions</span>
									<span className="v" style={{ color: "var(--danger)" }}>
										-${Number(slip.totalDeductions).toLocaleString()}
									</span>
								</div>
								<div
									style={{
										height: 1,
										background: "var(--line)",
										margin: "8px 0",
									}}
								/>
								<div className="fact-row">
									<span
										className="k"
										style={{ fontWeight: 600, color: "var(--fg)" }}
									>
										Net pay
									</span>
									<span
										className="v"
										style={{ fontSize: 16, color: "var(--accent)" }}
									>
										${Number(slip.netPay).toLocaleString()}
									</span>
								</div>
							</div>
						</div>

						<div className="side-card">
							<div className="side-head">
								<span className="ttl">Hours &amp; leave</span>
							</div>
							<div className="side-body">
								<div className="fact-row">
									<span className="k">Worked days</span>
									<span className="v">{slip.workedDays as string}</span>
								</div>
								<div className="fact-row">
									<span className="k">Worked hours</span>
									<span className="v">
										{Number(slip.workedHours).toFixed(1)}h
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Overtime hours</span>
									<span className="v">
										{Number(slip.overtimeHours).toFixed(1)}h
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Paid leave</span>
									<span className="v">{slip.paidLeaveDays as string} days</span>
								</div>
								<div className="fact-row">
									<span className="k">Unpaid leave</span>
									<span className="v">
										{slip.unpaidLeaveDays as string} days
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : (
				<div
					style={{
						padding: 40,
						textAlign: "center",
						color: "var(--fg-3)",
					}}
				>
					Loading payslip detail...
				</div>
			)}
		</div>
	);
}

function FinalizeStep({
	runId,
	previewResult,
	onBack,
	onConfirm,
	confirming,
}: {
	runId: string;
	previewResult: PreviewSummary;
	onBack: () => void;
	onConfirm: () => void;
	confirming: boolean;
}) {
	const { data: run } = useQuery(
		orpc.payroll.runs.getById.queryOptions({ input: { id: runId } })
	);

	const runStatus = (run as Record<string, unknown> | undefined)?.status as
		| string
		| undefined;
	const isConfirmed = runStatus === "confirmed" || runStatus === "paid";

	if (isConfirmed) {
		return (
			<div
				style={{
					padding: 40,
					textAlign: "center",
				}}
			>
				<CheckCircle
					size={48}
					style={{ color: "var(--success)", marginBottom: 12 }}
				/>
				<h2 style={{ fontSize: 20, marginBottom: 8 }}>Payroll confirmed</h2>
				<p style={{ color: "var(--fg-3)", fontSize: 14, marginBottom: 16 }}>
					{previewResult.employeeCount} payslips generated. Total net:{" "}
					<strong>${previewResult.totalNet.toLocaleString()}</strong>
				</p>
				<div style={{ fontSize: 12, color: "var(--fg-4)" }}>
					Run ID: {runId}
				</div>
			</div>
		);
	}

	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>Confirm payroll</span>
			</div>
			<div style={{ padding: 24 }}>
				<div
					style={{
						padding: 16,
						background: "var(--warning-soft)",
						border: "1px solid var(--warning)",
						borderRadius: 12,
						marginBottom: 20,
						fontSize: 13,
						lineHeight: 1.6,
					}}
				>
					<strong>This action will finalize the payroll run.</strong> Once
					confirmed, payslips will be locked and visible to employees. Ensure
					all blockers are resolved and previews are reviewed before proceeding.
				</div>

				<div className="sum-row" style={{ marginBottom: 20 }}>
					<div className="sum-card">
						<span className="lbl">Employees</span>
						<span className="val">{previewResult.employeeCount}</span>
					</div>
					<div className="sum-card">
						<span className="lbl">Total net</span>
						<span className="val">
							${previewResult.totalNet.toLocaleString()}
						</span>
					</div>
					<div className="sum-card">
						<span className="lbl">Blockers</span>
						<span className="val">{previewResult.blockerCount}</span>
					</div>
					<div className="sum-card">
						<span className="lbl">Warnings</span>
						<span className="val">{previewResult.warningCount}</span>
					</div>
				</div>

				{previewResult.blockerCount > 0 && (
					<div
						style={{
							padding: 12,
							background: "var(--danger-soft)",
							border: "1px solid var(--danger)",
							borderRadius: 10,
							fontSize: 13,
							color: "var(--danger)",
							marginBottom: 16,
						}}
					>
						Cannot confirm — {previewResult.blockerCount} unresolved blocker(s).
						Go back and resolve them first.
					</div>
				)}
			</div>
			<div
				style={{
					padding: "12px 16px",
					borderTop: "1px solid var(--line)",
					display: "flex",
					justifyContent: "space-between",
				}}
			>
				<button className="btn btn-outline" onClick={onBack} type="button">
					<ArrowLeft size={13} />
					Back to review
				</button>
				<button
					className="btn btn-primary"
					disabled={previewResult.blockerCount > 0 || confirming}
					onClick={onConfirm}
					type="button"
				>
					<ShieldCheck size={13} />
					{confirming ? "Confirming..." : "Confirm and finalize payroll"}
				</button>
			</div>
		</div>
	);
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
