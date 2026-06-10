import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { useContext } from "react";

import "@/styles/helpdesk.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/helpdesk/badge";
import { HelpdeskTabs } from "@/features/helpdesk/helpdesk-tabs";
import {
	isActiveStatus,
	isAtRiskSla,
	priorityLabel,
	priorityTone,
	slaLabel,
	slaTone,
	statusLabel,
	statusTone,
} from "@/features/helpdesk/labels";
import type { HelpdeskRequestRow } from "@/features/helpdesk/types";
import { canCreateHelpdeskRequest, canViewHelpdesk } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/helpdesk/")({
	component: HelpdeskOverviewPage,
});

type RequestStatus =
	| "new"
	| "open"
	| "in_progress"
	| "waiting_on_employee"
	| "waiting_on_approval"
	| "resolved"
	| "closed"
	| "cancelled";

const ATTENTION_FETCH_SIZE = 100;
const ATTENTION_LIST_LIMIT = 5;

function useStatusCount(status: RequestStatus, enabled: boolean): number {
	const q = useQuery(
		orpc.helpdesk.requests.list.queryOptions({
			input: { page: 1, pageSize: 1, status },
			enabled,
		})
	);
	return (q.data as { total?: number } | undefined)?.total ?? 0;
}

function AttentionGroup({
	head,
	items,
	renderBadge,
}: {
	head: string;
	items: HelpdeskRequestRow[];
	renderBadge: (r: HelpdeskRequestRow) => React.ReactNode;
}) {
	return (
		<div className="hd-attention-group">
			<div className="hd-attention-head">
				{head} ({items.length})
			</div>
			{items.length === 0 ? (
				<div className="hd-attention-empty">Nothing here right now.</div>
			) : (
				items.slice(0, ATTENTION_LIST_LIMIT).map((r) => (
					<div className="hd-attention-item" key={r.id}>
						<span className="hd-mono">{r.reference}</span>
						<span className="hd-name">{r.title}</span>
						<span className="hd-sub">{r.requesterName ?? "—"}</span>
						{renderBadge(r)}
					</div>
				))
			)}
		</div>
	);
}

// Shown to employees on the overview route. We deliberately render a landing that
// LINKS to My requests rather than auto-redirecting: OrgCtx resolves the member
// role asynchronously (it defaults to "employee" until the active membership
// loads), so a render-time redirect would also bounce viewers/admins to /my on
// first paint. The link is correct for everyone and never misroutes a viewer.
function EmployeeLanding({ orgName }: { orgName: string }) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{orgName}</span>
						<span className="sep">/</span>
						<span>Helpdesk</span>
					</div>
					<h1 className="page-title">Helpdesk</h1>
					<p className="page-sub">
						Ask HR, payroll, IT, facilities, or admin for help.
					</p>
				</div>
			</div>
			<EmptyState
				action={{ label: "Go to my requests", href: "/app/helpdesk/my" }}
				description="Log a request and track the response in one place. HR, IT, payroll, and facilities can all be reached from here."
				icon={<LifeBuoy size={28} />}
				title="Your requests live here"
			/>
		</div>
	);
}

function HelpdeskOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewHelpdesk(org.memberRole);
	const canCreate = canCreateHelpdeskRequest(org.memberRole);

	const open = useStatusCount("open", canView);
	const inProgress = useStatusCount("in_progress", canView);
	const waitingEmployee = useStatusCount("waiting_on_employee", canView);
	const waitingApproval = useStatusCount("waiting_on_approval", canView);

	const queue = useQuery(
		orpc.helpdesk.requests.list.queryOptions({
			input: { page: 1, pageSize: ATTENTION_FETCH_SIZE },
			enabled: canView,
		})
	);

	// Non-viewers: employees get a landing that links to their self-service My
	// requests page; anyone else with no helpdesk access (recruiter) gets a clear
	// no-access state.
	if (!canView) {
		if (canCreate) {
			return <EmployeeLanding orgName={org.orgName} />;
		}
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Helpdesk</h1>
					</div>
				</div>
				<EmptyState
					description="The helpdesk queue is available to HR, helpdesk agents, and managers."
					icon={<LifeBuoy size={28} />}
					title="You don't have access to the helpdesk"
				/>
			</div>
		);
	}

	const rows =
		(queue.data as { data?: HelpdeskRequestRow[] } | undefined)?.data ?? [];
	const active = rows.filter((r) => isActiveStatus(r.status));
	const urgent = active.filter((r) => r.priority === "urgent");
	const atRisk = active.filter((r) => isAtRiskSla(r.slaState));
	const awaitingApproval = active.filter(
		(r) => r.status === "waiting_on_approval"
	);
	const unassigned = active.filter((r) => !r.assignedToUserId);

	const tiles = [
		{ label: "Open", value: open, alert: false },
		{ label: "In progress", value: inProgress, alert: false },
		{ label: "Waiting on employee", value: waitingEmployee, alert: false },
		{ label: "Waiting on approval", value: waitingApproval, alert: false },
		{
			label: "Overdue / breached",
			value: atRisk.length,
			alert: atRisk.length > 0,
		},
	];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Helpdesk</span>
					</div>
					<h1 className="page-title">Helpdesk</h1>
					<p className="page-sub">
						Requests from your team — track, triage, and resolve.
					</p>
				</div>
			</div>

			<HelpdeskTabs />

			<StatTileGrid className="hd-tiles" min={180}>
				{tiles.map((t) => (
					<StatTile
						key={t.label}
						label={t.label}
						tone={t.alert ? "warning" : "default"}
						value={t.value}
					/>
				))}
			</StatTileGrid>

			{queue.isLoading ? <div className="hd-skeleton" /> : null}
			{queue.isError ? (
				<EmptyState
					compact
					description="Could not load the helpdesk overview. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{queue.isLoading || queue.isError ? null : (
				<div className="hd-attention">
					<div className="hd-attention-title">Needs attention</div>
					<AttentionGroup
						head="Overdue or breached SLA"
						items={atRisk}
						renderBadge={(r) => (
							<Badge tone={slaTone(r.slaState)}>{slaLabel(r.slaState)}</Badge>
						)}
					/>
					<AttentionGroup
						head="Urgent"
						items={urgent}
						renderBadge={(r) => (
							<Badge tone={priorityTone(r.priority)}>
								{priorityLabel(r.priority)}
							</Badge>
						)}
					/>
					<AttentionGroup
						head="Waiting on approval"
						items={awaitingApproval}
						renderBadge={(r) => (
							<Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
						)}
					/>
					<AttentionGroup
						head="Unassigned"
						items={unassigned}
						renderBadge={(r) => (
							<Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
						)}
					/>
				</div>
			)}

			<div className="hd-quicklinks">
				<Link className="hd-quicklink" to="/app/helpdesk/requests">
					<span className="hd-ql-title">Request queue</span>
					<span className="hd-ql-sub">Browse, filter, and triage requests</span>
				</Link>
			</div>
		</div>
	);
}
