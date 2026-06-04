import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useContext } from "react";

import "@/styles/helpdesk.css";
import { EmptyState } from "@/components/empty-state";
import { ApprovalPanel } from "@/features/helpdesk/approval-panel";
import { AssignmentControls } from "@/features/helpdesk/assignment-controls";
import { Badge } from "@/features/helpdesk/badge";
import {
	approvalLabel,
	approvalTone,
	fmtDate,
	fmtDateTime,
	priorityLabel,
	priorityTone,
	slaLabel,
	slaTone,
	statusLabel,
	statusTone,
} from "@/features/helpdesk/labels";
import { RequestComments } from "@/features/helpdesk/request-comments";
import { RequestLinkedContext } from "@/features/helpdesk/request-linked-context";
import { RequestSla } from "@/features/helpdesk/request-sla";
import { RequestStatusActions } from "@/features/helpdesk/request-status-actions";
import type { HelpdeskRequestDetail } from "@/features/helpdesk/types";
import {
	canApproveHelpdeskRequest,
	canAssignHelpdesk,
	canCreateHelpdeskRequest,
	canManageHelpdesk,
	canViewHelpdesk,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/helpdesk/requests/$id")({
	component: RequestDetailPage,
});

const TERMINAL = new Set(["closed", "cancelled"]);

function SummaryRow({ k, children }: { children: string; k: string }) {
	return (
		<div>
			<span className="hd-k">{k}</span>
			<span>{children}</span>
		</div>
	);
}

function RequestSummary({ r }: { r: HelpdeskRequestDetail }) {
	return (
		<div className="hd-summary">
			<div className="hd-sum-grid">
				<SummaryRow k="Category">
					{r.categoryName ?? "Uncategorised"}
				</SummaryRow>
				<SummaryRow k="Requester">{r.requesterName ?? "—"}</SummaryRow>
				{r.targetName ? <SummaryRow k="For">{r.targetName}</SummaryRow> : null}
				<SummaryRow k="Assigned to">
					{r.assigneeName ?? "Unassigned"}
				</SummaryRow>
				<SummaryRow k="Logged by">{r.createdByName ?? "—"}</SummaryRow>
				<SummaryRow k="Created">{fmtDate(r.createdAt)}</SummaryRow>
				<SummaryRow k="Last updated">{fmtDate(r.updatedAt)}</SummaryRow>
				<SummaryRow k="First response due">
					{fmtDateTime(r.firstResponseDueAt)}
				</SummaryRow>
				<SummaryRow k="Resolution due">
					{fmtDateTime(r.resolutionDueAt)}
				</SummaryRow>
				{r.resolvedAt ? (
					<SummaryRow k="Resolved">{fmtDateTime(r.resolvedAt)}</SummaryRow>
				) : null}
				{r.closedAt ? (
					<SummaryRow k="Closed">{fmtDateTime(r.closedAt)}</SummaryRow>
				) : null}
				{r.approvalRequired ? (
					<div>
						<span className="hd-k">Approval</span>
						<span>
							<Badge tone={approvalTone(r.approvalStatus)}>
								{approvalLabel(r.approvalStatus)}
							</Badge>
						</span>
					</div>
				) : null}
			</div>
			{r.description ? <p className="hd-desc">{r.description}</p> : null}
			{r.approvalRequired && r.approvalNote ? (
				<p className="hd-desc">Approval note: {r.approvalNote}</p>
			) : null}
			{r.resolutionNote ? (
				<div className="hd-resolution">Resolution: {r.resolutionNote}</div>
			) : null}
		</div>
	);
}

function RequestDetailPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const { id } = Route.useParams();
	// Viewers (HR/agent/manager/auditor/payroll) plus employees (own request only,
	// server-enforced) may load the detail. Recruiter cannot → query disabled.
	const isViewer = canViewHelpdesk(role);
	const canLoad = isViewer || canCreateHelpdeskRequest(role);
	// Employees came from their self-service list; viewers from the queue.
	const backTo = isViewer ? "/app/helpdesk/requests" : "/app/helpdesk/my";
	const backLabel = isViewer ? "Back to requests" : "Back to my requests";

	const detail = useQuery(
		orpc.helpdesk.requests.getById.queryOptions({
			input: { id },
			enabled: canLoad,
			retry: false,
		})
	);

	if (!canLoad) {
		return (
			<div className="page">
				<EmptyState
					description="The helpdesk is available to HR, helpdesk agents, and managers."
					title="You don't have access to this request"
				/>
			</div>
		);
	}
	if (detail.isError) {
		return (
			<div className="page">
				<Link className="hd-back" to={backTo}>
					<ArrowLeft size={14} /> {backLabel}
				</Link>
				<EmptyState
					compact
					description="This request is not available to you."
					title="Request not found"
				/>
			</div>
		);
	}

	const r = detail.data as HelpdeskRequestDetail | undefined;
	const isTerminal = r ? TERMINAL.has(r.status) : false;
	const canManage = canManageHelpdesk(role);
	const canComment = canCreateHelpdeskRequest(role);
	const canCancel = canManage || role === "employee";
	const canAssign = canAssignHelpdesk(role);
	const canApprove = canApproveHelpdeskRequest(role);

	return (
		<div className="page">
			<Link className="hd-back" to={backTo}>
				<ArrowLeft size={14} /> {backLabel}
			</Link>

			{detail.isLoading || !r ? (
				<div className="hd-skeleton" style={{ height: 120 }} />
			) : (
				<>
					<div className="page-header">
						<div>
							<span className="hd-ref">{r.reference}</span>
							<h1 className="page-title">{r.title}</h1>
							<div className="hd-detail-badges">
								<Badge tone={statusTone(r.status)}>
									{statusLabel(r.status)}
								</Badge>
								<Badge tone={priorityTone(r.priority)}>
									{priorityLabel(r.priority)}
								</Badge>
								<Badge tone={slaTone(r.slaState)}>{slaLabel(r.slaState)}</Badge>
							</div>
						</div>
						<RequestStatusActions
							canCancel={canCancel}
							canManage={canManage}
							requestId={r.id}
							status={r.status}
						/>
					</div>

					<RequestSummary r={r} />

					<ApprovalPanel
						approvalNote={r.approvalNote}
						approvalRequired={r.approvalRequired}
						approvalStatus={r.approvalStatus}
						approvedByName={r.approvedByName}
						canApprove={canApprove}
						requestId={r.id}
					/>

					<AssignmentControls
						assigneeName={r.assigneeName}
						canAssign={canAssign}
						requestId={r.id}
						status={r.status}
					/>

					<RequestSla
						firstResponseDueAt={r.firstResponseDueAt}
						resolutionDueAt={r.resolutionDueAt}
						slaState={r.slaState}
						status={r.status}
					/>

					<RequestLinkedContext entities={r.linkedEntities} role={role} />

					<RequestComments
						canAddInternal={canManage}
						canComment={canComment}
						canViewInternalNotes={r.canViewInternalNotes}
						comments={r.comments}
						isCancelled={r.status === "cancelled"}
						isTerminal={isTerminal}
						requestId={r.id}
					/>
				</>
			)}
		</div>
	);
}
