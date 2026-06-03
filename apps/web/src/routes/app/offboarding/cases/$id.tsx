import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useContext, useState } from "react";

import "@/styles/offboarding.css";
import { EmptyState } from "@/components/empty-state";
import { AssetCustodyPanel } from "@/features/assets/custody-panel";
import {
	accessStatusLabel,
	accessStatusTone,
	assetStatusLabel,
	assetStatusTone,
	caseStatusLabel,
	caseStatusTone,
	categoryLabel,
	docStatusLabel,
	docStatusTone,
	exitTypeLabel,
	isTaskResolved,
	taskStatusLabel,
	taskStatusTone,
} from "@/features/offboarding/labels";
import {
	AccessActions,
	AddAccessDialog,
} from "@/features/offboarding/offboarding-access-actions";
import {
	AddAssetDialog,
	AssetActions,
} from "@/features/offboarding/offboarding-asset-actions";
import { CaseStatusActions } from "@/features/offboarding/offboarding-case-actions";
import {
	AddDocumentDialog,
	DocumentActions,
} from "@/features/offboarding/offboarding-document-actions";
import {
	type InterviewDefaults,
	InterviewDialog,
} from "@/features/offboarding/offboarding-interview-dialog";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";
import { TaskActions } from "@/features/offboarding/offboarding-task-actions";
import {
	canManageOffboarding,
	canReadOffboardingSettlement,
	canViewOffboarding,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/offboarding/cases/$id")({
	component: CaseDetailPage,
});

function fmtDate(value: string | Date | null | undefined): string {
	return value ? new Date(value).toLocaleDateString() : "Not set";
}

// cases.getById returns Record<string, unknown> because the API's redactCase
// helper is generically typed; cast to the fields we actually read.
interface CaseView {
	employeeId: string;
	exitReason: string | null;
	exitType: string;
	id: string;
	internalNote: string | null;
	lastWorkingDay: string | null;
	noticePeriodDays: number | null;
	status: string;
	templateId: string | null;
}

function CaseDetailPage() {
	const org = useContext(OrgCtx);
	if (!canViewOffboarding(org.memberRole)) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Offboarding case</h1>
				</div>
				<div className="card card-pad">
					<EmptyState
						description="Offboarding case access is available to HR and administrators."
						title="You don't have access to this case"
					/>
				</div>
			</div>
		);
	}
	return (
		<CaseDetail
			canManage={canManageOffboarding(org.memberRole)}
			canSeeSettlement={canReadOffboardingSettlement(org.memberRole)}
		/>
	);
}

function useCaseDetailData(id: string) {
	const caseQ = useQuery(
		// Don't retry: a 403 (manager scope) or 404 won't change on retry, so the
		// no-access state should show immediately instead of after backoff.
		orpc.offboarding.cases.getById.queryOptions({ input: { id }, retry: false })
	);
	const c = caseQ.data as CaseView | undefined;
	// Gate the per-case lists on the case being visible. If getById is forbidden
	// (manager scope) or 404s, these never fire — no cascade of 403s.
	const caseVisible = Boolean(c);
	const tasksQ = useQuery(
		orpc.offboarding.tasks.list.queryOptions({
			input: { caseId: id },
			enabled: caseVisible,
		})
	);
	const assetsQ = useQuery(
		orpc.offboarding.assets.list.queryOptions({
			input: { caseId: id },
			enabled: caseVisible,
		})
	);
	const accessQ = useQuery(
		orpc.offboarding.access.list.queryOptions({
			input: { caseId: id },
			enabled: caseVisible,
		})
	);
	const docsQ = useQuery(
		orpc.offboarding.documents.list.queryOptions({
			input: { caseId: id },
			enabled: caseVisible,
		})
	);
	const employeeQ = useQuery(
		orpc.hrCore.employees.getById.queryOptions({
			input: { id: c?.employeeId ?? "" },
			enabled: Boolean(c?.employeeId),
		})
	);
	const templateQ = useQuery(
		orpc.offboarding.templates.getById.queryOptions({
			input: { id: c?.templateId ?? "" },
			enabled: Boolean(c?.templateId),
		})
	);

	const tasks = tasksQ.data ?? [];
	const assets = assetsQ.data ?? [];
	const access = accessQ.data ?? [];
	const docs = docsQ.data ?? [];

	return {
		c,
		caseLoading: caseQ.isLoading,
		tasks,
		assets,
		access,
		docs,
		tasksLoading: tasksQ.isLoading,
		assetsLoading: assetsQ.isLoading,
		accessLoading: accessQ.isLoading,
		docsLoading: docsQ.isLoading,
		employeeName: employeeQ.data
			? `${employeeQ.data.firstName}${employeeQ.data.lastName ? ` ${employeeQ.data.lastName}` : ""}`
			: "Employee",
		managerName: employeeQ.data?.workInfo?.reportingManagerName ?? null,
		templateName: templateQ.data?.name ?? null,
		attention: buildAttention({
			pendingTasks: tasks.filter((t) => !isTaskResolved(t.status)).length,
			pendingAssets: assets.filter((a) => a.status === "pending").length,
			pendingAccess: access.filter((a) => a.status === "pending").length,
			pendingDocs: docs.filter(
				(d) => d.status !== "approved" && d.status !== "waived"
			).length,
		}),
	};
}

function CaseDetail({
	canManage,
	canSeeSettlement,
}: {
	canManage: boolean;
	canSeeSettlement: boolean;
}) {
	const { id } = Route.useParams();
	const {
		c,
		caseLoading,
		tasks,
		assets,
		access,
		docs,
		tasksLoading,
		assetsLoading,
		accessLoading,
		docsLoading,
		employeeName,
		managerName,
		templateName,
		attention,
	} = useCaseDetailData(id);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/offboarding/cases"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Cases
						</Link>
						<span className="sep">/</span>
						<span>{employeeName}</span>
					</div>
					<h1 className="page-title">{employeeName}</h1>
					<p className="page-sub">
						{c ? exitTypeLabel(c.exitType) : "Loading…"}
						{c?.status ? " · " : ""}
						{c ? caseStatusLabel(c.status) : ""}
					</p>
				</div>
				{c && (
					<div
						className="page-actions"
						style={{ display: "flex", alignItems: "center", gap: 10 }}
					>
						<span className={caseStatusTone(c.status)}>
							{caseStatusLabel(c.status)}
						</span>
						{canManage && <CaseStatusActions caseId={id} status={c.status} />}
					</div>
				)}
			</div>

			<OffboardingTabs />

			{caseLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading case…
				</div>
			)}

			{!(caseLoading || c) && (
				<div className="card card-pad">
					<EmptyState
						description="This offboarding case may not exist, or you may not have access to it."
						title="Case not available"
					/>
				</div>
			)}

			{c && (
				<>
					<AttentionPanel
						items={attention}
						loading={
							tasksLoading || assetsLoading || accessLoading || docsLoading
						}
						status={c.status}
					/>
					<SummarySection
						caseRow={c}
						employeeName={employeeName}
						managerName={managerName}
						templateName={templateName}
					/>
					<TasksSection
						canManage={canManage}
						loading={tasksLoading}
						tasks={tasks}
					/>
					<AssetsSection
						assets={assets}
						canManage={canManage}
						caseId={id}
						loading={assetsLoading}
					/>
					{c.employeeId ? (
						<AssetCustodyPanel employeeId={c.employeeId} />
					) : null}
					<AccessSection
						access={access}
						canManage={canManage}
						caseId={id}
						loading={accessLoading}
					/>
					<DocumentsSection
						canManage={canManage}
						caseId={id}
						docs={docs}
						loading={docsLoading}
					/>
					<InterviewSection canManage={canManage} caseId={id} />
					{canSeeSettlement ? (
						<SettlementSection caseId={id} />
					) : (
						<SectionCard title="Final settlement readiness">
							<p style={{ color: "var(--fg-3)", fontSize: 12.5, margin: 0 }}>
								Final payroll readiness is available to HR and payroll roles.
							</p>
						</SectionCard>
					)}
					<ActivitySection caseId={id} />
				</>
			)}
		</div>
	);
}

// ── Shared section wrapper ──
function SectionCard({
	title,
	subtitle,
	action,
	children,
}: {
	title: string;
	subtitle?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="card" style={{ overflow: "hidden", marginBottom: 14 }}>
			<div className="card-pad" style={{ paddingBottom: subtitle ? 12 : 0 }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						gap: 12,
					}}
				>
					<div className="eyebrow">{title}</div>
					{action}
				</div>
				{subtitle && (
					<p style={{ color: "var(--fg-3)", fontSize: 12, margin: "6px 0 0" }}>
						{subtitle}
					</p>
				)}
			</div>
			{children}
		</div>
	);
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button className="btn btn-sm" onClick={onClick} type="button">
			<Plus size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
			{label}
		</button>
	);
}

function EmptyRow({ text }: { text: string }) {
	return (
		<div className="card-pad" style={{ color: "var(--fg-3)", fontSize: 13 }}>
			{text}
		</div>
	);
}

// ── What needs attention ──
interface AttentionItem {
	key: string;
	label: string;
}

function buildAttention(counts: {
	pendingTasks: number;
	pendingAssets: number;
	pendingAccess: number;
	pendingDocs: number;
}): AttentionItem[] {
	const items: AttentionItem[] = [];
	if (counts.pendingTasks > 0) {
		items.push({
			key: "tasks",
			label: `${counts.pendingTasks} clearance task${counts.pendingTasks === 1 ? "" : "s"} still open`,
		});
	}
	if (counts.pendingAssets > 0) {
		items.push({
			key: "assets",
			label: `${counts.pendingAssets} asset${counts.pendingAssets === 1 ? "" : "s"} not yet returned`,
		});
	}
	if (counts.pendingAccess > 0) {
		items.push({
			key: "access",
			label: `${counts.pendingAccess} access item${counts.pendingAccess === 1 ? "" : "s"} not yet revoked`,
		});
	}
	if (counts.pendingDocs > 0) {
		items.push({
			key: "docs",
			label: `${counts.pendingDocs} document${counts.pendingDocs === 1 ? "" : "s"} outstanding`,
		});
	}
	return items;
}

function AttentionPanel({
	items,
	loading,
	status,
}: {
	items: AttentionItem[];
	loading: boolean;
	status: string;
}) {
	let body: ReactNode;
	if (loading) {
		body = <span style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</span>;
	} else if (items.length === 0) {
		body = (
			<span style={{ fontSize: 13, color: "var(--fg-3)" }}>
				{status === "closed"
					? "This case is closed."
					: "Nothing is outstanding right now."}
			</span>
		);
	} else {
		body = (
			<ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
				{items.map((item) => (
					<li key={item.key} style={{ fontSize: 13, color: "var(--fg)" }}>
						{item.label}
					</li>
				))}
			</ul>
		);
	}
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div
				className="eyebrow"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 10,
				}}
			>
				<AlertTriangle size={14} /> What needs attention
			</div>
			{body}
		</div>
	);
}

// ── Summary ──
function SummarySection({
	caseRow,
	employeeName,
	managerName,
	templateName,
}: {
	caseRow: CaseView;
	employeeName: string;
	managerName: string | null;
	templateName: string | null;
}) {
	return (
		<div
			className="card card-pad"
			style={{ marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}
		>
			<Field label="Employee" value={employeeName} />
			<Field label="Exit type" value={exitTypeLabel(caseRow.exitType)} />
			<Field
				label="Status"
				value={
					<span className={caseStatusTone(caseRow.status)}>
						{caseStatusLabel(caseRow.status)}
					</span>
				}
			/>
			<Field label="Last working day" value={fmtDate(caseRow.lastWorkingDay)} />
			<Field
				label="Notice period"
				value={
					caseRow.noticePeriodDays == null
						? "—"
						: `${caseRow.noticePeriodDays} days`
				}
			/>
			<Field label="Manager" value={managerName ?? "—"} />
			<Field label="Template" value={templateName ?? "None"} />
			{caseRow.exitReason && (
				<Field label="Reason" value={caseRow.exitReason} />
			)}
			{caseRow.internalNote && (
				<Field label="Internal note (HR only)" value={caseRow.internalNote} />
			)}
		</div>
	);
}

function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 120,
			}}
		>
			<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{label}</span>
			<span style={{ fontSize: 13.5, color: "var(--fg)" }}>{value}</span>
		</div>
	);
}

// ── Tasks ──
interface TaskRow {
	category: string;
	descriptionSnapshot: string | null;
	dueAt: string | Date | null;
	id: string;
	status: string;
	titleSnapshot: string;
}

function TasksSection({
	tasks,
	loading,
	canManage,
}: {
	tasks: TaskRow[];
	loading: boolean;
	canManage: boolean;
}) {
	const done = tasks.filter((t) => isTaskResolved(t.status)).length;
	return (
		<SectionCard
			subtitle={
				tasks.length > 0 ? `${done} of ${tasks.length} resolved` : undefined
			}
			title="Clearance tasks"
		>
			{loading && <EmptyRow text="Loading tasks…" />}
			{!loading && tasks.length === 0 && (
				<EmptyRow text="No clearance tasks on this case." />
			)}
			{!loading && tasks.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>Task</th>
							<th>Category</th>
							<th>Due</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{tasks.map((t) => (
							<tr key={t.id}>
								<td>
									<div style={{ fontWeight: 600, color: "var(--fg)" }}>
										{t.titleSnapshot}
									</div>
									{t.descriptionSnapshot && (
										<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
											{t.descriptionSnapshot}
										</div>
									)}
								</td>
								<td>
									<span className="badge">{categoryLabel(t.category)}</span>
								</td>
								<td style={{ color: "var(--fg-3)" }}>{fmtDate(t.dueAt)}</td>
								<td>
									<span className={taskStatusTone(t.status)}>
										{taskStatusLabel(t.status)}
									</span>
								</td>
								{canManage && (
									<td>
										<TaskActions
											status={t.status}
											taskId={t.id}
											taskTitle={t.titleSnapshot}
										/>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</SectionCard>
	);
}

// ── Assets ──
interface AssetRow {
	assetDescription: string;
	assetTag: string | null;
	expectedReturnDate: string | Date | null;
	id: string;
	status: string;
}

function AssetsSection({
	assets,
	loading,
	canManage,
	caseId,
}: {
	assets: AssetRow[];
	loading: boolean;
	canManage: boolean;
	caseId: string;
}) {
	const [addOpen, setAddOpen] = useState(false);
	return (
		<SectionCard
			action={
				canManage ? (
					<AddButton label="Add asset" onClick={() => setAddOpen(true)} />
				) : undefined
			}
			title="Asset returns"
		>
			{loading && <EmptyRow text="Loading assets…" />}
			{!loading && assets.length === 0 && (
				<EmptyRow text="No assets to recover for this exit." />
			)}
			{!loading && assets.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>Asset</th>
							<th>Tag</th>
							<th>Expected return</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{assets.map((a) => (
							<tr key={a.id}>
								<td style={{ fontWeight: 600, color: "var(--fg)" }}>
									{a.assetDescription}
								</td>
								<td style={{ color: "var(--fg-3)" }}>{a.assetTag ?? "—"}</td>
								<td style={{ color: "var(--fg-3)" }}>
									{fmtDate(a.expectedReturnDate)}
								</td>
								<td>
									<span className={assetStatusTone(a.status)}>
										{assetStatusLabel(a.status)}
									</span>
								</td>
								{canManage && (
									<td>
										<AssetActions
											assetDescription={a.assetDescription}
											assetId={a.id}
											status={a.status}
										/>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			)}
			{addOpen && (
				<AddAssetDialog caseId={caseId} onClose={() => setAddOpen(false)} />
			)}
		</SectionCard>
	);
}

// ── Access ──
interface AccessRow {
	description: string | null;
	id: string;
	status: string;
	system: string;
}

function AccessSection({
	access,
	loading,
	canManage,
	caseId,
}: {
	access: AccessRow[];
	loading: boolean;
	canManage: boolean;
	caseId: string;
}) {
	const [addOpen, setAddOpen] = useState(false);
	return (
		<SectionCard
			action={
				canManage ? (
					<AddButton label="Add access item" onClick={() => setAddOpen(true)} />
				) : undefined
			}
			subtitle="Access changes are tracked here after accounts are disabled outside Heimdallone."
			title="Access removal"
		>
			{loading && <EmptyRow text="Loading access items…" />}
			{!loading && access.length === 0 && (
				<EmptyRow text="No access removal items on this case." />
			)}
			{!loading && access.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>System / account</th>
							<th>Notes</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{access.map((a) => (
							<tr key={a.id}>
								<td style={{ fontWeight: 600, color: "var(--fg)" }}>
									{a.system}
								</td>
								<td style={{ color: "var(--fg-3)" }}>{a.description ?? "—"}</td>
								<td>
									<span className={accessStatusTone(a.status)}>
										{accessStatusLabel(a.status)}
									</span>
								</td>
								{canManage && (
									<td>
										<AccessActions
											accessId={a.id}
											status={a.status}
											system={a.system}
										/>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			)}
			{addOpen && (
				<AddAccessDialog caseId={caseId} onClose={() => setAddOpen(false)} />
			)}
		</SectionCard>
	);
}

// ── Documents ──
interface DocRow {
	documentType: string;
	id: string;
	status: string;
	title: string;
}

function DocumentsSection({
	docs,
	loading,
	canManage,
	caseId,
}: {
	docs: DocRow[];
	loading: boolean;
	canManage: boolean;
	caseId: string;
}) {
	const [addOpen, setAddOpen] = useState(false);
	return (
		<SectionCard
			action={
				canManage ? (
					<AddButton
						label="Request document"
						onClick={() => setAddOpen(true)}
					/>
				) : undefined
			}
			title="Documents"
		>
			{loading && <EmptyRow text="Loading documents…" />}
			{!loading && docs.length === 0 && (
				<EmptyRow text="No document requests on this case." />
			)}
			{!loading && docs.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>Document</th>
							<th>Type</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{docs.map((d) => (
							<tr key={d.id}>
								<td style={{ fontWeight: 600, color: "var(--fg)" }}>
									{d.title}
								</td>
								<td style={{ color: "var(--fg-3)" }}>{d.documentType}</td>
								<td>
									<span className={docStatusTone(d.status)}>
										{docStatusLabel(d.status)}
									</span>
								</td>
								{canManage && (
									<td>
										<DocumentActions
											docId={d.id}
											status={d.status}
											title={d.title}
										/>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			)}
			{addOpen && (
				<AddDocumentDialog caseId={caseId} onClose={() => setAddOpen(false)} />
			)}
		</SectionCard>
	);
}

// Map the redacted interview read row into the dialog's prefill shape.
function toInterviewDefaults(
	interview: Record<string, unknown> | null | undefined
): InterviewDefaults | null {
	if (!interview) {
		return null;
	}
	return {
		conductedAt: (interview.conductedAt as string | Date | null) ?? null,
		isPrivate: (interview.isPrivate as boolean | null) ?? null,
		overallRating: (interview.overallRating as number | null) ?? null,
		reasonForLeaving: (interview.reasonForLeaving as string | null) ?? null,
		whatWentWell: (interview.whatWentWell as string | null) ?? null,
		whatCouldImprove: (interview.whatCouldImprove as string | null) ?? null,
		wouldRehire: (interview.wouldRehire as boolean | null) ?? null,
		internalNotes: (interview.internalNotes as string | null) ?? null,
	};
}

// ── Exit interview (owns its query; API redacts private/HR-only fields) ──
function InterviewSection({
	caseId,
	canManage,
}: {
	caseId: string;
	canManage: boolean;
}) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const interviewQ = useQuery(
		orpc.offboarding.interviews.getByCaseId.queryOptions({ input: { caseId } })
	);
	const interview = interviewQ.data;
	const existing = toInterviewDefaults(
		interview as Record<string, unknown> | null | undefined
	);
	return (
		<SectionCard
			action={
				canManage ? (
					<button
						className="btn btn-sm"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						{interview ? "Edit interview" : "Record interview"}
					</button>
				) : undefined
			}
			title="Exit interview"
		>
			{dialogOpen && (
				<InterviewDialog
					caseId={caseId}
					existing={existing}
					onClose={() => setDialogOpen(false)}
				/>
			)}
			{interviewQ.isLoading && <EmptyRow text="Loading…" />}
			{!(interviewQ.isLoading || interview) && (
				<EmptyRow text="No exit interview recorded." />
			)}
			{interview && (
				<div
					className="card-pad"
					style={{ display: "flex", gap: 24, flexWrap: "wrap" }}
				>
					<Field label="Conducted" value={fmtDate(interview.conductedAt)} />
					<Field
						label="Visibility"
						value={interview.isPrivate ? "Private (HR only)" : "Shared"}
					/>
					{interview.overallRating != null && (
						<Field
							label="Overall rating"
							value={`${interview.overallRating} / 5`}
						/>
					)}
					{interview.reasonForLeaving && (
						<Field
							label="Reason for leaving"
							value={interview.reasonForLeaving}
						/>
					)}
					{interview.internalNotes && (
						<Field label="HR notes" value={interview.internalNotes} />
					)}
				</div>
			)}
		</SectionCard>
	);
}

// ── Settlement readiness (HR / payroll / auditor only) ──
function SettlementSection({ caseId }: { caseId: string }) {
	const readinessQ = useQuery(
		orpc.offboarding.settlement.getReadiness.queryOptions({ input: { caseId } })
	);
	const r = readinessQ.data;
	return (
		<SectionCard
			subtitle="Final payroll calculation is handled later. This panel shows readiness only."
			title="Final settlement readiness"
		>
			{readinessQ.isLoading && <EmptyRow text="Loading…" />}
			{r && (
				<div
					className="card-pad"
					style={{ display: "flex", gap: 24, flexWrap: "wrap" }}
				>
					<Field label="Pending tasks" value={`${r.pendingTasks}`} />
					<Field
						label="Pending asset returns"
						value={`${r.pendingAssetReturns}`}
					/>
					<Field
						label="Pending access removals"
						value={`${r.pendingAccessRevocations}`}
					/>
					<Field label="Pending documents" value={`${r.pendingDocuments}`} />
					<Field
						label="Active contract"
						value={r.contractActivePrompt ? "Yes — review separately" : "No"}
					/>
				</div>
			)}
		</SectionCard>
	);
}

// ── Activity ──
function ActivitySection({ caseId }: { caseId: string }) {
	const activityQ = useQuery(
		orpc.offboarding.activity.list.queryOptions({ input: { caseId } })
	);
	const rows = activityQ.data ?? [];
	return (
		<SectionCard title="Activity">
			{activityQ.isLoading && <EmptyRow text="Loading…" />}
			{!activityQ.isLoading && rows.length === 0 && (
				<EmptyRow text="No activity yet." />
			)}
			{rows.length > 0 && (
				<div className="card-pad" style={{ display: "grid", gap: 10 }}>
					{rows.map((a) => (
						<div
							key={a.id}
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 16,
							}}
						>
							<span style={{ fontSize: 13, color: "var(--fg)" }}>
								{a.summary}
							</span>
							<span
								style={{
									fontSize: 12,
									color: "var(--fg-3)",
									whiteSpace: "nowrap",
								}}
							>
								{new Date(a.createdAt).toLocaleString()}
							</span>
						</div>
					))}
				</div>
			)}
		</SectionCard>
	);
}
